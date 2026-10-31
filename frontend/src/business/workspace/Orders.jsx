import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { LuClock, LuDownload, LuIndianRupee, LuLoaderCircle, LuMessageSquare, LuPackage, LuShoppingBag, LuWallet } from 'react-icons/lu'
import Avatar from '../../home/Avatar'
import Sheet from '../../home/groups/Sheet'
import { ORDER_STATUSES, api, bizUrl, downloadCsv, errorOf, fillTemplate, formatDay, money, statusOf } from '../utils'
import { Empty, Field, PageHeader, SegmentTabs, Stat, btn, cardCls, textareaCls } from './ui'
import Select from '../../components/ui/Select'

const STATUS_WORDS = { new: 'received', confirmed: 'confirmed', ready: 'ready for pickup', shipped: 'out for delivery', done: 'complete', cancelled: 'cancelled' }

// Change status, optionally telling the customer (with a template or the default text)
const UpdateDialog = ({ ws, order, onClose, onSaved }) => {
  const [status, setStatus] = useState(order.status)
  const [notify, setNotify] = useState(true)
  const [template, setTemplate] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const vars = { name: order.customer?.fullName?.split(' ')[0], order: `#${order.number}`, id: order.number, total: money(order.total), status: STATUS_WORDS[status] }
  const message = text || `Your order #${order.number} is ${STATUS_WORDS[status]}.`
  const save = async () => {
    setBusy(true); setError('')
    try {
      const res = await axios.put(bizUrl(ws.biz, `/orders/${order._id}`), { status, notify, text: text || undefined }, api)
      onSaved(res.data.order); onClose()
    } catch (err) { setError(errorOf(err)); setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={`Order #${order.number}`} footer={
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btn.ghost}>Cancel</button>
        <button onClick={save} disabled={busy} className={btn.primary}>{busy ? 'Saving…' : notify ? 'Save and tell customer' : 'Save'}</button>
      </div>
    }>
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-2">
          {ORDER_STATUSES.map((s) => (
            <button key={s.id} onClick={() => setStatus(s.id)} className={`rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${status === s.id ? `font-medium ${s.tone}` : 'ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800'}`}>{s.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-indigo-600" /> Message the customer about this</label>
        {notify && (
          <>
            {ws.settings.templates.length > 0 && (
              <Field label="Use a template">
                <Select value={template} onChange={(v) => { setTemplate(v); const t = ws.settings.templates.find((x) => String(x._id) === v); setText(t ? t.text : '') }} aria-label="Use a template" options={[{ value: '', label: 'Default message' }, ...ws.settings.templates.map((t) => ({ value: t._id, label: t.name }))]} />
              </Field>
            )}
            <Field label="Message" hint="{name}, {order}, {total} and {status} are filled in for you.">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={message} className={textareaCls} />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">Preview: {fillTemplate(message, vars)}</p>
          </>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Sheet>
  )
}

const Orders = ({ ws }) => {
  const [orders, setOrders] = useState(null)
  const [show, setShow] = useState('open')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    axios.get(bizUrl(ws.biz, '/orders'), api).then((r) => setOrders(r.data.orders)).catch((err) => setError(errorOf(err)))
  }, [ws.biz])
  useEffect(load, [load])

  const replace = (order) => setOrders((list) => list.map((o) => (o._id === order._id ? { ...o, ...order, customer: o.customer } : o)))
  const togglePaid = async (o) => {
    try { replace((await axios.put(bizUrl(ws.biz, `/orders/${o._id}`), { paid: !o.paid }, api)).data.order) } catch (err) { setError(errorOf(err)) }
  }

  const all = orders || []
  const open = all.filter((o) => !['done', 'cancelled'].includes(o.status))
  const shown = show === 'open' ? open : show === 'unpaid' ? all.filter((o) => !o.paid && o.status !== 'cancelled') : show === 'all' ? all : all.filter((o) => o.status === show)
  const live = all.filter((o) => o.status !== 'cancelled')

  const exportCsv = () => downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Order', 'Date', 'Customer', 'Email', 'Items', 'Total', 'Status', 'Paid', 'Note'],
    ...shown.map((o) => [`#${o.number}`, new Date(o.createdAt).toLocaleString(), o.customer?.fullName || '', o.customer?.email || '', o.items.map((i) => `${i.qty} x ${i.name}`).join('; '), o.total, statusOf(o.status).label, o.paid ? 'Yes' : 'No', o.note || '']),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Orders customers send from your business page. Update the status and they're told in the chat."
        actions={<button onClick={exportCsv} disabled={!shown.length} className={btn.secondary}><LuDownload className="size-4" /> Export CSV</button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open orders" value={open.length} icon={LuClock} tone="sky" />
        <Stat icon={LuWallet} tone="amber" label="Unpaid" value={all.filter((o) => !o.paid && o.status !== 'cancelled').length} hint={money(all.filter((o) => !o.paid && o.status !== 'cancelled').reduce((n, o) => n + o.total, 0))} />
        <Stat label="All orders" value={live.length} icon={LuShoppingBag} tone="indigo" />
        <Stat icon={LuIndianRupee} tone="emerald" label="Revenue" value={money(live.reduce((n, o) => n + o.total, 0))} hint={`${money(live.filter((o) => o.paid).reduce((n, o) => n + o.total, 0))} paid`} />
      </div>
      <SegmentTabs value={show} onChange={setShow} tabs={[['open', 'Open', open.length], ['unpaid', 'Unpaid'], ['new', 'New'], ['ready', 'Ready'], ['done', 'Done'], ['cancelled', 'Cancelled'], ['all', 'All', all.length]]} />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className={`overflow-hidden ${cardCls}`}>
        {orders === null ? <div className="flex justify-center py-12"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
          : shown.length === 0 ? <Empty icon={LuShoppingBag} title="No orders here" description="Customers order from your catalog on your business page. Share the link from Settings." />
          : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((o) => {
                const s = statusOf(o.status)
                return (
                  <li key={o._id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 transition hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <div className="flex min-w-60 flex-1 items-center gap-3">
                      <div className="relative shrink-0">
                        {o.items.find((i) => i.image) ? <img src={o.items.find((i) => i.image).image} alt="" className="size-14 rounded-xl bg-slate-100 object-cover ring-1 ring-black/5 dark:bg-slate-800" />
                          : <span className="flex size-14 items-center justify-center rounded-xl bg-linear-to-br from-indigo-50 to-slate-100 text-indigo-400 dark:from-indigo-500/15 dark:to-slate-800"><LuPackage className="size-6" /></span>}
                        <span className="absolute -bottom-1.5 -right-1.5 rounded-full ring-2 ring-white dark:ring-slate-900"><Avatar name={o.customer?.fullName} src={o.customer?.avatar?.url} size="xs" /></span>
                      </div>
                      <div className="ml-1 min-w-0">
                        <p className="text-sm font-semibold"><span className="text-slate-400">#{o.number}</span> · {o.customer?.fullName || 'Customer'}</p>
                        <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
                        {o.note && <p className="truncate text-xs italic text-slate-400">“{o.note}”</p>}
                      </div>
                    </div>
                    <p className="w-24 text-xs text-slate-500 dark:text-slate-400">{formatDay(o.createdAt)}</p>
                    <p className="w-24 text-right text-sm font-semibold tabular-nums">{money(o.total)}</p>
                    <button onClick={() => togglePaid(o)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${o.paid ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30' : 'text-slate-500 ring-slate-200 hover:bg-slate-50 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-800'}`} title="Click to change">{o.paid ? 'Paid' : 'Unpaid'}</button>
                    <button onClick={() => setEditing(o)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition hover:opacity-80 ${s.tone}`}>{s.label}</button>
                    <button onClick={() => ws.openChat(o.customer?._id)} className={btn.icon} title="Open chat" aria-label="Open chat"><LuMessageSquare className="size-4" /></button>
                  </li>
                )
              })}
            </ul>
          )}
      </div>
      {editing && <UpdateDialog ws={ws} order={editing} onClose={() => setEditing(null)} onSaved={replace} />}
    </div>
  )
}

export default Orders
