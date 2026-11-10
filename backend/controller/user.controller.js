import Createtoken, { endSessions, startSession, userFromSession } from "../jwt/token.js"
import { Session } from "../models/session.model.js"
import { passwordError } from "../utils/password.js"
import User from "../models/user.model.js"
import bcrypt from "bcryptjs"
import { io } from "../socket/socket.js"
import { getReceiverSocketId, presenceOf, setActivityHidden, createSocketToken, disconnectSession, disconnectUser } from "../socket/socket.js"
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js"
import { RESERVED_USERNAMES, USERNAME_RE, USERNAME_RULES, normalizeUsername, newInviteToken, suggestUsernames } from "../utils/username.js"

// Never send password hashes, contact lists or invite tokens to the browser
const publicUser = (user) => {
  const { password, confirmPassword, passwordChangedAt, sessionsResetAt, __v, contacts, inviteToken, pinnedChats, starred, lockCode, lockCodeKind, hiddenChats, archivedChats, mutedChats, hiddenWordHash, securityCode, securityAnswer, dataExport, deletion, stickers, ...rest } = user.toObject ? user.toObject() : user
  return rest
}

// Profile changes only go to my contacts (and my own other tabs)
const emitToContacts = (user, event, data) => {
  // Contacts get only what they're allowed to see (photo / about privacy)
  const p = user.privacy || {}
  const forContacts = {
    _id: user._id, fullName: user.fullName, username: user.username, business: user.business,
    avatar: p.photo === "nobody" && !user.business?.enabled ? null : user.avatar,
    about: p.about === "nobody" ? "" : user.about,
  }
  for (const id of [user._id, ...(user.contacts || [])]) {
    const socketId = getReceiverSocketId(id)
    if (socketId) io.to(socketId).emit(event, String(id) === String(user._id) ? data : forContacts)
  }
}

const checkUsername = async (username, myId = null) => {
  if (!USERNAME_RE.test(username)) return `Username must be ${USERNAME_RULES}`
  if (RESERVED_USERNAMES.has(username)) return "That username is taken"
  const taken = await User.exists({ username, ...(myId ? { _id: { $ne: myId } } : {}) })
  return taken ? "That username is taken" : null
}

// Free usernames based on the name typed at sign-up: { suggestions: [...] }
export const usernameSuggestions = async (req, res) => {
  try {
    const name = String(req.query.name || "").slice(0, 80)
    const email = String(req.query.email || "").slice(0, 120)
    if (!name.trim() && !email.trim()) return res.json({ suggestions: [] })
    res.json({ suggestions: await suggestUsernames(name, email) })
  } catch (error) {
    console.log("usernameSuggestions error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Live check while typing a username: { available, error }
export const usernameAvailable = async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username)
    const error = await checkUsername(username, req.user?._id)
    res.status(200).json({ available: !error, error })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const signup = async (req, res) => {
  const { fullName, email, password, confirmPassword } = req.body
  const username = normalizeUsername(req.body.username)
  try {
    const usernameError = await checkUsername(username)
    if (usernameError) return res.status(400).json({ error: usernameError })
    const badPassword = passwordError(password)
    if (badPassword) return res.status(400).json({ error: badPassword })
    if (password !== confirmPassword)
      return res.status(400).json({ error: "Passwords do not match" })
    const existing = await User.findOne({ email })
    if (existing)
      return res.status(400).json({ error: "User already exists" })
    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = new User({ fullName, email, username, password: hashedPassword, inviteToken: newInviteToken() })
    await newUser.save()
    await startSession(newUser._id, req, res)
    return res.status(201).json({ message: "Signed up successfully", newUser: publicUser(newUser) })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Compared against when the email isn't found, so the reply takes as long as a real check
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10)

export const login = async (req, res) => {
  const { email, password } = req.body
  try {
    const user = await User.findOne({ email: String(email || "").trim(), isBot: { $ne: true } })
    // Same answer (and about the same time) whether or not the email has an account
    const isMatch = await bcrypt.compare(String(password || ""), user?.password || DUMMY_HASH)
    if (!user || !isMatch) return res.status(400).json({ error: "Invalid email or password" })
    // Signing in during the 30 days cancels a scheduled account deletion
    const restored = !!user.deletion?.scheduledFor
    if (restored) { user.deletion = undefined; await user.save() }
    await startSession(user._id, req, res)
    return res.status(200).json({ message: "Logged in successfully", user: publicUser(user), restored })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const logout = async (req, res) => {
  try {
    // This device's session ends (it disappears from Devices)
    const session = await userFromSession(req.cookies.jwt).catch(() => null)
    if (session?.session) {
      await Session.deleteOne({ _id: session.session._id })
      disconnectSession(session.session.sid)
    }
    res.clearCookie("jwt")
    res.status(200).json({ message: "Logged out successfully" })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Only my contacts, never everyone who signed up
export const allUser = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).populate("contacts", "fullName username email avatar createdAt")
    res.status(200).json({ allUsers: me.contacts })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id
    const { fullName, currentPassword, newPassword } = req.body
    const about = req.body.about !== undefined ? String(req.body.about).trim().slice(0, 140) : null
    const username = req.body.username !== undefined ? normalizeUsername(req.body.username) : null
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: "User not found" })

    if (fullName) user.fullName = fullName
    if (about !== null) user.about = about
    if (username !== null && username !== user.username) {
      const usernameError = await checkUsername(username, userId)
      if (usernameError) return res.status(400).json({ error: usernameError })
      user.username = username
    }

    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password)
      if (!isMatch) return res.status(400).json({ error: "Current password is incorrect" })
      const badPassword = passwordError(newPassword)
      if (badPassword) return res.status(400).json({ error: badPassword })
      user.password = await bcrypt.hash(newPassword, 10)
      // Signs out every other device; this one gets a fresh login below
      user.passwordChangedAt = new Date()
    }

    await user.save()
    if (currentPassword && newPassword) {
      // Every other device is signed out; this one carries on with a fresh cookie
      await endSessions(user._id, { except: req.sid })
      Createtoken(user._id, res, req.sid)
      disconnectUser(user._id, { exceptSession: req.sid })
    }
    const updatedUser = publicUser(user)
    if (fullName || username !== null || about !== null) emitToContacts(user, "userUpdated", updatedUser)
    res.status(200).json({ message: "Profile updated successfully", user: updatedUser })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Short-lived pass for the realtime connection (the socket can't use the login cookie)
export const socketToken = (req, res) => {
  res.set("Cache-Control", "no-store")
  res.json({ token: createSocketToken(req.user._id, req.sid) })
}

// ── Devices (signed-in sessions) ──
// GET /user/sessions -> { sessions: [{ sid, device, ip, lastSeenAt, createdAt, current }] }
export const listSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.user._id }).sort({ lastSeenAt: -1 }).limit(50)
    res.json({
      sessions: sessions.map((s) => ({
        sid: s.sid, device: s.device, lastSeenAt: s.lastSeenAt, createdAt: s.createdAt, current: s.sid === req.sid,
        // Only part of the address: enough to recognise a network, not to locate someone
        ip: String(s.ip || "").replace(/^::ffff:/, "").replace(/(\d+\.\d+)\.\d+\.\d+$/, "$1.x.x"),
      })),
    })
  } catch (error) {
    console.log("listSessions error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// DELETE /user/sessions/:sid — sign out one other device
export const endSession = async (req, res) => {
  try {
    const { sid } = req.params
    if (sid === req.sid) return res.status(400).json({ error: "Use Log out to sign out of this device" })
    const gone = await Session.findOneAndDelete({ user: req.user._id, sid: String(sid) })
    if (!gone) return res.status(404).json({ error: "That device is already signed out" })
    // Logins older than sessions (no record) could stand for this device: end those too
    await User.updateOne({ _id: req.user._id }, { $set: { sessionsResetAt: new Date() } })
    disconnectSession(gone.sid)
    res.json({ ok: true })
  } catch (error) {
    console.log("endSession error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// POST /user/sessions/sign-out-others — every device except this one
export const endOtherSessions = async (req, res) => {
  try {
    const { deletedCount } = await endSessions(req.user._id, { except: req.sid })
    await User.updateOne({ _id: req.user._id }, { $set: { sessionsResetAt: new Date() } })
    // This device's cookie must be newer than the reset
    Createtoken(req.user._id, res, req.sid)
    disconnectUser(req.user._id, { exceptSession: req.sid })
    res.json({ ok: true, signedOut: deletedCount })
  } catch (error) {
    console.log("endOtherSessions error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const getMe = async (req, res) => {
  try {
    res.status(200).json(publicUser(req.user))
  } catch (error) {
    res.status(500).json({ error: "Internal server error" })
  }
}

// Upload or replace my profile photo
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Please choose an image" })
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ error: "User not found" })

    const uploaded = await uploadToCloudinary(req.file, { subfolder: "avatars" })
    const old = user.avatar
    user.avatar = { url: uploaded.url, publicId: uploaded.publicId }
    await user.save()
    // Free the old photo's storage
    if (old?.publicId) await deleteFromCloudinary([{ publicId: old.publicId, resourceType: "image" }])

    const updated = publicUser(user)
    emitToContacts(user, "userUpdated", updated)
    res.status(200).json({ message: "Profile photo updated", user: updated })
  } catch (error) {
    console.log("updateAvatar error:", error?.message || error)
    res.status(500).json({ error: "Could not update your photo. Try again." })
  }
}

// Remove my profile photo (back to initials)
export const removeAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ error: "User not found" })
    const old = user.avatar
    user.avatar = null
    await user.save()
    if (old?.publicId) await deleteFromCloudinary([{ publicId: old.publicId, resourceType: "image" }])

    const updated = publicUser(user)
    emitToContacts(user, "userUpdated", updated)
    res.status(200).json({ message: "Profile photo removed", user: updated })
  } catch (error) {
    console.log("removeAvatar error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Privacy switches: { activity?: boolean, seen?: boolean }
export const updatePrivacy = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    const { activity, seen, photo, about, groups } = req.body || {}
    if (typeof activity === "boolean") user.set("privacy.activity", activity)
    if (typeof seen === "boolean") user.set("privacy.seen", seen)
    const who = ["everyone", "contacts", "nobody"]
    if (who.includes(photo)) user.set("privacy.photo", photo)
    if (who.includes(about)) user.set("privacy.about", about)
    if (["contacts", "approve"].includes(groups)) user.set("privacy.groups", groups)
    await user.save()
    // Contacts' screens refresh the photo / about
    if (photo || about) emitToContacts(user, "userUpdated", publicUser(user))
    setActivityHidden(user._id, user.privacy.activity === false)
    res.status(200).json({ privacy: user.privacy })
  } catch (error) {
    console.log("updatePrivacy error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Online now, or "last active" time, for a contact. Hidden when either side
// turned off Activity status (an offline viewer's own setting comes from the DB).
export const getPresence = async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select("privacy lastSeen")
    const isContact = (req.user.contacts || []).some((c) => String(c) === String(req.params.id))
    if (!target || !isContact) return res.status(200).json({ online: false, lastSeen: null })
    const live = presenceOf(req.user._id, target._id)
    const hidden = !live.visible || target.privacy?.activity === false || req.user.privacy?.activity === false
    if (hidden) return res.status(200).json({ online: false, lastSeen: null })
    res.status(200).json({ online: live.online, lastSeen: live.online ? null : target.lastSeen })
  } catch (error) {
    console.log("getPresence error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// ── Chat wallpapers ──
const cleanSpec = (w) => {
  if (!w || typeof w !== "object") return null
  const dim = Math.min(0.7, Math.max(0, Number(w.dim) || 0))
  if (w.kind === "preset" && /^[a-z0-9-]{1,30}$/.test(String(w.id))) return { kind: "preset", id: String(w.id), dim }
  if (w.kind === "image" && /^https:\/\/res\.cloudinary\.com\//.test(String(w.url)) && w.publicId) return { kind: "image", url: String(w.url), publicId: String(w.publicId).slice(0, 200), dim }
  return null
}
const imageIds = (w) => [w?.global, ...Object.values(w?.chats || {})].filter((x) => x?.kind === "image").map((x) => x.publicId)

// Upload a photo for a wallpaper (the browser saves it with PUT right after)
export const uploadWallpaper = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Please choose an image" })
    const img = await uploadToCloudinary(req.file, { subfolder: "wallpapers" })
    res.status(200).json({ url: img.url, publicId: img.publicId })
  } catch (error) {
    console.log("uploadWallpaper error:", error)
    res.status(500).json({ error: "Couldn't upload that image" })
  }
}

// { chatId?: string, wallpaper: spec | null }. No chatId = my default for every chat.
// null for a chat = follow my default again.
export const setWallpaper = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("wallpapers")
    const before = user.wallpapers || { global: null, chats: {} }
    const next = { global: before.global || null, chats: { ...(before.chats || {}) } }
    const spec = cleanSpec(req.body.wallpaper)
    const chatId = req.body.chatId ? String(req.body.chatId).slice(0, 40) : null
    if (chatId) {
      if (spec) next.chats[chatId] = spec
      else delete next.chats[chatId]
      if (Object.keys(next.chats).length > 500) return res.status(400).json({ error: "Too many chat wallpapers" })
    } else next.global = spec
    user.wallpapers = next
    user.markModified("wallpapers")
    await user.save()
    // Delete uploaded photos nothing uses any more
    const still = new Set(imageIds(next))
    const gone = imageIds(before).filter((id) => !still.has(id))
    if (gone.length) deleteFromCloudinary(gone.map((publicId) => ({ publicId, resourceType: "image" })))
    emitToContacts({ _id: user._id, contacts: [] }, "prefsUpdated", { wallpapers: next })
    res.status(200).json({ wallpapers: next })
  } catch (error) {
    console.log("setWallpaper error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
