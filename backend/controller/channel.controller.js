import { Channel, ChannelPost } from "../models/channel.model.js"
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js"
import { emitToUsers } from "../utils/notify.js"
import { firstUrl, getPreview } from "../utils/linkPreview.js"

// Channels: one-way updates. Admins post; followers read and react.
const fail = (res, status, error) => res.status(status).json({ error })
const same = (a, b) => String(a?._id ?? a) === String(b?._id ?? b)
const HANDLE_RE = /^[a-z0-9_.]{3,30}$/
const PAGE = 30

const isAdmin = (ch, userId) => ch.admins.some((a) => same(a, userId))
const audience = (ch) => [...ch.followers, ...ch.admins]

// What a viewer sees about a channel
const view = (ch, userId) => {
  const read = ch.reads?.get?.(String(userId))
  return {
    _id: String(ch._id),
    isChannel: true,
    name: ch.name,
    handle: ch.handle,
    description: ch.description,
    avatar: ch.avatar,
    followerCount: ch.followerCount,
    lastPostAt: ch.lastPostAt,
    createdAt: ch.createdAt,
    amAdmin: isAdmin(ch, userId),
    amOwner: same(ch.owner, userId),
    following: ch.followers.some((f) => same(f, userId)),
    readAt: read || null,
  }
}

const loadChannel = async (req, res) => {
  const ch = await Channel.findById(req.params.id).catch(() => null)
  if (!ch) { fail(res, 404, "Channel not found"); return null }
  return ch
}

// Channels I follow or run, with unread counts and the latest post
export const myChannels = async (req, res) => {
  try {
    const me = req.user._id
    const list = await Channel.find({ $or: [{ followers: me }, { admins: me }] }).sort({ lastPostAt: -1, updatedAt: -1 })
    const out = await Promise.all(list.map(async (ch) => {
      const v = view(ch, me)
      const [last, unread] = await Promise.all([
        ChannelPost.findOne({ channelId: ch._id }).sort({ createdAt: -1 }).select("text attachment createdAt"),
        ChannelPost.countDocuments({ channelId: ch._id, createdAt: { $gt: v.readAt || v.createdAt }, authorId: { $ne: me } }),
      ])
      return { ...v, lastPost: last, unread: Math.min(unread, 99) }
    }))
    res.json(out)
  } catch (error) {
    console.log("myChannels error:", error)
    fail(res, 500, "Internal server error")
  }
}

// Find channels by name or handle (empty search: the most followed)
export const discoverChannels = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 50)
    const re = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null
    const list = await Channel.find(re ? { $or: [{ name: re }, { handle: re }] } : {}).sort({ followerCount: -1, createdAt: -1 }).limit(30)
    res.json(list.map((ch) => view(ch, req.user._id)))
  } catch (error) {
    console.log("discoverChannels error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const handleAvailable = async (req, res) => {
  const handle = String(req.params.handle || "").toLowerCase()
  if (!HANDLE_RE.test(handle)) return res.json({ available: false, error: "3 to 30 letters, numbers, _ or ." })
  res.json({ available: !(await Channel.exists({ handle })) })
}

export const createChannel = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim()
    const handle = String(req.body.handle || "").trim().toLowerCase()
    if (name.length < 2 || name.length > 60) return fail(res, 400, "Give the channel a name of 2 to 60 characters")
    if (!HANDLE_RE.test(handle)) return fail(res, 400, "The handle can use 3 to 30 letters, numbers, _ or .")
    if (await Channel.exists({ handle })) return fail(res, 400, "That handle is taken")
    if (await Channel.countDocuments({ owner: req.user._id }) >= 10) return fail(res, 400, "You can run up to 10 channels")
    const ch = await Channel.create({
      name, handle, description: String(req.body.description || "").trim().slice(0, 500),
      owner: req.user._id, admins: [req.user._id], followers: [], followerCount: 0,
    })
    res.status(201).json(view(ch, req.user._id))
  } catch (error) {
    console.log("createChannel error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const getChannel = async (req, res) => {
  const ch = await loadChannel(req, res)
  if (ch) res.json(view(ch, req.user._id))
}

export const updateChannel = async (req, res) => {
  try {
    const ch = await loadChannel(req, res)
    if (!ch) return
    if (!isAdmin(ch, req.user._id)) return fail(res, 403, "Only admins can edit the channel")
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim()
      if (name.length < 2 || name.length > 60) return fail(res, 400, "Give the channel a name of 2 to 60 characters")
      ch.name = name
    }
    if (req.body.description !== undefined) ch.description = String(req.body.description).trim().slice(0, 500)
    if (req.file) {
      const up = await uploadToCloudinary(req.file, { subfolder: "channels" })
      const old = ch.avatar
      ch.avatar = { url: up.url, publicId: up.publicId }
      if (old?.publicId) deleteFromCloudinary([{ publicId: old.publicId, resourceType: "image" }]).catch(() => {})
    }
    await ch.save()
    emitToUsers(audience(ch), "channelUpdated", { channelId: String(ch._id) })
    res.json(view(ch, req.user._id))
  } catch (error) {
    console.log("updateChannel error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const deleteChannel = async (req, res) => {
  try {
    const ch = await loadChannel(req, res)
    if (!ch) return
    if (!same(ch.owner, req.user._id)) return fail(res, 403, "Only the owner can delete the channel")
    const posts = await ChannelPost.find({ channelId: ch._id }).select("attachment")
    deleteFromCloudinary([...posts.map((p) => p.attachment).filter(Boolean), ...(ch.avatar?.publicId ? [{ publicId: ch.avatar.publicId, resourceType: "image" }] : [])]).catch(() => {})
    await ChannelPost.deleteMany({ channelId: ch._id })
    await ch.deleteOne()
    emitToUsers(audience(ch), "channelDeleted", { channelId: String(ch._id) })
    res.json({ ok: true })
  } catch (error) {
    console.log("deleteChannel error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const followChannel = async (req, res) => {
  try {
    const follow = req.method !== "DELETE"
    const me = req.user._id
    const update = follow
      ? { $addToSet: { followers: me }, $set: { [`reads.${me}`]: new Date() } }
      : { $pull: { followers: me }, $unset: { [`reads.${me}`]: 1 } }
    const ch = await Channel.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!ch) return fail(res, 404, "Channel not found")
    ch.followerCount = ch.followers.length
    await ch.save()
    res.json(view(ch, me))
  } catch (error) {
    console.log("followChannel error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const markChannelRead = async (req, res) => {
  await Channel.updateOne({ _id: req.params.id }, { $set: { [`reads.${req.user._id}`]: new Date() } }).catch(() => {})
  res.json({ ok: true })
}

// Posts, newest last. ?before=<date> loads older ones.
export const listPosts = async (req, res) => {
  try {
    const ch = await loadChannel(req, res)
    if (!ch) return
    const filter = { channelId: ch._id }
    if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) }
    const posts = await ChannelPost.find(filter).sort({ createdAt: -1 }).limit(PAGE)
    res.json({ posts: posts.reverse(), more: posts.length === PAGE })
  } catch (error) {
    console.log("listPosts error:", error)
    fail(res, 500, "Internal server error")
  }
}

export const createPost = async (req, res) => {
  try {
    const ch = await loadChannel(req, res)
    if (!ch) return
    if (!isAdmin(ch, req.user._id)) return fail(res, 403, "Only admins can post in this channel")
    const text = String(req.body.text || "").trim().slice(0, 4000)
    if (!text && !req.file) return fail(res, 400, "Write something or add a photo")
    let attachment = null
    if (req.file) {
      try { attachment = await uploadToCloudinary(req.file, { subfolder: "channels" }) } catch { return fail(res, 502, "Upload failed. Please try again.") }
    }
    const post = await ChannelPost.create({ channelId: ch._id, authorId: req.user._id, text, attachment })
    ch.lastPostAt = post.createdAt
    ch.reads.set(String(req.user._id), post.createdAt)
    await ch.save()
    emitToUsers(audience(ch), "channelPost", { channelId: String(ch._id), post })
    res.status(201).json(post)
    // Link preview in the background
    const url = firstUrl(text)
    if (url) {
      const preview = await getPreview(url)
      if (preview) {
        const updated = await ChannelPost.findByIdAndUpdate(post._id, { $set: { linkPreview: preview } }, { new: true })
        if (updated) emitToUsers(audience(ch), "channelPostUpdated", { channelId: String(ch._id), post: updated })
      }
    }
  } catch (error) {
    console.log("createPost error:", error)
    if (!res.headersSent) fail(res, 500, "Internal server error")
  }
}

export const deletePost = async (req, res) => {
  try {
    const ch = await loadChannel(req, res)
    if (!ch) return
    if (!isAdmin(ch, req.user._id)) return fail(res, 403, "Only admins can delete posts")
    const post = await ChannelPost.findOne({ _id: req.params.postId, channelId: ch._id })
    if (!post) return fail(res, 404, "Post not found")
    if (post.attachment) deleteFromCloudinary([post.attachment]).catch(() => {})
    await post.deleteOne()
    emitToUsers(audience(ch), "channelPostDeleted", { channelId: String(ch._id), postId: String(post._id) })
    res.json({ ok: true })
  } catch (error) {
    console.log("deletePost error:", error)
    fail(res, 500, "Internal server error")
  }
}

// One reaction per person; the same emoji again removes it
export const reactToPost = async (req, res) => {
  try {
    const ch = await loadChannel(req, res)
    if (!ch) return
    const me = req.user._id
    if (!isAdmin(ch, me) && !ch.followers.some((f) => same(f, me))) return fail(res, 403, "Follow the channel to react")
    const post = await ChannelPost.findOne({ _id: req.params.postId, channelId: ch._id })
    if (!post) return fail(res, 404, "Post not found")
    const emoji = String(req.body.emoji || "").slice(0, 16)
    const had = post.reactions.find((r) => same(r.userId, me))
    post.reactions = post.reactions.filter((r) => !same(r.userId, me))
    if (emoji && had?.emoji !== emoji) post.reactions.push({ userId: me, emoji })
    await post.save()
    emitToUsers(audience(ch), "channelPostUpdated", { channelId: String(ch._id), post })
    res.json(post)
  } catch (error) {
    console.log("reactToPost error:", error)
    fail(res, 500, "Internal server error")
  }
}
