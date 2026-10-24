// Offline cache. Bump VERSION whenever app files or data/kb.json change,
// or installed phones keep the old copy.
// The phone AI model is cached separately by WebLLM (caches named "webllm/..."):
// this worker never deletes those, so app updates don't force a re-download.
const VERSION = 'sunshine-v6';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'data/kb.json',
  'js/app.js', 'js/core/answer.js', 'js/core/pitchRest.js', 'js/core/philosophy.js', 'js/core/retrieve.js', 'js/core/providers.js',
  'js/ai/engines.js', 'js/ai/panel.js', 'js/ai/llm-worker.js',
  'icons/mark-192.png', 'icons/mark-512.png', 'icons/favicon-64.png', 'icons/apple-touch-icon.png',
];
// Large, only needed for the phone model: cached the first time it's used.
const LAZY = 'sunshine-lazy-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sunshine-') && k !== VERSION && k !== LAZY).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  // Network first for the rules data (fresh rules when online).
  if (url.pathname.endsWith('/data/kb.json')) {
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }

  // The vendored AI runtime: cache on first use.
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.open(LAZY).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    }));
    return;
  }

  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
