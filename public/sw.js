importScripts('/cache-polyfill.js');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('rememory').then((cache) => {
      return cache.addAll([
        '/',
        '/favicon.ico',
        '/asset-manifest.json',
        '/manifest.json'
      ]);
    })
  );
});
