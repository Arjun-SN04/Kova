import React, { useState } from 'react'
import { LuKeyRound, LuLock, LuShieldQuestion } from 'react-icons/lu'
import { useAuth } from '../../context/AuthProvider'
import useConversation from '../../Zustand/UserConversation'
import { changeLockCode, resetLockCode } from '../../utils/chatExtras'
import { checkPin, getLock, setPin } from '../../utils/appLock'
import { Label, LinkButton, LinkCheckbox, NewCodeFields, PasscodeInput, QuestionFields, RecoveryBlock, SecureDialog } from '../../components/security/SecurityUI'
import { recoveryReady, useNewCode, useQuestion } from '../../components/security/passcode'

// Secret code for locked chats.
//   mode "create": choose a code (typed twice), then onSubmit(code)
//   mode "enter":  type the code, onSubmit(code) checks it
//   mode "change": current code + new code
//   mode "reset":  straight to the email reset
// "Forgot code?" resets it with the answer to your security question (or your account password).
// chats: the chats involved, to show their photos. onSubmit(code, qa) gets the security question on create.
const LockCodeDialog = ({ mode, title, description, onSubmit, onClose, chats }) => {
  const [AuthUser] = useAuth()
  const userId = AuthUser?._id
  const savedKind = useConversation((s) => s.lockCodeKind) || 'numeric'
  const [step, setStep] = useState(mode) // create | enter | change | reset
  const [code, setCode] = useState('') // enter: the code; change: the current code
  const next = useNewCode(step === 'change' ? savedKind : 'numeric')
  const securityQuestion = useConversation((s) => s.securityQuestion)
  const [proof, setProof] = useState({}) // { answer } or { password }
  // First code: also set up the security question (if there isn't one)
  const qa = useQuestion()
  const askQuestion = step === 'create' && !securityQuestion
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Also use the new code as this device's app lock PIN
  const appLock = getLock(userId)
  const [link, setLink] = useState(false)
  const [appCurrent, setAppCurrent] = useState('')
  const canLink = step === 'create' || step === 'change'
  const linkReady = !link || !appLock || appCurrent.length >= 4

  const ready = step === 'enter' ? code.length >= 4
    : step === 'create' ? next.valid && linkReady && (!askQuestion || qa.valid)
    : step === 'change' ? code.length >= 4 && next.valid && linkReady
    : recoveryReady(securityQuestion, proof) && next.valid

  const go = (s) => { setStep(s); setError(''); setCode(''); setProof({}); next.reset() }

  const submit = async () => {
    setBusy(true); setError('')
    const done = (res) => { setBusy(false); if (!res.ok) setError(res.error); return res.ok }

    if (step === 'enter') {
      const res = await onSubmit(code)
      if (!done(res)) { setCode(''); return }
      return onClose()
    }
    if (step === 'reset') {
      if (!done(await resetLockCode(proof, next.code))) return
      // Came here from "enter": carry on with the new code (open / unlock)
      if (mode === 'enter') { setBusy(true); const res = await onSubmit(next.code); if (!done(res)) return go('enter') }
      return onClose()
    }
    // create / change
    if (link && appLock && !(await checkPin(userId, appCurrent))) { setAppCurrent(''); return done({ ok: false, error: 'That’s not your app lock PIN' }) }
    const res = step === 'create' ? await onSubmit(next.code, askQuestion ? qa.payload : {}) : await changeLockCode(code, next.code)
    if (!done(res)) { if (step === 'change') setCode(''); return }
    if (link) await setPin(userId, next.code, next.kind)
    onClose()
  }

  const copy = {
    enter: [title, description, 'Unlock', 'Checking…', LuLock],
    create: ['Create a chat lock code', 'You’ll use it to open locked chats on any device.', 'Save code', 'Saving…', LuKeyRound],
    change: ['Change chat lock code', 'Enter your current code, then choose a new one.', 'Change code', 'Saving…', LuKeyRound],
    reset: ['Reset chat lock code', securityQuestion ? 'Answer your security question, then choose a new code. Your locked chats stay locked.' : 'Confirm it’s you, then choose a new code. Your locked chats stay locked.', 'Save new code', 'Saving…', LuShieldQuestion],
  }[step]

  return (
    <SecureDialog
      onClose={onClose} chats={chats} title={copy[0]} subtitle={copy[1]} icon={copy[4]}
      onSubmit={submit} submitLabel={copy[2]} busyLabel={copy[3]} ready={ready} busy={busy} error={error}
      links={
        step === 'enter' ? <LinkButton onClick={() => go('reset')}>Forgot code?</LinkButton>
          : step === 'change' ? <LinkButton onClick={() => go('reset')}>Forgot current code?</LinkButton>
            : step === 'reset' && (mode === 'enter' || mode === 'change') ? <LinkButton muted onClick={() => go(mode)}>Back</LinkButton>
              : null
      }
    >
      {step === 'enter' && (
        <PasscodeInput kind={savedKind === 'numeric' ? 'numeric' : 'alnum'} value={code} onChange={setCode} placeholder="Secret code" aria-label="Secret code" autoComplete="current-password" autoFocus />
      )}

      {step === 'change' && (
        <>
          <Label>Current code</Label>
          <PasscodeInput kind={savedKind} value={code} onChange={setCode} placeholder="Current code" aria-label="Current code" autoComplete="current-password" autoFocus />
        </>
      )}

      {step === 'reset' && <RecoveryBlock question={securityQuestion} value={proof} onChange={setProof} />}

      {(step === 'create' || step === 'change' || step === 'reset') && (
        <NewCodeFields state={next} label="New code" autoFocus={step === 'create'} />
      )}
      {askQuestion && <QuestionFields value={qa.value} onChange={qa.setValue} label="Security question" />}

      {canLink && (
        <LinkCheckbox
          checked={link} onChange={setLink}
          title="Use this as my app lock PIN too"
          hint={appLock ? 'Replaces your current app lock PIN on this device.' : 'Turns on app lock for this device with the same code.'}
        />
      )}
      {canLink && link && appLock && (
        <PasscodeInput kind={appLock.kind === 'alnum' ? 'alnum' : 'numeric'} value={appCurrent} onChange={setAppCurrent} placeholder="Current app lock PIN" aria-label="Current app lock PIN" autoComplete="off" />
      )}
    </SecureDialog>
  )
}

export default LockCodeDialog
