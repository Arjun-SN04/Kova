import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuBriefcase, LuLayers, LuRadioTower, LuMessageSquareText, LuMoon, LuPhone, LuSettings, LuSun, LuUser, LuStar, LuCircleDashed, LuEllipsis, LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu'
import useSidebar from '../../Zustand/useSidebar'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { useTheme } from '../../context/ThemeProvider'
import Avatar from '../Avatar'
import Logout from './Logout'
import { LogoMark } from '../../components/ui'
import useBusiness from '../../business/store'

// Unread chats, missed calls since I last opened Calls, unread community messages
export const useNavBadges = () => {
  const [AuthUser] = useAuth()
  const { unreadCounts, calls, callsSeenAt, groups, statusFeed, lockedChats, hiddenChats, channels } = useConversation()
  const communityGroups = new Set(groups.filter((g) => g.community).map((g) => String(g._id)))
  const total = (filter) => Object.entries(unreadCounts).filter(([id]) => filter(id)).reduce((n, [, c]) => n + c, 0)
  return {
    // Locked chats don't count, so the badge doesn't give them away
    chats: total((id) => !lockedChats.includes(id) && !hiddenChats.includes(id)),
    calls: calls.filter((c) =>
      String(c.callee?._id) === String(AuthUser?._id) && c.status === 'missed' && new Date(c.startedAt).getTime() > callsSeenAt).length,
    communities: total((id) => communityGroups.has(id)),
    channels: channels.filter((c) => c.following || c.amAdmin).reduce((n, c) => n + (c.unread || 0), 0),
    // Contacts with status updates I haven't seen
    status: statusFeed.people.filter((p) => !p.allSeen).length,
  }
}

export const NAV_ITEMS = [
  { id: 'chats', label: 'Chats', Icon: LuMessageSquareText },
  { id: 'status', label: 'Status', Icon: LuCircleDashed },
  { id: 'calls', label: 'Calls', Icon: LuPhone },
  { id: 'communities', label: 'Communities', Icon: LuLayers },
  { id: 'channels', label: 'Channels', Icon: LuRadioTower },
  { id: 'starred', label: 'Starred', Icon: LuStar },
]

export const PRIMARY_MOBILE_ITEMS = [
  { id: 'chats', label: 'Chats', Icon: LuMessageSquareText },
  { id: 'status', label: 'Status', Icon: LuCircleDashed },
  { id: 'calls', label: 'Calls', Icon: LuPhone },
]

export const MORE_MOBILE_ITEMS = [
  { id: 'communities', label: 'Communities', Icon: LuLayers },
  { id: 'channels', label: 'Channels', Icon: LuRadioTower },
  { id: 'starred', label: 'Starred', Icon: LuStar },
]

const Badge = ({ count, className = '' }) =>
  count > 0 && (
    <span className={`absolute flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white ring-2 ring-slate-50 dark:ring-slate-950 ${className}`}>
      {count > 99 ? '99+' : count}
    </span>
  )

const railBtn = 'relative flex size-11 items-center justify-center rounded-xl transition'

// Opens the business workspace. The badge counts customers waiting too long for a reply.
export const BusinessLink = ({ className = '', iconClass = 'size-5' }) => {
  const waiting = useBusiness((st) => st.alerts.length)
  const works = useBusiness((st) => !!st.me?.business?.enabled || st.me?.workFor?.length > 0)
  return (
    <Link to="/business" className={`relative ${className}`} title={works ? 'Business' : 'Set up a business account'} aria-label="Business">
      <LuBriefcase className={iconClass} />
      <Badge count={waiting} className="-right-1 -top-1 bg-amber-500!" />
    </Link>
  )
}

// Narrow bar on the far left (desktop): sections at the top, me at the bottom
export const NavRail = () => {
  const [AuthUser] = useAuth()
  const { dark, toggle } = useTheme()
  const { activePanel, setActivePanel } = useConversation()
  const collapsed = useSidebar((s) => s.collapsed)
  const badges = useNavBadges()

  return (
    <nav aria-label="Sections" className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50 py-4 md:flex dark:border-slate-800 dark:bg-slate-950">
      <Link to="/home" className="group mb-3" title="Kova home"><LogoMark className="size-9" /></Link>
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const on = activePanel === id
        return (
          <button
            key={id}
            onClick={() => {
              setActivePanel(id)
              // Collapsed: clicking a section brings the list back (until collapsed again)
              if (collapsed) useSidebar.getState().setCollapsed(false)
            }}
            title={label}
            aria-label={label}
            aria-current={on ? 'page' : undefined}
            className={`${railBtn} ${on ? 'bg-white text-indigo-600 shadow-xs ring-1 ring-slate-200 dark:bg-slate-800 dark:text-indigo-400 dark:ring-slate-700' : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'}`}
          >
            <Icon className="size-5" />
            <Badge count={badges[id]} className="-right-1 -top-1" />
          </button>
        )
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <button onClick={() => useSidebar.getState().toggle()} className={`${railBtn} text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white`} title={collapsed ? 'Show the chat list (Ctrl+B)' : 'Hide the chat list (Ctrl+B)'} aria-label={collapsed ? 'Show the chat list' : 'Hide the chat list'} aria-expanded={!collapsed}>
          {collapsed ? <LuPanelLeftOpen className="size-5" /> : <LuPanelLeftClose className="size-5" />}
        </button>
        <BusinessLink className={`${railBtn} text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white`} />
        <button onClick={toggle} className={`${railBtn} text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white`} title={dark ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
          {dark ? <LuSun className="size-5" /> : <LuMoon className="size-5" />}
        </button>
        <Link to="/profile" className={`${railBtn} text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white`} title="Settings" aria-label="Settings">
          <LuSettings className="size-5" />
        </Link>
        <Logout className="size-11! rounded-xl!" />
        <Link to="/profile" className="mt-2" title={AuthUser?.fullName} aria-label="Your profile">
          <Avatar name={AuthUser?.fullName} src={AuthUser?.avatar?.url} size="sm" online />
        </Link>
      </div>
    </nav>
  )
}

// Bottom tab bar on phones: Important items (Chats, Status, Calls, You) + Dots (More)
export const MobileTabs = () => {
  const { activePanel, setActivePanel } = useConversation()
  const badges = useNavBadges()
  const [moreOpen, setMoreOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e) => !menuRef.current?.contains(e.target) && setMoreOpen(false)
    const onKey = (e) => e.key === 'Escape' && setMoreOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const isMoreActive = MORE_MOBILE_ITEMS.some((m) => m.id === activePanel)
  const moreBadgeCount = MORE_MOBILE_ITEMS.reduce((sum, m) => sum + (badges[m.id] || 0), 0)
  const tab = 'relative flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition'

  return (
    <nav aria-label="Sections" className="relative flex border-t border-slate-200 bg-white md:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950">
      {PRIMARY_MOBILE_ITEMS.map(({ id, label, Icon }) => {
        const on = activePanel === id
        return (
          <button
            key={id}
            onClick={() => {
              setActivePanel(id)
              setMoreOpen(false)
            }}
            aria-current={on ? 'page' : undefined}
            className={`${tab} ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            <span className="relative flex items-center justify-center">
              <Icon className="size-5 shrink-0" />
              <Badge count={badges[id]} className="-right-3 -top-1.5" />
            </span>
            <span className="truncate max-w-full px-0.5 leading-tight">{label}</span>
          </button>
        )
      })}

      {/* Dots / More button */}
      <div ref={menuRef} className="relative flex flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-current={isMoreActive ? 'page' : undefined}
          aria-label="More sections"
          className={`w-full ${tab} ${isMoreActive || moreOpen ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
        >
          <span className="relative flex items-center justify-center">
            <LuEllipsis className="size-5 shrink-0" />
            <Badge count={moreBadgeCount} className="-right-3 -top-1.5" />
          </span>
          <span className="truncate max-w-full px-0.5 leading-tight">More</span>
        </button>

        <AnimatePresence>
          {moreOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px] md:hidden"
                onClick={() => setMoreOpen(false)}
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="More sections"
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.95 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] right-3 z-50 w-56 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-2xl backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-900/95"
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  More sections
                </div>
                <div className="space-y-0.5">
                  {MORE_MOBILE_ITEMS.map(({ id, label, Icon }) => {
                    const on = activePanel === id
                    const count = badges[id]
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          setActivePanel(id)
                          setMoreOpen(false)
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                          on
                            ? 'bg-indigo-50 font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Icon className={`size-4.5 shrink-0 ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
                          <span className="truncate">{label}</span>
                        </div>
                        {count > 0 && (
                          <span className="ml-2 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <Link
        to="/profile"
        onClick={() => setMoreOpen(false)}
        className={`${tab} text-slate-500 dark:text-slate-400`}
      >
        <span className="relative flex items-center justify-center">
          <LuUser className="size-5 shrink-0" />
        </span>
        <span className="truncate max-w-full px-0.5 leading-tight">You</span>
      </Link>
    </nav>
  )
}
