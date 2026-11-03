import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LuExternalLink, LuGripHorizontal, LuMaximize2, LuMessageSquareShare, LuMinimize2, LuX } from 'react-icons/lu'
import useConversation from '../Zustand/UserConversation'
import useVideoPlayer from '../Zustand/useVideoPlayer'
import { followPlayerTime, youtubeEmbed } from '../utils/youtube'

const POS_KEY = 'kova-video-pos'
const readPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY)) } catch { return null } }
const MARGIN = 8

// Keep the player fully on screen
const clamp = (pos, el) => {
  if (!pos || !el) return pos
  const { width, height } = el.getBoundingClientRect()
  return {
    x: Math.min(Math.max(MARGIN, pos.x), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
    y: Math.min(Math.max(MARGIN, pos.y), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
  }
}

// Floating YouTube player ("Pop out" on a playing video). Mounted once above the app, so a video
// keeps playing while you move between chats, Nexa and settings. Drag it by its title bar
// (remembered on this device); the expand button makes it bigger in the middle of the screen.
const VideoPlayer = () => {
  const { video, close } = useVideoPlayer()
  const [big, setBig] = useState(false)
  const [pos, setPos] = useState(readPos) // { x, y } from the top-left, or null = default corner
  const [dragging, setDragging] = useState(false)
  const box = useRef(null)
  const drag = useRef(null)
  const frame = useRef(null)
  const time = useRef(0)
  const navigate = useNavigate()
  const location = useLocation()

  // Where the video is, so "Back to chat" carries on from the same second
  useEffect(() => {
    if (!video) return
    time.current = video.start || 0
    return followPlayerTime(frame.current, (t) => { time.current = t })
  }, [video])

  // Stay on screen when the window is resized (or the saved spot is off a smaller screen)
  useEffect(() => {
    if (!video || !pos) return
    const fit = () => setPos((p) => clamp(p, box.current))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [video]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!video) return null

  // Back to the chat the video came from: its card there takes over from the same second.
  // If that message isn't on screen (e.g. far up the chat), the video just keeps playing here.
  const backToChat = () => {
    const from = video.from
    if (!from) return
    if (location.pathname !== '/') navigate('/')
    const s = useConversation.getState()
    if (String(s.selectedConversation?._id) !== String(from._id)) s.setSelectedConversation(from)
    const { requestResume } = useVideoPlayer.getState()
    const request = { id: video.id, getStart: () => time.current }
    requestResume(request)
    setTimeout(() => { if (useVideoPlayer.getState().resume === request) requestResume(null) }, 3000)
  }
  const src = youtubeEmbed(video.id, video.start)
  const btn = 'flex size-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white'

  const onPointerDown = (e) => {
    if (big || e.button !== 0 || e.target.closest('a,button')) return
    const rect = box.current.getBoundingClientRect()
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, box.current))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    setPos((p) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch { /* private mode */ } return p })
  }
  // Double-click the bar: back to the default corner
  const resetPos = (e) => {
    if (big || e.target.closest('a,button')) return
    setPos(null)
    try { localStorage.removeItem(POS_KEY) } catch { /* private mode */ }
  }

  const placed = !big && pos
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={video.title ? `Video: ${video.title}` : 'Video player'}
      style={placed ? { left: pos.x, top: pos.y } : undefined}
      className={`fixed z-[70] overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10 ${dragging ? '' : 'transition-[width] duration-200'} ${big
        ? 'inset-x-3 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:w-[min(80vw,960px)] sm:-translate-x-1/2'
        : placed ? 'w-[min(92vw,380px)]' : 'inset-x-3 bottom-24 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px]'}`}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={resetPos}
        className={`flex touch-none select-none items-center gap-1 bg-slate-900 px-2 py-1 ${big ? '' : dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        title={big ? undefined : 'Drag to move · double-click to put it back in the corner'}
      >
        {!big && <LuGripHorizontal className="size-3.5 shrink-0 text-slate-500" aria-hidden />}
        <p className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-slate-200" title={video.title}>{video.title || 'YouTube'}</p>
        {video.from && (
          <button onClick={backToChat} className={btn} title={`Back to the chat${video.from.fullName ? ` with ${video.from.fullName}` : ''}`} aria-label="Back to the chat">
            <LuMessageSquareShare className="size-3.5" />
          </button>
        )}
        <a href={video.url || `https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer" className={btn} title="Open on YouTube" aria-label="Open on YouTube"><LuExternalLink className="size-3.5" /></a>
        <button onClick={() => setBig((b) => !b)} className={`${btn} hidden sm:flex`} title={big ? 'Smaller' : 'Bigger'} aria-label={big ? 'Make the player smaller' : 'Make the player bigger'}>
          {big ? <LuMinimize2 className="size-3.5" /> : <LuMaximize2 className="size-3.5" />}
        </button>
        <button onClick={() => { setBig(false); close() }} className={btn} title="Close" aria-label="Close the video"><LuX className="size-4" /></button>
      </div>
      <div className="relative">
        <iframe
          ref={frame}
          key={video.id}
          src={src}
          title={video.title || 'YouTube video'}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {/* While dragging, the video mustn't catch the pointer */}
        {dragging && <div className="absolute inset-0" />}
      </div>
    </div>
  )
}

export default VideoPlayer
