import axios from 'axios'
import useConversation from '../Zustand/UserConversation'

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/
export const USERNAME_RULES = '3–20 lowercase letters, numbers, underscores (_) or dots (.)'
export const normalizeUsername = (v) => String(v || '').trim().replace(/^@/, '').toLowerCase()

export const inviteUrl = (token) => `${window.location.origin}/invite/${token}`

// Invite links opened while logged out are remembered until after login
const PENDING_KEY = 'pendingInvite'
export const savePendingInvite = (token) => { try { localStorage.setItem(PENDING_KEY, token) } catch { /* ignore */ } }
export const takePendingInvite = () => {
  try {
    const token = localStorage.getItem(PENDING_KEY)
    localStorage.removeItem(PENDING_KEY)
    return token
  } catch { return null }
}

export const loadRequests = async () => {
  try {
    const res = await axios.get('/api/contacts/requests', { withCredentials: true })
    useConversation.getState().setRequests(res.data)
  } catch (err) {
    console.log('loadRequests error:', err)
  }
}

// Server-side check while typing a username. Returns an error message or true.
export const checkUsernameFree = async (value, current = null) => {
  const username = normalizeUsername(value)
  if (!USERNAME_RE.test(username)) return `Use ${USERNAME_RULES}`
  if (current && username === current) return true
  try {
    const res = await axios.get(`/api/user/username-available/${encodeURIComponent(username)}`)
    return res.data.available || res.data.error || 'That username is taken'
  } catch {
    return true // let the server decide on submit
  }
}
