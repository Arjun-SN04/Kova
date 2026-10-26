import mongoose from "mongoose"

// One browser/phone that agreed to receive push notifications
const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { type: { p256dh: String, auth: String, _id: false }, required: true },
  device: { type: String, default: "" }, // e.g. "Chrome on Android"
}, { timestamps: true })

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema)
