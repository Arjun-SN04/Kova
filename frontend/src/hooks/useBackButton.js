import { useEffect } from 'react'
import useConversation from '../Zustand/UserConversation'

// Phone back button / back swipe: opening a chat (or the Status, Calls or other tabs)
// doesn't change the URL, so "back" used to leave Kova. While something is open we keep
// one extra history entry; going back closes the chat first, then returns to Chats.
const isOpen = (s) => !!s.selectedConversation || s.activePanel !== 'chats'
const onLayer = () => !!window.history.state?.kovaLayer

const useBackButton = () => {
  useEffect(() => {
    let ownBack = false // a back() we started ourselves, not the user
    const sync = (s) => {
      if (isOpen(s) && !onLayer()) {
        // Keep React Router's own state (key, idx) so it doesn't lose track
        window.history.pushState({ ...window.history.state, kovaLayer: true }, '')
      } else if (!isOpen(s) && onLayer()) {
        // Closed with an on-screen button: drop the extra entry
        ownBack = true
        window.history.back()
      }
    }

    const onPop = () => {
      const s = useConversation.getState()
      // Our own back() finished: another chat may have opened meanwhile, so re-check only
      if (ownBack) { ownBack = false; sync(s); return }
      if (!isOpen(s) || onLayer()) return
      if (s.selectedConversation) s.setSelectedConversation(null)
      else s.setActivePanel('chats')
      // Still inside a tab (e.g. closed a channel, now on the Channels list): one more back to Chats
      sync(useConversation.getState())
    }

    sync(useConversation.getState())
    const unsubscribe = useConversation.subscribe((s, prev) => {
      if (isOpen(s) !== isOpen(prev)) sync(s)
    })
    window.addEventListener('popstate', onPop)
    return () => { unsubscribe(); window.removeEventListener('popstate', onPop) }
  }, [])
}

export default useBackButton
