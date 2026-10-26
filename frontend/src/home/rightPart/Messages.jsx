import React, { useEffect, useMemo, useRef, useState } from 'react'
import Message from './Message'
import CallMessage from './CallMessage'
import Avatar, { AiAvatar, GroupAvatar } from '../Avatar'
import useGetMessages from '../../context/useGetMessages.js'
import useSendMessage from '../../context/useSendMessage'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { AnimatePresence, motion } from 'motion/react'
import { jumpToMessage } from '../../utils/messages'
import { LuArrowDown, LuBookmark, LuFileText, LuImage, LuLink } from 'react-icons/lu'

const GROUP_GAP_MS = 5 * 60 * 1000 // messages within 5 minutes are grouped

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// "Today", "Yesterday" or e.g. "12 Mar 2026"
const dateLabel = (dateStr) => {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
}

const sameGroup = (a, b) =>
  a && b &&
  String(a.senderId) === String(b.senderId) &&
  isSameDay(new Date(a.createdAt), new Date(b.createdAt)) &&
  Math.abs(new Date(b.createdAt) - new Date(a.createdAt)) < GROUP_GAP_MS

const DateDivider = ({ label }) => (
  <div className="my-6 flex justify-center">
    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/60">
      {label}
    </span>
  </div>
)

const LoadingSkeleton = () => (
  <div className="space-y-3 py-6">
    {[['w-48', false], ['w-64', true], ['w-40', false], ['w-56', true], ['w-32', true]].map(([w, me], i) => (
      <div key={i} className={`flex ${me ? 'justify-end' : 'justify-start pl-9'}`}>
        <div className={`h-9 ${w} animate-pulse rounded-2xl ${me ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'bg-slate-200/70 dark:bg-slate-800'}`} />
      </div>
    ))}
  </div>
)

const QUICK_REPLIES = ['Hey!', 'How are you?', "What's up?"]

const SELF_IDEAS = [
  { icon: LuBookmark, text: 'Notes and reminders' },
  { icon: LuLink, text: 'Links to read later' },
  { icon: LuImage, text: 'Photos and videos' },
  { icon: LuFileText, text: 'Files and documents' },
]

// Empty "message yourself" chat: explain what it's for instead of a greeting.
const EmptySelfChat = ({ user }) => (
  <div className="flex h-full flex-col items-center justify-center py-12 text-center">
    <div className="relative">
      <Avatar name={user.fullName} src={user.avatar?.url} size="lg" />
      <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-indigo-600 text-white ring-4 ring-slate-50 dark:ring-slate-900">
        <LuBookmark className="size-3.5" />
      </span>
    </div>
    <p className="mt-4 text-lg font-semibold">Message yourself</p>
    <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
      Your private space. Only you can see what you send here.
    </p>
    <div className="mt-6 grid grid-cols-2 gap-2">
      {SELF_IDEAS.map(({ icon: Icon, text }) => (
        <div
          key={text}
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-[13px] font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700"
        >
          <Icon className="size-4 shrink-0 text-indigo-500" />
          {text}
        </div>
      ))}
    </div>
  </div>
)

const EmptyGroup = ({ group }) => (
  <div className="flex h-full flex-col items-center justify-center py-12 text-center">
    <GroupAvatar name={group.name} src={group.avatar?.url} announcement={group.announcement} size="lg" />
    <p className="mt-4 text-lg font-semibold">{group.name}</p>
    <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
      {group.announcement
        ? 'Announcements from the community admins will appear here.'
        : `${group.members?.length || 0} members. Say hi to get the conversation going.`}
    </p>
    {!group.announcement && (
      <p className="mt-3 text-xs text-slate-400">Tip: type <span className="font-medium text-violet-500">@Nexa</span> to ask the AI here, for everyone.</p>
    )}
  </div>
)

const EmptyConversation = ({ user }) => {
  const { sendMessage, loading } = useSendMessage()
  if (user.isSelf) return <EmptySelfChat user={user} />
  if (user.isGroup) return <EmptyGroup group={user} />
  const firstName = user.fullName.split(' ')[0]
  return (
    <div className="flex h-full flex-col items-center justify-center py-12 text-center">
      <Avatar name={user.fullName} src={user.avatar?.url} size="lg" />
      <p className="mt-4 text-lg font-semibold">Say hello to {firstName}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This is the start of your conversation.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {QUICK_REPLIES.map((text) => (
          <button
            key={text}
            disabled={loading}
            onClick={() => sendMessage(text)}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs ring-1 ring-slate-200 transition hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

const NexaThinking = () => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 8 }}
    transition={{ duration: 0.18 }}
    className="mb-4 flex items-end gap-2"
    role="status"
    aria-live="polite"
  >
    <span className="relative">
      <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/40" />
      <AiAvatar size="xs" />
    </span>
    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] text-slate-600 shadow-xs ring-1 ring-violet-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-violet-500/30">
      <span className="font-medium text-violet-600 dark:text-violet-300">Nexa is thinking</span>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
    </div>
  </motion.div>
)

const TypingBubble = ({ name, src }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 8 }}
    transition={{ duration: 0.18 }}
    className="mb-4 flex items-end gap-2"
  >
    {name === 'Nexa' ? <AiAvatar size="xs" /> : <Avatar name={name} src={src} size="xs" />}
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700/60">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  </motion.div>
)

const NEAR_BOTTOM_PX = 150

const Messages = () => {
  const { loading, messages } = useGetMessages()
  const { selectedConversation, typingUsers, groupPeople, nexaId, pendingJump, setPendingJump, setHighlightedId, nexaThinking } = useConversation()
  const [AuthUser] = useAuth()
  const scrollRef = useRef(null)
  const lastConversation = useRef(null)
  const lastCount = useRef(0)
  const [atBottom, setAtBottom] = useState(true)
  const [newCount, setNewCount] = useState(0)

  const myId = String(AuthUser?._id)
  const typingValue = typingUsers[String(selectedConversation?._id)]
  const isTyping = !!typingValue
  // Nexa is answering an @Nexa here: I just asked, or the server says Nexa is typing
  const nexaBusy = !!nexaThinking[String(selectedConversation?._id)] || typingValue === 'Nexa'
  const isGroup = !!selectedConversation?.isGroup

  // In groups, look people up by id (current members, then anyone who sent a message)
  const people = useMemo(() => {
    if (!isGroup) return {}
    const map = { ...groupPeople }
    for (const m of selectedConversation.members || []) if (m?._id) map[String(m._id)] = m
    return map
  }, [isGroup, groupPeople, selectedConversation?.members])
  const personOf = (id) => (nexaId && String(id) === String(nexaId) ? { fullName: 'Nexa', isBot: true } : people[String(id)] || { fullName: 'Former member' })
  const nameOf = (id) => personOf(id).fullName.split(' ')[0]

  const scrollToBottom = (behavior = 'smooth') => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
    setNewCount(0)
  }

  const onScroll = () => {
    const el = scrollRef.current
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    setAtBottom(near)
    if (near) setNewCount(0)
  }

  // Jump to the bottom when opening a chat. For new messages, only follow them
  // if you're already near the bottom (or you sent it); otherwise count them.
  useEffect(() => {
    const switched = lastConversation.current !== selectedConversation?._id
    const added = messages.length - lastCount.current
    lastConversation.current = selectedConversation?._id
    lastCount.current = messages.length

    if (switched) { scrollToBottom('auto'); setAtBottom(true); return }
    if (added <= 0) return
    const last = messages[messages.length - 1]
    if (atBottom || String(last?.senderId) === myId) scrollToBottom()
    else setNewCount((n) => n + added)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedConversation?._id])

  // Keep the typing bubble in view
  useEffect(() => {
    if ((isTyping || nexaBusy) && atBottom) scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, nexaBusy])

  // Coming from a reminder's "Go to message": scroll to it once it's loaded
  useEffect(() => {
    if (!pendingJump || loading || !messages.some((m) => String(m._id) === String(pendingJump))) return
    const id = pendingJump
    setPendingJump(null)
    setTimeout(() => jumpToMessage(id, setHighlightedId), 150)
  }, [pendingJump, loading, messages, setPendingJump, setHighlightedId])

  const byId = useMemo(() => new Map(messages.map((m) => [String(m._id), m])), [messages])

  // Re-check every 15s so the Edit button disappears once the 10-minute window ends
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  const items = []
  messages.forEach((m, i) => {
    const prev = messages[i - 1]
    const next = messages[i + 1]
    const label = dateLabel(m.createdAt)
    if (!prev || dateLabel(prev.createdAt) !== label) items.push(<DateDivider key={`d-${m._id}`} label={label} />)
    const itsMe = String(m.senderId) === myId
    if (m.call) {
      items.push(<CallMessage key={m._id} message={m} itsMe={itsMe} />)
      return
    }
    const first = !sameGroup(prev, m)
    const fromNexa = nexaId && String(m.senderId) === String(nexaId)
    const sender = isGroup || fromNexa ? personOf(m.senderId) : selectedConversation
    items.push(
      <Message
        key={m._id}
        message={m}
        itsMe={itsMe}
        first={first}
        last={!sameGroup(m, next)}
        contactName={sender?.fullName}
        contactAvatar={sender?.avatar?.url}
        senderLabel={(isGroup || fromNexa) && !itsMe && first ? sender.fullName : null}
        isBot={!!sender?.isBot}
        nameOf={isGroup ? nameOf : (id) => (nexaId && String(id) === String(nexaId) ? 'Nexa' : selectedConversation?.fullName?.split(' ')[0])}
        myId={myId}
        original={m.replyTo ? byId.get(String(m.replyTo)) ?? null : undefined}
        now={now}
      />,
    )
  })

  return (
    <div className="chat-bg relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="h-full px-4 sm:px-6 lg:px-8">
          {loading ? (
            <LoadingSkeleton />
          ) : messages.length > 0 ? (
            <div className="pb-2 pt-2">
              {items}
              <AnimatePresence>
                {nexaBusy
                  ? <NexaThinking key="nexa" />
                  : isTyping && <TypingBubble key="typing" name={typeof typingValue === 'string' ? typingValue : selectedConversation?.fullName} src={typeof typingValue === 'string' ? null : selectedConversation?.avatar?.url} />}
              </AnimatePresence>
            </div>
          ) : (
            selectedConversation && <EmptyConversation user={selectedConversation} />
          )}
        </div>
      </div>

      {/* Jump to latest */}
      <AnimatePresence>
        {!atBottom && messages.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={() => scrollToBottom()}
            aria-label="Jump to latest message"
            className="absolute bottom-4 right-4 flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg ring-1 ring-slate-200 transition hover:text-slate-900 sm:right-6 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
          >
            <LuArrowDown className="size-4.5" />
            {newCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">
                {newCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Messages
