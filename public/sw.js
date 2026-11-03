const CACHE_NAME = 'sygesc-shell-v3'
const ROOT = new URL('./', self.registration.scope)
const SHELL_FILES = [
  'manifest.webmanifest',
  'sygesc-logo.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
]
const SHELL_PATHS = new Set(SHELL_FILES.map((path) => new URL(path, ROOT).pathname))

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(ROOT, { cache: 'reload' })
    if (!response.ok) throw new Error('Impossible de charger la coque SyGesc.')
    const html = await response.clone().text()
    const assets = new Set([ROOT.href])
    const expression = /\b(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g
    for (const match of html.matchAll(expression)) {
      assets.add(new URL(match[1], ROOT).href)
    }
    for (const path of SHELL_FILES) {
      assets.add(new URL(path, ROOT).href)
    }
    const cache = await caches.open(CACHE_NAME)
    await cache.put(ROOT, response)
    await cache.addAll([...assets].filter((asset) => asset !== ROOT.href))
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => key.startsWith('sygesc-shell-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok && url.pathname === ROOT.pathname && !url.search) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(ROOT, response.clone())
        }
        return response
      } catch {
        const cached = await caches.match(ROOT)
        if (cached) return cached
        return new Response('SyGesc est hors connexion. Reconnecte-toi pour charger l’application.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })())
    return
  }

  if (!url.pathname.includes('/assets/') && !SHELL_PATHS.has(url.pathname)) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request, { ignoreVary: true })
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
    }
    return response
  })())
})
