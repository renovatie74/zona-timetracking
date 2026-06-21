// Service worker — verbatim from spec §2.4.
// App shell cache-first; /api/* network-only with offline error response.
// NO sync events. NO IndexedDB. NO push events.

const CACHE = 'zona-time-v1';
const SHELL = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    // API: network only; return structured error JSON if offline
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: 'Connection required. Please try again.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  } else {
    // App shell: cache-first
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request)),
    );
  }
});
