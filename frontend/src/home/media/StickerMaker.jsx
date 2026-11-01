import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { LuCircle, LuImagePlus, LuLoaderCircle, LuMinus, LuPlus, LuSendHorizontal, LuSquare, LuType, LuX, LuImage, LuSticker } from 'react-icons/lu'
import useStickers from '../../Zustand/useStickers'

const S = 512 // stickers are 512×512, like on other chat apps
const PAD = 30 // room for the white outline
const INNER = S - PAD * 2
const MAX_BYTES = 1024 * 1024

const SHAPES = [
  { id: 'cutout', label: 'Original', Icon: LuImage },
  { id: 'rounded', label: 'Rounded', Icon: LuSquare },
  { id: 'circle', label: 'Circle', Icon: LuCircle },
]

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

const roundedPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Split a caption into at most 2 lines that fit, shrinking the font if needed
const fitText = (ctx, text) => {
  for (let size = 76; size >= 30; size -= 4) {
    ctx.font = `900 ${size}px Impact, "Arial Black", system-ui, sans-serif`
    const words = text.split(/\s+/)
    const lines = ['']
    for (const w of words) {
      const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w
      if (ctx.measureText(next).width <= S - 44) lines[lines.length - 1] = next
      else lines.push(w)
    }
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= S - 44)) return { size, lines }
  }
  return { size: 30, lines: [text.slice(0, 28)] }
}

// Draw the sticker onto `canvas`
const paint = (canvas, { img, zoom, pos, shape, outline, text, textAt }) => {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, S, S)
  if (!img) return

  // 1. The photo, clipped to the shape
  const layer = document.createElement('canvas')
  layer.width = layer.height = S
  const l = layer.getContext('2d')
  const fit = shape === 'cutout' ? Math.min(INNER / img.width, INNER / img.height) : Math.max(INNER / img.width, INNER / img.height)
  const scale = fit * zoom
  const w = img.width * scale
  const h = img.height * scale
  l.save()
  if (shape === 'rounded') { roundedPath(l, PAD, PAD, INNER, INNER, 84); l.clip() }
  if (shape === 'circle') { l.beginPath(); l.arc(S / 2, S / 2, INNER / 2, 0, Math.PI * 2); l.clip() }
  if (shape === 'cutout') { l.beginPath(); l.rect(PAD, PAD, INNER, INNER); l.clip() }
  l.imageSmoothingQuality = 'high'
  l.drawImage(img, S / 2 - w / 2 + pos.x, S / 2 - h / 2 + pos.y, w, h)
  l.restore()

  // 2. A white outline that follows the shape (or the photo's own transparent edges)
  if (outline) {
    const sil = document.createElement('canvas')
    sil.width = sil.height = S
    const s = sil.getContext('2d')
    s.drawImage(layer, 0, 0)
    s.globalCompositeOperation = 'source-in'
    s.fillStyle = '#fff'
    s.fillRect(0, 0, S, S)
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = 10
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2
      ctx.drawImage(sil, Math.cos(t) * 14, Math.sin(t) * 14)
      if (a === 0) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0 }
    }
    ctx.restore()
  }
  ctx.drawImage(layer, 0, 0)

  // 3. Caption: white with a dark edge, like a meme
  const caption = text.trim()
  if (caption) {
    const { size, lines } = fitText(ctx, caption.toUpperCase())
    ctx.font = `900 ${size}px Impact, "Arial Black", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.round(size / 5.5)
    ctx.strokeStyle = '#111'
    ctx.fillStyle = '#fff'
    const lh = size * 1.02
    const top = textAt === 'top' ? PAD + lh / 2 + 6 : S - PAD - lh / 2 - 6 - (lines.length - 1) * lh
    lines.forEach((line, i) => {
      ctx.strokeText(line, S / 2, top + i * lh)
      ctx.fillText(line, S / 2, top + i * lh)
    })
  }
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality))
const exportSticker = async (canvas) => {
  for (const q of [0.92, 0.8, 0.65]) {
    const b = await toBlob(canvas, 'image/webp', q)
    if (b && b.type === 'image/webp' && b.size <= MAX_BYTES) return b
    if (!b || b.type !== 'image/webp') break // this browser can't make WebP
  }
  const png = await toBlob(canvas, 'image/png')
  if (png && png.size <= MAX_BYTES) return png
  throw new Error('That sticker is too detailed to save. Try zooming in.')
}

const Toggle = ({ on, onClick, children, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    aria-label={label}
    className={`flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition ${
      on ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/10'
    }`}
  >
    {children}
  </button>
)

// Make a sticker from a photo. `src`: a photo to start with (e.g. from the chat), or null.
// `onSend(media)`: when set, a "Save and send" button sends it to the open chat.
const StickerMaker = ({ src = null, onClose, onSend }) => {
  const create = useStickers((s) => s.create)
  const canvasRef = useRef(null)
  const fileRef = useRef(null)
  const drag = useRef(null)
  const [img, setImg] = useState(null)
  const [loadingImg, setLoadingImg] = useState(!!src)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [shape, setShape] = useState('cutout')
  const [outline, setOutline] = useState(true)
  const [text, setText] = useState('')
  const [textAt, setTextAt] = useState('bottom')
  const [busy, setBusy] = useState(null) // 'save' | 'send'
  const [error, setError] = useState('')

  const openImage = useCallback(async (url) => {
    setLoadingImg(true)
    setError('')
    try {
      const image = await loadImage(url)
      setImg(image); setZoom(1); setPos({ x: 0, y: 0 })
    } catch {
      setError("Couldn't open that photo. Choose one from your device instead.")
    } finally {
      setLoadingImg(false)
    }
  }, [])

  useEffect(() => { if (src) openImage(src) }, [src, openImage])

  // Redraw on every change
  useEffect(() => {
    if (canvasRef.current) paint(canvasRef.current, { img, zoom, pos, shape, outline, text, textAt })
  }, [img, zoom, pos, shape, outline, text, textAt])

  // Esc closes; the page behind doesn't scroll
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); html.style.overflow = before }
  }, [onClose, busy])

  // Mouse wheel / trackpad zoom (non-passive so the page doesn't scroll)
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!img) return
      e.preventDefault()
      setZoom((z) => Math.min(4, Math.max(0.4, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [img])

  const onPointerDown = (e) => {
    if (!img) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, pos, k: S / e.currentTarget.getBoundingClientRect().width }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    setPos({ x: d.pos.x + (e.clientX - d.x) * d.k, y: d.pos.y + (e.clientY - d.y) * d.k })
  }
  const onPointerUp = () => { drag.current = null }

  const pickFile = (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Choose a photo')
    openImage(URL.createObjectURL(f))
  }

  const finish = async (send) => {
    if (!img || busy) return
    setBusy(send ? 'send' : 'save')
    setError('')
    try {
      const blob = await exportSticker(canvasRef.current)
      const sticker = await create(blob, text.trim())
      if (send && onSend) onSend({ kind: 'sticker', url: sticker.url, title: sticker.title || 'Sticker', width: sticker.width, height: sticker.height })
      else useStickers.getState().say('Sticker saved. Find it under Stickers → Yours')
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={() => !busy && onClose()}
      role="dialog" aria-modal="true" aria-label="Create a sticker"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:max-w-[440px] sm:rounded-3xl dark:bg-slate-900 dark:ring-white/10"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-fuchsia-500 text-white shadow-sm"><LuSticker className="size-4.5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Create a sticker</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Drag to move · scroll or use − + to zoom</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"><LuX className="size-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {/* Canvas on a checkerboard, so transparent parts are visible */}
          <div
            className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-white/10"
            style={{ backgroundImage: 'conic-gradient(rgba(148,163,184,.18) 25%, transparent 0 50%, rgba(148,163,184,.18) 0 75%, transparent 0)', backgroundSize: '20px 20px' }}
          >
            <canvas
              ref={canvasRef}
              width={S}
              height={S}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`size-full touch-none ${img ? 'cursor-grab active:cursor-grabbing' : ''}`}
            />
            {!img && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 transition hover:bg-slate-500/5 dark:text-slate-400"
              >
                {loadingImg ? <LuLoaderCircle className="size-6 animate-spin" /> : (
                  <>
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-white/10"><LuImagePlus className="size-5.5 text-indigo-600 dark:text-indigo-400" /></span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Choose a photo</span>
                    <span className="text-xs">PNGs with a see-through background look best</span>
                  </>
                )}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />

          {img && (
            <div className="mt-4 space-y-3.5">
              {/* Zoom + change photo */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setZoom((z) => Math.max(0.4, z / 1.15))} aria-label="Zoom out" className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><LuMinus className="size-4" /></button>
                <input type="range" min={0.4} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-indigo-600" />
                <button type="button" onClick={() => setZoom((z) => Math.min(4, z * 1.15))} aria-label="Zoom in" className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><LuPlus className="size-4" /></button>
                <button type="button" onClick={() => fileRef.current?.click()} className="ml-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">Change</button>
              </div>

              {/* Shape + outline */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Shape</p>
                <div className="flex flex-wrap gap-1.5">
                  {SHAPES.map(({ id, label, Icon }) => (
                    <Toggle key={id} on={shape === id} onClick={() => { setShape(id); setZoom(1); setPos({ x: 0, y: 0 }) }}><Icon className="size-3.5" /> {label}</Toggle>
                  ))}
                  <Toggle on={outline} onClick={() => setOutline((o) => !o)} label="White outline">Outline</Toggle>
                </div>
              </div>

              {/* Caption */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Text</p>
                <div className="flex gap-1.5">
                  <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 dark:bg-white/[0.06]">
                    <LuType className="size-4 shrink-0 text-slate-400" />
                    <input value={text} onChange={(e) => setText(e.target.value.slice(0, 40))} placeholder="Add a caption (optional)" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" />
                  </label>
                  <Toggle on={textAt === 'top'} onClick={() => setTextAt('top')}>Top</Toggle>
                  <Toggle on={textAt === 'bottom'} onClick={() => setTextAt('bottom')}>Bottom</Toggle>
                </div>
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20">{error}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-slate-100 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] dark:border-white/5">
          <button
            type="button"
            onClick={() => finish(false)}
            disabled={!img || !!busy}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition disabled:opacity-40 ${onSend ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/10' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            {busy === 'save' && <LuLoaderCircle className="size-4 animate-spin" />} Save sticker
          </button>
          {onSend && (
            <button
              type="button"
              onClick={() => finish(true)}
              disabled={!img || !!busy}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
            >
              {busy === 'send' ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuSendHorizontal className="size-4" />} Save and send
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

// Mount once near a message box: shows the maker when it's opened from anywhere
// (the picker or a photo's menu), plus short "Saved" notices.
export const StickerHost = ({ onSend }) => {
  const maker = useStickers((s) => s.maker)
  const closeMaker = useStickers((s) => s.closeMaker)
  const notice = useStickers((s) => s.notice)
  return (
    <>
      {maker && <StickerMaker src={maker.src} onClose={closeMaker} onSend={onSend} />}
      {notice && createPortal(
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex justify-center px-4">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur dark:bg-white/90 dark:text-slate-900">
            {notice}
          </motion.p>
        </div>,
        document.body,
      )}
    </>
  )
}

export default StickerMaker
