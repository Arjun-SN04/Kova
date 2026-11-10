import axios from 'axios'
import useConversation from '../Zustand/UserConversation'

export const loadCalls = async () => {
  try {
    const res = await axios.get('/api/calls', { withCredentials: true })
    useConversation.getState().setCalls(res.data.calls)
  } catch (err) {
    console.log('loadCalls error:', err)
  }
}

export const formatCallDuration = (seconds = 0) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// How a call reads from my side. `outgoing` = I made the call.
// Returns { title, detail, missed } e.g. { title: 'Missed voice call', detail: 'Tap to call back', missed: true }
export const describeCall = (call, outgoing) => {
  const kind = call.type === 'video' ? 'video' : 'voice'
  const Kind = kind === 'video' ? 'Video' : 'Voice'
  // Group calls: "ongoing" while it lasts, then "ended" with how long it went on
  if (call.status === 'ongoing') return { title: `${Kind} call · ongoing`, detail: 'Tap Join to go in', missed: false }
  if (call.status === 'ended') return { title: `Group ${kind} call`, detail: formatCallDuration(call.duration), missed: false }
  if (call.status === 'answered') return { title: `${Kind} call`, detail: formatCallDuration(call.duration), missed: false }
  if (outgoing) return { title: `${Kind} call`, detail: call.status === 'declined' ? 'Declined' : 'No answer', missed: false }
  return { title: call.status === 'declined' ? `Declined ${kind} call` : `Missed ${kind} call`, detail: 'Call back', missed: call.status === 'missed' }
}
