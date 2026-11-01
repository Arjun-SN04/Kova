import React, { useEffect, useState } from 'react'
import Sheet from '../groups/Sheet'
import { channelsApi, errorOf, handleFrom, loadChannels } from '../../utils/channels'
import useConversation from '../../Zustand/UserConversation'

const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900'

// New channel: name, @handle (filled from the name) and a short description
const CreateChannelDialog = ({ onClose }) => {
  const { setSelectedConversation } = useConversation()
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleTouched, setHandleTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [check, setCheck] = useState({ handle: '', available: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const h = handleTouched ? handle : handleFrom(name)

  useEffect(() => {
    if (h.length < 3) return
    const t = setTimeout(() => channelsApi.handle(h).then((r) => setCheck({ handle: h, available: r.data.available })).catch(() => {}), 350)
    return () => clearTimeout(t)
  }, [h])
  const available = check.handle === h ? check.available : null

  const create = async () => {
    setBusy(true); setError('')
    try {
      const res = await channelsApi.create({ name: name.trim(), handle: h, description })
      await loadChannels()
      setSelectedConversation(res.data)
      onClose()
    } catch (err) { setError(errorOf(err)); setBusy(false) }
  }

  return (
    <Sheet open onClose={onClose} title="New channel" footer={
      <button onClick={create} disabled={busy || name.trim().length < 2 || h.length < 3 || available === false} className="h-11 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">
        {busy ? 'Creating…' : 'Create channel'}
      </button>
    }>
      <div className="space-y-4 pt-1">
        <p className="text-[13px] text-slate-500 dark:text-slate-400">Share updates with anyone who follows. Only you (and admins you add later) can post; followers read and react.</p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="e.g. Campus Updates" className={field} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Handle</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">@</span>
            <input value={h} onChange={(e) => { setHandleTouched(true); setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30)) }} placeholder="campus_updates" className={`${field} pl-8`} />
          </div>
          <span className={`mt-1 block text-xs ${available === false ? 'text-red-600 dark:text-red-400' : available ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
            {h.length < 3 ? '3 to 30 letters, numbers, _ or .' : available === false ? 'That handle is taken' : available ? 'Available' : 'Checking…'}
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Description <span className="font-normal text-slate-400">(optional)</span></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={3} placeholder="What will you post about?" className={`${field} h-auto resize-none py-2.5`} />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Sheet>
  )
}

export default CreateChannelDialog
