import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import Left from './leftpart/Left'
import Right from './rightPart/Right'
import useConversation from '../Zustand/UserConversation'
import useThemeClass from '../hooks/useThemeClass'
import useListenMessages from '../context/useListenMessages'
import usePageTitle from '../hooks/usePageTitle'
import { loadConversations, markSeen } from '../utils/conversations'
import { loadCommunities } from '../utils/groups'
import { loadCalls } from '../utils/calls'
import { AI_CHAT } from '../utils/ai'
import { readGoogleResult } from '../utils/google'
import ReminderToasts from './ReminderToasts'
import { loadStatusFeed } from '../utils/status'

// Includes the 64px section rail
const MIN_WIDTH = 360
// Never wider than 640px or more than about half the window, so the chat keeps room
const maxWidth = () => Math.min(640, Math.round(window.innerWidth * 0.55))
// About a third of the window, between 400 and 500px
const defaultWidth = () => Math.round(Math.min(500, Math.max(400, window.innerWidth * 0.33)))
// New key, so everyone starts from the new, wider default
const WIDTH_KEY = 'chatSidebarWidth'

const readSavedWidth = () => {
  try {
    const saved = parseInt(localStorage.getItem(WIDTH_KEY), 10)
    return saved >= MIN_WIDTH && saved <= maxWidth() ? saved : defaultWidth()
  } catch {
    return defaultWidth()
  }
}

const ChatLayout = () => {
  useThemeClass()
  const { selectedConversation, unreadCounts, clearUnread } = useConversation()

  // Listen for socket events for the whole chat screen, so unread badges
  // update even when no conversation is open.
  useListenMessages()

  // Sidebar previews + unread counts from the server
  useEffect(() => {
    loadConversations(); loadCommunities(); loadCalls()
    axios.get('/api/ai/bot', { withCredentials: true }).then((res) => useConversation.getState().setNexaId(res.data.botId)).catch(() => {})
    // Contacts' 24-hour status updates
    loadStatusFeed()
    // Pinned chats + starred messages
    axios.get('/api/message/prefs', { withCredentials: true })
      .then((res) => { useConversation.getState().setPinnedChats(res.data.pinnedChats); useConversation.getState().setStarredIds(res.data.starred) })
      .catch(() => {})
    // Back from connecting Google: open Nexa (it shows the result)
    if (readGoogleResult()) useConversation.getState().setSelectedConversation(AI_CHAT)
  }, [])

  // Opening a chat marks it as read (and again when you come back to the tab)
  const openId = selectedConversation?._id
  const openIsGroup = !!selectedConversation?.isGroup
  useEffect(() => {
    if (selectedConversation?.isAi) { clearUnread(AI_CHAT._id); return }
    if (!openId || selectedConversation?.isCommunity) return
    clearUnread(openId)
    markSeen(openId, openIsGroup)
    const onVisible = () => document.visibilityState === 'visible' && markSeen(openId, openIsGroup)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, openIsGroup, clearUnread])

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0)
  const title = selectedConversation?.fullName || 'Chats'
  usePageTitle(totalUnread ? `(${totalUnread}) ${title}` : title)

  // Resizable sidebar (desktop only)
  const [width, setWidth] = useState(readSavedWidth)
  const drag = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, String(width)) } catch { /* ignore */ }
  }, [width])

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, w: width }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setWidth(Math.min(maxWidth(), Math.max(MIN_WIDTH, drag.current.w + e.clientX - drag.current.x)))
  }
  const onPointerUp = () => {
    drag.current = null
    document.body.style.userSelect = ''
  }

  return (
    <div>
      <ReminderToasts />
      <div className="flex h-dvh overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <aside
          className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full shrink-0 md:w-(--sidebar-w)`}
          style={{ '--sidebar-w': `${width}px` }}
        >
          <Left />
        </aside>

        {/* Resize handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => setWidth(defaultWidth())}
          title="Drag to resize · double-click to reset"
          className="group relative hidden w-px shrink-0 cursor-col-resize bg-slate-200 md:block dark:bg-slate-800"
        >
          <div className="absolute inset-y-0 -left-2 -right-2 z-10" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <main className={`${selectedConversation ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
          <Right />
        </main>
      </div>
    </div>
  )
}

export default ChatLayout
