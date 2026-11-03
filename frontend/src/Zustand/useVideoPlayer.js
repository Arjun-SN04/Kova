import { create } from 'zustand'

// YouTube playback. Videos play inside their card in the chat (`inline` = that card's key, one at
// a time); "Pop out" moves one to the floating player (`video`), which lives above the whole app
// so it keeps playing while you switch chats or open settings. "Back to chat" on the floating
// player asks the card in that chat to take over (`resume`), from the same second.
const useVideoPlayer = create((set, get) => ({
  inline: null, // key of the card playing in place
  inlineStart: 0, // where that card should start (when taking over from the floating player)
  video: null, // { id, url, title, start, from } in the floating player (from = the chat it came from)
  resume: null, // { id, start }: waiting for a card of this video to take over
  playInline: (key, start = 0) => set({ inline: key, inlineStart: start, video: null }),
  stopInline: () => set({ inline: null }),
  play: (video) => set({ video, inline: null }),
  close: () => set({ video: null }),
  requestResume: (resume) => set({ resume }),
  // A card of this video claims the hand-back (only the first one does)
  claimResume: (id) => {
    const r = get().resume
    if (!r || r.id !== id) return null
    set({ resume: null })
    return r
  },
}))

export default useVideoPlayer
