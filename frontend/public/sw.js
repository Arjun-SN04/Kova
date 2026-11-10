// Kova service worker:
// - shows push notifications and opens the app when one is tapped
// - lets the installed app open without a connection, showing the chats from last time
//
// Caching (nothing is served stale while online):
// - the app's files (/assets/*, named by content hash, never change): saved once, then read from the cache
// - the page itself: from the network; the saved copy only when offline
// - API reads (chat list, contacts, the latest messages…): from the network, a saved copy
//   only when offline. These are private, so they're wiped when you sign out.

const APP_CACHE = 'kova-app-v1'
const DATA_CACHE = 'kova-data-v1'
const MAX_DATA_ENTRIES = 300
const SHELL = ['/', '/index.html', '/site.webmanifest', '/icon-192.png', '/favicon.svg']

// API reads that are never saved: one-time passes, file downloads, sign-in flows, live AI
const NO_CACHE = /^\/api\/(user\/(socket-token|export|sessions)|message\/(file|export|view-once)\/|google\/|ai\/(speak|dictate)|calls\/ice)/

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, DATA_CACHE])
    for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name)
    await self.clients.claim()
  })())
})

// Keep the data cache from growing without end (oldest entries go first)
const trim = async () => {
  const cache = await caches.open(DATA_CACHE)
  const keys = await cache.keys()
  for (const req of keys.slice(0, Math.max(0, keys.length - MAX_DATA_ENTRIES))) await cache.delete(req)
}

const networkFirst = async (request, cacheName, fallbackUrl) => {
  try {
    const res = await fetch(request)
    if (res.ok && res.type === 'basic') {
      const copy = res.clone()
      caches.open(cacheName).then((c) => c.put(request, copy)).then(() => cacheName === DATA_CACHE && trim()).catch(() => {})
    }
    return res
  } catch (err) {
    const cached = (await caches.match(request)) || (fallbackUrl && (await caches.match(fallbackUrl)))
    if (cached) return cached
    throw err
  }
}

const cacheFirst = async (request) => {
  const cached = await caches.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) {
    const copy = res.clone()
    caches.open(APP_CACHE).then((c) => c.put(request, copy)).catch(() => {})
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_CACHE, '/index.html'))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else if (url.pathname.startsWith('/api/') && !NO_CACHE.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE))
  }
})

// Signed out: drop every saved API answer (they belong to that account)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'signed-out') event.waitUntil(caches.delete(DATA_CACHE))
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }
  const title = data.title || 'Kova'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag,              // a newer notification for the same chat replaces the old one
    renotify: !!data.tag,
    requireInteraction: !!data.urgent,
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((w) => w.url.startsWith(self.location.origin))
    if (open) { await open.focus(); return }
    await self.clients.openWindow(url)
  })())
})
