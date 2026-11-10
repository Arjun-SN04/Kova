import React, { useEffect, useState } from 'react'
import { LuBell, LuX } from 'react-icons/lu'
import { enablePush, pushState } from '../../utils/push'
import PushHelp from '../../components/PushHelp'

const DISMISS_KEY = 'nexchat:notifyBannerDismissed'
const dismissedBefore = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }

// One-time nudge at the top of the chat list to turn on push notifications
const NotifyBanner = () => {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (dismissedBefore()) return
    pushState().then((s) => setShow(s === 'off'))
  }, [])

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ } setShow(false) }
  const turnOn = async () => {
    setBusy(true); setError(null)
    try { await enablePush(); setShow(false) } catch (err) { setError(err) } finally { setBusy(false) }
  }

  if (!show) return null
  // One short row, so it doesn't push the chat list down on phones
  return (
    <div className="mx-3 mb-2 rounded-xl bg-indigo-50 px-3 py-2 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:ring-indigo-500/20">
      <div className="flex items-center gap-2.5">
        <LuBell className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
        <p className="min-w-0 flex-1 text-xs leading-snug text-slate-700 dark:text-slate-200">
          <span className="font-semibold">Get notified</span> about messages, even when Kova is closed
        </p>
        <button onClick={turnOn} disabled={busy} className="h-7 shrink-0 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60">{busy ? 'Turning on…' : 'Turn on'}</button>
        <button onClick={dismiss} className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Not now" title="Not now"><LuX className="size-4" /></button>
      </div>
      <PushHelp error={error} compact />
    </div>
  )
}

export default NotifyBanner
