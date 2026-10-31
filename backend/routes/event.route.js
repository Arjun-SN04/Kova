import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { cancelEvent, createEvent, listEvents, rsvpEvent } from "../controller/event.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/group/:groupId", listEvents)
router.post("/", createEvent)
router.put("/:id/rsvp", rsvpEvent)
router.delete("/:id", cancelEvent)
export default router
