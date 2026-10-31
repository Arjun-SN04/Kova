import React, { useEffect, useState } from 'react'
import { LuFingerprint, LuKeyRound, LuLock, LuTimer } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import Sheet from '../home/groups/Sheet'
import Select from './ui/Select'
import { LOCK_AFTER, bioAvailable, checkPin, enableBio, getLock, removeLock, setPin, updateLock } from '../utils/appLock'
import SecretInput from './SecretInput'

const pinInput = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-xl tracking-[0.5em] outline-none transition placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900'
const digits = (v) => v.replace(/\D/g, '').slice(0, 6)

// Set a new PIN (asks for the current one first when changing or turning off)
const PinDialog = ({ mode, userId, onClose, onDone }) => {
  const [current, setCurrent] = useState('')
  const [pin, setPinValue] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const needsCurrent = mode !== 'create'
  const needsNew = mode !== 'off'
  const ready = (!needsCurrent || current.length >= 4) && (!needsNew || (pin.length >= 4 && pin === again))
  const submit = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true); setError('')
    if (needsCurrent && !(await checkPin(userId, current))) { setBusy(false); setError('That’s not your current PIN'); setCurrent(''); return }
    if (mode === 'off') removeLock(userId)
    else await setPin(userId, pin)
    setBusy(false); onDone?.(); onClose()
  }
  const title = mode === 'create' ? 'Set an app lock PIN' : mode === 'change' ? 'Change PIN' : 'Turn off app lock'
  return (
    <Sheet open onClose={onClose} title={title} footer={
      <button onClick={submit} disabled={!ready || busy} className={`h-11 w-full rounded-xl text-sm font-medium text-white transition disabled:opacity-40 ${mode === 'off' ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
        {mode === 'off' ? 'Turn off' : 'Save PIN'}
      </button>
    }>
      <form onSubmit={submit} className="space-y-3 pt-1">
        {mode === 'create' && <p className="text-[13px] text-slate-500 dark:text-slate-400">You’ll enter this PIN to open Kova on this device. Use 4 to 6 digits.</p>}
        {needsCurrent && <SecretInput inputMode="numeric" autoFocus value={current} onChange={(e) => setCurrent(digits(e.target.value))} placeholder="Current PIN" aria-label="Current PIN" className={pinInput} />}
        {needsNew && (
          <>
            <SecretInput inputMode="numeric" autoFocus={!needsCurrent} value={pin} onChange={(e) => setPinValue(digits(e.target.value))} placeholder="New PIN" aria-label="New PIN" className={pinInput} />
            <SecretInput inputMode="numeric" value={again} onChange={(e) => setAgain(digits(e.target.value))} placeholder="Type it again" aria-label="Confirm PIN" className={pinInput} />
            {again.length >= 4 && again !== pin && <p className="text-xs text-slate-500">The PINs don’t match yet.</p>}
          </>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Sheet>
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
    <div className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuLock className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">App lock</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Ask for a PIN when Kova opens on this device.</p>
        </div>
        <button type="button" role="switch" aria-checked={!!lock} aria-label="App lock" onClick={() => setDialog(lock ? 'off' : 'create')} className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${lock ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
          <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${lock ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {lock && (
        <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <div className={`${row} flex-wrap`}>
            <LuTimer className="size-4 shrink-0 text-slate-400" />
            <p className="min-w-0 flex-1 text-sm font-medium">Lock</p>
            <div className="w-44"><Select size="sm" value={lock.after ?? 0} onChange={(v) => updateLock(id, { after: Number(v) })} options={LOCK_AFTER} aria-label="Lock after" /></div>
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
