import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuEyeOff, LuKeyRound } from 'react-icons/lu'
import useConversation from '../Zustand/UserConversation'
import { HiddenWordDialog } from '../home/leftpart/HiddenChats'

// Profile → Hidden chats: the secret word that shows hidden chats in search
const HiddenChatsSettings = () => {
  const { hiddenChats, hiddenWordHash, setHiddenPrefs } = useConversation()
  const [dialog, setDialog] = useState(null) // create | change | off

  // The settings page can open on its own: load the current state
  useEffect(() => {
    axios.get('/api/message/prefs', { withCredentials: true }).then((r) => setHiddenPrefs(r.data)).catch(() => {})
  }, [setHiddenPrefs])

  const on = !!hiddenWordHash
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuEyeOff className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base sm:text-lg">Hidden chats</p>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {on
              ? `${hiddenChats.length} hidden chat${hiddenChats.length === 1 ? '' : 's'}. Type your secret word in the chat search box to see them.`
              : 'Hide chats from your list, search and contacts. They show only when you type a secret word in the chat search box.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:pl-14">
        <button onClick={() => setDialog(on ? 'change' : 'create')} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">
          <LuKeyRound className="size-4" /> {on ? 'Change secret word' : 'Set a secret word'}
        </button>
        {on && <button onClick={() => setDialog('off')} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">Turn off</button>}
      </div>
      <p className="mt-3 text-xs text-slate-500 sm:pl-14 dark:text-slate-400">To hide a chat: open its ⋯ menu → Hide chat, or right-click it in the list.</p>
      {dialog && <HiddenWordDialog mode={dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

export default HiddenChatsSettings
