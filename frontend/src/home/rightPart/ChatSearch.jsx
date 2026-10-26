import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LuChevronDown, LuChevronUp, LuSearch, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { jumpToMessage } from '../../utils/messages'

// Find words in the open chat. Matches are newest first; ↑/↓ (or Enter / Shift+Enter) move between them.
const ChatSearch = ({ onClose }) => {
  const { messages, setHighlightedId } = useConversation()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const hit = (m) => [m.message, m.transcript, m.attachment?.name, m.poll?.question, ...(m.poll?.options || []).map((o) => o.text)]
      .some((t) => t?.toLowerCase().includes(q))
    return messages.filter((m) => !m.call && hit(m)).reverse()
  }, [messages, query])

  // Jump to the current match
  useEffect(() => {
    const m = matches[index]
    if (m) jumpToMessage(m._id, setHighlightedId)
  }, [matches, index, setHighlightedId])

  const move = (step) => matches.length && setIndex((i) => (i + step + matches.length) % matches.length)

  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(-1) }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(1) }
  }

  const nav = 'flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3 ring-indigo-500/20 focus-within:ring-4 dark:bg-slate-900">
        <LuSearch className="size-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0) }}
          onKeyDown={onKey}
          placeholder="Search in this chat"
          aria-label="Search in this chat"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        {query.trim().length >= 2 && (
          <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {matches.length ? `${index + 1} of ${matches.length}` : 'No results'}
          </span>
        )}
      </div>
      <button onClick={() => move(1)} disabled={matches.length < 2} className={nav} title="Older match (↑)" aria-label="Older match"><LuChevronUp className="size-4.5" /></button>
      <button onClick={() => move(-1)} disabled={matches.length < 2} className={nav} title="Newer match (↓)" aria-label="Newer match"><LuChevronDown className="size-4.5" /></button>
      <button onClick={onClose} className={nav} title="Close search (Esc)" aria-label="Close search"><LuX className="size-4.5" /></button>
    </div>
  )
}

export default ChatSearch
