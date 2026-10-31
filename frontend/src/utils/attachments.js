// Attachments: validation, in-browser compression and display helpers.
// Compressing before upload keeps Cloudinary storage + bandwidth (free plan credits) low.

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // Cloudinary free plan limit for images/files
const MAX_IMAGE_DIMENSION = 1600 // px, longest side
const IMAGE_QUALITY = 0.8

export const ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
].join(',')

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|mp4|webm|mov|mp3|m4a|ogg|wav|pdf|txt|csv|zip|docx?|xlsx?|pptx?)$/i

export const kindOf = (type = '') =>
  type.startsWith('image/') ? 'image'
    : type.startsWith('video/') ? 'video'
    : type.startsWith('audio/') ? 'audio'
    : 'file'

export const formatBytes = (bytes = 0) =>
  bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

// Short label used in previews and reply quotes
export const attachmentLabel = (a) =>
  !a ? '' : a.kind === 'image' ? 'Photo' : a.kind === 'video' ? 'Video' : a.kind === 'audio' ? 'Voice message' : a.name || 'File'

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality))

// Resize to max 1600px and re-encode as WebP (JPEG fallback). GIFs are left alone
// so animations keep working. If compression doesn't help, the original is kept.
export const compressImage = async (file) => {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    let blob = await toBlob(canvas, 'image/webp', IMAGE_QUALITY)
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', IMAGE_QUALITY)
    if (!blob || blob.size >= file.size) return file

    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${ext}`, { type: blob.type })
  } catch {
    return file // e.g. HEIC in browsers that can't decode it
  }
}

// Validate + compress a picked/pasted/dropped file. Throws an Error with a friendly message.
export const prepareFile = async (file) => {
  const kind = kindOf(file.type)
  const allowed = (kind !== 'file' && !file.type.includes('svg')) || ALLOWED_EXTENSIONS.test(file.name)
  if (!allowed) throw new Error("This file type isn't supported")

  const out = kind === 'image' ? await compressImage(file) : file
  if (out.size > MAX_FILE_BYTES) throw new Error('File is too large (max 10 MB)')

  return {
    file: out,
    kind,
    originalSize: file.size,
    previewUrl: kind === 'image' || kind === 'video' ? URL.createObjectURL(out) : null,
  }
}

// Profile photos: centre-crop to a square and shrink to 400px before uploading.
export const compressAvatar = async (file) => {
  if (!/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(file.type)) throw new Error('Please choose an image')
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("This image can't be read. Try a JPG or PNG.")
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(400, side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d').drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, size, size,
  )
  bitmap.close?.()
  let blob = await toBlob(canvas, 'image/webp', 0.85)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85)
  return new File([blob], `avatar.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type })
}

// Save a file to the device. Cloudinary is another site, so <a download> would just open it:
// fetch it as a blob first, then save. Falls back to opening it in a new tab.
const MORE_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf', 'text/plain': 'txt' }
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
// saveAs: let the person pick the folder and name (Chrome/Edge); other browsers download normally
export const canSaveAs = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window
export const downloadFile = async (url, name = 'kova-image', { saveAs = false } = {}) => {
  try {
    const res = await fetch(url, { credentials: url.startsWith('/') ? 'include' : 'omit' })
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    const ext = EXT[blob.type] || MORE_EXT[blob.type]
    const file = ext && !/\.\w{2,5}$/.test(name) ? `${name}.${ext}` : name
    if (saveAs && canSaveAs()) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: file })
        const w = await handle.createWritable()
        await w.write(blob); await w.close()
        return true
      } catch (e) {
        if (e?.name === 'AbortError') return false // closed the picker
      }
    }
    const href = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href, download: file })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 2000)
    return true
  } catch {
    window.open(url, '_blank', 'noopener')
    return false
  }
}
