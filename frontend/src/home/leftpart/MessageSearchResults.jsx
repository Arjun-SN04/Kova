import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuLoaderCircle, LuMessageSquareText } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { selfContact } from '../../utils/conversations'
import Avatar, { GroupAvatar } from '../Avatar'

const when = (d) => {
  const date = new Date(d)
  const days = (Date.now() - date) / 86_400_000
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : days < 365 ? date.toLocaleDateString([], { day: 'numeric', month: 'short' }) : date.toLocaleDateString()
}

// Show the words around the match, with the match in bold
const Snippet = ({ text, query }) => {
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return <>{text}</>
  const start = Math.max(0, i - 30)
  return (
    <>
      {start > 0 && '…'}{text.slice(start, i)}
      <mark className="rounded bg-indigo-100 px-0.5 font-semibold text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-200">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  )
}

// "Messages" results under the chat list while searching: matches from every chat
const MessageSearchResults = ({ query }) => {
  const [AuthUser] = useAuth()
  const { contacts, groups, setSelectedConversation, setPendingJump } = useConversation()
  const [state, setState] = useState({ q: '', items: [] })
  const q = query.trim()
  const loading = q.length >= 2 && state.q !== q // results for this exact query aren't in yet

  useEffect(() => {
    if (q.length < 2) return
    const t = setTimeout(() => {
      axios.get('/api/message/search', { params: { q }, withCredentials: true })
        .then((res) => setState({ q, items: res.data.items }))
        .catch(() => setState({ q, items: [] }))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const open = ({ messageId, chat }) => {
    const target = chat.isGroup
      ? groups.find((g) => String(g._id) === chat._id)
      : chat._id === String(AuthUser?._id) ? selfContact(AuthUser) : contacts.find((c) => String(c._id) === chat._id)
    if (!target) return
    setPendingJump(messageId)
    setSelectedConversation(target)
  }

  if (q.length < 2) return null
  return (
    <div className="mt-2">
      <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <LuMessageSquareText className="size-3.5" /> Messages
        {loading && <LuLoaderCircle className="size-3.5 animate-spin" />}
      </p>
      {!loading && state.items.length === 0 && (
        <p className="px-3 py-2 text-[13px] text-slate-400">No messages contain “{q}”.</p>
      )}
      {(loading ? [] : state.items).map((it) => (
        <button
          key={it.messageId}
          onClick={() => open(it)}
          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          {it.chat.isGroup ? <GroupAvatar name={it.chat.name} src={it.chat.avatar} size="sm" /> : <Avatar name={it.chat.name} src={it.chat.avatar} size="sm" />}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{it.chat.name}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{when(it.createdAt)}</span>
            </span>
            <span className="mt-0.5 line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">
              {it.chat.isGroup || it.sender === 'You' ? <span className="font-medium text-slate-600 dark:text-slate-300">{it.sender}: </span> : null}
              <Snippet text={it.text} query={q} />
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

export default MessageSearchResults
