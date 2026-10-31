import crypto from "node:crypto"
import { Group } from "../models/group.model.js"
import { Community } from "../models/community.model.js"
import { Message } from "../models/message.model.js"
import User from "../models/user.model.js"
import { deleteFromCloudinary, uploadToCloudinary } from "../config/cloudinary.js"
import { emitToUsers } from "../utils/notify.js"
import { releaseAttachments } from "./message.controller.js"
import { answerMention } from "../utils/nexaGroup.js"
import { previewOf, sendPush } from "../utils/push.js"

export const MEMBER_FIELDS = "fullName username avatar"
const MAX_MEMBERS = 256

const safeZone = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz } catch { return "UTC" } }
const sameId = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const has = (list, id) => list.some((x) => sameId(x, id))
const fail = (res, status, error) => res.status(status).json({ error })

// People who want to approve group adds get an invite instead
const splitByApproval = async (ids) => {
  const approve = new Set((await User.find({ _id: { $in: ids }, "privacy.groups": "approve" }).select("_id")).map((u) => String(u._id)))
  return { direct: ids.filter((id) => !approve.has(String(id))), invited: ids.filter((id) => approve.has(String(id))) }
}
const sendInvites = async (group, ids, by) => {
  if (!ids.length) return
  const fresh = ids.filter((id) => !group.invites.some((i) => sameId(i.user, id)))
  group.invites.push(...fresh.map((user) => ({ user, by: by._id, at: new Date() })))
  await group.save()
  emitToUsers(fresh, "groupInvite", { group: String(group._id) })
  sendPush(fresh, { title: "Group invite", body: `${by.fullName} invited you to ${group.name}`, tag: `ginvite-${group._id}` }).catch(() => {})
}

const populate = (query) => query.populate("members", MEMBER_FIELDS).populate("community", "name")

// What the browser gets for a group (no per-user data, so it can be broadcast)
export const groupView = (g) => ({
  _id: g._id,
  isGroup: true,
  name: g.name,
  fullName: g.name, // lets shared UI (headers, search) treat groups like people
  description: g.description,
  members: g.members,
  admins: g.admins,
  createdBy: g.createdBy,
  pendingInvites: g.invites?.length || 0,
  community: g.community ? { _id: g.community._id ?? g.community, name: g.community.name } : null,
  announcement: g.announcement,
  adminsOnly: !!g.adminsOnly,
  approveJoins: !!g.approveJoins,
  joinRequestCount: g.joinRequests?.length || 0,
  avatar: g.avatar || null,
  disappearAfter: g.disappearAfter || 0,
  createdAt: g.createdAt,
})

// Send the latest group to all its members
export const broadcastGroup = async (groupId) => {
  const g = await populate(Group.findById(groupId))
  if (g) emitToUsers(g.members, "groupUpdated", groupView(g))
  return g
}

const markRead = (groupId, userIds) =>
  Group.updateOne({ _id: groupId }, { $set: Object.fromEntries(userIds.map((id) => [`reads.${id}`, new Date()])) })

// Delete a group and its messages (and their files), and tell its members
export const destroyGroup = async (group) => {
  const withFiles = await Message.find({ groupId: group._id, attachment: { $ne: null } }).select("attachment")
  await Message.deleteMany({ groupId: group._id })
  await Group.deleteOne({ _id: group._id })
  await releaseAttachments(withFiles.map((m) => m.attachment))
  if (group.avatar?.publicId) await deleteFromCloudinary([{ publicId: group.avatar.publicId, resourceType: "image" }])
  emitToUsers(group.members, "groupRemoved", { groupId: String(group._id) })
}

// Load a group the signed-in user belongs to (or reply with an error)
const loadMemberGroup = async (req, res) => {
  const group = await Group.findById(req.params.id)
  if (!group) return fail(res, 404, "Group not found")
  if (!has(group.members, req.user._id)) return fail(res, 403, "You're not in this group")
  return group
}

const isAdmin = (group, userId) => has(group.admins, userId)

// Who may be added: community members for community groups, otherwise my contacts
const allowedPool = async (group, me) => {
  if (group.community) {
    const c = await Community.findById(group.community).select("members")
    return c?.members || []
  }
  return me.contacts || []
}

const notifyCommunity = async (communityId) => {
  if (!communityId) return
  const c = await Community.findById(communityId).select("members")
  if (c) emitToUsers(c.members, "communityUpdated", { communityId: String(communityId) })
}

// ── Groups ──────────────────────────────────────────────────

// My groups, with the last message and my unread count for the sidebar
export const listGroups = async (req, res) => {
  try {
    const me = req.user._id
    const groups = await populate(Group.find({ members: me }).sort({ updatedAt: -1 }))
    const result = await Promise.all(groups.map(async (g) => {
      const readAt = g.reads?.get(String(me)) || g.createdAt
      const [lastMessage, unread] = await Promise.all([
        Message.findOne({ groupId: g._id }).sort({ createdAt: -1 })
          .select("message senderId groupId createdAt attachment.kind attachment.name"),
        Message.countDocuments({ groupId: g._id, senderId: { $ne: me }, createdAt: { $gt: readAt } }),
      ])
      return { ...groupView(g), lastMessage, unread }
    }))
    res.status(200).json({ groups: result })
  } catch (error) {
    console.log("listGroups error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const createGroup = async (req, res) => {
  try {
    const me = req.user
    const name = String(req.body.name || "").trim()
    if (!name) return fail(res, 400, "Give the group a name")
    const ids = Array.isArray(req.body.memberIds) ? req.body.memberIds : []
    const others = ids.filter((id) => has(me.contacts, id) && !sameId(id, me._id))
    if (!others.length) return fail(res, 400, "Add at least one contact")
    if (others.length + 1 > MAX_MEMBERS) return fail(res, 400, `Groups can have up to ${MAX_MEMBERS} people`)

    const { direct, invited } = await splitByApproval([...new Set(others.map(String))])
    const members = [me._id, ...direct]
    const now = new Date()
    const group = await Group.create({
      name,
      description: String(req.body.description || "").trim(),
      members,
      admins: [me._id],
      createdBy: me._id,
      reads: Object.fromEntries(members.map((id) => [String(id), now])),
    })
    await sendInvites(group, invited, me)
    const full = await populate(Group.findById(group._id))
    emitToUsers(full.members, "groupAdded", groupView(full), me._id)
    res.status(201).json({ ...groupView(full), invited: invited.length })
  } catch (error) {
    console.log("createGroup error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const getGroup = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    res.status(200).json(groupView(await populate(Group.findById(group._id))))
  } catch (error) {
    console.log("getGroup error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const updateGroup = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can edit the group")
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim()
      if (!name) return fail(res, 400, "Give the group a name")
      group.name = name
    }
    if (req.body.description !== undefined) group.description = String(req.body.description).trim()
    if (typeof req.body.adminsOnly === "boolean" && !group.announcement) group.adminsOnly = req.body.adminsOnly
    if (typeof req.body.approveJoins === "boolean" && !group.announcement) group.approveJoins = req.body.approveJoins
    await group.save()
    const full = await broadcastGroup(group._id)
    await notifyCommunity(group.community)
    res.status(200).json(groupView(full))
  } catch (error) {
    console.log("updateGroup error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Group photo (admins only)
export const updateGroupAvatar = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can change the group photo")
    const old = group.avatar
    if (req.method === "DELETE") {
      group.avatar = null
    } else {
      if (!req.file) return fail(res, 400, "Please choose an image")
      const uploaded = await uploadToCloudinary(req.file, { subfolder: "group-avatars" })
      group.avatar = { url: uploaded.url, publicId: uploaded.publicId }
    }
    await group.save()
    if (old?.publicId) await deleteFromCloudinary([{ publicId: old.publicId, resourceType: "image" }])
    const full = await broadcastGroup(group._id)
    await notifyCommunity(group.community)
    res.status(200).json(groupView(full))
  } catch (error) {
    console.log("updateGroupAvatar error:", error?.message || error)
    fail(res, 500, "Could not update the group photo")
  }
}

export const addMembers = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can add people")
    if (group.announcement) return fail(res, 400, "Add people to the community instead")

    const pool = await allowedPool(group, req.user)
    const ids = (Array.isArray(req.body.userIds) ? req.body.userIds : [])
      .filter((id) => has(pool, id) && !has(group.members, id))
    if (!ids.length) return fail(res, 400, "No one to add")
    if (group.members.length + ids.length > MAX_MEMBERS) return fail(res, 400, `Groups can have up to ${MAX_MEMBERS} people`)

    const { direct, invited } = await splitByApproval(ids)
    if (direct.length) {
      group.members.push(...direct)
      await group.save()
      await markRead(group._id, direct)
    }
    await sendInvites(group, invited, req.user)
    const full = await broadcastGroup(group._id)
    if (direct.length) emitToUsers(direct, "groupAdded", groupView(full))
    await notifyCommunity(group.community)
    res.status(200).json({ ...groupView(full), invited: invited.length })
  } catch (error) {
    console.log("addMembers error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Remove someone (admins), or leave (anyone, with their own id)
export const removeMember = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    const target = req.params.userId
    const leaving = sameId(target, req.user._id)
    if (!leaving && !isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can remove people")
    if (!has(group.members, target)) return fail(res, 404, "Not in this group")
    if (group.announcement) return fail(res, 400, leaving ? "Leave the community to leave its announcements" : "Remove them from the community instead")

    group.members = group.members.filter((m) => !sameId(m, target))
    group.admins = group.admins.filter((a) => !sameId(a, target))
    if (!group.members.length) {
      await destroyGroup(group)
      await notifyCommunity(group.community)
      return res.status(200).json({ removed: target, deleted: true })
    }
    // Never leave a group without an admin
    if (!group.admins.length) group.admins = [group.members[0]]
    group.reads.delete(String(target))
    await group.save()

    emitToUsers([target], "groupRemoved", { groupId: String(group._id) })
    await broadcastGroup(group._id)
    await notifyCommunity(group.community)
    res.status(200).json({ removed: target })
  } catch (error) {
    console.log("removeMember error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const setAdmin = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can change admins")
    const target = req.params.userId
    if (!has(group.members, target)) return fail(res, 404, "Not in this group")
    const makeAdmin = req.body.admin !== false
    if (makeAdmin && !isAdmin(group, target)) group.admins.push(target)
    if (!makeAdmin) {
      if (group.admins.length === 1 && isAdmin(group, target)) return fail(res, 400, "A group needs at least one admin")
      group.admins = group.admins.filter((a) => !sameId(a, target))
    }
    await group.save()
    const full = await broadcastGroup(group._id)
    res.status(200).json(groupView(full))
  } catch (error) {
    console.log("setAdmin error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Join a group in a community I'm part of
export const joinGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
    if (!group?.community || group.announcement) return fail(res, 404, "Group not found")
    const community = await Community.findById(group.community).select("members")
    if (!has(community?.members || [], req.user._id)) return fail(res, 403, "Join the community first")
    if (!has(group.members, req.user._id)) {
      if (group.members.length >= MAX_MEMBERS) return fail(res, 400, "This group is full")
      group.members.push(req.user._id)
      await group.save()
      await markRead(group._id, [req.user._id])
    }
    const full = await broadcastGroup(group._id)
    await notifyCommunity(group.community)
    res.status(200).json(groupView(full))
  } catch (error) {
    console.log("joinGroup error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const deleteGroup = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can delete the group")
    if (group.announcement) return fail(res, 400, "Delete the community to remove its announcements")
    await destroyGroup(group)
    await notifyCommunity(group.community)
    res.status(200).json({ deleted: String(group._id) })
  } catch (error) {
    console.log("deleteGroup error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Group messages ──────────────────────────────────────────

// All messages, plus the people who sent them (including former members)
export const getGroupMessages = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    const messages = await Message.find({ groupId: group._id, hiddenFor: { $ne: req.user._id } }).sort({ createdAt: 1 })
    const senderIds = [...new Set(messages.map((m) => String(m.senderId)))]
    const people = await User.find({ _id: { $in: senderIds } }).select(MEMBER_FIELDS)
    res.status(200).json({ messages, people })
  } catch (error) {
    console.log("getGroupMessages error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const sendGroupMessage = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    const me = req.user._id
    if ((group.announcement || group.adminsOnly) && !isAdmin(group, me)) return fail(res, 403, group.announcement ? "Only admins can post announcements" : "Only admins can send messages in this group")

    const { message, replyTo } = req.body
    const text = (message || "").trim()
    if (!text && !req.file) return fail(res, 400, "Message cannot be empty")

    if (replyTo) {
      const original = await Message.findById(replyTo).select("groupId")
      if (!original || !sameId(original.groupId, group._id)) return fail(res, 400, "Invalid reply target")
    }

    let attachment = null
    if (req.file) {
      try {
        attachment = await uploadToCloudinary(req.file)
      } catch (err) {
        console.log("Cloudinary upload error:", err?.message || err)
        return fail(res, 502, "Upload failed. Please try again.")
      }
    }

    const newMessage = await Message.create({ senderId: me, groupId: group._id, message: text, replyTo: replyTo || null, attachment })
    group.reads.set(String(me), new Date())
    group.updatedAt = new Date()
    await group.save()

    emitToUsers(group.members, "newMessage", newMessage, me)
    res.status(201).json(newMessage)
    sendPush(group.members.filter((m) => !sameId(m, me)), { title: group.name, body: `${req.user.fullName.split(" ")[0]}: ${previewOf(newMessage)}`, tag: `group-${group._id}` }, { chatId: group._id }).catch(() => {})

    // "@Nexa …": answer in the group (in the background)
    answerMention({ groupId: group._id, message: newMessage, sender: req.user, timeZone: safeZone(req.headers["x-time-zone"]) })
      .catch((err) => console.log("@Nexa error:", err.message))
  } catch (error) {
    console.log("sendGroupMessage error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const markGroupRead = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    await markRead(group._id, [req.user._id])
    res.status(200).json({ ok: true })
  } catch (error) {
    console.log("markGroupRead error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Group invites (for people who approve group adds) ─────────
export const listGroupInvites = async (req, res) => {
  try {
    const groups = await Group.find({ "invites.user": req.user._id }).select("name avatar members invites").populate("invites.by", "fullName")
    res.status(200).json({
      invites: groups.map((g) => {
        const mine = g.invites.find((i) => sameId(i.user, req.user._id))
        return { group: { _id: g._id, name: g.name, avatar: g.avatar, memberCount: g.members.length }, by: mine?.by ? { _id: mine.by._id, fullName: mine.by.fullName } : null, at: mine?.at }
      }),
    })
  } catch (error) {
    console.log("listGroupInvites error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const answerGroupInvite = async (req, res) => {
  try {
    const group = await Group.findOne({ _id: req.params.id, "invites.user": req.user._id })
    if (!group) return fail(res, 404, "This invite is no longer available")
    group.invites = group.invites.filter((i) => !sameId(i.user, req.user._id))
    const accept = req.method === "POST"
    if (accept && !has(group.members, req.user._id)) {
      if (group.members.length >= MAX_MEMBERS) { await group.save(); return fail(res, 400, "This group is full") }
      group.members.push(req.user._id)
    }
    await group.save()
    if (!accept) return res.status(200).json({ declined: true })
    await markRead(group._id, [req.user._id])
    const full = await broadcastGroup(group._id)
    emitToUsers([req.user._id], "groupAdded", groupView(full))
    await notifyCommunity(group.community)
    res.status(200).json(groupView(full))
  } catch (error) {
    console.log("answerGroupInvite error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Invite links and join requests ─────────────────────────────
const linkable = (group) => !group.announcement && !group.community

// Admins: the group's invite link (creates one if needed; reset makes a new one)
export const getInviteLink = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can share the invite link")
    if (!linkable(group)) return fail(res, 400, "This group can't have an invite link")
    if (!group.inviteCode || req.method === "POST") {
      group.inviteCode = crypto.randomBytes(9).toString("base64url")
      await group.save()
    }
    res.status(200).json({ code: group.inviteCode, approveJoins: group.approveJoins })
  } catch (error) {
    console.log("getInviteLink error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const removeInviteLink = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can change the invite link")
    group.inviteCode = null
    await group.save()
    res.status(200).json({ code: null })
  } catch (error) {
    console.log("removeInviteLink error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Anyone signed in: what's behind an invite link
export const previewInviteLink = async (req, res) => {
  try {
    const group = await Group.findOne({ inviteCode: req.params.code }).select("name description avatar members approveJoins joinRequests")
    if (!group) return fail(res, 404, "This invite link isn't valid any more")
    const status = has(group.members, req.user._id) ? "member" : group.joinRequests.some((r) => sameId(r.user, req.user._id)) ? "requested" : "none"
    res.status(200).json({ group: { _id: group._id, name: group.name, description: group.description, avatar: group.avatar, memberCount: group.members.length, approveJoins: group.approveJoins }, status })
  } catch (error) {
    console.log("previewInviteLink error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Join through the link, or ask to join when admins approve new members
export const joinByLink = async (req, res) => {
  try {
    const group = await Group.findOne({ inviteCode: req.params.code })
    if (!group) return fail(res, 404, "This invite link isn't valid any more")
    const me = req.user._id
    if (has(group.members, me)) return res.status(200).json({ status: "member", group: groupView(await populate(Group.findById(group._id))) })
    if (group.members.length >= MAX_MEMBERS) return fail(res, 400, "This group is full")
    if (group.approveJoins) {
      if (!group.joinRequests.some((r) => sameId(r.user, me))) {
        group.joinRequests.push({ user: me, at: new Date() })
        await group.save()
        emitToUsers(group.admins, "groupJoinRequest", { group: String(group._id) })
        sendPush(group.admins, { title: group.name, body: `${req.user.fullName} asked to join`, tag: `gjoin-${group._id}` }).catch(() => {})
        await broadcastGroup(group._id)
      }
      return res.status(200).json({ status: "requested" })
    }
    group.members.push(me)
    await group.save()
    await markRead(group._id, [me])
    const full = await broadcastGroup(group._id)
    emitToUsers([me], "groupAdded", groupView(full))
    res.status(200).json({ status: "member", group: groupView(full) })
  } catch (error) {
    console.log("joinByLink error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Admins: people asking to join
export const listJoinRequests = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can see join requests")
    await group.populate("joinRequests.user", MEMBER_FIELDS)
    res.status(200).json({ requests: group.joinRequests.filter((r) => r.user).map((r) => ({ user: r.user, at: r.at })) })
  } catch (error) {
    console.log("listJoinRequests error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Approve (POST) or decline (DELETE) one request
export const answerJoinRequest = async (req, res) => {
  try {
    const group = await loadMemberGroup(req, res)
    if (!group?._id) return
    if (!isAdmin(group, req.user._id)) return fail(res, 403, "Only admins can answer join requests")
    const userId = req.params.userId
    if (!group.joinRequests.some((r) => sameId(r.user, userId))) return fail(res, 404, "Request not found")
    group.joinRequests = group.joinRequests.filter((r) => !sameId(r.user, userId))
    const approve = req.method === "POST"
    if (approve && !has(group.members, userId)) {
      if (group.members.length >= MAX_MEMBERS) return fail(res, 400, "This group is full")
      group.members.push(userId)
    }
    await group.save()
    if (approve) await markRead(group._id, [userId])
    const full = await broadcastGroup(group._id)
    if (approve) {
      emitToUsers([userId], "groupAdded", groupView(full))
      sendPush([userId], { title: group.name, body: "Your request to join was approved", tag: `gjoin-${group._id}` }).catch(() => {})
    }
    res.status(200).json(groupView(full))
  } catch (error) {
    console.log("answerJoinRequest error:", error)
    fail(res, 500, "Internal server error")
  }
}
