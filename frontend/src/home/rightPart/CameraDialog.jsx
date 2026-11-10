import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { LuCheck, LuRotateCcw, LuSwitchCamera, LuX } from 'react-icons/lu'

// Take a photo with the device camera. Returns a JPEG File through onCapture;
// it then goes through the normal compression + preview step before sending.
const CameraDialog = ({ onClose, onCapture }) => {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facing, setFacing] = useState('user')
  const [canSwitch, setCanSwitch] = useState(false)
  const [shot, setShot] = useState(null) // { blob, url }
  const [error, setError] = useState('')

  const stop = () => streamRef.current?.getTracks().forEach((t) => t.stop())

  const start = useCallback(async () => {
    stop()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1600 }, height: { ideal: 1200 } },
        audio: false,
      })
      streamRef.current = stream
      setError('')
      if (videoRef.current) videoRef.current.srcObject = stream
      const devices = await navigator.mediaDevices.enumerateDevices()
      setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1)
    } catch (err) {
      setError(err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in your browser settings and try again.'
        : "Couldn't open the camera on this device.")
    }
  }, [facing])

  useEffect(() => {
    // State is only set after the request / camera answers (async), not during the effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!shot) start()
    return stop
  }, [start, shot])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Free the preview image when it's replaced or the dialog closes
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url) }, [shot])

  const capture = () => {
    const video = videoRef.current
    if (!video?.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    // Mirror selfies so the photo matches what you saw
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      stop()
      setShot({ blob, url: URL.createObjectURL(blob) })
    }, 'image/jpeg', 0.9)
  }

  const usePhoto = () => {
    onCapture(new File([shot.blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    onClose()
  }

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col bg-slate-950"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-sm font-medium">Take a photo</p>
        <button onClick={onClose} aria-label="Close camera" className="flex size-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <LuX className="size-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        {error ? (
          <p className="max-w-sm text-center text-sm text-slate-300">{error}</p>
        ) : shot ? (
          <img src={shot.url} alt="Captured" className="max-h-full max-w-full rounded-2xl object-contain" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`max-h-full max-w-full rounded-2xl bg-black object-contain ${facing === 'user' ? '-scale-x-100' : ''}`}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-8 p-6">
        {shot ? (
          <>
            <button onClick={() => setShot(null)} className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-medium text-white hover:bg-white/20">
              <LuRotateCcw className="size-4" /> Retake
            </button>
            <button onClick={usePhoto} className="flex h-12 items-center gap-2 rounded-full bg-indigo-600 px-6 text-sm font-medium text-white hover:bg-indigo-500">
              <LuCheck className="size-4" /> Use photo
            </button>
          </>
        ) : (
          <>
            <span className="size-12" />
            <button
              onClick={capture}
              disabled={!!error}
              aria-label="Take photo"
              className="size-18 rounded-full border-4 border-white bg-white/20 transition hover:bg-white/40 active:scale-95 disabled:opacity-30"
            />
            {canSwitch ? (
              <button
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                aria-label="Switch camera"
                className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <LuSwitchCamera className="size-5" />
              </button>
            ) : <span className="size-12" />}
          </>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}

export default CameraDialog
