import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { gifStatus, searchGifs } from "../controller/gif.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/status", gifStatus)
router.get("/search", searchGifs)
export default router
