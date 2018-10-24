importScripts('/cache-polyfill.js');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('rememorize').then((cache) => {
      return cache.addAll([
        '/',
        '/favicon.ico',
        '/asset-manifest.json',
        '/manifest.json'
      ]);
    })
  );
});
w