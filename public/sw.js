/* Hemlo's offline shell.
 *
 * The data was already local — but on the web the page itself still came from
 * the network, so opening the app in a basement gym showed nothing at all.
 * This keeps the built files in a cache as they are fetched and serves them
 * when there is no connection. Supabase calls are never cached: stale data
 * pretending to be current is worse than the app saying it is offline.
 */
const CACHE = 'hemlo-shell-v1'

// The build writes the emitted filenames here. Caching only what happens to be
// fetched misses the very first visit — the assets load before this worker
// takes control, so nothing of the app would be in the cache when the
// connection goes away.
const PRECACHE = self.__HEMLO_ASSETS__ || ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((url) => c.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/* Matching has to ignore Vary. The server sends "Vary: Origin", and the
 * requests this worker stored at install carry no Origin header while the ones
 * the browser makes on a reload do — so a strict match misses every asset and
 * the app fails to start with no connection, which is the one case this whole
 * file exists for. */
const MATCH = { ignoreVary: true }

async function fromCache(request) {
  const cache = await caches.open(CACHE)
  return (await cache.match(request, MATCH)) ?? (await caches.match(request, MATCH))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return          // Supabase and fonts

  // A navigation takes the network when there is one, so a new build is picked
  // up, and the cached page when there is not.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request)
        const copy = res.clone()
        void caches.open(CACHE).then((c) => c.put('/index.html', copy))
        return res
      } catch {
        return (await fromCache('/index.html')) ?? (await fromCache(request)) ?? Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const hit = await fromCache(request)
    if (hit) return hit
    try {
      const res = await fetch(request)
      if (res.ok) {
        const copy = res.clone()
        void caches.open(CACHE).then((c) => c.put(request, copy))
      }
      return res
    } catch {
      return Response.error()
    }
  })())
})
