import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { QRCodeCanvas } from 'qrcode.react'
import {
  LuAtSign, LuCheck, LuCopy, LuDownload, LuInbox, LuLoaderCircle, LuMessageCircle,
  LuQrCode, LuRefreshCw, LuSearch, LuShare2, LuUserPlus, LuX,
} from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import Avatar from '../Avatar'
import { inviteUrl, loadRequests, normalizeUsername, USERNAME_RE, USERNAME_RULES } from '../../utils/contacts'
import { selfContact } from '../../utils/conversations'

const TABS = [
  { id: 'add', label: 'Add', Icon: LuUserPlus },
  { id: 'requests', label: 'Requests', Icon: LuInbox },
  { id: 'invite', label: 'My QR', Icon: LuQrCode },
]

const api = { withCredentials: true }
const errorOf = (err, fallback) => err.response?.data?.error || fallback

const primaryBtn =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60'
const secondaryBtn =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800'

const PersonRow = ({ user, children }) => (
  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
    <Avatar name={user.fullName} src={user.avatar?.url} size="sm" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{user.fullName}</p>
      <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{user.username}</p>
    </div>
    <div className="flex shrink-0 gap-1.5">{children}</div>
  </div>
)

// ── Add by username ──────────────────────────────────────────
const AddTab = ({ openChat, goTo }) => {
  const [AuthUser] = useAuth()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null) // { user, status, requestId }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const search = async (e) => {
    e.preventDefault()
    const username = normalizeUsername(query)
    setResult(null)
    if (!USERNAME_RE.test(username)) return setError(`Usernames are ${USERNAME_RULES}`)
    setError('')
    setBusy(true)
    try {
      const res = await axios.get(`/api/contacts/lookup/${encodeURIComponent(username)}`, api)
      setResult(res.data)
    } catch (err) {
      setError(errorOf(err, 'Search failed. Try again.'))
    } finally { setBusy(false) }
  }

  const act = async (fn) => {
    setBusy(true)
    setError('')
    try { await fn() } catch (err) { setError(errorOf(err, 'Something went wrong. Try again.')) } finally { setBusy(false) }
  }

  const sendRequest = () => act(async () => {
    const res = await axios.post('/api/contacts/requests', { username: result.user.username }, api)
    if (res.data.status === 'contact') {
      useConversation.getState().addContact(res.data.user)
      setResult({ ...result, user: res.data.user, status: 'contact' })
    } else {
      setResult({ ...result, status: 'outgoing', requestId: res.data.requestId })
    }
    loadRequests()
  })
  const cancel = () => act(async () => {
    await axios.delete(`/api/contacts/requests/${result.requestId}`, api)
    setResult({ ...result, status: 'none', requestId: null })
    loadRequests()
  })
  const accept = () => act(async () => {
    const res = await axios.post(`/api/contacts/requests/${result.requestId}/accept`, {}, api)
    useConversation.getState().addContact(res.data.user)
    setResult({ ...result, user: res.data.user, status: 'contact' })
    loadRequests()
  })

  const action = result && {
    none: <button className={primaryBtn} disabled={busy} onClick={sendRequest}><LuUserPlus className="size-4" /> Send request</button>,
    outgoing: <><span className="self-center text-xs text-slate-500">Request sent</span><button className={secondaryBtn} disabled={busy} onClick={cancel}>Cancel</button></>,
    incoming: <button className={primaryBtn} disabled={busy} onClick={accept}><LuCheck className="size-4" /> Accept</button>,
    contact: <button className={primaryBtn} onClick={() => openChat(result.user)}><LuMessageCircle className="size-4" /> Message</button>,
    self: <button className={secondaryBtn} onClick={() => openChat(selfContact(AuthUser))}>That's you</button>,
  }[result.status]

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <LuAtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError('') }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <button type="submit" className={`${primaryBtn} h-10`} disabled={busy || !query.trim()}>
          {busy && !result ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuSearch className="size-4" />}
          Find
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-1 dark:bg-slate-800/50">
          <PersonRow user={result.user}>{action}</PersonRow>
        </div>
      )}

      {!result && !error && (
        <p className="mt-4 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          Ask a friend for their exact username. They'll get a request to accept.
          Or <button className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => goTo('invite')}>share your QR code</button> and they can add you instantly.
        </p>
      )}
    </div>
  )
}

// ── Incoming and sent requests ───────────────────────────────
const RequestsTab = () => {
  const { requests } = useConversation()
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const run = async (id, fn) => {
    setBusyId(id)
    setError('')
    try { await fn() } catch (err) { setError(errorOf(err, 'Something went wrong. Try again.')) } finally {
      setBusyId(null)
      loadRequests()
    }
  }
  const accept = (r) => run(r._id, async () => {
    const res = await axios.post(`/api/contacts/requests/${r._id}/accept`, {}, api)
    useConversation.getState().addContact(res.data.user)
  })
  const remove = (r) => run(r._id, () => axios.delete(`/api/contacts/requests/${r._id}`, api))

  if (!requests.incoming.length && !requests.outgoing.length) {
    return (
      <div className="py-8 text-center">
        <LuInbox className="mx-auto size-7 text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-sm font-medium">No requests</p>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">When someone adds you by username, it shows up here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {requests.incoming.length > 0 && (
        <section>
          <h4 className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Received</h4>
          <div className="mt-1">
            {requests.incoming.map((r) => (
              <PersonRow key={r._id} user={r.from}>
                <button className={secondaryBtn} disabled={busyId === r._id} onClick={() => remove(r)}>Decline</button>
                <button className={primaryBtn} disabled={busyId === r._id} onClick={() => accept(r)}>Accept</button>
              </PersonRow>
            ))}
          </div>
        </section>
      )}
      {requests.outgoing.length > 0 && (
        <section>
          <h4 className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Sent</h4>
          <div className="mt-1">
            {requests.outgoing.map((r) => (
              <PersonRow key={r._id} user={r.to}>
                <button className={secondaryBtn} disabled={busyId === r._id} onClick={() => remove(r)}>Cancel</button>
              </PersonRow>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── My invite link and QR code ───────────────────────────────
const InviteTab = () => {
  const [AuthUser] = useAuth()
  const [invite, setInvite] = useState(null) // { token, username }
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const qrRef = useRef(null)

  useEffect(() => {
    axios.get('/api/contacts/invite', api)
      .then((res) => setInvite(res.data))
      .catch((err) => setError(errorOf(err, 'Could not load your invite link.')))
  }, [])

  const url = invite && inviteUrl(invite.token)
  const shareText = `Chat with me on Kova: ${url}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { setError('Could not copy. Select the link and copy it manually.') }
  }

  const qrFile = () => new Promise((resolve) =>
    qrRef.current?.toBlob((blob) => resolve(blob && new File([blob], `kova-${invite.username}.png`, { type: 'image/png' })), 'image/png'))

  const download = async () => {
    const file = await qrFile()
    if (!file) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = file.name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Share the QR image too where the device supports it (phones), else just the link
  const share = async () => {
    try {
      const file = await qrFile()
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Add me on Kova', text: shareText, files: [file] })
      } else {
        await navigator.share({ title: 'Add me on Kova', text: shareText, url })
      }
    } catch { /* cancelled */ }
  }

  const reset = async () => {
    setBusy(true)
    try {
      const res = await axios.post('/api/contacts/invite/reset', {}, api)
      setInvite(res.data)
      setConfirmReset(false)
    } catch (err) {
      setError(errorOf(err, 'Could not reset the link.'))
    } finally { setBusy(false) }
  }

  if (error && !invite) return <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
  if (!invite) return <div className="flex justify-center py-16"><LuLoaderCircle className="size-6 animate-spin text-slate-400" /></div>

  return (
    <div className="flex flex-col items-center text-center">
      {/* QR codes need a light background to scan reliably, even in dark mode */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:ring-0">
        <QRCodeCanvas ref={qrRef} value={url} size={184} level="M" marginSize={1} />
      </div>
      <p className="mt-3 text-sm font-semibold">{AuthUser?.fullName}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">@{invite.username}</p>
      <p className="mt-3 max-w-xs text-[13px] text-slate-500 dark:text-slate-400">
        Anyone who scans this code or opens your link is added to your contacts right away.
      </p>

      <div className="mt-4 flex w-full items-center gap-2 rounded-xl bg-slate-50 p-1.5 pl-3 dark:bg-slate-800/60">
        <span className="min-w-0 flex-1 truncate text-left text-[13px] text-slate-600 dark:text-slate-300">{url}</span>
        <button className={`${primaryBtn} h-8 px-3`} onClick={copy}>
          {copied ? <LuCheck className="size-4" /> : <LuCopy className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-3 grid w-full grid-cols-2 gap-2">
        {typeof navigator.share === 'function' ? (
          <button className={secondaryBtn} onClick={share}><LuShare2 className="size-4" /> Share</button>
        ) : (
          <a className={secondaryBtn} href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
            <LuShare2 className="size-4" /> WhatsApp
          </a>
        )}
        <button className={secondaryBtn} onClick={download}><LuDownload className="size-4" /> Save QR</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 text-[13px]">
        {confirmReset ? (
          <span className="text-slate-500 dark:text-slate-400">
            Old link and QR stop working.{' '}
            <button className="font-medium text-red-600 hover:underline dark:text-red-400" disabled={busy} onClick={reset}>Reset</button>
            {' · '}
            <button className="font-medium hover:underline" onClick={() => setConfirmReset(false)}>Keep</button>
          </span>
        ) : (
          <button className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200" onClick={() => setConfirmReset(true)}>
            <LuRefreshCw className="size-3.5" /> Reset link
          </button>
        )}
      </div>
    </div>
  )
}

// ── Dialog shell ─────────────────────────────────────────────
const ContactsDialog = () => {
  const { contactsDialog: tab, setContactsDialog, setSelectedConversation, requests } = useConversation()
  const close = () => setContactsDialog(null)
  const incoming = requests.incoming.length

  useEffect(() => {
    if (!tab) return
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const openChat = (user) => {
    setSelectedConversation(user)
    close()
  }

  return createPortal(
    <AnimatePresence>
      {tab && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Add contacts"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-2xl bg-white text-slate-900 shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:text-slate-100 dark:ring-1 dark:ring-slate-800"
          >
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="text-lg font-semibold">Contacts</h3>
              <button onClick={close} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
                <LuX className="size-4.5" />
              </button>
            </div>

            <div className="mx-5 mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setContactsDialog(id)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] font-medium transition ${
                    tab === id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                  {id === 'requests' && incoming > 0 && (
                    <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">{incoming}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="min-h-64 overflow-y-auto p-5">
              {tab === 'add' && <AddTab openChat={openChat} goTo={setContactsDialog} />}
              {tab === 'requests' && <RequestsTab />}
              {tab === 'invite' && <InviteTab />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default ContactsDialog
