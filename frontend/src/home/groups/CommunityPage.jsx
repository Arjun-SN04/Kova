import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { LuArrowLeft, LuCheck, LuLogOut, LuPencil, LuPlus, LuShield, LuShieldOff, LuTrash2, LuUserMinus, LuUserPlus } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import Avatar, { GroupAvatar } from '../Avatar'
import ConfirmDialog from '../ConfirmDialog'
import AddPeopleDialog from './AddPeopleDialog'
import { communitiesApi, errorOf, groupsApi, isAdminOf, loadCommunities } from '../../utils/groups'

const smallBtn = 'flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'
const sectionTitle = 'text-xs font-semibold uppercase tracking-wide text-slate-400'

// Full page for a community: its groups (open or join), members and admin tools
const CommunityPage = ({ community: summary }) => {
  const [AuthUser] = useAuth()
  const { contacts, groups, communities, setSelectedConversation, upsertGroup, setCreateDialog } = useConversation()
  const myId = String(AuthUser?._id)
  const [community, setCommunity] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'leave' | 'delete' | { remove: member }
  const [busyGroup, setBusyGroup] = useState(null)

  const id = summary._id
  const refresh = useCallback(() =>
    communitiesApi.get(id)
      .then((res) => { setCommunity(res.data); setName(res.data.name); setDescription(res.data.description || '') })
      .catch((err) => setError(errorOf(err))), [id])

  // Reload when the community list changes (someone joined, a group was added, …)
  const listVersion = communities.find((c) => String(c._id) === String(id))
  useEffect(() => { refresh() }, [refresh, listVersion])

  if (!community) {
    return (
      <div className="chat-bg flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        {error || 'Loading community…'}
      </div>
    )
  }

  const amAdmin = isAdminOf(community, myId)
  const run = async (fn) => { setError(''); try { await fn() } catch (err) { setError(errorOf(err)) } }

  const openGroup = (g) => run(async () => {
    const known = groups.find((x) => String(x._id) === String(g._id))
    if (known) return setSelectedConversation(known)
    const res = await axios.get(`/api/groups/${g._id}`, { withCredentials: true })
    upsertGroup(res.data)
    setSelectedConversation(res.data)
  })

  const joinGroup = (g) => run(async () => {
    setBusyGroup(g._id)
    try {
      const res = await groupsApi.join(g._id)
      upsertGroup(res.data)
      loadCommunities()
      setSelectedConversation(res.data)
    } finally { setBusyGroup(null) }
  })

  const save = () => run(async () => {
    const res = await communitiesApi.update(id, { name, description })
    setCommunity((c) => ({ ...c, ...res.data, members: c.members }))
    setEditing(false)
    loadCommunities()
  })

  const toggleAdmin = (m) => run(async () => {
    await communitiesApi.setAdmin(id, m._id, !isAdminOf(community, m._id))
    await refresh()
  })

  const memberIds = new Set(community.members.map((m) => String(m._id)))
  const addPool = contacts.filter((c) => !memberIds.has(String(c._id)))

  const onConfirm = async () => {
    try {
      if (confirm === 'leave') {
        await communitiesApi.removeMember(id, myId)
        setSelectedConversation(null)
      } else if (confirm === 'delete') {
        await communitiesApi.remove(id)
        setSelectedConversation(null)
      } else if (confirm?.remove) {
        await communitiesApi.removeMember(id, confirm.remove._id)
        await refresh()
      }
      loadCommunities()
      setConfirm(null)
    } catch (err) {
      setError(errorOf(err))
      setConfirm(null)
    }
  }

  const members = [...community.members].sort((a, b) =>
    (String(b._id) === myId) - (String(a._id) === myId) ||
    isAdminOf(community, b._id) - isAdminOf(community, a._id) ||
    a.fullName.localeCompare(b.fullName))

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white dark:bg-slate-950">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-3 sm:px-5 dark:border-slate-800">
        <button onClick={() => setSelectedConversation(null)} className={`${smallBtn} size-9! md:hidden`} aria-label="Back to chats">
          <LuArrowLeft className="size-5" />
        </button>
        <GroupAvatar name={community.name} community size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{community.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Community · {community.members.length} members</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-5 py-8">
          {/* About */}
          <div className="flex flex-col items-center text-center">
            <GroupAvatar name={community.name} community size="lg" />
            {editing ? (
              <div className="mt-4 w-full max-w-sm space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} placeholder="Description" className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
                <div className="flex justify-center gap-2">
                  <button onClick={() => setEditing(false)} className="h-8 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                  <button onClick={save} className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500"><LuCheck className="size-3.5" /> Save</button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="mt-4 flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
                  {community.name}
                  {amAdmin && <button onClick={() => setEditing(true)} aria-label="Edit community" className={smallBtn}><LuPencil className="size-4" /></button>}
                </h2>
                {community.description && <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{community.description}</p>}
              </>
            )}
          </div>

          {error && <p className="mt-6 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

          {/* Groups */}
          <div className="mt-10 flex items-center justify-between">
            <p className={sectionTitle}>Groups</p>
            {amAdmin && (
              <button onClick={() => setCreateDialog({ mode: 'communityGroup', community })} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
                <LuPlus className="size-3.5" /> New group
              </button>
            )}
          </div>
          <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {community.groups.map((g) => (
              <div key={g._id} className="flex items-center gap-3 px-4 py-3">
                <GroupAvatar name={g.name} src={g.avatar?.url} announcement={g.announcement} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{g.description || `${g.memberCount} members`}</p>
                </div>
                {g.joined ? (
                  <button onClick={() => openGroup(g)} className="h-8 rounded-lg px-3 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">Open</button>
                ) : (
                  <button onClick={() => joinGroup(g)} disabled={busyGroup === g._id} className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60">Join</button>
                )}
              </div>
            ))}
          </div>

          {/* Members */}
          <div className="mt-10 flex items-center justify-between">
            <p className={sectionTitle}>{community.members.length} members</p>
            {amAdmin && (
              <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
                <LuUserPlus className="size-3.5" /> Add members
              </button>
            )}
          </div>
          <div className="mt-2 space-y-0.5">
            {members.map((m) => {
              const me = String(m._id) === myId
              const admin = isAdminOf(community, m._id)
              return (
                <div key={m._id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                  <Avatar name={m.fullName} src={m.avatar?.url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{me ? 'You' : m.fullName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{m.username}</p>
                  </div>
                  {admin && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">Admin</span>}
                  {amAdmin && !me && (
                    <div className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button onClick={() => toggleAdmin(m)} className={smallBtn} title={admin ? 'Remove as admin' : 'Make admin'} aria-label={admin ? 'Remove as admin' : 'Make admin'}>
                        {admin ? <LuShieldOff className="size-3.5" /> : <LuShield className="size-3.5" />}
                      </button>
                      <button onClick={() => setConfirm({ remove: m })} className={`${smallBtn} hover:text-red-600!`} title="Remove from community" aria-label="Remove from community">
                        <LuUserMinus className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-10 space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button onClick={() => setConfirm('leave')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
              <LuLogOut className="size-4" /> Leave community
            </button>
            {amAdmin && (
              <button onClick={() => setConfirm('delete')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                <LuTrash2 className="size-4" /> Delete community
              </button>
            )}
          </div>
        </div>
      </div>

      <AddPeopleDialog
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add to ${community.name}`}
        pool={addPool}
        onAdd={async (ids) => { await communitiesApi.addMembers(id, ids); await refresh(); loadCommunities() }}
        emptyText="All your contacts are already in this community."
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={onConfirm}
        icon={confirm === 'delete' ? LuTrash2 : confirm === 'leave' ? LuLogOut : LuUserMinus}
        title={confirm === 'delete' ? `Delete ${community.name}?` : confirm === 'leave' ? `Leave ${community.name}?` : `Remove ${confirm?.remove?.fullName}?`}
        description={confirm === 'delete'
          ? 'The community, all its groups and their messages will be deleted for everyone.'
          : confirm === 'leave'
            ? "You'll also leave all of its groups."
            : 'They will also be removed from all of its groups.'}
        confirmLabel={confirm === 'delete' ? 'Delete' : confirm === 'leave' ? 'Leave' : 'Remove'}
        busyLabel="Working…"
      />
    </div>
  )
}

export default CommunityPage
