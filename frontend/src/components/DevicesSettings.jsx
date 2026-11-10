import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuLaptop, LuLogOut, LuMonitorSmartphone, LuSmartphone } from 'react-icons/lu'

// Profile → Security: every device signed in to this account, with "Sign out" for each
// and "Sign out other devices". Signed-out devices go back to the sign-in page at once.
const api = { withCredentials: true }
const isPhone = (name) => /iPhone|Android|iPad/.test(name)

const ago = (d) => {
  const mins = Math.round((Date.now() - new Date(d)) / 60000)
  if (mins < 5) return 'Active now'
  if (mins < 60) return `Active ${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Active ${hours} h ago`
  return `Active ${new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}

const DevicesSettings = () => {
  const [sessions, setSessions] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const load = () => axios.get('/api/user/sessions', api).then((r) => setSessions(r.data.sessions)).catch(() => setSessions([]))
  useEffect(() => { load() }, [])

  const run = async (key, fn, done) => {
    setBusy(key); setMessage('')
    try { await fn(); setMessage(done); await load() } catch (err) { setMessage(err.response?.data?.error || 'Something went wrong. Try again.') } finally { setBusy('') }
  }
  const others = (sessions || []).filter((s) => !s.current)

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <LuMonitorSmartphone className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold sm:text-lg">Devices</p>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm dark:text-slate-400">Where you're signed in. Don't recognise one? Sign it out and change your password.</p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        {sessions === null && <li className="py-3 text-sm text-slate-400">Loading…</li>}
        {(sessions || []).map((s) => {
          const Icon = isPhone(s.device) ? LuSmartphone : LuLaptop
          return (
            <li key={s.sid} className="flex items-center gap-3 py-3">
              <Icon className="size-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.device}{s.current && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">This device</span>}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {s.current ? 'Active now' : ago(s.lastSeenAt)}{s.ip ? ` · ${s.ip}` : ''} · signed in {new Date(s.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              {!s.current && (
                <button disabled={!!busy} onClick={() => run(s.sid, () => axios.delete(`/api/user/sessions/${s.sid}`, api), `${s.device} was signed out`)}
                  className="h-8 shrink-0 rounded-lg px-3 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/10">
                  {busy === s.sid ? 'Signing out…' : 'Sign out'}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {others.length > 0 && (
        <button disabled={!!busy} onClick={() => run('all', () => axios.post('/api/user/sessions/sign-out-others', {}, api), 'Every other device was signed out')}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/10">
          <LuLogOut className="size-4" /> {busy === 'all' ? 'Signing out…' : `Sign out ${others.length === 1 ? 'the other device' : `all ${others.length} other devices`}`}
        </button>
      )}
      {message && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300" role="status">{message}</p>}
    </div>
  )
}

export default DevicesSettings
