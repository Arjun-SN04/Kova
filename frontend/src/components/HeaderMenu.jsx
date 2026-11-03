import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// A header button that opens a small menu (New…, ⋯ More). Keeps headers to one or two icons;
// everything else lives in the menu.
// items: [{ label, icon: Icon, run?, to?, badge?, className?, hidden? }] or 'divider'
const HeaderMenu = ({ icon, label, badge = 0, items, buttonClass, iconClass = 'size-4 sm:size-4.5', width = 'w-56' }) => {
  const Icon = icon
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const shown = items.filter((it) => it && !it.hidden)
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`${buttonClass} relative`} title={label} aria-label={badge ? `${label} (${badge} new)` : label} aria-expanded={open} aria-haspopup="menu">
        <Icon className={iconClass} />
        {badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-semibold text-white ring-2 ring-white dark:ring-slate-950">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 top-full z-30 mt-1.5 ${width} rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800`}>
          {shown.map((it, i) => (it === 'divider'
            ? <div key={`d${i}`} className={`my-1 h-px bg-slate-200 dark:bg-slate-800 ${shown[i + 1]?.className || ''}`} />
            : (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => { setOpen(false); if (it.to) navigate(it.to); else it.run?.() }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 ${it.className || ''}`}
              >
                {it.icon && <it.icon className="size-4 shrink-0 text-slate-400" />}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.badge > 0 && (
                  <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">{it.badge > 99 ? '99+' : it.badge}</span>
                )}
              </button>
            )))}
        </div>
      )}
    </div>
  )
}

export default HeaderMenu
