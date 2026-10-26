import { Group } from "../models/group.model.js"
import { Conversation } from "../models/conversation.model.js"
import User from "../models/user.model.js"
import { Message } from "../models/message.model.js"
import { getNexaBot } from "./nexaBot.js"
import { askGroq } from "./groq.js"
import { readChat } from "./chatAccess.js"
import { emitToUsers } from "./notify.js"

export const MENTION_RE = /(^|[^\w@])@nexa\b/i
const PER_MINUTE = 6          // answers per group per minute
const busy = new Set()        // groups Nexa is answering right now
const recent = {}             // groupId -> timestamps

// Someone wrote "@Nexa …" in a group: answer there, for everyone, as a reply to their message
export const answerMention = async ({ groupId, message, sender, timeZone = "UTC" }) => {
  const gid = String(groupId)
  if (!MENTION_RE.test(message.message || "") || busy.has(gid)) return
  const now = Date.now()
  recent[gid] = (recent[gid] || []).filter((t) => now - t < 60_000)
  if (recent[gid].length >= PER_MINUTE) return
  recent[gid].push(now)
  busy.add(gid)

  const group = await Group.findById(gid).select("members name")
  const bot = await getNexaBot()
  const typing = (event) => emitToUsers(group.members, event, { from: gid, user: String(bot._id), name: event === "typing" ? "Nexa" : undefined })
  typing("typing")
  try {
    const chat = await readChat(sender._id, gid, { count: 40, timeZone })
    const question = String(message.message).replace(MENTION_RE, "$1").trim() || "(they just mentioned you)"
    let reply
    try {
      reply = await askGroq([
        {
          role: "system",
          content: `You are Nexa, the AI assistant inside the Kova group "${group.name}". ${sender.fullName} mentioned you, and your answer is posted in the group for everyone.
In the recent messages below, "Me" means ${sender.fullName}. Messages from "Nexa" are your own earlier answers.
Answer as 1 to 4 short bullet points ("- " lines). Use people's first names exactly as written (never shorten them). No headings, no em or en dashes. If asked to decide or pick, pick clearly and say why in one line.

Recent messages:
${chat?.lines.join("\n") || "(none)"}`,
        },
        { role: "user", content: `${sender.fullName}: ${question}` },
      ], { maxTokens: 600 })
    } catch {
      reply = "Sorry, I can't answer right now. Try again in a minute."
    }
    const msg = await Message.create({ senderId: bot._id, groupId: gid, message: reply, replyTo: message._id })
    await Group.updateOne({ _id: gid }, { $set: { updatedAt: new Date() } })
    emitToUsers(group.members, "newMessage", msg)
  } finally {
    typing("stopTyping")
    busy.delete(gid)
  }
}

// "@Nexa …" in a one-to-one chat (or Message yourself): answer there, visible to both people
export const answerDirectMention = async ({ sender, otherId, message, timeZone = "UTC" }) => {
  if (!MENTION_RE.test(message.message || "")) return
  const me = String(sender._id)
  const other = String(otherId)
  const key = `dm:${[me, other].sort().join(":")}`
  if (busy.has(key)) return
  const now = Date.now()
  recent[key] = (recent[key] || []).filter((t) => now - t < 60_000)
  if (recent[key].length >= PER_MINUTE) return
  recent[key].push(now)
  busy.add(key)

  const bot = await getNexaBot()
  const people = me === other ? [me] : [me, other]
  // Each person sees the typing in their chat with the other one
  const typing = (event) => {
    emitToUsers([other], event, { from: me, user: String(bot._id), name: event === "typing" ? "Nexa" : undefined }, me === other ? null : undefined)
    if (me !== other) emitToUsers([me], event, { from: other, user: String(bot._id), name: event === "typing" ? "Nexa" : undefined })
  }
  typing("typing")
  try {
    const self = me === other
    const otherName = self ? "" : (await User.findById(other).select("fullName"))?.fullName || "the other person"
    const chat = await readChat(me, other, { count: 30, timeZone })
    const question = String(message.message).replace(MENTION_RE, "$1").trim() || "(they just mentioned you)"
    let reply
    try {
      reply = await askGroq([
        {
          role: "system",
          content: `You are Nexa, the AI assistant inside Kova. ${sender.fullName} mentioned you in ${self ? "their private notes chat" : `their private chat with ${otherName}`}, and your answer is posted in that chat${self ? "" : " for both of them"}.
In the recent messages below, "Me" means ${sender.fullName}. Messages from "Nexa" are your own earlier answers.
Answer as 1 to 4 short bullet points ("- " lines). Use people's first names exactly as written. No headings, no em or en dashes.

Recent messages:
${chat?.lines.join("\n") || "(none)"}`,
        },
        { role: "user", content: `${sender.fullName}: ${question}` },
      ], { maxTokens: 600 })
    } catch {
      reply = "- Sorry, I can't answer right now. Try again in a minute."
    }

    let conversation = self
      ? await Conversation.findOne({ members: { $size: 2 }, "members.0": me, "members.1": me })
      : await Conversation.findOne({ members: { $all: [me, other] } })
    if (!conversation) return
    const msg = await Message.create({
      senderId: bot._id,
      receiverId: me,
      botChat: people,
      message: reply,
      replyTo: message._id,
      seen: true,
    })
    conversation.messages.push(msg._id)
    await conversation.save()
    emitToUsers(people, "newMessage", msg)
  } finally {
    typing("stopTyping")
    busy.delete(key)
  }
}
