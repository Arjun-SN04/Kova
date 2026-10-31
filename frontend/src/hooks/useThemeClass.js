import { useLayoutEffect } from 'react'
import { useTheme } from '../context/ThemeProvider'

// When going from one dark page to another (chat -> profile), the old page
// unmounts a moment before the new one mounts. Waiting a little before
// switching back to light stops the page from flashing light in between.
const LIGHT_DELAY_MS = 120
let lightTimer = null

// Apply the app's dark mode to the whole page (<html class="dark">) while the
// calling screen is mounted. Doing it on <html> (not a wrapper div) means
// pop-ups rendered into <body> — dialogs, image viewer, forward picker — follow
// the theme too.
const useThemeClass = () => {
  const { dark } = useTheme()
  useLayoutEffect(() => {
    const root = document.documentElement
    clearTimeout(lightTimer)
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
    return () => {
      clearTimeout(lightTimer)
      lightTimer = setTimeout(() => {
        root.classList.remove('dark')
        root.style.colorScheme = ''
      }, LIGHT_DELAY_MS)
    }
  }, [dark])
  return dark
}

export default useThemeClass
