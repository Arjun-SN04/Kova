import { Conversation } from "../models/conversation.model.js"
import { Message } from "../models/message.model.js"
import { getReceiverSocketId, io } from "../socket/socket.js"
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js"
import User from "../models/user.model.js"
import { Group } from "../models/group.model.js"
import { emitToUsers } from "../utils/notify.js"
import { answerDirectMention } from "../utils/nexaGroup.js"
import { previewOf, sendPush } from "../utils/push.js"
import { clearWaitingFor, onDirectMessage } from "../utils/business.js"

const zoneHeader = (req) => { try { const tz = req.headers["x-time-zone"]; new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz || "UTC" } catch { return "UTC" } }

// Forwarded messages share the same Cloudinary file. Only delete a file once
// no remaining message uses it. Call this AFTER deleting the messages.
export const releaseAttachments = async (attachments = []) => {
  const unused = []
  for (const a of attachments) {
    if (!a?.publicId) continue
    const stillUsed = await Message.exists({ "attachment.publicId": a.publicId })
    if (!stillUsed) unused.push(a)
  }
  await deleteFromCloudinary(unused)
}

const MAX_BULK = 50

// Tell everyone who can see this message about a change (except `except`):
// the group's members, or the other person in a direct chat.
export const notifyAudience = async (message, event, data, except) => {
  if (message.groupId) {
    const group = await Group.findById(message.groupId).select("members")
    if (group) emitToUsers(group.members, event, data, except)
  } else if (message.botChat?.length) {
    emitToUsers(message.botChat, event, data, except)
  } else {
    emitToUsers([message.receiverId, message.senderId], event, data, except)
  }
}

const isSelf = (a, b) => String(a) === String(b)

// You can message yourself and your contacts, nobody else
const canMessage = (me, otherId) =>
  isSelf(me._id, otherId) || (me.contacts || []).some((c) => String(c) === String(otherId))

// Find the chat between two people. A self chat stores the same user twice,
// so it needs an exact match: `$all: [me, me]` would match every chat I'm in.
const findConversation = (a, b) =>
  isSelf(a, b)
    ? Conversation.findOne({ members: { $size: 2 }, "members.0": a, "members.1": a })
    : Conversation.findOne({ members: { $all: [a, b] } })

// Messages can only be edited for this long after they are sent
export const EDIT_WINDOW_MS = 10 * 60 * 1000

export const sendMessage = async (req, res) => {
  try {
    const { message, replyTo } = req.body
    const { id: receiverId } = req.params
    const senderId = req.user._id

    if (!canMessage(req.user, receiverId))
      return res.status(403).json({ error: "You can only message your contacts" })

    const text = (message || "").trim()
    if (!text && !req.file) return res.status(400).json({ error: "Message cannot be empty" })

    // A reply must point at a message from this same conversation
    if (replyTo) {
      const original = await Message.findById(replyTo).select("senderId receiverId")
      const members = [senderId.toString(), receiverId.toString()]
      if (!original || !members.includes(original.senderId.toString()) || !members.includes(original.receiverId.toString())) {
        return res.status(400).json({ error: "Invalid reply target" })
      }
    }

    let conversation = await findConversation(senderId, receiverId)
    if (!conversation) {
      conversation = await Conversation.create({ members: [senderId, receiverId] })
    }

    // Upload the attachment (if any) only after the request is validated
    let attachment = null
    if (req.file) {
      try {
        attachment = await uploadToCloudinary(req.file)
      } catch (err) {
        console.log("Cloudinary upload error:", err?.message || err)
        return res.status(502).json({ error: "Upload failed. Please try again." })
      }
    }

    const self = isSelf(senderId, receiverId)
    // Notes to self are never "unread"
    const newMessage = new Message({ senderId, receiverId, message: text, replyTo: replyTo || null, attachment, seen: self })
    conversation.messages.push(newMessage._id)
    await Promise.all([conversation.save(), newMessage.save()])

    // The sender adds their own copy from the response, so don't echo a self message back
    const receiverSocketId = !self && getReceiverSocketId(receiverId)
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage)
    }

    res.status(201).json(newMessage)
    if (!self) sendPush([receiverId], { title: req.user.fullName, body: previewOf(newMessage), tag: `chat-${senderId}` }).catch(() => {})

    // Business chats: greeting / away messages, Nexa auto-reply, team inboxes
    if (!self) onDirectMessage(newMessage).catch((err) => console.log("business hook error:", err.message))

    // "@Nexa …": Nexa answers in this chat, for both people (in the background)
    answerDirectMention({ sender: req.user, otherId: receiverId, message: newMessage, timeZone: zoneHeader(req) })
      .catch((err) => console.log("@Nexa (direct) error:", err.message))
  } catch (error) {
    console.log("sendMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const getMessage = async (req, res) => {
  try {
    const { id: chatUser } = req.params
    const senderId = req.user._id
    const conversation = await findConversation(senderId, chatUser).populate("messages")
    if (!conversation) return res.status(200).json([])
    res.status(200).json(conversation.messages)
  } catch (error) {
    console.log("getMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const userId = req.user._id
    const message = await Message.findById(messageId)
    if (!message) return res.status(404).json({ error: "Message not found" })
    if (message.senderId.toString() !== userId.toString())
      return res.status(403).json({ error: "Not authorized to delete this message" })

    // Remove from conversation
    await Conversation.updateMany(
      { messages: messageId },
      { $pull: { messages: messageId } }
    )
    await Message.findByIdAndDelete(messageId)
    await releaseAttachments([message.attachment])

    await notifyAudience(message, "messageDeleted", messageId, userId)

    res.status(200).json({ message: "Message deleted", messageId })
  } catch (error) {
    console.log("deleteMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const { message } = req.body
    const userId = req.user._id
    const existing = await Message.findById(messageId)
    if (!existing) return res.status(404).json({ error: "Message not found" })
    if (existing.senderId.toString() !== userId.toString())
      return res.status(403).json({ error: "Not authorized to edit this message" })
    if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS)
      return res.status(403).json({ error: "Messages can only be edited within 10 minutes of sending" })
    if (existing.poll) return res.status(400).json({ error: "Polls can't be edited" })
    if (!message?.trim() && !existing.attachment) return res.status(400).json({ error: "Message cannot be empty" })

    existing.message = (message || "").trim()
    existing.edited = true
    await existing.save()

    await notifyAudience(existing, "messageEdited", existing, userId)

    res.status(200).json(existing)
  } catch (error) {
    console.log("editMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const deleteConversation = async (req, res) => {
  try {
    const { id: otherUserId } = req.params
    const userId = req.user._id

    const conversation = await findConversation(userId, otherUserId)
    if (!conversation) return res.status(404).json({ error: "Conversation not found" })

    const withFiles = await Message.find({ _id: { $in: conversation.messages }, attachment: { $ne: null } }).select("attachment")
    await Message.deleteMany({ _id: { $in: conversation.messages } })
    await releaseAttachments(withFiles.map((m) => m.attachment))
    await Conversation.findByIdAndDelete(conversation._id)
    if (!isSelf(userId, otherUserId)) clearWaitingFor(userId, otherUserId)

    const receiverSocketId = !isSelf(userId, otherUserId) && getReceiverSocketId(otherUserId)
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("conversationDeleted", { otherUserId: userId })
    }

    res.status(200).json({ message: "Conversation deleted" })
  } catch (error) {
    console.log("deleteConversation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Mark every message the other person sent me as seen, and tell them.
export const markSeen = async (req, res) => {
  try {
    const { id: otherUserId } = req.params
    const userId = req.user._id

    const result = await Message.updateMany(
      { senderId: otherUserId, receiverId: userId, seen: { $ne: true } },
      { $set: { seen: true } }
    )

    if (result.modifiedCount > 0) {
      const senderSocketId = getReceiverSocketId(otherUserId)
      if (senderSocketId) io.to(senderSocketId).emit("messagesSeen", { by: userId.toString() })
    }

    res.status(200).json({ updated: result.modifiedCount })
  } catch (error) {
    console.log("markSeen error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Sidebar summary: last message and unread count for each conversation.
export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id

    const conversations = await Conversation.find({ members: userId }).select("members messages")
    const lastIds = conversations.map((c) => c.messages[c.messages.length - 1]).filter(Boolean)
    const lastMessages = await Message.find({ _id: { $in: lastIds } })
      .select("message senderId receiverId createdAt attachment.kind attachment.name call")
    const lastById = new Map(lastMessages.map((m) => [m._id.toString(), m]))

    // Only messages explicitly marked unseen count (older messages have no flag)
    const unread = await Message.aggregate([
      { $match: { receiverId: userId, senderId: { $ne: userId }, seen: false } },
      { $group: { _id: "$senderId", count: { $sum: 1 } } },
    ])
    const unreadBySender = new Map(unread.map((u) => [u._id.toString(), u.count]))

    const summary = conversations.map((c) => {
      // A self chat has no "other" member: it belongs to me
      const otherId = (c.members.find((m) => m.toString() !== userId.toString()) || c.members[0])?.toString()
      const lastId = c.messages[c.messages.length - 1]?.toString()
      return {
        userId: otherId,
        lastMessage: lastId ? lastById.get(lastId) || null : null,
        unread: unreadBySender.get(otherId) || 0,
      }
    }).filter((c) => c.userId)

    res.status(200).json(summary)
  } catch (error) {
    console.log("getConversations error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Delete several of my own messages at once.
export const deleteMessages = async (req, res) => {
  try {
    const userId = req.user._id
    const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, MAX_BULK) : []
    if (!ids.length) return res.status(400).json({ error: "No messages selected" })

    // Only messages I sent can be deleted
    const mine = await Message.find({ _id: { $in: ids }, senderId: userId })
    if (!mine.length) return res.status(403).json({ error: "You can only delete your own messages" })
    const mineIds = mine.map((m) => m._id)

    await Conversation.updateMany({ messages: { $in: mineIds } }, { $pull: { messages: { $in: mineIds } } })
    await Message.deleteMany({ _id: { $in: mineIds } })
    await releaseAttachments(mine.map((m) => m.attachment))

    // Tell whoever could see each message that it disappeared
    for (const m of mine) await notifyAudience(m, "messagesDeleted", [m._id.toString()], userId)

    res.status(200).json({ deleted: mineIds.map(String) })
  } catch (error) {
    console.log("deleteMessages error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Forward messages (text and/or media) to one or more people.
// Media is not re-uploaded: the copies point at the same Cloudinary file.
export const forwardMessages = async (req, res) => {
  try {
    const userId = req.user._id
    const messageIds = Array.isArray(req.body.messageIds) ? req.body.messageIds.slice(0, MAX_BULK) : []
    const receiverIds = Array.isArray(req.body.receiverIds) ? req.body.receiverIds.slice(0, 20) : []
    const groupIds = Array.isArray(req.body.groupIds) ? req.body.groupIds.slice(0, 20) : []
    if (!messageIds.length || (!receiverIds.length && !groupIds.length))
      return res.status(400).json({ error: "Pick at least one message and one chat" })

    // You can only forward messages from your own chats and groups
    const myGroupIds = await Group.find({ members: userId }).distinct("_id")
    const originals = await Message.find({
      _id: { $in: messageIds },
      $or: [{ senderId: userId }, { receiverId: userId }, { groupId: { $in: myGroupIds } }],
    }).sort({ createdAt: 1 })
    if (!originals.length) return res.status(404).json({ error: "Messages not found" })

    const allowed = receiverIds.filter((id) => canMessage(req.user, id))
    const receivers = await User.find({ _id: { $in: allowed } }).select("_id")
    // Groups I'm in (announcement groups only if I'm an admin there)
    const groups = (await Group.find({ _id: { $in: groupIds }, members: userId }))
      .filter((g) => !g.announcement || g.admins.some((a) => a.equals(userId)))
    if (!receivers.length && !groups.length) return res.status(403).json({ error: "You can only forward to your contacts and groups" })
    const created = []

    for (const receiver of receivers) {
      const self = isSelf(userId, receiver._id)
      let conversation = await findConversation(userId, receiver._id)
      if (!conversation) conversation = await Conversation.create({ members: [userId, receiver._id] })

      // insertMany skips the save hook, so apply this chat's disappearing timer here
      const secs = conversation.disappearAfter || 0
      const copies = originals.map((o) => new Message({
        senderId: userId,
        receiverId: receiver._id,
        message: o.message,
        attachment: o.attachment,
        forwarded: true,
        seen: self,
        expiresAt: secs ? new Date(Date.now() + secs * 1000) : null,
      }))
      await Message.insertMany(copies)
      conversation.messages.push(...copies.map((c) => c._id))
      await conversation.save()

      const socketId = !self && getReceiverSocketId(receiver._id)
      if (socketId) copies.forEach((c) => io.to(socketId).emit("newMessage", c))
      created.push(...copies)
    }

    for (const group of groups) {
      const copies = originals.map((o) => new Message({
        senderId: userId,
        groupId: group._id,
        message: o.message,
        attachment: o.attachment,
        forwarded: true,
        expiresAt: group.disappearAfter ? new Date(Date.now() + group.disappearAfter * 1000) : null,
      }))
      await Message.insertMany(copies)
      group.reads.set(String(userId), new Date())
      group.updatedAt = new Date()
      await group.save()
      copies.forEach((c) => emitToUsers(group.members, "newMessage", c, userId))
      created.push(...copies)
    }

    res.status(201).json(created)
  } catch (error) {
    console.log("forwardMessages error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// React to a message with an emoji. One reaction per person:
// the same emoji again removes it, a different emoji replaces it.
const EMOJI_RE = /^\p{Extended_Pictographic}/u

export const reactToMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const { emoji } = req.body
    const userId = req.user._id

    if (typeof emoji !== "string" || emoji.length > 16 || !EMOJI_RE.test(emoji))
      return res.status(400).json({ error: "Invalid reaction" })

    const message = await Message.findById(messageId)
    if (!message) return res.status(404).json({ error: "Message not found" })
    const isMember = message.groupId
      ? await Group.exists({ _id: message.groupId, members: userId })
      : message.senderId.equals(userId) || message.receiverId?.equals(userId) || message.botChat?.some((id) => id.equals(userId))
    if (!isMember) return res.status(403).json({ error: "Not allowed" })

    const mine = message.reactions.find((r) => r.userId.equals(userId))
    if (mine && mine.emoji === emoji) message.reactions = message.reactions.filter((r) => !r.userId.equals(userId))
    else if (mine) mine.emoji = emoji
    else message.reactions.push({ userId, emoji })
    await message.save()

    await notifyAudience(message, "messageReacted", { messageId, reactions: message.reactions }, userId)

    res.status(200).json({ messageId, reactions: message.reactions })
  } catch (error) {
    console.log("reactToMessage error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
