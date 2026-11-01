import axios from 'axios'
import useConversation from '../Zustand/UserConversation'

const api = { withCredentials: true }
export const STATUS_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0d9488', '#0284c7', '#334155']
// Big text for a few words, smaller as it gets longer
export const statusTextSize = (text = '') => {
  const n = text.length
  return n < 40 ? 'text-3xl sm:text-4xl' : n < 120 ? 'text-2xl sm:text-3xl' : n < 300 ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'
}
// A text status's background: its colour with a soft light from the top corner and a darker bottom
export const statusBackground = (color) =>
  `radial-gradient(120% 70% at 15% 0%, rgba(255,255,255,0.22), transparent 60%), linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.28)), ${color}`

export const loadStatusFeed = async () => {
  try {
    const res = await axios.get('/api/status', api)
    useConversation.getState().setStatusFeed(res.data)
  } catch { /* keep the old one */ }
}

export const markStatusSeen = (id) => axios.put(`/api/status/${id}/view`, {}, api).catch(() => {})

export const timeAgo = (date) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(date)) / 60000))
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h} h ago` : 'Yesterday'
}
