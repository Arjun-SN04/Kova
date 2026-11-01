import { useEffect } from 'react'
import { useSocket } from './SocketProvider'
import useConversation from '../Zustand/UserConversation'
import { loadConversations, markSeen } from '../utils/conversations'
import { loadCommunities } from '../utils/groups'
import { loadCalls } from '../utils/calls'
import { useAuth } from './AuthProvider'
import { AI_CHAT } from '../utils/ai'
import { loadStatusFeed } from '../utils/status'
import { CHANNEL_EVENT, loadChannels } from '../utils/channels'

// Typing indicators clear themselves if no "stopTyping" arrives in time
const TYPING_TIMEOUT_MS = 4000
const typingTimers = {}

// Listens to all real-time chat events for the signed-in user.
// Mounted once by the chat layout so it works even when no chat is open.
const useListenMessages = () => {
  const { socket } = useSocket()
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)

  useEffect(() => {
    if (!socket) return
    const store = () => useConversation.getState()
    const openChatId = () => store().selectedConversation?._id?.toString()

    const stopTyping = (from) => {
      clearTimeout(typingTimers[from])
      store().setTyping(from, false)
    }

    const handleNewMessage = (newMessage) => {
      // Group messages belong to the group; direct messages to the sender
      const groupId = newMessage.groupId?.toString()
      const senderId = newMessage.senderId?.toString()
      // Call entries are also sent to the caller: those belong to the person they called
      const mine = senderId === myId
      const botPeers = newMessage.botChat?.map(String)
      const chatId = groupId
        || (botPeers ? botPeers.find((p) => p !== myId) || myId : null)
        || (mine ? newMessage.receiverId?.toString() : senderId)
      if (!mine) stopTyping(chatId)
      if (store().nexaId && senderId === String(store().nexaId)) store().setNexaThinking(chatId, false)
      store().upsertPreview(chatId, newMessage)

      if (chatId === openChatId()) {
        // From the open chat: show it, and mark it read if I'm looking at the page
        store().setMessages((prev) => (prev.some((m) => m._id === newMessage._id) ? prev : [...prev, newMessage]))
        if (document.visibilityState === 'visible') markSeen(chatId, !!groupId)
      } else if (!mine && (!newMessage.call || newMessage.call.status === 'missed')) {
        // Only missed calls count as unread, like on the server
        store().addUnread(chatId)
      }
    }

    // A contact posted or removed a status
    const handleStatus = () => loadStatusFeed()

    // Someone changed a chat's disappearing-messages timer
    const handleChatTimer = ({ chatId, seconds }) => store().setChatTimer(chatId, seconds)

    // Pinned chats changed (maybe in another tab)
    const handlePrefs = (prefs) => {
      if (prefs.pinnedChats) store().setPinnedChats(prefs.pinnedChats)
      if (prefs.lockedChats || prefs.securityQuestion !== undefined) store().setLockedPrefs(prefs)
      if (prefs.wallpapers) store().setWallpapers(prefs.wallpapers)
      if (prefs.hiddenChats) store().setHiddenPrefs(prefs)
    }

    // Nexa wrote by itself (morning brief, meeting reminder): unread dot unless its chat is open
    const handleNexaMessage = () => {
      if (!store().selectedConversation?.isAi) store().addUnread(AI_CHAT._id)
    }

    const handleMessageDeleted = (messageId) => {
      store().setMessages((prev) => prev.filter((m) => m._id !== messageId))
      loadConversations()
    }

    const handleMessagesDeleted = (ids) => {
      const gone = new Set(ids)
      store().setMessages((prev) => prev.filter((m) => !gone.has(m._id)))
      loadConversations()
    }

    const handleMessageReacted = ({ messageId, reactions }) => {
      store().setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)))
    }

    // Live location moved (or stopped)
    const handleLocationUpdated = ({ messageId, location }) => {
      store().setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, location, message: location.stopped ? '📍 Live location (ended)' : m.message } : m)))
    }

    const handleMessageEdited = (updated) => {
      // Keep the seen state we already know (seen indicators may be hidden)
      store().setMessages((prev) => prev.map((m) => (m._id === updated._id ? { ...updated, seen: m.seen } : m)))
      loadConversations()
    }

    const handleConversationDeleted = ({ otherUserId }) => {
      if (openChatId() === otherUserId?.toString()) store().setMessages([])
      loadConversations()
    }

    // The other person opened our chat: mark my messages to them as seen
    const handleMessagesSeen = ({ by }) => {
      store().setMessages((prev) =>
        prev.map((m) => (String(m.receiverId) === String(by) && !m.seen ? { ...m, seen: true } : m)))
    }

    // In groups, `from` is the group and `name` is who's typing
    const handleTyping = ({ from, name }) => {
      store().setTyping(from, name || true)
      clearTimeout(typingTimers[from])
      typingTimers[from] = setTimeout(() => store().setTyping(from, false), TYPING_TIMEOUT_MS)
    }
    const handleStopTyping = ({ from }) => stopTyping(from)

    // Groups and communities
    const handleGroupAdded = (group) => store().upsertGroup(group)
    const handleGroupUpdated = (group) => store().upsertGroup(group)
    const handleGroupRemoved = ({ groupId }) => { store().removeGroup(groupId); loadCommunities() }
    const handleCommunityChanged = () => loadCommunities()
    const handleCallLogged = () => loadCalls()
    const handleScheduled = () => store().bumpScheduled()

    socket.on('groupAdded', handleGroupAdded)
    socket.on('groupUpdated', handleGroupUpdated)
    socket.on('groupRemoved', handleGroupRemoved)
    socket.on('communityUpdated', handleCommunityChanged)
    socket.on('communityRemoved', handleCommunityChanged)
    socket.on('callLogged', handleCallLogged)
    socket.on('scheduledUpdated', handleScheduled)
    socket.on('newMessage', handleNewMessage)
    // Channels: refresh the list and tell the open channel page
    const channelEvents = ['channelPost', 'channelPostUpdated', 'channelPostDeleted', 'channelUpdated', 'channelDeleted']
    const channelHandlers = channelEvents.map((type) => [type, (data) => {
      window.dispatchEvent(new CustomEvent(CHANNEL_EVENT, { detail: { type, ...data } }))
      if (type !== 'channelPostUpdated') loadChannels()
    }])
    channelHandlers.forEach(([type, fn]) => socket.on(type, fn))
    socket.on('nexaMessage', handleNexaMessage)
    socket.on('prefsUpdated', handlePrefs)
    socket.on('chatTimer', handleChatTimer)
    socket.on('statusUpdated', handleStatus)
    socket.on('messageDeleted', handleMessageDeleted)
    socket.on('messageEdited', handleMessageEdited)
    socket.on('locationUpdated', handleLocationUpdated)
    socket.on('messagesDeleted', handleMessagesDeleted)
    socket.on('messageReacted', handleMessageReacted)
    socket.on('conversationDeleted', handleConversationDeleted)
    socket.on('messagesSeen', handleMessagesSeen)
    socket.on('typing', handleTyping)
    socket.on('stopTyping', handleStopTyping)

    return () => {
      socket.off('groupAdded', handleGroupAdded)
      socket.off('nexaMessage', handleNexaMessage)
      socket.off('prefsUpdated', handlePrefs)
      socket.off('chatTimer', handleChatTimer)
      socket.off('statusUpdated', handleStatus)
      socket.off('groupUpdated', handleGroupUpdated)
      socket.off('groupRemoved', handleGroupRemoved)
      socket.off('communityUpdated', handleCommunityChanged)
      socket.off('communityRemoved', handleCommunityChanged)
      socket.off('callLogged', handleCallLogged)
      socket.off('scheduledUpdated', handleScheduled)
      socket.off('newMessage', handleNewMessage)
      socket.off('messageDeleted', handleMessageDeleted)
      socket.off('messageEdited', handleMessageEdited)
      channelHandlers.forEach(([type, fn]) => socket.off(type, fn))
      socket.off('locationUpdated', handleLocationUpdated)
      socket.off('messagesDeleted', handleMessagesDeleted)
      socket.off('messageReacted', handleMessageReacted)
      socket.off('conversationDeleted', handleConversationDeleted)
      socket.off('messagesSeen', handleMessagesSeen)
      socket.off('typing', handleTyping)
      socket.off('stopTyping', handleStopTyping)
    }
  }, [socket, myId])
}

export default useListenMessages
