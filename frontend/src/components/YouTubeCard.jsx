import React, { useEffect, useId, useRef } from 'react'
import { LuPictureInPicture2, LuPlay, LuX } from 'react-icons/lu'
import useVideoPlayer from '../Zustand/useVideoPlayer'
import useConversation from '../Zustand/UserConversation'
import { followPlayerTime, youtubeEmbed, youtubeStart, youtubeThumb } from '../utils/youtube'

// A YouTube video in a message: a thumbnail that plays right there when tapped.
// While playing: "Pop out" moves it to the floating player (keeps playing as you move around).
const YouTubeCard = ({ id, url, title, itsMe = false, className = '' }) => {
  const key = useId()
  const playing = useVideoPlayer((s) => s.inline === key)
  const { playInline, stopInline, play } = useVideoPlayer.getState()
  const linkStart = youtubeStart(url)
  // Taking over from the floating player starts where it was; otherwise the link's own start
  const handedStart = useVideoPlayer((s) => (s.inline === key ? s.inlineStart : 0))
  const start = handedStart || linkStart
  const root = useRef(null)
  // The chat this card is in (noted when it appears: by the time it's removed, another chat is
  // already open), so "Back to chat" on the floating player can return here
  const chatHere = useRef(null)
  if (chatHere.current === null) chatHere.current = useConversation.getState().selectedConversation || false
  const here = () => chatHere.current || null
  // Where the in-chat player is, so "Pop out" carries on from there
  const frame = useRef(null)
  const time = useRef(start)
  useEffect(() => {
    if (!playing) return
    return followPlayerTime(frame.current, (t) => { time.current = t })
  }, [playing])
  // Leaving the chat while it plays (switching chats, opening settings): hand the video to the
  // floating player from the same second, so it keeps playing like the voice-note bar
  const latest = useRef({})
  latest.current = { id, url, title }
  useEffect(() => () => {
    const s = useVideoPlayer.getState()
    if (s.inline !== key) return
    // Still in the same chat on the chats page: the message itself went away (chat cleared,
    // message deleted), so the video just stops. Otherwise you left: keep it playing.
    const open = useConversation.getState().selectedConversation
    const sameChat = chatHere.current && open && String(open._id) === String(chatHere.current._id)
    if (sameChat && window.location.pathname === '/') s.stopInline()
    else s.play({ ...latest.current, start: Math.floor(time.current || 0), from: here() })
  }, [key])
  // "Back to chat" from the floating player: the first card of this video here takes over
  const resume = useVideoPlayer((s) => s.resume)
  useEffect(() => {
    if (resume?.id !== id) return
    const claimed = useVideoPlayer.getState().claimResume(id)
    if (!claimed) return
    time.current = claimed.getStart?.() || 0
    playInline(key, Math.floor(time.current))
    setTimeout(() => root.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }, [resume, id, key, playInline])
  const box = `mt-2 block w-full max-w-[360px] overflow-hidden rounded-xl text-left transition ${itsMe ? 'bg-white/10' : 'bg-slate-50 ring-1 ring-slate-200/80 dark:bg-slate-900/60 dark:ring-slate-700/60'} ${className}`
  const label = title && (
    <span className="block px-3 py-2">
      <span className={`block text-[11px] font-medium uppercase tracking-wide ${itsMe ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>YouTube</span>
      <span className="mt-0.5 line-clamp-2 block text-[13px] font-semibold leading-snug">{title}</span>
    </span>
  )

  if (playing) {
    return (
      <div ref={root} className={box} onClick={(e) => e.stopPropagation()} data-yt={id}>
        <div className="relative aspect-video w-full bg-black">
          <iframe
            ref={frame}
            src={youtubeEmbed(id, start)}
            title={title || 'YouTube video'}
            className="absolute inset-0 size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="flex items-center gap-1 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold">{title || 'YouTube'}</span>
          <button type="button" onClick={() => play({ id, url, title, start: Math.floor(time.current || 0), from: here() })} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800" title="Pop out: keeps playing while you switch chats">
            <LuPictureInPicture2 className="size-3.5" /> Pop out
          </button>
          <button type="button" onClick={stopInline} className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200/70 dark:hover:bg-slate-800" title="Stop" aria-label="Stop the video">
            <LuX className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      ref={root}
      type="button"
      data-yt={id}
      onClick={(e) => { e.stopPropagation(); playInline(key) }}
      className={`group/yt ${box} ${itsMe ? 'hover:bg-white/15' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
      aria-label={`Play ${title || 'video'}`}
    >
      <span className="relative block aspect-video w-full bg-black">
        <img src={youtubeThumb(id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover opacity-90 transition group-hover/yt:opacity-100" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition group-hover/yt:scale-110">
            <LuPlay className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      </span>
      {label}
    </button>
  )
}

export default YouTubeCard
