import axios from 'axios'

// Shared helpers for business features (workspace, public page, chat cards)

export const api = { withCredentials: true }
export const bizUrl = (biz, path = '') => `/api/business/${biz || 'me'}${path}`
export const errorOf = (err, fallback = 'Something went wrong. Try again.') => err?.response?.data?.error || fallback

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DEFAULT_HOURS = DAY_NAMES.map((_, i) => ({ open: '09:00', close: '18:00', closed: i === 0 }))

export const CATEGORIES = ['Bakery', 'Restaurant & café', 'Grocery', 'Clothing & fashion', 'Beauty & salon', 'Health & fitness', 'Education & tutoring', 'Electronics', 'Home services', 'Professional services', 'Travel', 'Other']

// Stock photos (public/images/business, from Unsplash) used until a business adds its own cover
const CATEGORY_ART = {
  Bakery: 'bakery', 'Restaurant & café': 'restaurant', Grocery: 'grocery', 'Clothing & fashion': 'fashion',
  'Beauty & salon': 'beauty', 'Health & fitness': 'fitness', 'Education & tutoring': 'education', Electronics: 'electronics',
  'Home services': 'home', 'Professional services': 'professional', Travel: 'travel',
}
export const categoryCover = (category) => `/images/business/cat-${CATEGORY_ART[category] || 'other'}.jpg`
export const coverOf = (business) => business?.cover?.url || categoryCover(business?.category)
export const sectionArt = (id) => `/images/business/sec-${id}.jpg`

export const LABEL_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899', '#64748b']

export const ORDER_STATUSES = [
  { id: 'new', label: 'New', tone: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30' },
  { id: 'confirmed', label: 'Confirmed', tone: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30' },
  { id: 'ready', label: 'Ready for pickup', tone: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30' },
  { id: 'shipped', label: 'Out for delivery', tone: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30' },
  { id: 'done', label: 'Done', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30' },
  { id: 'cancelled', label: 'Cancelled', tone: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700' },
]
export const statusOf = (id) => ORDER_STATUSES.find((s) => s.id === id) || ORDER_STATUSES[0]

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } }

// All IANA time zones the browser knows (falls back to a short list)
export const timeZones = () => {
  try { return Intl.supportedValuesOf('timeZone') } catch { return ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney'] }
}

const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
export const clock = (hhmm) => {
  const minutes = typeof hhmm === 'number' ? hhmm : toMinutes(hhmm)
  if (minutes === null) return ''
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

// "Open now · closes 6 PM" / "Closed · opens Mon 9 AM" for a business profile (same rules as the server)
export const hoursState = (business, date = new Date()) => {
  if (!business?.enabled) return null
  const hours = business.hours?.length === 7 ? business.hours : DEFAULT_HOURS
  let day = 0
  let minutes = 0
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: business.timeZone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date).map((x) => [x.type, x.value]))
    day = DAY_NAMES.indexOf(p.weekday)
    minutes = Number(p.hour) * 60 + Number(p.minute)
  } catch { return null }
  const today = hours[day]
  const open = toMinutes(today.open)
  const close = toMinutes(today.close)
  if (!today.closed && open !== null && close !== null && minutes >= open && minutes < close) return { open: true, label: `Open now · closes ${clock(close)}` }
  for (let i = 0; i < 8; i++) {
    const d = hours[(day + i) % 7]
    const o = toMinutes(d.open)
    if (d.closed || o === null || (i === 0 && minutes >= o)) continue
    return { open: false, label: `Closed · opens ${i === 0 ? clock(o) : i === 1 ? `tomorrow ${clock(o)}` : `${DAY_NAMES[(day + i) % 7]} ${clock(o)}`}` }
  }
  return { open: false, label: 'Closed' }
}

export const isBusiness = (user) => !!user?.business?.enabled

// UPI deep link: opens the customer's UPI app with the amount filled in (no amount: they type it)
export const upiLink = ({ upiId, payee, amount, note }) =>
  `upi://pay?${new URLSearchParams({ pa: upiId, pn: payee || '', ...(amount ? { am: String(amount) } : {}), cu: 'INR', ...(note ? { tn: note } : {}) })}`

export const shopUrl = (username) => `${window.location.origin}/b/${username}`

export const formatWhen = (date, timeZone) => {
  try { return new Date(date).toLocaleString([], { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return new Date(date).toLocaleString() }
}
export const formatDay = (date) => new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
export const timeAgo = (date) => {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

// Download rows as a CSV file (opens in Excel / Google Sheets)
export const downloadCsv = (filename, rows) => {
  const cell = (v) => {
    const text = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = rows.map((r) => r.map(cell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Fill {name}, {order}… for previews in the browser
export const fillTemplate = (text, vars = {}) =>
  String(text || '').replace(/\{(\w+)\}/g, (all, key) => (vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : all))

// A page opened while signed out (e.g. a shop) to come back to after signing in
const RETURN_KEY = 'returnTo'
export const saveReturnTo = (path) => { try { localStorage.setItem(RETURN_KEY, path) } catch { /* ignore */ } }
export const takeReturnTo = () => {
  try { const p = localStorage.getItem(RETURN_KEY); localStorage.removeItem(RETURN_KEY); return p } catch { return null }
}

// Message a business from its page: connect (no request needed), then open the chat
export const startBusinessChat = async (bizId) => {
  const res = await axios.post(`/api/business/connect/${bizId}`, {}, api)
  return res.data.user
}
