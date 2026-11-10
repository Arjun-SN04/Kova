import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { aiLimit } from "../middleware/rateLimit.js"
import { uploadSingle } from "../config/cloudinary.js"
import {
  cancelScheduled, catchUp, clearAiMessages, getAiMessages, listScheduled, nexaInfo, remindAboutMessage,
  rewriteText, createAiImage, dictate, sendAiMessage, deleteAiMessage, deleteAiFile, speakMessage, keepAiMessage, getAiSettings, setAiSettings, setImageModel, smartReplies, transcribeMessage, translateMessage,
} from "../controller/ai.controller.js"

const router = express.Router()
router.use(secureRoute, aiLimit)
router.get("/messages", getAiMessages)
router.post("/messages", uploadSingle("file"), sendAiMessage)
router.delete("/messages", clearAiMessages)
router.delete("/messages/:id", deleteAiMessage)
router.delete("/messages/:id/file", deleteAiFile)
router.put("/messages/:id/keep", keepAiMessage)
router.get("/settings", getAiSettings)
router.put("/settings", setAiSettings)
router.put("/settings/image-model", setImageModel)
router.post("/messages/:id/image", createAiImage)
router.post("/rewrite", rewriteText)
router.post("/dictate", uploadSingle("audio"), dictate)
router.post("/speak", speakMessage)
router.get("/scheduled", listScheduled)
router.delete("/scheduled/:id", cancelScheduled)
router.get("/bot", nexaInfo)
router.post("/smart-replies", smartReplies)
router.post("/catch-up", catchUp)
router.post("/translate/:id", translateMessage)
router.post("/transcribe/:id", transcribeMessage)
router.post("/remind/:id", remindAboutMessage)
export default router
