import React, { Suspense, lazy, useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { LuArrowLeft, LuLock, LuUpload } from 'react-icons/lu'
import ChatUser from './ChatUser'
import Messages from './Messages'
import TypeSent from './TypeSent'
import ContactInfo from './ContactInfo'
import ClearChatDialog from './ClearChatDialog'
import SelectionBar from './SelectionBar'
import ForwardDialog from './ForwardDialog'
import GroupInfo from '../groups/GroupInfo'
import CommunityPage from '../groups/CommunityPage'
import ChannelPage from '../channels/ChannelPage'
// Nexa's chat (and its Markdown / document tools) is downloaded when first opened
const AiChat = lazy(() => import('../ai/AiChat'))
import ScheduledBar from './ScheduledBar'
import SmartReplies from './SmartReplies'
import CatchUp from './CatchUp'
import ChatSearch from './ChatSearch'
import PinnedBar from './PinnedBar'
import { loadChatTimer } from '../../utils/chatExtras'
import Avatar from '../Avatar'
import Loading from '../../components/Loading'
import { LogoMark } from '../../components/ui'
import useConversation from '../../Zustand/UserConversation'
import { useSocket } from '../../context/SocketProvider'
import { useAuth } from '../../context/AuthProvider'
import useWallpaper from '../../hooks/useWallpaper'

// Shown when no conversation is open.
const Welcome = () => {
  const [AuthUser] = useAuth()
  const { contacts, setSelectedConversation } = useConversation()
  const { onlineUsers } = useSocket()
  const onlineSet = new Set(onlineUsers.map(String))
  const online = contacts.filter((u) => onlineSet.has(String(u._id))).slice(0, 6)
  const firstName = AuthUser?.fullName?.split(' ')[0]
  // Accounts made in the last day get a first-visit greeting, not "welcome back"
  const [isNew] = useState(() => !!AuthUser?.createdAt && Date.now() - new Date(AuthUser.createdAt).getTime() < 86_400_000)
  const wallpaper = useWallpaper(null)

  return (
    <div className="chat-bg flex flex-1 flex-col items-center justify-center p-8 text-center" style={wallpaper || undefined}>
      <LogoMark className="size-14" />
      <h2 className="mt-6 text-2xl font-semibold tracking-tight">{isNew ? 'Welcome to Kova' : 'Welcome back'}{firstName ? `, ${firstName}` : ''}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {isNew ? 'Add a friend by username or QR code, or say hi to Nexa, your AI assistant.' : 'Pick a conversation from the list to start chatting.'}
      </p>

      {online.length > 0 && (
        <div className="mt-10 w-full max-w-md">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Online now</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {online.map((u) => (
              <button
                key={u._id}
                onClick={() => setSelectedConversation(u)}
                className="flex w-20 flex-col items-center gap-2 rounded-xl p-2 transition hover:bg-white dark:hover:bg-slate-800"
              >
                <Avatar name={u.fullName} src={u.avatar?.url} online />
                <span className="w-full truncate text-xs font-medium text-slate-700 dark:text-slate-300">{u.fullName.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-12 text-xs text-slate-400">
        Tip: press <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] dark:border-slate-700 dark:bg-slate-800">/</kbd> to search people
      </p>
    </div>
  )
}

// Shown instead of a locked chat until the secret code is entered (asks right away)
const LockedChat = ({ chat, onBack, onUnlock }) => {
  useEffect(() => { onUnlock() }, [chat._id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="chat-bg flex flex-1 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-5 dark:border-slate-800 dark:bg-slate-950">
        <button onClick={onBack} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label="Back to chats"><LuArrowLeft className="size-5" /></button>
        <p className="truncate text-[15px] font-semibold">{chat.isGroup ? chat.name : chat.fullName}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"><LuLock className="size-6" /></span>
        <p className="mt-4 text-base font-semibold">This chat is locked</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter your secret code to read and send messages.</p>
        <button onClick={onUnlock} className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500"><LuLock className="size-4" /> Enter code</button>
      </div>
    </div>
  )
}

const Right = () => {
  const [AuthUser] = useAuth()
  const { selectedConversation, setSelectedConversation, selectionMode, lockedChats, unlockedUntil, chatOpenedAt, setLockRequest } = useConversation()
  const [infoOpen, setInfoOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [searchFor, setSearchFor] = useState(null) // chat id the search bar is open for
  // This chat's disappearing-messages timer
  useEffect(() => { loadChatTimer(selectedConversation) }, [selectedConversation?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [dragging, setDragging] = useState(false)

  if (!selectedConversation) return <Welcome />
  if (selectedConversation.isAi) return <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loading /></div>}><AiChat /></Suspense>
  if (selectedConversation.isChannel) return <ChannelPage key={selectedConversation._id} channel={selectedConversation} />
  // Locked chat: nothing loads until the code is entered
  // (unlocked if the code was entered within the last 5 minutes, or while this chat is open)
  if (lockedChats.includes(String(selectedConversation._id)) && unlockedUntil < chatOpenedAt) {
    return <LockedChat chat={selectedConversation} onBack={() => setSelectedConversation(null)} onUnlock={() => setLockRequest({ action: 'open', ids: [String(selectedConversation._id)], chats: [selectedConversation] })} />
  }
  if (selectedConversation.isCommunity) return <CommunityPage key={selectedConversation._id} community={selectedConversation} />

  const dropHandlers = {
    onDragOver: (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) },
    onDrop: (e) => {
      e.preventDefault()
      setDragging(false)
      const files = [...(e.dataTransfer.files || [])]
      if (files.length) window.dispatchEvent(new CustomEvent('nexchat:attach', { detail: files }))
    },
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col" {...dropHandlers}>
        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-400 bg-white/85 text-indigo-600 backdrop-blur-sm dark:bg-slate-950/85 dark:text-indigo-400">
            <LuUpload className="size-8" />
            <p className="mt-3 text-sm font-semibold">Drop to attach</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Photos, videos and documents up to 10 MB</p>
          </div>
        )}
        <ChatUser
          onBack={() => setSelectedConversation(null)}
          onToggleInfo={() => setInfoOpen((v) => !v)}
          infoOpen={infoOpen}
          onClear={() => setConfirmClear(true)}
          onSearch={() => setSearchFor((id) => (id === selectedConversation._id ? null : selectedConversation._id))}
          searchOpen={searchFor === selectedConversation._id}
        />
        {searchFor === selectedConversation._id && <ChatSearch onClose={() => setSearchFor(null)} />}
        <PinnedBar key={`pin-${selectedConversation._id}`} canUnpin={!selectedConversation.announcement || selectedConversation.admins?.some((a) => String(a._id ?? a) === String(AuthUser?._id))} />
        <CatchUp key={`cu-${selectedConversation._id}`} />
        <Messages />
        <ScheduledBar key={selectedConversation._id} />
        {!selectionMode && <SmartReplies key={`sr-${selectedConversation._id}`} />}
        {selectionMode ? <SelectionBar /> : <TypeSent />}
      </div>

      <AnimatePresence>
        {infoOpen && selectedConversation.isGroup && (
          <GroupInfo key={selectedConversation._id} group={selectedConversation} onClose={() => setInfoOpen(false)} />
        )}
        {infoOpen && !selectedConversation.isGroup && (
          <ContactInfo
            user={selectedConversation}
            onClose={() => setInfoOpen(false)}
            onClear={() => setConfirmClear(true)}
            onSearch={() => setSearchFor(selectedConversation._id)}
          />
        )}
      </AnimatePresence>

      <ClearChatDialog open={confirmClear} onClose={() => setConfirmClear(false)} />
      <ForwardDialog />
    </div>
  )
}

export default Right
