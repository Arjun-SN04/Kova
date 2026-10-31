import { useCallback, useEffect, useRef } from 'react'

// Terminal-style history for a message box: ↑ brings back what you sent before, ↓ goes forward,
// and past the newest entry you get back the draft you were typing.
// entries: past messages, oldest first. Arrows only act when the caret is on the first line (↑)
// or last line (↓), so moving around inside a multi-line message still works.
// requireAlt: only react to Alt+↑/↓ (for boxes where plain ↑ already does something).
const useInputHistory = (entries, { text, setText, inputRef, requireAlt = false }) => {
  const index = useRef(-1) // -1 = not browsing; 0 = newest entry
  const draft = useRef('')
  const list = useRef([])

  // Newest first, no blanks, no repeats in a row
  useEffect(() => {
    const out = []
    for (let i = entries.length - 1; i >= 0; i--) {
      const v = String(entries[i] || '').trim()
      if (v && v !== out[out.length - 1]) out.push(v)
    }
    list.current = out
    index.current = -1
  }, [entries])

  const show = useCallback((value) => {
    setText(value)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.setSelectionRange(value.length, value.length)
      el.scrollTop = el.scrollHeight
    })
  }, [setText, inputRef])

  // Returns true when it handled the key
  const onKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey !== requireAlt) return false
    const el = e.currentTarget
    const caret = el.selectionStart
    if (caret !== el.selectionEnd) return false
    const items = list.current

    if (e.key === 'ArrowUp') {
      if (!requireAlt && text.slice(0, caret).includes('\n')) return false
      if (index.current + 1 >= items.length) {
        if (index.current < 0) return false // nothing to recall
        e.preventDefault() // at the oldest: stay there
        return true
      }
      if (index.current === -1) draft.current = text
      index.current += 1
      e.preventDefault()
      show(items[index.current])
      return true
    }
    if (index.current === -1) return false
    if (!requireAlt && text.slice(caret).includes('\n')) return false
    e.preventDefault()
    index.current -= 1
    show(index.current === -1 ? draft.current : items[index.current])
    return true
  }, [text, show, requireAlt])

  // Call when the user types, so editing a recalled message makes it the new draft
  const reset = useCallback(() => { index.current = -1 }, [])

  return { onKeyDown, reset }
}

export default useInputHistory
