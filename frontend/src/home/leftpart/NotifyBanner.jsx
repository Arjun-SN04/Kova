import React, { useEffect, useState } from 'react'
import { LuBell, LuX } from 'react-icons/lu'
import { enablePush, pushState } from '../../utils/push'

const DISMISS_KEY = 'nexchat:notifyBannerDismissed'
const dismissedBefore = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }

// One-time nudge at the top of the chat list to turn on push notifications
const NotifyBanner = () => {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (dismissedBefore()) return
    pushState().then((s) => setShow(s === 'off'))
  }, [])

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ } setShow(false) }
  const turnOn = async () => {
    setBusy(true); setError('')
    try { await enablePush(); setShow(false) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (!show) return null
  return (
    <div className="mx-3 mb-2 rounded-xl bg-indigo-50 p-3 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:ring-indigo-500/20">
      <div className="flex items-start gap-2.5">
        <LuBell className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Get notified</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">Messages and reminders, even when Kova is closed.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={turnOn} disabled={busy} className="h-7 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60">{busy ? 'Turning on…' : 'Turn on'}</button>
            <button onClick={dismiss} className="h-7 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-800">Not now</button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <button onClick={dismiss} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Dismiss"><LuX className="size-4" /></button>
      </div>
    </div>
  )
}

export default NotifyBanner
