import React, { useState } from 'react'
import axios from 'axios'
import { LuMegaphone, LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu'
import Avatar from '../../home/Avatar'
import Sheet from '../../home/groups/Sheet'
import { api, bizUrl, errorOf, fillTemplate } from '../utils'
import { Field, PageHeader, Panel, btn, inputCls, textareaCls } from './ui'
import Select from '../../components/ui/Select'

// Create or edit a broadcast list: a name and the customers in it
const ListDialog = ({ ws, list, onClose, onSave }) => {
  const [name, setName] = useState(list?.name || '')
  const [members, setMembers] = useState(new Set((list?.members || []).map(String)))
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const customers = (ws.customers || []).filter((c) => !query || c.user.fullName.toLowerCase().includes(query.toLowerCase()))
  const toggle = (id) => setMembers((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const save = async () => { setBusy(true); await onSave({ ...list, name, members: [...members] }); setBusy(false) }
  return (
    <Sheet open onClose={onClose} title={list?._id ? 'Edit list' : 'New broadcast list'} footer={
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{members.size} selected</span>
        <div className="flex gap-2">
          <button onClick={onClose} className={btn.ghost}>Cancel</button>
          <button onClick={save} disabled={busy || !name.trim()} className={btn.primary}>{busy ? 'Saving…' : 'Save list'}</button>
        </div>
      </div>
    }>
      <div className="space-y-4 pt-1">
        <Field label="List name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputCls} placeholder="Regular customers" autoFocus /></Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Customers</span>
            <button onClick={() => setMembers(new Set(customers.map((c) => String(c.user._id))))} className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Select all shown</button>
          </div>
          <div className="relative mb-2">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className={`${inputCls} pl-9`} />
          </div>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {customers.map((c) => (
              <li key={c.user._id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input type="checkbox" checked={members.has(String(c.user._id))} onChange={() => toggle(String(c.user._id))} className="size-4 accent-indigo-600" />
                  <Avatar name={c.user.fullName} src={c.user.avatar?.url} size="xs" />
                  <span className="text-sm">{c.user.fullName}</span>
                </label>
              </li>
            ))}
            {customers.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No customers yet.</li>}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}

const Broadcasts = ({ ws }) => {
  const lists = ws.settings.broadcastLists || []
  const [editing, setEditing] = useState(null)
  const [target, setTarget] = useState(lists[0] ? `list:${lists[0]._id}` : ws.settings.labels[0] ? `label:${ws.settings.labels[0]._id}` : 'all')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const saveLists = async (next) => {
    setError('')
    try {
      const res = await axios.put(bizUrl(ws.biz, '/settings'), { broadcastLists: next }, api)
      ws.setSettings(res.data.settings); setEditing(null)
    } catch (err) { setError(errorOf(err)) }
  }
  const saveList = (list) => saveLists(list._id ? lists.map((l) => (l._id === list._id ? list : l)) : [...lists, list])
  const removeList = (list) => window.confirm(`Delete the list "${list.name}"?`) && saveLists(lists.filter((l) => l._id !== list._id))

  const recipients = (() => {
    const all = ws.customers || []
    if (target === 'all') return all.map((c) => String(c.user._id))
    if (target.startsWith('list:')) return (lists.find((l) => String(l._id) === target.slice(5))?.members || []).map(String)
    if (target.startsWith('label:')) return all.filter((c) => c.record?.labels?.some((l) => String(l) === target.slice(6))).map((c) => String(c.user._id))
    return []
  })()

  const send = async () => {
    if (!window.confirm(`Send this to ${recipients.length} customer${recipients.length === 1 ? '' : 's'}? Each gets it as a private message from your business.`)) return
    setBusy(true); setError(''); setResult('')
    const body = target.startsWith('list:') ? { listId: target.slice(5) } : target.startsWith('label:') ? { labelId: target.slice(6) } : { customerIds: recipients }
    try {
      const res = await axios.post(bizUrl(ws.biz, '/broadcast'), { ...body, text }, api)
      setResult(`Sent to ${res.data.sent} customer${res.data.sent === 1 ? '' : 's'}${res.data.skipped ? ` (${res.data.skipped} skipped: no longer in your chats)` : ''}.`)
      setText('')
    } catch (err) { setError(errorOf(err)) } finally { setBusy(false) }
  }

  const sample = ws.customers?.find((c) => recipients.includes(String(c.user._id)))?.user.fullName.split(' ')[0] || 'Ravi'

  return (
    <div className="space-y-6">
      <PageHeader title="Broadcasts" description="Send one message to many customers. Each person gets it privately, and replies come back to your inbox." />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="New broadcast">
          <div className="space-y-4">
            <Field label="Send to">
              <Select
                value={target}
                onChange={setTarget}
                aria-label="Send to"
                options={[
                  ...lists.map((l) => ({ value: `list:${l._id}`, label: l.name, hint: `List · ${l.members.length}` })),
                  ...ws.settings.labels.map((l) => ({ value: `label:${l._id}`, label: l.name, hint: 'Label' })),
                  { value: 'all', label: 'All customers', hint: String(ws.customers?.length || 0) },
                ]}
              />
            </Field>
            <Field label="Message" hint="Write {name} to use each customer's first name.">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={4000} className={textareaCls} placeholder="Hi {name}! Christmas plum cakes are here. Order before 20 Dec for 10% off." />
            </Field>
            {text.trim() && <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"><span className="font-medium">Preview:</span> {fillTemplate(text, { name: sample })}</p>}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {result && <p className="text-sm text-emerald-600 dark:text-emerald-400">{result}</p>}
            <button onClick={send} disabled={busy || !text.trim() || !recipients.length} className={btn.primary}><LuMegaphone className="size-4" /> {busy ? 'Sending…' : `Send to ${recipients.length}`}</button>
          </div>
        </Panel>

        <Panel title="Broadcast lists" actions={<button onClick={() => setEditing({ name: '', members: [] })} className={btn.ghost}><LuPlus className="size-4" /> New</button>}>
          {lists.length === 0 ? <p className="text-[13px] text-slate-500 dark:text-slate-400">Group customers you message often, like “Regular customers”. You can also send to everyone with a label.</p> : (
            <ul className="-my-2 divide-y divide-slate-100 dark:divide-slate-800">
              {lists.map((l) => (
                <li key={l._id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{l.members.length} customer{l.members.length === 1 ? '' : 's'}</p>
                  </div>
                  <button onClick={() => setEditing(l)} className={btn.icon} aria-label="Edit"><LuPencil className="size-4" /></button>
                  <button onClick={() => removeList(l)} className={`${btn.icon} hover:text-red-600!`} aria-label="Delete"><LuTrash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {editing && <ListDialog ws={ws} list={editing} onClose={() => setEditing(null)} onSave={saveList} />}
    </div>
  )
}

export default Broadcasts
