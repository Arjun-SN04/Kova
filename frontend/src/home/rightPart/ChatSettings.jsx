import React, { useState } from 'react'
import { LuImage, LuPin, LuTimer } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { TIMER_OPTIONS, saveChatTimer, togglePinChat } from '../../utils/chatExtras'
import Select from '../../components/ui/Select'
import { wallpaperName } from '../../utils/wallpapers'

const row = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5'
const iconTile = 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300'

// Chat settings in the info panel: disappearing messages + pin to top (pin is here for phones too)
const ChatSettings = ({ chat, canChangeTimer = true }) => {
  const { chatTimers, pinnedChats, wallpapers, setWallpaperPicker } = useConversation()
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
      {error && <p className="px-3 pb-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default ChatSettings
