'use strict';
const CACHE = 'coverline-public-v1';
const PUBLIC_ASSETS = ['/offline.html', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (PUBLIC_ASSETS.includes(url.pathname)) { event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))); return; }
  // Never persist authenticated HTML, API responses, uploaded evidence or policy documents.
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
