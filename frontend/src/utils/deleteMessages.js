import axios from 'axios'

// mode 'everyone': deleted for all (and files freed on Cloudinary); 'me': hidden from my view only.
// Returns { ok, gone: [ids removed from my view], error }
export const deleteMessagesFor = async (ids, mode) => {
  const list = [...new Set(ids.map(String))]
  if (!list.length) return { ok: true, gone: [] }
  try {
    if (mode === 'everyone') {
      const res = await axios.post('/api/message/delete-many', { ids: list }, { withCredentials: true })
      return { ok: true, gone: res.data.deleted.map(String) }
    }
    const res = await axios.post('/api/message/delete-for-me', { ids: list }, { withCredentials: true })
    return { ok: true, gone: res.data.hidden.map(String) }
  } catch (err) {
    return { ok: false, gone: [], error: err.response?.data?.error || "Couldn't delete. Try again." }
  }
}

// Same rule as the server: your own messages, plus Nexa answers you may remove
// (in your chats, or in a group when you asked the question or you're an admin)
export const canDeleteForEveryone = (m, { myId, nexaId, messages = [], chat = null }) => {
  const me = String(myId)
  if (String(m.senderId) === me) return true
  if (!nexaId || String(m.senderId) !== String(nexaId)) return false
  if (m.botChat?.some((id) => String(id) === me)) return true
  if (!m.groupId) return false
  if (chat?.admins?.some((a) => String(a._id ?? a) === me)) return true
  const asked = m.replyTo && messages.find((x) => String(x._id) === String(m.replyTo))
  return !!asked && String(asked.senderId) === me
}
