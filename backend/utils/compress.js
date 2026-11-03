// Shrink media before it goes to Cloudinary (free plan: storage and bandwidth are the limits).
// Images: sharp -> WebP, longest side at most 1600 px. Video: ffmpeg -> H.264 MP4, longest side
// at most 1280 px. Audio: ffmpeg -> AAC. A file is only replaced when the result is smaller,
// and anything that fails is uploaded as it was.
import { spawn, spawnSync } from "child_process"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import sharp from "sharp"

const MAX_IMAGE_SIDE = 1600
const IMAGE_QUALITY = 80
const MAX_VIDEO_SIDE = 1280
const VIDEO_MIN_BYTES = 1.5 * 1024 * 1024 // smaller clips are already fine
const AUDIO_MIN_BYTES = 1024 * 1024       // voice notes (Opus, ~250 KB a minute) are left alone

sharp.cache(false)
sharp.concurrency(1) // small server: one image at a time per call

const rename = (name, ext) => `${String(name || "file").replace(/\.[^.]+$/, "")}.${ext}`

// ── Images ─────────────────────────────────────────────────────
// lossless: for QR codes and other sharp-edged pictures that must stay crisp
export const compressImage = async (file, { lossless = false } = {}) => {
  // GIFs keep their animation; SVG is never accepted; HEIC can't be decoded here
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.mimetype)) return file
  try {
    const out = await sharp(file.buffer, { failOn: "none" })
      .rotate() // apply the phone's EXIF rotation, then drop the metadata
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
      .webp(lossless ? { lossless: true, effort: 4 } : { quality: IMAGE_QUALITY, effort: 4, smartSubsample: true })
      .toBuffer()
    if (out.length >= file.buffer.length) return file
    return { ...file, buffer: out, mimetype: "image/webp", originalname: rename(file.originalname, "webp"), size: out.length }
  } catch (err) {
    console.log("compressImage skipped:", err.message)
    return file
  }
}

// ── Video and audio (needs ffmpeg: installed in the Docker image) ──
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg"
let hasFfmpeg = null
const ffmpegReady = () => {
  if (hasFfmpeg === null) {
    try { hasFfmpeg = spawnSync(FFMPEG, ["-version"], { stdio: "ignore", timeout: 5000 }).status === 0 } catch { hasFfmpeg = false }
    if (!hasFfmpeg) console.log("ffmpeg not found: videos and audio are uploaded without compression")
  }
  return hasFfmpeg
}

let running = 0 // at most two encodes at once, so chats stay responsive
const MAX_RUNNING = 2

const ffmpeg = (args, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] })
  let errText = ""
  child.stderr.on("data", (d) => { errText = (errText + d).slice(-500) })
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs)
  child.on("error", reject)
  child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(errText || `ffmpeg exited ${code}`)) })
})

const transcode = async (file, outExt, args, timeoutMs) => {
  if (!ffmpegReady() || running >= MAX_RUNNING) return file
  running++
  const dir = await mkdtemp(join(tmpdir(), "kova-media-"))
  try {
    const input = join(dir, "in")
    const output = join(dir, `out.${outExt}`)
    await writeFile(input, file.buffer)
    await ffmpeg(["-i", input, ...args, output], timeoutMs)
    const out = await readFile(output)
    if (!out.length || out.length >= file.buffer.length) return file
    return { ...file, buffer: out, originalname: rename(file.originalname, outExt), size: out.length }
  } catch (err) {
    console.log("transcode skipped:", err.message)
    return file
  } finally {
    running--
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// Longest side at most 1280 px, even sizes (H.264 needs them), never upscaled
const SCALE = `scale='if(gte(iw,ih),min(${MAX_VIDEO_SIDE},iw),-2)':'if(gte(iw,ih),-2,min(${MAX_VIDEO_SIDE},ih))'`

export const compressVideo = async (file) => {
  if (file.buffer.length < VIDEO_MIN_BYTES) return file
  const out = await transcode(file, "mp4", [
    "-map", "0:v:0", "-map", "0:a:0?", "-vf", SCALE,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart",
  ], 120_000)
  return out === file ? file : { ...out, mimetype: "video/mp4" }
}

export const compressAudio = async (file) => {
  // Browser voice notes are Opus already; only big files (WAV, high-bitrate MP3) are worth it
  if (file.buffer.length < AUDIO_MIN_BYTES || /opus|ogg/.test(file.mimetype)) return file
  const out = await transcode(file, "m4a", ["-vn", "-c:a", "aac", "-b:a", "96k"], 60_000)
  return out === file ? file : { ...out, mimetype: "audio/mp4" }
}

// One entry point for uploads: picks the right compressor for the file
export const compressMedia = async (file, { lossless = false } = {}) => {
  if (!file?.buffer?.length) return file
  if (file.mimetype.startsWith("image/")) return compressImage(file, { lossless })
  if (file.mimetype.startsWith("video/")) return compressVideo(file)
  if (file.mimetype.startsWith("audio/")) return compressAudio(file)
  return file
}
