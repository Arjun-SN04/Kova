import React, { useEffect, useState } from 'react'
import { LuEyeOff, LuShieldQuestion } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { saveHiddenWord, setChatHidden } from '../../utils/chatExtras'
import { Label, LinkButton, PasscodeInput, RecoveryBlock, SecureDialog } from '../../components/security/SecurityUI'
import { recoveryReady } from '../../components/security/passcode'

// The secret word that shows hidden chats when typed in search.
//   mode "create": choose a word
//   mode "change": current word + new word
//   mode "off":    current word, then hidden chats go back to the list
// "Forgot it?" uses the security question answer (or account password) instead.
export const HiddenWordDialog = ({ onClose, onSaved, mode = 'create' }) => {
  const [step, setStep] = useState(mode) // create | change | off | reset
  const [current, setCurrent] = useState('')
  const [word, setWord] = useState('')
  const [again, setAgain] = useState('')
  const securityQuestion = useConversation((s) => s.securityQuestion)
  const [proof, setProof] = useState({}) // { answer } or { password }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const turningOff = mode === 'off'
  const clean = word.trim()
  const wordOk = clean.length >= 3 && clean.toLowerCase() === again.trim().toLowerCase()
  const ready = step === 'create' ? wordOk
    : step === 'change' ? current.trim().length >= 3 && wordOk
    : step === 'off' ? current.trim().length >= 3
    : recoveryReady(securityQuestion, proof) && (turningOff || wordOk)

  const go = (s) => { setStep(s); setError(''); setCurrent(''); setProof({}) }

  const save = async () => {
    setBusy(true); setError('')
    const res = await saveHiddenWord(turningOff ? null : clean, step === 'reset' ? proof : step === 'create' ? {} : { current })
    setBusy(false)
    if (!res.ok) { setError(res.error); if (step !== 'reset') setCurrent(''); return }
    await onSaved?.()
    onClose()
  }

  const copy = {
    create: ['Choose a secret word', 'Hidden chats leave your chat list, search and contacts. Type this word in the chat search box to see them.', 'Save word'],
    change: ['Change secret word', 'Enter your current secret word, then choose a new one.', 'Change word'],
    off: ['Turn off hidden chats?', 'Enter your secret word. Every hidden chat goes back to your chat list.', 'Turn off'],
    reset: turningOff
      ? ['Turn off hidden chats', 'Confirm it’s you. Every hidden chat goes back to your chat list.', 'Turn off']
      : ['Reset secret word', 'Confirm it’s you, then choose a new word. Your hidden chats stay hidden.', 'Save new word'],
  }[step]

  const showNew = step === 'create' || step === 'change' || (step === 'reset' && !turningOff)
  return (
    <SecureDialog
      onClose={onClose} title={copy[0]} subtitle={copy[1]} icon={step === 'reset' ? LuShieldQuestion : LuEyeOff}
      tone={turningOff ? 'red' : 'indigo'}
      onSubmit={save} submitLabel={copy[2]} busyLabel="Saving…" ready={ready} busy={busy} error={error}
      links={
        step === 'change' || step === 'off' ? <LinkButton onClick={() => go('reset')}>Forgot secret word?</LinkButton>
          : step === 'reset' ? <LinkButton muted onClick={() => go(mode)}>Back</LinkButton>
            : null
      }
    >
      {(step === 'change' || step === 'off') && (
        <>
          {step === 'change' && <Label>Current word</Label>}
          <PasscodeInput kind="text" value={current} onChange={setCurrent} placeholder="Current secret word" aria-label="Current secret word" autoComplete="current-password" autoFocus />
        </>
      )}
      {step === 'reset' && <RecoveryBlock question={securityQuestion} value={proof} onChange={setProof} />}
      {showNew && (
        <>
          {step !== 'create' && <Label>New word</Label>}
          <PasscodeInput kind="text" value={word} onChange={setWord} placeholder="3 to 30 characters" aria-label="Secret word" autoComplete="new-password" autoFocus={step === 'create'} />
          <PasscodeInput kind="text" value={again} onChange={setAgain} placeholder="Type it again" aria-label="Confirm secret word" autoComplete="new-password" />
          {again.trim().length >= 3 && clean.toLowerCase() !== again.trim().toLowerCase()
            ? <p className="text-center text-xs text-slate-500">The words don’t match yet.</p>
            : <p className="text-center text-xs text-slate-500">Capitals don’t matter.</p>}
        </>
      )}
    </SecureDialog>
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
