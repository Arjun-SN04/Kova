import { Status } from "../models/status.model.js"
import User from "../models/user.model.js"
import { deleteFromCloudinary, uploadToCloudinary } from "../config/cloudinary.js"
import { emitToUsers } from "../utils/notify.js"

// Status: 24-hour updates for your contacts
const DAY_MS = 24 * 3600 * 1000
const COLORS = ["#4f46e5", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#0d9488", "#0284c7", "#334155"]
const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const fail = (res, status, error) => res.status(status).json({ error })

const view = (s, me) => ({
  _id: s._id,
  kind: s.kind,
  text: s.text,
  background: s.background,
  media: s.media,
  createdAt: s.createdAt,
  expiresAt: s.expiresAt,
  seen: s.viewers.some((v) => same(v.user, me)),
  // Only the owner sees who viewed
  ...(same(s.user, me) ? { viewCount: s.viewers.length } : {}),
})

// GET /status -> { mine: [...], people: [{ user, statuses, allSeen, latest }] }
export const getStatusFeed = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("contacts")
    const now = new Date()
    const all = await Status.find({ user: { $in: [me._id, ...me.contacts] }, expiresAt: { $gt: now } }).sort({ createdAt: 1 })
    const users = new Map((await User.find({ _id: { $in: me.contacts } }).select("fullName avatar username")).map((u) => [String(u._id), u]))
    const byUser = new Map()
    for (const s of all) {
      if (same(s.user, me._id)) continue
      if (!byUser.has(String(s.user))) byUser.set(String(s.user), [])
      byUser.get(String(s.user)).push(view(s, me._id))
    }
    const people = [...byUser.entries()]
      .filter(([id]) => users.has(id))
      .map(([id, statuses]) => ({ user: users.get(id), statuses, allSeen: statuses.every((s) => s.seen), latest: statuses[statuses.length - 1].createdAt }))
      // Unseen first, then newest
      .sort((a, b) => Number(a.allSeen) - Number(b.allSeen) || new Date(b.latest) - new Date(a.latest))
    res.json({ mine: all.filter((s) => same(s.user, me._id)).map((s) => view(s, me._id)), people })
  } catch (error) {
    console.log("getStatusFeed error:", error)
    fail(res, 500, "Internal server error")
  }
}

// POST /status  (JSON { text, background } or multipart with a photo/video + optional caption)
export const postStatus = async (req, res) => {
  try {
    const text = String(req.body.text || "").trim().slice(0, 700)
    let media = null
    let kind = "text"
    if (req.file) {
      if (!/^(image|video)\//.test(req.file.mimetype)) return fail(res, 400, "Status can be text, a photo or a video")
      const up = await uploadToCloudinary(req.file, { subfolder: "status" })
      kind = up.kind === "video" ? "video" : "image"
      media = { url: up.url, publicId: up.publicId, resourceType: up.resourceType, width: up.width, height: up.height, duration: up.duration }
      if (kind === "video" && up.duration > 60) {
        await deleteFromCloudinary([media])
        return fail(res, 400, "Videos can be up to 60 seconds")
      }
    } else if (!text) {
      return fail(res, 400, "Write something or add a photo")
    }
    const background = COLORS.includes(req.body.background) ? req.body.background : COLORS[0]
    const status = await Status.create({ user: req.user._id, kind, text, background, media, expiresAt: new Date(Date.now() + DAY_MS) })
    const me = await User.findById(req.user._id).select("contacts")
    emitToUsers([me._id, ...me.contacts], "statusUpdated", { userId: String(me._id) })
    res.status(201).json(view(status, req.user._id))
  } catch (error) {
    console.log("postStatus error:", error?.message || error)
    fail(res, 500, "Couldn't post your status")
  }
}

// PUT /status/:id/view — mark as seen (contacts only)
export const viewStatus = async (req, res) => {
  try {
    const status = await Status.findById(req.params.id)
    if (!status || status.expiresAt <= new Date()) return fail(res, 404, "Status not found")
    if (!same(status.user, req.user._id)) {
      const owner = await User.findById(status.user).select("contacts")
      if (!owner?.contacts.some((c) => same(c, req.user._id))) return fail(res, 404, "Status not found")
      await Status.updateOne({ _id: status._id, "viewers.user": { $ne: req.user._id } }, { $push: { viewers: { user: req.user._id, at: new Date() } } })
    }
    res.json({ seen: true })
  } catch (error) {
    console.log("viewStatus error:", error)
    fail(res, 500, "Internal server error")
  }
}

// GET /status/:id/viewers — owner only
export const statusViewers = async (req, res) => {
  try {
    const status = await Status.findOne({ _id: req.params.id, user: req.user._id }).populate("viewers.user", "fullName avatar")
    if (!status) return fail(res, 404, "Status not found")
    res.json({ viewers: status.viewers.filter((v) => v.user).map((v) => ({ user: v.user, at: v.at })).reverse() })
  } catch (error) {
    console.log("statusViewers error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const deleteStatus = async (req, res) => {
  try {
    const status = await Status.findOne({ _id: req.params.id, user: req.user._id })
    if (!status) return fail(res, 404, "Status not found")
    await Status.deleteOne({ _id: status._id })
    if (status.media?.publicId) await deleteFromCloudinary([status.media])
    const me = await User.findById(req.user._id).select("contacts")
    emitToUsers([me._id, ...me.contacts], "statusUpdated", { userId: String(me._id) })
    res.json({ deleted: true })
  } catch (error) {
    console.log("deleteStatus error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Called by the disappearing-messages sweeper
export const sweepStatuses = async () => {
  const due = await Status.find({ expiresAt: { $lte: new Date() } }).limit(200)
  if (!due.length) return
  await deleteFromCloudinary(due.filter((s) => s.media?.publicId).map((s) => s.media))
  await Status.deleteMany({ _id: { $in: due.map((s) => s._id) } })
}
