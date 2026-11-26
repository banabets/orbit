// Orbit service worker: keeps the app shell on the device so the installed app opens instantly.
// Images (token logos) are left to the browser's own HTTP cache: their hosts don't allow CORS, so a worker
// could only store opaque copies it can't check, and intercepting them just doubled every request.
// Chain data (RPC), the pons API and /api/snapshot are never cached here: they always come from the network.
const SHELL = 'orbit-shell-v8'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k)
  await self.clients.claim()
})()))

async function shell(req) {
  const c = await caches.open(SHELL)
  const hit = await c.match(req)
  if (hit) return hit
  const r = await fetch(req)
  if (r.ok) c.put(req, r.clone())
  return r
}

async function page(req) {
  const c = await caches.open(SHELL)
  try { const r = await fetch(req); if (r.ok) c.put('/', r.clone()); return r }
  catch { return (await c.match('/')) || Response.error() }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/assets/')) return e.respondWith(shell(req)) // hashed build files never change
  if (req.mode === 'navigate') return e.respondWith(page(req))
})

// Mail ping with Orbit closed (api/push.js). The push has no data on purpose: who wrote and what stays on the chain,
// encrypted. Same tag as the in-app notification, so the two never stack.
const PUSH_TEXT = {
  en: ['New message on Orbit Mail', 'Someone wrote to your wallet. Open Orbit to read it.'],
  es: ['Nuevo mensaje en Orbit Mail', 'Alguien le escribió a tu wallet. Abre Orbit para leerlo.'],
  zh: ['Orbit 邮件有新消息', '有人给你的钱包写信了。打开 Orbit 阅读。'],
}
self.addEventListener('push', (e) => {
  const lang = (self.navigator.language || 'en').slice(0, 2)
  const [title, body] = PUSH_TEXT[lang] || PUSH_TEXT.en
  e.waitUntil(self.registration.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'orbit-mail', renotify: true, data: { url: '/mail' } }))
})

// tapping a notification focuses an open Orbit window (or opens one) on the page it points to, e.g. Mail
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) { if ('focus' in w) { await w.focus(); if ('navigate' in w) await w.navigate(url).catch(() => {}); return } }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
