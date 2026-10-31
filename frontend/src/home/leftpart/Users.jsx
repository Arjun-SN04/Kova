import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LuClock, LuInbox, LuLayers, LuQrCode, LuSearch, LuSearchX, LuUserPlus, LuUsers, LuX } from 'react-icons/lu'
import User from './User'
import AiRow from './AiRow'
import { CommunityRow, GroupRow } from './GroupRow'
import useGetAllUsers from '../../context/useGetAllUsers'
import { useSocket } from '../../context/SocketProvider'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { selfContact } from '../../utils/conversations'
import useBusiness from '../../business/store'
import { isBusiness } from '../../business/utils'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'online', label: 'Online' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
]

const RowSkeleton = () => (
  <div className="flex items-center gap-3 px-3 py-2.5">
    <div className="size-11 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
    </div>
  </div>
)

const Users = () => {
  const [allUser, loading] = useGetAllUsers()
  const { onlineUsers } = useSocket()
  const { unreadCounts, previews, typingUsers, requests, setContactsDialog, groups, communities, setCreateDialog, pinnedChats } = useConversation()
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  // Business accounts: filter customers by label, waiting for a reply, or leads
  const { settings: bizSettings, records, alerts, dismissAlert } = useBusiness()
  const bizMode = isBusiness(AuthUser)
  const bizLabels = bizMode ? bizSettings?.labels || [] : []
  const [bizFilter, setBizFilter] = useState(null) // null | 'waiting' | 'leads' | labelId
  const recordOf = (c) => records[String(c._id)]
  const passesBizFilter = (c) => {
    if (!bizFilter) return true
    const r = recordOf(c)
    if (bizFilter === 'waiting') return !!r?.waitingSince
    if (bizFilter === 'leads') return !!r?.lead
    return !!r?.labels?.some((l) => String(l) === bizFilter)
  }
  const searchRef = useRef(null)

  // Press "/" anywhere to jump to search
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onlineSet = useMemo(() => new Set(onlineUsers.map(String)), [onlineUsers])
  const unreadOf = (u) => unreadCounts[String(u._id)] || 0
  const pinRank = (c) => { const i = pinnedChats.indexOf(String(c._id)); return i < 0 ? Infinity : i }
  const lastTime = (u) => (previews[String(u._id)] ? new Date(previews[String(u._id)].createdAt).getTime() : 0)

  // "Message yourself" row: shown first in the All tab, and when the search matches me
  const self = useMemo(() => selfContact(AuthUser), [AuthUser])
  const q = query.trim().toLowerCase()
  const showSelf = !!self && tab === 'all' &&
    (!q || self.fullName.toLowerCase().includes(q) || self.username?.includes(q.replace(/^@/, '')) || 'message yourself'.includes(q))

  // Nexa (the AI assistant) is pinned under "Message yourself" in the All tab
  const showAi = tab === 'all' && (!q || 'nexa ai assistant'.includes(q))

  const counts = {
    all: allUser.length + groups.length + (self ? 1 : 0),
    online: allUser.filter((u) => onlineSet.has(String(u._id))).length,
    unread: [...allUser, ...groups].filter((u) => unreadOf(u) > 0).length,
    groups: groups.length,
  }

  // People and groups together. Filter by search + tab, then sort by most recent
  // chat (chats with no messages go last, A→Z).
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (c) => !q || c.fullName.toLowerCase().includes(q) || c.username?.includes(q.replace(/^@/, '')) || c.email?.toLowerCase().includes(q)
    const pool = tab === 'online' ? allUser : [...allUser, ...groups]
    return pool
      .filter(matches)
      .filter((c) => tab === 'all' || tab === 'groups' || (tab === 'online' ? onlineSet.has(String(c._id)) : unreadOf(c) > 0))
      .filter((c) => !bizFilter || (!c.isGroup && passesBizFilter(c)))
      // Pinned chats first (in pin order), then the most recent
      .sort((a, b) => pinRank(a) - pinRank(b) || lastTime(b) - lastTime(a) || a.fullName.localeCompare(b.fullName))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUser, groups, query, tab, onlineSet, unreadCounts, previews, pinnedChats, bizFilter, records])

  const rowFor = (chat, compact = false) =>
    chat.isGroup ? (
      <GroupRow
        key={chat._id}
        group={chat}
        unread={unreadOf(chat)}
        preview={previews[String(chat._id)]}
        typing={typingUsers[String(chat._id)]}
        myId={myId}
        compact={compact}
        pinned={pinnedChats.includes(String(chat._id))}
      />
    ) : (
      <User
        key={chat._id}
        user={chat}
        online={onlineSet.has(String(chat._id))}
        unread={unreadOf(chat)}
        preview={previews[String(chat._id)]}
        typing={typingUsers[String(chat._id)]}
        myId={myId}
        pinned={pinnedChats.includes(String(chat._id))}
        labels={bizMode ? (recordOf(chat)?.labels || []).map((id) => bizLabels.find((l) => String(l._id) === String(id))).filter(Boolean) : []}
        lead={bizMode && !!recordOf(chat)?.lead}
        waiting={bizMode && !!recordOf(chat)?.waitingSince && !!previews[String(chat._id)]}
      />
    )

  // Groups tab: each community with the groups I'm in under it, then other groups
  const groupsTab = () => {
    const q = query.trim().toLowerCase()
    const visible = (name) => !q || name.toLowerCase().includes(q)
    const standalone = groups.filter((g) => !g.community && visible(g.name))
    const shownCommunities = communities.filter((c) =>
      visible(c.name) || groups.some((g) => String(g.community?._id) === String(c._id) && visible(g.name)))

    if (!groups.length && !communities.length) {
      return (
        <div className="mx-2 mt-2 rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-center dark:border-slate-800">
          <p className="text-sm font-semibold">Talk to several people at once</p>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Start a group with your contacts, or a community to bring several groups together.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => setCreateDialog({ mode: 'group' })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white transition hover:bg-indigo-500">
              <LuUsers className="size-4" /> New group
            </button>
            <button onClick={() => setCreateDialog({ mode: 'community' })} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium ring-1 ring-slate-200 transition hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800">
              <LuLayers className="size-4" /> Community
            </button>
          </div>
        </div>
      )
    }
    return (
      <>
        {shownCommunities.map((c) => (
          <div key={c._id} className="pb-1">
            <CommunityRow community={c} />
            {groups
              .filter((g) => String(g.community?._id) === String(c._id) && visible(g.name))
              .sort((a, b) => Number(b.announcement) - Number(a.announcement) || lastTime(b) - lastTime(a))
              .map((g) => rowFor(g, true))}
          </div>
        ))}
        {shownCommunities.length > 0 && standalone.length > 0 && (
          <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Groups</p>
        )}
        {standalone.sort((a, b) => lastTime(b) - lastTime(a)).map((g) => rowFor(g))}
      </>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="px-4">
        <div className="relative">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            placeholder="Search people"
            className="h-10 w-full rounded-xl border border-transparent bg-slate-100 pl-9 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500/50 dark:focus:bg-slate-950"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <LuX className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-400 md:block dark:border-slate-700 dark:bg-slate-800">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-1 px-4">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
              tab === id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
            <span className={`text-xs ${tab === id ? 'opacity-70' : 'text-slate-400'}`}>{counts[id]}</span>
          </button>
        ))}
      </div>

      {/* Business: customer filters */}
      {bizMode && tab !== 'groups' && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {[['waiting', 'Waiting'], ['leads', 'Leads']].map(([id, label]) => (
            <button key={id} onClick={() => setBizFilter((f) => (f === id ? null : id))} className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${bizFilter === id ? 'bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white' : 'text-slate-600 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-900'}`}>
              {label}
            </button>
          ))}
          {bizLabels.map((l) => (
            <button key={l._id} onClick={() => setBizFilter((f) => (f === String(l._id) ? null : String(l._id)))} className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition"
              style={bizFilter === String(l._id) ? { backgroundColor: l.color, color: '#fff', boxShadow: `inset 0 0 0 1px ${l.color}` } : { color: l.color, boxShadow: `inset 0 0 0 1px ${l.color}55` }}>
              <span className="size-1.5 rounded-full" style={{ backgroundColor: bizFilter === String(l._id) ? '#fff' : l.color }} />{l.name}
            </button>
          ))}
        </div>
      )}

      {/* Business: customers waiting too long for a reply */}
      {bizMode && alerts.filter((a) => String(a.business) === myId).slice(0, 2).map((a) => {
        const contact = allUser.find((u) => String(u._id) === a.customer)
        return (
          <div key={a.customer} className="mx-4 mt-2 flex items-center gap-2.5 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <LuClock className="size-4 shrink-0" />
            <button onClick={() => { if (contact) useConversation.getState().setSelectedConversation(contact); dismissAlert(a.customer) }} className="min-w-0 flex-1 truncate text-left font-medium">
              {a.name} has waited {a.minutes} min
            </button>
            <button onClick={() => dismissAlert(a.customer)} className="text-xs opacity-70 hover:opacity-100" aria-label="Dismiss">Dismiss</button>
          </div>
        )
      })}

      {/* Pending requests */}
      {requests.incoming.length > 0 && (
        <button
          onClick={() => setContactsDialog('requests')}
          className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl bg-indigo-50 px-3 py-2.5 text-left text-[13px] font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
        >
          <LuInbox className="size-4 shrink-0" />
          <span className="flex-1">
            {requests.incoming.length === 1
              ? `${requests.incoming[0].from.fullName} wants to connect`
              : `${requests.incoming.length} contact requests`}
          </span>
          <span className="text-xs opacity-80">Review</span>
        </button>
      )}

      {/* List */}
      <div className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {loading && allUser.length === 0 ? (
          Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)
        ) : tab === 'groups' ? (
          groupsTab()
        ) : list.length === 0 && !showSelf && !showAi ? (
          <div className="px-6 py-12 text-center">
            <LuSearchX className="mx-auto size-6 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              {query ? 'No matches' : tab === 'online' ? 'Nobody is online' : tab === 'unread' ? "You're all caught up" : 'No contacts yet'}
            </p>
            <p className="mt-1 text-[13px] text-slate-400">
              {query ? 'Try a different name or email.' : 'Check back in a bit.'}
            </p>
          </div>
        ) : (
          <>
            {showSelf && rowFor(self)}
            {showAi && <AiRow />}
            {list.map((chat) => rowFor(chat))}
          </>
        )}

        {/* No contacts yet: show how to add people */}
        {!loading && allUser.length === 0 && tab === 'all' && !q && (
          <div className="mx-2 mt-4 rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-center dark:border-slate-800">
            <p className="text-sm font-semibold">Add your first contact</p>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">Find friends by username, or share your QR code so they can add you.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setContactsDialog('add')} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white transition hover:bg-indigo-500">
                <LuUserPlus className="size-4" /> Add
              </button>
              <button onClick={() => setContactsDialog('invite')} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium ring-1 ring-slate-200 transition hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800">
                <LuQrCode className="size-4" /> My QR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Users
