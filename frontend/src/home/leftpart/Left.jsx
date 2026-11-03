import React from 'react'
import { Link } from 'react-router-dom'
import { LuBriefcase, LuContact, LuEllipsisVertical, LuLayers, LuMoon, LuSquarePen, LuSun, LuUserPlus, LuUsers } from 'react-icons/lu'
import HeaderMenu from '../../components/HeaderMenu'
import useBusiness from '../../business/store'
import useIsPhone from '../../hooks/useIsPhone'
import Users from './Users'
import CallsPanel from './CallsPanel'
import CommunitiesPanel from './CommunitiesPanel'
import ChannelsPanel from '../channels/ChannelsPanel'
import StarredPanel from './StarredPanel'
import NotifyBanner from './NotifyBanner'
import StatusPanel from '../status/StatusPanel'
import { MobileTabs, NavRail } from './NavRail'
import ContactsDialog from './ContactsDialog'
import CreateGroupDialog from '../groups/CreateGroupDialog'
import useConversation from '../../Zustand/UserConversation'
import { LogoMark } from '../../components/ui'
import { useTheme } from '../../context/ThemeProvider'

const iconBtn =
  'flex size-8 sm:size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'

// The Chats panel: chat list with search and tabs. The header keeps two buttons: ✎ New
// (group, community, contact) and ⋯ More (contacts, requests; on phones also business and theme).
const ChatsPanel = () => {
  const { dark, toggle } = useTheme()
  const { requests, setContactsDialog, setCreateDialog } = useConversation()
  const incoming = requests.incoming.length
  const waiting = useBusiness((st) => st.alerts.length)
  const hasBusiness = useBusiness((st) => !!st.me?.business?.enabled || st.me?.workFor?.length > 0)
  const phone = useIsPhone() // business and theme are in this menu only on phones (computers have the rail)

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-4 pb-2.5 sm:pb-3.5 pt-3.5 sm:pt-4">
        <Link to="/home" className="group flex min-w-0 items-center gap-2 sm:gap-2.5" title="Kova home">
          <LogoMark className="size-7 sm:size-8 shrink-0 md:hidden" />
          <span className="truncate text-lg sm:text-xl font-semibold tracking-tight">Chats</span>
        </Link>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <HeaderMenu
            icon={LuSquarePen}
            label="New"
            buttonClass={iconBtn}
            width="w-52"
            items={[
              { label: 'New group', icon: LuUsers, run: () => setCreateDialog({ mode: 'group' }) },
              { label: 'New community', icon: LuLayers, run: () => setCreateDialog({ mode: 'community' }) },
              'divider',
              { label: 'Add contact', icon: LuUserPlus, run: () => setContactsDialog('add') },
            ]}
          />
          <HeaderMenu
            icon={LuEllipsisVertical}
            label="More"
            badge={incoming + (phone && waiting ? 1 : 0)}
            buttonClass={iconBtn}
            items={[
              { label: 'Contacts', icon: LuContact, run: () => setContactsDialog('all') },
              { label: 'Contact requests', icon: LuUserPlus, run: () => setContactsDialog('requests'), badge: incoming, hidden: !incoming },
              // Phones: the section rail (with these) isn't shown
              'divider',
              { label: hasBusiness ? 'Business' : 'Set up a business', icon: LuBriefcase, to: '/business', badge: waiting, className: 'md:hidden' },
              { label: dark ? 'Light mode' : 'Dark mode', icon: dark ? LuSun : LuMoon, run: toggle, className: 'md:hidden' },
            ]}
          />
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
        {activePanel === 'calls' ? <CallsPanel /> : activePanel === 'communities' ? <CommunitiesPanel /> : activePanel === 'channels' ? <ChannelsPanel /> : activePanel === 'starred' ? <StarredPanel /> : activePanel === 'status' ? <StatusPanel /> : <ChatsPanel />}
        <MobileTabs />
      </div>
      <ContactsDialog />
      <CreateGroupDialog />
    </div>
  )
}

export default Left
