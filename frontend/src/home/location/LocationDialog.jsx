import React, { Suspense, lazy, useEffect, useState } from 'react'
import { LuLoaderCircle, LuMapPin, LuNavigation, LuRadio } from 'react-icons/lu'
import Sheet from '../groups/Sheet'
// The map library (Leaflet) is only downloaded when a map is shown
const MapView = lazy(() => import('./MapView'))
import { getPosition, shareLocation } from '../../utils/liveLocation'

const LIVE = [[15, '15 min'], [60, '1 hour'], [480, '8 hours']]

// + → Location: send where I am now, or share it live for a while
const LocationDialog = ({ chat, onClose }) => {
  const [pos, setPos] = useState(null)
  const [error, setError] = useState('')
  const [minutes, setMinutes] = useState(15)
  const [busy, setBusy] = useState(null) // 'now' | 'live'

  useEffect(() => {
    getPosition().then(setPos).catch((e) => setError(e.message))
  }, [])

  const send = async (mins) => {
    setBusy(mins ? 'live' : 'now'); setError('')
    try {
      const fresh = await getPosition().catch(() => pos)
      await shareLocation({ chatId: String(chat._id), isGroup: !!chat.isGroup, minutes: mins, position: fresh || pos })
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Couldn’t share your location')
      setBusy(null)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Share location">
      <div className="space-y-4 pb-1">
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-slate-800">
          {pos ? <Suspense fallback={<div className="h-56 w-full animate-pulse bg-slate-100 dark:bg-slate-800" />}><MapView lat={pos.lat} lng={pos.lng} accuracy={pos.accuracy} interactive className="h-56 w-full" /></Suspense> : (
            <div className="flex h-56 flex-col items-center justify-center gap-2 bg-slate-50 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              {error ? <><LuMapPin className="size-6" /><span className="max-w-[16rem] text-center">{error}</span></> : <><LuLoaderCircle className="size-6 animate-spin" />Finding your location…</>}
            </div>
          )}
        </div>
        {pos && <p className="-mt-2 text-center text-xs text-slate-500">Accurate to about {Math.round(pos.accuracy)} m</p>}

        <button onClick={() => send(0)} disabled={!pos || !!busy} className="flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50 dark:ring-slate-700 dark:hover:bg-slate-800">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuNavigation className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{busy === 'now' ? 'Sending…' : 'Send your current location'}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">One pin, where you are right now</span>
          </span>
        </button>

        <div className="rounded-xl p-3 ring-1 ring-slate-200 dark:ring-slate-700">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><LuRadio className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Share live location</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Updates as you move. Stop any time.</span>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {LIVE.map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMinutes(m)} className={`h-8 rounded-md text-xs font-medium transition ${minutes === m ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>{label}</button>
            ))}
          </div>
          <button onClick={() => send(minutes)} disabled={!pos || !!busy} className="mt-3 h-10 w-full rounded-lg bg-emerald-600 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
            {busy === 'live' ? 'Starting…' : 'Share live location'}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Keep Kova open on this device while sharing.</p>
        </div>
        {error && pos && <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Sheet>
  )
}

export default LocationDialog
