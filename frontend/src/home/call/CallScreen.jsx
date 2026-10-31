import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuMic, LuMicOff, LuPhone, LuPhoneOff, LuVideo, LuVideoOff } from 'react-icons/lu'
import { useCall } from '../../context/CallProvider'
import { initialsOf } from '../Avatar'

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

const BigAvatar = ({ user, ringing = false }) => {
  const initials = initialsOf(user.fullName)
  return (
    <div className="relative">
      {ringing && <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />}
      {user.avatar?.url ? (
        <img src={user.avatar.url} alt="" className="relative size-28 rounded-full object-cover ring-4 ring-white/10" />
      ) : (
        <div className="relative flex size-28 items-center justify-center rounded-full bg-indigo-600 text-3xl font-semibold text-white ring-4 ring-white/10">{initials}</div>
      )}
    </div>
  )
}

const RoundButton = ({ onClick, label, danger = false, success = false, active = false, children }) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    className={`flex size-14 items-center justify-center rounded-full transition active:scale-95 ${
      danger ? 'bg-red-600 text-white hover:bg-red-500'
        : success ? 'bg-emerald-600 text-white hover:bg-emerald-500'
        : active ? 'bg-white text-zinc-900 hover:bg-zinc-200'
        : 'bg-white/10 text-white hover:bg-white/20'
    }`}
  >
    {children}
  </button>
)

// Full-screen call UI. Rendered by CallProvider whenever a call exists.
const CallScreen = () => {
  const { call, localStream, remoteStream, muted, cameraOff, acceptCall, declineCall, hangUp, toggleMute, toggleCamera } = useCall()
  const localVideo = useStream(localStream)
  const remoteVideo = useStream(remoteStream)
  const remoteAudio = useStream(remoteStream)
  const [now, setNow] = useState(() => Date.now())

  const active = call?.status === 'active'
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  if (!call) return null
  const { peer, type, direction, status, reason } = call
  const isVideo = type === 'video'
  const firstName = peer.fullName?.split(' ')[0]
  const incomingRinging = direction === 'incoming' && status === 'ringing'
  const showRemoteVideo = isVideo && remoteStream && status === 'active'

  let statusText
  if (status === 'ended') {
    const text = END_REASONS[reason] || 'Call ended'
    statusText = text.startsWith('is ') ? `${firstName} ${text}` : text
  } else if (incomingRinging) statusText = `Incoming ${isVideo ? 'video' : 'voice'} call…`
  else if (status === 'ringing') statusText = 'Calling…'
  else if (status === 'connecting') statusText = 'Connecting…'
  else statusText = formatDuration(now - (call.startedAt || now))

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
        className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-zinc-950 text-white"
      >
        {/* Background: their video, or a blurred version of their photo */}
        {showRemoteVideo ? (
          <video ref={remoteVideo} autoPlay playsInline className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            {peer.avatar?.url && <img src={peer.avatar.url} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-3xl" />}
            <div className="absolute inset-0 bg-zinc-950/60" />
          </>
        )}
        {/* Voice calls (and video before it starts) play sound here */}
        {!showRemoteVideo && <audio ref={remoteAudio} autoPlay />}

        {/* Top: name and status */}
        {showRemoteVideo ? (
          <div className="relative flex items-center gap-3 bg-linear-to-b from-black/60 to-transparent p-5 pb-10">
            <div>
              <p className="text-base font-semibold">{peer.fullName}</p>
              <p className="text-sm tabular-nums text-white/70">{statusText}</p>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
            <BigAvatar user={peer} ringing={status === 'ringing'} />
            <p className="mt-6 text-2xl font-semibold">{peer.fullName}</p>
            <p className={`mt-1.5 text-sm tabular-nums ${status === 'ended' ? 'text-red-300' : 'text-white/60'}`}>{statusText}</p>
          </div>
        )}

        {showRemoteVideo && <div className="flex-1" />}

        {/* My camera, small in the corner */}
        {isVideo && localStream && status !== 'ended' && (
          <div className="absolute right-4 top-4 z-10 aspect-[3/4] w-28 overflow-hidden rounded-2xl bg-zinc-800 shadow-2xl ring-1 ring-white/10 sm:w-40">
            <video ref={localVideo} autoPlay playsInline muted className={`size-full -scale-x-100 object-cover ${cameraOff ? 'invisible' : ''}`} />
            {cameraOff && <LuVideoOff className="absolute inset-0 m-auto size-6 text-white/50" />}
          </div>
        )}

        {/* Controls */}
        {status !== 'ended' && (
          <div className="relative flex items-center justify-center gap-5 bg-linear-to-t from-black/60 to-transparent px-6 pb-10 pt-12">
            {incomingRinging ? (
              <>
                <div className="flex flex-col items-center gap-2">
                  <RoundButton onClick={declineCall} label="Decline" danger><LuPhoneOff className="size-6" /></RoundButton>
                  <span className="text-xs text-white/70">Decline</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <RoundButton onClick={acceptCall} label="Accept" success>
                    {isVideo ? <LuVideo className="size-6" /> : <LuPhone className="size-6" />}
                  </RoundButton>
                  <span className="text-xs text-white/70">Accept</span>
                </div>
              </>
            ) : (
              <>
                <RoundButton onClick={toggleMute} label={muted ? 'Unmute' : 'Mute'} active={muted}>
                  {muted ? <LuMicOff className="size-5" /> : <LuMic className="size-5" />}
                </RoundButton>
                {isVideo && (
                  <RoundButton onClick={toggleCamera} label={cameraOff ? 'Turn camera on' : 'Turn camera off'} active={cameraOff}>
                    {cameraOff ? <LuVideoOff className="size-5" /> : <LuVideo className="size-5" />}
                  </RoundButton>
                )}
                <RoundButton onClick={hangUp} label={status === 'ringing' ? 'Cancel' : 'End call'} danger>
                  <LuPhoneOff className="size-6" />
                </RoundButton>
              </>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

export default CallScreen
