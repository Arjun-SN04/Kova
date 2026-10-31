import { AsyncLocalStorage } from "node:async_hooks"

// Who is making the current request: { id, contacts: Set }. Set by secureRoute /
// optionalAuth, read when user records are turned into JSON (photo / about privacy).
const store = new AsyncLocalStorage()

export const runAsViewer = (user, next) =>
  store.run(user ? { id: String(user._id), contacts: new Set((user.contacts || []).map(String)) } : null, next)

export const currentViewer = () => store.getStore() || null
