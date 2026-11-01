import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { LuBan, LuBriefcase, LuChevronRight, LuUserRound } from 'react-icons/lu'
import ConfirmDialog from '../home/ConfirmDialog'
import useBusiness from './store'
import { useAuth } from '../context/AuthProvider'
import Avatar from '../home/Avatar'
import { api, errorOf } from './utils'

// Turn the business account off and go back to a normal (personal) account.
// The catalog, orders and settings are kept, so it can be turned on again later.
export const SwitchToPersonal = ({ className = '', onDone }) => {
  const [AuthUser, setAuthUser] = useAuth()
  const [open, setOpen] = useState(false)
  if (!AuthUser?.business?.enabled) return null
  const confirm = async () => {
    const res = await axios.put('/api/business/profile', { enabled: false }, api)
    const user = { ...AuthUser, business: res.data.business }
    localStorage.setItem('chatUser', JSON.stringify(user))
    setAuthUser(user)
    useBusiness.getState().loadMe?.()
    setOpen(false)
    onDone?.()
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ${className}`}>
        <LuUserRound className="size-4" /> Switch to personal account
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        icon={LuUserRound}
        title="Switch to a personal account?"
        description="Your business page, badge, opening hours, catalog ordering and bookings turn off, and your team loses access. Your chats stay. Your catalog, orders and settings are kept, so you can turn Business on again any time."
        confirmLabel="Switch"
        busyLabel="Switching…"
      />
    </>
  )
}

// Profile page: a way into the business tools
export const BusinessCard = () => {
  const [AuthUser] = useAuth()
  const on = !!AuthUser?.business?.enabled
  return (
    <div>
    <Link to="/business" className="flex items-start gap-4 p-4 sm:p-6 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuBriefcase className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{on ? 'Business tools' : 'Use Kova for your business'}</p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{on ? 'Inbox, customers, catalog, orders, bookings and settings.' : 'Business profile, quick replies, catalog, orders, bookings and a shared team inbox.'}</p>
      </div>
      <LuChevronRight className="mt-2.5 size-4 text-slate-400" />
    </Link>
    {on && <div className="border-t border-slate-100 px-4 sm:px-6 py-3 dark:border-slate-800"><SwitchToPersonal /></div>}
    </div>
  )
}

// Profile page: people I blocked, with Unblock
export const BlockedAccounts = () => {
  const [blocked, setBlocked] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { axios.get('/api/contacts/blocked', api).then((r) => setBlocked(r.data.blocked)).catch(() => setBlocked([])) }, [])
  const unblock = async (id) => {
    try { await axios.delete(`/api/contacts/block/${id}`, api); setBlocked((list) => list.filter((u) => u._id !== id)) } catch (err) { setError(errorOf(err)) }
  }
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><LuBan className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Blocked accounts</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{blocked?.length ? 'They can’t message, call or add you.' : 'You haven’t blocked anyone.'}</p>
        </div>
      </div>
      {blocked?.length > 0 && (
        <ul className="mt-4 space-y-1">
          {blocked.map((u) => (
            <li key={u._id} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <Avatar name={u.fullName} src={u.avatar?.url} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.fullName} <span className="font-normal text-slate-400">@{u.username}</span></span>
              <button onClick={() => unblock(u._id)} className="h-8 rounded-lg px-3 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">Unblock</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
