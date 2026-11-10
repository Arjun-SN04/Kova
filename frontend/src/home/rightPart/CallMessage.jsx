import React from 'react'
import { LuPhone, LuPhoneIncoming, LuPhoneMissed, LuPhoneOutgoing, LuVideo } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useCall } from '../../context/CallProvider'
import { useGroupCall } from '../../context/GroupCallProvider'
import { describeCall } from '../../utils/calls'

const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// A call in the chat history: "Missed voice call", "Video call · 3:12", with a call-back button
const CallMessage = ({ message, itsMe }) => {
  const { selectedConversation } = useConversation()
  const { call, startCall } = useCall()
  const groupCall = useGroupCall()
  const info = message.call
  // A group call: Join while it's going on (also after leaving it), otherwise start a new one
  const groupId = message.groupId ? String(message.groupId) : null
  const live = groupId && info.status === 'ongoing' && groupCall?.active[groupId]?.callId === info.callId
  const inIt = live && groupCall?.gcall?.groupId === groupId
  const { title, detail, missed } = describeCall(info, itsMe)
  const Arrow = missed ? LuPhoneMissed : itsMe ? LuPhoneOutgoing : LuPhoneIncoming
  const KindIcon = info.type === 'video' ? LuVideo : LuPhone

  return (
    <div className={`mb-3 flex ${itsMe ? 'justify-end' : 'justify-start pl-9'}`}>
      <div className={`flex min-w-56 items-center gap-3 rounded-2xl px-3 py-2.5 shadow-xs ring-1 ${
        itsMe
          ? 'rounded-br-md bg-indigo-50 ring-indigo-100 dark:bg-indigo-500/10 dark:ring-indigo-500/20'
          : 'rounded-bl-md bg-white ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700/60'
      }`}>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          missed ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
        }`}>
          <KindIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${missed ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{title}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Arrow className="size-3" />
            {groupId ? (
              <>{live ? 'Started' : detail} · {formatTime(message.createdAt)}</>
            ) : (
              <>
                {info.status === 'answered' ? detail : itsMe ? detail : formatTime(message.createdAt)}
                {info.status === 'answered' && <span>· {formatTime(message.createdAt)}</span>}
                {itsMe && info.status !== 'answered' && <span>· {formatTime(message.createdAt)}</span>}
              </>
            )}
          </p>
        </div>
        {groupId ? (
          live ? (
            <button
              onClick={() => groupCall.join(groupId)}
              disabled={inIt || !!call}
              className="h-8 shrink-0 rounded-full bg-emerald-600 px-3.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {inIt ? 'In call' : 'Join'}
            </button>
          ) : (
            <button
              onClick={() => groupCall?.start(selectedConversation, info.type)}
              disabled={!!call || !!groupCall?.gcall || selectedConversation?.announcement}
              title={`Start a group ${info.type} call`}
              aria-label="Start a group call"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
            >
              <KindIcon className="size-4" />
            </button>
          )
        ) : !selectedConversation?.isSelf && (
          <button
            onClick={() => startCall(selectedConversation, info.type)}
            disabled={!!call}
            title={`Call back (${info.type})`}
            aria-label="Call back"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-500/15"
          >
            <KindIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export default CallMessage
