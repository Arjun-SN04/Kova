import webpush from "web-push"
import { PushSubscription } from "../models/pushSubscription.model.js"
import { getReceiverSocketId } from "../socket/socket.js"

// Web push: notifications on phones/desktops even when Kova is closed.
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (backend/.env; ./deploy.sh --env sends it to the VM).

let ready = null
const setup = () => {
  if (ready !== null) return ready
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv, VAPID_SUBJECT: subject } = process.env
  ready = !!(pub && priv)
  if (ready) webpush.setVapidDetails(subject || "mailto:admin@nexchat.local", pub, priv)
  return ready
}
export const pushConfigured = () => setup()
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || ""

const isOnline = (userId) => !!getReceiverSocketId(String(userId))

// Send to every device of these users. onlyOffline: skip people who have Kova open right now
// (they already see it in the app). Never throws.
// chatId: the chat this is about, from the receiver's side. People who locked
// that chat get a plain "New message" with no name or text.
export const sendPush = async (userIds, payload, { onlyOffline = true, chatId = null } = {}) => {
  if (!setup()) return
  let targets = [...new Set(userIds.map(String))].filter((id) => !onlyOffline || !isOnline(id))
  if (!targets.length) return
  // Chat messages ("chat-<id>" / "group-<id>"): people who muted that chat get nothing
  const chatOfTag = /^(?:chat|group)-([a-f\d]{24})$/i.exec(payload.tag || "")?.[1]
  const mutedChat = chatId || chatOfTag
  if (mutedChat && !payload.urgent) {
    const { default: User } = await import("../models/user.model.js")
    const muted = await User.find({
      _id: { $in: targets },
      mutedChats: { $elemMatch: { chat: String(mutedChat), $or: [{ until: null }, { until: { $gt: new Date() } }] } },
    }).select("_id")
    const skip = new Set(muted.map((u) => String(u._id)))
    targets = targets.filter((id) => !skip.has(id))
    if (!targets.length) return
  }
  const subs = await PushSubscription.find({ user: { $in: targets } })
  const base = { icon: "/icon-192.png", badge: "/icon-192.png", url: "/" }
  const body = JSON.stringify({ ...base, ...payload })
  let locked = new Set()
  if (chatId) {
    const { default: User } = await import("../models/user.model.js")
    locked = new Set((await User.find({ _id: { $in: targets }, $or: [{ lockedChats: String(chatId) }, { hiddenChats: String(chatId) }] }).select("_id")).map((u) => String(u._id)))
  }
  const plain = JSON.stringify({ ...base, title: "Kova", body: "New message", tag: "locked" })
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, locked.has(String(s.user)) ? plain : body, { TTL: 60 * 60, urgency: payload.urgent ? "high" : "normal" })
    } catch (err) {
      // The browser unsubscribed or the subscription expired: forget it
      if ([404, 410].includes(err.statusCode)) await PushSubscription.deleteOne({ _id: s._id })
      else console.log("push error:", err.statusCode || err.message)
    }
  }))
}

// Short preview of a chat message for a notification
export const previewOf = (m) => {
  if (m.viewOnce) return m.attachment?.kind === "video" ? "🎥 View-once video" : "📷 View-once photo"
  if (m.poll) return `📊 ${m.poll.question}`
  if (m.message) return m.message.length > 140 ? `${m.message.slice(0, 137)}…` : m.message
  const kind = m.attachment?.kind
  return kind === "sticker" ? "✨ Sticker" : kind === "gif" ? "🎞️ GIF" : kind === "image" ? "📷 Photo" : kind === "video" ? "🎥 Video" : kind === "audio" ? "🎤 Voice note" : kind ? "📎 File" : "New message"
}
