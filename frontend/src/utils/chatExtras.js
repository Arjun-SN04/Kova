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

// Notifications off for a chat: duration "8h" | "1w" | "always" | "off"
export const muteChat = async (chatId, duration) => {
  try {
    const res = await axios.put(`/api/message/mute-chat/${chatId}`, { duration }, api)
    store().setMutedChats(res.data.mutedChats)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || "Couldn't change notifications for that chat" }
  }
}

// Move chats to / out of Archived
export const setArchived = async (chatIds, archived) => {
  const ids = (Array.isArray(chatIds) ? chatIds : [chatIds]).map(String)
  try {
    const res = await axios.put(`/api/message/archive-chat/${ids[0]}`, { ids, archived }, api)
    store().setArchivedChats(res.data.archivedChats)
    store().setPinnedChats(res.data.pinnedChats)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || "Couldn't archive that chat" }
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

// ── Locked chats ──
// Lock (code only needed the first time, to set it) or unlock (code required)
export const setChatLocked = async (chatId, locked, code, qa = {}) => {
  try {
    const res = await axios.put(`/api/message/lock-chat/${chatId}`, { locked, code, ...qa }, api)
    store().setLockedPrefs({ ...res.data, ...(qa.question && !store().securityQuestion ? { securityQuestion: qa.question } : {}) })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || "Couldn't change that chat" }
  }
}
export const verifyLockCode = async (code) => {
  try { await axios.post('/api/message/locked/verify', { code }, api); return { ok: true } } catch (err) { return { ok: false, error: err.response?.data?.error || 'Try again' } }
}
// Forgot the code: set a new one. proof = { answer } (security question) or { password } (account)
export const resetLockCode = async (proof, code) => {
  try { const res = await axios.post('/api/message/locked/reset', { ...proof, code }, api); store().setLockedPrefs(res.data); return { ok: true } } catch (err) { return { ok: false, error: err.response?.data?.error || 'Try again' } }
}
// Change the code (current needed only if there is one already). qa = { question, answer } to set the security question too
export const changeLockCode = async (current, code, qa = {}) => {
  try { const res = await axios.put('/api/message/locked/code', { current, code, ...qa }, api); store().setLockedPrefs({ ...res.data, ...(qa.question && !store().securityQuestion ? { securityQuestion: qa.question } : {}) }); return { ok: true } } catch (err) { return { ok: false, error: err.response?.data?.error || 'Try again' } }
}

// ── Hidden chats ──
// Same as the server: SHA-256 of "userId:word" (trimmed, lower-case), as hex
export const hashHiddenWord = async (userId, word) => {
  const data = new TextEncoder().encode(`${userId}:${String(word).trim().toLowerCase()}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export const setChatHidden = async (chatId, hidden) => {
  try {
    const res = await axios.put(`/api/message/hide-chat/${chatId}`, { hidden }, api)
    store().setHiddenPrefs(res.data)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || "Couldn't change that chat" }
  }
}
// word: new word, or null to turn off. To change an existing word pass { current }, or { answer } / { password } if forgotten
export const saveHiddenWord = async (word, proof = {}) => {
  try {
    const res = await axios.put('/api/message/hidden-word', { word, ...proof }, api)
    store().setHiddenPrefs(res.data)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || 'Could not save' }
  }
}

// ── Security question ──
// For a forgotten app lock PIN: check { answer } or { password } on the server
export const verifyRecovery = async (proof) => {
  try { await axios.post('/api/user/security/verify', proof, api); return { ok: true } } catch (err) { return { ok: false, error: err.response?.data?.error || 'Try again' } }
}
// Set or change it. Needs { password } once a question or lock code exists.
export const saveSecurityQuestion = async ({ question, answer, password }) => {
  try { const res = await axios.put('/api/user/security/question', { question, answer, password }, api); store().setLockedPrefs(res.data); return { ok: true } } catch (err) { return { ok: false, error: err.response?.data?.error || 'Could not save' } }
}
