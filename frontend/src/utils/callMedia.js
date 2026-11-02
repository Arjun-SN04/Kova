import { useEffect, useState } from 'react'

// Shared media helpers for one-to-one and group calls

// True while someone in `stream` is talking (a glow on their tile)
let audioCtx = null
export const useSpeaking = (stream, enabled = true) => {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    if (!enabled || !stream?.getAudioTracks().length || !window.AudioContext) return
    let raf = 0
    let source
    try {
      audioCtx ||= new AudioContext()
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
      source = audioCtx.createMediaStreamSource(stream)
    } catch { return }
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    let last = 0
    let on = false
    const tick = (t) => {
      raf = requestAnimationFrame(tick)
      if (t - last < 120) return
      last = t
      analyser.getByteFrequencyData(data)
      const level = data.reduce((a, b) => a + b, 0) / data.length
      const next = level > 18
      if (next !== on) { on = next; setSpeaking(next) }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); try { source.disconnect() } catch { /* already gone */ } setSpeaking(false) }
  }, [stream, enabled])
  return speaking
}

// Swap the outgoing video track on every connection (camera flip, screen share)
export const replaceVideoTrack = (connections, track) => Promise.all(connections.map((pc) => {
  const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
  return sender ? sender.replaceTrack(track).catch(() => {}) : null
}))

export const canShareScreen = () => !!navigator.mediaDevices?.getDisplayMedia && window.matchMedia('(pointer: fine)').matches
export const canFlipCamera = () => window.matchMedia('(pointer: coarse)').matches

// A new camera track facing the other way ('user' <-> 'environment')
export const cameraTrack = async (facingMode) => {
  const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } })
  return s.getVideoTracks()[0]
}

// The screen (or a window / tab) to share; null if they cancelled
export const screenTrack = async () => {
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
    return s.getVideoTracks()[0]
  } catch { return null }
}
