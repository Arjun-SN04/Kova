import React, { useState } from 'react'
import { LuCheck, LuCopy } from 'react-icons/lu'
import { BRAVE_SETTING } from '../utils/push'

// What went wrong turning on notifications, and how to fix it.
// `error`: an Error from enablePush() (its `code` picks the advice)
const PushHelp = ({ error, compact = false }) => {
  const [copied, setCopied] = useState(false)
  if (!error) return null
  const text = compact ? 'text-xs' : 'text-sm'
  const stillWorks = 'Notification' in window && Notification.permission === 'granted'

  if (error.code === 'brave') {
    const copy = async () => {
      try { await navigator.clipboard.writeText(BRAVE_SETTING); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
    }
    return (
      <div className={`mt-2 rounded-lg bg-amber-50 p-2.5 ${text} text-amber-900 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/20`}>
        <p className="font-semibold">Brave blocks notifications by default. To turn them on:</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4">
          <li>
            Open{' '}
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-amber-300 hover:bg-white dark:bg-black/20 dark:ring-amber-400/30" title="Copy">
              {BRAVE_SETTING} {copied ? <LuCheck className="size-3" /> : <LuCopy className="size-3" />}
            </button>{' '}
            in a new tab (copy and paste it)
          </li>
          <li>Turn on <b>Use Google services for push messaging</b></li>
          <li>Restart Brave, then tap <b>Turn on</b> here again</li>
        </ol>
        {stillWorks && <p className="mt-1.5 opacity-80">Until then, you’ll still get notifications while Kova is open in a tab.</p>}
      </div>
    )
  }

  return (
    <p className={`mt-1.5 ${text} text-red-600 dark:text-red-400`}>
      {error.message}
      {error.code === 'service' && stillWorks && ' You’ll still get notifications while Kova is open in a tab.'}
    </p>
  )
}

export default PushHelp
