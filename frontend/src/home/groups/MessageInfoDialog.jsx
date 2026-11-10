import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { LuCheckCheck, LuClock3, LuEyeOff, LuX } from 'react-icons/lu'
import Avatar from '../Avatar'

// "Message info" for my message in a group: who has seen it and who hasn't yet
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const Person = ({ p, detail }) => (
  <li className="flex items-center gap-3 px-1 py-1.5">
    <Avatar name={p.fullName} src={p.avatar?.url} size="sm" />
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.fullName}</span>
    {detail && <span className="shrink-0 text-xs text-slate-400">{detail}</span>}
  </li>
)

const MessageInfoDialog = ({ groupId, messageId, onClose }) => {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    axios.get(`/api/groups/${groupId}/messages/${messageId}/info`, { withCredentials: true })
      .then((res) => setInfo(res.data))
      .catch((err) => setError(err.response?.data?.error || "Couldn't load message info"))
  }, [groupId, messageId])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Message info" onClick={(e) => e.stopPropagation()} className="max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-sm sm:rounded-2xl dark:bg-slate-900">
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-base font-semibold">Message info</h2>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><LuX className="size-4.5" /></button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!info && !error && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>}
        {info && (
          <>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Sent {when(info.sentAt)}</p>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400"><LuCheckCheck className="size-4" /> Seen by {info.seen.length}</h3>
            <ul className="mb-4 mt-1">
              {info.seen.length ? info.seen.map((p) => <Person key={p._id} p={p} detail={when(p.at)} />) : <li className="px-1 py-1.5 text-sm text-slate-400">Nobody yet</li>}
            </ul>
            {info.waiting.length > 0 && (
              <>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><LuClock3 className="size-4" /> Not seen yet · {info.waiting.length}</h3>
                <ul className="mt-1">{info.waiting.map((p) => <Person key={p._id} p={p} />)}</ul>
              </>
            )}
            {info.hidden > 0 && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400"><LuEyeOff className="size-3.5" /> {info.hidden} {info.hidden === 1 ? 'person has' : 'people have'} seen indicators off{info.seen.length + info.waiting.length === 0 ? ' (or you do)' : ''}</p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default MessageInfoDialog
