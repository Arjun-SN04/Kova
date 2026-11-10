import express from "express"
import secureRoute from "../middleware/secureRoute.js"
import { uploadAvatarSingle, uploadSingle } from "../config/cloudinary.js"
import {
  listGroups, createGroup, getGroup, updateGroup, addMembers, removeMember, setAdmin, joinGroup,
  deleteGroup, getGroupMessages, sendGroupMessage, markGroupRead, groupMessageInfo, updateGroupAvatar, listGroupInvites, answerGroupInvite, getInviteLink, removeInviteLink, previewInviteLink, joinByLink, listJoinRequests, answerJoinRequest } from "../controller/group.controller.js"

const router = express.Router()
router.use(secureRoute)
router.get("/", listGroups)
router.get("/invites", listGroupInvites)
router.get("/link/:code", previewInviteLink)
router.post("/link/:code", joinByLink)
router.post("/invites/:id", answerGroupInvite)
router.delete("/invites/:id", answerGroupInvite)
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
router.get("/:id/messages/:messageId/info", groupMessageInfo)
router.get("/:id/link", getInviteLink)
router.post("/:id/link", getInviteLink)
router.delete("/:id/link", removeInviteLink)
router.get("/:id/requests", listJoinRequests)
router.post("/:id/requests/:userId", answerJoinRequest)
router.delete("/:id/requests/:userId", answerJoinRequest)
export default router
