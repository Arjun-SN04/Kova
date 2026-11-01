import MessageSearchResults from './MessageSearchResults'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { LuArrowLeft, LuCheck, LuCheckCheck, LuEye, LuEyeOff, LuChevronRight, LuClock, LuLock, LuLockOpen, LuInbox, LuLayers, LuListChecks, LuPin, LuPinOff, LuQrCode, LuSearch, LuSearchX, LuTrash2, LuUserPlus, LuUsers, LuX } from 'react-icons/lu'
import User from './User'
import AiRow from './AiRow'
import GroupInvites from './GroupInvites'
import { CommunityRow, GroupRow } from './GroupRow'
import useGetAllUsers from '../../context/useGetAllUsers'
import { useSocket } from '../../context/SocketProvider'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { loadConversations, selfContact } from '../../utils/conversations'
import { hashHiddenWord } from '../../utils/chatExtras'
import { togglePinChat } from '../../utils/chatExtras'
import ConfirmDialog from '../ConfirmDialog'
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
  const [everyone, loading] = useGetAllUsers()
  const { onlineUsers } = useSocket()
  const { unreadCounts, previews, typingUsers, requests, setContactsDialog, groups: allGroups, communities, setCreateDialog, pinnedChats, lockedChats, setLockRequest, hiddenChats, hiddenWordHash, setHideRequest } = useConversation()
  // Locked chats stay in the list; opening one asks for the code (see Right.jsx)
  const lockedSet = useMemo(() => new Set(lockedChats), [lockedChats])
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  // Hidden chats: only shown when the search box holds the secret word
  const hiddenSet = useMemo(() => new Set(hiddenChats), [hiddenChats])
  const [revealHidden, setRevealHidden] = useState(false)
  useEffect(() => {
    let alive = true
    const typed = query.trim()
    if (!hiddenWordHash || typed.length < 3) { setRevealHidden(false); return }
    hashHiddenWord(myId, typed).then((h) => { if (alive) setRevealHidden(h === hiddenWordHash) })
    return () => { alive = false }
  }, [query, hiddenWordHash, myId])
  const shownHere = (c) => hiddenSet.has(String(c._id)) === revealHidden
  const allUser = useMemo(() => everyone.filter(shownHere), [everyone, hiddenSet, revealHidden]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => allGroups.filter(shownHere), [allGroups, hiddenSet, revealHidden]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const panelRef = useRef(null)
  const [panelWidth, setPanelWidth] = useState(0)

  useEffect(() => {
    if (!panelRef.current) return
    const el = panelRef.current
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPanelWidth(Math.round(entry.contentRect.width))
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const isCompact = panelWidth > 0 && panelWidth < 330
  const isNarrow = panelWidth > 0 && panelWidth < 390

  // ── Select several chats (right-click, long-press or the Select button) ──
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const pressTimer = useRef(null)
  const longPressed = useRef(false)
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const startSel = (id) => { setSelecting(true); setBulkError(''); setSelected(new Set(id ? [id] : [])) }
  const stopSel = () => { setSelecting(false); setSelected(new Set()); setBulkError('') }
  useEffect(() => {
    if (!selecting) return
    const onKey = (e) => { if (e.key === 'Escape') stopSel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting])

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
  // People only show in the list once there's a chat with them (or it's pinned / unread / open).
  // Everyone else is in Contacts; searching finds them too.
  const openId = String(useConversation((st) => st.selectedConversation?._id) || '')
  const hasChat = (c) => c.isGroup || !!previews[String(c._id)] || unreadOf(c) > 0 || pinnedChats.includes(String(c._id)) || String(c._id) === openId
  const pinRank = (c) => { const i = pinnedChats.indexOf(String(c._id)); return i < 0 ? Infinity : i }
  const lastTime = (u) => (previews[String(u._id)] ? new Date(previews[String(u._id)].createdAt).getTime() : 0)

  // "Message yourself" row: shown first in the All tab, and when the search matches me
  const self = useMemo(() => selfContact(AuthUser), [AuthUser])
  const q = query.trim().toLowerCase()
  const showSelf = !!self && tab === 'all' && !revealHidden && !hiddenSet.has(String(self?._id)) &&
    (!q || self.fullName.toLowerCase().includes(q) || self.username?.includes(q.replace(/^@/, '')) || 'message yourself'.includes(q))

  // Nexa (the AI assistant) is pinned under "Message yourself" in the All tab
  const showAi = tab === 'all' && !revealHidden && (!q || 'nexa ai assistant'.includes(q))

  const counts = {
    all: allUser.filter(hasChat).length + groups.length + (self ? 1 : 0),
    online: allUser.filter((u) => onlineSet.has(String(u._id))).length,
    unread: [...allUser, ...groups].filter((u) => unreadOf(u) > 0).length,
    groups: groups.length,
  }

  // People and groups together. Filter by search + tab, then sort by most recent
  // chat (chats with no messages go last, A→Z).
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (c) => revealHidden || !q || c.fullName.toLowerCase().includes(q) || c.username?.includes(q.replace(/^@/, '')) || c.email?.toLowerCase().includes(q)
    const pool = tab === 'online' ? allUser : [...allUser, ...groups]
    return pool
      .filter(matches)
      .filter((c) => tab === 'all' || tab === 'groups' || (tab === 'online' ? onlineSet.has(String(c._id)) : unreadOf(c) > 0))
      .filter((c) => tab === 'online' || !!q || revealHidden || hasChat(c))
      .filter((c) => !bizFilter || (!c.isGroup && passesBizFilter(c)))
      // Pinned chats first (in pin order), then the most recent
      .sort((a, b) => pinRank(a) - pinRank(b) || lastTime(b) - lastTime(a) || a.fullName.localeCompare(b.fullName))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUser, groups, query, tab, onlineSet, unreadCounts, previews, pinnedChats, bizFilter, records, openId, revealHidden])

  const rowFor = (chat, compact = false) => selectable(chat, rowNode(chat, compact))
  const rowNode = (chat, compact = false) =>
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
        locked={lockedChats.includes(String(chat._id))}
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
        locked={lockedChats.includes(String(chat._id))}
        labels={bizMode ? (recordOf(chat)?.labels || []).map((id) => bizLabels.find((l) => String(l._id) === String(id))).filter(Boolean) : []}
        lead={bizMode && !!recordOf(chat)?.lead}
        waiting={bizMode && !!recordOf(chat)?.waitingSince && !!previews[String(chat._id)]}
      />
    )

  // Wrap a row so it can be selected
  const selectable = (chat, node) => {
    const id = String(chat._id)
    const on = selected.has(id)
    const name = chat.isGroup ? chat.name : chat.fullName
    const cancelPress = () => clearTimeout(pressTimer.current)
    return (
      <div
        key={id}
        className="relative"
        onContextMenu={(e) => { e.preventDefault(); if (selecting) toggleSel(id); else startSel(id) }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch' || selecting) return
          longPressed.current = false
          pressTimer.current = setTimeout(() => { longPressed.current = true; startSel(id); navigator.vibrate?.(15) }, 450)
        }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
      >
        {node}
        {selecting && (
          <button
            type="button"
            onClick={() => { if (longPressed.current) { longPressed.current = false; return } toggleSel(id) }}
            aria-pressed={on}
            aria-label={`Select ${name}`}
            className={`absolute inset-0 rounded-xl transition ${on ? 'bg-indigo-500/[0.08] ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-500/5'}`}
          >
            <span className={`absolute left-[42px] top-1/2 mt-1.5 flex size-5 items-center justify-center rounded-full ring-2 ring-white transition dark:ring-slate-950 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-transparent dark:bg-slate-700'}`}>
              <LuCheck className="size-3" />
            </span>
          </button>
        )}
      </div>
    )
  }

  // Everything that can be selected in the current view
  const selectableIds = () => [...(showSelf && self ? [String(self._id)] : []), ...(tab === 'groups' ? groups : list).map((c) => String(c._id))]
  const chatById = (id) => [...allUser, ...groups, ...(self ? [self] : [])].find((c) => String(c._id) === id)
  const picked = [...selected]
  const pickedGroups = picked.filter((id) => chatById(id)?.isGroup)
  const pickedDirect = picked.filter((id) => !chatById(id)?.isGroup)
  const allPinned = picked.length > 0 && picked.every((id) => pinnedChats.includes(id))
  const allLocked = picked.length > 0 && picked.every((id) => lockedSet.has(id))
  const allHidden = picked.length > 0 && picked.every((id) => hiddenSet.has(id))

  const bulk = async (run) => {
    setBulkBusy(true); setBulkError('')
    try { await run(); stopSel() } catch (err) { setBulkError(err?.response?.data?.error || err?.message || 'Something went wrong') } finally { setBulkBusy(false) }
  }
  const pinSelected = () => bulk(async () => {
    for (const id of picked) {
      if (pinnedChats.includes(id) === !allPinned) continue
      const res = await togglePinChat(id)
      if (!res.ok) throw new Error(res.error)
    }
  })
  const readSelected = () => bulk(async () => {
    const api = { withCredentials: true }
    await Promise.all(picked.map((id) => (chatById(id)?.isGroup ? axios.put(`/api/groups/${id}/read`, {}, api) : axios.put(`/api/message/seen/${id}`, {}, api))))
    picked.forEach((id) => useConversation.getState().clearUnread(id))
  })
  const deleteSelected = async () => {
    const api = { withCredentials: true }
    const open = String(useConversation.getState().selectedConversation?._id || '')
    await Promise.all(pickedDirect.map((id) => axios.delete(`/api/message/conversation/${id}`, api).catch((err) => (err.response?.status === 404 ? null : Promise.reject(err)))))
    if (pickedDirect.includes(open)) useConversation.getState().setMessages([])
    loadConversations()
    setConfirmDelete(false)
    stopSel()
  }

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
    <div ref={panelRef} className="flex min-h-0 flex-1 flex-col">
      {selecting ? (
        <div className="px-3 sm:px-4">
          <div className="flex h-9 sm:h-10 items-center gap-1 rounded-xl bg-slate-100 pl-1 pr-1 dark:bg-slate-900">
            <button onClick={stopSel} className="flex size-7 sm:size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Cancel selection" title="Cancel (Esc)"><LuX className="size-4" /></button>
            <span className="min-w-0 flex-1 truncate px-1 text-xs sm:text-sm font-medium">{picked.length ? `${picked.length} selected` : 'Select chats'}</span>
            <button onClick={() => setSelected(new Set(selectableIds()))} className="h-7 sm:h-8 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">Select all</button>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {[
              { label: allPinned ? 'Unpin' : 'Pin', Icon: allPinned ? LuPinOff : LuPin, run: pinSelected },
              { label: 'Mark read', Icon: LuCheckCheck, run: readSelected },
              { label: allLocked ? 'Unlock' : 'Lock', Icon: allLocked ? LuLockOpen : LuLock, run: () => { setLockRequest({ action: allLocked ? 'unlock' : 'lock', ids: picked, chats: picked.map(chatById).filter(Boolean) }); stopSel() } },
              { label: allHidden ? 'Unhide' : 'Hide', Icon: allHidden ? LuEye : LuEyeOff, run: () => { setHideRequest({ ids: picked, hidden: !allHidden }); stopSel() } },
              { label: 'Delete', Icon: LuTrash2, run: () => (pickedDirect.length ? setConfirmDelete(true) : setBulkError('Groups can’t be deleted from here. Open a group’s info to leave it.')), danger: true },
            ].map(({ label, Icon, run, danger }) => (
              <button key={label} onClick={run} disabled={!picked.length || bulkBusy} className={`flex h-11 sm:h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-[10px] sm:text-[11px] font-medium transition disabled:opacity-40 px-0.5 ${danger ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900'}`}>
                <Icon className="size-3.5 sm:size-4" /> <span className="truncate max-w-full">{label}</span>
              </button>
            ))}
          </div>
          {bulkError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{bulkError}</p>}
        </div>
      ) : (
      <>
      {/* Search */}
      <div className="px-3 sm:px-4">
        <div className="relative">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            placeholder={isCompact ? 'Search' : 'Search people'}
            className="h-9 sm:h-10 w-full rounded-xl border border-transparent bg-slate-100 pl-9 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500/50 dark:focus:bg-slate-950"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <LuX className="size-3.5" />
            </button>
          ) : panelWidth >= 340 || panelWidth === 0 ? (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-400 md:block dark:border-slate-700 dark:bg-slate-800">
              /
            </kbd>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-2.5 sm:mt-3 flex items-center gap-1.5 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ id, label }) => {
            const isActive = tab === id
            const count = counts[id]
            const showCount =
              id === 'all'
                ? count > 0
                : id === 'unread'
                  ? count > 0
                  : isNarrow
                    ? count > 0
                    : count > 0 || isActive

            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex min-w-0 flex-1 items-center justify-center rounded-lg font-medium transition ${
                  isNarrow
                    ? 'gap-1 px-1.5 py-1 text-xs'
                    : 'gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-[13px]'
                } ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="truncate">{label}</span>
                {showCount && (
                  <span
                    className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition ${
                      isNarrow ? 'text-[10px] px-1 min-w-4 h-4' : 'text-xs px-1.5 min-w-4.5 h-4.5'
                    } ${
                      isActive
                        ? 'bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900'
                        : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => (selecting ? stopSel() : startSel())}
          className={`flex shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white ${
            isNarrow ? 'size-7' : 'size-8'
          } ${selecting ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : ''}`}
          aria-label={selecting ? 'Done selecting' : 'Select chats'}
          title={selecting ? 'Done selecting' : 'Select chats'}
        >
          <LuListChecks className={isNarrow ? 'size-3.5' : 'size-4'} />
        </button>
      </div>
      </>
      )}

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

      {/* Invites to groups (for people who approve group adds) */}
      <GroupInvites />

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

      {revealHidden && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-[13px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
          <LuEyeOff className="size-4 shrink-0" /> Hidden chats · clear the search to hide them again
        </div>
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
              {revealHidden ? 'No hidden chats' : query ? 'No matches' : tab === 'online' ? 'Nobody is online' : tab === 'unread' ? "You're all caught up" : everyone.length ? 'No chats yet' : 'No contacts yet'}
            </p>
            <p className="mt-1 text-[13px] text-slate-400">
              {query ? 'Try a different name or email.' : tab === 'all' && everyone.length ? 'Start one from your contacts.' : 'Check back in a bit.'}
            </p>
            {!query && tab === 'all' && everyone.length > 0 && (
              <button onClick={() => setContactsDialog('all')} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white transition hover:bg-indigo-500">Open contacts</button>
            )}
          </div>
        ) : (
          <>
            {showSelf && rowFor(self)}
            {showAi && <AiRow />}
            {list.map((chat) => rowFor(chat))}
          </>
        )}
        {tab !== 'groups' && !revealHidden && !selecting && <MessageSearchResults query={query} />}

        {/* No contacts yet: show how to add people */}
        {!loading && everyone.length === 0 && tab === 'all' && !q && (
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
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteSelected}
        title={pickedDirect.length === 1 ? 'Delete this chat?' : `Delete ${pickedDirect.length} chats?`}
        description={[
          pickedDirect.length ? `All messages and files in ${pickedDirect.length === 1 ? 'this chat' : 'these chats'} will be permanently deleted for both of you. Your contacts stay.` : 'Groups can’t be deleted from here.',
          pickedGroups.length ? `${pickedGroups.length === 1 ? 'The selected group is' : `${pickedGroups.length} selected groups are`} skipped. To leave a group, open its info.` : '',
        ].filter(Boolean).join(' ')}
        confirmLabel="Delete"
      />
    </div>
  )
}

export default Users
