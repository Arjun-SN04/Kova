import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LuArrowLeft, LuEllipsisVertical, LuInfo, LuPhone, LuPin, LuSearch, LuTimer, LuSparkles, LuTrash2, LuVideo } from 'react-icons/lu'
import { timerLabel, timerShort, togglePinChat } from '../../utils/chatExtras'
import { useGroupCall } from '../../context/GroupCallProvider'
import useConversation from '../../Zustand/UserConversation'
import { useSocket } from '../../context/SocketProvider'
import { useCall } from '../../context/CallProvider'
import Avatar, { GroupAvatar } from '../Avatar'
import { useAuth } from '../../context/AuthProvider'

const iconBtn =
  'flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'

// The ⋯ menu: search, pin, info and clear (calls stay in the header)
const ChatMenu = ({ isGroup, pinned, searchOpen, infoOpen, onSearch, onPin, onInfo, onClear }) => {
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
    { label: searchOpen ? 'Close search' : 'Search in chat', icon: LuSearch, run: onSearch },
    { label: pinned ? 'Unpin chat' : 'Pin chat', icon: LuPin, run: onPin },
    { label: infoOpen ? 'Hide info' : isGroup ? 'Group info' : 'Contact info', icon: LuInfo, run: onInfo },
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
            {items.map(({ label, icon: Icon, run, danger }) => (
              <button
                key={label}
                role="menuitem"
                onClick={() => { setOpen(false); run() }}
                className={`${itemCls} ${danger ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
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
const ChatUser = ({ onBack, onToggleInfo, infoOpen, onClear, onSearch, searchOpen }) => {
  const { selectedConversation, typingUsers, catchUp, setCatchUp, nexaThinking, pinnedChats, chatTimers } = useConversation()
  const { onlineUsers } = useSocket()
  const { call, startCall } = useCall()
  const groupCall = useGroupCall()
  const groupId = selectedConversation?.isGroup ? String(selectedConversation._id) : null
  // Is a group call going on here? (shows the Join button)
  useEffect(() => { if (groupId) groupCall?.queryGroup(groupId) }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [AuthUser] = useAuth()
  if (!selectedConversation) return null

  const isSelf = !!selectedConversation.isSelf
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
      <button onClick={onBack} className={`${iconBtn} md:hidden`} aria-label="Back to chats">
        <LuArrowLeft className="size-5" />
      </button>

      <button onClick={onToggleInfo} className="flex min-w-0 items-center gap-3 rounded-lg py-1 pr-2 text-left">
        {isGroup
          ? <GroupAvatar name={selectedConversation.name} src={selectedConversation.avatar?.url} announcement={selectedConversation.announcement} size="sm" />
          : <Avatar name={selectedConversation.fullName} src={selectedConversation.avatar?.url} size="sm" online={isOnline} />}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">
            {selectedConversation.fullName}
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
              ? <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{typing === 'Nexa' ? 'Nexa is thinking…' : typeof typing === 'string' ? `${typing.split(' ')[0]} is typing…` : 'typing…'}</p>
              : <p className="truncate text-xs text-slate-500 dark:text-slate-400">{selectedConversation.announcement ? 'Only admins can post' : memberLine()}</p>
          ) : isSelf ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Message yourself</p>
          ) : typing ? (
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{typing === 'Nexa' ? 'Nexa is thinking…' : typeof typing === 'string' ? `${typing} is typing…` : 'typing…'}</p>
          ) : (
            <p className={`text-xs ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </p>
          )}
        </div>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {catchUp?.chatId === String(selectedConversation._id) && !catchUp.open && (
          <button
            onClick={() => setCatchUp({ ...catchUp, open: true })}
            className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-violet-50 px-3 text-xs font-medium text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500/20"
            title="Summarize what you missed"
          >
            <LuSparkles className="size-3.5" /> Catch me up · {catchUp.count} new
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
        />
      </div>
    </header>
  )
}

export default ChatUser
