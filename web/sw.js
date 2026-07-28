/*
 * Offline service worker. It precaches the app shell on install so the
 * playground works with no network after the first visit, and serves
 * cache-first (the app makes no network requests at runtime anyway, so
 * a stale cache is never wrong). Bump CACHE when the shell changes.
 */

const CACHE = 'cronproof-shell-v1';
const SHELL = ['./', './index.html', './app.js', './styles.css'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => hit ?? fetch(event.request)),
  );
});
