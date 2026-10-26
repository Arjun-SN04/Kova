import axios from 'axios'
import useConversation from '../Zustand/UserConversation'

const api = { withCredentials: true }
export const STATUS_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0d9488', '#0284c7', '#334155']

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
