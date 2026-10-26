import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { uploadAvatarSingle, uploadSingle } from "../config/cloudinary.js"
import {
  listGroups, createGroup, getGroup, updateGroup, addMembers, removeMember, setAdmin, joinGroup,
  deleteGroup, getGroupMessages, sendGroupMessage, markGroupRead, updateGroupAvatar,
} from "../controller/group.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/", listGroups)
router.post("/", createGroup)
router.get("/:id", getGroup)
router.put("/:id", updateGroup)
router.put("/:id/avatar", uploadAvatarSingle("avatar"), updateGroupAvatar)
router.delete("/:id/avatar", updateGroupAvatar)
router.delete("/:id", deleteGroup)
router.post("/:id/members", addMembers)
router.delete("/:id/members/:userId", removeMember)
router.put("/:id/admins/:userId", setAdmin)
router.post("/:id/join", joinGroup)
router.get("/:id/messages", getGroupMessages)
router.post("/:id/messages", uploadSingle("file"), sendGroupMessage)
router.put("/:id/read", markGroupRead)
export default router
