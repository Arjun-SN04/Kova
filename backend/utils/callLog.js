import { Call } from "../models/call.model.js"
import { getOrCreateConversation } from "./directChat.js"
import { Message } from "../models/message.model.js"
import { emitToUsers } from "./notify.js"

const LABELS = {
  answered: (type) => `${type === "video" ? "Video" : "Voice"} call`,
  missed: (type) => `Missed ${type} call`,
  declined: (type) => `Declined ${type} call`,
}

// Save a finished call: a Call record for the Calls list, plus a message in the
// chat so both people see it in the conversation.
export const logCall = async ({ caller, callee, type, status, startedAt, answeredAt = null }) => {
  try {
    const endedAt = new Date()
    const duration = answeredAt ? Math.max(0, Math.round((endedAt - answeredAt) / 1000)) : 0
    const call = await Call.create({ caller, callee, type, status, startedAt, answeredAt, endedAt, duration })

    const message = await Message.create({
      senderId: caller,
      receiverId: callee,
      message: LABELS[status](type),
      call: { type, status, duration },
      // A missed call is unread for the person who missed it; anything else isn't
      seen: status !== "missed",
    })
    await getOrCreateConversation(caller, callee)

    emitToUsers([caller, callee], "newMessage", message)
    emitToUsers([caller, callee], "callLogged", call)
  } catch (err) {
    console.log("logCall error:", err.message)
  }
}
