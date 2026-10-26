import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuBell, LuBellRing, LuMessageCircle, LuRepeat, LuVideo, LuX } from 'react-icons/lu'
import { useSocket } from '../context/SocketProvider'
import { useAuth } from '../context/AuthProvider'
import useConversation from '../Zustand/UserConversation'
import { selfContact } from '../utils/conversations'
import { AI_CHAT } from '../utils/ai'

// Reminders the user set for themself ("remind me…", "every 2 minutes…") pop up here,
// wherever they are in the app, with a soft chime and a desktop notification when the tab is hidden.

const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const everyLabel = (m) => (m === 1440 ? 'day' : m === 60 ? 'hour' : m % 60 === 0 ? `${m / 60} hours` : `${m} min`)

// Two soft notes (no audio file needed). Browsers allow it once the user has clicked somewhere.
const chime = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[[880, 0], [1320, 0.16]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + 0.5)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch { /* no audio */ }
}

const canNotify = () => typeof Notification !== 'undefined'

const ReminderToasts = () => {
  const { socket } = useSocket()
  const [AuthUser] = useAuth()
  const [items, setItems] = useState([]) // newest last
  const [permission, setPermission] = useState(() => (canNotify() ? Notification.permission : 'denied'))

  const dismiss = useCallback((id) => setItems((list) => list.filter((r) => r.id !== id)), [])

  useEffect(() => {
    if (!socket) return
    const onReminder = (r) => {
      // A repeating reminder replaces its previous popup
      setItems((list) => [...list.filter((x) => x.id !== r.id), { ...r, at: Date.now() }].slice(-3))
      chime()
      if (document.visibilityState !== 'visible' && canNotify() && Notification.permission === 'granted') {
        try {
          const n = new Notification('Reminder', { body: r.text, tag: `reminder-${r.id}`, icon: '/favicon.svg' })
          n.onclick = () => { window.focus(); n.close() }
        } catch { /* some browsers only allow this from a service worker */ }
      }
    }
    socket.on('reminder', onReminder)
    return () => socket.off('reminder', onReminder)
  }, [socket])

  const stop = async (r) => {
    try { await axios.delete(`/api/ai/scheduled/${r.id}`, { withCredentials: true }) } catch { /* already stopped */ }
    dismiss(r.id)
  }

  const open = (r) => {
    useConversation.getState().setSelectedConversation(r.open === 'nexa' ? AI_CHAT : selfContact(AuthUser))
    dismiss(r.id)
  }

  const askPermission = async () => {
    if (!canNotify()) return
    setPermission(await Notification.requestPermission())
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:w-96" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((r) => (
          <motion.div
            key={`${r.id}-${r.at}`}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2 }}
            role="alert"
            className="pointer-events-auto w-full overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
          >
            <div className="flex gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                <LuBellRing className="size-5 origin-top animate-[wiggle_0.6s_ease-in-out_2]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{r.kind === 'meeting' ? 'Meeting' : 'Reminder'} · {fmtTime(r.at)}</p>
                  <button onClick={() => dismiss(r.id)} className="-mr-1.5 -mt-1 flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Dismiss">
                    <LuX className="size-4" />
                  </button>
                </div>
                <p className="mt-0.5 break-words text-[15px] font-semibold text-slate-900 dark:text-slate-50">{r.text}</p>
                {r.repeating && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <LuRepeat className="size-3.5" /> Every {everyLabel(r.everyMinutes)} · next at {fmtTime(r.nextAt)}{r.left != null ? ` · ${r.left} left` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
              {r.meetLink
                ? <a href={r.meetLink} target="_blank" rel="noreferrer" onClick={() => dismiss(r.id)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500"><LuVideo className="size-3.5" /> Join</a>
                : <button onClick={() => dismiss(r.id)} className="h-8 rounded-lg bg-violet-600 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-violet-500">Got it</button>}
              {r.repeating && (
                <button onClick={() => stop(r)} className="h-8 rounded-lg px-3 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">Stop repeating</button>
              )}
              <div className="flex-1" />
              <button onClick={() => open(r)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" title={r.open === 'nexa' ? 'Open the Nexa chat' : 'Open Message yourself'}>
                <LuMessageCircle className="size-3.5" /> {r.open === 'nexa' ? 'Open Nexa' : 'Open'}
              </button>
            </div>
            {permission === 'default' && (
              <button onClick={askPermission} className="flex w-full items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-left text-xs text-violet-600 hover:bg-violet-50 dark:border-slate-800 dark:text-violet-300 dark:hover:bg-violet-500/10">
                <LuBell className="size-3.5" /> Also notify me when Kova is in the background
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default ReminderToasts
