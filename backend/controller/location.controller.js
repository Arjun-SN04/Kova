import { Message } from "../models/message.model.js"
import { deliverText } from "../utils/deliver.js"
import { notifyAudience } from "./message.controller.js"

// Share a location in a chat: once, or live for 15 minutes / 1 hour / 8 hours.
const DURATIONS = [0, 15, 60, 480] // minutes; 0 = just the current spot
const fail = (res, status, error) => res.status(status).json({ error })
const coords = (b) => {
  const lat = Number(b.lat), lng = Number(b.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, accuracy: Math.min(Math.max(Number(b.accuracy) || 0, 0), 100000) }
}

export const shareLocation = async (req, res) => {
  try {
    const c = coords(req.body)
    if (!c) return fail(res, 400, "That location isn't valid")
    const minutes = Number(req.body.minutes) || 0
    if (!DURATIONS.includes(minutes)) return fail(res, 400, "Pick 15 minutes, 1 hour or 8 hours")
    const live = minutes > 0
    const location = { ...c, live, until: live ? new Date(Date.now() + minutes * 60_000) : null, stopped: false, updatedAt: new Date() }
    const chatId = String(req.body.chatId || "")
    const msg = await deliverText({
      senderId: req.user._id,
      receiverId: req.body.isGroup ? null : chatId,
      groupId: req.body.isGroup ? chatId : null,
      text: live ? "📍 Live location" : "📍 Location",
      location,
    })
    res.status(201).json(msg)
  } catch (error) {
    res.status(403).json({ error: error.message || "Couldn't share your location" })
  }
}

// Load a live location I'm sharing, if it's still running
const loadMine = async (req, res) => {
  const msg = await Message.findById(req.params.messageId)
  if (!msg?.location?.live) { fail(res, 404, "Live location not found"); return null }
  if (String(msg.senderId) !== String(req.user._id)) { fail(res, 403, "Only the person sharing can change this"); return null }
  return msg
}
const tell = (msg) => notifyAudience(msg, "locationUpdated", { messageId: String(msg._id), location: msg.location })

export const updateLocation = async (req, res) => {
  try {
    const msg = await loadMine(req, res)
    if (!msg) return
    const loc = msg.location
    if (loc.stopped || loc.until < new Date()) return fail(res, 410, "This live location has ended")
    if (loc.updatedAt && Date.now() - loc.updatedAt.getTime() < 4000) return res.json({ ok: true }) // too soon
    const c = coords(req.body)
    if (!c) return fail(res, 400, "That location isn't valid")
    msg.location = { ...loc.toObject?.() ?? loc, ...c, updatedAt: new Date() }
    await msg.save()
    await tell(msg)
    res.json({ ok: true, until: msg.location.until })
  } catch (error) {
    console.log("updateLocation error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const stopLocation = async (req, res) => {
  try {
    const msg = await loadMine(req, res)
    if (!msg) return
    msg.location = { ...msg.location.toObject?.() ?? msg.location, stopped: true, updatedAt: new Date() }
    msg.message = "📍 Live location (ended)"
    await msg.save()
    await tell(msg)
    res.json({ ok: true })
  } catch (error) {
    console.log("stopLocation error:", error)
    fail(res, 500, "Internal server error")
  }
}
