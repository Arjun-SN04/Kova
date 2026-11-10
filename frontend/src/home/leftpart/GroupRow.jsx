import React from 'react'
import { LuChevronRight, LuFileText, LuImage, LuMic, LuPin, LuVideo, LuBellOff } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { GroupAvatar } from '../Avatar'
import { shortTime } from '../../utils/conversations'
import { attachmentLabel } from '../../utils/attachments'

const AttachmentIcon = ({ kind }) => {
  const Icon = kind === 'image' ? LuImage : kind === 'video' ? LuVideo : kind === 'audio' ? LuMic : LuFileText
  return <span className="mr-1 inline-flex translate-y-0.5 text-slate-400"><Icon className="size-3.5" /></span>
}

// One group in the chat list. `compact` is used for groups listed under a community.
export const GroupRow = ({ group, unread, preview, typing, myId, compact = false, pinned = false, muted = false, locked = false }) => {
  const { selectedConversation, setSelectedConversation, clearUnread, setCatchUp } = useConversation()
  const id = String(group._id)
  const isSelected = String(selectedConversation?._id) === id
  const draft = useConversation((s) => s.drafts[id])

  const open = () => {
    setSelectedConversation(group)
    setCatchUp(unread >= 5 ? { chatId: id, count: unread } : null)
    if (unread > 0) clearUnread(id)
  }

  // "You: …" or "Priya: …" in front of the last message
  const sender = preview && (String(preview.senderId) === myId
    ? 'You'
    : group.members?.find((m) => String(m._id ?? m) === String(preview.senderId))?.fullName?.split(' ')[0])

  return (
    <button
      onClick={open}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl text-left transition-colors ${compact ? 'py-2 pl-6 pr-3' : 'px-3 py-2.5'} ${
        isSelected ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
      }`}
    >
      <GroupAvatar name={group.name} src={group.avatar?.url} announcement={group.announcement} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${isSelected ? 'font-semibold text-indigo-700 dark:text-indigo-300' : unread ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-800 dark:text-slate-200'}`}>
            {group.name}
          </p>
          {pinned && <LuPin className="ml-auto size-3 shrink-0 -rotate-45 text-slate-400" title="Pinned" aria-label="Pinned" />}
          {muted && <LuBellOff className="size-3 shrink-0 text-slate-400" title="Muted" aria-label="Muted" />}
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
              <span className="font-medium text-indigo-600 dark:text-indigo-400">{typing === 'Nexa' ? 'Nexa is thinking…' : typeof typing === 'string' ? `${typing.split(' ')[0]} is typing…` : 'typing…'}</span>
            ) : draft && !isSelected ? (
              <span><span className="font-medium text-emerald-600 dark:text-emerald-400">Draft: </span>{draft}</span>
            ) : preview ? (
              <>
                {sender && <span className="text-slate-400">{sender}: </span>}
                {preview.attachment && <AttachmentIcon kind={preview.attachment.kind} />}
                {(preview.message || attachmentLabel(preview.attachment)).replace(/(^|\n)\s*[-*]\s+/g, '$1').replace(/\*\*/g, '').replace(/\s*\n+\s*/g, ' · ')}
              </>
            ) : group.community && !compact ? (
              group.community.name
            ) : (
              `${group.members?.length || 0} members`
            )}
          </p>
          {unread > 0 && !isSelected && !locked && (
            <span className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white ${muted ? 'bg-slate-400 dark:bg-slate-600' : 'bg-indigo-600'}`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// A community heading in the Groups tab; opens the community page
export const CommunityRow = ({ community }) => {
  const { selectedConversation, setSelectedConversation } = useConversation()
  const isSelected = String(selectedConversation?._id) === String(community._id)
  return (
    <button
      onClick={() => setSelectedConversation(community)}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        isSelected ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
      }`}
    >
      <GroupAvatar name={community.name} community />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>{community.name}</p>
        <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
          Community · {community.groups?.length || 0} groups · {community.members?.length || 0} members
        </p>
      </div>
      <LuChevronRight className="size-4 shrink-0 text-slate-400" />
    </button>
  )
}
