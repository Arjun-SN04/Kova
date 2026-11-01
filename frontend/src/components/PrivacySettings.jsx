import React, { useState } from 'react'
import axios from 'axios'
import { LuCheckCheck, LuEye, LuImage, LuShieldCheck, LuTextQuote, LuUsers } from 'react-icons/lu'
import Select from './ui/Select'
import { useAuth } from '../context/AuthProvider'

const WHO = [{ value: 'everyone', label: 'Everyone' }, { value: 'contacts', label: 'My contacts' }, { value: 'nobody', label: 'Nobody' }]
const CHOICES = [
  { key: 'photo', Icon: LuImage, title: 'Profile photo', hint: 'Who can see your photo', options: WHO },
  { key: 'about', Icon: LuTextQuote, title: 'About', hint: 'Who can see your about line', options: WHO },
  { key: 'groups', Icon: LuUsers, title: 'Add me to groups', hint: 'Only contacts can add you. With approval, you get an invite to accept first.', options: [{ value: 'contacts', label: 'My contacts' }, { value: 'approve', label: 'Only with my approval' }] },
]

const OPTIONS = [
  {
    key: 'activity',
    Icon: LuEye,
    title: 'Activity status',
    on: 'People can see when you’re online.',
    off: 'Hidden. You also won’t see when others are online.',
  },
  {
    key: 'seen',
    Icon: LuCheckCheck,
    title: 'Seen indicators',
    on: 'People can see when you’ve read their messages.',
    off: 'Hidden. You also won’t see when others read yours.',
  },
]

// Profile → Privacy: who can see that I'm online and that I've read their messages
const PrivacySettings = () => {
  const [AuthUser, setAuthUser] = useAuth()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const privacy = { activity: true, seen: true, photo: 'everyone', about: 'everyone', groups: 'contacts', ...(AuthUser?.privacy || {}) }

  const toggle = (key) => save(key, !privacy[key])
  const save = async (key, value) => {
    setBusy(key); setError('')
    try {
      const res = await axios.put('/api/user/privacy', { [key]: value }, { withCredentials: true })
      const user = { ...AuthUser, privacy: res.data.privacy }
      localStorage.setItem('chatUser', JSON.stringify(user))
      setAuthUser(user)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save. Try again.')
    } finally { setBusy('') }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <LuShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base sm:text-lg">Privacy</p>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">Choose what others can see. Activity status and seen indicators work both ways.</p>
        </div>
      </div>
      <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {OPTIONS.map(({ key, Icon, title, on, off }) => (
          <div key={key} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{title}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-normal">{privacy[key] ? on : off}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacy[key]}
              aria-label={title}
              disabled={busy === key}
              onClick={() => toggle(key)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${privacy[key] ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
            >
              <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${privacy[key] ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        ))}
        {CHOICES.map(({ key, Icon, title, hint, options }) => (
          <div key={key} className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{title}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{key === 'photo' && AuthUser?.business?.enabled ? 'Your photo is your business logo, so customers always see it.' : hint}</p>
              </div>
            </div>
            <div className="w-full shrink-0 pl-7 sm:w-44 sm:pl-0">
              <Select size="sm" value={privacy[key]} onChange={(v) => save(key, v)} options={options} disabled={busy === key} aria-label={title} />
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default PrivacySettings
