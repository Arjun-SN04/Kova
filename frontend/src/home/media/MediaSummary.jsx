import React, { useMemo, useState } from 'react'
import { LuChevronRight, LuFileText, LuLink, LuMic, LuPlay } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { chatMediaItems, deleteChatItems } from '../../utils/mediaItems'
import { jumpToMessage } from '../../utils/messages'
import { loadConversations } from '../../utils/conversations'
import MediaManager from './MediaManager'

// "Media, links & docs" card in Contact / Group info: a preview strip, opens the manager
const MediaSummary = ({ chat }) => {
  const [AuthUser] = useAuth()
  const { messages, setMessages, groupPeople, setHighlightedId, nexaId } = useConversation()
  const [open, setOpen] = useState(false)
  const myId = String(AuthUser?._id)

  const nameOf = useMemo(() => {
    if (!chat.isGroup) return () => chat.fullName?.split(' ')[0] || ''
    return (id) => {
      const p = groupPeople?.[String(id)] || chat.members?.find((m) => String(m._id ?? m) === String(id))
      return p?.fullName?.split(' ')[0] || 'Member'
    }
  }, [chat, groupPeople])
  const items = useMemo(() => chatMediaItems(messages, { myId, nameOf, nexaId, chat }), [messages, myId, nameOf, nexaId, chat])
  const media = items.filter((i) => i.tab === 'media')
  const count = (tab) => items.filter((i) => i.tab === tab).length

  const onDelete = async (list, mode) => {
    const res = await deleteChatItems(list, mode)
    if (res.ok) {
      const gone = new Set(res.deletedMessages)
      setMessages((prev) => prev.filter((m) => !gone.has(String(m._id))))
      loadConversations()
    }
    return res
  }

  return (
    <>
      <div className="mt-6 rounded-2xl border border-slate-200/80 p-1.5 dark:border-slate-800">
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Media, links and docs</span>
            <span className="mt-0.5 flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{media.length} media</span>
              <span className="inline-flex items-center gap-1"><LuFileText className="size-3" />{count('docs')}</span>
              <span className="inline-flex items-center gap-1"><LuLink className="size-3" />{count('links')}</span>
              <span className="inline-flex items-center gap-1"><LuMic className="size-3" />{count('voice')}</span>
            </span>
          </span>
          <LuChevronRight className="size-4 text-slate-400" />
        </button>
        {media.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5 px-1.5 pb-1.5">
            {media.slice(0, 4).map((it, i) => (
              <button key={it.id} onClick={() => setOpen(true)} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900" aria-label="Open media">
                {it.kind === 'video'
                  ? <><video src={`${it.url}#t=0.1`} preload="metadata" muted className="size-full object-cover" /><LuPlay className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" /></>
                  : <img src={it.url} alt="" loading="lazy" className="size-full object-cover" />}
                {i === 3 && media.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-sm font-semibold text-white">+{media.length - 3}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <MediaManager
        open={open}
        onClose={() => setOpen(false)}
        title="Media, links and docs"
        subtitle={chat.isGroup ? chat.name : chat.isSelf ? 'Your notes' : chat.fullName}
        items={items}
        onDelete={onDelete}
        onJump={(it) => setTimeout(() => jumpToMessage(it.messageId, setHighlightedId), 150)}
        choice
      />
    </>
  )
}

export default MediaSummary
