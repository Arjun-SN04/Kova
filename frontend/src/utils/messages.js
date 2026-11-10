import useConversation from '../Zustand/UserConversation'
// Must match EDIT_WINDOW_MS in backend/controller/message.controller.js
export const EDIT_WINDOW_MS = 10 * 60 * 1000

export const canEdit = (message, now = Date.now()) =>
  now - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS

// Scroll to a message in the open chat and flash it briefly
// Scroll to a message and flash it. If it isn't loaded yet (an older page of the chat),
// the chat loads from that message first (see the pendingJump effect in Messages.jsx).
export const jumpToMessage = (id, setHighlightedId) => {
  const el = document.getElementById(`msg-${id}`)
  if (!el) return useConversation.getState().setPendingJump(String(id))
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setHighlightedId(id)
  setTimeout(() => setHighlightedId(null), 1600)
}

// ── Reactions ────────────────────────────────────────────────
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
export const MORE_REACTIONS = ['🔥', '🎉', '👏', '😍', '🤔', '😎', '😅', '💯', '👀', '🙌', '😡', '🥳', '✅', '❌', '🤝', '💪', '😴', '🤯']

// Same rules as the server: one reaction per person; same emoji again removes it
export const toggleReaction = (reactions = [], userId, emoji) => {
  const others = reactions.filter((r) => String(r.userId) !== String(userId))
  const mine = reactions.find((r) => String(r.userId) === String(userId))
  return mine?.emoji === emoji ? others : [...others, { userId, emoji }]
}

// [{ emoji, count, userIds }] in the order they were first used
export const groupReactions = (reactions = []) => {
  const groups = new Map()
  reactions.forEach((r) => {
    const g = groups.get(r.emoji) || { emoji: r.emoji, count: 0, userIds: [] }
    g.count += 1
    g.userIds.push(String(r.userId))
    groups.set(r.emoji, g)
  })
  return [...groups.values()]
}
