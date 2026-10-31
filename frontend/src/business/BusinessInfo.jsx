import React, { useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { LuBadgeCheck, LuBan, LuBriefcase, LuClock, LuExternalLink, LuFlag, LuGlobe, LuMail, LuMapPin, LuShoppingBag } from 'react-icons/lu'
import Sheet from '../home/groups/Sheet'
import { DAY_NAMES, api, clock, coverOf, errorOf, hoursState } from './utils'

// Small icon after a business's name: a tick when verified, a briefcase otherwise
export const BusinessBadge = ({ business, className = 'size-3.5' }) => {
  if (!business?.enabled) return null
  return business.verified
    ? <LuBadgeCheck className={`inline shrink-0 text-sky-500 ${className}`} title="Verified business" aria-label="Verified business" />
    : <LuBriefcase className={`inline shrink-0 text-slate-400 ${className}`} title="Business account" aria-label="Business account" />
}

// "Open now · closes 6 PM" in green, or "Closed · …" in grey
export const OpenStatus = ({ business, className = '' }) => {
  const state = hoursState(business)
  if (!state) return null
  return <span className={`${state.open ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'} ${className}`}>{state.label}</span>
}

// Business details in a contact's info panel
export const BusinessProfile = ({ user }) => {
  const b = user.business
  const [showHours, setShowHours] = useState(false)
  if (!b?.enabled) return null
  const todayIndex = new Date().getDay()
  const row = 'flex items-start gap-3 rounded-xl px-3 py-2.5'
  return (
    <div className="mt-6 space-y-1 rounded-2xl bg-slate-50 p-2 dark:bg-slate-900">
      <img src={coverOf(b)} alt="" className="h-28 w-full rounded-xl object-cover" loading="lazy" />
      <div className={row}>
        <LuBriefcase className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{b.verified ? 'Verified business' : 'Business'}{b.category ? ` · ${b.category}` : ''}</p>
          {b.description && <p className="mt-0.5 text-sm">{b.description}</p>}
        </div>
      </div>
      <button onClick={() => setShowHours((v) => !v)} className={`${row} w-full text-left transition hover:bg-white dark:hover:bg-slate-800`}>
        <LuClock className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <OpenStatus business={b} className="text-sm font-medium" />
          {showHours ? (
            <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
              {(b.hours?.length === 7 ? b.hours : []).map((d, i) => (
                <li key={i} className={`flex justify-between ${i === todayIndex ? 'font-semibold' : ''}`}>
                  <span>{DAY_NAMES[i]}</span><span>{d.closed ? 'Closed' : `${clock(d.open)} – ${clock(d.close)}`}</span>
                </li>
              ))}
              {b.timeZone && <li className="pt-1 text-[11px] text-slate-400">Times in {b.timeZone}</li>}
            </ul>
          ) : <p className="text-xs text-slate-500 dark:text-slate-400">See opening hours</p>}
        </div>
      </button>
      {b.address && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" className={`${row} transition hover:bg-white dark:hover:bg-slate-800`}>
          <LuMapPin className="mt-0.5 size-4 shrink-0 text-slate-400" /><span className="text-sm">{b.address}</span>
        </a>
      )}
      {b.website && (
        <a href={b.website} target="_blank" rel="noreferrer" className={`${row} transition hover:bg-white dark:hover:bg-slate-800`}>
          <LuGlobe className="mt-0.5 size-4 shrink-0 text-slate-400" /><span className="min-w-0 truncate text-sm text-indigo-600 dark:text-indigo-400">{b.website.replace(/^https?:\/\//, '')}</span>
        </a>
      )}
      {b.email && (
        <a href={`mailto:${b.email}`} className={`${row} transition hover:bg-white dark:hover:bg-slate-800`}>
          <LuMail className="mt-0.5 size-4 shrink-0 text-slate-400" /><span className="min-w-0 truncate text-sm">{b.email}</span>
        </a>
      )}
      {user.username && (
        <Link to={`/b/${user.username}`} className={`${row} transition hover:bg-white dark:hover:bg-slate-800`}>
          <LuShoppingBag className="mt-0.5 size-4 shrink-0 text-indigo-500" />
          <span className="flex-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">Shop, order and book</span>
          <LuExternalLink className="mt-0.5 size-3.5 text-slate-400" />
        </Link>
      )}
    </div>
  )
}

// Block and Report buttons for the contact info panel
export const SafetyActions = ({ user, onBlocked }) => {
  const [dialog, setDialog] = useState(null) // 'block' | 'report'
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const firstName = user.fullName?.split(' ')[0]
  const btn = 'flex w-full items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'

  const block = async () => {
    await axios.post(`/api/contacts/block/${user._id}`, {}, api)
    onBlocked?.()
  }
  const submit = async () => {
    setBusy(true); setError('')
    try {
      if (dialog === 'report') {
        await axios.post(`/api/contacts/report/${user._id}`, { reason, details }, api)
        if (alsoBlock) await block()
        else { setDone('Thanks, we got your report.'); setDialog(null) }
      } else {
        await block()
      }
    } catch (err) { setError(errorOf(err)) } finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={() => setDialog('block')} className={btn}><LuBan className="size-4" /> Block {firstName}</button>
      <button onClick={() => setDialog('report')} className={btn}><LuFlag className="size-4" /> Report {firstName}</button>
      {done && <p className="px-5 text-xs text-emerald-600 dark:text-emerald-400">{done}</p>}
      <Sheet open={!!dialog} onClose={() => setDialog(null)} title={dialog === 'report' ? `Report ${firstName}?` : `Block ${firstName}?`} footer={
        <div className="flex justify-end gap-2">
          <button onClick={() => setDialog(null)} className="h-10 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={submit} disabled={busy} className="h-10 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">{busy ? 'Please wait…' : dialog === 'report' ? 'Report' : 'Block'}</button>
        </div>
      }>
        {dialog === 'report' ? (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">The Kova team will review this account. {firstName} won't know you reported them.</p>
            <div className="grid grid-cols-2 gap-2">
              {[['spam', 'Spam'], ['scam', 'Scam or fraud'], ['abuse', 'Abuse or harassment'], ['other', 'Something else']].map(([id, label]) => (
                <button key={id} onClick={() => setReason(id)} className={`rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition ${reason === id ? 'bg-red-50 font-medium text-red-700 ring-red-300 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/40' : 'ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800'}`}>{label}</button>
              ))}
            </div>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={500} placeholder="Anything else we should know? (optional)" className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="size-4 accent-red-600" /> Also block {firstName}</label>
          </div>
        ) : (
          <p className="pt-1 text-sm text-slate-600 dark:text-slate-300">You'll stop being contacts. {firstName} can't message you, call you or add you again until you unblock them in Settings. Your chat history stays.</p>
        )}
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </Sheet>
    </>
  )
}
