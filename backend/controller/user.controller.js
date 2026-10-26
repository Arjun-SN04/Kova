import Createtoken from "../jwt/token.js"
import User from "../models/user.model.js"
import bcrypt from "bcryptjs"
import { io } from "../socket/socket.js"
import { getReceiverSocketId } from "../socket/socket.js"
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js"
import { RESERVED_USERNAMES, USERNAME_RE, USERNAME_RULES, normalizeUsername, newInviteToken } from "../utils/username.js"

// Never send password hashes, contact lists or invite tokens to the browser
const publicUser = (user) => {
  const { password, confirmPassword, __v, contacts, inviteToken, pinnedChats, starred, ...rest } = user.toObject ? user.toObject() : user
  return rest
}

// Profile changes only go to my contacts (and my own other tabs)
const emitToContacts = (user, event, data) => {
  for (const id of [user._id, ...(user.contacts || [])]) {
    const socketId = getReceiverSocketId(id)
    if (socketId) io.to(socketId).emit(event, data)
  }
}

const checkUsername = async (username, myId = null) => {
  if (!USERNAME_RE.test(username)) return `Username must be ${USERNAME_RULES}`
  if (RESERVED_USERNAMES.has(username)) return "That username is taken"
  const taken = await User.exists({ username, ...(myId ? { _id: { $ne: myId } } : {}) })
  return taken ? "That username is taken" : null
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
    if (password !== confirmPassword)
      return res.status(400).json({ error: "Passwords do not match" })
    const existing = await User.findOne({ email })
    if (existing)
      return res.status(400).json({ error: "User already exists" })
    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = new User({ fullName, email, username, password: hashedPassword, inviteToken: newInviteToken() })
    await newUser.save()
    Createtoken(newUser._id, res)
    return res.status(201).json({ message: "Signed up successfully", newUser: publicUser(newUser) })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const login = async (req, res) => {
  const { email, password } = req.body
  try {
    const user = await User.findOne({ email })
    if (!user) return res.status(400).json({ error: "User not found" })
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(400).json({ error: "Invalid password" })
    Createtoken(user._id, res)
    return res.status(200).json({ message: "Logged in successfully", user: publicUser(user) })
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const logout = (req, res) => {
  try {
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
    const username = req.body.username !== undefined ? normalizeUsername(req.body.username) : null
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: "User not found" })

    if (fullName) user.fullName = fullName
    if (username !== null && username !== user.username) {
      const usernameError = await checkUsername(username, userId)
      if (usernameError) return res.status(400).json({ error: usernameError })
      user.username = username
    }

    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password)
      if (!isMatch) return res.status(400).json({ error: "Current password is incorrect" })
      user.password = await bcrypt.hash(newPassword, 10)
    }

    await user.save()
    const updatedUser = publicUser(user)
    if (fullName || username !== null) emitToContacts(user, "userUpdated", updatedUser)
    res.status(200).json({ message: "Profile updated successfully", user: updatedUser })
  } catch (error) {
    console.log(error)
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
