import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import {
  LuArrowRight, LuArrowUpRight, LuBriefcase, LuCheck, LuCheckCheck, LuCookie, LuFileText, LuFingerprint,
  LuForward, LuGraduationCap, LuHeart, LuPencil, LuPlay, LuSearch, LuSmile,
  LuShieldCheck, LuQrCode, LuSun, LuMoon, LuTrash2, LuUserPlus, LuUsers, LuZap, LuMessagesSquare,
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

/* ─── Features: pick a feature on the left, see it on the photo ─ */
// The little UI card that floats over the photo for each feature
const OverlayCard = ({ children, className = '' }) => (
  <div className={`w-[300px] max-w-[calc(100vw-5rem)] rounded-2xl bg-white/95 p-4 shadow-2xl shadow-slate-950/25 ring-1 ring-slate-900/5 backdrop-blur-xl dark:bg-zinc-900/95 dark:shadow-black/60 dark:ring-white/10 ${className}`}>
    {children}
  </div>
)

const Bubble = ({ me, children, className = '' }) => (
  <div className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
    me ? 'ml-auto rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800 dark:bg-white/8 dark:text-zinc-100'
  } ${className}`}>
    {children}
  </div>
)

const LIVE_CHAT = [
  { me: false, text: 'Did the build pass?' },
  { me: true, text: 'Yep, all green. Shipping now 🚀' },
  { me: false, text: 'Legend. Drinks on me tonight.' },
]

const LiveChatDemo = () => {
  const [count, setCount] = useState(1)
  useEffect(() => {
    const t = setTimeout(() => setCount((c) => (c >= LIVE_CHAT.length ? 1 : c + 1)), 1400)
    return () => clearTimeout(t)
  }, [count])
  return (
    <OverlayCard>
      <div className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-white/8">
        <Photo n={3} className="size-8" online ring="" />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Sofia Martinez</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Online</p>
        </div>
      </div>
      <div className="flex h-32 flex-col justify-end gap-1.5">
        <AnimatePresence initial={false}>
          {LIVE_CHAT.slice(0, count).map((m, i) => (
            <motion.div key={i} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              <Bubble me={m.me}>{m.text}</Bubble>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </OverlayCard>
  )
}

const Waveform = ({ bars = 22 }) => (
  <span className="flex h-5 items-center gap-0.75">
    {Array.from({ length: bars }, (_, i) => (
      <span key={i} className="w-0.75 rounded-full bg-white/80" style={{ height: `${30 + Math.abs(Math.sin(i * 1.7)) * 70}%` }} />
    ))}
  </span>
)

const SHOWCASE = [
  {
    Icon: LuMessagesSquare,
    title: 'Real-time messaging',
    desc: 'Messages arrive in milliseconds over WebSockets, with typing indicators and read receipts.',
    visual: <LiveChatDemo />,
  },
  {
    Icon: LuQrCode,
    title: 'Add people your way',
    desc: 'Send a request by @username, or share your QR code to connect instantly. Strangers can’t message you.',
    visual: (
      <OverlayCard className="flex items-center gap-4">
        <div className="shrink-0 rounded-xl bg-white p-2 ring-1 ring-slate-200 dark:ring-0">
          <QRCodeSVG value="https://kova.app/invite/welcome" size={96} level="M" marginSize={0} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Sofia Martinez</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">@sofia</p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <LuCheck className="size-3" /> Added to contacts
          </span>
        </div>
      </OverlayCard>
    ),
  },
  {
    Icon: LuUsers,
    title: 'Live presence',
    desc: 'See who’s online right now, and who’s typing, before you hit send.',
    visual: (
      <OverlayCard className="space-y-1">
        {[[3, 'Sofia Martinez', 'typing…', true], [6, 'Liam Carter', 'Online', true], [8, 'Ava Patel', 'Last seen 2h ago', false], [4, 'Noah Kim', 'Online', true]].map(([n, name, status, on]) => (
          <div key={name} className="flex items-center gap-3 rounded-xl px-1.5 py-1.5">
            <Photo n={n} className={`size-9 ${on ? '' : 'opacity-50 grayscale'}`} online={on} ring="" />
            <div className="leading-tight">
              <p className="text-[13px] font-medium text-slate-900 dark:text-white">{name}</p>
              <p className={`text-[11px] ${status === 'typing…' ? 'text-indigo-600 dark:text-indigo-400' : on ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{status}</p>
            </div>
          </div>
        ))}
      </OverlayCard>
    ),
  },
  {
    Icon: LuSmile,
    title: 'Photos, voice and reactions',
    desc: 'Share pictures, files and voice notes, and react to anything with any emoji.',
    visual: (
      <OverlayCard className="space-y-2.5">
        <div className="relative w-fit">
          <Bubble>Pizza tonight? 🍕</Bubble>
          <span className="absolute -bottom-2.5 left-2 rounded-full bg-white px-1.5 py-px text-[11px] shadow-sm ring-1 ring-slate-200 dark:bg-zinc-800 dark:ring-white/10">❤️ 😂 3</span>
        </div>
        <div className="!mt-5 ml-auto flex w-fit items-center gap-2.5 rounded-2xl rounded-br-md bg-indigo-600 py-2 pl-2 pr-3 text-white">
          <span className="flex size-7 items-center justify-center rounded-full bg-white/20"><LuPlay className="ml-0.5 size-3.5" /></span>
          <Waveform />
          <span className="text-[11px] tabular-nums text-indigo-100">0:09</span>
        </div>
        <div className="flex w-fit items-center gap-2.5 rounded-2xl rounded-bl-md bg-slate-100 p-2 pr-3.5 dark:bg-white/8">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white text-indigo-600 dark:bg-zinc-800 dark:text-indigo-400"><LuFileText className="size-4" /></span>
          <div className="leading-tight">
            <p className="text-[13px] font-medium text-slate-900 dark:text-white">Trip-plan.pdf</p>
            <p className="text-[11px] text-slate-400">1.2 MB</p>
          </div>
        </div>
      </OverlayCard>
    ),
  },
  {
    Icon: LuPencil,
    title: 'Edit, delete, forward',
    desc: 'Fix a typo, take a message back, or pass it on. Everyone stays in sync.',
    visual: (
      <OverlayCard className="space-y-2">
        <Bubble me className="line-through opacity-50">Meet at 6?</Bubble>
        <Bubble me>Meet at 7? <span className="ml-1 text-[11px] text-indigo-200">edited</span></Bubble>
        <div className="flex justify-end gap-1.5 pt-1.5">
          {[[LuPencil, 'Edit', ''], [LuForward, 'Forward', ''], [LuTrash2, 'Delete', 'text-red-600 dark:text-red-400']].map(([Icon, label, cls]) => (
            <span key={label} className={`inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 dark:bg-white/8 dark:text-zinc-200 ${cls}`}><Icon className="size-3" />{label}</span>
          ))}
        </div>
      </OverlayCard>
    ),
  },
  {
    Icon: LuShieldCheck,
    title: 'Private by default',
    desc: 'Only your contacts can reach you. Secure sessions and hashed passwords keep your account safe.',
    visual: (
      <OverlayCard className="space-y-1.5">
        {[[LuUserPlus, 'Contacts only'], [LuCookie, 'HTTP-only cookies'], [LuFingerprint, 'Hashed passwords']].map(([Icon, label]) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 dark:bg-white/5 dark:text-zinc-200">
            <Icon className="size-4 text-indigo-600 dark:text-indigo-400" /> {label}
            <LuCheck className="ml-auto size-4 text-emerald-500" />
          </div>
        ))}
      </OverlayCard>
    ),
  },
]

const ROTATE_MS = 5000

const Features = () => {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  // Move to the next feature every few seconds, unless the visitor is hovering the list
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setActive((a) => (a + 1) % SHOWCASE.length), ROTATE_MS)
    return () => clearTimeout(t)
  }, [active, paused])

  return (
    <section id="features" className="py-28">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-10">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <Label>Features</Label>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-white sm:text-5xl">
              Everything a <Serif className="text-indigo-600 dark:text-indigo-400">great chat</Serif> needs.
            </h2>
          </div>
          <p className="max-w-sm text-slate-500 dark:text-zinc-400">Fast, focused and built around the way you actually talk. No clutter, just conversation.</p>
        </Reveal>

        <Reveal className="mt-14 grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          {/* Feature list */}
          <div
            className="order-2 space-y-2 lg:order-1"
            onMouseLeave={() => setPaused(false)}
          >
            {SHOWCASE.map(({ Icon, title, desc }, i) => {
              const on = i === active
              return (
                <div
                  key={title}
                  onMouseEnter={() => {
                    setActive(i)
                    setPaused(true)
                  }}
                  onClick={() => {
                    setActive(i)
                    setPaused(true)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setActive(i)
                    }
                  }}
                  className={`group relative block w-full cursor-pointer rounded-2xl p-4 text-left transition-all duration-300 ${
                    on ? '' : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  {/* Sliding active pill indicator background */}
                  {on && (
                    <motion.div
                      layoutId="activeFeaturePill"
                      className="absolute inset-0 rounded-2xl border border-slate-200/80 bg-slate-100/90 shadow-xs dark:border-white/10 dark:bg-white/[0.07] dark:shadow-inner dark:shadow-white/5"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    />
                  )}

                  <div className="relative z-10 flex items-start gap-3.5">
                    {/* Modern icon badge */}
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
                        on
                          ? 'bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/20'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80 group-hover:text-slate-800 dark:bg-white/5 dark:text-zinc-400 dark:group-hover:bg-white/10 dark:group-hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="size-5" />
                    </div>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center justify-between">
                        <p
                          className={`text-[15.5px] font-semibold tracking-tight transition-colors duration-200 ${
                            on
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-600 group-hover:text-slate-900 dark:text-zinc-400 dark:group-hover:text-zinc-200'
                          }`}
                        >
                          {title}
                        </p>
                      </div>

                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.28, ease: EASE }}
                            className="overflow-hidden"
                          >
                            <p className="pt-1.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-zinc-400">
                              {desc}
                            </p>

                            {/* Sleek auto-rotation progress bar */}
                            {!paused && (
                              <div className="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
                                <motion.div
                                  key={`prog-${active}`}
                                  initial={{ width: '0%' }}
                                  animate={{ width: '100%' }}
                                  transition={{ duration: ROTATE_MS / 1000, ease: 'linear' }}
                                  className="h-full rounded-full bg-linear-to-r from-indigo-500 via-violet-500 to-indigo-500"
                                />
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Photo with the matching UI on top */}
          <div className="relative order-1 aspect-[4/3] overflow-hidden rounded-[1.75rem] ring-1 ring-slate-900/5 lg:order-2 lg:aspect-[5/4] dark:ring-white/10">
            <ParallaxImage src="/images/auth-login.jpg" alt="Friends chatting around a café table" distance={24} />
            <div className="absolute inset-0 bg-linear-to-t from-slate-950/50 via-slate-950/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex justify-center p-5 sm:justify-start sm:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {SHOWCASE[active].visual}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

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
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-slate-200/80 bg-white/85 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/85'
            : 'border-b border-slate-200/40 bg-white/60 backdrop-blur-md dark:border-white/5 dark:bg-zinc-950/60'
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <div className="hidden items-center gap-1 text-sm text-slate-600 dark:text-zinc-300 md:flex">
            <a href="#features" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">Features</a>
            <a href="#how-it-works" className="rounded-full px-4 py-2 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">How it works</a>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
              className="flex size-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {dark ? <LuSun className="size-4.5" /> : <LuMoon className="size-4.5" />}
            </button>
            {AuthUser ? (
              <Button to="/" size="sm" rightIcon={LuArrowUpRight} className="h-10 rounded-full px-4">Open app</Button>
            ) : (
              <>
                <Button to="/login" variant="ghost" size="sm" className="h-10 rounded-full px-4">Sign in</Button>
                <Button to="/signup" variant="dark" size="sm" className="h-10 rounded-full px-4">Get started</Button>
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
              className="mt-8 flex items-center justify-center gap-3"
            >
              <div className="flex -space-x-2.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <img key={n} src={avatar(n)} alt="" className="size-8 rounded-full object-cover ring-[3px] ring-white dark:ring-zinc-950" />
                ))}
              </div>
              <p className="text-left text-sm leading-snug text-slate-500 dark:text-zinc-400">
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
