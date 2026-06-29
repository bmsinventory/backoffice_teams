const CACHE      = 'bms-app-v1782751050';
const IMG_CACHE  = 'bms-img-v1782751050';

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

// Activate: delete old caches, claim clients, then notify them to reload
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED' }));
        })
      )
  );
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
