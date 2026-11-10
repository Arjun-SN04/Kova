import User from "../models/user.model.js"
import { directFilter } from "./directChat.js"
import { Group } from "../models/group.model.js"
import { Message } from "../models/message.model.js"

const same = (a, b) => String(a) === String(b)

export const formatWhen = (date, timeZone = "UTC") =>
  new Date(date).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

// Can this user see this message? (sender/receiver of a direct message, or a group member)
export const canSeeMessage = async (userId, message) => {
  if (!message) return false
  if (message.groupId) return !!(await Group.exists({ _id: message.groupId, members: userId }))
  if (message.botChat?.some((id) => same(id, userId))) return true
  return same(message.senderId, userId) || same(message.receiverId, userId)
}

// One message as a line of text for the AI, including voice note transcripts
export const messageText = (m) => {
  if (m.call) return `(${m.message})`
  const parts = []
  if (m.message) parts.push(m.message)
  if (m.attachment) {
    const kind = m.attachment.kind === "audio" ? "voice note" : m.attachment.kind || "file"
    parts.push(m.transcript ? `[${kind}: "${m.transcript}"]` : `[${kind}${m.attachment.name && kind === "file" ? `: ${m.attachment.name}` : ""}]`)
  }
  return parts.join(" ") || "(empty)"
}

// The latest `count` messages of a chat the user can see, oldest first, as text lines.
// `chatId` is a user id (direct chat; the user's own id for Message yourself) or a group id.
export const readChat = async (userId, chatId, { count = 30, timeZone = "UTC" } = {}) => {
  const n = Math.min(100, Math.max(1, count))
  let name
  let messages = []
  const group = await Group.findOne({ _id: chatId, members: userId }).select("name").catch(() => null)
  if (group) {
    name = group.name
    messages = await Message.find({ groupId: chatId }).sort({ createdAt: -1 }).limit(n)
  } else {
    const self = same(chatId, userId)
    const me = await User.findById(userId).select("contacts")
    if (!self && !me?.contacts.some((c) => same(c, chatId))) return null
    name = self ? "Message yourself" : (await User.findById(chatId).select("fullName"))?.fullName
    messages = await Message.find({ ...directFilter(userId, chatId), hiddenFor: { $ne: userId } }).sort({ createdAt: -1 }).limit(n)
  }
  messages.reverse()
  const ids = [...new Set(messages.map((m) => String(m.senderId)))]
  const people = new Map((await User.find({ _id: { $in: ids } }).select("fullName isBot")).map((u) => [String(u._id), u]))
  const lines = messages.map((m) => {
    const who = same(m.senderId, userId) ? "Me" : people.get(String(m.senderId))?.fullName || "Someone"
    return `${who} (${formatWhen(m.createdAt, timeZone)}): ${messageText(m)}`
  })
  return { name, isGroup: !!group, messages, lines, people }
}
