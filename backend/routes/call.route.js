import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { clearCalls, listCalls } from "../controller/call.controller.js"
import { iceServersFor } from "../utils/iceServers.js"

const router = express.Router()
router.use(secureRoute)
router.get("/", listCalls)
router.delete("/", clearCalls)
// Connection helpers for a call (STUN, and TURN when set up)
router.get("/ice", async (req, res) => {
  res.set("Cache-Control", "no-store")
  res.json(await iceServersFor(req.user._id))
})
export default router
