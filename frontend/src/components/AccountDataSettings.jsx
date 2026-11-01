import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuDownload, LuLoaderCircle, LuMail, LuTrash2, LuUserX } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import { LinkButton, OtpInput, SecureDialog } from './security/SecurityUI'
import SecretInput from './SecretInput'

const api = { withCredentials: true }
const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`)
const at = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Delete my account: confirm with the password or an emailed code; deleted after 30 days
const DeleteAccountDialog = ({ onClose }) => {
  const [, setAuthUser] = useAuth()
  const [mode, setMode] = useState('password') // password | code
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sendCode = async () => {
    setBusy(true); setError('')
    try { const r = await axios.post('/api/user/delete-account/code', {}, api); setSentTo(r.data.sentTo) } catch (err) { setError(err.response?.data?.error || 'Couldn’t send the email') }
    setBusy(false)
  }
  const confirm = async () => {
    setBusy(true); setError('')
    try {
      await axios.post('/api/user/delete-account', mode === 'code' ? { otp } : { password }, api)
      localStorage.removeItem('chatUser')
      setAuthUser(null)
      window.location.href = '/login?deleting=1'
    } catch (err) { setError(err.response?.data?.error || 'Couldn’t delete the account'); setBusy(false) }
  }

  return (
    <SecureDialog
      onClose={onClose} tone="red" icon={LuUserX}
      title="Delete your account?"
      subtitle="Your account is deleted after 30 days. Sign in any time before then to cancel. After that, your profile, chats, files and channels are gone for good."
      onSubmit={confirm} submitLabel="Delete my account" busyLabel="Deleting…" busy={busy} error={error}
      ready={mode === 'password' ? password.length > 0 : otp.length === 6}
      links={mode === 'password'
        ? <LinkButton onClick={() => { setMode('code'); setError('') }}>Use an email code instead</LinkButton>
        : <LinkButton muted onClick={() => { setMode('password'); setError('') }}>Use my password instead</LinkButton>}
    >
      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        Want a copy first? Close this and use <b>Download your data</b>. Messages you sent in groups are removed too.
      </p>
      {mode === 'password' ? (
        <SecretInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your Kova password" aria-label="Password" autoComplete="current-password" autoFocus
          className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 text-center text-base outline-none transition placeholder:text-sm placeholder:text-slate-400 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-900" />
      ) : sentTo ? (
        <div className="space-y-2">
          <p className="text-center text-sm text-slate-600 dark:text-slate-300">Enter the code we sent to <b>{sentTo}</b></p>
          <OtpInput value={otp} onChange={setOtp} />
        </div>
      ) : (
        <button type="button" onClick={sendCode} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900">
          <LuMail className="size-4" /> {busy ? 'Sending…' : 'Email me a code'}
        </button>
      )}
    </SecureDialog>
  )
}

// Profile → Your data & account: download a copy, or delete the account
const AccountDataSettings = () => {
  const [status, setStatus] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const refresh = () => axios.get('/api/user/account', api).then((r) => setStatus(r.data.dataExport)).catch(() => setStatus(null))
  useEffect(() => { refresh() }, [])
  // While it's being built, check every 10 s
  useEffect(() => {
    if (status?.status !== 'building') return
    const t = setInterval(refresh, 10_000)
    return () => clearInterval(t)
  }, [status?.status])

  const request = async () => {
    setBusy(true); setError('')
    try { await axios.post('/api/user/export', {}, api); setStatus({ status: 'building', requestedAt: new Date() }) } catch (err) { setError(err.response?.data?.error || 'Couldn’t start the export') }
    setBusy(false)
  }

  const ready = status?.status === 'ready' && new Date(status.expiresAt) > new Date()
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuDownload className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base sm:text-lg">Download your data</p>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {status?.status === 'building'
              ? 'Preparing your ZIP. This can take a few minutes; we’ll email you when it’s ready.'
              : ready
                ? `Ready · ${size(status.size)} · the link works until ${at(status.expiresAt)}.`
                : status?.status === 'failed'
                  ? 'The last export didn’t finish. Try again.'
                  : 'A ZIP with your profile, contacts, chats, photos, files and Nexa history. We’ll email you a link when it’s ready.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:pl-14">
        {ready && (
          <a href="/api/user/export/latest" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500">
            <LuDownload className="size-4" /> Download ZIP
          </a>
        )}
        {status?.status === 'building' ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-slate-500 ring-1 ring-slate-200 dark:ring-slate-700"><LuLoaderCircle className="size-4 animate-spin" /> Preparing…</span>
        ) : (
          <button onClick={request} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">
            <LuDownload className="size-4" /> {ready ? 'Make a new copy' : 'Request my data'}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 sm:pl-14 dark:text-red-400">{error}</p>}

      <div className="mt-6 flex items-start gap-4 border-t border-slate-100 pt-6 dark:border-slate-800">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"><LuTrash2 className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Delete account</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your account is deleted 30 days after you ask. Sign in before then to cancel.</p>
          <button onClick={() => setDeleting(true)} className="mt-3 inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/10">Delete my account…</button>
        </div>
      </div>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </div>
  )
}

export default AccountDataSettings
