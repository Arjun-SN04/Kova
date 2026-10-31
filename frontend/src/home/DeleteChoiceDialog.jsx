import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuLoaderCircle, LuTrash2 } from 'react-icons/lu'

// "Delete for me" or "Delete for everyone". onDelete(mode) may be async: 'me' | 'everyone'.
// canEveryone: only when every selected message is yours (or a Nexa answer you may remove).
const DeleteChoiceDialog = ({ open, onClose, onDelete, count = 1, canEveryone = false, what, layer = 'z-50' }) => {
  const [busy, setBusy] = useState(null)
  const run = async (mode) => {
    if (busy) return
    setBusy(mode)
    try { await onDelete(mode) } finally { setBusy(null) }
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const noun = what || (count === 1 ? 'message' : 'messages')
  const it = count > 1 || /s$/.test(noun) ? 'them' : 'it'
  const btn = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition disabled:opacity-60'
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className={`fixed inset-0 ${layer} flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => { e.stopPropagation(); if (!busy) onClose() }}>
          <motion.div
            role="alertdialog" aria-modal="true" aria-label={`Delete ${noun}`}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ duration: 0.18 }}
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100 dark:ring-1 dark:ring-slate-800"
          >
            <div className="flex size-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"><LuTrash2 className="size-5" /></div>
            <h3 className="mt-4 text-lg font-semibold">Delete {count > 1 ? `${count} ` : ''}{noun}?</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {canEveryone
                ? `“Delete for everyone” removes ${it} for all people in this chat, along with any files. “Delete for me” only removes ${it} from your view.`
                : `This removes ${it} from your view only. Others in the chat still see ${it}.`}
            </p>
            <div className="mt-6 space-y-2">
              {canEveryone && (
                <button onClick={() => run('everyone')} disabled={!!busy} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
                  {busy === 'everyone' && <LuLoaderCircle className="size-4 animate-spin" />} Delete for everyone
                </button>
              )}
              <button onClick={() => run('me')} disabled={!!busy} className={`${btn} ${canEveryone ? 'text-red-600 ring-1 ring-red-200 hover:bg-red-50 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/10' : 'bg-red-600 text-white hover:bg-red-500'}`}>
                {busy === 'me' && <LuLoaderCircle className="size-4 animate-spin" />} Delete for me
              </button>
              <button onClick={onClose} disabled={!!busy} className={`${btn} text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}>Cancel</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default DeleteChoiceDialog
