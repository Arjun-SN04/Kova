// GIF and sticker search, saved stickers and custom stickers.
// Search goes through our server so the API key stays private.
// Provider: KLIPY (KLIPY_API_KEY) if set, otherwise GIPHY (GIPHY_API_KEY).
import crypto from "node:crypto"
import User from "../models/user.model.js"
import { Message } from "../models/message.model.js"
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js"
import { canSeeMessage } from "../utils/chatAccess.js"

const GIPHY = "https://api.giphy.com/v1"
const KLIPY = "https://api.klipy.com/api/v1"
const PAGE = 24
const MAX_SAVED = 150
const MAX_STICKER_BYTES = 1024 * 1024

const provider = () => (process.env.KLIPY_API_KEY ? "klipy" : process.env.GIPHY_API_KEY ? "giphy" : null)

// Hosts seen in search results, so those URLs can be sent as messages
const seenHosts = new Set()
const remember = (url) => { try { seenHosts.add(new URL(url).host) } catch { /* ignore */ } }

// ── GIPHY ──
const fromGiphy = (g) => {
  const im = g.images || {}
  const preview = im.fixed_width?.webp || im.fixed_width?.url
  const full = im.downsized_medium?.url || im.original?.url
  if (!preview || !full) return null
  return {
    id: g.id,
    title: String(g.title || "").replace(/\s+GIF(\s+by\s+.*)?$/i, "").trim().slice(0, 120),
    preview,
    url: full.split("?")[0],
    width: Number(im.original?.width) || Number(im.fixed_width?.width) || 200,
    height: Number(im.original?.height) || Number(im.fixed_width?.height) || 200,
  }
}

const searchGiphy = async ({ type, q, offset }) => {
  const params = new URLSearchParams({ api_key: process.env.GIPHY_API_KEY, limit: String(PAGE), offset: String(offset), rating: "pg-13", bundle: "messaging_non_clips" })
  if (q) params.set("q", q)
  const r = await fetch(`${GIPHY}/${type}/${q ? "search" : "trending"}?${params}`, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`GIPHY ${r.status}`)
  const body = await r.json()
  const items = (body.data || []).map(fromGiphy).filter(Boolean)
  const total = body.pagination?.total_count ?? items.length
  return { items, next: offset + PAGE < total ? offset + PAGE : null }
}

// ── KLIPY ── files come as { hd|md|sm|xs: { gif|webp|mp4: { url, width, height } } }
const klipyFile = (file, sizes, formats) => {
  for (const s of sizes) for (const f of formats) {
    const v = file?.[s]?.[f]
    if (v?.url) return v
    if (typeof v === "string") return { url: v }
  }
  return null
}

const fromKlipy = (g) => {
  if (!g || g.type === "ad" || !g.file) return null
  const full = klipyFile(g.file, ["md", "hd", "sm"], ["webp", "gif"])
  const preview = klipyFile(g.file, ["sm", "xs", "md"], ["webp", "gif"]) || full
  if (!full?.url) return null
  const dims = full.width ? full : klipyFile(g.file, ["hd", "md", "sm"], ["gif", "webp", "mp4"]) || {}
  return {
    id: String(g.slug || g.id),
    title: String(g.title || "").trim().slice(0, 120),
    preview: preview.url,
    url: full.url,
    width: Number(dims.width) || 200,
    height: Number(dims.height) || 200,
  }
}

const searchKlipy = async ({ type, q, offset, userId }) => {
  const page = Math.floor(offset / PAGE) + 1
  // An anonymous, stable id per user (KLIPY uses it for recents and rate limits)
  const customer = crypto.createHash("sha256").update(`kova:${userId}`).digest("hex").slice(0, 32)
  const params = new URLSearchParams({ page: String(page), per_page: String(PAGE), customer_id: customer, content_filter: "medium" })
  if (q) params.set("q", q)
  const r = await fetch(`${KLIPY}/${process.env.KLIPY_API_KEY}/${type}/${q ? "search" : "trending"}?${params}`, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`KLIPY ${r.status}`)
  const body = await r.json()
  const data = body.data || {}
  const list = Array.isArray(data) ? data : data.data || []
  const items = list.map(fromKlipy).filter(Boolean)
  const more = data.has_next ?? list.length >= PAGE
  return { items, next: more ? offset + PAGE : null }
}

export const gifStatus = (req, res) => res.json({ gifs: !!provider(), provider: provider() })

export const searchGifs = async (req, res) => {
  const which = provider()
  if (!which) return res.status(503).json({ error: "GIFs aren't set up yet", code: "not_configured" })
  const type = req.query.type === "stickers" ? "stickers" : "gifs"
  const q = String(req.query.q || "").trim().slice(0, 50)
  const offset = Math.min(4000, Math.max(0, Number(req.query.offset) || 0))
  try {
    const result = which === "klipy"
      ? await searchKlipy({ type, q, offset, userId: req.user._id })
      : await searchGiphy({ type, q, offset })
    result.items.forEach((g) => { remember(g.url); remember(g.preview) })
    res.json({ ...result, provider: which })
  } catch (error) {
    console.log("searchGifs error:", error.message)
    res.status(502).json({ error: "Couldn't load GIFs right now" })
  }
}

// ── Which URLs can be sent as a GIF or sticker ──
const ownStickerUrl = (url) => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME
  return !!cloud && url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`) && url.includes("/stickers/")
}

export const mediaUrlOk = (url) => {
  if (/^https:\/\/(media\d*\.giphy\.com|i\.giphy\.com)\/[\w\-./]+$/.test(url)) return true
  if (/^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/[0-9a-f_]+\/512\.(webp|gif)$/.test(url)) return true
  if (ownStickerUrl(url)) return true
  try {
    const u = new URL(url)
    return u.protocol === "https:" && (/(^|\.)klipy\.com$/.test(u.host) || seenHosts.has(u.host))
  } catch { return false }
}

const mimeOf = (url) => (/\.webp(\?|$)/i.test(url) ? "image/webp" : /\.png(\?|$)/i.test(url) ? "image/png" : "image/gif")

// The `media` field of a message: { kind: "gif" | "sticker", url, title, width, height } or null
export const parseMedia = (raw) => {
  let m = raw
  if (typeof raw === "string") { try { m = JSON.parse(raw) } catch { return null } }
  const url = String(m?.url || "")
  if (!m || !["gif", "sticker"].includes(m.kind) || url.length > 1000 || !mediaUrlOk(url)) return null
  return {
    kind: m.kind,
    url,
    name: String(m.title || "").slice(0, 120),
    width: Math.min(4000, Math.max(1, Number(m.width) || 200)),
    height: Math.min(4000, Math.max(1, Number(m.height) || 200)),
  }
}

// A GIF / sticker as a chat message attachment. No publicId: deleting the
// message never deletes the shared file.
export const mediaAttachment = (media) => media && ({
  url: media.url,
  kind: media.kind,
  name: media.name,
  width: media.width,
  height: media.height,
  resourceType: "image",
  mimeType: mimeOf(media.url),
})

// ── Saved and custom stickers ──
const listOut = (list = []) => [...list].reverse().map((s) => ({
  _id: s._id, kind: s.kind, url: s.url, title: s.title, width: s.width, height: s.height, mine: !!s.publicId,
}))

export const myStickers = async (req, res) => {
  const me = await User.findById(req.user._id).select("stickers")
  res.json({ stickers: listOut(me?.stickers) })
}

const addSaved = async (userId, item) => {
  const me = await User.findById(userId).select("stickers")
  if (me.stickers.some((s) => s.url === item.url)) return { me, added: false }
  if (me.stickers.length >= MAX_SAVED) return { me, full: true }
  me.stickers.push(item)
  await me.save()
  return { me, added: true }
}

// Save a sticker or GIF: from a message in the chat, or from the picker
export const saveSticker = async (req, res) => {
  try {
    let media
    if (req.body.messageId) {
      const msg = await Message.findById(req.body.messageId).select("attachment senderId receiverId groupId botChat")
      const a = msg?.attachment
      if (!a || !["gif", "sticker"].includes(a.kind) || !(await canSeeMessage(req.user._id, msg))) return res.status(404).json({ error: "Sticker not found" })
      media = parseMedia({ kind: a.kind, url: a.url, title: a.name, width: a.width, height: a.height })
    } else {
      media = parseMedia(req.body.media)
    }
    if (!media) return res.status(400).json({ error: "That can't be saved" })
    const { me, full } = await addSaved(req.user._id, { kind: media.kind, url: media.url, title: media.name, width: media.width, height: media.height })
    if (full) return res.status(400).json({ error: `You can keep up to ${MAX_SAVED}. Remove some first.` })
    res.json({ stickers: listOut(me.stickers) })
  } catch (error) {
    console.log("saveSticker error:", error)
    res.status(500).json({ error: "Couldn't save it" })
  }
}

// Upload a sticker made in the sticker maker (512×512 WebP or PNG)
export const createSticker = async (req, res) => {
  try {
    const file = req.file
    if (!file || !/^image\/(webp|png)$/.test(file.mimetype)) return res.status(400).json({ error: "Send the sticker as a WebP or PNG image" })
    if (file.size > MAX_STICKER_BYTES) return res.status(400).json({ error: "Sticker is too large (max 1 MB)" })
    const count = (await User.findById(req.user._id).select("stickers"))?.stickers?.length || 0
    if (count >= MAX_SAVED) return res.status(400).json({ error: `You can keep up to ${MAX_SAVED} stickers. Remove some first.` })
    const up = await uploadToCloudinary(file, { subfolder: "stickers" })
    const title = String(req.body.title || "").slice(0, 60)
    const { me } = await addSaved(req.user._id, { kind: "sticker", url: up.url, publicId: up.publicId, title, width: up.width || 512, height: up.height || 512 })
    const saved = listOut(me.stickers)
    res.status(201).json({ sticker: saved[0], stickers: saved })
  } catch (error) {
    console.log("createSticker error:", error)
    res.status(502).json({ error: "Couldn't save your sticker. Try again." })
  }
}

// Remove from my saved list. A sticker I made is deleted for good only when
// no message uses it any more.
export const removeSticker = async (req, res) => {
  try {
    const me = await User.findById(req.user._id).select("stickers")
    const item = me?.stickers.id(req.params.id)
    if (!item) return res.status(404).json({ error: "Sticker not found" })
    const { url, publicId } = item
    item.deleteOne()
    await me.save()
    res.json({ stickers: listOut(me.stickers) })
    if (publicId && !(await Message.exists({ "attachment.url": url }))) deleteFromCloudinary([{ publicId, resourceType: "image" }]).catch(() => {})
  } catch (error) {
    console.log("removeSticker error:", error)
    res.status(500).json({ error: "Couldn't remove it" })
  }
}
