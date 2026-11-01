import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuFingerprint, LuKeyRound, LuLock, LuShieldQuestion, LuTimer } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import Select from './ui/Select'
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

  const row = 'flex items-center gap-3 px-4 py-3.5'
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuLock className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base sm:text-lg">App lock</p>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">Ask for a PIN (numbers, or letters and numbers) when Kova opens on this device.</p>
        </div>
        <button type="button" role="switch" aria-checked={!!lock} aria-label="App lock" onClick={() => setDialog(lock ? 'off' : 'create')} className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${lock ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
          <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${lock ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {lock && (
        <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <LuTimer className="size-4 shrink-0 text-slate-400" />
              <p className="min-w-0 flex-1 text-sm font-medium">Lock</p>
            </div>
            <div className="w-full shrink-0 pl-7 sm:w-44 sm:pl-0">
              <Select size="sm" value={lock.after ?? 0} onChange={(v) => updateLock(id, { after: Number(v) })} options={LOCK_AFTER} aria-label="Lock after" />
            </div>
          </div>
          {bioOk && (
            <div className={row}>
              <LuFingerprint className="size-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Fingerprint or device unlock</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{bioError || 'Use your fingerprint, face or device PIN instead of typing your Kova PIN.'}</p>
              </div>
              <button type="button" role="switch" aria-checked={!!lock.credId} aria-label="Fingerprint or device unlock" onClick={toggleBio} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${lock.credId ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${lock.credId ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          )}
          <button onClick={() => setDialog('change')} className={`${row} w-full text-left transition hover:bg-slate-50 dark:hover:bg-slate-900`}>
            <LuKeyRound className="size-4 shrink-0 text-slate-400" />
            <span className="text-sm font-medium">Change PIN</span>
          </button>
        </div>
      )}
      {dialog && <PinDialog mode={dialog} userId={id} onClose={() => setDialog(null)} />}
    </div>
  )
}

export default AppLockSettings
