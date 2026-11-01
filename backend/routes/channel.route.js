import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { uploadAvatarSingle, uploadSingle } from "../config/cloudinary.js"
import {
  myChannels, discoverChannels, handleAvailable, createChannel, getChannel, updateChannel, deleteChannel,
  followChannel, markChannelRead, listPosts, createPost, deletePost, reactToPost,
} from "../controller/channel.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/", myChannels)
router.get("/discover", discoverChannels)
router.get("/handle/:handle", handleAvailable)
router.post("/", createChannel)
router.get("/:id", getChannel)
router.put("/:id", uploadAvatarSingle("avatar"), updateChannel)
router.delete("/:id", deleteChannel)
router.post("/:id/follow", followChannel)
router.delete("/:id/follow", followChannel)
router.put("/:id/read", markChannelRead)
router.get("/:id/posts", listPosts)
router.post("/:id/posts", uploadSingle("file"), createPost)
router.delete("/:id/posts/:postId", deletePost)
router.put("/:id/posts/:postId/react", reactToPost)
export default router
