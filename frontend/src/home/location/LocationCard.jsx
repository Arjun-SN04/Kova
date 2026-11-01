import React, { useEffect, useState } from 'react'
import { LuExternalLink, LuRadio } from 'react-icons/lu'
import MapView from './MapView'
import { stopSharing } from '../../utils/liveLocation'

const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// A location in a chat bubble: map, live status, "Open in Maps", and "Stop" for the sender
const LocationCard = ({ message, itsMe }) => {
  const loc = message.location
  const [, tick] = useState(0)
  // Re-check every 30 s so a live share shows "ended" on time
  useEffect(() => {
    if (!loc.live || loc.stopped) return
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [loc.live, loc.stopped])
  const running = loc.live && !loc.stopped && new Date(loc.until) > new Date()
  const maps = `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
  const sub = itsMe ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'

  return (
    <div className="w-[260px] max-w-full sm:w-[300px]" onClick={(e) => e.stopPropagation()}>
      <div className="overflow-hidden rounded-xl">
        <MapView lat={loc.lat} lng={loc.lng} accuracy={loc.accuracy} live={running} className="h-40 w-full" />
      </div>
      <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-2">
        {loc.live ? (
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold">
              <LuRadio className={`size-3.5 ${running ? 'text-emerald-400' : ''}`} /> {running ? 'Live location' : 'Live location ended'}
            </p>
            <p className={`text-[11px] ${sub}`}>{running ? `Until ${time(loc.until)} · updated ${time(loc.updatedAt)}` : `Last updated ${time(loc.updatedAt)}`}</p>
          </div>
        ) : (
          <p className="min-w-0 flex-1 text-[13px] font-semibold">📍 Location</p>
        )}
        <a href={maps} target="_blank" rel="noopener noreferrer" title="Open in Maps" className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition ${itsMe ? 'hover:bg-white/15' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
          <LuExternalLink className="size-4" />
        </a>
      </div>
      {itsMe && running && (
        <button onClick={() => stopSharing(message._id)} className="mt-1.5 h-8 w-full rounded-lg bg-white/15 text-xs font-semibold transition hover:bg-white/25">Stop sharing</button>
      )}
    </div>
  )
}

export default LocationCard
