// Nexa runs the app for the user: business account, catalog, groups, communities,
// channels, contacts, profile and privacy. Each tool calls the same route handlers
// the app's screens use, so every permission check and validation still applies.
import User from "../models/user.model.js"
import { runAsViewer } from "./viewer.js"
import { DAY_NAMES, DEFAULT_HOURS } from "./business.js"
import { TIMER_CHOICES } from "./disappear.js"
import { appUrl } from "./emailTemplates.js"
import * as biz from "../controller/business.controller.js"
import * as shop from "../controller/commerce.controller.js"
import * as grp from "../controller/group.controller.js"
import * as com from "../controller/community.controller.js"
import * as chan from "../controller/channel.controller.js"
import * as contact from "../controller/contact.controller.js"
import * as account from "../controller/user.controller.js"
import * as status from "../controller/status.controller.js"
import * as extras from "../controller/messageExtras.controller.js"
import * as gtask from "../controller/task.controller.js"
import * as gevent from "../controller/event.controller.js"

// ── Running a route handler as the user ────────────────────────
// A stand-in for Express's req/res. Resolves with { ok, status, data }.
export const invoke = async (userId, chain, { params = {}, body = {}, query = {}, method = "POST" } = {}) => {
  const user = await User.findById(userId).select("-password") // fresh: earlier tools may have changed it
  return new Promise((resolve) => {
    let done = false
    const finish = (code, data) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ ok: code < 400, status: code, data: data ?? {} })
    }
    const timer = setTimeout(() => finish(504, { error: "That took too long. Try again." }), 25_000)
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this },
      json(data) { finish(this.statusCode, data); return this },
      send(data) { finish(this.statusCode, data); return this },
      sendStatus(code) { finish(code, {}); return this },
      set() { return this },
      cookie() { return this },
      clearCookie() { return this },
    }
    const req = { user, params, body, query, method, headers: {}, cookies: {} }
    const run = (i) => {
      if (i >= chain.length) return finish(500, { error: "No response" })
      Promise.resolve(chain[i](req, res, () => run(i + 1))).catch((err) => finish(500, { error: err?.message || "Something went wrong" }))
    }
    runAsViewer(user, () => run(0))
  })
}

// ── Helpers ────────────────────────────────────────────────────
const s = (v, max = 200) => String(v ?? "").trim().slice(0, max)
const low = (v) => s(v).toLowerCase().replace(/^@/, "")
const idOf = (x) => String(x?._id ?? x ?? "")
const errorOf = (r) => r.data?.error || `Failed (${r.status})`
const out = (r, ok, action) => (r.ok ? { result: { ok: true, ...ok }, ...(action ? { action } : {}) } : { result: { error: errorOf(r) } })
const card = (title, details = [], extra = {}) => ({ type: "app", title, details: details.filter(Boolean).slice(0, 8), ...extra })
// Destructive or far-reaching steps wait for an explicit "yes" from the user
const confirmFirst = (args, what) => (args.confirmed === true ? null
  : { result: { needs_confirmation: `Ask the user in one line: "Shall I ${what}?" Do it (confirmed: true) only after they reply yes.` }, question: `Shall I ${what}?` })

// "Priya", "@priya", "Priya Sharma" or an id -> one item from a list (exact before partial)
const pick = (items, wanted, names) => {
  const key = low(wanted)
  if (!key) return null
  const byId = items.find((it) => idOf(it) === s(wanted))
  if (byId) return byId
  const exact = items.filter((it) => names(it).some((n) => low(n) === key))
  if (exact.length) return exact[0]
  const partial = items.filter((it) => names(it).some((n) => low(n).includes(key) || low(n).split(" ")[0] === key))
  return partial.length === 1 ? partial[0] : null
}
const contactFrom = (ctx, who) => pick([...ctx.people.values()], who, (c) => [c.fullName, c.username])
const contactIds = (ctx, list) => {
  const found = []
  const missing = []
  for (const who of Array.isArray(list) ? list : [list].filter(Boolean)) {
    const c = contactFrom(ctx, who)
    if (c) found.push(idOf(c))
    else missing.push(String(who))
  }
  return { ids: [...new Set(found)], missing }
}
const missingNote = (missing) => (missing.length ? { not_found: missing, note: "These aren't in the user's contacts" } : {})

// ── Tool definitions (sent only when a question needs them) ───
const fn = (name, description, properties = {}, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } })
const confirmed = { type: "boolean", description: "true only after the user said yes to this exact step" }
const hoursProp = { type: "object", description: 'Opening hours by day, e.g. {"Mon":"09:00-18:00","Sun":"closed"}. Keys Sun..Sat or "all"/"weekdays"/"weekends". 24h times.' }

export const BUSINESS_TOOLS = [
  fn("business_info", "Show the user's business account: profile, opening hours, settings, quick replies, FAQ, services, coupons, labels, team."),
  fn("business_setup", "Create (turn on) the user's business account, or edit its public profile. Call it right away when they ask for a business account, even with no details (none are required); ask for the name and other details afterwards. Also switches back to a personal account (enabled: false).", {
    enabled: { type: "boolean", description: "true to create/turn on, false to switch back to personal" },
    business_name: { type: "string", description: "The business's name, only if the user gave one (it becomes the account's display name)" },
    category: { type: "string", description: "Bakery, Restaurant & café, Grocery, Clothing & fashion, Beauty & salon, Health & fitness, Education & tutoring, Electronics, Home services, Professional services, Travel, Other" },
    description: { type: "string", description: "Short public description (max 300 chars)" },
    address: { type: "string" }, website: { type: "string" }, email: { type: "string" },
    upi_id: { type: "string", description: "UPI ID for payments, like name@okhdfc" },
    hours: hoursProp,
    request_verification: { type: "boolean", description: "Ask Kova to verify the business" },
    confirmed,
  }),
  fn("business_settings", "Change business automation: greeting message, away message, Nexa auto-reply to customers, lead detection, daily summary, unanswered alert.", {
    greeting_on: { type: "boolean" }, greeting_text: { type: "string" },
    away_on: { type: "boolean" }, away_text: { type: "string" },
    nexa_auto_reply: { type: "boolean", description: "Nexa answers customers from the FAQ" },
    lead_detection: { type: "boolean" }, daily_summary: { type: "boolean" },
    unanswered_minutes: { type: "integer", description: "Alert after a customer waits this long (0 = off)" },
  }),
  fn("business_list", "Add, update or remove items in a business list.", {
    list: { type: "string", enum: ["quick_replies", "faq", "services", "coupons", "labels", "templates"] },
    add: {
      type: "array", items: { type: "object" },
      description: "Items to add or update (same key replaces). quick_replies {shortcut,text}; faq {q,a}; services {name,minutes,price,description}; coupons {code,kind:percent|flat,value,minTotal,maxUses,expiresAt}; labels {name,color:#hex}; templates {name,text}",
    },
    remove: { type: "array", items: { type: "string" }, description: "Keys to remove: shortcut, question, service name, coupon code, label or template name" },
  }, ["list"]),
  fn("business_products", "Manage the business catalog.", {
    action: { type: "string", enum: ["list", "add", "update", "delete"] },
    product: { type: "string", description: "For update/delete: product name or id" },
    name: { type: "string" }, price: { type: "number" }, description: { type: "string" },
    in_stock: { type: "boolean" },
    items: { type: "array", items: { type: "object" }, description: "For add: several products at once [{name,price,description,in_stock}]" },
    confirmed,
  }, ["action"]),
  fn("business_orders", "List orders, or change an order's status / paid flag and tell the customer.", {
    action: { type: "string", enum: ["list", "update"] },
    order: { type: "string", description: "Order number like 1004, or id" },
    filter_status: { type: "string", enum: ["new", "confirmed", "ready", "shipped", "done", "cancelled"] },
    status: { type: "string", enum: ["new", "confirmed", "ready", "shipped", "done", "cancelled"] },
    paid: { type: "boolean" },
    notify: { type: "boolean", description: "Message the customer about the change (default true)" },
  }, ["action"]),
  fn("business_bookings", "List appointments, or mark one done / cancelled.", {
    action: { type: "string", enum: ["list", "update"] },
    booking: { type: "string", description: "Booking id from the list" },
    status: { type: "string", enum: ["done", "cancelled", "booked"] },
  }, ["action"]),
  fn("business_team", "Add or remove staff on the business team.", {
    action: { type: "string", enum: ["add", "remove"] },
    username: { type: "string" }, role: { type: "string", enum: ["agent", "admin"] },
    confirmed,
  }, ["action", "username"]),
  fn("business_broadcast", "Send one message to many customers (each privately). {name} is replaced by their first name.", {
    text: { type: "string" },
    label: { type: "string", description: "Only customers with this label (default: all customers)" },
    confirmed,
  }, ["text"]),
  fn("business_insights", "Business stats: messages, new customers, orders, revenue, bookings, reply time.", { days: { type: "integer", description: "1-90, default 7" } }),
]

export const SOCIAL_TOOLS = [
  fn("manage_group", "Create or manage a group chat.", {
    action: { type: "string", enum: ["create", "update", "add_members", "remove_member", "make_admin", "remove_admin", "leave", "delete", "invite_link", "add_task", "add_event"] },
    group: { type: "string", description: "Group name or id (not for create)" },
    name: { type: "string" }, description: { type: "string" },
    members: { type: "array", items: { type: "string" }, description: "Contacts' names, @usernames or ids" },
    member: { type: "string", description: "One person (remove/admin)" },
    admins_only: { type: "boolean", description: "Only admins can send messages" },
    approve_joins: { type: "boolean", description: "Admins approve people joining by link" },
    text: { type: "string", description: "add_task: the task" },
    due: { type: "string", description: "add_task: due date YYYY-MM-DD" },
    title: { type: "string", description: "add_event: event name" },
    starts_at: { type: "string", description: "add_event: ISO 8601 with offset" },
    location: { type: "string" },
    confirmed,
  }, ["action"]),
  fn("manage_community", "Create or manage a community (groups under one roof with an Announcements group).", {
    action: { type: "string", enum: ["list", "create", "update", "add_members", "remove_member", "add_group", "leave", "delete"] },
    community: { type: "string", description: "Community name or id" },
    name: { type: "string" }, description: { type: "string" },
    members: { type: "array", items: { type: "string" } },
    member: { type: "string" },
    confirmed,
  }, ["action"]),
  fn("manage_channel", "Create or manage broadcast channels, post to them, or follow/unfollow them.", {
    action: { type: "string", enum: ["list", "find", "create", "update", "post", "follow", "unfollow", "delete"] },
    channel: { type: "string", description: "Channel name, @handle or id" },
    name: { type: "string" }, handle: { type: "string", description: "3-30 letters, numbers, _ or ." },
    description: { type: "string" }, text: { type: "string", description: "Post text" },
    confirmed,
  }, ["action"]),
]

export const ACCOUNT_TOOLS = [
  fn("update_profile", "Change the user's own name, about line or @username.", {
    full_name: { type: "string" }, about: { type: "string", description: "Max 140 chars" }, username: { type: "string" },
  }),
  fn("update_privacy", "Change privacy settings.", {
    last_seen: { type: "boolean", description: "Show online / last seen" },
    read_receipts: { type: "boolean" },
    photo: { type: "string", enum: ["everyone", "contacts", "nobody"] },
    about: { type: "string", enum: ["everyone", "contacts", "nobody"] },
    group_adds: { type: "string", enum: ["contacts", "approve"], description: "Who can add the user to groups directly" },
  }),
  fn("manage_contacts", "Add a contact by @username, answer contact requests, remove, block or unblock someone, or get the user's invite link.", {
    action: { type: "string", enum: ["add", "requests", "accept", "decline", "remove", "block", "unblock", "blocked", "invite_link"] },
    who: { type: "string", description: "@username, name or id" },
    confirmed,
  }, ["action"]),
  fn("chat_settings", "Per-chat settings: disappearing messages timer and pinning a chat.", {
    chat: { type: "string", description: "Contact or group name/id, or 'me'" },
    disappear: { type: "string", enum: ["off", "24h", "7d", "90d"] },
    pinned: { type: "boolean" },
  }, ["chat"]),
  fn("post_status", "Post a 24-hour text status for the user's contacts.", {
    text: { type: "string" },
    color: { type: "string", enum: ["indigo", "violet", "pink", "red", "orange", "green", "teal", "blue", "slate"] },
  }, ["text"]),
]

export const APP_TOOL_NAMES = new Set([...BUSINESS_TOOLS, ...SOCIAL_TOOLS, ...ACCOUNT_TOOLS].map((t) => t.function.name))

// ── Business ───────────────────────────────────────────────────
const asBiz = (...roles) => biz.loadBusiness(...roles)
const ME = { biz: "me" }

// {"Mon":"09:00-18:00","Sun":"closed","weekdays":"10:00-19:00"} on top of the current hours
const buildHours = (current, wanted) => {
  const hours = (current?.length === 7 ? current : DEFAULT_HOURS).map((d) => ({ open: d.open, close: d.close, closed: !!d.closed }))
  if (!wanted || typeof wanted !== "object") return null
  const groups = { all: [0, 1, 2, 3, 4, 5, 6], everyday: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] }
  const dayIndex = (k) => DAY_NAMES.findIndex((d) => d.toLowerCase() === k.slice(0, 3).toLowerCase())
  const to24 = (t) => {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t.trim())
    if (!m) return null
    let h = Number(m[1]) % (m[3] ? 12 : 24)
    if (m[3]?.toLowerCase() === "pm") h += 12
    return `${String(h).padStart(2, "0")}:${m[2] || "00"}`
  }
  // Group keys first, so "Sun": "closed" can override "all"
  const entries = Object.entries(wanted).sort(([a], [b]) => (groups[b.toLowerCase()] ? 1 : 0) - (groups[a.toLowerCase()] ? 1 : 0))
  for (const [key, value] of entries) {
    const days = groups[key.toLowerCase()] || [dayIndex(key)].filter((i) => i >= 0)
    const v = String(value || "").trim()
    for (const i of days) {
      if (/closed|off|holiday/i.test(v)) { hours[i].closed = true; continue }
      const [a, b] = v.split(/\s*(?:-|–|to)\s*/i)
      const open = a && to24(a)
      const close = b && to24(b)
      if (open && close) hours[i] = { open, close, closed: false }
    }
  }
  return hours
}

const LISTS = {
  quick_replies: { key: "quickReplies", id: "shortcut", norm: (x) => ({ shortcut: s(x.shortcut || x.name, 30).replace(/^\/+/, ""), text: s(x.text || x.reply, 2000) }) },
  faq: { key: "faq", id: "q", norm: (x) => ({ q: s(x.q || x.question, 300), a: s(x.a || x.answer, 1500) }) },
  services: { key: "services", id: "name", norm: (x) => ({ name: s(x.name, 80), minutes: Number(x.minutes || x.duration) || 30, price: Number(x.price) || 0, description: s(x.description, 300) }) },
  coupons: { key: "coupons", id: "code", norm: (x) => ({ code: s(x.code, 20).toUpperCase(), kind: x.kind === "flat" ? "flat" : "percent", value: Number(x.value ?? x.percent ?? x.amount) || 0, minTotal: Number(x.minTotal ?? x.min_total) || 0, maxUses: Number(x.maxUses ?? x.max_uses) || 0, expiresAt: x.expiresAt || x.expires_at || null, active: x.active !== false }) },
  labels: { key: "labels", id: "name", norm: (x) => ({ name: s(x.name, 30), color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : "#6366f1" }) },
  templates: { key: "templates", id: "name", norm: (x) => ({ name: s(x.name, 60), text: s(x.text, 2000) }) },
}

const settingsSummary = (st) => ({
  greeting: st.greeting?.on ? st.greeting.text : "off",
  away: st.away?.on ? st.away.text : "off",
  nexaAutoReply: st.nexaAutoReply, leadDetection: st.leadDetection, dailySummary: st.dailySummary, unansweredMinutes: st.unansweredMinutes,
  quickReplies: st.quickReplies?.map((q) => `/${q.shortcut}: ${q.text.slice(0, 60)}`),
  faq: st.faq?.map((f) => f.q),
  services: st.services?.map((x) => `${x.name} (${x.minutes} min, ${x.price})`),
  coupons: st.coupons?.map((c) => `${c.code} ${c.kind === "flat" ? c.value : `${c.value}%`}${c.active ? "" : " (off)"}`),
  labels: st.labels?.map((l) => l.name),
  templates: st.templates?.map((t) => t.name),
  team: st.team?.map((t) => `${t.user?.fullName || "someone"} (@${t.user?.username || "?"}) ${t.role}`),
})

const hoursText = (hours) => (hours || DEFAULT_HOURS).map((d, i) => `${DAY_NAMES[i]} ${d.closed ? "closed" : `${d.open}-${d.close}`}`).join(", ")

const runBusiness = async (name, a, ctx) => {
  const me = ctx.user._id
  switch (name) {
    case "business_info": {
      const r = await invoke(me, [asBiz(), biz.getOverview], { params: ME })
      if (!r.ok) {
        const mine = await invoke(me, [biz.getMyBusiness])
        const p = mine.data?.previous
        return { result: { hasBusiness: false, ...(p ? { switchedOff: { category: p.category, products: p.products, orders: p.orders } } : {}), workFor: mine.data?.workFor?.map((w) => `${w.fullName} (${w.role})`) } }
      }
      const b = r.data.business.business
      return { result: { hasBusiness: true, name: r.data.business.fullName, username: r.data.business.username, category: b.category, description: b.description, address: b.address, website: b.website, email: b.email, upiId: b.upiId, verified: b.verified, hours: hoursText(b.hours), openNow: r.data.business.status?.label, settings: settingsSummary(r.data.settings) } }
    }
    case "business_setup": {
      const current = (await User.findById(me).select("business"))?.business
      // Switching back to personal keeps everything and can be undone, so no "are you sure?"
      const body = { timeZone: current?.timeZone || ctx.timeZone }
      if (a.enabled !== undefined) body.enabled = !!a.enabled
      else if (!current?.enabled) body.enabled = true // "set up my business" = turn it on
      for (const [from, to] of [["category", "category"], ["description", "description"], ["address", "address"], ["website", "website"], ["email", "email"], ["upi_id", "upiId"]]) {
        if (a[from] !== undefined) body[to] = a[from]
      }
      const hours = buildHours(current?.hours, a.hours)
      if (hours) body.hours = hours
      const r = await invoke(me, [biz.updateProfile], { body })
      if (!r.ok) return { result: { error: errorOf(r) } }
      // A business shows the account's display name
      let renamed = null
      // Only a name the user actually wrote (the model sometimes invents one)
      const said = low(ctx.userText || "")
      const nameWords = low(a.business_name).split(/\s+/).filter((w) => w.length > 2)
      if (s(a.business_name, 60) && nameWords.length && nameWords.every((w) => said.includes(w))) {
        const n = await invoke(me, [account.updateProfile], { body: { fullName: s(a.business_name, 60) }, method: "PUT" })
        if (n.ok) renamed = s(a.business_name, 60)
      }
      if (a.request_verification) await invoke(me, [biz.requestVerification])
      const b = r.data.business
      const created = !current?.enabled && b.enabled
      return {
        result: { ok: true, created, enabled: b.enabled, name: renamed || undefined, category: b.category, hours: hoursText(b.hours), openNow: r.data.status?.label, next: created ? "Offer to add products, services, FAQ, a greeting or opening hours." : undefined },
        action: card(
          b.enabled ? (created ? (current?.category ? "Business account turned back on" : "Business account created") : "Business profile updated") : "Switched to a personal account",
          b.enabled ? [renamed && `Name: ${renamed}`, b.category && `Category: ${b.category}`, b.description && `About: ${b.description}`, a.hours && `Hours: ${hoursText(b.hours)}`, b.address && `Address: ${b.address}`, b.upiId && `UPI: ${b.upiId}`, a.request_verification && "Verification requested"] : [],
          { link: b.enabled ? "/business" : null, linkLabel: "Open business", refreshMe: true },
        ),
      }
    }
    case "business_settings": {
      const r0 = await invoke(me, [asBiz("owner", "admin"), biz.getOverview], { params: ME })
      if (!r0.ok) return { result: { error: `${errorOf(r0)}. Set up the business first (business_setup).` } }
      const st = r0.data.settings
      const body = {}
      const changes = []
      if (a.greeting_on !== undefined || a.greeting_text !== undefined) {
        body.greeting = { on: a.greeting_on ?? (a.greeting_text ? true : st.greeting.on), text: a.greeting_text ?? st.greeting.text }
        changes.push(`Greeting: ${body.greeting.on ? body.greeting.text : "off"}`)
      }
      if (a.away_on !== undefined || a.away_text !== undefined) {
        body.away = { on: a.away_on ?? (a.away_text ? true : st.away.on), text: a.away_text ?? st.away.text }
        changes.push(`Away message: ${body.away.on ? body.away.text : "off"}`)
      }
      for (const [from, to, label] of [["nexa_auto_reply", "nexaAutoReply", "Nexa auto-reply"], ["lead_detection", "leadDetection", "Lead detection"], ["daily_summary", "dailySummary", "Daily summary"]]) {
        if (a[from] !== undefined) { body[to] = !!a[from]; changes.push(`${label}: ${a[from] ? "on" : "off"}`) }
      }
      if (a.unanswered_minutes !== undefined) { body.unansweredMinutes = a.unanswered_minutes; changes.push(`Unanswered alert: ${Number(a.unanswered_minutes) ? `${a.unanswered_minutes} min` : "off"}`) }
      if (!changes.length) return { result: { error: "Nothing to change" } }
      const r = await invoke(me, [asBiz("owner", "admin"), biz.updateSettings], { params: ME, body })
      return out(r, { changed: changes }, card("Business settings saved", changes, { link: "/business", linkLabel: "Open business" }))
    }
    case "business_list": {
      const spec = LISTS[a.list]
      if (!spec) return { result: { error: "Unknown list" } }
      const r0 = await invoke(me, [asBiz("owner", "admin"), biz.getOverview], { params: ME })
      if (!r0.ok) return { result: { error: `${errorOf(r0)}. Set up the business first (business_setup).` } }
      const items = (r0.data.settings[spec.key] || []).map((x) => (x.toObject ? x.toObject() : { ...x }))
      const keyOf = (x) => low(x[spec.id])
      const added = []
      const removed = []
      for (const raw of Array.isArray(a.add) ? a.add : []) {
        const item = spec.norm(raw || {})
        if (!item[spec.id]) continue
        const i = items.findIndex((x) => keyOf(x) === keyOf(item))
        if (i >= 0) items[i] = { ...items[i], ...item }
        else items.push(item)
        added.push(item[spec.id])
      }
      for (const key of Array.isArray(a.remove) ? a.remove : []) {
        const i = items.findIndex((x) => keyOf(x) === low(key).replace(/^\/+/, ""))
        if (i >= 0) { removed.push(items[i][spec.id]); items.splice(i, 1) }
      }
      if (!added.length && !removed.length) return { result: { error: "Nothing to add or remove (check the item fields)" } }
      const r = await invoke(me, [asBiz("owner", "admin"), biz.updateSettings], { params: ME, body: { [spec.key]: items } })
      const label = { quick_replies: "Quick replies", faq: "FAQ", services: "Services", coupons: "Discount codes", labels: "Labels", templates: "Templates" }[a.list]
      return out(r, { added, removed, total: items.length },
        card(`${label} updated`, [...added.map((x) => `Added: ${x}`), ...removed.map((x) => `Removed: ${x}`)], { link: "/business", linkLabel: "Open business" }))
    }
    case "business_products": {
      const list = await invoke(me, [asBiz(), shop.listProducts], { params: ME })
      if (!list.ok) return { result: { error: `${errorOf(list)}. Set up the business first (business_setup).` } }
      const products = list.data.products || []
      if (a.action === "list") return { result: { products: products.map((p) => ({ id: idOf(p), name: p.name, price: p.price, inStock: p.inStock, description: p.description?.slice(0, 80) })) } }
      if (a.action === "add") {
        const wanted = Array.isArray(a.items) && a.items.length ? a.items : [{ name: a.name, price: a.price, description: a.description, in_stock: a.in_stock }]
        const made = []
        const failed = []
        for (const p of wanted.slice(0, 30)) {
          const r = await invoke(me, [asBiz("owner", "admin"), shop.createProduct], { params: ME, body: { name: p.name, price: p.price, description: p.description || "", inStock: p.in_stock ?? p.inStock ?? true } })
          if (r.ok) made.push(`${p.name} · ${p.price}`)
          else failed.push(`${p.name || "?"}: ${errorOf(r)}`)
        }
        if (!made.length) return { result: { error: failed.join("; ") } }
        return { result: { ok: true, added: made, failed }, action: card(`Added ${made.length} item${made.length === 1 ? "" : "s"} to the catalog`, made, { link: "/business", linkLabel: "Open catalog" }) }
      }
      const product = pick(products, a.product || a.name, (p) => [p.name])
      if (!product) return { result: { error: "Which product? Not found in the catalog.", products: products.map((p) => p.name) } }
      if (a.action === "delete") {
        const ask = confirmFirst(a, `delete "${product.name}" from the catalog`)
        if (ask) return ask
        const r = await invoke(me, [asBiz("owner", "admin"), shop.deleteProduct], { params: { ...ME, id: idOf(product) } })
        return out(r, { deleted: product.name }, card("Removed from the catalog", [product.name]))
      }
      const body = {}
      if (a.name && low(a.name) !== low(product.name) && a.product) body.name = a.name
      if (a.price !== undefined) body.price = a.price
      if (a.description !== undefined) body.description = a.description
      if (a.in_stock !== undefined) body.inStock = !!a.in_stock
      const r = await invoke(me, [asBiz("owner", "admin"), shop.updateProduct], { params: { ...ME, id: idOf(product) }, body })
      const changes = [body.name && `Name: ${body.name}`, body.price !== undefined && `Price: ${body.price}`, body.inStock !== undefined && (body.inStock ? "In stock" : "Out of stock"), body.description !== undefined && "Description updated"]
      return out(r, { updated: product.name }, card(`Updated ${product.name}`, changes, { link: "/business", linkLabel: "Open catalog" }))
    }
    case "business_orders": {
      const r0 = await invoke(me, [asBiz(), shop.listOrders], { params: ME, query: a.filter_status ? { status: a.filter_status } : {} })
      if (!r0.ok) return { result: { error: errorOf(r0) } }
      const orders = r0.data.orders || []
      if (a.action === "list") {
        return { result: { orders: orders.slice(0, 25).map((o) => ({ number: o.number, id: idOf(o), customer: o.customer?.fullName, total: o.total, status: o.status, paid: o.paid, items: o.items.map((i) => `${i.qty}x ${i.name}`).join(", ") })) } }
      }
      const key = s(a.order).replace(/^#/, "")
      const order = orders.find((o) => String(o.number) === key || idOf(o) === key)
      if (!order) return { result: { error: `No order ${a.order}` } }
      const body = { notify: a.notify !== false }
      if (a.status) body.status = a.status
      if (a.paid !== undefined) body.paid = !!a.paid
      const r = await invoke(me, [asBiz(), shop.updateOrder], { params: { ...ME, id: idOf(order) }, body })
      return out(r, { order: order.number, status: body.status, paid: body.paid, customerNotified: body.notify },
        card(`Order #${order.number} updated`, [body.status && `Status: ${body.status}`, body.paid !== undefined && (body.paid ? "Marked paid" : "Marked unpaid"), body.notify && `${order.customer?.fullName || "Customer"} was told`], { link: "/business", linkLabel: "Open orders" }))
    }
    case "business_bookings": {
      const r0 = await invoke(me, [asBiz(), shop.listBookings], { params: ME })
      if (!r0.ok) return { result: { error: errorOf(r0) } }
      const bookings = r0.data.bookings || []
      if (a.action === "list") {
        return { result: { bookings: bookings.filter((b) => new Date(b.start) > Date.now() - 86_400_000).slice(0, 25).map((b) => ({ id: idOf(b), customer: b.customer?.fullName, service: b.service?.name, start: new Date(b.start).toLocaleString("en-US", { timeZone: ctx.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), status: b.status })) } }
      }
      const booking = bookings.find((b) => idOf(b) === s(a.booking))
      if (!booking) return { result: { error: "Booking not found. List bookings first and use its id." } }
      const r = await invoke(me, [asBiz(), shop.updateBooking], { params: { ...ME, id: idOf(booking) }, body: { status: a.status } })
      return out(r, { status: a.status }, card(`Booking ${a.status}`, [`${booking.service?.name} with ${booking.customer?.fullName}`]))
    }
    case "business_team": {
      if (a.action === "add") {
        const r = await invoke(me, [asBiz("owner"), biz.addTeamMember], { params: ME, body: { username: low(a.username), role: a.role || "agent" } })
        return out(r, { added: a.username, role: a.role || "agent" }, card("Team member added", [`@${low(a.username)} as ${a.role || "agent"}`], { link: "/business", linkLabel: "Open business" }))
      }
      const person = await User.findOne({ username: low(a.username) }).select("_id fullName")
      if (!person) return { result: { error: `No one goes by @${low(a.username)}` } }
      const ask = confirmFirst(a, `remove ${person.fullName} from the business team`)
      if (ask) return ask
      const r = await invoke(me, [asBiz(), biz.removeTeamMember], { params: { ...ME, userId: idOf(person) } })
      return out(r, { removed: person.fullName }, card("Team member removed", [person.fullName]))
    }
    case "business_broadcast": {
      const r0 = await invoke(me, [asBiz("owner", "admin"), biz.getOverview], { params: ME })
      if (!r0.ok) return { result: { error: errorOf(r0) } }
      const label = a.label ? pick(r0.data.settings.labels || [], a.label, (l) => [l.name]) : null
      if (a.label && !label) return { result: { error: `No label "${a.label}"` } }
      const ask = confirmFirst(a, `send "${s(a.text, 120)}" to ${label ? `customers labelled ${label.name}` : "all customers"}`)
      if (ask) return ask
      let body = { text: a.text }
      if (label) body.labelId = idOf(label)
      else {
        const c = await invoke(me, [asBiz(), biz.listCustomers], { params: ME })
        body.customerIds = (c.data.customers || []).map((x) => idOf(x.user))
      }
      const r = await invoke(me, [asBiz("owner", "admin"), biz.sendBroadcast], { params: ME, body })
      return out(r, { sent: r.data.sent, skipped: r.data.skipped }, card(`Broadcast sent to ${r.data.sent} customer${r.data.sent === 1 ? "" : "s"}`, [s(a.text, 140)]))
    }
    case "business_insights": {
      const r = await invoke(me, [asBiz("owner", "admin"), biz.getInsights], { params: ME, query: { days: a.days || 7 } })
      if (!r.ok) return { result: { error: errorOf(r) } }
      const { series, busiestHours, ...rest } = r.data
      const peak = busiestHours?.indexOf(Math.max(...busiestHours))
      return { result: { ...rest, busiestHour: peak >= 0 && Math.max(...busiestHours) ? `${peak}:00` : null } }
    }
  }
}

// ── Groups, communities, channels ──────────────────────────────
const findGroup = async (ctx, wanted) => {
  const r = await invoke(ctx.user._id, [grp.listGroups])
  return pick(r.data?.groups || [], wanted, (g) => [g.name])
}
const findCommunity = async (ctx, wanted) => {
  const r = await invoke(ctx.user._id, [com.listCommunities])
  return { list: r.data?.communities || [], found: pick(r.data?.communities || [], wanted, (c) => [c.name]) }
}
const memberOf = (group, who) => pick((group.members || []).map((m) => (typeof m === "object" ? m : { _id: m })), who, (m) => [m.fullName, m.username].filter(Boolean))

const runSocial = async (name, a, ctx) => {
  const me = ctx.user._id
  switch (name) {
    case "manage_group": {
      if (a.action === "create") {
        const { ids, missing } = contactIds(ctx, a.members)
        const r = await invoke(me, [grp.createGroup], { body: { name: a.name, description: a.description || "", memberIds: ids } })
        if (!r.ok) return { result: { error: errorOf(r), ...missingNote(missing) } }
        const g = r.data
        if (a.admins_only !== undefined || a.approve_joins !== undefined) {
          await invoke(me, [grp.updateGroup], { params: { id: idOf(g) }, body: { ...(a.admins_only !== undefined ? { adminsOnly: !!a.admins_only } : {}), ...(a.approve_joins !== undefined ? { approveJoins: !!a.approve_joins } : {}) } })
        }
        return {
          result: { ok: true, group: g.name, id: idOf(g), members: g.members?.length, invited: g.invited, ...missingNote(missing) },
          action: card(`Group "${g.name}" created`, [`${g.members?.length || 1} members`, g.invited && `${g.invited} invited (they approve group adds)`, missing.length && `Not found: ${missing.join(", ")}`], { chatId: idOf(g), isGroup: true, to: g.name }),
        }
      }
      const g = await findGroup(ctx, a.group)
      if (!g) return { result: { error: `I couldn't find the group "${a.group || ""}". Ask which group.` } }
      const params = { id: idOf(g) }
      const gcard = (title, details) => card(title, details, { chatId: idOf(g), isGroup: true, to: g.name })
      switch (a.action) {
        case "update": {
          const body = {}
          if (a.name) body.name = a.name
          if (a.description !== undefined) body.description = a.description
          if (a.admins_only !== undefined) body.adminsOnly = !!a.admins_only
          if (a.approve_joins !== undefined) body.approveJoins = !!a.approve_joins
          const r = await invoke(me, [grp.updateGroup], { params, body, method: "PUT" })
          return out(r, { group: body.name || g.name }, gcard(`Group "${body.name || g.name}" updated`, [body.name && `Renamed from ${g.name}`, body.description !== undefined && "Description updated", body.adminsOnly !== undefined && `Only admins can send: ${body.adminsOnly ? "on" : "off"}`, body.approveJoins !== undefined && `Approve new members: ${body.approveJoins ? "on" : "off"}`]))
        }
        case "add_members": {
          const { ids, missing } = contactIds(ctx, a.members || a.member)
          if (!ids.length) return { result: { error: "None of those people are in the user's contacts", ...missingNote(missing) } }
          const r = await invoke(me, [grp.addMembers], { params, body: { userIds: ids } })
          const names = ids.map((id) => ctx.people.get(id)?.fullName)
          return out(r, { added: names, ...missingNote(missing) }, gcard(`Added to ${g.name}`, [...names, missing.length && `Not found: ${missing.join(", ")}`]))
        }
        case "remove_member":
        case "make_admin":
        case "remove_admin": {
          const full = await invoke(me, [grp.getGroup], { params })
          const person = memberOf(full.data || g, a.member || a.members?.[0])
          if (!person) return { result: { error: "That person isn't in the group" } }
          if (a.action === "remove_member") {
            const ask = confirmFirst(a, `remove ${person.fullName || "them"} from ${g.name}`)
            if (ask) return ask
            const r = await invoke(me, [grp.removeMember], { params: { ...params, userId: idOf(person) }, method: "DELETE" })
            return out(r, { removed: person.fullName }, gcard(`Removed from ${g.name}`, [person.fullName]))
          }
          const r = await invoke(me, [grp.setAdmin], { params: { ...params, userId: idOf(person) }, body: { admin: a.action === "make_admin" }, method: "PUT" })
          return out(r, {}, gcard(a.action === "make_admin" ? "New group admin" : "Admin removed", [`${person.fullName} in ${g.name}`]))
        }
        case "leave": {
          const ask = confirmFirst(a, `leave the group ${g.name}`)
          if (ask) return ask
          const r = await invoke(me, [grp.removeMember], { params: { ...params, userId: String(me) }, method: "DELETE" })
          return out(r, { left: g.name }, card(`Left ${g.name}`))
        }
        case "delete": {
          const ask = confirmFirst(a, `delete the group ${g.name} for everyone`)
          if (ask) return ask
          const r = await invoke(me, [grp.deleteGroup], { params, method: "DELETE" })
          return out(r, { deleted: g.name }, card(`Deleted the group ${g.name}`))
        }
        case "invite_link": {
          const r = await invoke(me, [grp.getInviteLink], { params, method: "GET" })
          const url = r.ok ? appUrl(`/g/${r.data.code}`) : null
          return out(r, { link: url }, card(`Invite link for ${g.name}`, [url]))
        }
        case "add_task": {
          const assignee = a.member ? memberOf((await invoke(me, [grp.getGroup], { params })).data || g, a.member) : null
          const r = await invoke(me, [gtask.createTask], { body: { groupId: idOf(g), text: a.text || a.title, due: a.due || null, assignee: assignee ? idOf(assignee) : null } })
          return out(r, { task: a.text || a.title }, gcard(`Task added in ${g.name}`, [a.text || a.title, assignee && `For ${assignee.fullName}`, a.due && `Due ${a.due}`]))
        }
        case "add_event": {
          const r = await invoke(me, [gevent.createEvent], { body: { groupId: idOf(g), title: a.title || a.name, startsAt: a.starts_at, description: a.description || "", location: a.location || "" } })
          return out(r, { event: a.title }, gcard(`Event added in ${g.name}`, [a.title || a.name, a.starts_at && new Date(a.starts_at).toLocaleString("en-US", { timeZone: ctx.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), a.location]))
        }
      }
      return { result: { error: "Unknown group action" } }
    }

    case "manage_community": {
      if (a.action === "list") {
        const { list } = await findCommunity(ctx, "")
        return { result: { communities: list.map((c) => ({ id: idOf(c), name: c.name, members: c.members?.length, groups: c.groups?.map((g) => g.name), admin: c.admins?.some((x) => idOf(x) === String(me)) })) } }
      }
      if (a.action === "create") {
        const { ids, missing } = contactIds(ctx, a.members)
        const r = await invoke(me, [com.createCommunity], { body: { name: a.name, description: a.description || "", memberIds: ids } })
        return out(r, { community: r.data?.name, id: idOf(r.data), ...missingNote(missing) },
          card(`Community "${r.data?.name}" created`, [`${r.data?.members?.length || 1} members`, "Announcements group added", missing.length && `Not found: ${missing.join(", ")}`]))
      }
      const { found: c } = await findCommunity(ctx, a.community)
      if (!c) return { result: { error: `I couldn't find the community "${a.community || ""}"` } }
      const params = { id: idOf(c) }
      switch (a.action) {
        case "update": {
          const body = {}
          if (a.name) body.name = a.name
          if (a.description !== undefined) body.description = a.description
          const r = await invoke(me, [com.updateCommunity], { params, body, method: "PUT" })
          return out(r, {}, card(`Community "${body.name || c.name}" updated`, [body.name && `Renamed from ${c.name}`, body.description !== undefined && "Description updated"]))
        }
        case "add_members": {
          const { ids, missing } = contactIds(ctx, a.members || a.member)
          if (!ids.length) return { result: { error: "None of those people are in the user's contacts", ...missingNote(missing) } }
          const r = await invoke(me, [com.addCommunityMembers], { params, body: { userIds: ids } })
          return out(r, { added: ids.map((id) => ctx.people.get(id)?.fullName), ...missingNote(missing) }, card(`Added to ${c.name}`, ids.map((id) => ctx.people.get(id)?.fullName)))
        }
        case "remove_member": {
          const person = contactFrom(ctx, a.member) || (await User.findOne({ username: low(a.member) }).select("fullName"))
          if (!person) return { result: { error: "Who should be removed?" } }
          const ask = confirmFirst(a, `remove ${person.fullName} from ${c.name}`)
          if (ask) return ask
          const r = await invoke(me, [com.removeCommunityMember], { params: { ...params, userId: idOf(person) }, method: "DELETE" })
          return out(r, {}, card(`Removed from ${c.name}`, [person.fullName]))
        }
        case "add_group": {
          const { ids, missing } = contactIds(ctx, a.members)
          const r = await invoke(me, [com.createCommunityGroup], { params, body: { name: a.name, description: a.description || "", memberIds: ids } })
          return out(r, { group: a.name, ...missingNote(missing) }, card(`Group "${a.name}" added to ${c.name}`, [ids.length && `${ids.length} ${ids.length === 1 ? "person" : "people"} added`]))
        }
        case "leave": {
          const ask = confirmFirst(a, `leave the community ${c.name}`)
          if (ask) return ask
          const r = await invoke(me, [com.removeCommunityMember], { params: { ...params, userId: String(me) }, method: "DELETE" })
          return out(r, {}, card(`Left ${c.name}`))
        }
        case "delete": {
          const ask = confirmFirst(a, `delete the community ${c.name} and its announcements`)
          if (ask) return ask
          const r = await invoke(me, [com.deleteCommunity], { params, method: "DELETE" })
          return out(r, {}, card(`Deleted the community ${c.name}`))
        }
      }
      return { result: { error: "Unknown community action" } }
    }

    case "manage_channel": {
      const view = (ch) => ({ id: idOf(ch), name: ch.name, handle: ch.handle, followers: ch.followerCount, admin: !!ch.amAdmin })
      if (a.action === "list") {
        const r = await invoke(me, [chan.myChannels], { method: "GET" })
        return { result: { channels: (Array.isArray(r.data) ? r.data : []).map(view) } }
      }
      if (a.action === "find") {
        const r = await invoke(me, [chan.discoverChannels], { query: { q: a.channel || a.name || "" }, method: "GET" })
        return { result: { channels: (Array.isArray(r.data) ? r.data : []).slice(0, 10).map(view) } }
      }
      if (a.action === "create") {
        const handle = low(a.handle || a.name).replace(/[^a-z0-9_.]/g, "").slice(0, 30)
        const r = await invoke(me, [chan.createChannel], { body: { name: a.name, handle, description: a.description || "" } })
        return out(r, { channel: r.data?.name, handle: r.data?.handle }, card(`Channel "${r.data?.name}" created`, [`@${r.data?.handle}`, a.description]))
      }
      // An existing channel: mine first, then any public one
      const mine = await invoke(me, [chan.myChannels], { method: "GET" })
      const names = (ch) => [ch.name, ch.handle]
      let ch = pick(Array.isArray(mine.data) ? mine.data : [], a.channel, names)
      if (!ch && ["follow", "unfollow"].includes(a.action)) {
        const found = await invoke(me, [chan.discoverChannels], { query: { q: low(a.channel) }, method: "GET" })
        ch = pick(Array.isArray(found.data) ? found.data : [], a.channel, names)
      }
      if (!ch) return { result: { error: `I couldn't find the channel "${a.channel || ""}"` } }
      const params = { id: idOf(ch) }
      switch (a.action) {
        case "update": {
          const body = {}
          if (a.name) body.name = a.name
          if (a.description !== undefined) body.description = a.description
          const r = await invoke(me, [chan.updateChannel], { params, body, method: "PUT" })
          return out(r, {}, card(`Channel "${body.name || ch.name}" updated`))
        }
        case "post": {
          const r = await invoke(me, [chan.createPost], { params, body: { text: a.text } })
          return out(r, {}, card(`Posted in ${ch.name}`, [s(a.text, 140)]))
        }
        case "follow":
        case "unfollow": {
          const r = await invoke(me, [chan.followChannel], { params, method: a.action === "follow" ? "POST" : "DELETE" })
          return out(r, {}, card(a.action === "follow" ? `Following ${ch.name}` : `Unfollowed ${ch.name}`))
        }
        case "delete": {
          const ask = confirmFirst(a, `delete the channel ${ch.name} and all its posts`)
          if (ask) return ask
          const r = await invoke(me, [chan.deleteChannel], { params, method: "DELETE" })
          return out(r, {}, card(`Deleted the channel ${ch.name}`))
        }
      }
      return { result: { error: "Unknown channel action" } }
    }
  }
}

// ── Profile, privacy, contacts, chats, status ──────────────────
const STATUS_COLORS = { indigo: "#4f46e5", violet: "#7c3aed", pink: "#db2777", red: "#dc2626", orange: "#ea580c", green: "#16a34a", teal: "#0d9488", blue: "#0284c7", slate: "#334155" }
const TIMERS = { off: 0, "24h": 86400, "7d": 604800, "90d": 7776000 }

const runAccount = async (name, a, ctx) => {
  const me = ctx.user._id
  switch (name) {
    case "update_profile": {
      const body = {}
      if (a.full_name) body.fullName = a.full_name
      if (a.about !== undefined) body.about = a.about
      if (a.username) body.username = low(a.username)
      if (!Object.keys(body).length) return { result: { error: "Nothing to change" } }
      const r = await invoke(me, [account.updateProfile], { body, method: "PUT" })
      return out(r, {}, card("Profile updated", [body.fullName && `Name: ${body.fullName}`, body.about !== undefined && `About: ${body.about || "(empty)"}`, body.username && `Username: @${body.username}`], { refreshMe: true, link: "/profile", linkLabel: "Open profile" }))
    }
    case "update_privacy": {
      const body = {}
      if (a.last_seen !== undefined) body.activity = !!a.last_seen
      if (a.read_receipts !== undefined) body.seen = !!a.read_receipts
      if (a.photo) body.photo = a.photo
      if (a.about) body.about = a.about
      if (a.group_adds) body.groups = a.group_adds
      if (!Object.keys(body).length) return { result: { error: "Nothing to change" } }
      const r = await invoke(me, [account.updatePrivacy], { body, method: "PUT" })
      return out(r, {}, card("Privacy updated", [
        body.activity !== undefined && `Online and last seen: ${body.activity ? "shown" : "hidden"}`,
        body.seen !== undefined && `Read receipts: ${body.seen ? "on" : "off"}`,
        body.photo && `Profile photo: ${body.photo}`, body.about && `About: ${body.about}`,
        body.groups && `Group adds: ${body.groups === "approve" ? "ask me first" : "contacts"}`,
      ], { refreshMe: true }))
    }
    case "manage_contacts": {
      switch (a.action) {
        case "add": {
          const r = await invoke(me, [contact.sendRequest], { body: { username: low(a.who) } })
          if (!r.ok) return { result: { error: errorOf(r) } }
          const added = r.data.status === "contact"
          return { result: { ok: true, status: added ? "now contacts" : "request sent, waiting for them to accept" }, action: card(added ? "Contact added" : "Contact request sent", [`@${low(a.who)}`]) }
        }
        case "requests": {
          const r = await invoke(me, [contact.getRequests], { method: "GET" })
          return { result: { incoming: (r.data.incoming || []).map((x) => ({ id: idOf(x), from: `${x.from.fullName} (@${x.from.username})` })), outgoing: (r.data.outgoing || []).map((x) => `${x.to.fullName} (@${x.to.username})`) } }
        }
        case "accept":
        case "decline": {
          const r0 = await invoke(me, [contact.getRequests], { method: "GET" })
          const req = pick(r0.data.incoming || [], a.who, (x) => [x.from.fullName, x.from.username])
          if (!req) return { result: { error: "No contact request from that person" } }
          const r = a.action === "accept"
            ? await invoke(me, [contact.acceptRequest], { params: { id: idOf(req) } })
            : await invoke(me, [contact.removeRequest], { params: { id: idOf(req) }, method: "DELETE" })
          return out(r, {}, card(a.action === "accept" ? "Request accepted" : "Request declined", [req.from.fullName]))
        }
        case "remove":
        case "block": {
          const person = contactFrom(ctx, a.who) || (a.action === "block" ? await User.findOne({ username: low(a.who), isBot: { $ne: true } }).select("fullName username") : null)
          if (!person) return { result: { error: `I couldn't find "${a.who}"` } }
          const ask = confirmFirst(a, `${a.action} ${person.fullName}`)
          if (ask) return ask
          const r = a.action === "remove"
            ? await invoke(me, [contact.removeContact], { params: { userId: idOf(person) }, method: "DELETE" })
            : await invoke(me, [contact.blockUser], { params: { userId: idOf(person) } })
          return out(r, {}, card(a.action === "remove" ? "Contact removed" : "Blocked", [person.fullName]))
        }
        case "unblock": {
          const r0 = await invoke(me, [contact.getBlocked], { method: "GET" })
          const person = pick(r0.data.blocked || [], a.who, (u) => [u.fullName, u.username])
          if (!person) return { result: { error: "That person isn't blocked" } }
          const r = await invoke(me, [contact.unblockUser], { params: { userId: idOf(person) }, method: "DELETE" })
          return out(r, {}, card("Unblocked", [person.fullName]))
        }
        case "blocked": {
          const r = await invoke(me, [contact.getBlocked], { method: "GET" })
          return { result: { blocked: (r.data.blocked || []).map((u) => `${u.fullName} (@${u.username})`) } }
        }
        case "invite_link": {
          const r = await invoke(me, [contact.getMyInvite], { method: "GET" })
          const url = r.ok ? appUrl(`/invite/${r.data.token}`) : null
          return out(r, { link: url }, card("Your invite link", [url]))
        }
      }
      return { result: { error: "Unknown contacts action" } }
    }
    case "chat_settings": {
      const key = low(a.chat)
      let chat = null
      if (["me", "self", "myself"].includes(key)) chat = { id: String(me), name: "Message yourself" }
      else {
        const person = contactFrom(ctx, a.chat)
        const group = person ? null : pick([...ctx.groups.values()], a.chat, (g) => [g.name])
        if (person) chat = { id: idOf(person), name: person.fullName }
        else if (group) chat = { id: idOf(group), name: group.name, isGroup: true }
      }
      if (!chat) return { result: { error: `I couldn't find the chat "${a.chat}"` } }
      const done = []
      if (a.disappear) {
        const seconds = TIMERS[a.disappear]
        if (!TIMER_CHOICES.includes(seconds)) return { result: { error: "Choose off, 24h, 7d or 90d" } }
        const r = await invoke(me, [extras.setChatTimer], { params: { chatId: chat.id }, body: { seconds, isGroup: !!chat.isGroup }, method: "PUT" })
        if (!r.ok) return { result: { error: errorOf(r) } }
        done.push(`Disappearing messages: ${a.disappear === "off" ? "off" : a.disappear}`)
      }
      if (a.pinned !== undefined) {
        const r = await invoke(me, [extras.pinChat], { params: { chatId: chat.id }, body: { pinned: !!a.pinned }, method: "PUT" })
        if (!r.ok) return { result: { error: errorOf(r) } }
        done.push(a.pinned ? "Pinned to the top" : "Unpinned")
      }
      if (!done.length) return { result: { error: "Nothing to change" } }
      return { result: { ok: true, chat: chat.name, changed: done }, action: card(`${chat.name}: updated`, done, { chatId: chat.id, isGroup: !!chat.isGroup, to: chat.name }) }
    }
    case "post_status": {
      const r = await invoke(me, [status.postStatus], { body: { text: a.text, background: STATUS_COLORS[a.color] || STATUS_COLORS.indigo } })
      return out(r, { note: "Visible to contacts for 24 hours" }, card("Status posted", [s(a.text, 140), "Visible to your contacts for 24 hours"]))
    }
  }
}

// Run one app tool. Returns { result } for the model and an optional chat card.
export const runAppTool = async (name, rawArgs, ctx) => {
  // "confirmed" only counts when the user's latest message was a yes: the model can't confirm for them
  const args = { ...(rawArgs || {}), confirmed: rawArgs?.confirmed === true && !!ctx.userConfirmed }
  try {
    if (BUSINESS_TOOLS.some((t) => t.function.name === name)) return (await runBusiness(name, args, ctx)) || { result: { error: "Unknown action" } }
    if (SOCIAL_TOOLS.some((t) => t.function.name === name)) return (await runSocial(name, args, ctx)) || { result: { error: "Unknown action" } }
    if (ACCOUNT_TOOLS.some((t) => t.function.name === name)) return (await runAccount(name, args, ctx)) || { result: { error: "Unknown action" } }
    return { result: { error: `Unknown tool ${name}` } }
  } catch (err) {
    console.log(`nexa ${name} error:`, err?.message || err)
    return { result: { error: "Something went wrong doing that. Try again." } }
  }
}
