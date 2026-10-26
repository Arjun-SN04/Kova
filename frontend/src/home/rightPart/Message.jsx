import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { LuAlarmClock, LuCheck, LuCheckCheck, LuEllipsis, LuLanguages, LuCopy, LuForward, LuPencil, LuBookmark, LuBookmarkX, LuPin, LuPinOff, LuReply, LuSmilePlus, LuSquareCheck, LuStar, LuStarOff, LuTimer, LuTrash2 } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import Avatar from '../Avatar'
import Attachment from './Attachment'
import ConfirmDialog from '../ConfirmDialog'
import { attachmentLabel } from '../../utils/attachments'
import { canEdit, groupReactions, jumpToMessage, toggleReaction } from '../../utils/messages'
import ReactionPicker from './ReactionPicker'
import { GoToMessage, RemindMenu, Transcript, Translation, useTranslation } from './NexaExtras'
import { AiAvatar } from '../Avatar'
import ReactMarkdown from 'react-markdown'
import { remarkHtmlBreaks } from '../../utils/markdown'
import PollCard from './PollCard'
import { setKept, setMessagePinned, toggleStar } from '../../utils/chatExtras'

// Nexa writes short Markdown (bullets, bold); people's messages stay plain text
const botMd = {
  p: (props) => <p className="my-1 first:mt-0 last:mb-0" {...props} />,
  ul: (props) => <ul className="my-1 list-disc space-y-0.5 pl-4 first:mt-0 last:mb-0" {...props} />,
  ol: (props) => <ol className="my-1 list-decimal space-y-0.5 pl-4 first:mt-0 last:mb-0" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  blockquote: (props) => <blockquote className="my-1 border-l-2 border-violet-300 pl-2 dark:border-violet-500/50" {...props} />,
  a: (props) => <a className="underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
}
import { loadConversations } from '../../utils/conversations'

const HTML_BREAKS = [remarkHtmlBreaks]

const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const LONG_PRESS_MS = 450
// Desktop (mouse) shows the actions on hover; touch screens show them on tap
const canHover = () => window.matchMedia('(hover: hover)').matches

const MenuItem = ({ onClick, icon: Icon, label, danger = false }) => (
  <button
    role="menuitem"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
      danger
        ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
    }`}
  >
    <Icon className="size-4 shrink-0 opacity-70" /> {label}
  </button>
)

const ActionButton = ({ onClick, label, danger = false, children }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`flex size-7 items-center justify-center rounded-md text-slate-500 transition dark:text-slate-400 ${
      danger
        ? 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400'
        : 'hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white'
    }`}
  >
    {children}
  </button>
)

// A single chat bubble.
// `first`/`last`: position inside a group of consecutive messages from one person.
// `original`: the message this one replies to (null if it was deleted, undefined if not a reply).
// In groups, `senderLabel` shows who wrote it and `nameOf(id)` names people in reply quotes
const Message = ({ message, itsMe, first, last, contactName, contactAvatar, myId, original, now, senderLabel = null, nameOf = null, isBot = false }) => {
  const {
    setMessages, editingMessage, setEditingMessage, replyingTo, setReplyingTo, highlightedId, setHighlightedId,
    selectionMode, selectedIds, startSelection, toggleSelected, setForwardIds, starredIds,
  } = useConversation()
  const starred = starredIds.includes(String(message._id))
  const pinned = !!message.pinned
  const kept = !!message.kept
  const expiring = !!message.expiresAt && !kept
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerPlacement, setPickerPlacement] = useState('top')
  const pressTimer = useRef(null)
  const [remindOpen, setRemindOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const rowRef = useRef(null)
  const moreRef = useRef(null)

  // Close the More menu, or a tapped-open actions bar, when tapping elsewhere
  useEffect(() => {
    if (!moreOpen && !showActions) return
    const onDown = (e) => {
      if (moreOpen && !moreRef.current?.contains(e.target) && !e.target.closest?.('[data-more-toggle]')) setMoreOpen(false)
      if (showActions && !rowRef.current?.contains(e.target)) setShowActions(false)
    }
    const onKey = (e) => e.key === 'Escape' && (setMoreOpen(false), setShowActions(false))
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [moreOpen, showActions])
  const { translation, translate, hide: hideTranslation } = useTranslation(message)
  const canTranslate = !!(message.message?.trim() || message.transcript)

  const id = message._id
  const isEditing = editingMessage?._id === id
  const isReplyTarget = replyingTo?._id === id
  const isSelected = selectedIds.includes(id)
  const editable = itsMe && !message.poll && canEdit(message, now)
  const contactFirst = contactName?.split(' ')[0]

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await axios.delete(`/api/message/delete/${id}`, { withCredentials: true })
      setMessages((prev) => prev.filter((m) => m._id !== id))
      if (isEditing) setEditingMessage(null)
      if (isReplyTarget) setReplyingTo(null)
      loadConversations()
    } catch (err) {
      console.log(err)
      setDeleting(false)
    }
    setConfirmDelete(false)
  }

  // Reactions: update instantly, then sync with the server's answer
  const react = async (emoji) => {
    setPickerOpen(false)
    setShowActions(false)
    setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, reactions: toggleReaction(m.reactions, myId, emoji) } : m)))
    try {
      const res = await axios.put(`/api/message/react/${id}`, { emoji }, { withCredentials: true })
      setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, reactions: res.data.reactions } : m)))
    } catch (err) {
      console.log(err)
      // Undo the optimistic change
      setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, reactions: toggleReaction(m.reactions, myId, emoji) } : m)))
    }
  }
  const myReaction = message.reactions?.find((r) => String(r.userId) === myId)?.emoji
  const reactionGroups = groupReactions(message.reactions)

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message.message || message.attachment?.url || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch { /* clipboard not available */ }
  }

  // Touch: press and hold a message to start selecting
  const onTouchStart = () => {
    if (selectionMode) return
    pressTimer.current = setTimeout(() => startSelection(id), LONG_PRESS_MS)
  }
  const cancelPress = () => clearTimeout(pressTimer.current)

  const onBubbleClick = () => {
    if (selectionMode) toggleSelected(id)
    else if (!canHover()) setShowActions((v) => !v)
  }

  // Photos and videos get a tighter frame around them
  const media = ['image', 'video'].includes(message.attachment?.kind)

  // Bubble shape: flatten the corner that points at the neighbouring bubble
  const corners = itsMe
    ? `rounded-br-md ${first ? '' : 'rounded-tr-md'}`
    : `rounded-bl-md ${first ? '' : 'rounded-tl-md'}`

  const ring = isEditing || isReplyTarget || highlightedId === id
    ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900'
    : ''

  const close = (fn) => () => { fn(); setShowActions(false); setMoreOpen(false) }

  // Open menus below the message if there isn't room above it
  const placeFrom = (el) => {
    const top = el.getBoundingClientRect().top
    const areaTop = el.closest('.chat-bg')?.getBoundingClientRect().top ?? 0
    setPickerPlacement(top - areaTop < 260 ? 'bottom' : 'top')
  }

  // Hover bar: React, Reply and a More menu for everything else
  const actions = !selectionMode && (
    <div
      className={`relative mb-5 flex shrink-0 items-center rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-slate-200 transition-opacity dark:bg-slate-800 dark:ring-slate-700 ${
        showActions || pickerOpen || remindOpen || moreOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      } group-hover:pointer-events-auto group-hover:opacity-100`}
    >
      {pickerOpen && (
        <ReactionPicker current={myReaction} onPick={react} onClose={() => setPickerOpen(false)} align={itsMe ? 'right' : 'left'} placement={pickerPlacement} />
      )}
      {remindOpen && (
        <RemindMenu message={message} align={itsMe ? 'right' : 'left'} placement={pickerPlacement} onClose={() => { setRemindOpen(false); setShowActions(false) }} />
      )}
      {moreOpen && (
        <div
          ref={moreRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-30 w-48 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${
            pickerPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${itsMe ? 'right-0' : 'left-0'}`}
        >
          <MenuItem icon={copied ? LuCheck : LuCopy} label={copied ? 'Copied' : 'Copy'} onClick={() => { copyText(); setTimeout(() => setMoreOpen(false), 400) }} />
          <MenuItem icon={LuForward} label="Forward" onClick={close(() => setForwardIds([id]))} />
          {canTranslate && <MenuItem icon={LuLanguages} label={translation?.text ? 'Hide translation' : 'Translate'} onClick={close(translate)} />}
          <MenuItem icon={starred ? LuStarOff : LuStar} label={starred ? 'Unstar' : 'Star'} onClick={close(() => toggleStar(id))} />
          {!isBot && <MenuItem icon={pinned ? LuPinOff : LuPin} label={pinned ? 'Unpin' : 'Pin'} onClick={close(() => setMessagePinned(id, !pinned))} />}
          {(expiring || kept) && <MenuItem icon={kept ? LuBookmarkX : LuBookmark} label={kept ? "Don't keep" : 'Keep (stop it disappearing)'} onClick={close(() => setKept(message, !kept))} />}
          <MenuItem icon={LuAlarmClock} label="Remind me" onClick={() => { setMoreOpen(false); setRemindOpen(true) }} />
          {editable && <MenuItem icon={LuPencil} label="Edit" onClick={close(() => setEditingMessage(message))} />}
          <MenuItem icon={LuSquareCheck} label="Select" onClick={close(() => startSelection(id))} />
          {itsMe && (
            <>
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
              <MenuItem icon={LuTrash2} label="Delete" danger onClick={close(() => setConfirmDelete(true))} />
            </>
          )}
        </div>
      )}
      <ActionButton label="React" onClick={(e) => { placeFrom(e.currentTarget); setMoreOpen(false); setPickerOpen((v) => !v) }}>
        <LuSmilePlus className="size-3.5" />
      </ActionButton>
      <ActionButton label="Reply" onClick={close(() => setReplyingTo(message))}>
        <LuReply className="size-3.5" />
      </ActionButton>
      <span data-more-toggle>
        <ActionButton label="More" onClick={(e) => { placeFrom(e.currentTarget); setPickerOpen(false); setMoreOpen((v) => !v) }}>
          <LuEllipsis className="size-3.5" />
        </ActionButton>
      </span>
    </div>
  )

  const quote = message.replyTo && (
    <button
      onClick={(e) => { e.stopPropagation(); if (original && !selectionMode) jumpToMessage(original._id, setHighlightedId) }}
      disabled={!original}
      className={`mb-1.5 block w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-xs transition ${
        itsMe
          ? 'border-white/70 bg-white/15 text-indigo-50 hover:bg-white/20'
          : 'border-indigo-400 bg-slate-100 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-700/60 dark:text-slate-300'
      }`}
    >
      {original ? (
        <>
          <span className="block font-semibold">{String(original.senderId) === myId ? 'You' : nameOf ? nameOf(original.senderId) : contactFirst}</span>
          <span className="line-clamp-2">{original.message || attachmentLabel(original.attachment)}</span>
        </>
      ) : (
        <span className="italic opacity-80">Original message was deleted</span>
      )}
    </button>
  )

  return (
    <div
      ref={rowRef}
      id={`msg-${id}`}
      onClick={selectionMode ? () => toggleSelected(id) : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      className={`group -mx-2 flex scroll-my-24 items-end gap-2 rounded-xl px-2 transition-colors ${itsMe ? 'justify-end' : ''} ${
        last ? 'mb-3 pb-1' : 'mb-0.5'
      } ${selectionMode ? 'cursor-pointer select-none' : ''} ${isSelected ? 'bg-indigo-500/10' : ''}`}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <span
          className={`mb-2 flex size-5 shrink-0 ${itsMe ? 'mr-auto' : ''} items-center justify-center self-center rounded-full border-2 transition ${
            isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
          }`}
          role="checkbox"
          aria-checked={isSelected}
          aria-label="Select message"
        >
          {isSelected && <LuCheck className="size-3" />}
        </span>
      )}

      {!itsMe && (last ? (isBot ? <AiAvatar size="xs" /> : <Avatar name={contactName} src={contactAvatar} size="xs" />) : <div className="w-7 shrink-0" />)}
      {itsMe && actions}

      <div className={`flex max-w-[80%] flex-col sm:max-w-[70%] lg:max-w-[min(60%,640px)] ${itsMe ? 'items-end' : 'items-start'}`}>
        {senderLabel && <p className="mb-0.5 ml-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">{senderLabel}</p>}
        <div
          onClick={selectionMode ? undefined : onBubbleClick}
          onDoubleClick={selectionMode ? undefined : (e) => { e.preventDefault(); window.getSelection()?.removeAllRanges(); react('❤️') }}
          title={new Date(message.createdAt).toLocaleString()}
          className={`rounded-2xl text-[14px] leading-relaxed transition ${media ? 'p-1.5' : 'px-3.5 py-2'} ${corners} ${ring} ${deleting ? 'opacity-40' : ''} ${
            itsMe
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-100'
          } ${!itsMe && !ring ? 'ring-1 ring-slate-200/80 dark:ring-slate-700/60' : ''} ${selectionMode ? 'pointer-events-none' : ''}`}
        >
          {message.forwarded && (
            <p className={`mb-1 flex items-center gap-1 text-[11px] italic ${media ? 'px-2 pt-1' : ''} ${itsMe ? 'text-indigo-200' : 'text-slate-400'}`}>
              <LuForward className="size-3" /> Forwarded
            </p>
          )}
          {quote}
          {message.attachment && <Attachment attachment={message.attachment} itsMe={itsMe} />}
          <Transcript message={message} itsMe={itsMe} />
          {message.poll && <PollCard message={message} itsMe={itsMe} myId={myId} nameOf={nameOf} />}
          {message.message && !message.poll && (isBot ? (
            <div className="wrap-break-word"><ReactMarkdown remarkPlugins={HTML_BREAKS} components={botMd}>{message.message}</ReactMarkdown></div>
          ) : (
            <span className={`block whitespace-pre-wrap wrap-break-word ${media ? 'px-2 pb-1 pt-1.5' : message.attachment ? 'pt-2' : ''}`}>
              {message.message}
            </span>
          ))}
          <Translation translation={translation} itsMe={itsMe} onHide={hideTranslation} />
          <GoToMessage message={message} itsMe={itsMe} />
        </div>

        {reactionGroups.length > 0 && (
          <div className={`relative z-10 -mt-1.5 flex flex-wrap gap-1 ${itsMe ? 'justify-end pr-2' : 'pl-2'}`}>
            {reactionGroups.map((g) => {
              const mine = g.userIds.includes(myId)
              const who = g.userIds.map((u) => (u === myId ? 'You' : contactFirst)).join(', ')
              return (
                <button
                  key={g.emoji}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (!selectionMode) react(g.emoji) }}
                  title={`${who} reacted ${g.emoji}`}
                  aria-label={`${g.emoji} ${g.count}, ${mine ? 'click to remove your reaction' : 'click to react'}`}
                  className={`flex h-6 items-center gap-1 rounded-full px-1.5 text-[13px] leading-none shadow-sm ring-1 transition hover:scale-105 ${
                    mine
                      ? 'bg-indigo-50 ring-indigo-300 dark:bg-indigo-500/20 dark:ring-indigo-500/50'
                      : 'bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'
                  }`}
                >
                  <span>{g.emoji}</span>
                  {g.count > 1 && <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{g.count}</span>}
                </button>
              )
            })}
          </div>
        )}

        {(last || starred || pinned || kept) && (
          <p className={`flex items-center gap-1 px-1 text-[11px] text-slate-400 ${last ? 'mt-1' : 'mt-0.5'}`}>
            {pinned && <LuPin className="size-3 -rotate-45 text-indigo-500" title="Pinned" aria-label="Pinned" />}
            {starred && <LuStar className="size-3 fill-amber-400 text-amber-400" title="Starred" aria-label="Starred" />}
            {kept && <LuBookmark className="size-3 fill-indigo-400 text-indigo-400" title="Kept: won't disappear" aria-label="Kept" />}
            {last && expiring && <LuTimer className="size-3" title={`Disappears ${new Date(message.expiresAt).toLocaleString()}`} aria-label="Disappearing message" />}
            {last && formatTime(message.createdAt)}
            {last && message.edited && ' · edited'}
            {last && itsMe && String(message.receiverId) !== String(myId) && (message.seen
              ? <LuCheckCheck className="size-3.5 text-indigo-500" title="Seen" aria-label="Seen" />
              : <LuCheck className="size-3.5" title="Sent" aria-label="Sent" />)}
          </p>
        )}
      </div>

      {!itsMe && actions}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this message?"
        description="It will be removed for both of you. This can't be undone."
      />
    </div>
  )
}

export default Message
