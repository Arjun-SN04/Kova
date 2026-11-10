import axios from 'axios'
import useConversation from '../Zustand/UserConversation'
import { sendUrl } from './groups'
import { loadConversations } from './conversations'

// Messages on their way: they show in the chat straight away (with a clock), and if sending
// fails they stay as "Not sent · Tap to retry". Messages typed while offline wait here and
// go out when the connection is back (also after a reload: text, GIFs and stickers are
// saved in this browser until they're sent). Files are sent directly with a progress bar.
//
// Each message carries a clientId, so sending it again after a lost answer can't make a copy.

const KEY = 'kova-outbox'
let owner = null       // whose outbox this is (a user id)
let items = []         // [{ clientId, chat: { _id, isGroup }, body, createdAt, state: 'sending'|'failed', error }]
const listeners = new Set()

const save = () => {
  try { localStorage.setItem(`${KEY}:${owner}`, JSON.stringify(items.map((x) => ({ clientId: x.clientId, chat: x.chat, body: x.body, createdAt: x.createdAt, final: x.final })))) } catch { /* private mode */ }
}
const notify = () => listeners.forEach((fn) => fn())

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

// The bubble shown for an outbox item in its chat
export const tempMessage = (item, myId) => ({
  _id: `temp-${item.clientId}`,
  clientId: item.clientId,
  senderId: myId,
  receiverId: item.chat.isGroup ? null : item.chat._id,
  groupId: item.chat.isGroup ? item.chat._id : null,
  message: item.body.message || '',
  replyTo: item.body.replyTo || null,
  attachment: item.body.media ? { kind: item.body.media.kind, url: item.body.media.url, name: item.body.media.title, width: item.body.media.width, height: item.body.media.height } : null,
  createdAt: item.createdAt,
  sendState: item.state,
  sendError: item.error || null,
})

const isOpen = (chat) => String(useConversation.getState().selectedConversation?._id) === String(chat._id)

// Show the latest state of an item in the open chat
const showInChat = (item, myId) => {
  if (!isOpen(item.chat)) return
  const temp = tempMessage(item, myId)
  useConversation.getState().setMessages((prev) => {
    const i = prev.findIndex((m) => m._id === temp._id)
    if (i === -1) return [...prev, temp]
    const next = [...prev]
    next[i] = temp
    return next
  })
}

// Swap the bubble for the real message the server saved
const settle = (item, saved) => {
  items = items.filter((x) => x.clientId !== item.clientId)
  save(); notify()
  if (isOpen(item.chat)) {
    useConversation.getState().setMessages((prev) => {
      const without = prev.filter((m) => m._id !== `temp-${item.clientId}` && String(m._id) !== String(saved._id))
      return [...without, saved]
    })
  }
  useConversation.getState().upsertPreview?.(item.chat._id, saved)
}

const offlineError = "You're offline. It will be sent when you're back online."

const attempt = async (item, myId) => {
  item.state = 'sending'
  item.error = null
  showInChat(item, myId)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    item.state = 'failed'; item.error = offlineError
    return showInChat(item, myId)
  }
  try {
    const res = await axios.post(sendUrl(item.chat), { ...item.body, clientId: item.clientId }, { withCredentials: true })
    settle(item, res.data)
    loadConversations()
    return null
  } catch (err) {
    // No answer at all: the network dropped. Keep it and try again later.
    const offline = !err.response
    item.state = 'failed'
    item.error = offline ? offlineError : err.response?.data?.error || "Couldn't send. Tap to retry."
    // The server refused it for good (not a contact any more, blocked…): don't keep retrying it
    if (!offline && err.response.status < 500 && err.response.status !== 429) item.final = true
    save(); notify()
    showInChat(item, myId)
    return item.error
  }
}

// Send a text / GIF / sticker message. Returns null, or the error if it failed straight away.
export const sendQueued = (chat, body, myId) => {
  const item = { clientId: newId(), chat: { _id: String(chat._id), isGroup: !!chat.isGroup }, body, createdAt: new Date().toISOString(), state: 'sending' }
  items.push(item)
  save(); notify()
  return attempt(item, myId)
}

export const retry = (clientId, myId) => {
  const item = items.find((x) => x.clientId === clientId)
  if (item) { item.final = false; attempt(item, myId) }
}

export const discard = (clientId) => {
  const item = items.find((x) => x.clientId === clientId)
  items = items.filter((x) => x.clientId !== clientId)
  save(); notify()
  if (item && isOpen(item.chat)) useConversation.getState().setMessages((prev) => prev.filter((m) => m._id !== `temp-${clientId}`))
}

// Bubbles for a chat that was just loaded (they aren't on the server yet)
export const pendingFor = (chatId, myId = owner) =>
  items.filter((x) => String(x.chat._id) === String(chatId)).map((x) => tempMessage(x, myId))

// Try everything that's waiting (back online, socket reconnected, app opened)
let flushing = false
export const flush = async (myId) => {
  if (flushing || !items.length) return
  flushing = true
  try {
    for (const item of [...items]) {
      if (item.state === 'sending' && item.inFlight) continue
      if (item.final) continue
      item.inFlight = true
      await attempt(item, myId)
      item.inFlight = false
    }
  } finally {
    flushing = false
  }
}

// Load this user's waiting messages (after sign-in / reload)
export const startOutbox = (myId) => {
  if (owner === String(myId)) return
  owner = String(myId)
  try { items = JSON.parse(localStorage.getItem(`${KEY}:${owner}`) || '[]').map((x) => ({ ...x, state: 'failed', error: offlineError })) } catch { items = [] }
  notify()
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const outboxCount = () => items.length

// Signed out: forget the waiting messages kept in memory
export const resetOutbox = () => { owner = null; items = []; notify() }
