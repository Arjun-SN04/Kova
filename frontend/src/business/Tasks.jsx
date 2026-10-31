import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { LuCalendarClock, LuClipboardList, LuPlus, LuSquare, LuSquareCheck, LuTrash2 } from 'react-icons/lu'
import Sheet from '../home/groups/Sheet'
import { useSocket } from '../context/SocketProvider'
import useConversation from '../Zustand/UserConversation'
import { useAuth } from '../context/AuthProvider'
import { api, errorOf } from './utils'
import Select from '../components/ui/Select'

const field = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900'

// Members of the open group (for the "assign to" list)
const useMembers = (groupId) => {
  const { groups, selectedConversation } = useConversation()
  const group = String(selectedConversation?._id) === String(groupId) ? selectedConversation : groups.find((g) => String(g._id) === String(groupId))
  return group?.members || []
}

// A due date picked in the browser means the end of that day, locally
const endOfDay = (ymd) => (ymd ? new Date(`${ymd}T23:59:00`).toISOString() : null)

// New task (from a message, or blank)
export const TaskDialog = ({ groupId, message = null, onClose, onCreated }) => {
  const members = useMembers(groupId)
  const [AuthUser] = useAuth()
  const [text, setText] = useState(message?.message?.slice(0, 300) || '')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e?.preventDefault()
    if (!text.trim()) return setError('Describe the task')
    setBusy(true); setError('')
    try {
      const res = await axios.post('/api/tasks', { groupId, text, assignee: assignee || null, due: endOfDay(due), messageId: message?._id || null }, api)
      onCreated?.(res.data.task)
      onClose()
    } catch (err) {
      setError(errorOf(err))
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="New task" footer={
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
        <button onClick={save} disabled={busy} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Adding…' : 'Add task'}</button>
      </div>
    }>
      <form onSubmit={save} className="space-y-4 pt-1">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">Task</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={300} autoFocus placeholder="e.g. 50 cupcakes for the school event" className={`${field} h-auto resize-none py-2.5`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">Assign to</span>
            <Select value={assignee} onChange={setAssignee} aria-label="Assign to" options={[{ value: '', label: 'Nobody yet' }, ...members.map((m) => ({ value: m._id, label: String(m._id) === String(AuthUser?._id) ? 'Me' : m.fullName }))]} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">Due</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          </label>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Sheet>
  )
}

// Tasks section of the group info panel
export const GroupTasks = ({ groupId }) => {
  const { socket } = useSocket()
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)
  const [tasks, setTasks] = useState([])
  const [show, setShow] = useState('open')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    axios.get(`/api/tasks/group/${groupId}`, api).then((res) => setTasks(res.data.tasks)).catch(() => {})
  }, [groupId])
  useEffect(load, [load])
  useEffect(() => {
    if (!socket) return
    const onUpdate = ({ groupId: id }) => String(id) === String(groupId) && load()
    socket.on('tasksUpdated', onUpdate)
    return () => socket.off('tasksUpdated', onUpdate)
  }, [socket, groupId, load])

  const change = async (task, patch) => {
    setError('')
    setTasks((list) => list.map((t) => (t._id === task._id ? { ...t, ...patch } : t)))
    try { await axios.put(`/api/tasks/${task._id}`, patch, api) } catch (err) { setError(errorOf(err)); load() }
  }
  const remove = async (task) => {
    if (!window.confirm('Delete this task?')) return
    setTasks((list) => list.filter((t) => t._id !== task._id))
    try { await axios.delete(`/api/tasks/${task._id}`, api) } catch (err) { setError(errorOf(err)); load() }
  }

  const open = tasks.filter((t) => !t.done)
  const shown = show === 'mine' ? open.filter((t) => String(t.assignee?._id) === myId) : show === 'done' ? tasks.filter((t) => t.done) : open

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><LuClipboardList className="size-4 text-slate-400" /> Tasks <span className="text-xs font-normal text-slate-400">{open.length} open</span></h3>
        <button onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"><LuPlus className="size-3.5" /> Add</button>
      </div>
      <div className="mt-2 flex gap-1">
        {[['open', 'Open'], ['mine', 'Mine'], ['done', 'Done']].map(([id, label]) => (
          <button key={id} onClick={() => setShow(id)} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${show === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>{label}</button>
        ))}
      </div>
      <ul className="mt-2 space-y-1">
        {shown.length === 0 && <li className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">{show === 'done' ? 'Nothing finished yet' : 'No open tasks. Add one, or use ⋯ → Make task on a message.'}</li>}
        {shown.map((t) => {
          const overdue = t.due && !t.done && new Date(t.due) < new Date()
          return (
            <li key={t._id} className="group/task flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
              <button onClick={() => change(t, { done: !t.done })} className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-label={t.done ? 'Mark as not done' : 'Mark as done'}>
                {t.done ? <LuSquareCheck className="size-4.5" /> : <LuSquare className="size-4.5 text-slate-400" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] leading-snug ${t.done ? 'text-slate-400 line-through' : ''}`}>{t.text}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>{t.assignee ? (String(t.assignee._id) === myId ? 'You' : t.assignee.fullName.split(' ')[0]) : 'Unassigned'}</span>
                  {t.due && <span className={`inline-flex items-center gap-0.5 ${overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}`}><LuCalendarClock className="size-3" />{new Date(t.due).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
                  {t.done && t.doneBy && <span>done by {String(t.doneBy._id) === myId ? 'you' : t.doneBy.fullName.split(' ')[0]}</span>}
                </p>
              </div>
              <button onClick={() => remove(t)} className="shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition hover:text-red-600 group-hover/task:opacity-100 focus:opacity-100" aria-label="Delete task"><LuTrash2 className="size-3.5" /></button>
            </li>
          )
        })}
      </ul>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {adding && <TaskDialog groupId={groupId} onClose={() => setAdding(false)} onCreated={load} />}
    </section>
  )
}
