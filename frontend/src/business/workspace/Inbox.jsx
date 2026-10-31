import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { LuArrowLeft, LuBot, LuCheck, LuCheckCheck, LuFileText, LuFlame, LuInbox, LuLoaderCircle, LuPanelRight, LuSearch, LuSendHorizontal } from 'react-icons/lu'
import { useSocket } from '../../context/SocketProvider'
import { useAuth } from '../../context/AuthProvider'
import Avatar from '../../home/Avatar'
import ChatCard from '../ChatCard'
import CustomerPanel, { LabelChip } from '../CustomerPanel'
import { BusinessActions, useQuickReplies } from '../Compose'
import { api, bizUrl, errorOf, timeAgo } from '../utils'
import { Empty } from './ui'
import Select from '../../components/ui/Select'

const FILTERS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['waiting', 'Waiting'],
  ['mine', 'Mine'],
  ['unassigned', 'Unassigned'],
  ['leads', 'Leads'],
  ['human', 'Needs a person'],
]

const previewText = (m) => {
  if (!m) return 'No messages yet'
  if (m.card?.kind) return { product: 'Product', order: 'Order', payment: 'Payment request', booking: 'Booking', task: 'Task' }[m.card.kind] || m.message
  if (m.message) return m.message
  return m.attachment?.kind === 'image' ? 'Photo' : m.attachment?.kind === 'audio' ? 'Voice note' : m.attachment ? 'File' : ''
}

// One customer row in the inbox list
const Row = ({ c, active, labels, team, onOpen, bizId }) => {
  const r = c.record
  const assignee = r?.assignedTo && team.find((t) => String(t._id) === String(r.assignedTo))
  const mine = String(c.lastMessage?.senderId) === String(bizId)
  return (
    <button onClick={onOpen} aria-current={active ? 'true' : undefined} className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition dark:border-slate-800/70 ${active ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'}`}>
      <Avatar name={c.user.fullName} src={c.user.avatar?.url} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm ${c.unread ? 'font-semibold' : 'font-medium'}`}>{c.user.fullName}</p>
          {r?.lead && <LuFlame className="size-3.5 shrink-0 text-orange-500" title="Lead" />}
          <span className="ml-auto shrink-0 text-[11px] text-slate-400">{c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ''}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate text-[13px] ${c.unread ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
            {mine && <span className="text-slate-400">{c.lastMessage?.auto ? 'Auto: ' : 'You: '}</span>}{previewText(c.lastMessage)}
          </p>
          {c.unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
        </div>
        {(labels.length > 0 || r?.waitingSince || assignee || r?.needsHuman) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {r?.needsHuman && <span className="rounded-full bg-red-50 px-1.5 py-px text-[10px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">Needs a person</span>}
            {r?.waitingSince && <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Waiting {timeAgo(r.waitingSince)}</span>}
            {labels.map((l) => <LabelChip key={l._id} label={l} small />)}
            {assignee && <span className="ml-auto text-[10px] text-slate-400">→ {assignee.fullName.split(' ')[0]}</span>}
          </div>
        )}
      </div>
    </button>
  )
}

// A chat bubble in the inbox (simpler than the main chat)
const Bubble = ({ m, fromBusiness, staffName }) => (
  <div className={`flex ${fromBusiness ? 'justify-end' : ''}`}>
    <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${fromBusiness ? 'items-end' : 'items-start'}`}>
      <div className={m.card ? '' : `rounded-2xl text-[14px] leading-relaxed ${m.attachment?.kind === 'image' ? 'p-1.5' : 'px-3.5 py-2'} ${fromBusiness ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/60'}`}>
        {m.card ? <ChatCard message={m} mine={fromBusiness} /> : (
          <>
            {m.attachment?.kind === 'image' && <img src={m.attachment.url} alt="" className="max-h-72 rounded-xl object-cover" />}
            {m.attachment && m.attachment.kind !== 'image' && (
              <a href={m.attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline-offset-2 hover:underline"><LuFileText className="size-4" />{m.attachment.name || 'Attachment'}</a>
            )}
            {m.message && <span className={`block whitespace-pre-wrap wrap-break-word ${m.attachment?.kind === 'image' ? 'px-2 pb-1 pt-1.5' : ''}`}>{m.message}</span>}
          </>
        )}
      </div>
      <p className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-400">
        {m.auto && <span className="inline-flex items-center gap-0.5"><LuBot className="size-3" />{m.auto === 'nexa' ? 'Nexa' : 'Automatic'} ·</span>}
        {fromBusiness && !m.auto && staffName && <span>{staffName} ·</span>}
        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {fromBusiness && (m.seen ? <LuCheckCheck className="size-3.5 text-indigo-500" /> : <LuCheck className="size-3.5" />)}
      </p>
    </div>
  </div>
)

const Chat = ({ ws, customer, onBack, showDetails, onToggleDetails }) => {
  const [AuthUser] = useAuth()
  const { socket } = useSocket()
  const [messages, setMessages] = useState(null)
  const [staff, setStaff] = useState({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const customerId = String(customer.user._id)

  const load = useCallback(async () => {
    try {
      const res = await axios.get(bizUrl(ws.biz, `/chat/${customerId}`), api)
      setMessages(res.data.messages); setStaff(res.data.staff || {})
    } catch (err) { setError(errorOf(err)) }
  }, [ws.biz, customerId])
  useEffect(() => { setMessages(null); setText(''); setError(''); load() }, [load])

  // New messages in this chat, and updated cards
  useEffect(() => {
    if (!socket) return
    const belongs = (m) => m && !m.groupId && ([String(m.senderId), String(m.receiverId)].sort().join() === [String(ws.biz), customerId].sort().join())
    let timer = null
    const onInbox = (d) => {
      if (String(d.business) !== String(ws.biz) || !belongs(d.message)) return
      setMessages((list) => (list && !list.some((m) => m._id === d.message._id) ? [...list, d.message] : list))
      // Mark it read (the server does that when the chat loads)
      if (String(d.message.senderId) === customerId) { clearTimeout(timer); timer = setTimeout(load, 600) }
    }
    const onNew = (m) => { if (belongs(m)) setMessages((list) => (list && !list.some((x) => x._id === m._id) ? [...list, m] : list)) }
    const onEdited = (m) => { if (belongs(m)) setMessages((list) => list?.map((x) => (x._id === m._id ? m : x)) ?? list) }
    const onSeen = ({ by }) => { if (String(by) === customerId) setMessages((list) => list?.map((m) => (String(m.receiverId) === customerId ? { ...m, seen: true } : m)) ?? list) }
    socket.on('businessInbox', onInbox)
    socket.on('newMessage', onNew)
    socket.on('messageEdited', onEdited)
    socket.on('messagesSeen', onSeen)
    return () => {
      clearTimeout(timer)
      socket.off('businessInbox', onInbox)
      socket.off('newMessage', onNew)
      socket.off('messageEdited', onEdited)
      socket.off('messagesSeen', onSeen)
    }
  }, [socket, ws.biz, customerId, load])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [messages?.length])

  const quick = useQuickReplies({ text, setText, settings: ws.settings, vars: { name: customer.user.fullName.split(' ')[0] }, inputRef })
  const append = (msg) => setMessages((list) => (list && !list.some((m) => m._id === msg._id) ? [...list, msg] : list))
  const send = async (e) => {
    e?.preventDefault()
    const value = text.trim()
    if (!value || sending) return
    setSending(true); setError('')
    try {
      const res = await axios.post(bizUrl(ws.biz, `/chat/${customerId}`), { text: value }, api)
      append(res.data); setText('')
    } catch (err) { setError(errorOf(err)) } finally { setSending(false); inputRef.current?.focus() }
  }
  const staffName = (m) => (m.sentBy ? (String(m.sentBy) === String(AuthUser?._id) ? 'You' : staff[String(m.sentBy)] || ws.team.find((t) => String(t._id) === String(m.sentBy))?.fullName) : null)
  const labels = (customer.record?.labels || []).map((id) => ws.settings.labels.find((l) => String(l._id) === String(id))).filter(Boolean)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
        <button onClick={onBack} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Back"><LuArrowLeft className="size-5" /></button>
        <Avatar name={customer.user.fullName} src={customer.user.avatar?.url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{customer.user.fullName}</p>
          <div className="flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {customer.user.username && <span>@{customer.user.username}</span>}
            {labels.slice(0, 3).map((l) => <LabelChip key={l._id} label={l} small />)}
          </div>
        </div>
        <button onClick={onToggleDetails} className={`flex size-9 items-center justify-center rounded-lg transition hover:bg-slate-100 dark:hover:bg-slate-800 ${showDetails ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`} aria-label="Customer details" title="Customer details"><LuPanelRight className="size-4.5" /></button>
      </header>

      <div ref={scrollRef} className="chat-bg min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
        {messages === null ? <div className="flex h-full items-center justify-center"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
          : messages.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No messages yet. Say hello!</p>
          : messages.map((m) => <Bubble key={m._id} m={m} fromBusiness={String(m.senderId) === String(ws.biz)} staffName={staffName(m)} />)}
      </div>

      <div className="relative shrink-0 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        {quick.menu}
        {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <form onSubmit={send} className="flex items-end gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900">
          <BusinessActions biz={ws.biz} customerId={customerId} onSent={append} hasUpi={!!ws.business?.business?.upiId} settings={ws.settings} onInsert={(t) => { setText(t); inputRef.current?.focus() }} />
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (quick.onKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={`Reply as ${ws.business?.fullName}${ws.settings.quickReplies?.length ? ' · type / for quick replies' : ''}`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 pl-1 text-sm leading-5 outline-none placeholder:text-slate-400"
          />
          <button disabled={!text.trim() || sending} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800" aria-label="Send">
            {sending ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuSendHorizontal className="size-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}

const Inbox = ({ ws, customerId }) => {
  const [AuthUser] = useAuth()
  const [filter, setFilter] = useState('all')
  const [label, setLabel] = useState('')
  const [query, setQuery] = useState('')
  // Details sit beside the chat on wide screens, and slide over it on smaller ones
  const [showDetails, setShowDetails] = useState(() => window.innerWidth >= 1280)
  const myId = String(AuthUser?._id)
  const list = ws.customers

  const shown = useMemo(() => (list || []).filter((c) => {
    const r = c.record
    const q = query.trim().toLowerCase()
    if (q && !c.user.fullName.toLowerCase().includes(q) && !c.user.username?.includes(q.replace(/^@/, ''))) return false
    if (label && !r?.labels?.some((l) => String(l) === label)) return false
    if (filter === 'unread') return c.unread > 0
    if (filter === 'waiting') return !!r?.waitingSince
    if (filter === 'mine') return String(r?.assignedTo) === myId
    if (filter === 'unassigned') return !r?.assignedTo
    if (filter === 'leads') return !!r?.lead
    if (filter === 'human') return !!r?.needsHuman
    return true
  }), [list, filter, label, query, myId])

  const active = list?.find((c) => String(c.user._id) === String(customerId))
  const labelsOf = (c) => (c.record?.labels || []).map((id) => ws.settings.labels.find((l) => String(l._id) === String(id))).filter(Boolean)
  const setRecord = (record) => ws.setCustomers((all) => all?.map((c) => (String(c.user._id) === String(record.customer) ? { ...c, record } : c)) ?? all)

  return (
    <div className="flex h-full min-h-0">
      {/* List */}
      <div className={`${active ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-r border-slate-200 bg-white lg:w-96 dark:border-slate-800 dark:bg-slate-950`}>
        <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="relative">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers" className="h-9 w-full rounded-lg bg-slate-100 pl-9 pr-3 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-indigo-500/30 dark:bg-slate-900 dark:focus:bg-slate-950" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(([id, text]) => (
              <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${filter === id ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white'}`}>{text}</button>
            ))}
          </div>
          {ws.settings.labels.length > 0 && (
            <Select size="sm" variant="filled" value={label} onChange={setLabel} options={[{ value: '', label: 'All labels' }, ...ws.settings.labels.map((l) => ({ value: l._id, label: l.name }))]} aria-label="Filter by label" />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list === null ? <div className="flex justify-center py-10"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
            : shown.length === 0 ? <Empty icon={LuInbox} title={list.length ? 'No chats match' : 'No customers yet'} description={list.length ? 'Try another filter.' : 'Share your business link so customers can message you. Their chats appear here for your whole team.'} />
            : shown.map((c) => <Row key={c.user._id} c={c} active={c === active} labels={labelsOf(c)} team={ws.team} bizId={ws.biz} onOpen={() => ws.go({ customer: c.user._id })} />)}
        </div>
      </div>

      {/* Chat + details */}
      {active ? (
        <>
          <Chat ws={ws} customer={active} onBack={() => ws.go({ customer: null })} showDetails={showDetails} onToggleDetails={() => setShowDetails((v) => !v)} />
          {showDetails && <div className="fixed inset-0 z-30 bg-slate-950/30 xl:hidden" onClick={() => setShowDetails(false)} />}
          {showDetails && (
            <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 xl:static xl:z-auto xl:w-80 dark:border-slate-800 dark:bg-slate-950">
              <button onClick={() => setShowDetails(false)} className="mb-2 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 xl:hidden dark:hover:bg-slate-800">Close</button>
              <div className="mb-4 flex flex-col items-center text-center">
                <Avatar name={active.user.fullName} src={active.user.avatar?.url} size="lg" />
                <p className="mt-3 font-semibold">{active.user.fullName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{active.user.email}</p>
                {active.record?.firstAt && <p className="mt-1 text-xs text-slate-400">Customer since {new Date(active.record.firstAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}</p>}
              </div>
              <CustomerPanel key={active.user._id} biz={ws.biz} customerId={active.user._id} record={active.record} settings={ws.settings} team={ws.team} onChange={setRecord} />
            </aside>
          )}
        </>
      ) : (
        <div className="hidden flex-1 items-center justify-center lg:flex">
          <Empty icon={LuInbox} title="Pick a customer" description="Everyone on your team sees these chats. Replies go out as your business." />
        </div>
      )}
    </div>
  )
}

export default Inbox
