import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuArrowLeft, LuAtSign, LuBell, LuCamera, LuChevronRight, LuCircleUser, LuKeyRound, LuLoaderCircle, LuLock, LuMail, LuMessageSquareText, LuQuote, LuSearch, LuShieldCheck, LuSlidersHorizontal, LuTrash2, LuUser, LuX } from 'react-icons/lu'
import { useAuth } from '../context/AuthProvider'
import { Alert, Button, Card, Input } from './ui'
import usePageTitle from '../hooks/usePageTitle'
import useThemeClass from '../hooks/useThemeClass'
import { compressAvatar } from '../utils/attachments'
import Logout from '../home/leftpart/Logout'
import NotificationSettings from './NotificationSettings'
import AppearanceSettings from './AppearanceSettings'
import UsernameShare from './UsernameShare'
import PrivacySettings from './PrivacySettings'
import HiddenChatsSettings from './HiddenChatsSettings'
import ChatLockSettings from './ChatLockSettings'
import AccountDataSettings from './AccountDataSettings'
import EmailDigestSetting from './EmailDigestSetting'
import AppLockSettings from './AppLockSettings'
import DevicesSettings from './DevicesSettings'
import { BlockedAccounts, BusinessCard } from '../business/AccountExtras'
import { checkUsernameFree, normalizeUsername, USERNAME_RULES } from '../utils/contacts'
import { initialsOf } from '../home/Avatar'
import { ViewablePhoto } from './PhotoViewer'
import PhotoEditor from './PhotoEditor'
import { EncryptionNote } from './security/SettingsRows'

// The settings menu (left) and what each section shows (right)
const SECTIONS = [
  { id: 'profile', label: 'Profile', hint: 'Name, profile picture, username', Icon: LuCircleUser, keywords: 'name photo picture avatar about username email' },
  { id: 'account', label: 'Account', hint: 'Password, your data, business, delete account', Icon: LuKeyRound, keywords: 'password export download delete business data' },
  { id: 'privacy', label: 'Privacy', hint: 'Who sees your info, blocked contacts', Icon: LuShieldCheck, keywords: 'last seen online activity photo about groups read receipts blocked block' },
  { id: 'security', label: 'Security & locks', hint: 'App lock, locked chats, hidden chats', Icon: LuLock, keywords: 'pin app lock chat lock code secret word hidden fingerprint security question' },
  { id: 'chats', label: 'Chats', hint: 'Theme, colours, wallpaper', Icon: LuMessageSquareText, keywords: 'appearance dark light theme wallpaper colour color mode' },
  { id: 'notifications', label: 'Notifications', hint: 'Messages, push, email digest', Icon: LuBell, keywords: 'push sound email digest alerts' },
]

const AVATAR_COLORS = [
  'from-violet-500 to-indigo-600',
  'from-pink-500 to-rose-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-blue-500 to-cyan-600',
]

const Profile = () => {
  usePageTitle('Settings')
  useThemeClass()
  const [AuthUser, setAuthUser] = useAuth()
  // ?s=privacy keeps the open section in the URL (back button and refresh work)
  const [params, setParams] = useSearchParams()
  const section = SECTIONS.some((x) => x.id === params.get('s')) ? params.get('s') : null
  const shown = section || 'profile' // wide screens always show a section; phones show the menu first
  const open = (id) => setParams(id ? { s: id } : {}, { replace: false })
  const current = SECTIONS.find((x) => x.id === shown)
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? SECTIONS.filter((x) => `${x.label} ${x.hint} ${x.keywords}`.toLowerCase().includes(q)) : SECTIONS
  }, [query])
  // Each section starts at the top
  const contentRef = useRef(null)
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }) }, [shown])
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const initials = initialsOf(AuthUser?.fullName)
  const colorIdx = (AuthUser?.fullName?.charCodeAt(0) || 0) % AVATAR_COLORS.length

  const { register: regProfile, handleSubmit: handleProfile, formState: { errors: profileErrors } } = useForm({
    defaultValues: { fullName: AuthUser?.fullName || '', username: AuthUser?.username || '', about: AuthUser?.about || '' }
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

  // A new photo opens the editor first (crop, rotate, filters); the editor calls uploadPhoto
  const [editSource, setEditSource] = useState(null) // File | url
  const onPickPhoto = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { showMsg('error', 'Please choose an image'); return }
    setEditSource(file)
  }
  const uploadPhoto = async (file) => {
    setPhotoBusy(true)
    try {
      const body = new FormData()
      body.append('avatar', await compressAvatar(file))
      const res = await axios.put('/api/user/avatar', body, { withCredentials: true })
      saveUser(res.data.user)
      showMsg('success', 'Your profile photo has been updated.')
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
      const res = await axios.put('/api/user/update', { fullName: data.fullName, username: data.username, about: data.about }, { withCredentials: true })
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

  // ── Right side: one section at a time ──
  const profileForm = (
    <form onSubmit={handleProfile(onUpdateProfile)} className="space-y-5" noValidate>
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
        label="About"
        icon={LuQuote}
        placeholder="Available · Baker in Kochi"
        maxLength={140}
        hint="A short line on your profile (up to 140 characters)."
        {...regProfile('about')}
      />
      <Input label="Email address" type="email" icon={LuMail} value={AuthUser?.email || ''} disabled hint="Your email address can't be changed." />
      <Button type="submit" loading={isLoading}>{isLoading ? 'Saving...' : 'Save changes'}</Button>
    </form>
  )

  const passwordForm = (
    <form onSubmit={handlePass(onUpdatePassword)} className="space-y-5" noValidate>
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
        hint="At least 8 characters."
        error={passErrors.newPassword?.message}
        {...regPass('newPassword', { required: 'New password is required', minLength: { value: 8, message: 'Minimum 8 characters' } })}
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
  )

  const photo = (size) => (AuthUser?.avatar?.url
    ? <img src={AuthUser.avatar.url} alt="" className={`${size} rounded-full object-cover`} />
    : <span className={`flex ${size} items-center justify-center rounded-full bg-linear-to-br ${AVATAR_COLORS[colorIdx]} font-semibold text-white`}>{initials}</span>)

  const identity = (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center gap-4 px-6 pb-6 pt-8 text-center">
        <div className="relative">
          {AuthUser?.avatar?.url ? (
            <ViewablePhoto src={AuthUser.avatar.url} name={AuthUser.fullName} subtitle="Your profile photo" className="rounded-full!">
              <img src={AuthUser.avatar.url} alt="Your profile photo" className="size-32 rounded-full object-cover shadow-md ring-4 ring-white dark:ring-slate-800" />
            </ViewablePhoto>
          ) : (
            <div className={`flex size-32 items-center justify-center rounded-full bg-linear-to-br ${AVATAR_COLORS[colorIdx]} text-4xl font-semibold text-white shadow-md`}>{initials}</div>
          )}
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            disabled={photoBusy}
            aria-label="Change profile photo"
            title="Change photo"
            className="absolute bottom-1 right-1 flex size-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md ring-4 ring-white transition hover:bg-indigo-500 dark:ring-slate-900"
          >
            {photoBusy ? <LuLoaderCircle className="size-4.5 animate-spin" /> : <LuCamera className="size-4.5" />}
          </button>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={onPickPhoto} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold text-slate-900 dark:text-white">{AuthUser?.fullName}</p>
          {AuthUser?.username && <div className="mt-1 flex justify-center text-sm"><UsernameShare username={AuthUser.username} /></div>}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" leftIcon={LuCamera} disabled={photoBusy} onClick={() => photoInput.current?.click()}>
            {AuthUser?.avatar?.url ? 'Change photo' : 'Upload photo'}
          </Button>
          {AuthUser?.avatar?.url && (
            <Button variant="secondary" size="sm" leftIcon={LuSlidersHorizontal} disabled={photoBusy} onClick={() => setEditSource(AuthUser.avatar.url)}>Edit photo</Button>
          )}
          {AuthUser?.avatar?.url && (
            <Button variant="ghost" size="sm" leftIcon={LuTrash2} disabled={photoBusy} onClick={removePhoto} className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10">Remove</Button>
          )}
        </div>
      </div>
    </Card>
  )

  const titled = (title, body) => (
    <Card className="overflow-hidden">
      <p className="border-b border-slate-100 px-6 py-4 text-base font-semibold dark:border-slate-800">{title}</p>
      <div className="p-6">{body}</div>
    </Card>
  )

  const CONTENT = {
    profile: <>{identity}{titled('About you', profileForm)}</>,
    account: <>{titled('Change password', passwordForm)}<Card className="overflow-hidden"><AccountDataSettings /></Card><Card className="overflow-hidden"><BusinessCard /></Card></>,
    privacy: <><Card className="overflow-hidden"><PrivacySettings /></Card><Card className="overflow-hidden"><BlockedAccounts /></Card></>,
    security: <><Card className="overflow-hidden"><EncryptionNote icon={LuShieldCheck} /></Card><Card className="overflow-hidden"><DevicesSettings /></Card><Card className="overflow-hidden"><AppLockSettings /></Card><Card className="overflow-hidden"><ChatLockSettings /></Card><Card className="overflow-hidden"><HiddenChatsSettings /></Card></>,
    chats: <Card className="overflow-hidden"><AppearanceSettings /></Card>,
    notifications: <Card className="overflow-hidden"><NotificationSettings /><EmailDigestSetting /></Card>,
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* ── Left: the settings menu ── */}
      <aside className={`${section ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-slate-200 bg-white md:w-[340px] lg:w-[380px] dark:border-slate-800 dark:bg-slate-900`}>
        <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link to="/" className="flex size-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Back to chats" title="Back to chats">
            <LuArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        </header>

        <div className="px-4 pb-2">
          <label className="flex items-center gap-2.5 rounded-xl bg-slate-100 px-3 ring-indigo-500/30 transition focus-within:bg-white focus-within:ring-2 dark:bg-slate-800 dark:focus-within:bg-slate-800">
            <LuSearch className="size-4 shrink-0 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            {query && <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Clear search"><LuX className="size-4" /></button>}
          </label>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Settings sections">
          {/* You */}
          {!query && (
            <button onClick={() => open('profile')} className={`my-2 flex w-full items-center gap-4 rounded-2xl p-3 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800/70 ${shown === 'profile' ? 'md:bg-slate-100 md:dark:bg-slate-800/70' : ''}`}>
              {photo('size-16 text-xl')}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">{AuthUser?.fullName}</span>
                <span className="block truncate text-sm text-slate-500 dark:text-slate-400">{AuthUser?.about || (AuthUser?.username ? `@${AuthUser.username}` : AuthUser?.email)}</span>
              </span>
              <LuChevronRight className="size-4 shrink-0 text-slate-300 md:hidden dark:text-slate-600" />
            </button>
          )}

          {visible.map(({ id, label, hint, Icon }) => {
            const on = shown === id
            return (
              <button
                key={id}
                onClick={() => open(id)}
                aria-current={on ? 'page' : undefined}
                className={`group flex w-full items-center gap-5 rounded-xl px-4 py-3 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800/70 ${on ? 'md:bg-slate-100 md:dark:bg-slate-800/70' : ''}`}
              >
                <Icon className={`size-5 shrink-0 transition ${on ? 'md:text-indigo-600 md:dark:text-indigo-400' : ''} text-slate-500 dark:text-slate-400`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{label}</span>
                  <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">{hint}</span>
                </span>
                <LuChevronRight className="size-4 shrink-0 text-slate-300 md:hidden dark:text-slate-600" />
              </button>
            )
          })}
          {!visible.length && <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No settings match "{query}"</p>}

          {!query && (
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <Logout label="Log out" className="flex w-full items-center gap-5 rounded-xl px-4 py-3 text-left text-[15px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10" />
            </div>
          )}
        </nav>
      </aside>

      {/* ── Right: what's inside the chosen section ── */}
      <section className={`${section ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/80 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-lg sm:px-6 dark:border-slate-800 dark:bg-slate-950/80">
          <button onClick={() => open(null)} className="flex size-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Back to settings">
            <LuArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">{current.label}</h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{current.hint}</p>
          </div>
        </header>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={shown}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8"
            >
              {(success || error) && (
                <div>
                  <Alert type="success" message={success} />
                  <Alert type="error" message={error} />
                </div>
              )}
              {CONTENT[shown]}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {editSource && <PhotoEditor source={editSource} title="Edit profile photo" onSave={uploadPhoto} onClose={() => setEditSource(null)} />}
    </div>
  )
}

export default Profile
