import React, { useState } from 'react'
import axios from 'axios'
import { LuChartColumn, LuCheck, LuLock } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'

// A poll inside a chat bubble: tap an option to vote, see live counts
const PollCard = ({ message, itsMe, myId, nameOf }) => {
  const { setMessages } = useConversation()
  const [busy, setBusy] = useState(false)
  const [showVoters, setShowVoters] = useState(false)
  const poll = message.poll
  const mine = poll.options.filter((o) => o.votes.some((v) => String(v) === myId)).map((o) => o.id)
  const voters = new Set(poll.options.flatMap((o) => o.votes.map(String)))
  const top = Math.max(1, ...poll.options.map((o) => o.votes.length))

  const vote = async (id) => {
    if (busy || poll.closed) return
    const next = poll.multiple ? (mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]) : (mine.includes(id) ? [] : [id])
    setBusy(true)
    try {
      const res = await axios.put(`/api/message/vote/${message._id}`, { optionIds: next }, { withCredentials: true })
      setMessages((prev) => prev.map((m) => (m._id === res.data._id ? res.data : m)))
    } catch { /* stays as it was */ }
    setBusy(false)
  }

  const close = async () => {
    try {
      const res = await axios.put(`/api/message/poll/${message._id}/close`, {}, { withCredentials: true })
      setMessages((prev) => prev.map((m) => (m._id === res.data._id ? res.data : m)))
    } catch { /* ignore */ }
  }

  const sub = itsMe ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'

  return (
    <div className="w-72 max-w-full py-0.5">
      <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>
        <LuChartColumn className="size-3.5" /> Poll{poll.multiple ? ' · pick any' : ''}{poll.closed ? ' · closed' : ''}
      </p>
      <p className="mt-1 text-[15px] font-semibold leading-snug">{poll.question}</p>
      <div className="mt-2.5 space-y-1.5">
        {poll.options.map((o) => {
          const picked = mine.includes(o.id)
          const pct = voters.size ? Math.round((o.votes.length / voters.size) * 100) : 0
          return (
            <button
              key={o.id}
              type="button"
              disabled={busy || poll.closed}
              onClick={(e) => { e.stopPropagation(); vote(o.id) }}
              className={`relative w-full overflow-hidden rounded-lg px-3 py-2 text-left text-sm transition disabled:cursor-default ${
                itsMe ? 'bg-white/10 hover:bg-white/15' : 'bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-700/50 dark:hover:bg-slate-700'
              } ${picked ? (itsMe ? 'ring-2 ring-white/70' : 'ring-2 ring-indigo-500') : ''}`}
            >
              <span
                className={`absolute inset-y-0 left-0 transition-all ${itsMe ? 'bg-white/20' : o.votes.length === top && o.votes.length ? 'bg-indigo-500/20' : 'bg-slate-300/50 dark:bg-slate-600/40'}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center gap-2">
                <span className={`flex size-4 shrink-0 items-center justify-center ${poll.multiple ? 'rounded' : 'rounded-full'} border ${picked ? (itsMe ? 'border-white bg-white text-indigo-600' : 'border-indigo-600 bg-indigo-600 text-white') : itsMe ? 'border-white/60' : 'border-slate-400'}`}>
                  {picked && <LuCheck className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.text}</span>
                <span className={`shrink-0 text-xs tabular-nums ${sub}`}>{o.votes.length}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className={`mt-2 flex items-center gap-3 text-xs ${sub}`}>
        <button type="button" onClick={(e) => { e.stopPropagation(); setShowVoters((v) => !v) }} className="hover:underline">
          {voters.size} vote{voters.size === 1 ? '' : 's'}{voters.size ? (showVoters ? ' · hide' : ' · see who') : ''}
        </button>
        {itsMe && !poll.closed && (
          <button type="button" onClick={(e) => { e.stopPropagation(); close() }} className="ml-auto inline-flex items-center gap-1 hover:underline"><LuLock className="size-3" /> Close poll</button>
        )}
      </div>
      {showVoters && voters.size > 0 && (
        <div className={`mt-1.5 space-y-0.5 text-xs ${sub}`}>
          {poll.options.filter((o) => o.votes.length).map((o) => (
            <p key={o.id}><span className="font-medium">{o.text}:</span> {o.votes.map((v) => (String(v) === myId ? 'You' : nameOf ? nameOf(v) : 'Someone')).join(', ')}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default PollCard
