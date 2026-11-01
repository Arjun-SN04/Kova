import React from 'react'
import { LuPlus } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { GroupAvatar } from '../Avatar'
import PanelHeader, { panelIconBtn } from './PanelHeader'
import { GroupRow } from './GroupRow'

// Each community with its Announcements group and a link to everything else in it
const CommunitiesPanel = () => {
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)
  const { communities, groups, previews, unreadCounts, typingUsers, setSelectedConversation, setCreateDialog, lockedChats } = useConversation()

  return (
    <>
      <PanelHeader title="Communities">
        <button onClick={() => setCreateDialog({ mode: 'community' })} className={panelIconBtn} title="New community" aria-label="New community">
          <LuPlus className="size-5" />
        </button>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <button onClick={() => setCreateDialog({ mode: 'community' })} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900">
          <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-white"><LuPlus className="size-5" /></span>
          <span className="text-sm font-medium">New community</span>
        </button>

        {communities.map((c) => {
          const announcements = groups.find((g) => g.announcement && String(g.community?._id) === String(c._id))
          const others = c.groups.filter((g) => !g.announcement).length
          return (
            <section key={c._id} className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800/80">
              <button onClick={() => setSelectedConversation(c)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900">
                <GroupAvatar name={c.name} community />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.members.length} members{others ? ` · ${others} group${others > 1 ? 's' : ''}` : ''}</p>
                </div>
              </button>
              {announcements && (
                <GroupRow
                  group={announcements}
                  unread={unreadCounts[String(announcements._id)] || 0}
                  preview={previews[String(announcements._id)]}
                  typing={typingUsers[String(announcements._id)]}
                  myId={myId}
                  compact
                  locked={lockedChats.includes(String(announcements._id))}
                />
              )}
              <button onClick={() => setSelectedConversation(c)} className="ml-6 mt-0.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
                View all
              </button>
            </section>
          )
        })}

        {!communities.length && (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No communities yet</p>
            <p className="mt-1 text-[13px] text-slate-400">Bring related groups together, with announcements for everyone.</p>
          </div>
        )}
      </div>
    </>
  )
}

export default CommunitiesPanel
