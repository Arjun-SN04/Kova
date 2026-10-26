import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { motion } from 'motion/react'
import { LuLoaderCircle, LuSearch, LuX } from 'react-icons/lu'
import { FullEmojiPicker } from '../rightPart/EmojiPopover'

const WIDTH = 360
const HEIGHT = 420
const TABS = [
  { id: 'emoji', label: 'Emoji' },
  { id: 'gif', label: 'GIFs' },
  { id: 'sticker', label: 'Stickers' },
]

// Google's free animated Noto emoji (CC BY 4.0), used as stickers
const NOTO = 'https://fonts.gstatic.com/s/e/notoemoji/latest'
const stickerUrl = (cp) => `${NOTO}/${cp}/512.webp`
const stickerStill = (cp) => `${NOTO}/${cp}/emoji.svg`
const toChar = (cp) => String.fromCodePoint(...cp.split('_').map((h) => parseInt(h, 16)))
const SHORT_CATS = { 'Smileys and emotions': 'Smileys', 'Animals and nature': 'Animals', 'Food and drink': 'Food', 'Travel and places': 'Travel', 'Activities and events': 'Activities' }

// Waits until typing stops
const useDebounced = (value, ms) => {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const SearchBox = ({ value, onChange, placeholder }) => (
  <label className="mx-3 mt-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
    <LuSearch className="size-4 shrink-0 text-slate-400" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={window.matchMedia('(pointer: fine)').matches}
      className="min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><LuX className="size-4" /></button>
    )}
  </label>
)

// ── GIFs (GIPHY, through our server) ──
const GifTab = ({ onPick }) => {
  const [q, setQ] = useState('')
  const query = useDebounced(q.trim(), 350)
  const [state, setState] = useState({ items: [], next: null, error: '', query: null })
  const [loadingMore, setLoadingMore] = useState(false)
  const boxRef = useRef(null)

  const fetchPage = (search, offset) =>
    axios.get('/api/gifs/search', { params: { q: search, offset }, withCredentials: true })
      .then((res) => ({ items: res.data.items, next: res.data.next, error: '' }))
      .catch((err) => ({
        items: [], next: null,
        error: err.response?.data?.code === 'not_configured' ? 'GIFs aren’t switched on for this app yet.' : err.response?.data?.error || 'Couldn’t load GIFs.',
      }))

  // New search: first page
  useEffect(() => {
    let alive = true
    fetchPage(query, 0).then((page) => {
      if (!alive) return
      setState({ ...page, query })
      boxRef.current?.scrollTo({ top: 0 })
    })
    return () => { alive = false }
  }, [query])
  const loading = state.query !== query || loadingMore

  // Load more near the bottom
  const onScroll = (e) => {
    const el = e.currentTarget
    if (loading || state.next == null || el.scrollTop + el.clientHeight < el.scrollHeight - 200) return
    setLoadingMore(true)
    fetchPage(query, state.next).then((page) => {
      setState((s) => (s.query === query ? { ...s, items: [...s.items, ...page.items], next: page.next } : s))
      setLoadingMore(false)
    })
  }

  // Two columns, each GIF added to the shorter one
  const columns = useMemo(() => {
    const cols = [[], []]
    const h = [0, 0]
    for (const g of state.items) {
      const k = h[0] <= h[1] ? 0 : 1
      cols[k].push(g)
      h[k] += g.height / g.width
    }
    return cols
  }, [state.items])

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search GIFs" />
      <div ref={boxRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 pt-3">
        {state.error ? (
          <p className="px-4 pt-16 text-center text-sm text-slate-500 dark:text-slate-400">{state.error}</p>
        ) : (
          <div className="flex gap-1.5">
            {columns.map((col, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-1.5">
                {col.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onPick({ kind: 'gif', url: g.url, title: g.title, width: g.width, height: g.height })}
                    title={g.title || 'GIF'}
                    className="block overflow-hidden rounded-lg bg-slate-100 ring-indigo-500 transition hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none dark:bg-slate-800"
                    style={{ aspectRatio: `${g.width} / ${g.height}` }}
                  >
                    <img src={g.preview} alt={g.title || 'GIF'} loading="lazy" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        {loading && <div className="flex justify-center py-4"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>}
        {!loading && !state.error && !state.items.length && <p className="pt-16 text-center text-sm text-slate-500">No GIFs found</p>}
      </div>
      <p className="py-1.5 text-center text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Powered by GIPHY</p>
    </>
  )
}

// ── Stickers (animated Noto emoji, no key needed) ──
const StickerTab = ({ onPick }) => {
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(0)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    let alive = true
    import('../../data/notoStickers.json').then((m) => alive && setData(m.default))
    return () => { alive = false }
  }, [])

  const items = useMemo(() => {
    if (!data) return []
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length) return data.items.filter(([, , tags]) => words.every((w) => tags.includes(w))).slice(0, 120)
    return data.items.filter(([, k]) => k === cat)
  }, [data, q, cat])

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search stickers" />
      {!q.trim() && data && (
        <div className="flex gap-1 overflow-x-auto px-3 pt-2 pb-1 [scrollbar-width:none]">
          {data.categories.map((c, k) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(k)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${k === cat ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {SHORT_CATS[c] || c}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2">
        {!data ? (
          <div className="flex justify-center pt-16"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
        ) : items.length ? (
          <div className="grid grid-cols-5 gap-1">
            {items.map(([cp, , tags]) => {
              const name = tags.split(' ')[0]?.replace(/-/g, ' ') || 'sticker'
              return (
                <button
                  key={cp}
                  type="button"
                  onMouseEnter={() => setHover(cp)}
                  onMouseLeave={() => setHover((h) => (h === cp ? null : h))}
                  onClick={() => onPick({ kind: 'sticker', url: stickerUrl(cp), title: `${toChar(cp)} ${name}`, width: 512, height: 512 })}
                  title={name}
                  className="flex aspect-square items-center justify-center rounded-xl p-1.5 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-slate-800"
                >
                  {/* Still picture in the grid; it plays when you point at it */}
                  <img src={hover === cp ? stickerUrl(cp) : stickerStill(cp)} alt={name} loading="lazy" className="size-full object-contain" />
                </button>
              )
            })}
          </div>
        ) : (
          <p className="pt-16 text-center text-sm text-slate-500">No stickers found</p>
        )}
      </div>
    </>
  )
}

// Emoji, GIF and sticker picker above a message box.
// Emoji go into the text (picker stays open); a GIF or sticker is sent right away.
// `toggleRef` is the button that opens it, so clicking it again doesn't reopen.
const MediaPicker = ({ onEmoji, onMedia, onClose, toggleRef, className = 'left-0', initialTab = 'emoji' }) => {
  const ref = useRef(null)
  const [tab, setTab] = useState(initialTab)
  const width = Math.min(WIDTH, window.innerWidth - 32)

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || toggleRef?.current?.contains(e.target)) return
      onClose()
    }
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, toggleRef])

  const pickMedia = (m) => { onMedia(m); onClose() }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={`absolute bottom-full z-30 mb-2 flex origin-bottom-left flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`}
      style={{ width, height: HEIGHT }}
    >
      <div role="tablist" className="flex shrink-0 gap-1 border-b border-slate-200 p-1.5 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${tab === t.id ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'emoji' && <FullEmojiPicker onPick={onEmoji} width={width} height={HEIGHT - 46} />}
        {tab === 'gif' && <GifTab onPick={pickMedia} />}
        {tab === 'sticker' && <StickerTab onPick={pickMedia} />}
      </div>
    </motion.div>
  )
}

export default MediaPicker
