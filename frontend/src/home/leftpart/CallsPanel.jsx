import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { LuPhone, LuPhoneCall, LuPhoneIncoming, LuPhoneMissed, LuPhoneOutgoing, LuSearch, LuTrash2, LuVideo } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { useCall } from '../../context/CallProvider'
import Avatar from '../Avatar'
import ConfirmDialog from '../ConfirmDialog'
import Sheet from '../groups/Sheet'
import PanelHeader, { panelIconBtn } from './PanelHeader'
import { shortTime } from '../../utils/conversations'
import { formatCallDuration, loadCalls } from '../../utils/calls'

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

// Pick a contact to call
const NewCallDialog = ({ open, onClose }) => {
  const { contacts } = useConversation()
  const { call, startCall } = useCall()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase().replace(/^@/, '')
  const list = [...contacts]
    .filter((c) => !q || c.fullName.toLowerCase().includes(q) || c.username?.includes(q))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
  const dial = (person, type) => { onClose(); startCall(person, type) }

  return (
    <Sheet open={open} onClose={onClose} title="New call">
      <div className="relative">
        <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950" />
      </div>
      <div className="mt-2 space-y-0.5">
        {list.map((c) => (
          <div key={c._id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <Avatar name={c.fullName} src={c.avatar?.url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.fullName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{c.username}</p>
            </div>
            <button disabled={!!call} onClick={() => dial(c, 'voice')} className={panelIconBtn} title="Voice call" aria-label={`Voice call ${c.fullName}`}><LuPhone className="size-4" /></button>
            <button disabled={!!call} onClick={() => dial(c, 'video')} className={panelIconBtn} title="Video call" aria-label={`Video call ${c.fullName}`}><LuVideo className="size-4" /></button>
          </div>
        ))}
        {!list.length && <p className="py-8 text-center text-sm text-slate-500">{contacts.length ? 'No matches' : 'Add contacts to call them.'}</p>}
      </div>
    </Sheet>
  )
}

// Recent calls, like a phone's call log
const CallsPanel = () => {
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)
  const { calls, contacts, setSelectedConversation } = useConversation()
  const { call: activeCall, startCall } = useCall()
  const [query, setQuery] = useState('')
  const [newCall, setNewCall] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // Merge back-to-back calls with the same person, direction and result on the same day: "Missed (2)"
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    const out = []
    for (const c of calls) {
      const outgoing = String(c.caller?._id) === myId
      const peer = outgoing ? c.callee : c.caller
      if (!peer) continue
      if (q && !peer.fullName?.toLowerCase().includes(q) && !peer.username?.includes(q)) continue
      const missed = !outgoing && c.status !== 'answered'
      const last = out[out.length - 1]
      if (last && String(last.peer._id) === String(peer._id) && last.outgoing === outgoing && last.missed === missed && sameDay(last.at, c.startedAt)) {
        last.count += 1
        continue
      }
      out.push({ id: c._id, peer, outgoing, missed, type: c.type, status: c.status, duration: c.duration, at: c.startedAt, count: 1 })
    }
    return out
  }, [calls, query, myId])

  const contactOf = (peer) => contacts.find((c) => String(c._id) === String(peer._id))

  const clear = async () => {
    await axios.delete('/api/calls', { withCredentials: true })
    await loadCalls()
    setConfirmClear(false)
  }

  return (
    <>
      <PanelHeader title="Calls">
        {calls.length > 0 && (
          <button onClick={() => setConfirmClear(true)} className={panelIconBtn} title="Clear call log" aria-label="Clear call log"><LuTrash2 className="size-4.5" /></button>
        )}
        <button onClick={() => setNewCall(true)} className="flex size-9 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500" title="New call" aria-label="New call">
          <LuPhoneCall className="size-4" />
        </button>
      </PanelHeader>

      <div className="px-3 sm:px-4">
        <div className="relative">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or @username" className="h-9 sm:h-10 w-full rounded-xl border border-transparent bg-slate-100 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white dark:bg-slate-900 dark:focus:border-indigo-500/50 dark:focus:bg-slate-950" />
        </div>
      </div>

      <p className="px-5 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent</p>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {rows.map((r) => {
          const contact = contactOf(r.peer)
          const Arrow = r.missed ? LuPhoneMissed : r.outgoing ? LuPhoneOutgoing : LuPhoneIncoming
          const label = r.missed ? (r.status === 'declined' ? 'Declined' : 'Missed') : r.outgoing ? 'Outgoing' : 'Incoming'
          return (
            <div key={r.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900">
              <button onClick={() => contact && setSelectedConversation(contact)} disabled={!contact} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={r.peer.fullName} src={r.peer.avatar?.url} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${r.missed ? 'text-red-600 dark:text-red-400' : ''}`}>{r.peer.fullName}</p>
                  <p className={`flex items-center gap-1.5 text-[13px] ${r.missed ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    <Arrow className="size-3.5" />
                    {label}{r.count > 1 && ` (${r.count})`}
                    {r.type === 'video' && <LuVideo className="size-3.5 opacity-70" />}
                    {r.status === 'answered' && r.count === 1 && <span className="text-slate-400">· {formatCallDuration(r.duration)}</span>}
                  </p>
                </div>
              </button>
              <span className="shrink-0 text-[11px] text-slate-400 group-hover:hidden">{shortTime(r.at)}</span>
              {contact && (
                <div className="hidden shrink-0 group-hover:flex">
                  <button disabled={!!activeCall} onClick={() => startCall(contact, 'voice')} className={panelIconBtn} title="Voice call" aria-label={`Voice call ${r.peer.fullName}`}><LuPhone className="size-4" /></button>
                  <button disabled={!!activeCall} onClick={() => startCall(contact, 'video')} className={panelIconBtn} title="Video call" aria-label={`Video call ${r.peer.fullName}`}><LuVideo className="size-4" /></button>
                </div>
              )}
            </div>
          )
        })}
        {!rows.length && (
          <div className="px-6 py-12 text-center">
            <LuPhone className="mx-auto size-6 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">{query ? 'No matches' : 'No calls yet'}</p>
            <p className="mt-1 text-[13px] text-slate-400">{query ? 'Try a different name.' : 'Voice and video calls you make or get will show up here.'}</p>
          </div>
        )}
      </div>

      <NewCallDialog open={newCall} onClose={() => setNewCall(false)} />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clear}
        title="Clear call log?"
        description="Your call list will be emptied. Calls in your chats stay, and the other person's list isn't affected."
        confirmLabel="Clear"
        busyLabel="Clearing…"
      />
    </>
  )
}

export default CallsPanel
