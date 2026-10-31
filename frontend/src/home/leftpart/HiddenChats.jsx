import React, { useEffect, useState } from 'react'
import { LuEyeOff } from 'react-icons/lu'
import Sheet from '../groups/Sheet'
import SecretInput from '../../components/SecretInput'
import useConversation from '../../Zustand/UserConversation'
import { saveHiddenWord, setChatHidden } from '../../utils/chatExtras'

const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white text-center text-base text-slate-900 outline-none transition placeholder:text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

// Choose (or change) the secret word that shows hidden chats when typed in search
export const HiddenWordDialog = ({ onClose, onSaved, changing = false }) => {
  const [word, setWord] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clean = word.trim()
  const ready = clean.length >= 3 && clean.toLowerCase() === again.trim().toLowerCase()
  const save = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true); setError('')
    const res = await saveHiddenWord(clean)
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    await onSaved?.()
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={changing ? 'Change secret word' : 'Choose a secret word'} footer={
      <button onClick={save} disabled={!ready || busy} className="h-11 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">{busy ? 'Saving…' : 'Save word'}</button>
    }>
      <form onSubmit={save} className="space-y-3 pt-1">
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <LuEyeOff className="mt-0.5 size-4 shrink-0 text-indigo-500" />
          <p>Hidden chats don’t show in your chat list, search or contacts. Type this word in the chat search box to see them. Use 3 to 30 characters; capitals don’t matter.</p>
        </div>
        <SecretInput value={word} onChange={(e) => setWord(e.target.value.slice(0, 30))} placeholder="Secret word" aria-label="Secret word" autoComplete="new-password" className={field} autoFocus />
        <SecretInput value={again} onChange={(e) => setAgain(e.target.value.slice(0, 30))} placeholder="Type it again" aria-label="Confirm secret word" autoComplete="new-password" className={field} />
        {again.trim().length >= 3 && clean.toLowerCase() !== again.trim().toLowerCase() && <p className="text-xs text-slate-500">The words don’t match yet.</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Sheet>
  )
}

// Handles store().hideRequest from anywhere: hide the chats (asking for a secret word first if needed)
export const HideChatsHost = () => {
  const { hideRequest, setHideRequest, hiddenWordHash } = useConversation()
  const close = () => setHideRequest(null)

  const hideAll = async (ids, hidden = true) => {
    for (const id of ids) await setChatHidden(id, hidden)
    const s = useConversation.getState()
    if (hidden && ids.includes(String(s.selectedConversation?._id))) s.setSelectedConversation(null)
  }

  // With a word already set, no dialog is needed
  useEffect(() => {
    if (!hideRequest) return
    if (hideRequest.hidden === false || hiddenWordHash) hideAll(hideRequest.ids, hideRequest.hidden !== false).finally(close)
  }, [hideRequest, hiddenWordHash]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hideRequest || hideRequest.hidden === false || hiddenWordHash) return null
  return <HiddenWordDialog onClose={close} onSaved={() => hideAll(hideRequest.ids)} />
}
