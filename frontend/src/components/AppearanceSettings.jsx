import React, { useEffect, useState } from 'react'
import axios from 'axios'
import useConversation from '../Zustand/UserConversation'
import WallpaperPicker from './WallpaperPicker'
import { wallpaperName, wallpaperStyle } from '../utils/wallpapers'
import { LuCheck, LuChevronRight, LuPalette } from 'react-icons/lu'
import { ACCENTS, MODES, TEXT_SIZES, useTheme } from '../context/ThemeProvider'

// A tiny drawing of the chat screen in light or dark colours
const MiniChat = ({ dark }) => (
  <div className="flex h-full" style={{ background: dark ? '#0e0f10' : '#f7f8fa' }}>
    <div className="w-1/3 space-y-1.5 border-r p-2" style={{ background: dark ? '#161719' : '#ffffff', borderColor: dark ? '#232428' : '#e3e6eb' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: dark ? '#33353a' : '#e3e6eb' }} />
          <span className="h-1 flex-1 rounded-full" style={{ background: dark ? '#33353a' : '#e3e6eb' }} />
        </div>
      ))}
    </div>
    <div className="flex flex-1 flex-col justify-end gap-1.5 p-2">
      <span className="h-2.5 w-3/5 rounded-md" style={{ background: dark ? '#232428' : '#ffffff' }} />
      <span className="ml-auto h-2.5 w-1/2 rounded-md bg-indigo-600" />
    </div>
  </div>
)

const AppearanceSettings = () => {
  const { mode, setMode, accent, setAccent, dark, textSize, setTextSize } = useTheme()
  const { wallpapers, setWallpapers } = useConversation()
  const [picking, setPicking] = useState(false)
  // The settings page can open on its own: load my wallpapers
  useEffect(() => {
    axios.get('/api/message/prefs', { withCredentials: true }).then((r) => { if (r.data.wallpapers) setWallpapers(r.data.wallpapers) }).catch(() => {})
  }, [setWallpapers])
  const chatCount = Object.keys(wallpapers.chats || {}).length
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          <LuPalette className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-base sm:text-lg">Appearance</p>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">Choose light or dark, and the colour used for buttons, links and your messages. Saved on this device.</p>
        </div>
      </div>

      <p className="mb-2 mt-5 sm:mt-6 text-[13px] font-medium text-slate-700 dark:text-slate-300">Mode</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className="group text-left">
            <span className={`block h-16 sm:h-20 overflow-hidden rounded-xl ring-1 transition ${mode === m.id ? 'ring-2 ring-indigo-600 dark:ring-indigo-400' : 'ring-slate-200 group-hover:ring-slate-300 dark:ring-slate-700 dark:group-hover:ring-slate-600'}`}>
              {m.id === 'system' ? (
                <span className="relative block h-full">
                  <MiniChat />
                  <span className="absolute inset-0" style={{ clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 35% 100%)' }}><MiniChat dark /></span>
                </span>
              ) : <MiniChat dark={m.id === 'dark'} />}
            </span>
            <span className={`mt-1.5 sm:mt-2 flex items-center gap-1 text-xs sm:text-sm ${mode === m.id ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
              {m.name}{mode === m.id && <LuCheck className="size-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
            </span>
          </button>
        ))}
      </div>

      <p className="mb-2 mt-5 sm:mt-6 text-[13px] font-medium text-slate-700 dark:text-slate-300">Theme colour</p>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Theme colour">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={accent === a.id}
            onClick={() => setAccent(a.id)}
            className={`flex flex-col items-center gap-1.5 sm:gap-2 rounded-xl border px-1.5 py-2 sm:px-2 sm:py-3 text-[11px] sm:text-xs transition ${accent === a.id ? 'border-slate-900 font-medium text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700'}`}
          >
            <span className="flex size-6 sm:size-7 items-center justify-center rounded-full text-white ring-1 ring-black/10 dark:ring-white/20" style={{ background: a.swatch }}>
              {accent === a.id && <LuCheck className="size-3.5 sm:size-4" />}
            </span>
            <span className="truncate max-w-full">{a.name}</span>
          </button>
        ))}
      </div>

      <p className="mb-2 mt-5 sm:mt-6 text-[13px] font-medium text-slate-700 dark:text-slate-300">Text size</p>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2" role="radiogroup" aria-label="Text size">
        {TEXT_SIZES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={textSize === t.id}
            onClick={() => setTextSize(t.id)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2 transition ${textSize === t.id ? 'border-slate-900 font-medium text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700'}`}
          >
            <span className="font-semibold leading-none" style={{ fontSize: `${(t.percent / 100) * 18}px` }} aria-hidden>Aa</span>
            <span className="max-w-full truncate text-[11px] sm:text-xs">{t.name}</span>
          </button>
        ))}
      </div>

      <p className="mb-2 mt-5 sm:mt-6 text-[13px] font-medium text-slate-700 dark:text-slate-300">Chat wallpaper</p>
      <button type="button" onClick={() => setPicking(true)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-2 pr-3 text-left transition hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700">
        <span className="chat-bg block h-14 w-11 shrink-0 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700" style={wallpaperStyle(wallpapers.global, dark, { thumb: true }) || undefined} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{wallpaperName(wallpapers.global)}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Default for all chats{chatCount ? ` · ${chatCount} chat${chatCount === 1 ? ' has' : 's have'} their own` : ''}. Change one chat from its info panel.</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">Change <LuChevronRight className="size-3.5" /></span>
      </button>
      {picking && <WallpaperPicker onClose={() => setPicking(false)} />}
    </div>
  )
}

export default AppearanceSettings
