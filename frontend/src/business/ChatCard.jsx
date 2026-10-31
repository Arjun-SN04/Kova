import React, { useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { LuCalendarCheck, LuCheck, LuCircleCheck, LuCopy, LuExternalLink, LuIndianRupee, LuMessageSquare, LuPackage, LuShoppingBag, LuSquare, LuSquareCheck, LuVideo } from 'react-icons/lu'
import { api, errorOf, formatWhen, money, statusOf, upiLink } from './utils'

// Business cards inside a chat bubble: product, order, payment request, booking and group task.
// The bubble's colours depend on who sent it, so cards use neutral surfaces with their own colours.

const shell = 'w-72 max-w-full overflow-hidden rounded-xl bg-white text-left text-slate-800 shadow-xs ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700'
const button = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition disabled:opacity-50'
const primary = `${button} bg-indigo-600 text-white hover:bg-indigo-500`
const secondary = `${button} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`

const Chip = ({ className = '', children }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${className}`}>{children}</span>
)
const PaidChip = ({ paid }) => paid
  ? <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"><LuCheck className="size-3" /> Paid</Chip>
  : <Chip className="bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">Unpaid</Chip>

// Put text in the message box (e.g. "I'm interested in …")
const compose = (text) => window.dispatchEvent(new CustomEvent('nexchat:compose', { detail: text }))

const useAction = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn) => {
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(errorOf(err)) } finally { setBusy(false) }
  }
  return { busy, error, run }
}

const ProductCard = ({ card, mine }) => (
  <div className={shell}>
    {card.image && <img src={card.image} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />}
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold leading-snug">{card.name}</p>
        <p className="shrink-0 text-sm font-semibold">{money(card.price)}</p>
      </div>
      {card.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{card.description}</p>}
      {card.removed ? (
        <p className="mt-2 text-xs text-slate-400">No longer available</p>
      ) : !card.inStock ? (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">Out of stock</p>
      ) : null}
      {!mine && !card.removed && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => compose(`I'm interested in ${card.name}`)} className={primary}><LuMessageSquare className="size-3.5" /> Ask about this</button>
          {card.username && <Link to={`/b/${card.username}`} className={secondary}><LuShoppingBag className="size-3.5" /> Shop</Link>}
        </div>
      )}
    </div>
  </div>
)

const OrderCard = ({ card, mine }) => {
  const status = statusOf(card.status)
  return (
    <div className={shell}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuPackage className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Order #{card.number}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{mine ? `To ${card.businessName}` : card.businessName}</p>
        </div>
        <Chip className={status.tone}>{status.label}</Chip>
      </div>
      <ul className="space-y-1 px-3 py-2.5 text-[13px]">
        {card.items?.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span className="min-w-0 truncate"><span className="text-slate-400">{i.qty} ×</span> {i.name}</span>
            <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">{money(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      {card.note && <p className="mx-3 mb-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">“{card.note}”</p>}
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <PaidChip paid={card.paid} />
        <p className="text-sm font-semibold tabular-nums">Total {money(card.total)}</p>
      </div>
    </div>
  )
}

const PaymentCard = ({ message, card, mine }) => {
  const { busy, error, run } = useAction()
  const [copied, setCopied] = useState(false)
  const paid = card.status === 'paid'
  const claimed = card.status === 'claimed'
  const copy = async () => {
    try { await navigator.clipboard.writeText(card.upiId); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className={shell}>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><LuIndianRupee className="size-4" /></span>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Payment request{card.payee ? ` · ${card.payee}` : ''}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{money(card.amount)}</p>
        {card.note && <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">{card.note}</p>}
        <div className="mt-2">
          {paid ? (
            <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"><LuCircleCheck className="size-3" /> Paid</Chip>
          ) : claimed ? (
            <Chip className="bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">{mine ? 'Customer says paid · check and confirm' : 'Waiting for the business to confirm'}</Chip>
          ) : (
            <Chip className="bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">Not paid yet</Chip>
          )}
        </div>
      </div>
      {!mine && !paid && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
          {card.upiId ? (
            <>
              <a href={upiLink(card)} className={primary}>Pay with UPI</a>
              <button onClick={copy} className={secondary}>{copied ? <LuCheck className="size-3.5" /> : <LuCopy className="size-3.5" />} {copied ? 'Copied' : card.upiId}</button>
            </>
          ) : (
            <p className="w-full text-xs text-slate-500 dark:text-slate-400">Pay the business directly (cash or card).</p>
          )}
          {!claimed && (
            <button disabled={busy} onClick={() => run(() => axios.put(`/api/business/payments/${message._id}/claim`, {}, api))} className={secondary}>I've paid</button>
          )}
        </div>
      )}
      {mine && (
        <div className="flex gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
          <button disabled={busy} onClick={() => run(() => axios.put(`/api/business/${card.business}/payments/${message._id}`, { paid: !paid }, api))} className={paid ? secondary : primary}>
            {paid ? 'Mark as unpaid' : 'Mark as paid'}
          </button>
        </div>
      )}
      {error && <p className="px-3 pb-2.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

const BookingCard = ({ card, mine }) => {
  const { busy, error, run } = useAction()
  const cancelled = card.status === 'cancelled'
  const done = card.status === 'done'
  const upcoming = !cancelled && !done && new Date(card.start) > new Date()
  return (
    <div className={shell}>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"><LuCalendarCheck className="size-4" /></span>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{cancelled ? 'Booking cancelled' : done ? 'Booking complete' : 'Booking confirmed'} · {card.businessName}</p>
        </div>
        <p className={`mt-2 text-sm font-semibold ${cancelled ? 'text-slate-400 line-through' : ''}`}>{card.service}</p>
        <p className={`text-[13px] ${cancelled ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}`}>{formatWhen(card.start)} · {card.minutes} min</p>
        {card.meetLink && !cancelled && (
          <a href={card.meetLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            <LuVideo className="size-3.5" /> Join video call <LuExternalLink className="size-3" />
          </a>
        )}
      </div>
      {upcoming && (
        <div className="flex gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
          {/* The business's own card was sent to the customer, so "mine" means I'm the business */}
          {mine ? (
            <>
              <button disabled={busy} onClick={() => run(() => axios.put(`/api/business/${card.business}/bookings/${card.bookingId}`, { status: 'done' }, api))} className={secondary}>Mark done</button>
              <button disabled={busy} onClick={() => window.confirm('Cancel this booking? The customer will be told.') && run(() => axios.put(`/api/business/${card.business}/bookings/${card.bookingId}`, { status: 'cancelled' }, api))} className={secondary}>Cancel</button>
            </>
          ) : (
            <button disabled={busy} onClick={() => window.confirm('Cancel this booking?') && run(() => axios.put(`/api/business/bookings/${card.bookingId}/cancel`, {}, api))} className={secondary}>Cancel booking</button>
          )}
        </div>
      )}
      {error && <p className="px-3 pb-2.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

const TaskCard = ({ card }) => {
  const { busy, error, run } = useAction()
  const overdue = card.due && !card.done && new Date(card.due) < new Date()
  return (
    <div className={`${shell} p-3`}>
      <div className="flex items-start gap-2.5">
        <button
          disabled={busy || card.removed}
          onClick={() => run(() => axios.put(`/api/tasks/${card.taskId}`, { done: !card.done }, api))}
          className="mt-0.5 shrink-0 text-indigo-600 disabled:opacity-50 dark:text-indigo-400"
          aria-label={card.done ? 'Mark as not done' : 'Mark as done'}
        >
          {card.done ? <LuSquareCheck className="size-5" /> : <LuSquare className="size-5 text-slate-400" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Task</p>
          <p className={`text-sm font-medium ${card.done || card.removed ? 'text-slate-400 line-through' : ''}`}>{card.text}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {card.removed ? 'Deleted' : [card.assigneeName && `For ${card.assigneeName.split(' ')[0]}`, card.due && <span key="d" className={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>{overdue ? 'Overdue · ' : 'Due '}{new Date(card.due).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>].filter(Boolean).reduce((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}
          </p>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

// `mine`: I sent this message (for business cards, that means I'm the business side)
const ChatCard = ({ message, mine }) => {
  const card = message.card
  if (!card) return null
  if (card.kind === 'product') return <ProductCard card={card} mine={mine} />
  if (card.kind === 'order') return <OrderCard card={card} mine={mine} />
  if (card.kind === 'payment') return <PaymentCard message={message} card={card} mine={mine} />
  if (card.kind === 'booking') return <BookingCard card={card} mine={mine} />
  if (card.kind === 'task') return <TaskCard card={card} />
  return null
}

export default ChatCard
