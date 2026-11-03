import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import {
  LuArrowRight, LuArrowUpRight, LuBriefcase, LuCheck, LuCheckCheck, LuFileText, LuFingerprint,
  LuForward, LuGraduationCap, LuHeart, LuPencil, LuPlay, LuSearch, LuSmile,
  LuShieldCheck, LuQrCode, LuSparkles, LuLock, LuEyeOff, LuSun, LuMoon, LuTrash2, LuUserPlus, LuUsers, LuZap, LuMessagesSquare,
} from 'react-icons/lu'
import { QRCodeSVG } from 'qrcode.react'
import { FaGithub } from 'react-icons/fa6'
import { useAuth } from '../context/AuthProvider'
import { Button, Logo, Reveal } from './ui'
import usePageTitle from '../hooks/usePageTitle'
import useThemeClass from '../hooks/useThemeClass'
import { useTheme } from '../context/ThemeProvider'

const EASE = [0.22, 1, 0.36, 1]

/* ─── Small building blocks ───────────────────────────────── */
const avatar = (n) => `/images/avatars/${n}.jpg`

const Photo = ({ n, className = 'size-9', online = false, ring = 'ring-2 ring-white dark:ring-zinc-900' }) => (
  <div className="relative shrink-0">
    <img src={avatar(n)} alt="" loading="lazy" className={`${className} rounded-full object-cover ${ring}`} />
    {online && <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />}
  </div>
)

const AvatarStack = ({ ids, size = 'size-8' }) => (
  <div className="flex -space-x-2.5">
    {ids.map((n) => <Photo key={n} n={n} className={size} />)}
  </div>
)

// Image that drifts slightly slower than the page while scrolling.
const ParallaxImage = ({ src, alt, className = '', distance = 60 }) => {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [-distance, distance])
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      <motion.img src={src} alt={alt} loading="lazy" style={{ y, scale: 1.15 }} className={`size-full object-cover ${className}`} />
    </div>
  )
}

const Serif = ({ children, className = '' }) => (
  <span className={`font-display font-normal italic tracking-normal ${className}`}>{children}</span>
)

const Label = ({ children }) => (
  <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{children}</p>
)

/* ─── Hero photo ──────────────────────────────────────────── */
const HeroPhoto = () => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
    className="relative mx-auto mt-16 aspect-[4/3] max-w-[1180px] overflow-hidden rounded-3xl sm:mt-20 sm:aspect-[16/9] lg:aspect-[21/9]"
  >
    <ParallaxImage src="/images/hero.jpg" alt="Friends laughing together at a message on a phone" distance={24} className="object-[center_38%]" />
  </motion.div>
)

/* ─── Features: 2-column design with right-side pictorial image ─ */
const Waveform = ({ bars = 16 }) => (
  <span className="flex h-4 items-center gap-0.75">
    {Array.from({ length: bars }, (_, i) => (
      <span
        key={i}
        className="w-0.75 rounded-full bg-white/80"
        style={{ height: `${25 + Math.abs(Math.sin(i * 1.6)) * 75}%` }}
      />
    ))}
  </span>
)

const FEATURE_LIST = [
  {
    Icon: LuMessagesSquare,
    title: 'Instant messaging & voice notes',
    desc: 'Real-time delivery with live typing indicators, read receipts, and crystal-clear voice notes.',
  },
  {
    Icon: LuSmile,
    title: 'High-res media & reactions',
    desc: 'Share uncompressed photos, videos, and attachments, and react expressively with any emoji.',
  },
  {
    Icon: LuShieldCheck,
    title: 'Private by default & app lock',
    desc: 'PIN-protected app lock, hidden conversations, and strict contacts-only messaging.',
  },
  {
    Icon: LuQrCode,
    title: 'Frictionless QR connections',
    desc: 'Share your personal QR code or connect via @username. Strangers cannot message you.',
  },
]

const Features = () => (
  <section id="features" className="py-16 sm:py-20">
    <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
      <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left column: Header & feature list */}
        <div className="lg:col-span-6">
          <Reveal>
            <Label>Features</Label>
            <h2 className="mt-2.5 text-3xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-white sm:text-4xl">
              Everything a <Serif className="text-indigo-600 dark:text-indigo-400">great chat</Serif> needs.
            </h2>
            <p className="mt-2 max-w-lg text-[14.5px] leading-relaxed text-slate-500 dark:text-zinc-400">
              Fast, focused and private. Engineered around how you actually talk, without the noise.
            </p>
          </Reveal>

          <div className="mt-6 flex flex-col gap-2.5 sm:mt-8">
            {FEATURE_LIST.map(({ Icon, title, desc }, i) => (
              <Reveal key={title} delay={i * 0.05}>
                <div className="group flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-3.5 transition-all duration-200 hover:border-indigo-200 hover:bg-slate-50/60 dark:border-white/8 dark:bg-zinc-900/50 dark:hover:border-indigo-500/30 dark:hover:bg-zinc-900/80">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-500/15 dark:text-indigo-400 dark:group-hover:bg-indigo-600 dark:group-hover:text-white">
                    <Icon className="size-4.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold tracking-tight text-slate-900 dark:text-white">
                      {title}
                    </h3>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">
                      {desc}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Right column: Pictorial image showcase with floating UI */}
        <div className="lg:col-span-6">
          <Reveal delay={0.15}>
            <div className="relative h-[440px] sm:h-[480px] w-full overflow-hidden rounded-[2rem] shadow-xl ring-1 ring-slate-900/10 dark:ring-white/10">
              {/* Photo background */}
              <img
                src="/images/auth-login.jpg"
                alt="Friends chatting and connecting"
                loading="lazy"
                className="size-full object-cover object-[center_35%]"
              />

              {/* Ambient atmospheric gradients */}
              <div className="absolute inset-0 bg-linear-to-t from-slate-950/85 via-slate-950/25 to-slate-950/35" />
              <div className="absolute inset-0 bg-linear-to-r from-slate-950/30 via-transparent to-transparent" />

              {/* Floating Top Card: Active Message */}
              <div className="absolute left-4 top-4 right-4 sm:left-5 sm:top-5 sm:right-auto sm:max-w-xs">
                <div className="flex items-center gap-2.5 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur-md dark:bg-zinc-900/90 dark:ring-white/10">
                  <Photo n={3} className="size-8" online ring="" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-center justify-between">
                      <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white">Sofia Martinez</p>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Online</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-slate-600 dark:text-zinc-300">
                      Did the new update pass testing? 🚀
                    </p>
                  </div>
                </div>
              </div>

              {/* Floating Reactions Chip */}
              <div className="absolute right-4 top-20 sm:right-5 sm:top-22">
                <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11.5px] font-medium text-slate-800 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:bg-zinc-900/90 dark:text-zinc-200 dark:ring-white/10">
                  <span>❤️ 14</span>
                  <span className="text-slate-300 dark:text-zinc-600">·</span>
                  <span>🔥 8</span>
                  <span className="text-slate-300 dark:text-zinc-600">·</span>
                  <span>✨ 4</span>
                </div>
              </div>

              {/* Floating Bottom Section: Voice Note & QR Pass */}
              <div className="absolute inset-x-4 bottom-4 sm:inset-x-5 sm:bottom-5 flex flex-col gap-2.5">
                {/* Voice note pill */}
                <div className="ml-auto flex w-fit items-center gap-2.5 rounded-2xl bg-indigo-600/95 py-2 pl-2.5 pr-3 text-white shadow-xl backdrop-blur-md">
                  <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <LuPlay className="ml-0.5 size-3" />
                  </span>
                  <Waveform bars={16} />
                  <span className="text-[11px] tabular-nums text-indigo-100">0:14</span>
                  <LuCheckCheck className="size-3.5 text-indigo-200" />
                </div>

                {/* Direct Connect QR Pass */}
                <div className="flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur-md dark:bg-zinc-900/95 dark:ring-white/10">
                  <div className="shrink-0 rounded-xl bg-white p-1 ring-1 ring-slate-200 dark:ring-0">
                    <QRCodeSVG value="https://kova.app/invite/sofia" size={46} level="M" marginSize={0} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Photo n={3} className="size-4.5" ring="" />
                      <p className="truncate text-[12px] font-semibold text-slate-900 dark:text-white">Sofia Martinez</p>
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <LuCheck className="size-2.5 stroke-[2.5]" /> Connected
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">@sofia · Direct connection</p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  </section>
)

/* ─── Use cases with photos ───────────────────────────────── */
const USE_CASES = [
  { img: '/images/usecase-friends.jpg', Icon: LuHeart, title: 'Friends', desc: 'Plan the trip, share the moment, keep the jokes going.' },
  { img: '/images/usecase-teams.jpg', Icon: LuBriefcase, title: 'Teams', desc: 'Quick decisions without the endless email thread.' },
  { img: '/images/usecase-study.jpg', Icon: LuGraduationCap, title: 'Study groups', desc: 'Share notes and questions the night before the exam.' },
]

const UseCases = () => (
  <section id="use-cases" className="bg-slate-50 py-28 dark:border-y dark:border-white/6 dark:bg-white/2">
    <div className="mx-auto max-w-[1360px] px-5 sm:px-8">
      <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div className="max-w-xl">
          <Label>For everyone</Label>
          <h2 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-white sm:text-5xl">
            Made for the people <Serif className="text-indigo-600 dark:text-indigo-400">you talk to most.</Serif>
          </h2>
        </div>
        <p className="max-w-sm text-slate-500 dark:text-zinc-400">Whether it's two people or a whole crew, Kova keeps everyone in the same conversation.</p>
      </Reveal>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {USE_CASES.map(({ img, Icon, title, desc }, i) => (
          <Reveal key={title} delay={i * 0.08}>
            <div className="group relative aspect-[4/5] overflow-hidden rounded-[1.75rem]">
              <ParallaxImage src={img} alt={title} className="transition-transform duration-700 ease-out group-hover:scale-105" />
              <div className="absolute inset-0 bg-linear-to-t from-slate-950/85 via-slate-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/75">{desc}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
)

/* ─── How it works ────────────────────────────────────────── */
const STEPS = [
  { Icon: LuUserPlus, title: 'Create your account', desc: 'Pick a name and a username. Done in 30 seconds.' },
  { Icon: LuQrCode, title: 'Add your people', desc: 'Send a request by username, or share your QR code to connect instantly.' },
  { Icon: LuMessagesSquare, title: 'Start talking', desc: 'Send, edit and delete messages in real time.' },
]

const HowItWorks = () => (
  <section id="how-it-works" className="py-28">
    <div className="mx-auto max-w-[1360px] px-5 sm:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <Label>How it works</Label>
        <h2 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-white sm:text-5xl">
          From sign-up to <Serif className="text-indigo-600 dark:text-indigo-400">hello</Serif> in a minute.
        </h2>
      </Reveal>
      <div className="mt-16 grid gap-5 md:grid-cols-3">
        {STEPS.map(({ Icon, title, desc }, i) => (
          <Reveal key={title} delay={i * 0.1}>
            <div className="group h-full rounded-[1.75rem] border border-slate-200/80 bg-white p-8 dark:border-white/8 dark:bg-white/3 transition duration-300 hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-900/5 dark:hover:shadow-black/40">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-white transition group-hover:bg-indigo-600 dark:bg-white/10">
                  <Icon className="size-5" />
                </div>
                <span className="font-display text-5xl italic text-slate-200 dark:text-zinc-800 transition group-hover:text-indigo-200 dark:group-hover:text-indigo-500/50">0{i + 1}</span>
              </div>
              <h3 className="mt-8 text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-zinc-400">{desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
)

/* ─── CTA ─────────────────────────────────────────────────── */
const CTA_AVATARS = [
  { n: 1, cls: 'left-[6%] top-[18%] size-14' },
  { n: 4, cls: 'left-[14%] bottom-[14%] size-11' },
  { n: 9, cls: 'left-[2%] top-[58%] size-9' },
  { n: 2, cls: 'right-[6%] top-[16%] size-12' },
  { n: 7, cls: 'right-[15%] bottom-[16%] size-14' },
  { n: 6, cls: 'right-[3%] top-[56%] size-9' },
]

const CTA = ({ to, label }) => (
  <section className="px-5 pb-28 sm:px-8">
    <Reveal className="relative mx-auto max-w-[1360px] overflow-hidden rounded-[2.25rem] bg-linear-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 py-24 text-center">
      {CTA_AVATARS.map(({ n, cls }, i) => (
        <motion.img
          key={n}
          src={avatar(n)}
          alt=""
          loading="lazy"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 5 + i * 0.6, repeat: Infinity, ease: 'easeInOut' }}
          className={`absolute hidden rounded-full object-cover ring-4 ring-white/20 lg:block ${cls}`}
        />
      ))}
      <div className="relative">
        <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-[-0.03em] text-white sm:text-6xl">
          Your people are <Serif>waiting.</Serif>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-lg text-indigo-100/80">Free forever. No ads, no credit card, no limits.</p>
        <div className="mt-10 flex justify-center">
          <Button to={to} variant="white" size="lg" rightIcon={LuArrowRight} className="rounded-full px-7">{label}</Button>
        </div>
      </div>
    </Reveal>
  </section>
)

/* ─── Footer ──────────────────────────────────────────────── */
const GITHUB_PROFILE = 'https://github.com/Arjun-SN04'
const GITHUB_REPO = 'https://github.com/Arjun-SN04/NexChat'

const FooterLink = ({ href, to, children, external = false }) => {
  const cls = 'group inline-flex items-center gap-1 text-sm text-slate-500 dark:text-zinc-400 transition-colors hover:text-slate-900 dark:hover:text-white'
  if (to) return <Link to={to} className={cls}>{children}</Link>
  return (
    <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
      {external && <LuArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />}
    </a>
  )
}

const Footer = ({ loggedIn }) => {
  const columns = [
    {
      title: 'Product',
      links: [
        { href: '#features', label: 'Features' },
        { href: '#use-cases', label: 'Use cases' },
        { href: '#how-it-works', label: 'How it works' },
        { to: '/faq', label: 'FAQ' },
      ],
    },
    {
      title: 'Account',
      links: loggedIn
        ? [{ to: '/', label: 'Open Kova' }, { to: '/profile', label: 'Profile settings' }]
        : [{ to: '/login', label: 'Sign in' }, { to: '/signup', label: 'Create account' }],
    },
    {
      title: 'Project',
      links: [
        { href: GITHUB_REPO, label: 'Source code', external: true },
        { href: `${GITHUB_REPO}/issues`, label: 'Report an issue', external: true },
        { href: GITHUB_PROFILE, label: 'Developer', external: true },
      ],
    },
  ]

  return (
    <footer className="border-t border-slate-200/70 bg-white dark:border-white/8 dark:bg-zinc-950">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-10">
        <div className="grid gap-12 py-16 lg:grid-cols-[1.6fr_3fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-zinc-400">
              A clean, fast, real-time messenger for friends, teams and everyone in between.
            </p>
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-slate-700 dark:text-zinc-300 transition hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <FaGithub className="size-4" /> View on GitHub
            </a>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {columns.map(({ title, links }) => (
              <div key={title}>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                <ul className="mt-5 space-y-3.5">
                  {links.map((l) => (
                    <li key={l.label}><FooterLink {...l}>{l.label}</FooterLink></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200/70 dark:border-white/8 py-8 sm:flex-row">
          <p className="text-sm text-slate-500 dark:text-zinc-400">© {new Date().getFullYear()} Kova. All rights reserved.</p>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Made by{' '}
            <a href={GITHUB_PROFILE} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-900 dark:text-white underline-offset-4 hover:text-indigo-600 hover:underline">
              Arjun
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

/* ─── Page ────────────────────────────────────────────────── */
const HomePage = () => {
  useThemeClass()
  usePageTitle(null)
  const { dark, toggle } = useTheme()
  const [AuthUser] = useAuth()
  const [scrolled, setScrolled] = useState(false)

  // Smooth, eased scrolling on the landing page (skipped if the user prefers reduced motion)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ autoRaf: true, lerp: 0.09, anchors: true })
    return () => lenis.destroy()
  }, [])

  // Arrived with #features / #how-it-works (e.g. from the FAQ page): go to that section
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 350)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const cta = AuthUser ? { to: '/', label: 'Open Kova' } : { to: '/signup', label: 'Get started for free' }

  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-slate-900 dark:bg-zinc-950 dark:text-white">
      {/* Top nav attached flush to top */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled
            ? 'border-b border-slate-200/80 bg-white/85 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/85'
            : 'border-b border-slate-200/40 bg-white/60 backdrop-blur-md dark:border-white/5 dark:bg-zinc-950/60'
          }`}
      >
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <div className="hidden items-center gap-1 text-sm text-slate-600 dark:text-zinc-300 md:flex">
            <a href="#features" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">Features</a>
            <a href="#how-it-works" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">How it works</a>
            <Link to="/faq" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">FAQ</Link>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <button
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
              className="flex size-9 sm:size-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {dark ? <LuSun className="size-4.5" /> : <LuMoon className="size-4.5" />}
            </button>
            {AuthUser ? (
              <Button to="/" size="sm" rightIcon={LuArrowUpRight} className="h-9 sm:h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm">Open app</Button>
            ) : (
              <>
                <Button to="/login" variant="ghost" size="sm" className="hidden xs:inline-flex h-9 sm:h-10 rounded-full px-2.5 sm:px-4 text-xs sm:text-sm">Sign in</Button>
                <Button to="/signup" variant="dark" size="sm" className="h-9 sm:h-10 rounded-full px-3 sm:px-4 text-xs sm:text-sm">Get started</Button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <header className="pb-4 pt-32 sm:pt-40">
        <div className="mx-auto w-full max-w-[1360px] px-5 sm:px-8 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="mx-auto max-w-3xl text-center"
          >
            <a
              href="#features"
              className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 py-1 pl-1 pr-3 text-[13px] text-slate-600 backdrop-blur transition hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-white/20"
            >
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
              Add friends with a QR code
              <LuArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
            <h1 className="mt-7 text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-slate-900 sm:text-[64px] xl:text-[80px] dark:text-white">
              Talk to your people, <Serif className="text-indigo-600 dark:text-indigo-400">instantly.</Serif>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-500 dark:text-zinc-400">
              A fast, private messenger. Add friends by username or QR code, share photos and voice notes, and see replies the moment they land.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button to={cta.to} size="lg" rightIcon={LuArrowRight} className="rounded-full px-7">{cta.label}</Button>
              {!AuthUser && <Button to="/login" variant="secondary" size="lg" className="rounded-full px-7">Sign in</Button>}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: EASE }}
              className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3"
            >
              {/* shrink-0: the photos never get squeezed under the text on narrow screens */}
              <div className="flex shrink-0 -space-x-2.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <img key={n} src={avatar(n)} alt="" className="size-8 shrink-0 rounded-full object-cover ring-[3px] ring-white dark:ring-zinc-950" />
                ))}
              </div>
              <p className="text-center text-sm leading-snug text-slate-500 sm:text-left dark:text-zinc-400">
                <span className="font-semibold text-slate-900 dark:text-white">Free for everyone.</span> Friends, teams and study groups.
              </p>
            </motion.div>
          </motion.div>

          <HeroPhoto />
        </div>
      </header>

      <Features />
      <UseCases />
      <HowItWorks />
      <CTA {...cta} />

      <Footer loggedIn={!!AuthUser} />
    </div>
  )
}

export default HomePage
