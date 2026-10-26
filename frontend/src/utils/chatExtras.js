import axios from 'axios'
import useConversation from '../Zustand/UserConversation'

// Pinned chats, pinned messages, starred messages
const api = { withCredentials: true }
const store = () => useConversation.getState()

export const MAX_PINNED_CHATS = 5

export const togglePinChat = async (chatId) => {
  const id = String(chatId)
  const pinned = !store().pinnedChats.includes(id)
  try {
    const res = await axios.put(`/api/message/pin-chat/${id}`, { pinned }, api)
    store().setPinnedChats(res.data.pinnedChats)
    return { ok: true, pinned }
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || "Couldn't pin that chat" }
  }
}

export const toggleStar = async (messageId) => {
  const id = String(messageId)
  const on = !store().starredIds.includes(id)
  store().setStarred(id, on) // instant; undone if the server says no
  try {
    await axios.put(`/api/message/star/${id}`, { starred: on }, api)
  } catch {
    store().setStarred(id, !on)
  }
}

export const setMessagePinned = async (messageId, pinned) => {
  try {
    const res = await axios.put(`/api/message/pin/${messageId}`, { pinned }, api)
    store().setMessages((prev) => prev.map((m) => (m._id === res.data._id ? res.data : m)))
  } catch { /* the bar just won't change */ }
}

// ── Disappearing messages ──
export const TIMER_OPTIONS = [[0, 'Off'], [86400, '24 hours'], [7 * 86400, '7 days'], [90 * 86400, '90 days']]
export const timerLabel = (secs) => TIMER_OPTIONS.find(([s]) => s === secs)?.[1] || 'Off'
export const timerShort = (secs) => ({ 86400: '24h', 604800: '7d', 7776000: '90d' })[secs] || ''

export const loadChatTimer = async (chat) => {
  if (!chat?._id || chat.isAi || chat.isCommunity) return
  if (chat.isGroup) return store().setChatTimer(chat._id, chat.disappearAfter || 0)
  try {
    const res = await axios.get(`/api/message/disappear/${chat._id}`, api)
    store().setChatTimer(chat._id, res.data.seconds)
  } catch { /* leave as is */ }
}

export const saveChatTimer = async (chat, seconds) => {
  const before = store().chatTimers[String(chat._id)] || 0
  store().setChatTimer(chat._id, seconds)
  try {
    await axios.put(`/api/message/disappear/${chat._id}`, { seconds, isGroup: !!chat.isGroup }, api)
    return { ok: true }
  } catch (err) {
    store().setChatTimer(chat._id, before)
    return { ok: false, error: err.response?.data?.error || "Couldn't change it" }
  }
}

export const setKept = async (message, kept) => {
  try {
    const res = await axios.put(`/api/message/keep/${message._id}`, { kept }, api)
    store().setMessages((prev) => prev.map((m) => (m._id === res.data._id ? res.data : m)))
  } catch { /* unchanged */ }
}
