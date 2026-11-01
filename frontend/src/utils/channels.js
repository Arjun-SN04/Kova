import axios from 'axios'
import useConversation from '../Zustand/UserConversation'

// Channels: one-way updates. Admins post, followers read and react.
const api = { withCredentials: true }
export const channelsApi = {
  mine: () => axios.get('/api/channels', api),
  discover: (q) => axios.get('/api/channels/discover', { ...api, params: { q } }),
  handle: (h) => axios.get(`/api/channels/handle/${encodeURIComponent(h)}`, api),
  create: (body) => axios.post('/api/channels', body, api),
  get: (id) => axios.get(`/api/channels/${id}`, api),
  update: (id, body) => axios.put(`/api/channels/${id}`, body, api),
  remove: (id) => axios.delete(`/api/channels/${id}`, api),
  follow: (id) => axios.post(`/api/channels/${id}/follow`, {}, api),
  unfollow: (id) => axios.delete(`/api/channels/${id}/follow`, api),
  read: (id) => axios.put(`/api/channels/${id}/read`, {}, api),
  posts: (id, before) => axios.get(`/api/channels/${id}/posts`, { ...api, params: before ? { before } : {} }),
  post: (id, form) => axios.post(`/api/channels/${id}/posts`, form, api),
  deletePost: (id, postId) => axios.delete(`/api/channels/${id}/posts/${postId}`, api),
  react: (id, postId, emoji) => axios.put(`/api/channels/${id}/posts/${postId}/react`, { emoji }, api),
}
export const errorOf = (err) => err.response?.data?.error || 'Something went wrong. Try again.'

let timer = null
export const loadChannels = () => {
  clearTimeout(timer)
  return new Promise((resolve) => {
    timer = setTimeout(() => {
      channelsApi.mine().then((res) => useConversation.getState().setChannels(res.data)).catch(() => {}).finally(resolve)
    }, 150)
  })
}

// "my_channel" from "My Channel!"
export const handleFrom = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)

// Live channel events go to the open channel page through this
export const CHANNEL_EVENT = 'kova-channel'
