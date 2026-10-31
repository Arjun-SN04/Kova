import React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LuMic, LuPause, LuPlay, LuX } from 'react-icons/lu'
import useAudioPlayer from '../Zustand/useAudioPlayer'
import useConversation from '../Zustand/UserConversation'
import { jumpToMessage } from '../utils/messages'

const time = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// The bar at the top while a voice note is loaded: keeps playing across chats.
// Click the title to go back to that message; × stops it and closes the bar.
const MiniPlayer = () => {
  const { track, playing, current, duration, rate, toggle, seek, cycleRate, close } = useAudioPlayer()
  const progress = duration ? Math.min(100, (current / duration) * 100) : 0

  const goToMessage = () => {
    if (!track?.chat) return
    const s = useConversation.getState()
    if (String(s.selectedConversation?._id) !== String(track.chat._id)) s.setSelectedConversation(track.chat)
    if (track.messageId) setTimeout(() => jumpToMessage(track.messageId, s.setHighlightedId), 400)
  }
  const onSeek = (e) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    seek(((e.clientX - rect.left) / rect.width) * duration)
  }

  return (
    <AnimatePresence initial={false}>
      {track && (
        <motion.div
          key="mini-player"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="relative z-30 shrink-0 overflow-hidden border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          role="region"
          aria-label="Now playing"
        >
          <div className="flex h-12 items-center gap-3 px-3 sm:px-4">
            <button onClick={toggle} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500" aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <LuPause className="size-3.5" /> : <LuPlay className="ml-0.5 size-3.5" />}
            </button>
            <button onClick={goToMessage} className="flex min-w-0 items-center gap-2 text-left" title="Go to this message">
              <LuMic className="size-4 shrink-0 text-indigo-500" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium leading-tight">{track.title}</span>
                {track.subtitle && <span className="block truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">in {track.subtitle}</span>}
              </span>
            </button>
            <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
              <div onClick={onSeek} className="flex h-6 flex-1 cursor-pointer items-center" role="slider" aria-label="Seek" aria-valuenow={Math.round(progress)}>
                <div className="relative h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
                  <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600" style={{ left: `${progress}%` }} />
                </div>
              </div>
              <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{time(current)} / {time(duration)}</span>
            </div>
            <span className="ml-auto sm:ml-0" />
            <button onClick={cycleRate} className="h-7 shrink-0 rounded-md px-2 text-xs font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800" aria-label={`Playback speed ${rate}x`} title="Playback speed">
              {rate}×
            </button>
            <button onClick={close} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close player" title="Stop and close">
              <LuX className="size-4" />
            </button>
          </div>
          {/* Thin progress line on phones */}
          <div className="h-0.5 bg-slate-100 sm:hidden dark:bg-slate-800"><div className="h-full bg-indigo-600" style={{ width: `${progress}%` }} /></div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default MiniPlayer
