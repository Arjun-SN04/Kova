import React, { useEffect, useState } from 'react'
import { LuPlus, LuSearch, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import PanelHeader, { panelIconBtn } from '../leftpart/PanelHeader'
import ChannelAvatar from './ChannelAvatar'
import CreateChannelDialog from './CreateChannelDialog'
import { channelsApi, errorOf, loadChannels } from '../../utils/channels'

const when = (d) => {
  if (!d) return ''
  const date = new Date(d)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
const followers = (n) => `${n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : n} follower${n === 1 ? '' : 's'}`

// Sidebar: channels I follow or run, and "Find channels" to follow new ones
const ChannelsPanel = () => {
  const { channels, selectedConversation, setSelectedConversation } = useConversation()
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState({ q: null, list: [] })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const q = query.trim()

  useEffect(() => { loadChannels() }, [])
  useEffect(() => {
    const t = setTimeout(() => channelsApi.discover(q).then((r) => setFound({ q, list: r.data })).catch(() => setFound({ q, list: [] })), q ? 300 : 0)
    return () => clearTimeout(t)
  }, [q])

  const mine = new Set(channels.map((c) => c._id))
  const discover = found.list.filter((c) => !mine.has(c._id))
  const follow = async (c) => {
    setBusy(c._id); setError('')
    try { await channelsApi.follow(c._id); await loadChannels() } catch (err) { setError(errorOf(err)) }
    setBusy(null)
  }

  const row = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition'
  return (
    <>
      <PanelHeader title="Channels">
        <button onClick={() => setCreating(true)} className={panelIconBtn} title="New channel" aria-label="New channel"><LuPlus className="size-5" /></button>
      </PanelHeader>

      <div className="px-4">
        <div className="relative">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find channels" aria-label="Find channels"
            className="h-10 w-full rounded-xl bg-slate-100 pl-9 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 dark:bg-slate-900 dark:focus:bg-slate-900" />
          {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label="Clear"><LuX className="size-4" /></button>}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!q && channels.length > 0 && <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Your channels</p>}
        {!q && channels.map((c) => {
          const active = String(selectedConversation?._id) === c._id
          return (
            <button key={c._id} onClick={() => setSelectedConversation(c)} className={`${row} ${active ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
              <ChannelAvatar channel={c} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold">{c.name}</span>
                  <span className={`shrink-0 text-[11px] ${c.unread ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>{when(c.lastPost?.createdAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-500 dark:text-slate-400">
                    {c.lastPost ? (c.lastPost.text || (c.lastPost.attachment ? '📷 Photo' : '')) : c.amAdmin ? 'No posts yet. Write the first one.' : 'No posts yet'}
                  </span>
                  {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
                </span>
              </span>
            </button>
          )
        })}

        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{q ? 'Results' : 'Find channels to follow'}</p>
        {discover.map((c) => (
          <div key={c._id} className={`${row} hover:bg-slate-50 dark:hover:bg-slate-900`}>
            <button onClick={() => setSelectedConversation(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <ChannelAvatar channel={c} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">@{c.handle} · {followers(c.followerCount)}</span>
              </span>
            </button>
            <button onClick={() => follow(c)} disabled={busy === c._id} className="h-8 shrink-0 rounded-full bg-indigo-600 px-3.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50">
              {busy === c._id ? '…' : 'Follow'}
            </button>
          </div>
        ))}
        {found.q === q && discover.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-slate-400">{q ? `No channels match “${q}”.` : 'No other channels yet. Create one!'}</p>
        )}
        {error && <p className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
      {creating && <CreateChannelDialog onClose={() => setCreating(false)} />}
    </>
  )
}

export default ChannelsPanel
