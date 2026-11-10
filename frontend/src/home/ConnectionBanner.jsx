import React, { useEffect, useState } from 'react'
import { LuLoaderCircle, LuWifiOff } from 'react-icons/lu'
import { useSocket } from '../context/SocketProvider'

// A thin bar at the top while new messages can't arrive: offline, or the realtime
// connection is reconnecting. Waits a moment first so short blips don't flash it.
const SHOW_AFTER_MS = 2500

const useOnline = () => {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

const ConnectionBanner = () => {
  const { connected } = useSocket()
  const online = useOnline()
  const down = !online || !connected
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!down) { const t = setTimeout(() => setShow(false), 0); return () => clearTimeout(t) }
    const t = setTimeout(() => setShow(true), SHOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [down])

  if (!show || !down) return null
  return (
    <div role="status" aria-live="polite" className={`flex shrink-0 items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium ${online ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200' : 'bg-slate-800 text-white dark:bg-slate-700'}`}>
      {online
        ? <><LuLoaderCircle className="size-3.5 animate-spin" /> Connecting… new messages will show up once you're back</>
        : <><LuWifiOff className="size-3.5" /> You're offline. Messages you send will go out when you reconnect.</>}
    </div>
  )
}

export default ConnectionBanner
