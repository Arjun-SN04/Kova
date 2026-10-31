import mongoose from "mongoose"
import { Event } from "../models/event.model.js"
import { Group } from "../models/group.model.js"
import { Message } from "../models/message.model.js"
import User from "../models/user.model.js"
import { emitToUsers } from "../utils/notify.js"
import { deliverText } from "../utils/deliver.js"
import { sendPush } from "../utils/push.js"

// Events in groups: posted as a card; members answer Going / Maybe / Can't go.
// A reminder goes to the group an hour before it starts.

const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const fail = (res, status, error) => res.status(status).json({ error })
const isAdmin = (group, id) => group.admins.some((a) => same(a, id))

const memberGroup = async (groupId, userId) =>
  mongoose.isValidObjectId(groupId) ? Group.findOne({ _id: groupId, members: userId }).select("members admins name announcement adminsOnly") : null

// What the chat card shows (kept small: counts, who's going, and each person's answer)
export const eventCard = async (event) => {
  const goingIds = event.rsvps.filter((r) => r.status === "going").map((r) => r.user)
  const people = await User.find({ _id: { $in: goingIds.slice(0, 6) } }).select("fullName")
  const count = (s) => event.rsvps.filter((r) => r.status === s).length
  return {
    kind: "event",
    eventId: String(event._id),
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    createdBy: String(event.createdBy),
    cancelled: event.cancelled,
    counts: { going: count("going"), maybe: count("maybe"), no: count("no") },
    goingNames: people.map((p) => p.fullName),
    rsvps: Object.fromEntries(event.rsvps.map((r) => [String(r.user), r.status])),
  }
}

const refreshCard = async (event, group) => {
  const msg = await Message.findOne({ "card.kind": "event", "card.eventId": String(event._id) })
  if (!msg) return
  msg.card = await eventCard(event)
  msg.markModified("card")
  await msg.save()
  emitToUsers(group.members, "messageEdited", msg)
}

export const createEvent = async (req, res) => {
  try {
    const group = await memberGroup(req.body.groupId, req.user._id)
    if (!group) return fail(res, 404, "Group not found")
    if ((group.announcement || group.adminsOnly) && !isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can post in this group")
    const title = String(req.body.title || "").trim().slice(0, 120)
    if (!title) return fail(res, 400, "Give the event a name")
    const startsAt = new Date(req.body.startsAt)
    if (Number.isNaN(startsAt.getTime())) return fail(res, 400, "Pick a date and time")
    if (startsAt.getTime() < Date.now() - 60_000) return fail(res, 400, "That time has already passed")
    const event = await Event.create({
      group: group._id,
      title,
      description: String(req.body.description || "").trim().slice(0, 600),
      location: String(req.body.location || "").trim().slice(0, 200),
      startsAt,
      createdBy: req.user._id,
      rsvps: [{ user: req.user._id, status: "going" }],
    })
    const message = await deliverText({ senderId: req.user._id, groupId: group._id, text: `📅 ${title}`, card: await eventCard(event) })
    res.status(201).json({ event, message })
  } catch (error) {
    console.log("createEvent error:", error)
    fail(res, 500, "Internal server error")
  }
}

// { status: "going" | "maybe" | "no" | null } (null clears my answer)
export const rsvpEvent = async (req, res) => {
  try {
    const event = mongoose.isValidObjectId(req.params.id) ? await Event.findById(req.params.id) : null
    const group = event && await memberGroup(event.group, req.user._id)
    if (!group) return fail(res, 404, "Event not found")
    if (event.cancelled) return fail(res, 400, "This event was cancelled")
    const status = ["going", "maybe", "no"].includes(req.body.status) ? req.body.status : null
    event.rsvps = event.rsvps.filter((r) => !same(r.user, req.user._id))
    if (status) event.rsvps.push({ user: req.user._id, status })
    await event.save()
    await refreshCard(event, group)
    res.status(200).json({ ok: true })
  } catch (error) {
    console.log("rsvpEvent error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The person who made it, or a group admin
export const cancelEvent = async (req, res) => {
  try {
    const event = mongoose.isValidObjectId(req.params.id) ? await Event.findById(req.params.id) : null
    const group = event && await memberGroup(event.group, req.user._id)
    if (!group) return fail(res, 404, "Event not found")
    if (!same(event.createdBy, req.user._id) && !isAdmin(group, req.user._id)) return fail(res, 403, "Only the organiser or an admin can cancel it")
    event.cancelled = true
    await event.save()
    await refreshCard(event, group)
    res.status(200).json({ ok: true })
  } catch (error) {
    console.log("cancelEvent error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const listEvents = async (req, res) => {
  try {
    const group = await memberGroup(req.params.groupId, req.user._id)
    if (!group) return fail(res, 404, "Group not found")
    const events = await Event.find({ group: group._id, cancelled: false, startsAt: { $gte: new Date(Date.now() - 3 * 3600_000) } }).sort({ startsAt: 1 }).limit(50)
    res.status(200).json({ events: await Promise.all(events.map(eventCard)) })
  } catch (error) {
    console.log("listEvents error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Every minute: remind groups about events starting within the hour
export const startEvents = () => {
  const tick = async () => {
    try {
      const soon = await Event.find({ cancelled: false, remindedAt: null, startsAt: { $gt: new Date(), $lte: new Date(Date.now() + 60 * 60_000) } }).limit(50)
      for (const event of soon) {
        event.remindedAt = new Date()
        await event.save()
        const group = await Group.findById(event.group).select("members name")
        if (!group) continue
        const mins = Math.max(1, Math.round((event.startsAt - Date.now()) / 60_000))
        const when = mins >= 55 ? "in an hour" : `in ${mins} min`
        await deliverText({ senderId: event.createdBy, groupId: group._id, text: `⏰ Reminder: "${event.title}" starts ${when}${event.location ? ` · ${event.location}` : ""}`, auto: "reminder" }).catch(() => {})
        const attending = event.rsvps.filter((r) => r.status !== "no").map((r) => r.user)
        sendPush(attending, { title: group.name, body: `"${event.title}" starts ${when}`, tag: `event-${event._id}` }, { onlyOffline: false, chatId: group._id }).catch(() => {})
      }
    } catch (err) {
      console.log("event reminders error:", err.message)
    }
  }
  setInterval(tick, 60_000)
}
