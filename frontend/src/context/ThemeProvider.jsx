import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export const useTheme = () => useContext(ThemeContext)

// Colour themes. Each one swaps the app's accent colour (buttons, links,
// selected chats, your message bubbles); the palettes live in index.css.
export const ACCENTS = [
  { id: 'ocean', name: 'Ocean', swatch: '#2563eb' },
  { id: 'iris', name: 'Iris', swatch: '#6d28d9' },
  { id: 'lagoon', name: 'Lagoon', swatch: '#0d9488' },
  { id: 'forest', name: 'Forest', swatch: '#059669' },
  { id: 'rose', name: 'Rose', swatch: '#e11d48' },
  { id: 'graphite', name: 'Graphite', swatch: '#3a3d43' },
]
// Text size for the whole app (everything is sized in rem, so it all scales together)
export const TEXT_SIZES = [
  { id: 'small', name: 'Small', percent: 90 },
  { id: 'default', name: 'Default', percent: 100 },
  { id: 'large', name: 'Large', percent: 112.5 },
  { id: 'xlarge', name: 'Extra large', percent: 125 },
]
export const MODES = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'system', name: 'System' },
]

const read = (key, fallback, allowed) => {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v) ? v : fallback
  } catch { return fallback }
}
const save = (key, value) => { try { localStorage.setItem(key, value) } catch { /* private mode */ } }
const systemDark = () => { try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return true } }

const ThemeProvider = ({ children }) => {
  // Dark by default; light only if the visitor chose it
  const [mode, setModeState] = useState(() => read('chatTheme', 'dark', MODES.map((m) => m.id)))
  const [accent, setAccentState] = useState(() => read('chatAccent', 'ocean', ACCENTS.map((a) => a.id)))
  const [osDark, setOsDark] = useState(systemDark)
  const [textSize, setTextSizeState] = useState(() => read('chatTextSize', 'default', TEXT_SIZES.map((t) => t.id)))
  useEffect(() => {
    const percent = TEXT_SIZES.find((t) => t.id === textSize)?.percent || 100
    document.documentElement.style.fontSize = percent === 100 ? '' : `${percent}%`
  }, [textSize])

  // Follow the device setting while "System" is picked
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setOsDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  // The accent applies to every page, including ones that stay light.
  // The browser tab icon and the mobile address-bar colour follow it too.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.accent = accent
    const css = getComputedStyle(root)
    const light = css.getPropertyValue('--color-indigo-500').trim() || '#8b5cf6'
    const deep = css.getPropertyValue('--color-indigo-600').trim() || '#6d28d9'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><path d="M10.5 8.5h11a3.5 3.5 0 0 1 3.5 3.5v6a3.5 3.5 0 0 1-3.5 3.5H16l-4.5 3.5v-3.5h-1A3.5 3.5 0 0 1 7 18v-6a3.5 3.5 0 0 1 3.5-3.5z" fill="#fff"/><circle cx="12.5" cy="15" r="1.4" fill="${deep}"/><circle cx="16" cy="15" r="1.4" fill="${deep}"/><circle cx="19.5" cy="15" r="1.4" fill="${deep}"/></svg>`
    const icon = document.querySelector('link[rel="icon"]')
    if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', deep)
  }, [accent])

  const dark = mode === 'system' ? osDark : mode === 'dark'
  const setMode = (m) => { save('chatTheme', m); setOsDark(systemDark()); setModeState(m) }
  const setAccent = (a) => { save('chatAccent', a); setAccentState(a) }
  const toggle = () => setMode(dark ? 'light' : 'dark')
  const setTextSize = (t) => { save('chatTextSize', t); setTextSizeState(t) }

  return (
    <ThemeContext.Provider value={{ dark, toggle, mode, setMode, accent, setAccent, textSize, setTextSize }}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
