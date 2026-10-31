import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { LuBriefcase, LuIndianRupee, LuInfo, LuMessageSquareText, LuPackage, LuZap } from 'react-icons/lu'
import Sheet from '../home/groups/Sheet'
import { api, bizUrl, errorOf, fillTemplate, money } from './utils'

const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900'

// ── Quick replies: type "/" in the message box ─────────────────
// Returns the menu to show above the box and a key handler (returns true when it used the key).
export const useQuickReplies = ({ text, setText, settings, vars = {}, inputRef }) => {
  const [selected, setSelected] = useState({ query: null, index: 0 })
  const [closedFor, setClosedFor] = useState(null)
  const query = /^\/(\S*)$/.exec(text || '')?.[1] ?? null
  const items = useMemo(() => {
    if (query === null || !settings) return []
    const q = query.toLowerCase()
    const replies = (settings.quickReplies || []).map((r) => ({ key: `q-${r._id}`, title: `/${r.shortcut}`, text: r.text, kind: 'reply' }))
    const templates = (settings.templates || []).map((t) => ({ key: `t-${t._id}`, title: t.name, text: t.text, kind: 'template' }))
    return [...replies, ...templates].filter((i) => !q || i.title.toLowerCase().includes(q) || i.text.toLowerCase().includes(q)).slice(0, 8)
  }, [query, settings])
  const open = query !== null && items.length > 0 && closedFor !== text
  // The highlighted row resets whenever the typed shortcut changes
  const active = selected.query === query ? Math.min(selected.index, items.length - 1) : 0
  const setActive = (fn) => setSelected({ query, index: typeof fn === 'function' ? fn(active) : fn })

  const pick = (item) => {
    setText(fillTemplate(item.text, vars))
    requestAnimationFrame(() => inputRef?.current?.focus())
  }

  const onKeyDown = (e) => {
    if (!open) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); return true }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[active]); return true }
    if (e.key === 'Escape') { e.preventDefault(); setClosedFor(text); return true }
    return false
  }

  const menu = open && (
    <div role="listbox" className="absolute bottom-full left-4 right-4 z-30 mb-2 max-h-72 overflow-y-auto rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 sm:left-6 sm:right-auto sm:w-96 lg:left-8 dark:bg-slate-900 dark:ring-slate-800">
      <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-slate-400">Quick replies · ↑↓ to choose, Enter to insert</p>
      {items.map((item, i) => (
        <button
          key={item.key}
          role="option"
          aria-selected={i === active}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => { e.preventDefault(); pick(item) }}
          className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition ${i === active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
        >
          {item.kind === 'reply' ? <LuZap className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <LuMessageSquareText className="mt-0.5 size-3.5 shrink-0 text-indigo-500" />}
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">{item.title}</span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{fillTemplate(item.text, vars)}</span>
          </span>
        </button>
      ))}
    </div>
  )
  return { menu, onKeyDown, open }
}

// ── Send a product card ────────────────────────────────────────
export const ProductPicker = ({ biz, customerId, onClose, onSent }) => {
  const [products, setProducts] = useState(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(null)
  useEffect(() => {
    axios.get(bizUrl(biz, '/products'), api).then((r) => setProducts(r.data.products)).catch((err) => setError(errorOf(err)))
  }, [biz])
  const send = async (p) => {
    setSending(p._id); setError('')
    try {
      const res = await axios.post(bizUrl(biz, `/chat/${customerId}/card`), { kind: 'product', productId: p._id }, api)
      onSent?.(res.data)
      onClose()
    } catch (err) { setError(errorOf(err)); setSending(null) }
  }
  const shown = (products || []).filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
  return (
    <Sheet open onClose={onClose} title="Send a product">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your catalog" className={field} autoFocus />
      <ul className="mt-3 space-y-1">
        {products === null && !error && <li className="py-6 text-center text-sm text-slate-400">Loading…</li>}
        {products?.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Your catalog is empty. Add items in Business → Catalog.</li>}
        {shown.map((p) => (
          <li key={p._id}>
            <button onClick={() => send(p)} disabled={!!sending} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800">
              {p.image?.url ? <img src={p.image.url} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><LuPackage className="size-5" /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{money(p.price)}{p.inStock ? '' : ' · out of stock'}</span>
              </span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{sending === p._id ? 'Sending…' : 'Send'}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </Sheet>
  )
}

// ── Request a payment ──────────────────────────────────────────
// Keep only digits and one decimal point (max 2 decimals)
const cleanAmount = (v) => {
  const [whole, ...rest] = String(v).replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

export const PaymentDialog = ({ biz, customerId, onClose, onSent, hasUpi = true }) => {
  const [orders, setOrders] = useState([])
  const [orderId, setOrderId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amountRef = useRef(null)
  useEffect(() => {
    axios.get(bizUrl(biz, `/orders?customer=${customerId}`), api).then((r) => setOrders(r.data.orders.filter((o) => !o.paid && o.status !== 'cancelled'))).catch(() => {})
  }, [biz, customerId])
  useEffect(() => { amountRef.current?.focus() }, [])
  const pickOrder = (o) => {
    if (orderId === o._id) { setOrderId(''); return }
    setOrderId(o._id); setAmount(String(o.total)); setNote(`Order #${o.number}`)
  }
  const value = Number(amount)
  const ready = value > 0 && value <= 1000000
  const send = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true); setError('')
    try {
      const res = await axios.post(bizUrl(biz, `/chat/${customerId}/card`), { kind: 'payment', amount: value, note: note.trim(), orderId: orderId || null }, api)
      onSent?.(res.data)
      onClose()
    } catch (err) { setError(errorOf(err)); setBusy(false) }
  }
  const settingsLink = biz === 'me' ? '/business?tab=settings&section=profile' : `/business?biz=${biz}&tab=settings&section=profile`

  return (
    <Sheet open onClose={onClose} title="Request payment" footer={
      <button onClick={send} disabled={busy || !ready} className="h-11 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">
        {busy ? 'Sending…' : ready ? `Send request for ${money(value)}` : 'Enter an amount'}
      </button>
    }>
      <form onSubmit={send} className="pt-1">
        {/* Amount */}
        <label className="block rounded-2xl bg-slate-50 px-4 pb-4 pt-3 text-center dark:bg-slate-800/60">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount</span>
          <span className="mt-1 flex items-baseline justify-center gap-1">
            <span className="text-2xl font-medium text-slate-400">₹</span>
            <input
              ref={amountRef}
              inputMode="decimal"
              value={amount}
              onChange={(e) => { setAmount(cleanAmount(e.target.value)); setOrderId('') }}
              placeholder="0"
              aria-label="Amount in rupees"
              size={Math.max(1, amount.length || 1)}
              className="min-w-[1ch] max-w-full bg-transparent text-4xl font-semibold tracking-tight text-slate-900 outline-none tabular-nums placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-600"
            />
          </span>
        </label>

        {/* Unpaid orders */}
        {orders.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Unpaid orders</p>
            <div className="flex flex-wrap gap-2">
              {orders.slice(0, 6).map((o) => (
                <button key={o._id} type="button" onClick={() => pickOrder(o)} aria-pressed={orderId === o._id} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${orderId === o._id ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-200' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'}`}>
                  #{o.number} · {money(o.total)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Note for the customer</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className={field} placeholder="e.g. Birthday cake, 1 kg" />
        </label>

        {/* Preview of the card the customer gets */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Customer sees</p>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Payment request</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{money(value || 0)}</p>
                <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">{note.trim() || 'No note'}</p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><LuIndianRupee className="size-4" /></span>
            </div>
            <div className="mt-3 flex gap-2">
              <span className={`inline-flex h-7 items-center rounded-lg px-2.5 text-[11px] font-medium ${hasUpi ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{hasUpi ? 'Pay with UPI' : 'Pay the business directly'}</span>
              <span className="inline-flex h-7 items-center rounded-lg bg-slate-100 px-2.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">I've paid</span>
            </div>
          </div>
          {!hasUpi && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <LuInfo className="mt-px size-3.5 shrink-0" />
              <span>No UPI ID yet, so customers pay you directly. <a href={settingsLink} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Add UPI ID</a></span>
            </p>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Sheet>
  )
}

// ── The briefcase button in the message box ────────────────────
export const BusinessActions = ({ biz, customerId, onSent, hasUpi, disabled, onInsert, settings }) => {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Business tools"
        title="Business tools"
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white ${open ? 'bg-slate-100 text-indigo-600 dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}
      >
        <LuBriefcase className="size-4.5" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-60 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <button role="menuitem" className={item} onClick={() => { setOpen(false); setDialog('product') }}><LuPackage className="size-4 text-slate-400" /> Send a product</button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); setDialog('payment') }}><LuIndianRupee className="size-4 text-slate-400" /> Request a payment</button>
          {onInsert && (settings?.quickReplies?.length > 0 || settings?.templates?.length > 0) && (
            <button role="menuitem" className={item} onClick={() => { setOpen(false); onInsert('/') }}><LuZap className="size-4 text-slate-400" /> Quick replies <span className="ml-auto text-xs text-slate-400">type /</span></button>
          )}
        </div>
      )}
      {dialog === 'product' && <ProductPicker biz={biz} customerId={customerId} onClose={() => setDialog(null)} onSent={onSent} />}
      {dialog === 'payment' && <PaymentDialog biz={biz} customerId={customerId} onClose={() => setDialog(null)} onSent={onSent} hasUpi={hasUpi} />}
    </div>
  )
}
