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
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
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

export const enablePush = async () => {
  if (!pushSupported()) throw new Error("This browser can't show notifications. On iPhone, add Kova to your Home Screen first.")
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings.')
  const { data } = await axios.get('/api/push/key', api)
  if (!data.configured) throw new Error("Notifications aren't set up on this server yet.")
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(data.key) })
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
