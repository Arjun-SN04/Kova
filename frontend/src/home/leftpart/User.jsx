import React from 'react'
import useConversation from '../../Zustand/UserConversation'
import Avatar from '../Avatar'
import { shortTime } from '../../utils/conversations'
import { attachmentLabel } from '../../utils/attachments'
import { LuFileText, LuImage, LuMic, LuPhone, LuPhoneMissed, LuPin, LuVideo } from 'react-icons/lu'
import { describeCall } from '../../utils/calls'
import { BusinessBadge } from '../../business/BusinessInfo'
import { LabelChip } from '../../business/CustomerPanel'

// One row in the contact list.
const User = ({ user, online, unread, preview, typing, myId, pinned = false, labels = [], lead = false, waiting = false, locked = false }) => {
  const { selectedConversation, setSelectedConversation, clearUnread, setCatchUp, nexaId } = useConversation()
  const userId = user._id?.toString()
  const isSelected = selectedConversation?._id?.toString() === userId

  const open = () => {
    setSelectedConversation(user)
    setCatchUp(unread >= 5 ? { chatId: userId, count: unread } : null)
    if (unread > 0) clearUnread(userId)
  }

  return (
    <button
      onClick={open}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? 'bg-indigo-50 dark:bg-indigo-500/10'
          : 'hover:bg-slate-50 dark:hover:bg-slate-900'
      }`}
    >
      <Avatar name={user.fullName} src={user.avatar?.url} online={online && !user.isSelf} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <p
            className={`truncate text-sm ${
              isSelected
                ? 'font-semibold text-indigo-700 dark:text-indigo-300'
                : unread
                  ? 'font-semibold text-slate-900 dark:text-white'
                  : 'font-medium text-slate-800 dark:text-slate-200'
            }`}
          >
            {user.fullName}
          </p>
          <BusinessBadge business={user.business} className="size-3.5" />
          {lead && <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-px text-[10px] font-medium text-orange-700 dark:bg-orange-500/10 dark:text-orange-300" title="Likely to buy or book">Lead</span>}
          {labels.slice(0, 2).map((l) => <span key={l._id} className="hidden shrink-0 sm:inline"><LabelChip label={l} small /></span>)}
          {labels.length > 2 && <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">+{labels.length - 2}</span>}
          </div>
          {pinned && <LuPin className="size-3 shrink-0 -rotate-45 text-slate-400" title="Pinned" aria-label="Pinned" />}
          {preview && !locked && (
            <span className={`shrink-0 text-[11px] ${unread && !isSelected && !locked ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
              {shortTime(preview.createdAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-[13px] ${unread && !isSelected && !locked ? 'font-medium text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
            {locked ? (
              <span aria-hidden>&nbsp;</span>
            ) : typing ? (
              <span className="font-medium text-indigo-600 dark:text-indigo-400">{typing === 'Nexa' ? 'Nexa is thinking…' : 'typing…'}</span>
            ) : preview?.call ? (
              (() => {
                const { title, missed } = describeCall(preview.call, String(preview.senderId) === myId)
                const Icon = missed ? LuPhoneMissed : preview.call.type === 'video' ? LuVideo : LuPhone
                return (
                  <span className={missed ? 'text-red-600 dark:text-red-400' : ''}>
                    <Icon className="mr-1 inline size-3.5 -translate-y-px" />{title}
                  </span>
                )
              })()
            ) : preview ? (
              <>
                {String(preview.senderId) === myId && <span className="text-slate-400">You: </span>}
                {nexaId && String(preview.senderId) === String(nexaId) && <span className="text-violet-500">Nexa: </span>}
                {preview.attachment && (
                  <span className="mr-1 inline-flex translate-y-0.5 text-slate-400">
                    {preview.attachment.kind === 'image' ? <LuImage className="size-3.5" /> : preview.attachment.kind === 'video' ? <LuVideo className="size-3.5" /> : preview.attachment.kind === 'audio' ? <LuMic className="size-3.5" /> : <LuFileText className="size-3.5" />}
                  </span>
                )}
                {(preview.message || attachmentLabel(preview.attachment)).replace(/(^|\n)\s*[-*]\s+/g, '$1').replace(/\*\*/g, '').replace(/\s*\n+\s*/g, ' · ')}
              </>
) : user.isSelf ? (
              'Message yourself'
            ) : online ? (
              <span className="text-emerald-600 dark:text-emerald-400">Online</span>
            ) : (
              user.username ? `@${user.username}` : user.email
            )}
          </p>
          {waiting && !unread && <span className="size-2 shrink-0 rounded-full bg-amber-500" title="Waiting for your reply" aria-label="Waiting for your reply" />}
          {unread > 0 && !isSelected && !locked && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export default User
