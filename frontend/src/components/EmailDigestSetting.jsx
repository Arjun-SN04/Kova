import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuMail } from 'react-icons/lu'

// Profile → Notifications: a daily email of unread messages while I'm away
const EmailDigestSetting = () => {
  const [on, setOn] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    axios.get('/api/user/account', { withCredentials: true }).then((r) => setOn(r.data.emailDigest.enabled)).catch(() => setOn(false))
  }, [])
  const toggle = async () => {
    const next = !on
    setOn(next); setError('')
    try { await axios.put('/api/user/email-digest', { enabled: next }, { withCredentials: true }) } catch { setOn(!next); setError('Couldn’t save that. Try again.') }
  }
  return (
    <div className="flex items-start gap-4 border-t border-slate-100 p-4 sm:p-6 dark:border-slate-800">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuMail className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Email digest</p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">A daily email of unread messages when you haven’t opened Kova for a while. Locked and hidden chats are never included.</p>
        {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
      {on !== null && (
        <button type="button" role="switch" aria-checked={on} aria-label="Email digest" onClick={toggle}
          className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
          <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-5.5' : 'left-0.5'}`} />
        </button>
      )}
    </div>
  )
}

export default EmailDigestSetting
