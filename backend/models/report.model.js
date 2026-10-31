import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// Someone reported an account (spam, scam, abuse). Reviewed by app admins.
const reportSchema = new mongoose.Schema({
  reporter: { type: ObjectId, ref: "User", required: true },
  target: { type: ObjectId, ref: "User", required: true, index: true },
  reason: { type: String, enum: ["spam", "scam", "abuse", "other"], default: "spam" },
  details: { type: String, default: "", maxlength: 500 },
  status: { type: String, enum: ["open", "reviewed"], default: "open" },
}, { timestamps: true })

export const Report = mongoose.model("Report", reportSchema)
