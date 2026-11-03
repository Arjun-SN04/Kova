import useVideoPlayer from '../Zustand/useVideoPlayer'

// YouTube links -> video id, so any YouTube link in the app can play in the pop-up player
const ID_RE = /^[\w-]{11}$/

export const youtubeId = (url) => {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www\.|m\.)/, '')
    let id = null
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
    else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1]
    }
    return id && ID_RE.test(id) ? id : null
  } catch {
    return null
  }
}

// Start time from ?t=90 / ?t=1m30s / &start=90
export const youtubeStart = (url) => {
  try {
    const t = new URL(url).searchParams.get('t') || new URL(url).searchParams.get('start')
    if (!t) return 0
    if (/^\d+$/.test(t)) return Number(t)
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
    return (Number(m?.[1] || 0) * 3600) + (Number(m?.[2] || 0) * 60) + Number(m?.[3] || 0)
  } catch {
    return 0
  }
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
// Every distinct YouTube video in some text (Markdown links included)
export const youtubeLinks = (text = '') => {
  const seen = new Set()
  const out = []
  for (const url of String(text).match(URL_RE) || []) {
    const id = youtubeId(url)
    if (id && !seen.has(id)) { seen.add(id); out.push({ id, url }) }
  }
  return out
}

// A click on a YouTube link: play it in that message's video card if there is one (in place),
// otherwise in the floating player. Ctrl/Cmd-click still opens YouTube in a new tab.
export const playIfYoutube = (e, url, title) => {
  const id = youtubeId(url)
  if (!id || e.ctrlKey || e.metaKey || e.shiftKey) return false
  e.preventDefault()
  // The nearest card for this video, looking a few levels up from the link (same message)
  let el = e.currentTarget?.parentElement
  for (let i = 0; el && i < 8; i++, el = el.parentElement) {
    const card = el.querySelector?.(`button[data-yt="${id}"]`)
    if (card) { card.click(); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return true }
    if (el.querySelector?.(`[data-yt="${id}"]`)) return true // already playing there
  }
  useVideoPlayer.getState().play({ id, url, title, start: youtubeStart(url) })
  return true
}

// enablejsapi: the player reports its position (so "Pop out" can carry on from the same second)
export const youtubeEmbed = (id, start = 0) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}${start ? `&start=${Math.floor(start)}` : ''}`

// Ask an embedded YouTube player to report its position; onTime(seconds) is called as it plays.
// Returns a function that stops listening.
export const followPlayerTime = (iframe, onTime) => {
  const onMessage = (e) => {
    if (e.source !== iframe?.contentWindow) return
    try {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      const t = data?.info?.currentTime
      if (typeof t === 'number') onTime(t)
    } catch { /* not a player message */ }
  }
  window.addEventListener('message', onMessage)
  const listen = () => iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  listen()
  iframe?.addEventListener('load', listen)
  return () => { window.removeEventListener('message', onMessage); iframe?.removeEventListener('load', listen) }
}

export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
