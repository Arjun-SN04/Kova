import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import axios from 'axios'
import { LuCircleDashed, LuX } from 'react-icons/lu'

// A view-once photo or video in the chat. The person it was sent to can open it once;
// after that (and always for the sender) it only says "Opened" / "Photo".
const OnceIcon = ({ className = '' }) => (
  <span className={`relative inline-flex items-center justify-center ${className}`} aria-hidden>
    <LuCircleDashed className="size-full" />
    <span className="absolute text-[0.55em] font-bold">1</span>
  </span>
)

export const ViewOnceBubble = ({ message, itsMe, myId }) => {
  const [opening, setOpening] = useState(false)
  const [media, setMedia] = useState(null) // { url, kind } while open
  const [error, setError] = useState('')
  const video = message.attachment?.kind === 'video'
  const what = video ? 'Video' : 'Photo'
  const viewedBy = (message.viewedBy || []).map(String)
  const openedByMe = viewedBy.includes(String(myId))
  const openedByThem = viewedBy.length > 0

  const open = async (e) => {
    e.stopPropagation()
    if (itsMe || openedByMe || opening) return
    setOpening(true); setError('')
    try {
      const res = await axios.post(`/api/message/view-once/${message._id}`, {}, { withCredentials: true })
      setMedia(res.data)
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't open it. Try again.")
    } finally {
      setOpening(false)
    }
  }

  const label = itsMe ? (openedByThem ? 'Opened' : what) : openedByMe ? 'Opened' : opening ? 'Opening…' : what
  return (
    <>
      <button type="button" onClick={open} disabled={itsMe || openedByMe}
        className="flex items-center gap-2 py-1 pr-2 text-sm font-medium disabled:cursor-default"
        title={itsMe ? 'View once: they can open it one time' : openedByMe ? 'You already opened this' : `Tap to view. You can open it once.`}>
        <OnceIcon className={`size-6 ${itsMe || openedByMe ? 'opacity-60' : 'text-indigo-600 dark:text-indigo-300'}`} />
        <span className={itsMe || openedByMe ? 'italic opacity-70' : ''}>{label}</span>
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {media && <ViewOnceViewer media={media} onClose={() => setMedia(null)} />}
    </>
  )
}

// Full screen, no download or save; closing it is final
const ViewOnceViewer = ({ media, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black" onContextMenu={(e) => e.preventDefault()} role="dialog" aria-modal="true" aria-label="View-once media">
      <button onClick={onClose} className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close"><LuX className="size-5" /></button>
      <p className="absolute left-4 top-5 flex items-center gap-2 text-sm text-white/80"><OnceIcon className="size-5" /> View once · it can't be opened again</p>
      {media.kind === 'video'
        ? <video src={media.url} autoPlay controls controlsList="nodownload" disablePictureInPicture className="max-h-full max-w-full" />
        : <img src={media.url} alt="View-once photo" draggable={false} className="max-h-full max-w-full select-none object-contain" />}
    </div>,
    document.body,
  )
}

// The "1" button on a photo / video waiting to be sent
export const ViewOnceToggle = ({ on, onToggle }) => (
  <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? 'View once: on' : 'Send as view once'} title={on ? 'View once: they can open it one time' : 'Send as view once'}
    className={`absolute bottom-6 left-1 flex size-6 items-center justify-center rounded-full shadow ring-2 ring-white transition dark:ring-slate-900 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-900/70 text-white hover:bg-slate-900'}`}>
    <OnceIcon className="size-4" />
  </button>
)
