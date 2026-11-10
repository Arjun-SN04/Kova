import { randomUUID } from "crypto"
import { Group } from "../models/group.model.js"
import User from "../models/user.model.js"
import { sendPush } from "../utils/push.js"
import { roomOf } from "./socket.js"
import { Message } from "../models/message.model.js"
import { emitToUsers } from "../utils/notify.js"

// Group voice/video calls. Every participant connects directly to every other one (a "mesh"),
// so calls are limited to MAX people. The server only rings people and relays connection details.
//
// Two kinds of call share this code, keyed by `groupId`:
// - a group's call (key = the group's id): members can join; anyone in it can ring members who aren't
// - an ad-hoc call (key = "room:<uuid>"): made when someone adds people to a one-to-one call.
//   Only invited people can join; anyone in it can add their own contacts.

export const MAX_GROUP_CALL = 8
// How long a call keeps someone's place after their app closed or lost its connection
const GROUP_GRACE_MS = 2 * 60_000
// key -> { id, type, name, startedBy, startedAt, participants: Set, invited?: Set, profiles: {},
//          sids: { userId: socket id of the tab in the call, or null while away }, away: { userId: timer } }
const calls = {}
const isRoom = (key) => String(key || "").startsWith("room:")

const stateOf = (key) => {
  const c = calls[key]
  return c
    ? { groupId: key, callId: c.id, type: c.type, name: c.name, room: isRoom(key), participants: [...c.participants], startedAt: c.startedAt, profiles: c.profiles }
    : { groupId: key, callId: null, participants: [] }
}

const profileOf = async (id) => {
  const u = await User.findById(id).select("fullName avatar")
  return u ? { _id: String(u._id), fullName: u.fullName, avatar: u.avatar } : { _id: String(id), fullName: "Someone" }
}

// To the tab someone is in the call with (or all their tabs)
const sendIn = (io, c, id, event, data) => io.to(c?.sids?.[String(id)] || roomOf(String(id))).emit(event, data)
const clearAway = (c, id) => { if (c?.away?.[id]) { clearTimeout(c.away[id]); delete c.away[id] } }
// A group call shows in the group's chat: "Voice call · ongoing" with Join, then
// "Group voice call · 12:34" once everyone has left
const postCallMessage = async (key, c) => {
  try {
    const msg = await Message.create({ senderId: c.startedBy, groupId: key, message: `${c.type === "video" ? "Video" : "Voice"} call`, call: { type: c.type, status: "ongoing", callId: c.id }, seen: true })
    c.messageId = msg._id
    const g = await Group.findById(key).select("members")
    if (g) emitToUsers(g.members, "newMessage", msg)
  } catch (err) {
    console.log("group call message error:", err.message)
  }
}
const closeCallMessage = async (key, c) => {
  if (!c.messageId) return
  try {
    const msg = await Message.findById(c.messageId)
    if (!msg) return
    msg.call = { type: c.type, status: "ended", duration: Math.round((Date.now() - c.startedAt) / 1000), callId: c.id }
    await msg.save()
    const g = await Group.findById(key).select("members")
    if (g) emitToUsers(g.members, "messageEdited", msg)
  } catch (err) {
    console.log("group call message error:", err.message)
  }
}

const rejoinInfo = (key) => ({ groupId: key, groupName: calls[key].name, type: calls[key].type, room: isRoom(key) })

// A tab connected: show it which calls are going on in its groups, and offer to rejoin
// a call this user dropped out of
export const offerGroupRejoin = async (io, socket, userId) => {
  const keys = Object.keys(calls)
  if (!keys.length) return
  const groupKeys = keys.filter((k) => !isRoom(k))
  const myGroups = new Set((groupKeys.length ? await Group.find({ _id: { $in: groupKeys }, members: userId }).select("_id") : []).map((g) => String(g._id)))
  for (const key of keys) {
    const c = calls[key]
    if (!c || !(isRoom(key) ? c.invited?.has(userId) : myGroups.has(key))) continue
    socket.emit("gcall:state", stateOf(key))
    if (c.participants.has(userId) && !c.sids[userId]) socket.emit("gcall:rejoin", rejoinInfo(key))
  }
}

// oneToOne: { peerOf(userId), release(userId) } from socket.js, to move a one-to-one call into a room
export const registerGroupCallHandlers = (io, socket, userId, oneToOne) => {
  const sendTo = (id, event, data, key = null) => sendIn(io, key ? calls[key] : null, id, event, data)
  const fail = (key, error) => socket.emit("gcall:error", { groupId: key, error })

  // The group (or ad-hoc call) if I may be in it: { _id, name, members, announcement }
  const loadGroup = async (key) => {
    if (isRoom(key)) {
      const c = calls[key]
      return c?.invited?.has(userId) ? { _id: key, name: c.name, members: [...c.invited], announcement: false } : null
    }
    const g = await Group.findById(key).select("name members announcement admins")
    return g && g.members.some((m) => String(m) === userId) ? g : null
  }
  // Tell everyone who could join whether a call is going on (for the "Join" banner)
  const broadcastState = (g) => { const s = stateOf(String(g._id)); for (const m of g.members) sendTo(m, "gcall:state", s) }

  const ring = async (key, ids, { type, name }) => {
    const me = await profileOf(userId)
    const from = { _id: userId, fullName: me.fullName, avatar: me.avatar }
    for (const m of ids) sendTo(m, "gcall:ringing", { groupId: key, groupName: name, type, from, room: isRoom(key) })
    sendPush(ids, { title: name, body: `${me.fullName || "Someone"} ${isRoom(key) ? "invited you to a" : "started a group"} ${type} call`, tag: `gcall-${key}`, urgent: true }).catch(() => {})
  }

  const leave = async (key) => {
    const c = calls[key]
    if (!c || !c.participants.has(userId)) return
    clearAway(c, userId)
    c.participants.delete(userId)
    delete c.sids[userId]
    for (const p of c.participants) sendTo(p, "gcall:peer-left", { groupId: key, userId }, key)
    const g = await loadGroupFor(key, c)
    if (!c.participants.size && calls[key] === c) {
      delete calls[key]
      if (!isRoom(key)) closeCallMessage(key, c)
    }
    if (g) broadcastState(g)
  }
  // Members to tell about a change (also after the call was deleted)
  const loadGroupFor = async (key, c) => isRoom(key)
    ? { _id: key, members: [...(c.invited || [])] }
    : Group.findById(key).select("members")

  // Start a call (or join the one already going) and ring the others
  socket.on("gcall:start", async ({ groupId, type } = {}) => {
    try {
      if (!["voice", "video"].includes(type) || isRoom(groupId)) return
      const g = await loadGroup(groupId)
      if (!g) return fail(groupId, "You're not in that group")
      if (g.announcement) return fail(groupId, "Calls aren't available in announcement groups")
      const gid = String(g._id)
      if (!calls[gid]) {
        calls[gid] = { id: `${gid}-${Date.now()}`, type, name: g.name, startedBy: userId, startedAt: Date.now(), participants: new Set(), profiles: {}, sids: {}, away: {} }
        postCallMessage(gid, calls[gid])
        await ring(gid, g.members.map(String).filter((m) => m !== userId), { type, name: g.name })
      }
      await join(g)
    } catch (err) {
      console.log("gcall:start error:", err.message)
    }
  })

  const join = async (g) => {
    const gid = String(g._id)
    const c = calls[gid]
    if (!c) return fail(gid, "That call has ended")
    if (!c.participants.has(userId) && c.participants.size >= MAX_GROUP_CALL) return fail(gid, `Calls are limited to ${MAX_GROUP_CALL} people`)
    // The new person calls everyone already there
    const existing = [...c.participants].filter((p) => p !== userId)
    c.participants.add(userId)
    // Joining again from a new tab (after the app closed) takes over my place
    clearAway(c, userId)
    c.sids[userId] = socket.id
    c.profiles[userId] ||= await profileOf(userId)
    socket.emit("gcall:joined", { groupId: gid, callId: c.id, type: c.type, name: c.name, room: isRoom(gid), participants: existing, startedAt: c.startedAt, profiles: c.profiles })
    for (const p of existing) sendTo(p, "gcall:peer-joined", { groupId: gid, userId, profile: c.profiles[userId] }, gid)
    broadcastState(g)
  }

  socket.on("gcall:join", async ({ groupId } = {}) => {
    try {
      const g = await loadGroup(groupId)
      if (g) await join(g)
      else fail(groupId, "That call has ended")
    } catch (err) {
      console.log("gcall:join error:", err.message)
    }
  })

  // Add people to the call I'm in: group members (group call) or my contacts (ad-hoc call)
  socket.on("gcall:add", async ({ groupId, userIds } = {}) => {
    try {
      const key = String(groupId)
      const c = calls[key]
      if (!c?.participants.has(userId)) return
      const wanted = [...new Set((Array.isArray(userIds) ? userIds : []).map(String))].filter((id) => id !== userId && !c.participants.has(id)).slice(0, MAX_GROUP_CALL)
      if (!wanted.length) return
      if (c.participants.size + wanted.length > MAX_GROUP_CALL) return fail(key, `Calls are limited to ${MAX_GROUP_CALL} people`)
      let allowed
      if (isRoom(key)) {
        const me = await User.findById(userId).select("contacts")
        const mine = new Set((me?.contacts || []).map(String))
        allowed = wanted.filter((id) => mine.has(id))
        allowed.forEach((id) => c.invited.add(id))
      } else {
        const g = await Group.findById(key).select("members")
        const members = new Set((g?.members || []).map(String))
        allowed = wanted.filter((id) => members.has(id))
      }
      if (!allowed.length) return fail(key, "You can only add your contacts")
      await ring(key, allowed, { type: c.type, name: c.name })
      socket.emit("gcall:added", { groupId: key, userIds: allowed })
      if (isRoom(key)) broadcastState({ _id: key, members: [...c.invited] })
    } catch (err) {
      console.log("gcall:add error:", err.message)
    }
  })

  // Adding people to a one-to-one call: both of us move into a new ad-hoc call, and the new people are rung
  socket.on("gcall:upgrade", async ({ peerId, type, userIds } = {}) => {
    try {
      const peer = String(peerId || "")
      if (!["voice", "video"].includes(type) || !peer || oneToOne?.peerOf(userId) !== peer) return fail(null, "That call has ended")
      const me = await User.findById(userId).select("contacts fullName")
      const mine = new Set((me?.contacts || []).map(String))
      const added = [...new Set((Array.isArray(userIds) ? userIds : []).map(String))].filter((id) => id !== userId && id !== peer && mine.has(id)).slice(0, MAX_GROUP_CALL - 2)
      if (!added.length) return fail(null, "Pick at least one contact to add")
      const key = `room:${randomUUID()}`
      const people = await Promise.all([userId, peer, ...added].map(profileOf))
      const name = people.map((p) => p.fullName?.split(" ")[0]).filter(Boolean).slice(0, 3).join(", ") + (people.length > 3 ? ` +${people.length - 3}` : "")
      calls[key] = { id: `${key}-${Date.now()}`, type, name, startedBy: userId, startedAt: Date.now(), participants: new Set(), invited: new Set([userId, peer, ...added]), profiles: {}, sids: {}, away: {} }
      // The one-to-one call ends quietly (it's logged); both sides switch to the new call
      oneToOne.release(userId)
      socket.emit("gcall:moved", { groupId: key, groupName: name, type })
      sendTo(peer, "gcall:moved", { groupId: key, groupName: name, type })
      await ring(key, added, { type, name })
    } catch (err) {
      console.log("gcall:upgrade error:", err.message)
    }
  })

  // Connection details between two people in the same call
  socket.on("gcall:signal", ({ groupId, to, data } = {}) => {
    const c = calls[String(groupId)]
    if (!c || !c.participants.has(userId) || !c.participants.has(String(to))) return
    sendTo(to, "gcall:signal", { groupId: String(groupId), from: userId, data }, String(groupId))
  })

  // Mute / camera / screen-share changes, shown on my tile for everyone
  socket.on("gcall:media", ({ groupId, muted, cameraOff, sharing } = {}) => {
    const c = calls[String(groupId)]
    if (!c?.participants.has(userId)) return
    for (const p of c.participants) if (p !== userId) sendTo(p, "gcall:media", { groupId: String(groupId), userId, muted: !!muted, cameraOff: !!cameraOff, sharing: !!sharing }, String(groupId))
  })

  socket.on("gcall:leave", ({ groupId } = {}) => { leave(String(groupId)).catch(() => {}) })

  // Same tab back after a short connection drop, with its calls still working: keep my place
  socket.on("gcall:resume", ({ groupId } = {}) => {
    const key = String(groupId)
    const c = calls[key]
    if (!c?.participants.has(userId)) return fail(key, "That call has ended")
    clearAway(c, userId)
    c.sids[userId] = socket.id
    for (const p of c.participants) if (p !== userId) sendTo(p, "gcall:peer-back", { groupId: key, userId }, key)
  })

  socket.on("gcall:query", async ({ groupId } = {}) => {
    if (await loadGroup(groupId).catch(() => null)) socket.emit("gcall:state", stateOf(String(groupId)))
  })

  // This tab closed or lost its connection: keep my place for a while, so I can rejoin
  return () => {
    for (const gid of Object.keys(calls)) {
      const c = calls[gid]
      if (!c?.participants.has(userId) || c.sids[userId] !== socket.id) continue
      c.sids[userId] = null
      clearAway(c, userId)
      c.away[userId] = setTimeout(() => leave(gid).catch(() => {}), GROUP_GRACE_MS)
      for (const p of c.participants) if (p !== userId) sendTo(p, "gcall:peer-away", { groupId: gid, userId }, gid)
      // Another open tab of mine can take it
      io.to(roomOf(userId)).emit("gcall:rejoin", rejoinInfo(gid))
    }
  }
}
