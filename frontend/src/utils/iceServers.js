import axios from 'axios'

// Connection helpers for calls, from the server (GET /api/calls/ice): STUN, plus a TURN
// relay when one is set up there, so calls also connect on strict networks.
// Falls back to public STUN (and VITE_TURN_* if set) when the server can't be reached.
export const FALLBACK_ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ...(import.meta.env.VITE_TURN_URL
    ? [{ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }]
    : []),
]

let cached = { at: 0, servers: null }
const FRESH_MS = 60 * 60 * 1000 // the server's credentials last 12 hours

export const getIceServers = async () => {
  if (cached.servers && Date.now() - cached.at < FRESH_MS) return cached.servers
  try {
    const res = await axios.get('/api/calls/ice', { withCredentials: true, timeout: 4000 })
    if (Array.isArray(res.data.iceServers) && res.data.iceServers.length) {
      cached = { at: Date.now(), servers: res.data.iceServers }
      return cached.servers
    }
  } catch { /* use the fallback */ }
  return FALLBACK_ICE
}

// The last list fetched (for code that can't wait)
export const currentIceServers = () => cached.servers || FALLBACK_ICE
