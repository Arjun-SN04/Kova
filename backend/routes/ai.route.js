import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { uploadSingle } from "../config/cloudinary.js"
import {
  cancelScheduled, catchUp, clearAiMessages, getAiMessages, listScheduled, nexaInfo, remindAboutMessage,
  rewriteText, createAiImage, sendAiMessage, deleteAiMessage, deleteAiFile, keepAiMessage, getAiSettings, setAiSettings, smartReplies, transcribeMessage, translateMessage,
} from "../controller/ai.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/messages", getAiMessages)
router.post("/messages", uploadSingle("file"), sendAiMessage)
router.delete("/messages", clearAiMessages)
router.delete("/messages/:id", deleteAiMessage)
router.delete("/messages/:id/file", deleteAiFile)
router.put("/messages/:id/keep", keepAiMessage)
router.get("/settings", getAiSettings)
router.put("/settings", setAiSettings)
router.post("/messages/:id/image", createAiImage)
router.post("/rewrite", rewriteText)
router.get("/scheduled", listScheduled)
router.delete("/scheduled/:id", cancelScheduled)
router.get("/bot", nexaInfo)
router.post("/smart-replies", smartReplies)
router.post("/catch-up", catchUp)
router.post("/translate/:id", translateMessage)
router.post("/transcribe/:id", transcribeMessage)
router.post("/remind/:id", remindAboutMessage)
export default router
