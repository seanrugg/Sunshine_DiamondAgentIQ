// Offline cache. Bump VERSION whenever app files or data/kb.json change,
// or installed phones keep the old copy.
const VERSION = 'sunshine-v4';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'data/kb.json',
  'js/app.js', 'js/core/answer.js', 'js/core/pitchRest.js', 'js/core/philosophy.js', 'js/core/retrieve.js',
  'icons/mark-192.png', 'icons/mark-512.png', 'icons/favicon-64.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // API calls always go to the network
  // Network first for kb.json (fresh rules when online), cache first for everything else.
  if (url.pathname.endsWith('/data/kb.json')) {
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
