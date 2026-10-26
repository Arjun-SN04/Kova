import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSocket } from './SocketProvider'
import { useCall } from './CallProvider'
import { useAuth } from './AuthProvider'
import useConversation from '../Zustand/UserConversation'
import GroupCallScreen, { GroupCallRing } from '../home/call/GroupCallScreen'
import { playEndTone, startRingtone } from '../utils/callTones'

// Group voice/video calls: one WebRTC connection to each other person (up to 8 people).
// The socket server rings members and relays connection details; media goes browser to browser.

const GroupCallContext = createContext(null)
export const useGroupCall = () => useContext(GroupCallContext)

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ...(import.meta.env.VITE_TURN_URL
    ? [{ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }]
    : []),
]
const RING_MS = 30_000

const GroupCallProvider = ({ children }) => {
  const { socket } = useSocket()
  const { call: oneToOne } = useCall() || {}
  const [AuthUser] = useAuth()
  const [gcall, setGcall] = useState(null)            // { groupId, groupName, type, startedAt }
  const [peers, setPeers] = useState({})              // userId -> { stream, state }
  const [localStream, setLocalStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [ringing, setRinging] = useState(null)        // { groupId, groupName, type, from }
  const [active, setActive] = useState({})            // groupId -> { callId, type, participants }
  const [error, setError] = useState('')

  const gcallRef = useRef(null)
  const pcs = useRef({})                              // userId -> RTCPeerConnection
  const pendingIce = useRef({})                       // userId -> candidates waiting for the remote description
  const localRef = useRef(null)
  const stopTone = useRef(() => {})

  const setCall = (c) => { gcallRef.current = c; setGcall(c) }
  const groupOf = (id) => useConversation.getState().groups.find((g) => String(g._id) === String(id))

  const cleanup = useCallback(() => {
    Object.values(pcs.current).forEach((pc) => pc.close())
    pcs.current = {}; pendingIce.current = {}
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null
    setLocalStream(null); setPeers({}); setMuted(false); setCameraOff(false)
    setCall(null)
  }, [])

  const getMedia = async (type) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
    })
    localRef.current = stream
    setLocalStream(stream)
    return stream
  }

  const signal = (to, data) => socket?.emit('gcall:signal', { groupId: gcallRef.current?.groupId, to, data })

  const peerFor = (userId) => {
    if (pcs.current[userId]) return pcs.current[userId]
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcs.current[userId] = pc
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current))
    pc.onicecandidate = (e) => e.candidate && signal(userId, { candidate: e.candidate })
    pc.ontrack = (e) => setPeers((p) => ({ ...p, [userId]: { ...p[userId], stream: e.streams[0] } }))
    pc.onconnectionstatechange = () => setPeers((p) => ({ ...p, [userId]: { ...p[userId], state: pc.connectionState } }))
    setPeers((p) => ({ ...p, [userId]: { ...p[userId], state: 'connecting' } }))
    return pc
  }

  const dropPeer = (userId) => {
    pcs.current[userId]?.close()
    delete pcs.current[userId]; delete pendingIce.current[userId]
    setPeers((p) => { const next = { ...p }; delete next[userId]; return next })
  }

  // ── Actions ──
  const start = useCallback(async (group, type) => {
    if (!socket || gcallRef.current || oneToOne) return
    setError(''); setRinging(null); stopTone.current()
    setCall({ groupId: String(group._id), groupName: group.name, type, startedAt: null })
    try { await getMedia(type) } catch { cleanup(); return setError('Allow the microphone (and camera) to join the call') }
    socket.emit(active[String(group._id)]?.callId ? 'gcall:join' : 'gcall:start', { groupId: String(group._id), type })
  }, [socket, oneToOne, active, cleanup]) // eslint-disable-line react-hooks/exhaustive-deps

  const join = useCallback((groupId) => {
    const g = groupOf(groupId)
    const info = active[String(groupId)]
    if (g) start(g, info?.type || ringing?.type || 'voice')
  }, [active, ringing, start]) // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => {
    const c = gcallRef.current
    if (!c) return
    socket?.emit('gcall:leave', { groupId: c.groupId })
    playEndTone()
    cleanup()
  }, [socket, cleanup])

  const toggleMute = () => {
    const t = localRef.current?.getAudioTracks()[0]
    if (!t) return
    t.enabled = !t.enabled
    setMuted(!t.enabled)
  }
  const toggleCamera = () => {
    const t = localRef.current?.getVideoTracks()[0]
    if (!t) return
    t.enabled = !t.enabled
    setCameraOff(!t.enabled)
  }

  // ── Socket events ──
  useEffect(() => {
    if (!socket) return
    const onJoined = async ({ groupId, participants, type, startedAt }) => {
      const c = gcallRef.current
      if (c?.groupId !== groupId) return
      setCall({ ...c, type, startedAt })
      // I'm new: call everyone already there
      for (const p of participants) {
        const pc = peerFor(p)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        signal(p, { sdp: pc.localDescription })
      }
    }
    const onSignal = async ({ groupId, from, data }) => {
      if (gcallRef.current?.groupId !== groupId) return
      const pc = peerFor(from)
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp)
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            signal(from, { sdp: pc.localDescription })
          }
          for (const cand of (pendingIce.current[from] || []).splice(0)) await pc.addIceCandidate(cand).catch(() => {})
        } else if (data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {})
          else (pendingIce.current[from] ||= []).push(data.candidate)
        }
      } catch (err) {
        console.log('group call signal error:', err)
      }
    }
    const onPeerLeft = ({ groupId, userId }) => { if (gcallRef.current?.groupId === groupId) dropPeer(userId) }
    const onState = (s) => {
      setActive((a) => { const next = { ...a }; if (s.callId) next[s.groupId] = s; else delete next[s.groupId]; return next })
      if (!s.callId) setRinging((r) => { if (r?.groupId === s.groupId) { stopTone.current(); return null } return r })
    }
    const onRinging = (r) => {
      if (gcallRef.current || oneToOneRef.current) return
      setRinging(r)
      stopTone.current = startRingtone()
      setTimeout(() => setRinging((cur) => { if (cur?.groupId === r.groupId) { stopTone.current(); return null } return cur }), RING_MS)
    }
    const onError = ({ error: msg }) => { setError(msg); if (gcallRef.current && !gcallRef.current.startedAt) cleanup() }
    socket.on('gcall:joined', onJoined)
    socket.on('gcall:signal', onSignal)
    socket.on('gcall:peer-left', onPeerLeft)
    socket.on('gcall:state', onState)
    socket.on('gcall:ringing', onRinging)
    socket.on('gcall:error', onError)
    return () => {
      socket.off('gcall:joined', onJoined); socket.off('gcall:signal', onSignal); socket.off('gcall:peer-left', onPeerLeft)
      socket.off('gcall:state', onState); socket.off('gcall:ringing', onRinging); socket.off('gcall:error', onError)
    }
  }, [socket, cleanup]) // eslint-disable-line react-hooks/exhaustive-deps

  const oneToOneRef = useRef(oneToOne)
  useEffect(() => { oneToOneRef.current = oneToOne }, [oneToOne])

  // Leave the call if the page closes
  useEffect(() => {
    const onUnload = () => gcallRef.current && socket?.emit('gcall:leave', { groupId: gcallRef.current.groupId })
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [socket])

  // Ask the server which of my groups have a call going (e.g. after a reload)
  const queryGroup = useCallback((groupId) => socket?.emit('gcall:query', { groupId }), [socket])

  const value = { gcall, active, start, join, leave, queryGroup, error, clearError: () => setError('') }

  return (
    <GroupCallContext.Provider value={value}>
      {children}
      {ringing && !gcall && (
        <GroupCallRing ring={ringing} onJoin={() => { stopTone.current(); join(ringing.groupId) }} onDismiss={() => { stopTone.current(); setRinging(null) }} />
      )}
      {gcall && (
        <GroupCallScreen
          call={gcall}
          me={AuthUser}
          group={groupOf(gcall.groupId)}
          peers={peers}
          localStream={localStream}
          muted={muted}
          cameraOff={cameraOff}
          onMute={toggleMute}
          onCamera={toggleCamera}
          onLeave={leave}
        />
      )}
      {error && !gcall && (
        <div className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl" role="alert" onClick={() => setError('')}>{error}</div>
      )}
    </GroupCallContext.Provider>
  )
}

export default GroupCallProvider
