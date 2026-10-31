import axios from 'axios'
import { canDeleteForEveryone, deleteMessagesFor } from './deleteMessages'

// Turns a chat's loaded messages into the items the media manager shows.
// Item: { id, messageId, tab: media|docs|links|voice, kind, url, name, size, width, height,
//         duration, date, from, deletable, actionId?, title?, host? }

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi
const api = { withCredentials: true }

export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const linksIn = (text = '') => [...new Set((String(text).match(URL_RE) || []).map((u) => u.replace(/[.,;:!?]+$/, '')))]

const tabOf = (a) =>
  a.kind === 'image' || a.kind === 'video' || a.kind === 'gif' ? 'media'
    : a.kind === 'audio' || a.mimeType?.startsWith('audio/') ? 'voice'
      : a.kind === 'sticker' ? null
        : 'docs'

const fromAttachment = (a, base) => ({
  ...base,
  tab: tabOf(a),
  kind: a.kind === 'gif' ? 'image' : a.mimeType?.startsWith('audio/') ? 'audio' : a.kind,
  url: a.url,
  name: a.name,
  size: a.size,
  width: a.width,
  height: a.height,
  duration: a.duration,
  resourceType: a.resourceType,
})

// Normal and group chats
export const chatMediaItems = (messages, { myId, nameOf = () => '', nexaId = null, chat = null }) => {
  const out = []
  for (const m of messages) {
    if (!m?._id || String(m._id).startsWith('temp-')) continue
    const mine = canDeleteForEveryone(m, { myId, nexaId, messages, chat })
    const base = { messageId: String(m._id), date: m.createdAt, from: String(m.senderId) === String(myId) ? 'You' : nexaId && String(m.senderId) === String(nexaId) ? 'Nexa' : nameOf(m.senderId), deletable: true, mine }
    if (m.attachment?.url) {
      const item = fromAttachment(m.attachment, { ...base, id: `${m._id}:file` })
      if (item.tab) out.push(item)
    }
    linksIn(m.message).forEach((url, i) => out.push({ ...base, id: `${m._id}:link${i}`, tab: 'links', kind: 'link', url, host: hostOf(url), title: m.message }))
  }
  return out.reverse() // newest first
}

// mode 'everyone' (only your own messages; files are freed on Cloudinary) or 'me' (hide from your view)
export const deleteChatItems = async (items, mode = 'me') => {
  const ids = [...new Set(items.map((i) => i.messageId))]
  if (mode === 'everyone' && items.some((i) => !i.mine)) return { ok: false, error: 'You can only delete your own messages for everyone.' }
  const res = await deleteMessagesFor(ids, mode)
  return { ok: res.ok, deletedMessages: res.gone, error: res.error }
}

// Nexa: files you sent, images Nexa made, and links (web sources and links in messages)
export const nexaMediaItems = (messages) => {
  const out = []
  for (const m of messages) {
    if (!m?._id || String(m._id).startsWith('temp-')) continue
    const base = { messageId: String(m._id), date: m.createdAt, from: m.role === 'user' ? 'You' : 'Nexa', deletable: true }
    if (m.attachment?.url) {
      const item = fromAttachment(m.attachment, { ...base, id: `${m._id}:file` })
      if (item.tab) out.push(item)
    }
    for (const a of m.actions || []) {
      if (a?.type === 'image' && a.url) {
        out.push({ ...base, id: `${m._id}:img:${a.id}`, actionId: a.id, tab: 'media', kind: 'image', url: a.url, name: a.prompt, width: a.width, height: a.height, from: 'Nexa' })
      }
      if (a?.type === 'sources') {
        (a.items || []).forEach((s, i) => out.push({ ...base, id: `${m._id}:src${i}`, tab: 'links', kind: 'link', url: s.url, host: hostOf(s.url), title: s.title, source: true }))
      }
    }
    linksIn(m.content).forEach((url, i) => out.push({ ...base, id: `${m._id}:link${i}`, tab: 'links', kind: 'link', url, host: hostOf(url), title: m.content }))
  }
  // The same link can appear in several answers: keep the newest
  const seen = new Set()
  return out.reverse().filter((i) => (i.tab !== 'links' ? true : !seen.has(i.url) && seen.add(i.url)))
}

// Files and images: just that file goes (the message text stays). Links: the message goes.
export const deleteNexaItems = async (items) => {
  const deletedMessages = []
  const updated = []
  try {
    const files = items.filter((i) => i.tab !== 'links')
    const linkMessages = [...new Set(items.filter((i) => i.tab === 'links').map((i) => i.messageId))]
    for (const i of files) {
      if (deletedMessages.includes(i.messageId)) continue
      const res = await axios.delete(`/api/ai/messages/${i.messageId}/file`, { ...api, params: i.actionId ? { action: i.actionId } : {} })
      if (res.data.deleted) deletedMessages.push(String(res.data.deleted))
      else updated.push(res.data.message)
    }
    for (const id of linkMessages) {
      if (deletedMessages.includes(id)) continue
      await axios.delete(`/api/ai/messages/${id}`, api)
      deletedMessages.push(id)
    }
    return { ok: true, deletedMessages, updated }
  } catch (err) {
    return { ok: false, error: err.response?.data?.error || "Couldn't delete. Try again.", deletedMessages, updated }
  }
}
