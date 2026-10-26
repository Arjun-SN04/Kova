import { create } from 'zustand'

// When I last opened the Calls tab (for the missed-calls badge)
const SEEN_KEY = 'callsSeenAt'
const readCallsSeenAt = () => {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0 } catch { return 0 }
}
const saveCallsSeenAt = (time) => {
  try { localStorage.setItem(SEEN_KEY, String(time)) } catch { /* ignore */ }
}

const useConversation = create((set) => ({
  selectedConversation: null,
  // Switching chats also cancels any reply/edit in progress
  setSelectedConversation: (selectedConversation) =>
    set({ selectedConversation, replyingTo: null, editingMessage: null, pendingFile: null, selectionMode: false, selectedIds: [] }),

  // Multi-select mode for forwarding / copying / deleting several messages
  selectionMode: false,
  selectedIds: [],
  startSelection: (id) => set({ selectionMode: true, selectedIds: id ? [id] : [], replyingTo: null, editingMessage: null }),
  toggleSelected: (id) =>
    set((state) => {
      const selectedIds = state.selectedIds.includes(id)
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id]
      return { selectedIds }
    }),
  clearSelection: () => set({ selectionMode: false, selectedIds: [] }),

  // Message ids to forward (opens the forward dialog when set)
  forwardIds: null,
  setForwardIds: (forwardIds) => set({ forwardIds }),

  // File chosen for the next message: { file, kind, previewUrl, originalSize }
  pendingFile: null,
  setPendingFile: (pendingFile) => set({ pendingFile }),

  // Message the composer is replying to / editing (only one at a time)
  replyingTo: null,
  setReplyingTo: (replyingTo) => set({ replyingTo, editingMessage: null }),
  editingMessage: null,
  setEditingMessage: (editingMessage) => set({ editingMessage, replyingTo: null }),

  // Message to flash briefly after jumping to it from a reply
  highlightedId: null,
  setHighlightedId: (highlightedId) => set({ highlightedId }),

  messages: [],
  setMessages: (messagesOrUpdater) =>
    set((state) => ({
      messages:
        typeof messagesOrUpdater === 'function'
          ? messagesOrUpdater(state.messages)
          : messagesOrUpdater,
    })),

  // My contacts (people who accepted a request or used an invite link)
  contacts: [],
  setContacts: (contacts) => set({ contacts }),
  addContact: (user) =>
    set((state) => (state.contacts.some((c) => String(c._id) === String(user._id))
      ? {}
      : { contacts: [...state.contacts, user] })),
  // Also closes their chat if it's open: you can't message them any more
  removeContact: (userId) =>
    set((state) => ({
      contacts: state.contacts.filter((c) => String(c._id) !== String(userId)),
      ...(String(state.selectedConversation?._id) === String(userId) ? { selectedConversation: null, messages: [] } : {}),
    })),

  // Nexa's bot account id (its @Nexa answers in groups come from it)
  nexaId: null,
  setNexaId: (nexaId) => set({ nexaId }),

  // "Catch me up" offer for a chat opened with many unread messages: { chatId, count, open }
  catchUp: null,
  setCatchUp: (catchUp) => set({ catchUp }),

  // Message to scroll to once its chat has loaded (from a reminder's "Go to message")
  pendingJump: null,
  setPendingJump: (pendingJump) => set({ pendingJump }),

  // Chats where Nexa is working on an @Nexa answer: { [chatId]: startedAt }
  nexaThinking: {},
  setNexaThinking: (chatId, on) =>
    set((state) => {
      const next = { ...state.nexaThinking }
      if (on) next[String(chatId)] = Date.now()
      else delete next[String(chatId)]
      return { nexaThinking: next }
    }),

  // Bumped when a scheduled message is created, sent or cancelled (lists refetch)
  scheduledVersion: 0,
  bumpScheduled: () => set((state) => ({ scheduledVersion: state.scheduledVersion + 1 })),

  // Chats pinned to the top of my list (ids in pin order) and messages I starred
  pinnedChats: [],
  setPinnedChats: (pinnedChats) => set({ pinnedChats }),
  starredIds: [],
  setStarredIds: (starredIds) => set({ starredIds }),
  setStarred: (id, on) => set((state) => ({
    starredIds: on ? [...new Set([...state.starredIds, String(id)])] : state.starredIds.filter((s) => s !== String(id)),
  })),

  // Status (24-hour updates): { mine: [], people: [{ user, statuses, allSeen }] }
  statusFeed: { mine: [], people: [] },
  setStatusFeed: (statusFeed) => set({ statusFeed }),

  // Disappearing-messages timer per chat id (seconds, 0 = off)
  chatTimers: {},
  setChatTimer: (chatId, seconds) => set((state) => ({ chatTimers: { ...state.chatTimers, [String(chatId)]: seconds } })),

  // Which list the sidebar shows: 'chats' | 'calls' | 'communities' | 'starred'
  activePanel: 'chats',
  setActivePanel: (activePanel) =>
    set(() => {
      // Opening Calls counts as having seen the missed calls
      if (activePanel === 'calls') {
        const now = Date.now()
        saveCallsSeenAt(now)
        return { activePanel, callsSeenAt: now }
      }
      return { activePanel }
    }),

  // My call history (newest first) and when I last looked at it
  calls: [],
  setCalls: (calls) => set({ calls }),
  callsSeenAt: readCallsSeenAt(),

  // Groups I'm in (with lastMessage/unread from the server) and my communities
  groups: [],
  setGroups: (groups) => set({ groups }),
  upsertGroup: (group) =>
    set((state) => {
      const i = state.groups.findIndex((g) => String(g._id) === String(group._id))
      const groups = i === -1 ? [group, ...state.groups] : state.groups.map((g, j) => (j === i ? { ...g, ...group } : g))
      const open = state.selectedConversation
      return {
        groups,
        ...(String(open?._id) === String(group._id) ? { selectedConversation: { ...open, ...group } } : {}),
      }
    }),
  // Left / removed / deleted: drop it and close it if it's open
  removeGroup: (groupId) =>
    set((state) => ({
      groups: state.groups.filter((g) => String(g._id) !== String(groupId)),
      ...(String(state.selectedConversation?._id) === String(groupId) ? { selectedConversation: null, messages: [] } : {}),
    })),
  communities: [],
  setCommunities: (communities) => set({ communities }),

  // People who sent messages in the open group: { [userId]: { fullName, avatar, username } }
  groupPeople: {},
  setGroupPeople: (groupPeople) => set({ groupPeople }),

  // Which tab of the "New group / community" dialog is open:
  // null | { mode: 'group' | 'community' | 'communityGroup', community? }
  createDialog: null,
  setCreateDialog: (createDialog) => set({ createDialog }),

  // Contact requests: { incoming: [{ _id, from }], outgoing: [{ _id, to }] }
  requests: { incoming: [], outgoing: [] },
  setRequests: (requests) => set({ requests }),

  // Which tab of the "Add contact" dialog is open: null | 'add' | 'requests' | 'invite'
  contactsDialog: null,
  setContactsDialog: (contactsDialog) => set({ contactsDialog }),

  // Who is typing right now: { [userId]: true } for people, { [groupId]: 'Priya' } for groups
  typingUsers: {},
  setTyping: (userId, isTyping) =>
    set((state) => {
      const next = { ...state.typingUsers }
      if (isTyping) next[String(userId)] = isTyping
      else delete next[String(userId)]
      return { typingUsers: next }
    }),

  // Last message per contact for the sidebar: { [userId]: message }
  previews: {},
  setPreviews: (previews) => set({ previews }),
  upsertPreview: (userId, message) =>
    set((state) => ({ previews: { ...state.previews, [String(userId)]: message } })),

  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),

  // ── Unread notifications: { [senderId: string]: number } ──
  unreadCounts: {},

  // Increment unread — always store as string key
  addUnread: (senderId) =>
    set((state) => {
      const key = senderId?.toString()
      if (!key) return state
      return {
        unreadCounts: {
          ...state.unreadCounts,
          [key]: (state.unreadCounts[key] || 0) + 1,
        },
      }
    }),

  // Clear unread when user opens that chat
  clearUnread: (senderId) =>
    set((state) => {
      const key = senderId?.toString()
      if (!key) return state
      const next = { ...state.unreadCounts }
      delete next[key]
      return { unreadCounts: next }
    }),
}))

export default useConversation
