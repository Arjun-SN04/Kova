import React from 'react'
import { LuChevronRight, LuInfo } from 'react-icons/lu'

// Shared layout for the Security & locks cards: a header with a status badge,
// a grouped list of rows, and a short tip underneath.

export const SectionHeader = ({ icon, title, status, on, description, action }) => {
  const Icon = icon
  return (
  <div className="flex items-start gap-3.5 sm:gap-4">
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="size-5" /></div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold sm:text-lg">{title}</p>
        {status && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-400'}`} />{status}
          </span>
        )}
      </div>
      {description && <p className="mt-0.5 text-xs text-slate-500 sm:text-sm dark:text-slate-400">{description}</p>}
    </div>
    {action}
  </div>
  )
}

export const RowGroup = ({ children }) => (
  <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{children}</div>
)

// A setting row. Pass onClick for a tappable row (shows a chevron), or `control` for a
// switch / select on the right. tone="danger" for destructive rows.
export const Row = ({ icon, title, description, onClick, control, value, tone }) => {
  const Icon = icon
  const danger = tone === 'danger'
  const body = (
    <>
      <Icon className={`size-4 shrink-0 ${danger ? 'text-red-500' : 'text-slate-400'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{title}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
      {value && <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{value}</span>}
      {onClick && !danger && <LuChevronRight className="size-4 shrink-0 text-slate-400" />}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${danger ? 'hover:bg-red-50 dark:hover:bg-red-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
        {body}
      </button>
    )
  }
  // Rows with a select stack on phones so the control gets the full width
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      {control && <div className="w-full shrink-0 pl-7 sm:w-auto sm:pl-0">{control}</div>}
    </div>
  )
}

export const Tip = ({ children }) => (
  <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
    <LuInfo className="mt-px size-3.5 shrink-0" /><span>{children}</span>
  </p>
)

export const Switch = ({ checked, onChange, label }) => (
  <button type="button" role="switch" aria-checked={!!checked} aria-label={label} onClick={onChange} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
    <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
)

// Top of Security & locks: how chats are stored (encrypted at rest on the server)
export const EncryptionNote = ({ icon }) => {
  const Icon = icon
  return (
    <div className="flex items-start gap-3.5 p-4 sm:gap-4 sm:p-6">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><Icon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold sm:text-lg">Encrypted storage</p>
        <p className="mt-0.5 text-xs text-slate-500 sm:text-sm dark:text-slate-400">Your messages, voice-note transcripts and Nexa chats are stored encrypted (AES-256-GCM). Someone with a copy of the database can't read them without Kova's server key.</p>
      </div>
    </div>
  )
}
