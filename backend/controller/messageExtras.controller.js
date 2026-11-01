import crypto from "node:crypto"
import bcrypt from "bcryptjs"
import { Message } from "../models/message.model.js"
import { Conversation } from "../models/conversation.model.js"
import { Group } from "../models/group.model.js"
import User from "../models/user.model.js"
import { canSeeMessage } from "../utils/chatAccess.js"
import { emitToUsers } from "../utils/notify.js"
import { notifyAudience } from "./message.controller.js"
import { TIMER_CHOICES, timerFor } from "../utils/disappear.js"
import { sendPush } from "../utils/push.js"
import { hashAnswer, proveRecovery, questionOk } from "../utils/recovery.js"

// Pinned messages, starred messages, polls and pinned chats

const MAX_PINNED = 10
const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const fail = (res, status, error) => res.status(status).json({ error })

const loadVisible = async (req, res) => {
  const message = await Message.findById(req.params.messageId)
  if (!message || !(await canSeeMessage(req.user._id, message))) { fail(res, 404, "Message not found"); return null }
  return message
}

// Messages in the same chat as `m`
const chatFilter = (m) => m.groupId
  ? { groupId: m.groupId }
  : { groupId: null, $or: [{ senderId: m.senderId, receiverId: m.receiverId }, { senderId: m.receiverId, receiverId: m.senderId }] }

// ── Pin a message (max 3 per chat: pinning a 4th unpins the oldest) ──
export const pinMessage = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    if (message.call || message.botChat?.length) return fail(res, 400, "This message can't be pinned")
    const pin = req.body.pinned !== false
    if (message.groupId && pin) {
      const group = await Group.findById(message.groupId).select("announcement adminsOnly admins")
      if ((group?.announcement || group?.adminsOnly) && !group.admins.some((a) => same(a, req.user._id))) return fail(res, 403, "Only admins can pin here")
    }
    const changed = []
    if (pin) {
      const pinned = await Message.find({ ...chatFilter(message), pinned: { $ne: null }, _id: { $ne: message._id } }).sort({ "pinned.at": 1 })
      for (const old of pinned.slice(0, Math.max(0, pinned.length - MAX_PINNED + 1))) {
        old.pinned = null
        await old.save()
        changed.push(old)
      }
      message.pinned = { by: req.user._id, at: new Date() }
    } else {
      message.pinned = null
    }
    await message.save()
    changed.push(message)
    for (const m of changed) await notifyAudience(m, "messageEdited", m)
    res.json(message)
  } catch (error) {
    console.log("pinMessage error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Star (save) a message for myself ──
export const starMessage = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    const star = req.body.starred !== false
    await User.updateOne({ _id: req.user._id }, star ? { $addToSet: { starred: message._id } } : { $pull: { starred: message._id } })
    res.json({ messageId: String(message._id), starred: star })
  } catch (error) {
    console.log("starMessage error:", error)
    fail(res, 500, "Internal server error")
  }
}

// My starred messages, newest starred first, with the chat each one is in
export const listStarred = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("starred")
    const messages = await Message.find({ _id: { $in: me.starred } })
    const groupIds = [...new Set(messages.filter((m) => m.groupId).map((m) => String(m.groupId)))]
    const groups = new Map((await Group.find({ _id: { $in: groupIds }, members: req.user._id }).select("name")).map((g) => [String(g._id), g]))
    const peopleIds = [...new Set(messages.flatMap((m) => [m.senderId, m.receiverId]).filter(Boolean).map(String))]
    const people = new Map((await User.find({ _id: { $in: peopleIds } }).select("fullName avatar")).map((u) => [String(u._id), u]))
    const order = new Map(me.starred.map((id, i) => [String(id), i]))
    const items = messages
      .filter((m) => (m.groupId ? groups.has(String(m.groupId)) : same(m.senderId, req.user._id) || same(m.receiverId, req.user._id)))
      .map((m) => {
        const otherId = m.groupId ? null : same(m.senderId, req.user._id) ? m.receiverId : m.senderId
        return {
          message: m,
          sender: people.get(String(m.senderId))?.fullName || "Someone",
          chat: m.groupId
            ? { _id: String(m.groupId), name: groups.get(String(m.groupId)).name, isGroup: true }
            : { _id: String(otherId), name: same(otherId, req.user._id) ? "Message yourself" : people.get(String(otherId))?.fullName || "Chat", isGroup: false },
        }
      })
      .sort((a, b) => order.get(String(b.message._id)) - order.get(String(a.message._id)))
    // Forget stars on messages that are gone
    if (items.length !== me.starred.length) await User.updateOne({ _id: req.user._id }, { $set: { starred: items.map((i) => i.message._id).reverse() } })
    res.json({ items })
  } catch (error) {
    console.log("listStarred error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Search every chat I'm in (newest first). Locked and hidden chats are left out. ──
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
export const searchMessages = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100)
    if (q.length < 2) return res.json({ items: [] })
    const meId = req.user._id
    const me = await User.findById(meId).select("lockedChats hiddenChats")
    const skip = new Set([...(me.lockedChats || []), ...(me.hiddenChats || [])].map(String))
    const groups = await Group.find({ members: meId }).select("name avatar announcement")
    const groupIds = groups.filter((g) => !skip.has(String(g._id))).map((g) => g._id)
    const re = new RegExp(escapeRe(q), "i")
    const found = await Message.find({
      $and: [
        { $or: [{ groupId: { $in: groupIds } }, { groupId: null, senderId: meId }, { groupId: null, receiverId: meId }] },
        { $or: [{ message: re }, { transcript: re }, { "attachment.name": re }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
      hiddenFor: { $ne: meId },
      call: null,
    }).sort({ createdAt: -1 }).limit(120).select("message transcript attachment senderId receiverId groupId createdAt poll")
    const otherOf = (m) => (same(m.senderId, meId) ? m.receiverId : m.senderId)
    const visible = found.filter((m) => (m.groupId ? true : !skip.has(String(otherOf(m))))).slice(0, 40)
    const peopleIds = [...new Set(visible.flatMap((m) => [m.senderId, m.receiverId]).filter(Boolean).map(String))]
    const people = new Map((await User.find({ _id: { $in: peopleIds } }).select("fullName avatar")).map((u) => [String(u._id), u]))
    const groupMap = new Map(groups.map((g) => [String(g._id), g]))
    const items = visible.map((m) => {
      const otherId = m.groupId ? null : String(otherOf(m))
      const text = m.message || m.transcript || m.attachment?.name || ""
      return {
        messageId: String(m._id),
        text: text.slice(0, 300),
        createdAt: m.createdAt,
        sender: same(m.senderId, meId) ? "You" : people.get(String(m.senderId))?.fullName?.split(" ")[0] || "Someone",
        chat: m.groupId
          ? { _id: String(m.groupId), name: groupMap.get(String(m.groupId))?.name || "Group", isGroup: true, avatar: groupMap.get(String(m.groupId))?.avatar?.url || null }
          : { _id: otherId, name: otherId === String(meId) ? "Message yourself" : people.get(otherId)?.fullName || "Chat", isGroup: false, avatar: people.get(otherId)?.avatar?.url || null },
      }
    })
    res.json({ items })
  } catch (error) {
    console.log("searchMessages error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Polls ──
// Create a poll in a group or a direct chat. Shared with Nexa's create_poll tool.
export const createPollMessage = async (user, { chatId, isGroup, question, options, multiple }) => {
  const q = String(question || "").trim().slice(0, 300)
  const opts = [...new Set((Array.isArray(options) ? options : []).map((o) => String(o || "").trim().slice(0, 100)).filter(Boolean))]
  if (!q) throw Object.assign(new Error("Ask a question"), { status: 400 })
  if (opts.length < 2 || opts.length > 12) throw Object.assign(new Error("Give 2 to 12 options"), { status: 400 })
  const poll = { question: q, multiple: !!multiple, closed: false, options: opts.map((text) => ({ id: crypto.randomBytes(4).toString("hex"), text, votes: [] })) }

  if (isGroup) {
    const group = await Group.findById(chatId)
    if (!group || !group.members.some((m) => same(m, user._id))) throw Object.assign(new Error("You're not in that group"), { status: 403 })
    if ((group.announcement || group.adminsOnly) && !group.admins.some((a) => same(a, user._id))) throw Object.assign(new Error("Only admins can post here"), { status: 403 })
    const msg = await Message.create({ senderId: user._id, groupId: group._id, message: `📊 ${q}`, poll })
    group.reads.set(String(user._id), new Date())
    group.updatedAt = new Date()
    await group.save()
    emitToUsers(group.members, "newMessage", msg)
    sendPush(group.members.filter((m) => !same(m, user._id)), { title: group.name, body: `${user.fullName?.split(" ")[0] || "Someone"}: 📊 ${q}`, tag: `group-${group._id}` }).catch(() => {})
    return msg
  }
  const me = await User.findById(user._id).select("contacts")
  const self = same(chatId, user._id)
  if (!self && !me.contacts.some((c) => same(c, chatId))) throw Object.assign(new Error("You can only message your contacts"), { status: 403 })
  let conversation = self
    ? await Conversation.findOne({ members: { $size: 2 }, "members.0": user._id, "members.1": user._id })
    : await Conversation.findOne({ members: { $all: [user._id, chatId] } })
  if (!conversation) conversation = await Conversation.create({ members: [user._id, chatId] })
  const msg = await Message.create({ senderId: user._id, receiverId: chatId, message: `📊 ${q}`, poll, seen: self })
  conversation.messages.push(msg._id)
  await conversation.save()
  emitToUsers([user._id, chatId], "newMessage", msg)
  if (!self) sendPush([chatId], { title: user.fullName || "Kova", body: `📊 ${q}`, tag: `chat-${user._id}` }).catch(() => {})
  return msg
}

export const createPoll = async (req, res) => {
  try {
    const msg = await createPollMessage(req.user, req.body)
    res.status(201).json(msg)
  } catch (error) {
    if (!error.status) console.log("createPoll error:", error)
    fail(res, error.status || 500, error.status ? error.message : "Internal server error")
  }
}

// Vote: { optionIds: [...] } replaces my vote (empty = take my vote back)
export const votePoll = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    if (!message.poll) return fail(res, 400, "Not a poll")
    if (message.poll.closed) return fail(res, 400, "This poll is closed")
    let picked = [...new Set((Array.isArray(req.body.optionIds) ? req.body.optionIds : []).map(String))]
      .filter((id) => message.poll.options.some((o) => o.id === id))
    if (!message.poll.multiple) picked = picked.slice(0, 1)
    for (const o of message.poll.options) {
      o.votes = o.votes.filter((v) => !same(v, req.user._id))
      if (picked.includes(o.id)) o.votes.push(req.user._id)
    }
    message.markModified("poll")
    await message.save()
    await notifyAudience(message, "messageEdited", message)
    res.json(message)
  } catch (error) {
    console.log("votePoll error:", error)
    fail(res, 500, "Internal server error")
  }
}

// The poll's creator can close it (no more votes)
export const closePoll = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    if (!message.poll) return fail(res, 400, "Not a poll")
    if (!same(message.senderId, req.user._id)) return fail(res, 403, "Only the person who made the poll can close it")
    message.poll.closed = true
    message.markModified("poll")
    await message.save()
    await notifyAudience(message, "messageEdited", message)
    res.json(message)
  } catch (error) {
    console.log("closePoll error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── My pinned chats + starred ids ──
const MAX_PINNED_CHATS = 5
export const getPrefs = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("pinnedChats starred lockedChats lockCode lockCodeKind wallpapers hiddenChats hiddenWordHash securityQuestion")
    res.json({ pinnedChats: me.pinnedChats, starred: me.starred.map(String), lockedChats: me.lockedChats, hasLockCode: !!me.lockCode, lockCodeKind: me.lockCodeKind || "numeric", securityQuestion: me.securityQuestion || null, hiddenChats: me.hiddenChats, hiddenWordHash: me.hiddenWordHash, wallpapers: me.wallpapers || { global: null, chats: {} } })
  } catch (error) {
    console.log("getPrefs error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const pinChat = async (req, res) => {
  try {
    const chatId = String(req.params.chatId)
    const me = await User.findById(req.user._id).select("pinnedChats contacts")
    const pin = req.body.pinned !== false
    if (pin) {
      const mine = same(chatId, me._id) || me.contacts.some((c) => same(c, chatId)) || await Group.exists({ _id: chatId, members: me._id })
      if (!mine) return fail(res, 404, "Chat not found")
      if (!me.pinnedChats.includes(chatId) && me.pinnedChats.length >= MAX_PINNED_CHATS) return fail(res, 400, `You can pin up to ${MAX_PINNED_CHATS} chats`)
      if (!me.pinnedChats.includes(chatId)) me.pinnedChats.push(chatId)
    } else {
      me.pinnedChats = me.pinnedChats.filter((id) => id !== chatId)
    }
    await me.save()
    emitToUsers([me._id], "prefsUpdated", { pinnedChats: me.pinnedChats })
    res.json({ pinnedChats: me.pinnedChats })
  } catch (error) {
    console.log("pinChat error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Disappearing messages ──
const findDirect = (a, b) => same(a, b)
  ? Conversation.findOne({ members: { $size: 2 }, "members.0": a, "members.1": a })
  : Conversation.findOne({ members: { $all: [a, b] } })

// GET /message/disappear/:chatId?group=1 -> { seconds }
export const getChatTimer = async (req, res) => {
  try {
    const { chatId } = req.params
    if (req.query.group === "1") {
      const g = await Group.findOne({ _id: chatId, members: req.user._id }).select("disappearAfter")
      return g ? res.json({ seconds: g.disappearAfter || 0 }) : fail(res, 404, "Group not found")
    }
    const c = await findDirect(req.user._id, chatId)
    res.json({ seconds: c?.disappearAfter || 0 })
  } catch (error) {
    console.log("getChatTimer error:", error)
    fail(res, 500, "Internal server error")
  }
}

// PUT /message/disappear/:chatId { seconds, isGroup } — applies to new messages
export const setChatTimer = async (req, res) => {
  try {
    const { chatId } = req.params
    const seconds = Number(req.body.seconds)
    if (!TIMER_CHOICES.includes(seconds)) return fail(res, 400, "Choose off, 24 hours, 7 days or 90 days")
    if (req.body.isGroup) {
      const g = await Group.findById(chatId)
      if (!g || !g.members.some((m) => same(m, req.user._id))) return fail(res, 404, "Group not found")
      if (!g.admins.some((a) => same(a, req.user._id))) return fail(res, 403, "Only admins can change this")
      g.disappearAfter = seconds
      await g.save()
      emitToUsers(g.members, "chatTimer", { chatId: String(g._id), seconds, by: req.user.fullName })
      return res.json({ seconds })
    }
    const me = await User.findById(req.user._id).select("contacts")
    if (!same(chatId, me._id) && !me.contacts.some((c) => same(c, chatId))) return fail(res, 403, "You can only change your own chats")
    let c = await findDirect(me._id, chatId)
    if (!c) c = await Conversation.create({ members: [me._id, chatId] })
    c.disappearAfter = seconds
    await c.save()
    // Each side sees the chat under the other person's id
    emitToUsers([me._id], "chatTimer", { chatId: String(chatId), seconds, by: req.user.fullName })
    if (!same(chatId, me._id)) emitToUsers([chatId], "chatTimer", { chatId: String(me._id), seconds, by: req.user.fullName })
    res.json({ seconds })
  } catch (error) {
    console.log("setChatTimer error:", error)
    fail(res, 500, "Internal server error")
  }
}

// PUT /message/keep/:messageId { kept } — kept messages don't disappear (for everyone in the chat)
export const keepMessage = async (req, res) => {
  try {
    const message = await loadVisible(req, res)
    if (!message) return
    const kept = req.body.kept !== false
    message.kept = kept
    if (kept) message.expiresAt = null
    else {
      const secs = await timerFor(message)
      message.expiresAt = secs ? new Date(Date.now() + secs * 1000) : null
    }
    await message.save()
    await notifyAudience(message, "messageEdited", message)
    res.json(message)
  } catch (error) {
    console.log("keepMessage error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Locked chats (secret code) ──
// Digits only, or letters and numbers (case-sensitive)
const CODE_RE = /^[A-Za-z0-9]{4,16}$/
const CODE_HELP = "Choose a secret code of 4 to 16 letters or numbers"
const attempts = new Map() // userId -> { count, until }
const checkCode = async (me, code) => {
  const key = String(me._id)
  const a = attempts.get(key)
  if (a && a.until > Date.now()) return { ok: false, error: "Too many tries. Wait a few minutes and try again." }
  const ok = !!me.lockCode && CODE_RE.test(String(code || "")) && await bcrypt.compare(String(code), me.lockCode)
  if (ok) { attempts.delete(key); return { ok: true } }
  const count = (a?.count || 0) + 1
  attempts.set(key, count >= 5 ? { count: 0, until: Date.now() + 5 * 60_000 } : { count, until: 0 })
  return { ok: false, error: "That code isn't right" }
}
const lockedPrefs = (me) => ({ lockedChats: me.lockedChats, hasLockCode: !!me.lockCode, lockCodeKind: me.lockCodeKind || "numeric" })
const kindOf = (code) => (/^\d+$/.test(String(code)) ? "numeric" : "alnum")

// Lock or unlock a chat. The first lock sets the secret code; unlocking needs it.
export const lockChat = async (req, res) => {
  try {
    const chatId = String(req.params.chatId)
    const me = await User.findById(req.user._id).select("lockedChats lockCode lockCodeKind contacts securityQuestion securityAnswer")
    const lock = req.body.locked !== false
    if (lock) {
      const mine = same(chatId, me._id) || me.contacts.some((c) => same(c, chatId)) || await Group.exists({ _id: chatId, members: me._id })
      if (!mine) return fail(res, 404, "Chat not found")
      if (!me.lockCode) {
        if (!CODE_RE.test(String(req.body.code || ""))) return fail(res, 400, CODE_HELP)
        // First code: the security question can be set with it
        if (req.body.question && !me.securityAnswer) {
          const bad = questionOk(req.body.question, req.body.answer)
          if (bad) return fail(res, 400, bad)
          me.securityQuestion = String(req.body.question).trim()
          me.securityAnswer = await hashAnswer(req.body.answer)
        }
        me.lockCode = await bcrypt.hash(String(req.body.code), 10)
        me.lockCodeKind = kindOf(req.body.code)
      }
      if (!me.lockedChats.includes(chatId)) me.lockedChats.push(chatId)
    } else {
      const check = await checkCode(me, req.body.code)
      if (!check.ok) return fail(res, 400, check.error)
      me.lockedChats = me.lockedChats.filter((id) => id !== chatId)
    }
    await me.save()
    emitToUsers([me._id], "prefsUpdated", lockedPrefs(me))
    res.json(lockedPrefs(me))
  } catch (error) {
    console.log("lockChat error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Open the locked chats folder
export const verifyLockCode = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("lockCode")
    const check = await checkCode(me, req.body.code)
    if (!check.ok) return fail(res, 400, check.error)
    res.json({ ok: true })
  } catch (error) {
    console.log("verifyLockCode error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const changeLockCode = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("lockCode lockCodeKind lockedChats securityQuestion securityAnswer")
    if (me.lockCode) {
      const check = await checkCode(me, req.body.current)
      if (!check.ok) return fail(res, 400, check.error === "That code isn't right" ? "That's not your current code" : check.error)
    }
    if (!CODE_RE.test(String(req.body.code || ""))) return fail(res, 400, CODE_HELP)
    if (req.body.question && !me.securityAnswer) {
      const bad = questionOk(req.body.question, req.body.answer)
      if (bad) return fail(res, 400, bad)
      me.securityQuestion = String(req.body.question).trim()
      me.securityAnswer = await hashAnswer(req.body.answer)
    }
    me.lockCode = await bcrypt.hash(String(req.body.code), 10)
    me.lockCodeKind = kindOf(req.body.code)
    await me.save()
    emitToUsers([me._id], "prefsUpdated", lockedPrefs(me))
    res.json(lockedPrefs(me))
  } catch (error) {
    console.log("changeLockCode error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Forgot the code: confirm with the account password and choose a new code
export const resetLockedChats = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("lockedChats lockCode lockCodeKind securityAnswer password")
    if (!CODE_RE.test(String(req.body.code || ""))) return fail(res, 400, CODE_HELP)
    const check = await proveRecovery(me, req.body)
    if (!check.ok) return fail(res, 400, check.error)
    me.lockCode = await bcrypt.hash(String(req.body.code), 10)
        me.lockCodeKind = kindOf(req.body.code)
    attempts.delete(String(me._id))
    await me.save()
    emitToUsers([me._id], "prefsUpdated", lockedPrefs(me))
    res.json(lockedPrefs(me))
  } catch (error) {
    console.log("resetLockedChats error:", error)
    fail(res, 500, "Internal server error")
  }
}

// ── Hidden chats (shown only when the secret word is typed in search) ──
export const hiddenWordHash = (userId, word) => crypto.createHash("sha256").update(`${userId}:${String(word).trim().toLowerCase()}`).digest("hex")
const hiddenPrefs = (me) => ({ hiddenChats: me.hiddenChats, hiddenWordHash: me.hiddenWordHash })

export const hideChat = async (req, res) => {
  try {
    const chatId = String(req.params.chatId)
    const me = await User.findById(req.user._id).select("hiddenChats hiddenWordHash contacts")
    const hide = req.body.hidden !== false
    if (hide) {
      if (!me.hiddenWordHash) return fail(res, 400, "Set a secret word first")
      const mine = same(chatId, me._id) || me.contacts.some((c) => same(c, chatId)) || await Group.exists({ _id: chatId, members: me._id })
      if (!mine) return fail(res, 404, "Chat not found")
      if (!me.hiddenChats.includes(chatId)) me.hiddenChats.push(chatId)
    } else {
      me.hiddenChats = me.hiddenChats.filter((id) => id !== chatId)
    }
    await me.save()
    emitToUsers([me._id], "prefsUpdated", hiddenPrefs(me))
    res.json(hiddenPrefs(me))
  } catch (error) {
    console.log("hideChat error:", error)
    fail(res, 500, "Internal server error")
  }
}

// { word } sets or changes the secret word (3 to 30 characters); { word: null } removes it and unhides everything
export const setHiddenWord = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("hiddenChats hiddenWordHash securityAnswer password")
    // Changing or turning off an existing word needs the current word, or (forgot it)
    // the security answer / account password
    if (me.hiddenWordHash) {
      if (req.body.answer !== undefined || req.body.password) {
        const check = await proveRecovery(me, req.body)
        if (!check.ok) return fail(res, 400, check.error)
      } else if (hiddenWordHash(me._id, req.body.current || "") !== me.hiddenWordHash) {
        return fail(res, 400, "That's not your current secret word")
      }
    }
    if (req.body.word === null) {
      me.hiddenWordHash = null
      me.hiddenChats = []
    } else {
      const word = String(req.body.word || "").trim()
      if (word.length < 3 || word.length > 30) return fail(res, 400, "Use a word of 3 to 30 characters")
      me.hiddenWordHash = hiddenWordHash(me._id, word)
    }
    await me.save()
    emitToUsers([me._id], "prefsUpdated", hiddenPrefs(me))
    res.json(hiddenPrefs(me))
  } catch (error) {
    console.log("setHiddenWord error:", error)
    fail(res, 500, "Internal server error")
  }
}
