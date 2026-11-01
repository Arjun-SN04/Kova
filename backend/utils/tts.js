import crypto from "crypto"
import { askGroq } from "./groq.js"
import { isHindi, speakHindi } from "./ttsHindi.js"

// Expressive text to speech with Groq's Orpheus model.
// Orpheus takes up to ~200 characters per request and reads short directions like "[warm]"
// or "[whisper]" as how to say the line. So: plan voice + moods, synthesize the pieces in
// parallel, then join the WAV audio with small pauses.

const MODEL = process.env.TTS_MODEL || "canopylabs/orpheus-v1-english"
const URL = "https://api.groq.com/openai/v1/audio/speech"
const FEMALE = ["hannah", "diana", "autumn"]
const MAX_PIECE = 190
const MAX_TEXT = 2400

// Voice uses GROQ_TTS_KEYS (accounts that accepted the Orpheus terms); falls back to GROQ_API_KEYS
const keys = () => (process.env.GROQ_TTS_KEYS || process.env.GROQ_API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean)
let next = 0
// Keys whose Groq account hasn't accepted the voice model's terms: skipped for voice
const noTerms = new Set()

// Markdown, links and emoji out: only words get spoken
export const speakable = (text) => String(text || "")
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/https?:\/\/\S+/g, "")
  .replace(/[*_`#>~|]/g, "")
  .replace(/^\s*[-•]\s+/gm, "")
  .replace(/\p{Extended_Pictographic}/gu, "")
  .replace(/[ \t]+/g, " ")
  .trim()
  .slice(0, MAX_TEXT)

// Sentence / line sized pieces under the model's limit
const split = (text) => {
  const out = []
  for (const para of text.split(/\n{2,}/)) {
    const parts = para.split(/\n|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
    let cur = ""
    for (const p of parts) {
      if (p.length > MAX_PIECE) {
        if (cur) { out.push({ text: cur }); cur = "" }
        for (let i = 0; i < p.length; i += MAX_PIECE) out.push({ text: p.slice(i, i + MAX_PIECE) })
      } else if ((cur + " " + p).trim().length > MAX_PIECE) { out.push({ text: cur }); cur = p } else cur = (cur + " " + p).trim()
    }
    if (cur) out.push({ text: cur })
    if (out.length) out[out.length - 1].pauseAfter = 650 // a longer breath between stanzas / paragraphs
  }
  return out
}

// One quick model call: which voice suits the piece, and how to say each part
const plan = async (pieces) => {
  const fallback = { voice: "hannah", moods: pieces.map(() => "warm") }
  try {
    const raw = await askGroq([
      { role: "system", content: `You direct a voice actor reading a message aloud.
Always use "female".
For each numbered part give ONE short vocal direction (1-2 words) that fits its emotion, e.g. warm, tender, gentle, romantic, soft, longing, wistful, cheerful, excited, playful, calm, reassuring, serious, sad, whisper, dramatic, hopeful, proud.
Let the mood move with the text (a poem can start gentle, grow longing, end hopeful). Facts and instructions: calm or friendly.
Return ONLY JSON: {"voice": "female" | "male", "moods": ["...", ...]} with exactly ${pieces.length} moods.` },
      { role: "user", content: pieces.map((p, i) => `${i + 1}. ${p.text}`).join("\n") },
    ], { maxTokens: 400, temperature: 0.3 })
    const parsed = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || "{}")
    const moods = Array.isArray(parsed.moods) ? parsed.moods.map((m) => String(m).replace(/[^a-z\s-]/gi, "").trim().split(/\s+/).slice(0, 2).join(" ").toLowerCase() || "warm") : []
    while (moods.length < pieces.length) moods.push(moods[moods.length - 1] || "warm")
    // Always a female voice
    return { voice: FEMALE[0], moods: moods.slice(0, pieces.length) }
  } catch {
    return fallback
  }
}

// "12s", "1m3.5s", "600ms" or seconds as a number → milliseconds
const resetMs = (retryAfter, reset) => {
  if (retryAfter && !Number.isNaN(Number(retryAfter))) return Number(retryAfter) * 1000
  if (!reset) return null
  let ms = 0
  for (const [, n, unit] of String(reset).matchAll(/([\d.]+)(ms|h|m|s)/g)) ms += Number(n) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit]
  return ms || null
}

class TtsError extends Error {
  constructor(message, code) { super(message); this.code = code }
}

const synth = async (input, voice) => {
  const all = keys().filter((k) => !noTerms.has(k))
  if (!keys().length) throw new TtsError("Voice isn't set up on this server.", "not_configured")
  if (!all.length) throw new TtsError("The voice model needs to be enabled on the Groq account first.", "terms")
  let last
  let waits = 0
  for (let attempt = 0; attempt < all.length; attempt++) {
    const key = all[next++ % all.length]
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, voice, input, response_format: "wav" }),
      signal: AbortSignal.timeout(30_000),
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    // Per-minute character limit (free plan: 1,200/min): wait for it to reset and try again
    if (res.status === 429 && waits < 4) {
      const ms = resetMs(res.headers.get("retry-after"), res.headers.get("x-ratelimit-reset-tokens"))
      if (ms !== null && ms <= 65_000) { waits++; attempt--; next--; await new Promise((r) => setTimeout(r, ms + 250)); continue }
    }
    const err = await res.json().catch(() => ({}))
    last = err.error
    if (err.error?.code === "model_terms_required" || /terms acceptance/i.test(err.error?.message || "")) {
      noTerms.add(key)
      if (noTerms.size >= keys().length) throw new TtsError("The voice model needs to be enabled on the Groq account first.", "terms")
      continue
    }
    if ([401, 403, 429].includes(res.status) || res.status >= 500) continue
    throw new TtsError(err.error?.message || "Couldn't make the audio.", "failed")
  }
  throw new TtsError(last?.message || "Voice is busy right now. Try again in a minute.", "busy")
}

// ── WAV joining: take each file's PCM data and write one header for all of it ──
const readWav = (buf) => {
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("Not a WAV file")
  let pos = 12
  let fmt = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4)
    let size = buf.readUInt32LE(pos + 4)
    const start = pos + 8
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(start + 2), rate: buf.readUInt32LE(start + 4), bits: buf.readUInt16LE(start + 14) }
    if (id === "data") {
      // Streaming encoders sometimes write 0 or 0xFFFFFFFF as the size: take the rest of the file
      if (!size || size === 0xffffffff || start + size > buf.length) size = buf.length - start
      return { fmt, data: buf.subarray(start, start + size) }
    }
    pos = start + size + (size % 2)
  }
  throw new Error("WAV has no data")
}

export const joinWavs = (buffers, pauses = []) => {
  const parts = buffers.map(readWav)
  const fmt = parts[0].fmt || { channels: 1, rate: 24000, bits: 16 }
  const bytesPerMs = (fmt.rate * fmt.channels * (fmt.bits / 8)) / 1000
  const silence = (ms) => Buffer.alloc(Math.round((ms * bytesPerMs) / (fmt.channels * fmt.bits / 8)) * (fmt.channels * fmt.bits / 8))
  const chunks = []
  parts.forEach((p, i) => { chunks.push(p.data); if (i < parts.length - 1) chunks.push(silence(pauses[i] ?? 280)) })
  const data = Buffer.concat(chunks)
  const header = Buffer.alloc(44)
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8)
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(fmt.channels, 22); header.writeUInt32LE(fmt.rate, 24)
  header.writeUInt32LE(fmt.rate * fmt.channels * (fmt.bits / 8), 28); header.writeUInt16LE(fmt.channels * (fmt.bits / 8), 32)
  header.writeUInt16LE(fmt.bits, 34); header.write("data", 36); header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

// Recently spoken messages stay in memory, so playing one again is instant and free
const cache = new Map()
const CACHE_MAX = 40

// Text → { audio, type }. Hindi / Hinglish → Indian neural voice (MP3, utils/ttsHindi.js);
// everything else → Orpheus with a voice and moods chosen for it (WAV).
export const speakText = async (text) => {
  const clean = speakable(text)
  if (!clean) throw new TtsError("Nothing to read.", "empty")
  const key = crypto.createHash("sha1").update(clean).digest("hex")
  if (cache.has(key)) return cache.get(key)

  if (isHindi(clean)) {
    try {
      const out = { audio: await speakHindi(clean), type: "audio/mpeg" }
      cache.set(key, out)
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
      return out
    } catch (e) {
      throw new TtsError(`Hindi voice failed: ${e.message}`, "failed")
    }
  }

  const pieces = split(clean)
  const { voice, moods } = await plan(pieces)
  // Two at a time keeps within the per-minute limit
  const audio = new Array(pieces.length)
  for (let i = 0; i < pieces.length; i += 2) {
    const batch = pieces.slice(i, i + 2)
    const out = await Promise.all(batch.map((p, j) => synth(`[${moods[i + j]}] ${p.text}`.slice(0, 200), voice)))
    out.forEach((b, j) => { audio[i + j] = b })
  }
  const out = { audio: joinWavs(audio, pieces.map((p) => p.pauseAfter)), type: "audio/wav" }
  cache.set(key, out)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return out
}
