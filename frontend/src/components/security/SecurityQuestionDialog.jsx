import React, { useState } from 'react'
import { LuShieldQuestion } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { saveSecurityQuestion } from '../../utils/chatExtras'
import SecretInput from '../SecretInput'
import { Label, QuestionFields, SecureDialog } from './SecurityUI'
import { useQuestion } from './passcode'

// Set or change the security question used to reset a forgotten chat lock code,
// secret word or app lock PIN. Changing it asks for the account password.
const SecurityQuestionDialog = ({ onClose }) => {
  const { securityQuestion, hasLockCode } = useConversation()
  const needsPassword = !!securityQuestion || hasLockCode
  const qa = useQuestion()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setBusy(true); setError('')
    const res = await saveSecurityQuestion({ ...qa.payload, password })
    setBusy(false)
    if (!res.ok) { setError(res.error); setPassword(''); return }
    onClose()
  }

  return (
    <SecureDialog
      onClose={onClose} icon={LuShieldQuestion}
      title={securityQuestion ? 'Change security question' : 'Set a security question'}
      subtitle="If you forget your chat lock code, secret word or app lock PIN, answer this to reset it."
      onSubmit={save} submitLabel="Save question" busyLabel="Saving…" busy={busy} error={error}
      ready={qa.valid && (!needsPassword || password.length > 0)}
    >
      {securityQuestion && <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">Current: {securityQuestion}</p>}
      <QuestionFields value={qa.value} onChange={qa.setValue} label={securityQuestion ? 'New question' : 'Question'} />
      {needsPassword && (
        <>
          <Label>Account password</Label>
          <SecretInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your Kova password" aria-label="Account password" autoComplete="current-password"
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/60 text-center text-base outline-none transition placeholder:text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-900" />
        </>
      )}
    </SecureDialog>
  )
}

export default SecurityQuestionDialog
