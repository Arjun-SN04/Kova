import React, { forwardRef, useState } from 'react'
import {
  LuArrowUp, LuBriefcase, LuCoffee, LuExpand, LuFeather, LuHandHeart, LuHeart, LuLanguages, LuLaugh,
  LuList, LuPenLine, LuShrink, LuSmilePlus, LuSpellCheck, LuZap,
} from 'react-icons/lu'

// The "Rewrite with Nexa" options, grouped. Style ids match STYLES in ai.controller.js
const GROUPS = [
  {
    title: 'Length',
    items: [
      ['shorten', 'Shorten', LuShrink],
      ['elaborate', 'Elaborate', LuExpand],
      ['bullets', 'Make it a list', LuList],
    ],
  },
  {
    title: 'Tone',
    items: [
      ['professional', 'More professional', LuBriefcase],
      ['friendly', 'Friendlier', LuHeart],
      ['casual', 'Casual', LuCoffee],
      ['confident', 'More confident', LuZap],
      ['polite', 'More polite', LuHandHeart],
      ['funny', 'Funnier', LuLaugh],
    ],
  },
  {
    title: 'Fix',
    items: [
      ['grammar', 'Fix spelling & grammar', LuSpellCheck],
      ['simplify', 'Simpler words', LuFeather],
      ['emoji', 'Add emoji', LuSmilePlus],
    ],
  },
  {
    title: 'Translate',
    items: [
      ['english', 'English', LuLanguages],
      ['hindi', 'Hindi', LuLanguages],
      ['hinglish', 'Hinglish', LuLanguages],
      ['malayalam', 'Malayalam', LuLanguages],
    ],
  },
]

const MAX_CUSTOM = 200

// `onPick(style, instruction?)`: a preset, or style "custom" with your own words
const RewriteMenu = forwardRef(({ onPick }, ref) => {
  const [custom, setCustom] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (custom.trim()) onPick('custom', custom.trim())
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-4 bottom-full z-30 mb-2 flex max-h-[min(70dvh,560px)] w-72 flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 sm:right-6 lg:right-8 dark:bg-slate-900 dark:ring-slate-800"
    >
      <p className="flex shrink-0 items-center gap-1.5 px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
        <LuPenLine className="size-3" /> Rewrite with Nexa
      </p>

      {/* Your own instruction */}
      <form onSubmit={submit} className="mx-2 mt-1 mb-1 flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 py-1 pr-1 pl-3 ring-indigo-500/40 focus-within:ring-2 dark:bg-slate-800">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.slice(0, MAX_CUSTOM))}
          placeholder="Or tell Nexa how… e.g. sound excited"
          aria-label="Your own rewrite instruction"
          autoFocus={window.matchMedia('(pointer: fine)').matches}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={!custom.trim()}
          aria-label="Rewrite"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-30"
        >
          <LuArrowUp className="size-4" />
        </button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1.5">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">{g.title}</p>
            {g.title === 'Translate' ? (
              // Languages as compact chips
              <div className="flex flex-wrap gap-1.5 px-3 pb-1">
                {g.items.map(([style, label]) => (
                  <button
                    key={style}
                    role="menuitem"
                    onClick={() => onPick(style)}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              g.items.map(([style, label, Icon]) => (
                <button
                  key={style}
                  role="menuitem"
                  onClick={() => onPick(style)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Icon className="size-4 shrink-0 text-slate-400" />
                  {label}
                </button>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

export default RewriteMenu
