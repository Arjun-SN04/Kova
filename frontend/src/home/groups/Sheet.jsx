import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuX } from 'react-icons/lu'

// Dialog shell used by the group screens: bottom sheet on phones, centred card on desktop
const Sheet = ({ open, onClose, title, children, footer, wide = false }) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Freeze the page behind the dialog while it's open
  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { html.style.overflow = before }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white text-slate-900 shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:text-slate-100 dark:ring-1 dark:ring-slate-800 ${wide ? 'max-w-lg' : 'max-w-md'}`}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
              <h3 className="truncate text-base sm:text-lg font-semibold">{title}</h3>
              <button onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
                <LuX className="size-4.5" />
              </button>
            </div>
            <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 ${footer ? 'pb-3.5 sm:pb-4' : 'pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5'}`}>{children}</div>
            {footer && <div className="border-t border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3.5 dark:border-slate-800">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default Sheet
