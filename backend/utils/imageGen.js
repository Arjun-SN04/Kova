import { createRequire } from "module"

// Pictures for Nexa. Nobody signs in; providers are tried in this order:
// 1. Cloudflare Workers AI FLUX (best quality, no watermark). Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
//    Free: 10,000 neurons a day, about 95 klein-4b or 170 schnell images at 1024px.
// 2. Puter FLUX with Kova's Puter account, if PUTER_AUTH_TOKEN is set.
// 3. SubNP free API (no key). Its small watermark is cropped off when we store the image.
// Returns { buffer, mimetype, transformation? } (transformation: applied by Cloudinary on upload).

const require = createRequire(import.meta.url)
const err = (message, status, cause) => Object.assign(new Error(message), { status, cause })
const SIZES = { square: [1024, 1024], portrait: [768, 1024], landscape: [1024, 768] }

const download = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const mimetype = (res.headers.get("content-type") || "").split(";")[0].trim()
  if (!res.ok || !mimetype.startsWith("image/")) throw new Error(`image download failed (${res.status} ${mimetype})`)
  return { buffer: Buffer.from(await res.arrayBuffer()), mimetype }
}

const fromBase64 = (b64) => {
  const buffer = Buffer.from(b64, "base64")
  const mimetype = buffer[0] === 0x89 ? "image/png" : buffer[0] === 0x52 ? "image/webp" : "image/jpeg"
  return { buffer, mimetype }
}

// ── Cloudflare Workers AI ──────────────────────────────────────
const CF_MODELS = (process.env.CLOUDFLARE_IMAGE_MODELS || "@cf/black-forest-labs/flux-2-klein-4b,@cf/black-forest-labs/flux-1-schnell")
  .split(",").map((m) => m.trim()).filter(Boolean)

const cloudflare = async (prompt, shape, model) => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`
  const headers = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }
  const [width, height] = SIZES[shape] || SIZES.square
  let body
  if (model.includes("flux-1-schnell")) {
    // JSON in, always square
    headers["Content-Type"] = "application/json"
    body = JSON.stringify({ prompt: prompt.slice(0, 2048), steps: 6 })
  } else {
    // FLUX.2 models take a multipart form
    body = new FormData()
    body.append("prompt", prompt)
    body.append("width", String(width))
    body.append("height", String(height))
  }
  const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(90_000) })
  const data = await res.json().catch(() => ({}))
  if (res.status === 429 || data.errors?.some((e) => /neuron|limit|quota/i.test(e.message))) throw err("Daily free image limit reached. Try again tomorrow.", 429)
  const image = data.result?.image
  if (!res.ok || !image) throw new Error(`Cloudflare ${res.status} ${data.errors?.map((e) => e.message).join("; ") || ""}`)
  return fromBase64(image)
}

// ── Puter ──────────────────────────────────────────────────────
const PUTER_MODEL = process.env.PUTER_IMAGE_MODEL || "black-forest-labs/flux-schnell"
let puterClient = null

const puter = async (prompt, shape) => {
  puterClient ||= require("@heyputer/puter.js/src/init.cjs").init(process.env.PUTER_AUTH_TOKEN)
  const [width, height] = SIZES[shape] || SIZES.square
  let img
  try {
    img = await puterClient.ai.txt2img(prompt, { model: PUTER_MODEL, width, height })
  } catch {
    img = await puterClient.ai.txt2img(prompt, { model: PUTER_MODEL }) // some models don't take sizes
  }
  const src = String(img?.src || img || "")
  const data = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (data) return { buffer: Buffer.from(data[3], data[2] ? "base64" : "utf8"), mimetype: data[1]?.startsWith("image/") ? data[1] : "image/png" }
  if (/^https:\/\//.test(src)) return download(src)
  throw new Error("unexpected Puter response")
}

// ── SubNP (no key) ─────────────────────────────────────────────
// "magic" puts a small mark in the bottom-right corner: keep the top 92% of the image.
// ("flux" there is Pollinations with a big logo, so it's not used.)
const SUBNP_MODELS = (process.env.SUBNP_MODELS || "magic").split(",").map((m) => m.trim()).filter(Boolean)
const SUBNP_CROP = [{ crop: "crop", gravity: "north", width: "1.0", height: "0.92" }]
const SHAPE_HINT = { portrait: ", vertical portrait composition", landscape: ", wide landscape composition", square: "" }

const subnp = async (prompt, shape, model) => {
  const res = await fetch("https://subnp.com/api/free/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt + (SHAPE_HINT[shape] || ""), model }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`SubNP ${res.status}`)
  // Server-sent events: "data: {status: processing | complete | error, ...}"
  const events = (await res.text()).split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => { try { return JSON.parse(line.slice(5)) } catch { return null } })
    .filter(Boolean)
  const done = events.find((e) => e.status === "complete" && e.imageUrl)
  if (!done) throw new Error(events.find((e) => e.status === "error")?.error || "no image returned")
  return { ...(await download(done.imageUrl)), transformation: SUBNP_CROP }
}

// ── Try each provider in turn ─────────────────────────────────
export const generateImage = async (prompt, shape = "square") => {
  const attempts = [
    ...(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN ? CF_MODELS.map((m) => ({ name: m, run: () => cloudflare(prompt, shape, m) })) : []),
    ...(process.env.PUTER_AUTH_TOKEN ? [{ name: "puter", run: () => puter(prompt, shape) }] : []),
    ...SUBNP_MODELS.map((m) => ({ name: `subnp:${m}`, run: () => subnp(prompt, shape, m) })),
  ]
  const failures = []
  for (const { name, run } of attempts) {
    try {
      return await run()
    } catch (e) {
      failures.push(`${name}: ${e?.error?.message || e?.message || e}`)
    }
  }
  throw err("Couldn't create the image right now. Try again in a bit.", 502, failures.join(" | "))
}
