import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useSearchParams } from 'react-router-dom'
import { LuArrowLeft, LuArrowRight, LuBriefcase, LuRotateCcw, LuTrash2, LuExternalLink, LuCalendarDays, LuChartColumn, LuChevronDown, LuInbox, LuLoaderCircle, LuMegaphone, LuPackage, LuSettings, LuShoppingBag, LuUsers } from 'react-icons/lu'
import useThemeClass from '../hooks/useThemeClass'
import usePageTitle from '../hooks/usePageTitle'
import { useAuth } from '../context/AuthProvider'
import { useSocket } from '../context/SocketProvider'
import Avatar from '../home/Avatar'
import useBusiness from './store'
import { BusinessBadge, OpenStatus } from './BusinessInfo'
import { CATEGORIES, api, bizUrl, categoryCover, coverOf, errorOf, localZone, sectionArt } from './utils'
import { Field, SectionContext, btn, textareaCls } from './workspace/ui'
import { Logo } from '../components/ui'
import Inbox from './workspace/Inbox'
import Customers from './workspace/Customers'
import Orders from './workspace/Orders'
import Bookings from './workspace/Bookings'
import Catalog from './workspace/Catalog'
import Broadcasts from './workspace/Broadcasts'
import Insights from './workspace/Insights'
import Settings from './workspace/Settings'
import ConfirmDialog from '../home/ConfirmDialog'

const SECTIONS = [
  { id: 'inbox', label: 'Inbox', Icon: LuInbox, roles: ['owner', 'admin', 'agent'] },
  { id: 'customers', label: 'Customers', Icon: LuUsers, roles: ['owner', 'admin', 'agent'] },
  { id: 'orders', label: 'Orders', Icon: LuShoppingBag, roles: ['owner', 'admin', 'agent'] },
  { id: 'bookings', label: 'Bookings', Icon: LuCalendarDays, roles: ['owner', 'admin', 'agent'] },
  { id: 'catalog', label: 'Catalog', Icon: LuPackage, roles: ['owner', 'admin'] },
  { id: 'broadcasts', label: 'Broadcasts', Icon: LuMegaphone, roles: ['owner', 'admin'] },
  { id: 'insights', label: 'Insights', Icon: LuChartColumn, roles: ['owner', 'admin'] },
  { id: 'settings', label: 'Settings', Icon: LuSettings, roles: ['owner', 'admin'] },
]

// The business someone switched off: switch back to it, or delete it for good
const PreviousBusiness = ({ previous, onRestore, onDeleted, busy }) => {
  const [AuthUser, setAuthUser] = useAuth()
  const [confirm, setConfirm] = useState(false)
  const remove = async () => {
    await axios.delete('/api/business/me', api)
    const user = { ...AuthUser, business: null }
    localStorage.setItem('chatUser', JSON.stringify(user))
    setAuthUser(user)
    setConfirm(false)
    onDeleted()
  }
  const since = previous.since ? new Date(previous.since).toLocaleDateString([], { month: 'short', year: 'numeric' }) : null
  const stats = [
    [LuPackage, previous.products, 'item'],
    [LuShoppingBag, previous.orders, 'order'],
    [LuCalendarDays, previous.bookings, 'booking'],
    [LuUsers, previous.customers, 'customer'],
  ]
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="relative h-24">
        <img src={previous.cover || categoryCover(previous.category)} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 to-slate-950/10" />
        <div className="absolute bottom-3 left-4 flex items-center gap-3 text-white">
          <span className="rounded-full ring-2 ring-white/80"><Avatar name={AuthUser?.fullName} src={AuthUser?.avatar?.url} size="sm" /></span>
          <span>
            <span className="block text-sm font-semibold">{AuthUser?.fullName}</span>
            <span className="block text-xs text-white/75">{previous.category}{since ? ` · since ${since}` : ''}</span>
          </span>
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">Switched off</span>
      </div>
      <div className="p-4">
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Your previous business</p>
        {previous.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{previous.description}</p>}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {stats.map(([Icon, n, word]) => (
            <div key={word} className="rounded-lg bg-slate-50 px-2 py-2 text-center dark:bg-slate-900">
              <Icon className="mx-auto size-4 text-slate-400" />
              <p className="mt-1 text-sm font-semibold tabular-nums">{n}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{word}{n === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onRestore} disabled={busy} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
            <LuRotateCcw className="size-4" /> {busy ? 'Switching…' : 'Switch back to this business'}
          </button>
          <button onClick={() => setConfirm(true)} disabled={busy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/10">
            <LuTrash2 className="size-4" /> Delete
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        title="Delete this business for good?"
        description={`Your catalog (${previous.products} item${previous.products === 1 ? '' : 's'}), customer notes and labels, quick replies, team, cover photo and payment QR are deleted. This can't be undone. Orders and bookings stay in your customers' history.`}
        confirmLabel="Delete business"
      />
    </div>
  )
}

// ── Turn on a business account ─────────────────────────────────
const Setup = ({ workFor, previous, onOpen, onEnabled }) => {
  const [AuthUser, setAuthUser] = useAuth()
  const [category, setCategory] = useState(previous?.category && CATEGORIES.includes(previous.category) ? previous.category : CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState(false) // set up with new details instead of switching back
  const turnOn = async (body) => {
    setBusy(true); setError('')
    try {
      const res = await axios.put('/api/business/profile', { enabled: true, timeZone: localZone(), ...body }, api)
      const user = { ...AuthUser, business: res.data.business }
      localStorage.setItem('chatUser', JSON.stringify(user))
      setAuthUser(user)
      onEnabled()
    } catch (err) { setError(errorOf(err)); setBusy(false) }
  }
  const enable = (e) => { e.preventDefault(); turnOn({ category, description }) }
  const showForm = !previous || fresh
  return (
    <div className="grid h-dvh overflow-hidden bg-white text-slate-900 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] dark:bg-slate-950 dark:text-slate-100">
      {/* Form */}
      <div className="flex min-h-0 flex-col overflow-y-auto px-5 py-5 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <Logo />
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><LuArrowLeft className="size-4" /> Back to chats</Link>
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-8">
          <h1 className="text-[28px] font-semibold tracking-tight">{previous ? 'Welcome back' : 'Set up your business'}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">{previous ? 'Your business is switched off. Everything is saved, so you can pick up where you left off.' : 'Sell, take bookings and reply to customers from Kova. Your personal chats stay as they are.'}</p>

          {previous && (
            <PreviousBusiness previous={previous} busy={busy} onRestore={() => turnOn({})} onDeleted={() => { setFresh(false); onEnabled() }} />
          )}
          {previous && !fresh && error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {previous && !fresh && (
            <button onClick={() => setFresh(true)} className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              <LuBriefcase className="size-4" /> Switch back with a new category or description
            </button>
          )}

          {workFor.length > 0 && (
            <div className="mt-8">
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Businesses you work for</p>
              <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {workFor.map((w) => (
                  <button key={w._id} onClick={() => onOpen(w._id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900">
                    <Avatar name={w.fullName} src={w.avatar?.url} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.fullName}</span>
                    <span className="text-xs capitalize text-slate-500 dark:text-slate-400">{w.role}</span>
                    <LuArrowRight className="size-4 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {showForm && <form onSubmit={enable} className="mt-6 space-y-5">
            <div>
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Business name</p>
              <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                <Avatar name={AuthUser?.fullName} src={AuthUser?.avatar?.url} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{AuthUser?.fullName}</span>
                <Link to="/profile" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Change</Link>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Your profile name and photo are used as the business name and logo.</p>
            </div>

            <fieldset>
              <legend className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Category</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {CATEGORIES.map((c) => (
                  <label key={c} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm transition ${category === c ? 'border-indigo-600 bg-indigo-50/60 font-medium text-slate-900 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700'}`}>
                    <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} className="size-3.5 accent-indigo-600" />
                    <span className="leading-tight">{c}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="Short description" hint="Shown on your profile and business page. You can change it later.">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} placeholder="Fresh cakes and breads, made daily" className={textareaCls} />
            </Field>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button disabled={busy} className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">{busy ? 'Setting up…' : previous ? 'Switch back with these details' : 'Create business account'}</button>
            {previous && <p className="text-xs text-slate-500 dark:text-slate-400">Your catalog, customers and settings come back too.</p>}
          </form>}

          <p className="mt-6 border-t border-slate-200 pt-4 text-[13px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Includes a business page with your catalog, orders and payment requests, bookings, a shared inbox for your team, and insights. You can turn it off any time in Settings.
          </p>
        </div>
      </div>

      {/* Photo for the chosen category */}
      <div className="relative hidden h-dvh overflow-hidden bg-slate-900 lg:block">
        {CATEGORIES.map((c) => (
          <img key={c} src={categoryCover(c)} alt="" loading={c === category ? 'eager' : 'lazy'} className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${c === category ? 'opacity-100' : 'opacity-0'}`} />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="text-sm text-white/70">{category}</p>
          <p className="mt-2 max-w-md text-2xl font-medium leading-snug">Customers can see your catalog, order, book a time and message you, all from one link.</p>
        </div>
      </div>
    </div>
  )
}

// ── The workspace ──────────────────────────────────────────────
const BusinessPage = () => {
  useThemeClass()
  usePageTitle('Business')
  const [AuthUser] = useAuth()
  const { socket } = useSocket()
  const me = useBusiness((s) => s.me)
  const [params, setParams] = useSearchParams()
  const [overview, setOverview] = useState(null)
  const [customers, setCustomers] = useState(null)
  const [error, setError] = useState('')
  const [switcher, setSwitcher] = useState(false)

  useEffect(() => { useBusiness.getState().loadMe() }, [])

  const ownBusiness = !!me?.business?.enabled
  const bizParam = params.get('biz')
  const biz = bizParam || (ownBusiness ? String(AuthUser?._id) : me?.workFor?.[0]?._id) || null
  const role = overview?.role
  const allowed = SECTIONS.filter((s) => !role || s.roles.includes(role))
  const tab = allowed.some((s) => s.id === params.get('tab')) ? params.get('tab') : 'inbox'

  const go = (patch) => setParams((p) => {
    const next = new URLSearchParams(p)
    Object.entries(patch).forEach(([k, v]) => (v === null || v === undefined ? next.delete(k) : next.set(k, v)))
    return next
  }, { replace: false })

  const loadOverview = useCallback(async () => {
    if (!biz) return
    try {
      const res = await axios.get(bizUrl(biz, '/overview'), api)
      setOverview(res.data); setError('')
    } catch (err) { setError(errorOf(err, "Couldn't open this business")) }
  }, [biz])
  const loadCustomers = useCallback(async () => {
    if (!biz) return
    try { setCustomers((await axios.get(bizUrl(biz, '/customers'), api)).data.customers) } catch { /* keep the old list */ }
  }, [biz])

  // State is only set after the request / camera answers (async), not during the effect
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadOverview(); loadCustomers() }, [loadOverview, loadCustomers])
  // While switching to another business, don't show the previous one's data
  const ready = overview && String(overview.business._id) === String(biz)

  // Live: new messages and record changes update the inbox; settings changes reload
  useEffect(() => {
    if (!socket || !biz) return
    let timer = null
    const ours = (d) => String(d?.business) === String(biz)
    const refresh = () => { clearTimeout(timer); timer = setTimeout(loadCustomers, 400) }
    const onInbox = (d) => { if (ours(d)) refresh() }
    const onRecord = (d) => {
      if (!ours(d) || !d.record) return
      setCustomers((list) => list?.map((c) => (String(c.user._id) === String(d.record.customer) ? { ...c, record: d.record } : c)) ?? list)
    }
    const onSettings = (d) => { if (ours(d)) loadOverview() }
    const onSeen = () => refresh()
    socket.on('businessInbox', onInbox)
    socket.on('businessCustomer', onRecord)
    socket.on('businessSettings', onSettings)
    socket.on('messagesSeen', onSeen)
    return () => {
      clearTimeout(timer)
      socket.off('businessInbox', onInbox)
      socket.off('businessCustomer', onRecord)
      socket.off('businessSettings', onSettings)
      socket.off('messagesSeen', onSeen)
    }
  }, [socket, biz, loadCustomers, loadOverview])

  const team = useMemo(() => {
    if (!overview) return []
    const owner = overview.business
    return [{ _id: owner._id, fullName: owner.fullName, avatar: owner.avatar, role: 'owner' }, ...overview.settings.team.filter((t) => t.user).map((t) => ({ ...t.user, role: t.role }))]
  }, [overview])

  const waiting = customers?.filter((c) => c.record?.waitingSince).length || 0
  const unread = customers?.reduce((n, c) => n + (c.unread || 0), 0) || 0

  if (!me) return <div className="flex h-dvh items-center justify-center bg-white dark:bg-slate-950"><LuLoaderCircle className="size-6 animate-spin text-slate-400" /></div>

  if (!biz) return <Setup key={me.previous ? 'back' : 'new'} workFor={me.workFor || []} previous={me.previous} onOpen={(id) => go({ biz: id })} onEnabled={() => useBusiness.getState().loadMe()} />

  const ws = {
    biz, role, overview, business: overview?.business, settings: overview?.settings,
    setSettings: (settings) => setOverview((o) => ({ ...o, settings })),
    setBusiness: (business) => setOverview((o) => ({ ...o, business: { ...o.business, ...business } })),
    reloadOverview: loadOverview, customers, setCustomers, reloadCustomers: loadCustomers, team, go,
    openChat: (customerId) => go({ tab: 'inbox', customer: customerId }),
  }
  const switchable = [...(ownBusiness ? [{ _id: String(AuthUser._id), fullName: AuthUser.fullName, avatar: AuthUser.avatar, business: me.business, role: 'owner' }] : []), ...(me.workFor || [])]
  const current = switchable.find((b) => String(b._id) === String(biz))

  const nav = allowed.map((s) => ({ ...s, count: s.id === 'inbox' ? unread || waiting || 0 : 0 }))

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900 md:flex-row dark:bg-slate-950 dark:text-slate-100">
      {/* Sidebar (desktop) / top bar (phones) */}
      <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white md:w-64 md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2 px-3 pt-3 md:block md:px-4 md:pt-4">
          <Link to="/" className={`${btn.ghost} md:mb-3 md:-ml-1 md:justify-start`}><LuArrowLeft className="size-4" /><span className="hidden md:inline">Back to chats</span></Link>
          <div className="relative min-w-0 flex-1">
            <button onClick={() => setSwitcher((v) => !v)} className="group block w-full overflow-hidden rounded-2xl text-left ring-1 ring-slate-200 transition hover:ring-slate-300 md:shadow-sm dark:ring-slate-800 dark:hover:ring-slate-700" aria-expanded={switcher}>
              <div className="relative hidden h-20 overflow-hidden md:block">
                <img src={coverOf(overview?.business?.business || current?.business)} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-linear-to-t from-slate-950/50 to-transparent" />
              </div>
              <div className="flex items-center gap-2.5 bg-white p-2 md:items-end md:px-3 md:pb-3 dark:bg-slate-950">
                <span className="relative shrink-0 rounded-full md:-mt-6 md:ring-[3px] md:ring-white md:dark:ring-slate-950"><Avatar name={current?.fullName || overview?.business?.fullName} src={(current?.avatar || overview?.business?.avatar)?.url} size="sm" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-sm font-semibold">{current?.fullName || overview?.business?.fullName || '…'}<BusinessBadge business={overview?.business?.business} /></span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{overview?.business ? <OpenStatus business={overview.business.business} /> : ' '}</span>
                </span>
                {switchable.length > 1 && <LuChevronDown className="size-4 shrink-0 text-slate-400" />}
              </div>
            </button>
            {switcher && switchable.length > 1 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                {switchable.map((b) => (
                  <button key={b._id} onClick={() => { setSwitcher(false); go({ biz: b._id, tab: null, customer: null }) }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                    <img src={coverOf(b.business)} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1 truncate">{b.fullName}</span>
                    <span className="text-[11px] capitalize text-slate-400">{b.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] md:mt-3 md:flex-col md:overflow-visible md:px-4 md:py-0">
          {nav.map(({ id, label, Icon, count }) => (
            <button
              key={id}
              onClick={() => go({ tab: id, customer: null })}
              aria-current={tab === id ? 'page' : undefined}
              className={`group flex shrink-0 items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition ${tab === id ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'}`}
            >
              <span className={`flex size-7 items-center justify-center rounded-lg transition ${tab === id ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30' : 'bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-slate-900 dark:text-slate-400 dark:group-hover:bg-slate-800'}`}><Icon className="size-4" /></span>
              {label}
              {count > 0 && <span className="ml-auto rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">{count}</span>}
            </button>
          ))}
        </nav>
        {overview?.business?.username && (
          <a href={`/b/${overview.business.username}`} target="_blank" rel="noreferrer" className="group relative isolate mx-4 mb-4 mt-auto hidden overflow-hidden rounded-2xl p-4 text-white md:block">
            <img src={sectionArt('catalog')} alt="" className="absolute inset-0 -z-10 size-full object-cover transition duration-500 group-hover:scale-105" />
            <span className="absolute inset-0 -z-10 bg-linear-to-t from-indigo-950/90 to-indigo-900/40" />
            <span className="block text-sm font-semibold">Your business page</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-white/75">See what customers see <LuExternalLink className="size-3" /></span>
          </a>
        )}
        {role && <p className="hidden px-5 pb-4 text-xs text-slate-400 md:block">Signed in as {role}</p>}
      </aside>

      {/* Main */}
      <SectionContext.Provider value={{ image: sectionArt(tab), eyebrow: overview?.business?.fullName || '' }}>
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {error ? (
          <div className="p-8 text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : !ready ? (
          <div className="flex h-full items-center justify-center"><LuLoaderCircle className="size-6 animate-spin text-slate-400" /></div>
        ) : tab === 'inbox' ? (
          <Inbox ws={ws} customerId={params.get('customer')} />
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
              {tab === 'customers' && <Customers ws={ws} />}
              {tab === 'orders' && <Orders ws={ws} />}
              {tab === 'bookings' && <Bookings ws={ws} />}
              {tab === 'catalog' && <Catalog ws={ws} />}
              {tab === 'broadcasts' && <Broadcasts ws={ws} />}
              {tab === 'insights' && <Insights ws={ws} />}
              {tab === 'settings' && <Settings ws={ws} />}
            </div>
          </div>
        )}
      </main>
      </SectionContext.Provider>
    </div>
  )
}

export default BusinessPage
