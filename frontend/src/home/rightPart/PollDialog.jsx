import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { AnimatePresence, motion } from 'motion/react'
import { LuChartColumn, LuPlus, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'

// Create a poll in the open chat
const PollDialog = ({ open, onClose }) => {
  const { selectedConversation, setMessages } = useConversation()
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multiple, setMultiple] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setQuestion(''); setOptions(['', '']); setMultiple(false); setError('')
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filled = options.map((o) => o.trim()).filter(Boolean)
  const ready = question.trim() && filled.length >= 2

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true); setError('')
    try {
      const res = await axios.post('/api/message/poll', {
        chatId: selectedConversation._id, isGroup: !!selectedConversation.isGroup, question, options: filled, multiple,
      }, { withCredentials: true })
      setMessages((prev) => (prev.some((m) => m._id === res.data._id) ? prev : [...prev, res.data]))
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't post the poll")
    } finally {
      setBusy(false)
    }
  }

  const setOption = (i, v) => setOptions((list) => {
    const next = list.map((o, n) => (n === i ? v : o))
    // Typing in the last box adds a new empty one (up to 12)
    if (i === list.length - 1 && v.trim() && list.length < 12) next.push('')
    return next
  })

  const input = 'h-10 w-full rounded-lg bg-slate-50 px-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500/50 dark:bg-slate-800 dark:ring-slate-700'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18 }}
            role="dialog" aria-modal="true" aria-labelledby="poll-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-800"
          >
            <div className="flex items-center gap-3 px-5 pb-3 pt-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><LuChartColumn className="size-5" /></div>
              <h3 id="poll-title" className="flex-1 text-base font-semibold">New poll</h3>
              <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Close"><LuX className="size-4" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Question</span>
                <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="Lunch at 1 or 2?" className={input} />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Options</span>
                <div className="space-y-2">
                  {options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={100} placeholder={`Option ${i + 1}`} className={input} />
                      {options.length > 2 && (
                        <button type="button" onClick={() => setOptions((l) => l.filter((_, n) => n !== i))} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={`Remove option ${i + 1}`}><LuX className="size-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
                {options.length < 12 && options.every((o) => o.trim()) && (
                  <button type="button" onClick={() => setOptions((l) => [...l, ''])} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"><LuPlus className="size-3.5" /> Add option</button>
                )}
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700">
                <span className="text-sm">Allow more than one answer</span>
                <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="size-4 accent-indigo-600" />
              </label>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/80">
              <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={!ready || busy} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{busy ? 'Posting…' : 'Post poll'}</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default PollDialog
