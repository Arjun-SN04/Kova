import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { Readable } from "node:stream"
import { ZipArchive } from "archiver"
import User from "../models/user.model.js"
import { Message } from "../models/message.model.js"
import { Conversation } from "../models/conversation.model.js"
import { Group } from "../models/group.model.js"
import { Community } from "../models/community.model.js"
import { Channel, ChannelPost } from "../models/channel.model.js"
import { ContactRequest } from "../models/contactRequest.model.js"
import { Status } from "../models/status.model.js"
import { Call } from "../models/call.model.js"
import { AiMessage } from "../models/aiMessage.model.js"
import { ScheduledMessage } from "../models/scheduledMessage.model.js"
import { PushSubscription } from "../models/pushSubscription.model.js"
import { GoogleAccount } from "../models/googleAccount.model.js"
import { Product } from "../models/product.model.js"
import { Order } from "../models/order.model.js"
import { Booking } from "../models/booking.model.js"
import { Customer } from "../models/customer.model.js"
import { BusinessSettings } from "../models/business.model.js"
import { Task } from "../models/task.model.js"
import { deleteFromCloudinary, fileDownloadUrl } from "../config/cloudinary.js"
import { sendMail } from "./mailer.js"
import { appUrl, deletionScheduledEmail, digestEmail, exportReadyEmail } from "./emailTemplates.js"
import { getReceiverSocketId } from "../socket/socket.js"
import { previewOf } from "./push.js"

const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const DIR = path.join(os.tmpdir(), "kova-exports")
const EXPORT_HOURS = 24
const MAX_MEDIA_BYTES = 500 * 1024 * 1024 // media beyond this is listed, not included
export const DELETE_AFTER_DAYS = 30
export const exportFile = (token) => path.join(DIR, `${token.replace(/[^a-f0-9]/g, "")}.zip`)
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const safeName = (s) => String(s || "chat").replace(/[^\p{L}\p{N} _.-]+/gu, "").trim().slice(0, 60) || "chat"
const dateStr = (d) => new Date(d).toISOString().replace("T", " ").slice(0, 16)

// ── Data export ──────────────────────────────────────────────

// Build a ZIP of everything I have on Kova, then email me a download link
export const buildExport = async (userId) => {
  const token = crypto.randomBytes(24).toString("hex")
  const file = exportFile(token)
  try {
    fs.mkdirSync(DIR, { recursive: true })
    const me = await User.findById(userId).populate("contacts", "fullName username").populate("blocked", "fullName username")
    const zip = new ZipArchive({ zlib: { level: 6 } })
    const out = fs.createWriteStream(file)
    const done = new Promise((resolve, reject) => { out.on("close", resolve); zip.on("error", reject); out.on("error", reject) })
    zip.pipe(out)
    const json = (name, data) => zip.append(JSON.stringify(data, null, 2), { name })

    json("profile.json", {
      fullName: me.fullName, username: me.username, email: me.email, about: me.about, avatar: me.avatar?.url || null,
      createdAt: me.createdAt, privacy: me.privacy,
    })
    json("contacts.json", me.contacts.map((c) => ({ name: c.fullName, username: c.username })))
    json("blocked.json", me.blocked.map((c) => ({ name: c.fullName, username: c.username })))

    // Every chat: messages as JSON and as easy-to-read text, plus the files
    const names = new Map()
    const nameOf = async (id) => {
      const k = String(id)
      if (!names.has(k)) names.set(k, (await User.findById(k).select("fullName"))?.fullName || "Someone")
      return names.get(k)
    }
    let mediaBytes = 0
    const skipped = []
    const addChat = async (folder, title, messages) => {
      const rows = []
      for (const m of messages) {
        rows.push({
          time: m.createdAt, from: same(m.senderId, userId) ? "You" : await nameOf(m.senderId),
          text: m.message || "", transcript: m.transcript || undefined,
          attachment: m.attachment ? { kind: m.attachment.kind, name: m.attachment.name, file: undefined } : undefined,
          location: m.location ? { lat: m.location.lat, lng: m.location.lng } : undefined,
          poll: m.poll ? { question: m.poll.question, options: m.poll.options.map((o) => ({ text: o.text, votes: o.votes.length })) } : undefined,
        })
        const a = m.attachment
        if (a?.url) {
          const fileName = `${new Date(m.createdAt).toISOString().slice(0, 10)}_${String(m._id).slice(-6)}_${safeName(a.name || a.kind)}${path.extname(a.name || "") ? "" : a.kind === "image" ? ".jpg" : a.kind === "video" ? ".mp4" : ""}`
          if (mediaBytes + (a.size || 0) > MAX_MEDIA_BYTES) { skipped.push(`${folder}/${fileName}`); continue }
          try {
            const url = a.resourceType === "raw" ? fileDownloadUrl(a, 60) : a.url
            const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
            if (res.ok) {
              mediaBytes += Number(res.headers.get("content-length")) || a.size || 0
              zip.append(Readable.fromWeb(res.body), { name: `chats/${folder}/media/${fileName}` })
              rows[rows.length - 1].attachment.file = `media/${fileName}`
            }
          } catch { skipped.push(`${folder}/${fileName}`) }
        }
      }
      json(`chats/${folder}/messages.json`, { chat: title, messages: rows })
      zip.append(rows.map((r) => `[${dateStr(r.time)}] ${r.from}: ${r.text || (r.attachment ? `<${r.attachment.kind}${r.attachment.file ? `: ${r.attachment.file}` : ""}>` : r.location ? `<location ${r.location.lat},${r.location.lng}>` : r.poll ? `<poll: ${r.poll.question}>` : "")}${r.transcript ? `\n    (transcript) ${r.transcript}` : ""}`).join("\n"), { name: `chats/${folder}/chat.txt` })
    }

    const visible = { hiddenFor: { $ne: userId } }
    const conversations = await Conversation.find({ members: userId }).select("members")
    for (const c of conversations) {
      const otherId = c.members.find((m) => !same(m, userId)) || userId
      const title = same(otherId, userId) ? "Message yourself" : await nameOf(otherId)
      const msgs = await Message.find({ groupId: null, ...visible, $or: [{ senderId: userId, receiverId: otherId }, { senderId: otherId, receiverId: userId }] }).sort({ createdAt: 1 })
      if (msgs.length) await addChat(`${safeName(title)}_${String(otherId).slice(-4)}`, title, msgs)
    }
    const groups = await Group.find({ members: userId }).select("name")
    for (const g of groups) {
      const msgs = await Message.find({ groupId: g._id, ...visible }).sort({ createdAt: 1 })
      if (msgs.length) await addChat(`group_${safeName(g.name)}_${String(g._id).slice(-4)}`, g.name, msgs)
    }

    const nexa = await AiMessage.find({ user: userId }).sort({ createdAt: 1 }).lean()
    json("nexa.json", nexa.map((m) => ({ time: m.createdAt, role: m.role, text: m.content ?? m.text ?? m.message })))
    const statuses = await Status.find({ user: userId }).lean()
    json("status.json", statuses.map((s) => ({ time: s.createdAt, text: s.text, media: s.media?.url || s.attachment?.url || null })))
    const channels = await Channel.find({ $or: [{ followers: userId }, { admins: userId }] }).select("name handle owner")
    json("channels.json", channels.map((c) => ({ name: c.name, handle: c.handle, role: same(c.owner, userId) ? "owner" : "follower" })))
    const calls = await Call.find({ $or: [{ caller: userId }, { callee: userId }] }).lean()
    json("calls.json", await Promise.all(calls.map(async (c) => ({ time: c.startedAt, type: c.type, status: c.status, duration: c.duration, with: await nameOf(same(c.caller, userId) ? c.callee : c.caller), outgoing: same(c.caller, userId) }))))

    zip.append([
      "Your Kova data",
      `Exported ${dateStr(new Date())} UTC for ${me.fullName} (${me.email}).`,
      "",
      "profile.json, contacts.json, blocked.json  Your account",
      "chats/<chat>/chat.txt                       Each chat as plain text",
      "chats/<chat>/messages.json                  The same, with more detail",
      "chats/<chat>/media/                         Photos, videos, voice notes and files",
      "nexa.json, status.json, channels.json, calls.json",
      skipped.length ? `\nNot included (over the ${size(MAX_MEDIA_BYTES)} media limit or unavailable):\n${skipped.join("\n")}` : "",
    ].join("\n"), { name: "README.txt" })

    await zip.finalize()
    await done
    const bytes = fs.statSync(file).size
    const expiresAt = new Date(Date.now() + EXPORT_HOURS * 3600_000)
    await User.updateOne({ _id: userId }, { $set: { dataExport: { status: "ready", token, size: bytes, requestedAt: me.dataExport?.requestedAt, readyAt: new Date(), expiresAt } } })
    const url = appUrl(`/api/user/export/download/${token}`)
    await sendMail({ to: me.email, ...exportReadyEmail({ name: me.fullName?.split(" ")[0], email: me.email, url, sizeLabel: size(bytes), hours: EXPORT_HOURS }) }).catch((e) => console.log("export mail error:", e.message))
  } catch (error) {
    console.log("buildExport error:", error)
    fs.rm(file, { force: true }, () => {})
    await User.updateOne({ _id: userId }, { $set: { "dataExport.status": "failed" } }).catch(() => {})
  }
}

// ── Account deletion ─────────────────────────────────────────

export const scheduleDeletion = async (user) => {
  const scheduledFor = new Date(Date.now() + DELETE_AFTER_DAYS * 86_400_000)
  await User.updateOne({ _id: user._id }, { $set: { deletion: { requestedAt: new Date(), scheduledFor } } })
  const when = scheduledFor.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  sendMail({ to: user.email, ...deletionScheduledEmail({ name: user.fullName?.split(" ")[0], email: user.email, when }) }).catch((e) => console.log("deletion mail error:", e.message))
  return scheduledFor
}

// Remove a user and everything that's only theirs. Group chats keep other people's messages.
export const purgeUser = async (userId) => {
  const id = userId
  const files = []
  const collect = (docs, pick) => docs.forEach((d) => { const a = pick(d); if (a?.publicId) files.push(a) })

  const me = await User.findById(id).select("avatar")
  if (me?.avatar?.publicId) files.push({ publicId: me.avatar.publicId, resourceType: "image" })

  // Direct chats (both sides) and my group messages
  const direct = await Message.find({ groupId: null, $or: [{ senderId: id }, { receiverId: id }] }).select("attachment")
  collect(direct, (m) => m.attachment)
  await Message.deleteMany({ groupId: null, $or: [{ senderId: id }, { receiverId: id }] })
  const mine = await Message.find({ senderId: id }).select("attachment")
  collect(mine, (m) => m.attachment)
  await Message.deleteMany({ senderId: id })
  await Message.updateMany({ "reactions.userId": id }, { $pull: { reactions: { userId: id } } })
  await Conversation.deleteMany({ members: id })

  // Groups: leave; hand admin to someone else; delete empty groups
  for (const g of await Group.find({ members: id })) {
    g.members = g.members.filter((m) => !same(m, id))
    g.admins = g.admins.filter((m) => !same(m, id))
    if (!g.members.length) {
      collect(await Message.find({ groupId: g._id }).select("attachment"), (m) => m.attachment)
      await Message.deleteMany({ groupId: g._id })
      await g.deleteOne()
      continue
    }
    if (!g.admins.length) g.admins = [g.members[0]]
    g.reads?.delete?.(String(id))
    await g.save()
  }
  await Group.updateMany({}, { $pull: { invites: { user: id }, joinRequests: { user: id } } })
  for (const c of await Community.find({ members: id })) {
    c.members = c.members.filter((m) => !same(m, id))
    c.admins = c.admins.filter((m) => !same(m, id))
    if (!c.admins.length && c.members.length) c.admins = [c.members[0]]
    await c.save()
  }

  // Channels I own go; I leave the rest
  for (const ch of await Channel.find({ owner: id })) {
    collect(await ChannelPost.find({ channelId: ch._id }).select("attachment"), (p) => p.attachment)
    if (ch.avatar?.publicId) files.push({ publicId: ch.avatar.publicId, resourceType: "image" })
    await ChannelPost.deleteMany({ channelId: ch._id })
    await ch.deleteOne()
  }
  await Channel.updateMany({ $or: [{ followers: id }, { admins: id }] }, { $pull: { followers: id, admins: id }, $unset: { [`reads.${id}`]: 1 } })
  for (const ch of await Channel.find({})) { if (ch.followerCount !== ch.followers.length) { ch.followerCount = ch.followers.length; await ch.save() } }
  await ChannelPost.updateMany({ "reactions.userId": id }, { $pull: { reactions: { userId: id } } })

  // Everything else that's mine
  const statuses = await Status.find({ user: id }).lean()
  statuses.forEach((s) => { const a = s.media || s.attachment; if (a?.publicId) files.push(a) })
  await Promise.all([
    Status.deleteMany({ user: id }),
    Status.updateMany({}, { $pull: { viewers: { user: id } } }),
    Call.deleteMany({ $or: [{ caller: id }, { callee: id }] }),
    AiMessage.deleteMany({ user: id }),
    ScheduledMessage.deleteMany({ $or: [{ sender: id }, { receiver: id }] }),
    PushSubscription.deleteMany({ user: id }),
    GoogleAccount.deleteMany({ user: id }),
    ContactRequest.deleteMany({ $or: [{ from: id }, { to: id }] }),
    Product.deleteMany({ business: id }),
    Order.deleteMany({ $or: [{ business: id }, { customer: id }] }),
    Booking.deleteMany({ $or: [{ business: id }, { customer: id }] }),
    Customer.deleteMany({ $or: [{ business: id }, { customer: id }] }),
    BusinessSettings.deleteMany({ owner: id }),
    Task.updateMany({ assignee: id }, { $set: { assignee: null } }),
    User.updateMany({ $or: [{ contacts: id }, { blocked: id }] }, { $pull: { contacts: id, blocked: id } }),
  ])
  await User.deleteOne({ _id: id })
  if (files.length) deleteFromCloudinary(files).catch((e) => console.log("purge files error:", e.message))
}

// ── Daily email digest ───────────────────────────────────────

// Unread messages per chat while I'm away (locked and hidden chats left out)
const unreadFor = async (user) => {
  const skip = new Set([...(user.lockedChats || []), ...(user.hiddenChats || [])].map(String))
  const chats = []
  const direct = await Message.aggregate([
    { $match: { receiverId: user._id, groupId: null, seen: false, senderId: { $ne: user._id }, hiddenFor: { $ne: user._id } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$senderId", count: { $sum: 1 }, last: { $first: "$$ROOT" } } },
  ])
  for (const d of direct) {
    if (skip.has(String(d._id))) continue
    const sender = await User.findById(d._id).select("fullName")
    if (sender) chats.push({ name: sender.fullName, count: d.count, preview: previewOf(d.last), at: d.last.createdAt })
  }
  for (const g of await Group.find({ members: user._id }).select("name reads")) {
    if (skip.has(String(g._id))) continue
    const since = g.reads?.get?.(String(user._id)) || new Date(0)
    const filter = { groupId: g._id, createdAt: { $gt: since }, senderId: { $ne: user._id }, hiddenFor: { $ne: user._id } }
    const count = await Message.countDocuments(filter)
    if (!count) continue
    const last = await Message.findOne(filter).sort({ createdAt: -1 })
    const who = (await User.findById(last.senderId).select("fullName"))?.fullName?.split(" ")[0] || "Someone"
    chats.push({ name: g.name, count, preview: `${who}: ${previewOf(last)}`, at: last.createdAt })
  }
  return chats.sort((a, b) => b.at - a.at)
}

export const sendDigests = async () => {
  const dayAgo = new Date(Date.now() - 86_400_000)
  const awaySince = new Date(Date.now() - 12 * 3600_000)
  const users = await User.find({
    "emailDigest.enabled": true,
    "deletion.scheduledFor": { $exists: false },
    lastSeen: { $ne: null, $lt: awaySince },
    $or: [{ "emailDigest.lastSentAt": null }, { "emailDigest.lastSentAt": { $exists: false } }, { "emailDigest.lastSentAt": { $lt: dayAgo } }],
  }).select("fullName email lockedChats hiddenChats emailDigest").limit(200)
  for (const u of users) {
    if (getReceiverSocketId(String(u._id))) continue // they're online right now
    try {
      const chats = await unreadFor(u)
      const total = chats.reduce((n, c) => n + c.count, 0)
      if (!total) continue
      await sendMail({ to: u.email, ...digestEmail({ name: u.fullName?.split(" ")[0], email: u.email, chats: chats.slice(0, 6), total }) })
      await User.updateOne({ _id: u._id }, { $set: { "emailDigest.lastSentAt": new Date() } })
    } catch (e) { console.log("digest error:", e.message) }
  }
}

// ── Hourly jobs ──────────────────────────────────────────────
const hourly = async () => {
  // Delete accounts whose 30 days are up
  for (const u of await User.find({ "deletion.scheduledFor": { $lte: new Date() } }).select("_id").limit(20)) {
    try { await purgeUser(u._id); console.log("Deleted account", String(u._id)) } catch (e) { console.log("purge error:", e.message) }
  }
  // Remove expired export files
  const expired = await User.find({ "dataExport.expiresAt": { $lte: new Date() }, "dataExport.status": "ready" }).select("dataExport")
  for (const u of expired) {
    fs.rm(exportFile(u.dataExport.token), { force: true }, () => {})
    await User.updateOne({ _id: u._id }, { $set: { "dataExport.status": "expired" } })
  }
  await sendDigests().catch((e) => console.log("digests error:", e.message))
}
export const startAccountJobs = () => {
  setTimeout(() => hourly().catch(() => {}), 60_000)
  setInterval(() => hourly().catch(() => {}), 3600_000)
}
