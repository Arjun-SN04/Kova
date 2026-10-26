import express from "express"
import { getMessage, sendMessage, deleteMessage, editMessage, deleteConversation, markSeen, getConversations, deleteMessages, forwardMessages, reactToMessage } from "../controller/message.controller.js"
import secureRoute from "../middleware/secureRoute.js"
import { closePoll, createPoll, getChatTimer, getPrefs, keepMessage, listStarred, pinChat, pinMessage, setChatTimer, starMessage, votePoll } from "../controller/messageExtras.controller.js"
import { uploadSingle } from "../config/cloudinary.js"

const router = express.Router()
router.post("/send/:id", secureRoute, uploadSingle("file"), sendMessage)
router.get("/get/:id", secureRoute, getMessage)
router.delete("/delete/:messageId", secureRoute, deleteMessage)
router.put("/edit/:messageId", secureRoute, editMessage)
router.delete("/conversation/:id", secureRoute, deleteConversation)
router.get("/conversations", secureRoute, getConversations)
router.put("/seen/:id", secureRoute, markSeen)
router.post("/delete-many", secureRoute, deleteMessages)
router.post("/forward", secureRoute, forwardMessages)
router.put("/react/:messageId", secureRoute, reactToMessage)
router.put("/pin/:messageId", secureRoute, pinMessage)
router.put("/star/:messageId", secureRoute, starMessage)
router.get("/starred", secureRoute, listStarred)
router.post("/poll", secureRoute, createPoll)
router.put("/vote/:messageId", secureRoute, votePoll)
router.put("/poll/:messageId/close", secureRoute, closePoll)
router.get("/prefs", secureRoute, getPrefs)
router.put("/pin-chat/:chatId", secureRoute, pinChat)
router.get("/disappear/:chatId", secureRoute, getChatTimer)
router.put("/disappear/:chatId", secureRoute, setChatTimer)
router.put("/keep/:messageId", secureRoute, keepMessage)
export default router
