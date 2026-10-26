import crypto from "node:crypto"
import { Message } from "../models/message.model.js"
import { Conversation } from "../models/conversation.model.js"
import { Group } from "../models/group.model.js"
import User from "../models/user.model.js"
import { canSeeMessage } from "../utils/chatAccess.js"
import { emitToUsers } from "../utils/notify.js"
import { notifyAudience } from "./message.controller.js"
import { TIMER_CHOICES, timerFor } from "../utils/disappear.js"
import { sendPush } from "../utils/push.js"

// Pinned messages, starred messages, polls and pinned chats

const MAX_PINNED = 3
const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const fail = (res, status, error) => res.status(status).json({ error })

const loadVisible = async (req, res) => {
  const message = await Message.findById(req.params.messageId)
  if (!message || !(await canSeeMessage(req.user._id, message))) { fail(res, 404, "Message not found"); return null }
  return message
}

// Messages in the same chat as `m`
const chatFilter = (m) => m.groupId
  ? { groupId: m.groupId }
  : { groupId: null, $or: [{ senderId: m.senderId, receiverId: m.receiverId }, { senderId: m.receiverId, receiverId: m.senderId }] }

// ── Pin a message (max 3 per chat: pinning a 4th unpins the oldest) ──
export const pinMessage = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    if (message.call || message.botChat?.length) return fail(res, 400, "This message can't be pinned")
    const pin = req.body.pinned !== false
    if (message.groupId && pin) {
      const group = await Group.findById(message.groupId).select("announcement admins")
      if (group?.announcement && !group.admins.some((a) => same(a, req.user._id))) return fail(res, 403, "Only admins can pin here")
    }
    const changed = []
    if (pin) {
      const pinned = await Message.find({ ...chatFilter(message), pinned: { $ne: null }, _id: { $ne: message._id } }).sort({ "pinned.at": 1 })
      for (const old of pinned.slice(0, Math.max(0, pinned.length - MAX_PINNED + 1))) {
        old.pinned = null
        await old.save()
        changed.push(old)
      }
      message.pinned = { by: req.user._id, at: new Date() }
    } else {
      message.pinned = null
    }
    await message.save()
    changed.push(message)
    for (const m of changed) await notifyAudience(m, "messageEdited", m)
    res.json(message)
  } catch (error) {
    console.log("pinMessage error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Star (save) a message for myself ──
export const starMessage = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    const star = req.body.starred !== false
    await User.updateOne({ _id: req.user._id }, star ? { $addToSet: { starred: message._id } } : { $pull: { starred: message._id } })
    res.json({ messageId: String(message._id), starred: star })
  } catch (error) {
    console.log("starMessage error:", error)
    fail(res, 500, "Internal server error")
  }
}

// My starred messages, newest starred first, with the chat each one is in
export const listStarred = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("starred")
    const messages = await Message.find({ _id: { $in: me.starred } })
    const groupIds = [...new Set(messages.filter((m) => m.groupId).map((m) => String(m.groupId)))]
    const groups = new Map((await Group.find({ _id: { $in: groupIds }, members: req.user._id }).select("name")).map((g) => [String(g._id), g]))
    const peopleIds = [...new Set(messages.flatMap((m) => [m.senderId, m.receiverId]).filter(Boolean).map(String))]
    const people = new Map((await User.find({ _id: { $in: peopleIds } }).select("fullName avatar")).map((u) => [String(u._id), u]))
    const order = new Map(me.starred.map((id, i) => [String(id), i]))
    const items = messages
      .filter((m) => (m.groupId ? groups.has(String(m.groupId)) : same(m.senderId, req.user._id) || same(m.receiverId, req.user._id)))
      .map((m) => {
        const otherId = m.groupId ? null : same(m.senderId, req.user._id) ? m.receiverId : m.senderId
        return {
          message: m,
          sender: people.get(String(m.senderId))?.fullName || "Someone",
          chat: m.groupId
            ? { _id: String(m.groupId), name: groups.get(String(m.groupId)).name, isGroup: true }
            : { _id: String(otherId), name: same(otherId, req.user._id) ? "Message yourself" : people.get(String(otherId))?.fullName || "Chat", isGroup: false },
        }
      })
      .sort((a, b) => order.get(String(b.message._id)) - order.get(String(a.message._id)))
    // Forget stars on messages that are gone
    if (items.length !== me.starred.length) await User.updateOne({ _id: req.user._id }, { $set: { starred: items.map((i) => i.message._id).reverse() } })
    res.json({ items })
  } catch (error) {
    console.log("listStarred error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Polls ──
// Create a poll in a group or a direct chat. Shared with Nexa's create_poll tool.
export const createPollMessage = async (user, { chatId, isGroup, question, options, multiple }) => {
  const q = String(question || "").trim().slice(0, 300)
  const opts = [...new Set((Array.isArray(options) ? options : []).map((o) => String(o || "").trim().slice(0, 100)).filter(Boolean))]
  if (!q) throw Object.assign(new Error("Ask a question"), { status: 400 })
  if (opts.length < 2 || opts.length > 12) throw Object.assign(new Error("Give 2 to 12 options"), { status: 400 })
  const poll = { question: q, multiple: !!multiple, closed: false, options: opts.map((text) => ({ id: crypto.randomBytes(4).toString("hex"), text, votes: [] })) }

  if (isGroup) {
    const group = await Group.findById(chatId)
    if (!group || !group.members.some((m) => same(m, user._id))) throw Object.assign(new Error("You're not in that group"), { status: 403 })
    if (group.announcement && !group.admins.some((a) => same(a, user._id))) throw Object.assign(new Error("Only admins can post here"), { status: 403 })
    const msg = await Message.create({ senderId: user._id, groupId: group._id, message: `📊 ${q}`, poll })
    group.reads.set(String(user._id), new Date())
    group.updatedAt = new Date()
    await group.save()
    emitToUsers(group.members, "newMessage", msg)
    sendPush(group.members.filter((m) => !same(m, user._id)), { title: group.name, body: `${user.fullName?.split(" ")[0] || "Someone"}: 📊 ${q}`, tag: `group-${group._id}` }).catch(() => {})
    return msg
  }
  const me = await User.findById(user._id).select("contacts")
  const self = same(chatId, user._id)
  if (!self && !me.contacts.some((c) => same(c, chatId))) throw Object.assign(new Error("You can only message your contacts"), { status: 403 })
  let conversation = self
    ? await Conversation.findOne({ members: { $size: 2 }, "members.0": user._id, "members.1": user._id })
    : await Conversation.findOne({ members: { $all: [user._id, chatId] } })
  if (!conversation) conversation = await Conversation.create({ members: [user._id, chatId] })
  const msg = await Message.create({ senderId: user._id, receiverId: chatId, message: `📊 ${q}`, poll, seen: self })
  conversation.messages.push(msg._id)
  await conversation.save()
  emitToUsers([user._id, chatId], "newMessage", msg)
  if (!self) sendPush([chatId], { title: user.fullName || "Kova", body: `📊 ${q}`, tag: `chat-${user._id}` }).catch(() => {})
  return msg
}

export const createPoll = async (req, res) => {
  try {
    const msg = await createPollMessage(req.user, req.body)
    res.status(201).json(msg)
  } catch (error) {
    if (!error.status) console.log("createPoll error:", error)
    fail(res, error.status || 500, error.status ? error.message : "Internal server error")
  }
}

// Vote: { optionIds: [...] } replaces my vote (empty = take my vote back)
export const votePoll = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    if (!message.poll) return fail(res, 400, "Not a poll")
    if (message.poll.closed) return fail(res, 400, "This poll is closed")
    let picked = [...new Set((Array.isArray(req.body.optionIds) ? req.body.optionIds : []).map(String))]
      .filter((id) => message.poll.options.some((o) => o.id === id))
    if (!message.poll.multiple) picked = picked.slice(0, 1)
    for (const o of message.poll.options) {
      o.votes = o.votes.filter((v) => !same(v, req.user._id))
      if (picked.includes(o.id)) o.votes.push(req.user._id)
    }
    message.markModified("poll")
    await message.save()
    await notifyAudience(message, "messageEdited", message)
    res.json(message)
  } catch (error) {
    console.log("votePoll error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The poll's creator can close it (no more votes)
export const closePoll = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    if (!message.poll) return fail(res, 400, "Not a poll")
    if (!same(message.senderId, req.user._id)) return fail(res, 403, "Only the person who made the poll can close it")
    message.poll.closed = true
    message.markModified("poll")
    await message.save()
    await notifyAudience(message, "messageEdited", message)
    res.json(message)
  } catch (error) {
    console.log("closePoll error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── My pinned chats + starred ids ──
const MAX_PINNED_CHATS = 5
export const getPrefs = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("pinnedChats starred")
    res.json({ pinnedChats: me.pinnedChats, starred: me.starred.map(String) })
  } catch (error) {
    console.log("getPrefs error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const pinChat = async (req, res) => {
  try {
    const chatId = String(req.params.chatId)
    const me = await User.findById(req.user._id).select("pinnedChats contacts")
    const pin = req.body.pinned !== false
    if (pin) {
      const mine = same(chatId, me._id) || me.contacts.some((c) => same(c, chatId)) || await Group.exists({ _id: chatId, members: me._id })
      if (!mine) return fail(res, 404, "Chat not found")
      if (!me.pinnedChats.includes(chatId) && me.pinnedChats.length >= MAX_PINNED_CHATS) return fail(res, 400, `You can pin up to ${MAX_PINNED_CHATS} chats`)
      if (!me.pinnedChats.includes(chatId)) me.pinnedChats.push(chatId)
    } else {
      me.pinnedChats = me.pinnedChats.filter((id) => id !== chatId)
    }
    await me.save()
    emitToUsers([me._id], "prefsUpdated", { pinnedChats: me.pinnedChats })
    res.json({ pinnedChats: me.pinnedChats })
  } catch (error) {
    console.log("pinChat error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Disappearing messages ──
const findDirect = (a, b) => same(a, b)
  ? Conversation.findOne({ members: { $size: 2 }, "members.0": a, "members.1": a })
  : Conversation.findOne({ members: { $all: [a, b] } })

// GET /message/disappear/:chatId?group=1 -> { seconds }
export const getChatTimer = async (req, res) => {
  try {
    const { chatId } = req.params
    if (req.query.group === "1") {
      const g = await Group.findOne({ _id: chatId, members: req.user._id }).select("disappearAfter")
      return g ? res.json({ seconds: g.disappearAfter || 0 }) : fail(res, 404, "Group not found")
    }
    const c = await findDirect(req.user._id, chatId)
    res.json({ seconds: c?.disappearAfter || 0 })
  } catch (error) {
    console.log("getChatTimer error:", error)
    fail(res, 500, "Internal server error")
  }
}

// PUT /message/disappear/:chatId { seconds, isGroup } — applies to new messages
export const setChatTimer = async (req, res) => {
  try {
    const { chatId } = req.params
    const seconds = Number(req.body.seconds)
    if (!TIMER_CHOICES.includes(seconds)) return fail(res, 400, "Choose off, 24 hours, 7 days or 90 days")
    if (req.body.isGroup) {
      const g = await Group.findById(chatId)
      if (!g || !g.members.some((m) => same(m, req.user._id))) return fail(res, 404, "Group not found")
      if (!g.admins.some((a) => same(a, req.user._id))) return fail(res, 403, "Only admins can change this")
      g.disappearAfter = seconds
      await g.save()
      emitToUsers(g.members, "chatTimer", { chatId: String(g._id), seconds, by: req.user.fullName })
      return res.json({ seconds })
    }
    const me = await User.findById(req.user._id).select("contacts")
    if (!same(chatId, me._id) && !me.contacts.some((c) => same(c, chatId))) return fail(res, 403, "You can only change your own chats")
    let c = await findDirect(me._id, chatId)
    if (!c) c = await Conversation.create({ members: [me._id, chatId] })
    c.disappearAfter = seconds
    await c.save()
    // Each side sees the chat under the other person's id
    emitToUsers([me._id], "chatTimer", { chatId: String(chatId), seconds, by: req.user.fullName })
    if (!same(chatId, me._id)) emitToUsers([chatId], "chatTimer", { chatId: String(me._id), seconds, by: req.user.fullName })
    res.json({ seconds })
  } catch (error) {
    console.log("setChatTimer error:", error)
    fail(res, 500, "Internal server error")
  }
}

// PUT /message/keep/:messageId { kept } — kept messages don't disappear (for everyone in the chat)
export const keepMessage = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    const kept = req.body.kept !== false
    message.kept = kept
    if (kept) message.expiresAt = null
    else {
      const secs = await timerFor(message)
      message.expiresAt = secs ? new Date(Date.now() + secs * 1000) : null
    }
    await message.save()
    await notifyAudience(message, "messageEdited", message)
    res.json(message)
  } catch (error) {
    console.log("keepMessage error:", error)
    fail(res, 500, "Internal server error")
  }
}
