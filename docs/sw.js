const CACHE      = 'bms-app-v1791280746';
const IMG_CACHE  = 'bms-img-v1791280746';

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
      // หน้าเวอร์ชันเก่า (index.html เดิม) ฟังข้อความนี้แล้ว reload เอง — คงไว้ให้เครื่องที่ยังค้างโค้ดเก่าอัปเดตได้
      // หน้าเวอร์ชันใหม่ใช้ controllerchange ใน app.js แทน (ไม่ต้องฟังข้อความนี้)
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
  if (url.pathname.startsWith('/db/')) return; // Backend (ข้อมูล /db/rest/v1/) — ไม่เก็บแคช

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
  // cache:'no-cache' = ข้าม HTTP cache ของเบราว์เซอร์ไปถามเซิร์ฟเวอร์เสมอ (ไฟล์ไม่เปลี่ยนได้ 304) — ไม่งั้น fetch
  // จะหยิบ JS เก่าที่เบราว์เซอร์แคชไว้เอง (มือถือ/PWA ค้างเวอร์ชันเก่า) · หน้าแรก (navigate) สร้าง Request ใหม่จาก URL
  const fresh = e.request.mode === 'navigate'
    ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(fresh)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
  );
});
