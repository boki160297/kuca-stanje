const CACHE_NAME = 'smocnica-v5';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: network first for API, cache first for static assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
    } else {
        event.respondWith(cacheFirst(request));
    }
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'Nema internet veze' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
