import React from 'react'
import useConversation from '../../Zustand/UserConversation'
import { AiAvatar } from '../Avatar'
import { AI_CHAT } from '../../utils/ai'

// Nexa, the AI assistant, in the chat list
const AiRow = () => {
  const { selectedConversation, setSelectedConversation, unreadCounts } = useConversation()
  const unread = unreadCounts[AI_CHAT._id] || 0
  const isSelected = selectedConversation?.isAi
  return (
    <button
      onClick={() => setSelectedConversation(AI_CHAT)}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        isSelected ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
      }`}
    >
      <AiAvatar />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${isSelected ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-800 dark:text-slate-200'}`}>
          Nexa
          <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">AI</span>
        </p>
        <p className={`mt-0.5 truncate text-[13px] ${unread ? 'font-medium text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>{unread ? 'New message from Nexa' : 'Your AI assistant'}</p>
      </div>
      {unread > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">{unread}</span>
      )}
    </button>
  )
}

export default AiRow
