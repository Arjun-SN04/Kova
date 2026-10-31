import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { useSocket } from '../../context/SocketProvider'
import useConversation from '../../Zustand/UserConversation'
import { GroupAvatar } from '../Avatar'

const api = { withCredentials: true }

// Group invites for people who chose "Only with my approval" in Privacy.
// Shown above the chat list with Join / Decline.
const GroupInvites = () => {
  const { socket } = useSocket()
  const [invites, setInvites] = useState([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    axios.get('/api/groups/invites', api).then((r) => setInvites(r.data.invites)).catch(() => {})
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    if (!socket) return
    socket.on('groupInvite', load)
    return () => socket.off('groupInvite', load)
  }, [socket, load])

  const answer = async (inv, join) => {
    setBusy(String(inv.group._id)); setError('')
    try {
      const res = join
        ? await axios.post(`/api/groups/invites/${inv.group._id}`, {}, api)
        : await axios.delete(`/api/groups/invites/${inv.group._id}`, api)
      if (join) {
        useConversation.getState().upsertGroup(res.data)
        useConversation.getState().setSelectedConversation(res.data)
      }
      setInvites((list) => list.filter((i) => String(i.group._id) !== String(inv.group._id)))
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
      load()
    } finally { setBusy('') }
  }

  if (!invites.length) return null
  return (
    <div className="mx-4 mt-3 space-y-2">
      {invites.map((inv) => (
        <div key={inv.group._id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <GroupAvatar name={inv.group.name} src={inv.group.avatar?.url} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{inv.group.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{inv.by ? `${inv.by.fullName} invited you` : 'You were invited'} · {inv.group.memberCount} members</p>
          </div>
          <button disabled={!!busy} onClick={() => answer(inv, false)} className="h-8 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">Decline</button>
          <button disabled={!!busy} onClick={() => answer(inv, true)} className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50">{busy === String(inv.group._id) ? '…' : 'Join'}</button>
        </div>
      ))}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default GroupInvites
