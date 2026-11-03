import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// items: [{ label, icon: Icon, run, danger?, hidden? }] ('divider' for a line)
export const MessageMenu = ({ at, onClose, items }) => {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  // Keep the menu on screen (flip left/up near the edges)
  useLayoutEffect(() => {
    if (!at || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const pad = 8
    setPos({
      left: Math.max(pad, Math.min(at.x, window.innerWidth - width - pad)),
      top: at.y + height + pad > window.innerHeight ? Math.max(pad, at.y - height) : at.y,
    })
  }, [at])

  useEffect(() => {
    if (!at) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    ref.current?.querySelector('button')?.focus()
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [at, onClose])

  if (!at) return null
  const shown = items.filter((it) => it && !it.hidden)
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[80] min-w-48 overflow-hidden rounded-xl bg-white py-1.5 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
      style={pos ? { left: pos.left, top: pos.top } : { left: at.x, top: at.y, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {shown.map((it, i) => (it === 'divider'
        ? <div key={`d${i}`} className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
        : (
          <button
            key={it.label}
            role="menuitem"
            onClick={() => { onClose(); it.run() }}
            className={`flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm transition focus:outline-none ${it.danger
              ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus:bg-red-500/10'
              : 'text-slate-700 hover:bg-slate-100 focus:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800'}`}
          >
            {it.icon && <it.icon className="size-4 shrink-0" />}
            {it.label}
          </button>
        )))}
    </div>,
    document.body,
  )
}
