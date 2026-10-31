import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuBellRing, LuFlame, LuLock, LuPackage, LuSend, LuTag, LuTrash2, LuUserCheck } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import { api, bizUrl, errorOf, formatDay, money, statusOf, timeAgo } from './utils'
import Select from '../components/ui/Select'

const box = 'rounded-2xl bg-slate-50 p-3 dark:bg-slate-900'
const heading = 'mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400'
const input = 'w-full rounded-lg border-0 bg-white px-2.5 py-2 text-[13px] ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-indigo-500/40 dark:bg-slate-800 dark:ring-slate-700'

// Label chips in a business's colours
export const LabelChip = ({ label, small = false }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full font-medium ${small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
    style={{ backgroundColor: `${label.color}1f`, color: label.color }}
  >
    <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} />{label.name}
  </span>
)

const localInput = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

// Render with key={customerId} so the form resets when switching customers.
// Everything a business keeps about one customer: labels, lead flag, notes,
// follow-up, who handles them, staff-only notes and their orders.
const CustomerPanel = ({ biz = 'me', customerId, record, settings, team = [], onChange }) => {
  const [AuthUser] = useAuth()
  const [notes, setNotes] = useState(record?.notes || '')
  const [followAt, setFollowAt] = useState(localInput(record?.followUp && !record.followUp.done ? record.followUp.at : null))
  const [followNote, setFollowNote] = useState(record?.followUp?.done ? '' : record?.followUp?.note || '')
  const [internal, setInternal] = useState('')
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    axios.get(bizUrl(biz, `/orders?customer=${customerId}`), api).then((r) => setOrders(r.data.orders)).catch(() => setOrders([]))
  }, [biz, customerId])

  const update = async (patch, message = 'Saved') => {
    setError('')
    try {
      const res = await axios.put(bizUrl(biz, `/customers/${customerId}`), patch, api)
      onChange?.(res.data.record)
      setSaved(message); setTimeout(() => setSaved(''), 1500)
    } catch (err) { setError(errorOf(err)) }
  }
  const addNote = async (e) => {
    e.preventDefault()
    if (!internal.trim()) return
    try {
      const res = await axios.post(bizUrl(biz, `/customers/${customerId}/notes`), { text: internal }, api)
      onChange?.(res.data.record)
      setInternal('')
    } catch (err) { setError(errorOf(err)) }
  }
  const removeNote = async (id) => {
    try {
      const res = await axios.delete(bizUrl(biz, `/customers/${customerId}/notes/${id}`), api)
      onChange?.(res.data.record)
    } catch (err) { setError(errorOf(err)) }
  }

  const labels = settings?.labels || []
  const active = new Set((record?.labels || []).map(String))
  const toggleLabel = (id) => {
    const next = active.has(String(id)) ? [...active].filter((x) => x !== String(id)) : [...active, String(id)]
    update({ labels: next })
  }
  const spent = orders.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + o.total, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Customer</p>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">{saved}</span>}
      </div>

      <div className={box}>
        <p className={heading}><LuTag className="size-3.5" /> Labels</p>
        {labels.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Create labels in Business → Settings → Labels.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => {
              const on = active.has(String(l._id))
              return (
                <button key={l._id} onClick={() => toggleLabel(l._id)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${on ? '' : 'opacity-60 hover:opacity-100'}`}
                  style={on ? { backgroundColor: `${l.color}22`, color: l.color, boxShadow: `inset 0 0 0 1px ${l.color}66` } : { color: l.color, boxShadow: `inset 0 0 0 1px ${l.color}33` }}>
                  {l.name}
                </button>
              )
            })}
          </div>
        )}
        <button onClick={() => update({ lead: !record?.lead }, record?.lead ? 'Unmarked' : 'Marked as lead')} className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${record?.lead ? 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30' : 'text-slate-500 ring-slate-200 hover:text-slate-800 dark:text-slate-400 dark:ring-slate-700'}`}>
          <LuFlame className="size-3.5" /> {record?.lead ? 'Hot lead' : 'Mark as lead'}
        </button>
        {record?.needsHuman && (
          <button onClick={() => update({ needsHuman: false }, 'Cleared')} className="ml-1.5 mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30" title="Nexa passed this to a person. Click when handled.">
            Needs a person · clear
          </button>
        )}
      </div>

      {team.length > 1 && (
        <div className={box}>
          <p className={heading}><LuUserCheck className="size-3.5" /> Handled by</p>
          <Select size="sm" value={record?.assignedTo || ''} onChange={(v) => update({ assignedTo: v || null })} aria-label="Handled by" options={[{ value: '', label: 'Unassigned' }, ...team.map((m) => ({ value: m._id, label: String(m._id) === String(AuthUser?._id) ? `${m.fullName} (you)` : m.fullName }))]} />
        </div>
      )}

      <div className={box}>
        <p className={heading}>Notes about this customer</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (record?.notes || '') && update({ notes })} rows={3} maxLength={2000} placeholder="Allergies, birthday, preferences…" className={`${input} resize-none`} />
      </div>

      <div className={box}>
        <p className={heading}><LuBellRing className="size-3.5" /> Follow up</p>
        <div className="flex gap-2">
          <input type="datetime-local" value={followAt} onChange={(e) => setFollowAt(e.target.value)} className={`${input} min-w-0 flex-1`} />
        </div>
        <input value={followNote} onChange={(e) => setFollowNote(e.target.value)} maxLength={200} placeholder="What about? (optional)" className={`${input} mt-2`} />
        <div className="mt-2 flex gap-2">
          <button disabled={!followAt} onClick={() => update({ followUp: { at: new Date(followAt).toISOString(), note: followNote } }, 'Nexa will remind you')} className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">Remind me</button>
          {record?.followUp && !record.followUp.done && <button onClick={() => { setFollowAt(''); setFollowNote(''); update({ followUp: null }, 'Removed') }} className="h-8 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800">Remove</button>}
        </div>
      </div>

      <div className={box}>
        <p className={heading}><LuLock className="size-3.5" /> Team notes <span className="font-normal">· only your team sees these</span></p>
        <ul className="space-y-2">
          {(record?.internalNotes || []).slice(-20).map((n) => (
            <li key={n._id} className="group/note rounded-lg bg-white px-2.5 py-2 text-[13px] ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <p className="whitespace-pre-wrap">{n.text}</p>
              <p className="mt-1 flex items-center text-[11px] text-slate-400">
                {n.by?.fullName?.split(' ')[0] || 'Someone'} · {timeAgo(n.at)}
                <button onClick={() => removeNote(n._id)} className="ml-auto opacity-0 transition hover:text-red-600 group-hover/note:opacity-100" aria-label="Delete note"><LuTrash2 className="size-3" /></button>
              </p>
            </li>
          ))}
        </ul>
        <form onSubmit={addNote} className="mt-2 flex gap-2">
          <input value={internal} onChange={(e) => setInternal(e.target.value)} maxLength={1000} placeholder="Add a note for the team" className={`${input} min-w-0 flex-1`} />
          <button disabled={!internal.trim()} className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white disabled:opacity-40 dark:bg-white dark:text-slate-900" aria-label="Add note"><LuSend className="size-3.5" /></button>
        </form>
      </div>

      <div className={box}>
        <p className={heading}><LuPackage className="size-3.5" /> Orders <span className="font-normal">· {orders.length} · {money(spent)}</span></p>
        {orders.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">No orders yet.</p> : (
          <ul className="space-y-1">
            {orders.slice(0, 8).map((o) => (
              <li key={o._id} className="flex items-center justify-between gap-2 text-[13px]">
                <span>#{o.number} <span className="text-xs text-slate-400">{formatDay(o.createdAt)}</span></span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-1.5 py-px text-[10px] font-medium ring-1 ${statusOf(o.status).tone}`}>{statusOf(o.status).label}</span>
                  <span className="tabular-nums">{money(o.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default CustomerPanel
