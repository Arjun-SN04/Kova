import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { QRCodeCanvas } from 'qrcode.react'
import { LuBadgeCheck, LuCheck, LuCopy, LuImagePlus, LuPlus, LuQrCode, LuTrash2 } from 'react-icons/lu'
import { compressImage } from '../../utils/attachments'
import { useAuth } from '../../context/AuthProvider'
import Avatar from '../../home/Avatar'
import useBusiness from '../store'
import { CATEGORIES, DAY_FULL, categoryCover, DEFAULT_HOURS, LABEL_COLORS, api, bizUrl, errorOf, shopUrl, timeZones, upiLink } from '../utils'
import { Field, PageHeader, Panel, Toggle, btn, inputCls, textareaCls } from './ui'
import Select from '../../components/ui/Select'
import { SwitchToPersonal } from '../AccountExtras'

const ROLE_OPTIONS = [{ value: 'agent', label: 'Agent' }, { value: 'admin', label: 'Admin' }]

const SECTIONS = [
  ['profile', 'Profile & hours', ['owner']],
  ['messages', 'Auto messages', ['owner', 'admin']],
  ['replies', 'Quick replies & templates', ['owner', 'admin']],
  ['labels', 'Labels', ['owner', 'admin']],
  ['nexa', 'Nexa & alerts', ['owner', 'admin']],
  ['services', 'Services', ['owner', 'admin']],
  ['discounts', 'Discount codes', ['owner', 'admin']],
  ['team', 'Team', ['owner', 'admin']],
  ['share', 'Share & verification', ['owner', 'admin']],
]

// Save part of the settings and keep the workspace in sync
const useSave = (ws) => {
  const [state, setState] = useState({ busy: false, error: '', saved: false })
  const save = async (patch) => {
    setState({ busy: true, error: '', saved: false })
    try {
      const res = await axios.put(bizUrl(ws.biz, '/settings'), patch, api)
      ws.setSettings(res.data.settings)
      if (ws.role === 'owner') useBusiness.getState().setSettings(res.data.settings)
      setState({ busy: false, error: '', saved: true })
      setTimeout(() => setState((s) => ({ ...s, saved: false })), 2000)
      return true
    } catch (err) { setState({ busy: false, error: errorOf(err), saved: false }); return false }
  }
  return [state, save]
}

const SaveBar = ({ state, onSave, label = 'Save changes' }) => (
  <div className="flex items-center gap-3 pt-2">
    <button onClick={onSave} disabled={state.busy} className={btn.primary}>{state.busy ? 'Saving…' : label}</button>
    {state.saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><LuCheck className="size-4" /> Saved</span>}
    {state.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
  </div>
)

// Editable rows for a list setting (quick replies, templates, labels, FAQ, services)
const ListEditor = ({ items, setItems, empty, addLabel, blank, render }) => (
  <div className="space-y-3">
    {items.length === 0 && <p className="text-[13px] text-slate-500 dark:text-slate-400">{empty}</p>}
    {items.map((item, i) => (
      <div key={item._id || `new-${i}`} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <div className="min-w-0 flex-1">{render(item, (patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
        <button onClick={() => setItems(items.filter((_, j) => j !== i))} className={`${btn.icon} hover:text-red-600!`} aria-label="Remove"><LuTrash2 className="size-4" /></button>
      </div>
    ))}
    <button onClick={() => setItems([...items, blank()])} className={btn.secondary}><LuPlus className="size-4" /> {addLabel}</button>
  </div>
)

// ── Cover photo for the business page ──────────────────────────
const CoverPicker = ({ ws, category }) => {
  const [AuthUser, setAuthUser] = useAuth()
  const b = ws.business.business
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)
  const upload = async (file) => {
    setBusy(true); setError('')
    try {
      const body = new FormData()
      if (file) {
        const small = await compressImage(file)
        if (small.size > 2 * 1024 * 1024) throw new Error('That photo is too large (max 2 MB)')
        body.append('cover', small, small.name || 'cover.jpg')
      }
      const res = await axios.put('/api/business/cover', body, api)
      ws.setBusiness({ business: res.data.business })
      const user = { ...AuthUser, business: res.data.business }
      localStorage.setItem('chatUser', JSON.stringify(user))
      setAuthUser(user)
    } catch (err) { setError(err.response ? errorOf(err) : err.message) } finally { setBusy(false) }
  }
  const src = b.cover?.url || categoryCover(category)
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="relative h-44 sm:h-52">
        <img src={src} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
        <div className="absolute bottom-4 left-5 flex items-end gap-3 text-white">
          <span className="rounded-full ring-4 ring-white dark:ring-slate-900"><Avatar name={ws.business.fullName} src={ws.business.avatar?.url} size="md" /></span>
          <span className="pb-0.5"><span className="block text-base font-semibold">{ws.business.fullName}</span><span className="block text-xs text-white/75">{b.cover?.url ? 'Your cover photo' : `Stock photo for ${category || 'your category'}`}</span></span>
        </div>
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 text-sm font-medium text-white">Uploading…</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        <p className="mr-auto text-[13px] text-slate-500 dark:text-slate-400">The cover photo sits at the top of your business page. A wide photo of your shop or work looks best.</p>
        <button onClick={() => input.current?.click()} disabled={busy} className={btn.secondary}><LuImagePlus className="size-4" /> {b.cover?.url ? 'Change cover' : 'Upload cover'}</button>
        {b.cover?.url && <button onClick={() => upload(null)} disabled={busy} className={btn.ghost}>Use stock photo</button>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
      </div>
      {error && <p className="px-5 pb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}

// ── Payment QR: customers scan it from payment requests and the business page ──
const PaymentQrPicker = ({ ws, upiId }) => {
  const [AuthUser, setAuthUser] = useAuth()
  const b = ws.business.business
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [label, setLabel] = useState(b.paymentQr?.label || '')
  const input = useRef(null)
  const upload = async (file) => {
    setBusy(true); setError('')
    try {
      const body = new FormData()
      if (file) {
        // QR codes must stay sharp: only shrink big photos
        const small = file.size > 1.5 * 1024 * 1024 ? await compressImage(file) : file
        if (small.size > 2 * 1024 * 1024) throw new Error('That image is too large (max 2 MB)')
        body.append('qr', small, small.name || 'payment-qr.png')
        body.append('label', label)
      }
      const res = await axios.put('/api/business/payment-qr', body, api)
      ws.setBusiness({ business: res.data.business })
      const user = { ...AuthUser, business: res.data.business }
      localStorage.setItem('chatUser', JSON.stringify(user))
      setAuthUser(user)
    } catch (err) { setError(err.response ? errorOf(err) : err.message) } finally { setBusy(false) }
  }
  const qr = b.paymentQr?.url
  const autoUpi = !qr && /^[\w.-]{2,}@[a-z]{2,}$/i.test(upiId || '')
  return (
    <Panel title="Payment QR code" description="Upload the QR from your UPI, bank or wallet app. Customers see it on payment requests and on your business page, and can scan it to pay.">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex size-44 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700">
          {qr ? <img src={qr} alt="Your payment QR code" className="size-full object-contain" />
            : autoUpi ? <QRCodeCanvas value={upiLink({ upiId, payee: ws.business.fullName })} size={160} />
              : <LuQrCode className="size-12 text-slate-300 dark:text-slate-600" />}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {qr ? 'Customers see this QR.' : autoUpi ? <>No QR uploaded, so customers see one made from your UPI ID <b>{upiId}</b>. Upload your own to replace it.</> : 'No QR yet. Upload one, or add a UPI ID above and Kova makes one for you.'}
          </p>
          <Field label="Label (optional)" hint="Shown above the QR, e.g. “GPay · PhonePe · Paytm”.">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className={inputCls} placeholder="Scan with any UPI app" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => input.current?.click()} disabled={busy} className={btn.secondary}><LuImagePlus className="size-4" /> {busy ? 'Uploading…' : qr ? 'Replace QR' : 'Upload QR'}</button>
            {qr && <button onClick={() => upload(null)} disabled={busy} className={btn.ghost}><LuTrash2 className="size-4" /> Remove</button>}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
      </div>
    </Panel>
  )
}

// ── Profile & hours (the owner's public profile) ───────────────
const ProfileSection = ({ ws }) => {
  const [AuthUser, setAuthUser] = useAuth()
  const b = ws.business.business
  const [form, setForm] = useState({ category: b.category || '', description: b.description || '', address: b.address || '', website: b.website || '', email: b.email || '', upiId: b.upiId || '', timeZone: b.timeZone || 'UTC' })
  const [hours, setHours] = useState(b.hours?.length === 7 ? b.hours : DEFAULT_HOURS)
  const [state, setState] = useState({ busy: false, error: '', saved: false })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setDay = (i, patch) => setHours((h) => h.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  const save = async () => {
    setState({ busy: true, error: '', saved: false })
    try {
      const res = await axios.put('/api/business/profile', { ...form, hours }, api)
      ws.setBusiness({ business: res.data.business })
      const user = { ...AuthUser, business: res.data.business }
      localStorage.setItem('chatUser', JSON.stringify(user))
      setAuthUser(user)
      setState({ busy: false, error: '', saved: true })
      setTimeout(() => setState((s) => ({ ...s, saved: false })), 2000)
    } catch (err) { setState({ busy: false, error: errorOf(err), saved: false }) }
  }
  return (
    <div className="space-y-6">
      <CoverPicker ws={ws} category={form.category} />
      <Panel title="Business profile" description="Customers see this on your profile and business page. Your business name and logo are your account name and photo (change them in Profile).">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} options={[...new Set([...(form.category ? [form.category] : []), ...CATEGORIES])]} aria-label="Category" />
          </Field>
          <Field label="Time zone" hint="Opening hours and bookings use this.">
            <Select value={form.timeZone} onChange={(v) => setForm((f) => ({ ...f, timeZone: v }))} options={[...new Set([form.timeZone, ...timeZones()])]} aria-label="Time zone" />
          </Field>
          <Field label="Description" className="sm:col-span-2"><textarea value={form.description} onChange={set('description')} rows={2} maxLength={300} className={textareaCls} /></Field>
          <Field label="Address" className="sm:col-span-2"><input value={form.address} onChange={set('address')} maxLength={200} className={inputCls} placeholder="12 MG Road, Kochi" /></Field>
          <Field label="Website"><input value={form.website} onChange={set('website')} maxLength={200} className={inputCls} placeholder="meerasbakery.in" /></Field>
          <Field label="Business email"><input type="email" value={form.email} onChange={set('email')} maxLength={120} className={inputCls} placeholder="hello@meerasbakery.in" /></Field>
          <Field label="UPI ID" hint="Payment requests show a “Pay with UPI” button with this ID." className="sm:col-span-2"><input value={form.upiId} onChange={set('upiId')} maxLength={80} className={inputCls} placeholder="meera@okhdfc" /></Field>
        </div>
      </Panel>
      <PaymentQrPicker ws={ws} upiId={form.upiId} />
      <Panel title="Opening hours" description="Outside these hours customers get your away message, and the chat shows “Closed”.">
        <div className="space-y-2">
          {hours.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm font-medium">{DAY_FULL[i]}</span>
              <Toggle checked={!d.closed} onChange={(open) => setDay(i, { closed: !open })} label="" />
              {d.closed ? <span className="text-sm text-slate-400">Closed</span> : (
                <span className="flex items-center gap-2">
                  <input type="time" value={d.open} onChange={(e) => setDay(i, { open: e.target.value })} className={`${inputCls} h-9 w-32`} />
                  <span className="text-slate-400">to</span>
                  <input type="time" value={d.close} onChange={(e) => setDay(i, { close: e.target.value })} className={`${inputCls} h-9 w-32`} />
                </span>
              )}
            </div>
          ))}
          <button onClick={() => setHours(hours.map((d) => ({ ...hours[1], closed: d.closed })))} className="pt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Copy Monday's times to every open day</button>
        </div>
      </Panel>
      <SaveBar state={state} onSave={save} />
      <Panel title="Personal account" description="Turn Business off and use Kova as a normal account. Your catalog, orders and settings are kept for when you turn it back on.">
        <SwitchToPersonal onDone={() => { window.location.href = '/' }} />
      </Panel>
    </div>
  )
}

// ── Greeting and away messages ─────────────────────────────────
const MessagesSection = ({ ws }) => {
  const [greeting, setGreeting] = useState(ws.settings.greeting)
  const [away, setAway] = useState(ws.settings.away)
  const [state, save] = useSave(ws)
  return (
    <div className="space-y-6">
      <Panel title="Greeting message" description="Sent automatically the first time a customer messages you.">
        <div className="space-y-3">
          <Toggle checked={greeting.on} onChange={(on) => setGreeting({ ...greeting, on })} label="Send a greeting" />
          <textarea value={greeting.text} onChange={(e) => setGreeting({ ...greeting, text: e.target.value })} rows={3} maxLength={1000} disabled={!greeting.on} className={textareaCls} />
          <p className="text-xs text-slate-500 dark:text-slate-400">{'{name}'} is replaced with the customer's first name.</p>
        </div>
      </Panel>
      <Panel title="Away message" description="Sent outside your opening hours, at most once every 6 hours per customer.">
        <div className="space-y-3">
          <Toggle checked={away.on} onChange={(on) => setAway({ ...away, on })} label="Send an away message" />
          <textarea value={away.text} onChange={(e) => setAway({ ...away, text: e.target.value })} rows={3} maxLength={1000} disabled={!away.on} className={textareaCls} />
          <p className="text-xs text-slate-500 dark:text-slate-400">{'{hours}'} becomes something like “Closed · opens tomorrow 9 AM”.</p>
        </div>
      </Panel>
      <SaveBar state={state} onSave={() => save({ greeting, away })} />
    </div>
  )
}

// ── Quick replies and templates ────────────────────────────────
const RepliesSection = ({ ws }) => {
  const [replies, setReplies] = useState(ws.settings.quickReplies)
  const [templates, setTemplates] = useState(ws.settings.templates)
  const [state, save] = useSave(ws)
  return (
    <div className="space-y-6">
      <Panel title="Quick replies" description="Type / and the shortcut in any customer chat to insert the answer.">
        <ListEditor items={replies} setItems={setReplies} addLabel="Add quick reply" empty="No quick replies yet." blank={() => ({ shortcut: '', text: '' })} render={(r, set) => (
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">/</span><input value={r.shortcut} onChange={(e) => set({ shortcut: e.target.value.replace(/\s+/g, '-').replace(/^\/+/, '').toLowerCase() })} maxLength={30} placeholder="price" className={`${inputCls} pl-6`} /></div>
            <textarea value={r.text} onChange={(e) => set({ text: e.target.value })} rows={2} maxLength={2000} placeholder="Chocolate truffle: ₹650 for 500 g, ₹1,200 for 1 kg." className={textareaCls} />
          </div>
        )} />
      </Panel>
      <Panel title="Message templates" description="Ready-made messages for order updates and reminders. Use {name}, {order}, {total} and {status}. They also appear in the / menu.">
        <ListEditor items={templates} setItems={setTemplates} addLabel="Add template" empty="No templates yet." blank={() => ({ name: '', text: '' })} render={(t, set) => (
          <div className="space-y-2">
            <input value={t.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="Order ready" className={inputCls} />
            <textarea value={t.text} onChange={(e) => set({ text: e.target.value })} rows={2} maxLength={2000} placeholder="Hi {name}, your order {order} is ready for pickup! 🎉" className={textareaCls} />
          </div>
        )} />
      </Panel>
      <SaveBar state={state} onSave={() => save({ quickReplies: replies, templates })} />
    </div>
  )
}

// ── Labels ─────────────────────────────────────────────────────
const LabelsSection = ({ ws }) => {
  const [labels, setLabels] = useState(ws.settings.labels)
  const [state, save] = useSave(ws)
  return (
    <div className="space-y-6">
      <Panel title="Labels" description="Tag customer chats (like “New customer” or “Pending payment”) and filter your chat list and inbox by them.">
        <ListEditor items={labels} setItems={setLabels} addLabel="Add label" empty="No labels yet." blank={() => ({ name: '', color: LABEL_COLORS[labels.length % LABEL_COLORS.length] })} render={(l, set) => (
          <div className="flex flex-wrap items-center gap-3">
            <input value={l.name} onChange={(e) => set({ name: e.target.value })} maxLength={30} placeholder="Pending payment" className={`${inputCls} max-w-xs flex-1`} />
            <div className="flex gap-1.5">
              {LABEL_COLORS.map((c) => (
                <button key={c} onClick={() => set({ color: c })} className={`size-6 rounded-full transition ${l.color === c ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900' : ''}`} style={{ backgroundColor: c }} aria-label={`Colour ${c}`} />
              ))}
            </div>
          </div>
        )} />
      </Panel>
      <SaveBar state={state} onSave={() => save({ labels })} />
    </div>
  )
}

// ── Nexa, FAQ and alerts ───────────────────────────────────────
const NexaSection = ({ ws }) => {
  const s = ws.settings
  const [form, setForm] = useState({ nexaAutoReply: s.nexaAutoReply, leadDetection: s.leadDetection, dailySummary: s.dailySummary, unansweredMinutes: s.unansweredMinutes })
  const [faq, setFaq] = useState(s.faq)
  const [state, save] = useSave(ws)
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  return (
    <div className="space-y-6">
      <Panel title="Nexa for your business">
        <div className="space-y-5">
          <Toggle checked={form.nexaAutoReply} onChange={set('nexaAutoReply')} label="Answer customers automatically" description="Nexa replies using your profile, hours, catalog, services and FAQ. If it isn't sure, it says it'll pass the question on and marks the chat “Needs a person”." />
          <Toggle checked={form.leadDetection} onChange={set('leadDetection')} label="Spot likely sales" description="Customers who want to buy or book get a Lead tag at the top of your list." />
          <Toggle checked={form.dailySummary} onChange={set('dailySummary')} label="Daily summary at 9 AM" description="New customers, orders, today's bookings and who's waiting, in your Nexa chat." />
          <Field label="Alert me when a customer has waited" hint="Your team gets a notification. 0 turns it off.">
            <div className="flex items-center gap-2"><input type="number" min="0" max="1440" value={form.unansweredMinutes} onChange={(e) => set('unansweredMinutes')(e.target.value)} className={`${inputCls} w-24`} /><span className="text-sm text-slate-500">minutes</span></div>
          </Field>
        </div>
      </Panel>
      <Panel title="Frequently asked questions" description="Nexa uses these answers when it replies to customers.">
        <ListEditor items={faq} setItems={setFaq} addLabel="Add question" empty="No questions yet." blank={() => ({ q: '', a: '' })} render={(f, set) => (
          <div className="space-y-2">
            <input value={f.q} onChange={(e) => set({ q: e.target.value })} maxLength={300} placeholder="Do you deliver?" className={inputCls} />
            <textarea value={f.a} onChange={(e) => set({ a: e.target.value })} rows={2} maxLength={1500} placeholder="Yes, within 5 km for ₹40." className={textareaCls} />
          </div>
        )} />
      </Panel>
      <SaveBar state={state} onSave={() => save({ ...form, unansweredMinutes: Number(form.unansweredMinutes) || 0, faq })} />
    </div>
  )
}

// ── Bookable services ──────────────────────────────────────────
const ServicesSection = ({ ws }) => {
  const [services, setServices] = useState(ws.settings.services)
  const [state, save] = useSave(ws)
  return (
    <div className="space-y-6">
      <Panel title="Services" description="Customers pick a service and a free time on your business page. Slots follow your opening hours and skip times already booked. If you've connected Google Calendar in Nexa, bookings go there too.">
        <ListEditor items={services} setItems={setServices} addLabel="Add service" empty="No services yet." blank={() => ({ name: '', minutes: 30, price: 0, description: '' })} render={(sv, set) => (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
              <input value={sv.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="Custom cake consultation" className={inputCls} />
              <div className="relative"><input type="number" min="10" max="480" step="5" value={sv.minutes} onChange={(e) => set({ minutes: e.target.value })} className={`${inputCls} pr-10`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">min</span></div>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span><input type="number" min="0" value={sv.price} onChange={(e) => set({ price: e.target.value })} className={`${inputCls} pl-7`} /></div>
            </div>
            <input value={sv.description} onChange={(e) => set({ description: e.target.value })} maxLength={300} placeholder="What to expect (optional)" className={inputCls} />
          </div>
        )} />
      </Panel>
      <SaveBar state={state} onSave={() => save({ services })} />
    </div>
  )
}

// ── Discount codes ─────────────────────────────────────────────
const KIND_OPTIONS = [{ value: 'percent', label: '% off' }, { value: 'flat', label: '₹ off' }]
const DiscountsSection = ({ ws }) => {
  const toDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')
  const [coupons, setCoupons] = useState((ws.settings.coupons || []).map((c) => ({ ...c, expiresAt: toDay(c.expiresAt) })))
  const [state, save] = useSave(ws)
  return (
    <div className="space-y-6">
      <Panel title="Discount codes" description="Customers type a code in the cart on your business page. The discount shows on the order, and you can see how often each code was used.">
        <ListEditor items={coupons} setItems={setCoupons} addLabel="Add code" empty="No discount codes yet." blank={() => ({ code: '', kind: 'percent', value: 10, minTotal: 0, maxUses: 0, expiresAt: '', active: true })} render={(c, set) => (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
              <input value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} maxLength={20} placeholder="WELCOME10" className={`${inputCls} font-mono uppercase`} aria-label="Code" />
              <input type="number" min="1" value={c.value} onChange={(e) => set({ value: e.target.value })} className={inputCls} aria-label="Amount" />
              <Select value={c.kind} onChange={(v) => set({ kind: v })} options={KIND_OPTIONS} aria-label="Type" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-xs text-slate-500 dark:text-slate-400">Minimum order (₹)<input type="number" min="0" value={c.minTotal} onChange={(e) => set({ minTotal: e.target.value })} className={`${inputCls} mt-1`} /></label>
              <label className="block text-xs text-slate-500 dark:text-slate-400">Use limit (0 = no limit)<input type="number" min="0" value={c.maxUses} onChange={(e) => set({ maxUses: e.target.value })} className={`${inputCls} mt-1`} /></label>
              <label className="block text-xs text-slate-500 dark:text-slate-400">Expires (optional)<input type="date" value={c.expiresAt || ''} onChange={(e) => set({ expiresAt: e.target.value })} className={`${inputCls} mt-1`} /></label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Toggle checked={c.active !== false} onChange={(v) => set({ active: v })} label="Active" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Used {c.uses || 0}{Number(c.maxUses) ? ` of ${c.maxUses}` : ''} time{(c.uses || 0) === 1 ? '' : 's'}</span>
            </div>
          </div>
        )} />
      </Panel>
      <SaveBar state={state} onSave={() => save({ coupons: coupons.map((c) => ({ ...c, expiresAt: c.expiresAt ? new Date(`${c.expiresAt}T23:59:59`).toISOString() : null })) })} />
    </div>
  )
}

// ── Team ───────────────────────────────────────────────────────
const TeamSection = ({ ws }) => {
  const [AuthUser] = useAuth()
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('agent')
  const [error, setError] = useState('')
  const owner = ws.role === 'owner'
  const add = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await axios.post(bizUrl(ws.biz, '/team'), { username, role }, api)
      setUsername(''); ws.reloadOverview()
    } catch (err) { setError(errorOf(err)) }
  }
  const remove = async (userId, self) => {
    if (!window.confirm(self ? 'Leave this business? You will lose access to its inbox.' : 'Remove this person from the team?')) return
    try {
      await axios.delete(bizUrl(ws.biz, `/team/${userId}`), api)
      if (self) window.location.assign('/business')
      else ws.reloadOverview()
    } catch (err) { setError(errorOf(err)) }
  }
  const changeRole = async (member, next) => {
    try { await axios.post(bizUrl(ws.biz, '/team'), { username: member.username, role: next }, api); ws.reloadOverview() } catch (err) { setError(errorOf(err)) }
  }
  return (
    <Panel title="Team" description="People who answer customers for your business. They use their own Kova accounts and reply as the business from the shared inbox.">
      <ul className="-mt-1 divide-y divide-slate-100 dark:divide-slate-800">
        {ws.team.map((m) => (
          <li key={m._id} className="flex items-center gap-3 py-3">
            <Avatar name={m.fullName} src={m.avatar?.url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.fullName}{String(m._id) === String(AuthUser?._id) && <span className="text-slate-400"> (you)</span>}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{m.role === 'owner' ? 'Owner · everything' : m.role === 'admin' ? 'Admin · inbox, catalog, settings' : 'Agent · inbox, customers, orders, bookings'}</p>
            </div>
            {m.role !== 'owner' && owner && (
              <div className="w-28"><Select size="sm" value={m.role} onChange={(v) => changeRole(m, v)} options={ROLE_OPTIONS} aria-label={`Role of ${m.fullName}`} /></div>
            )}
            {m.role !== 'owner' && (owner || String(m._id) === String(AuthUser?._id)) && (
              <button onClick={() => remove(m._id, String(m._id) === String(AuthUser?._id))} className={btn.danger}>{String(m._id) === String(AuthUser?._id) ? 'Leave' : 'Remove'}</button>
            )}
          </li>
        ))}
      </ul>
      {owner && (
        <form onSubmit={add} className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="relative min-w-48 flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">@</span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className={`${inputCls} pl-7`} /></div>
          <div className="w-32"><Select value={role} onChange={setRole} options={ROLE_OPTIONS} aria-label="Role" /></div>
          <button disabled={!username.trim()} className={btn.primary}><LuPlus className="size-4" /> Add</button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Panel>
  )
}

// ── Share link, QR code, verification, turning off ─────────────
const ShareSection = ({ ws }) => {
  const [AuthUser, setAuthUser] = useAuth()
  const me = useBusiness((s) => s.me)
  const [copied, setCopied] = useState(false)
  const [requested, setRequested] = useState(!!ws.business.business.verificationRequested)
  const [error, setError] = useState('')
  const url = shopUrl(ws.business.username)
  const b = ws.business.business
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ } }
  const downloadQr = () => {
    const canvas = document.getElementById('biz-qr')
    const a = Object.assign(document.createElement('a'), { href: canvas.toDataURL('image/png'), download: `${ws.business.username}-qr.png` })
    a.click()
  }
  const requestVerification = async () => {
    try { await axios.post('/api/business/verification', {}, api); setRequested(true) } catch (err) { setError(errorOf(err)) }
  }
  const turnOff = async () => {
    if (!window.confirm('Turn off your business account? Your chats, catalog and settings are kept, and you can turn it back on later.')) return
    try {
      const res = await axios.put('/api/business/profile', { enabled: false }, api)
      const user = { ...AuthUser, business: res.data.business }
      localStorage.setItem('chatUser', JSON.stringify(user))
      setAuthUser(user)
      window.location.assign('/business')
    } catch (err) { setError(errorOf(err)) }
  }
  return (
    <div className="space-y-6">
      <Panel title="Your business link" description="Print the QR code on your counter, menus or packaging. Anyone who scans it can message you, order and book, without a contact request.">
        <div className="flex flex-wrap items-start gap-6">
          <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><QRCodeCanvas id="biz-qr" value={url} size={160} level="M" marginSize={1} /></div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[13px] dark:bg-slate-800">{url}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={copy} className={btn.secondary}>{copied ? <LuCheck className="size-4" /> : <LuCopy className="size-4" />} {copied ? 'Copied' : 'Copy link'}</button>
              <button onClick={downloadQr} className={btn.secondary}>Download QR</button>
              <a href={url} target="_blank" rel="noreferrer" className={btn.ghost}>Open page</a>
            </div>
          </div>
        </div>
      </Panel>
      {ws.role === 'owner' && (
        <Panel title="Verification" description="A blue tick tells customers your business is real. The Kova team checks your profile before approving.">
          {b.verified ? <p className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 dark:text-sky-400"><LuBadgeCheck className="size-4" /> Your business is verified</p>
            : requested ? <p className="text-sm text-slate-600 dark:text-slate-300">Requested. We'll review your profile soon. Make sure your address, website and description are filled in.</p>
            : <button onClick={requestVerification} className={btn.secondary}><LuBadgeCheck className="size-4" /> Request verification</button>}
        </Panel>
      )}
      {me?.isAdmin && <AdminPanel />}
      {ws.role === 'owner' && (
        <Panel title="Turn off business account" description="Your account goes back to a personal one. Nothing is deleted.">
          <button onClick={turnOff} className={btn.danger}>Turn off business account</button>
        </Panel>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

// Kova admins: approve verification requests and review reports
const AdminPanel = () => {
  const [data, setData] = useState(null)
  const load = () => axios.get('/api/business/admin/verifications', api).then((r) => setData(r.data)).catch(() => setData({ pending: [], reports: [] }))
  useEffect(() => { load() }, [])
  const decide = async (id, approve) => { await axios.post(`/api/business/admin/verifications/${id}`, { approve }, api).catch(() => {}); load() }
  const close = async (id) => { await axios.put(`/api/business/admin/reports/${id}`, {}, api).catch(() => {}); load() }
  return (
    <Panel title="Kova admin" description="Only app admins see this.">
      {!data ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold">Verification requests ({data.pending.length})</p>
            {data.pending.length === 0 && <p className="text-[13px] text-slate-500">None waiting.</p>}
            {data.pending.map((u) => (
              <div key={u._id} className="flex items-center gap-3 py-2">
                <Avatar name={u.fullName} src={u.avatar?.url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{u.fullName} <span className="text-slate-400">@{u.username}</span></p>
                  <p className="truncate text-xs text-slate-500">{[u.business.category, u.business.address, u.business.website].filter(Boolean).join(' · ')}</p>
                </div>
                <button onClick={() => decide(u._id, true)} className={btn.primary}>Approve</button>
                <button onClick={() => decide(u._id, false)} className={btn.ghost}>Reject</button>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Open reports ({data.reports.length})</p>
            {data.reports.length === 0 && <p className="text-[13px] text-slate-500">No open reports.</p>}
            {data.reports.map((r) => (
              <div key={r._id} className="flex items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p><span className="font-medium">{r.target?.fullName}</span> reported for <span className="font-medium">{r.reason}</span> by {r.reporter?.fullName}</p>
                  {r.details && <p className="truncate text-xs text-slate-500">“{r.details}”</p>}
                </div>
                <button onClick={() => close(r._id)} className={btn.ghost}>Mark reviewed</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

const Settings = ({ ws }) => {
  const sections = SECTIONS.filter(([, , roles]) => roles.includes(ws.role))
  const [section, setSection] = useState(() => {
    const wanted = new URLSearchParams(window.location.search).get('section')
    return sections.some(([id]) => id === wanted) ? wanted : sections[0][0]
  })
  const Body = { profile: ProfileSection, messages: MessagesSection, replies: RepliesSection, labels: LabelsSection, nexa: NexaSection, services: ServicesSection, discounts: DiscountsSection, team: TeamSection, share: ShareSection }[section]
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="How your business looks to customers and how Kova helps you answer them." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] lg:sticky lg:top-6 lg:w-52 lg:flex-col lg:self-start">
          {sections.map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${section === id ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-800' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'}`}>{label}</button>
          ))}
        </nav>
        <div className="min-w-0 flex-1"><Body key={section} ws={ws} /></div>
      </div>
    </div>
  )
}

export default Settings
