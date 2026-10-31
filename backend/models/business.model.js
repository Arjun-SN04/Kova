import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// A business's private settings (the public profile is User.business).
// One per business account, created when the account turns Business on.
const businessSettingsSchema = new mongoose.Schema({
  owner: { type: ObjectId, ref: "User", required: true, unique: true },
  // Sent automatically to a customer's first message
  greeting: { type: { on: Boolean, text: String, _id: false }, default: () => ({ on: true, text: "Hi! Thanks for messaging us. How can we help?" }) },
  // Sent automatically outside opening hours (at most once every 6 hours per customer)
  away: { type: { on: Boolean, text: String, _id: false }, default: () => ({ on: true, text: "We're closed right now. We'll reply as soon as we open." }) },
  // Saved answers, inserted by typing "/shortcut" in the message box
  quickReplies: [{ shortcut: String, text: String }],
  // Message templates for order updates and reminders. {name}, {order}, {total}, {status} are filled in.
  templates: [{ name: String, text: String }],
  // Coloured tags for customer chats
  labels: [{ name: String, color: String }],
  // Questions and answers Nexa uses for auto-replies
  faq: [{ q: String, a: String }],
  // Bookable services (appointments)
  services: [{ name: String, minutes: Number, price: Number, description: String }],
  // Groups of customers to message all at once
  broadcastLists: [{ name: String, members: [{ type: ObjectId, ref: "User" }] }],
  // Staff who answer customers for the business
  team: [{ _id: false, user: { type: ObjectId, ref: "User" }, role: { type: String, enum: ["admin", "agent"], default: "agent" } }],
  // Nexa
  nexaAutoReply: { type: Boolean, default: false },
  leadDetection: { type: Boolean, default: true },
  dailySummary: { type: Boolean, default: true },
  summarySentOn: { type: String, default: "" }, // YYYY-MM-DD in the business's time zone
  // Alert the team when a customer has waited this many minutes (0 = off)
  unansweredMinutes: { type: Number, default: 15 },
  // Last order number used (orders are #1001, #1002, …)
  orderSeq: { type: Number, default: 1000 },
}, { timestamps: true })

businessSettingsSchema.index({ "team.user": 1 })

export const BusinessSettings = mongoose.model("BusinessSettings", businessSettingsSchema)
