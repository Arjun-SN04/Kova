import { create } from 'zustand'

// Read a message aloud. First choice: the server's voice (Groq Orpheus with a mood per line for
// English; an Indian neural voice for Hindi / Hinglish). If that isn't available, the device's own voices.
// One message at a time; the store says which one is loading / speaking for its button.
export const useSpeech = create(() => ({ speakingId: null, loadingId: null }))
export const canSpeak = () => typeof window !== 'undefined' && (typeof Audio !== 'undefined' || 'speechSynthesis' in window)
const hasDeviceVoice = () => typeof window !== 'undefined' && 'speechSynthesis' in window

let player = null      // the <audio> playing server speech
const urls = new Map() // message id -> object URL of its audio (replays are instant)
let serverVoice = true // turned off for this session if the server can't speak at all

// Markdown and emoji out, so the voice reads only the words
const plain = (text) => String(text || '')
  .replace(/```[\s\S]*?```/g, ' (code) ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>~|]/g, '')
  .replace(/^\s*[-•]\s+/gm, '')
  .replace(/\p{Extended_Pictographic}/gu, '')
  .replace(/\n{2,}/g, '.\n')
  .trim()

// Hindi in Devanagari → a Hindi voice; Roman Hindi reads best with an Indian English voice
const HINGLISH = /\b(hai|hain|mera|meri|tera|teri|tum|tujhe|mujhe|kya|nahi|pyaar|dil|aur|bhi|kabhi|sapne|yaad|raat|baat)\b/i
const langFor = (text) => (/[ऀ-ॿ]/.test(text) ? 'hi-IN' : HINGLISH.test(text) ? 'en-IN' : null)

const pickVoice = (lang) => {
  const voices = window.speechSynthesis.getVoices()
  const nice = (v) => /natural|neural|google|online|premium|enhanced/i.test(v.name)
  const want = lang || navigator.language || 'en-US'
  const base = want.split('-')[0]
  return voices.find((v) => v.lang === want && nice(v)) || voices.find((v) => v.lang === want)
    || voices.find((v) => v.lang?.startsWith(base) && nice(v)) || voices.find((v) => v.lang?.startsWith(base)) || null
}

export const stopSpeaking = () => {
  if (player) { player.pause(); player = null }
  if (hasDeviceVoice()) window.speechSynthesis.cancel()
  useSpeech.setState({ speakingId: null, loadingId: null })
}

const playUrl = (id, url) => {
  player = new Audio(url)
  player.onended = () => { if (useSpeech.getState().speakingId === id) useSpeech.setState({ speakingId: null }) }
  player.onerror = () => useSpeech.setState({ speakingId: null })
  useSpeech.setState({ speakingId: id, loadingId: null })
  return player.play()
}

export const speak = async (id, text) => {
  const st = useSpeech.getState()
  if (st.speakingId === id || st.loadingId === id) { stopSpeaking(); return }
  stopSpeaking()
  if (urls.has(id)) { playUrl(id, urls.get(id)).catch(() => {}); return }
  if (serverVoice) {
    useSpeech.setState({ loadingId: id })
    try {
      const res = await fetch('/api/ai/speak', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      if (useSpeech.getState().loadingId !== id) return // stopped while it was being made
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob())
        urls.set(id, url)
        await playUrl(id, url)
        return
      }
      const err = await res.json().catch(() => ({}))
      if (err.code === 'not_configured') serverVoice = false
      console.warn('Expressive voice unavailable:', err.error || res.status)
    } catch (e) {
      console.warn('Expressive voice failed:', e?.message)
    }
    useSpeech.setState({ loadingId: null })
  }
  speakOnDevice(id, text)
}

// Fallback: the browser's built-in voices
const speakOnDevice = (id, text) => {
  if (!hasDeviceVoice()) return
  const synth = window.speechSynthesis
  synth.cancel()
  const words = plain(text)
  if (!words) return
  const lang = langFor(words)
  // Long answers are read in sentence-sized chunks (some browsers stop after ~15 seconds otherwise)
  const chunks = words.match(/[^.!?\n]+[.!?\n]*/g)?.map((c) => c.trim()).filter(Boolean) || [words]
  const start = () => {
    const voice = pickVoice(lang)
    useSpeech.setState({ speakingId: id })
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk)
      if (voice) u.voice = voice
      u.lang = voice?.lang || lang || navigator.language
      u.rate = 0.98
      if (i === chunks.length - 1) u.onend = () => { if (useSpeech.getState().speakingId === id) useSpeech.setState({ speakingId: null }) }
      u.onerror = () => useSpeech.setState({ speakingId: null })
      synth.speak(u)
    })
  }
  // Voices load late the first time
  if (synth.getVoices().length) start()
  else synth.addEventListener('voiceschanged', start, { once: true })
}
