import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LuArrowLeft, LuCalendarDays, LuStar, LuTag, LuClock, LuGlobe, LuLoaderCircle, LuMail, LuMapPin, LuMessageSquare, LuMinus, LuPackage, LuPlus, LuShoppingBag, LuX } from 'react-icons/lu'
import useThemeClass from '../hooks/useThemeClass'
import usePageTitle from '../hooks/usePageTitle'
import { useAuth } from '../context/AuthProvider'
import Avatar from '../home/Avatar'
import Sheet from '../home/groups/Sheet'
import { Logo } from '../components/ui'
import useConversation from '../Zustand/UserConversation'
import { BusinessBadge } from './BusinessInfo'
import { DAY_NAMES, api, clock, coverOf, errorOf, hoursState, money, saveReturnTo, sectionArt, startBusinessChat } from './utils'
import { btn, textareaCls } from './workspace/ui'

// Next 14 days as YYYY-MM-DD in the business's time zone
const nextDays = (tz) => Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.now() + i * 86_400_000)
  return { ymd: d.toLocaleDateString('en-CA', { timeZone: tz }), weekday: d.toLocaleDateString([], { timeZone: tz, weekday: 'short' }), day: d.toLocaleDateString([], { timeZone: tz, day: 'numeric', month: 'short' }) }
})

// Pick a service, a day and a free time
const BookingDialog = ({ data, onClose, onBooked }) => {
  const tz = data.business.business.timeZone || 'UTC'
  const [service, setService] = useState(data.services[0]?._id || '')
  const days = useMemo(() => nextDays(tz), [tz])
  const [day, setDay] = useState(days[0].ymd)
  const [slots, setSlots] = useState(null)
  const [slot, setSlot] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!service) return
    axios.get(`/api/business/public/${data.business.username}/slots?service=${service}&date=${day}`, api)
      .then((r) => setSlots(r.data.slots)).catch((err) => { setSlots([]); setError(errorOf(err)) })
  }, [service, day, data.business.username])
  const book = async () => {
    setBusy(true); setError('')
    try {
      await axios.post('/api/business/bookings', { business: data.business._id, serviceId: service, start: slot.start, note }, api)
      onBooked()
    } catch (err) { setError(errorOf(err)); setBusy(false) }
  }
  const chosen = data.services.find((s) => s._id === service)
  return (
    <Sheet open onClose={onClose} title="Book an appointment" wide footer={
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-slate-500">{slot ? `${chosen?.name} · ${days.find((d) => d.ymd === day)?.weekday} ${slot.label}` : 'Pick a time'}</span>
        <button onClick={book} disabled={!slot || busy} className={btn.primary}>{busy ? 'Booking…' : 'Confirm booking'}</button>
      </div>
    }>
      <div className="space-y-5 pt-1">
        <div className="space-y-2">
          {data.services.map((s) => (
            <button key={s._id} onClick={() => { if (s._id !== service) { setSlots(null); setSlot(null) } setService(s._id) }} className={`flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left ring-1 transition ${service === s._id ? 'bg-indigo-50 ring-indigo-300 dark:bg-indigo-500/10 dark:ring-indigo-500/40' : 'ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800'}`}>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.name}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{s.minutes} min{s.description ? ` · ${s.description}` : ''}</span>
              </span>
              {s.price > 0 && <span className="shrink-0 text-sm font-medium">{money(s.price)}</span>}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">Day</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {days.map((d) => (
              <button key={d.ymd} onClick={() => { if (d.ymd !== day) { setSlots(null); setSlot(null) } setDay(d.ymd) }} className={`flex w-16 shrink-0 flex-col items-center rounded-xl py-2 text-xs ring-1 transition ${day === d.ymd ? 'bg-slate-900 text-white ring-slate-900 dark:bg-white dark:text-slate-900 dark:ring-white' : 'ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800'}`}>
                <span className="font-medium">{d.weekday}</span><span className="opacity-70">{d.day}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">Time <span className="font-normal text-slate-400">({tz})</span></p>
          {slots === null ? <LuLoaderCircle className="size-5 animate-spin text-slate-400" />
            : slots.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No free times this day. Try another.</p>
            : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {slots.map((s) => (
                  <button key={s.start} onClick={() => setSlot(s)} className={`rounded-lg py-2 text-sm ring-1 transition ${slot?.start === s.start ? 'bg-indigo-600 font-medium text-white ring-indigo-600' : 'ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800'}`}>{s.label}</button>
                ))}
              </div>
            )}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Anything they should know? (optional)" className={textareaCls} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Sheet>
  )
}

const PublicPage = () => {
  useThemeClass()
  const { username } = useParams()
  const navigate = useNavigate()
  const [AuthUser] = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [cart, setCart] = useState({}) // productId -> qty
  const [cartOpen, setCartOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [booking, setBooking] = useState(false)
  const [done, setDone] = useState('')
  usePageTitle(data?.business?.fullName || 'Business')

  useEffect(() => {
    axios.get(`/api/business/public/${username}`, api).then((r) => setData(r.data)).catch((err) => setError(errorOf(err, "This business doesn't exist")))
  }, [username, AuthUser?._id])

  // Signed out: sign in first, then come back here
  const needLogin = () => {
    if (AuthUser) return false
    saveReturnTo(`/b/${username}`)
    navigate('/login')
    return true
  }
  // Open the chat with the business in the app
  const openChat = async () => {
    if (needLogin()) return
    setBusy(true)
    try {
      const user = await startBusinessChat(data.business._id)
      useConversation.getState().addContact(user)
      useConversation.getState().setActivePanel('chats')
      useConversation.getState().setSelectedConversation(user)
      navigate('/')
    } catch (err) { setError(errorOf(err)); setBusy(false) }
  }
  const items = (data?.products || []).filter((p) => cart[p._id])
  const total = items.reduce((n, p) => n + p.price * cart[p._id], 0)
  const count = items.reduce((n, p) => n + cart[p._id], 0)
  const add = (p, d = 1) => setCart((c) => {
    const qty = Math.max(0, Math.min(99, (c[p._id] || 0) + d))
    const next = { ...c, [p._id]: qty }
    if (!qty) delete next[p._id]
    return next
  })
  // Discount code: checked by the server (again whenever the cart changes)
  const [codeInput, setCodeInput] = useState('')
  const [coupon, setCoupon] = useState(null) // { code, discount, label }
  const [couponError, setCouponError] = useState('')
  const checkCode = async (code, subtotal) => {
    try {
      const res = await axios.post(`/api/business/public/${username}/coupon`, { code, subtotal }, api)
      setCoupon(res.data.code ? res.data : null); setCouponError('')
    } catch (err) { setCoupon(null); setCouponError(errorOf(err)) }
  }
  useEffect(() => { if (coupon?.code && total > 0) checkCode(coupon.code, total) }, [total]) // eslint-disable-line react-hooks/exhaustive-deps
  const discount = coupon ? Math.min(total, coupon.discount) : 0
  const payable = Math.round((total - discount) * 100) / 100

  const order = async () => {
    if (needLogin()) return
    setBusy(true); setError('')
    try {
      await axios.post('/api/business/orders', { business: data.business._id, items: items.map((p) => ({ product: p._id, qty: cart[p._id] })), note, coupon: coupon?.code || '' }, api)
      setCart({}); setNote(''); setCartOpen(false); setCoupon(null); setCodeInput('')
      setDone('order')
    } catch (err) { setError(errorOf(err)) } finally { setBusy(false) }
  }

  if (error && !data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white p-6 text-center dark:bg-slate-950 dark:text-slate-100">
        <p className="text-lg font-semibold">{error}</p>
        <Link to="/" className={btn.secondary}>Go to Kova</Link>
      </div>
    )
  }
  if (!data) return <div className="flex min-h-dvh items-center justify-center bg-white dark:bg-slate-950"><LuLoaderCircle className="size-6 animate-spin text-slate-400" /></div>

  const { business: owner, products, services, relation } = data
  const b = owner.business
  const state = hoursState(b)
  const today = new Date().getDay()
  const isOwner = relation === 'owner' || !!data.role

  const openBooking = () => { if (!needLogin()) setBooking(true) }
  const infoRow = 'flex items-start gap-3 text-sm'

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          {AuthUser
            ? <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black/30 px-3.5 text-sm font-medium text-white backdrop-blur transition hover:bg-black/45"><LuArrowLeft className="size-4" /> Chats</Link>
            : <span className="rounded-full bg-white/90 px-3 py-1.5 backdrop-blur"><Logo /></span>}
          {!AuthUser && <Link to="/signup" className="inline-flex h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-100">Join Kova</Link>}
        </div>
      </header>

      {/* Cover */}
      <div className="relative h-64 overflow-hidden sm:h-80">
        <img src={coverOf(b)} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-b from-slate-950/50 via-slate-950/10 to-slate-950/60" />
      </div>

      <main className="relative mx-auto -mt-24 max-w-6xl px-4 pb-32">
        {/* Profile card */}
        <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xl shadow-slate-900/5 sm:p-7 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="-mt-14 shrink-0 self-start rounded-full bg-white p-1.5 shadow-lg sm:-mt-20 dark:bg-slate-900">
              <Avatar name={owner.fullName} src={owner.avatar?.url} size="lg" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{owner.fullName}<BusinessBadge business={b} className="size-5 shrink-0" /></h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                {b.category && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{b.category}</span>}
                {data.rating && <a href="#reviews" className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><LuStar className="size-3.5 fill-current" />{data.rating.average.toFixed(1)} <span className="font-normal opacity-75">({data.rating.count})</span></a>}
                {state && <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${state.open ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}><span className={`size-1.5 rounded-full ${state.open ? 'bg-emerald-500' : 'bg-slate-400'}`} />{state.label}</span>}
                <span className="text-slate-400">@{owner.username}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              {isOwner ? (
                <Link to="/business" className={`${btn.primary} h-11 px-5`}>Manage business</Link>
              ) : (
                <>
                  <button onClick={openChat} disabled={busy} className={`${btn.primary} h-11 px-5`}><LuMessageSquare className="size-4" /> Message</button>
                  {services.length > 0 && <button onClick={openBooking} className={`${btn.secondary} h-11 px-5`}><LuCalendarDays className="size-4" /> Book a time</button>}
                </>
              )}
            </div>
          </div>
          {b.description && <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{b.description}</p>}
        </section>

        {done && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
            <span className="flex-1">{done === 'order' ? 'Order sent! The business will confirm it in your chat.' : "You're booked! Details are in your chat with the business."}</span>
            <button onClick={openChat} className="font-medium underline">Open chat</button>
            <button onClick={() => setDone('')} aria-label="Dismiss"><LuX className="size-4" /></button>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-10">
            {/* Catalog */}
            <section>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Shop</h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{products.length ? `${products.length} item${products.length === 1 ? '' : 's'} · order here, pay in the chat` : 'Nothing listed yet'}</p>
                </div>
              </div>
              {products.length === 0 ? (
                <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <img src={sectionArt('catalog')} alt="" className="h-16 w-24 rounded-xl object-cover" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Nothing listed yet. Message the business to ask what's available.</p>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {products.map((p) => (
                    <article key={p._id} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
                        {p.image?.url
                          ? <img src={p.image.url} alt={p.name} className="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                          : <div className="flex size-full items-center justify-center bg-linear-to-br from-indigo-50 to-slate-100 text-indigo-300 dark:from-indigo-500/10 dark:to-slate-800 dark:text-slate-600"><LuPackage className="size-9" /></div>}
                        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-sm font-semibold text-slate-900 shadow-sm tabular-nums">{money(p.price)}</span>
                        {!p.inStock && <span className="absolute inset-0 flex items-center justify-center bg-slate-950/50 text-sm font-semibold text-white">Out of stock</span>}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="font-semibold leading-snug">{p.name}</h3>
                        {p.description && <p className="mt-1 line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{p.description}</p>}
                        <div className="mt-auto pt-4">
                          {!p.inStock || isOwner ? null
                            : cart[p._id] ? (
                              <div className="flex items-center gap-2 rounded-xl bg-indigo-50 p-1 dark:bg-indigo-500/10">
                                <button onClick={() => add(p, -1)} className={btn.icon} aria-label="One less"><LuMinus className="size-4" /></button>
                                <span className="w-6 text-center text-sm font-semibold tabular-nums">{cart[p._id]}</span>
                                <button onClick={() => add(p, 1)} className={btn.icon} aria-label="One more"><LuPlus className="size-4" /></button>
                                <span className="ml-auto pr-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">{money(p.price * cart[p._id])}</span>
                              </div>
                            ) : <button onClick={() => add(p)} className={`${btn.secondary} w-full`}><LuPlus className="size-4" /> Add to order</button>}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Services */}
            {services.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold tracking-tight">Book an appointment</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Pick a service and a free time. You'll get a reminder before it starts.</p>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="relative h-32 overflow-hidden">
                    <img src={sectionArt('bookings')} alt="" className="size-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-linear-to-r from-slate-950/70 to-transparent" />
                    <p className="absolute bottom-4 left-5 text-lg font-semibold text-white">{services.length} service{services.length === 1 ? '' : 's'} available</p>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {services.map((sv) => (
                      <li key={sv._id} className="flex items-center gap-4 px-5 py-4">
                        <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"><span className="text-sm font-semibold leading-none">{sv.minutes}</span><span className="text-[10px]">min</span></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{sv.name}</p>
                          {sv.description && <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">{sv.description}</p>}
                        </div>
                        {sv.price > 0 && <span className="text-sm font-semibold tabular-nums">{money(sv.price)}</span>}
                        {!isOwner && <button onClick={openBooking} className={btn.secondary}>Book</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* Reviews */}
            {data.rating && (
              <section id="reviews">
                <h2 className="text-xl font-semibold tracking-tight">What customers say</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><LuStar className="size-4 fill-amber-400 text-amber-400" />{data.rating.average.toFixed(1)} out of 5 · {data.rating.count} rating{data.rating.count === 1 ? '' : 's'}</p>
                {data.reviews.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {data.reviews.map((rv, i) => (
                      <figure key={i} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <LuStar key={n} className={`size-4 ${n <= rv.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />)}</div>
                        <blockquote className="mt-2 text-sm text-slate-700 dark:text-slate-300">“{rv.text}”</blockquote>
                        <figcaption className="mt-2 text-xs text-slate-500 dark:text-slate-400">{rv.name} · {new Date(rv.at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* About */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            {b.hours?.length === 7 && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="flex items-center gap-2 text-sm font-semibold"><LuClock className="size-4 text-indigo-500" /> Opening hours</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {b.hours.map((d, i) => (
                    <li key={i} className={`flex justify-between rounded-lg px-2 py-1 ${i === today ? 'bg-indigo-50 font-semibold text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-100' : 'text-slate-600 dark:text-slate-300'}`}>
                      <span>{DAY_NAMES[i]}</span><span className="tabular-nums">{d.closed ? 'Closed' : `${clock(d.open)} – ${clock(d.close)}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(b.address || b.website || b.email) && (
              <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm font-semibold">Contact</p>
                {b.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" className={`${infoRow} hover:underline`}><LuMapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />{b.address}</a>}
                {b.website && <a href={b.website} target="_blank" rel="noreferrer" className={`${infoRow} text-indigo-600 hover:underline dark:text-indigo-400`}><LuGlobe className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 truncate">{b.website.replace(/^https?:\/\//, '')}</span></a>}
                {b.email && <a href={`mailto:${b.email}`} className={`${infoRow} hover:underline`}><LuMail className="mt-0.5 size-4 shrink-0 text-slate-400" /><span className="min-w-0 truncate">{b.email}</span></a>}
              </div>
            )}
            <div className="relative isolate overflow-hidden rounded-2xl p-5 text-white">
              <img src={sectionArt('inbox')} alt="" className="absolute inset-0 -z-10 size-full object-cover" loading="lazy" />
              <div className="absolute inset-0 -z-10 bg-linear-to-br from-indigo-950/90 to-indigo-800/70" />
              <p className="font-semibold">Questions?</p>
              <p className="mt-1 text-sm text-white/80">Chat with {owner.fullName} on Kova. Replies come straight to your chats.</p>
              {!isOwner && <button onClick={openChat} disabled={busy} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"><LuMessageSquare className="size-4" /> Message</button>}
            </div>
          </aside>
        </div>
      </main>

      {/* Cart bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4">
          <button onClick={() => setCartOpen(true)} className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-5 py-3.5 text-white shadow-2xl shadow-slate-900/30 transition hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">{count}</span>
            <span className="flex-1 text-left text-sm font-medium">View order</span>
            <span className="font-semibold tabular-nums">{money(payable)}</span>
            <LuShoppingBag className="size-4" />
          </button>
        </div>
      )}

      {/* Cart */}
      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Your order" footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Total {money(payable)}{discount > 0 && <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">{money(total)}</span>}</span>
          <button onClick={order} disabled={busy || !count} className={btn.primary}>{busy ? 'Sending…' : 'Send order'}</button>
        </div>
      }>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((p) => (
            <li key={p._id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.name}</p><p className="text-xs text-slate-500">{money(p.price)} each</p></div>
              <button onClick={() => add(p, -1)} className={btn.icon} aria-label="One less"><LuMinus className="size-4" /></button>
              <span className="w-6 text-center text-sm tabular-nums">{cart[p._id]}</span>
              <button onClick={() => add(p, 1)} className={btn.icon} aria-label="One more"><LuPlus className="size-4" /></button>
            </li>
          ))}
        </ul>
        {data.hasCoupons && (
          <div className="mt-3">
            {coupon ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <LuTag className="size-4 shrink-0" />
                <span className="flex-1"><span className="font-semibold">{coupon.code}</span> · {coupon.label} · you save {money(discount)}</span>
                <button onClick={() => { setCoupon(null); setCodeInput('') }} className="text-xs font-medium underline">Remove</button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) checkCode(codeInput.trim(), total) }} className="flex gap-2">
                <input value={codeInput} onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setCouponError('') }} placeholder="Discount code" maxLength={20} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm uppercase outline-none placeholder:normal-case focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
                <button disabled={!codeInput.trim()} className={btn.secondary}>Apply</button>
              </form>
            )}
            {couponError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{couponError}</p>}
          </div>
        )}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Note for the business (e.g. less sugar, pickup at 5 PM)" className={`${textareaCls} mt-3`} />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Your order goes to the business as a message. They'll confirm it and send a payment request in the chat.</p>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Sheet>
      {booking && <BookingDialog data={data} onClose={() => setBooking(false)} onBooked={() => { setBooking(false); setDone('booking') }} />}
    </div>
  )
}

export default PublicPage
