import mongoose from "mongoose"
import { deleteFromCloudinary } from "../config/cloudinary.js"
import { emitToUsers } from "./notify.js"

// Disappearing messages: chats (direct, groups) and the Nexa chat.
// Messages get `expiresAt` when sent; this sweeper deletes them (and their Cloudinary files) once it passes,
// unless someone pressed Keep.

export const TIMER_CHOICES = [0, 86400, 7 * 86400, 90 * 86400] // off, 24 h, 7 days, 90 days
const EVERY_MS = 60_000
const model = (name) => mongoose.model(name)
const same = (a, b) => String(a) === String(b)

// The chat a message belongs to, and its timer in seconds
export const timerFor = async ({ groupId, senderId, receiverId, botChat }) => {
  if (groupId) return (await model("Group").findById(groupId).select("disappearAfter"))?.disappearAfter || 0
  const [a, b] = botChat?.length ? botChat : [senderId, receiverId]
  if (!a || !b) return 0
  const filter = same(a, b) ? { members: { $size: 2 }, "members.0": a, "members.1": a } : { members: { $all: [a, b] } }
  return (await model("Conversation").findOne(filter).select("disappearAfter"))?.disappearAfter || 0
}

export const expiryFor = async (msg) => {
  const secs = await timerFor(msg)
  return secs > 0 ? new Date(Date.now() + secs * 1000) : null
}

// ── Sweeper ────────────────────────────────────────────────────
const sweepChats = async () => {
  const Message = model("Message")
  const due = await Message.find({ expiresAt: { $lte: new Date() }, kept: { $ne: true } }).limit(500)
  if (!due.length) return
  const ids = due.map((m) => m._id)
  await Message.deleteMany({ _id: { $in: ids } })
  await model("Conversation").updateMany({ messages: { $in: ids } }, { $pull: { messages: { $in: ids } } })
  // Files: only delete ones no other message still uses (forwards share files)
  const { releaseAttachments, notifyAudience } = await import("../controller/message.controller.js")
  await releaseAttachments(due.filter((m) => m.attachment).map((m) => m.attachment))
  // Tell each chat which messages went
  const byChat = new Map()
  for (const m of due) {
    const key = m.groupId ? `g${m.groupId}` : [m.senderId, m.receiverId, ...(m.botChat || [])].map(String).sort().join("|")
    if (!byChat.has(key)) byChat.set(key, { sample: m, ids: [] })
    byChat.get(key).ids.push(String(m._id))
  }
  for (const { sample, ids: gone } of byChat.values()) await notifyAudience(sample, "messagesDeleted", gone)
}

// Cloudinary files a Nexa message owns (pictures Nexa made, files the user sent)
export const nexaFiles = (m) => [
  ...(m.actions || []).filter((a) => a?.type === "image" && a.publicId).map((a) => ({ publicId: a.publicId, resourceType: a.resourceType || "image" })),
  ...(m.attachment?.publicId ? [m.attachment] : []),
]

const sweepNexa = async () => {
  const AiMessage = model("AiMessage")
  const due = await AiMessage.find({ expiresAt: { $lte: new Date() }, kept: { $ne: true } }).limit(500)
  if (!due.length) return
  await deleteFromCloudinary(due.flatMap(nexaFiles))
  await AiMessage.deleteMany({ _id: { $in: due.map((m) => m._id) } })
  const byUser = new Map()
  for (const m of due) byUser.set(String(m.user), [...(byUser.get(String(m.user)) || []), String(m._id)])
  for (const [user, ids] of byUser) emitToUsers([user], "nexaMessagesDeleted", ids)
}

export const sweepNow = async () => {
  await sweepChats().catch((err) => console.log("disappear (chats) error:", err.message))
  await sweepNexa().catch((err) => console.log("disappear (nexa) error:", err.message))
  // 24-hour statuses
  const { sweepStatuses } = await import("../controller/status.controller.js")
  await sweepStatuses().catch((err) => console.log("disappear (status) error:", err.message))
}

export const startDisappearing = async () => {
  // Nexa messages from before this feature: give them 24 hours (so nothing vanishes the moment it ships)
  const old = await model("AiMessage").updateMany({ expiresAt: { $exists: false }, kept: { $ne: true } }, { $set: { expiresAt: new Date(Date.now() + 86400 * 1000) } })
  if (old.modifiedCount) console.log(`🕒 Nexa chats: ${old.modifiedCount} older messages will disappear in 24 h`)
  setInterval(sweepNow, EVERY_MS)
  console.log("🕒 Disappearing messages: checking every", EVERY_MS / 1000, "s")
}
