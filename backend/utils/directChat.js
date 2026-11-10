import mongoose from "mongoose"
import { Conversation } from "../models/conversation.model.js"

// A one-to-one chat's messages are found by who sent them, not through a list on the
// Conversation (that list grew forever and could hit MongoDB's 16 MB document limit).
// The Conversation document only keeps the chat's settings (members, disappearing timer).

const same = (a, b) => String(a) === String(b)
const oid = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)))

// Every message in the chat between a and b (a === b is "message yourself"):
// both directions, plus Nexa's answers in that chat (sent by the bot, `botChat` = the people)
export const directFilter = (a, b) => {
  const A = oid(a), B = oid(b)
  if (same(A, B)) return { groupId: null, $or: [{ senderId: A, receiverId: A }, { botChat: [A] }] }
  return {
    groupId: null,
    $or: [
      { senderId: A, receiverId: B },
      { senderId: B, receiverId: A },
      { botChat: { $all: [A, B], $size: 2 } },
    ],
  }
}

// The chat's settings document. A self chat stores the same user twice,
// so it needs an exact match: `$all: [me, me]` would match every chat I'm in.
export const findConversation = (a, b) =>
  same(a, b)
    ? Conversation.findOne({ members: { $size: 2 }, "members.0": a, "members.1": a })
    : Conversation.findOne({ members: { $all: [a, b] } })

export const getOrCreateConversation = async (a, b) =>
  (await findConversation(a, b)) || Conversation.create({ members: [a, b] })

// ── Pages of messages ──
export const PAGE_SIZE = 50
const MAX_FROM = 2000 // "load from this message on" (jumping to an old message) returns at most this many

// Reads ?before=<id>&limit=n or ?from=<id> from the request.
// Returns { messages (oldest first), more (older ones exist) }.
//  - default: the newest page
//  - before:  the page just older than that message
//  - from:    that message and everything newer (to jump to an old message)
export const pageOf = async (Model, filter, query = {}) => {
  const limit = Math.min(Math.max(Number(query.limit) || PAGE_SIZE, 1), 200)
  const cursorId = query.before || query.from
  let cursor = null
  if (cursorId && mongoose.isValidObjectId(cursorId)) {
    cursor = await Model.findOne({ _id: cursorId, ...filter }).select("createdAt")
  }
  if (query.from && cursor) {
    const newer = await Model.find({ ...filter, createdAt: { $gte: cursor.createdAt } }).sort({ createdAt: 1 }).limit(MAX_FROM)
    const more = !!(await Model.exists({ ...filter, createdAt: { $lt: cursor.createdAt } }))
    return { messages: newer, more }
  }
  // Same createdAt is possible (forwarded copies): break ties by _id
  const older = cursor
    ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }] }
    : null
  const page = await Model.find(older ? { $and: [filter, older] } : filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
  const more = page.length > limit
  return { messages: page.slice(0, limit).reverse(), more }
}

// The newest message in a chat that `viewer` hasn't deleted for themselves
export const lastMessageOf = (filter, viewer, Model, select) =>
  Model.findOne({ ...filter, hiddenFor: { $ne: viewer } }).sort({ createdAt: -1 }).select(select)

// The app's id for a message being sent (utils/outbox.js), or null
export const clientIdOf = (body) => {
  const id = body?.clientId
  return typeof id === "string" && /^[\w-]{8,64}$/.test(id) ? id : null
}
