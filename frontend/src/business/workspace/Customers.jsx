import React, { useMemo, useState } from 'react'
import { LuDownload, LuFlame, LuSearch, LuUsers } from 'react-icons/lu'
import Avatar from '../../home/Avatar'
import { LabelChip } from '../CustomerPanel'
import { downloadCsv, formatDay, money, timeAgo } from '../utils'
import { Empty, PageHeader, SegmentTabs, btn, cardCls } from './ui'
import Select from '../../components/ui/Select'

// Everyone who has chatted with, ordered from or booked the business
const Customers = ({ ws }) => {
  const [query, setQuery] = useState('')
  const [show, setShow] = useState('all')
  const [sort, setSort] = useState('recent')
  const list = ws.customers || []
  const labelById = useMemo(() => new Map(ws.settings.labels.map((l) => [String(l._id), l])), [ws.settings.labels])
  const labelsOf = (c) => (c.record?.labels || []).map((id) => labelById.get(String(id))).filter(Boolean)
  const lastContact = (c) => new Date(c.lastMessage?.createdAt || c.record?.firstAt || 0).getTime()

  const shown = list
    .filter((c) => {
      const q = query.trim().toLowerCase()
      if (q && ![c.user.fullName, c.user.username, c.user.email, c.record?.notes].some((v) => v?.toLowerCase().includes(q))) return false
      if (show === 'leads') return c.record?.lead
      if (show === 'buyers') return c.orders > 0
      if (show.startsWith('label:')) return c.record?.labels?.some((l) => String(l) === show.slice(6))
      return true
    })
    .sort((a, b) => (sort === 'spent' ? b.spent - a.spent : sort === 'orders' ? b.orders - a.orders : sort === 'name' ? a.user.fullName.localeCompare(b.user.fullName) : lastContact(b) - lastContact(a)))

  const exportCsv = () => downloadCsv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Name', 'Username', 'Email', 'Labels', 'Lead', 'Orders', 'Total spent', 'Customer since', 'Last contact', 'Notes'],
    ...shown.map((c) => [c.user.fullName, c.user.username ? `@${c.user.username}` : '', c.user.email || '', labelsOf(c).map((l) => l.name).join('; '), c.record?.lead ? 'Yes' : '', c.orders, c.spent, c.record?.firstAt ? formatDay(c.record.firstAt) : '', lastContact(c) ? new Date(lastContact(c)).toLocaleString() : '', c.record?.notes || '']),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={`${list.length} customer${list.length === 1 ? '' : 's'} · ${list.filter((c) => c.orders > 0).length} have ordered`}
        actions={<button onClick={exportCsv} disabled={!shown.length} className={btn.secondary}><LuDownload className="size-4" /> Export CSV</button>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or notes" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
        </div>
        <div className="w-44">
          <Select value={show} onChange={setShow} aria-label="Show" className="h-9!" options={[{ value: 'all', label: 'Everyone' }, { value: 'leads', label: 'Leads' }, { value: 'buyers', label: 'Have ordered' }, ...ws.settings.labels.map((l) => ({ value: `label:${l._id}`, label: l.name, hint: 'Label' }))]} />
        </div>
        <SegmentTabs value={sort} onChange={setSort} tabs={[['recent', 'Recent'], ['spent', 'Top spenders'], ['orders', 'Most orders'], ['name', 'A–Z']]} />
      </div>

      <div className={`overflow-hidden ${cardCls}`}>
        {shown.length === 0 ? (
          <Empty icon={LuUsers} title={list.length ? 'No customers match' : 'No customers yet'} description={list.length ? 'Try a different search or filter.' : 'People who message, order or book appear here.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Labels</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 text-right font-medium">Spent</th>
                  <th className="px-4 py-3 font-medium">Last contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((c) => (
                  <tr key={c.user._id} onClick={() => ws.openChat(c.user._id)} className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.user.fullName} src={c.user.avatar?.url} size="sm" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-medium">{c.user.fullName}{c.record?.lead && <LuFlame className="size-3.5 text-orange-500" title="Lead" />}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.user.username ? `@${c.user.username}` : c.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{labelsOf(c).map((l) => <LabelChip key={l._id} label={l} small />)}</div></td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.orders || '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.spent ? money(c.spent) : '–'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{lastContact(c) ? (timeAgo(lastContact(c)) === 'just now' ? 'Just now' : `${timeAgo(lastContact(c))} ago`) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default Customers
