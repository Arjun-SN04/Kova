import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuCheck, LuDownload, LuExternalLink, LuFileText, LuLoaderCircle, LuPause, LuPlay, LuX } from 'react-icons/lu'
import { downloadFile, formatBytes } from '../../utils/attachments'
import useAudioPlayer from '../../Zustand/useAudioPlayer'
import useConversation from '../../Zustand/UserConversation'

const imageName = (a) => (a.name && a.name !== 'image' ? a.name : `kova-photo-${Date.now()}`)

// Download button with a small busy → done state
const SaveButton = ({ attachment, className, iconClass = 'size-4' }) => {
  const [state, setState] = useState('idle') // idle | busy | done
  const save = async (e) => {
    e.stopPropagation()
    if (state === 'busy') return
    setState('busy')
    await downloadFile(attachment.url, imageName(attachment))
    setState('done')
    setTimeout(() => setState('idle'), 1500)
  }
  const Icon = state === 'busy' ? LuLoaderCircle : state === 'done' ? LuCheck : LuDownload
  return (
    <button type="button" onClick={save} className={className} title="Download" aria-label="Download">
      <Icon className={`${iconClass} ${state === 'busy' ? 'animate-spin' : ''}`} />
    </button>
  )
}

// Full-screen image viewer
const Lightbox = ({ attachment, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <SaveButton attachment={attachment} className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20" iconClass="size-4.5" />
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          title="Open original"
          aria-label="Open original"
        >
          <LuExternalLink className="size-4.5" />
        </a>
        <button
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Close"
        >
          <LuX className="size-5" />
        </button>
      </div>
      <motion.img
        src={attachment.url}
        alt={attachment.name || 'Photo'}
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </motion.div>,
    document.body,
  )
}

const formatDuration = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Voice note player. Plays through the app-wide player (so it keeps going when you switch
// chats and shows in the bar at the top). Nothing downloads until you press play.
const AudioPlayer = ({ attachment, itsMe, messageId, label }) => {
  const { track, playing, current, duration: liveDuration, play, toggle: toggleLive, seek: seekLive } = useAudioPlayer()
  const id = messageId ? String(messageId) : attachment.url
  const isThis = track?.id === id
  const duration = (isThis && liveDuration) || attachment.duration || 0
  const time = isThis ? current : 0
  const isPlaying = isThis && playing

  const start = () => {
    const chat = useConversation.getState().selectedConversation
    play({
      id,
      url: attachment.url,
      duration: attachment.duration || 0,
      messageId: messageId ? String(messageId) : null,
      title: `${label || 'Voice message'}`,
      subtitle: chat?.isGroup ? chat.name : '', // group name; one-to-one chats don't repeat the name
      chat,
    })
  }
  const toggle = (e) => {
    e.stopPropagation()
    if (isThis) toggleLive()
    else start()
  }
  const seek = (e) => {
    e.stopPropagation()
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - rect.left) / rect.width) * duration
    if (isThis) seekLive(t)
    else { start(); setTimeout(() => useAudioPlayer.getState().seek(t), 150) }
  }

  const progress = duration ? Math.min(100, (time / duration) * 100) : 0

  return (
    <div className="flex w-60 max-w-full items-center gap-3 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full transition ${
          itsMe ? 'bg-white text-indigo-600 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-500'
        }`}
      >
        {isPlaying ? <LuPause className="size-4" /> : <LuPlay className="ml-0.5 size-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div onClick={seek} className="flex h-6 cursor-pointer items-center" role="slider" aria-label="Seek" aria-valuenow={Math.round(progress)}>
          <div className={`relative h-1 w-full rounded-full ${itsMe ? 'bg-white/30' : 'bg-slate-200 dark:bg-slate-600'}`}>
            <div className={`absolute inset-y-0 left-0 rounded-full ${itsMe ? 'bg-white' : 'bg-indigo-600'}`} style={{ width: `${progress}%` }} />
            <div
              className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${itsMe ? 'bg-white' : 'bg-indigo-600'}`}
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>
        <p className={`text-[11px] tabular-nums ${itsMe ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
          {isThis && (isPlaying || time) ? formatDuration(time) : formatDuration(duration)}
        </p>
      </div>
    </div>
  )
}

// Media / file shown inside a chat bubble.
// Images use the stored (already compressed) file as-is: no Cloudinary
// transformations, so viewing costs only bandwidth. Videos load on play only.
const Attachment = ({ attachment, itsMe, messageId = null, label = '' }) => {
  const [open, setOpen] = useState(false)
  const { kind, url, name, size, width, height } = attachment
  const ratio = width && height ? `${width} / ${height}` : undefined

  if (kind === 'image') {
    return (
      <div className="group/img relative">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          className="block overflow-hidden rounded-xl bg-slate-200/60 dark:bg-slate-700/60"
          style={{ aspectRatio: ratio }}
          aria-label="View photo"
        >
          <img
            src={url}
            alt={name || 'Photo'}
            loading="lazy"
            width={width || undefined}
            height={height || undefined}
            className="max-h-80 w-full max-w-xs object-cover"
          />
        </button>
        {/* Download: shows on hover (always on touch screens) */}
        <SaveButton
          attachment={attachment}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-slate-950/55 text-white opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-slate-950/75 focus-visible:opacity-100 group-hover/img:opacity-100 [@media(hover:none)]:opacity-100"
        />
        <AnimatePresence>{open && <Lightbox attachment={attachment} onClose={() => setOpen(false)} />}</AnimatePresence>
      </div>
    )
  }

  if (kind === 'audio') return <AudioPlayer attachment={attachment} itsMe={itsMe} messageId={messageId} label={label} />

  if (kind === 'video') {
    return (
      <video
        src={url}
        controls
        preload="none"
        onClick={(e) => e.stopPropagation()}
        className="max-h-80 w-full max-w-xs rounded-xl bg-black"
        style={{ aspectRatio: ratio || '16 / 9' }}
      />
    )
  }

  // Files open through the server, which hands out a signed link (Cloudinary blocks plain PDF links)
  const fileHref = messageId && attachment.resourceType === 'raw' ? `/api/message/file/${messageId}` : url
  return (
    <a
      href={fileHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`flex w-64 max-w-full items-center gap-3 rounded-xl p-2.5 transition ${
        itsMe ? 'bg-white/15 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-700/60 dark:hover:bg-slate-700'
      }`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${itsMe ? 'bg-white/20' : 'bg-white text-indigo-600 dark:bg-slate-800 dark:text-indigo-400'}`}>
        <LuFileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className={`block text-xs ${itsMe ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>{formatBytes(size)}</span>
      </span>
      <LuDownload className="size-4 shrink-0 opacity-70" />
    </a>
  )
}

export default Attachment
