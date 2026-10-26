import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import {
  googleBriefNow, googleCallback, googleConnect, googleDisconnect, googleSettings, googleSnooze, googleStatus,
} from "../controller/google.controller.js"

const router = express.Router()
// Google redirects here without the login cookie (SameSite=strict): checked with a signed state instead
router.get("/callback", googleCallback)
router.use(secureRoute)
router.get("/status", googleStatus)
router.get("/connect", googleConnect)
router.put("/settings", googleSettings)
router.post("/brief", googleBriefNow)
router.post("/snooze/:messageId", googleSnooze)
router.delete("/", googleDisconnect)
export default router
