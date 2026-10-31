import React from 'react'
import { Link } from 'react-router-dom'
import { LuBriefcase, LuLayers, LuMessageSquareText, LuMoon, LuPhone, LuSettings, LuSun, LuUser, LuStar, LuCircleDashed } from 'react-icons/lu'
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
  const { unreadCounts, calls, callsSeenAt, groups, statusFeed, lockedChats, hiddenChats } = useConversation()
  const communityGroups = new Set(groups.filter((g) => g.community).map((g) => String(g._id)))
  const total = (filter) => Object.entries(unreadCounts).filter(([id]) => filter(id)).reduce((n, [, c]) => n + c, 0)
  return {
    // Locked chats don't count, so the badge doesn't give them away
    chats: total((id) => !lockedChats.includes(id) && !hiddenChats.includes(id)),
    calls: calls.filter((c) =>
      String(c.callee?._id) === String(AuthUser?._id) && c.status === 'missed' && new Date(c.startedAt).getTime() > callsSeenAt).length,
    communities: total((id) => communityGroups.has(id)),
    // Contacts with status updates I haven't seen
    status: statusFeed.people.filter((p) => !p.allSeen).length,
  }
}

export const NAV_ITEMS = [
  { id: 'chats', label: 'Chats', Icon: LuMessageSquareText },
  { id: 'status', label: 'Status', Icon: LuCircleDashed },
  { id: 'calls', label: 'Calls', Icon: LuPhone },
  { id: 'communities', label: 'Communities', Icon: LuLayers },
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
  const badges = useNavBadges()

  return (
    <nav aria-label="Sections" className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50 py-4 md:flex dark:border-slate-800 dark:bg-slate-950">
      <Link to="/home" className="group mb-3" title="Kova home"><LogoMark className="size-9" /></Link>
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const on = activePanel === id
        return (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
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

// Bottom tab bar on phones
export const MobileTabs = () => {
  const { activePanel, setActivePanel } = useConversation()
  const badges = useNavBadges()
  const tab = 'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition'
  return (
    <nav aria-label="Sections" className="flex border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-950">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const on = activePanel === id
        return (
          <button key={id} onClick={() => setActivePanel(id)} aria-current={on ? 'page' : undefined} className={`${tab} ${on ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
            <span className="relative">
              <Icon className="size-5" />
              <Badge count={badges[id]} className="-right-3 -top-1.5" />
            </span>
            {label}
          </button>
        )
      })}
      <Link to="/profile" className={`${tab} text-slate-500 dark:text-slate-400`}>
        <LuUser className="size-5" />
        You
      </Link>
    </nav>
  )
}
