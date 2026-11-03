import React, { useState } from 'react'
import { LuGlobe } from 'react-icons/lu'
import YouTubeCard from '../../components/YouTubeCard'
import { playIfYoutube, youtubeId, youtubeLinks } from '../../utils/youtube'

// The first YouTube video in a message, as a playable card (when there's no preview card for it)
export const YouTubeFromText = ({ text, itsMe }) => {
  const [video] = youtubeLinks(text)
  return video ? <YouTubeCard id={video.id} url={video.url} itsMe={itsMe} /> : null
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/gi

// Message text with links you can click
export const LinkifiedText = ({ text, itsMe }) => {
  const parts = String(text).split(URL_RE)
  return parts.map((part, i) => {
    if (i % 2 === 0) return part
    const trail = part.match(/[.,!?;:]+$/)?.[0] || ''
    const url = trail ? part.slice(0, -trail.length) : part
    return (
      <React.Fragment key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => { e.stopPropagation(); playIfYoutube(e, url) }}
          className={`break-all underline underline-offset-2 ${itsMe ? 'text-white decoration-white/50 hover:decoration-white' : 'text-indigo-600 decoration-indigo-300 hover:decoration-indigo-600 dark:text-indigo-300 dark:decoration-indigo-500/50'}`}>
          {url}
        </a>{trail}
      </React.Fragment>
    )
  })
}

// Card with the page's image, site, title and description
export const LinkPreviewCard = ({ preview, itsMe }) => {
  const [imgOk, setImgOk] = useState(true)
  if (!preview?.title) return null
  // YouTube: a thumbnail that plays in the pop-up player
  const ytId = youtubeId(preview.url)
  if (ytId) return <YouTubeCard id={ytId} url={preview.url} title={preview.title} itsMe={itsMe} />
  return (
    <a
      href={preview.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}
      className={`mt-2 block max-w-[360px] overflow-hidden rounded-xl transition ${itsMe ? 'bg-white/10 hover:bg-white/15' : 'bg-slate-50 ring-1 ring-slate-200/80 hover:bg-slate-100 dark:bg-slate-900/60 dark:ring-slate-700/60 dark:hover:bg-slate-900'}`}
    >
      {preview.image && imgOk && (
        <img src={preview.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="aspect-[1.91/1] w-full bg-black/5 object-cover" />
      )}
      <div className="px-3 py-2.5">
        <p className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide ${itsMe ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
          <LuGlobe className="size-3" /> {preview.site}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug">{preview.title}</p>
        {preview.description && <p className={`mt-0.5 line-clamp-2 text-xs leading-snug ${itsMe ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>{preview.description}</p>}
      </div>
    </a>
  )
}
