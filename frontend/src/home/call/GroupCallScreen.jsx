import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { LuMaximize2, LuMic, LuMicOff, LuMinimize2, LuMonitorUp, LuMonitorX, LuPhone, LuPhoneOff, LuSwitchCamera, LuUserPlus, LuUsers, LuVideo, LuVideoOff } from 'react-icons/lu'
import Avatar, { GroupAvatar } from '../Avatar'
import { AddPeopleDialog, CallButton } from './callKit'
import { canFlipCamera, canShareScreen, useSpeaking } from '../../utils/callMedia'

const MAX_IN_CALL = 8
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// One person: their video, or their photo while voice-only. Glows while they talk.
const Tile = ({ name, avatar, stream, video, mirrored = false, muted = false, sharing = false, state, you = false, onFocus, focused = false }) => {
  const ref = useRef(null)
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream }, [stream, video])
  const speaking = useSpeaking(stream, !muted)
  const showVideo = video && stream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
  return (
    <div
      onClick={onFocus}
      className={`relative flex min-h-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-linear-to-br from-slate-800 to-slate-900 ring-2 transition ${speaking ? 'ring-emerald-400/80' : 'ring-white/5'} ${focused ? 'col-span-full row-span-full' : ''}`}
    >
      {stream && (video
        ? <video ref={ref} autoPlay playsInline muted={you} className={`h-full w-full ${sharing ? 'object-contain' : 'object-cover'} ${mirrored && !sharing ? '-scale-x-100' : ''} ${showVideo ? '' : 'invisible absolute'}`} />
        : !you && <audio ref={ref} autoPlay />)}
      {!showVideo && (
        <div className="flex flex-col items-center gap-2">
          <span className="relative">
            <span className={`absolute -inset-1.5 rounded-full ring-4 ring-emerald-400/60 transition-opacity ${speaking ? 'opacity-100' : 'opacity-0'}`} />
            <Avatar name={name} src={avatar} size="lg" />
          </span>
          {state && state !== 'connected' && <p className="text-xs text-slate-400">{state === 'new' || state === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</p>}
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1 truncate rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
        {muted && <LuMicOff className="size-3 shrink-0 text-red-300" />}
        {sharing && <LuMonitorUp className="size-3 shrink-0 text-emerald-300" />}
        <span className="truncate">{you ? 'You' : name}</span>
      </span>
    </div>
  )
}

const GroupCallScreen = ({
  call, me, group, profiles, peers, localStream, muted, cameraOff, sharing, minimized, notice, candidates,
  onMinimize, onMute, onCamera, onFlip, onShare, onAdd, onLeave,
}) => {
  const [now, setNow] = useState(() => Date.now())
  const [adding, setAdding] = useState(false)
  const [focus, setFocus] = useState(null) // a tile shown large
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const people = Object.entries(peers)
  const whoIs = (id) => profiles[id] || group?.members?.find((m) => String(m._id ?? m) === String(id)) || {}
  const count = people.length + 1
  const cols = focus ? 'grid-cols-1' : count <= 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
  const video = call.type === 'video'
  const elapsed = call.startedAt ? fmt(Math.max(0, Math.floor((now - call.startedAt) / 1000))) : ''
  const toggleFocus = (id) => setFocus((f) => (f === id ? null : id))

  if (minimized) {
    return createPortal(
      <motion.div drag dragMomentum={false} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="fixed bottom-24 right-4 z-[75] w-64 cursor-grab rounded-2xl bg-slate-900 p-2.5 text-white shadow-2xl ring-1 ring-white/10 active:cursor-grabbing md:bottom-6" role="dialog" aria-label="Call">
        {/* Keep everyone's sound playing */}
        {people.map(([id, p]) => p.stream && <HiddenAudio key={id} stream={p.stream} />)}
        <div className="flex items-center gap-2.5">
          <GroupAvatar name={call.groupName} src={group?.avatar?.url} size="sm" />
          <button onClick={() => onMinimize(false)} className="min-w-0 flex-1 text-left" title="Open call">
            <p className="truncate text-sm font-semibold">{call.groupName}</p>
            <p className="text-xs tabular-nums text-emerald-400">{count} in call{elapsed && ` · ${elapsed}`}</p>
          </button>
          <button onClick={onMute} className={`flex size-8 items-center justify-center rounded-full ${muted ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <LuMicOff className="size-4" /> : <LuMic className="size-4" />}
          </button>
          <button onClick={() => onMinimize(false)} className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Open call"><LuMaximize2 className="size-4" /></button>
          <button onClick={onLeave} className="flex size-8 items-center justify-center rounded-full bg-red-600 hover:bg-red-500" aria-label="Leave call"><LuPhoneOff className="size-4" /></button>
        </div>
      </motion.div>,
      document.body,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[75] flex flex-col bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%)] text-white" role="dialog" aria-label="Group call">
      <header className="flex items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={() => onMinimize(true)} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Minimise call" title="Minimise (keep chatting)">
          <LuMinimize2 className="size-4.5" />
        </button>
        {call.room
          ? <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-600"><LuUsers className="size-4.5" /></span>
          : <GroupAvatar name={call.groupName} src={group?.avatar?.url} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{call.groupName}</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <LuUsers className="size-3" /> {count} in call
            {elapsed && <span className="tabular-nums"> · {elapsed}</span>}
            {!people.length && ' · waiting for others to join'}
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-medium hover:bg-white/20" title="Add people">
          <LuUserPlus className="size-4" /> <span className="hidden sm:inline">Add</span>
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className={`grid h-full auto-rows-fr gap-2 p-2 ${cols}`}>
          {(!focus || focus === 'me') && (
            <Tile name={me?.fullName} avatar={me?.avatar?.url} stream={localStream} video={video && (!cameraOff || sharing)} mirrored muted={muted} sharing={sharing} you focused={focus === 'me'} onFocus={() => toggleFocus('me')} />
          )}
          {people.filter(([id]) => !focus || focus === id).map(([id, p]) => (
            <Tile
              key={id}
              name={whoIs(id).fullName || 'Someone'}
              avatar={whoIs(id).avatar?.url}
              stream={p.stream}
              video={video && !p.media?.cameraOff}
              muted={!!p.media?.muted}
              sharing={!!p.media?.sharing}
              state={p.state}
              focused={focus === id}
              onFocus={() => toggleFocus(id)}
            />
          ))}
        </div>
        {/* Others keep playing while one tile is enlarged */}
        {focus && people.filter(([id]) => id !== focus).map(([id, p]) => p.stream && <HiddenAudio key={id} stream={p.stream} />)}
        {notice && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium backdrop-blur-md">
            {notice}
          </motion.p>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-center gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:gap-5">
        <CallButton onClick={onMute} label={muted ? 'Unmute' : 'Mute'} tone={muted ? 'active' : 'default'}>
          {muted ? <LuMicOff className="size-5" /> : <LuMic className="size-5" />}
        </CallButton>
        {video && (
          <CallButton onClick={onCamera} label={cameraOff ? 'Camera on' : 'Camera off'} tone={cameraOff ? 'active' : 'default'} disabled={sharing}>
            {cameraOff ? <LuVideoOff className="size-5" /> : <LuVideo className="size-5" />}
          </CallButton>
        )}
        {video && canFlipCamera() && <CallButton onClick={onFlip} label="Flip" disabled={sharing || cameraOff}><LuSwitchCamera className="size-5" /></CallButton>}
        {video && canShareScreen() && (
          <CallButton onClick={onShare} label={sharing ? 'Stop sharing' : 'Share screen'} tone={sharing ? 'active' : 'default'}>
            {sharing ? <LuMonitorX className="size-5" /> : <LuMonitorUp className="size-5" />}
          </CallButton>
        )}
        <CallButton onClick={() => setAdding(true)} label="Add people"><LuUserPlus className="size-5" /></CallButton>
        <CallButton onClick={onLeave} label="Leave" tone="danger"><LuPhoneOff className="size-5" /></CallButton>
      </div>

      {adding && (
        <AddPeopleDialog
          people={candidates}
          max={Math.max(0, MAX_IN_CALL - count)}
          title={call.room ? 'Add people to the call' : `Ring members of ${call.groupName}`}
          onClose={() => setAdding(false)}
          onAdd={(ids) => { setAdding(false); onAdd(ids) }}
        />
      )}
    </div>,
    document.body,
  )
}

const HiddenAudio = ({ stream }) => {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream }, [stream])
  return <audio ref={ref} autoPlay />
}

// Someone started a call in one of my groups, or invited me to one
// An incoming group call, or (rejoin) a call I left or dropped out of that's still going
export const GroupCallRing = ({ ring, onJoin, onDismiss, rejoin = false, count = 0 }) => createPortal(
  <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="fixed left-1/2 top-4 z-[80] w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl bg-white p-4 text-slate-900 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700" role="alertdialog" aria-label={rejoin ? 'Call in progress' : 'Incoming call'}>
    <div className="flex items-center gap-3">
      <span className="relative">
        {!rejoin && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />}
        <Avatar name={rejoin ? ring.groupName : ring.from?.fullName} src={rejoin ? undefined : ring.from?.avatar?.url} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{ring.groupName}</p>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">
          {rejoin
            ? `${ring.type === 'video' ? 'Video' : 'Voice'} call still going${count ? ` · ${count} ${count === 1 ? 'person' : 'people'}` : ''}`
            : `${ring.from?.fullName?.split(' ')[0]} ${ring.room ? 'added you to a' : 'started a group'} ${ring.type} call`}
        </p>
      </div>
    </div>
    <div className="mt-3 flex justify-end gap-2">
      <button onClick={onDismiss} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${rejoin ? 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800' : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'}`}>
        {rejoin ? 'Dismiss' : <><LuPhoneOff className="size-4" /> Decline</>}
      </button>
      <button onClick={onJoin} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500">
        {ring.type === 'video' ? <LuVideo className="size-4" /> : <LuPhone className="size-4" />} {rejoin ? 'Rejoin' : 'Join'}
      </button>
    </div>
  </motion.div>,
  document.body,
)

export default GroupCallScreen
