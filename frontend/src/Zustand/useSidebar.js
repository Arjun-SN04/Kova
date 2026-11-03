import { create } from 'zustand'

// The chat list can be collapsed on computers to give chats more room (the section rail stays).
// It changes only when the user asks: the panel button or Ctrl/Cmd+B collapse or show it, and
// clicking a section in the rail while it's collapsed shows it again. Remembered on this device.
const KEY = 'kova-sidebar-collapsed'
const read = () => { try { return localStorage.getItem(KEY) === 'true' } catch { return false } }

const useSidebar = create((set, get) => ({
  collapsed: read(),
  setCollapsed: (collapsed) => {
    try { localStorage.setItem(KEY, String(collapsed)) } catch { /* private mode */ }
    set({ collapsed })
  },
  toggle: () => get().setCollapsed(!get().collapsed),
}))

export default useSidebar
