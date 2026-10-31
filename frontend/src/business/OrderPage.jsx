import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LuArrowLeft, LuCheck, LuLoaderCircle, LuMessageSquare, LuPackage, LuStar, LuX } from 'react-icons/lu'
import useThemeClass from '../hooks/useThemeClass'
import usePageTitle from '../hooks/usePageTitle'
import { useSocket } from '../context/SocketProvider'
import useConversation from '../Zustand/UserConversation'
import Avatar from '../home/Avatar'
import { Logo } from '../components/ui'
import { api, errorOf, money, startBusinessChat, statusOf } from './utils'

const STEPS = [
  { id: 'new', label: 'Order placed' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'ready', label: 'Ready for pickup', alt: { id: 'shipped', label: 'Out for delivery' } },
  { id: 'done', label: 'Completed' },
]
const RANK = { new: 0, confirmed: 1, ready: 2, shipped: 2, done: 3 }
const when = (d) => new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const Stars = ({ value, onChange, size = 'size-7' }) => (
  <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined} aria-label="Rating">
    {[1, 2, 3, 4, 5].map((n) => {
      const Star = <LuStar className={`${size} ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
      return onChange
        ? <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="transition hover:scale-110">{Star}</button>
        : <span key={n}>{Star}</span>
    })}
  </div>
)

// Review box for the customer once the order is complete
const Review = ({ order, onSaved }) => {
  const [rating, setRating] = useState(order.review?.rating || 0)
  const [text, setText] = useState(order.review?.text || '')
  const [editing, setEditing] = useState(!order.review)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    try { await axios.post(`/api/business/orders/${order._id}/review`, { rating, text }, api); setEditing(false); onSaved() } catch (err) { setError(errorOf(err)) } finally { setBusy(false) }
  }
  // Shown once the saved review has loaded
  if (!editing && order.review) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3"><Stars value={order.review.rating} size="size-5" /><button onClick={() => setEditing(true)} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Edit</button></div>
        {order.review.text && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">“{order.review.text}”</p>}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Thanks! Your rating shows on {order.business.fullName}’s page with your first name.</p>
      </div>
    )
  }
  return (
    <div>
      <Stars value={rating} onChange={setRating} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} placeholder="What did you like? (optional)" className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900" />
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button onClick={save} disabled={!rating || busy} className="mt-3 h-10 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">{busy ? 'Saving…' : 'Submit rating'}</button>
    </div>
  )
}

const OrderPage = () => {
  useThemeClass()
  const { id } = useParams()
  const navigate = useNavigate()
  const { socket } = useSocket()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  usePageTitle(data ? `Order #${data.order.number}` : 'Order')

  const load = useCallback(() => {
    axios.get(`/api/business/orders/${id}/track`, api).then((r) => setData(r.data)).catch((err) => setError(errorOf(err, 'Order not found')))
  }, [id])
  useEffect(load, [load])
  // Live: the business changed the status or payment
  useEffect(() => {
    if (!socket) return
    const onEdit = (m) => { if (m?.card?.orderId === id) load() }
    socket.on('messageEdited', onEdit)
    return () => socket.off('messageEdited', onEdit)
  }, [socket, id, load])
  useEffect(() => { if (data && window.location.hash === '#review') document.getElementById('review')?.scrollIntoView({ behavior: 'smooth' }) }, [data])

  const message = async () => {
    const user = await startBusinessChat(data.order.business._id)
    useConversation.getState().addContact(user)
    useConversation.getState().setSelectedConversation(user)
    navigate('/')
  }

  if (error) return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-950 dark:text-slate-100"><p className="font-semibold">{error}</p><Link to="/" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">Back to chats</Link></div>
  if (!data) return <div className="flex min-h-dvh items-center justify-center bg-slate-50 dark:bg-slate-950"><LuLoaderCircle className="size-6 animate-spin text-slate-400" /></div>

  const { order, role } = data
  const biz = order.business
  const cancelled = order.status === 'cancelled'
  const at = (status) => [...(order.history || [])].reverse().find((h) => h.status === status)?.at
  const current = RANK[order.status] ?? 0
  const status = statusOf(order.status)

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Logo to="/" />
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><LuArrowLeft className="size-4" /> Chats</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        {/* Summary */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <Avatar name={biz.fullName} src={biz.avatar?.url} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{biz.fullName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Order #{order.number} · {when(order.createdAt)}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${status.tone}`}>{status.label}</span>
          </div>

          {/* Timeline */}
          <ol className="mt-6 space-y-0">
            {cancelled ? (
              <>
                <Step done label="Order placed" time={at('new') || order.createdAt} />
                <Step cancelled last label="Cancelled" time={at('cancelled')} />
              </>
            ) : STEPS.map((s, i) => {
              const step = s.alt && (order.status === 'shipped' || at('shipped')) ? s.alt : s
              const reached = current >= i
              return <Step key={s.id} done={reached} active={current === i && order.status !== 'done'} last={i === STEPS.length - 1} label={step.label} time={reached ? at(step.id) || (i === 0 ? order.createdAt : null) : null} />
            })}
          </ol>
        </section>

        {/* Items */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3">
                {it.image ? <img src={it.image} alt="" className="size-12 rounded-lg object-cover" /> : <span className="flex size-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><LuPackage className="size-5" /></span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{it.name}</span><span className="text-xs text-slate-500 dark:text-slate-400">{it.qty} × {money(it.price)}</span></span>
                <span className="text-sm tabular-nums">{money(it.qty * it.price)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-slate-100 px-5 py-4 text-sm dark:border-slate-800">
            {order.discount > 0 && <>
              <p className="flex justify-between text-slate-500 dark:text-slate-400"><span>Subtotal</span><span className="tabular-nums">{money(order.subtotal)}</span></p>
              <p className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Discount ({order.coupon})</span><span className="tabular-nums">−{money(order.discount)}</span></p>
            </>}
            <p className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{money(order.total)}</span></p>
            <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">{order.paid ? `Paid${order.paidAt ? ` · ${when(order.paidAt)}` : ''}` : 'Not paid yet · pay in the chat'}</p>
          </div>
          {order.note && <p className="mx-5 mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">“{order.note}”</p>}
        </section>

        {/* Rating */}
        {role === 'customer' && order.status === 'done' && (
          <section id="review" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-3 font-semibold">{order.review ? 'Your rating' : 'How was your order?'}</p>
            <Review order={order} onSaved={load} />
          </section>
        )}
        {role !== 'customer' && order.review && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 font-semibold">{order.customer?.fullName?.split(' ')[0]}’s rating</p>
            <Stars value={order.review.rating} size="size-5" />
            {order.review.text && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">“{order.review.text}”</p>}
          </section>
        )}

        <div className="flex gap-2">
          {role === 'customer'
            ? <button onClick={message} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500"><LuMessageSquare className="size-4" /> Message {biz.fullName}</button>
            : <Link to={`/business?biz=${biz._id}&tab=orders`} className="inline-flex h-10 items-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500">Open in Orders</Link>}
        </div>
      </main>
    </div>
  )
}

const Step = ({ done, active, cancelled, last, label, time }) => (
  <li className="relative flex gap-3 pb-5 last:pb-0">
    {!last && <span className={`absolute left-[11px] top-6 h-[calc(100%-20px)] w-0.5 ${done ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
    <span className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ${cancelled ? 'bg-red-500 text-white' : done ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700'} ${active ? 'ring-4 ring-indigo-500/20' : ''}`}>
      {cancelled ? <LuX className="size-3.5" /> : done ? <LuCheck className="size-3.5" /> : null}
    </span>
    <span className="min-w-0 pt-0.5">
      <span className={`block text-sm ${done || cancelled ? 'font-medium' : 'text-slate-400'}`}>{label}</span>
      {time && <span className="block text-xs text-slate-500 dark:text-slate-400">{when(time)}</span>}
    </span>
  </li>
)

export default OrderPage
