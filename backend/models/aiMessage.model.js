import mongoose from "mongoose"

// One message in a user's private chat with Nexa
const aiMessageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, default: "" },
  // Things Nexa did for this answer, shown as cards: [{ type: "sent" | "scheduled" | "cancelled" | "failed", ... }]
  actions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // A photo or document the user sent with the question (stored on Cloudinary)
  attachment: {
    type: { kind: String, url: String, publicId: String, resourceType: String, name: String, size: Number, mimeType: String, width: Number, height: Number, _id: false },
    default: null,
  },
  // Disappearing (24 h by default): removed with its files at this time unless kept
  expiresAt: { type: Date, default: null, index: true },
  kept: { type: Boolean, default: false },
  // Text pulled out of a document, for follow-up questions (not sent to the browser)
  doc: { type: { name: String, pages: Number, text: String, truncated: Boolean, _id: false }, default: null },
}, { timestamps: true })

aiMessageSchema.pre("save", async function () {
  if (!this.isNew || this.expiresAt || this.kept) return
  const User = mongoose.model("User")
  const me = await User.findById(this.user).select("nexaDisappearAfter")
  const secs = me?.nexaDisappearAfter ?? 86400
  if (secs > 0) this.expiresAt = new Date(Date.now() + secs * 1000)
})

export const AiMessage = mongoose.model("AiMessage", aiMessageSchema)
