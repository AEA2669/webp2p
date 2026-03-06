const CACHE_NAME = 'filedrop-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/maskable-icon.svg'
];

const CDN_ASSETS = [
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
];
// Note: Tailwind CDN excluded — it's a JIT compiler that generates CSS dynamically.
// It's better to let it load from network and fallback to cached HTML which already has inline styles applied.

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache app shell first (critical)
      return cache.addAll(APP_SHELL).then(() => {
        // Cache CDN assets best-effort (don't fail install if CDN is down)
        return Promise.allSettled(
          CDN_ASSETS.map((url) => cache.add(url))
        );
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // Skip PeerJS signaling server requests and other API calls
  if (url.pathname.includes('/peerjs/') || url.hostname.includes('peerjs')) return;

  // CDN assets: cache-first (they're version-pinned)
  if (CDN_ASSETS.some((cdnUrl) => e.request.url.startsWith(cdnUrl))) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Tailwind CDN: network-first with no caching (JIT compiler)
  if (e.request.url.includes('cdn.tailwindcss.com')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell (HTML, manifest, icons): network-first, fallback to cache
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
});
