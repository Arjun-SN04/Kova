import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuArrowLeft, LuEllipsisVertical, LuEye, LuEyeOff, LuImage, LuInfo, LuLock, LuLockOpen, LuPhone, LuPin, LuSearch, LuTimer, LuTrash2, LuVideo, LuScrollText, LuX } from 'react-icons/lu'
import { timerLabel, timerShort, togglePinChat } from '../../utils/chatExtras'
import { useGroupCall } from '../../context/GroupCallProvider'
import useConversation from '../../Zustand/UserConversation'
import { useSocket } from '../../context/SocketProvider'
import { useCall } from '../../context/CallProvider'
import Avatar, { GroupAvatar } from '../Avatar'
import { useAuth } from '../../context/AuthProvider'
import { BusinessBadge, OpenStatus } from '../../business/BusinessInfo'
import { hoursState, isBusiness } from '../../business/utils'

const iconBtn =
  'flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'

// The ⋯ menu: search, pin, info and clear (calls stay in the header)
const ChatMenu = ({ isGroup, pinned, locked, hidden, searchOpen, infoOpen, onSearch, onPin, onLock, onHide, onWallpaper, onInfo, onClear, onClose, pinCount = 0, onPins }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = [
    // Phones: pinned messages live here instead of a header button
    ...(pinCount > 0 && onPins ? [{ label: `Pinned messages (${pinCount})`, icon: LuPin, run: onPins, className: 'sm:hidden' }] : []),
    { label: searchOpen ? 'Close search' : 'Search in chat', icon: LuSearch, run: onSearch },
    { label: pinned ? 'Unpin chat' : 'Pin chat', icon: LuPin, run: onPin },
    ...(onLock ? [{ label: locked ? 'Unlock chat' : 'Lock chat', icon: locked ? LuLockOpen : LuLock, run: onLock }] : []),
    ...(onHide ? [{ label: hidden ? 'Unhide chat' : 'Hide chat', icon: hidden ? LuEye : LuEyeOff, run: onHide }] : []),
    { label: 'Wallpaper', icon: LuImage, run: onWallpaper },
    { label: infoOpen ? 'Hide info' : isGroup ? 'Group info' : 'Contact info', icon: LuInfo, run: onInfo },
    ...(onClose ? [{ label: 'Close chat', icon: LuX, run: onClose }] : []),
    ...(!isGroup ? [{ label: 'Clear chat', icon: LuTrash2, run: onClear, danger: true }] : []),
  ]
  const itemCls = 'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${iconBtn} ${open ? 'bg-slate-100! text-slate-900! dark:bg-slate-800! dark:text-white!' : ''}`}
        title="More options"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LuEllipsisVertical className="size-4.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full right-0 z-40 mt-1.5 w-52 origin-top-right overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          >
            {items.map(({ label, icon: Icon, run, danger, className = '' }) => (
              <button
                key={label}
                role="menuitem"
                onClick={() => { setOpen(false); run() }}
                className={`${itemCls} ${className} ${danger ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
              >
                <Icon className={`size-4 ${label.startsWith('Unpin') ? '-rotate-45' : ''}`} />
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Header of the open conversation.
// "Active 5 min ago" for a contact who's offline (null when hidden or unknown)
const useLastSeen = (userId) => {
  const [state, setState] = useState({ id: null, at: null })
  useEffect(() => {
    if (!userId) return
    let alive = true
    axios.get(`/api/user/presence/${userId}`, { withCredentials: true })
      .then((r) => { if (alive) setState({ id: String(userId), at: r.data.lastSeen }) })
      .catch(() => {})
    return () => { alive = false }
  }, [userId])
  return userId && state.id === String(userId) ? state.at : null
}

// Short form for phones: "5 min ago", "11:56 AM" (today), "yesterday", "3 Nov"
const lastSeenShort = (date) => {
  const d = new Date(date)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

// Online / last seen: short on phones, full on bigger screens
const Presence = ({ online, lastSeen }) => {
  if (online) return <span className="text-emerald-600 dark:text-emerald-400">Online</span>
  if (!lastSeen) return <span>Offline</span>
  return (
    <>
      <span className="sm:hidden">Active {lastSeenShort(lastSeen)}</span>
      <span className="hidden sm:inline">Active {lastSeenLabel(lastSeen)}</span>
    </>
  )
}

const lastSeenLabel = (date) => {
  const d = new Date(date)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return `today at ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time}`
}

const ChatUser = ({ onBack, onToggleInfo, infoOpen, onClear, onSearch, searchOpen }) => {
  const { selectedConversation, messages, pinsOpenFor, setPinsOpenFor, typingUsers, catchUp, setCatchUp, nexaThinking, pinnedChats, chatTimers, lockedChats, setLockRequest, setWallpaperPicker, hiddenChats, setHideRequest } = useConversation()
  const { onlineUsers } = useSocket()
  const { call, startCall } = useCall()
  const groupCall = useGroupCall()
  const groupId = selectedConversation?.isGroup ? String(selectedConversation._id) : null
  // Is a group call going on here? (shows the Join button)
  useEffect(() => { if (groupId) groupCall?.queryGroup(groupId) }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [AuthUser] = useAuth()
  const sc = selectedConversation
  const peerOffline = sc && !sc.isGroup && !sc.isSelf && !onlineUsers.map(String).includes(String(sc._id))
  const lastSeen = useLastSeen(peerOffline ? sc._id : null)
  if (!selectedConversation) return null

  const isSelf = !!selectedConversation.isSelf
  // Header pin button: opens the pinned messages list for this chat
  const pinCount = messages.filter((m) => m.pinned).length
  const pinsOpen = pinsOpenFor === String(selectedConversation._id)
  const setPinsOpen = (v) => setPinsOpenFor(v ? String(selectedConversation._id) : null)
  const isGroup = !!selectedConversation.isGroup
  const typing = nexaThinking[String(selectedConversation._id)] ? 'Nexa' : typingUsers[String(selectedConversation._id)]

  // "You, Priya, Arjun and 3 others" under a group's name
  const memberLine = () => {
    const names = (selectedConversation.members || [])
      .map((m) => (String(m._id) === String(AuthUser?._id) ? 'You' : m.fullName?.split(' ')[0]))
      .filter(Boolean)
      .sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : a.localeCompare(b)))
    return names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', ')
  }
  const isOnline = !isSelf && onlineUsers.map(String).includes(String(selectedConversation._id))

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-5 dark:border-slate-800 dark:bg-slate-950">
      <button onClick={onBack} className={`${iconBtn} md:hidden shrink-0`} aria-label="Back to chats">
        <LuArrowLeft className="size-5" />
      </button>

      <button onClick={onToggleInfo} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 rounded-lg py-1 pr-2 text-left">
        {isGroup
          ? <GroupAvatar name={selectedConversation.name} src={selectedConversation.avatar?.url} announcement={selectedConversation.announcement} size="sm" className="shrink-0" />
          : <Avatar name={selectedConversation.fullName} src={selectedConversation.avatar?.url} size="sm" online={isOnline} className="shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {selectedConversation.fullName}
            {!isGroup && <BusinessBadge business={selectedConversation.business} className="ml-1 size-3.5 -translate-y-px" />}
            {chatTimers[String(selectedConversation._id)] > 0 && (
              <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-0.5 align-middle text-[11px] font-medium text-slate-400" title={`Disappearing messages: ${timerLabel(chatTimers[String(selectedConversation._id)])}`}>
                <LuTimer className="size-3" />{timerShort(chatTimers[String(selectedConversation._id)])}
              </span>
            )}
            {isGroup && selectedConversation.community && (
              <span className="ml-1.5 text-xs font-normal text-slate-400">· {selectedConversation.community.name}</span>
            )}
          </p>
          {isGroup ? (
            typing
              ? <p className="truncate text-xs font-medium text-indigo-600 dark:text-indigo-400">{typing === 'Nexa' ? 'Nexa is thinking…' : typeof typing === 'string' ? `${typing.split(' ')[0]} is typing…` : 'typing…'}</p>
              : <p className="truncate text-xs text-slate-500 dark:text-slate-400">{selectedConversation.announcement || selectedConversation.adminsOnly ? `Only admins can send messages · ${selectedConversation.members?.length || 0} members` : memberLine()}</p>
          ) : isSelf ? (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">Message yourself</p>
          ) : typing ? (
            <p className="truncate text-xs font-medium text-indigo-600 dark:text-indigo-400">{typing === 'Nexa' ? 'Nexa is thinking…' : typeof typing === 'string' ? `${typing} is typing…` : 'typing…'}</p>
          ) : isBusiness(selectedConversation) ? (
            // A business, on one line: when they were last around, and whether they're open.
            // Phones: "Active 11:56 AM · ● Closed"; bigger screens add "opens tomorrow 9 AM".
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate"><Presence online={isOnline} lastSeen={lastSeen} /></span>
              {hoursState(selectedConversation.business) && (
                <>
                  <span className="shrink-0 text-slate-300 dark:text-slate-600">·</span>
                  <span className="flex shrink-0 items-center gap-1 sm:hidden">
                    <span className={`size-1.5 rounded-full ${hoursState(selectedConversation.business).open ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span className={hoursState(selectedConversation.business).open ? 'text-emerald-600 dark:text-emerald-400' : ''}>{hoursState(selectedConversation.business).open ? 'Open' : 'Closed'}</span>
                  </span>
                  <OpenStatus business={selectedConversation.business} className="hidden truncate sm:inline" />
                </>
              )}
            </p>
          ) : (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              <Presence online={isOnline} lastSeen={lastSeen} />
            </p>
          )}
        </div>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        {catchUp?.chatId === String(selectedConversation._id) && !catchUp.open && (
          <button
            onClick={() => setCatchUp({ ...catchUp, open: true })}
            className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-violet-50 px-2 sm:px-3 text-xs font-medium text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500/20"
            title="Summarize what you missed"
          >
            <LuScrollText className="size-3.5 shrink-0" /> <span className="hidden sm:inline">Catch me up · </span>{catchUp.count} new
          </button>
        )}
        {pinCount > 0 && (
          <button
            onClick={() => setPinsOpen(!pinsOpen)}
            className={`${iconBtn} relative hidden sm:flex ${pinsOpen ? 'bg-indigo-50 text-indigo-600! dark:bg-indigo-500/15 dark:text-indigo-300!' : ''}`}
            title={pinsOpen ? 'Hide pinned messages' : 'Pinned messages'}
            aria-label={`Pinned messages (${pinCount})`}
            aria-expanded={pinsOpen}
          >
            <LuPin className="size-4.5 -rotate-45" />
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold leading-none text-white">{pinCount}</span>
          </button>
        )}
        {isGroup && !selectedConversation.announcement && (groupCall?.active[groupId] && groupCall.gcall?.groupId !== groupId ? (
          <button
            onClick={() => groupCall.join(groupId)}
            disabled={!!call || !!groupCall.gcall}
            className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            title="Join the group call"
          >
            {groupCall.active[groupId].type === 'video' ? <LuVideo className="size-3.5" /> : <LuPhone className="size-3.5" />}
            Join · {groupCall.active[groupId].participants.length}
          </button>
        ) : (
          <>
            <button onClick={() => groupCall?.start(selectedConversation, 'voice')} disabled={!!call || !!groupCall?.gcall} className={`${iconBtn} disabled:opacity-40`} title="Group voice call" aria-label="Group voice call">
              <LuPhone className="size-4.5" />
            </button>
            <button onClick={() => groupCall?.start(selectedConversation, 'video')} disabled={!!call || !!groupCall?.gcall} className={`${iconBtn} disabled:opacity-40`} title="Group video call (up to 8 people)" aria-label="Group video call">
              <LuVideo className="size-4.5" />
            </button>
          </>
        ))}
        {!isSelf && !isGroup && (
          <>
            <button
              onClick={() => startCall(selectedConversation, 'voice')}
              disabled={!!call}
              className={`${iconBtn} disabled:opacity-40`}
              title="Voice call"
              aria-label="Voice call"
            >
              <LuPhone className="size-4.5" />
            </button>
            <button
              onClick={() => startCall(selectedConversation, 'video')}
              disabled={!!call}
              className={`${iconBtn} disabled:opacity-40`}
              title="Video call"
              aria-label="Video call"
            >
              <LuVideo className="size-4.5" />
            </button>
          </>
        )}
        <ChatMenu
          isGroup={isGroup}
          pinned={pinnedChats.includes(String(selectedConversation._id))}
          searchOpen={searchOpen}
          infoOpen={infoOpen}
          onSearch={onSearch}
          onPin={async () => { const r = await togglePinChat(selectedConversation._id); if (!r.ok) window.alert(r.error) }}
          onInfo={onToggleInfo}
          onClear={onClear}
          onClose={onBack}
          pinCount={pinCount}
          onPins={() => setPinsOpen(!pinsOpen)}
          locked={lockedChats.includes(String(selectedConversation._id))}
          hidden={hiddenChats.includes(String(selectedConversation._id))}
          onHide={selectedConversation.isAi ? null : () => setHideRequest({ ids: [String(selectedConversation._id)], hidden: !hiddenChats.includes(String(selectedConversation._id)) })}
          onWallpaper={() => setWallpaperPicker({ chatId: String(selectedConversation._id), name: selectedConversation.fullName })}
          onLock={selectedConversation.isAi ? null : () => setLockRequest({ action: lockedChats.includes(String(selectedConversation._id)) ? 'unlock' : 'lock', ids: [String(selectedConversation._id)], chats: [selectedConversation] })}
        />
      </div>
    </header>
  )
}

export default ChatUser
