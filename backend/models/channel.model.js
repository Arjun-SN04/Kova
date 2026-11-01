import mongoose from "mongoose"

const { ObjectId } = mongoose.Schema.Types

// A channel: one-way updates. Admins post, anyone can follow and react.
const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  // Public handle used in links and search: lowercase letters, numbers, _ and .
  handle: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: "", trim: true, maxlength: 500 },
  avatar: { type: { url: String, publicId: String, _id: false }, default: null },
  owner: { type: ObjectId, ref: "User", required: true },
  admins: [{ type: ObjectId, ref: "User" }],
  followers: [{ type: ObjectId, ref: "User" }],
  followerCount: { type: Number, default: 0 },
  lastPostAt: { type: Date, default: null },
  // When each follower last read the channel (userId -> date), for unread counts
  reads: { type: Map, of: Date, default: {} },
}, { timestamps: true })

channelSchema.index({ followers: 1 })
channelSchema.index({ followerCount: -1 })

export const Channel = mongoose.model("Channel", channelSchema)

const postSchema = new mongoose.Schema({
  channelId: { type: ObjectId, ref: "Channel", required: true, index: true },
  authorId: { type: ObjectId, ref: "User", required: true },
  text: { type: String, default: "", maxlength: 4000 },
  attachment: { type: mongoose.Schema.Types.Mixed, default: null },
  linkPreview: { type: mongoose.Schema.Types.Mixed, default: null },
  reactions: { type: [{ _id: false, userId: ObjectId, emoji: String }], default: [] },
  edited: { type: Boolean, default: false },
}, { timestamps: true })

postSchema.index({ channelId: 1, createdAt: -1 })

export const ChannelPost = mongoose.model("ChannelPost", postSchema)
