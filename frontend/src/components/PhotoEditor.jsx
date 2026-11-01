import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LuFlipHorizontal2, LuLoaderCircle, LuRotateCcw, LuRotateCw, LuUndo2, LuZoomIn, LuZoomOut } from 'react-icons/lu'
import Sheet from '../home/groups/Sheet'

// Edit a profile / group photo before saving: drag to move, zoom, rotate, flip,
// filters and brightness / contrast / saturation. Saves a square JPEG.

const VIEW = 300 // preview size (px)
const OUT = 512 // saved image size (px)

// Each filter is a set of adjustments (1 = unchanged); the sliders multiply on top
const FILTERS = [
  { id: 'none', name: 'Original', p: {} },
  { id: 'vivid', name: 'Vivid', p: { s: 1.35, c: 1.1 } },
  { id: 'warm', name: 'Warm', p: { sep: 0.25, s: 1.15, h: -8 } },
  { id: 'cool', name: 'Cool', p: { s: 1.05, h: 12, b: 1.03 } },
  { id: 'fade', name: 'Fade', p: { c: 0.85, b: 1.08, s: 0.8 } },
  { id: 'mono', name: 'Mono', p: { g: 1 } },
  { id: 'noir', name: 'Noir', p: { g: 1, c: 1.35, b: 0.95 } },
]
const START = { zoom: 1, x: 0, y: 0, turn: 0, tilt: 0, flip: false, filter: 'none', b: 100, c: 100, s: 100 }

const params = (st) => {
  const f = FILTERS.find((x) => x.id === st.filter)?.p || {}
  return { b: (f.b ?? 1) * st.b / 100, c: (f.c ?? 1) * st.c / 100, s: (f.s ?? 1) * st.s / 100, g: f.g ?? 0, sep: f.sep ?? 0, h: f.h ?? 0 }
}
const cssFilter = (p) => `brightness(${p.b}) contrast(${p.c}) saturate(${p.s}) grayscale(${p.g}) sepia(${p.sep}) hue-rotate(${p.h}deg)`

// For browsers whose canvas can't use CSS filters: do the same maths on the pixels
const applyPixels = (ctx, size, p) => {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * p.b, g = d[i + 1] * p.b, bl = d[i + 2] * p.b
    r = (r - 128) * p.c + 128; g = (g - 128) * p.c + 128; bl = (bl - 128) * p.c + 128
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl
    r = lum + (r - lum) * p.s; g = lum + (g - lum) * p.s; bl = lum + (bl - lum) * p.s
    if (p.g) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl; r += (l - r) * p.g; g += (l - g) * p.g; bl += (l - bl) * p.g }
    if (p.sep) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * bl, sg = 0.349 * r + 0.686 * g + 0.168 * bl, sb = 0.272 * r + 0.534 * g + 0.131 * bl
      r += (sr - r) * p.sep; g += (sg - g) * p.sep; bl += (sb - bl) * p.sep
    }
    d[i] = Math.max(0, Math.min(255, r)); d[i + 1] = Math.max(0, Math.min(255, g)); d[i + 2] = Math.max(0, Math.min(255, bl))
  }
  ctx.putImageData(img, 0, 0)
}

// Draw the photo into a square canvas of `size` px (offsets are in preview px)
const draw = (canvas, img, st, size) => {
  const ctx = canvas.getContext('2d')
  const k = size / VIEW
  const sideways = st.turn % 180 !== 0
  const w = sideways ? img.naturalHeight : img.naturalWidth
  const h = sideways ? img.naturalWidth : img.naturalHeight
  const cover = Math.max(size / w, size / h) * st.zoom
  const p = params(st)
  const canFilter = typeof ctx.filter === 'string'
  ctx.save()
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, size, size)
  if (canFilter) ctx.filter = cssFilter(p)
  ctx.translate(size / 2 + st.x * k, size / 2 + st.y * k)
  ctx.rotate(((st.turn + st.tilt) * Math.PI) / 180)
  ctx.scale(st.flip ? -1 : 1, 1)
  ctx.drawImage(img, (-img.naturalWidth * cover) / 2, (-img.naturalHeight * cover) / 2, img.naturalWidth * cover, img.naturalHeight * cover)
  ctx.restore()
  if (!canFilter) applyPixels(ctx, size, p)
}

// Keep the photo covering the frame while dragging
const clamp = (st, img) => {
  if (!img) return st
  const sideways = st.turn % 180 !== 0
  const w = sideways ? img.naturalHeight : img.naturalWidth
  const h = sideways ? img.naturalWidth : img.naturalHeight
  const cover = Math.max(VIEW / w, VIEW / h) * st.zoom
  const mx = Math.max(0, (w * cover - VIEW) / 2)
  const my = Math.max(0, (h * cover - VIEW) / 2)
  return { ...st, x: Math.max(-mx, Math.min(mx, st.x)), y: Math.max(-my, Math.min(my, st.y)) }
}

const Slider = ({ label, value, min, max, step = 1, onChange, suffix = '' }) => (
  <label className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
    <span className="w-20 shrink-0 font-medium">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-indigo-600" aria-label={label} />
    <span className="w-10 text-right tabular-nums">{value}{suffix}</span>
  </label>
)

/** source: a File (new photo) or an image URL (current photo). onSave(file) uploads it. */
const PhotoEditor = ({ source, title = 'Edit photo', round = true, onSave, onClose }) => {
  const [img, setImg] = useState(null)
  const [error, setError] = useState('')
  const [st, setSt] = useState(START)
  const [tab, setTab] = useState('crop')
  const [busy, setBusy] = useState(false)
  const [srcUrl, setSrcUrl] = useState('')
  const canvas = useRef(null)
  const drag = useRef(null)

  // Load the photo (CORS so a stored photo can be redrawn and saved)
  useEffect(() => {
    let cancelled = false
    const url = source instanceof Blob ? URL.createObjectURL(source) : source
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => { if (!cancelled) { setImg(im); setSrcUrl(url); setError('') } }
    im.onerror = () => { if (!cancelled) setError('This photo can’t be opened for editing. Try another image.') }
    im.src = url
    return () => { cancelled = true; if (source instanceof Blob) URL.revokeObjectURL(url) }
  }, [source])

  useEffect(() => { if (img && canvas.current) draw(canvas.current, img, st, VIEW) }, [img, st])

  const update = useCallback((patch) => setSt((s) => clamp({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }, img)), [img])

  const onPointerDown = (e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y } }
  const onPointerMove = (e) => { if (drag.current) update({ x: drag.current.sx + e.clientX - drag.current.x, y: drag.current.sy + e.clientY - drag.current.y }) }
  const onPointerUp = () => { drag.current = null }
  const onWheel = (e) => update((s) => ({ zoom: Math.min(4, Math.max(1, +(s.zoom - e.deltaY * 0.0015).toFixed(3))) }))

  const save = async () => {
    if (!img) return
    setBusy(true); setError('')
    try {
      const out = document.createElement('canvas')
      out.width = OUT; out.height = OUT
      draw(out, img, st, OUT)
      const blob = await new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the photo'))), 'image/jpeg', 0.9))
      await onSave(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not save the photo')
      setBusy(false)
    }
  }

  const tool = 'flex size-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
  const changed = JSON.stringify(st) !== JSON.stringify(START)

  return (
    <Sheet open onClose={onClose} title={title} footer={
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setSt(START)} disabled={!changed || busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 text-xs sm:text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"><LuUndo2 className="size-4 shrink-0" /> Reset</button>
        <div className="flex gap-1.5 sm:gap-2">
          <button onClick={onClose} className="h-10 rounded-xl px-3 sm:px-4 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={save} disabled={!img || busy} className="inline-flex h-10 items-center gap-1.5 sm:gap-2 rounded-xl bg-indigo-600 px-3 sm:px-4 text-xs sm:text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">{busy && <LuLoaderCircle className="size-4 animate-spin shrink-0" />}{busy ? 'Saving…' : 'Save photo'}</button>
        </div>
      </div>
    }>
      {/* Preview: drag to move, scroll to zoom */}
      <div className="flex justify-center pt-1">
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 w-[min(300px,calc(100vw-3.5rem))] h-[min(300px,calc(100vw-3.5rem))] aspect-square">
          {!img && !error && <LuLoaderCircle className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
          <canvas
            ref={canvas}
            width={VIEW}
            height={VIEW}
            className="size-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            aria-label="Photo preview. Drag to move, scroll to zoom."
          />
          {/* Shows what's visible in round avatars */}
          {round && <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ring-2 ring-white/70" />}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">Drag to move · scroll or use the slider to zoom</p>

      {/* Tabs */}
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {[['crop', 'Crop & rotate'], ['filters', 'Filters'], ['adjust', 'Adjust']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-8 rounded-lg truncate px-1 text-xs sm:text-[13px] font-medium transition ${tab === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>{label}</button>
        ))}
      </div>

      <div className="mt-4 min-h-[112px]">
        {tab === 'crop' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => update((s) => ({ zoom: Math.max(1, +(s.zoom - 0.1).toFixed(2)) }))} className={tool} aria-label="Zoom out"><LuZoomOut className="size-4" /></button>
              <input type="range" min="1" max="4" step="0.01" value={st.zoom} onChange={(e) => update({ zoom: Number(e.target.value) })} className="flex-1 accent-indigo-600" aria-label="Zoom" />
              <button onClick={() => update((s) => ({ zoom: Math.min(4, +(s.zoom + 0.1).toFixed(2)) }))} className={tool} aria-label="Zoom in"><LuZoomIn className="size-4" /></button>
            </div>
            <Slider label="Straighten" value={st.tilt} min={-45} max={45} onChange={(v) => update({ tilt: v })} suffix="°" />
            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
              <button onClick={() => update((s) => ({ turn: (s.turn + 270) % 360, x: 0, y: 0 }))} className={`${tool} w-auto gap-1.5 px-2.5 sm:px-3 text-xs font-medium`}><LuRotateCcw className="size-4" /> Rotate left</button>
              <button onClick={() => update((s) => ({ turn: (s.turn + 90) % 360, x: 0, y: 0 }))} className={`${tool} w-auto gap-1.5 px-2.5 sm:px-3 text-xs font-medium`}><LuRotateCw className="size-4" /> Rotate right</button>
              <button onClick={() => update((s) => ({ flip: !s.flip }))} aria-pressed={st.flip} className={`${tool} w-auto gap-1.5 px-2.5 sm:px-3 text-xs font-medium ${st.flip ? 'bg-slate-100 dark:bg-slate-800' : ''}`}><LuFlipHorizontal2 className="size-4" /> Flip</button>
            </div>
          </div>
        )}
        {tab === 'filters' && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => update({ filter: f.id })} aria-pressed={st.filter === f.id} className="text-center">
                <span className={`block aspect-square overflow-hidden rounded-xl ring-2 transition ${st.filter === f.id ? 'ring-indigo-600 dark:ring-indigo-400' : 'ring-transparent hover:ring-slate-300 dark:hover:ring-slate-600'}`}>
                  {srcUrl && <img src={srcUrl} alt="" className="size-full object-cover" style={{ filter: cssFilter(params({ ...START, filter: f.id })) }} />}
                </span>
                <span className={`mt-1 block text-[11px] ${st.filter === f.id ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{f.name}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'adjust' && (
          <div className="space-y-3">
            <Slider label="Brightness" value={st.b} min={50} max={150} onChange={(v) => update({ b: v })} suffix="%" />
            <Slider label="Contrast" value={st.c} min={50} max={150} onChange={(v) => update({ c: v })} suffix="%" />
            <Slider label="Saturation" value={st.s} min={0} max={200} onChange={(v) => update({ s: v })} suffix="%" />
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Sheet>
  )
}

export default PhotoEditor
