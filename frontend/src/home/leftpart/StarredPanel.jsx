import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuStar, LuStarOff, LuUsers } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { selfContact } from '../../utils/conversations'
import { attachmentLabel } from '../../utils/attachments'
import { toggleStar } from '../../utils/chatExtras'

const when = (d) => {
  const date = new Date(d)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

// Everything I starred, across all chats. Tapping one opens the chat at that message.
const StarredPanel = () => {
  const [AuthUser] = useAuth()
  const { contacts, groups, starredIds, setSelectedConversation, setPendingJump } = useConversation()
  const [items, setItems] = useState(null)

  useEffect(() => {
    axios.get('/api/message/starred', { withCredentials: true })
      .then((res) => setItems(res.data.items))
      .catch(() => setItems([]))
  }, [starredIds.length])

  const open = ({ message, chat }) => {
    const target = chat.isGroup
      ? groups.find((g) => String(g._id) === chat._id)
      : chat._id === String(AuthUser?._id) ? selfContact(AuthUser) : contacts.find((c) => String(c._id) === chat._id)
    if (!target) return
    setPendingJump(String(message._id))
    setSelectedConversation(target)
  }

  const shown = (items || []).filter((i) => starredIds.includes(String(i.message._id)))

  return (
    <>
      <header className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-3.5 sm:pt-4">
        <h2 className="truncate text-lg sm:text-xl font-semibold tracking-tight">Starred</h2>
        <p className="mt-0.5 truncate text-xs sm:text-[13px] text-slate-500 dark:text-slate-400">Messages you saved from any chat</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {items === null ? (
          <div className="space-y-2 px-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />)}</div>
        ) : !shown.length ? (
          <div className="mx-2 mt-2 rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center dark:border-slate-800">
            <LuStar className="mx-auto size-6 text-amber-400" />
            <p className="mt-2 text-sm font-semibold">No starred messages yet</p>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Open a message's ⋯ menu and choose Star to keep it here.</p>
          </div>
        ) : shown.map((item) => (
          <div key={item.message._id} className="group relative">
            <button onClick={() => open(item)} className="flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 pr-10 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900">
              <span className="flex w-full items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {item.chat.isGroup && <LuUsers className="size-3 shrink-0" />}
                <span className="truncate font-medium text-slate-700 dark:text-slate-200">{item.chat.name}</span>
                <span className="shrink-0">· {String(item.message.senderId) === String(AuthUser?._id) ? 'You' : item.sender.split(' ')[0]}</span>
                <span className="ml-auto shrink-0">{when(item.message.createdAt)}</span>
              </span>
              <span className="line-clamp-2 text-[13px] text-slate-800 dark:text-slate-100">
                {item.message.poll ? `Poll: ${item.message.poll.question}` : item.message.message || attachmentLabel(item.message.attachment)}
              </span>
            </button>
            <button onClick={() => toggleStar(item.message._id)} className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-amber-500 opacity-0 transition hover:bg-slate-100 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-slate-800" title="Unstar" aria-label="Unstar">
              <LuStarOff className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

export default StarredPanel
