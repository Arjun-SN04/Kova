import React, { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export const useTheme = () => useContext(ThemeContext)

// Colour themes. Each one swaps the app's accent colour (buttons, links,
// selected chats, your message bubbles); the palettes live in index.css.
export const ACCENTS = [
  { id: 'iris', name: 'Iris', swatch: '#6d28d9' },
  { id: 'ocean', name: 'Ocean', swatch: '#2563eb' },
  { id: 'lagoon', name: 'Lagoon', swatch: '#0d9488' },
  { id: 'forest', name: 'Forest', swatch: '#059669' },
  { id: 'rose', name: 'Rose', swatch: '#e11d48' },
  { id: 'graphite', name: 'Graphite', swatch: '#3a3d43' },
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
  const [accent, setAccentState] = useState(() => read('chatAccent', 'iris', ACCENTS.map((a) => a.id)))
  const [osDark, setOsDark] = useState(systemDark)

  // Follow the device setting while "System" is picked
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setOsDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  // The accent applies to every page, including ones that stay light
  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])

  const dark = mode === 'system' ? osDark : mode === 'dark'
  const setMode = (m) => { save('chatTheme', m); setOsDark(systemDark()); setModeState(m) }
  const setAccent = (a) => { save('chatAccent', a); setAccentState(a) }
  const toggle = () => setMode(dark ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ dark, toggle, mode, setMode, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
