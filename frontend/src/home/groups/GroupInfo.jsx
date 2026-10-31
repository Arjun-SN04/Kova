import React, { useRef, useState } from 'react'
import axios from 'axios'
import { motion } from 'motion/react'
import { LuCamera, LuCheck, LuChevronRight, LuLogOut, LuMegaphone, LuPencil, LuShield, LuShieldOff, LuTrash2, LuUserMinus, LuUserPlus, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import Avatar, { GroupAvatar } from '../Avatar'
import ConfirmDialog from '../ConfirmDialog'
import AddPeopleDialog from './AddPeopleDialog'
import ChatSettings from '../rightPart/ChatSettings'
import MediaSummary from '../media/MediaSummary'
import { GroupTasks } from '../../business/Tasks'
import { communitiesApi, errorOf, groupsApi, isAdminOf, loadCommunities } from '../../utils/groups'
import { compressAvatar } from '../../utils/attachments'
import GroupLink from './GroupLink'
import { ViewablePhoto } from '../../components/PhotoViewer'
import PhotoEditor from '../../components/PhotoEditor'

const smallBtn = 'flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'

// Side panel for a group: details, members and admin tools
const GroupInfo = ({ group, onClose }) => {
  const [AuthUser] = useAuth()
  const { contacts, communities, upsertGroup, removeGroup, setSelectedConversation } = useConversation()
  const myId = String(AuthUser?._id)
  const amAdmin = isAdminOf(group, myId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [error, setError] = useState('')
  const photoInput = useRef(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  // Group photo: square-crop and shrink like profile photos, then upload (null = remove)
  const [photoEdit, setPhotoEdit] = useState(null) // a new photo waiting in the editor
  const changePhoto = async (file) => {
    setPhotoBusy(true); setError('')
    try {
      if (file) {
        const form = new FormData()
        const small = await compressAvatar(file)
        form.append('avatar', small, small.name || 'group.webp')
        await axios.put(`/api/groups/${group._id}/avatar`, form, { withCredentials: true })
      } else {
        await axios.delete(`/api/groups/${group._id}/avatar`, { withCredentials: true })
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Couldn't update the photo")
    } finally {
      setPhotoBusy(false)
    }
  }
  const [adding, setAdding] = useState(false)
  const [pool, setPool] = useState([])
  const [confirm, setConfirm] = useState(null) // 'leave' | 'delete' | { remove: member }

  const run = async (fn) => {
    setError('')
    try { await fn() } catch (err) { setError(errorOf(err)) }
  }

  const save = () => run(async () => {
    const res = await groupsApi.update(group._id, { name, description })
    upsertGroup(res.data)
    setEditing(false)
  })

  // Community groups add from the community's members, other groups from my contacts
  const openAdd = () => run(async () => {
    const inGroup = new Set(group.members.map((m) => String(m._id)))
    const people = group.community
      ? (await communitiesApi.get(group.community._id)).data.members
      : contacts
    setPool(people.filter((p) => !inGroup.has(String(p._id))))
    setAdding(true)
  })

  const addPeople = async (ids) => {
    const res = await groupsApi.addMembers(group._id, ids)
    upsertGroup(res.data)
  }

  const toggleAdmin = (member) => run(async () => {
    const res = await groupsApi.setAdmin(group._id, member._id, !isAdminOf(group, member._id))
    upsertGroup(res.data)
  })

  const onConfirm = async () => {
    try {
      if (confirm === 'leave') {
        await groupsApi.removeMember(group._id, myId)
        removeGroup(group._id)
      } else if (confirm === 'delete') {
        await groupsApi.remove(group._id)
        removeGroup(group._id)
      } else if (confirm?.remove) {
        await groupsApi.removeMember(group._id, confirm.remove._id)
        upsertGroup({ ...group, members: group.members.filter((m) => String(m._id) !== String(confirm.remove._id)) })
      }
      if (group.community) loadCommunities()
      setConfirm(null)
    } catch (err) {
      setError(errorOf(err))
      setConfirm(null)
    }
  }

  const community = group.community && communities.find((c) => String(c._id) === String(group.community._id))
  const members = [...group.members].sort((a, b) =>
    (String(b._id) === myId) - (String(a._id) === myId) ||
    isAdminOf(group, b._id) - isAdminOf(group, a._id) ||
    a.fullName.localeCompare(b.fullName))

  return (
    <>
      <motion.div className="fixed inset-0 z-30 bg-slate-950/30 xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white xl:static xl:z-auto xl:w-80 xl:max-w-none dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <p className="text-[15px] font-semibold">{group.announcement ? 'Announcements' : 'Group info'}</p>
          <button onClick={onClose} aria-label="Close" className={smallBtn}><LuX className="size-4.5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <ViewablePhoto src={group.avatar?.url} name={group.name} subtitle={`Group · ${group.members.length} members`}>
                <GroupAvatar name={group.name} src={group.avatar?.url} announcement={group.announcement} size="lg" />
              </ViewablePhoto>
              {amAdmin && !group.announcement && (
                <>
                  <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhotoEdit(f) }} />
                  <button
                    onClick={() => photoInput.current?.click()}
                    disabled={photoBusy}
                    className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-4 ring-white transition hover:bg-indigo-500 disabled:opacity-60 dark:ring-slate-950"
                    title={group.avatar ? 'Change group photo' : 'Add group photo'}
                    aria-label="Change group photo"
                  >
                    {photoBusy ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <LuCamera className="size-3.5" />}
                  </button>
                </>
              )}
            </div>
            {amAdmin && group.avatar && !group.announcement && (
              <button onClick={() => changePhoto(null)} disabled={photoBusy} className="mt-2 text-xs text-slate-400 hover:text-red-600 hover:underline">Remove photo</button>
            )}
            {editing ? (
              <div className="mt-4 w-full space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} placeholder="Description" className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
                <div className="flex justify-center gap-2">
                  <button onClick={() => setEditing(false)} className="h-8 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                  <button onClick={save} className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500"><LuCheck className="size-3.5" /> Save</button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-4 flex items-center gap-1.5 text-lg font-semibold">
                  {group.name}
                  {amAdmin && !group.announcement && <button onClick={() => setEditing(true)} aria-label="Edit group" className={smallBtn}><LuPencil className="size-3.5" /></button>}
                </p>
                {group.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{group.description}</p>}
                <p className="mt-1 text-xs text-slate-400">Group · {group.members.length} members</p>
              </>
            )}
          </div>

          {community && (
            <button onClick={() => setSelectedConversation(community)} className="mt-6 flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800">
              <GroupAvatar name={community.name} community size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Part of community</p>
                <p className="truncate text-sm font-medium">{community.name}</p>
              </div>
              <LuChevronRight className="size-4 text-slate-400" />
            </button>
          )}

          <MediaSummary chat={group} />
          {!group.announcement && <ChatSettings chat={group} canChangeTimer={amAdmin} />}
          {!group.announcement && amAdmin && (
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
              <LuMegaphone className="size-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Only admins can send messages</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Members can still read, react and vote in polls.</span>
              </span>
              <input type="checkbox" role="switch" className="peer sr-only" checked={!!group.adminsOnly} onChange={(e) => run(async () => { const res = await groupsApi.update(group._id, { adminsOnly: e.target.checked }); upsertGroup(res.data) })} />
              <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-indigo-600 dark:bg-slate-700 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
            </label>
          )}
          {!group.announcement && !group.community && amAdmin && <GroupLink group={group} />}
          {!group.announcement && !amAdmin && group.adminsOnly && (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300"><LuMegaphone className="size-4 text-slate-400" /> Only admins can send messages in this group.</p>
          )}
          {!group.announcement && <GroupTasks groupId={group._id} />}

          {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group.members.length} members</p>
              {group.pendingInvites > 0 && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{group.pendingInvites} invited · waiting for them to accept</p>}
            </div>
            {amAdmin && !group.announcement && (
              <button onClick={openAdd} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10">
                <LuUserPlus className="size-3.5" /> Add
              </button>
            )}
          </div>
          <div className="mt-2 space-y-0.5">
            {members.map((m) => {
              const me = String(m._id) === myId
              const admin = isAdminOf(group, m._id)
              return (
                <div key={m._id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                  <Avatar name={m.fullName} src={m.avatar?.url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{me ? 'You' : m.fullName}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{m.username}</p>
                  </div>
                  {admin && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">Admin</span>}
                  {amAdmin && !me && !group.announcement && (
                    <div className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button onClick={() => toggleAdmin(m)} className={smallBtn} title={admin ? 'Remove as admin' : 'Make admin'} aria-label={admin ? 'Remove as admin' : 'Make admin'}>
                        {admin ? <LuShieldOff className="size-3.5" /> : <LuShield className="size-3.5" />}
                      </button>
                      <button onClick={() => setConfirm({ remove: m })} className={`${smallBtn} hover:text-red-600!`} title="Remove from group" aria-label="Remove from group">
                        <LuUserMinus className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!group.announcement && (
            <div className="mt-6 space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button onClick={() => setConfirm('leave')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                <LuLogOut className="size-4" /> Leave group
              </button>
              {amAdmin && (
                <button onClick={() => setConfirm('delete')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
                  <LuTrash2 className="size-4" /> Delete group
                </button>
              )}
            </div>
          )}
          {group.announcement && (
            <p className="mt-6 text-center text-xs text-slate-400">Everyone in the community is here. Manage people from the community page.</p>
          )}
        </div>
      </motion.aside>

      <AddPeopleDialog
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add to ${group.name}`}
        pool={pool}
        onAdd={addPeople}
        emptyText={group.community ? 'Everyone in the community is already here.' : 'All your contacts are already here.'}
      />
      {photoEdit && <PhotoEditor source={photoEdit} title="Edit group photo" onSave={changePhoto} onClose={() => setPhotoEdit(null)} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={onConfirm}
        icon={confirm === 'delete' ? LuTrash2 : confirm === 'leave' ? LuLogOut : LuUserMinus}
        title={confirm === 'delete' ? `Delete ${group.name}?` : confirm === 'leave' ? `Leave ${group.name}?` : `Remove ${confirm?.remove?.fullName}?`}
        description={confirm === 'delete'
          ? 'The group and all its messages will be deleted for everyone.'
          : confirm === 'leave'
            ? "You'll stop getting its messages. An admin can add you back."
            : 'They will no longer see new messages in this group.'}
        confirmLabel={confirm === 'delete' ? 'Delete' : confirm === 'leave' ? 'Leave' : 'Remove'}
        busyLabel="Working…"
      />
    </>
  )
}

export default GroupInfo
