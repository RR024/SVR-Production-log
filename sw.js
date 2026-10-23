/* SVR Production Log — service worker.
 *
 * Scope of caching: the static app shell ONLY (HTML/CSS/JS/fonts/icons).
 * Supabase API/Auth requests are cross-origin and are never intercepted, so
 * private production data and tokens are never stored in a shared SW cache.
 *
 * To ship an update: change VERSION below. Open tabs see a waiting worker and
 * show "Update available — Refresh"; nothing reloads until the user agrees,
 * so a half-filled production form is never lost.
 */
const VERSION = 'v1.0.3'
const CACHE = `svr-shell-${VERSION}`

const SHELL = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'favicon.svg',
  'css/styles.css',
  'js/app.js',
  'js/config.js',
  'js/vendor/supabase.js',
  'js/lib/dom.js',
  'js/lib/dates.js',
  'js/lib/csv.js',
  'js/lib/errors.js',
  'js/lib/icons.js',
  'js/lib/supabase.js',
  'js/lib/ui.js',
  'js/lib/auth.js',
  'js/lib/api.js',
  'js/lib/router.js',
  'js/lib/pwa.js',
  'js/views/layout.js',
  'js/views/logcard.js',
  'js/views/login.js',
  'js/views/dashboard.js',
  'js/views/history.js',
  'js/views/detail.js',
  'js/views/form.js',
  'js/views/catalog.js',
  'js/views/reports.js',
  'js/views/users.js',
  'fonts/ibm-plex-sans-latin-400-normal.woff2',
  'fonts/ibm-plex-sans-latin-500-normal.woff2',
  'fonts/ibm-plex-sans-latin-600-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  // No skipWaiting() here: the page asks for it (see SKIP_WAITING below).
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('svr-shell-') && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase etc.: never touch

  // Page loads: network first (so deploys show up), cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE)
        return (await cache.match('index.html')) || (await cache.match('offline.html')) || Response.error()
      }),
    )
    return
  }

  // Static assets: cache first, fall back to network.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req)),
  )
})
