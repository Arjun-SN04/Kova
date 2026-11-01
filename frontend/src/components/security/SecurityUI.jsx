import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuCheck, LuKeyRound, LuLock, LuShieldQuestion, LuX } from 'react-icons/lu'
import { useAuth } from '../../context/AuthProvider'
import Avatar, { GroupAvatar } from '../../home/Avatar'
import Select from '../ui/Select'
import SecretInput from '../SecretInput'
import { LIMITS, QUESTIONS, cleanCode, codeHint } from './passcode'

// Shared pieces for the lock code, secret word and app PIN dialogs.

// Photo of a chat: the person's picture, or the group's
const ChatPhoto = ({ chat, size }) => (chat.isGroup || chat.isCommunity
  ? <GroupAvatar name={chat.name} src={chat.avatar?.url} announcement={chat.announcement} community={chat.isCommunity} size={size} />
  : <Avatar name={chat.fullName} src={chat.avatar?.url} size={size} />)

// ── Dialog shell: photo with a lock badge, title, text, then the form.
// `chats` (the chats being opened / locked) shows their photos; without it, your own.
export const SecureDialog = ({ onClose, title, subtitle, icon: Icon = LuLock, tone = 'indigo', onSubmit, submitLabel, busyLabel = 'Please wait…', ready = true, busy = false, error, links, children, z = 'z-[60]', chats }) => {
  const [AuthUser] = useAuth()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e) => { e?.preventDefault(); if (ready && !busy) onSubmit() }
  const danger = tone === 'red'
  return createPortal(
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 ${z} flex items-end justify-center bg-slate-950/50 backdrop-blur-md sm:items-center sm:p-4`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          role="dialog" aria-modal="true" aria-label={title}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-white px-6 pb-6 pt-9 text-slate-900 shadow-2xl ring-1 ring-black/5 sm:rounded-3xl dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10"
        >
          <div className={`pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${danger ? 'from-red-500/10' : 'from-indigo-500/12'} to-transparent`} />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
            <LuX className="size-4.5" />
          </button>

          <div className="relative flex flex-col items-center text-center">
            <div className="relative rounded-full p-1 ring-1 ring-slate-200 dark:ring-slate-700">
              {chats?.length > 1 ? (
                <div className="flex size-20 items-center justify-center">
                  <div className="flex -space-x-4">
                    {chats.slice(0, 3).map((c) => <div key={c._id} className="rounded-full ring-2 ring-white dark:ring-slate-900"><ChatPhoto chat={c} size="md" /></div>)}
                  </div>
                </div>
              ) : chats?.length === 1 ? <ChatPhoto chat={chats[0]} size="lg" />
                : <Avatar name={AuthUser?.fullName} src={AuthUser?.avatar?.url} size="lg" />}
              <span className={`absolute -bottom-0.5 -right-0.5 flex size-8 items-center justify-center rounded-full text-white ring-4 ring-white dark:ring-slate-900 ${danger ? 'bg-red-600' : 'bg-indigo-600'}`}>
                <Icon className="size-4" />
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
            {subtitle && <p className="mt-1 max-w-[18rem] text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>

          <form onSubmit={submit} className="relative mt-6 space-y-3">
            {children}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
            <button type="submit" disabled={!ready || busy} className={`mt-1 h-12 w-full rounded-xl text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-40 ${danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
              {busy ? busyLabel : submitLabel}
            </button>
          </form>
          {links && <div className="relative mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">{links}</div>}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

export const LinkButton = ({ children, muted = false, ...props }) => (
  <button type="button" {...props} className={`font-medium hover:underline ${muted ? 'text-slate-500 dark:text-slate-400' : 'text-indigo-600 dark:text-indigo-400'}`}>{children}</button>
)

// ── Fields ──
const fieldCls = 'h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 text-center text-lg text-slate-900 outline-none transition placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:text-white dark:focus:bg-slate-900'

export const Label = ({ children, right }) => (
  <div className="flex items-center justify-between gap-2 pt-1">
    <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</span>
    {right}
  </div>
)

// A passcode box. kind: numeric | alnum | text (secret word: anything up to 30)
export const PasscodeInput = ({ value, onChange, kind = 'numeric', ...props }) => (
  <SecretInput
    {...props}
    value={value}
    onChange={(e) => onChange(kind === 'text' ? e.target.value.slice(0, 30) : cleanCode(e.target.value, kind))}
    inputMode={kind === 'numeric' ? 'numeric' : 'text'}
    autoCapitalize="off" autoCorrect="off" spellCheck={false}
    className={`${fieldCls} ${kind === 'numeric' ? 'tracking-[0.4em]' : 'tracking-wider'}`}
  />
)

// Numbers only vs letters and numbers
export const KindToggle = ({ kind, onChange }) => (
  <div role="radiogroup" aria-label="Code type" className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium dark:bg-slate-800">
    {[['numeric', '123'], ['alnum', 'Abc 123']].map(([k, label]) => (
      <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => onChange(k)}
        className={`rounded-md px-2.5 py-1 transition ${kind === k ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}>
        {label}
      </button>
    ))}
  </div>
)

export const NewCodeFields = ({ state, label = 'New code', autoFocus = false }) => {
  const { kind, setKind, code, setCode, again, setAgain } = state
  return (
    <>
      <Label right={<KindToggle kind={kind} onChange={setKind} />}>{label}</Label>
      <PasscodeInput kind={kind} value={code} onChange={setCode} placeholder={codeHint(kind)} aria-label={label} autoComplete="new-password" autoFocus={autoFocus} />
      <PasscodeInput kind={kind} value={again} onChange={setAgain} placeholder="Type it again" aria-label={`Confirm ${label.toLowerCase()}`} autoComplete="new-password" />
      {again.length >= LIMITS[kind][0] && again !== code && <p className="text-center text-xs text-slate-500">They don’t match yet.</p>}
    </>
  )
}

// "Use this for app lock too" checkbox
export const LinkCheckbox = ({ checked, onChange, title, hint }) => (
  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${checked ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'}`}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
    <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-500/20 ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
      {checked && <LuCheck className="size-3.5" />}
    </span>
    <span className="min-w-0 text-left">
      <span className="block text-sm font-medium">{title}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </span>
  </label>
)

// ── 6-digit emailed code ──
export const OtpInput = ({ value, onChange, autoFocus = true }) => {
  const refs = useRef([])
  const chars = value.padEnd(6, ' ').slice(0, 6).split('')
  const setAt = (i, ch) => {
    const next = chars.map((c, j) => (j === i ? ch || ' ' : c)).join('').replace(/\s+$/, '')
    onChange(next.replace(/ /g, ''))
  }
  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) { refs.current[i - 1]?.focus(); setAt(i - 1, '') ; e.preventDefault() }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }
  const onInput = (i, e) => {
    const typed = e.target.value.replace(/\D/g, '')
    if (typed.length > 1) { // pasted or autofilled
      const full = (value.slice(0, i) + typed).slice(0, 6)
      onChange(full); refs.current[Math.min(full.length, 5)]?.focus(); return
    }
    setAt(i, typed)
    if (typed && i < 5) refs.current[i + 1]?.focus()
  }
  return (
    <div className="flex justify-center gap-2" role="group" aria-label="6-digit code from your email">
      {chars.map((c, i) => (
        <input
          key={i} ref={(el) => (refs.current[i] = el)}
          value={c.trim()} onChange={(e) => onInput(i, e)} onKeyDown={(e) => onKey(i, e)} onFocus={(e) => e.target.select()}
          inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6}
          autoFocus={autoFocus && i === 0} aria-label={`Digit ${i + 1}`}
          className="h-12 w-11 rounded-xl border border-slate-200 bg-slate-50/60 text-center text-lg font-semibold outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-900"
        />
      ))}
    </div>
  )
}

// "Forgot it?" proof: the answer to your security question, or your account
// password if you never set one. value is { answer } or { password }.
export const RecoveryBlock = ({ question, value, onChange }) => {
  if (question) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3.5 text-left dark:border-slate-700">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuShieldQuestion className="size-4.5" /></span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Your security question</p>
            <p className="mt-0.5 text-sm font-medium">{question}</p>
          </div>
        </div>
        <PasscodeInput kind="text" value={value.answer || ''} onChange={(answer) => onChange({ answer })} placeholder="Your answer" aria-label="Your answer" autoComplete="off" autoFocus />
        <p className="text-center text-xs text-slate-500">Capitals and extra spaces don’t matter.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3.5 text-left dark:border-slate-700">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><LuKeyRound className="size-4.5" /></span>
        <p className="min-w-0 text-sm text-slate-600 dark:text-slate-300">You haven’t set a security question, so confirm with your Kova account password.</p>
      </div>
      <SecretInput type="password" value={value.password || ''} onChange={(e) => onChange({ password: e.target.value })} placeholder="Account password" aria-label="Account password" autoComplete="current-password" autoFocus
        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 text-center text-base outline-none transition placeholder:text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-900" />
    </div>
  )
}

// Choose a security question (preset or your own) and its answer. value = { preset, custom, answer }
export const QuestionFields = ({ value, onChange, label = 'Security question' }) => {
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <>
      <Label>{label}</Label>
      <Select value={value.preset} onChange={(v) => set({ preset: v })} options={QUESTIONS.map((q) => ({ value: q, label: q }))} aria-label="Security question" />
      {value.preset === QUESTIONS[QUESTIONS.length - 1] && (
        <input value={value.custom} onChange={(e) => set({ custom: e.target.value.slice(0, 120) })} placeholder="Write your question" aria-label="Your question"
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-900" />
      )}
      <PasscodeInput kind="text" value={value.answer} onChange={(answer) => set({ answer: answer.slice(0, 60) })} placeholder="Your answer" aria-label="Answer" autoComplete="off" />
      <p className="text-center text-xs text-slate-500">If you forget your code, answer this to reset it.</p>
    </>
  )
}
