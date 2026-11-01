import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuKeyRound, LuLock, LuShieldQuestion } from 'react-icons/lu'
import useConversation from '../Zustand/UserConversation'
import LockCodeDialog from '../home/leftpart/LockCodeDialog'
import { changeLockCode } from '../utils/chatExtras'
import SecurityQuestionDialog from './security/SecurityQuestionDialog'

// Profile → Locked chats: set, change or reset the chat lock code
const ChatLockSettings = () => {
  const { lockedChats, hasLockCode, securityQuestion, setLockedPrefs } = useConversation()
  // The settings page can open on its own: load the current state
  useEffect(() => {
    axios.get('/api/message/prefs', { withCredentials: true }).then((r) => setLockedPrefs(r.data)).catch(() => {})
  }, [setLockedPrefs])
  const [dialog, setDialog] = useState(null) // create | change | reset | question
  const btn = 'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition'
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuLock className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base sm:text-lg">Locked chats</p>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {hasLockCode
              ? `${lockedChats.length} locked chat${lockedChats.length === 1 ? '' : 's'}. They open only with your chat lock code.`
              : 'Lock chats behind a code. Locked chats move to their own folder and need the code to open.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:pl-14">
        <button onClick={() => setDialog(hasLockCode ? 'change' : 'create')} className={`${btn} text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800`}>
          <LuKeyRound className="size-4" /> {hasLockCode ? 'Change code' : 'Set a code'}
        </button>
        {hasLockCode && (
          <button onClick={() => setDialog('reset')} className={`${btn} text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10`}>
            <LuShieldQuestion className="size-4" /> Forgot code
          </button>
        )}
        <button onClick={() => setDialog('question')} className={`${btn} text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800`}>
          <LuShieldQuestion className="size-4" /> {securityQuestion ? 'Change security question' : 'Set security question'}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500 sm:pl-14 dark:text-slate-400">{securityQuestion ? 'Your security question resets a forgotten code, secret word or app PIN. ' : 'Set a security question so you can reset a forgotten code, secret word or app PIN. '}To lock a chat: open its ⋯ menu → Lock chat, or right-click it in the list.</p>
      {dialog === 'question' && <SecurityQuestionDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== 'question' && <LockCodeDialog mode={dialog} onClose={() => setDialog(null)} onSubmit={(code, qa) => changeLockCode('', code, qa)} />}
    </div>
  )
}

export default ChatLockSettings
