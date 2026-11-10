import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSocket } from './SocketProvider'
import { useCall } from './CallProvider'
import { useAuth } from './AuthProvider'
import useConversation from '../Zustand/UserConversation'
// Downloaded when a group call starts or rings
const GroupCallScreen = lazy(() => import('../home/call/GroupCallScreen'))
const GroupCallRing = lazy(() => import('../home/call/GroupCallScreen').then((m) => ({ default: m.GroupCallRing })))
import { playEndTone, startRingtone } from '../utils/callTones'
import { cameraTrack, replaceVideoTrack, screenTrack } from '../utils/callMedia'
import { currentIceServers, getIceServers } from '../utils/iceServers'

// Group voice/video calls: one WebRTC connection to each other person (up to 8 people).
// The socket server rings people and relays connection details; media goes browser to browser.
// A call is either a group's call (key = group id) or an ad-hoc one ("room:<id>") made when
// someone adds people to a one-to-one call.

const GroupCallContext = createContext(null)
export const useGroupCall = () => useContext(GroupCallContext)

const RING_MS = 30_000
const isRoom = (key) => String(key || '').startsWith('room:')

const GroupCallProvider = ({ children }) => {
  const { socket } = useSocket()
  const { call: oneToOne, handOff } = useCall() || {}
  const [AuthUser] = useAuth()
  const [gcall, setGcall] = useState(null)            // { groupId, groupName, type, startedAt, room }
  const [peers, setPeers] = useState({})              // userId -> { stream, state, media: { muted, cameraOff, sharing } }
  const [profiles, setProfiles] = useState({})        // userId -> { fullName, avatar }
  const [localStream, setLocalStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [facing, setFacing] = useState('user')
  const [minimized, setMinimized] = useState(false)
  const [ringing, setRinging] = useState(null)        // { groupId, groupName, type, from, room }
  const [rejoin, setRejoin] = useState(null)          // a call I left or dropped out of: { groupId, groupName, type, room }
  const [active, setActive] = useState({})            // groupId -> { callId, type, participants }
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const gcallRef = useRef(null)
  const pcs = useRef({})                              // userId -> RTCPeerConnection
  const pendingIce = useRef({})                       // userId -> candidates waiting for the remote description
  const localRef = useRef(null)
  const cameraBackup = useRef(null)                   // camera track while my screen is shared
  const stopTone = useRef(() => {})

  const setCall = (c) => { gcallRef.current = c; setGcall(c) }
  const groupOf = (id) => useConversation.getState().groups.find((g) => String(g._id) === String(id))

  const cleanup = useCallback(() => {
    Object.values(pcs.current).forEach((pc) => pc.close())
    pcs.current = {}; pendingIce.current = {}
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null
    cameraBackup.current?.stop(); cameraBackup.current = null
    setLocalStream(null); setPeers({}); setProfiles({}); setMuted(false); setCameraOff(false); setSharing(false); setFacing('user'); setMinimized(false)
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
  // My mute / camera / sharing state, shown on my tile for everyone
  const sendMedia = () => {
    const c = gcallRef.current
    if (!c) return
    socket?.emit('gcall:media', {
      groupId: c.groupId,
      muted: localRef.current?.getAudioTracks()[0]?.enabled === false,
      cameraOff: localRef.current?.getVideoTracks()[0]?.enabled === false,
      sharing: !!cameraBackup.current,
    })
  }

  const peerFor = (userId) => {
    if (pcs.current[userId]) return pcs.current[userId]
    const pc = new RTCPeerConnection({ iceServers: currentIceServers() })
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
  // Join (or start) a call. target: { key, name, type, room }
  const enter = useCallback(async ({ key, name, type, room = false }, { force = false } = {}) => {
    if (!socket || gcallRef.current || (oneToOneRef.current && !force)) return
    setError(''); setRinging(null); setRejoin(null); stopTone.current()
    setCall({ groupId: String(key), groupName: name, type, startedAt: null, room })
    try { await Promise.all([getMedia(type), getIceServers()]) } catch { cleanup(); return setError('Allow the microphone (and camera) to join the call') }
    socket.emit(room || activeRef.current[String(key)]?.callId ? 'gcall:join' : 'gcall:start', { groupId: String(key), type })
  }, [socket, cleanup]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback((group, type) => enter({ key: group._id, name: group.name, type }), [enter])

  const join = useCallback((groupId) => {
    const info = active[String(groupId)]
    const hint = [ringing, rejoin].find((r) => r?.groupId === groupId)
    const type = info?.type || hint?.type || 'voice'
    if (isRoom(groupId)) return enter({ key: groupId, name: hint?.groupName || info?.name || 'Call', type, room: true })
    const g = groupOf(groupId)
    const name = g?.name || hint?.groupName || info?.name
    if (name) enter({ key: groupId, name, type })
  }, [active, ringing, rejoin, enter]) // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => {
    const c = gcallRef.current
    if (!c) return
    socket?.emit('gcall:leave', { groupId: c.groupId })
    playEndTone()
    cleanup()
    // Shown while the others are still in the call, so I can go back in
    setRejoin({ groupId: c.groupId, groupName: c.groupName, type: c.type, room: !!c.room })
  }, [socket, cleanup])

  const toggleMute = () => {
    const t = localRef.current?.getAudioTracks()[0]
    if (!t) return
    t.enabled = !t.enabled
    setMuted(!t.enabled)
    sendMedia()
  }
  const toggleCamera = () => {
    const t = localRef.current?.getVideoTracks()[0]
    if (!t) return
    t.enabled = !t.enabled
    setCameraOff(!t.enabled)
    sendMedia()
  }

  // Put a new video track in my stream and send it to everyone
  const swapVideo = async (track) => {
    const stream = localRef.current
    const old = stream?.getVideoTracks()[0]
    if (!stream || !old) return null
    stream.removeTrack(old)
    stream.addTrack(track)
    await replaceVideoTrack(Object.values(pcs.current), track)
    setLocalStream(new MediaStream(stream.getTracks()))
    return old
  }
  const flipCamera = async () => {
    if (gcallRef.current?.type !== 'video' || cameraBackup.current) return
    const next = facing === 'user' ? 'environment' : 'user'
    try {
      const track = await cameraTrack(next)
      track.enabled = !cameraOff
      ;(await swapVideo(track))?.stop()
      setFacing(next)
    } catch { /* no second camera */ }
  }
  const toggleShare = async () => {
    if (gcallRef.current?.type !== 'video') return
    if (cameraBackup.current) {
      const camera = cameraBackup.current
      cameraBackup.current = null
      ;(await swapVideo(camera))?.stop()
      setSharing(false)
      return sendMedia()
    }
    const track = await screenTrack()
    if (!track || !gcallRef.current) return track?.stop()
    track.onended = () => { if (cameraBackup.current) toggleShare() }
    cameraBackup.current = await swapVideo(track)
    setSharing(true)
    sendMedia()
  }

  // Ring more people into this call
  const addPeople = (userIds) => {
    const c = gcallRef.current
    if (c && userIds.length) socket?.emit('gcall:add', { groupId: c.groupId, userIds })
  }

  // ── Socket events ──
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])
  const oneToOneRef = useRef(oneToOne)
  useEffect(() => { oneToOneRef.current = oneToOne }, [oneToOne])
  const handOffRef = useRef(handOff)
  useEffect(() => { handOffRef.current = handOff }, [handOff])

  useEffect(() => {
    if (!socket) return
    const onJoined = async ({ groupId, participants, type, startedAt, name, profiles: list }) => {
      const c = gcallRef.current
      if (c?.groupId !== groupId) return
      setCall({ ...c, type, startedAt, groupName: name || c.groupName })
      if (list) setProfiles(list)
      // I'm new: call everyone already there (fresh connections, also when rejoining)
      for (const p of participants) {
        dropPeer(p)
        const pc = peerFor(p)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        signal(p, { sdp: pc.localDescription })
      }
      sendMedia()
    }
    const onPeerJoined = ({ groupId, userId, profile }) => {
      if (gcallRef.current?.groupId !== groupId) return
      // Someone rejoining: forget the old connection, they'll offer a new one
      dropPeer(userId)
      if (profile) setProfiles((p) => ({ ...p, [userId]: profile }))
      setNotice(`${profile?.fullName?.split(' ')[0] || 'Someone'} joined`)
      // Let the newcomer see if I'm muted / sharing
      setTimeout(sendMedia, 1500)
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
    const onMedia = ({ groupId, userId, ...media }) => {
      if (gcallRef.current?.groupId === groupId) setPeers((p) => (p[userId] ? { ...p, [userId]: { ...p[userId], media } } : p))
    }
    const onPeerLeft = ({ groupId, userId }) => {
      if (gcallRef.current?.groupId !== groupId) return
      dropPeer(userId)
      setProfiles((p) => { if (p[userId]) setNotice(`${p[userId].fullName?.split(' ')[0] || 'Someone'} left`); return p })
    }
    // Their app closed or lost its connection; shown only if the media stopped too
    const onPeerAway = ({ groupId, userId }) => {
      if (gcallRef.current?.groupId !== groupId || pcs.current[userId]?.connectionState === 'connected') return
      setPeers((p) => (p[userId] ? { ...p, [userId]: { ...p[userId], state: 'disconnected' } } : p))
    }
    // I dropped out of a call that's keeping my place
    const onRejoin = (info) => {
      const c = gcallRef.current
      if (c?.groupId === info.groupId) {
        // Same tab, back after a short drop: keep going if the media still works, otherwise reconnect
        const pcList = Object.values(pcs.current)
        const working = pcList.length > 0 && pcList.every((pc) => pc.connectionState === 'connected')
        socket.emit(working ? 'gcall:resume' : 'gcall:join', { groupId: info.groupId })
        return
      }
      if (!c) setRejoin(info)
    }
    const onState = (s) => {
      setActive((a) => { const next = { ...a }; if (s.callId) next[s.groupId] = s; else delete next[s.groupId]; return next })
      const meIn = s.participants?.map(String).includes(String(AuthUser?._id))
      // Call over, or I joined it from another tab: stop ringing here
      if (!s.callId || meIn) setRinging((r) => { if (r?.groupId === s.groupId && !gcallRef.current) { stopTone.current(); return null } return r })
      if (!s.callId) setRejoin((r) => (r?.groupId === s.groupId ? null : r))
      if (s.profiles && gcallRef.current?.groupId === s.groupId) setProfiles((p) => ({ ...s.profiles, ...p }))
    }
    const onRinging = (r) => {
      if (gcallRef.current || oneToOneRef.current) return
      setRinging(r)
      stopTone.current = startRingtone()
      setTimeout(() => setRinging((cur) => { if (cur?.groupId === r.groupId) { stopTone.current(); return null } return cur }), RING_MS)
    }
    // Someone added people to my one-to-one call: carry on in the new group call
    const onMoved = ({ groupId, groupName, type }) => {
      handOffRef.current?.()
      oneToOneRef.current = null
      enter({ key: groupId, name: groupName, type, room: true }, { force: true })
    }
    const onAdded = ({ userIds }) => setNotice(`Ringing ${userIds.length} ${userIds.length === 1 ? 'person' : 'people'}…`)
    const onError = ({ error: msg }) => {
      if (gcallRef.current?.startedAt) return setNotice(msg)
      setError(msg)
      if (gcallRef.current) cleanup()
    }
    socket.on('gcall:joined', onJoined)
    socket.on('gcall:peer-joined', onPeerJoined)
    socket.on('gcall:signal', onSignal)
    socket.on('gcall:media', onMedia)
    socket.on('gcall:peer-left', onPeerLeft)
    socket.on('gcall:state', onState)
    socket.on('gcall:ringing', onRinging)
    socket.on('gcall:moved', onMoved)
    socket.on('gcall:added', onAdded)
    socket.on('gcall:error', onError)
    socket.on('gcall:peer-away', onPeerAway)
    socket.on('gcall:rejoin', onRejoin)
    return () => {
      socket.off('gcall:peer-away', onPeerAway); socket.off('gcall:rejoin', onRejoin)
      socket.off('gcall:joined', onJoined); socket.off('gcall:peer-joined', onPeerJoined); socket.off('gcall:signal', onSignal)
      socket.off('gcall:media', onMedia); socket.off('gcall:peer-left', onPeerLeft); socket.off('gcall:state', onState)
      socket.off('gcall:ringing', onRinging); socket.off('gcall:moved', onMoved); socket.off('gcall:added', onAdded); socket.off('gcall:error', onError)
    }
  }, [socket, cleanup, enter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Short "Priya joined" notes fade on their own
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(t)
  }, [notice])

  // Closing the page by mistake doesn't leave the call: the server keeps my place for a
  // couple of minutes and offers to rejoin when the app opens again. Still, warn first.
  useEffect(() => {
    if (!gcall) return
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [gcall])

  // Ask the server which of my groups have a call going (e.g. after a reload)
  const queryGroup = useCallback((groupId) => socket?.emit('gcall:query', { groupId }), [socket])

  const value = { gcall, active, start, join, leave, queryGroup, error, clearError: () => setError('') }

  // Who can be added: group members not in the call, or my contacts (ad-hoc calls)
  const inCall = new Set([String(AuthUser?._id), ...Object.keys(peers)])
  const group = gcall && !gcall.room ? groupOf(gcall.groupId) : null
  const candidates = !gcall ? [] : (gcall.room
    ? useConversation.getState().contacts.filter((c) => !c.isGroup && !c.isSelf && !c.isAi)
    : (group?.members || []).filter((m) => typeof m === 'object')
  ).filter((p) => !inCall.has(String(p._id)))

  return (
    <GroupCallContext.Provider value={value}>
      {children}
<Suspense fallback={null}>
      {ringing && !gcall && (
        <GroupCallRing ring={ringing} onJoin={() => { stopTone.current(); join(ringing.groupId) }} onDismiss={() => { stopTone.current(); setRinging(null) }} />
      )}
      {rejoin && !ringing && !gcall && !oneToOne && active[rejoin.groupId] && (
        <GroupCallRing rejoin ring={rejoin} count={active[rejoin.groupId].participants?.length || 0} onJoin={() => join(rejoin.groupId)} onDismiss={() => setRejoin(null)} />
      )}
      {gcall && (
        <GroupCallScreen
          call={gcall}
          me={AuthUser}
          group={group}
          profiles={profiles}
          peers={peers}
          localStream={localStream}
          muted={muted}
          cameraOff={cameraOff}
          sharing={sharing}
          minimized={minimized}
          notice={notice}
          candidates={candidates}
          onMinimize={setMinimized}
          onMute={toggleMute}
          onCamera={toggleCamera}
          onFlip={flipCamera}
          onShare={toggleShare}
          onAdd={addPeople}
          onLeave={leave}
        />
      )}
</Suspense>
      {error && !gcall && (
        <div className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-xl" role="alert" onClick={() => setError('')}>{error}</div>
      )}
    </GroupCallContext.Provider>
  )
}

export default GroupCallProvider
