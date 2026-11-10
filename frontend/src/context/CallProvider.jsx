import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSocket } from './SocketProvider'
// The call screen is downloaded when a call starts or rings
const CallScreen = lazy(() => import('../home/call/CallScreen'))
import { playEndTone, startRingback, startRingtone } from '../utils/callTones'
import { cameraTrack, replaceVideoTrack, screenTrack } from '../utils/callMedia'
import { currentIceServers, getIceServers } from '../utils/iceServers'

// One-to-one voice and video calls over WebRTC. The socket server only rings
// the other person and passes connection details between the two browsers;
// the audio and video go directly between them.

const CallContext = createContext(null)
export const useCall = () => useContext(CallContext)

// STUN / TURN servers come from the server (utils/iceServers.js), fetched as a call starts

const RING_TIMEOUT_MS = 30_000   // give up if nobody answers
const ENDED_SCREEN_MS = 1800     // how long "Call ended" stays on screen
const RECONNECT_MS = 60_000      // a dropped call waits this long for the other side to come back

const mediaFor = (type) => ({
  audio: { echoCancellation: true, noiseSuppression: true },
  video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
})

const newCallId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

const CallProvider = ({ children }) => {
  const { socket } = useSocket()

  // call: { id, peer, type: 'voice'|'video', direction: 'outgoing'|'incoming',
  //         status: 'ringing'|'connecting'|'active'|'reconnecting'|'interrupted'|'ended', reason, startedAt }
  // 'reconnecting': the connection dropped (their app closed, or a network change); waiting for it to come back
  // 'interrupted': this app was closed during the call and opened again; the user can rejoin
  const [call, setCall] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [sharing, setSharing] = useState(false)          // my screen instead of my camera
  const [facing, setFacing] = useState('user')           // front / back camera
  const [peerMedia, setPeerMedia] = useState({})         // the other person's { muted, cameraOff, sharing }
  const [minimized, setMinimized] = useState(false)      // small floating card, so you can keep chatting

  const callRef = useRef(null)          // latest call, for socket handlers
  const pcRef = useRef(null)
  const localRef = useRef(null)
  const pendingIce = useRef([])         // candidates that arrived before the remote description
  const stopTone = useRef(() => {})
  const timers = useRef([])
  const reconnectTimer = useRef(null)

  const update = useCallback((next) => {
    callRef.current = typeof next === 'function' ? next(callRef.current) : next
    setCall(callRef.current)
  }, [])

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))

  // Tear everything down and show why the call ended
  const finish = useCallback((reason, { silent = false } = {}) => {
    const current = callRef.current
    if (!current || current.status === 'ended') return
    stopTone.current(); stopTone.current = () => {}
    clearTimers()
    clearTimeout(reconnectTimer.current); reconnectTimer.current = null
    pcRef.current?.close(); pcRef.current = null
    localRef.current?.getTracks().forEach((t) => t.stop()); localRef.current = null
    pendingIce.current = []
    cameraBackup.current?.stop(); cameraBackup.current = null
    setLocalStream(null); setRemoteStream(null); setMuted(false); setCameraOff(false)
    setSharing(false); setFacing('user'); setPeerMedia({}); setMinimized(false)

    if (silent) return update(null)
    playEndTone()
    update({ ...current, status: 'ended', reason })
    later(() => update((c) => (c?.id === current.id ? null : c)), ENDED_SCREEN_MS)
  }, [update])

  const emit = (event, data) => socket?.emit(event, data)
  const signal = (data) => {
    const c = callRef.current
    if (c) emit('call:signal', { to: c.peer._id, callId: c.id, data })
  }

  // Tell the other side when I mute, turn my camera off or share my screen
  const sendMedia = (next = {}) => signal({ media: { muted: localRef.current?.getAudioTracks()[0]?.enabled === false, cameraOff: localRef.current?.getVideoTracks()[0]?.enabled === false, sharing: false, ...next } })
  const cameraBackup = useRef(null) // the camera track while my screen is shared

  const getMedia = async (type) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
    const stream = await navigator.mediaDevices.getUserMedia(mediaFor(type))
    localRef.current = stream
    setLocalStream(stream)
    return stream
  }

  // The connection dropped after the call was going: wait a while for it to come back
  // (the other side reopening the app, or the network recovering) before giving up
  const startReconnecting = () => {
    const c = callRef.current
    if (!c || c.status === 'ended' || c.status === 'interrupted') return
    if (c.status !== 'reconnecting') update({ ...c, status: 'reconnecting' })
    if (reconnectTimer.current) return
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null
      const cur = callRef.current
      if (cur?.id === c.id && cur.status === 'reconnecting') {
        emit('call:end', { callId: cur.id })
        finish('failed')
      }
    }, RECONNECT_MS)
  }

  const createPeer = () => {
    pcRef.current?.close()
    const pc = new RTCPeerConnection({ iceServers: currentIceServers() })
    pcRef.current = pc
    pendingIce.current = []
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current))
    pc.onicecandidate = (e) => e.candidate && signal({ candidate: e.candidate })
    pc.ontrack = (e) => setRemoteStream(e.streams[0])
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return // replaced after a reconnect
      if (pc.connectionState === 'connected') {
        clearTimeout(reconnectTimer.current); reconnectTimer.current = null
        // Keep the original start time when coming back from a drop
        update((c) => (c && c.status !== 'active' ? { ...c, status: 'active', startedAt: c.startedAt || Date.now() } : c))
        sendMedia({ sharing: !!cameraBackup.current })
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // Never connected at all: give up. Was connected: wait for it to come back.
        if (callRef.current?.startedAt) return startReconnecting()
        if (pc.connectionState === 'failed') {
          const c = callRef.current
          if (c) emit('call:end', { callId: c.id })
          finish('failed')
        }
      }
    }
    return pc
  }

  // Build a fresh connection and offer it to the other side (after a reconnect)
  const restartPeer = async () => {
    const pc = createPeer()
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signal({ sdp: pc.localDescription, restart: true })
  }

  const flushIce = async () => {
    const pc = pcRef.current
    for (const candidate of pendingIce.current.splice(0)) {
      try { await pc.addIceCandidate(candidate) } catch { /* ignore stale candidates */ }
    }
  }

  // ── Actions ───────────────────────────────────────────────
  const startCall = useCallback(async (peer, type = 'voice') => {
    if (!socket || callRef.current) return
    const id = newCallId()
    update({ id, peer, type, direction: 'outgoing', status: 'ringing' })
    try {
      await Promise.all([getMedia(type), getIceServers()])
    } catch {
      return finish('media')
    }
    if (callRef.current?.id !== id) return // cancelled while asking for the mic
    emit('call:invite', { to: peer._id, callId: id, type })
    stopTone.current = startRingback()
    later(() => {
      if (callRef.current?.id === id && callRef.current.status === 'ringing') {
        emit('call:end', { callId: id, reason: 'no-answer' })
        finish('no-answer')
      }
    }, RING_TIMEOUT_MS)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, update, finish])

  const acceptCall = useCallback(async () => {
    const c = callRef.current
    if (!c || c.direction !== 'incoming' || c.status !== 'ringing') return
    stopTone.current(); stopTone.current = () => {}
    clearTimers()
    update({ ...c, status: 'connecting' })
    try {
      await Promise.all([getMedia(c.type), getIceServers()])
    } catch {
      emit('call:decline', { to: c.peer._id, callId: c.id })
      return finish('media')
    }
    createPeer()
    emit('call:accept', { to: c.peer._id, callId: c.id })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, update, finish])

  const declineCall = useCallback(() => {
    const c = callRef.current
    if (!c) return
    emit('call:decline', { to: c.peer._id, callId: c.id })
    finish('declined', { silent: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, finish])

  // Back in a call this app dropped out of (it was closed, or lost its connection)
  const rejoinCall = useCallback(async () => {
    const c = callRef.current
    if (!c || c.status !== 'interrupted') return
    update({ ...c, status: 'connecting' })
    try {
      await Promise.all([getMedia(c.type), getIceServers()])
    } catch {
      emit('call:end', { callId: c.id })
      return finish('media')
    }
    if (callRef.current?.id !== c.id) return
    emit('call:rejoin', { callId: c.id })
    restartPeer().catch((err) => console.log('rejoin error:', err))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, update, finish])

  const hangUp = useCallback(() => {
    const c = callRef.current
    if (!c) return
    if (c.status === 'ended') return update(null)
    const reason = c.direction === 'outgoing' && c.status === 'ringing' ? 'cancelled' : 'ended'
    emit('call:end', { callId: c.id, reason })
    finish(reason)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, finish, update])

  const toggleMute = () => {
    const track = localRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
    sendMedia({ sharing: !!cameraBackup.current })
  }

  const toggleCamera = () => {
    const track = localRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCameraOff(!track.enabled)
    sendMedia({ sharing: !!cameraBackup.current })
  }

  // Put a new video track in my stream and send it instead of the old one
  const swapVideo = async (track) => {
    const stream = localRef.current
    const old = stream?.getVideoTracks()[0]
    if (!stream || !old) return null
    stream.removeTrack(old)
    stream.addTrack(track)
    if (pcRef.current) await replaceVideoTrack([pcRef.current], track)
    setLocalStream(new MediaStream(stream.getTracks()))
    return old
  }

  // Front / back camera (phones)
  const flipCamera = async () => {
    if (callRef.current?.type !== 'video' || cameraBackup.current) return
    const next = facing === 'user' ? 'environment' : 'user'
    try {
      const track = await cameraTrack(next)
      track.enabled = !cameraOff
      const old = await swapVideo(track)
      old?.stop()
      setFacing(next)
    } catch { /* no second camera */ }
  }

  // Share my screen instead of my camera (video calls); the browser's "Stop sharing" also ends it
  const toggleShare = async () => {
    if (callRef.current?.type !== 'video') return
    if (cameraBackup.current) {
      const camera = cameraBackup.current
      cameraBackup.current = null
      const screen = await swapVideo(camera)
      screen?.stop()
      setSharing(false)
      return sendMedia({ sharing: false })
    }
    const track = await screenTrack()
    if (!track || !callRef.current) return track?.stop()
    track.onended = () => { if (cameraBackup.current) toggleShare() }
    cameraBackup.current = await swapVideo(track)
    setSharing(true)
    sendMedia({ sharing: true })
  }

  // Adding people moves this call into a group call (GroupCallProvider takes over)
  const addPeople = (userIds) => {
    const c = callRef.current
    if (!c || c.status !== 'active') return
    emit('gcall:upgrade', { peerId: c.peer._id, type: c.type, userIds })
  }
  // End this call without a tone or "Call ended" (it continues as a group call)
  const handOff = useCallback(() => {
    if (callRef.current) finish('ended', { silent: true })
  }, [finish])

  // ── Socket events ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    const onIncoming = ({ callId, type, from }) => {
      // Already on a call in this tab: say we're busy
      if (callRef.current && callRef.current.status !== 'ended') return socket.emit('call:decline', { to: from._id, callId })
      clearTimers()
      update({ id: callId, peer: from, type, direction: 'incoming', status: 'ringing' })
      stopTone.current = startRingtone()
      later(() => {
        if (callRef.current?.id === callId && callRef.current.status === 'ringing') finish('missed')
      }, RING_TIMEOUT_MS + 5000)
    }

    const onAccepted = async ({ callId }) => {
      const c = callRef.current
      if (c?.id !== callId) return
      stopTone.current(); stopTone.current = () => {}
      clearTimers()
      update({ ...c, status: 'connecting' })
      const pc = createPeer()
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      signal({ sdp: pc.localDescription })
    }

    const onSignal = async ({ callId, data }) => {
      if (callRef.current?.id !== callId) return
      if (data.media) return setPeerMedia(data.media)
      // The other side came back with a new connection: replace ours
      if (data.restart && data.sdp?.type === 'offer' && localRef.current) createPeer()
      const pc = pcRef.current
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp)
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            signal({ sdp: pc.localDescription })
          }
          await flushIce()
        } else if (data.candidate) {
          if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate)
          else pendingIce.current.push(data.candidate)
        }
      } catch (err) {
        console.log('call signal error:', err)
      }
    }

    const onEnded = ({ callId, reason }) => {
      if (callRef.current?.id === callId) finish(reason)
    }

    // The other side's app closed or lost its connection. Only shown when the media stopped too.
    const onPeerAway = ({ callId }) => {
      if (callRef.current?.id === callId && pcRef.current?.connectionState !== 'connected') startReconnecting()
    }

    // I dropped out of a call that's still waiting for me
    const onResume = ({ callId, type, peer, startedAt }) => {
      const c = callRef.current
      if (c?.id === callId && c.status !== 'ended' && c.status !== 'interrupted') {
        // Same tab, back after a short drop: take the call again, and reconnect the media if it stopped
        if (localRef.current) {
          emit('call:rejoin', { callId })
          if (pcRef.current?.connectionState !== 'connected') {
            startReconnecting()
            restartPeer().catch((err) => console.log('reconnect error:', err))
          }
        }
        return
      }
      if (c && c.status !== 'ended') return
      // The app was closed: offer to rejoin
      clearTimers()
      update({ id: callId, peer, type, direction: 'outgoing', status: 'interrupted', startedAt })
    }

    // Answered, declined or rejoined in another tab of mine
    const onHandled = ({ callId }) => {
      const c = callRef.current
      if (c?.id === callId && (c.status === 'ringing' || c.status === 'interrupted')) finish('ended', { silent: true })
    }

    socket.on('call:incoming', onIncoming)
    socket.on('call:accepted', onAccepted)
    socket.on('call:signal', onSignal)
    socket.on('call:ended', onEnded)
    socket.on('call:peer-away', onPeerAway)
    socket.on('call:resume', onResume)
    socket.on('call:handled', onHandled)
    return () => {
      socket.off('call:peer-away', onPeerAway)
      socket.off('call:resume', onResume)
      socket.off('call:handled', onHandled)
      socket.off('call:incoming', onIncoming)
      socket.off('call:accepted', onAccepted)
      socket.off('call:signal', onSignal)
      socket.off('call:ended', onEnded)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, update, finish])

  // Lost the socket (logout, network): the call can't continue
  useEffect(() => {
    if (!socket && callRef.current) finish('ended')
  }, [socket, finish])

  // Warn before closing the tab mid-call
  useEffect(() => {
    if (!call || call.status === 'ended') return
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [call])

  const value = {
    call, localStream, remoteStream, muted, cameraOff, sharing, peerMedia, minimized, setMinimized,
    startCall, acceptCall, declineCall, hangUp, rejoinCall, toggleMute, toggleCamera, flipCamera, toggleShare, addPeople, handOff,
  }

  return (
    <CallContext.Provider value={value}>
      {children}
      {call && <Suspense fallback={null}><CallScreen /></Suspense>}
    </CallContext.Provider>
  )
}

export default CallProvider
