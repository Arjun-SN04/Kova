import React, { useState } from 'react'
import { LuPartyPopper, LuX } from 'react-icons/lu'

// Shown once after signing in during the 30 days: the account deletion was cancelled
const RestoredBanner = () => {
  const [show, setShow] = useState(() => { try { return sessionStorage.getItem('kovaRestored') === '1' } catch { return false } })
  if (!show) return null
  const close = () => { try { sessionStorage.removeItem('kovaRestored') } catch { /* ignore */ } setShow(false) }
  return (
    <div role="status" className="fixed left-1/2 top-4 z-[70] flex w-[min(92vw,420px)] -translate-x-1/2 items-start gap-3 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"><LuPartyPopper className="size-4.5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Welcome back!</p>
        <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">Your account deletion was cancelled. Everything is just as you left it.</p>
      </div>
      <button onClick={close} aria-label="Close" className="flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"><LuX className="size-4" /></button>
    </div>
  )
}

export default RestoredBanner
