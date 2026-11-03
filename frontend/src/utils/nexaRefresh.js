import axios from 'axios'
import useConversation from '../Zustand/UserConversation'
import { loadConversations } from './conversations'
import { loadCommunities } from './groups'
import { loadChannels } from './channels'
import { loadStatusFeed } from './status'
import { loadRequests } from './contacts'

const api = { withCredentials: true }

// Nexa changed something in the app (new group, business turned on, profile…): reload what the
// rest of the screen shows. Runs from the global socket listener, so it works on any screen.
export const refreshAfterNexa = async (answer, setAuthUser) => {
  const done = (answer?.actions || []).filter((a) => a.type === 'app')
  if (!done.length) return
  loadConversations(); loadCommunities(); loadChannels(); loadStatusFeed(); loadRequests()
  axios.get('/api/contacts', api).then((r) => useConversation.getState().setContacts(r.data.contacts)).catch(() => {})
  if (setAuthUser && done.some((a) => a.refreshMe)) {
    try {
      const res = await axios.get('/api/user/me', api)
      localStorage.setItem('chatUser', JSON.stringify(res.data))
      setAuthUser(res.data)
    } catch { /* a 401 is handled globally */ }
  }
}
