import { useCallback, useRef, useState } from 'react'

// Right-click (or long-press on phones) menu for a message, opened where you clicked.
// useMessageMenu() gives the handlers to put on the message and the open position.
const useMessageMenu = () => {
  const [at, setAt] = useState(null) // { x, y } or null
  const press = useRef(null)
  const close = useCallback(() => setAt(null), [])
  const cancelPress = () => { clearTimeout(press.current?.timer); press.current = null }
  const handlers = {
    onContextMenu: (e) => {
      // Let links, the selection and inputs keep the browser's own menu when text is selected
      if (window.getSelection()?.toString()) return
      e.preventDefault()
      setAt({ x: e.clientX, y: e.clientY })
    },
    // Long-press on touch screens
    onPointerDown: (e) => {
      if (e.pointerType !== 'touch') return
      const { clientX: x, clientY: y } = e
      press.current = { x, y, timer: setTimeout(() => { navigator.vibrate?.(10); setAt({ x, y }); press.current = null }, 450) }
    },
    onPointerMove: (e) => {
      if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) cancelPress()
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
  }
  return { at, close, handlers }
}

export default useMessageMenu
