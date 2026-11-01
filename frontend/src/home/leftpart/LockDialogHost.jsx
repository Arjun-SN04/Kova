import React, { useEffect } from 'react'
import useConversation from '../../Zustand/UserConversation'
import { setChatLocked, verifyLockCode } from '../../utils/chatExtras'
import LockCodeDialog from './LockCodeDialog'

// Handles store().lockRequest from anywhere (chat list, chat menu):
// lockRequest.chats (optional) are the chat objects, to show their photos.
//   open   → ask for the code, then show the locked chats
//   lock   → lock the chats (choose a code first if there isn't one yet)
//   unlock → ask for the code, then unlock
const LockDialogHost = () => {
  const { lockRequest, setLockRequest, hasLockCode, unlockNow } = useConversation()
  const close = () => setLockRequest(null)

  const afterLock = (ids) => {
    // Locking the chat you're in: it stays open until you leave it
    const s = useConversation.getState()
    if (ids.includes(String(s.selectedConversation?._id))) s.unlockNow()
  }
  const lockAll = async (ids, code, qa) => {
    for (const [i, id] of ids.entries()) {
      const res = await setChatLocked(id, true, i === 0 ? code : undefined, i === 0 ? qa : undefined)
      if (!res.ok) return res
    }
    afterLock(ids)
    return { ok: true }
  }

  // Locking when a code already exists needs no dialog
  useEffect(() => {
    if (lockRequest?.action === 'lock' && hasLockCode) {
      lockAll(lockRequest.ids).finally(close)
    }
  }, [lockRequest, hasLockCode]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lockRequest) return null
  const { action, ids = [], chats } = lockRequest
  if (action === 'lock' && hasLockCode) return null

  if (action === 'lock') {
    return <LockCodeDialog mode="create" chats={chats} onClose={close} onSubmit={(code, qa) => lockAll(ids, code, qa)} />
  }
  if (action === 'unlock') {
    return (
      <LockCodeDialog
        mode="enter"
        chats={chats}
        title={ids.length === 1 ? 'Unlock this chat' : `Unlock ${ids.length} chats`}
        description="Enter your secret code. The chat goes back to your main chat list."
        onClose={close}
        onSubmit={async (code) => {
          for (const id of ids) {
            const res = await setChatLocked(id, false, code)
            if (!res.ok) return res
          }
          return { ok: true }
        }}
      />
    )
  }
  return (
    <LockCodeDialog
      mode="enter"
      chats={chats}
      title={chats?.length === 1 ? `Chat with ${chats[0].isGroup ? chats[0].name : chats[0].fullName}` : 'Locked chat'}
      description="Enter your secret code to open this chat."
      onClose={close}
      onSubmit={async (code) => {
        const res = await verifyLockCode(code)
        if (res.ok) unlockNow()
        return res
      }}
    />
  )
}

export default LockDialogHost
