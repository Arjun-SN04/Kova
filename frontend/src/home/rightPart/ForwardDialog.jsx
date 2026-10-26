import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuCheck, LuForward, LuSearch, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import Avatar, { GroupAvatar } from '../Avatar'
import { canPost } from '../../utils/groups'
import { loadConversations, selfContact } from '../../utils/conversations'
import { useAuth } from '../../context/AuthProvider'

const MAX_RECIPIENTS = 20

// Pick people to forward the chosen messages to. Media isn't uploaded again.
const ForwardDialog = () => {
  const { forwardIds, setForwardIds, contacts, groups, selectedConversation, setMessages, clearSelection } = useConversation()
  const [AuthUser] = useAuth()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const open = !!forwardIds?.length

  const close = () => { setForwardIds(null); setPicked([]); setQuery(''); setError('') }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const self = selfContact(AuthUser)
    const people = [...contacts].sort((a, b) => a.fullName.localeCompare(b.fullName))
    // Groups I can post in come after people
    const postable = groups.filter((g) => canPost(g, AuthUser?._id)).sort((a, b) => a.name.localeCompare(b.name))
    return [...(self ? [self] : []), ...people, ...postable]
      .filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.username?.includes(q) || u.email?.toLowerCase().includes(q))
  }, [contacts, groups, query, AuthUser])

  const toggle = (id) =>
    setPicked((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_RECIPIENTS ? [...prev, id] : prev)

  const send = async () => {
    setSending(true)
    setError('')
    try {
      const groupIds = new Set(groups.map((g) => String(g._id)))
      const res = await axios.post('/api/message/forward', {
        messageIds: forwardIds,
        receiverIds: picked.filter((id) => !groupIds.has(String(id))),
        groupIds: picked.filter((id) => groupIds.has(String(id))),
      }, { withCredentials: true })
      // If I forwarded into the chat that's open, show the copies right away
      const openId = String(selectedConversation?._id)
      const here = res.data.filter((m) => String(m.groupId || m.receiverId) === openId)
      if (here.length) setMessages((prev) => [...prev, ...here])
      loadConversations()
      clearSelection()
      close()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not forward. Try again.')
    } finally {
      setSending(false)
    }
  }

  const count = forwardIds?.length || 0

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
            className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white text-slate-900 shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:text-slate-100 dark:ring-1 dark:ring-slate-800"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-base font-semibold">Forward to…</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{count} message{count === 1 ? '' : 's'}</p>
              </div>
              <button onClick={close} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <LuX className="size-5" />
              </button>
            </div>

            <div className="p-4 pb-2">
              <div className="relative">
                <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people"
                  className="h-10 w-full rounded-xl bg-slate-100 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {list.map((u) => {
                const on = picked.includes(u._id)
                return (
                  <button
                    key={u._id}
                    onClick={() => toggle(u._id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                  >
                    {u.isGroup
                      ? <GroupAvatar name={u.name} src={u.avatar?.url} announcement={u.announcement} size="sm" />
                      : <Avatar name={u.fullName} src={u.avatar?.url} size="sm" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{u.fullName}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {u.isGroup ? `Group · ${u.members?.length || 0} members` : u.username ? `@${u.username}` : u.email}
                      </span>
                    </span>
                    <span className={`flex size-5 items-center justify-center rounded-full border-2 ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {on && <LuCheck className="size-3" />}
                    </span>
                  </button>
                )
              })}
              {list.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No matches</p>}
            </div>

            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              {error && <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
              <button
                onClick={send}
                disabled={!picked.length || sending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800"
              >
                <LuForward className="size-4" />
                {sending ? 'Forwarding…' : picked.length ? `Forward to ${picked.length} ${picked.length === 1 ? 'person' : 'people'}` : 'Choose people'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default ForwardDialog
