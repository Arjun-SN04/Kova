import React, { useRef, useState } from 'react'
import axios from 'axios'
import { LuCheck, LuImagePlus, LuUndo2 } from 'react-icons/lu'
import Sheet from '../home/groups/Sheet'
import useConversation from '../Zustand/UserConversation'
import { useTheme } from '../context/ThemeProvider'
import { compressImage } from '../utils/attachments'
import { PRESETS, WALLPAPER_GROUPS, defaultDim, presetById, wallpaperStyle } from '../utils/wallpapers'

const api = { withCredentials: true }
const CLASSIC = { kind: 'preset', id: 'classic' }
const same = (a, b) => (a === b) || (!!a && !!b && a.kind === b.kind && (a.kind === 'preset' ? a.id === b.id : a.url === b.url))

const Tile = ({ spec, label, children, selected, onPick }) => (
  <button type="button" onClick={() => onPick(spec)} aria-pressed={selected} title={label}
    className={`group relative aspect-[3/4] overflow-hidden rounded-xl ring-1 transition ${selected ? 'ring-2 ring-indigo-600 ring-offset-2 ring-offset-white dark:ring-indigo-400 dark:ring-offset-slate-900' : 'ring-slate-200 hover:ring-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600'}`}>
    {children}
    <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white">{label}</span>
    {selected && <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-indigo-600 text-white"><LuCheck className="size-3" /></span>}
  </button>
)

// Pick a chat wallpaper. With chatId: just that chat (or "use my default"); without: my default for all chats.
const WallpaperPicker = ({ chatId = null, chatName = '', onClose }) => {
  const { dark } = useTheme()
  const { wallpapers, setWallpapers } = useConversation()
  const current = chatId ? (wallpapers.chats?.[String(chatId)] ?? 'inherit') : (wallpapers.global ?? CLASSIC)
  const [choice, setChoice] = useState(current) // spec | 'inherit' | { kind: 'upload', file, url }
  const [dim, setDim] = useState(typeof current === 'object' && current ? current.dim ?? defaultDim(current) : 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)

  const pick = (spec) => { setChoice(spec); setDim(spec && spec !== 'inherit' ? defaultDim(spec.kind === 'upload' ? { kind: 'image' } : spec) : 0); setError('') }
  const pickFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file'); return }
    pick({ kind: 'upload', file, url: URL.createObjectURL(file) })
  }

  // What the preview shows
  const previewSpec = choice === 'inherit' ? wallpapers.global : choice?.kind === 'upload' ? { kind: 'image', url: choice.url } : choice
  const showDim = choice !== 'inherit' && choice?.id !== 'classic'
  const previewStyle = wallpaperStyle(previewSpec && previewSpec.id !== 'classic' ? { ...previewSpec, dim: showDim ? dim : previewSpec.dim } : null, dark)

  const save = async () => {
    setBusy(true); setError('')
    try {
      let spec = choice === 'inherit' ? null : choice
      if (spec?.kind === 'upload') {
        const small = await compressImage(spec.file)
        if (small.size > 2 * 1024 * 1024) throw new Error('That photo is too large (max 2 MB)')
        const body = new FormData()
        body.append('image', small, small.name || 'wallpaper.jpg')
        const up = await axios.post('/api/user/wallpaper/image', body, api)
        spec = { kind: 'image', url: up.data.url, publicId: up.data.publicId }
      }
      if (spec && spec.id === 'classic' && !chatId) spec = null // the default look needs no setting
      if (spec) spec = { ...spec, dim: showDim ? dim : 0 }
      const res = await axios.put('/api/user/wallpaper', { chatId, wallpaper: spec }, api)
      setWallpapers(res.data.wallpapers)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not save')
      setBusy(false)
    }
  }


  return (
    <Sheet open onClose={onClose} wide title={chatId ? `Wallpaper for ${chatName || 'this chat'}` : 'Chat wallpaper'} footer={
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">{chatId ? 'Only you see this, in this chat.' : 'Used in every chat that doesn’t have its own.'}</span>
        <button onClick={save} disabled={busy || (same(choice, current) && (!showDim || dim === (current?.dim ?? 0)))} className="h-10 shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">{busy ? 'Saving…' : 'Set wallpaper'}</button>
      </div>
    }>
      {/* Preview (stays in view while scrolling the choices) */}
      <div className="sticky top-0 z-10 -mx-1 bg-white px-1 pb-2 pt-1 dark:bg-slate-900">
      <div className="chat-bg relative h-36 overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-slate-700" style={previewStyle || undefined}>
        <div className="absolute inset-0 flex flex-col justify-center gap-2 px-4">
          <span className="w-fit max-w-[70%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-[13px] text-slate-800 shadow-xs dark:bg-slate-800 dark:text-slate-100">Are we still on for tonight?</span>
          <span className="ml-auto w-fit max-w-[70%] rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-[13px] text-white shadow-xs">Yes! See you at 7 🙂</span>
        </div>
      </div>
      {showDim && (
        <label className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-10 shrink-0 font-medium">Dim</span>
          <input type="range" min="0" max="0.7" step="0.05" value={dim} onChange={(e) => setDim(Number(e.target.value))} className="flex-1 accent-indigo-600" aria-label="Dim the wallpaper" />
          <span className="w-9 text-right tabular-nums">{Math.round(dim * 100)}%</span>
        </label>
      )}
      </div>

      {/* Choices */}
      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5">
        {chatId && (
          <Tile onPick={pick} spec="inherit" label="Use my default" selected={choice === 'inherit'}>
            <span className="flex size-full items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800"><LuUndo2 className="size-5" /></span>
          </Tile>
        )}
        <Tile onPick={pick} spec={CLASSIC} label="Classic" selected={same(choice, CLASSIC)}><span className="chat-bg block size-full" /></Tile>
        <button type="button" onClick={() => fileInput.current?.click()} className={`relative flex aspect-[3/4] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-dashed text-[11px] font-medium transition ${choice?.kind === 'upload' || choice?.kind === 'image' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300' : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400'}`}>
          {(choice?.kind === 'upload' || choice?.kind === 'image') && <span className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url("${choice.url}")` }} />}
          <LuImagePlus className="relative size-5" /><span className="relative">Upload photo</span>
        </button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      {WALLPAPER_GROUPS.map((group) => (
        <div key={group} className="mt-4">
          <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{group}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {PRESETS.filter((p) => p.group === group).map((p) => {
              const spec = { kind: 'preset', id: p.id }
              return (
                <Tile key={p.id} onPick={pick} spec={spec} label={p.name} selected={same(choice, spec)}>
                  <span className="block size-full" style={wallpaperStyle(spec, dark, { thumb: true }) || undefined} />
                </Tile>
              )
            })}
          </div>
        </div>
      ))}
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {presetById(choice?.id)?.photo && <p className="mt-3 text-[11px] text-slate-400">Photos from Unsplash.</p>}
    </Sheet>
  )
}

export default WallpaperPicker
