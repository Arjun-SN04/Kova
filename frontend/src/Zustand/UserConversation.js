import { create } from 'zustand'
import { chatRelockMs } from '../utils/appLock'

// When I last opened the Calls tab (for the missed-calls badge)
const SEEN_KEY = 'callsSeenAt'
const readCallsSeenAt = () => {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0 } catch { return 0 }
}
const saveCallsSeenAt = (time) => {
  try { localStorage.setItem(SEEN_KEY, String(time)) } catch { /* ignore */ }
}


// Unsent text per chat, kept in this browser (shown as "Draft: …" in the chat list)
const DRAFTS_KEY = 'kova-drafts'
const readDrafts = () => {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}') || {} } catch { return {} }
}

const useConversation = create((set) => ({
  drafts: readDrafts(),
  setDraft: (chatId, text) =>
    set((s) => {
      const key = String(chatId)
      const value = String(text || '')
      if ((s.drafts[key] || '') === value) return {}
      const drafts = { ...s.drafts }
      if (value.trim()) drafts[key] = value.slice(0, 5000)
      else delete drafts[key]
      try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)) } catch { /* private mode */ }
      return { drafts }
    }),

  selectedConversation: null,
  chatOpenedAt: 0,
  // Switching chats also cancels any reply/edit in progress
  setSelectedConversation: (selectedConversation) =>
    set((s) => ({
      selectedConversation, chatOpenedAt: Date.now(), replyingTo: null, editingMessage: null, pendingFiles: [], selectionMode: false, selectedIds: [], pinsOpenFor: null,
      // Opening a locked chat while still unlocked keeps the unlock going (time set in Profile → Locked chats)
      unlockedUntil: s.unlockedUntil > Date.now() && s.lockedChats.includes(String(selectedConversation?._id)) ? Date.now() + chatRelockMs() : s.unlockedUntil,
    })),

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
  // Files chosen in the message box, waiting to be sent: [{ id, file, kind, previewUrl, originalSize }]
  pendingFiles: [],
  setPendingFiles: (next) => set((s) => ({ pendingFiles: typeof next === 'function' ? next(s.pendingFiles) : next })),

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

  // Paging of the open chat: older messages exist / are loading (context/useGetMessages.js)
  hasOlder: false,
  // Open group: when each member last read it ({ userId: date }), for "Seen by"
  groupReads: {},
  setGroupReads: (next) => set((s) => ({ groupReads: typeof next === 'function' ? next(s.groupReads) : next })),
  loadingOlder: false,
  setHistory: (patch) => set(patch),

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

  // Nexa mode: chats where every message goes to Nexa (turned on with "@Nexa", off with "exit")
  nexaMode: (() => { try { return JSON.parse(localStorage.getItem('nexchat:nexaMode') || '{}') || {} } catch { return {} } })(),
  setNexaMode: (chatId, on) =>
    set((state) => {
      const next = { ...state.nexaMode }
      if (on) next[String(chatId)] = true
      else delete next[String(chatId)]
      try { localStorage.setItem('nexchat:nexaMode', JSON.stringify(next)) } catch { /* private window */ }
      return { nexaMode: next }
    }),

  // Bumped when a scheduled message is created, sent or cancelled (lists refetch)
  scheduledVersion: 0,
  bumpScheduled: () => set((state) => ({ scheduledVersion: state.scheduledVersion + 1 })),

  // Chats pinned to the top of my list (ids in pin order) and messages I starred
  pinnedChats: [],
  setPinnedChats: (pinnedChats) => set({ pinnedChats }),
  // Chats in Archived, and muted chats ({ chatId: until | null })
  archivedChats: [],
  setArchivedChats: (archivedChats) => set({ archivedChats }),
  mutedChats: {},
  setMutedChats: (mutedChats) => set({ mutedChats }),
  // Chat wallpapers ({ global, chats }) and the open wallpaper picker ({ chatId?, name? } or null)
  wallpapers: { global: null, chats: {} },
  setWallpapers: (wallpapers) => set({ wallpapers: { global: wallpapers?.global || null, chats: wallpapers?.chats || {} } }),
  // Pinned messages list is open for this chat id (header pin button); switching chats closes it
  pinsOpenFor: null,
  setPinsOpenFor: (pinsOpenFor) => set({ pinsOpenFor, pinsExpanded: false }),
  // The open bar starts compact; the chevron expands it into the full list
  pinsExpanded: false,
  setPinsExpanded: (pinsExpanded) => set({ pinsExpanded }),
  wallpaperPicker: null,
  setWallpaperPicker: (wallpaperPicker) => set({ wallpaperPicker }),
  // Hidden chats: out of the list until the secret word is typed in search
  hiddenChats: [],
  hiddenWordHash: null,
  setHiddenPrefs: ({ hiddenChats, hiddenWordHash }) => set((s) => ({
    hiddenChats: hiddenChats ?? s.hiddenChats,
    hiddenWordHash: hiddenWordHash === undefined ? s.hiddenWordHash : hiddenWordHash,
  })),
  // Ask to hide chats (set the secret word first if there isn't one): { ids: [] }
  hideRequest: null,
  setHideRequest: (hideRequest) => set({ hideRequest }),
  // Locked chats: hidden from the list until the secret code is entered (lockedOpen)
  lockedChats: [],
  hasLockCode: false,
  lockedOpen: false,
  lockCodeKind: 'numeric',
  // My security question (text only), for resetting a forgotten code / word / PIN
  securityQuestion: null,
  setLockedPrefs: ({ lockedChats, hasLockCode, lockCodeKind, securityQuestion }) => set((s) => ({
    securityQuestion: securityQuestion === undefined ? s.securityQuestion : securityQuestion,
    lockedChats: lockedChats ?? s.lockedChats,
    hasLockCode: hasLockCode ?? s.hasLockCode,
    lockCodeKind: lockCodeKind ?? s.lockCodeKind,
  })),
  setLockedOpen: (lockedOpen) => set({ lockedOpen }),
  // After the code is entered, locked chats open freely until this time (memory only:
  // a page refresh asks for the code again)
  unlockedUntil: 0,
  unlockNow: () => set({ unlockedUntil: Date.now() + chatRelockMs() }),
  // Re-lock now (after the timing setting changes)
  relockChats: () => set({ unlockedUntil: 0 }),
  // Ask for the secret code: { action: 'open' | 'lock' | 'unlock', ids: [] }
  lockRequest: null,
  setLockRequest: (lockRequest) => set({ lockRequest }),
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
  // Channels I follow or run: [{ _id, name, handle, unread, lastPost, amAdmin, following, … }]
  channels: [],
  setChannels: (channels) => set({ channels }),
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
