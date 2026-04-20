const CACHE_NAME = 'anpmart-erp-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass all network requests through smoothly to ensure live database sync works
    event.respondWith(fetch(event.request).catch(() => {
        return new Response("Offline mode not ready.");
    }));
});
