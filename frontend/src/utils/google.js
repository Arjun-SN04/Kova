// Google Calendar connection helpers (shared by the chat layout and Nexa's calendar dialog)

export const timeZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } })()

// Where Google sent the user back to (?google=connected | cancelled | expired | missing | failed)
let googleResult = null
export const peekGoogleResult = () => googleResult
export const clearGoogleResult = () => { googleResult = null }
export const readGoogleResult = () => {
  const params = new URLSearchParams(window.location.search)
  const result = params.get('google')
  if (!result) return null
  googleResult = result
  params.delete('google')
  window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`)
  return result
}
