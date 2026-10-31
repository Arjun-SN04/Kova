import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  LuCheck, LuChevronLeft, LuChevronRight, LuDownload, LuExternalLink, LuFileText, LuImage, LuLink,
  LuLoaderCircle, LuMessageSquare, LuMic, LuPause, LuPlay, LuSquareCheck, LuTrash2, LuX,
} from 'react-icons/lu'
import ConfirmDialog from '../ConfirmDialog'
import DeleteChoiceDialog from '../DeleteChoiceDialog'
import { downloadFile, formatBytes } from '../../utils/attachments'
import useAudioPlayer from '../../Zustand/useAudioPlayer'

const TABS = [
  { id: 'media', label: 'Media', Icon: LuImage, empty: 'Photos and videos shared here show up in this tab.' },
  { id: 'docs', label: 'Docs', Icon: LuFileText, empty: 'PDFs and other files shared here show up in this tab.' },
  { id: 'links', label: 'Links', Icon: LuLink, empty: 'Links shared here show up in this tab.' },
  { id: 'voice', label: 'Voice', Icon: LuMic, empty: 'Voice notes and audio show up in this tab.' },
]
const EASE = [0.32, 0.72, 0, 1]

const monthOf = (d) => new Date(d).toLocaleDateString([], { month: 'long', year: 'numeric' })
const dayOf = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const clock = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const extOf = (name = '') => (name.match(/\.(\w{1,5})$/)?.[1] || 'file').toUpperCase()

// Newest month first, newest item first inside each month
const byMonth = (items) => {
  const groups = []
  for (const it of items) {
    const label = monthOf(it.date)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(it)
    else groups.push({ label, items: [it] })
  }
  return groups
}

// Round tick in the corner of an item while selecting
const Tick = ({ on, disabled, className = '' }) => (
  <span className={`flex size-5 items-center justify-center rounded-full border-2 transition ${
    disabled ? 'border-slate-300/70 bg-slate-100/60 dark:border-slate-600 dark:bg-slate-800/60'
      : on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-white bg-slate-950/25 dark:border-slate-300'
  } ${className}`}>
    {on && <LuCheck className="size-3" strokeWidth={3} />}
  </span>
)

const iconBtn = 'flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'

// Full-screen photo/video viewer with previous / next
const Viewer = ({ items, index, onIndex, onClose, onJump, onDelete }) => {
  const it = items[index]
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowLeft' && index < items.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowRight' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, items.length, onClose, onIndex])
  if (!it) return null
  const round = 'flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30'
  return (
    <motion.div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/95 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{it.from}</p>
          <p className="text-xs text-white/60">{dayOf(it.date)} · {items.length - index} of {items.length}</p>
        </div>
        <button onClick={() => downloadFile(it.url, it.name && it.name.length < 60 ? it.name : `kova-${it.kind}-${Date.now()}`)} className={round} title="Download" aria-label="Download"><LuDownload className="size-4.5" /></button>
        {onJump && <button onClick={() => onJump(it)} className={round} title="Show in chat" aria-label="Show in chat"><LuMessageSquare className="size-4.5" /></button>}
        {it.deletable && <button onClick={() => onDelete([it])} className={`${round} hover:bg-red-500/80`} title="Delete" aria-label="Delete"><LuTrash2 className="size-4.5" /></button>}
        <button onClick={onClose} className={round} aria-label="Close viewer"><LuX className="size-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16">
        <button onClick={() => onIndex(index + 1)} disabled={index >= items.length - 1} className={`${round} absolute left-3 top-1/2 -translate-y-1/2`} aria-label="Older"><LuChevronLeft className="size-5" /></button>
        <AnimatePresence mode="wait">
          <motion.div key={it.id} className="flex size-full items-center justify-center" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {it.kind === 'video'
              ? <video src={it.url} controls autoPlay className="max-h-full max-w-full rounded-lg bg-black" />
              : <img src={it.url} alt={it.name || 'Photo'} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />}
          </motion.div>
        </AnimatePresence>
        <button onClick={() => onIndex(index - 1)} disabled={index <= 0} className={`${round} absolute right-3 top-1/2 -translate-y-1/2`} aria-label="Newer"><LuChevronRight className="size-5" /></button>
      </div>
      {it.name && it.from === 'Nexa' && <p className="mx-auto -mt-3 mb-4 max-w-2xl px-6 text-center text-xs text-white/60">{it.name}</p>}
    </motion.div>
  )
}

// All photos, videos, documents, links and voice notes of one chat.
// items: from utils/mediaItems. onDelete(items) → { ok, error }. onJump(item): show it in the chat.
const MediaManager = ({ open, onClose, title, subtitle, items, onDelete, onJump, deleteNote, choice = false }) => {
  const [tab, setTab] = useState('media')
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [viewer, setViewer] = useState(-1)
  const [confirm, setConfirm] = useState(null) // items waiting for a yes
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { track, playing, play, toggle } = useAudioPlayer()

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, items.filter((i) => i.tab === t.id).length])), [items])
  const shown = useMemo(() => items.filter((i) => i.tab === tab), [items, tab])
  const groups = useMemo(() => byMonth(shown), [shown])
  const media = tab === 'media' ? shown : []

  // Start on the first tab that has something
  useEffect(() => {
    if (!open) return
    setTab((t) => (counts[t] ? t : TABS.find((x) => counts[x.id])?.id || 'media'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => { setPicked(new Set()); setSelecting(false) }, [tab, open])
  // Items that vanish (deleted elsewhere) drop out of the selection
  useEffect(() => { setPicked((p) => new Set([...p].filter((id) => items.some((i) => i.id === id)))) }, [items])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && viewer < 0 && !confirm) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, viewer, confirm, onClose])

  const togglePick = (it) => {
    if (!it.deletable) return
    setPicked((p) => { const n = new Set(p); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n })
  }
  const pickedItems = shown.filter((i) => picked.has(i.id))
  const deletableHere = shown.filter((i) => i.deletable)
  const allPicked = deletableHere.length > 0 && pickedItems.length === deletableHere.length

  const runDelete = async (mode) => {
    setBusy(true); setError('')
    const res = await onDelete(confirm, mode)
    setBusy(false)
    if (!res.ok) setError(res.error)
    setConfirm(null)
    setPicked(new Set())
    setSelecting(false)
    if (viewer >= 0) setViewer(-1)
  }
  const downloadPicked = async () => {
    for (const it of pickedItems.filter((i) => i.tab !== 'links')) await downloadFile(it.url, it.name && it.name.length < 60 ? it.name : `kova-${it.kind}-${Date.now()}`)
  }
  const jump = (it) => { setViewer(-1); onClose(); onJump?.(it) }

  const open_ = (it, i) => (selecting ? togglePick(it) : it.tab === 'media' ? setViewer(i) : null)

  const listRow = 'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900'
  const rowActions = (it) => !selecting && (
    <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      {it.tab !== 'links' && <button onClick={(e) => { e.stopPropagation(); downloadFile(it.url, it.name || `kova-${it.kind}`) }} className={iconBtn} title="Download" aria-label="Download"><LuDownload className="size-4" /></button>}
      {onJump && <button onClick={(e) => { e.stopPropagation(); jump(it) }} className={iconBtn} title="Show in chat" aria-label="Show in chat"><LuMessageSquare className="size-4" /></button>}
      {it.deletable && <button onClick={(e) => { e.stopPropagation(); setConfirm([it]) }} className={`${iconBtn} hover:bg-red-50! hover:text-red-600! dark:hover:bg-red-500/10!`} title="Delete" aria-label="Delete"><LuTrash2 className="size-4" /></button>}
    </span>
  )

  const confirmText = confirm && (() => {
    const n = confirm.length
    const what = tab === 'links' ? (n === 1 ? 'link' : 'links') : tab === 'media' ? (n === 1 ? 'item' : 'items') : tab === 'docs' ? (n === 1 ? 'document' : 'documents') : (n === 1 ? 'voice note' : 'voice notes')
    return { title: `Delete ${n} ${what}?`, description: deleteNote?.(tab) || 'The messages are deleted for everyone and the files are removed from storage. This can’t be undone.' }
  })()

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="media-manager" className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white text-slate-900 shadow-2xl dark:text-slate-100 ring-1 ring-slate-900/5 sm:h-[min(86vh,780px)] sm:rounded-2xl dark:bg-slate-950 dark:ring-white/10"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{title}</p>
                {subtitle && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
              </div>
              {deletableHere.length > 0 && (
                <button onClick={() => { setSelecting((v) => !v); setPicked(new Set()) }} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${selecting ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <LuSquareCheck className="size-4" /> {selecting ? 'Done' : 'Select'}
                </button>
              )}
              <button onClick={onClose} className={iconBtn} aria-label="Close"><LuX className="size-4.5" /></button>
            </div>

            {/* Tabs */}
            <div className="shrink-0 border-b border-slate-200 px-5 dark:border-slate-800">
              <div className="flex gap-1 overflow-x-auto" role="tablist">
                {TABS.map(({ id, label, Icon }) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`relative flex h-10 shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition ${tab === id ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                    <Icon className="size-4" /> {label}
                    <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{counts[id]}</span>
                    {tab === id && <motion.span layoutId="media-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" transition={{ duration: 0.25, ease: EASE }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Selection bar */}
            <AnimatePresence initial={false}>
              {selecting && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.22, ease: EASE }} className="shrink-0 overflow-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-center gap-2 px-5 py-2">
                    <button onClick={() => setPicked(allPicked ? new Set() : new Set(deletableHere.map((i) => i.id)))} className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">{allPicked ? 'Clear' : 'Select all'}</button>
                    <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">{pickedItems.length} selected</span>
                    {tab !== 'links' && <button onClick={downloadPicked} disabled={!pickedItems.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-40 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"><LuDownload className="size-4" /> Download</button>}
                    <button onClick={() => setConfirm(pickedItems)} disabled={!pickedItems.length} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40"><LuTrash2 className="size-4" /> Delete</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && <p className="shrink-0 px-5 pt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

            {/* Content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              {!shown.length ? (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  {(() => { const t = TABS.find((x) => x.id === tab); return (
                    <>
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500"><t.Icon className="size-5" /></span>
                      <p className="mt-3 text-sm font-medium">No {t.label.toLowerCase()} yet</p>
                      <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{t.empty}</p>
                    </>
                  ) })()}
                </div>
              ) : groups.map((g) => (
                <section key={g.label} className="pt-4">
                  <h3 className="sticky top-0 z-10 -mx-1 bg-white/95 px-1 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 backdrop-blur dark:bg-slate-950/95 dark:text-slate-500">{g.label}</h3>

                  {tab === 'media' && (
                    <div className="mt-1 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                      {g.items.map((it) => {
                        const i = media.indexOf(it)
                        const on = picked.has(it.id)
                        return (
                          <button key={it.id} type="button" onClick={() => open_(it, i)} title={it.name || dayOf(it.date)} className={`group relative aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900 ${picked.has(it.id) ? 'ring-2 ring-indigo-500 ring-inset' : ''} ${selecting && !it.deletable ? 'cursor-not-allowed' : ''}`}>
                            {it.kind === 'video'
                              ? <video src={`${it.url}#t=0.1`} preload="metadata" muted className="size-full object-cover" />
                              : <img src={it.url} alt="" loading="lazy" className={`size-full object-cover transition duration-300 ${on ? 'scale-[0.9] rounded-xl' : 'group-hover:scale-[1.03]'}`} />}
                            {it.kind === 'video' && (
                              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-medium text-white"><LuPlay className="size-2.5" /> {it.duration ? clock(it.duration) : 'Video'}</span>
                            )}
                            {it.from === 'Nexa' && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Nexa</span>}
                            {selecting && <Tick on={on} disabled={!it.deletable} className="absolute right-2 top-2" />}
                            {!selecting && <span className="absolute inset-0 bg-slate-950/0 transition group-hover:bg-slate-950/10" />}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {tab === 'docs' && (
                    <div className="mt-1 space-y-0.5">
                      {g.items.map((it) => (
                        <div key={it.id} role="button" tabIndex={0} onClick={() => (selecting ? togglePick(it) : downloadFile(it.url, it.name || 'document'))} className={listRow}>
                          {selecting && <Tick on={picked.has(it.id)} disabled={!it.deletable} />}
                          <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                            <LuFileText className="size-4" />
                            <span className="text-[8px] font-bold leading-none">{extOf(it.name)}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{it.name || 'Document'}</span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{[it.size ? formatBytes(it.size) : null, it.from, dayOf(it.date)].filter(Boolean).join(' · ')}</span>
                          </span>
                          {rowActions(it)}
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === 'links' && (
                    <div className="mt-1 space-y-0.5">
                      {g.items.map((it) => (
                        <div key={it.id} role="button" tabIndex={0} onClick={() => (selecting ? togglePick(it) : window.open(it.url, '_blank', 'noopener'))} className={listRow}>
                          {selecting && <Tick on={picked.has(it.id)} disabled={!it.deletable} />}
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">{it.host?.[0] || <LuLink className="size-4" />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{it.source ? it.title : it.host}</span>
                            <span className="block truncate text-xs text-indigo-600 dark:text-indigo-400">{it.url}</span>
                            {!it.source && it.title && it.title.trim() !== it.url && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{it.title}</span>}
                            <span className="block text-[11px] text-slate-400">{it.source ? 'Nexa web source' : it.from} · {dayOf(it.date)}</span>
                          </span>
                          {!selecting && <a href={it.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`${iconBtn} shrink-0`} title="Open link" aria-label="Open link"><LuExternalLink className="size-4" /></a>}
                          {rowActions(it)}
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === 'voice' && (
                    <div className="mt-1 space-y-0.5">
                      {g.items.map((it) => {
                        const live = track?.id === it.messageId
                        return (
                          <div key={it.id} role="button" tabIndex={0} onClick={() => selecting && togglePick(it)} className={listRow}>
                            {selecting && <Tick on={picked.has(it.id)} disabled={!it.deletable} />}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); if (selecting) return togglePick(it); if (live) toggle(); else play({ id: it.messageId, url: it.url, duration: it.duration || 0, messageId: it.messageId, title: it.from === 'You' ? 'You' : it.from || 'Voice message' }) }}
                              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500"
                              aria-label={live && playing ? 'Pause' : 'Play'}
                            >
                              {live && playing ? <LuPause className="size-4" /> : <LuPlay className="ml-0.5 size-4" />}
                            </button>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{it.name && it.name !== 'voice.webm' ? it.name : 'Voice message'}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{[it.duration ? clock(it.duration) : null, it.from, dayOf(it.date)].filter(Boolean).join(' · ')}</span>
                            </span>
                            {rowActions(it)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </motion.div>

          {/* Clicks inside the viewer must not reach the backdrop (which closes the manager) */}
          <div onClick={(e) => e.stopPropagation()}>
          <AnimatePresence>
            {viewer >= 0 && media[viewer] && (
              <Viewer key="viewer" items={media} index={viewer} onIndex={setViewer} onClose={() => setViewer(-1)} onJump={onJump ? jump : null} onDelete={(list) => setConfirm(list)} />
            )}
          </AnimatePresence>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            {choice ? (
              <DeleteChoiceDialog
                open={!!confirm}
                onClose={() => !busy && setConfirm(null)}
                onDelete={runDelete}
                count={confirm?.length || 1}
                what={confirmText?.title.replace(/^Delete \d+ /, '').replace(/\?$/, '')}
                canEveryone={!!confirm?.every((i) => i.mine)}
                layer="z-[90]"
              />
            ) : (
            <ConfirmDialog
              open={!!confirm}
              onClose={() => !busy && setConfirm(null)}
              onConfirm={runDelete}
              title={confirmText?.title}
              description={confirmText?.description}
              layer="z-[90]"
            />
            )}
          </div>
          {busy && <span className="sr-only"><LuLoaderCircle /> Deleting</span>}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default MediaManager
