import mongoose from "mongoose"

// One signed-in device / browser. The login cookie names its session (`sid`), so a
// session can be signed out from another device (Profile → Devices).
const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sid: { type: String, required: true, unique: true },
  device: { type: String, default: "Unknown device" }, // e.g. "Chrome on Windows"
  ip: { type: String, default: "" },
  lastSeenAt: { type: Date, default: Date.now },
  // Removed automatically once the login would have expired anyway
  expiresAt: { type: Date, required: true },
}, { timestamps: true })

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Session = mongoose.model("Session", sessionSchema)
