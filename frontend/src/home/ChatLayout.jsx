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
import RestoredBanner from './RestoredBanner'
import { loadStatusFeed } from '../utils/status'
import useBusinessSocket from '../business/useBusinessSocket'
import LockDialogHost from './leftpart/LockDialogHost'
import WallpaperPickerHost from './WallpaperPickerHost'
import MiniPlayer from './MiniPlayer'
import useSidebar from '../Zustand/useSidebar'
import { NavRail } from './leftpart/NavRail'
import { resumeLiveShares } from '../utils/liveLocation'
import { channelsApi, loadChannels } from '../utils/channels'
import { HideChatsHost } from './leftpart/HiddenChats'

// Minimum sidebar width on desktop (64px rail + 296px chats list = 360px)
export const getMinSidebarWidth = (windowWidth) => {
  if (windowWidth < 768) return windowWidth
  return Math.min(360, Math.max(300, Math.round(windowWidth - 360)))
}

// Maximum sidebar width: allows up to 640px while leaving at least 380px for the chat
export const getMaxSidebarWidth = (windowWidth) => {
  if (windowWidth < 768) return windowWidth
  return Math.max(360, Math.min(640, Math.round(windowWidth - 380)))
}

// Optimal responsive sidebar width tailored for each device category with generous default spacing
export const getResponsiveSidebarWidth = (windowWidth) => {
  if (windowWidth < 768) return windowWidth // Mobile: 100% full width
  if (windowWidth < 900) {
    // Small tablets / narrow desktop windows (768px - 899px, e.g. iPad portrait):
    // ~44% of window, comfortably between 360px and 400px (leaving >= 400px for chat)
    return Math.round(Math.min(400, Math.max(360, windowWidth * 0.44)))
  }
  if (windowWidth < 1200) {
    // Tablets landscape & compact laptops (900px - 1199px, e.g. iPad Air/Pro 1024px):
    // ~38% of window, comfortably between 420px and 460px
    return Math.round(Math.min(460, Math.max(420, windowWidth * 0.38)))
  }
  if (windowWidth < 1536) {
    // Standard laptops & desktops (1200px - 1535px, e.g. MacBook, 1080p laptop):
    // ~33% of window, comfortably between 460px and 500px
    return Math.round(Math.min(500, Math.max(460, windowWidth * 0.33)))
  }
  // Large monitors & ultrawide (1536px+):
  // Spacious, modern width between 500px and 560px
  return Math.round(Math.min(560, Math.max(500, windowWidth * 0.28)))
}

const WIDTH_KEY = 'chatSidebarWidth_v3'
const CUSTOM_FLAG_KEY = 'chatSidebarCustom_v3'

const readSavedWidth = (ww = typeof window !== 'undefined' ? window.innerWidth : 1280) => {
  if (ww < 768) return ww
  try {
    // Clear legacy keys so older cramped widths don't override the new increased default
    if (localStorage.getItem('chatSidebarWidth_v2') || localStorage.getItem('chatSidebarCustom_v2')) {
      localStorage.removeItem('chatSidebarWidth_v2')
      localStorage.removeItem('chatSidebarCustom_v2')
      localStorage.removeItem('chatSidebarWidth')
    }
    const isCustom = localStorage.getItem(CUSTOM_FLAG_KEY) === 'true'
    if (!isCustom) return getResponsiveSidebarWidth(ww)
    const saved = parseInt(localStorage.getItem(WIDTH_KEY), 10)
    const minW = getMinSidebarWidth(ww)
    const maxW = getMaxSidebarWidth(ww)
    if (!isNaN(saved) && saved >= minW && saved <= maxW) {
      return saved
    }
    return getResponsiveSidebarWidth(ww)
  } catch {
    return getResponsiveSidebarWidth(ww)
  }
}

const ChatLayout = () => {
  useThemeClass()
  const { selectedConversation, unreadCounts, clearUnread, lockedChats, hiddenChats } = useConversation()

  // Listen for socket events for the whole chat screen, so unread badges
  // update even when no conversation is open.
  useListenMessages()
  // Business: customer labels, waiting alerts, settings
  useBusinessSocket()

  // Sidebar previews + unread counts from the server
  useEffect(() => {
    loadConversations(); loadCommunities(); loadCalls()
    resumeLiveShares() // live locations I was sharing before a refresh
    loadChannels()
    // Opened from a channel link (/?channel=handle)
    const handle = new URLSearchParams(window.location.search).get('channel')
    if (handle) {
      window.history.replaceState(null, '', window.location.pathname)
      channelsApi.discover(handle).then((res) => {
        const ch = res.data.find((c) => c.handle === handle.toLowerCase())
        if (ch) { const s = useConversation.getState(); s.setActivePanel('channels'); s.setSelectedConversation(ch) }
      }).catch(() => {})
    }
    axios.get('/api/ai/bot', { withCredentials: true }).then((res) => useConversation.getState().setNexaId(res.data.botId)).catch(() => {})
    // Contacts' 24-hour status updates
    loadStatusFeed()
    // Pinned chats + starred messages
    axios.get('/api/message/prefs', { withCredentials: true })
      .then((res) => { const s = useConversation.getState(); s.setPinnedChats(res.data.pinnedChats); s.setStarredIds(res.data.starred); s.setLockedPrefs(res.data); s.setHiddenPrefs(res.data); if (res.data.wallpapers) s.setWallpapers(res.data.wallpapers) })
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

  const totalUnread = Object.entries(unreadCounts).filter(([id]) => !lockedChats.includes(id) && !hiddenChats.includes(id)).reduce((sum, [, n]) => sum + n, 0)
  const title = selectedConversation?.fullName || 'Chats'
  usePageTitle(totalUnread ? `(${totalUnread}) ${title}` : title)

  // Resizable sidebar (desktop only)
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? readSavedWidth(window.innerWidth) : 460))
  const drag = useRef(null)

  // Keep sidebar width responsive to device / viewport changes
  useEffect(() => {
    const onResize = () => {
      const ww = window.innerWidth
      if (ww < 768) return
      const isCustom = localStorage.getItem(CUSTOM_FLAG_KEY) === 'true'
      if (!isCustom) {
        setWidth(getResponsiveSidebarWidth(ww))
      } else {
        const minW = getMinSidebarWidth(ww)
        const maxW = getMaxSidebarWidth(ww)
        setWidth((cur) => Math.min(maxW, Math.max(minW, cur)))
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Collapsed side panel (computers): a slim strip with an expand button; Ctrl/Cmd+B toggles
  const collapsed = useSidebar((s) => s.collapsed)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && window.innerWidth >= 768) {
        e.preventDefault()
        useSidebar.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, w: width }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const ww = window.innerWidth
    const minW = getMinSidebarWidth(ww)
    const maxW = getMaxSidebarWidth(ww)
    const nextW = Math.min(maxW, Math.max(minW, drag.current.w + e.clientX - drag.current.x))
    setWidth(nextW)
    try {
      localStorage.setItem(WIDTH_KEY, String(nextW))
      localStorage.setItem(CUSTOM_FLAG_KEY, 'true')
    } catch { /* ignore */ }
  }
  const onPointerUp = () => {
    drag.current = null
    document.body.style.userSelect = ''
  }

  const resetWidth = () => {
    const nextW = getResponsiveSidebarWidth(window.innerWidth)
    setWidth(nextW)
    try {
      localStorage.removeItem(WIDTH_KEY)
      localStorage.removeItem(CUSTOM_FLAG_KEY)
    } catch { /* ignore */ }
  }

  return (
    <div>
      <ReminderToasts />
      <RestoredBanner />
      <LockDialogHost />
      <HideChatsHost />
      <WallpaperPickerHost />
      <div className="flex h-dvh flex-col overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <MiniPlayer />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chat list hidden (Ctrl/Cmd+B): the section rail stays, with all its icons */}
        {collapsed && <div className="hidden md:flex"><NavRail /></div>}
        <aside
          className={`${selectedConversation ? 'hidden' : 'flex'} ${collapsed ? 'md:hidden' : 'md:flex'} w-full shrink-0 md:w-[var(--sidebar-w)]`}
          style={{ '--sidebar-w': `${width}px` }}
        >
          <Left />
        </aside>

        {/* Resize handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={resetWidth}
          title="Drag to resize · double-click to reset to device default"
          className={`group relative hidden w-px shrink-0 cursor-col-resize bg-slate-200 dark:bg-slate-800 ${collapsed ? '' : 'md:block'}`}
        >
          <div className="absolute inset-y-0 -left-2 -right-2 z-10" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>

        <main className={`${selectedConversation ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
          <Right />
        </main>
      </div>
      </div>
    </div>
  )
}

export default ChatLayout
