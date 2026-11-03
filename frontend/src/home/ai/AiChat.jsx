import useInputHistory from '../../hooks/useInputHistory'
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AnimatePresence, motion } from 'motion/react'
import { LuArrowLeft, LuBookmark, LuBookmarkCheck, LuCalendarDays, LuCheck, LuEllipsisVertical, LuTimer, LuFileText, LuPaperclip, LuRepeat, LuCircleAlert, LuClock, LuCopy, LuGlobe, LuImages, LuMessageCircle, LuSendHorizontal, LuSmile, LuLoaderCircle, LuSquare, LuTrash2, LuVolume2, LuX, LuLightbulb, LuReply, LuRefreshCw, LuPencil, LuPenLine, LuUndo2, LuMic, LuUpload, LuWandSparkles, LuSettings2 } from 'react-icons/lu'
import { canSpeak, speak, useSpeech } from '../../utils/speak'
import { selfContact } from '../../utils/conversations'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { AiAvatar } from '../Avatar'
import ConfirmDialog from '../ConfirmDialog'
import Mermaid from './Mermaid'
import NexaImage from './NexaImage'
import MediaManager from '../media/MediaManager'
import { deleteNexaItems, nexaMediaItems } from '../../utils/mediaItems'
import GoogleCalendarDialog from './GoogleCalendarDialog'
import { clearGoogleResult, peekGoogleResult } from '../../utils/google'
import { AgendaCard, DraftCard, EventCard, ReminderCard, SnoozedCard, TaskCard } from './AgendaCards'
import { useSocket } from '../../context/SocketProvider'
import { compressImage, formatBytes } from '../../utils/attachments'
import { TIMER_OPTIONS, timerLabel, timerShort } from '../../utils/chatExtras'
import MediaPicker from '../media/MediaPicker'
import { StickerHost } from '../media/StickerMaker'
import { remarkHtmlBreaks, remarkLineBreaks } from '../../utils/markdown'
import useWallpaper from '../../hooks/useWallpaper'
import { AI_CHAT } from '../../utils/ai'
import RewriteMenu from '../rightPart/RewriteMenu'
import useVoiceRecorder, { MAX_VOICE_SECONDS } from '../../hooks/useVoiceRecorder'
import { useNavigate } from 'react-router-dom'

const REMARK = [remarkGfm, remarkHtmlBreaks, remarkLineBreaks]

const api = { withCredentials: true }
const MAX_HEIGHT = 140

// What Nexa can do. Tapping one puts the example in the box to edit and send.
// `starter` ones are shown on the empty screen; all of them for "What can you do?".
const CAPABILITIES = [
  { title: 'Send a message', example: "Tell Arjun I'm running 10 minutes late", starter: true },
  { title: 'Schedule a message', example: 'Wish Priya happy birthday tomorrow at 9am', starter: true },
  { title: 'Set a reminder', example: 'Remind me at 6pm to call mom', starter: true },
  { title: 'Catch up on a chat', example: 'Summarize my chat with Arjun', starter: true },
  { title: 'Search the web', example: "What's today's top news?", starter: true },
  { title: 'Create an image', example: 'Draw a cozy cabin in the snow at night', starter: true },
  { title: 'Check your calendar', example: "What's on my calendar today?" },
  { title: 'Manage scheduled', example: 'What do I have scheduled?' },
  { title: 'Read photos & PDFs', example: 'Summarize this PDF in 5 bullets' },
  { title: 'Write and rewrite', example: 'Make this more professional: ' },
  { title: 'Translate', example: "Translate 'see you soon' to Hindi" },
  { title: 'Set up a business', example: 'Create a business account for my bakery, open 9am to 8pm, closed Sunday', starter: true },
  { title: 'Run your business', example: 'Add chocolate cake for ₹650 to my catalog and make a 10% code WELCOME10' },
  { title: 'Groups & communities', example: 'Make a group called Goa Trip with Priya and Rahul', starter: true },
  { title: 'Profile & privacy', example: "Hide my last seen and set my about to 'Busy building'" },
  { title: 'Kova help', example: 'How do communities work?' },
]

const CapabilitiesCard = ({ onPick, all = false }) => (
  <div className="w-full max-w-2xl text-left">
    <div className="grid gap-2 sm:grid-cols-2">
      {CAPABILITIES.filter((c) => all || c.starter).map(({ title, example }) => (
        <button
          key={title}
          onClick={() => onPick(example)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
        >
          <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-slate-500 dark:text-slate-400">{example.trim()}</span>
        </button>
      ))}
    </div>
    {all && (
      <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        In any chat, Nexa can also rewrite your message, suggest replies, catch you up, translate, transcribe voice notes and set reminders. Mention @Nexa in groups to ask it there.
      </p>
    )}
  </div>
)

// Put the stored question and Nexa's answer in place of the temporary bubble (the answer may
// already have arrived live over the socket)
const withAnswer = (prev, tempId, { question, answer }) => {
  const ids = new Set([tempId, question?._id, answer?._id].filter(Boolean))
  return [...prev.filter((m) => !ids.has(m._id)), question, answer].filter(Boolean)
}

const timeZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } })()
const formatWhen = (date) => new Date(date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// 2 -> "2 min", 60 -> "hour", 1440 -> "day", 90 -> "90 min"
const everyLabel = (m) => (m === 1440 ? 'day' : m === 60 ? 'hour' : m % 1440 === 0 ? `${m / 1440} days` : m % 60 === 0 ? `${m / 60} hours` : `${m} min`)

const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Language names for the code block header
const LANGS = { js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', typescript: 'TypeScript', python: 'Python', c: 'C', shell: 'Shell', tsx: 'TSX', py: 'Python', csharp: 'C#', cs: 'C#', cpp: 'C++', sh: 'Shell', bash: 'Bash', html: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL', java: 'Java', go: 'Go', rust: 'Rust', php: 'PHP', ruby: 'Ruby', kotlin: 'Kotlin', swift: 'Swift', yaml: 'YAML', xml: 'XML' }

// A code block with its file name (or language) and a Copy button, so each file can be copied on its own.
// File name comes from the fence: ```csharp FactionManager.cs
const CodeBlock = ({ node, children }) => {
  const [copied, setCopied] = useState(false)
  const lang = (node.properties?.className || []).find((c) => String(c).startsWith('language-'))?.slice(9) || ''
  const file = String(node.data?.meta || '').match(/[\w./-]+\.\w+/)?.[0]
  const label = file || LANGS[lang.toLowerCase()] || lang || 'Code'
  const copy = async () => {
    try { await navigator.clipboard.writeText(textOf(node).replace(/\n$/, '')); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="my-2 overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-800 first:mt-0 last:mb-0 dark:bg-black/40 dark:ring-slate-700/60">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-300" title={label}>{label}</span>
        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label={`Copy ${label}`}>
          {copied ? <LuCheck className="size-3" /> : <LuCopy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-100">{children}</pre>
    </div>
  )
}

// Nexa's Markdown, sized to sit inside a normal chat bubble
const md = {
  p: (props) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />,
  // [&_li>p]:my-0: no big gaps when the bullets come with blank lines between them
  ul: (props) => <ul className="my-1.5 list-disc space-y-0.5 pl-4 first:mt-0 last:mb-0 [&_li>p]:my-0 [&_li>p:last-of-type]:inline" {...props} />,
  ol: (props) => <ol className="my-1.5 list-decimal space-y-0.5 pl-4 first:mt-0 last:mb-0 [&_li>p]:my-0 [&_li>p:last-of-type]:inline" {...props} />,
  h1: (props) => <p className="my-1.5 font-semibold first:mt-0" {...props} />,
  h2: (props) => <p className="my-1.5 font-semibold first:mt-0" {...props} />,
  h3: (props) => <p className="my-1.5 font-semibold first:mt-0" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  a: (props) => <a className="font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400" target="_blank" rel="noreferrer" {...props} />,
  blockquote: (props) => <blockquote className="my-1.5 border-l-2 border-slate-300 pl-2.5 text-slate-600 dark:border-slate-600 dark:text-slate-300" {...props} />,
  hr: () => <hr className="my-2 border-slate-200 dark:border-slate-700" />,
  pre: ({ node, ...props }) => {
    // ```mermaid blocks become diagrams
    const code = node?.children?.[0]
    if (code?.tagName === 'code' && code.properties?.className?.includes('language-mermaid')) {
      return <Mermaid code={textOf(code).trim()} />
    }
    if (code?.tagName === 'code') return <CodeBlock node={code}>{props.children}</CodeBlock>
    return <pre className="my-1.5 overflow-x-auto rounded-lg bg-slate-900 p-2.5 text-xs leading-relaxed text-slate-100 dark:bg-black/40" {...props} />
  },
  code: ({ className, children, ...props }) =>
    className
      ? <code className={className} {...props}>{children}</code>
      : <code className="rounded bg-slate-100 px-1 py-0.5 text-[12.5px] dark:bg-slate-700/70" {...props}>{children}</code>,
  table: (props) => <div className="my-1.5 overflow-x-auto"><table className="w-full border-collapse text-left text-xs" {...props} /></div>,
  th: (props) => <th className="border-b border-slate-200 px-2 py-1 font-semibold dark:border-slate-700" {...props} />,
  td: (props) => <td className="border-b border-slate-100 px-2 py-1 align-top dark:border-slate-800" {...props} />,
}

// Nexa's Markdown as one plain line (for reply quotes)
const plainText = (md) => String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`>#|~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim()

// Plain text of a Markdown node, leaving out nested lists
const textOf = (node) => {
  if (!node) return ''
  if (node.type === 'text') return node.value
  if (node.tagName === 'ul' || node.tagName === 'ol') return ''
  return (node.children || []).map(textOf).join('')
}

// A list item with a "Know more" button that asks Nexa about that point
const listItem = (onAsk) => {
  const Item = ({ node, children, ...props }) => {
    const topic = textOf(node).replace(/\s+/g, ' ').trim()
    const nested = node?.children?.some((c) => c.tagName === 'ul' || c.tagName === 'ol')
    if (!onAsk || !topic || nested) return <li {...props}>{children}</li>
    return (
      <li className="group/li" {...props}>
        {children}
        <button
          type="button"
          onClick={() => onAsk(`Tell me more about: "${topic}"`)}
          className="ml-1.5 inline-flex -translate-y-px items-center gap-0.5 rounded-full px-1.5 py-px align-middle text-[11px] font-medium text-violet-600 opacity-0 ring-1 ring-violet-200 transition hover:bg-violet-50 focus:opacity-100 group-hover/li:opacity-100 pointer-coarse:opacity-100 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500/10"
          title="Ask Nexa about this"
        >
          <LuLightbulb className="size-3" /> Know more
        </button>
      </li>
    )
  }
  return Item
}

// Same sizes as normal chat bubbles
const bubbleWidth = 'max-w-[85%] sm:max-w-[75%] lg:max-w-[min(65%,640px)]'
const wideBubbleWidth = 'w-full max-w-[95%] sm:max-w-[85%] lg:max-w-[min(80%,820px)]'

const Thinking = () => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 flex items-end gap-2">
    <AiAvatar size="xs" />
    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] shadow-xs ring-1 ring-violet-200 dark:bg-slate-800 dark:ring-violet-500/30">
      <span className="font-medium text-violet-600 dark:text-violet-300">Nexa is thinking</span>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
    </div>
  </motion.div>
)

// What Nexa did: a card per action, with Cancel / Open chat
const ActionCard = ({ action, status, onCancel, onOpen }) => {
  const [busy, setBusy] = useState(false)
  const state = action.type === 'scheduled' ? status || 'pending' : action.type
  const look = {
    pending: action.repeatEvery
      ? { Icon: LuRepeat, title: `Repeats every ${everyLabel(action.repeatEvery)}`, tone: 'text-indigo-600 dark:text-indigo-400' }
      : { Icon: LuClock, title: `Scheduled · ${formatWhen(action.sendAt)}`, tone: 'text-indigo-600 dark:text-indigo-400' },
    sending: { Icon: LuClock, title: 'Sending…', tone: 'text-indigo-600 dark:text-indigo-400' },
    sent: { Icon: LuCheck, title: action.type === 'sent' ? 'Sent' : action.repeatEvery ? 'Finished' : `Sent · ${formatWhen(action.sendAt)}`, tone: 'text-emerald-600 dark:text-emerald-400' },
    cancelled: { Icon: LuX, title: 'Cancelled', tone: 'text-slate-500 dark:text-slate-400' },
    failed: { Icon: LuCircleAlert, title: action.error ? `Couldn't send: ${action.error}` : "Couldn't send", tone: 'text-red-600 dark:text-red-400' },
  }[state] || { Icon: LuCheck, title: state, tone: 'text-slate-500' }

  return (
    <div className="mt-1.5 w-full max-w-sm rounded-xl bg-white px-3 py-2.5 text-sm shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800/70 dark:ring-slate-700/60">
      <p className={`flex items-center gap-1.5 text-xs font-medium ${look.tone}`}><look.Icon className="size-3.5" /> {look.title}</p>
      {action.to && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">To {action.to}</p>}
      {action.repeatEvery && state === 'pending' && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">From {formatWhen(action.sendAt)} · {action.repeatTimes} times{action.lastAt ? `, last at ${formatWhen(action.lastAt)}` : ''}</p>
      )}
      {action.text && <p className="mt-1 line-clamp-3 border-l-2 border-slate-200 pl-2 text-slate-700 dark:border-slate-600 dark:text-slate-200">{action.text}</p>}
      <div className="mt-2 flex gap-1.5">
        {state === 'pending' && (
          <button disabled={busy} onClick={async () => { setBusy(true); await onCancel(action.id); setBusy(false) }} className="h-7 rounded-md px-2.5 text-xs font-medium text-red-600 ring-1 ring-slate-200 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:ring-slate-700 dark:hover:bg-red-500/10">
            {action.repeatEvery ? 'Stop' : 'Cancel'}
          </button>
        )}
        {action.chatId && state !== 'cancelled' && (
          <button onClick={() => onOpen(action)} className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">
            <LuMessageCircle className="size-3.5" /> Open chat
          </button>
        )}
      </div>
    </div>
  )
}

// Something Nexa changed in the app for the user: business, group, profile, privacy…
const AppCard = ({ action, onOpen }) => {
  const navigate = useNavigate()
  const details = (action.details || []).filter(Boolean)
  return (
    <div className="mt-1.5 w-full max-w-sm rounded-xl bg-white px-3 py-2.5 text-sm shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800/70 dark:ring-slate-700/60">
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><LuSettings2 className="size-3.5 shrink-0" /> {action.title}</p>
      {details.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
          {details.map((d, i) => <li key={i} className="break-words">{d}</li>)}
        </ul>
      )}
      {(action.link || action.chatId) && (
        <div className="mt-2 flex gap-1.5">
          {action.chatId && (
            <button onClick={() => onOpen(action)} className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">
              <LuMessageCircle className="size-3.5" /> Open chat
            </button>
          )}
          {action.link && (
            <button onClick={() => navigate(action.link)} className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">
              {action.linkLabel || 'Open'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Web pages Nexa searched, as small link chips
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const Sources = ({ items }) => (
  <div className="mt-1.5 flex max-w-full flex-wrap gap-1.5">
    {items.map((s) => (
      <a
        key={s.url}
        href={s.url}
        target="_blank"
        rel="noreferrer"
        title={s.title}
        className="inline-flex max-w-56 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200 transition hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
      >
        <LuGlobe className="size-3 shrink-0" />
        <span className="truncate">{hostOf(s.url)}</span>
      </a>
    ))}
  </div>
)

const NexaBubble = memo(({ message, statuses, onCancel, onOpen, onPick, onAsk, onImageSaved, onKeep, onDelete, onReply, onRetry }) => {
  if (message.actions?.some((a) => a.type === 'capabilities')) {
    return (
      <div className="mb-3 flex items-end gap-2 pb-1">
        <AiAvatar size="xs" />
        <div className="min-w-0 flex-1">
          <p className="mb-2 inline-block rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/60">Here's what I can do. Tap one to try it.</p>
          <CapabilitiesCard onPick={onPick} all />
        </div>
      </div>
    )
  }
  return <NexaAnswer message={message} statuses={statuses} onCancel={onCancel} onOpen={onOpen} onAsk={onAsk} onImageSaved={onImageSaved} onKeep={onKeep} onDelete={onDelete} onReply={onReply} onRetry={onRetry} />
})

const NexaAnswer = ({ message, statuses, onCancel, onOpen, onAsk, onImageSaved, onKeep, onDelete, onReply, onRetry }) => {
  const [copied, setCopied] = useState(false)
  const components = useMemo(() => ({ ...md, li: listItem(onAsk) }), [onAsk])
  // Diagrams and tables get a wider bubble
  const wide = /```mermaid|^\s*\|.*\|\s*$/m.test(message.content || '')
  // Reminders and the morning brief are shown as a card only (the text is kept for Copy)
  const cardOnly = message.actions?.some((a) => a.type === 'agenda' || a.type === 'reminder' || (a.type === 'event' && a.reminder))
  const greeting = (message.content || '').match(/\*\*(.+?)\*\*/)?.[1]
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="group mb-3 flex items-end gap-2 pb-1">
      <AiAvatar size="xs" />
      <div className={`flex min-w-0 flex-col items-start ${wide ? wideBubbleWidth : bubbleWidth}`}>
        {!cardOnly && (
          <div className="max-w-full rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm leading-relaxed text-slate-800 shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/60">
            <ReactMarkdown remarkPlugins={REMARK} components={components}>{message.content}</ReactMarkdown>
          </div>
        )}
        {(message.actions || []).map((a, i) => (a.type === 'image'
          ? <NexaImage key={a.id || i} messageId={message._id} action={a} fresh={isFresh(message)} onSaved={onImageSaved} />
          : a.type === 'sources' ? <Sources key={i} items={a.items || []} />
            : a.type === 'agenda' ? <AgendaCard key={i} action={a} greeting={greeting} />
              : a.type === 'event' ? <EventCard key={i} action={a} messageId={message._id} onSaved={onImageSaved} />
                : a.type === 'snoozed' ? <SnoozedCard key={i} action={a} />
                  : a.type === 'reminder' ? <ReminderCard key={i} action={a} status={statuses[a.id]} onStop={onCancel} />
                    : a.type === 'task' ? <TaskCard key={i} action={a} />
                      : a.type === 'draft' ? <DraftCard key={i} action={a} />
                        : a.type === 'app' ? <AppCard key={i} action={a} onOpen={onOpen} />
                        : <ActionCard key={i} action={a} status={a.id ? statuses[a.id] : null} onCancel={onCancel} onOpen={onOpen} />
        ))}
        <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-400">
          {message.createdAt && formatTime(message.createdAt)}
          <button onClick={copy} className="inline-flex items-center gap-1 opacity-0 transition hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 dark:hover:text-slate-200">
            {copied ? <LuCheck className="size-3" /> : <LuCopy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <ListenButton id={`ai-${message._id}`} text={message.content} />
          {onReply && !String(message._id).startsWith('temp-') && (
            <button onClick={() => onReply(message)} className="inline-flex items-center gap-1 opacity-0 transition hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 dark:hover:text-slate-200" title="Reply to this answer">
              <LuReply className="size-3" /> Reply
            </button>
          )}
          {onRetry && (
            <button onClick={() => onRetry(message)} className="inline-flex items-center gap-1 opacity-0 transition hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 dark:hover:text-slate-200" title="Ask again for a new answer">
              <LuRefreshCw className="size-3" /> Regenerate
            </button>
          )}
          <MessageTools message={message} onKeep={onKeep} onDelete={onDelete} />
        </p>
      </div>
    </div>
  )
}

// Answers from the last couple of minutes (older unfinished images wait for a click)
const isFresh = (message) => Date.now() - new Date(message.createdAt).getTime() < 2 * 60 * 1000

// Keep (stop it disappearing) and Delete, under each message in the Nexa chat
// Read the answer aloud (tap again to stop)
const ListenButton = ({ id, text }) => {
  const speaking = useSpeech((st) => st.speakingId === id)
  const loading = useSpeech((st) => st.loadingId === id)
  if (!canSpeak() || !text?.trim()) return null
  const active = speaking || loading
  return (
    <button onClick={() => speak(id, text)} className={`inline-flex items-center gap-1 transition hover:text-slate-700 focus:opacity-100 dark:hover:text-slate-200 ${active ? 'text-indigo-600 opacity-100 dark:text-indigo-400' : 'opacity-0 group-hover:opacity-100'}`} aria-label={active ? 'Stop reading' : 'Listen'}>
      {loading ? <LuLoaderCircle className="size-3 animate-spin" /> : speaking ? <LuSquare className="size-3" /> : <LuVolume2 className="size-3" />}
      {loading ? 'Preparing…' : speaking ? 'Stop' : 'Listen'}
    </button>
  )
}

const MessageTools = ({ message, onKeep, onDelete, align = 'left' }) => {
  const [confirm, setConfirm] = useState(false)
  if (String(message._id).startsWith('temp-')) return null
  const btn = 'inline-flex items-center gap-1 rounded px-1 transition hover:text-slate-700 dark:hover:text-slate-200'
  return (
    <span className={`flex items-center gap-2 ${align === 'right' ? 'order-first' : ''}`}>
      {message.kept && <span className="inline-flex items-center gap-1 font-medium text-indigo-500"><LuBookmarkCheck className="size-3" /> Kept</span>}
      <span className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <button onClick={() => onKeep(message, !message.kept)} className={btn} title={message.kept ? "Let it disappear again" : "Keep: it won't disappear"}>
          <LuBookmark className="size-3" /> {message.kept ? "Don't keep" : 'Keep'}
        </button>
        {confirm ? (
          <span className="inline-flex items-center gap-1.5">
            <button onClick={() => onDelete(message)} className="font-medium text-red-600 hover:underline dark:text-red-400">Delete</button>
            <button onClick={() => setConfirm(false)} className="hover:underline">Cancel</button>
          </span>
        ) : (
          <button onClick={() => setConfirm(true)} className={`${btn} hover:text-red-600! dark:hover:text-red-400!`} title="Delete this message"><LuTrash2 className="size-3" /> Delete</button>
        )}
      </span>
    </span>
  )
}

// What Nexa can read
const NEXA_FILES = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.txt,text/csv,.csv'
const NEXA_MAX_BYTES = 10 * 1024 * 1024

const FileChip = ({ name, size, onDark }) => (
  <span className={`flex max-w-full items-center gap-2.5 rounded-xl px-3 py-2 ${onDark ? 'bg-white/15' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'}`}>
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${onDark ? 'bg-white/20' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'}`}><LuFileText className="size-4" /></span>
    <span className="min-w-0 text-left">
      <span className="block truncate text-[13px] font-medium">{name}</span>
      {size ? <span className={`block text-[11px] ${onDark ? 'text-indigo-100' : 'text-slate-400'}`}>{formatBytes(size)}</span> : null}
    </span>
  </span>
)

// Copy / Edit under your own question
const MyTools = ({ message, onEdit }) => {
  const [copied, setCopied] = useState(false)
  if (!message.content || String(message._id).startsWith('temp-')) return null
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  const btn = 'inline-flex items-center gap-1 rounded px-1 opacity-0 transition hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 dark:hover:text-slate-200'
  return (
    <span className="order-first flex items-center gap-2">
      <button onClick={copy} className={btn}>{copied ? <LuCheck className="size-3" /> : <LuCopy className="size-3" />}{copied ? 'Copied' : 'Copy'}</button>
      <button onClick={() => onEdit(message)} className={btn} title="Put this question back in the box to change it"><LuPencil className="size-3" /> Edit</button>
    </span>
  )
}

const MyBubble = memo(({ message, onKeep, onDelete, onEdit }) => (
  <div className="group mb-3 flex justify-end pb-1">
    <div className={`flex flex-col items-end gap-1 ${bubbleWidth}`}>
      {message.quote && (
        <p className="flex max-w-full items-start gap-1.5 rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500 ring-1 ring-slate-200/70 dark:bg-slate-800/70 dark:text-slate-400 dark:ring-slate-700/60">
          <LuReply className="mt-0.5 size-3 shrink-0 text-violet-500" />
          <span className="line-clamp-2">{message.quote}</span>
        </p>
      )}
      {message.attachment?.kind === 'image' && (
        <a href={message.attachment.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl rounded-br-md ring-1 ring-slate-200 dark:ring-slate-700">
          <img src={message.attachment.url} alt={message.attachment.name || 'Photo'} className="block max-h-72 max-w-full object-cover" />
        </a>
      )}
      {message.attachment?.kind === 'sticker' && (
        <img src={message.attachment.url} alt={message.attachment.name || 'Sticker'} className="size-32 object-contain" />
      )}
      {message.attachment?.kind === 'gif' && (
        <div className="relative overflow-hidden rounded-2xl rounded-br-md ring-1 ring-slate-200 dark:ring-slate-700" style={{ aspectRatio: `${message.attachment.width || 1} / ${message.attachment.height || 1}`, width: Math.min(260, Math.round(220 * (message.attachment.width || 1) / (message.attachment.height || 1))) }}>
          <img src={message.attachment.url} alt={message.attachment.name || 'GIF'} className="size-full object-cover" />
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1 text-[10px] font-bold text-white">GIF</span>
        </div>
      )}
      {message.attachment && !['image', 'gif', 'sticker'].includes(message.attachment.kind) && (
        <a href={message.attachment.url} target="_blank" rel="noreferrer" className="block max-w-full"><FileChip name={message.attachment.name} size={message.attachment.size} /></a>
      )}
      {message.content && <p className="whitespace-pre-wrap break-words max-w-full rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm leading-relaxed text-white">{message.content}</p>}
      <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-400">
        <MyTools message={message} onEdit={onEdit} />
        <MessageTools message={message} onKeep={onKeep} onDelete={onDelete} align="right" />
        {message.createdAt && formatTime(message.createdAt)}
      </p>
    </div>
  </div>
))

// Private chat with Nexa, Kova's AI assistant (answers come from Groq via the server)
const AiChat = () => {
  const wallpaper = useWallpaper(AI_CHAT._id)
  const [AuthUser] = useAuth()
  const { setSelectedConversation, contacts, groups, scheduledVersion } = useConversation()
  const [statuses, setStatuses] = useState({}) // scheduled message id -> pending | sent | cancelled | failed
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [thinking, setThinking] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  // Google Calendar: open the settings when coming back from Google's sign-in
  const [googleResult] = useState(() => peekGoogleResult())
  useEffect(() => { clearGoogleResult() }, [])
  const [calendarOpen, setCalendarOpen] = useState(!!googleResult)
  const [googleConnected, setGoogleConnected] = useState(null)
  const { socket } = useSocket()
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  // Your past questions, for ↑ / ↓ in the message box
  const sentTexts = useMemo(() => messages.filter((m) => m.role === 'user' && m.content).map((m) => m.content), [messages])
  const firstName = AuthUser?.fullName?.split(' ')[0]

  useEffect(() => {
    axios.get('/api/ai/messages', api)
      .then((res) => { setMessages(res.data.messages); if (res.data.busy) setThinking(true) })
      .catch(() => setError('Could not load your chat with Nexa.'))
      .finally(() => setLoading(false))
    inputRef.current?.focus()
  }, [])

  // Is Google connected? (dot on the calendar button)
  useEffect(() => {
    axios.get('/api/google/status', api).then((res) => setGoogleConnected(res.data.connected)).catch(() => { })
  }, [])
  const onGoogleStatus = useCallback((s) => setGoogleConnected(s.connected), [])

  // Disappearing Nexa chat (24 h by default)
  const [timer, setTimer] = useState(86400)
  const [timerOpen, setTimerOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Which image model Nexa draws with (Auto = every model in turn)
  const [imageModel, setImageModel] = useState('auto')
  const [imageModels, setImageModels] = useState([])
  const [modelOpen, setModelOpen] = useState(false)
  // Re-check which models work each time the menu opens (e.g. one ran out of free quota)
  useEffect(() => {
    if (!modelOpen) return
    axios.get('/api/ai/settings', api).then((res) => { if (res.data.imageModels) setImageModels(res.data.imageModels) }).catch(() => { })
  }, [modelOpen])
  useEffect(() => {
    axios.get('/api/ai/settings', api).then((res) => {
      setTimer(res.data.disappearAfter)
      if (res.data.imageModel) setImageModel(res.data.imageModel)
      if (res.data.imageModels) setImageModels(res.data.imageModels)
    }).catch(() => { })
  }, [])
  const changeImageModel = async (id) => {
    setModelOpen(false)
    const before = imageModel
    setImageModel(id)
    try { await axios.put('/api/ai/settings/image-model', { imageModel: id }, api) } catch (err) { setImageModel(before); setError(err.response?.data?.error || "Couldn't change the image model.") }
  }
  const modelLabel = imageModels.find((m) => m.id === imageModel)?.label || 'Auto'
  const modelMenu = (
    <>
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Image model</p>
      <p className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">Nexa only draws with the model you pick. Auto tries them in turn, so you always get a picture.</p>
      {imageModels.map((m) => (
        <button key={m.id} role="menuitemradio" aria-checked={imageModel === m.id} disabled={m.available === false && imageModel !== m.id} onClick={() => changeImageModel(m.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-slate-800">
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-slate-700 dark:text-slate-200">{m.label}</span>
            <span className="block truncate text-xs text-slate-400">{m.note}</span>
          </span>
          {imageModel === m.id && <LuCheck className="size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
        </button>
      ))}
    </>
  )
  const changeTimer = async (secs) => {
    setTimerOpen(false)
    const before = timer
    setTimer(secs)
    try {
      await axios.put('/api/ai/settings', { disappearAfter: secs }, api)
      const res = await axios.get('/api/ai/messages', api)
      setMessages(res.data.messages)
    } catch { setTimer(before); setError("Couldn't change that setting.") }
  }
  const keepMessage = useCallback(async (m, kept) => {
    try {
      const res = await axios.put(`/api/ai/messages/${m._id}/keep`, { kept }, api)
      setMessages((prev) => prev.map((x) => (x._id === m._id ? { ...x, kept: res.data.message.kept, expiresAt: res.data.message.expiresAt } : x)))
    } catch { setError("Couldn't update that message.") }
  }, [])
  const deleteMessage = useCallback(async (m) => {
    try {
      await axios.delete(`/api/ai/messages/${m._id}`, api)
      setMessages((prev) => prev.filter((x) => x._id !== m._id))
    } catch { setError("Couldn't delete that message.") }
  }, [])

  // Messages Nexa sends by itself: morning brief, meeting reminders
  useEffect(() => {
    if (!socket) return
    const onNexa = (msg) => setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]))
    // Nexa still working on a question (e.g. you left the chat and came back)
    const onBusy = ({ busy }) => setThinking(!!busy)
    // Old messages disappearing (the 24-hour timer)
    const onGone = (ids) => { const gone = new Set(ids); setMessages((prev) => prev.filter((m) => !gone.has(String(m._id)))) }
    socket.on('nexaMessage', onNexa)
    socket.on('nexaMessagesDeleted', onGone)
    socket.on('nexaBusy', onBusy)
    return () => { socket.off('nexaMessage', onNexa); socket.off('nexaMessagesDeleted', onGone); socket.off('nexaBusy', onBusy) }
  }, [socket])

  // Keep scheduled cards up to date (sent, cancelled…)
  useEffect(() => {
    axios.get('/api/ai/scheduled?all=1', api)
      .then((res) => setStatuses(Object.fromEntries(res.data.scheduled.map((j) => [j._id, j.status]))))
      .catch(() => { })
  }, [scheduledVersion, messages.length])

  const cancelScheduled = async (id) => {
    try {
      await axios.delete(`/api/ai/scheduled/${id}`, api)
      setStatuses((s) => ({ ...s, [id]: 'cancelled' }))
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel it.')
    }
  }

  const openChat = (action) => {
    const chat = String(action.chatId) === String(AuthUser?._id)
      ? selfContact(AuthUser)
      : action.isGroup
        ? groups.find((g) => String(g._id) === String(action.chatId))
        : contacts.find((c) => String(c._id) === String(action.chatId))
    if (chat) setSelectedConversation(chat)
  }

  // Follow the conversation
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 2 ? 'smooth' : 'auto' })
  }, [messages, thinking])

  // Grow the box with the text
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [text])

  // A photo or document to send with the next question
  const [pending, setPending] = useState(null) // { file, url }
  const fileRef = useRef(null)
  const pickFile = async (raw) => {
    if (!raw) return
    setError('')
    if (raw.size > NEXA_MAX_BYTES) return setError('That file is over 10 MB.')
    const okType = NEXA_FILES.split(',').some((t) => (t.startsWith('.') ? raw.name.toLowerCase().endsWith(t) : raw.type === t))
    if (!okType) return setError('Nexa can read photos, PDFs, Word documents and text files.')
    const file = raw.type.startsWith('image/') ? await compressImage(raw) : raw
    setPending((old) => { if (old?.url) URL.revokeObjectURL(old.url); return { file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null } })
    inputRef.current?.focus()
  }
  const clearPending = () => setPending((old) => { if (old?.url) URL.revokeObjectURL(old.url); return null })
  // Paste a screenshot straight into the box
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file')
    if (item) { e.preventDefault(); pickFile(item.getAsFile()) }
  }

  // Emoji, GIF and sticker picker
  const [mediaOpen, setMediaOpen] = useState(false)
  const mediaBtnRef = useRef(null)
  const closeMedia = useCallback(() => setMediaOpen(false), [])
  // Put the emoji where the cursor is (or replace the selected text)
  const insertEmoji = (emoji) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText((prev) => prev.slice(0, start) + emoji + prev.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }
  // A GIF or sticker goes straight to Nexa (with any text typed so far)
  const sendMedia = async (media) => {
    if (thinking) return
    const value = text.trim()
    setError('')
    setText('')
    const temp = { _id: `temp-${Date.now()}`, role: 'user', createdAt: new Date().toISOString(), content: value, attachment: { kind: media.kind, url: media.url, name: media.title, width: media.width, height: media.height } }
    setMessages((prev) => [...prev, temp])
    setThinking(true)
    try {
      const res = await axios.post('/api/ai/messages', { message: value, timeZone, media }, api)
      setMessages((prev) => withAnswer(prev, temp._id, res.data))
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== temp._id))
      setText(value)
      setError(err.response?.data?.error || "Nexa couldn't answer. Try again.")
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  // retry: ask a question again (Regenerate) without touching the box, its file or reply
  const ask = async (question = text, { retry = false, quote: retryQuote = null } = {}) => {
    const file = retry ? null : pending?.file
    const value = question.trim()
    if ((!value && !file) || thinking) return
    const reply = retry ? null : replyTo
    const quote = retry ? retryQuote : reply?.text || null
    setError('')
    if (!retry) { setText(''); setUndoText(null); setReplyTo(null) }
    const temp = {
      _id: `temp-${Date.now()}`, role: 'user', createdAt: new Date().toISOString(), quote,
      content: value || (file ? (file.type.startsWith('image/') ? "What's in this photo?" : 'Summarize this document.') : ''),
      attachment: file ? { kind: file.type.startsWith('image/') ? 'image' : 'file', url: pending.url, name: file.name, size: file.size } : null,
    }
    setMessages((prev) => [...prev, temp])
    if (!retry) setPending(null)
    setThinking(true)
    try {
      let body = { message: value, timeZone, ...(quote ? { quote } : {}) }
      if (file) {
        body = new FormData()
        body.append('message', value)
        body.append('timeZone', timeZone)
        body.append('file', file, file.name)
      }
      const res = await axios.post('/api/ai/messages', body, api)
      setMessages((prev) => withAnswer(prev, temp._id, res.data))
      if (temp.attachment?.url?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(temp.attachment.url), 5000)
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== temp._id))
      if (!retry) {
        setText(value)
        setReplyTo(reply)
        if (file) setPending({ file, url: temp.attachment.url })
      }
      setError(err.response?.data?.error || "Nexa couldn't answer. Try again.")
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  // Reply to one of Nexa's answers: the question is sent with a quote of it
  const [replyTo, setReplyTo] = useState(null) // { id, text }
  const replyToAnswer = (m) => {
    setReplyTo({ id: m._id, text: plainText(m.content).slice(0, 300) || 'Your picture' })
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // Regenerate: drop the last question and answer, then ask the same question again
  const regenerate = async (answer) => {
    if (thinking) return
    const i = messages.findIndex((m) => m._id === answer._id)
    const question = [...messages.slice(0, i)].reverse().find((m) => m.role === 'user')
    if (!question?.content || question.attachment) return
    try {
      await Promise.all([axios.delete(`/api/ai/messages/${answer._id}`, api), axios.delete(`/api/ai/messages/${question._id}`, api)])
    } catch { setError("Couldn't regenerate that. Try again."); return }
    setMessages((prev) => prev.filter((m) => m._id !== answer._id && m._id !== question._id))
    ask(question.content, { retry: true, quote: question.quote || null })
  }

  // ✏️ Rewrite the question before sending (same menu as in chats), with Undo
  const rewriteRef = useRef(null)
  const rewriteBtnRef = useRef(null)
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [undoText, setUndoText] = useState(null)
  useEffect(() => {
    if (!rewriteOpen) return
    const onDown = (e) => !rewriteRef.current?.contains(e.target) && !rewriteBtnRef.current?.contains(e.target) && setRewriteOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [rewriteOpen])
  const rewrite = async (style, instruction) => {
    setRewriteOpen(false)
    const original = text
    if (!original.trim()) return
    setRewriting(true)
    setError('')
    try {
      const res = await axios.post('/api/ai/rewrite', { text: original, style, instruction }, api)
      setText(res.data.text)
      setUndoText(original)
      inputRef.current?.focus()
    } catch (err) {
      setError(err.response?.data?.error || "Nexa couldn't rewrite that. Try again.")
    } finally {
      setRewriting(false)
    }
  }

  // 🎤 Voice typing: speak, and the words land in the box to check before sending
  const voice = useVoiceRecorder()
  const [dictating, setDictating] = useState(false)
  const stopDictation = async () => {
    const blob = await voice.finish()
    if (!blob || blob.size < 1000) return
    setDictating(true)
    setError('')
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const form = new FormData()
      form.append('audio', new File([blob], `dictation.${ext}`, { type: blob.type }))
      const res = await axios.post('/api/ai/dictate', form, api)
      const said = String(res.data.text || '').trim()
      if (said) setText((t) => (t.trim() ? `${t.trimEnd()} ${said}` : said))
      else setError("Didn't catch that. Try again.")
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't understand that. Try again.")
    } finally {
      setDictating(false)
      inputRef.current?.focus()
    }
  }
  useEffect(() => {
    if (voice.recording && voice.seconds >= MAX_VOICE_SECONDS) stopDictation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.seconds])

  // Drop a photo or document anywhere on the chat
  const [dragging, setDragging] = useState(false)
  const onDragOver = (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setDragging(true) } }
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) pickFile(f)
  }

  // Stable handle for "Know more" buttons, so Nexa's answers don't re-render on every keystroke
  const askRef = useRef(ask)
  useEffect(() => { askRef.current = ask })
  const askAbout = useCallback((question) => askRef.current(question), [])

  // A picture Nexa made was saved: keep its stored URL
  const imageSaved = useCallback((messageId, action) => {
    setMessages((prev) => prev.map((m) => (m._id === messageId
      ? { ...m, actions: m.actions.map((a) => (a.id === action.id ? action : a)) }
      : m)))
  }, [])

  // Examples go into the box (not sent), so people can adjust names and times first
  const fill = (example) => {
    setText(example)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(example.length, example.length)
    })
  }

  // Same functions on every render, so the memoized bubbles don't redraw while typing
  const latest = useRef({})
  useEffect(() => { latest.current = { cancelScheduled, openChat, fill, replyToAnswer, regenerate } })
  const onReplyStable = useCallback((m) => latest.current.replyToAnswer(m), [])
  const onRetryStable = useCallback((m) => latest.current.regenerate(m), [])
  const onEditStable = useCallback((m) => latest.current.fill(m.content), [])
  const onCancelStable = useCallback((id) => latest.current.cancelScheduled(id), [])
  const onOpenStable = useCallback((action) => latest.current.openChat(action), [])
  const onPickStable = useCallback((example) => latest.current.fill(example), [])

  const clear = async () => {
    await axios.delete('/api/ai/messages', api)
    setMessages([])
    setConfirmClear(false)
  }

  // Media, links and docs: files you sent, images Nexa made, web sources
  const [libraryOpen, setLibraryOpen] = useState(false)
  const mediaItems = useMemo(() => nexaMediaItems(messages), [messages])
  const deleteMedia = async (list) => {
    const res = await deleteNexaItems(list)
    const gone = new Set(res.deletedMessages)
    const fresh = new Map((res.updated || []).map((m) => [String(m._id), m]))
    setMessages((prev) => prev.filter((m) => !gone.has(String(m._id))).map((m) => fresh.get(String(m._id)) || m))
    return res
  }
  const history = useInputHistory(sentTexts, { text, setText, inputRef })
  const onKeyDown = (e) => {
    if (history.onKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() }
    else if (e.key === 'Escape' && replyTo) { e.preventDefault(); setReplyTo(null) }
  }
  // Regenerate is offered on the latest answer when its question was plain text
  const lastAnswerId = useMemo(() => {
    const last = messages[messages.length - 1]
    const before = messages[messages.length - 2]
    return last?.role === 'assistant' && before?.role === 'user' && before.content && !before.attachment && !String(last._id).startsWith('temp-') ? last._id : null
  }, [messages])

  return (
    <div onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }} onDrop={onDrop} className="relative flex h-full min-w-0 flex-1 flex-col">
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-violet-50/80 backdrop-blur-sm dark:bg-slate-950/80">
          <p className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-violet-300 px-6 py-4 text-sm font-medium text-violet-700 dark:border-violet-500/50 dark:text-violet-300"><LuUpload className="size-4" /> Drop a photo or document to ask Nexa about it</p>
        </div>
      )}
      <header className="flex h-16 shrink-0 items-center gap-2 sm:gap-3 border-b border-slate-200 bg-white px-3 sm:px-5 dark:border-slate-800 dark:bg-slate-950">
        <button onClick={() => setSelectedConversation(null)} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label="Back to chats">
          <LuArrowLeft className="size-5" />
        </button>
        <AiAvatar size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">Nexa</p>
          <p className={`truncate text-xs ${thinking ? 'font-medium text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {thinking ? 'thinking…' : timer ? `AI assistant · messages disappear after ${timerLabel(timer)}` : 'AI assistant'}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button onClick={() => setCalendarOpen(true)} className="relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300" title="Google Calendar & reminders" aria-label="Google Calendar and reminders">
            <LuCalendarDays className="size-4.5" />
            {googleConnected && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />}
          </button>

          {/* Desktop direct buttons */}
          <button onClick={() => setLibraryOpen(true)} className="hidden sm:flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" title="Media, links and docs" aria-label="Media, links and docs">
            <LuImages className="size-4.5" />
          </button>

          <div className="relative hidden sm:block">
            <button onClick={() => setModelOpen((o) => !o)} className={`flex size-9 items-center justify-center rounded-lg transition hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300 ${imageModel !== 'auto' ? 'text-violet-600 dark:text-violet-300' : 'text-slate-500 dark:text-slate-400'}`} title={`Image model: ${modelLabel}`} aria-label="Image model" aria-expanded={modelOpen}>
              <LuWandSparkles className="size-4.5" />
            </button>
            {modelOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setModelOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">{modelMenu}</div>
              </>
            )}
          </div>

          <div className="relative hidden sm:block">
            <button onClick={() => setTimerOpen((o) => !o)} className={`flex size-9 items-center justify-center rounded-lg transition hover:bg-slate-100 dark:hover:bg-slate-800 ${timer ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} title={`Disappearing messages: ${timerLabel(timer)}`} aria-label="Disappearing messages" aria-expanded={timerOpen}>
              <LuTimer className="size-4.5" />
            </button>
            {timerOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setTimerOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Disappearing messages</p>
                  <p className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">Old messages and their files are deleted. Tap Keep on a message to save it.</p>
                  {TIMER_OPTIONS.map(([secs, label]) => (
                    <button key={secs} role="menuitemradio" aria-checked={timer === secs} onClick={() => changeTimer(secs)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                      {label}{timer === secs && <LuCheck className="size-4 text-indigo-600 dark:text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {messages.length > 0 && (
            <button onClick={() => setConfirmClear(true)} className="hidden sm:flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400" title="Clear chat" aria-label="Clear chat">
              <LuTrash2 className="size-4.5" />
            </button>
          )}

          {/* Mobile menu (⋯) for compact view */}
          <div className="relative sm:hidden">
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              title="More options"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={mobileMenuOpen}
            >
              <LuEllipsisVertical className="size-4.5" />
            </button>
            {mobileMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMobileMenuOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <button
                    role="menuitem"
                    onClick={() => { setMobileMenuOpen(false); setTimerOpen(true) }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LuTimer className="size-4 text-slate-400" />
                    <span>Disappearing ({timer ? timerShort(timer) || timerLabel(timer) : 'Off'})</span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMobileMenuOpen(false); setModelOpen(true) }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LuWandSparkles className="size-4 text-slate-400" />
                    <span>Image model ({modelLabel})</span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMobileMenuOpen(false); setLibraryOpen(true) }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LuImages className="size-4 text-slate-400" />
                    <span>Media, links & docs</span>
                  </button>
                  {messages.length > 0 && (
                    <button
                      role="menuitem"
                      onClick={() => { setMobileMenuOpen(false); setConfirmClear(true) }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      <LuTrash2 className="size-4" />
                      <span>Clear chat</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <MediaManager
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          title="Media, links and docs"
          subtitle="Your chat with Nexa"
          items={mediaItems}
          onDelete={deleteMedia}
          deleteNote={(tab) => (tab === 'links'
            ? 'The Nexa messages with these links are deleted. This can’t be undone.'
            : 'The files are removed from the chat and from storage. The message text stays. This can’t be undone.')}
        />
        {modelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 sm:hidden">
            <div className="fixed inset-0" onClick={() => setModelOpen(false)} />
            <div role="menu" className="relative z-10 w-full max-w-xs rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">{modelMenu}</div>
          </div>
        )}
        {/* Mobile popup for timer when triggered from mobile menu */}
        {timerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 sm:hidden">
            <div className="fixed inset-0" onClick={() => setTimerOpen(false)} />
            <div role="menu" className="relative z-10 w-full max-w-xs rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Disappearing messages</p>
              <p className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">Old messages and their files are deleted. Tap Keep on a message to save it.</p>
              {TIMER_OPTIONS.map(([secs, label]) => (
                <button key={secs} role="menuitemradio" aria-checked={timer === secs} onClick={() => changeTimer(secs)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  {label}{timer === secs && <LuCheck className="size-4 text-indigo-600 dark:text-indigo-400" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div ref={scrollRef} className="chat-bg min-h-0 flex-1 overflow-y-auto" style={wallpaper || undefined}>
        <div className="h-full px-3 sm:px-6 lg:px-8">
          {loading ? null : messages.length === 0 && !thinking ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <AiAvatar size="md" />
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Hi {firstName}, how can I help?</h2>
              <div className="mt-8 flex w-full justify-center">
                <CapabilitiesCard onPick={fill} />
              </div>
            </div>
          ) : (
            <div className="pb-2 pt-4">
              {messages.map((m) => (m.role === 'assistant'
                ? <NexaBubble key={m._id} message={m} statuses={statuses} onCancel={onCancelStable} onOpen={onOpenStable} onPick={onPickStable} onAsk={askAbout} onImageSaved={imageSaved} onKeep={keepMessage} onDelete={deleteMessage} onReply={onReplyStable} onRetry={m._id === lastAnswerId && !thinking ? onRetryStable : undefined} />
                : <MyBubble key={m._id} message={m} onKeep={keepMessage} onDelete={deleteMessage} onEdit={onEditStable} />))}
              <AnimatePresence>{thinking && <Thinking />}</AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="relative shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-6 lg:px-8 pb-[max(0.625rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950">
        <StickerHost onSend={sendMedia} />
        <AnimatePresence>
          {mediaOpen && <MediaPicker onEmoji={insertEmoji} onMedia={sendMedia} onClose={closeMedia} toggleRef={mediaBtnRef} className="left-4 sm:left-6 lg:left-8" />}
        </AnimatePresence>
        {rewriteOpen && <RewriteMenu ref={rewriteRef} onPick={rewrite} />}
        {undoText !== null && !rewriting && (
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
            <LuPenLine className="size-3.5 text-violet-500" /> Rewritten by Nexa
            <button onClick={() => { setText(undoText); setUndoText(null) }} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              <LuUndo2 className="size-3" /> Undo
            </button>
            <button onClick={() => setUndoText(null)} className="ml-auto hover:text-slate-700 dark:hover:text-slate-200">Dismiss</button>
          </div>
        )}
        {(error || voice.error) && <p className="mb-2 px-1 text-xs font-medium text-red-600 dark:text-red-400">{error || voice.error}</p>}
        {replyTo && (
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-700/60">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"><LuReply className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-violet-600 dark:text-violet-300">Reply to Nexa</p>
              <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">{replyTo.text}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" title="Cancel (Esc)" className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"><LuX className="size-4" /></button>
          </div>
        )}
        {pending && (
          <div className="mb-2 flex items-center gap-2">
            {pending.url
              ? <img src={pending.url} alt="" className="size-14 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
              : <FileChip name={pending.file.name} size={pending.file.size} />}
            <span className="text-xs text-slate-500 dark:text-slate-400">Ask anything about it, or just send</span>
            <button type="button" onClick={clearPending} className="ml-auto flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Remove file"><LuX className="size-4" /></button>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); ask() }} className="flex items-end gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:border-indigo-500/50">
          <input ref={fileRef} type="file" accept={NEXA_FILES} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f) }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={thinking} aria-label="Attach a photo or document" title="Send Nexa a photo or document (PDF, Word, text)" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
            <LuPaperclip className="size-4.5" />
          </button>
          <button
            type="button"
            ref={mediaBtnRef}
            onClick={() => setMediaOpen((o) => !o)}
            aria-label="Emoji, GIFs and stickers"
            aria-expanded={mediaOpen}
            title="Emoji, GIFs and stickers"
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white ${mediaOpen ? 'bg-slate-100 text-indigo-600 dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <LuSmile className="size-4.5" />
          </button>
          {voice.recording ? (
            <div className="flex min-h-10 flex-1 items-center gap-3 px-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-sm font-medium tabular-nums">{Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}</span>
              <span className="truncate text-xs text-slate-400">Listening… tap ✓ to turn it into text</span>
              <button type="button" onClick={voice.cancel} className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" aria-label="Discard recording" title="Discard"><LuTrash2 className="size-4" /></button>
            </div>
          ) : (
            <textarea
              onPaste={onPaste}
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => { setText(e.target.value); history.reset() }}
              onKeyDown={onKeyDown}
              maxLength={4000}
              placeholder={pending ? 'Ask about this file (optional)' : dictating ? 'Turning your voice into text…' : replyTo ? 'Reply to Nexa' : 'Message Nexa'}
              className="min-h-10 flex-1 resize-none bg-transparent py-2.5 pl-2.5 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
              style={{ maxHeight: MAX_HEIGHT }}
            />
          )}
          {text.trim().length > 1 && !voice.recording && (
            <button
              ref={rewriteBtnRef}
              type="button"
              onClick={() => setRewriteOpen((o) => !o)}
              disabled={rewriting || thinking}
              aria-label="Rewrite with Nexa"
              aria-expanded={rewriteOpen}
              title="Rewrite with Nexa"
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-400 ${rewriteOpen || rewriting ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}
            >
              <LuPenLine className={`size-4.5 ${rewriting ? 'animate-pulse' : ''}`} />
            </button>
          )}
          {voice.recording ? (
            <button type="button" onClick={stopDictation} aria-label="Done speaking" title="Done" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 active:scale-95">
              <LuCheck className="size-4" />
            </button>
          ) : !text.trim() && !pending && !thinking ? (
            <button type="button" onClick={() => { setError(''); voice.start() }} disabled={dictating} aria-label="Voice typing" title="Speak your question" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
              {dictating ? <LuLoaderCircle className="size-4.5 animate-spin" /> : <LuMic className="size-4.5" />}
            </button>
          ) : (
            <button type="submit" disabled={(!text.trim() && !pending) || thinking} aria-label="Send" title="Send" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 active:scale-95 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500">
              <LuSendHorizontal className="size-4" />
            </button>
          )}
        </form>
        <p className="mt-1.5 text-center text-[11px] text-slate-400">Nexa is AI and can make mistakes.</p>
      </div>

      <GoogleCalendarDialog open={calendarOpen} onClose={() => setCalendarOpen(false)} result={googleResult} onStatus={onGoogleStatus} onTry={(example) => { setCalendarOpen(false); fill(example) }} />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clear}
        title="Clear chat with Nexa?"
        description="All your messages with Nexa will be deleted."
        confirmLabel="Clear"
        busyLabel="Clearing…"
      />
    </div>
  )
}

export default AiChat
