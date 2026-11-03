// Check YouTube links before Nexa shows them: a removed, private or made-up video would show
// YouTube's grey placeholder and never play. YouTube's oEmbed endpoint (no key needed) answers
// 200 for a real video that can be embedded, 401/403 when embedding is off, 400/404 otherwise.

const ID_RE = /^[\w-]{11}$/
export const youtubeId = (url) => {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www\.|m\.)/, "")
    let id = null
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0]
    else if (["youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1]
    }
    return id && ID_RE.test(id) ? id : null
  } catch {
    return null
  }
}

const cache = new Map() // id -> { ok, embeddable, title, author } (videos rarely change)

// { ok: exists, embeddable: can play inside Kova, title, author }
export const checkYoutube = async (id) => {
  if (cache.has(id)) return cache.get(id)
  let info = { ok: false, embeddable: false }
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      info = { ok: true, embeddable: true, title: d.title, author: d.author_name }
    } else if (res.status === 401 || res.status === 403) {
      info = { ok: true, embeddable: false }
    }
  } catch {
    // YouTube didn't answer in time: don't block the link, just don't promise it plays
    return { ok: true, embeddable: false, unknown: true }
  }
  cache.set(id, info)
  if (cache.size > 2000) cache.delete(cache.keys().next().value)
  return info
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

// What the user ruled out: "not unplugged", "without the remix", "no lofi", "other than the cover"
const flat = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "")
export const exclusionsFrom = (text = "") => {
  const out = []
  const re = /\b(?:not|no|without|except|excluding|other than|instead of|don'?t want|dont want|avoid)\s+(?:the\s+|a\s+|an\s+|any\s+)?([\p{L}\p{N}'’ -]{2,40}?)(?=\s*(?:[,.!?;]|$|\b(?:and|but|or|version|one|please|pls|plz)\b))/giu
  for (const m of String(text).matchAll(re)) {
    const term = m[1].trim()
    // Skip ordinary words ("not working", "no idea"): keep short, specific terms
    if (term && term.split(/\s+/).length <= 3 && !/^(sure|working|able|now|idea|problem|need|good|bad|this|that|it)$/i.test(term)) out.push(term)
  }
  return out
}
const excludedBy = (title, exclude) => exclude.some((term) => flat(term).length >= 3 && flat(title).includes(flat(term)))

// Clean an answer: links to videos that don't exist are unlinked (their text stays), dead
// sources are dropped, and the first video that plays becomes a { type: "video" } card.
// exclude: things the user ruled out ("unplugged"): videos whose real title has them are skipped
// candidates: other search results to pick a video from when the answer's own ones don't fit
// Which video fits best: official uploads first; covers, remixes, slowed/lofi edits last,
// unless the user asked for one of those (asked = their message)
const VARIANTS = ["cover", "remix", "slowed", "reverb", "lofi", "lo-fi", "karaoke", "instrumental", "female version", "male version", "8d", "sped up", "mashup", "reaction"]
const fitScore = (title = "", asked = "") => {
  const t = title.toLowerCase()
  const a = asked.toLowerCase()
  let score = 0
  if (/official (music )?video|official audio|official lyric/.test(t)) score += 3
  else if (/\bofficial\b|\baudio\b/.test(t)) score += 1
  for (const v of VARIANTS) if (t.includes(v) && !a.includes(v)) score -= 4
  return score
}

export const verifyYoutube = async (reply, sources = [], { exclude = [], candidates = [], asked = "" } = {}) => {
  const urls = [...new Set([...(String(reply).match(URL_RE) || []), ...sources.map((s) => s.url), ...candidates])]
  const ids = [...new Set(urls.map(youtubeId).filter(Boolean))].slice(0, 12)
  if (!ids.length) return { reply, sources, video: null }
  const checks = new Map(await Promise.all(ids.map(async (id) => [id, await checkYoutube(id)])))
  // Dead, or something they said they don't want
  const dead = (url) => { const id = youtubeId(url); return id && (!checks.get(id)?.ok || (exclude.length && excludedBy(checks.get(id).title, exclude))) }
  const cleaned = String(reply).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (all, label, url) => (dead(url) ? label : all))
    .replace(URL_RE, (url) => (dead(url) ? "" : url))
  const kept = sources.filter((s) => !dead(s.url))
  // The video to show: the first playable one the answer links to, then the sources
  const order = [...(cleaned.match(URL_RE) || []), ...kept.map((s) => s.url), ...candidates]
  const playable = [...new Set(order)].filter((u) => { const id = youtubeId(u); return id && checks.get(id)?.embeddable && !dead(u) })
  // Best fit first; on a tie, the answer's own link wins (it comes first in `order`)
  const url = playable.map((u, i) => ({ u, i, s: fitScore(checks.get(youtubeId(u)).title, asked) })).sort((x, y) => y.s - x.s || x.i - y.i)[0]?.u
  const id = url && youtubeId(url)
  const video = id ? { type: "video", id, url, title: checks.get(id).title, author: checks.get(id).author } : null
  return { reply: cleaned, sources: kept, video }
}
