const CACHE_NAME = 'anpmart-v1';
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request).catch(() => new Response("Offline Mode")));
});
