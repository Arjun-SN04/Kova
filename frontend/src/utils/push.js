import axios from 'axios'

// Push notifications on this device (phone or desktop), even when Kova is closed
const api = { withCredentials: true }

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

const toKey = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const deviceName = () => {
  const ua = navigator.userAgent
  const browser = navigator.brave ? 'Brave' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

// 'on' | 'off' | 'blocked' | 'unsupported'
export const pushState = async () => {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

// Brave turns off web push unless "Use Google services for push messaging" is on
export const isBrave = async () => {
  try { return !!(navigator.brave && await navigator.brave.isBrave()) } catch { return false }
}
export const BRAVE_SETTING = 'brave://settings/privacy'

const fail = (message, code) => Object.assign(new Error(message), { code })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const sameKey = (sub, key) => {
  const have = sub?.options?.applicationServerKey
  if (!have) return true // browser doesn't tell us; assume it's fine
  const a = new Uint8Array(have)
  return a.length === key.length && a.every((v, i) => v === key[i])
}

// Subscribe, recovering from the usual hiccups: a subscription made with an old
// server key, or a push service that fails the first time.
const subscribe = async (reg, key) => {
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => {}); sub = null }
  if (sub) return sub
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  } catch (first) {
    await (await reg.pushManager.getSubscription())?.unsubscribe().catch(() => {})
    await wait(800)
    try {
      return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    } catch {
      if (await isBrave()) throw fail("Brave has push notifications switched off.", 'brave')
      if (first?.name === 'NotAllowedError') throw fail('Notifications are blocked. Allow them in your browser settings.', 'blocked')
      throw fail("Your browser's notification service didn't respond. Check your connection and try again.", 'service')
    }
  }
}

export const enablePush = async () => {
  if (!pushSupported()) throw fail("This browser can't show notifications. On iPhone, add Kova to your Home Screen first.", 'unsupported')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw fail('Notifications are blocked. Allow them in your browser settings.', 'blocked')
  const { data } = await axios.get('/api/push/key', api)
  if (!data.configured) throw fail("Notifications aren't set up on this server yet.", 'server')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await subscribe(reg, toKey(data.key))
  await axios.post('/api/push/subscribe', { subscription: sub.toJSON(), device: deviceName() }, api)
}

export const disablePush = async () => {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await axios.delete('/api/push/subscribe', { ...api, data: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}

export const testPush = () => axios.post('/api/push/test', {}, api)
