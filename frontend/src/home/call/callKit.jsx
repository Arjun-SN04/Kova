import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuCheck, LuSearch, LuUserPlus, LuX } from 'react-icons/lu'
import Avatar from '../Avatar'

// Shared pieces for one-to-one and group calls (media helpers: utils/callMedia.js)

// Pick people to add to a call
export const AddPeopleDialog = ({ people, max, onAdd, onClose, title = 'Add people to the call' }) => {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState([])
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => !q || p.fullName?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q))
  }, [people, query])
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= max ? cur : [...cur, id]))
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[80dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-zinc-900 text-white shadow-2xl ring-1 ring-white/10 sm:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <LuUserPlus className="size-5 text-emerald-400" />
          <p className="flex-1 font-semibold">{title}</p>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close"><LuX className="size-4" /></button>
        </div>
        <p className="px-5 pb-3 text-xs text-white/50">{max > 0 ? `Up to ${max} more ${max === 1 ? 'person' : 'people'}. They'll get a ring to join.` : 'The call is full.'}</p>
        <label className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-white/5 px-3 ring-1 ring-white/10 focus-within:ring-emerald-400/50">
          <LuSearch className="size-4 text-white/40" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40" />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {list.length === 0 && <p className="px-3 py-8 text-center text-sm text-white/50">{people.length ? 'No matches' : 'Everyone is already here'}</p>}
          {list.map((p) => {
            const on = picked.includes(String(p._id))
            return (
              <button key={p._id} onClick={() => toggle(String(p._id))} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5 ${on ? 'bg-emerald-500/10' : ''}`}>
                <Avatar name={p.fullName} src={p.avatar?.url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.fullName}</span>
                  {p.username && <span className="block truncate text-xs text-white/40">@{p.username}</span>}
                </span>
                <span className={`flex size-5 items-center justify-center rounded-full ring-1 ${on ? 'bg-emerald-500 ring-emerald-500' : 'ring-white/30'}`}>{on && <LuCheck className="size-3.5" />}</span>
              </button>
            )
          })}
        </div>
        <div className="border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button disabled={!picked.length} onClick={() => onAdd(picked)} className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-semibold transition hover:bg-emerald-500 disabled:bg-white/10 disabled:text-white/40">
            {picked.length ? `Ring ${picked.length} ${picked.length === 1 ? 'person' : 'people'}` : 'Pick people to add'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Small round control used on both call screens
export const CallButton = ({ onClick, label, tone = 'default', size = 'md', children, disabled = false }) => (
  <div className="flex flex-col items-center gap-1.5">
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40 ${size === 'lg' ? 'size-16' : 'size-12 sm:size-14'} ${
        tone === 'danger' ? 'bg-red-600 text-white shadow-lg shadow-red-900/40 hover:bg-red-500'
          : tone === 'success' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500'
          : tone === 'active' ? 'bg-white text-zinc-900 hover:bg-zinc-200'
          : 'bg-white/10 text-white backdrop-blur-md hover:bg-white/20'
      }`}
    >
      {children}
    </button>
    <span className="hidden text-[11px] text-white/60 sm:block">{label}</span>
  </div>
)
