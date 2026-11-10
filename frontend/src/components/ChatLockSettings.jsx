import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuKeyRound, LuMessageSquareLock, LuRotateCcw, LuShieldQuestion, LuTimer } from 'react-icons/lu'
import { Row, RowGroup, SectionHeader, Tip } from './security/SettingsRows'
import Select from './ui/Select'
import { CHAT_RELOCK, getChatRelock, setChatRelock } from '../utils/appLock'
import useConversation from '../Zustand/UserConversation'
import LockCodeDialog from '../home/leftpart/LockCodeDialog'
import { changeLockCode } from '../utils/chatExtras'
import SecurityQuestionDialog from './security/SecurityQuestionDialog'

// Profile → Locked chats: set, change or reset the chat lock code
const ChatLockSettings = () => {
  const { lockedChats, hasLockCode, securityQuestion, setLockedPrefs } = useConversation()
  // The settings page can open on its own: load the current state
  useEffect(() => {
    axios.get('/api/message/prefs', { withCredentials: true }).then((r) => setLockedPrefs(r.data)).catch(() => {})
  }, [setLockedPrefs])
  const [dialog, setDialog] = useState(null) // create | change | reset | question
  // How long locked chats stay open after the code (this device)
  const [relock, setRelock] = useState(getChatRelock)
  const relockChats = useConversation((st) => st.relockChats)
  const changeRelock = (v) => {
    const minutes = Number(v)
    setChatRelock(minutes)
    setRelock(minutes)
    relockChats() // the new timing starts with the next code entry
  }
  const count = lockedChats.length
  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        icon={LuMessageSquareLock} title="Locked chats"
        on={hasLockCode} status={hasLockCode ? `${count} locked` : 'Off'}
        description={hasLockCode ? 'Locked chats move to their own folder and open only with your lock code.' : 'Keep chats behind a code. Locked chats move to their own folder.'}
      />
      <RowGroup>
        <Row icon={LuKeyRound} title={hasLockCode ? 'Change lock code' : 'Set a lock code'} description={hasLockCode ? 'Used to open every locked chat' : 'Numbers, or letters and numbers'} onClick={() => setDialog(hasLockCode ? 'change' : 'create')} />
        {hasLockCode && (
          <Row
            icon={LuTimer} title="Ask for the code again"
            description={relock === 0 ? 'Every time you open a locked chat' : relock < 0 ? 'Once per visit; closing Kova locks them again' : 'After you enter it, locked chats stay open this long'}
            control={<div className="sm:w-44"><Select size="sm" value={relock} onChange={changeRelock} options={CHAT_RELOCK} aria-label="Ask for the chat lock code again" /></div>}
          />
        )}
        <Row icon={LuShieldQuestion} title="Security question" description="Resets a forgotten lock code, secret word or app PIN" value={securityQuestion ? 'Set' : 'Not set'} onClick={() => setDialog('question')} />
        {hasLockCode && <Row icon={LuRotateCcw} title="Forgot lock code" description="Reset it with your security question" onClick={() => setDialog('reset')} />}
      </RowGroup>
      <Tip>To lock a chat, open its ⋯ menu and choose Lock chat, or right-click it in the chat list.</Tip>
      {dialog === 'question' && <SecurityQuestionDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== 'question' && <LockCodeDialog mode={dialog} onClose={() => setDialog(null)} onSubmit={(code, qa) => changeLockCode('', code, qa)} />}
    </div>
  )
}

export default ChatLockSettings
