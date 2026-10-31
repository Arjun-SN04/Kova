import React, { createContext, useContext } from 'react'

// Small building blocks shared by the business workspace screens

export const btn = {
  primary: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50',
  secondary: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
  ghost: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10',
  icon: 'flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
}

export const inputCls = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
export const textareaCls = `${inputCls} h-auto resize-y py-2.5 leading-relaxed`
export const cardCls = 'rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none'

// The photo and business name for the current section (set by the workspace)
export const SectionContext = createContext({ image: null, eyebrow: '' })

// Photo banner at the top of each section
export const PageHeader = ({ title, description, actions, image }) => {
  const ctx = useContext(SectionContext)
  const photo = image ?? ctx.image
  return (
    <header className="relative isolate overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
      {photo && <img src={photo} alt="" className="absolute inset-0 -z-10 size-full object-cover" />}
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-slate-950/90 via-slate-950/70 to-slate-950/20" />
      <div className="flex min-h-44 flex-col justify-end gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div className="max-w-xl">
          {ctx.eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">{ctx.eyebrow}</p>}
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 text-sm leading-relaxed text-white/75">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5 self-start rounded-xl bg-white/95 p-1.5 text-slate-900 shadow-lg ring-1 ring-black/5 backdrop-blur sm:self-auto dark:bg-slate-900/90 dark:text-slate-100 dark:ring-white/10">{actions}</div>}
      </div>
    </header>
  )
}

export const Panel = ({ title, description, actions, children, className = '' }) => (
  <section className={`${cardCls} ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {actions}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
)

export const Field = ({ label, hint, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
  </label>
)

export const Toggle = ({ checked, onChange, label, description, disabled = false }) => (
  <label className={`flex cursor-pointer items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
    <span className="min-w-0">
      <span className="block text-sm font-medium">{label}</span>
      {description && <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-slate-400">{description}</span>}
    </span>
    <span className="relative mt-0.5 inline-flex shrink-0">
      <input type="checkbox" className="peer sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-500/20 dark:bg-slate-700" />
      <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
    </span>
  </label>
)

// Empty state with the section's photo and an icon badge
export const Empty = ({ icon: Icon, title, description, action, image }) => {
  const ctx = useContext(SectionContext)
  const photo = image ?? ctx.image
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {photo ? (
        <div className="relative">
          <img src={photo} alt="" className="h-28 w-44 rounded-2xl object-cover shadow-md ring-1 ring-black/5" loading="lazy" />
          {Icon && <span className="absolute -bottom-3 -right-3 flex size-10 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-md ring-1 ring-slate-200 dark:bg-slate-800 dark:text-indigo-300 dark:ring-slate-700"><Icon className="size-5" /></span>}
        </div>
      ) : Icon && <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Icon className="size-5" /></span>}
      <p className="mt-6 text-base font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
}

export const Stat = ({ label, value, hint, icon: Icon, tone = 'indigo' }) => (
  <div className={`${cardCls} p-5`}>
    <div className="flex items-start justify-between gap-3">
      <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      {Icon && <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}><Icon className="size-[18px]" /></span>}
    </div>
    <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
    {hint && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
)

export const ErrorText = ({ children }) => (children ? <p className="text-sm text-red-600 dark:text-red-400">{children}</p> : null)

export const SegmentTabs = ({ tabs, value, onChange }) => (
  <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
    {tabs.map(([id, label, count]) => (
      <button key={id} onClick={() => onChange(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${value === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
        {label}{count !== undefined && <span className={`rounded-full px-1.5 text-[11px] ${value === id ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300' : 'text-slate-400'}`}>{count}</span>}
      </button>
    ))}
  </div>
)
