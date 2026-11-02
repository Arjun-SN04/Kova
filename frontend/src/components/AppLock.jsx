import React, { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { LuArrowRight, LuDelete, LuFingerprint, LuLock } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import Avatar from '../home/Avatar'
import { awayMinutes, checkPin, getLock, markHidden, removeLock, unlockWithBio } from '../utils/appLock'
import { PinDialog } from './AppLockSettings'
import SecretInput from './SecretInput'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del']

// Covers the app with a PIN screen when App lock is on: when Kova opens, and
// when it comes back after being away longer than the chosen time.
const AppLockGate = () => {
  const [AuthUser, setAuthUser] = useAuth()
  const id = AuthUser?._id
  const [lock, setLock] = useState(() => getLock(id))
  const [locked, setLocked] = useState(() => !!getLock(id))
  const [pin, setPinValue] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [wait, setWait] = useState(0)
  const tries = useRef(0)
  const [forgot, setForgot] = useState(false)
  const alnum = lock?.kind === 'alnum'

  // Settings changed in another part of the app
  useEffect(() => {
    const onChange = () => setLock(getLock(id))
    window.addEventListener('kova-applock', onChange)
    return () => window.removeEventListener('kova-applock', onChange)
  }, [id])

  // Lock again after being in the background long enough
  useEffect(() => {
    if (!lock) return
    const onVisible = () => {
      if (document.hidden) markHidden()
      else if ((lock.after ?? 0) >= 0 && awayMinutes() >= (lock.after || 0)) { setLocked(true); setPinValue(''); setError('') }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [lock])

  // Countdown after too many wrong tries
  useEffect(() => {
    if (!wait) return
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const tryPin = useCallback(async (value) => {
    if (await checkPin(id, value)) { tries.current = 0; setLocked(false); setPinValue(''); setError(''); return }
    tries.current += 1
    setShake(true); setTimeout(() => setShake(false), 400)
    setPinValue('')
    if (tries.current >= 5) { tries.current = 0; setWait(30); setError('Too many tries. Wait 30 seconds.') } else setError('Wrong PIN')
  }, [id])

  const press = useCallback((k) => {
    if (wait) return
    setError('')
    setPinValue((p) => {
      const next = k === 'del' ? p.slice(0, -1) : p.length < 10 ? p + k : p
      if (k !== 'del' && lock?.len && next.length === lock.len) tryPin(next)
      return next
    })
  }, [wait, lock, tryPin])

  // Typing on a keyboard works too
  useEffect(() => {
    if (!locked || alnum || forgot) return
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('del')
      else if (e.key === 'Enter' && pin.length >= 4) tryPin(pin)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, alnum, forgot, press, pin, tryPin])

  const bio = async () => { if (await unlockWithBio(id)) { setLocked(false); setPinValue('') } else setError('Couldn’t verify. Use your PIN.') }

  // Log out instead (removes the lock on this device)
  const logout = async () => {
    try { await axios.post('/api/user/logout', {}, { withCredentials: true }) } catch { /* ignore */ }
    removeLock(id)
    localStorage.removeItem('chatUser')
    setAuthUser(null)
    window.location.href = '/login'
  }

  if (!lock || !locked) return null
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-white px-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-label="Kova is locked">
      <Avatar name={AuthUser?.fullName} src={AuthUser?.avatar?.url} size="lg" />
      <p className="mt-4 flex items-center gap-1.5 text-lg font-semibold"><LuLock className="size-4 text-indigo-500" /> Kova is locked</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter your PIN to continue</p>
      {alnum && (
        <form onSubmit={(e) => { e.preventDefault(); if (pin.length >= 4 && !wait) tryPin(pin) }} className={`mt-6 flex w-full max-w-xs gap-2 ${shake ? 'animate-[shake_0.35s]' : ''}`}>
          <div className="flex-1">
            <SecretInput value={pin} onChange={(e) => { setError(''); setPinValue(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 16)) }} disabled={!!wait} autoFocus autoCapitalize="off" autoComplete="current-password" placeholder="PIN" aria-label="PIN"
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 text-center text-lg tracking-wider outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900" />
          </div>
          <button type="submit" disabled={pin.length < 4 || !!wait} aria-label="Unlock" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40"><LuArrowRight className="size-5" /></button>
        </form>
      )}

      {!alnum && <div className={`mt-6 flex h-4 gap-3 ${shake ? 'animate-[shake_0.35s]' : ''}`} aria-live="polite" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: lock.len || 6 }, (_, i) => (
          <span key={i} className={`size-3 rounded-full transition ${i < pin.length ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>}
      <p className="mt-3 h-5 text-sm text-red-600 dark:text-red-400">{wait ? `Too many tries. Wait ${wait}s.` : error}</p>

      {alnum ? (lock.credId && <button onClick={bio} className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-slate-100 dark:text-indigo-400 dark:hover:bg-slate-900"><LuFingerprint className="size-5" /> Use fingerprint</button>) : (
      <div className="mt-4 grid grid-cols-3 gap-3">
        {KEYS.map((k) => k === 'bio' ? (
          lock.credId
            ? <button key={k} onClick={bio} className="flex size-16 items-center justify-center rounded-full text-indigo-600 transition hover:bg-slate-100 dark:text-indigo-400 dark:hover:bg-slate-900" aria-label="Unlock with fingerprint or device"><LuFingerprint className="size-7" /></button>
            : <span key={k} />
        ) : k === 'del' ? (
          <button key={k} onClick={() => press('del')} className="flex size-16 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Delete digit"><LuDelete className="size-6" /></button>
        ) : (
          <button key={k} onClick={() => press(k)} disabled={!!wait} className="flex size-16 items-center justify-center rounded-full bg-slate-100 text-2xl font-medium transition hover:bg-slate-200 active:scale-95 disabled:opacity-40 dark:bg-slate-900 dark:hover:bg-slate-800">{k}</button>
        ))}
      </div>
      )}

      <div className="mt-8 flex items-center gap-4 text-sm">
        <button onClick={() => setForgot(true)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Forgot PIN?</button>
        <span className="text-slate-300 dark:text-slate-700">·</span>
        <button onClick={logout} className="text-slate-500 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white">Log out</button>
      </div>
      {forgot && (
        <PinDialog mode="forgot" userId={id} z="z-[310]" onClose={() => setForgot(false)}
          onDone={() => { tries.current = 0; setLocked(false); setPinValue(''); setError(''); setWait(0) }} />
      )}
    </div>
  )
}

export default AppLockGate
