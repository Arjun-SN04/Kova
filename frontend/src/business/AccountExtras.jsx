import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { LuBan, LuBriefcase, LuChevronRight } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import Avatar from '../home/Avatar'
import { api, errorOf } from './utils'

// Profile page: a way into the business tools
export const BusinessCard = () => {
  const [AuthUser] = useAuth()
  const on = !!AuthUser?.business?.enabled
  return (
    <Link to="/business" className="flex items-start gap-4 p-6 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuBriefcase className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{on ? 'Business tools' : 'Use Kova for your business'}</p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{on ? 'Inbox, customers, catalog, orders, bookings and settings.' : 'Business profile, quick replies, catalog, orders, bookings and a shared team inbox.'}</p>
      </div>
      <LuChevronRight className="mt-2.5 size-4 text-slate-400" />
    </Link>
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
    <div className="p-6">
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
