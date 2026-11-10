import dns from "node:dns/promises"
import net from "node:net"
import http from "node:http"
import https from "node:https"
import zlib from "node:zlib"
import { Message } from "../models/message.model.js"

// Link previews: for the first link in a message, read the page's title, description,
// image and site name (Open Graph tags), save them on the message and update everyone
// in the chat. Only public web pages are fetched: links to private / local addresses are
// skipped, so a message can't make the server probe its own network.

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/i
const MAX_BYTES = 512 * 1024
const TIMEOUT = 6000
const cache = new Map() // url -> { at, preview }
const CACHE_MS = 6 * 3600_000

export const firstUrl = (text) => {
  const m = String(text || "").match(URL_RE)
  return m ? m[0].replace(/[.,!?;:]+$/, "") : null
}

const privateV4 = (ip) => {
  const [a, b] = ip.split(".").map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}
const privateIp = (ip) => {
  if (net.isIPv4(ip)) return privateV4(ip)
  const v = ip.toLowerCase()
  if (v.startsWith("::ffff:")) return privateV4(v.slice(7))
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")
}
// Checked again when connecting (see safeLookup), so a domain that answers with a public
// address here and a private one a moment later still can't reach the private one
const safeUrl = async (raw) => {
  let u
  try { u = new URL(raw) } catch { return null }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null
  if (u.port && !["80", "443"].includes(u.port)) return null
  const host = u.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null
  if (net.isIP(host)) return privateIp(host) ? null : u
  return u
}

// DNS lookup for the actual connection: refuse if any address is private.
// The connection then uses exactly the addresses that were checked.
const safeLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }).then((addrs) => {
    if (!addrs.length || addrs.some((a) => privateIp(a.address))) {
      return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }))
    }
    if (options?.all) callback(null, addrs)
    else callback(null, addrs[0].address, addrs[0].family)
  }, callback)
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; KovaBot/1.0; +link-preview)",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Encoding": "gzip, deflate, br",
}

// One GET with no redirects followed: { status, headers, body } (body = readable stream)
const get = (u) => new Promise((resolve, reject) => {
  const lib = u.protocol === "https:" ? https : http
  const req = lib.get(u, { headers: HEADERS, lookup: safeLookup, timeout: TIMEOUT }, (res) => {
    const enc = String(res.headers["content-encoding"] || "").toLowerCase()
    const body = enc === "gzip" ? res.pipe(zlib.createGunzip())
      : enc === "deflate" ? res.pipe(zlib.createInflate())
      : enc === "br" ? res.pipe(zlib.createBrotliDecompress())
      : res
    resolve({ status: res.statusCode, headers: res.headers, body, close: () => res.destroy() })
  })
  req.on("timeout", () => req.destroy(new Error("timeout")))
  req.on("error", reject)
})

// Fetch with manual redirects (each hop checked again), reading at most MAX_BYTES of HTML
const fetchHtml = async (raw) => {
  let url = raw
  const deadline = Date.now() + TIMEOUT
  for (let hop = 0; hop < 4; hop++) {
    const u = await safeUrl(url)
    if (!u) return null
    const res = await get(u).catch(() => null)
    if (!res) return null
    try {
      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        url = new URL(res.headers.location, u).toString()
        continue
      }
      if (res.status < 200 || res.status >= 300 || !/text\/html|xhtml/i.test(res.headers["content-type"] || "")) return null
      const chunks = []
      let size = 0
      for await (const chunk of res.body) {
        chunks.push(chunk); size += chunk.length
        if (size >= MAX_BYTES || Date.now() > deadline) break
      }
      return { html: Buffer.concat(chunks).toString("utf8").slice(0, MAX_BYTES), finalUrl: u }
    } catch {
      return null
    } finally {
      res.close()
    }
  }
  return null
}

const decode = (s) => String(s || "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, " ").trim()

const meta = (html, names) => {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i")
    const tag = html.match(re)?.[0]
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1] || tag?.match(/content=([^\s>]+)/i)?.[1]
    if (content) return decode(content)
  }
  return ""
}

export const getPreview = async (url) => {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.preview
  let preview = null
  try {
    const page = await fetchHtml(url)
    if (page) {
      const { html, finalUrl } = page
      const title = meta(html, ["og:title", "twitter:title"]) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1])
      if (title) {
        let image = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"])
        try { image = image ? new URL(image, finalUrl).toString() : "" } catch { image = "" }
        if (!image.startsWith("https://")) image = "" // http images would be blocked on an https site
        preview = {
          url,
          title: title.slice(0, 200),
          description: (meta(html, ["og:description", "twitter:description", "description"]) || "").slice(0, 300),
          image: image.slice(0, 1000),
          site: (meta(html, ["og:site_name"]) || finalUrl.hostname.replace(/^www\./, "")).slice(0, 80),
        }
      }
    }
  } catch { /* no preview */ }
  cache.set(url, { at: Date.now(), preview })
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  return preview
}

// Add (or clear, after an edit) the preview for a message, then tell the chat
export const attachLinkPreview = async (message) => {
  try {
    const url = firstUrl(message.message)
    if (!url && !message.linkPreview) return
    if (url && message.linkPreview?.url === url) return
    const preview = url ? await getPreview(url) : null
    if (!preview && !message.linkPreview) return
    const updated = await Message.findByIdAndUpdate(message._id, { $set: { linkPreview: preview } }, { new: true })
    if (!updated) return
    const { notifyAudience } = await import("../controller/message.controller.js")
    await notifyAudience(updated, "messageEdited", updated)
  } catch (err) {
    console.log("link preview error:", err.message)
  }
}
