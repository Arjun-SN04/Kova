import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuLoaderCircle, LuMessageCircle, LuShoppingBag, LuTimer, LuUserPlus, LuScrollText } from 'react-icons/lu'
import { api, bizUrl, errorOf, money } from '../utils'
import { PageHeader, Panel, SegmentTabs, Stat, btn } from './ui'

// One-series bar chart with a hover readout. Single hue, thin bars with a gap,
// rounded tops on a shared baseline, a recessive grid line and sparse axis labels.
const Bars = ({ data, label, format = (v) => v, height = 160 }) => {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const every = Math.ceil(data.length / 8)
  const shown = hover !== null ? data[hover] : null
  return (
    <figure aria-label={label}>
      <div className="mb-2 h-5 text-xs text-slate-500 dark:text-slate-400">
        {shown ? <span><span className="font-medium text-slate-900 dark:text-white">{format(shown.value)}</span> · {shown.label}</span> : <span>Hover a bar for details</span>}
      </div>
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200 dark:border-slate-800" />
        <span className="pointer-events-none absolute -top-2 left-0 z-10 bg-white pr-1 text-[10px] text-slate-400 dark:bg-slate-900">{format(max)}</span>
        <div className="absolute inset-0 flex items-end gap-0.5 border-b border-slate-200 dark:border-slate-700" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 cursor-default items-end" onMouseEnter={() => setHover(i)} title={`${d.label}: ${format(d.value)}`}>
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-indigo-600 dark:bg-indigo-300' : 'bg-indigo-500 dark:bg-indigo-400'} ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                style={{ height: d.value ? `${Math.max(2, (d.value / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-0.5">
        {data.map((d, i) => <span key={i} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-400">{i % every === 0 ? d.short : ''}</span>)}
      </div>
    </figure>
  )
}

const Insights = ({ ws }) => {
  const [days, setDays] = useState(7)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    axios.get(bizUrl(ws.biz, `/insights?days=${days}`), api).then((r) => setData(r.data)).catch((err) => setError(errorOf(err)))
  }, [ws.biz, days])

  const sendSummary = async () => {
    setSummary('Sending…')
    try { await axios.post(bizUrl(ws.biz, '/summary'), {}, api); setSummary('Sent to your Nexa chat') } catch (err) { setSummary(errorOf(err)) }
  }

  const day = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString([], opts)
  const series = (key) => (data?.series || []).map((d) => ({ value: d[key], label: day(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), short: day(d.date, days <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }) }))
  const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
  const hours = (data?.busiestHours || []).map((v, h) => ({ value: v, label: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`, short: h % 3 === 0 ? hourLabel(h) : '' }))
  const peak = hours.reduce((best, h, i) => (h.value > (hours[best]?.value || 0) ? i : best), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="How your business chats are going."
        actions={
          <>
            {ws.role === 'owner' && <button onClick={sendSummary} className={btn.secondary}><LuScrollText className="size-4" /> {summary || "Send today's summary to Nexa"}</button>}
            <SegmentTabs value={days} onChange={(d) => { setData(null); setDays(d) }} tabs={[[7, '7 days'], [30, '30 days'], [90, '90 days']]} />
          </>
        }
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!data ? <div className="flex justify-center py-16"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={LuMessageCircle} tone="indigo" label="Messages from customers" value={data.messagesIn} hint={`${data.messagesOut} sent by you`} />
            <Stat icon={LuUserPlus} tone="sky" label="New customers" value={data.newCustomers} />
            <Stat icon={LuTimer} tone="amber" label="Avg. first reply" value={data.avgReplyMinutes === null ? '–' : data.avgReplyMinutes < 60 ? `${data.avgReplyMinutes} min` : `${Math.round(data.avgReplyMinutes / 6) / 10} h`} hint={data.waiting ? `${data.waiting} waiting now` : 'Nobody waiting'} />
            <Stat icon={LuShoppingBag} tone="emerald" label="Orders" value={data.orders} hint={`${money(data.revenue)} · ${money(data.paidRevenue)} paid`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Messages from customers" description="Per day"><Bars data={series('messagesIn')} label="Messages from customers per day" /></Panel>
            <Panel title="Revenue" description={`Per day · ${data.orders} orders, ${data.bookings} bookings`}><Bars data={series('revenue')} label="Revenue per day" format={money} /></Panel>
          </div>
          <Panel title="Busiest hours" description={data.messagesIn ? `Customers message most around ${hourLabel(peak)}. Keep someone on the inbox then.` : 'Messages from customers by hour of day'}>
            <Bars data={hours} label="Messages by hour of day" height={120} />
          </Panel>
        </>
      )}
    </div>
  )
}

export default Insights
