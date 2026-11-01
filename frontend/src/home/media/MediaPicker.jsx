import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { motion } from 'motion/react'
import { LuBookmark, LuBookmarkCheck, LuChevronLeft, LuChevronRight, LuLoaderCircle, LuPlus, LuSearch, LuX } from 'react-icons/lu'
import { FullEmojiPicker } from '../rightPart/EmojiPopover'
import useStickers from '../../Zustand/useStickers'

const WIDTH = 360
const HEIGHT = 420
const TABS = [
  { id: 'emoji', label: 'Emoji' },
  { id: 'gif', label: 'GIFs' },
  { id: 'sticker', label: 'Stickers' },
]
const PROVIDERS = { klipy: 'KLIPY', giphy: 'GIPHY' }

// Google's free animated Noto emoji (CC BY 4.0), used as stickers
const NOTO = 'https://fonts.gstatic.com/s/e/notoemoji/latest'
const stickerUrl = (cp) => `${NOTO}/${cp}/512.webp`
const stickerStill = (cp) => `${NOTO}/${cp}/emoji.svg`
const toChar = (cp) => String.fromCodePoint(...cp.split('_').map((h) => parseInt(h, 16)))
const SHORT_CATS = { 'Smileys and emotions': 'Smileys', 'Animals and nature': 'Animals', 'Food and drink': 'Food', 'Travel and places': 'Travel', 'Activities and events': 'Activities' }
const MINE = -1 // the "Yours" chip
const TRENDING = -2 // online trending stickers

// Waits until typing stops
const useDebounced = (value, ms) => {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const fetchPage = (type, search, offset) =>
  axios.get('/api/gifs/search', { params: { type, q: search, offset }, withCredentials: true })
    .then((res) => ({ items: res.data.items, next: res.data.next, provider: res.data.provider, error: '' }))
    .catch((err) => ({
      items: [], next: null, provider: null,
      code: err.response?.data?.code,
      error: err.response?.data?.code === 'not_configured' ? 'GIFs aren’t switched on for this app yet.' : err.response?.data?.error || 'Couldn’t load GIFs.',
    }))

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

const SectionTitle = ({ children }) => (
  <p className="px-1 pt-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{children}</p>
)

// Small corner button on a GIF / sticker: save it, or remove it from your saved ones
const CornerButton = ({ onClick, label, children }) => (
  <span
    role="button"
    tabIndex={0}
    onClick={(e) => { e.stopPropagation(); onClick() }}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClick() } }}
    aria-label={label}
    title={label}
    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-slate-950/60 text-white opacity-0 shadow-sm backdrop-blur-sm transition group-hover/item:opacity-100 hover:bg-slate-950/80 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
  >
    {children}
  </span>
)

const SaveCorner = ({ media }) => {
  const saved = useStickers((s) => s.list?.find((x) => x.url === media.url))
  const save = useStickers((s) => s.save)
  const remove = useStickers((s) => s.remove)
  return saved
    ? <CornerButton onClick={() => remove(saved._id)} label="Remove from saved"><LuBookmarkCheck className="size-3.5" /></CornerButton>
    : <CornerButton onClick={() => save({ media })} label="Save"><LuBookmark className="size-3.5" /></CornerButton>
}

// Online stickers: a grid of see-through images (no tiles behind them)
const StickerGrid = ({ items, onPick }) => (
  <div className="grid grid-cols-4 gap-1.5">
    {items.map((g) => {
      const media = { kind: 'sticker', url: g.url, title: g.title, width: g.width, height: g.height }
      return (
        <button
          key={g.id || g._id}
          type="button"
          onClick={() => onPick(media)}
          title={g.title || 'Sticker'}
          className="group/item relative flex aspect-square items-center justify-center rounded-xl p-1 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-slate-800"
        >
          <img src={g.preview || g.url} alt={g.title || 'Sticker'} loading="lazy" className="size-full object-contain" />
          <SaveCorner media={media} />
        </button>
      )
    })}
  </div>
)

// Two columns, each item added to the shorter one
const Masonry = ({ items, onPick, kind }) => {
  const columns = useMemo(() => {
    const cols = [[], []]
    const h = [0, 0]
    for (const g of items) {
      const k = h[0] <= h[1] ? 0 : 1
      cols[k].push(g)
      h[k] += (g.height || 1) / (g.width || 1)
    }
    return cols
  }, [items])
  return (
    <div className="flex gap-1.5">
      {columns.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-1.5">
          {col.map((g) => {
            const media = { kind, url: g.url, title: g.title, width: g.width, height: g.height }
            return (
              <button
                key={g.id || g._id}
                type="button"
                onClick={() => onPick(media)}
                title={g.title || 'GIF'}
                className="group/item relative block overflow-hidden rounded-lg bg-slate-100 ring-indigo-500 transition hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none dark:bg-slate-800"
                style={{ aspectRatio: `${g.width || 1} / ${g.height || 1}` }}
              >
                <img src={g.preview || g.url} alt={g.title || 'GIF'} loading="lazy" className="size-full object-cover" />
                <SaveCorner media={media} />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Category chips in one row: the mouse wheel scrolls it sideways, with arrows when it overflows
const ChipRow = ({ chips, active, onPick }) => {
  const ref = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const update = () => {
    const el = ref.current
    if (el) setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [chips.length])
  // Keep the chosen chip in view
  useEffect(() => {
    ref.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [active])
  const nudge = (dir) => ref.current?.scrollBy({ left: dir * 160, behavior: 'smooth' })
  const arrow = 'absolute top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200 transition hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:text-white'
  return (
    <div className="relative px-3 pt-2 pb-1">
      {edges.left && <button type="button" onClick={() => nudge(-1)} aria-label="Scroll left" className={`${arrow} left-1.5`}><LuChevronLeft className="size-4" /></button>}
      <div ref={ref} onScroll={update} className="flex gap-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === active}
            onClick={() => onPick(k)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${k === active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {edges.right && <button type="button" onClick={() => nudge(1)} aria-label="Scroll right" className={`${arrow} right-1.5`}><LuChevronRight className="size-4" /></button>}
    </div>
  )
}

// ── GIFs (KLIPY or GIPHY, through our server) ──
const GifTab = ({ onPick }) => {
  const [q, setQ] = useState('')
  const query = useDebounced(q.trim(), 350)
  const [state, setState] = useState({ items: [], next: null, error: '', query: null, provider: null })
  const [loadingMore, setLoadingMore] = useState(false)
  const boxRef = useRef(null)
  const saved = useStickers((s) => s.list)
  const savedGifs = useMemo(() => (saved || []).filter((s) => s.kind === 'gif'), [saved])

  // New search: first page
  useEffect(() => {
    let alive = true
    fetchPage('gifs', query, 0).then((page) => {
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
    fetchPage('gifs', query, state.next).then((page) => {
      setState((s) => (s.query === query ? { ...s, items: [...s.items, ...page.items], next: page.next } : s))
      setLoadingMore(false)
    })
  }

  const showSaved = !query && savedGifs.length > 0

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search GIFs" />
      <div ref={boxRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 pt-1">
        {showSaved && (
          <>
            <SectionTitle>Saved</SectionTitle>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {savedGifs.map((g) => (
                <button
                  key={g._id}
                  type="button"
                  onClick={() => onPick({ kind: 'gif', url: g.url, title: g.title, width: g.width, height: g.height })}
                  className="group/item relative h-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800"
                  style={{ aspectRatio: `${g.width || 1} / ${g.height || 1}` }}
                  title={g.title || 'GIF'}
                >
                  <img src={g.url} alt={g.title || 'GIF'} loading="lazy" className="size-full object-cover" />
                  <SaveCorner media={{ kind: 'gif', url: g.url }} />
                </button>
              ))}
            </div>
          </>
        )}
        {state.error ? (
          <p className="px-4 pt-16 text-center text-sm text-slate-500 dark:text-slate-400">{state.error}</p>
        ) : (
          <>
            {showSaved && <SectionTitle>Trending</SectionTitle>}
            <div className={showSaved ? '' : 'pt-2'}><Masonry items={state.items} onPick={onPick} kind="gif" /></div>
          </>
        )}
        {loading && <div className="flex justify-center py-4"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>}
        {!loading && !state.error && !state.items.length && <p className="pt-16 text-center text-sm text-slate-500">No GIFs found</p>}
      </div>
      {state.provider && <p className="py-1.5 text-center text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Powered by {PROVIDERS[state.provider]}</p>}
    </>
  )
}

// ── Stickers: yours (saved + made), animated Noto emoji, and online stickers when searching ──
const StickerTab = ({ onPick }) => {
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const query = useDebounced(q.trim(), 400)
  const [cat, setCat] = useState(TRENDING)
  const [hover, setHover] = useState(null)
  const [online, setOnline] = useState({ items: [], query: null })
  const [trend, setTrend] = useState({ items: [], next: 0, loading: false, error: '', started: false })
  const saved = useStickers((s) => s.list)
  const remove = useStickers((s) => s.remove)
  const openMaker = useStickers((s) => s.openMaker)
  const mine = useMemo(() => (saved || []).filter((s) => s.kind === 'sticker'), [saved])

  useEffect(() => {
    let alive = true
    import('../../data/notoStickers.json').then((m) => alive && setData(m.default))
    return () => { alive = false }
  }, [])

  // Online stickers for a search (only when GIFs are switched on)
  useEffect(() => {
    if (!query) return
    let alive = true
    fetchPage('stickers', query, 0).then((page) => alive && setOnline({ items: page.items, query }))
    return () => { alive = false }
  }, [query])

  // Trending stickers from the GIF provider, loaded page by page
  const loadTrending = () => {
    if (trend.loading || trend.next == null) return
    setTrend((t) => ({ ...t, loading: true, started: true }))
    fetchPage('stickers', '', trend.next).then((page) => setTrend((t) => ({
      items: [...t.items, ...page.items.filter((it) => !t.items.some((x) => x.id === it.id))],
      next: page.error ? null : page.next,
      loading: false,
      started: true,
      error: page.code === 'not_configured' ? 'Trending stickers need GIFs switched on.' : page.error,
    })))
  }
  useEffect(() => { if (cat === TRENDING && !trend.started) loadTrending() }) // eslint-disable-line react-hooks/exhaustive-deps
  const onListScroll = (e) => {
    const el = e.currentTarget
    if (cat === TRENDING && !q.trim() && el.scrollTop + el.clientHeight > el.scrollHeight - 250) loadTrending()
  }

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const items = useMemo(() => {
    if (!data) return []
    if (words.length) return data.items.filter(([, , tags]) => words.every((w) => tags.includes(w))).slice(0, 60)
    return cat < 0 ? [] : data.items.filter(([, k]) => k === cat)
  }, [data, cat, words.join(' ')]) // eslint-disable-line react-hooks/exhaustive-deps
  const mineFound = searching ? mine.filter((s) => words.every((w) => (s.title || '').toLowerCase().includes(w))) : mine
  const onlineItems = searching && online.query === query ? online.items : []

  const pickSaved = (s) => onPick({ kind: 'sticker', url: s.url, title: s.title || 'Sticker', width: s.width || 512, height: s.height || 512 })

  const savedGrid = (list, withCreate) => (
    <div className="grid grid-cols-4 gap-1.5">
      {withCreate && (
        <button
          type="button"
          onClick={() => openMaker()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
        >
          <LuPlus className="size-5" />
          <span className="text-[11px] font-semibold">Create</span>
        </button>
      )}
      {list.map((s) => (
        <button
          key={s._id}
          type="button"
          onClick={() => pickSaved(s)}
          title={s.title || 'Sticker'}
          className="group/item relative flex aspect-square items-center justify-center rounded-xl p-1 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-slate-800"
        >
          <img src={s.url} alt={s.title || 'Sticker'} loading="lazy" className="size-full object-contain" />
          <CornerButton onClick={() => remove(s._id)} label={s.mine ? 'Delete sticker' : 'Remove from saved'}><LuX className="size-3.5" /></CornerButton>
        </button>
      ))}
    </div>
  )

  const notoGrid = (
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
  )

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search stickers" />
      {!searching && data && (
        <ChipRow
          active={cat}
          onPick={setCat}
          chips={[{ k: MINE, label: 'Yours' }, { k: TRENDING, label: 'Trending' }, ...data.categories.map((c, k) => ({ k, label: SHORT_CATS[c] || c }))]}
        />
      )}
      <div onScroll={onListScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-2">
        {!data ? (
          <div className="flex justify-center pt-16"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
        ) : searching ? (
          <>
            {mineFound.length > 0 && <><SectionTitle>Yours</SectionTitle>{savedGrid(mineFound, false)}</>}
            {items.length > 0 && <><SectionTitle>Animated</SectionTitle>{notoGrid}</>}
            {onlineItems.length > 0 && <><SectionTitle>More stickers</SectionTitle><StickerGrid items={onlineItems} onPick={onPick} /></>}
            {!mineFound.length && !items.length && !onlineItems.length && (
              online.query === query ? <p className="pt-16 text-center text-sm text-slate-500">No stickers found</p>
                : <div className="flex justify-center pt-16"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
            )}
          </>
        ) : cat === MINE ? (
          <div className="px-1">
            {savedGrid(mine, true)}
            {saved && !mine.length && (
              <p className="px-4 pt-6 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Make a sticker from any photo with <b>Create</b>, or save stickers people send you from the message’s ⋯ menu.
              </p>
            )}
          </div>
        ) : cat === TRENDING ? (
          <div className="px-1 pt-1">
            {trend.error && !trend.items.length
              ? <p className="px-4 pt-16 text-center text-sm text-slate-500 dark:text-slate-400">{trend.error}</p>
              : <StickerGrid items={trend.items} onPick={onPick} />}
            {trend.loading && <div className="flex justify-center py-4"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>}
          </div>
        ) : notoGrid}
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
  const makerOpen = useStickers((s) => !!s.maker)

  useEffect(() => { useStickers.getState().load() }, [])

  useEffect(() => {
    const onDown = (e) => {
      // Clicks inside the sticker maker (a separate layer) don't close the picker
      if (ref.current?.contains(e.target) || toggleRef?.current?.contains(e.target) || useStickers.getState().maker) return
      onClose()
    }
    const onKey = (e) => e.key === 'Escape' && !useStickers.getState().maker && onClose()
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
      className={`absolute bottom-full z-30 mb-2 flex origin-bottom-left flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${makerOpen ? 'invisible' : ''} ${className}`}
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
