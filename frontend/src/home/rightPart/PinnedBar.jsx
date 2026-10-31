import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LuChevronDown, LuPin, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { jumpToMessage } from '../../utils/messages'
import { setMessagePinned } from '../../utils/chatExtras'
import { attachmentLabel } from '../../utils/attachments'

const EASE = [0.32, 0.72, 0, 1]
const labelOf = (m) => (m.poll ? `Poll: ${m.poll.question}` : m.message || attachmentLabel(m.attachment))
const whenOf = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' })

// Pinned messages, opened from the pin button in the chat header.
// First a compact one-line bar (tap to jump through the pins); the chevron expands it
// into a list of every pin, each to jump to or unpin.
const PinnedBar = ({ canUnpin = true }) => {
  const { messages, setHighlightedId, selectedConversation, pinsOpenFor, setPinsOpenFor, pinsExpanded: expanded, setPinsExpanded: setExpanded } = useConversation()
  const pinned = useMemo(() => messages.filter((m) => m.pinned).sort((a, b) => new Date(b.pinned.at) - new Date(a.pinned.at)), [messages])
  const open = !!selectedConversation && pinsOpenFor === String(selectedConversation._id) && pinned.length > 0
  const [index, setIndex] = useState(0)
  const close = () => setPinsOpenFor(null)

  // Last pin removed: close the list
  useEffect(() => { if (pinsOpenFor && !pinned.length) setPinsOpenFor(null) }, [pinned.length, pinsOpenFor, setPinsOpenFor])

  const iconBtn = 'flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="pins"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1, transition: { height: { duration: 0.3, ease: EASE }, opacity: { duration: 0.2, delay: 0.05 } } }}
          exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.25, ease: EASE }, opacity: { duration: 0.12 } } }}
          className="shrink-0 overflow-hidden border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-5">
            {!expanded && pinned.length > 1 && (
              <div className="flex h-8 flex-col justify-center gap-0.5" aria-hidden="true">
                {pinned.map((p, n) => <span key={p._id} className={`w-0.5 flex-1 rounded-full ${n === index % pinned.length ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`} />)}
              </div>
            )}
            {expanded ? (
              <button onClick={() => setExpanded(false)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1.5 text-left">
                <LuPin className="size-4 shrink-0 -rotate-45 text-indigo-500" />
                <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{pinned.length} pinned message{pinned.length > 1 ? 's' : ''}</span>
              </button>
            ) : (() => {
              const cur = pinned[index % pinned.length]
              return (
                <button
                  onClick={() => { jumpToMessage(cur._id, setHighlightedId); setIndex((n) => n + 1) }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
                  title="Go to pinned message"
                >
                  <LuPin className="size-4 shrink-0 -rotate-45 text-indigo-500" />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Pinned message{pinned.length > 1 ? ` ${(index % pinned.length) + 1} of ${pinned.length}` : ''}</span>
                    <span className="block truncate text-[13px] text-slate-600 dark:text-slate-300">{labelOf(cur)}</span>
                  </span>
                </button>
              )
            })()}
            <button onClick={() => setExpanded(!expanded)} className={iconBtn} title={expanded ? 'Collapse' : 'Show all pinned'} aria-label={expanded ? 'Collapse pinned list' : 'Show all pinned messages'} aria-expanded={expanded}>
              <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }} className="flex"><LuChevronDown className="size-4" /></motion.span>
            </button>
            <button onClick={close} className={iconBtn} title="Close" aria-label="Close pinned messages"><LuX className="size-4" /></button>
          </div>
          <AnimatePresence initial={false}>
          {expanded && (
          <motion.ul
            key="list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="max-h-64 space-y-0.5 overflow-y-auto px-2 pb-2 sm:px-4">
            {pinned.map((p) => (
              <li key={p._id} className="group flex items-center gap-1 rounded-lg transition hover:bg-slate-50 dark:hover:bg-slate-900">
                <button onClick={() => jumpToMessage(p._id, setHighlightedId)} className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left" title="Go to message">
                  <span className="size-1.5 shrink-0 rounded-full bg-indigo-500" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700 dark:text-slate-200">{labelOf(p)}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{whenOf(p.createdAt)}</span>
                </button>
                {canUnpin && (
                  <button onClick={() => setMessagePinned(p._id, false)} className={`${iconBtn} size-7! opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100`} title="Unpin" aria-label="Unpin message">
                    <LuX className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </motion.ul>
          )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default PinnedBar
