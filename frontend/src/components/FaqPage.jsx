import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  LuArrowUpRight, LuBot, LuBriefcase, LuChevronDown, LuCircleDashed, LuCompass, LuImage, LuLightbulb,
  LuMessageSquareText, LuMoon, LuPhone, LuRocket, LuSearch, LuShieldCheck, LuSun, LuUser, LuUsers, LuX,
} from 'react-icons/lu'
import { FaGithub } from 'react-icons/fa6'
import { FAQ } from '../data/faq'
import { useAuth } from '../context/AuthProvider'
import { useTheme } from '../context/ThemeProvider'
import { Button, Logo } from './ui'
import usePageTitle from '../hooks/usePageTitle'
import useThemeClass from '../hooks/useThemeClass'

const ICONS = {
  rocket: LuRocket,
  message: LuMessageSquareText,
  image: LuImage,
  bot: NexaIcon,
  sparkles: LuBot,
  users: LuUsers,
  phone: LuPhone,
  circle: LuCircleDashed,
  shield: LuShieldCheck,
  briefcase: LuBriefcase,
  user: LuUser,
}
// Nexa's swirl avatar, used like an icon
function NexaIcon({ className = '' }) {
  return <img src="/images/nexa-avatar.jpg" alt="" className={`${className} rounded-full object-cover`} />
}

const GITHUB_REPO = 'https://github.com/Arjun-SN04/NexChat'

// Answer text: "## " lines are small headings, "1. " lines numbered steps,
// "• " lines bullets, anything else a paragraph. Matches are highlighted.
const Highlight = ({ text, query }) => {
  if (!query) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-indigo-100 px-0.5 text-inherit dark:bg-indigo-500/30">{p}</mark> : p))
}

const STEP = /^(\d+)\.\s+/

const Answer = ({ text, query }) => {
  const out = []
  let list = null // { kind: 'ol' | 'ul', items: [] }
  const flush = () => {
    if (!list) return
    const k = `l${out.length}`
    out.push(list.kind === 'ol'
      ? <ol key={k} className="mt-3 space-y-2.5">{list.items}</ol>
      : <ul key={k} className="mt-3 space-y-2">{list.items}</ul>)
    list = null
  }
  const add = (kind, item) => {
    if (list?.kind !== kind) { flush(); list = { kind, items: [] } }
    list.items.push(item)
  }

  text.split('\n').forEach((line, i) => {
    const step = line.match(STEP)
    if (step) {
      add('ol',
        <li key={i} className="flex items-start gap-3">
          <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold tabular-nums text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25">{step[1]}</span>
          <span className="min-w-0 flex-1 pt-0.5 leading-relaxed"><Highlight text={line.slice(step[0].length)} query={query} /></span>
        </li>)
    } else if (line.startsWith('• ')) {
      add('ul',
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-indigo-400" />
          <span className="min-w-0 flex-1 leading-relaxed"><Highlight text={line.slice(2)} query={query} /></span>
        </li>)
    } else if (line.startsWith('## ')) {
      flush()
      out.push(<h4 key={i} className={`${out.length ? 'mt-5' : ''} text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400`}><Highlight text={line.slice(3)} query={query} /></h4>)
    } else if (line.trim()) {
      flush()
      out.push(<p key={i} className={out.length ? 'mt-3 leading-relaxed' : 'leading-relaxed'}><Highlight text={line} query={query} /></p>)
    }
  })
  flush()
  return <div className="text-[14.5px] leading-relaxed text-slate-600 dark:text-zinc-300">{out}</div>
}

// "See an example" button: a short real-life walkthrough under the answer
const Example = ({ text, query }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="mt-5">
      <button
        onClick={() => setShow((v) => !v)}
        aria-expanded={show}
        className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition ${
          show
            ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/25'
            : 'bg-slate-100 text-slate-700 hover:bg-amber-50 hover:text-amber-800 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-amber-400/10 dark:hover:text-amber-200'
        }`}
      >
        <LuLightbulb className="size-4" />
        {show ? 'Hide example' : 'See an example'}
        <LuChevronDown className={`size-3.5 transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 sm:p-5 dark:border-amber-400/15 dark:bg-amber-400/[0.04]">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                <LuLightbulb className="size-3.5" /> Example
              </p>
              <Answer text={text} query={query} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// One question: click to open
const Item = ({ id, q, a, example, open, onToggle, query }) => (
  <div
    id={id}
    className={`group scroll-mt-28 rounded-2xl border transition-all duration-200 ${
      open
        ? 'border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-500/10 dark:border-indigo-500/30 dark:bg-zinc-900/90 dark:ring-indigo-500/10'
        : 'border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-white dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.04]'
    }`}
  >
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors"
    >
      <span
        className={`min-w-0 flex-1 text-[15px] sm:text-base transition-colors ${
          open
            ? 'font-semibold text-indigo-600 dark:text-indigo-400'
            : 'font-medium text-slate-800 dark:text-zinc-100 group-hover:text-slate-900 dark:group-hover:text-white'
        }`}
      >
        <Highlight text={q} query={query} />
      </span>
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
          open
            ? 'rotate-180 bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
            : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200/80 group-hover:text-slate-600 dark:bg-white/5 dark:text-zinc-400 dark:group-hover:bg-white/10 dark:group-hover:text-zinc-200'
        }`}
      >
        <LuChevronDown className="size-4" />
      </span>
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="border-t border-slate-100 px-5 pb-5 pt-3.5 dark:border-white/5">
            <Answer text={a} query={query} />
            {example && <Example text={example} query={query} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
)

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// /faq: every feature explained, with search and topics
const FaqPage = () => {
  useThemeClass()
  usePageTitle('FAQ')
  const { dark, toggle } = useTheme()
  const [AuthUser] = useAuth()
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState('all')
  const [open, setOpen] = useState(() => new Set(window.location.hash ? [window.location.hash.slice(1)] : []))
  const q = query.trim()

  // Opened with #question: scroll to it
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [])

  const topics = useMemo(() => FAQ.map((t) => ({
    ...t,
    items: t.items
      .map((it) => ({ ...it, id: `${t.id}--${slug(it.q)}` }))
      .filter((it) => !q || `${it.q} ${it.a} ${it.example || ''}`.toLowerCase().includes(q.toLowerCase())),
  })).filter((t) => (topic === 'all' || q ? true : t.id === topic) && t.items.length), [q, topic])
  const total = topics.reduce((n, t) => n + t.items.length, 0)
  const allCount = useMemo(() => FAQ.reduce((sum, t) => sum + t.items.length, 0), [])

  const toggleItem = (id) => setOpen((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else { n.add(id); window.history.replaceState(null, '', `#${id}`) }
    return n
  })

  return (
    <div className="min-h-dvh bg-white text-slate-900 dark:bg-zinc-950 dark:text-white">
      {/* Top bar (same as the landing page) */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-white/8 dark:bg-zinc-950/85">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <div className="hidden items-center gap-1 text-sm text-slate-600 dark:text-zinc-300 md:flex">
            <Link to="/home#features" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">Features</Link>
            <Link to="/home#how-it-works" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">How it works</Link>
            <Link to="/faq" aria-current="page" className="rounded-full bg-slate-100 px-4 py-2 text-slate-900 dark:bg-white/10 dark:text-white">FAQ</Link>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <button onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="flex size-9 sm:size-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white">
              {dark ? <LuSun className="size-4.5" /> : <LuMoon className="size-4.5" />}
            </button>
            {AuthUser
              ? <Button to="/" size="sm" rightIcon={LuArrowUpRight} className="h-9 sm:h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm">Open app</Button>
              : <Button to="/signup" variant="dark" size="sm" className="h-9 sm:h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm">Get started</Button>}
          </div>
        </nav>
      </header>

      {/* Hero + search */}
      <section className="relative overflow-hidden border-b border-slate-200/70 dark:border-white/8">
        <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-3xl rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-5 pb-12 pt-16 text-center sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Help centre</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Frequently asked questions</h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-500 dark:text-zinc-400">
            Everything Kova can do, explained: messaging, Nexa AI, groups, channels, calls, privacy, business tools and your account.
          </p>
          <div className="relative mx-auto mt-8 max-w-xl">
            <LuSearch className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions, e.g. “locked chat” or “live location”"
              aria-label="Search the FAQ"
              className="h-13 w-full rounded-2xl border border-slate-200/90 bg-white pl-12 pr-11 text-[15px] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-zinc-900/90 dark:focus:border-indigo-500/60"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <LuX className="size-4" />
              </button>
            )}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-zinc-500">
            <span>{allCount} answers</span>
            <span>·</span>
            <span>{FAQ.length} categories</span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1260px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:grid lg:grid-cols-[280px_1fr] xl:grid-cols-[290px_1fr] lg:gap-12 xl:gap-16">
        {/* Topics: chips on mobile, a sleek vertical list on desktop */}
        <aside className="mb-8 lg:mb-0">
          {/* Desktop vertical sidebar */}
          <div className="hidden lg:block lg:sticky lg:top-24 space-y-1">
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
              Categories
            </p>
            <button
              onClick={() => { setQuery(''); setTopic('all'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                topic === 'all' && !q
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 font-semibold shadow-xs ring-1 ring-indigo-200/60 dark:ring-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`flex size-7.5 items-center justify-center rounded-lg transition-colors ${
                  topic === 'all' && !q
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80 group-hover:text-slate-700 dark:bg-white/5 dark:text-zinc-400 dark:group-hover:bg-white/10 dark:group-hover:text-white'
                }`}>
                  <LuCompass className="size-4" />
                </span>
                <span>All topics</span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                topic === 'all' && !q
                  ? 'bg-indigo-100/90 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                  : 'text-slate-400 group-hover:text-slate-600 dark:text-zinc-500 dark:group-hover:text-zinc-300'
              }`}>
                {allCount}
              </span>
            </button>

            <div className="my-3 border-t border-slate-100 dark:border-white/5" />

            <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
              Topics
            </p>

            <div className="space-y-1">
              {FAQ.map((t) => {
                const Icon = ICONS[t.icon] || LuBot
                const isActive = topic === t.id && !q
                return (
                  <button
                    key={t.id}
                    onClick={() => { setQuery(''); setTopic(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 font-semibold shadow-xs ring-1 ring-indigo-200/60 dark:ring-indigo-500/20'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`flex size-7.5 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80 group-hover:text-slate-700 dark:bg-white/5 dark:text-zinc-400 dark:group-hover:bg-white/10 dark:group-hover:text-white'
                      }`}>
                        <Icon className="size-4" />
                      </span>
                      <span className="truncate text-left">{t.title}</span>
                    </div>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-indigo-100/90 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                        : 'text-slate-400 group-hover:text-slate-600 dark:text-zinc-500 dark:group-hover:text-zinc-300'
                    }`}>
                      {t.items.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mobile horizontal scroll rail */}
          <div className="lg:hidden -mx-4 px-4 overflow-x-auto [scrollbar-width:none] flex gap-2 pb-2">
            <button
              onClick={() => setTopic('all')}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                topic === 'all' && !q
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-zinc-300'
              }`}
            >
              All topics ({allCount})
            </button>
            {FAQ.map((t) => {
              const Icon = ICONS[t.icon] || LuBot
              const isActive = topic === t.id && !q
              return (
                <button
                  key={t.id}
                  onClick={() => { setQuery(''); setTopic(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-zinc-300'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{t.title}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="min-w-0">
          {q && (
            <p className="mb-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200/60 dark:bg-white/[0.03] dark:text-zinc-300 dark:ring-white/10">
              {total
                ? `${total} answer${total === 1 ? '' : 's'} found for “${q}”`
                : `No answers for “${q}”. Try searching for other terms like “call”, “photo”, “lock” or “privacy”.`}
            </p>
          )}

          <div className="space-y-14 sm:space-y-16">
            {topics.map((t) => {
              const Icon = ICONS[t.icon] || LuBot
              return (
                <section key={t.id} id={t.id} className="scroll-mt-24">
                  <div className="mb-4 flex items-start sm:items-center gap-3.5">
                    {Icon === NexaIcon ? (
                      <NexaIcon className="size-11 shrink-0 shadow-md shadow-violet-500/20" />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20 shadow-xs">
                        <Icon className="size-5.5" />
                      </span>
                    )}
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.title}</h2>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-white/5 dark:text-zinc-400">
                          {t.items.length}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-zinc-400">{t.intro}</p>
                    </div>
                  </div>
                  <div className="space-y-2.5 sm:space-y-3">
                    {t.items.map((it) => (
                      <Item
                        key={it.id}
                        id={it.id}
                        q={it.q}
                        a={it.a}
                        example={it.example}
                        query={q}
                        open={open.has(it.id) || (!!q && t.items.length <= 3)}
                        onToggle={() => toggleItem(it.id)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          {/* Still have questions */}
          <div className="mt-16 sm:mt-20 flex flex-col items-start gap-6 rounded-3xl border border-slate-200/80 bg-linear-to-br from-indigo-50/50 via-slate-50 to-purple-50/30 p-6 sm:p-8 sm:flex-row sm:items-center dark:border-white/10 dark:bg-linear-to-br dark:from-white/[0.04] dark:via-white/[0.02] dark:to-indigo-950/20 shadow-xs">
            <img src="/images/nexa-avatar.jpg" alt="Nexa" className="size-14 shrink-0 rounded-full object-cover shadow-lg shadow-violet-500/25 ring-2 ring-white/10" />
            <div className="min-w-0 flex-1">
              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Still have questions?</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                Ask Nexa inside Kova (“how do I lock a chat?”), or report an issue on GitHub.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button to={AuthUser ? '/' : '/signup'} size="sm" className="h-10 rounded-xl px-4 text-sm font-medium shadow-xs">
                {AuthUser ? 'Ask Nexa' : 'Get started'}
              </Button>
              <a
                href={`${GITHUB_REPO}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10 shadow-xs"
              >
                <FaGithub className="size-4" /> Report an issue
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200/70 py-8 text-center text-sm text-slate-500 dark:border-white/8 dark:text-zinc-400">
        © {new Date().getFullYear()} Kova · <Link to="/home" className="hover:text-slate-900 dark:hover:text-white">Home</Link>
      </footer>
    </div>
  )
}

export default FaqPage
