import React, { useState } from 'react'
import axios from 'axios'
import { LuCheck, LuCopy, LuShare2 } from 'react-icons/lu'
import { inviteUrl } from '../utils/contacts'

// "@username" with Copy and Share buttons (Profile page).
// Share opens the device's share sheet with the username and an invite link;
// browsers without one get the same message copied instead.
const UsernameShare = ({ username }) => {
  const [done, setDone] = useState('') // 'copied' | 'shared' | 'linkCopied'
  const flash = (what) => { setDone(what); setTimeout(() => setDone(''), 1800) }

  const copy = async () => {
    try { await navigator.clipboard.writeText(`@${username}`); flash('copied') } catch { /* ignore */ }
  }

  const share = async () => {
    let url = ''
    try { url = inviteUrl((await axios.get('/api/contacts/invite', { withCredentials: true })).data.token) } catch { /* share without a link */ }
    const text = `Add me on Kova: @${username}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Kova', text, ...(url ? { url } : {}) }); flash('shared') } catch { /* cancelled */ }
      return
    }
    try { await navigator.clipboard.writeText(url ? `${text}\n${url}` : text); flash('linkCopied') } catch { /* ignore */ }
  }

  const btn = 'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="mr-1 font-medium text-slate-700 dark:text-slate-300">@{username}</span>
      <button type="button" onClick={copy} className={btn} aria-label="Copy username" title="Copy username">
        {done === 'copied' ? <LuCheck className="size-3.5 text-emerald-500" /> : <LuCopy className="size-3.5" />}
        {done === 'copied' ? 'Copied' : 'Copy'}
      </button>
      <button type="button" onClick={share} className={btn} aria-label="Share username" title="Share your username and invite link">
        {done === 'linkCopied' || done === 'shared' ? <LuCheck className="size-3.5 text-emerald-500" /> : <LuShare2 className="size-3.5" />}
        {done === 'linkCopied' ? 'Invite copied' : done === 'shared' ? 'Shared' : 'Share'}
      </button>
    </span>
  )
}

export default UsernameShare
