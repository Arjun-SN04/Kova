import React, { useState } from 'react'
import axios from 'axios'
import Sheet from './Sheet'

const field = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const label = 'mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300'
const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// New event in a group: posted as a card people RSVP to; reminder an hour before
const EventDialog = ({ groupId, onClose }) => {
  const [today] = useState(() => localDate(new Date()))
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => localDate(new Date(Date.now() + 86_400_000)))
  const [time, setTime] = useState('18:00')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const startsAt = date && time ? new Date(`${date}T${time}`) : null
  const ready = title.trim() && startsAt && !Number.isNaN(startsAt.getTime())

  const create = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    if (startsAt.getTime() < Date.now()) { setError('Pick a time in the future'); return }
    setBusy(true); setError('')
    try {
      await axios.post('/api/events', { groupId, title, startsAt: startsAt.toISOString(), location, description }, { withCredentials: true })
      onClose()
    } catch (err) { setError(err.response?.data?.error || 'Could not create the event'); setBusy(false) }
  }

  return (
    <Sheet open onClose={onClose} title="New event" footer={
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
        <button onClick={create} disabled={!ready || busy} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">{busy ? 'Posting…' : 'Post event'}</button>
      </div>
    }>
      <form onSubmit={create} className="space-y-4 pt-1">
        <label className="block"><span className={label}>What’s happening</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Team dinner" className={field} autoFocus /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={label}>Date</span>
            <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className={field} /></label>
          <label className="block"><span className={label}>Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} /></label>
        </div>
        <label className="block"><span className={label}>Where <span className="font-normal text-slate-400">(optional)</span></span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Café Mocha, MG Road or a video call link" className={field} /></label>
        <label className="block"><span className={label}>Details <span className="font-normal text-slate-400">(optional)</span></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={600} placeholder="Anything people should know" className={`${field} h-auto resize-y py-2.5`} /></label>
        <p className="text-xs text-slate-500 dark:text-slate-400">Everyone in the group can answer Going, Maybe or Can’t go. They get a reminder an hour before.</p>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Sheet>
  )
}

export default EventDialog
