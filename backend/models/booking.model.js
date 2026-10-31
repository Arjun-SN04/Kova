import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// An appointment a customer booked with a business
const bookingSchema = new mongoose.Schema({
  business: { type: ObjectId, ref: "User", required: true, index: true },
  customer: { type: ObjectId, ref: "User", required: true, index: true },
  service: { type: { id: String, name: String, minutes: Number, price: Number, _id: false }, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  note: { type: String, default: "", maxlength: 500 },
  status: { type: String, enum: ["booked", "cancelled", "done"], default: "booked" },
  // Google Calendar event (when the business connected Google)
  eventId: { type: String, default: null },
  meetLink: { type: String, default: null },
  remindedAt: { type: Date, default: null },
}, { timestamps: true })

bookingSchema.index({ business: 1, start: 1 })
bookingSchema.index({ status: 1, start: 1, remindedAt: 1 })

export const Booking = mongoose.model("Booking", bookingSchema)
