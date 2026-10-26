import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { pushKey, subscribe, testPush, unsubscribe } from "../controller/push.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/key", pushKey)
router.post("/subscribe", subscribe)
router.delete("/subscribe", unsubscribe)
router.post("/test", testPush)
export default router
