// GIF and sticker search (GIPHY). The key stays on the server.
const GIPHY = "https://api.giphy.com/v1"

const pick = (g) => {
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

export const gifStatus = (req, res) => res.json({ gifs: !!process.env.GIPHY_API_KEY })

export const searchGifs = async (req, res) => {
  const key = process.env.GIPHY_API_KEY
  if (!key) return res.status(503).json({ error: "GIFs aren't set up yet", code: "not_configured" })
  const type = req.query.type === "stickers" ? "stickers" : "gifs"
  const q = String(req.query.q || "").trim().slice(0, 50)
  const offset = Math.min(4000, Math.max(0, Number(req.query.offset) || 0))
  const params = new URLSearchParams({ api_key: key, limit: "24", offset: String(offset), rating: "pg-13", bundle: "messaging_non_clips" })
  if (q) params.set("q", q)
  try {
    const r = await fetch(`${GIPHY}/${type}/${q ? "search" : "trending"}?${params}`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) {
      console.log("GIPHY error:", r.status)
      return res.status(502).json({ error: "Couldn't load GIFs right now" })
    }
    const body = await r.json()
    const items = (body.data || []).map(pick).filter(Boolean)
    const total = body.pagination?.total_count ?? items.length
    res.json({ items, next: offset + 24 < total ? offset + 24 : null })
  } catch (error) {
    console.log("searchGifs error:", error.message)
    res.status(502).json({ error: "Couldn't load GIFs right now" })
  }
}

// Only these hosts can be sent as a GIF or sticker
export const mediaUrlOk = (url) => /^https:\/\/(media\d*\.giphy\.com|i\.giphy\.com)\/[\w\-./]+$/.test(url) ||
  /^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/[0-9a-f_]+\/512\.(webp|gif)$/.test(url)

// The `media` field of a message: { kind: "gif" | "sticker", url, title, width, height } or null
export const parseMedia = (raw) => {
  let m = raw
  if (typeof raw === "string") { try { m = JSON.parse(raw) } catch { return null } }
  if (!m || !["gif", "sticker"].includes(m.kind) || !mediaUrlOk(String(m.url || ""))) return null
  return {
    kind: m.kind,
    url: String(m.url),
    name: String(m.title || "").slice(0, 120),
    width: Math.min(4000, Math.max(1, Number(m.width) || 200)),
    height: Math.min(4000, Math.max(1, Number(m.height) || 200)),
  }
}
