import mongoose from "mongoose";

// A field called "type" needs a different type key so Mongoose doesn't misread it
const callInfoSchema = new mongoose.Schema(
  { type: String, status: String, duration: Number },
  { _id: false, typeKey: "$type" },
)

const refSchema = new mongoose.Schema(
  { messageId: String, chatId: String, isGroup: Boolean, chatName: String },
  { _id: false },
)

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // Direct messages have a receiver; group messages have a groupId instead
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, required: function () { return !this.groupId } },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null, index: true },
  // Text is optional when the message has an attachment
  message: { type: String, default: "" },
  edited: { type: Boolean, default: false },
  // The message this one is replying to (null for normal messages)
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  // Set when the receiver has opened the chat (read receipts / unread counts)
  seen: { type: Boolean, default: false },
  // Emoji reactions: one per person (reacting again with the same emoji removes it)
  reactions: {
    type: [{ _id: false, userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, emoji: String }],
    default: [],
  },
  // Call history entry shown in the chat: { type: voice|video, status: answered|missed|declined, duration (s) }
  call: { type: callInfoSchema, default: null },
  // Nexa's answers inside a one-to-one chat: the two people that chat belongs to
  botChat: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
  // Text of a voice note, filled in when someone taps Transcribe
  transcript: { type: String, default: null },
  // A reminder's link back to the message it's about
  ref: { type: refSchema, default: null },
  // True when this message was forwarded from another chat
  forwarded: { type: Boolean, default: false },
  // Disappearing messages: deleted (with its file) at this time, unless someone keeps it
  expiresAt: { type: Date, default: null, index: true },
  kept: { type: Boolean, default: false },
  // Pinned at the top of the chat (up to 3 per chat)
  pinned: { type: { by: mongoose.Schema.Types.ObjectId, at: Date, _id: false }, default: null },
  // A poll: question + options; each option lists who voted for it
  poll: {
    type: {
      question: String,
      multiple: Boolean, // people can pick more than one option
      closed: Boolean,
      options: [{ _id: false, id: String, text: String, votes: [mongoose.Schema.Types.ObjectId] }],
    },
    default: null,
  },
  // Business cards: { kind: product | order | payment | booking, ...snapshot }. Updated when an order or payment changes.
  card: { type: mongoose.Schema.Types.Mixed, default: null },
  // A business's team member who sent this on the business's behalf
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Sent automatically (greeting, away message, Nexa auto-reply, booking reminder)
  auto: { type: String, default: null },
  // Image / video / voice note / file stored on Cloudinary
  attachment: {
    type: {
      url: String,
      publicId: String,
      resourceType: String, // image | video | raw
      kind: String,         // image | video | file
      name: String,
      size: Number,
      mimeType: String,
      width: Number,
      height: Number,
      duration: Number,     // seconds, for voice notes / videos
    },
    default: null,
  },
}, { timestamps: true })

// New messages follow the chat's disappearing-messages timer
messageSchema.pre("save", async function () {
  if (!this.isNew || this.expiresAt || this.kept) return
  const { expiryFor } = await import("../utils/disappear.js")
  this.expiresAt = await expiryFor(this)
})

messageSchema.index({ "card.orderId": 1 }, { sparse: true })

export const Message = mongoose.model("Message", messageSchema)
