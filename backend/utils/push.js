import webpush from "web-push"
import { PushSubscription } from "../models/pushSubscription.model.js"
import { getReceiverSocketId } from "../socket/socket.js"

// Web push: notifications on phones/desktops even when Kova is closed.
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (backend/.env and Render).

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
export const sendPush = async (userIds, payload, { onlyOffline = true } = {}) => {
  if (!setup()) return
  const targets = [...new Set(userIds.map(String))].filter((id) => !onlyOffline || !isOnline(id))
  if (!targets.length) return
  const subs = await PushSubscription.find({ user: { $in: targets } })
  const body = JSON.stringify({ icon: "/icon-192.png", badge: "/icon-192.png", url: "/", ...payload })
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 60 * 60, urgency: payload.urgent ? "high" : "normal" })
    } catch (err) {
      // The browser unsubscribed or the subscription expired: forget it
      if ([404, 410].includes(err.statusCode)) await PushSubscription.deleteOne({ _id: s._id })
      else console.log("push error:", err.statusCode || err.message)
    }
  }))
}

// Short preview of a chat message for a notification
export const previewOf = (m) => {
  if (m.poll) return `📊 ${m.poll.question}`
  if (m.message) return m.message.length > 140 ? `${m.message.slice(0, 137)}…` : m.message
  const kind = m.attachment?.kind
  return kind === "image" ? "📷 Photo" : kind === "video" ? "🎥 Video" : kind === "audio" ? "🎤 Voice note" : kind ? "📎 File" : "New message"
}
