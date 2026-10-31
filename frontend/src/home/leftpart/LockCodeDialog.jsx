import React, { useState } from 'react'
import { LuLock } from 'react-icons/lu'
import Sheet from '../groups/Sheet'
import { resetLockCode } from '../../utils/chatExtras'
import SecretInput from '../../components/SecretInput'

const codeInput = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-xl tracking-[0.5em] text-slate-900 outline-none transition placeholder:tracking-normal placeholder:text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
const digits = (v) => v.replace(/\D/g, '').slice(0, 10)

// Secret code for locked chats.
//   mode "create": choose a code (typed twice), then onSubmit(code)
//   mode "enter":  type the code, onSubmit(code) checks it; "Forgot code?" resets it with the account password
const LockCodeDialog = ({ mode, title, description, onSubmit, onClose }) => {
  const [step, setStep] = useState(mode) // create | enter | reset
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const valid = code.length >= 4
  const ready = step === 'enter' ? valid : step === 'create' ? valid && again === code : valid && password
  const submit = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true); setError('')
    const res = step === 'reset' ? await resetLockCode(password, code) : await onSubmit(code)
    setBusy(false)
    if (!res.ok) { setError(res.error); if (step === 'enter') setCode(''); return }
    if (step === 'reset') { setStep('enter'); setCode(''); setPassword(''); return }
    onClose()
  }

  const heading = step === 'reset' ? 'Reset your secret code' : step === 'create' ? 'Choose a secret code' : title
  const text = step === 'reset'
    ? 'Enter your Kova account password and choose a new code. Your locked chats stay as they are.'
    : step === 'create'
      ? 'You’ll use this code to open locked chats on any device. Use 4 to 10 digits.'
      : description

  return (
    <Sheet open onClose={onClose} title={heading} footer={
      <button onClick={submit} disabled={!ready || busy} className="h-11 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">
        {busy ? 'Checking…' : step === 'reset' ? 'Set new code' : step === 'create' ? 'Save code' : 'Unlock'}
      </button>
    }>
      <form onSubmit={submit} className="space-y-3 pt-1">
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <LuLock className="mt-0.5 size-4 shrink-0 text-indigo-500" />
          <p>{text}</p>
        </div>
        {step === 'reset' && (
          <SecretInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Account password" autoComplete="current-password" className={`${codeInput} tracking-normal text-base`} autoFocus />
        )}
        <SecretInput
          inputMode="numeric"
          autoComplete="new-password"
          value={code}
          onChange={(e) => setCode(digits(e.target.value))}
          placeholder={step === 'enter' ? 'Secret code' : 'New code (4–10 digits)'}
          aria-label="Secret code"
          className={codeInput}
          autoFocus={step !== 'reset'}
        />
        {step === 'create' && (
          <SecretInput inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(digits(e.target.value))} placeholder="Type it again" aria-label="Confirm secret code" className={codeInput} />
        )}
        {step === 'create' && again.length >= 4 && again !== code && <p className="text-xs text-slate-500">The codes don’t match yet.</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {step === 'enter' && (
          <button type="button" onClick={() => { setStep('reset'); setError(''); setCode('') }} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Forgot code?</button>
        )}
        {step === 'reset' && (
          <button type="button" onClick={() => { setStep('enter'); setError('') }} className="text-xs font-medium text-slate-500 hover:underline">Back</button>
        )}
      </form>
    </Sheet>
  )
}

export default LockCodeDialog
