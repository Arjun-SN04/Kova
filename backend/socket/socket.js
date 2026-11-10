import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { Session } from "../models/session.model.js";
import { Group } from "../models/group.model.js";
import { logCall } from "../utils/callLog.js";
import { registerGroupCallHandlers, offerGroupRejoin } from "./groupCalls.js";
import { sendPush } from "../utils/push.js";

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  ...String(process.env.FRONTEND_URL || "").split(","),
].map((u) => u.trim().replace(/\/$/, "")).filter(Boolean)

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── Who is connected ────────────────────────────────────────
// Every tab / device of a user joins the room "user:<id>", so messages reach all of them.
// userId -> Set of socket ids
const userSockets = new Map();
export const roomOf = (userId) => `user:${userId}`;
const isOnline = (userId) => (userSockets.get(String(userId))?.size || 0) > 0;

// Sign-in for the socket: a short-lived token from GET /user/socket-token.
// (The login cookie isn't sent here: the socket talks to the backend domain directly.)
const SOCKET_TOKEN_TTL = "2m";
export const createSocketToken = (userId, sid = null) =>
  jwt.sign({ user_id: String(userId), kind: "socket", ...(sid ? { sid } : {}) }, process.env.token, { expiresIn: SOCKET_TOKEN_TTL });
const sessionRoom = (sid) => `session:${sid}`;

// People who turned off "Activity status": nobody sees them online, and they
// don't see anyone else online either.
const hiddenActivity = new Set();

// Send each person the list of online people they're allowed to see
const broadcastPresence = () => {
  const visible = [...userSockets.keys()].filter((id) => !hiddenActivity.has(id));
  for (const id of userSockets.keys()) {
    io.to(roomOf(id)).emit("getOnlineUsers", hiddenActivity.has(id) ? [id] : visible);
  }
};

// What `viewer` may see about `target`: online now, or when they were last active.
// Hidden when either of them turned off Activity status.
export const presenceOf = (viewer, target) => {
  const v = String(viewer), t = String(target);
  if (hiddenActivity.has(v) || hiddenActivity.has(t)) return { visible: false, online: false };
  return { visible: true, online: isOnline(t) };
};

export const setActivityHidden = (userId, hidden) => {
  if (hidden) hiddenActivity.add(String(userId));
  else hiddenActivity.delete(String(userId));
  broadcastPresence();
};

// Where to send something for a user (all their tabs), or undefined when they're offline.
// Use it as io.to(getReceiverSocketId(id)).emit(...)
export const getReceiverSocketId = (receiverId) => {
  const id = String(receiverId);
  return isOnline(id) ? roomOf(id) : undefined;
};

// Sign a user out of every open tab (after their password was reset), or all but one device
export const disconnectUser = async (userId, { exceptSession = null } = {}) => {
  if (!exceptSession) return io.in(roomOf(userId)).disconnectSockets(true);
  for (const s of await io.in(roomOf(userId)).fetchSockets()) if (s.data.sid !== exceptSession) s.disconnect(true);
};
// One device was signed out (Profile → Devices, or Log out)
export const disconnectSession = (sid) => io.in(sessionRoom(sid)).disconnectSockets(true);

// ── Calls ───────────────────────────────────────────────────
// Who is in (or ringing) a call with whom:
// userId -> { peer, callId, info, sid, away }
// - `info` is shared by both sides: { caller, callee, type, startedAt, answeredAt }
// - `sid` is the tab that's on the call (null while ringing on the callee's side, or while away)
// - `away` is a timer while their tab is gone: the call waits for them to come back
const activeCalls = {};

// How long an answered call waits for someone whose app closed or lost its connection
const CALL_GRACE_MS = 2 * 60_000;

// Save the call to the history once it's over
const record = (info, declined = false) => {
  if (!info || info.logged) return;
  info.logged = true;
  const status = info.answeredAt ? "answered" : declined ? "declined" : "missed";
  logCall({ ...info, status });
};

// To the tab on the call, or every tab while none has picked it up
const toCallTab = (userId, event, data) => {
  const sid = activeCalls[userId]?.sid;
  io.to(sid || roomOf(userId)).emit(event, data);
};

const dropEntry = (userId) => {
  const entry = activeCalls[userId];
  if (entry?.away) clearTimeout(entry.away);
  delete activeCalls[userId];
};

const endCall = (userId, reason = "ended") => {
  const call = activeCalls[userId];
  if (!call) return;
  const peerEntry = activeCalls[call.peer]?.callId === call.callId ? activeCalls[call.peer] : null;
  dropEntry(userId);
  if (peerEntry) dropEntry(call.peer);
  record(call.info);
  // Both sides' tabs, so a "Rejoin" screen or a ringing tab closes too
  io.to(roomOf(call.peer)).to(roomOf(userId)).emit("call:ended", { callId: call.callId, reason });
};

// A one-to-one call becoming a group call: end it quietly (no "call ended" for the other side) and log it
const releaseCall = (userId) => {
  const call = activeCalls[userId];
  if (!call) return;
  dropEntry(userId);
  if (activeCalls[call.peer]?.callId === call.callId) dropEntry(call.peer);
  record(call.info);
};
const oneToOne = { peerOf: (userId) => activeCalls[userId]?.peer, release: releaseCall };

const profileOf = async (id) => {
  const u = await User.findById(id).select("fullName username avatar");
  return u ? { _id: String(u._id), fullName: u.fullName, username: u.username, avatar: u.avatar } : { _id: String(id), fullName: "Someone" };
};

// Everything a tab needs to show "Rejoin" for a call the user dropped out of
const resumeInfo = async (userId) => {
  const entry = activeCalls[userId];
  if (!entry || entry.sid || !entry.info.answeredAt) return null;
  return { callId: entry.callId, type: entry.info.type, peer: await profileOf(entry.peer), startedAt: entry.info.answeredAt.getTime() };
};

// Their tab closed or lost its connection during an answered call: wait for them
const markAway = async (userId) => {
  const entry = activeCalls[userId];
  if (!entry) return;
  entry.sid = null;
  if (entry.away) clearTimeout(entry.away);
  entry.away = setTimeout(() => endCall(userId, "ended"), CALL_GRACE_MS);
  toCallTab(entry.peer, "call:peer-away", { callId: entry.callId });
  // Another open tab of theirs can pick the call back up
  const info = await resumeInfo(userId).catch(() => null);
  if (info) io.to(roomOf(userId)).emit("call:resume", info);
};

const registerCallHandlers = (socket, userId) => {
  const mine = (callId) => activeCalls[userId]?.callId === callId;
  const inCallWith = (peer, callId) => activeCalls[userId]?.peer === peer && mine(callId);

  // Start ringing someone. Only contacts can call each other.
  socket.on("call:invite", async ({ to, callId, type } = {}) => {
    try {
      if (!to || !callId || !["voice", "video"].includes(type)) return;
      to = String(to);
      const reply = (reason) => socket.emit("call:ended", { callId, reason });

      const me = await User.findById(userId).select("fullName username avatar contacts");
      if (!me || !me.contacts.some((c) => c.toString() === to)) return reply("not-allowed");
      const info = { caller: userId, callee: to, type, startedAt: new Date(), answeredAt: null };
      // They'll still see a missed call in the chat
      if (!isOnline(to)) {
        record(info);
        sendPush([to], { title: `Missed ${type} call`, body: `${me.fullName} tried to call you`, tag: `call-${userId}`, urgent: true }).catch(() => {});
        return reply("offline");
      }
      if (activeCalls[to]) { record(info); return reply("busy"); }
      if (activeCalls[userId]) endCall(userId);

      activeCalls[userId] = { peer: to, callId, info, sid: socket.id, away: null };
      activeCalls[to] = { peer: userId, callId, info, sid: null, away: null };
      // Rings on every tab / device they have open
      io.to(roomOf(to)).emit("call:incoming", {
        callId,
        type,
        from: { _id: userId, fullName: me.fullName, username: me.username, avatar: me.avatar },
      });
    } catch (err) {
      console.log("call:invite error:", err.message);
    }
  });

  socket.on("call:accept", ({ to, callId } = {}) => {
    if (!inCallWith(to, callId)) return;
    activeCalls[userId].sid = socket.id;
    activeCalls[userId].info.answeredAt = new Date();
    toCallTab(to, "call:accepted", { callId });
    // My other tabs stop ringing
    socket.to(roomOf(userId)).emit("call:handled", { callId });
  });

  socket.on("call:decline", ({ to, callId } = {}) => {
    if (!inCallWith(to, callId)) return;
    const { info } = activeCalls[userId];
    // Declining while already on another call counts as missed for them
    record(info, !info.answeredAt);
    toCallTab(to, "call:ended", { callId, reason: "declined" });
    dropEntry(userId);
    dropEntry(to);
    socket.to(roomOf(userId)).emit("call:handled", { callId });
  });

  socket.on("call:end", ({ callId, reason } = {}) => {
    if (mine(callId)) endCall(userId, ["no-answer", "cancelled"].includes(reason) ? "missed" : "ended");
  });

  // Back after the app closed or lost its connection: this tab takes the call again.
  // It then sends a fresh offer to the other side.
  socket.on("call:rejoin", ({ callId } = {}) => {
    const entry = activeCalls[userId];
    if (!entry || entry.callId !== callId || !entry.info.answeredAt) {
      return socket.emit("call:ended", { callId, reason: "ended" });
    }
    if (entry.away) { clearTimeout(entry.away); entry.away = null; }
    entry.sid = socket.id;
    socket.to(roomOf(userId)).emit("call:handled", { callId });
    toCallTab(entry.peer, "call:peer-back", { callId });
  });

  // WebRTC offer / answer / ICE candidates, passed straight through
  socket.on("call:signal", ({ to, callId, data } = {}) => {
    if (!inCallWith(to, callId) || activeCalls[userId].sid !== socket.id) return;
    toCallTab(to, "call:signal", { callId, data });
  });

  return () => {
    const entry = activeCalls[userId];
    if (entry?.sid !== socket.id) return;
    // Still ringing: the call can't go on. Answered: give them time to come back.
    if (!entry.info.answeredAt) endCall(userId, "ended");
    else markAway(userId);
  };
};

// Only signed-in users can connect
io.use(async (socket, next) => {
  try {
    const decoded = jwt.verify(String(socket.handshake.auth?.token || ""), process.env.token);
    if (decoded.kind !== "socket") throw new Error("not a socket token");
    const user = await User.findById(decoded.user_id).select("privacy deletion");
    if (!user || user.deletion?.scheduledFor) throw new Error("no such user");
    // The device it came from must still be signed in
    if (decoded.sid && !(await Session.exists({ sid: decoded.sid, user: user._id }))) throw new Error("signed out");
    socket.data.userId = String(user._id);
    socket.data.sid = decoded.sid || null;
    socket.data.activityHidden = user.privacy?.activity === false;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  socket.join(roomOf(userId));
  if (socket.data.sid) socket.join(sessionRoom(socket.data.sid));
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socket.id);
  if (socket.data.activityHidden) hiddenActivity.add(userId);
  else hiddenActivity.delete(userId);
  broadcastPresence();

  // Reopened the app during a call: offer to rejoin it
  resumeInfo(userId).then((info) => info && socket.emit("call:resume", info)).catch(() => {});
  offerGroupRejoin(io, socket, userId).catch(() => {});

  // Typing indicator: relay to the person being typed to, or to everyone in a group
  const relay = (event) => async ({ to, group = false } = {}) => {
    if (!to) return
    if (!group) {
      io.to(roomOf(String(to))).emit(event, { from: userId })
      return
    }
    try {
      const g = await Group.findById(to).select("members")
      if (!g || !g.members.some((m) => m.toString() === userId)) return
      const name = event === "typing" ? (await User.findById(userId).select("fullName"))?.fullName : undefined
      for (const m of g.members) {
        if (m.toString() !== userId) io.to(roomOf(m.toString())).emit(event, { from: to, user: userId, name })
      }
    } catch (err) {
      console.log("group typing error:", err.message)
    }
  }
  socket.on("typing", relay("typing"))
  socket.on("stopTyping", relay("stopTyping"))

  const leaveCall = registerCallHandlers(socket, userId);
  const leaveGroupCalls = registerGroupCallHandlers(io, socket, userId, oneToOne);

  socket.on("disconnect", () => {
    leaveCall();
    leaveGroupCalls();
    const sockets = userSockets.get(userId);
    sockets?.delete(socket.id);
    // Offline only once their last tab is gone
    if (!sockets?.size) {
      userSockets.delete(userId);
      hiddenActivity.delete(userId);
      User.updateOne({ _id: userId }, { $set: { lastSeen: new Date() } }).catch(() => {});
    }
    broadcastPresence();
  });
});

export { app, io, server };
