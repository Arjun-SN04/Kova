import React, { useState } from 'react'
import { LuArchive, LuArchiveRestore, LuBell, LuBellOff, LuDownload, LuImage, LuPin, LuTimer } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { TIMER_OPTIONS, muteChat, saveChatTimer, setArchived, togglePinChat } from '../../utils/chatExtras'
import { isMuted } from '../../utils/localNotify'
import Select from '../../components/ui/Select'
import { wallpaperName } from '../../utils/wallpapers'

const row = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5'
const iconTile = 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300'

// Chat settings in the info panel: disappearing messages + pin to top (pin is here for phones too)
const ChatSettings = ({ chat, canChangeTimer = true }) => {
  const { chatTimers, pinnedChats, wallpapers, setWallpaperPicker, mutedChats, archivedChats } = useConversation()
  const muted = isMuted(mutedChats, chat._id)
  const mutedUntil = muted ? mutedChats[String(chat._id)] : null
  const archived = archivedChats.includes(String(chat._id))
  const [error, setError] = useState('')
  const seconds = chatTimers[String(chat._id)] ?? chat.disappearAfter ?? 0
  const pinned = pinnedChats.includes(String(chat._id))

  const change = async (value) => {
    setError('')
    const r = await saveChatTimer(chat, Number(value))
    if (!r.ok) setError(r.error)
  }

  return (
    <div className="mt-6 space-y-1 rounded-2xl bg-slate-50 p-2 dark:bg-slate-900">
      <div className={`${row} items-start`}>
        <span className={iconTile}><LuTimer className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Disappearing messages</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{seconds ? 'New messages disappear after this time. Keep one to save it.' : 'Messages stay until deleted'}</span>
          {canChangeTimer ? (
            <div className="mt-2"><Select size="sm" value={seconds} onChange={change} aria-label="Disappearing messages" options={TIMER_OPTIONS.map(([s, label]) => ({ value: s, label }))} /></div>
          ) : (
            <span className="mt-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{TIMER_OPTIONS.find(([s]) => s === seconds)?.[1] || 'Off'} · only admins can change this</span>
          )}
        </span>
      </div>
      <button onClick={() => setWallpaperPicker({ chatId: String(chat._id), name: chat.isGroup ? chat.name : chat.fullName })} className={`${row} text-left transition hover:bg-white dark:hover:bg-slate-800`}>
        <span className={iconTile}><LuImage className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Wallpaper</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{wallpapers.chats?.[String(chat._id)] ? wallpaperName(wallpapers.chats[String(chat._id)]) : `Same as your default (${wallpaperName(wallpapers.global)})`}</span>
        </span>
      </button>
      <button onClick={async () => { setError(''); const r = await togglePinChat(chat._id); if (!r.ok) setError(r.error) }} className={`${row} text-left transition hover:bg-white dark:hover:bg-slate-800`}>
        <span className={iconTile}><LuPin className={`size-4 ${pinned ? '-rotate-45' : ''}`} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{pinned ? 'Unpin chat' : 'Pin chat'}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{pinned ? 'Pinned to the top of your list' : 'Keep it at the top of your list'}</span>
        </span>
      </button>
      {!chat.isSelf && (
        <div className={`${row} items-start`}>
          <span className={iconTile}>{muted ? <LuBellOff className="size-4" /> : <LuBell className="size-4" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{muted ? 'Muted' : 'Notifications'}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {muted ? (mutedUntil ? `No notifications until ${new Date(mutedUntil).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : 'No notifications from this chat') : 'You get notified about new messages'}
            </span>
            <div className="mt-2">
              <Select size="sm" value={muted ? (mutedUntil ? 'custom' : 'always') : 'off'} aria-label="Mute notifications"
                onChange={async (v) => { if (v === 'custom') return; setError(''); const r = await muteChat(chat._id, v); if (!r.ok) setError(r.error) }}
                options={[
                  { value: 'off', label: 'Not muted' },
                  { value: '8h', label: 'Mute for 8 hours' },
                  { value: '1w', label: 'Mute for 1 week' },
                  { value: 'always', label: 'Mute always' },
                  ...(muted && mutedUntil ? [{ value: 'custom', label: 'Muted for now' }] : []),
                ]} />
            </div>
          </span>
        </div>
      )}
      <button onClick={async () => { setError(''); const r = await setArchived(chat._id, !archived); if (!r.ok) setError(r.error) }} className={`${row} text-left transition hover:bg-white dark:hover:bg-slate-800`}>
        <span className={iconTile}>{archived ? <LuArchiveRestore className="size-4" /> : <LuArchive className="size-4" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{archived ? 'Unarchive chat' : 'Archive chat'}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{archived ? 'Back in your main chat list' : 'Move it out of your chat list, into Archived'}</span>
        </span>
      </button>
      {/* The whole chat as a text file (photos and files as links) */}
      <a href={`/api/message/export/${chat._id}?${new URLSearchParams({ ...(chat.isGroup ? { group: '1' } : {}), tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}`} download className={`${row} text-left transition hover:bg-white dark:hover:bg-slate-800`}>
        <span className={iconTile}><LuDownload className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Export chat</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Download it as a text file</span>
        </span>
      </a>
      {error && <p className="px-3 pb-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default ChatSettings
