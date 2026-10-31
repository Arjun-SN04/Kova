import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// An event in a group (posted as a card people RSVP to)
const eventSchema = new mongoose.Schema({
  group: { type: ObjectId, ref: "Group", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 600 },
  location: { type: String, default: "", maxlength: 200 },
  startsAt: { type: Date, required: true, index: true },
  createdBy: { type: ObjectId, ref: "User", required: true },
  // going | maybe | no
  rsvps: [{ _id: false, user: { type: ObjectId, ref: "User" }, status: { type: String, enum: ["going", "maybe", "no"] } }],
  cancelled: { type: Boolean, default: false },
  // Set once the "starts in 1 hour" reminder went out
  remindedAt: { type: Date, default: null },
}, { timestamps: true })

export const Event = mongoose.model("Event", eventSchema)
