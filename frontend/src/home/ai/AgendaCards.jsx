import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import {
  LuAlarmClock, LuBellRing, LuCalendarCheck, LuCalendarDays, LuCheck, LuChevronDown, LuCircle, LuCircleCheck,
  LuClock, LuCopy, LuExternalLink, LuListTodo, LuMail, LuMapPin, LuRepeat, LuSunrise, LuUsers, LuVideo,
} from 'react-icons/lu'

// Cards for Nexa's Google Calendar / Tasks messages: morning brief, meeting reminders, created events, tasks

const shell = 'mt-1.5 w-full max-w-sm overflow-hidden rounded-xl bg-white text-sm shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800/80 dark:ring-slate-700/60'
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const sameDay = (a, b) => a.toDateString() === b.toDateString()
const dayName = (iso) => {
  const d = new Date(iso)
  const now = new Date()
  if (sameDay(d, now)) return 'Today'
  if (sameDay(d, new Date(now.getTime() + 86_400_000))) return 'Tomorrow'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
const timeRange = (e) => (e.allDay ? 'All day' : `${fmtTime(e.start)} – ${fmtTime(e.end)}`)

// Re-render every 30 s so "in 5 min" / "Now" stay true
const useNow = () => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

const inWords = (ms) => {
  const m = Math.ceil(ms / 60_000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

// Where a meeting is right now: upcoming / live / ended
const phaseOf = (e, now) => {
  if (e.allDay) return { key: 'allday', label: 'All day' }
  const start = new Date(e.start).getTime()
  const end = new Date(e.end).getTime()
  if (now < start) return { key: 'soon', label: `in ${inWords(start - now)}` }
  if (now < end) return { key: 'live', label: 'Now' }
  return { key: 'ended', label: 'Ended' }
}

const PILL = {
  soon: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20',
  live: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
  ended: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:ring-slate-700',
  allday: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-700',
}
const StatusPill = ({ phase }) => (
  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PILL[phase.key]}`}>
    {phase.label}
  </span>
)

const IconTile = ({ icon: Icon, tone = 'violet' }) => {
  const tones = {
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    slate: 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400',
  }
  return <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}><Icon className="size-4.5" /></div>
}

const Detail = ({ icon: Icon, children }) => (
  <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
    <Icon className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
    <span className="truncate">{children}</span>
  </p>
)

const ghost = 'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white'
const iconBtn = 'flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-white'

const JoinButton = ({ href, small }) => (
  <a href={href} target="_blank" rel="noreferrer" className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 font-medium text-white shadow-xs transition hover:bg-emerald-500 ${small ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs'}`}>
    <LuVideo className="size-3.5" /> Join
  </a>
)

const CopyLink = ({ url }) => {
  const [done, setDone] = useState(false)
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})
  return (
    <button type="button" onClick={copy} className={iconBtn} title={done ? 'Copied' : 'Copy Meet link'} aria-label="Copy Meet link">
      {done ? <LuCheck className="size-4 text-emerald-500" /> : <LuCopy className="size-4" />}
    </button>
  )
}

// ── Snooze ─────────────────────────────────────────────────────
const SNOOZE_OPTIONS = [[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']]

const SnoozeButton = ({ messageId, onSaved }) => {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (ev) => { if (!ref.current?.contains(ev.target)) setOpen(false) }
    const onKey = (ev) => ev.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey) }
  }, [open])

  const snooze = async (minutes) => {
    setBusy(true); setError('')
    try {
      const res = await axios.post(`/api/google/snooze/${messageId}`, { minutes }, { withCredentials: true })
      onSaved?.(messageId, res.data.action)
      setOpen(false)
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't snooze")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={busy} className={ghost} aria-haspopup="menu" aria-expanded={open}>
        <LuAlarmClock className="size-3.5" /> Snooze <LuChevronDown className={`size-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-20 mb-1.5 w-52 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Remind me again in</p>
          {SNOOZE_OPTIONS.map(([m, label]) => (
            <button key={m} role="menuitem" type="button" disabled={busy} onClick={() => snooze(m)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700/60">
              <LuClock className="size-3.5 text-slate-400" /> {label}
            </button>
          ))}
          <form onSubmit={(ev) => { ev.preventDefault(); const m = Number(custom); if (m >= 1 && m <= 1440) snooze(m); else setError('Enter 1 to 1440 minutes') }} className="mt-1 flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-slate-700">
            <input type="number" min="1" max="1440" value={custom} onChange={(ev) => setCustom(ev.target.value)} placeholder="Custom" aria-label="Custom minutes" className="h-7 w-full min-w-0 rounded-md bg-slate-100 px-2 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-violet-500/40 dark:bg-slate-900 dark:ring-slate-700" />
            <span className="text-xs text-slate-400">min</span>
            <button type="submit" disabled={busy || !custom} className="h-7 shrink-0 rounded-md bg-violet-600 px-2.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">Set</button>
          </form>
          {error && <p className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}

const SnoozedStrip = ({ until }) => (
  <div className="flex items-center gap-1.5 border-t border-amber-100 bg-amber-50/70 px-3.5 py-2 text-xs font-medium text-amber-700 dark:border-amber-500/10 dark:bg-amber-500/5 dark:text-amber-300">
    <LuAlarmClock className="size-3.5" /> Snoozed until {fmtTime(until)}{!sameDay(new Date(until), new Date()) ? `, ${dayName(until)}` : ''}
  </div>
)

// ── One meeting: reminders and events Nexa created ─────────────
export const EventCard = ({ action: e, messageId, onSaved }) => {
  const now = useNow()
  const phase = phaseOf(e, now)
  const over = phase.key === 'ended'
  // created === true: Nexa added it (older reminders may carry Google's creation time in `created`)
  const added = e.created === true
  const label = added ? (e.isReminder ? 'Reminder added to Google Calendar' : 'Added to Google Calendar') : e.reminder ? (e.snoozedReminder ? 'Snoozed reminder' : 'Reminder') : 'Event'
  const icon = added ? LuCalendarCheck : e.reminder ? LuBellRing : LuCalendarDays
  const tone = over ? 'slate' : added ? 'emerald' : phase.key === 'live' ? 'emerald' : 'violet'
  const snoozed = e.snoozedUntil && new Date(e.snoozedUntil).getTime() > now
  const canSnooze = e.reminder && messageId && !over
  const hasActions = (e.meetLink && !over) || canSnooze

  return (
    <div className={shell}>
      <div className="flex gap-3 px-3.5 pb-3 pt-3.5">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <StatusPill phase={phase} />
          </div>
          <p className={`mt-0.5 truncate text-[15px] font-semibold leading-snug ${over ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-50'}`} title={e.title}>{e.title}</p>
          <div className="mt-1.5 space-y-1">
            <Detail icon={LuClock}>{dayName(e.start)} · {e.isReminder ? fmtTime(e.start) : timeRange(e)}</Detail>
            {e.repeats && <Detail icon={LuRepeat}>Repeats {e.repeats}</Detail>}
            {e.meetLink && <Detail icon={LuVideo}>Google Meet</Detail>}
            {e.location && <Detail icon={LuMapPin}>{e.location}</Detail>}
            {e.attendees?.length > 0 && <Detail icon={LuUsers}>{e.attendees.slice(0, 3).join(', ')}{e.attendees.length > 3 ? ` +${e.attendees.length - 3}` : ''}</Detail>}
          </div>
        </div>
      </div>

      {snoozed && <SnoozedStrip until={e.snoozedUntil} />}

      {hasActions ? (
        <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/60 px-2.5 py-2 dark:border-slate-700/60 dark:bg-slate-900/30">
          {e.meetLink && !over && <JoinButton href={e.meetLink} />}
          {canSnooze && <SnoozeButton messageId={messageId} onSaved={onSaved} />}
          <div className="flex-1" />
          {e.meetLink && !over && <CopyLink url={e.meetLink} />}
          {e.link && (
            <a href={e.link} target="_blank" rel="noreferrer" className={iconBtn} title="Open in Google Calendar" aria-label="Open in Google Calendar">
              <LuExternalLink className="size-4" />
            </a>
          )}
        </div>
      ) : e.link && (
        <a href={e.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 border-t border-slate-100 px-3.5 py-2.5 text-xs font-medium text-violet-600 transition hover:bg-slate-50 dark:border-slate-700/60 dark:text-violet-300 dark:hover:bg-slate-900/30">
          Open in Google Calendar <LuExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  )
}

// ── Morning brief ──────────────────────────────────────────────
const AgendaEvent = ({ e, now }) => {
  const phase = phaseOf(e, now)
  return (
    <li className={`flex items-center gap-3 px-3.5 py-2.5 ${phase.key === 'ended' ? 'opacity-60' : ''}`}>
      <div className="w-[68px] shrink-0">
        <p className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{e.allDay ? 'All day' : fmtTime(e.start)}</p>
        {!e.allDay && <p className="text-[11px] tabular-nums text-slate-400">{fmtTime(e.end)}</p>}
      </div>
      <div className={`h-8 w-0.5 shrink-0 rounded-full ${phase.key === 'live' ? 'bg-emerald-500' : 'bg-violet-400/70'}`} />
      <div className="min-w-0 flex-1">
        <a href={e.link} target="_blank" rel="noreferrer" className="block truncate font-medium text-slate-800 hover:underline dark:text-slate-100">{e.title}</a>
        <p className="flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
          {e.meetLink ? <><LuVideo className="size-3 shrink-0" /> Google Meet</> : e.location ? <><LuMapPin className="size-3 shrink-0" /> {e.location}</> : phase.key === 'live' ? 'Happening now' : phase.label}
        </p>
      </div>
      {e.meetLink && phase.key !== 'ended' && <JoinButton href={e.meetLink} small />}
    </li>
  )
}

const SectionTitle = ({ icon: Icon, children, border }) => (
  <p className={`flex items-center gap-1.5 bg-slate-50/60 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:bg-slate-900/30 ${border ? 'border-t border-slate-100 dark:border-slate-700/60' : ''}`}>
    <Icon className="size-3.5" /> {children}
  </p>
)

export const AgendaCard = ({ action, greeting }) => {
  const now = useNow()
  const { events = [], tasks = [] } = action
  const date = action.date ? new Date(`${action.date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : ''
  const summary = [
    events.length ? `${events.length} event${events.length > 1 ? 's' : ''}` : null,
    tasks.length ? `${tasks.length} task${tasks.length > 1 ? 's' : ''} due` : null,
  ].filter(Boolean).join(' · ') || 'A clear day'

  return (
    <div className={`${shell} max-w-md`}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <IconTile icon={LuSunrise} tone="amber" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-slate-50">{greeting || 'Your day'}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{date}{date ? ' · ' : ''}{summary}</p>
        </div>
      </div>

      {events.length > 0 && (
        <>
          <SectionTitle icon={LuCalendarDays} border>Calendar</SectionTitle>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">{events.map((e) => <AgendaEvent key={e.id} e={e} now={now} />)}</ul>
        </>
      )}

      {tasks.length > 0 && (
        <>
          <SectionTitle icon={LuListTodo} border>Tasks due</SectionTitle>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <LuCircle className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
                <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{t.title}</span>
                {t.overdue && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20">Overdue</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {action.emails?.length > 0 && (
        <>
          <SectionTitle icon={LuMail} border>Unread email</SectionTitle>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {action.emails.map((m) => (
              <li key={m.id}>
                <a href={`https://mail.google.com/mail/u/0/#inbox/${m.threadId || m.id}`} target="_blank" rel="noreferrer" className="block px-3.5 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{m.from}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{m.subject}</p>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {!events.length && !tasks.length && (
        <p className="border-t border-slate-100 px-3.5 py-3 text-sm text-slate-500 dark:border-slate-700/60 dark:text-slate-400">Nothing on your calendar and no tasks due today.</p>
      )}

      {action.openTasks > 0 && (
        <p className="border-t border-slate-100 px-3.5 py-2 text-xs text-slate-400 dark:border-slate-700/60">+ {action.openTasks} open task{action.openTasks > 1 ? 's' : ''} without a date</p>
      )}
    </div>
  )
}

// ── A reminder Nexa sent (scheduled by Nexa, e.g. "every 2 minutes") ──
const everyLabel = (m) => (m === 1440 ? 'day' : m === 60 ? 'hour' : m % 60 === 0 ? `${m / 60} hours` : `${m} min`)
export const ReminderCard = ({ action: r, status, onStop }) => {
  const [busy, setBusy] = useState(false)
  const now = useNow()
  // Only the newest card of a repeating reminder shows "next at" and Stop
  const active = r.nextAt && new Date(r.nextAt).getTime() > now && status === 'pending'
  return (
    <div className={shell}>
      <div className="flex gap-3 px-3.5 py-3">
        <IconTile icon={LuBellRing} tone="violet" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reminder</p>
          <p className="break-words text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{r.text}</p>
          {r.everyMinutes && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <LuRepeat className="size-3.5 shrink-0" />
              {active ? `Every ${everyLabel(r.everyMinutes)} · next at ${fmtTime(r.nextAt)} · ${r.left} left` : `Every ${everyLabel(r.everyMinutes)}${status === 'cancelled' ? ' · stopped' : r.nextAt ? '' : ' · finished'}`}
            </p>
          )}
        </div>
      </div>
      {active && (
        <div className="flex items-center border-t border-slate-100 bg-slate-50/60 px-2.5 py-2 dark:border-slate-700/60 dark:bg-slate-900/30">
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onStop?.(r.id); setBusy(false) }} className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10">
            Stop repeating
          </button>
        </div>
      )}
    </div>
  )
}

// ── An email draft Nexa saved in Gmail ──
export const DraftCard = ({ action: d }) => (
  <div className={shell}>
    <div className="flex gap-3 px-3.5 py-3">
      <IconTile icon={LuMail} tone="violet" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Draft saved in Gmail</p>
        <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{d.subject}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">To {d.to}</p>
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap border-l-2 border-slate-200 pl-2 text-[13px] text-slate-600 dark:border-slate-600 dark:text-slate-300">{d.body}</p>
      </div>
    </div>
    <a href={d.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 border-t border-slate-100 px-3.5 py-2.5 text-xs font-medium text-violet-600 transition hover:bg-slate-50 dark:border-slate-700/60 dark:text-violet-300 dark:hover:bg-slate-900/30">
      Review and send in Gmail <LuExternalLink className="size-3.5" />
    </a>
  </div>
)

// ── Snoozed by asking Nexa ─────────────────────────────────────
export const SnoozedCard = ({ action }) => (
  <div className={`${shell} flex items-center gap-3 px-3.5 py-3`}>
    <IconTile icon={LuAlarmClock} tone="amber" />
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Snoozed</p>
      <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{action.title}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">Reminding you again at {fmtTime(action.until)}{!sameDay(new Date(action.until), new Date()) ? `, ${dayName(action.until)}` : ''}</p>
    </div>
  </div>
)

// ── A task Nexa added or completed ─────────────────────────────
export const TaskCard = ({ action: t }) => (
  <div className={`${shell} flex items-center gap-3 px-3.5 py-3`}>
    <IconTile icon={t.done ? LuCircleCheck : LuListTodo} tone={t.done ? 'emerald' : 'violet'} />
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.done ? 'Completed in Google Tasks' : 'Added to Google Tasks'}</p>
      <p className={`truncate font-semibold ${t.done ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-50'}`}>{t.title}</p>
      {t.due && !t.done && (
        <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <LuCalendarDays className="size-3" /> Due {new Date(`${t.due}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  </div>
)
