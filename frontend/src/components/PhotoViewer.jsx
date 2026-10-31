import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LuExternalLink, LuX } from 'react-icons/lu'

// A profile or group photo shown large on a dark backdrop. Closes with ×, a click outside, or Esc.
const PhotoViewer = ({ src, name, subtitle, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950/90 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${name || 'Profile'} photo`}
    >
      <div className="flex items-center gap-3 px-5 py-4 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{name}</p>
          {subtitle && <p className="truncate text-xs text-white/60">{subtitle}</p>}
        </div>
        <a href={src} target="_blank" rel="noopener noreferrer" className="flex size-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20" title="Open original" aria-label="Open original">
          <LuExternalLink className="size-4.5" />
        </a>
        <button onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20" aria-label="Close">
          <LuX className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 pt-0">
        <motion.img
          src={src}
          alt={name ? `${name}'s photo` : 'Photo'}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full w-auto max-w-full rounded-3xl object-contain shadow-2xl"
          style={{ maxHeight: 'min(80vh, 640px)' }}
        />
      </div>
    </motion.div>,
    document.body,
  )
}

// Wrap an avatar: when there's a photo, clicking it opens the viewer
export const ViewablePhoto = ({ src, name, subtitle, children, className = '' }) => {
  const [open, setOpen] = useState(false)
  if (!src) return children
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`cursor-zoom-in rounded-full outline-none transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-indigo-500/30 ${className}`} aria-label={`View ${name ? `${name}'s` : 'profile'} photo`} title="View photo">
        {children}
      </button>
      <AnimatePresence>{open && <PhotoViewer src={src} name={name} subtitle={subtitle} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  )
}

export default PhotoViewer
