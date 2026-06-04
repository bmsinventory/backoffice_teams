const CACHE      = 'bms-app-v5';
const IMG_CACHE  = 'bms-img-v5';

const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2'];

// Install: pre-cache images only (app shell is network-first)
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(IMG_CACHE).then((c) =>
      c.addAll([
        './img/BMS_T.png',
        './img/icon_app.png',
        './manifest.json',
      ].map((u) => new Request(u, { cache: 'reload' }))).catch(() => {})
    )
  );
});

// Activate: delete all old caches, claim all clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== IMG_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const ext = '.' + url.pathname.split('.').pop().toLowerCase();

  // Cache-first for images/fonts (rarely change)
  if (IMG_EXTS.includes(ext)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) caches.open(IMG_CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // Network-first for HTML, JS, CSS — always get latest, cache as fallback
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
  );
});
