import dns from "node:dns"
import express from "express"
import dotenv from "dotenv"
import mongoose from "mongoose"
import userRoutes from "./routes/user.routes.js"
import cors from "cors"
import cookieParser from "cookie-parser"
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
import { app, server } from "./socket/socket.js"

dotenv.config()

// Use public DNS so the MongoDB Atlas (mongodb+srv) lookup works even if the local router DNS is flaky
dns.setServers(["8.8.8.8", "1.1.1.1"])
const port = process.env.PORT || 3000
const mongo_uri = process.env.MONGODB_URI

mongoose.connect(mongo_uri)
  .then(() => { console.log("Connected to MongoDB"); startScheduler(); startAgenda(); startDisappearing(); startBusiness(); startEvents(); startAccountJobs() })
  .catch((err) => console.log("MongoDB connection error:", err))

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

server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
