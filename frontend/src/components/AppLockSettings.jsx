import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuFingerprint, LuKeyRound, LuLock, LuShieldQuestion, LuTimer } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import Select from './ui/Select'
import { Row, RowGroup, SectionHeader, Switch } from './security/SettingsRows'
import { LOCK_AFTER, bioAvailable, checkPin, enableBio, getLock, removeLock, setPin, updateLock } from '../utils/appLock'
import useConversation from '../Zustand/UserConversation'
import { changeLockCode, verifyRecovery } from '../utils/chatExtras'
import { Label, RecoveryBlock, LinkButton, LinkCheckbox, NewCodeFields, PasscodeInput, SecureDialog } from './security/SecurityUI'
import { useNewCode, recoveryReady } from './security/passcode'

// Set, change, turn off or reset (by email) the app lock PIN.
//   mode: create | change | off | forgot (from the lock screen: security question answer, then a new PIN)
export const PinDialog = ({ mode, userId, onClose, onDone, z }) => {
  const lock = getLock(userId)
  const { hasLockCode } = useConversation()
  const [step, setStep] = useState(mode === 'forgot' ? 'reset' : mode) // create | change | off | reset
  const [current, setCurrent] = useState('')
  const next = useNewCode(lock?.kind === 'alnum' ? 'alnum' : 'numeric')
  const securityQuestion = useConversation((s) => s.securityQuestion)
  const [proof, setProof] = useState({}) // { answer } or { password }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Also use the new PIN as the chat lock code
  const [link, setLink] = useState(false)
  const [chatCurrent, setChatCurrent] = useState('')
  const savedChatKind = useConversation((s) => s.lockCodeKind) || 'numeric'
  // The lock screen can show before the chat list has loaded the security question
  useEffect(() => {
    if (mode !== 'forgot') return
    axios.get('/api/message/prefs', { withCredentials: true }).then((r) => useConversation.getState().setLockedPrefs(r.data)).catch(() => {})
  }, [mode])

  const turningOff = mode === 'off'
  const canLink = step === 'create' || step === 'change'
  const linkReady = !link || !hasLockCode || chatCurrent.length >= 4
  const ready = step === 'create' ? next.valid && linkReady
    : step === 'change' ? current.length >= 4 && next.valid && linkReady
    : step === 'off' ? current.length >= 4
    : recoveryReady(securityQuestion, proof) && (turningOff || next.valid)

  const go = (s) => { setStep(s); setError(''); setCurrent(''); setProof({}); next.reset() }
  const fail = (msg) => { setBusy(false); setError(msg) }

  const submit = async () => {
    setBusy(true); setError('')
    if (step === 'reset') {
      const res = await verifyRecovery(proof)
      if (!res.ok) return fail(res.error)
    } else if (step !== 'create' && !(await checkPin(userId, current))) {
      setCurrent(''); return fail('That’s not your current PIN')
    }
    if (turningOff) removeLock(userId)
    else {
      if (link && canLink) {
        const res = await changeLockCode(chatCurrent, next.code)
        if (!res.ok) { setChatCurrent(''); return fail(/current code/.test(res.error) ? 'That’s not your chat lock code' : res.error) }
      }
      await setPin(userId, next.code, next.kind)
    }
    setBusy(false); onDone?.(); onClose()
  }

  const copy = {
    create: ['Set an app lock PIN', 'You’ll enter this to open Kova on this device.', 'Save PIN'],
    change: ['Change app lock PIN', 'Enter your current PIN, then choose a new one.', 'Change PIN'],
    off: ['Turn off app lock?', 'Enter your PIN. Kova will open without asking for it on this device.', 'Turn off'],
    reset: turningOff
      ? ['Turn off app lock', 'Confirm it’s you to turn off app lock on this device.', 'Turn off']
      : ['Reset app lock PIN', 'Confirm it’s you, then choose a new PIN.', mode === 'forgot' ? 'Save and unlock' : 'Save PIN'],
  }[step]

  return (
    <SecureDialog
      z={z} onClose={onClose} title={copy[0]} subtitle={copy[1]} icon={step === 'reset' ? LuShieldQuestion : LuLock}
      tone={turningOff ? 'red' : 'indigo'}
      onSubmit={submit} submitLabel={copy[2]} busyLabel="Saving…" ready={ready} busy={busy} error={error}
      links={
        step === 'change' || step === 'off' ? <LinkButton onClick={() => go('reset')}>Forgot PIN?</LinkButton>
          : step === 'reset' && mode !== 'forgot' ? <LinkButton muted onClick={() => go(mode)}>Back</LinkButton>
            : null
      }
    >
      {(step === 'change' || step === 'off') && (
        <>
          {step === 'change' && <Label>Current PIN</Label>}
          <PasscodeInput kind={lock?.kind === 'alnum' ? 'alnum' : 'numeric'} value={current} onChange={setCurrent} placeholder="Current PIN" aria-label="Current PIN" autoComplete="current-password" autoFocus />
        </>
      )}
      {step === 'reset' && <RecoveryBlock question={securityQuestion} value={proof} onChange={setProof} />}
      {(step === 'create' || step === 'change' || (step === 'reset' && !turningOff)) && (
        <NewCodeFields state={next} label="New PIN" autoFocus={step === 'create'} />
      )}
      {canLink && (
        <LinkCheckbox
          checked={link} onChange={setLink}
          title="Use this as my chat lock code too"
          hint={hasLockCode ? 'Replaces the code for your locked chats on every device.' : 'Locked chats will open with the same code.'}
        />
      )}
      {canLink && link && hasLockCode && (
        <PasscodeInput kind={savedChatKind} value={chatCurrent} onChange={setChatCurrent} placeholder="Current chat lock code" aria-label="Current chat lock code" autoComplete="off" />
      )}
    </SecureDialog>
  )
}

// Profile → App lock
const AppLockSettings = () => {
  const [AuthUser] = useAuth()
  const id = AuthUser?._id
  const [lock, setLock] = useState(() => getLock(id))
  const [dialog, setDialog] = useState(null) // create | change | off
  const [bioOk, setBioOk] = useState(false)
  const [bioError, setBioError] = useState('')

  useEffect(() => { bioAvailable().then(setBioOk) }, [])
  useEffect(() => {
    const onChange = () => setLock(getLock(id))
    window.addEventListener('kova-applock', onChange)
    return () => window.removeEventListener('kova-applock', onChange)
  }, [id])

  const toggleBio = async () => {
    setBioError('')
    if (lock.credId) { updateLock(id, { credId: null }); return }
    try { await enableBio(AuthUser) } catch { setBioError('Couldn’t set it up. Your device may not support it here.') }
  }

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        icon={LuLock} title="App lock"
        on={!!lock} status={lock ? 'On' : 'Off'}
        description="Ask for a PIN (numbers, or letters and numbers) when Kova opens on this device."
        action={<span className="mt-1"><Switch checked={!!lock} label="App lock" onChange={() => setDialog(lock ? 'off' : 'create')} /></span>}
      />
      {lock && (
        <RowGroup>
          <Row
            icon={LuTimer} title="Ask for the PIN again" description="After you leave Kova (switch apps or tabs) for this long"
            control={<div className="sm:w-44"><Select size="sm" value={lock.after ?? 0} onChange={(v) => updateLock(id, { after: Number(v) })} options={LOCK_AFTER} aria-label="Lock after" /></div>}
          />
          {bioOk && (
            <Row
              icon={LuFingerprint} title="Fingerprint or device unlock"
              description={bioError || 'Use your fingerprint, face or device PIN instead of typing your Kova PIN'}
              control={<Switch checked={!!lock.credId} label="Fingerprint or device unlock" onChange={toggleBio} />}
            />
          )}
          <Row icon={LuKeyRound} title="Change PIN" description="Pick a new PIN for this device" onClick={() => setDialog('change')} />
        </RowGroup>
      )}
      {dialog && <PinDialog mode={dialog} userId={id} onClose={() => setDialog(null)} />}
    </div>
  )
}

export default AppLockSettings
