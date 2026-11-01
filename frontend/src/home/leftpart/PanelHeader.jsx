import React from 'react'

export const panelIconBtn =
  'flex size-8 sm:size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'

// Title row at the top of each sidebar panel (Chats, Calls, Communities)
const PanelHeader = ({ title, children }) => (
  <header className="flex items-center justify-between px-3 sm:px-4 pb-2.5 sm:pb-3.5 pt-3.5 sm:pt-4">
    <h1 className="truncate text-lg sm:text-xl font-semibold tracking-tight">{title}</h1>
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{children}</div>
  </header>
)

export default PanelHeader
