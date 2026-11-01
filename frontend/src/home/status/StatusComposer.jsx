import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import axios from 'axios'
import { LuCheck, LuImagePlus, LuLoaderCircle, LuRefreshCw, LuSendHorizontal, LuType, LuUsers, LuX } from 'react-icons/lu'
import { STATUS_COLORS, loadStatusFeed, statusBackground, statusTextSize } from '../../utils/status'
import { compressImage } from '../../utils/attachments'

const MAX = 700
const glass = 'bg-white/12 ring-1 ring-white/15 backdrop-blur-md'

// Post a status: text on a colour, or a photo/video with a caption.
// Phones: full screen. Larger screens: a story-shaped card over a dimmed background.
const StatusComposer = ({ mode = 'text', onClose }) => {
  const [kind, setKind] = useState(mode)
  const [text, setText] = useState('')
  const [color, setColor] = useState(STATUS_COLORS[0])
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const textRef = useRef(null)

  useEffect(() => { if (mode === 'media') setTimeout(() => fileRef.current?.click(), 50) }, [mode])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = async (f) => {
    if (!f) return
    if (!/^(image|video)\//.test(f.type)) return setError('Choose a photo or a video')
    if (f.size > 10 * 1024 * 1024) return setError('That file is over 10 MB')
    const ready = f.type.startsWith('image/') ? await compressImage(f) : f
    setFile(ready); setPreview(URL.createObjectURL(ready)); setKind('media'); setError('')
  }

  const canPost = kind === 'text' ? !!text.trim() : !!file
  const post = async () => {
    if (busy || !canPost) return
    setBusy(true); setError('')
    try {
      if (kind === 'text') await axios.post('/api/status', { text, background: color }, { withCredentials: true })
      else {
        const form = new FormData()
        form.append('file', file, file.name)
        form.append('text', text)
        await axios.post('/api/status', form, { withCredentials: true })
      }
      await loadStatusFeed()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't post your status")
    } finally {
      setBusy(false)
    }
  }

  const tab = (on) => `flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-white/80 hover:text-white'}`

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 backdrop-blur-xl sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={onClose}
      role="dialog" aria-modal="true" aria-label="New status"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        className="relative flex h-dvh w-full flex-col overflow-hidden text-white sm:h-[min(860px,92dvh)] sm:max-w-[440px] sm:rounded-[28px] sm:shadow-2xl sm:ring-1 sm:ring-white/10"
        style={{ background: kind === 'text' ? statusBackground(color) : '#0b0d14', transition: 'background 300ms ease' }}
      >
        {/* Top bar: close · Text / Photo switch */}
        <div className="relative z-10 flex items-center gap-2 p-4">
          <button onClick={onClose} className={`flex size-10 items-center justify-center rounded-full ${glass} transition hover:bg-white/20`} aria-label="Close"><LuX className="size-5" /></button>
          <div className="flex-1" />
          <div className={`flex items-center gap-0.5 rounded-full p-1 ${glass}`} role="tablist" aria-label="Status type">
            <button role="tab" aria-selected={kind === 'text'} onClick={() => setKind('text')} className={tab(kind === 'text')}><LuType className="size-4" /> Text</button>
            <button role="tab" aria-selected={kind === 'media'} onClick={() => (file ? setKind('media') : fileRef.current?.click())} className={tab(kind === 'media')}><LuImagePlus className="size-4" /> Photo</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        {/* Canvas */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-7" onClick={() => kind === 'text' && textRef.current?.focus()}>
          {kind === 'text' ? (
            <textarea
              ref={textRef}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post() }}
              placeholder="What’s on your mind?"
              aria-label="Status text"
              rows={6}
              className={`w-full resize-none bg-transparent text-center font-semibold leading-snug tracking-tight text-white caret-white outline-none drop-shadow-sm placeholder:text-white/55 ${statusTextSize(text)}`}
            />
          ) : preview ? (
            <div className="relative flex h-full w-full items-center justify-center py-2">
              {file.type.startsWith('video/')
                ? <video src={preview} controls className="max-h-full max-w-full rounded-2xl shadow-2xl" />
                : <img src={preview} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />}
              <button onClick={() => fileRef.current?.click()} className={`absolute right-2 top-4 flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${glass} transition hover:bg-white/20`}>
                <LuRefreshCw className="size-3.5" /> Change
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl border border-dashed border-white/25 px-6 py-12 text-center transition hover:border-white/40 hover:bg-white/5">
              <span className={`flex size-14 items-center justify-center rounded-2xl ${glass}`}><LuImagePlus className="size-6" /></span>
              <span className="text-[15px] font-semibold">Choose a photo or video</span>
              <span className="text-xs text-white/60">JPG, PNG or video up to 60 seconds · 10 MB max</span>
            </button>
          )}
        </div>

        {/* Bottom: colours or caption · audience · Post */}
        <div className="relative z-10 space-y-3 p-4 pt-2">
          {error && <p role="alert" className="rounded-xl bg-red-500/20 px-3 py-2 text-center text-sm text-red-100 ring-1 ring-red-300/30">{error}</p>}

          {kind === 'text' ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Background colour">
                {STATUS_COLORS.map((c) => (
                  <button
                    key={c} role="radio" aria-checked={color === c} aria-label={`Background ${c}`}
                    onClick={() => setColor(c)}
                    className={`flex size-7 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-transparent transition hover:scale-110 ${color === c ? 'ring-white' : 'ring-white/0'}`}
                    style={{ background: statusBackground(c) }}
                  >
                    {color === c && <LuCheck className="size-3.5" />}
                  </button>
                ))}
              </div>
              <span className={`shrink-0 text-xs tabular-nums ${text.length > MAX - 50 ? 'text-amber-200' : 'text-white/55'}`}>{text.length}/{MAX}</span>
            </div>
          ) : (
            <input
              value={text} onChange={(e) => setText(e.target.value.slice(0, MAX))} placeholder="Add a caption…" aria-label="Caption"
              onKeyDown={(e) => e.key === 'Enter' && post()}
              className={`h-12 w-full rounded-2xl px-4 text-sm text-white outline-none placeholder:text-white/50 focus:bg-white/20 ${glass}`}
            />
          )}

          <div className="flex items-center gap-3">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-white/70">
              <LuUsers className="size-3.5 shrink-0" /> <span className="truncate">Your contacts · disappears in 24 hours</span>
            </p>
            <button
              onClick={post} disabled={busy || !canPost} aria-label="Post status"
              className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white pl-4 pr-5 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100 active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuSendHorizontal className="size-4" />}
              {busy ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}

export default StatusComposer
