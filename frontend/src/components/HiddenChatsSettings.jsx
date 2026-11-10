import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LuEye, LuEyeOff, LuKeyRound } from 'react-icons/lu'
import { Row, RowGroup, SectionHeader, Tip } from './security/SettingsRows'
import useConversation from '../Zustand/UserConversation'
import { HiddenWordDialog } from '../home/leftpart/HiddenChats'

// Profile → Hidden chats: the secret word that shows hidden chats in search
const HiddenChatsSettings = () => {
  const { hiddenChats, hiddenWordHash, setHiddenPrefs } = useConversation()
  const [dialog, setDialog] = useState(null) // create | change | off

  // The settings page can open on its own: load the current state
  useEffect(() => {
    axios.get('/api/message/prefs', { withCredentials: true }).then((r) => setHiddenPrefs(r.data)).catch(() => {})
  }, [setHiddenPrefs])

  const on = !!hiddenWordHash
  const count = hiddenChats.length
  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        icon={LuEyeOff} title="Hidden chats"
        on={on} status={on ? `${count} hidden` : 'Off'}
        description={on ? 'Hidden from your chat list, search and contacts. Type your secret word in the chat search box to see them.' : 'Hide chats from your list, search and contacts. They show only when you type a secret word in the chat search box.'}
      />
      <RowGroup>
        <Row icon={LuKeyRound} title={on ? 'Change secret word' : 'Set a secret word'} description={on ? 'The word that shows hidden chats' : 'You type it in the chat search box'} onClick={() => setDialog(on ? 'change' : 'create')} />
        {on && <Row icon={LuEye} tone="danger" title="Turn off hidden chats" description="Hidden chats go back to your chat list" onClick={() => setDialog('off')} />}
      </RowGroup>
      <Tip>To hide a chat, open its ⋯ menu and choose Hide chat, or right-click it in the chat list.</Tip>
      {dialog && <HiddenWordDialog mode={dialog} onClose={() => setDialog(null)} />}
    </div>
  )
}

export default HiddenChatsSettings
