import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { LuArrowUpRight, LuCheck, LuChevronDown, LuCopy, LuFileText, LuLoaderCircle, LuSparkles } from 'react-icons/lu'
import { AnimatePresence, motion } from 'motion/react'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { selfContact } from '../../utils/conversations'

const api = { withCredentials: true }
const errorOf = (err, fallback) => err.response?.data?.error || fallback

const isVoice = (a) => a && (a.kind === 'audio' || a.mimeType?.startsWith('audio/'))

const EASE = [0.32, 0.72, 0, 1]
const CLAMP_PX = 108 // about 5 lines
const TRANSCRIPT_W = 520 // open width; the bubble's own max width still caps it

// The opened transcript: a soft panel that keeps the bubble's width.
// Long text starts clamped with a fade and grows smoothly on "Read more".
const TranscriptPanel = ({ text, itsMe }) => {
  const bodyRef = useRef(null)
  const [full, setFull] = useState(0)
  const [more, setMore] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const measure = () => setFull(el.scrollHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  const long = full > CLAMP_PX + 12
  const copy = async (e) => {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400) } catch { /* no clipboard */ }
  }
  const panel = itsMe ? 'bg-white/[0.12] ring-1 ring-white/15' : 'bg-slate-50 ring-1 ring-slate-200/80 dark:bg-slate-900/50 dark:ring-slate-700/60'
  const label = itsMe ? 'text-indigo-100/80' : 'text-slate-400 dark:text-slate-500'
  const body = itsMe ? 'text-white/95' : 'text-slate-700 dark:text-slate-200'
  const link = itsMe ? 'text-white hover:text-indigo-100' : 'text-indigo-600 hover:text-indigo-500 dark:text-indigo-400'

  return (
    <div className={`mt-2 rounded-xl px-3 pb-2.5 pt-2 ${panel}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${label}`}>Transcript</span>
        <button type="button" onClick={copy} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition ${itsMe ? 'text-indigo-100 hover:bg-white/15 hover:text-white' : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'}`} title="Copy transcript">
          {copied ? <LuCheck className="size-3" /> : <LuCopy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div
        className="overflow-hidden transition-[max-height,mask-image] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={long ? {
          maxHeight: more ? full : CLAMP_PX,
          // Fade the last lines while clamped (works on any bubble colour)
          maskImage: more ? 'none' : 'linear-gradient(to bottom, #000 60%, transparent)',
          WebkitMaskImage: more ? 'none' : 'linear-gradient(to bottom, #000 60%, transparent)',
        } : undefined}
      >
        <p ref={bodyRef} className={`whitespace-pre-wrap wrap-break-word text-[13px] leading-[1.6] ${body}`}>{text}</p>
      </div>
      {long && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setMore((v) => !v) }} className={`mt-1.5 text-[12px] font-semibold transition ${link}`}>
          {more ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

// Voice note → text. Saved on the message, so everyone in the chat sees it.
export const Transcript = ({ message, itsMe }) => {
  const { setMessages } = useConversation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [width, setWidth] = useState(null) // null: follow the bubble; a number while open or animating
  const baseRef = useRef(0)
  const wrapRef = useRef(null)
  if (!message.transcript && !isVoice(message.attachment)) return null

  if (message.transcript) {
    // Width animates between two pixel values; two frames so the browser sees the start value
    const animateTo = (from, to) => {
      setWidth(from)
      requestAnimationFrame(() => requestAnimationFrame(() => setWidth(to)))
    }
    const toggle = (e) => {
      e.stopPropagation()
      const now = wrapRef.current?.offsetWidth || 0
      if (expanded) { setExpanded(false); animateTo(now, baseRef.current); return }
      baseRef.current = now
      setExpanded(true)
      animateTo(now, message.transcript.length < 90 ? Math.max(now, 340) : TRANSCRIPT_W)
    }
    return (
      // Closed: takes the bubble's width (w-0 + min-w-full) so it never stretches it.
      // Open: the bubble widens smoothly so the transcript has room to read.
      <div
        ref={wrapRef}
        className={width == null ? 'w-0 min-w-full' : 'max-w-full transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'}
        style={width == null ? undefined : { width }}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'width' && !expanded) setWidth(null) }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className={`mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-full pl-2.5 pr-2 text-[12px] font-medium transition-colors ${
            itsMe
              ? 'bg-white/15 text-white/90 hover:bg-white/25 hover:text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-800 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'
          }`}
        >
          <LuFileText className="size-3.5 shrink-0 opacity-80" />
          <span>{expanded ? 'Hide transcript' : 'Show transcript'}</span>
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.3, ease: EASE }} className="flex">
            <LuChevronDown className="size-3.5 shrink-0" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="transcript"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1, transition: { height: { duration: 0.34, ease: EASE }, opacity: { duration: 0.22, delay: 0.06 } } }}
              exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.28, ease: EASE }, opacity: { duration: 0.14 } } }}
              className="overflow-hidden"
            >
              <motion.div initial={{ y: -6 }} animate={{ y: 0 }} exit={{ y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
                <TranscriptPanel text={message.transcript} itsMe={itsMe} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
  const run = async (e) => {
    e.stopPropagation()
    setBusy(true)
    setError('')
    try {
      const res = await axios.post(`/api/ai/transcribe/${message._id}`, {}, api)
      setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, transcript: res.data.transcript } : m)))
      setExpanded(true)
    } catch (err) {
      setError(errorOf(err, "Couldn't transcribe"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button onClick={run} disabled={busy} className={`mt-1 inline-flex items-center gap-1 text-[12px] font-medium ${itsMe ? 'text-indigo-100 hover:text-white' : 'text-indigo-600 hover:underline dark:text-indigo-400'}`}>
      {busy ? <LuLoaderCircle className="size-3 animate-spin" /> : <LuSparkles className="size-3" />}
      {busy ? 'Transcribing…' : error || 'Transcribe'}
    </button>
  )
}

// Translation shown under the original text
export const Translation = ({ translation, itsMe, onHide }) => {
  if (!translation) return null
  const tone = itsMe ? 'border-white/40 text-indigo-50' : 'border-indigo-300 text-slate-700 dark:border-indigo-500/50 dark:text-slate-200'
  return (
    <div className={`mt-1.5 border-l-2 pl-2 text-[13px] leading-snug ${tone}`}>
      {translation.loading ? (
        <span className="inline-flex items-center gap-1 opacity-80"><LuLoaderCircle className="size-3 animate-spin" /> Translating…</span>
      ) : translation.error ? (
        <span className="opacity-80">{translation.error}</span>
      ) : (
        <>
          <span className="whitespace-pre-wrap">{translation.text}</span>
          <button onClick={(e) => { e.stopPropagation(); onHide() }} className={`ml-1.5 text-[11px] underline-offset-2 hover:underline ${itsMe ? 'text-indigo-200' : 'text-slate-400'}`}>
            {translation.language} · hide
          </button>
        </>
      )}
    </div>
  )
}

export const useTranslation = (message) => {
  const [translation, setTranslation] = useState(null)
  const translate = async () => {
    if (translation?.text) return setTranslation(null)
    setTranslation({ loading: true })
    try {
      const res = await axios.post(`/api/ai/translate/${message._id}`, { language: navigator.language || 'en' }, api)
      const plain = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
      const same = plain(res.data.text) === plain([message.message, message.transcript].filter(Boolean).join(' '))
      setTranslation(same ? { error: `Already in ${res.data.language}` } : { text: res.data.text, language: res.data.language })
    } catch (err) {
      setTranslation({ error: errorOf(err, "Couldn't translate") })
    }
  }
  return { translation, translate, hide: () => setTranslation(null) }
}

// Reminders made with "Remind me about this" link back to the message
export const GoToMessage = ({ message, itsMe }) => {
  const [AuthUser] = useAuth()
  const { contacts, groups, setSelectedConversation, setPendingJump } = useConversation()
  const ref = message.ref
  if (!ref?.messageId) return null
  const open = (e) => {
    e.stopPropagation()
    const chat = String(ref.chatId) === String(AuthUser?._id)
      ? selfContact(AuthUser)
      : ref.isGroup
        ? groups.find((g) => String(g._id) === String(ref.chatId))
        : contacts.find((c) => String(c._id) === String(ref.chatId))
    if (!chat) return
    setPendingJump(ref.messageId)
    setSelectedConversation(chat)
  }
  return (
    <button onClick={open} className={`mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium ${itsMe ? 'text-indigo-100 hover:text-white' : 'text-indigo-600 hover:underline dark:text-indigo-400'}`}>
      <LuArrowUpRight className="size-3.5" /> Go to message
    </button>
  )
}

const at = (hours) => new Date(Date.now() + hours * 3600_000)
const tomorrowAt = (h) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d }
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

// Small menu next to a message: when should Nexa remind you?
export const RemindMenu = ({ message, align, placement, onClose }) => {
  const ref = useRef(null)
  const [custom, setCustom] = useState(() => toLocalInput(at(2)))
  const [state, setState] = useState(null) // null | 'saving' | 'done' | error text

  useEffect(() => {
    const onDown = (e) => !ref.current?.contains(e.target) && onClose()
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const remind = async (when) => {
    setState('saving')
    try {
      await axios.post(`/api/ai/remind/${message._id}`, { sendAt: when.toISOString() }, api)
      setState('done')
      setTimeout(onClose, 1200)
    } catch (err) {
      setState(errorOf(err, "Couldn't set the reminder"))
    }
  }

  const options = [['In 1 hour', at(1)], ['In 3 hours', at(3)], ['Tomorrow, 9 AM', tomorrowAt(9)]]
  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className={`absolute z-30 w-56 rounded-xl bg-white p-1 text-left text-sm shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {state === 'done' ? (
        <p className="flex items-center gap-2 px-3 py-3 text-emerald-600 dark:text-emerald-400"><LuCheck className="size-4" /> Reminder set</p>
      ) : (
        <>
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Remind me</p>
          {options.map(([label, when]) => (
            <button key={label} disabled={state === 'saving'} onClick={() => remind(when)} className="block w-full rounded-lg px-3 py-2 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800">
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 border-t border-slate-100 p-2 dark:border-slate-800">
            <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-950" />
            <button disabled={state === 'saving' || !custom} onClick={() => remind(new Date(custom))} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">Set</button>
          </div>
          {state && state !== 'saving' && <p className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{state}</p>}
        </>
      )}
    </div>
  )
}
