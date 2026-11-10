import User from "../models/user.model.js"
import { getOrCreateConversation } from "./directChat.js"
import { Group } from "../models/group.model.js"
import { Message } from "../models/message.model.js"
import { emitToUsers } from "./notify.js"
import { previewOf, sendPush } from "./push.js"
import { attachLinkPreview } from "./linkPreview.js"

const same = (a, b) => String(a) === String(b)

// Notify people who don't have Kova open (title: the sender, or the group)
const pushFrom = async (senderId, to, msg, groupName = null) => {
  const sender = await User.findById(senderId).select("fullName").catch(() => null)
  const name = sender?.fullName || "Kova"
  sendPush(to, { title: groupName || name, body: `${groupName ? `${name.split(" ")[0]}: ` : ""}${previewOf(msg)}`, tag: groupName ? `group-${msg.groupId}` : `chat-${senderId}` }).catch(() => {})
}

// Send a text message on someone's behalf (used by Nexa and scheduled messages).
// Applies the same rules as the app: contacts only, group members only, admins-only announcements.
// Everyone involved, including the sender, gets a live `newMessage`.
// Business extras: `auto` (greeting/away/nexa/reminder), `sentBy` (team member), `card` (product/order/payment/booking).
export const deliverText = async ({ senderId, receiverId = null, groupId = null, text, ref = null, auto = null, sentBy = null, card = null, location = null }) => {
  const body = String(text || "").trim()
  if (!body && !card && !location) throw new Error("The message is empty")

  if (groupId) {
    const group = await Group.findById(groupId)
    if (!group || !group.members.some((m) => same(m, senderId))) throw new Error("You're not in that group")
    if ((group.announcement || group.adminsOnly) && !group.admins.some((a) => same(a, senderId))) throw new Error("Only admins can send messages there")
    const msg = await Message.create({ senderId, groupId, message: body, sentBy, card, location })
    group.reads.set(String(senderId), new Date())
    group.updatedAt = new Date()
    await group.save()
    emitToUsers(group.members, "newMessage", msg)
    pushFrom(senderId, group.members.filter((m) => !same(m, senderId)), msg, group.name)
    attachLinkPreview(msg)
    return msg
  }

  const self = same(senderId, receiverId)
  if (!self) {
    const sender = await User.findById(senderId).select("contacts")
    if (!sender?.contacts.some((c) => same(c, receiverId))) throw new Error("That person isn't in your contacts")
  }
  await getOrCreateConversation(senderId, receiverId)

  const msg = await Message.create({ senderId, receiverId, message: body, seen: self, ref, auto, sentBy, card, location })
  emitToUsers(self ? [senderId] : [receiverId, senderId], "newMessage", msg)
  attachLinkPreview(msg)
  if (!self) {
    pushFrom(senderId, [receiverId], msg)
    // Business chats: auto messages, waiting-for-reply, team inboxes
    import("./business.js").then(({ onDirectMessage }) => onDirectMessage(msg)).catch((err) => console.log("business hook error:", err.message))
  }
  return msg
}
