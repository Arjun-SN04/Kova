import { Group } from "../models/group.model.js"
import User from "../models/user.model.js"
import { sendPush } from "../utils/push.js"

// Group voice/video calls. Every participant connects directly to every other one (a "mesh"),
// so calls are limited to MAX people. The server only rings members and relays connection details.

export const MAX_GROUP_CALL = 8
const calls = {} // groupId -> { id, type, startedBy, startedAt, participants: Set<userId> }

const stateOf = (groupId) => {
  const c = calls[groupId]
  return c ? { groupId, callId: c.id, type: c.type, participants: [...c.participants], startedAt: c.startedAt } : { groupId, callId: null, participants: [] }
}

export const registerGroupCallHandlers = (io, socket, userId, userSocketMap) => {
  const sendTo = (id, event, data) => { const sid = userSocketMap[String(id)]; if (sid) io.to(sid).emit(event, data) }
  const loadGroup = async (groupId) => {
    const g = await Group.findById(groupId).select("name members announcement admins")
    return g && g.members.some((m) => String(m) === userId) ? g : null
  }
  // Tell every member whether a call is going on (for the "Join" banner)
  const broadcastState = (g) => { const s = stateOf(String(g._id)); for (const m of g.members) sendTo(m, "gcall:state", s) }

  const leave = async (groupId) => {
    const c = calls[groupId]
    if (!c || !c.participants.has(userId)) return
    c.participants.delete(userId)
    for (const p of c.participants) sendTo(p, "gcall:peer-left", { groupId, userId })
    if (!c.participants.size) delete calls[groupId]
    const g = await Group.findById(groupId).select("members")
    if (g) broadcastState(g)
  }

  // Start a call (or join the one already going) and ring the others
  socket.on("gcall:start", async ({ groupId, type } = {}) => {
    try {
      if (!["voice", "video"].includes(type)) return
      const g = await loadGroup(groupId)
      if (!g) return socket.emit("gcall:error", { groupId, error: "You're not in that group" })
      if (g.announcement) return socket.emit("gcall:error", { groupId, error: "Calls aren't available in announcement groups" })
      const gid = String(g._id)
      if (!calls[gid]) {
        calls[gid] = { id: `${gid}-${Date.now()}`, type, startedBy: userId, startedAt: Date.now(), participants: new Set() }
        const me = await User.findById(userId).select("fullName avatar")
        const others = g.members.map(String).filter((m) => m !== userId)
        for (const m of others) sendTo(m, "gcall:ringing", { groupId: gid, groupName: g.name, type, from: { _id: userId, fullName: me?.fullName, avatar: me?.avatar } })
        sendPush(others, { title: g.name, body: `${me?.fullName || "Someone"} started a group ${type} call`, tag: `gcall-${gid}`, urgent: true }).catch(() => {})
      }
      await join(g)
    } catch (err) {
      console.log("gcall:start error:", err.message)
    }
  })

  const join = async (g) => {
    const gid = String(g._id)
    const c = calls[gid]
    if (!c) return socket.emit("gcall:error", { groupId: gid, error: "That call has ended" })
    if (!c.participants.has(userId) && c.participants.size >= MAX_GROUP_CALL) return socket.emit("gcall:error", { groupId: gid, error: `Group calls are limited to ${MAX_GROUP_CALL} people` })
    // The new person calls everyone already there
    const existing = [...c.participants].filter((p) => p !== userId)
    c.participants.add(userId)
    socket.emit("gcall:joined", { groupId: gid, callId: c.id, type: c.type, participants: existing, startedAt: c.startedAt })
    for (const p of existing) sendTo(p, "gcall:peer-joined", { groupId: gid, userId })
    broadcastState(g)
  }

  socket.on("gcall:join", async ({ groupId } = {}) => {
    try {
      const g = await loadGroup(groupId)
      if (g) await join(g)
    } catch (err) {
      console.log("gcall:join error:", err.message)
    }
  })

  // Connection details between two people in the same call
  socket.on("gcall:signal", ({ groupId, to, data } = {}) => {
    const c = calls[String(groupId)]
    if (!c || !c.participants.has(userId) || !c.participants.has(String(to))) return
    sendTo(to, "gcall:signal", { groupId: String(groupId), from: userId, data })
  })

  socket.on("gcall:leave", ({ groupId } = {}) => { leave(String(groupId)).catch(() => {}) })

  socket.on("gcall:query", async ({ groupId } = {}) => {
    if (await loadGroup(groupId).catch(() => null)) socket.emit("gcall:state", stateOf(String(groupId)))
  })

  // Leave any group call when this tab disconnects
  return () => { for (const gid of Object.keys(calls)) if (calls[gid]?.participants.has(userId)) leave(gid).catch(() => {}) }
}
