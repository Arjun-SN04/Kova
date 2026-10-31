import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// A to-do in a group, often made from a message
const taskSchema = new mongoose.Schema({
  group: { type: ObjectId, ref: "Group", required: true, index: true },
  text: { type: String, required: true, trim: true, maxlength: 300 },
  assignee: { type: ObjectId, ref: "User", default: null },
  due: { type: Date, default: null },
  done: { type: Boolean, default: false },
  doneAt: { type: Date, default: null },
  doneBy: { type: ObjectId, ref: "User", default: null },
  message: { type: ObjectId, ref: "Message", default: null },
  createdBy: { type: ObjectId, ref: "User", required: true },
}, { timestamps: true })

export const Task = mongoose.model("Task", taskSchema)
