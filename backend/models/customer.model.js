import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// What a business knows about one customer: labels, notes, follow-ups, who handles them,
// and timings for auto messages and "waiting for a reply" alerts.
const customerSchema = new mongoose.Schema({
  business: { type: ObjectId, ref: "User", required: true },
  customer: { type: ObjectId, ref: "User", required: true },
  labels: [{ type: ObjectId }],
  // Private note about the customer (allergies, birthday, preferences)
  notes: { type: String, default: "", maxlength: 2000 },
  // Staff-only notes on the chat, newest last
  internalNotes: [{ by: { type: ObjectId, ref: "User" }, text: String, at: { type: Date, default: Date.now } }],
  followUp: { type: { at: Date, note: String, done: Boolean, _id: false }, default: null },
  assignedTo: { type: ObjectId, ref: "User", default: null },
  // Nexa thinks they want to buy or book
  lead: { type: Boolean, default: false },
  firstAt: { type: Date, default: Date.now },
  lastInAt: { type: Date, default: null },   // customer's last message
  lastOutAt: { type: Date, default: null },  // business's last reply
  // Set when the customer writes and nobody has replied yet
  waitingSince: { type: Date, default: null },
  alertedAt: { type: Date, default: null },  // "waiting too long" alert sent for this wait
  greetedAt: { type: Date, default: null },
  awayAt: { type: Date, default: null },
  // Nexa couldn't answer: a person should take over
  needsHuman: { type: Boolean, default: false },
}, { timestamps: true })

customerSchema.index({ business: 1, customer: 1 }, { unique: true })
customerSchema.index({ waitingSince: 1 })
customerSchema.index({ "followUp.at": 1 })

export const Customer = mongoose.model("Customer", customerSchema)
