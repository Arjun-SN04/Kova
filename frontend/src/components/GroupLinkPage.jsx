import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LuClock, LuLink2Off, LuLoaderCircle, LuUsers } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import useConversation from '../Zustand/UserConversation'
import { GroupAvatar } from '../home/Avatar'
import { Button, Card, Logo } from './ui'
import usePageTitle from '../hooks/usePageTitle'
import useThemeClass from '../hooks/useThemeClass'
import { saveReturnTo } from '../business/utils'
import { groupLinks } from '../utils/groups'

// Someone opened a group invite link (/g/:code)
const GroupLinkPage = () => {
  usePageTitle('Group invite')
  useThemeClass()
  const { code } = useParams()
  const navigate = useNavigate()
  const [AuthUser] = useAuth()
  const [data, setData] = useState(null) // { group, status }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Logged out: come back here after logging in
  useEffect(() => { if (!AuthUser) saveReturnTo(`/g/${code}`) }, [AuthUser, code])
  useEffect(() => {
    if (!AuthUser) return
    groupLinks.preview(code).then((r) => setData(r.data)).catch((err) => setError(err.response?.data?.error || 'Could not open this link'))
  }, [AuthUser, code])

  const open = (group) => {
    useConversation.getState().upsertGroup(group)
    useConversation.getState().setSelectedConversation(group)
    navigate('/', { replace: true })
  }
  const join = async () => {
    setBusy(true); setError('')
    try {
      const res = await groupLinks.join(code)
      if (res.data.status === 'member') open(res.data.group)
      else { setData((d) => ({ ...d, status: 'requested' })); setBusy(false) }
    } catch (err) { setError(err.response?.data?.error || 'Could not join'); setBusy(false) }
  }

  const g = data?.group
  let body
  if (!AuthUser) {
    body = (
      <>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuUsers className="size-6" /></div>
        <h1 className="mt-5 text-xl font-semibold">You’ve been invited to a group</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Log in or create an account to see the group and join.</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button to="/signup" fullWidth>Create account</Button>
          <Button to="/login" variant="secondary" fullWidth>Log in</Button>
        </div>
      </>
    )
  } else if (error && !data) {
    body = (
      <>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"><LuLink2Off className="size-6" /></div>
        <h1 className="mt-5 text-xl font-semibold">Link not working</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}. Ask a group admin for a new one.</p>
        <div className="mt-6"><Button to="/" fullWidth>Back to chats</Button></div>
      </>
    )
  } else if (!data) {
    body = <LuLoaderCircle className="mx-auto size-7 animate-spin text-slate-400" />
  } else {
    body = (
      <>
        <div className="flex justify-center"><GroupAvatar name={g.name} src={g.avatar?.url} size="lg" /></div>
        <h1 className="mt-4 text-xl font-semibold">{g.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Group · {g.memberCount} member{g.memberCount === 1 ? '' : 's'}</p>
        {g.description && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{g.description}</p>}
        {data.status === 'requested' ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <LuClock className="mt-0.5 size-4 shrink-0 text-indigo-500" />
            <span>Request sent. You’ll join as soon as an admin approves it.</span>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            {data.status === 'member' ? 'You’re already in this group.' : g.approveJoins ? 'An admin approves new members.' : 'Anyone with this link can join.'}
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-6 grid gap-2">
          {data.status === 'none' && <Button onClick={join} loading={busy} leftIcon={LuUsers} fullWidth>{g.approveJoins ? 'Ask to join' : 'Join group'}</Button>}
          {data.status === 'member' && <Button onClick={join} loading={busy} fullWidth>Open group</Button>}
          <Button to="/" variant="ghost" fullWidth>{data.status === 'none' ? 'Not now' : 'Back to chats'}</Button>
        </div>
      </>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="px-6 py-6"><Logo to={AuthUser ? '/' : '/home'} /></header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-sm p-8 text-center">{body}</Card>
      </main>
    </div>
  )
}

export default GroupLinkPage
