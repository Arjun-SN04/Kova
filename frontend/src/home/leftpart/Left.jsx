import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LuLayers, LuMoon, LuSquarePen, LuSun, LuUserPlus, LuUsers } from 'react-icons/lu'
import Users from './Users'
import CallsPanel from './CallsPanel'
import CommunitiesPanel from './CommunitiesPanel'
import StarredPanel from './StarredPanel'
import NotifyBanner from './NotifyBanner'
import StatusPanel from '../status/StatusPanel'
import { BusinessLink, MobileTabs, NavRail } from './NavRail'
import ContactsDialog from './ContactsDialog'
import CreateGroupDialog from '../groups/CreateGroupDialog'
import useConversation from '../../Zustand/UserConversation'
import { LogoMark } from '../../components/ui'
import { useTheme } from '../../context/ThemeProvider'

const iconBtn =
  'flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'

// The Chats panel: chat list with search, tabs and the New / Add contact buttons
const ChatsPanel = () => {
  const { dark, toggle } = useTheme()
  const { requests, setContactsDialog, setCreateDialog } = useConversation()
  const incoming = requests.incoming.length

  // "New" menu: group or community
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false)
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [menuOpen])
  const startNew = (mode) => { setMenuOpen(false); setCreateDialog({ mode }) }

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between px-4 pb-4 pt-5">
        <Link to="/home" className="group flex items-center gap-2.5" title="Kova home">
          <LogoMark className="size-8 md:hidden" />
          <span className="text-xl font-semibold tracking-tight">Chats</span>
        </Link>
        <div className="flex items-center gap-1">
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen((o) => !o)} className={iconBtn} title="New group or community" aria-label="New group or community" aria-expanded={menuOpen}>
              <LuSquarePen className="size-4.5" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                {[['group', LuUsers, 'New group'], ['community', LuLayers, 'New community']].map(([mode, Icon, label]) => (
                  <button key={mode} role="menuitem" onClick={() => startNew(mode)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Icon className="size-4 text-slate-400" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setContactsDialog(incoming ? 'requests' : 'add')}
            className={`${iconBtn} relative`}
            title={incoming ? `${incoming} contact request${incoming > 1 ? 's' : ''}` : 'Add contact'}
            aria-label="Add contact"
          >
            <LuUserPlus className="size-4.5" />
            {incoming > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-950">
                {incoming}
              </span>
            )}
          </button>
          <BusinessLink className={`${iconBtn} md:hidden`} iconClass="size-4.5" />
          <button onClick={toggle} className={`${iconBtn} md:hidden`} title={dark ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
            {dark ? <LuSun className="size-4.5" /> : <LuMoon className="size-4.5" />}
          </button>
        </div>
      </header>

      <NotifyBanner />
      <Users />
    </>
  )
}

// Sidebar: section rail (desktop) + the active panel + bottom tabs (phones)
const Left = () => {
  const { activePanel } = useConversation()
  return (
    <div className="flex h-full w-full bg-white dark:bg-slate-950">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {activePanel === 'calls' ? <CallsPanel /> : activePanel === 'communities' ? <CommunitiesPanel /> : activePanel === 'starred' ? <StarredPanel /> : activePanel === 'status' ? <StatusPanel /> : <ChatsPanel />}
        <MobileTabs />
      </div>
      <ContactsDialog />
      <CreateGroupDialog />
    </div>
  )
}

export default Left
