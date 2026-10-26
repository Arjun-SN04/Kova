import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { LuLink2Off, LuLoaderCircle, LuMessageCircle, LuUserPlus } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import useConversation from '../Zustand/UserConversation'
import Avatar from '../home/Avatar'
import { Button, Card, Logo } from './ui'
import usePageTitle from '../hooks/usePageTitle'
import useThemeClass from '../hooks/useThemeClass'
import { savePendingInvite } from '../utils/contacts'

// Someone opened an invite link (/invite/:token), e.g. by scanning a QR code.
const InvitePage = () => {
  usePageTitle('Invite')
  useThemeClass()
  const { token } = useParams()
  const navigate = useNavigate()
  const [AuthUser] = useAuth()
  const [invite, setInvite] = useState(null) // { user, status }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Logged out: remember the link so we come back here after login/signup
  useEffect(() => {
    if (!AuthUser) savePendingInvite(token)
  }, [AuthUser, token])

  useEffect(() => {
    if (!AuthUser) return
    axios.get(`/api/contacts/invite/${encodeURIComponent(token)}`, { withCredentials: true })
      .then((res) => setInvite(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not open this invite link.'))
  }, [AuthUser, token])

  const openChat = (user) => {
    useConversation.getState().setSelectedConversation(user)
    navigate('/', { replace: true })
  }

  const accept = async () => {
    setBusy(true)
    try {
      const res = await axios.post(`/api/contacts/invite/${encodeURIComponent(token)}`, {}, { withCredentials: true })
      useConversation.getState().addContact(res.data.user)
      openChat(res.data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add this contact.')
      setBusy(false)
    }
  }

  const user = invite?.user
  const firstName = user?.fullName?.split(' ')[0]

  let body
  if (!AuthUser) {
    body = (
      <>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <LuUserPlus className="size-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">You've been invited to Kova</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Log in or create an account, and you'll be connected right after.</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button to="/signup" fullWidth>Create account</Button>
          <Button to="/login" variant="secondary" fullWidth>Log in</Button>
        </div>
      </>
    )
  } else if (error) {
    body = (
      <>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <LuLink2Off className="size-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Link not working</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}. Ask your friend for a new one.</p>
        <div className="mt-6"><Button to="/" fullWidth>Back to chats</Button></div>
      </>
    )
  } else if (!invite) {
    body = <LuLoaderCircle className="mx-auto size-7 animate-spin text-slate-400" />
  } else {
    body = (
      <>
        <div className="flex justify-center"><Avatar name={user.fullName} src={user.avatar?.url} size="lg" /></div>
        <h1 className="mt-4 text-xl font-semibold">{user.fullName}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">@{user.username}</p>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {invite.status === 'self'
            ? 'This is your own invite link. Share it with friends so they can add you.'
            : invite.status === 'contact'
              ? `You and ${firstName} are already contacts.`
              : `${firstName} invited you to chat on Kova.`}
        </p>
        <div className="mt-6 grid gap-2">
          {invite.status === 'none' && (
            <Button onClick={accept} loading={busy} leftIcon={LuUserPlus} fullWidth>Add {firstName} to contacts</Button>
          )}
          {invite.status === 'contact' && (
            <Button onClick={() => openChat(user)} leftIcon={LuMessageCircle} fullWidth>Message {firstName}</Button>
          )}
          {invite.status === 'self' && (
            <Button to="/" fullWidth>Back to chats</Button>
          )}
          {invite.status === 'none' && <Button to="/" variant="ghost" fullWidth>Not now</Button>}
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

export default InvitePage
