import { create } from 'zustand'

// Read a message aloud with the browser's own voices (free, no server).
// One message at a time; the store says which one is speaking so its button can show "Stop".
export const useSpeech = create(() => ({ speakingId: null }))
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

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
  if (!canSpeak()) return
  window.speechSynthesis.cancel()
  useSpeech.setState({ speakingId: null })
}

export const speak = (id, text) => {
  if (!canSpeak()) return
  const synth = window.speechSynthesis
  if (useSpeech.getState().speakingId === id) { stopSpeaking(); return }
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
