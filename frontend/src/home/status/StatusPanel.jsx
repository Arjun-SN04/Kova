import React, { useState } from 'react'
import { LuCamera, LuPencil, LuPlus } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import Avatar from '../Avatar'
import StatusComposer from './StatusComposer'
import StatusViewer from './StatusViewer'
import { timeAgo } from '../../utils/status'

// Avatar with a ring split into one segment per status (bright = not seen yet)
const Ring = ({ user, statuses, size = 'md' }) => {
  const n = Math.max(1, statuses.length)
  const gap = n > 1 ? 4 : 0
  const seg = 100 / n
  return (
    <span className="relative inline-flex p-[3px]">
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        {statuses.map((s, i) => (
          <circle key={s._id} cx="18" cy="18" r="16.5" fill="none" strokeWidth="2" pathLength="100"
            className={s.seen ? 'stroke-slate-300 dark:stroke-slate-600' : 'stroke-indigo-500'}
            strokeDasharray={`${seg - gap} ${100 - seg + gap}`} strokeDashoffset={-i * seg} />
        ))}
      </svg>
      <span className="rounded-full ring-2 ring-white dark:ring-slate-950"><Avatar name={user.fullName} src={user.avatar?.url} size={size} /></span>
    </span>
  )
}

const StatusPanel = () => {
  const [AuthUser] = useAuth()
  const { statusFeed } = useConversation()
  const [composer, setComposer] = useState(null) // 'text' | 'media'
  const [viewing, setViewing] = useState(null) // { queue, start, mine }
  const { mine, people } = statusFeed
  const recent = people.filter((p) => !p.allSeen)
  const viewed = people.filter((p) => p.allSeen)
  const meUser = { fullName: AuthUser?.fullName || 'Me', avatar: AuthUser?.avatar }

  const open = (list, i) => setViewing({ queue: list.map((p) => ({ user: p.user, statuses: p.statuses })), start: i, mine: false })

  const Row = ({ p, list, i }) => (
    <button onClick={() => open(list, i)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900">
      <Ring user={p.user} statuses={p.statuses} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.user.fullName}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{timeAgo(p.latest)}</span>
      </span>
    </button>
  )

  return (
    <>
      <header className="flex items-center justify-between px-4 pb-3 pt-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Status</h2>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">Updates disappear after 24 hours</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setComposer('text')} className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white" title="Text status" aria-label="New text status"><LuPencil className="size-4.5" /></button>
          <button onClick={() => setComposer('media')} className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white" title="Photo or video status" aria-label="New photo status"><LuCamera className="size-4.5" /></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {/* Mine */}
        <button
          onClick={() => (mine.length ? setViewing({ queue: [{ user: meUser, statuses: mine }], start: 0, mine: true }) : setComposer('text'))}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          <span className="relative">
            {mine.length ? <Ring user={meUser} statuses={mine.map((s) => ({ ...s, seen: true }))} /> : <span className="inline-flex p-[3px]"><Avatar name={meUser.fullName} src={meUser.avatar?.url} /></span>}
            {!mine.length && <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full bg-indigo-600 text-white ring-2 ring-white dark:ring-slate-950"><LuPlus className="size-3" /></span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">My status</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{mine.length ? `${mine.length} update${mine.length > 1 ? 's' : ''} · ${timeAgo(mine[mine.length - 1].createdAt)}` : 'Tap to add a status update'}</span>
          </span>
        </button>

        {recent.length > 0 && <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recent updates</p>}
        {recent.map((p, i) => <Row key={p.user._id} p={p} list={recent} i={i} />)}
        {viewed.length > 0 && <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Viewed updates</p>}
        {viewed.map((p, i) => <Row key={p.user._id} p={p} list={viewed} i={i} />)}

        {!people.length && (
          <p className="mx-3 mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-center text-[13px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Status updates from your contacts show up here.
          </p>
        )}
      </div>

      {composer && <StatusComposer mode={composer} onClose={() => setComposer(null)} />}
      {viewing && <StatusViewer key={`${viewing.start}-${viewing.mine}`} queue={viewing.queue} start={viewing.start} mine={viewing.mine} onClose={() => setViewing(null)} />}
    </>
  )
}

export default StatusPanel
