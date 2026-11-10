import User from "../models/user.model.js"
import { directFilter } from "./directChat.js"
import { BusinessSettings } from "../models/business.model.js"
import { Customer } from "../models/customer.model.js"
import { Product } from "../models/product.model.js"
import { Order } from "../models/order.model.js"
import { Booking } from "../models/booking.model.js"
import { Message } from "../models/message.model.js"
import { emitToUsers } from "./notify.js"
import { sendPush } from "./push.js"
import { askGroq, groqConfigured } from "./groq.js"
import { dayBounds, safeZone, sendNexaMessage } from "./agenda.js"
import { deliverText } from "./deliver.js"

const same = (a, b) => String(a) === String(b)
const MIN = 60_000
const HOUR = 60 * MIN
const AWAY_EVERY_MS = 6 * HOUR

// ── Opening hours ──────────────────────────────────────────────
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
export const DEFAULT_HOURS = DAY_NAMES.map((_, i) => ({ open: "09:00", close: "18:00", closed: i === 0 }))

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
const clock = (minutes) => {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`
}

// Day of week + minutes since midnight in a time zone
const localNow = (timeZone, date = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date).map((x) => [x.type, x.value]))
  return { day: DAY_NAMES.indexOf(p.weekday), minutes: Number(p.hour) * 60 + Number(p.minute) }
}

const hoursOf = (business) => (business?.hours?.length === 7 ? business.hours : DEFAULT_HOURS)

// Is the business open now, and a short label: "Open now · closes 6 PM" / "Closed · opens Mon 9 AM"
export const hoursState = (business, date = new Date()) => {
  if (!business?.enabled) return null
  const tz = safeZone(business.timeZone || "UTC")
  const hours = hoursOf(business)
  const { day, minutes } = localNow(tz, date)
  const today = hours[day]
  const open = toMinutes(today.open)
  const close = toMinutes(today.close)
  if (!today.closed && open !== null && close !== null && minutes >= open && minutes < close) {
    return { open: true, label: `Open now · closes ${clock(close)}` }
  }
  // Next opening: later today, or the next open day
  for (let i = 0; i < 8; i++) {
    const d = hours[(day + i) % 7]
    const o = toMinutes(d.open)
    if (d.closed || o === null) continue
    if (i === 0 && minutes >= o) continue
    const when = i === 0 ? clock(o) : i === 1 ? `tomorrow ${clock(o)}` : `${DAY_NAMES[(day + i) % 7]} ${clock(o)}`
    return { open: false, label: `Closed · opens ${when}` }
  }
  return { open: false, label: "Closed" }
}

// Check opening hours sent by the browser: 7 days, close after open
export const cleanHours = (hours) => {
  if (!Array.isArray(hours) || hours.length !== 7) return DEFAULT_HOURS
  return hours.map((d) => {
    const open = toMinutes(d?.open)
    const close = toMinutes(d?.close)
    const ok = open !== null && close !== null && close > open && close <= 24 * 60
    return { open: ok ? d.open : "09:00", close: ok ? d.close : "18:00", closed: !!d?.closed || !ok }
  })
}

// ── Time zone maths for bookings ───────────────────────────────
const offsetMinutes = (timeZone, date) => {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "GMT"
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0
}

// "2026-11-02" + 570 minutes in a time zone → Date
export const zonedDate = (ymd, minutes, timeZone) => {
  const utc = Date.parse(`${ymd}T00:00:00Z`) + minutes * MIN
  return new Date(utc - offsetMinutes(timeZone, new Date(utc)) * MIN)
}

export const formatIn = (date, timeZone) =>
  new Date(date).toLocaleString("en-US", { timeZone: safeZone(timeZone || "UTC"), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

// Free booking slots for one service on one day (in the business's time zone)
export const freeSlots = async (owner, service, ymd) => {
  const tz = safeZone(owner.business?.timeZone || "UTC")
  const dayIndex = new Date(`${ymd}T12:00:00Z`).getUTCDay()
  const day = hoursOf(owner.business)[dayIndex]
  const open = toMinutes(day.open)
  const close = toMinutes(day.close)
  if (day.closed || open === null || close === null) return []
  const length = Math.max(10, service.minutes || 30)
  const step = Math.min(length, 30)
  const from = zonedDate(ymd, 0, tz)
  const to = new Date(from.getTime() + 26 * HOUR)
  const taken = await Booking.find({ business: owner._id, status: "booked", start: { $lt: to }, end: { $gt: from } }).select("start end")
  const now = Date.now() + 30 * MIN // at least 30 minutes' notice
  const slots = []
  for (let m = open; m + length <= close; m += step) {
    const start = zonedDate(ymd, m, tz)
    const end = new Date(start.getTime() + length * MIN)
    if (start.getTime() < now) continue
    if (taken.some((b) => b.start < end && b.end > start)) continue
    slots.push({ start, end, label: clock(m) })
  }
  return slots
}

// ── Settings, roles and the team ───────────────────────────────
export const getSettings = async (ownerId) =>
  (await BusinessSettings.findOne({ owner: ownerId })) || BusinessSettings.create({ owner: ownerId })

// owner | admin | agent | null
export const roleIn = (userId, ownerId, settings) => {
  if (same(userId, ownerId)) return "owner"
  return settings?.team?.find((t) => same(t.user, userId))?.role || null
}

// Everyone who works on the business's chats (owner first)
export const teamOf = (ownerId, settings) => [ownerId, ...(settings?.team || []).map((t) => t.user)]

// Fill {name}, {order}, {total}… in a template
export const fillTemplate = (text, vars = {}) =>
  String(text || "").replace(/\{(\w+)\}/g, (all, key) => (vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : all))

export const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

// Send a message from the business to a customer (auto messages, cards, staff replies)
export const sendAsBusiness = (ownerId, customerId, text, extra = {}) =>
  deliverText({ senderId: ownerId, receiverId: customerId, text, ...extra })

// The latest messages between a business and a customer, as text for Nexa
const recentLines = async (ownerId, customerId, count = 12) => {
  const msgs = (await Message.find(directFilter(ownerId, customerId)).sort({ createdAt: -1 }).limit(count)).reverse()
  return msgs.map((m) => `${same(m.senderId, ownerId) ? "Business" : "Customer"}: ${m.message || (m.card ? `[${m.card.kind} card]` : m.attachment ? `[${m.attachment.kind || "file"}]` : "")}`)
}

// Pull the first JSON object out of a model reply
const parseObject = (text) => {
  const match = String(text).match(/\{[\s\S]*\}/)
  try { return match ? JSON.parse(match[0]) : null } catch { return null }
}

// ── Nexa for business ──────────────────────────────────────────
const LEAD_WORDS = /\b(buy|order|book|booking|appointment|price|cost|how much|quote|deliver|available|need \d+|want to|interested)\b/i

// Does this message look like someone who wants to buy or book? (cheap word check first)
const detectLead = async (text) => {
  if (!LEAD_WORDS.test(text)) return false
  if (!groqConfigured()) return true
  const answer = await askGroq([
    { role: "system", content: 'A customer sent this to a business. Do they clearly want to buy, order or book something (a likely sale)? Reply with only "yes" or "no".' },
    { role: "user", content: text.slice(0, 600) },
  ], { model: "openai/gpt-oss-20b", maxTokens: 20, temperature: 0 }).catch(() => "no")
  return /^\s*yes/i.test(answer)
}

// Nexa answers a customer from the profile, hours, catalog, services and FAQ.
// Returns { reply, handoff } (reply null = nothing to say).
const nexaAnswer = async (owner, settings, customerId) => {
  const b = owner.business
  const products = await Product.find({ business: owner._id }).sort({ position: 1, createdAt: 1 }).limit(40)
  const lines = await recentLines(owner._id, customerId)
  const hours = hoursOf(b).map((d, i) => `${DAY_NAMES[i]}: ${d.closed ? "closed" : `${d.open}-${d.close}`}`).join(", ")
  const facts = [
    `Business: ${owner.fullName}${b.category ? ` (${b.category})` : ""}`,
    b.description && `About: ${b.description}`,
    `Hours (${b.timeZone || "UTC"}): ${hours}. Right now: ${hoursState(b)?.label}`,
    b.address && `Address: ${b.address}`,
    b.website && `Website: ${b.website}`,
    products.length && `Catalog:\n${products.map((p) => `- ${p.name}: ${money(p.price)}${p.inStock ? "" : " (out of stock)"}${p.description ? `. ${p.description}` : ""}`).join("\n")}`,
    settings.services?.length && `Bookable services:\n${settings.services.map((s) => `- ${s.name}: ${s.minutes} min${s.price ? `, ${money(s.price)}` : ""}`).join("\n")}`,
    settings.faq?.length && `FAQ:\n${settings.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n")}`,
  ].filter(Boolean).join("\n\n")

  const text = await askGroq([
    {
      role: "system",
      content: `You reply to customers for a business on a chat app, as the business ("we").
Use ONLY these facts. Never invent prices, stock, policies or promises.
${facts}

Answer the customer's latest message in 1-3 short, friendly sentences.
- If the facts answer it, reply and set "handoff": false.
- If you're not sure, it needs a person (complaints, custom requests, refunds, anything not in the facts), reply that you'll pass it to the team and set "handoff": true.
- If the latest message needs no reply (just "ok", "thanks", an emoji), set "reply": null.
Return ONLY JSON: {"reply": string|null, "handoff": boolean}`,
    },
    { role: "user", content: lines.join("\n") || "(no messages)" },
  ], { maxTokens: 400, temperature: 0.3 })
  const out = parseObject(text)
  if (!out) return { reply: null, handoff: false }
  return { reply: typeof out.reply === "string" && out.reply.trim() ? out.reply.trim().slice(0, 1000) : null, handoff: !!out.handoff }
}

// ── After every direct message ─────────────────────────────────
// Customers writing to a business get greeting / away messages and maybe a Nexa answer;
// the business's replies clear "waiting for reply". The team's inboxes update live.
export const onDirectMessage = async (message) => {
  if (!message?.receiverId || message.groupId || message.botChat?.length || message.call) return
  const { senderId, receiverId } = message
  if (same(senderId, receiverId)) return
  const people = await User.find({ _id: { $in: [senderId, receiverId] } }).select("fullName business isBot")
  const sender = people.find((u) => same(u._id, senderId))
  const receiver = people.find((u) => same(u._id, receiverId))
  if (!sender || !receiver) return

  // The business wrote (owner or a team member on its behalf)
  if (sender.business?.enabled) {
    const answered = !message.auto || message.auto === "nexa"
    const customer = answered
      ? await Customer.findOneAndUpdate(
        { business: sender._id, customer: receiver._id },
        { $set: { lastOutAt: new Date(), waitingSince: null, alertedAt: null, ...(message.auto ? {} : { needsHuman: false }) } },
        { new: true },
      )
      : null
    const settings = await BusinessSettings.findOne({ owner: sender._id }).select("team")
    emitToUsers(teamOf(sender._id, settings), "businessInbox", { business: String(sender._id), customer: String(receiver._id), message, record: customer })
    return
  }
  if (!receiver.business?.enabled || sender.isBot) return

  // A customer wrote to a business
  const owner = receiver
  const settings = await getSettings(owner._id)
  const now = new Date()
  let customer = await Customer.findOneAndUpdate(
    { business: owner._id, customer: sender._id },
    { $setOnInsert: { firstAt: now } },
    { upsert: true, new: true },
  )
  const firstTime = !customer.lastInAt && !customer.greetedAt
  customer.lastInAt = now
  if (!customer.waitingSince) { customer.waitingSince = now; customer.alertedAt = null }
  await customer.save()
  emitToUsers(teamOf(owner._id, settings), "businessInbox", { business: String(owner._id), customer: String(sender._id), message, record: customer })

  const state = hoursState(owner.business)
  const text = String(message.message || "").trim()

  if (firstTime && settings.greeting?.on && settings.greeting.text?.trim()) {
    await sendAsBusiness(owner._id, sender._id, fillTemplate(settings.greeting.text, { name: sender.fullName.split(" ")[0] }), { auto: "greeting" }).catch(() => {})
    customer.greetedAt = now
  }
  if (state && !state.open && settings.away?.on && settings.away.text?.trim() && (!customer.awayAt || now - customer.awayAt > AWAY_EVERY_MS)) {
    await sendAsBusiness(owner._id, sender._id, fillTemplate(settings.away.text, { name: sender.fullName.split(" ")[0], hours: state.label }), { auto: "away" }).catch(() => {})
    customer.awayAt = now
  }
  await customer.save()

  if (!text) return
  // Lead detection and Nexa auto-reply run in the background
  ;(async () => {
    if (settings.leadDetection && !customer.lead && await detectLead(text).catch(() => false)) {
      customer = await Customer.findByIdAndUpdate(customer._id, { $set: { lead: true } }, { new: true })
      emitToUsers(teamOf(owner._id, settings), "businessCustomer", { business: String(owner._id), record: customer })
    }
    if (settings.nexaAutoReply && groqConfigured()) {
      const { reply, handoff } = await nexaAnswer(owner, settings, sender._id)
      if (reply) await sendAsBusiness(owner._id, sender._id, reply, { auto: "nexa" })
      if (handoff) {
        customer = await Customer.findByIdAndUpdate(customer._id, { $set: { needsHuman: true } }, { new: true })
        emitToUsers(teamOf(owner._id, settings), "businessCustomer", { business: String(owner._id), record: customer })
      }
    }
  })().catch((err) => console.log("business auto-reply error:", err.message))
}

// ── The daily summary ──────────────────────────────────────────
export const buildSummary = async (owner, settings) => {
  const tz = safeZone(owner.business?.timeZone || "UTC")
  const today = dayBounds(tz)
  const yesterday = dayBounds(tz, new Date(today.start.getTime() - HOUR))
  const range = { $gte: yesterday.start, $lt: yesterday.end }
  const [newCustomers, messagesIn, orders, pending, bookings, waiting, followUps] = await Promise.all([
    Customer.countDocuments({ business: owner._id, firstAt: range }),
    Message.countDocuments({ receiverId: owner._id, createdAt: range }),
    Order.find({ business: owner._id, createdAt: range, status: { $ne: "cancelled" } }).select("total"),
    Order.countDocuments({ business: owner._id, status: { $in: ["new", "confirmed", "ready", "shipped"] } }),
    Booking.find({ business: owner._id, status: "booked", start: { $gte: today.start, $lt: today.end } }).sort({ start: 1 }).populate("customer", "fullName"),
    Customer.countDocuments({ business: owner._id, waitingSince: { $ne: null } }),
    Customer.countDocuments({ business: owner._id, "followUp.done": false, "followUp.at": { $lt: today.end } }),
  ])
  const revenue = orders.reduce((n, o) => n + o.total, 0)
  const time = (d) => new Date(d).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
  return [
    `**Good morning! Here's ${owner.fullName} today.**`,
    `- Yesterday: ${newCustomers} new customer${newCustomers === 1 ? "" : "s"}, ${messagesIn} message${messagesIn === 1 ? "" : "s"} in, ${orders.length} order${orders.length === 1 ? "" : "s"} (${money(revenue)})`,
    `- Open orders: ${pending}`,
    bookings.length
      ? `- Today's bookings: ${bookings.map((b) => `${time(b.start)} ${b.service.name} with ${b.customer?.fullName?.split(" ")[0] || "a customer"}`).join(", ")}`
      : "- No bookings today",
    waiting ? `- ${waiting} customer${waiting === 1 ? " is" : "s are"} waiting for a reply` : "- Nobody is waiting for a reply",
    followUps ? `- ${followUps} follow-up${followUps === 1 ? "" : "s"} due` : null,
  ].filter(Boolean).join("\n")
}

// ── Every minute: reminders, follow-ups, alerts, summaries ─────
const remindBookings = async () => {
  const now = Date.now()
  const due = await Booking.find({ status: "booked", remindedAt: null, start: { $gt: new Date(now), $lte: new Date(now + 24 * HOUR) } }).limit(50)
  for (const b of due) {
    b.remindedAt = new Date()
    await b.save()
    // Booked at the last minute: they don't need a reminder
    if (b.start - b.createdAt < 3 * HOUR) continue
    const owner = await User.findById(b.business).select("business")
    const when = formatIn(b.start, owner?.business?.timeZone)
    await sendAsBusiness(b.business, b.customer, `Reminder: your ${b.service.name} is on ${when}.${b.meetLink ? ` Join here: ${b.meetLink}` : ""} See you then!`, { auto: "reminder" })
      .catch((err) => console.log("booking reminder error:", err.message))
  }
}

const sendFollowUps = async () => {
  const due = await Customer.find({ "followUp.done": false, "followUp.at": { $lte: new Date() } }).limit(50).populate("customer", "fullName")
  for (const c of due) {
    c.set("followUp.done", true)
    await c.save()
    const name = c.customer?.fullName || "a customer"
    await sendNexaMessage(c.business, `Follow up with **${name}**${c.followUp.note ? `: ${c.followUp.note}` : ""}`).catch(() => {})
    emitToUsers([c.business], "businessCustomer", { business: String(c.business), record: c })
  }
}

const alertWaiting = async () => {
  const waiting = await Customer.find({ waitingSince: { $ne: null, $lte: new Date(Date.now() - MIN) }, alertedAt: null }).limit(100).populate("customer", "fullName")
  const settingsCache = new Map()
  for (const c of waiting) {
    const key = String(c.business)
    if (!settingsCache.has(key)) settingsCache.set(key, await BusinessSettings.findOne({ owner: c.business }).select("unansweredMinutes team"))
    const settings = settingsCache.get(key)
    const limit = settings?.unansweredMinutes ?? 15
    if (!limit) continue
    const minutes = Math.round((Date.now() - c.waitingSince) / MIN)
    if (minutes < limit) continue
    c.alertedAt = new Date()
    await c.save()
    const name = c.customer?.fullName || "A customer"
    const team = teamOf(c.business, settings)
    emitToUsers(team, "businessAlert", { business: key, customer: String(c.customer?._id), name, minutes })
    sendPush(team, { title: "Customer waiting", body: `${name} has been waiting ${minutes} min for a reply`, tag: `waiting-${c.customer?._id}` }).catch(() => {})
  }
}

const sendSummaries = async () => {
  const list = await BusinessSettings.find({ dailySummary: true }).select("owner summarySentOn")
  for (const s of list) {
    const owner = await User.findById(s.owner).select("fullName business")
    if (!owner?.business?.enabled) continue
    const tz = safeZone(owner.business.timeZone || "UTC")
    const { ymd } = dayBounds(tz)
    if (s.summarySentOn === ymd) continue
    const { minutes } = localNow(tz)
    if (minutes < 9 * 60 || minutes > 12 * 60) continue // 9 AM, or soon after if the server was down
    s.summarySentOn = ymd
    await s.save()
    await sendNexaMessage(owner._id, await buildSummary(owner, s)).catch((err) => console.log("summary error:", err.message))
  }
}

export const startBusiness = () => {
  const tick = async () => {
    for (const job of [remindBookings, sendFollowUps, alertWaiting, sendSummaries]) {
      await job().catch((err) => console.log(`business ${job.name} error:`, err.message))
    }
  }
  setInterval(tick, MIN)
  console.log("💼 Business tasks: checking every minute")
}

// A direct chat was deleted: nobody is waiting for a reply any more.
// Clears the "waiting" mark on the customer record (either side may be the business)
// and updates the business team's screens. Never throws.
export const clearWaitingFor = async (a, b) => {
  try {
    const records = await Customer.find({ $or: [{ business: a, customer: b }, { business: b, customer: a }], waitingSince: { $ne: null } })
    for (const record of records) {
      record.waitingSince = null
      record.alertedAt = null
      record.needsHuman = false
      await record.save()
      const settings = await BusinessSettings.findOne({ owner: record.business })
      emitToUsers(teamOf(record.business, settings), "businessCustomer", { business: String(record.business), record })
    }
  } catch (err) {
    console.log("clearWaitingFor error:", err.message)
  }
}
