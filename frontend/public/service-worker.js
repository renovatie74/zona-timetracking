// Service worker — verbatim from spec §2.4.
// App shell cache-first; /api/* network-only with offline error response.
// NO sync events. NO IndexedDB. NO push events.
//
// v2: bump cache name to evict v1 (which cached stale index.html +
// non-existent /app.css, /app.js paths from pre-Vite builds).
// HTML navigation is now network-first so new deployments always
// load the correct hashed JS bundle.

const CACHE = 'zona-time-v2';
const STATIC = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
);

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API: network-only; return structured error JSON if offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: 'Connection required. Please try again.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    return;
  }

  // HTML navigation (/, /login, /dashboard, …): network-first.
  // Ensures fresh index.html is served after every deployment so the
  // correct hashed JS bundle URL is always used.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(c => c.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match('/'))
        ),
    );
    return;
  }

  // Static assets (/assets/*, /icons/*, /manifest.json): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy));
        return response;
      });
    }),
  );
});
