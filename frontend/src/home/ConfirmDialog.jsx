import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuTrash2 } from 'react-icons/lu'

// Reusable "are you sure?" dialog. `onConfirm` may be async; the button shows
// a busy state until it finishes. Enter confirms, Esc cancels.
const ConfirmDialog = ({ open, onClose, onConfirm, title, description, confirmLabel = 'Delete', busyLabel = 'Deleting…', icon: Icon = LuTrash2, layer = 'z-50' }) => {
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') { e.preventDefault(); confirm() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${layer} flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100 dark:ring-1 dark:ring-slate-800"
          >
            <div className="flex size-11 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <Icon className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            {description && <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="h-10 rounded-lg px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={busy}
                autoFocus
                className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
              >
                {busy ? busyLabel : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default ConfirmDialog
