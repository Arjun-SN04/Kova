import React, { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuArrowLeft, LuAtSign, LuCamera, LuKeyRound, LuLoaderCircle, LuLock, LuMail, LuTrash2, LuUser } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import { Alert, Button, Card, Input, Logo } from './ui'
import usePageTitle from '../hooks/usePageTitle'
import useThemeClass from '../hooks/useThemeClass'
import { compressAvatar } from '../utils/attachments'
import Logout from '../home/leftpart/Logout'
import NotificationSettings from './NotificationSettings'
import { checkUsernameFree, normalizeUsername, USERNAME_RULES } from '../utils/contacts'

const TABS = [
  { id: 'profile', label: 'Profile', Icon: LuUser },
  { id: 'password', label: 'Password', Icon: LuKeyRound },
]

const AVATAR_COLORS = [
  'from-violet-500 to-indigo-600',
  'from-pink-500 to-rose-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-blue-500 to-cyan-600',
]

const Profile = () => {
  usePageTitle('Profile settings')
  useThemeClass()
  const [AuthUser, setAuthUser] = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const initials = AuthUser?.fullName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  const colorIdx = (AuthUser?.fullName?.charCodeAt(0) || 0) % AVATAR_COLORS.length

  const { register: regProfile, handleSubmit: handleProfile, formState: { errors: profileErrors } } = useForm({
    defaultValues: { fullName: AuthUser?.fullName || '', username: AuthUser?.username || '' }
  })
  const { register: regPass, handleSubmit: handlePass, formState: { errors: passErrors }, watch, reset: resetPass } = useForm()
  const newPass = watch('newPassword', '')

  // ── Profile photo ──
  const photoInput = useRef(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const saveUser = (user) => {
    localStorage.setItem('chatUser', JSON.stringify(user))
    setAuthUser(user)
  }

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    try {
      const body = new FormData()
      body.append('avatar', await compressAvatar(file))
      const res = await axios.put('/api/user/avatar', body, { withCredentials: true })
      saveUser(res.data.user)
      showMsg('success', 'Your profile photo has been updated.')
    } catch (err) {
      showMsg('error', err.response?.data?.error || err.message || 'Could not update your photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const removePhoto = async () => {
    setPhotoBusy(true)
    try {
      const res = await axios.delete('/api/user/avatar', { withCredentials: true })
      saveUser(res.data.user)
      showMsg('success', 'Your profile photo has been removed.')
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'Could not remove your photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const showMsg = (type, msg) => {
    if (type === 'success') { setSuccess(msg); setError('') }
    else { setError(msg); setSuccess('') }
    setTimeout(() => { setSuccess(''); setError('') }, 3500)
  }

  const onUpdateProfile = async (data) => {
    setIsLoading(true)
    try {
      const res = await axios.put('/api/user/update', { fullName: data.fullName, username: data.username }, { withCredentials: true })
      const updated = res.data.user
      localStorage.setItem('chatUser', JSON.stringify(updated))
      setAuthUser(updated)
      showMsg('success', 'Your profile has been updated.')
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'Update failed')
    } finally { setIsLoading(false) }
  }

  const onUpdatePassword = async (data) => {
    setIsLoading(true)
    try {
      await axios.put('/api/user/update', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword
      }, { withCredentials: true })
      showMsg('success', 'Your password has been updated.')
      resetPass()
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'Password update failed')
    } finally { setIsLoading(false) }
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Logo to="/" />
          <div className="flex items-center gap-1">
            <Button to="/" variant="ghost" size="sm" leftIcon={LuArrowLeft}>Back to chats</Button>
            <Logout />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Account settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your profile and security.</p>

        {/* Identity */}
        <Card className="mt-8 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <div className="relative w-fit shrink-0">
            {AuthUser?.avatar?.url ? (
              <img src={AuthUser.avatar.url} alt="Your profile photo" className="size-20 rounded-2xl object-cover shadow-md" />
            ) : (
              <div className={`flex size-20 items-center justify-center rounded-2xl bg-linear-to-br ${AVATAR_COLORS[colorIdx]} text-2xl font-semibold text-white shadow-md`}>
                {initials}
              </div>
            )}
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={photoBusy}
              aria-label="Change profile photo"
              title="Change photo"
              className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md ring-2 ring-white transition hover:bg-indigo-500 dark:ring-slate-900"
            >
              {photoBusy ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuCamera className="size-4" />}
            </button>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={onPickPhoto} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-slate-900 dark:text-white">{AuthUser?.fullName}</p>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {AuthUser?.username && <span className="font-medium text-slate-700 dark:text-slate-300">@{AuthUser.username} · </span>}
              {AuthUser?.email}
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>
          <div className="flex gap-2 sm:flex-col">
            <Button variant="secondary" size="sm" leftIcon={LuCamera} disabled={photoBusy} onClick={() => photoInput.current?.click()}>
              {AuthUser?.avatar?.url ? 'Change photo' : 'Upload photo'}
            </Button>
            {AuthUser?.avatar?.url && (
              <Button variant="ghost" size="sm" leftIcon={LuTrash2} disabled={photoBusy} onClick={removePhoto} className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10">
                Remove
              </Button>
            )}
          </div>
        </Card>

        {/* Notifications */}
        <Card className="mt-6 overflow-hidden">
          <NotificationSettings />
        </Card>

        {/* Settings */}
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-slate-100 px-6 pt-4 dark:border-slate-800">
            <div className="flex gap-6">
              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`relative flex items-center gap-2 pb-3.5 text-sm font-medium transition ${
                    activeTab === id ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                  {activeTab === id && (
                    <motion.span layoutId="profile-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-indigo-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <Alert type="success" message={success} className="mb-6" />
            <Alert type="error" message={error} className="mb-6" />

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
              >
                {activeTab === 'profile' ? (
                  <form onSubmit={handleProfile(onUpdateProfile)} className="max-w-md space-y-5" noValidate>
                    <Input
                      label="Full name"
                      icon={LuUser}
                      placeholder="Your full name"
                      error={profileErrors.fullName?.message}
                      {...regProfile('fullName', { required: 'Name is required' })}
                    />
                    <Input
                      label="Username"
                      icon={LuAtSign}
                      autoCapitalize="none"
                      spellCheck={false}
                      hint={`People can find you by @username. ${USERNAME_RULES}.`}
                      error={profileErrors.username?.message}
                      {...regProfile('username', {
                        required: 'Username is required',
                        setValueAs: normalizeUsername,
                        validate: (v) => checkUsernameFree(v, AuthUser?.username),
                      })}
                    />
                    <Input
                      label="Email address"
                      type="email"
                      icon={LuMail}
                      value={AuthUser?.email || ''}
                      disabled
                      hint="Your email address can't be changed."
                    />
                    <Button type="submit" loading={isLoading}>{isLoading ? 'Saving...' : 'Save changes'}</Button>
                  </form>
                ) : (
                  <form onSubmit={handlePass(onUpdatePassword)} className="max-w-md space-y-5" noValidate>
                    <Input
                      label="Current password"
                      type="password"
                      icon={LuLock}
                      autoComplete="current-password"
                      error={passErrors.currentPassword?.message}
                      {...regPass('currentPassword', { required: 'Current password is required' })}
                    />
                    <Input
                      label="New password"
                      type="password"
                      icon={LuLock}
                      autoComplete="new-password"
                      hint="At least 6 characters."
                      error={passErrors.newPassword?.message}
                      {...regPass('newPassword', { required: 'New password is required', minLength: { value: 6, message: 'Minimum 6 characters' } })}
                    />
                    <Input
                      label="Confirm new password"
                      type="password"
                      icon={LuLock}
                      autoComplete="new-password"
                      error={passErrors.confirmNew?.message}
                      {...regPass('confirmNew', { required: 'Please confirm', validate: v => v === newPass || "Passwords don't match" })}
                    />
                    <Button type="submit" loading={isLoading}>{isLoading ? 'Updating...' : 'Update password'}</Button>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </Card>
      </main>
    </div>
  )
}

export default Profile
