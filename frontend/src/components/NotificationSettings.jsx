import React, { useEffect, useState } from 'react'
import { LuBell, LuBellOff, LuSend } from 'react-icons/lu'
import { disablePush, enablePush, pushState, testPush } from '../utils/push'

// Turn push notifications on/off for this device (Profile page)
const NotificationSettings = () => {
  const [state, setState] = useState(null) // on | off | blocked | unsupported
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { pushState().then(setState) }, [])

  const toggle = async () => {
    setBusy(true); setError(''); setNote('')
    try {
      if (state === 'on') { await disablePush(); setState('off') }
      else { await enablePush(); setState('on'); setNote('Notifications are on for this device.') }
    } catch (err) {
      setError(err.message)
      setState(await pushState())
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setNote(''); setError('')
    try { await testPush(); setNote('Test sent. It should appear in a moment.') } catch { setError("Couldn't send a test.") }
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          {state === 'on' ? <LuBell className="size-5" /> : <LuBellOff className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base sm:text-lg">Notifications on this device</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {state === 'unsupported'
              ? "This browser can't show notifications. On iPhone, tap Share > Add to Home Screen, then open Kova from there."
              : state === 'blocked'
                ? 'Blocked in your browser. Allow notifications for this site in the browser settings, then come back.'
                : 'New messages when Kova is closed, plus Nexa reminders and your morning brief.'}
          </p>
        </div>
        {(state === 'on' || state === 'off') && (
          <button
            type="button"
            role="switch"
            aria-checked={state === 'on'}
            aria-label="Notifications on this device"
            disabled={busy}
            onClick={toggle}
            className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${state === 'on' ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${state === 'on' ? 'left-5.5' : 'left-0.5'}`} />
          </button>
        )}
      </div>
      {state === 'on' && (
        <button type="button" onClick={sendTest} className="ml-14 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          <LuSend className="size-3.5" /> Send a test notification
        </button>
      )}
      {note && <p className="ml-14 text-sm text-emerald-600 dark:text-emerald-400">{note}</p>}
      {error && <p className="ml-14 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default NotificationSettings
