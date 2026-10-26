import { Server } from "socket.io";
import http from "http";
import express from "express";
import User from "../models/user.model.js";
import { Group } from "../models/group.model.js";
import { logCall } from "../utils/callLog.js";
import { registerGroupCallHandlers } from "./groupCalls.js";
import { sendPush } from "../utils/push.js";

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean)

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// userId -> socketId mapping
const userSocketMap = {};

export const getReceiverSocketId = (receiverId) => {
  return userSocketMap[receiverId.toString()];
};

// ── Calls ───────────────────────────────────────────────────
// Who is in (or ringing) a call with whom: userId -> { peer, callId, info }
// `info` is shared by both sides: { caller, callee, type, startedAt, answeredAt }
const activeCalls = {};

// Save the call to the history once it's over
const record = (info, declined = false) => {
  if (!info || info.logged) return;
  info.logged = true;
  const status = info.answeredAt ? "answered" : declined ? "declined" : "missed";
  logCall({ ...info, status });
};

const endCall = (userId, reason = "ended") => {
  const call = activeCalls[userId];
  if (!call) return;
  delete activeCalls[userId];
  if (activeCalls[call.peer]?.callId === call.callId) delete activeCalls[call.peer];
  record(call.info);
  const peerSocket = userSocketMap[call.peer];
  if (peerSocket) io.to(peerSocket).emit("call:ended", { callId: call.callId, reason });
};

const registerCallHandlers = (socket, userId) => {
  const inCallWith = (peer, callId) =>
    activeCalls[userId]?.peer === peer && activeCalls[userId]?.callId === callId;
  const sendTo = (peer, event, data) => {
    const target = userSocketMap[peer];
    if (target) io.to(target).emit(event, data);
  };

  // Start ringing someone. Only contacts can call each other.
  socket.on("call:invite", async ({ to, callId, type } = {}) => {
    try {
      if (!to || !callId || !["voice", "video"].includes(type)) return;
      const reply = (reason) => socket.emit("call:ended", { callId, reason });

      const me = await User.findById(userId).select("fullName username avatar contacts");
      if (!me || !me.contacts.some((c) => c.toString() === to)) return reply("not-allowed");
      const info = { caller: userId, callee: to, type, startedAt: new Date(), answeredAt: null };
      // They'll still see a missed call in the chat
      if (!userSocketMap[to]) {
        record(info);
        sendPush([to], { title: `Missed ${type} call`, body: `${me.fullName} tried to call you`, tag: `call-${userId}`, urgent: true }).catch(() => {});
        return reply("offline");
      }
      if (activeCalls[to]) { record(info); return reply("busy"); }
      if (activeCalls[userId]) endCall(userId);

      activeCalls[userId] = { peer: to, callId, info };
      activeCalls[to] = { peer: userId, callId, info };
      sendTo(to, "call:incoming", {
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
    activeCalls[userId].info.answeredAt = new Date();
    sendTo(to, "call:accepted", { callId });
  });

  socket.on("call:decline", ({ to, callId } = {}) => {
    if (!inCallWith(to, callId)) return;
    const { info } = activeCalls[userId];
    delete activeCalls[userId];
    delete activeCalls[to];
    // Declining while already on another call counts as missed for them
    record(info, !info.answeredAt);
    sendTo(to, "call:ended", { callId, reason: "declined" });
  });

  socket.on("call:end", ({ callId, reason } = {}) => {
    if (activeCalls[userId]?.callId === callId) endCall(userId, ["no-answer", "cancelled"].includes(reason) ? "missed" : "ended");
  });

  // WebRTC offer / answer / ICE candidates, passed straight through
  socket.on("call:signal", ({ to, callId, data } = {}) => {
    if (inCallWith(to, callId)) sendTo(to, "call:signal", { callId, data });
  });
};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId && userId !== "undefined") {
    userSocketMap[userId] = socket.id;
    console.log(`✅ User connected | userId: ${userId} | socketId: ${socket.id}`);
  }

  // Broadcast updated online users to everyone
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Typing indicator: relay to the person being typed to, or to everyone in a group
  const relay = (event) => async ({ to, group = false } = {}) => {
    if (!to || !userId) return
    if (!group) {
      const targetSocketId = userSocketMap[to]
      if (targetSocketId) io.to(targetSocketId).emit(event, { from: userId })
      return
    }
    try {
      const g = await Group.findById(to).select("members")
      if (!g || !g.members.some((m) => m.toString() === userId)) return
      const name = event === "typing" ? (await User.findById(userId).select("fullName"))?.fullName : undefined
      for (const m of g.members) {
        const sid = m.toString() !== userId && userSocketMap[m.toString()]
        if (sid) io.to(sid).emit(event, { from: to, user: userId, name })
      }
    } catch (err) {
      console.log("group typing error:", err.message)
    }
  }
  socket.on("typing", relay("typing"))
  socket.on("stopTyping", relay("stopTyping"))

  if (userId && userId !== "undefined") registerCallHandlers(socket, userId)
  const leaveGroupCalls = userId && userId !== "undefined" ? registerGroupCallHandlers(io, socket, userId, userSocketMap) : () => {}

  socket.on("disconnect", () => {
    if (userId && userSocketMap[userId] === socket.id) {
      endCall(userId, "ended");
      leaveGroupCalls();
      delete userSocketMap[userId];
      console.log(`❌ User disconnected | userId: ${userId}`);
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { app, io, server };
