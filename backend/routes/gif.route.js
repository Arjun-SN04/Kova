import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { uploadSingle } from "../config/cloudinary.js"
import { createSticker, gifStatus, myStickers, removeSticker, saveSticker, searchGifs } from "../controller/gif.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/status", gifStatus)
router.get("/search", searchGifs)
router.get("/stickers", myStickers)
router.post("/stickers", uploadSingle("file"), createSticker)
router.post("/stickers/save", saveSticker)
router.delete("/stickers/:id", removeSticker)
export default router
