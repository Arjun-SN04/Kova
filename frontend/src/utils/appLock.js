// App lock: a PIN, digits or letters and numbers (and optionally fingerprint / device unlock) to open Kova on this device.
// Only a salted PBKDF2 hash of the PIN is stored, in this browser, per account.

const KEY = (userId) => `kovaAppLock:${userId}`
const HIDDEN_AT = 'kovaHiddenAt'
// Minutes away from Kova before the PIN is asked again (-1: only when Kova is opened again)
export const LOCK_AFTER = [
  { value: 0, label: 'Immediately' },
  { value: 1, label: 'After 1 minute' },
  { value: 5, label: 'After 5 minutes' },
  { value: 15, label: 'After 15 minutes' },
  { value: 30, label: 'After 30 minutes' },
  { value: 60, label: 'After 1 hour' },
  { value: 240, label: 'After 4 hours' },
  { value: -1, label: 'Only when Kova reopens' },
]

// ── Chat lock: how long locked chats stay open after the code is entered (this device) ──
const RELOCK_KEY = 'kovaChatRelock'
// Minutes (0: ask every time a locked chat opens; -1: until Kova is closed or refreshed)
export const CHAT_RELOCK = [
  { value: 0, label: 'Every time' },
  { value: 1, label: 'After 1 minute' },
  { value: 5, label: 'After 5 minutes' },
  { value: 15, label: 'After 15 minutes' },
  { value: 30, label: 'After 30 minutes' },
  { value: 60, label: 'After 1 hour' },
  { value: -1, label: 'Until Kova closes' },
]
export const getChatRelock = () => {
  try {
    const v = Number(localStorage.getItem(RELOCK_KEY) ?? 5)
    return CHAT_RELOCK.some((o) => o.value === v) ? v : 5
  } catch { return 5 }
}
export const setChatRelock = (minutes) => { try { localStorage.setItem(RELOCK_KEY, String(minutes)) } catch { /* private window */ } }
export const chatRelockMs = () => { const m = getChatRelock(); return m < 0 ? Infinity : m * 60_000 }

const enc = new TextEncoder()
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

const hashPin = async (pin, salt) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations: 150_000 }, key, 256)
  return toB64(bits)
}

export const getLock = (userId) => {
  try { return userId ? JSON.parse(localStorage.getItem(KEY(userId)) || 'null') : null } catch { return null }
}
const saveLock = (userId, lock) => {
  try { if (lock) localStorage.setItem(KEY(userId), JSON.stringify(lock)); else localStorage.removeItem(KEY(userId)) } catch { /* ignore */ }
  window.dispatchEvent(new Event('kova-applock'))
}

// kind: "numeric" (keypad, unlocks as soon as the last digit is typed) or "alnum" (letters and numbers)
export const setPin = async (userId, pin, kind = /^\d+$/.test(pin) ? 'numeric' : 'alnum') => {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)))
  const old = getLock(userId)
  saveLock(userId, { salt, hash: await hashPin(pin, salt), len: pin.length, kind, after: old?.after ?? 0, credId: old?.credId || null })
}
export const checkPin = async (userId, pin) => {
  const lock = getLock(userId)
  return !!lock && (await hashPin(pin, lock.salt)) === lock.hash
}
export const updateLock = (userId, patch) => { const lock = getLock(userId); if (lock) saveLock(userId, { ...lock, ...patch }) }
export const removeLock = (userId) => saveLock(userId, null)

// Remember when Kova went to the background, to lock after the chosen time
export const markHidden = () => { try { sessionStorage.setItem(HIDDEN_AT, String(Date.now())) } catch { /* ignore */ } }
export const awayMinutes = () => {
  try { const t = Number(sessionStorage.getItem(HIDDEN_AT)); return t ? (Date.now() - t) / 60000 : 0 } catch { return 0 }
}

// ── Fingerprint / face / device PIN (WebAuthn platform authenticator) ──
export const bioAvailable = async () => {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false }
}
export const enableBio = async (user) => {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Kova' },
      user: { id: enc.encode(String(user._id)), name: user.username || user.email || 'kova', displayName: user.fullName || 'Kova' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })
  updateLock(user._id, { credId: toB64(cred.rawId) })
}
export const unlockWithBio = async (userId) => {
  const lock = getLock(userId)
  if (!lock?.credId) return false
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromB64(lock.credId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return true
  } catch { return false }
}
