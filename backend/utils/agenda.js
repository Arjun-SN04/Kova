import { AiMessage } from "../models/aiMessage.model.js"
import { GoogleAccount } from "../models/googleAccount.model.js"
import User from "../models/user.model.js"
import { emitToUsers } from "./notify.js"
import { hasGmail, listEvents, listMail, listTasks } from "./google.js"
import { sendPush } from "./push.js"

// Nexa's morning brief and meeting reminders from Google Calendar / Tasks.
// They arrive as messages in the user's Nexa chat (live via the "nexaMessage" socket event).

const EVERY_MS = 60_000
const LATE_LIMIT_MIN = 180   // a brief more than 3 h late (server was down) is skipped for that day
const UPCOMING_REFRESH_MS = 5 * 60_000

// ── Time zone helpers ──────────────────────────────────────────
export const safeZone = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz } catch { return "UTC" } }

const partsIn = (date, timeZone) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

const offsetMinutes = (timeZone, date) => {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "GMT"
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0
}

// [start, end) of the local day containing `date`, as Date objects
export const dayBounds = (timeZone, date = new Date()) => {
  const { date: ymd } = partsIn(date, timeZone)
  const localMidnight = (day) => {
    const utc = Date.parse(`${day}T00:00:00Z`)
    return new Date(utc - offsetMinutes(timeZone, new Date(utc)) * 60_000)
  }
  const nextYmd = new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return { start: localMidnight(ymd), end: localMidnight(nextYmd), ymd }
}

const timeIn = (iso, timeZone) => new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
const dayLabel = (timeZone, date = new Date()) => date.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" })

// ── Sending a Nexa message ─────────────────────────────────────
export const sendNexaMessage = async (userId, content, actions = [], { push = true } = {}) => {
  const msg = await AiMessage.create({ user: userId, role: "assistant", content, actions })
  emitToUsers([userId], "nexaMessage", msg)
  if (push) {
    const text = content.replace(/\*\*/g, "").replace(/^- /gm, "• ")
    const [first = "Nexa", ...rest] = text.split("\n").filter(Boolean)
    sendPush([userId], { title: first.length < 60 && rest.length ? first : "Nexa", body: (first.length < 60 && rest.length ? rest : [first, ...rest]).join("\n").slice(0, 300), tag: `nexa-${msg._id}`, urgent: true }, { onlyOffline: false }).catch(() => {})
  }
  return msg
}

// ── The brief ──────────────────────────────────────────────────
export const buildBrief = async (account, firstName = "") => {
  const tz = account.timeZone
  const { start, end, ymd } = dayBounds(tz)
  const withMail = hasGmail(account) && account.briefEmails
  const [events, tasks, emails] = await Promise.all([
    listEvents(account, start, end),
    listTasks(account),
    withMail ? listMail(account, { q: "is:unread category:primary newer_than:2d", max: 5 }).catch(() => null) : null,
  ])
  const dueToday = tasks.filter((t) => t.due && t.due <= ymd).sort((a, b) => a.due.localeCompare(b.due))
  const undated = tasks.filter((t) => !t.due)

  const greeting = `Good morning${firstName ? `, ${firstName}` : ""}`
  const lines = [`**${greeting}!** Here's your ${dayLabel(tz)}.`]
  if (events.length) {
    lines.push("", `**Meetings and events (${events.length})**`)
    for (const e of events) lines.push(`- ${e.allDay ? "All day" : timeIn(e.start, tz)}: ${e.title}${e.meetLink ? " (Google Meet)" : ""}`)
  }
  if (dueToday.length) {
    lines.push("", `**Tasks due (${dueToday.length})**`)
    for (const t of dueToday) lines.push(`- ${t.title}${t.due < ymd ? " (overdue)" : ""}`)
  }
  if (emails?.length) {
    lines.push("", `**Unread email (${emails.length}${emails.length === 5 ? "+" : ""})**`)
    for (const m of emails) lines.push(`- ${m.from}: ${m.subject}`)
  }
  if (!events.length && !dueToday.length) lines.push("", "- Nothing on your calendar and no tasks due today. Enjoy!")
  if (undated.length) lines.push("", `- Plus ${undated.length} open task${undated.length > 1 ? "s" : ""} without a date.`)

  return {
    content: lines.join("\n"),
    actions: [{ type: "agenda", date: ymd, timeZone: tz, events, tasks: dueToday.map((t) => ({ ...t, overdue: t.due < ymd })), openTasks: undated.length, ...(emails ? { emails } : {}) }],
  }
}

export const sendBrief = async (account) => {
  const user = await User.findById(account.user).select("fullName")
  const { content, actions } = await buildBrief(account, user?.fullName?.split(" ")[0])
  return sendNexaMessage(account.user, content, actions)
}

// ── Scheduler ──────────────────────────────────────────────────
const upcoming = new Map() // userId -> { at, events } (next 2 hours, refreshed every 5 min)

const checkBrief = async (account) => {
  const tz = account.timeZone
  const now = partsIn(new Date(), tz)
  const [h, m] = account.briefTime.split(":").map(Number)
  const due = h * 60 + m
  if (account.lastBriefDate === now.date || now.minutes < due) return
  // Claim today's brief first so it can't go out twice
  const claimed = await GoogleAccount.updateOne({ _id: account._id, lastBriefDate: { $ne: now.date } }, { $set: { lastBriefDate: now.date } })
  if (!claimed.modifiedCount || now.minutes - due > LATE_LIMIT_MIN) return
  await sendBrief(account)
}

const checkReminders = async (account) => {
  const key = String(account.user)
  let cache = upcoming.get(key)
  if (!cache || Date.now() - cache.at > UPCOMING_REFRESH_MS) {
    cache = { at: Date.now(), events: await listEvents(account, new Date(Date.now() - 60_000), new Date(Date.now() + 2 * 3600_000), 20) }
    upcoming.set(key, cache)
  }
  const lead = account.reminderMinutes * 60_000
  for (const e of cache.events) {
    if (e.allDay) continue
    const start = new Date(e.start).getTime()
    const startsIn = start - Date.now()
    // Made inside the reminder window (e.g. "add Sleep at 1:04" at 1:03): remind at the start instead of right away
    const madeLate = e.createdAt && new Date(e.createdAt).getTime() > start - lead
    // Reminders ("take vitamins") fire at their time; meetings get a heads-up first
    const remindAt = e.isReminder || madeLate ? 0 : lead
    const id = `${e.id}@${e.start}`
    if (startsIn > remindAt || startsIn < -60_000 || account.reminded.includes(id)) continue
    const claimed = await GoogleAccount.updateOne({ _id: account._id, reminded: { $ne: id } }, { $push: { reminded: { $each: [id], $slice: -200 } } })
    if (!claimed.modifiedCount) continue
    await sendReminder(account, e)
  }
}

// "starts in 10 minutes" / "is starting now" / "started 5 minutes ago" / "has ended"
const relative = (e) => {
  const now = Date.now()
  const start = new Date(e.start).getTime()
  const end = new Date(e.end).getTime()
  const mins = (ms) => { const m = Math.ceil(ms / 60_000); return m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minute${m === 1 ? "" : "s"}` }
  if (start - now > 30_000) return `starts in ${mins(start - now)}`
  if (start - now > -60_000) return "is starting now"
  if (end > now) return `started ${mins(now - start)} ago`
  return "has ended"
}

export const sendReminder = async (account, e, { snoozed = false } = {}) => {
  const text = e.isReminder
    ? `${snoozed ? "Snoozed reminder" : "Reminder"}: **${e.title}**`
    : `${snoozed ? "Snoozed reminder" : "Reminder"}: **${e.title}** ${relative(e)} (${timeIn(e.start, account.timeZone)}).${e.meetLink && new Date(e.end) > new Date() ? ` Join: ${e.meetLink}` : ""}`
  const msg = await sendNexaMessage(account.user, text, [{ type: "event", reminder: true, ...(snoozed ? { snoozedReminder: true } : {}), ...e }])
  // Pop it up wherever they are in the app
  emitToUsers([account.user], "reminder", {
    id: `cal-${e.id}`,
    text: e.isReminder ? e.title : `${e.title} ${relative(e)}`,
    kind: e.isReminder ? "reminder" : "meeting",
    meetLink: e.meetLink && new Date(e.end) > new Date() ? e.meetLink : null,
    messageId: String(msg._id),
    open: "nexa",
  })
  return msg
}

// ── Snooze: remind again later ─────────────────────────────────
export const MAX_SNOOZE_MIN = 24 * 60

// Snooze the reminder in one Nexa message until `at`. Returns the updated card.
export const snoozeReminder = async (account, message, at) => {
  const index = message.actions.findIndex((a) => a?.type === "event" && a.reminder)
  if (index < 0) throw Object.assign(new Error("That message has no reminder to snooze"), { status: 400 })
  const event = message.actions[index]
  const { snoozedUntil: _, ...plain } = event
  // One snooze per event: a new one replaces the old
  await GoogleAccount.updateOne({ _id: account._id }, { $pull: { snoozes: { id: event.id } } })
  await GoogleAccount.updateOne({ _id: account._id }, { $push: { snoozes: { id: event.id, at, event: plain } } })
  const action = { ...event, snoozedUntil: at.toISOString() }
  message.actions[index] = action
  message.markModified("actions")
  await message.save()
  return action
}

const checkSnoozes = async (account) => {
  for (const s of account.snoozes.filter((x) => new Date(x.at).getTime() <= Date.now())) {
    // Remove it first so it can only fire once
    const claimed = await GoogleAccount.updateOne({ _id: account._id, "snoozes.id": s.id }, { $pull: { snoozes: { id: s.id } } })
    if (claimed.modifiedCount) await sendReminder(account, s.event, { snoozed: true })
  }
}

// Forget cached events after a change (e.g. Nexa created an event)
export const refreshUpcoming = (userId) => upcoming.delete(String(userId))

// One pass of the scheduler (also handy in tests)
export const runAgendaOnce = async () => {
  const accounts = await GoogleAccount.find({ broken: false, $or: [{ dailyBrief: true }, { meetReminders: true }, { "snoozes.0": { $exists: true } }] })
  for (const account of accounts) {
    try {
      if (account.snoozes.length) await checkSnoozes(account)
      if (account.dailyBrief) await checkBrief(account)
      if (account.meetReminders) await checkReminders(account)
    } catch (err) {
      console.log("agenda error:", String(account.user), err.message)
    }
  }
}

export const startAgenda = () => {
  setInterval(() => runAgendaOnce().catch((err) => console.log("agenda error:", err.message)), EVERY_MS)
  console.log("📅 Google Calendar briefs and reminders: checking every", EVERY_MS / 1000, "s")
}
