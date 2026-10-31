import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { LuCalendarDays, LuLoaderCircle, LuMessageSquare, LuVideo } from 'react-icons/lu'
import Avatar from '../../home/Avatar'
import { api, bizUrl, errorOf, money } from '../utils'
import { Empty, PageHeader, SegmentTabs, btn, cardCls } from './ui'

const dayHeading = (d, tz) => {
  const date = new Date(d)
  const key = (x) => x.toLocaleDateString('en-CA', { timeZone: tz })
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86_400_000)
  if (key(date) === key(today)) return 'Today'
  if (key(date) === key(tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString([], { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' })
}

const Bookings = ({ ws }) => {
  const [bookings, setBookings] = useState(null)
  const [show, setShow] = useState('upcoming')
  const [error, setError] = useState('')
  const tz = ws.business?.business?.timeZone || undefined
  const [now] = useState(() => Date.now())

  const load = useCallback(() => {
    axios.get(bizUrl(ws.biz, '/bookings'), api).then((r) => setBookings(r.data.bookings)).catch((err) => setError(errorOf(err)))
  }, [ws.biz])
  useEffect(load, [load])

  const setStatus = async (b, status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel ${b.customer?.fullName}'s ${b.service.name}? They'll get a message.`)) return
    try {
      const res = await axios.put(bizUrl(ws.biz, `/bookings/${b._id}`), { status }, api)
      setBookings((list) => list.map((x) => (x._id === b._id ? { ...x, status: res.data.booking.status } : x)))
    } catch (err) { setError(errorOf(err)) }
  }

  const all = bookings || []
  const upcoming = all.filter((b) => b.status === 'booked' && new Date(b.end).getTime() >= now)
  const shown = show === 'upcoming' ? upcoming : show === 'past' ? all.filter((b) => b.status !== 'cancelled' && new Date(b.end).getTime() < now).reverse() : all.filter((b) => b.status === 'cancelled').reverse()
  const groups = []
  for (const b of shown) {
    const title = dayHeading(b.start, tz)
    const last = groups[groups.length - 1]
    if (last?.title === title) last.items.push(b)
    else groups.push({ title, items: [b] })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description={ws.settings.services.length ? `Customers book ${ws.settings.services.map((s) => s.name).join(', ')} from your business page.` : 'Add services in Settings so customers can book appointments from your business page.'}
        actions={!ws.settings.services.length && ws.role !== 'agent' ? <button onClick={() => ws.go({ tab: 'settings', section: 'services' })} className={btn.primary}>Add a service</button> : null}
      />
      <SegmentTabs value={show} onChange={setShow} tabs={[['upcoming', 'Upcoming', upcoming.length], ['past', 'Past'], ['cancelled', 'Cancelled']]} />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {bookings === null ? <div className="flex justify-center py-12"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
        : groups.length === 0 ? <div className={cardCls}><Empty icon={LuCalendarDays} title={show === 'upcoming' ? 'No upcoming bookings' : 'Nothing here'} description="Bookings appear here and in the chat with the customer. If you've connected Google Calendar in Nexa, they're added there too, with a Meet link." /></div>
        : groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.title}</h2>
            <ul className={`divide-y divide-slate-100 overflow-hidden dark:divide-slate-800 ${cardCls}`}>
              {g.items.map((b) => (
                <li key={b._id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className={`flex w-20 shrink-0 flex-col items-center rounded-xl py-2 ${b.status === 'booked' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    <p className="text-sm font-semibold tabular-nums">{new Date(b.start).toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' })}</p>
                    <p className="text-[11px] opacity-75">{b.service.minutes} min</p>
                  </div>
                  <div className="flex min-w-52 flex-1 items-center gap-3">
                    <Avatar name={b.customer?.fullName} src={b.customer?.avatar?.url} size="sm" />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${b.status === 'cancelled' ? 'line-through text-slate-400' : ''}`}>{b.service.name} · {b.customer?.fullName}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[b.service.price ? money(b.service.price) : null, b.note && `“${b.note}”`, b.status === 'done' && 'Done'].filter(Boolean).join(' · ') || b.customer?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {b.meetLink && b.status === 'booked' && <a href={b.meetLink} target="_blank" rel="noreferrer" className={btn.icon} title="Join video call"><LuVideo className="size-4" /></a>}
                    <button onClick={() => ws.openChat(b.customer?._id)} className={btn.icon} title="Open chat" aria-label="Open chat"><LuMessageSquare className="size-4" /></button>
                    {b.status === 'booked' && (
                      <>
                        <button onClick={() => setStatus(b, 'done')} className={btn.ghost}>Done</button>
                        <button onClick={() => setStatus(b, 'cancelled')} className={btn.danger}>Cancel</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}

export default Bookings
