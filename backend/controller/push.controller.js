import { PushSubscription } from "../models/pushSubscription.model.js"
import { pushConfigured, sendPush, vapidPublicKey } from "../utils/push.js"

export const pushKey = (req, res) => res.json({ configured: pushConfigured(), key: vapidPublicKey() })

export const subscribe = async (req, res) => {
  try {
    const sub = req.body.subscription
    if (!/^https:\/\//.test(sub?.endpoint || "") || !sub.keys?.p256dh || !sub.keys?.auth) return res.status(400).json({ error: "Invalid subscription" })
    await PushSubscription.findOneAndUpdate(
      { endpoint: sub.endpoint },
      { user: req.user._id, endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, device: String(req.body.device || "").slice(0, 80) },
      { upsert: true },
    )
    res.json({ subscribed: true })
  } catch (error) {
    console.log("push subscribe error:", error.message)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const unsubscribe = async (req, res) => {
  try {
    await PushSubscription.deleteOne({ endpoint: String(req.body.endpoint || ""), user: req.user._id })
    res.json({ subscribed: false })
  } catch (error) {
    res.status(500).json({ error: "Internal server error" })
  }
}

// "Send a test notification" button
export const testPush = async (req, res) => {
  await sendPush([req.user._id], { title: "Kova", body: "Notifications are working 🎉", tag: "test" }, { onlyOffline: false })
  res.json({ sent: true })
}
