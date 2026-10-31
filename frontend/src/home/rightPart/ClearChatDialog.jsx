import React from 'react'
import axios from 'axios'
import DeleteChoiceDialog from '../DeleteChoiceDialog'
import useConversation from '../../Zustand/UserConversation'
import { loadConversations } from '../../utils/conversations'

// Clear every message in the open chat: just for me, or for both of us (files freed on Cloudinary)
const ClearChatDialog = ({ open, onClose }) => {
  const { selectedConversation, setMessages } = useConversation()
  const self = !!selectedConversation?.isSelf

  const clearChat = async (mode) => {
    try {
      const forMe = mode === 'me' && !self
      await axios.delete(`/api/message/conversation/${selectedConversation._id}${forMe ? '?for=me' : ''}`, { withCredentials: true })
      setMessages([])
      loadConversations()
      onClose()
    } catch (err) {
      console.log(err)
    }
  }

  return (
    <DeleteChoiceDialog
      open={open}
      onClose={onClose}
      onDelete={clearChat}
      what="all messages in this chat"
      canEveryone={!self}
    />
  )
}

export default ClearChatDialog
