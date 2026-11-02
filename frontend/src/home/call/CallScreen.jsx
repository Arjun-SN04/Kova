import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuMaximize2, LuMic, LuMicOff, LuMinimize2, LuMonitorUp, LuMonitorX, LuPhone, LuPhoneOff, LuSwitchCamera, LuUserPlus, LuVideo, LuVideoOff } from 'react-icons/lu'
import { useCall } from '../../context/CallProvider'
import useConversation from '../../Zustand/UserConversation'
import { initialsOf } from '../Avatar'
import { AddPeopleDialog, CallButton } from './callKit'
import { canFlipCamera, canShareScreen, useSpeaking } from '../../utils/callMedia'

const END_REASONS = {
  ended: 'Call ended',
  cancelled: 'Call cancelled',
  declined: 'Call declined',
  missed: 'Missed call',
  'no-answer': 'No answer',
  busy: 'is on another call',
  offline: 'is offline',
  failed: "Couldn't connect the call",
  media: 'Allow microphone (and camera) access to make calls',
  'not-allowed': 'You can only call your contacts',
}
const MAX_IN_CALL = 8

const formatDuration = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Ref for a <video>/<audio> element that plays `stream`, also when the element appears later
const useStream = (stream) =>
  useCallback((el) => {
    if (el && el.srcObject !== stream) el.srcObject = stream || null
  }, [stream])

const BigAvatar = ({ user, ringing = false, speaking = false, size = 'size-28' }) => (
  <div className="relative">
    {ringing && <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />}
    <span className={`absolute -inset-2 rounded-full ring-4 ring-emerald-400/70 transition-opacity duration-200 ${speaking ? 'opacity-100' : 'opacity-0'}`} />
    {user.avatar?.url ? (
      <img src={user.avatar.url} alt="" className={`relative ${size} rounded-full object-cover ring-4 ring-white/10`} />
    ) : (
      <div className={`relative flex ${size} items-center justify-center rounded-full bg-indigo-600 text-3xl font-semibold text-white ring-4 ring-white/10`}>{initialsOf(user.fullName)}</div>
    )}
  </div>
)

const Pill = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">{children}</span>
)

// Full-screen call UI (or a small floating card when minimised). Rendered by CallProvider.
const CallScreen = () => {
  const {
    call, localStream, remoteStream, muted, cameraOff, sharing, peerMedia, minimized, setMinimized,
    acceptCall, declineCall, hangUp, toggleMute, toggleCamera, flipCamera, toggleShare, addPeople,
  } = useCall()
  const contacts = useConversation((st) => st.contacts)
  const localVideo = useStream(localStream)
  const remoteVideo = useStream(remoteStream)
  const remoteAudio = useStream(remoteStream)
  const [now, setNow] = useState(() => Date.now())
  // Per call (reset for the next one): my video big / theirs small, and the Add people picker
  const [swappedFor, setSwappedFor] = useState(null)
  const [addingFor, setAddingFor] = useState(null)
  const swapped = !!call && swappedFor === call.id
  const adding = !!call && addingFor === call.id
  const setSwapped = (fn) => setSwappedFor(fn(swapped) ? call?.id : null)
  const setAdding = (on) => setAddingFor(on ? call?.id : null)
  const [controlsHidden, setControlsHidden] = useState(false)

  const active = call?.status === 'active'
  const isVideo = call?.type === 'video'
  const theySpeak = useSpeaking(remoteStream, active)
  const iSpeak = useSpeaking(localStream, active && !muted)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  // Video calls: the controls fade after a few seconds without a tap
  useEffect(() => {
    if (!active || !isVideo || controlsHidden) return
    const t = setTimeout(() => setControlsHidden(true), 5000)
    return () => clearTimeout(t)
  }, [active, isVideo, controlsHidden])

  if (!call) return null
  const { peer, direction, status, reason } = call
  const firstName = peer.fullName?.split(' ')[0]
  const incomingRinging = direction === 'incoming' && status === 'ringing'
  const showRemoteVideo = isVideo && remoteStream && active && !peerMedia.cameraOff
  const bigIsMine = swapped && showRemoteVideo

  let statusText
  if (status === 'ended') {
    const text = END_REASONS[reason] || 'Call ended'
    statusText = text.startsWith('is ') ? `${firstName} ${text}` : text
  } else if (incomingRinging) statusText = `Incoming ${isVideo ? 'video' : 'voice'} call…`
  else if (status === 'ringing') statusText = 'Calling…'
  else if (status === 'connecting') statusText = 'Connecting…'
  else statusText = formatDuration(now - (call.startedAt || now))

  const candidates = contacts.filter((c) => String(c._id) !== String(peer._id) && !c.isGroup && !c.isSelf && !c.isAi)

  // ── Minimised: a small card in the corner, the call keeps going ──
  if (minimized && status !== 'ended' && !incomingRinging) {
    return createPortal(
      <motion.div
        drag
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-24 right-4 z-[60] w-64 cursor-grab overflow-hidden rounded-2xl bg-zinc-900 text-white shadow-2xl ring-1 ring-white/10 active:cursor-grabbing md:bottom-6"
        role="dialog"
        aria-label={`Call with ${peer.fullName}`}
      >
        <audio ref={remoteAudio} autoPlay />
        {showRemoteVideo ? (
          <video ref={remoteVideo} autoPlay playsInline muted className="aspect-video w-full bg-black object-cover" />
        ) : null}
        <div className="flex items-center gap-2.5 p-2.5">
          {!showRemoteVideo && <BigAvatar user={peer} speaking={theySpeak} size="size-9" />}
          <button onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left" title="Open call">
            <p className="truncate text-sm font-semibold">{peer.fullName}</p>
            <p className="text-xs tabular-nums text-emerald-400">{statusText}</p>
          </button>
          <button onClick={toggleMute} className={`flex size-8 items-center justify-center rounded-full ${muted ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20'}`} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <LuMicOff className="size-4" /> : <LuMic className="size-4" />}
          </button>
          <button onClick={() => setMinimized(false)} className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Open call"><LuMaximize2 className="size-4" /></button>
          <button onClick={hangUp} className="flex size-8 items-center justify-center rounded-full bg-red-600 hover:bg-red-500" aria-label="End call"><LuPhoneOff className="size-4" /></button>
        </div>
      </motion.div>,
      document.body,
    )
  }

  const showControls = !controlsHidden || !isVideo || !active
  return createPortal(
    <AnimatePresence>
      <motion.div
        key={call.id}
        role="dialog"
        aria-modal="true"
        aria-label={`${isVideo ? 'Video' : 'Voice'} call with ${peer.fullName}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onPointerDown={() => controlsHidden && setControlsHidden(false)}
        className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-zinc-950 text-white"
      >
        {/* Background: the big video, or a soft gradient with their photo */}
        {showRemoteVideo ? (
          bigIsMine
            ? <video ref={localVideo} autoPlay playsInline muted className={`absolute inset-0 size-full object-cover ${sharing ? 'object-contain' : '-scale-x-100'}`} />
            : <video ref={remoteVideo} autoPlay playsInline className={`absolute inset-0 size-full ${peerMedia.sharing ? 'object-contain' : 'object-cover'}`} />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.35),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.18),transparent_60%)]" />
            {peer.avatar?.url && <img src={peer.avatar.url} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-3xl" />}
            <div className="absolute inset-0 bg-zinc-950/50" />
          </>
        )}
        {/* Sound always plays here (the video elements are muted when they're small) */}
        {(!showRemoteVideo || bigIsMine) && <audio ref={remoteAudio} autoPlay />}

        {/* Top bar */}
        <div className={`relative z-10 flex items-center gap-3 bg-linear-to-b from-black/60 to-transparent p-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity sm:p-5 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          {status !== 'ended' && !incomingRinging && (
            <button onClick={() => setMinimized(true)} className="flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20" aria-label="Minimise call" title="Minimise (keep chatting)">
              <LuMinimize2 className="size-4.5" />
            </button>
          )}
          {showRemoteVideo && (
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{peer.fullName}</p>
              <p className="text-sm tabular-nums text-white/70">{statusText}</p>
            </div>
          )}
          <div className="ml-auto flex flex-wrap justify-end gap-1.5">
            {active && peerMedia.muted && <Pill><LuMicOff className="size-3" /> {firstName} is muted</Pill>}
            {active && peerMedia.sharing && <Pill><LuMonitorUp className="size-3" /> {firstName} is sharing</Pill>}
            {sharing && <Pill><LuMonitorUp className="size-3 text-emerald-400" /> You're sharing your screen</Pill>}
          </div>
        </div>

        {!showRemoteVideo ? (
          <div className="relative flex flex-1 flex-col items-center justify-center px-4 text-center sm:px-6">
            <BigAvatar user={peer} ringing={status === 'ringing'} speaking={theySpeak} />
            <p className="mt-6 text-xl font-semibold sm:text-2xl">{peer.fullName}</p>
            <p className={`mt-1.5 text-sm tabular-nums ${status === 'ended' ? 'text-red-300' : 'text-white/60'}`}>{statusText}</p>
            {active && isVideo && peerMedia.cameraOff && <p className="mt-2 text-xs text-white/50">{firstName}'s camera is off</p>}
            {active && !isVideo && <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/40"><span className="size-1.5 rounded-full bg-emerald-400" /> End-to-end between your devices</p>}
          </div>
        ) : <div className="flex-1" />}

        {/* The small video in the corner: tap to swap */}
        {isVideo && localStream && status !== 'ended' && (
          <button
            onClick={() => showRemoteVideo && setSwapped((s) => !s)}
            className={`absolute right-4 top-20 z-10 aspect-[3/4] w-24 overflow-hidden rounded-2xl bg-zinc-800 shadow-2xl ring-2 transition sm:w-40 ${iSpeak && !bigIsMine ? 'ring-emerald-400/80' : 'ring-white/10'}`}
            title={showRemoteVideo ? 'Tap to swap' : 'You'}
            aria-label="Swap videos"
          >
            {bigIsMine
              ? <video ref={remoteVideo} autoPlay playsInline muted className="size-full object-cover" />
              : <video ref={localVideo} autoPlay playsInline muted className={`size-full object-cover ${sharing ? '' : '-scale-x-100'} ${cameraOff && !sharing ? 'invisible' : ''}`} />}
            {cameraOff && !sharing && !bigIsMine && <LuVideoOff className="absolute inset-0 m-auto size-6 text-white/50" />}
            {muted && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 p-1"><LuMicOff className="size-3" /></span>}
          </button>
        )}

        {/* Controls */}
        {status !== 'ended' && (
          <div className={`relative z-10 flex flex-wrap items-start justify-center gap-3 bg-linear-to-t from-black/70 to-transparent px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 transition-opacity sm:gap-5 sm:px-6 sm:pt-12 ${showControls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            {incomingRinging ? (
              <>
                <CallButton onClick={declineCall} label="Decline" tone="danger" size="lg"><LuPhoneOff className="size-6" /></CallButton>
                <CallButton onClick={acceptCall} label="Accept" tone="success" size="lg">
                  {isVideo ? <LuVideo className="size-6" /> : <LuPhone className="size-6" />}
                </CallButton>
              </>
            ) : (
              <>
                <CallButton onClick={toggleMute} label={muted ? 'Unmute' : 'Mute'} tone={muted ? 'active' : 'default'}>
                  {muted ? <LuMicOff className="size-5" /> : <LuMic className="size-5" />}
                </CallButton>
                {isVideo && (
                  <CallButton onClick={toggleCamera} label={cameraOff ? 'Camera on' : 'Camera off'} tone={cameraOff ? 'active' : 'default'} disabled={sharing}>
                    {cameraOff ? <LuVideoOff className="size-5" /> : <LuVideo className="size-5" />}
                  </CallButton>
                )}
                {isVideo && canFlipCamera() && (
                  <CallButton onClick={flipCamera} label="Flip" disabled={sharing || cameraOff}><LuSwitchCamera className="size-5" /></CallButton>
                )}
                {isVideo && canShareScreen() && (
                  <CallButton onClick={toggleShare} label={sharing ? 'Stop sharing' : 'Share screen'} tone={sharing ? 'active' : 'default'} disabled={!active}>
                    {sharing ? <LuMonitorX className="size-5" /> : <LuMonitorUp className="size-5" />}
                  </CallButton>
                )}
                <CallButton onClick={() => setAdding(true)} label="Add people" disabled={!active}><LuUserPlus className="size-5" /></CallButton>
                <CallButton onClick={hangUp} label={status === 'ringing' ? 'Cancel' : 'End call'} tone="danger"><LuPhoneOff className="size-6" /></CallButton>
              </>
            )}
          </div>
        )}

        {adding && (
          <AddPeopleDialog
            people={candidates}
            max={MAX_IN_CALL - 2}
            onClose={() => setAdding(false)}
            onAdd={(ids) => { setAdding(false); addPeople(ids) }}
          />
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

export default CallScreen
