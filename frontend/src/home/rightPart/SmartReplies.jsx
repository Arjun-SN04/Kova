import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuSparkles, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import useSendMessage from '../../context/useSendMessage'
import { useAuth } from '../../context/AuthProvider'
import { canPost } from '../../utils/groups'

// Suggestions can be hidden (×) and brought back (✨ Suggestions). Remembered on this device.
const PREF = 'kovaSmartReplies'
const readOn = () => { try { return localStorage.getItem(PREF) !== 'off' } catch { return true } }
const saveOn = (on) => { try { localStorage.setItem(PREF, on ? 'on' : 'off') } catch { /* private mode */ } }

// 2–3 one-tap replies to the last message someone sent you
const SmartReplies = () => {
  const { selectedConversation, messages, nexaId } = useConversation()
  const { sendMessage, loading } = useSendMessage()
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)
  const [state, setState] = useState({ for: null, replies: [] })
  const [used, setUsed] = useState(null)
  const [on, setOn] = useState(readOn)

  const last = messages[messages.length - 1]
  const fromNexa = !!last && (last.botChat?.length > 0 || (nexaId && String(last.senderId) === String(nexaId)))
  const eligible = last && !selectedConversation?.isSelf && canPost(selectedConversation, myId) &&
    String(last.senderId) !== myId && !fromNexa && !last.auto && !last.call && (last.message?.trim() || last.transcript) &&
    Date.now() - new Date(last.createdAt).getTime() < 3 * 24 * 3600_000
  const lastId = eligible ? String(last._id) : null

  useEffect(() => {
    if (!lastId || !on) return
    let stale = false
    // Wait a moment, so quick bursts of messages only ask once
    const t = setTimeout(() => {
      axios.post('/api/ai/smart-replies', { chatId: selectedConversation._id }, { withCredentials: true })
        .then((res) => { if (!stale && res.data.for === lastId) setState({ for: lastId, replies: res.data.replies }) })
        .catch(() => {})
    }, 600)
    return () => { stale = true; clearTimeout(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, on])

  const toggle = (next) => { saveOn(next); setOn(next) }

  // Hidden: a small button to bring suggestions back (only where they'd apply)
  if (!on) {
    if (!lastId) return null
    return (
      <div className="flex shrink-0 px-4 pb-1 pt-2 sm:px-6 lg:px-8">
        <button onClick={() => toggle(true)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-violet-300" title="Show reply suggestions">
          <LuSparkles className="size-3.5" /> Suggestions
        </button>
      </div>
    )
  }

  if (!lastId || state.for !== lastId || used === lastId || !state.replies.length) return null

  const send = async (text) => {
    setUsed(lastId)
    await sendMessage(text)
  }

  return (
    <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-2 sm:px-6 lg:px-8">
      <LuSparkles className="size-3.5 shrink-0 text-violet-500" aria-label="Suggested by Nexa" />
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
        {state.replies.map((r) => (
          <button
            key={r}
            disabled={loading}
            onClick={() => send(r)}
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] text-slate-700 shadow-xs ring-1 ring-slate-200 transition hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
          >
            {r}
          </button>
        ))}
      </div>
      <button onClick={() => toggle(false)} className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Hide suggestions" title="Hide suggestions">
        <LuX className="size-4" />
      </button>
    </div>
  )
}

export default SmartReplies
