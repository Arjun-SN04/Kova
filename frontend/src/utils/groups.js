import axios from 'axios'
import useConversation from '../Zustand/UserConversation'

const api = { withCredentials: true }

// Where a chat's messages live: groups have their own endpoints
export const messagesUrl = (chat) => (chat?.isGroup ? `/api/groups/${chat._id}/messages` : `/api/message/get/${chat._id}`)
export const sendUrl = (chat) => (chat?.isGroup ? `/api/groups/${chat._id}/messages` : `/api/message/send/${chat._id}`)

export const isAdminOf = (chat, userId) => (chat?.admins || []).some((a) => String(a?._id ?? a) === String(userId))

// Can I send in this chat? Announcement groups are admins-only.
export const canPost = (chat, userId) => !(chat?.announcement || chat?.adminsOnly) || isAdminOf(chat, userId)

export const loadCommunities = async () => {
  try {
    const res = await axios.get('/api/communities', api)
    useConversation.getState().setCommunities(res.data.communities)
  } catch (err) {
    console.log('loadCommunities error:', err)
  }
}

export const groupsApi = {
  create: (body) => axios.post('/api/groups', body, api),
  update: (id, body) => axios.put(`/api/groups/${id}`, body, api),
  remove: (id) => axios.delete(`/api/groups/${id}`, api),
  addMembers: (id, userIds) => axios.post(`/api/groups/${id}/members`, { userIds }, api),
  removeMember: (id, userId) => axios.delete(`/api/groups/${id}/members/${userId}`, api),
  setAdmin: (id, userId, admin) => axios.put(`/api/groups/${id}/admins/${userId}`, { admin }, api),
  join: (id) => axios.post(`/api/groups/${id}/join`, {}, api),
}

export const communitiesApi = {
  create: (body) => axios.post('/api/communities', body, api),
  get: (id) => axios.get(`/api/communities/${id}`, api),
  update: (id, body) => axios.put(`/api/communities/${id}`, body, api),
  remove: (id) => axios.delete(`/api/communities/${id}`, api),
  addMembers: (id, userIds) => axios.post(`/api/communities/${id}/members`, { userIds }, api),
  removeMember: (id, userId) => axios.delete(`/api/communities/${id}/members/${userId}`, api),
  setAdmin: (id, userId, admin) => axios.put(`/api/communities/${id}/admins/${userId}`, { admin }, api),
  createGroup: (id, body) => axios.post(`/api/communities/${id}/groups`, body, api),
}

// Friendly error text from a failed request
export const errorOf = (err, fallback = 'Something went wrong. Try again.') => err.response?.data?.error || fallback

// Invite links and join requests
export const groupLinks = {
  get: (id) => axios.get(`/api/groups/${id}/link`, api),
  reset: (id) => axios.post(`/api/groups/${id}/link`, {}, api),
  remove: (id) => axios.delete(`/api/groups/${id}/link`, api),
  preview: (code) => axios.get(`/api/groups/link/${encodeURIComponent(code)}`, api),
  join: (code) => axios.post(`/api/groups/link/${encodeURIComponent(code)}`, {}, api),
  requests: (id) => axios.get(`/api/groups/${id}/requests`, api),
  answer: (id, userId, approve) => (approve ? axios.post(`/api/groups/${id}/requests/${userId}`, {}, api) : axios.delete(`/api/groups/${id}/requests/${userId}`, api)),
}
export const groupLinkUrl = (code) => `${window.location.origin}/g/${code}`
