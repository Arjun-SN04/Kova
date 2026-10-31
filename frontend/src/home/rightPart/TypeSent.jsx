import React, { useCallback, useEffect, useRef, useState } from 'react'
import PollDialog from './PollDialog'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuCamera, LuChartColumn, LuIndianRupee, LuPackage, LuZap, LuCheck, LuSmile, LuSparkles, LuUndo2, LuFileText, LuLoaderCircle, LuMic, LuPaperclip, LuPencil, LuReply, LuSendHorizontal, LuTrash2, LuX } from 'react-icons/lu'
import useSendMessage from '../../context/useSendMessage'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import { useSocket } from '../../context/SocketProvider'
import { canEdit, jumpToMessage } from '../../utils/messages'
import { loadConversations } from '../../utils/conversations'
import { ACCEPT, MAX_FILE_BYTES, attachmentLabel, formatBytes, prepareFile } from '../../utils/attachments'
import EmojiPopover from './EmojiPopover'
import { canPost } from '../../utils/groups'
import useVoiceRecorder, { MAX_VOICE_SECONDS } from '../../hooks/useVoiceRecorder'
import CameraDialog from './CameraDialog'
import useBusiness from '../../business/store'
import { PaymentDialog, ProductPicker, useQuickReplies } from '../../business/Compose'
import AttachMenu from './AttachMenu'
import { isBusiness } from '../../business/utils'

const MAX_HEIGHT = 160
const TYPING_IDLE_MS = 2500

// Message composer. Also handles editing a message and replying to one:
// both show a banner above the input. Enter sends, Shift+Enter adds a line,
// Esc cancels, ↑ on an empty box edits your last message.
const TypeSent = () => {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { loading, sendMessage } = useSendMessage()
  const {
    selectedConversation, messages, setMessages,
    replyingTo, setReplyingTo, editingMessage, setEditingMessage, setHighlightedId,
    pendingFile, setPendingFile,
  } = useConversation()
  const [preparing, setPreparing] = useState(false)
  const [progress, setProgress] = useState(null) // 0..1 while uploading
  const fileInputRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const closePoll = useCallback(() => setPollOpen(false), [])
  const [bizDialog, setBizDialog] = useState(null)
  const voice = useVoiceRecorder()
  const [AuthUser] = useAuth()
  const inputRef = useRef(null)
  const emojiBtnRef = useRef(null)
  const [emojiOpen, setEmojiOpen] = useState(false)

  // ✨ Nexa rewrite: shorten, make professional, etc. Keeps the old text for Undo.
  const nexaRef = useRef(null)
  const nexaBtnRef = useRef(null)
  const [nexaOpen, setNexaOpen] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [undoText, setUndoText] = useState(null)
  useEffect(() => {
    if (!nexaOpen) return
    const onDown = (e) => !nexaRef.current?.contains(e.target) && !nexaBtnRef.current?.contains(e.target) && setNexaOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [nexaOpen])
  const myId = String(AuthUser?._id)
  const { socket } = useSocket()

  // Business accounts: quick replies ("/"), product cards and payment requests in chats with customers
  const bizSettings = useBusiness((st) => st.settings)
  const bizMode = isBusiness(AuthUser) && !!selectedConversation && !selectedConversation.isGroup && !selectedConversation.isSelf && !selectedConversation.isAi
  const quick = useQuickReplies({ text, setText, settings: bizMode ? bizSettings : null, vars: { name: selectedConversation?.fullName?.split(' ')[0] }, inputRef })
  const addSent = (msg) => {
    setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]))
    useConversation.getState().upsertPreview(selectedConversation._id, msg)
  }

  // "Ask about this" on a product card puts text in the box
  useEffect(() => {
    const onCompose = (e) => { setText(String(e.detail || '')); requestAnimationFrame(() => inputRef.current?.focus()) }
    window.addEventListener('nexchat:compose', onCompose)
    return () => window.removeEventListener('nexchat:compose', onCompose)
  }, [])

  // Typing indicator: tell the other person while I'm typing
  const typingTo = useRef(null)
  const typingGroup = useRef(false) // groups relay typing to every member
  const typingTimer = useRef(null)
  const stopTypingSignal = () => {
    clearTimeout(typingTimer.current)
    if (typingTo.current) socket?.emit('stopTyping', { to: typingTo.current, group: typingGroup.current })
    typingTo.current = null
  }
  const typingSignal = () => {
    const to = selectedConversation?._id
    if (!to || !socket || String(to) === myId) return
    if (typingTo.current !== to) {
      stopTypingSignal()
      typingGroup.current = !!selectedConversation?.isGroup
      socket.emit('typing', { to, group: typingGroup.current })
      typingTo.current = to
    }
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(stopTypingSignal, TYPING_IDLE_MS)
  }
  // Stop when switching chats or leaving the page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopTypingSignal, [selectedConversation?._id])

  const handleChange = (e) => {
    const value = e.target.value
    setText(value)
    if (editingMessage) return
    if (value.trim()) typingSignal()
    else stopTypingSignal()
  }

  // ── Attachments ──────────────────────────────────────────
  const pickFile = async (file) => {
    if (!file || editingMessage) return
    setError('')
    setPreparing(true)
    try {
      setPendingFile(await prepareFile(file))
      inputRef.current?.focus()
    } catch (err) {
      setError(err.message)
    } finally {
      setPreparing(false)
    }
  }

  // Free the local preview when the file is removed or replaced
  useEffect(() => () => { if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl) }, [pendingFile])

  // Files dropped onto the chat area arrive through this event
  useEffect(() => {
    const onAttach = (e) => pickFile(e.detail)
    window.addEventListener('nexchat:attach', onAttach)
    return () => window.removeEventListener('nexchat:attach', onAttach)
  })

  const onPaste = (e) => {
    const file = e.clipboardData?.files?.[0]
    if (file && !editingMessage) { e.preventDefault(); pickFile(file) }
  }

  const focusEnd = () => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }

  const resize = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }
  useEffect(resize, [text])

  // Focus the box when opening a chat; drop any draft from the previous one
  useEffect(() => { setText(''); setError(''); setEmojiOpen(false); setUndoText(null); inputRef.current?.focus() }, [selectedConversation?._id])

  const rewrite = async (style) => {
    setNexaOpen(false)
    const original = text
    if (!original.trim()) return
    setRewriting(true)
    setError('')
    try {
      const res = await axios.post('/api/ai/rewrite', { text: original, style }, { withCredentials: true })
      setText(res.data.text)
      setUndoText(original)
      inputRef.current?.focus()
    } catch (err) {
      setError(err.response?.data?.error || "Nexa couldn't rewrite that. Try again.")
    } finally {
      setRewriting(false)
    }
  }

  // Put the emoji where the cursor is (or replace the selected text)
  const insertEmoji = (emoji) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText((prev) => prev.slice(0, start) + emoji + prev.slice(end))
    if (!editingMessage) typingSignal()
    requestAnimationFrame(() => {
      if (!el) return
      // On phones, focusing would pop the keyboard up over the picker
      if (window.matchMedia('(pointer: fine)').matches) el.focus()
      el.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  // Start editing: load the message text into the box
  useEffect(() => {
    setError('')
    if (editingMessage) {
      setText(editingMessage.message)
      requestAnimationFrame(focusEnd)
    }
  }, [editingMessage])

  // Start replying: focus the box
  useEffect(() => {
    setError('')
    if (replyingTo) inputRef.current?.focus()
  }, [replyingTo])

  const cancel = () => {
    if (editingMessage) { setEditingMessage(null); setText('') }
    else if (replyingTo) setReplyingTo(null)
    setError('')
  }

  const saveEdit = async () => {
    const value = text.trim()
    if (!value && !editingMessage.attachment) return
    if (value === editingMessage.message) { cancel(); return }
    setSaving(true)
    try {
      const res = await axios.put(`/api/message/edit/${editingMessage._id}`, { message: value }, { withCredentials: true })
      setMessages((prev) => prev.map((m) => (m._id === res.data._id ? res.data : m)))
      setEditingMessage(null)
      setText('')
      loadConversations()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save your edit. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (loading || saving || preparing) return
    if (editingMessage) return saveEdit()
    if (!text.trim() && !pendingFile) return
    const value = text
    const replyId = replyingTo?._id || null
    const file = pendingFile?.file || null
    stopTypingSignal()
    setText('')
    setUndoText(null)
    setReplyingTo(null)
    if (file) setProgress(0)
    const sendError = await sendMessage(value, replyId, file, setProgress)
    setProgress(null)
    if (sendError) { setError(sendError); setText(value) }
    else if (file) setPendingFile(null)
    inputRef.current?.focus()
  }

  const onKeyDown = (e) => {
    if (quick.onKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    else if (e.key === 'Escape' && (editingMessage || replyingTo)) { e.preventDefault(); cancel() }
    else if (e.key === 'ArrowUp' && !text && !editingMessage) {
      const lastMine = [...messages].reverse().find((m) => String(m.senderId) === myId)
      if (lastMine && canEdit(lastMine)) { e.preventDefault(); setEditingMessage(lastMine) }
    }
  }

  // ── Voice notes ──────────────────────────────────────────
  const startVoice = async () => {
    setError('')
    stopTypingSignal()
    await voice.start()
  }

  const sendVoice = async () => {
    const blob = await voice.finish()
    if (!blob || blob.size < 1000) return // too short to be useful
    if (blob.size > MAX_FILE_BYTES) { setError('Voice message is too long'); return }
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type })
    const replyId = replyingTo?._id || null
    setReplyingTo(null)
    setProgress(0)
    const sendError = await sendMessage('', replyId, file, setProgress)
    setProgress(null)
    if (sendError) setError(sendError)
  }

  // Auto-send when the time limit is reached
  useEffect(() => {
    if (voice.recording && voice.seconds >= MAX_VOICE_SECONDS) sendVoice()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.seconds])

  // Stop recording if you switch chats
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => voice.cancel(), [selectedConversation?._id])

  const busy = loading || saving
  const canSubmit = (text.trim().length > 0 || (!!pendingFile && !editingMessage) || (!!editingMessage?.attachment)) && !busy && !preparing
  // Businesses go by their full name ("Meera's Bakery", not "Meera's")
  const firstName = selectedConversation?.business?.enabled ? selectedConversation.fullName : selectedConversation?.fullName?.split(' ')[0]
  const target = editingMessage || replyingTo
  const replyName = replyingTo && (String(replyingTo.senderId) === myId
    ? 'yourself'
    : selectedConversation?.isGroup
      ? useConversation.getState().groupPeople[String(replyingTo.senderId)]?.fullName?.split(' ')[0]
        || selectedConversation.members?.find((m) => String(m._id) === String(replyingTo.senderId))?.fullName?.split(' ')[0]
      : firstName)

  // Typing "@", "@n", "@ne"… offers to mention Nexa (in groups and one-to-one chats)
  const mentionMatch = !editingMessage && text.match(/(^|\s)@(\w*)$/)
  const offerNexa = !!mentionMatch && 'nexa'.startsWith(mentionMatch[2].toLowerCase()) && mentionMatch[2].toLowerCase() !== 'nexa'
  const mentionNexa = () => {
    setText((t) => t.replace(/@\w*$/, '@Nexa '))
    inputRef.current?.focus()
  }

  // Announcements: only admins can post
  if (!canPost(selectedConversation, myId)) {
    return (
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
        Only community admins can send messages here.
      </div>
    )
  }

  return (
    <div className="relative shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950">
      <AnimatePresence>
        {emojiOpen && <EmojiPopover onPick={insertEmoji} onClose={() => setEmojiOpen(false)} toggleRef={emojiBtnRef} />}
      </AnimatePresence>

      {quick.menu}

      {nexaOpen && (
        <div ref={nexaRef} role="menu" className="absolute bottom-full right-4 z-30 mb-2 w-56 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 sm:right-6 lg:right-8 dark:bg-slate-900 dark:ring-slate-800">
          <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><LuSparkles className="size-3" /> Rewrite with Nexa</p>
          {[['shorten', 'Shorten'], ['professional', 'More professional'], ['friendly', 'Friendlier'], ['grammar', 'Fix spelling & grammar'], ['english', 'Translate to English']].map(([style, label]) => (
            <button key={style} role="menuitem" onClick={() => rewrite(style)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
              {label}
            </button>
          ))}
        </div>
      )}

      {offerNexa && (
        <button onClick={mentionNexa} className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[13px] shadow-sm ring-1 ring-violet-200 transition hover:bg-violet-50 dark:bg-slate-800 dark:ring-violet-500/30 dark:hover:bg-violet-500/10">
          <span className="flex size-5 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white"><LuSparkles className="size-3" /></span>
          <span className="font-medium">@Nexa</span>
          <span className="text-slate-500 dark:text-slate-400">{selectedConversation?.isGroup ? 'ask the AI, answers for everyone' : selectedConversation?.isSelf ? 'ask the AI here' : 'ask the AI, both of you see it'}</span>
        </button>
      )}

      {undoText !== null && !rewriting && (
        <div className="mb-2 flex items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
          <LuSparkles className="size-3.5 text-violet-500" /> Rewritten by Nexa
          <button onClick={() => { setText(undoText); setUndoText(null) }} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            <LuUndo2 className="size-3" /> Undo
          </button>
          <button onClick={() => setUndoText(null)} className="ml-auto hover:text-slate-700 dark:hover:text-slate-200">Dismiss</button>
        </div>
      )}

      {(error || voice.error) && (
        <p className="mb-2 px-1 text-xs font-medium text-red-600 dark:text-red-400">{error || voice.error}</p>
      )}

      <form
        onSubmit={handleSubmit}
        data-attach-anchor className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:focus-within:border-indigo-500/50"
      >
        {/* Reply / edit context, attached to the top of the box */}
        <AnimatePresence initial={false}>
          {target && (
            <motion.div
              key={editingMessage ? `edit-${target._id}` : `reply-${target._id}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  {editingMessage ? <LuPencil className="size-4" /> : <LuReply className="size-4" />}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToMessage(target._id, setHighlightedId)}
                  className="min-w-0 flex-1 text-left"
                  title="Show message"
                >
                  <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    {editingMessage ? 'Edit message' : `Reply to ${replyName}`}
                  </p>
                  <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">{target.message || attachmentLabel(target.attachment)}</p>
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  aria-label={editingMessage ? 'Cancel edit' : 'Cancel reply'}
                  title="Cancel (Esc)"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <LuX className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chosen file */}
        {(pendingFile || preparing) && !editingMessage && (
          <div className="relative flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
            {preparing ? (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <LuLoaderCircle className="size-5 animate-spin text-slate-400" />
              </span>
            ) : pendingFile.kind === 'image' ? (
              <img src={pendingFile.previewUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
            ) : pendingFile.kind === 'video' ? (
              <video src={pendingFile.previewUrl} muted className="size-12 shrink-0 rounded-lg bg-black object-cover" />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <LuFileText className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{preparing ? 'Preparing file…' : pendingFile.file.name}</p>
              {!preparing && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {progress !== null
                    ? `Uploading ${Math.round(progress * 100)}%`
                    : pendingFile.originalSize > pendingFile.file.size
                      ? `${formatBytes(pendingFile.file.size)} · compressed from ${formatBytes(pendingFile.originalSize)}`
                      : formatBytes(pendingFile.file.size)}
                </p>
              )}
            </div>
            {!preparing && progress === null && (
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                aria-label="Remove file"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <LuX className="size-4" />
              </button>
            )}
            {progress !== null && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100 dark:bg-slate-800">
                <div className="h-full bg-indigo-500 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {voice.recording ? (
          /* Recording a voice note */
          <div className="flex items-center gap-2 p-1.5">
            <button
              type="button"
              onClick={voice.cancel}
              aria-label="Discard voice message"
              title="Discard"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              <LuTrash2 className="size-4.5" />
            </button>
            <div className="flex flex-1 items-center gap-3 px-1">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-sm font-medium tabular-nums">
                {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}
              </span>
              <span className="text-xs text-slate-400">Recording · max {MAX_VOICE_SECONDS / 60} min</span>
            </div>
            <button
              type="button"
              onClick={sendVoice}
              aria-label="Send voice message"
              title="Send"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 active:scale-95"
            >
              <LuSendHorizontal className="size-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-1 p-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickFile(f) }}
            />
            <AttachMenu
              disabled={!!editingMessage || busy || preparing}
              items={[
                { id: 'file', label: 'Photo or file', Icon: LuPaperclip, onSelect: () => fileInputRef.current?.click() },
                ...(navigator.mediaDevices?.getUserMedia ? [{ id: 'camera', label: 'Camera', Icon: LuCamera, onSelect: () => setCameraOpen(true) }] : []),
                { id: 'poll', label: 'Poll', Icon: LuChartColumn, onSelect: () => setPollOpen(true) },
                ...(bizMode ? [
                  { id: 'product', section: 'Business', label: 'Send a product', Icon: LuPackage, onSelect: () => setBizDialog('product') },
                  { id: 'payment', section: 'Business', label: 'Request payment', Icon: LuIndianRupee, onSelect: () => setBizDialog('payment') },
                  ...(bizSettings?.quickReplies?.length || bizSettings?.templates?.length ? [{ id: 'quick', section: 'Business', label: 'Quick replies', note: '/', Icon: LuZap, onSelect: () => { setText('/'); inputRef.current?.focus() } }] : []),
                ] : []),
              ]}
            />
            <button
              ref={emojiBtnRef}
              type="button"
              onClick={() => setEmojiOpen((o) => !o)}
              aria-label="Emoji"
              aria-expanded={emojiOpen}
              title="Emoji"
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white ${
                emojiOpen ? 'bg-slate-100 text-indigo-600 dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LuSmile className="size-4.5" />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={handleChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder={editingMessage ? 'Edit your message' : selectedConversation?.isGroup ? `Message ${selectedConversation.name}` : firstName ? `Message ${firstName}` : 'Write a message'}
              className="min-h-10 flex-1 resize-none bg-transparent py-2.5 pl-1 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
              style={{ maxHeight: MAX_HEIGHT }}
            />
            {text.trim().length > 1 && !editingMessage && (
              <button
                ref={nexaBtnRef}
                type="button"
                onClick={() => setNexaOpen((o) => !o)}
                disabled={rewriting}
                aria-label="Rewrite with Nexa"
                aria-expanded={nexaOpen}
                title="Rewrite with Nexa"
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-400 ${nexaOpen || rewriting ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <LuSparkles className={`size-4.5 ${rewriting ? 'animate-pulse' : ''}`} />
              </button>
            )}
            {/* Mic when there's nothing to send, otherwise Send */}
            {!text.trim() && !pendingFile && !editingMessage && !busy ? (
              <button
                type="button"
                onClick={startVoice}
                aria-label="Record a voice message"
                title="Record a voice message"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <LuMic className="size-4.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit}
                aria-label={editingMessage ? 'Save edit' : 'Send message'}
                title={editingMessage ? 'Save edit' : 'Send'}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 active:scale-95 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                {busy ? <LuLoaderCircle className="size-4 animate-spin" />
                  : editingMessage ? <LuCheck className="size-4" />
                  : <LuSendHorizontal className="size-4" />}
              </button>
            )}
          </div>
        )}
      </form>

      <AnimatePresence>
        {cameraOpen && <CameraDialog onClose={() => setCameraOpen(false)} onCapture={pickFile} />}
      </AnimatePresence>
      <PollDialog open={pollOpen} onClose={closePoll} />
      {bizDialog === 'product' && <ProductPicker biz="me" customerId={selectedConversation._id} onClose={() => setBizDialog(null)} onSent={addSent} />}
      {bizDialog === 'payment' && <PaymentDialog biz="me" customerId={selectedConversation._id} onClose={() => setBizDialog(null)} onSent={addSent} hasUpi={!!AuthUser?.business?.upiId} />}

    </div>
  )
}

export default TypeSent
