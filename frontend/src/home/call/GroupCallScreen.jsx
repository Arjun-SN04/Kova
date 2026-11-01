import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuMic, LuMicOff, LuPhone, LuPhoneOff, LuUsers, LuVideo, LuVideoOff } from 'react-icons/lu'
import Avatar, { GroupAvatar } from '../Avatar'

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// One person: their video, or their photo/initials while voice-only
const Tile = ({ name, avatar, stream, video, mirrored = false, muted = false, state, you = false }) => {
  const ref = useRef(null)
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream }, [stream])
  const showVideo = video && stream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
  return (
    <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 ring-1 ring-white/5">
      {stream && (video
        ? <video ref={ref} autoPlay playsInline muted={you} className={`h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''} ${showVideo ? '' : 'invisible absolute'}`} />
        : !you && <audio ref={ref} autoPlay />)}
      {!showVideo && (
        <div className="flex flex-col items-center gap-2">
          <Avatar name={name} src={avatar} size="lg" />
          {state && state !== 'connected' && <p className="text-xs text-slate-400">{state === 'failed' ? "Couldn't connect" : 'Connecting…'}</p>}
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
        {muted && <LuMicOff className="size-3" />}{you ? 'You' : name}
      </span>
    </div>
  )
}

const GroupCallScreen = ({ call, me, group, peers, localStream, muted, cameraOff, onMute, onCamera, onLeave }) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const people = Object.entries(peers)
  const memberOf = (id) => group?.members?.find((m) => String(m._id ?? m) === String(id))
  const count = people.length + 1
  const cols = count <= 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : 'grid-cols-3'
  const video = call.type === 'video'
  const btn = 'flex size-12 items-center justify-center rounded-full transition'

  return createPortal(
    <div className="fixed inset-0 z-[75] flex flex-col bg-slate-950 text-white" role="dialog" aria-label="Group call">
      <header className="flex items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <GroupAvatar name={call.groupName} src={group?.avatar?.url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{call.groupName}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <LuUsers className="size-3" /> {count} in call
            {call.startedAt && <> · {fmt(Math.max(0, Math.floor((now - call.startedAt) / 1000)))}</>}
            {!people.length && ' · waiting for others to join'}
          </p>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 p-2 ${cols}`}>
        <Tile name={me?.fullName} avatar={me?.avatar?.url} stream={localStream} video={video && !cameraOff} mirrored muted={muted} you />
        {people.map(([id, p]) => (
          <Tile key={id} name={memberOf(id)?.fullName || 'Member'} avatar={memberOf(id)?.avatar?.url} stream={p.stream} video={video} state={p.state} />
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <button onClick={onMute} className={`${btn} ${muted ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <LuMicOff className="size-5" /> : <LuMic className="size-5" />}
        </button>
        {video && (
          <button onClick={onCamera} className={`${btn} ${cameraOff ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} title="Camera">
            {cameraOff ? <LuVideoOff className="size-5" /> : <LuVideo className="size-5" />}
          </button>
        )}
        <button onClick={onLeave} className={`${btn} w-16 bg-red-600 hover:bg-red-500`} aria-label="Leave call" title="Leave call">
          <LuPhoneOff className="size-5" />
        </button>
      </div>
    </div>,
    document.body,
  )
}

// Someone started a call in one of my groups
export const GroupCallRing = ({ ring, onJoin, onDismiss }) => createPortal(
  <div className="fixed left-1/2 top-4 z-[80] w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl bg-white p-4 text-slate-900 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700" role="alertdialog" aria-label="Group call">
    <div className="flex items-center gap-3">
      <span className="relative">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
        <Avatar name={ring.from?.fullName} src={ring.from?.avatar?.url} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{ring.groupName}</p>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{ring.from?.fullName?.split(' ')[0]} started a group {ring.type} call</p>
      </div>
    </div>
    <div className="mt-3 flex justify-end gap-2">
      <button onClick={onDismiss} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Not now</button>
      <button onClick={onJoin} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500">
        {ring.type === 'video' ? <LuVideo className="size-4" /> : <LuPhone className="size-4" />} Join
      </button>
    </div>
  </div>,
  document.body,
)

export default GroupCallScreen
