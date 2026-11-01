import React, { useEffect, useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import { remarkHtmlBreaks } from '../../utils/markdown'
import { motion } from 'motion/react'
import { LuLoaderCircle, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'

const HTML_BREAKS = [remarkHtmlBreaks]

const md = {
  p: (props) => <p className="my-1 first:mt-0 last:mb-0" {...props} />,
  ul: (props) => <ul className="list-disc space-y-1 pl-4" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
}

// Summary card under the chat header, opened from the "Catch me up" chip
const CatchUp = () => {
  const { selectedConversation, catchUp, setCatchUp } = useConversation()
  const [result, setResult] = useState(null) // { summary } | { error }
  const chatId = String(selectedConversation?._id)
  const show = catchUp?.open && catchUp.chatId === chatId

  useEffect(() => {
    if (!show) return
    let stale = false
    axios.post('/api/ai/catch-up', { chatId, count: catchUp.count }, { withCredentials: true })
      .then((res) => !stale && setResult({ summary: res.data.summary }))
      .catch((err) => !stale && setResult({ error: err.response?.data?.error || "Couldn't summarize right now." }))
    return () => { stale = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, chatId])

  if (!show) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute inset-x-3 top-[4.5rem] z-20 mx-auto max-w-2xl rounded-2xl bg-white p-4 text-sm shadow-xl ring-1 ring-violet-200 sm:inset-x-6 dark:bg-slate-900 dark:ring-violet-500/30"
    >
      <div className="flex items-center gap-2">
        <img src="/images/nexa-avatar.jpg" alt="" className="size-6 shrink-0 rounded-full object-cover" />
        <p className="font-semibold">Catch up · {catchUp.count} new messages</p>
        <button onClick={() => setCatchUp(null)} aria-label="Close summary" className="ml-auto flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <LuX className="size-4" />
        </button>
      </div>
      <div className="mt-2 leading-relaxed text-slate-700 dark:text-slate-200">
        {!result ? (
          <p className="flex items-center gap-2 text-slate-500"><LuLoaderCircle className="size-4 animate-spin" /> Nexa is reading the chat…</p>
        ) : result.error ? (
          <p className="text-red-600 dark:text-red-400">{result.error}</p>
        ) : (
          <ReactMarkdown remarkPlugins={HTML_BREAKS} components={md}>{result.summary}</ReactMarkdown>
        )}
      </div>
    </motion.div>
  )
}

export default CatchUp
