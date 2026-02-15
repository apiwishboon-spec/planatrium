const CACHE_NAME = 'planetarium-v1';
const ASSETS = [
    './',
    './index.html',
    './main.js',
    './styles.css',
    './welcome.png',
    './music.mp3',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
