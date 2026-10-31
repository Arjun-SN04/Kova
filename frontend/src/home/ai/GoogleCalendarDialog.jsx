import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuBellRing, LuCircleAlert, LuCircleCheck, LuGlobe, LuMail, LuSend, LuSun, LuX } from 'react-icons/lu'
import { timeZone } from '../../utils/google'
import Select from '../../components/ui/Select'

const api = { withCredentials: true }

const RESULT_TEXT = {
  connected: { ok: true, text: 'Google connected. Nexa can now see your calendar and tasks.' },
  cancelled: { ok: false, text: 'Connecting Google was cancelled.' },
  expired: { ok: false, text: 'That took too long. Please try connecting again.' },
  missing: { ok: false, text: 'Please allow both Calendar and Tasks access so Nexa can help.' },
  failed: { ok: false, text: "Couldn't connect Google. Please try again." },
}

// Things to ask Nexa once connected (tapping one puts it in the message box)
const TRY = [
  "What's on my calendar today?",
  'Schedule a Google Meet tomorrow at 5pm called Team sync',
  'Add a task: submit report, due Friday',
  'What do I have this week?',
]

// Morning brief time choices, every 30 minutes
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
const timeLabel = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const zoneLabel = (tz) => {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value
    return name ? `${name}` : tz
  } catch { return tz }
}

const GoogleLogo = ({ className = 'size-5' }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

// Google Calendar's own app icon, simplified
const CalendarIcon = () => (
  <div className="relative flex size-11 shrink-0 flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
    <div className="h-3 bg-[#4285F4]" />
    <div className="flex flex-1 items-center justify-center text-[15px] font-bold leading-none text-[#4285F4]">{new Date().getDate()}</div>
  </div>
)

const Toggle = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 disabled:opacity-50 ${checked ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'}`}
  >
    <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
)


// One setting: icon, title, description, a switch, and an option shown while it's on
const SettingRow = ({ icon: Icon, title, description, checked, onToggle, children }) => (
  <div className="flex gap-3 px-4 py-3.5">
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
      <Icon className="size-4" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <Toggle checked={checked} onChange={onToggle} label={title} />
      </div>
      {checked && <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  </div>
)

// Connect Google Calendar + Tasks, and choose Nexa's morning brief and meeting reminders
const GoogleCalendarDialog = ({ open, onClose, result, onStatus, onTry }) => {
  const [status, setStatus] = useState(null) // { configured, connected, account }
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [banner, setBanner] = useState(result)

  useEffect(() => {
    if (!open) return
    let alive = true
    axios.get(`/api/google/status?tz=${encodeURIComponent(timeZone)}`, api)
      .then((res) => { if (alive) { setStatus(res.data); onStatus?.(res.data) } })
      .catch(() => { if (alive) setError("Couldn't load your Google connection.") })
    return () => { alive = false }
  }, [open, onStatus])

  // The "connected" message fades after a few seconds
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 6000)
    return () => clearTimeout(t)
  }, [banner])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // withGmail must be exactly true (buttons pass a click event otherwise)
  const connect = async (withGmail = false) => {
    const gmail = withGmail === true
    setBusy(gmail ? 'gmail' : 'connect'); setError('')
    try {
      const res = await axios.get(`/api/google/connect?tz=${encodeURIComponent(timeZone)}${gmail ? '&gmail=1' : ''}`, api)
      window.location.assign(res.data.url)
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't start connecting Google.")
      setBusy('')
    }
  }

  const save = async (patch) => {
    setError('')
    setStatus((s) => ({ ...s, account: { ...s.account, ...patch } }))
    try {
      const res = await axios.put('/api/google/settings', patch, api)
      setStatus((s) => ({ ...s, account: res.data.account }))
    } catch {
      setError("Couldn't save that setting.")
    }
  }

  const briefNow = async () => {
    setBusy('brief'); setError(''); setNote('')
    try {
      await axios.post('/api/google/brief', {}, api)
      setNote("Today's brief is in your Nexa chat.")
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't get your calendar.")
    } finally {
      setBusy('')
    }
  }

  const disconnect = async () => {
    setBusy('disconnect'); setError(''); setNote('')
    try {
      await axios.delete('/api/google', api)
      const next = { ...status, connected: false, account: null }
      setStatus(next); onStatus?.(next)
    } catch {
      setError("Couldn't disconnect.")
    } finally {
      setBusy('')
    }
  }

  const a = status?.account
  const shown = banner && RESULT_TEXT[banner]

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gcal-title"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800"
          >
            {/* Header */}
            <div className="flex items-center gap-3.5 px-5 pb-4 pt-5">
              <CalendarIcon />
              <div className="min-w-0 flex-1">
                <h3 id="gcal-title" className="text-base font-semibold leading-tight">Google Calendar</h3>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">Meetings, Google Meet and Tasks for Nexa</p>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close"><LuX className="size-4" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <AnimatePresence>
                {shown && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className={`mb-4 flex items-start gap-2 overflow-hidden rounded-lg px-3 py-2 text-[13px] ${shown.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'}`}>
                    {shown.ok ? <LuCircleCheck className="mt-0.5 size-4 shrink-0" /> : <LuCircleAlert className="mt-0.5 size-4 shrink-0" />}
                    {shown.text}
                  </motion.p>
                )}
              </AnimatePresence>

              {!status ? (
                <div className="space-y-3">
                  <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                  <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                </div>
              ) : !status.configured ? (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700">Google isn't set up on this server yet.</p>
              ) : !status.connected ? (
                /* Not connected */
                <div>
                  <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
                    {[
                      [LuSun, 'Morning brief', "Today's meetings and tasks in one message"],
                      [LuBellRing, 'Meeting reminders', 'A heads-up before each meeting, with a Join button'],
                      [LuSend, 'Schedule by chat', '"Set up a Meet with Priya tomorrow at 4"'],
                    ].map(([Icon, title, text]) => (
                      <div key={title} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"><Icon className="size-4" /></div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={connect} disabled={busy === 'connect'} className="mt-4 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-white text-sm font-semibold text-slate-800 shadow-xs ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700">
                    <GoogleLogo />
                    {busy === 'connect' ? 'Opening Google…' : 'Continue with Google'}
                  </button>
                  <p className="mt-2.5 text-center text-xs text-slate-400">Nexa only acts when you ask. Disconnect any time.</p>
                </div>
              ) : (
                /* Connected */
                <div className="space-y-4">
                  {/* Account */}
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-800">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"><GoogleLogo className="size-4.5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.email || 'Google account'}</p>
                      {a.broken
                        ? <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><LuCircleAlert className="size-3" /> Access removed. Reconnect to continue.</p>
                        : <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" /> Connected</p>}
                    </div>
                    {a.broken
                      ? <button onClick={connect} className="h-8 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-500">Reconnect</button>
                      : <button onClick={disconnect} disabled={!!busy} className="h-8 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400">{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</button>}
                  </div>

                  {/* Notifications */}
                  <div>
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Notifications from Nexa</p>
                    <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
                      <SettingRow icon={LuSun} title="Morning brief" description="Today's meetings and tasks, every day" checked={a.dailyBrief} onToggle={(v) => save({ dailyBrief: v })}>
                        <span>Send at</span>
                        <Select size="sm" fullWidth={false} value={a.briefTime} onChange={(v) => save({ briefTime: v })} aria-label="Brief time" options={[...new Set([a.briefTime, ...TIMES])].sort().map((t) => ({ value: t, label: timeLabel(t) }))} />
                      </SettingRow>
                      <SettingRow icon={LuBellRing} title="Meeting reminders" description="A message before each meeting starts" checked={a.meetReminders} onToggle={(v) => save({ meetReminders: v })}>
                        <span>Remind me</span>
                        <Select size="sm" fullWidth={false} value={a.reminderMinutes} onChange={(v) => save({ reminderMinutes: Number(v) })} aria-label="Minutes before" options={[5, 10, 15, 30, 60].map((m) => ({ value: m, label: m === 60 ? '1 hour' : `${m} minutes` }))} />
                        <span>before</span>
                      </SettingRow>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-slate-400"><LuGlobe className="size-3" /> {zoneLabel(a.timeZone)}</p>
                  </div>

                  {/* Gmail */}
                  <div>
                    <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Gmail</p>
                    {a.gmail ? (
                      <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
                        <SettingRow icon={LuMail} title="Email in morning brief" description="Unread mail from your Primary inbox" checked={a.briefEmails} onToggle={(v) => save({ briefEmails: v })} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-slate-200 dark:ring-slate-800">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"><LuMail className="size-4" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Connect Gmail</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Summaries of unread mail and reply drafts. Nexa never sends email.</p>
                        </div>
                        <button onClick={() => connect(true)} disabled={!!busy} className="h-8 shrink-0 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-60">{busy === 'gmail' ? 'Opening…' : 'Connect'}</button>
                      </div>
                    )}
                  </div>

                  {/* Things to ask */}
                  {onTry && (
                    <div>
                      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Try asking Nexa</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...TRY, ...(a.gmail ? ['Summarize my unread emails', 'Draft a reply to the latest email from my manager'] : [])].map((t) => (
                          <button key={t} onClick={() => onTry(t)} className="rounded-full bg-white px-3 py-1.5 text-left text-xs text-slate-600 ring-1 ring-slate-200 transition hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-violet-500/10 dark:hover:text-violet-300 dark:hover:ring-violet-500/30">
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && <p className="mt-4 flex items-start gap-1.5 text-[13px] text-red-600 dark:text-red-400"><LuCircleAlert className="mt-0.5 size-3.5 shrink-0" /> {error}</p>}
            </div>

            {/* Footer */}
            {status?.connected && !a?.broken && (
              <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/80">
                <p className="min-w-0 flex-1 text-xs text-emerald-600 dark:text-emerald-400">{note}</p>
                <button onClick={briefNow} disabled={!!busy} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-sm font-medium text-white shadow-xs transition hover:bg-violet-500 disabled:opacity-60">
                  <LuSun className="size-4" />
                  {busy === 'brief' ? 'Getting your day…' : "Send today's brief"}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default GoogleCalendarDialog
