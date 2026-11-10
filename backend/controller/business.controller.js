import mongoose from "mongoose"
import { directFilter } from "../utils/directChat.js"
import User from "../models/user.model.js"
import { BusinessSettings } from "../models/business.model.js"
import { Customer } from "../models/customer.model.js"
import { Message } from "../models/message.model.js"
import { Conversation } from "../models/conversation.model.js"
import { Order } from "../models/order.model.js"
import { Booking } from "../models/booking.model.js"
import { Product } from "../models/product.model.js"
import { Report } from "../models/report.model.js"
import { emitToUsers } from "../utils/notify.js"
import { safeZone, sendNexaMessage } from "../utils/agenda.js"
import { normalizeUsername } from "../utils/username.js"
import { deleteFromCloudinary, uploadToCloudinary } from "../config/cloudinary.js"
import { maskSeen, seenShared } from "../utils/privacy.js"
import { buildSummary, cleanHours, DEFAULT_HOURS, getSettings, hoursState, roleIn, sendAsBusiness, teamOf } from "../utils/business.js"

const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const fail = (res, status, error) => res.status(status).json({ error })
const str = (v, max) => String(v ?? "").trim().slice(0, max)
const isId = (id) => mongoose.isValidObjectId(id)
const PERSON = "fullName username avatar email"

// App admins (approve verified badges, read reports): emails in ADMIN_EMAILS
export const isAppAdmin = (user) =>
  (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(String(user?.email || "").toLowerCase())

// ── Loading the business for a workspace request ───────────────
// /business/:biz/... — the owner or a team member. Sets req.biz = { owner, settings, role }.
export const loadBusiness = (...roles) => async (req, res, next) => {
  try {
    const bizId = req.params.biz === "me" ? req.user._id : req.params.biz
    if (!isId(bizId)) return fail(res, 404, "Business not found")
    const owner = await User.findById(bizId).select("fullName username avatar email business contacts")
    if (!owner?.business?.enabled) return fail(res, 404, "This isn't a business account")
    const settings = await getSettings(owner._id)
    const role = roleIn(req.user._id, owner._id, settings)
    if (!role) return fail(res, 403, "You're not on this business's team")
    if (roles.length && !roles.includes(role)) return fail(res, 403, "You don't have permission to do that")
    req.biz = { owner, settings, role }
    next()
  } catch (error) {
    console.log("loadBusiness error:", error)
    fail(res, 500, "Internal server error")
  }
}

const publicProfile = (owner) => ({
  _id: owner._id,
  fullName: owner.fullName,
  username: owner.username,
  avatar: owner.avatar,
  business: owner.business,
  status: hoursState(owner.business),
})

// ── My business ────────────────────────────────────────────────
// Business profile + the businesses I work for
export const getMyBusiness = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("fullName username avatar business")
    const workFor = await BusinessSettings.find({ "team.user": req.user._id }).populate("owner", "fullName username avatar business")
    // A business that was switched off: shown on the setup page to switch back or delete
    let previous = null
    if (me.business && !me.business.enabled && me.business.category) {
      const [products, orders, bookings, customers, settings] = await Promise.all([
        Product.countDocuments({ business: me._id }),
        Order.countDocuments({ business: me._id }),
        Booking.countDocuments({ business: me._id }),
        Customer.countDocuments({ business: me._id }),
        BusinessSettings.findOne({ owner: me._id }).select("createdAt"),
      ])
      previous = { category: me.business.category, description: me.business.description || "", cover: me.business.cover?.url || null, products, orders, bookings, customers, since: settings?.createdAt || null }
    }
    res.status(200).json({
      business: me.business,
      previous,
      status: hoursState(me.business),
      isAdmin: isAppAdmin(req.user),
      workFor: workFor.filter((s) => s.owner?.business?.enabled).map((s) => ({ ...publicProfile(s.owner), role: roleIn(req.user._id, s.owner._id, s) })),
    })
  } catch (error) {
    console.log("getMyBusiness error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Turn Business on/off and edit the public profile
export const updateProfile = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
    const b = req.body || {}
    const current = me.business?.toObject?.() || me.business || {}
    const website = str(b.website ?? current.website, 200)
    me.business = {
      ...current,
      enabled: b.enabled !== undefined ? !!b.enabled : current.enabled ?? true,
      category: str(b.category ?? current.category, 60),
      description: str(b.description ?? current.description, 300),
      address: str(b.address ?? current.address, 200),
      website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
      email: str(b.email ?? current.email, 120),
      upiId: str(b.upiId ?? current.upiId, 80),
      timeZone: safeZone(b.timeZone || current.timeZone || "UTC"),
      hours: b.hours ? cleanHours(b.hours) : current.hours?.length === 7 ? current.hours : DEFAULT_HOURS,
      verified: !!current.verified,
      verificationRequested: !!current.verificationRequested,
    }
    if (me.business.upiId && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(me.business.upiId)) return fail(res, 400, "That UPI ID doesn't look right (example: meera@okhdfc)")
    if (me.business.email && !/\S+@\S+\.\S+/.test(me.business.email)) return fail(res, 400, "That email doesn't look right")
    await me.save()
    if (me.business.enabled) await getSettings(me._id)
    const update = { _id: String(me._id), business: me.business }
    emitToUsers([me._id, ...(me.contacts || [])], "userUpdated", update)
    res.status(200).json({ business: me.business, status: hoursState(me.business) })
  } catch (error) {
    console.log("updateProfile error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Banner photo for the business page. No file = remove it.
export const updateCover = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
    if (!me.business?.enabled) return fail(res, 400, "Turn on your business account first")
    const old = me.business.cover
    const cover = req.file ? await uploadToCloudinary(req.file, { subfolder: "covers" }) : null
    me.set("business.cover", cover ? { url: cover.url, publicId: cover.publicId } : null)
    await me.save()
    if (old?.publicId) deleteFromCloudinary([{ publicId: old.publicId, resourceType: "image" }])
    emitToUsers([me._id, ...(me.contacts || [])], "userUpdated", { _id: String(me._id), business: me.business })
    res.status(200).json({ business: me.business })
  } catch (error) {
    console.log("updateCover error:", error)
    fail(res, 500, "Couldn't save the cover photo")
  }
}

// Payment QR code (UPI, bank or wallet). No file = remove it.
export const updatePaymentQr = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
    if (!me.business?.enabled) return fail(res, 400, "Turn on your business account first")
    const old = me.business.paymentQr
    const qr = req.file ? await uploadToCloudinary(req.file, { subfolder: "payment-qr" }) : null
    me.set("business.paymentQr", qr ? { url: qr.url, publicId: qr.publicId, label: str(req.body?.label, 40) } : null)
    await me.save()
    if (old?.publicId) deleteFromCloudinary([{ publicId: old.publicId, resourceType: "image" }])
    emitToUsers([me._id, ...(me.contacts || [])], "userUpdated", { _id: String(me._id), business: me.business })
    res.status(200).json({ business: me.business })
  } catch (error) {
    console.log("updatePaymentQr error:", error)
    fail(res, 500, "Couldn't save the QR code")
  }
}

// Delete my (switched-off) business for good: catalog, settings, customer records, cover and QR.
// Orders and bookings stay, because customers keep them in their own history.
export const deleteBusiness = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
    if (!me.business) return res.status(200).json({ deleted: true })
    if (me.business.enabled) return fail(res, 400, "Switch to a personal account first")
    const products = await Product.find({ business: me._id }).select("image")
    const files = [
      ...products.map((p) => p.image).filter((i) => i?.publicId),
      ...(me.business.cover?.publicId ? [me.business.cover] : []),
      ...(me.business.paymentQr?.publicId ? [me.business.paymentQr] : []),
    ].map((f) => ({ publicId: f.publicId, resourceType: "image" }))
    await Promise.all([
      Product.deleteMany({ business: me._id }),
      Customer.deleteMany({ business: me._id }),
      BusinessSettings.deleteOne({ owner: me._id }),
    ])
    me.business = null
    await me.save()
    if (files.length) deleteFromCloudinary(files)
    emitToUsers([me._id, ...(me.contacts || [])], "userUpdated", { _id: String(me._id), business: null })
    res.status(200).json({ deleted: true })
  } catch (error) {
    console.log("deleteBusiness error:", error)
    fail(res, 500, "Couldn't delete the business")
  }
}

export const requestVerification = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
    if (!me.business?.enabled) return fail(res, 400, "Turn on your business account first")
    if (me.business.verified) return res.status(200).json({ business: me.business })
    me.set("business.verificationRequested", true)
    await me.save()
    res.status(200).json({ business: me.business })
  } catch (error) {
    console.log("requestVerification error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Workspace overview and settings ────────────────────────────
const LIST_LIMITS = { quickReplies: 100, templates: 50, labels: 30, faq: 100, services: 30, broadcastLists: 30, coupons: 50 }

export const getOverview = async (req, res) => {
  try {
    const { owner, settings, role } = req.biz
    await settings.populate("team.user", PERSON)
    res.status(200).json({ business: publicProfile(owner), settings, role })
  } catch (error) {
    console.log("getOverview error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Owner and admins change settings. Lists are sent whole (the browser edits a copy).
export const updateSettings = async (req, res) => {
  try {
    const { settings, owner } = req.biz
    const b = req.body || {}
    if (b.greeting) settings.greeting = { on: !!b.greeting.on, text: str(b.greeting.text, 1000) }
    if (b.away) settings.away = { on: !!b.away.on, text: str(b.away.text, 1000) }
    for (const key of ["nexaAutoReply", "leadDetection", "dailySummary"]) if (b[key] !== undefined) settings[key] = !!b[key]
    if (b.unansweredMinutes !== undefined) settings.unansweredMinutes = Math.min(1440, Math.max(0, Math.round(Number(b.unansweredMinutes) || 0)))

    const clean = {
      quickReplies: (x) => ({ shortcut: str(x.shortcut, 30).replace(/^\/+/, "").replace(/\s+/g, "-").toLowerCase(), text: str(x.text, 2000) }),
      templates: (x) => ({ name: str(x.name, 60), text: str(x.text, 2000) }),
      labels: (x) => ({ name: str(x.name, 30), color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : "#6366f1" }),
      faq: (x) => ({ q: str(x.q, 300), a: str(x.a, 1500) }),
      services: (x) => ({ name: str(x.name, 80), minutes: Math.min(480, Math.max(10, Math.round(Number(x.minutes) || 30))), price: Math.max(0, Number(x.price) || 0), description: str(x.description, 300) }),
      broadcastLists: (x) => ({ name: str(x.name, 60), members: (Array.isArray(x.members) ? x.members : []).filter(isId).slice(0, 1000) }),
      coupons: (x) => {
        const kind = x.kind === "flat" ? "flat" : "percent"
        const value = Math.max(0, Number(x.value) || 0)
        const old = settings.coupons.find((c) => isId(x._id) && same(c._id, x._id))
        const expires = x.expiresAt ? new Date(x.expiresAt) : null
        return {
          code: str(x.code, 20).toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
          kind,
          value: kind === "percent" ? Math.min(100, value) : value,
          minTotal: Math.max(0, Number(x.minTotal) || 0),
          maxUses: Math.max(0, Math.round(Number(x.maxUses) || 0)),
          uses: old?.uses || 0,
          expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null,
          active: x.active !== false,
        }
      },
    }
    const required = { quickReplies: "shortcut", templates: "name", labels: "name", faq: "q", services: "name", broadcastLists: "name", coupons: "code" }
    for (const [key, fn] of Object.entries(clean)) {
      if (!Array.isArray(b[key])) continue
      // Keep existing ids so labels on customers keep pointing at the same label
      settings[key] = b[key].slice(0, LIST_LIMITS[key]).map((x) => ({ ...(isId(x?._id) ? { _id: x._id } : {}), ...fn(x || {}) })).filter((x) => x[required[key]])
    }
    const shortcuts = settings.quickReplies.map((q) => q.shortcut)
    if (new Set(shortcuts).size !== shortcuts.length) return fail(res, 400, "Two quick replies use the same shortcut")
    const codes = settings.coupons.map((c) => c.code)
    if (new Set(codes).size !== codes.length) return fail(res, 400, "Two discount codes are the same")
    if (settings.coupons.some((c) => !c.value)) return fail(res, 400, "Give every discount code an amount")
    await settings.save()
    await settings.populate("team.user", PERSON)
    emitToUsers(teamOf(owner._id, settings), "businessSettings", { business: String(owner._id) })
    res.status(200).json({ settings })
  } catch (error) {
    console.log("updateSettings error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Team ───────────────────────────────────────────────────────
export const addTeamMember = async (req, res) => {
  try {
    const { owner, settings } = req.biz
    const username = normalizeUsername(req.body.username)
    const role = req.body.role === "admin" ? "admin" : "agent"
    const person = await User.findOne({ username, isBot: { $ne: true } }).select(PERSON)
    if (!person) return fail(res, 404, `No one goes by @${username}`)
    if (same(person._id, owner._id)) return fail(res, 400, "That's the business itself")
    if (settings.team.length >= 20) return fail(res, 400, "A team can have up to 20 people")
    const existing = settings.team.find((t) => same(t.user, person._id))
    if (existing) existing.role = role
    else settings.team.push({ user: person._id, role })
    await settings.save()
    await settings.populate("team.user", PERSON)
    emitToUsers([person._id], "businessTeam", { business: String(owner._id) })
    emitToUsers(teamOf(owner._id, settings), "businessSettings", { business: String(owner._id) })
    res.status(200).json({ team: settings.team })
  } catch (error) {
    console.log("addTeamMember error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The owner removes someone, or a team member leaves
export const removeTeamMember = async (req, res) => {
  try {
    const { owner, settings, role } = req.biz
    const userId = req.params.userId
    if (role !== "owner" && !same(userId, req.user._id)) return fail(res, 403, "Only the owner can remove people")
    settings.team = settings.team.filter((t) => !same(t.user, userId))
    await settings.save()
    await Customer.updateMany({ business: owner._id, assignedTo: userId }, { $set: { assignedTo: null } })
    await settings.populate("team.user", PERSON)
    emitToUsers([userId], "businessTeam", { business: String(owner._id), removed: true })
    emitToUsers(teamOf(owner._id, settings), "businessSettings", { business: String(owner._id) })
    res.status(200).json({ team: settings.team })
  } catch (error) {
    console.log("removeTeamMember error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Customers and the shared inbox ─────────────────────────────
// Every person who has chatted with the business: record, last message, unread, orders
export const listCustomers = async (req, res) => {
  try {
    const { owner } = req.biz
    // Only people who are customers (they messaged, ordered or booked), never the owner's other chats
    const records = await Customer.find({ business: owner._id }).populate("internalNotes.by", "fullName")
    const ids = records.map((r) => r.customer)
    const conversations = await Conversation.find({ members: owner._id, $and: [{ members: { $in: ids } }] }).select("members")
    const others = await Promise.all(conversations
      .map((c) => String(c.members.find((m) => !same(m, owner._id)) || ""))
      .filter(Boolean)
      .map(async (id) => ({ id, last: (await Message.findOne(directFilter(owner._id, id)).sort({ createdAt: -1 }).select("_id"))?._id || null })))
    // Customers with no chat yet (e.g. booked from the business page) still show up
    for (const r of records) if (!others.some((o) => o.id === String(r.customer))) others.push({ id: String(r.customer), last: null })
    const [users, lasts, unread, orderStats] = await Promise.all([
      User.find({ _id: { $in: ids }, isBot: { $ne: true } }).select(PERSON),
      Message.find({ _id: { $in: others.map((c) => c.last).filter(Boolean) } }).select("message senderId receiverId createdAt attachment.kind card.kind auto sentBy"),
      Message.aggregate([
        { $match: { receiverId: owner._id, senderId: { $in: ids }, seen: false } },
        { $group: { _id: "$senderId", count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { business: owner._id, status: { $ne: "cancelled" } } },
        { $group: { _id: "$customer", orders: { $sum: 1 }, spent: { $sum: "$total" }, lastOrderAt: { $max: "$createdAt" } } },
      ]),
    ])
    const recordBy = new Map(records.map((r) => [String(r.customer), r]))
    const lastBy = new Map(lasts.map((m) => [String(m._id), m]))
    const unreadBy = new Map(unread.map((u) => [String(u._id), u.count]))
    const statsBy = new Map(orderStats.map((s) => [String(s._id), s]))
    const userBy = new Map(users.map((u) => [String(u._id), u]))
    const list = others.filter((c) => userBy.has(c.id)).map((c) => ({
      user: userBy.get(c.id),
      record: recordBy.get(c.id) || null,
      lastMessage: c.last ? lastBy.get(String(c.last)) || null : null,
      unread: unreadBy.get(c.id) || 0,
      orders: statsBy.get(c.id)?.orders || 0,
      spent: statsBy.get(c.id)?.spent || 0,
      lastOrderAt: statsBy.get(c.id)?.lastOrderAt || null,
    }))
    list.sort((a, b) => new Date(b.lastMessage?.createdAt || b.record?.firstAt || 0) - new Date(a.lastMessage?.createdAt || a.record?.firstAt || 0))
    res.status(200).json({ customers: list })
  } catch (error) {
    console.log("listCustomers error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The owner can start a record for any contact; team members only work with existing customers
const recordFor = async (ownerId, customerId, role) => {
  if (!isId(customerId)) return null
  const found = await Customer.findOne({ business: ownerId, customer: customerId })
  if (found || role !== "owner") return found
  const contact = await User.exists({ _id: ownerId, contacts: customerId })
  return contact ? Customer.create({ business: ownerId, customer: customerId }) : null
}

const announceRecord = async (owner, settings, record) => {
  await record.populate("internalNotes.by", "fullName")
  emitToUsers(teamOf(owner._id, settings), "businessCustomer", { business: String(owner._id), record })
  return record
}

// Labels, notes, follow-up, assignment, lead flag
export const updateCustomer = async (req, res) => {
  try {
    const { owner, settings, role } = req.biz
    const record = await recordFor(owner._id, req.params.customerId, role)
    if (!record) return fail(res, 404, "Customer not found")
    const b = req.body || {}
    if (Array.isArray(b.labels)) {
      const valid = new Set(settings.labels.map((l) => String(l._id)))
      record.labels = b.labels.filter((id) => valid.has(String(id)))
    }
    if (b.notes !== undefined) record.notes = str(b.notes, 2000)
    if (b.followUp !== undefined) {
      const at = b.followUp?.at ? new Date(b.followUp.at) : null
      record.followUp = at && !Number.isNaN(at.getTime()) ? { at, note: str(b.followUp.note, 200), done: false } : null
    }
    if (b.assignedTo !== undefined) {
      if (b.assignedTo && !teamOf(owner._id, settings).some((id) => same(id, b.assignedTo))) return fail(res, 400, "That person isn't on the team")
      record.assignedTo = b.assignedTo || null
    }
    if (b.lead !== undefined) record.lead = !!b.lead
    if (b.needsHuman !== undefined) record.needsHuman = !!b.needsHuman
    await record.save()
    res.status(200).json({ record: await announceRecord(owner, settings, record) })
  } catch (error) {
    console.log("updateCustomer error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const addInternalNote = async (req, res) => {
  try {
    const { owner, settings, role } = req.biz
    const text = str(req.body.text, 1000)
    if (!text) return fail(res, 400, "Write a note first")
    const record = await recordFor(owner._id, req.params.customerId, role)
    if (!record) return fail(res, 404, "Customer not found")
    record.internalNotes.push({ by: req.user._id, text, at: new Date() })
    if (record.internalNotes.length > 200) record.internalNotes = record.internalNotes.slice(-200)
    await record.save()
    res.status(200).json({ record: await announceRecord(owner, settings, record) })
  } catch (error) {
    console.log("addInternalNote error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const deleteInternalNote = async (req, res) => {
  try {
    const { owner, settings, role } = req.biz
    const record = await Customer.findOne({ business: owner._id, customer: req.params.customerId })
    const note = record?.internalNotes.id(req.params.noteId)
    if (!note) return fail(res, 404, "Note not found")
    if (role === "agent" && !same(note.by, req.user._id)) return fail(res, 403, "You can only delete your own notes")
    note.deleteOne()
    await record.save()
    res.status(200).json({ record: await announceRecord(owner, settings, record) })
  } catch (error) {
    console.log("deleteInternalNote error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The chat between the business and one customer (for the shared inbox)
// Team members only see chats with customers, not the owner's other chats
const isCustomer = (ownerId, customerId) => isId(customerId) && Customer.exists({ business: ownerId, customer: customerId })

export const getCustomerChat = async (req, res) => {
  try {
    const { owner, role } = req.biz
    if (!(await isCustomer(owner._id, req.params.customerId))) return fail(res, 404, "Customer not found")
    const messages = (await Message.find(directFilter(owner._id, req.params.customerId)).sort({ createdAt: -1 }).limit(150)).reverse()
    // Opening a customer's chat from the inbox counts as reading it
    if (messages.length) {
      const updated = await Message.updateMany({ receiverId: owner._id, senderId: req.params.customerId, seen: false }, { $set: { seen: true } })
      if (updated.modifiedCount && await seenShared(owner._id, req.params.customerId)) emitToUsers([req.params.customerId], "messagesSeen", { by: String(owner._id) })
    }
    const senders = await User.find({ _id: { $in: [...new Set(messages.map((m) => String(m.sentBy || "")).filter(Boolean))] } }).select("fullName")
    const shared = await seenShared(owner._id, req.params.customerId)
    res.status(200).json({ messages: shared ? messages : maskSeen(messages, owner._id), staff: Object.fromEntries(senders.map((u) => [String(u._id), u.fullName])), role })
  } catch (error) {
    console.log("getCustomerChat error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Reply to a customer as the business (any team member)
export const replyToCustomer = async (req, res) => {
  try {
    const { owner } = req.biz
    const text = str(req.body.text, 4000)
    if (!text) return fail(res, 400, "Message cannot be empty")
    if (!(await isCustomer(owner._id, req.params.customerId))) return fail(res, 404, "Customer not found")
    const msg = await sendAsBusiness(owner._id, req.params.customerId, text, { sentBy: same(req.user._id, owner._id) ? null : req.user._id })
    res.status(201).json(msg)
  } catch (error) {
    fail(res, 400, error.message || "Couldn't send that")
  }
}

// ── Broadcasts ─────────────────────────────────────────────────
// One message to many customers, each as a private chat
export const sendBroadcast = async (req, res) => {
  try {
    const { owner, settings } = req.biz
    const text = str(req.body.text, 4000)
    if (!text) return fail(res, 400, "Write a message first")
    let ids = []
    if (req.body.listId) ids = settings.broadcastLists.id(req.body.listId)?.members || []
    else if (req.body.labelId) ids = (await Customer.find({ business: owner._id, labels: req.body.labelId }).select("customer")).map((c) => c.customer)
    else if (Array.isArray(req.body.customerIds)) ids = req.body.customerIds.filter(isId)
    const customers = new Set((await Customer.find({ business: owner._id }).select("customer")).map((c) => String(c.customer)))
    const contacts = new Set((owner.contacts || []).map(String).filter((id) => customers.has(id)))
    const targets = [...new Set(ids.map(String))].filter((id) => contacts.has(id)).slice(0, 1000)
    if (!targets.length) return fail(res, 400, "Nobody to send to. Pick customers who are in your chats.")
    const me = await User.findById(owner._id).select("fullName")
    let sent = 0
    for (const id of targets) {
      const person = await User.findById(id).select("fullName")
      const personal = text.replace(/\{name\}/g, person?.fullName?.split(" ")[0] || "there")
      try { await sendAsBusiness(owner._id, id, personal, { sentBy: same(req.user._id, owner._id) ? null : req.user._id }); sent++ } catch { /* skip */ }
    }
    res.status(200).json({ sent, skipped: ids.length - sent, from: me?.fullName })
  } catch (error) {
    console.log("sendBroadcast error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Insights ───────────────────────────────────────────────────
export const getInsights = async (req, res) => {
  try {
    const { owner } = req.biz
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7))
    const tz = safeZone(owner.business.timeZone || "UTC")
    const since = new Date(Date.now() - days * 86_400_000)
    const customerIds = (await Customer.find({ business: owner._id }).select("customer")).map((c) => c.customer)
    const [messages, newCustomers, orders, bookings, waiting] = await Promise.all([
      Message.find({
        createdAt: { $gte: since },
        groupId: null,
        $or: [{ senderId: owner._id, receiverId: { $in: customerIds } }, { receiverId: owner._id, senderId: { $in: customerIds } }],
      }).select("senderId receiverId createdAt auto").sort({ createdAt: 1 }).limit(20000),
      Customer.countDocuments({ business: owner._id, firstAt: { $gte: since } }),
      Order.find({ business: owner._id, createdAt: { $gte: since } }).select("total status paid createdAt"),
      Booking.countDocuments({ business: owner._id, createdAt: { $gte: since }, status: { $ne: "cancelled" } }),
      Customer.countDocuments({ business: owner._id, waitingSince: { $ne: null } }),
    ])

    // First reply time: from a customer's first unanswered message to the next human reply
    const waitStart = new Map()
    const replyTimes = []
    const hours = Array(24).fill(0)
    const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: tz })
    const series = new Map()
    for (let i = days - 1; i >= 0; i--) series.set(dayKey(Date.now() - i * 86_400_000), { messagesIn: 0, messagesOut: 0, orders: 0, revenue: 0 })
    let messagesIn = 0
    let messagesOut = 0
    for (const m of messages) {
      const fromCustomer = same(m.receiverId, owner._id)
      const key = dayKey(m.createdAt)
      if (fromCustomer) {
        messagesIn++
        hours[Number(new Date(m.createdAt).toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" })) % 24]++
        if (series.has(key)) series.get(key).messagesIn++
        if (!waitStart.has(String(m.senderId))) waitStart.set(String(m.senderId), m.createdAt)
      } else {
        messagesOut++
        if (series.has(key)) series.get(key).messagesOut++
        if (!m.auto || m.auto === "nexa") {
          const started = waitStart.get(String(m.receiverId))
          if (started) { replyTimes.push(m.createdAt - started); waitStart.delete(String(m.receiverId)) }
        }
      }
    }
    const live = orders.filter((o) => o.status !== "cancelled")
    for (const o of live) {
      const s = series.get(dayKey(o.createdAt))
      if (s) { s.orders++; s.revenue += o.total }
    }
    const avgReplyMinutes = replyTimes.length ? Math.round(replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length / 60_000) : null
    res.status(200).json({
      days,
      messagesIn,
      messagesOut,
      newCustomers,
      orders: live.length,
      revenue: live.reduce((n, o) => n + o.total, 0),
      paidRevenue: live.filter((o) => o.paid).reduce((n, o) => n + o.total, 0),
      bookings,
      waiting,
      avgReplyMinutes,
      busiestHours: hours,
      series: [...series.entries()].map(([date, v]) => ({ date, ...v })),
    })
  } catch (error) {
    console.log("getInsights error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Send the daily summary to my Nexa chat now
export const summaryNow = async (req, res) => {
  try {
    const { owner, settings } = req.biz
    await sendNexaMessage(req.user._id, await buildSummary(owner, settings), [], { push: false })
    res.status(200).json({ sent: true })
  } catch (error) {
    console.log("summaryNow error:", error)
    fail(res, 500, "Couldn't build the summary right now")
  }
}

// ── App admin: verification and reports ────────────────────────
const adminOnly = (req, res) => { if (!isAppAdmin(req.user)) { fail(res, 403, "Admins only"); return false } return true }

export const listVerifications = async (req, res) => {
  if (!adminOnly(req, res)) return
  const pending = await User.find({ "business.enabled": true, "business.verificationRequested": true, "business.verified": { $ne: true } }).select("fullName username avatar business email createdAt")
  const reports = await Report.find({ status: "open" }).sort({ createdAt: -1 }).limit(100).populate("reporter target", "fullName username")
  res.status(200).json({ pending, reports })
}

export const decideVerification = async (req, res) => {
  if (!adminOnly(req, res)) return
  const user = await User.findById(req.params.userId)
  if (!user?.business?.enabled) return fail(res, 404, "Business not found")
  user.set("business.verified", !!req.body.approve)
  user.set("business.verificationRequested", false)
  await user.save()
  emitToUsers([user._id, ...(user.contacts || [])], "userUpdated", { _id: String(user._id), business: user.business })
  res.status(200).json({ business: user.business })
}

export const closeReport = async (req, res) => {
  if (!adminOnly(req, res)) return
  await Report.updateOne({ _id: req.params.id }, { $set: { status: "reviewed" } })
  res.status(200).json({ ok: true })
}
