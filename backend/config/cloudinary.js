import { v2 as cloudinary } from "cloudinary"
import multer from "multer"

// Free plan limits: 10 MB per image/raw file. We keep everything under that.
export const MAX_FILE_BYTES = 10 * 1024 * 1024

let configured = false
const ensureConfig = () => {
  if (configured) return
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  configured = true
}

const ROOT_FOLDER = () => process.env.CLOUDINARY_FOLDER || "nexchat"

// What we accept. SVG is excluded (it can contain scripts).
const ALLOWED = [
  /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/,
  /^video\/(mp4|webm|quicktime)$/,
  /^audio\/(webm|ogg|mp4|mpeg|wav|aac|x-m4a)$/,
  /^application\/pdf$/,
  /^text\/(plain|csv)$/,
  /^application\/(zip|x-zip-compressed)$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$/,
]

// Multer keeps the file in memory; we stream it straight to Cloudinary.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    file.mimetype = file.mimetype.split(";")[0].trim()
    if (ALLOWED.some((re) => re.test(file.mimetype))) cb(null, true)
    else cb(new Error("This file type isn't supported"))
  },
})

// Wrap multer so errors come back as clean JSON instead of a crash page.
export const uploadSingle = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => {
    if (!err) return next()
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 10 MB)" : err.message
    res.status(400).json({ error: message })
  })

const kindOf = (mimetype) =>
  mimetype.startsWith("image/") ? "image"
    : mimetype.startsWith("video/") ? "video"
    : mimetype.startsWith("audio/") ? "audio"
    : "file"

// Upload a file buffer. Images arrive already compressed by the browser, so we
// store them as-is: no transformations, which keeps Cloudinary credit use low.
// `transformation` (optional) is applied once on upload, e.g. to crop an image
export const uploadToCloudinary = (file, { subfolder: forcedSubfolder, transformation } = {}) => {
  ensureConfig()
  const kind = kindOf(file.mimetype)
  // Cloudinary stores audio under the "video" resource type
  const resourceType = kind === "file" ? "raw" : kind === "audio" ? "video" : kind
  const subfolder = forcedSubfolder || { image: "images", video: "videos", audio: "voice", file: "files" }[kind]
  const folder = `${ROOT_FOLDER()}/${subfolder}`

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // Raw files keep their name + extension so downloads open correctly
        use_filename: kind === "file",
        unique_filename: true,
        filename_override: kind === "file" ? file.originalname : undefined,
        overwrite: false,
        ...(transformation ? { transformation } : {}),
      },
      (error, result) => {
        if (error) return reject(error)
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType,
          kind,
          name: file.originalname,
          size: result.bytes,
          mimeType: file.mimetype,
          width: result.width || null,
          height: result.height || null,
          duration: result.duration ? Math.round(result.duration) : null,
        })
      }
    )
    stream.end(file.buffer)
  })
}

// Delete stored files (frees storage credits). Never throws.
export const deleteFromCloudinary = async (attachments = []) => {
  const list = attachments.filter((a) => a?.publicId)
  if (!list.length) return
  ensureConfig()
  const byType = {}
  list.forEach((a) => (byType[a.resourceType] ||= []).push(a.publicId))
  await Promise.all(
    Object.entries(byType).map(async ([resourceType, ids]) => {
      // The Admin API deletes up to 100 at a time
      for (let i = 0; i < ids.length; i += 100) {
        try {
          await cloudinary.api.delete_resources(ids.slice(i, i + 100), { resource_type: resourceType })
        } catch (err) {
          console.log("Cloudinary delete error:", err?.error?.message || err.message)
        }
      }
    })
  )
}

// Profile photos: images only, small limit (the browser already shrinks them to ~400px)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true)
    else cb(new Error("Please choose a JPG, PNG or WebP image"))
  },
})

export const uploadAvatarSingle = (field) => (req, res, next) =>
  avatarUpload.single(field)(req, res, (err) => {
    if (!err) return next()
    const message = err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 2 MB)" : err.message
    res.status(400).json({ error: message })
  })

// A short-lived signed link for a stored file. Cloudinary blocks plain links to PDF/ZIP
// files on many accounts (401), but signed API downloads always work.
export const fileDownloadUrl = (attachment, minutes = 60) => {
  if (!attachment?.publicId || attachment.resourceType !== "raw") return attachment?.url || null
  ensureConfig()
  return cloudinary.utils.private_download_url(attachment.publicId, "", {
    resource_type: "raw",
    type: "upload",
    expires_at: Math.floor(Date.now() / 1000) + minutes * 60,
  })
}
