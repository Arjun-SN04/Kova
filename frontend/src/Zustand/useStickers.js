import { create } from 'zustand'
import axios from 'axios'

const api = { withCredentials: true }
const errorOf = (err, fallback) => err.response?.data?.error || fallback
let noticeTimer

// My saved GIFs / stickers and the stickers I made, plus the sticker maker's state.
// `list` is newest first: [{ _id, kind: 'gif' | 'sticker', url, title, width, height, mine }]
const useStickers = create((set, get) => ({
  list: null,
  loading: false,
  maker: null, // { src } while the sticker maker is open (src: a photo to start from, or null)
  notice: '',

  load: async (force = false) => {
    if ((get().list && !force) || get().loading) return
    set({ loading: true })
    try {
      const res = await axios.get('/api/gifs/stickers', api)
      set({ list: res.data.stickers })
    } catch (err) {
      console.log('stickers load error:', err.message)
      if (!get().list) set({ list: [] })
    } finally {
      set({ loading: false })
    }
  },

  // From a chat message ({ messageId }) or from the picker ({ media })
  save: async (body) => {
    try {
      const res = await axios.post('/api/gifs/stickers/save', body, api)
      set({ list: res.data.stickers })
      get().say(body.media?.kind === 'gif' ? 'GIF saved' : 'Saved to your stickers')
      return true
    } catch (err) {
      get().say(errorOf(err, "Couldn't save it"))
      return false
    }
  },

  remove: async (id) => {
    const prev = get().list || []
    set({ list: prev.filter((s) => s._id !== id) })
    try {
      const res = await axios.delete(`/api/gifs/stickers/${id}`, api)
      set({ list: res.data.stickers })
    } catch (err) {
      set({ list: prev })
      get().say(errorOf(err, "Couldn't remove it"))
    }
  },

  // Upload a sticker from the maker. Returns the new sticker, or throws a message.
  create: async (blob, title = '') => {
    const form = new FormData()
    const ext = blob.type === 'image/png' ? 'png' : 'webp'
    form.append('file', new File([blob], `sticker.${ext}`, { type: blob.type }))
    form.append('title', title)
    try {
      const res = await axios.post('/api/gifs/stickers', form, api)
      set({ list: res.data.stickers })
      return res.data.sticker
    } catch (err) {
      throw new Error(errorOf(err, "Couldn't save your sticker"))
    }
  },

  isSaved: (url) => !!get().list?.some((s) => s.url === url),

  openMaker: (src = null) => set({ maker: { src } }),
  closeMaker: () => set({ maker: null }),

  say: (notice) => {
    clearTimeout(noticeTimer)
    set({ notice })
    noticeTimer = setTimeout(() => set({ notice: '' }), 2200)
  },
}))

export default useStickers
