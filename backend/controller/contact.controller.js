import User from "../models/user.model.js"
import { ContactRequest } from "../models/contactRequest.model.js"
import { getReceiverSocketId, io } from "../socket/socket.js"
import { normalizeUsername, newInviteToken } from "../utils/username.js"
import { Customer } from "../models/customer.model.js"
import { Report } from "../models/report.model.js"

// What contacts can see about each other
export const CONTACT_FIELDS = "fullName username email avatar createdAt business"
// What a stranger sees before you're connected (no email)
const STRANGER_FIELDS = "fullName username avatar business"

const notify = (userId, event, data) => {
  const socketId = getReceiverSocketId(userId)
  if (socketId) io.to(socketId).emit(event, data)
}

const isContact = (me, otherId) => me.contacts.some((c) => c.equals(otherId))

// Has either person blocked the other?
export const isBlocked = async (aId, bId) =>
  !!(await User.exists({ $or: [{ _id: aId, blocked: bId }, { _id: bId, blocked: aId }] }))

// Make two people contacts of each other and drop any requests between them.
export const connect = async (aId, bId) => {
  if (await isBlocked(aId, bId)) throw Object.assign(new Error("You can't connect with this account"), { status: 403 })
  await Promise.all([
    User.updateOne({ _id: aId }, { $addToSet: { contacts: bId } }),
    User.updateOne({ _id: bId }, { $addToSet: { contacts: aId } }),
    ContactRequest.deleteMany({ $or: [{ from: aId, to: bId }, { from: bId, to: aId }] }),
  ])
  const [a, b] = await Promise.all([
    User.findById(aId).select(CONTACT_FIELDS),
    User.findById(bId).select(CONTACT_FIELDS),
  ])
  return [a, b]
}

// My contact list
export const getContacts = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).populate("contacts", CONTACT_FIELDS)
    res.status(200).json({ contacts: me.contacts })
  } catch (error) {
    console.log("getContacts error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Find someone by exact username, and say how they relate to me
export const lookupUser = async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username)
    const user = await User.findOne({ username, isBot: { $ne: true } }).select(STRANGER_FIELDS)
    if (!user) return res.status(404).json({ error: `No one goes by @${username}` })

    const me = req.user
    let status = "none"
    if (user._id.equals(me._id)) status = "self"
    else if (isContact(me, user._id)) status = "contact"
    else {
      const request = await ContactRequest.findOne({
        $or: [{ from: me._id, to: user._id }, { from: user._id, to: me._id }],
      })
      if (request) status = request.from.equals(me._id) ? "outgoing" : "incoming"
      return res.status(200).json({ user, status, requestId: request?._id || null })
    }
    res.status(200).json({ user, status, requestId: null })
  } catch (error) {
    console.log("lookupUser error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Send a contact request by username. If they already asked me, connect right away.
export const sendRequest = async (req, res) => {
  try {
    const me = req.user
    const username = normalizeUsername(req.body.username)
    const target = await User.findOne({ username, isBot: { $ne: true } }).select("_id business")
    if (!target) return res.status(404).json({ error: `No one goes by @${username}` })
    if (target._id.equals(me._id)) return res.status(400).json({ error: "That's you!" })
    if (isContact(me, target._id)) return res.status(400).json({ error: "You're already contacts" })
    if (await isBlocked(me._id, target._id)) return res.status(403).json({ error: "You can't send a request to this account" })

    // Businesses accept everyone: connect right away
    if (target.business?.enabled) {
      const [mine, them] = await connect(me._id, target._id)
      await Customer.updateOne({ business: target._id, customer: me._id }, { $setOnInsert: { firstAt: new Date() } }, { upsert: true })
      notify(target._id, "contactAdded", mine)
      return res.status(200).json({ status: "contact", user: them })
    }

    const theirs = await ContactRequest.findOne({ from: target._id, to: me._id })
    if (theirs) {
      const [mine, them] = await connect(me._id, target._id)
      notify(target._id, "contactAdded", mine)
      return res.status(200).json({ status: "contact", user: them })
    }

    const request = await ContactRequest.findOneAndUpdate(
      { from: me._id, to: target._id },
      { $setOnInsert: { from: me._id, to: target._id } },
      { upsert: true, new: true }
    )
    const from = await User.findById(me._id).select(STRANGER_FIELDS)
    notify(target._id, "contactRequest", { _id: request._id, from, createdAt: request.createdAt })
    res.status(201).json({ status: "outgoing", requestId: request._id })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    console.log("sendRequest error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Requests I've received and sent
export const getRequests = async (req, res) => {
  try {
    const me = req.user._id
    const [incoming, outgoing] = await Promise.all([
      ContactRequest.find({ to: me }).sort({ createdAt: -1 }).populate("from", STRANGER_FIELDS),
      ContactRequest.find({ from: me }).sort({ createdAt: -1 }).populate("to", STRANGER_FIELDS),
    ])
    // Skip requests whose user was deleted
    res.status(200).json({
      incoming: incoming.filter((r) => r.from),
      outgoing: outgoing.filter((r) => r.to),
    })
  } catch (error) {
    console.log("getRequests error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const acceptRequest = async (req, res) => {
  try {
    const request = await ContactRequest.findOne({ _id: req.params.id, to: req.user._id })
    if (!request) return res.status(404).json({ error: "Request not found" })
    const [mine, them] = await connect(req.user._id, request.from)
    notify(request.from, "contactAdded", mine)
    res.status(200).json({ user: them })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    console.log("acceptRequest error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Decline a request I received, or cancel one I sent
export const removeRequest = async (req, res) => {
  try {
    const me = req.user._id
    const request = await ContactRequest.findOneAndDelete({
      _id: req.params.id,
      $or: [{ from: me }, { to: me }],
    })
    if (!request) return res.status(404).json({ error: "Request not found" })
    const other = request.from.equals(me) ? request.to : request.from
    notify(other, "contactRequestRemoved", { _id: request._id })
    res.status(200).json({ removed: request._id })
  } catch (error) {
    console.log("removeRequest error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Remove someone from my contacts (both sides). Chat history is kept.
export const removeContact = async (req, res) => {
  try {
    const me = req.user._id
    const otherId = req.params.userId
    await Promise.all([
      User.updateOne({ _id: me }, { $pull: { contacts: otherId } }),
      User.updateOne({ _id: otherId }, { $pull: { contacts: me } }),
    ])
    notify(otherId, "contactRemoved", { userId: me.toString() })
    res.status(200).json({ removed: otherId })
  } catch (error) {
    console.log("removeContact error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// My invite link token (created on first use)
export const getMyInvite = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("inviteToken username")
    if (!me.inviteToken) {
      me.inviteToken = newInviteToken()
      await me.save()
    }
    res.status(200).json({ token: me.inviteToken, username: me.username })
  } catch (error) {
    console.log("getMyInvite error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// New invite link; the old link and QR code stop working
export const resetInvite = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("inviteToken username")
    me.inviteToken = newInviteToken()
    await me.save()
    res.status(200).json({ token: me.inviteToken, username: me.username })
  } catch (error) {
    console.log("resetInvite error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Who does this invite link belong to?
export const previewInvite = async (req, res) => {
  try {
    const owner = await User.findOne({ inviteToken: req.params.token }).select(STRANGER_FIELDS)
    if (!owner) return res.status(404).json({ error: "This invite link is invalid or has been reset" })
    const me = req.user
    const status = owner._id.equals(me._id) ? "self" : isContact(me, owner._id) ? "contact" : "none"
    res.status(200).json({ user: owner, status })
  } catch (error) {
    console.log("previewInvite error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Open an invite link: the owner shared it, so we connect right away
export const acceptInvite = async (req, res) => {
  try {
    const owner = await User.findOne({ inviteToken: req.params.token }).select("_id")
    if (!owner) return res.status(404).json({ error: "This invite link is invalid or has been reset" })
    if (owner._id.equals(req.user._id)) return res.status(400).json({ error: "This is your own invite link" })
    const [mine, them] = await connect(req.user._id, owner._id)
    notify(owner._id, "contactAdded", mine)
    res.status(200).json({ user: them })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    console.log("acceptInvite error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// ── Blocking and reporting ─────────────────────────────────────
// Blocking removes the contact both ways and stops new requests, invites and messages
export const blockUser = async (req, res) => {
  try {
    const me = req.user._id
    const otherId = req.params.userId
    if (String(otherId) === String(me)) return res.status(400).json({ error: "You can't block yourself" })
    const other = await User.exists({ _id: otherId })
    if (!other) return res.status(404).json({ error: "User not found" })
    await Promise.all([
      User.updateOne({ _id: me }, { $addToSet: { blocked: otherId }, $pull: { contacts: otherId } }),
      User.updateOne({ _id: otherId }, { $pull: { contacts: me } }),
      ContactRequest.deleteMany({ $or: [{ from: me, to: otherId }, { from: otherId, to: me }] }),
    ])
    notify(otherId, "contactRemoved", { userId: me.toString() })
    res.status(200).json({ blocked: otherId })
  } catch (error) {
    console.log("blockUser error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const unblockUser = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $pull: { blocked: req.params.userId } })
    res.status(200).json({ unblocked: req.params.userId })
  } catch (error) {
    console.log("unblockUser error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const getBlocked = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).populate("blocked", STRANGER_FIELDS)
    res.status(200).json({ blocked: me.blocked || [] })
  } catch (error) {
    console.log("getBlocked error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// Report an account to the app admins (optionally blocking it too)
export const reportUser = async (req, res) => {
  try {
    const target = await User.exists({ _id: req.params.userId })
    if (!target) return res.status(404).json({ error: "User not found" })
    const reason = ["spam", "scam", "abuse", "other"].includes(req.body.reason) ? req.body.reason : "spam"
    await Report.create({ reporter: req.user._id, target: req.params.userId, reason, details: String(req.body.details || "").slice(0, 500) })
    res.status(201).json({ reported: true })
  } catch (error) {
    console.log("reportUser error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
