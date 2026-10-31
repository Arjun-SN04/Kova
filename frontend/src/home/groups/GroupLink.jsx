import React, { useCallback, useEffect, useState } from 'react'
import { LuCheck, LuCopy, LuLink, LuRefreshCw, LuShare2, LuUserCheck, LuX } from 'react-icons/lu'
import Avatar from '../Avatar'
import useConversation from '../../Zustand/UserConversation'
import { useSocket } from '../../context/SocketProvider'
import { groupLinkUrl, groupLinks, groupsApi } from '../../utils/groups'

const errorOf = (err) => err?.response?.data?.error || 'Something went wrong'
const smallBtn = 'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'

// Group info (admins): invite link, "approve new members", and join requests
const GroupLink = ({ group }) => {
  const { upsertGroup } = useConversation()
  const { socket } = useSocket()
  const [code, setCode] = useState(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')

  const loadRequests = useCallback(() => {
    groupLinks.requests(group._id).then((r) => setRequests(r.data.requests)).catch(() => {})
  }, [group._id])
  useEffect(() => { if (group.joinRequestCount > 0) loadRequests() }, [group.joinRequestCount, loadRequests])
  useEffect(() => {
    if (!socket) return
    const onReq = (d) => { if (String(d.group) === String(group._id)) loadRequests() }
    socket.on('groupJoinRequest', onReq)
    return () => socket.off('groupJoinRequest', onReq)
  }, [socket, group._id, loadRequests])

  const run = async (fn) => { setError(''); try { await fn() } catch (err) { setError(errorOf(err)) } }
  const show = () => run(async () => { setCode((await groupLinks.get(group._id)).data.code); setOpen(true) })
  const url = code ? groupLinkUrl(code) : ''
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }
  const share = async () => {
    const text = `Join "${group.name}" on Kova`
    if (navigator.share) { try { await navigator.share({ title: group.name, text, url }) } catch { /* cancelled */ } } else copy()
  }
  const answer = (userId, approve) => run(async () => {
    const res = await groupLinks.answer(group._id, userId, approve)
    upsertGroup(res.data)
    setRequests((list) => list.filter((r) => String(r.user._id) !== String(userId)))
  })

  return (
    <div className="mt-3 rounded-2xl bg-slate-50 p-2 dark:bg-slate-900">
      {!open ? (
        <button onClick={show} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white dark:hover:bg-slate-800">
          <LuLink className="size-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Invite via link</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">Anyone with the link can {group.approveJoins ? 'ask to join' : 'join'}</span>
          </span>
        </button>
      ) : (
        <div className="px-3 py-2.5">
          <p className="text-sm font-medium">Invite link</p>
          <p className="mt-1.5 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700">{url}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button onClick={copy} className={smallBtn}>{copied ? <LuCheck className="size-3.5 text-emerald-500" /> : <LuCopy className="size-3.5" />}{copied ? 'Copied' : 'Copy'}</button>
            <button onClick={share} className={smallBtn}><LuShare2 className="size-3.5" />Share</button>
            <button onClick={() => run(async () => setCode((await groupLinks.reset(group._id)).data.code))} className={smallBtn} title="The old link stops working"><LuRefreshCw className="size-3.5" />Reset link</button>
            <button onClick={() => run(async () => { await groupLinks.remove(group._id); setCode(null); setOpen(false) })} className={`${smallBtn} text-red-600! dark:text-red-400!`}>Turn off</button>
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white dark:hover:bg-slate-800">
        <LuUserCheck className="size-4 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Approve new members</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">People who use the link wait for an admin to let them in</span>
        </span>
        <input type="checkbox" className="peer sr-only" checked={!!group.approveJoins} onChange={(e) => run(async () => upsertGroup((await groupsApi.update(group._id, { approveJoins: e.target.checked })).data))} />
        <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-indigo-600 dark:bg-slate-700 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
      </label>

      {requests.length > 0 && (
        <div className="mt-1 border-t border-slate-200 px-3 pb-1 pt-3 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Asked to join · {requests.length}</p>
          <ul className="mt-2 space-y-1">
            {requests.map((r) => (
              <li key={r.user._id} className="flex items-center gap-2.5 py-1">
                <Avatar name={r.user.fullName} src={r.user.avatar?.url} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm">{r.user.fullName}</span>
                <button onClick={() => answer(r.user._id, false)} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-red-600 dark:hover:bg-slate-800" aria-label={`Decline ${r.user.fullName}`} title="Decline"><LuX className="size-4" /></button>
                <button onClick={() => answer(r.user._id, true)} className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500" aria-label={`Approve ${r.user.fullName}`} title="Approve"><LuCheck className="size-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default GroupLink
