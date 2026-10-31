import { create } from 'zustand'

// One audio player for the whole app. Voice notes play here, so they keep playing
// when you switch chats; the bar at the top (MiniPlayer) shows and controls it.
const audio = typeof Audio !== 'undefined' ? new Audio() : null

const useAudioPlayer = create((set, get) => ({
  // { id, url, title, subtitle, chat, messageId } of what's loaded
  track: null,
  playing: false,
  current: 0,
  duration: 0,
  rate: 1,

  play: (track) => {
    if (!audio) return
    const now = get().track
    if (now?.id !== track.id) {
      audio.src = track.url
      audio.currentTime = 0
      set({ track, current: 0, duration: track.duration || 0 })
    }
    audio.playbackRate = get().rate
    audio.play().catch(() => set({ playing: false }))
  },
  toggle: () => {
    if (!audio || !get().track) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  },
  seek: (seconds) => {
    if (!audio || !get().track) return
    audio.currentTime = Math.max(0, Math.min(seconds, get().duration || seconds))
    if (audio.paused) audio.play().catch(() => {})
  },
  cycleRate: () => {
    const next = { 1: 1.5, 1.5: 2, 2: 1 }[get().rate] || 1
    if (audio) audio.playbackRate = next
    set({ rate: next })
  },
  close: () => {
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load() }
    set({ track: null, playing: false, current: 0, duration: 0 })
  },
}))

if (audio) {
  const update = (patch) => useAudioPlayer.setState(patch)
  audio.addEventListener('play', () => update({ playing: true }))
  audio.addEventListener('pause', () => update({ playing: false }))
  audio.addEventListener('timeupdate', () => update({ current: audio.currentTime }))
  audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio.duration)) update({ duration: audio.duration }) })
  audio.addEventListener('ended', () => update({ playing: false, current: 0 }))
}

export default useAudioPlayer
