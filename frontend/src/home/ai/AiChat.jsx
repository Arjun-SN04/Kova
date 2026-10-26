import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AnimatePresence, motion } from 'motion/react'
import { LuArrowLeft, LuBellRing, LuBookmark, LuBookmarkCheck, LuCalendarDays, LuCheck, LuTimer, LuFileText, LuPaperclip, LuRepeat, LuCircleAlert, LuClock, LuCopy, LuGlobe, LuImage, LuLanguages, LuLifeBuoy, LuListChecks, LuMessageCircle, LuNewspaper, LuPenLine, LuSend, LuSendHorizontal, LuSmile, LuSparkles, LuTrash2, LuX } from 'react-icons/lu'
import { selfContact } from '../../utils/conversations'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { AiAvatar } from '../Avatar'
import ConfirmDialog from '../ConfirmDialog'
import Mermaid from './Mermaid'
import NexaImage from './NexaImage'
import GoogleCalendarDialog from './GoogleCalendarDialog'
import { clearGoogleResult, peekGoogleResult } from '../../utils/google'
import { AgendaCard, DraftCard, EventCard, ReminderCard, SnoozedCard, TaskCard } from './AgendaCards'
import { useSocket } from '../../context/SocketProvider'
import { compressImage, formatBytes } from '../../utils/attachments'
import { TIMER_OPTIONS, timerLabel } from '../../utils/chatExtras'
import MediaPicker from '../media/MediaPicker'
import { remarkHtmlBreaks } from '../../utils/markdown'

const REMARK = [remarkGfm, remarkHtmlBreaks]

const api = { withCredentials: true }
const MAX_HEIGHT = 140

// What Nexa can do. Tapping an example puts it in the box to edit and send.
const CAPABILITIES = [
  { Icon: LuSend, title: 'Send messages', example: "Tell Arjun I'm running 10 minutes late" },
  { Icon: LuBellRing, title: 'Reminders', example: 'Remind me at 6pm to call mom' },
  { Icon: LuClock, title: 'Schedule messages', example: 'Wish Priya happy birthday tomorrow at 9am' },
  { Icon: LuListChecks, title: 'Manage scheduled', example: 'What do I have scheduled?' },
  { Icon: LuNewspaper, title: 'Catch up on a chat', example: 'Summarize my chat with Arjun' },
  { Icon: LuCalendarDays, title: 'Calendar & Meet', example: "What's on my calendar today?" },
  { Icon: LuFileText, title: 'Read photos & PDFs', example: 'Summarize this PDF in 5 bullets' },
  { Icon: LuGlobe, title: 'Search the web', example: "What's today's top news?" },
  { Icon: LuImage, title: 'Create images', example: 'Draw a cozy cabin in the snow at night' },
  { Icon: LuPenLine, title: 'Write and rewrite', example: 'Make this more professional: ' },
  { Icon: LuLanguages, title: 'Translate', example: "Translate 'see you soon' to Hindi" },
  { Icon: LuLifeBuoy, title: 'Kova help', example: 'How do communities work?' },
]
const IN_CHATS = ['✨ Rewrite', 'Smart replies', 'Catch me up', 'Translate', 'Transcribe', 'Remind me', '@Nexa in groups']

const CapabilitiesCard = ({ onPick }) => (
  <div className="w-full max-w-xl">
    <div className="grid gap-2 sm:grid-cols-2">
      {CAPABILITIES.map(({ Icon, title, example }) => (
        <button
          key={title}
          onClick={() => onPick(example)}
          className="flex items-start gap-3 rounded-xl bg-white p-3 text-left shadow-xs ring-1 ring-slate-200 transition hover:bg-violet-50 hover:ring-violet-200 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-violet-500/10 dark:hover:ring-violet-500/30"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"><Icon className="size-4" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">"{example.trim()}"</span>
          </span>
        </button>
      ))}
    </div>
    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-800">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"><LuSparkles className="size-3.5 text-violet-500" /> Also in every chat</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {IN_CHATS.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
            {t}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Find Translate, Transcribe and Remind me in a message's ⋯ menu.</p>
    </div>
  </div>
)

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
          <LuSparkles className="size-3" /> Know more
        </button>
      </li>
    )
  }
  return Item
}

// Same sizes as normal chat bubbles
const bubbleWidth = 'max-w-[80%] sm:max-w-[70%] lg:max-w-[min(60%,640px)]'
const wideBubbleWidth = 'w-full max-w-[90%] sm:max-w-[85%] lg:max-w-[min(80%,820px)]'

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

const NexaBubble = memo(({ message, statuses, onCancel, onOpen, onPick, onAsk, onImageSaved, onKeep, onDelete }) => {
  if (message.actions?.some((a) => a.type === 'capabilities')) {
    return (
      <div className="mb-3 flex items-end gap-2 pb-1">
        <AiAvatar size="xs" />
        <div className="min-w-0 flex-1">
          <p className="mb-2 inline-block rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/60">Here's what I can do. Tap one to try it.</p>
          <CapabilitiesCard onPick={onPick} />
        </div>
      </div>
    )
  }
  return <NexaAnswer message={message} statuses={statuses} onCancel={onCancel} onOpen={onOpen} onAsk={onAsk} onImageSaved={onImageSaved} onKeep={onKeep} onDelete={onDelete} />
})

const NexaAnswer = ({ message, statuses, onCancel, onOpen, onAsk, onImageSaved, onKeep, onDelete }) => {
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
          : <ActionCard key={i} action={a} status={a.id ? statuses[a.id] : null} onCancel={onCancel} onOpen={onOpen} />
        ))}
        <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-400">
          {message.createdAt && formatTime(message.createdAt)}
          <button onClick={copy} className="inline-flex items-center gap-1 opacity-0 transition hover:text-slate-700 group-hover:opacity-100 focus:opacity-100 dark:hover:text-slate-200">
            {copied ? <LuCheck className="size-3" /> : <LuCopy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <MessageTools message={message} onKeep={onKeep} onDelete={onDelete} />
        </p>
      </div>
    </div>
  )
}

// Answers from the last couple of minutes (older unfinished images wait for a click)
const isFresh = (message) => Date.now() - new Date(message.createdAt).getTime() < 2 * 60 * 1000

// Keep (stop it disappearing) and Delete, under each message in the Nexa chat
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

const MyBubble = memo(({ message, onKeep, onDelete }) => (
  <div className="group mb-3 flex justify-end pb-1">
    <div className={`flex flex-col items-end gap-1 ${bubbleWidth}`}>
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
      {message.content && <p className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm leading-relaxed text-white">{message.content}</p>}
      <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-400">
        <MessageTools message={message} onKeep={onKeep} onDelete={onDelete} align="right" />
        {message.createdAt && formatTime(message.createdAt)}
      </p>
    </div>
  </div>
))

// Private chat with Nexa, Kova's AI assistant (answers come from Groq via the server)
const AiChat = () => {
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
  const firstName = AuthUser?.fullName?.split(' ')[0]

  useEffect(() => {
    axios.get('/api/ai/messages', api)
      .then((res) => setMessages(res.data.messages))
      .catch(() => setError('Could not load your chat with Nexa.'))
      .finally(() => setLoading(false))
    inputRef.current?.focus()
  }, [])

  // Is Google connected? (dot on the calendar button)
  useEffect(() => {
    axios.get('/api/google/status', api).then((res) => setGoogleConnected(res.data.connected)).catch(() => {})
  }, [])
  const onGoogleStatus = useCallback((s) => setGoogleConnected(s.connected), [])

  // Disappearing Nexa chat (24 h by default)
  const [timer, setTimer] = useState(86400)
  const [timerOpen, setTimerOpen] = useState(false)
  useEffect(() => {
    axios.get('/api/ai/settings', api).then((res) => setTimer(res.data.disappearAfter)).catch(() => {})
  }, [])
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
    // Old messages disappearing (the 24-hour timer)
    const onGone = (ids) => { const gone = new Set(ids); setMessages((prev) => prev.filter((m) => !gone.has(String(m._id)))) }
    socket.on('nexaMessage', onNexa)
    socket.on('nexaMessagesDeleted', onGone)
    return () => { socket.off('nexaMessage', onNexa); socket.off('nexaMessagesDeleted', onGone) }
  }, [socket])

  // Keep scheduled cards up to date (sent, cancelled…)
  useEffect(() => {
    axios.get('/api/ai/scheduled?all=1', api)
      .then((res) => setStatuses(Object.fromEntries(res.data.scheduled.map((j) => [j._id, j.status]))))
      .catch(() => {})
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
      setMessages((prev) => [...prev.filter((m) => m._id !== temp._id), res.data.question, res.data.answer])
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== temp._id))
      setText(value)
      setError(err.response?.data?.error || "Nexa couldn't answer. Try again.")
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  const ask = async (question = text) => {
    const file = pending?.file
    const value = question.trim()
    if ((!value && !file) || thinking) return
    setError('')
    setText('')
    const temp = {
      _id: `temp-${Date.now()}`, role: 'user', createdAt: new Date().toISOString(),
      content: value || (file ? (file.type.startsWith('image/') ? "What's in this photo?" : 'Summarize this document.') : ''),
      attachment: file ? { kind: file.type.startsWith('image/') ? 'image' : 'file', url: pending.url, name: file.name, size: file.size } : null,
    }
    setMessages((prev) => [...prev, temp])
    setPending(null)
    setThinking(true)
    try {
      let body = { message: value, timeZone }
      if (file) {
        body = new FormData()
        body.append('message', value)
        body.append('timeZone', timeZone)
        body.append('file', file, file.name)
      }
      const res = await axios.post('/api/ai/messages', body, api)
      setMessages((prev) => [...prev.filter((m) => m._id !== temp._id), res.data.question, res.data.answer])
      if (temp.attachment?.url?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(temp.attachment.url), 5000)
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== temp._id))
      setText(value)
      if (file) setPending({ file, url: temp.attachment.url })
      setError(err.response?.data?.error || "Nexa couldn't answer. Try again.")
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
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
  useEffect(() => { latest.current = { cancelScheduled, openChat, fill } })
  const onCancelStable = useCallback((id) => latest.current.cancelScheduled(id), [])
  const onOpenStable = useCallback((action) => latest.current.openChat(action), [])
  const onPickStable = useCallback((example) => latest.current.fill(example), [])

  const clear = async () => {
    await axios.delete('/api/ai/messages', api)
    setMessages([])
    setConfirmClear(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5 dark:border-slate-800 dark:bg-slate-950">
        <button onClick={() => setSelectedConversation(null)} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label="Back to chats">
          <LuArrowLeft className="size-5" />
        </button>
        <AiAvatar size="sm" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Nexa</p>
          <p className={`text-xs ${thinking ? 'font-medium text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {thinking ? 'thinking…' : timer ? `AI assistant · messages disappear after ${timerLabel(timer)}` : 'AI assistant'}
          </p>
        </div>
        <div className="relative ml-auto">
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
        <button onClick={() => setCalendarOpen(true)} className="relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-violet-50 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-violet-500/10 dark:hover:text-violet-300" title="Google Calendar & reminders" aria-label="Google Calendar and reminders">
          <LuCalendarDays className="size-4.5" />
          {googleConnected && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />}
        </button>
        {messages.length > 0 && (
          <button onClick={() => setConfirmClear(true)} className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400" title="Clear chat" aria-label="Clear chat">
            <LuTrash2 className="size-4.5" />
          </button>
        )}
      </header>

      <div ref={scrollRef} className="chat-bg min-h-0 flex-1 overflow-y-auto">
        <div className="h-full px-4 sm:px-6 lg:px-8">
          {loading ? null : messages.length === 0 && !thinking ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <AiAvatar size="lg" />
              <h2 className="mt-4 text-lg font-semibold">Hi {firstName}, I'm Nexa</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">Your assistant in Kova. Pick something to try, or just ask.</p>
              <div className="mt-6 flex w-full justify-center">
                <CapabilitiesCard onPick={fill} />
              </div>
            </div>
          ) : (
            <div className="pb-2 pt-4">
              {messages.map((m) => (m.role === 'assistant'
                ? <NexaBubble key={m._id} message={m} statuses={statuses} onCancel={onCancelStable} onOpen={onOpenStable} onPick={onPickStable} onAsk={askAbout} onImageSaved={imageSaved} onKeep={keepMessage} onDelete={deleteMessage} />
                : <MyBubble key={m._id} message={m} onKeep={keepMessage} onDelete={deleteMessage} />))}
              <AnimatePresence>{thinking && <Thinking />}</AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <div className="relative shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950">
        <AnimatePresence>
          {mediaOpen && <MediaPicker onEmoji={insertEmoji} onMedia={sendMedia} onClose={closeMedia} toggleRef={mediaBtnRef} className="left-4 sm:left-6 lg:left-8" />}
        </AnimatePresence>
        {error && <p className="mb-2 px-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
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
          <textarea
            onPaste={onPaste}
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder={pending ? 'Ask about this file (optional)' : 'Message Nexa'}
            className="min-h-10 flex-1 resize-none bg-transparent py-2.5 pl-2.5 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
            style={{ maxHeight: MAX_HEIGHT }}
          />
          <button type="submit" disabled={(!text.trim() && !pending) || thinking} aria-label="Send" title="Send" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 active:scale-95 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500">
            <LuSendHorizontal className="size-4" />
          </button>
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
