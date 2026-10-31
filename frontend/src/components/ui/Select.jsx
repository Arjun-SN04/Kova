import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuCheck, LuChevronDown, LuSearch } from 'react-icons/lu'

// The app's dropdown (used instead of the browser's <select>).
//   <Select value={x} onChange={setX} options={['A', 'B']} />
//   <Select value={id} onChange={setId} options={[{ value: 'a', label: 'Apple', hint: '₹40' }]} />
// The menu opens in a layer on top of the page, so dialogs and scrolling
// panels never cut it off. Long lists get a search box.

const SIZES = {
  md: 'h-10 rounded-lg px-3 text-sm',
  sm: 'h-8 rounded-lg px-2.5 text-[13px]',
}
const VARIANTS = {
  outline: 'border border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600',
  filled: 'border border-transparent bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-900 dark:hover:bg-slate-800',
}
const SEARCH_FROM = 10
const MENU_MAX = 300

const normalize = (options) => options.map((o) => (typeof o === 'object' && o !== null ? { ...o, value: String(o.value) } : { value: String(o), label: String(o) }))

const Select = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  size = 'md',
  variant = 'outline',
  className = '',
  disabled = false,
  searchable,
  fullWidth = true,
  'aria-label': ariaLabel,
  id,
}) => {
  const items = useMemo(() => normalize(options), [options])
  const current = items.find((o) => o.value === String(value ?? ''))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState(null)
  const button = useRef(null)
  const menu = useRef(null)
  const list = useRef(null)
  const search = useRef(null)
  const typed = useRef({ text: '', at: 0 })
  const listId = useId()
  const withSearch = searchable ?? items.length > SEARCH_FROM

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(q)) : items
  }, [items, query])

  // Place the menu under the button (or above it when there's no room)
  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 220 && above > below
    const minWidth = Math.max(r.width, 180)
    const maxWidth = Math.min(Math.max(minWidth, 320), window.innerWidth - 16)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - maxWidth - 8)
    setPos({ left: Math.max(8, left), minWidth, maxWidth, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined, maxHeight: Math.min(MENU_MAX, Math.max(160, up ? above : below)) })
  }, [])

  const openMenu = () => {
    if (disabled) return
    setQuery('')
    setActive(Math.max(0, items.findIndex((o) => o.value === current?.value)))
    place()
    setOpen(true)
  }
  const close = (focus = true) => {
    setOpen(false)
    if (focus) button.current?.focus()
  }
  const choose = (o) => {
    if (!o || o.disabled) return
    if (o.value !== current?.value) onChange?.(o.value)
    close()
  }

  useLayoutEffect(() => {
    if (!open) return
    if (withSearch) search.current?.focus()
    else list.current?.focus()
  }, [open, withSearch])

  // Keep the menu attached while the page scrolls or resizes; close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (menu.current?.contains(e.target) || button.current?.contains(e.target)) return
      close(false)
    }
    const onScroll = (e) => { if (!menu.current?.contains(e.target)) place() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, place])

  // Keep the highlighted option in view
  useEffect(() => {
    if (!open) return
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open, shown])

  const move = (step) => {
    if (!shown.length) return
    let i = active
    for (let n = 0; n < shown.length; n++) {
      i = (i + step + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setActive(i)
  }

  const onMenuKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') close(false)
    else if (!withSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      // Type the first letters to jump to an option
      const now = e.timeStamp
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
      if (i >= 0) setActive(i)
    }
  }

  const onButtonKey = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu() }
  }

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onButtonKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`flex ${fullWidth ? 'w-full' : 'w-auto'} min-w-0 items-center gap-2 text-left text-slate-900 outline-none transition focus-visible:border-indigo-400 focus-visible:ring-4 focus-visible:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 ${SIZES[size]} ${VARIANTS[variant]} ${open ? 'border-indigo-400! ring-4 ring-indigo-500/10' : ''} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${current ? '' : 'text-slate-400'}`}>{current ? current.label : placeholder}</span>
        <LuChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menu}
          className="fixed z-[100] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-black/40"
          style={{ left: pos.left, minWidth: pos.minWidth, maxWidth: pos.maxWidth, width: 'max-content', top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          onKeyDown={onMenuKey}
        >
          {withSearch && (
            <div className="relative shrink-0 border-b border-slate-100 dark:border-slate-800">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={search}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                placeholder="Search"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
                className="h-9 w-full bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-slate-400"
              />
            </div>
          )}
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="min-h-0 flex-1 overflow-y-auto p-1 outline-none"
          >
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No matches</li>}
            {shown.map((o, i) => {
              const selected = o.value === current?.value
              return (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled || undefined}
                  onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                  onClick={() => choose(o)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${o.disabled ? 'cursor-not-allowed opacity-40' : ''} ${i === active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                >
                  <span className={`min-w-0 flex-1 truncate ${selected ? 'font-medium' : ''}`}>{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-slate-400">{o.hint}</span>}
                  <LuCheck className={`size-4 shrink-0 text-indigo-600 dark:text-indigo-400 ${selected ? '' : 'invisible'}`} />
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}

export default Select
