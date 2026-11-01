import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { downloadFile } from '../../utils/attachments'
import { LuDownload, LuImage, LuRefreshCw } from 'react-icons/lu'

// Nexa's pictures are drawn on our server (Puter FLUX) and kept on Cloudinary.
const SIZES = { square: [1024, 1024], portrait: [768, 1024], landscape: [1024, 768] }

const started = new Set() // action ids already being drawn (survives remounts)

const NexaImage = ({ messageId, action, fresh, onSaved }) => {
  // New requests start by themselves; older unfinished ones wait for a click
  const [state, setState] = useState(() => (action.url ? 'done' : fresh && !started.has(action.id) ? 'drawing' : 'idle')) // idle | drawing | done | error
  const [error, setError] = useState('')
  const [w, h] = action.width && action.height ? [action.width, action.height] : SIZES[action.shape] || SIZES.square

  const run = useCallback(() => {
    started.add(action.id)
    axios.post(`/api/ai/messages/${messageId}/image`, { actionId: action.id }, { withCredentials: true })
      .then((res) => { onSaved(messageId, res.data.action); setState('done') })
      .catch((err) => { setError(err.response?.data?.error || "Couldn't create the image."); setState('error') })
  }, [action.id, messageId, onSaved])

  useEffect(() => {
    if (state === 'drawing' && !started.has(action.id)) run()
  }, [state, action.id, run])

  const draw = () => { setError(''); setState('drawing'); run() }

  const src = action.url
  const box = 'mt-1.5 w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-slate-200/80 dark:bg-slate-800/70 dark:ring-slate-700/60'

  if (state === 'done' && src) {
    return (
      <div className={box}>
        <a href={src} target="_blank" rel="noreferrer" title="Open full size">
          <img src={src} alt={action.prompt} className="block w-full" style={{ aspectRatio: `${w} / ${h}` }} />
        </a>
        <div className="flex items-center gap-2 px-3 py-2">
          <p className="line-clamp-1 flex-1 text-xs text-slate-500 dark:text-slate-400" title={action.prompt}>{action.prompt}</p>
          <button type="button" onClick={() => downloadFile(src, `nexa-image-${action.id || Date.now()}`)} className="flex size-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100" title="Download" aria-label="Download">
            <LuDownload className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }

  if (state === 'drawing') {
    return (
      <div className={box}>
        <div className="flex w-full animate-pulse flex-col items-center justify-center gap-2 bg-violet-50 text-violet-500 dark:bg-violet-500/10 dark:text-violet-300" style={{ aspectRatio: `${w} / ${h}` }}>
          <LuImage className="size-6" />
          <span className="text-xs font-medium">Creating image…</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`${box} px-3 py-2.5`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-300"><LuImage className="size-3.5" /> Image</p>
      <p className="mt-1 line-clamp-3 border-l-2 border-slate-200 pl-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">{action.prompt}</p>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button onClick={draw} className="mt-2 inline-flex h-7 items-center gap-1 rounded-md bg-violet-600 px-2.5 text-xs font-medium text-white transition hover:bg-violet-500">
        {state === 'error' ? <><LuRefreshCw className="size-3.5" /> Try again</> : <><LuImage className="size-3.5" /> Create image</>}
      </button>
    </div>
  )
}

export default NexaImage
