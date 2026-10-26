import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { uploadSingle } from "../config/cloudinary.js"
import { deleteStatus, getStatusFeed, postStatus, statusViewers, viewStatus } from "../controller/status.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/", getStatusFeed)
router.post("/", uploadSingle("file"), postStatus)
router.put("/:id/view", viewStatus)
router.get("/:id/viewers", statusViewers)
router.delete("/:id", deleteStatus)
export default router
