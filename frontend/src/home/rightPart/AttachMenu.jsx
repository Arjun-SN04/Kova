import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuPlus } from 'react-icons/lu'

const WIDTH = 232

// The "+" button in the message box: files, camera, poll and business tools in one menu.
// items: [{ id, label, Icon, onSelect, section?, note? }]
// The menu opens just above the message box (the element marked data-attach-anchor).
const AttachMenu = ({ items, disabled = false }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const wrap = useRef(null)
  const button = useRef(null)
  const list = useRef(null)

  const place = () => {
    const anchor = button.current?.closest('[data-attach-anchor]') || button.current
    if (!anchor) return
    const box = anchor.getBoundingClientRect()
    setPos({ left: Math.min(Math.max(8, box.left), window.innerWidth - WIDTH - 8), bottom: window.innerHeight - box.top + 8 })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrap.current?.contains(e.target) && !list.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', place)
    list.current?.querySelector('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // Arrow keys move between items
  const onListKey = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const all = [...list.current.querySelectorAll('[role="menuitem"]')]
    const i = all.indexOf(document.activeElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length
    all[next]?.focus()
  }

  return (
    <div ref={wrap} className="shrink-0">
      <button
        ref={button}
        type="button"
        onClick={() => { if (!open) place(); setOpen((o) => !o) }}
        disabled={disabled}
        aria-label="Attach and more"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Attach and more"
        className={`flex size-10 items-center justify-center rounded-xl transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-white ${open ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
      >
        <LuPlus className={`size-5 transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={list}
          role="menu"
          aria-label="Attach and more"
          onKeyDown={onListKey}
          style={{ left: pos.left, bottom: pos.bottom, width: WIDTH }}
          className="fixed z-[100] rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg shadow-slate-900/10 dark:border-slate-700/80 dark:bg-slate-900 dark:shadow-black/40"
        >
          {items.map((it, i) => {
            const newSection = i > 0 && it.section !== items[i - 1].section
            return (
              <React.Fragment key={it.id}>
                {newSection && (
                  <div role="presentation" className="mt-1 border-t border-slate-100 px-2.5 pb-1 pt-2 text-[11px] font-medium text-slate-400 dark:border-slate-800">
                    {it.section}
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setOpen(false); it.onSelect() }}
                  className="group flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
                >
                  <it.Icon className="size-4 shrink-0 text-slate-400 transition group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.note && <span className="shrink-0 text-[11px] text-slate-400">{it.note}</span>}
                </button>
              </React.Fragment>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}

export default AttachMenu
