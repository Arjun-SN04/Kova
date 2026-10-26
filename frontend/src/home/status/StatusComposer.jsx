import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { LuImage, LuSendHorizontal, LuType, LuX } from 'react-icons/lu'
import { STATUS_COLORS, loadStatusFeed } from '../../utils/status'
import { compressImage } from '../../utils/attachments'

// Post a status: text on a colour, or a photo/video with a caption
const StatusComposer = ({ mode = 'text', onClose }) => {
  const [kind, setKind] = useState(mode)
  const [text, setText] = useState('')
  const [color, setColor] = useState(STATUS_COLORS[0])
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

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

  const post = async () => {
    if (busy) return
    if (kind === 'text' && !text.trim()) return
    if (kind === 'media' && !file) return
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

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="New status">
      <div className="relative flex h-full w-full max-w-md flex-col" style={kind === 'text' ? { background: color } : undefined}>
        <div className="flex items-center gap-2 p-3">
          <button onClick={onClose} className="flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10" aria-label="Close"><LuX className="size-5" /></button>
          <div className="flex-1" />
          <button onClick={() => setKind('text')} className={`flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 ${kind === 'text' ? 'bg-white/20' : ''}`} aria-label="Text status" title="Text"><LuType className="size-5" /></button>
          <button onClick={() => fileRef.current?.click()} className={`flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 ${kind === 'media' ? 'bg-white/20' : ''}`} aria-label="Photo or video" title="Photo or video"><LuImage className="size-5" /></button>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden px-6">
          {kind === 'text' ? (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={700}
              placeholder="Type a status"
              className="w-full resize-none bg-transparent text-center text-2xl font-semibold leading-snug text-white outline-none placeholder:text-white/60 sm:text-3xl"
              rows={5}
            />
          ) : preview ? (
            file.type.startsWith('video/')
              ? <video src={preview} controls className="max-h-full max-w-full rounded-lg" />
              : <img src={preview} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          ) : (
            <button onClick={() => fileRef.current?.click()} className="rounded-xl border border-dashed border-white/40 px-6 py-10 text-sm text-white/80 hover:bg-white/5">Choose a photo or video (videos up to 60 s)</button>
          )}
        </div>

        {error && <p className="px-4 pb-2 text-center text-sm text-red-300">{error}</p>}

        <div className="flex items-center gap-2 p-3">
          {kind === 'text' ? (
            <div className="flex flex-1 flex-wrap gap-1.5">
              {STATUS_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`size-7 rounded-full ring-2 ${color === c ? 'ring-white' : 'ring-white/20'}`} style={{ background: c }} aria-label={`Background ${c}`} />
              ))}
            </div>
          ) : (
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={700} placeholder="Add a caption" className="h-11 flex-1 rounded-full bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/50 focus:bg-white/15" />
          )}
          <button onClick={post} disabled={busy || (kind === 'text' ? !text.trim() : !file)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 transition hover:bg-slate-100 disabled:opacity-40" aria-label="Post status">
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" /> : <LuSendHorizontal className="size-5" />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default StatusComposer
