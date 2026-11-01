import axios from 'axios'
import { create } from 'zustand'

// Live location: while a share is running, send my position every few seconds.
// Active shares are remembered on this device, so they carry on after a page refresh.
const KEY = 'kovaLiveShares'
const SEND_EVERY = 10_000
const api = { withCredentials: true }

export const useLiveShares = create(() => ({ shares: {} })) // messageId -> { until }
const watches = new Map() // messageId -> { watchId, lastSent, timer }

const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(useLiveShares.getState().shares)) } catch { /* private mode */ }
}
const setShares = (fn) => { useLiveShares.setState((s) => ({ shares: fn(s.shares) })); save() }

export const getPosition = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) return reject(new Error('Location isn’t available in this browser'))
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    (e) => reject(new Error(e.code === 1 ? 'Allow location access in your browser to share where you are' : 'Couldn’t find your location. Try again.')),
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
  )
})

const end = (id) => {
  const w = watches.get(id)
  if (w) { navigator.geolocation?.clearWatch(w.watchId); clearTimeout(w.timer); watches.delete(id) }
  setShares((s) => { const n = { ...s }; delete n[id]; return n })
}

const track = (id, until) => {
  if (watches.has(id) || !navigator.geolocation) return
  const left = new Date(until).getTime() - Date.now()
  if (left <= 0) { end(id); return }
  const w = { watchId: null, lastSent: 0, timer: setTimeout(() => end(id), left) }
  w.watchId = navigator.geolocation.watchPosition((p) => {
    if (Date.now() - w.lastSent < SEND_EVERY) return
    w.lastSent = Date.now()
    axios.put(`/api/message/location/${id}`, { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }, api)
      .catch((err) => { if ([403, 404, 410].includes(err.response?.status)) end(id) })
  }, () => { /* keep trying */ }, { enableHighAccuracy: true, maximumAge: 5000 })
  watches.set(id, w)
}

// Send my location to a chat. minutes: 0 (just now), 15, 60 or 480 (live)
export const shareLocation = async ({ chatId, isGroup, minutes, position }) => {
  const res = await axios.post('/api/message/location', { chatId, isGroup, minutes, ...position }, api)
  const msg = res.data
  if (msg.location?.live) {
    setShares((s) => ({ ...s, [msg._id]: { until: msg.location.until } }))
    track(String(msg._id), msg.location.until)
  }
  return msg
}

export const stopSharing = async (id) => {
  end(String(id))
  await axios.put(`/api/message/location/${id}/stop`, {}, api).catch(() => {})
}

// After a refresh: carry on with shares that are still running
export const resumeLiveShares = () => {
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') } catch { /* ignore */ }
  const running = Object.fromEntries(Object.entries(saved).filter(([, v]) => new Date(v.until) > new Date()))
  useLiveShares.setState({ shares: running }); save()
  Object.entries(running).forEach(([id, v]) => track(id, v.until))
}
