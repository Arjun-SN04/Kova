import React, { useMemo, useState } from 'react'
import { LuPin, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { jumpToMessage } from '../../utils/messages'
import { setMessagePinned } from '../../utils/chatExtras'
import { attachmentLabel } from '../../utils/attachments'

// Pinned messages at the top of a chat. Tapping it jumps there and moves to the next pin.
const PinnedBar = ({ canUnpin = true }) => {
  const { messages, setHighlightedId } = useConversation()
  const pinned = useMemo(() => messages.filter((m) => m.pinned).sort((a, b) => new Date(b.pinned.at) - new Date(a.pinned.at)), [messages])
  const [index, setIndex] = useState(0)
  if (!pinned.length) return null
  const i = index % pinned.length
  const m = pinned[i]
  const text = m.poll ? `Poll: ${m.poll.question}` : m.message || attachmentLabel(m.attachment)

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur sm:px-5 dark:border-slate-800 dark:bg-slate-950/95">
      {pinned.length > 1 && (
        <div className="flex h-8 flex-col justify-center gap-0.5" aria-hidden="true">
          {pinned.map((p, n) => <span key={p._id} className={`w-0.5 flex-1 rounded-full ${n === i ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`} />)}
        </div>
      )}
      <button
        onClick={() => { jumpToMessage(m._id, setHighlightedId); setIndex((n) => n + 1) }}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
        title="Go to pinned message"
      >
        <LuPin className="size-4 shrink-0 -rotate-45 text-indigo-500" />
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Pinned message{pinned.length > 1 ? ` ${i + 1} of ${pinned.length}` : ''}</span>
          <span className="block truncate text-[13px] text-slate-600 dark:text-slate-300">{text}</span>
        </span>
      </button>
      {canUnpin && (
        <button onClick={() => setMessagePinned(m._id, false)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Unpin" aria-label="Unpin message">
          <LuX className="size-4" />
        </button>
      )}
    </div>
  )
}

export default PinnedBar
