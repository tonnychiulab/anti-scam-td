/* Anti-Scam Defense Service Worker: app-shell precache + stale-while-revalidate. */
'use strict';

const CACHE_PREFIX = 'asmd-';
const CACHE = `${CACHE_PREFIX}v2.0.2`;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './i18n.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function report(hit) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ asmdCache: hit }));
}

async function fetchAndCache(request) {
  let response;

  try {
    response = await fetch(request);
  } catch (_) {
    return null;
  }

  // The caller limits this to same-origin GETs; only successful responses are cached.
  if (response.ok) {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    } catch (_) {
      // A cache write failure must not hide an otherwise usable network response.
    }
  }

  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Let the browser handle mutations and third-party resources without caching them.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const cachePromise = caches.open(CACHE);
  const cachedPromise = cachePromise.then(cache => cache.match(request));
  const refreshPromise = cachedPromise.then(() => fetchAndCache(request));

  // Keep the worker alive until both fetch and cache.put have completed.
  event.waitUntil(refreshPromise.then(() => undefined));

  event.respondWith((async () => {
    const cached = await cachedPromise;
    if (cached) {
      void report(true);
      return cached;
    }

    void report(false);
    const response = await refreshPromise;
    if (response) return response;

    if (request.mode === 'navigate') {
      const cache = await cachePromise;
      const fallbackUrl = new URL('./index.html', self.registration.scope);
      const fallback = await cache.match(fallbackUrl.href);
      if (fallback) return fallback;
    }

    return Response.error();
  })());
});
