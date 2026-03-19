// Service Worker — enables offline use and PWA installability
// Caches all app files so the app works without internet

const CACHE_NAME = 'soccer-cards-v8';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './css/editor.css',
  './js/app.js',
  './js/data.js',
  './js/db.js',
  './js/ui.js',
  './js/photo.js',
  './js/editor.js',
  './js/scan.js',
  './js/search.js',
  './js/stats.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/sync.js',
  './img/placeholder.svg',
  './manifest.json'
];

// Install: cache all app files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network
// Firebase API requests bypass the cache entirely (must always hit network)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Pass Firebase/Google API requests straight through — never cache them
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseinstallations.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com') ||
      url.hostname.includes('gstatic.com')) {
    return; // Let the browser handle it normally
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache successful GET responses for app resources
        if (event.request.method === 'GET' && response.status === 200) {
          if (url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback
      return caches.match('./index.html');
    })
  );
});
