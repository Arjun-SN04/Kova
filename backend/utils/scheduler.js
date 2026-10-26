import { ScheduledMessage } from "../models/scheduledMessage.model.js"
import { deliverText } from "./deliver.js"
import { emitToUsers } from "./notify.js"
import { sendNexaMessage } from "./agenda.js"
import { sendPush } from "./push.js"

const EVERY_MS = 10_000

// Send scheduled messages that are due. Each one is claimed first ("sending")
// so it can never go out twice, even if a check overlaps.
const sendDue = async () => {
  for (;;) {
    const job = await ScheduledMessage.findOneAndUpdate(
      { status: "pending", sendAt: { $lte: new Date() } },
      { $set: { status: "sending" } },
      { sort: { sendAt: 1 }, new: true },
    )
    if (!job) return
    // A reminder to myself (not about a chat message): Nexa sends it in the Nexa chat, not "Message yourself"
    const nexaReminder = job.receiver && String(job.receiver) === String(job.sender) && !job.ref
    try {
      if (!nexaReminder) {
        const msg = await deliverText({ senderId: job.sender, receiverId: job.receiver, groupId: job.group, text: job.text, ref: job.ref })
        job.sentMessage = msg._id
      }
      job.status = "sent"
      // Repeating: queue the next one (skipping any times missed while the server was down)
      const r = job.repeat
      if (r?.everyMinutes) {
        const step = r.everyMinutes * 60_000
        let next = job.sendAt.getTime() + step
        while (next <= Date.now()) next += step
        const left = (r.left ?? 1) - 1
        if (left > 0 && (!r.until || next <= r.until.getTime())) {
          job.sendAt = new Date(next)
          job.status = "pending"
        }
        job.repeat = { ...r, left: Math.max(0, left), sent: (r.sent || 0) + 1 }
        job.markModified("repeat")
      }
      if (nexaReminder) {
        const repeating = job.status === "pending"
        sendPush([job.sender], { title: "⏰ Reminder", body: job.text, tag: `reminder-${job._id}`, urgent: true }, { onlyOffline: false }).catch(() => {})
        const msg = await sendNexaMessage(job.sender, `Reminder: **${job.text}**`, [{
          type: "reminder", id: String(job._id), text: job.text,
          ...(job.repeat?.everyMinutes ? { everyMinutes: job.repeat.everyMinutes, left: job.repeat.left, nextAt: repeating ? job.sendAt : null } : {}),
        }], { push: false })
        job.sentMessage = null
      }
    } catch (err) {
      job.status = "failed"
      job.error = err.message
    }
    await job.save()
    emitToUsers([job.sender], "scheduledUpdated", { id: String(job._id), status: job.status })
    // A reminder to myself: pop it up wherever I am in the app (it's also in "Message yourself")
    const toSelf = job.receiver && String(job.receiver) === String(job.sender)
    if (toSelf && job.status !== "failed") {
      emitToUsers([job.sender], "reminder", {
        id: String(job._id),
        text: job.text,
        kind: "reminder",
        open: nexaReminder ? "nexa" : "self",
        repeating: job.status === "pending" && !!job.repeat?.everyMinutes,
        everyMinutes: job.repeat?.everyMinutes || null,
        left: job.repeat?.left ?? null,
        nextAt: job.status === "pending" ? job.sendAt : null,
      })
    }
  }
}

export const startScheduler = () => {
  // Anything left "sending" by a crash goes back in the queue
  ScheduledMessage.updateMany({ status: "sending" }, { $set: { status: "pending" } }).catch(() => {})
  setInterval(() => sendDue().catch((err) => console.log("scheduler error:", err.message)), EVERY_MS)
  console.log("⏰ Scheduled messages: checking every", EVERY_MS / 1000, "s")
}
