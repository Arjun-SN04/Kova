import useConversation from '../Zustand/UserConversation'
import { attachmentLabel } from './attachments'

// Notifications while Kova is open but you're not looking at it (another tab,
// another app, or a different chat in the background). The server only sends
// push when you're offline, so this covers the time you're online.

const store = () => useConversation.getState()
// mutedChats: { chatId: until (ISO) or null for always }
export const isMuted = (mutedChats, chatId) => {
  const key = String(chatId)
  if (!mutedChats || !(key in mutedChats)) return false
  const until = mutedChats[key]
  return !until || new Date(until) > new Date()
}
const same = (a, b) => String(a) === String(b)

const textOf = (m) => {
  if (m.call) return m.call.status === 'missed' ? `Missed ${m.call.type === 'video' ? 'video' : 'voice'} call` : ''
  if (m.poll) return `📊 ${m.poll.question}`
  if (m.location) return '📍 Location'
  if (m.message) return m.message.length > 140 ? `${m.message.slice(0, 137)}…` : m.message
  return attachmentLabel(m.attachment) || 'New message'
}

const nameOf = (id) => {
  const s = store()
  const contact = s.contacts.find((c) => same(c._id, id))
  if (contact) return contact.fullName
  const person = s.groupPeople?.[String(id)]
  if (person?.fullName) return person.fullName
  // Group members, when the group list includes them
  for (const g of s.groups) {
    const m = (g.members || []).find((x) => typeof x === 'object' && same(x._id, id))
    if (m?.fullName) return m.fullName
  }
  return null
}

const show = async (title, options, onClick) => {
  try {
    const n = new Notification(title, options)
    n.onclick = () => { window.focus(); onClick?.(); n.close() }
  } catch {
    // Android Chrome only allows notifications through the service worker
    const reg = await navigator.serviceWorker?.getRegistration('/sw.js')
    await reg?.showNotification(title, options)
  }
}

export const notifyLocally = (message, { chatId, groupId, myId }) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (same(message.senderId, myId)) return
  if (message.call && message.call.status !== 'missed') return
  // Only when you aren't already reading this chat
  const looking = document.visibilityState === 'visible' && document.hasFocus()
  if (looking && same(store().selectedConversation?._id, chatId)) return
  if (looking) return // the chat list already shows it as unread

  const s = store()
  // Muted chat: no notification (missed calls still show)
  if (!message.call && isMuted(s.mutedChats, chatId)) return
  const secret = s.lockedChats.includes(String(chatId)) || s.hiddenChats.includes(String(chatId))
  const group = groupId ? s.groups.find((g) => same(g._id, groupId)) : null
  const sender = nameOf(message.senderId) || 'Someone'
  const body = textOf(message)
  if (!body) return

  const options = secret
    ? { body: 'New message', tag: 'locked', icon: '/icon-192.png', badge: '/icon-192.png' }
    : { body: group ? `${sender.split(' ')[0]}: ${body}` : body, tag: `chat-${chatId}`, renotify: true, icon: '/icon-192.png', badge: '/icon-192.png' }
  const title = secret ? 'Kova' : group?.name || sender

  show(title, options, () => {
    if (secret) return
    const target = group || s.contacts.find((c) => same(c._id, chatId))
    if (target) store().setSelectedConversation(target)
  })
}
