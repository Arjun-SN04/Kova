import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// A 24-hour status update (text on a colour, or a photo/video with a caption). Contacts can see it.
const statusSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: "User", required: true, index: true },
  kind: { type: String, enum: ["text", "image", "video"], required: true },
  text: { type: String, default: "", maxlength: 700 },     // the text, or a photo/video caption
  background: { type: String, default: "#4f46e5" },        // text statuses
  media: { type: { url: String, publicId: String, resourceType: String, width: Number, height: Number, duration: Number, _id: false }, default: null },
  viewers: { type: [{ _id: false, user: { type: ObjectId, ref: "User" }, at: Date }], default: [] },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true })

export const Status = mongoose.model("Status", statusSchema)
