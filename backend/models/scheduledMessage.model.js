import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// A message waiting to be sent later (created by Nexa). The scheduler sends it at `sendAt`.
const scheduledMessageSchema = new mongoose.Schema({
  sender: { type: ObjectId, ref: "User", required: true, index: true },
  // Exactly one of these: a person (can be the sender, for reminders) or a group
  receiver: { type: ObjectId, ref: "User", default: null },
  group: { type: ObjectId, ref: "Group", default: null },
  text: { type: String, required: true, maxlength: 4000 },
  sendAt: { type: Date, required: true },
  status: { type: String, enum: ["pending", "sending", "sent", "cancelled", "failed"], default: "pending" },
  error: { type: String, default: "" },
  sentMessage: { type: ObjectId, ref: "Message", default: null },
  // For "Remind me about this": which message the reminder points back to
  ref: { type: { messageId: String, chatId: String, isGroup: Boolean, chatName: String, _id: false }, default: null },
  // Repeating ("every 2 minutes"): after each send, sendAt moves on by everyMinutes until `left` runs out or `until` passes
  repeat: {
    type: { everyMinutes: Number, until: Date, left: Number, sent: Number, _id: false },
    default: null,
  },
}, { timestamps: true })

scheduledMessageSchema.index({ status: 1, sendAt: 1 })

export const ScheduledMessage = mongoose.model("ScheduledMessage", scheduledMessageSchema)
