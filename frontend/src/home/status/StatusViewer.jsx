import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { LuChevronLeft, LuChevronRight, LuEye, LuPause, LuPlay, LuTrash2, LuX } from 'react-icons/lu'
import Avatar from '../Avatar'
import { loadStatusFeed, markStatusSeen, timeAgo } from '../../utils/status'

const IMAGE_MS = 5000
const TEXT_MS = 6000

// Full-screen status viewer. `queue`: [{ user, statuses }] (one person after another); starts at `start`.
const StatusViewer = ({ queue, start = 0, mine = false, onClose }) => {
  const [person, setPerson] = useState(start)
  const [index, setIndex] = useState(() => Math.max(0, queue[start]?.statuses.findIndex((s) => !s.seen)))
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [viewers, setViewers] = useState(null)
  const videoRef = useRef(null)
  const current = queue[person]
  const status = current?.statuses[index]

  const next = useCallback(() => {
    setProgress(0)
    if (index < current.statuses.length - 1) setIndex((i) => i + 1)
    else if (person < queue.length - 1) { setPerson((p) => p + 1); setIndex(0) }
    else onClose()
  }, [index, person, current, queue.length, onClose])

  const prev = () => {
    setProgress(0)
    if (index > 0) setIndex((i) => i - 1)
    else if (person > 0) { setPerson((p) => p - 1); setIndex(queue[person - 1].statuses.length - 1) }
  }

  // Seen
  useEffect(() => { if (status && !mine && !status.seen) markStatusSeen(status._id) }, [status, mine])

  // Timer (videos follow their own length)
  useEffect(() => {
    if (!status || paused || viewers) return
    if (status.kind === 'video') return
    const total = status.kind === 'image' ? IMAGE_MS : TEXT_MS
    const startAt = Date.now() - progress * total
    const t = setInterval(() => {
      const p = (Date.now() - startAt) / total
      if (p >= 1) { clearInterval(t); next() } else setProgress(p)
    }, 50)
    return () => clearInterval(t)
  }, [status, paused, viewers, next]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (paused || viewers) v.pause(); else v.play().catch(() => {})
  }, [paused, viewers, status])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const showViewers = async () => {
    setViewers([])
    try { setViewers((await axios.get(`/api/status/${status._id}/viewers`, { withCredentials: true })).data.viewers) } catch { setViewers([]) }
  }

  const remove = async () => {
    try { await axios.delete(`/api/status/${status._id}`, { withCredentials: true }) } catch { /* ignore */ }
    await loadStatusFeed()
    onClose()
  }

  if (!status) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label="Status">
      <div className="relative flex h-full w-full max-w-md flex-col">
        {/* Progress */}
        <div className="absolute inset-x-3 top-3 z-20 flex gap-1">
          {current.statuses.map((s, i) => (
            <div key={s._id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? Math.round(progress * 100) : 0}%`, transition: 'width 50ms linear' }} />
            </div>
          ))}
        </div>
        {/* Header */}
        <div className="absolute inset-x-3 top-6 z-20 flex items-center gap-3">
          <Avatar name={current.user.fullName} src={current.user.avatar?.url} size="sm" />
          <div className="min-w-0 flex-1 text-white">
            <p className="truncate text-sm font-semibold">{mine ? 'My status' : current.user.fullName}</p>
            <p className="text-xs text-white/70">{timeAgo(status.createdAt)}</p>
          </div>
          <button onClick={() => setPaused((p) => !p)} className="flex size-9 items-center justify-center rounded-full text-white/90 hover:bg-white/10" aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? <LuPlay className="size-4.5" /> : <LuPause className="size-4.5" />}
          </button>
          {mine && <button onClick={remove} className="flex size-9 items-center justify-center rounded-full text-white/90 hover:bg-white/10" aria-label="Delete status"><LuTrash2 className="size-4.5" /></button>}
          <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full text-white/90 hover:bg-white/10" aria-label="Close"><LuX className="size-5" /></button>
        </div>

        {/* Content */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden" onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
          {status.kind === 'text' && (
            <div className="flex h-full w-full items-center justify-center p-10 text-center" style={{ background: status.background }}>
              <p className="whitespace-pre-wrap break-words text-2xl font-semibold leading-snug text-white sm:text-3xl">{status.text}</p>
            </div>
          )}
          {status.kind === 'image' && <img src={status.media.url} alt="" className="max-h-full max-w-full object-contain" />}
          {status.kind === 'video' && (
            <video
              key={status._id}
              ref={videoRef}
              src={status.media.url}
              autoPlay
              playsInline
              onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
              onEnded={next}
              className="max-h-full max-w-full"
            />
          )}
          {/* Tap zones */}
          <button className="absolute inset-y-0 left-0 w-1/3" onClick={prev} aria-label="Previous" />
          <button className="absolute inset-y-0 right-0 w-1/3" onClick={next} aria-label="Next" />
        </div>

        {status.kind !== 'text' && status.text && (
          <p className="absolute inset-x-0 bottom-16 z-10 bg-black/50 px-5 py-3 text-center text-[15px] text-white">{status.text}</p>
        )}

        {mine && (
          <button onClick={showViewers} className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur hover:bg-white/20">
            <LuEye className="size-4" /> {status.viewCount ?? 0} view{status.viewCount === 1 ? '' : 's'}
          </button>
        )}

        {viewers && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[60%] overflow-y-auto rounded-t-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">Viewed by {viewers.length}</p>
              <button onClick={() => setViewers(null)} className="flex size-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><LuX className="size-4" /></button>
            </div>
            {viewers.length === 0 ? <p className="py-4 text-center text-sm text-slate-500">No views yet</p> : viewers.map((v) => (
              <div key={v.user._id} className="flex items-center gap-3 py-2">
                <Avatar name={v.user.fullName} src={v.user.avatar?.url} size="sm" />
                <p className="flex-1 truncate text-sm font-medium">{v.user.fullName}</p>
                <p className="text-xs text-slate-400">{timeAgo(v.at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Desktop arrows */}
      <button onClick={prev} className="absolute left-4 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:flex" aria-label="Previous"><LuChevronLeft className="size-6" /></button>
      <button onClick={next} className="absolute right-4 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:flex" aria-label="Next"><LuChevronRight className="size-6" /></button>
    </div>,
    document.body,
  )
}

export default StatusViewer
