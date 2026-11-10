import dns from "node:dns"
import express from "express"
import dotenv from "dotenv"
import mongoose from "mongoose"
import userRoutes from "./routes/user.routes.js"
import cors from "cors"
import cookieParser from "cookie-parser"
import helmet from "helmet"
import messageRoutes from "./routes/message.route.js"
import contactRoutes from "./routes/contact.route.js"
import groupRoutes from "./routes/group.route.js"
import communityRoutes from "./routes/community.route.js"
import callRoutes from "./routes/call.route.js"
import aiRoutes from "./routes/ai.route.js"
import googleRoutes from "./routes/google.route.js"
import pushRoutes from "./routes/push.route.js"
import statusRoutes from "./routes/status.route.js"
import gifRoutes from "./routes/gif.route.js"
import businessRoutes from "./routes/business.route.js"
import taskRoutes from "./routes/task.route.js"
import channelRoutes from "./routes/channel.route.js"
import { startBusiness } from "./utils/business.js"
import { startEvents } from "./controller/event.controller.js"
import eventRoutes from "./routes/event.route.js"
import { startScheduler } from "./utils/scheduler.js"
import { startAgenda } from "./utils/agenda.js"
import { startDisappearing } from "./utils/disappear.js"
import { startAccountJobs } from "./utils/accountData.js"
import { app, io, server } from "./socket/socket.js"
import { checkEncryptionKey } from "./utils/fieldCrypto.js"
import { Message } from "./models/message.model.js"

dotenv.config()

// Optional: set DNS_SERVERS=8.8.8.8,1.1.1.1 when the local router's DNS can't resolve
// MongoDB Atlas (mongodb+srv). Servers use their own DNS when it isn't set.
const dnsServers = String(process.env.DNS_SERVERS || "").split(",").map((s) => s.trim()).filter(Boolean)
if (dnsServers.length) dns.setServers(dnsServers)
const port = process.env.PORT || 3000
const mongo_uri = process.env.MONGODB_URI

// Chats are stored encrypted: without the key nothing can be read or saved, so stop here
try { checkEncryptionKey() } catch (err) { console.error(err.message); process.exit(1) }

// Requests come through Vercel's /api rewrite and then nginx, so the visitor's address is
// two hops back in X-Forwarded-For. Rate limits need it. Override with TRUST_PROXY if that changes.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 2))
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))
app.use(express.json())
app.use(cookieParser())

const allowedOrigins = [
  "http://localhost:5173",
  // FRONTEND_URL can list several sites, comma-separated (e.g. a new and an old Vercel URL)
  ...String(process.env.FRONTEND_URL || "").split(","),
].map((u) => u.trim().replace(/\/$/, "")).filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      callback(new Error("Not allowed by CORS"))
    },
    credentials: true,
  })
);

app.use("/user", userRoutes)
app.use("/message", messageRoutes)
app.use("/contacts", contactRoutes)
app.use("/groups", groupRoutes)
app.use("/communities", communityRoutes)
app.use("/calls", callRoutes)
app.use("/ai", aiRoutes)
app.use("/google", googleRoutes)
app.use("/push", pushRoutes)
app.use("/status", statusRoutes)
app.use("/gifs", gifRoutes)
app.use("/business", businessRoutes)
app.use("/tasks", taskRoutes)
app.use("/events", eventRoutes)
app.use("/channels", channelRoutes)

app.get("/", (req, res) => {
  res.send("Kova API is running")
})

// Start taking requests only once the database is there; without it nothing works
try {
  await mongoose.connect(mongo_uri)
  console.log("Connected to MongoDB")
} catch (err) {
  console.error("MongoDB connection error:", err)
  process.exit(1)
}
// Group calls live in memory: after a restart none are going on any more
Message.updateMany({ "call.status": "ongoing" }, { $set: { "call.status": "ended" } }).catch(() => {})
startScheduler(); startAgenda(); startDisappearing(); startBusiness(); startEvents(); startAccountJobs()

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

// A promise nobody handled: log it instead of crashing a server everyone is using
process.on("unhandledRejection", (err) => console.error("Unhandled promise rejection:", err))
// A thrown error nobody caught leaves the app in an unknown state: log it and restart (Docker restarts us)
process.on("uncaughtException", (err) => { console.error("Uncaught exception:", err); shutdown("uncaughtException", 1) })

// On stop / restart: finish requests in flight and close the database cleanly
let stopping = false
const shutdown = (signal, code = 0) => {
  if (stopping) return
  stopping = true
  console.log(`${signal}: shutting down`)
  setTimeout(() => process.exit(code || 1), 10_000).unref() // don't hang forever
  // Closes the sockets and the HTTP server, then the database
  io.close(() => mongoose.disconnect().finally(() => process.exit(code)))
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
