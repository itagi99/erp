self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
    // Allows the app to work and bypass aggressive caching for live database hits
});
