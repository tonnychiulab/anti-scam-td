/* 防詐迷宮 Service Worker — stale-while-revalidate＋離線導航後備
   相對路徑設計，可直接部署 GitHub Pages 子目錄 */
'use strict';
const CACHE = 'asmd-v2.0.0';   // 與 game.js 的 APP_VERSION 同步遞增
const ASSETS = ['./', './index.html', './style.css', './game.js', './i18n.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function report(hit){
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ asmdCache: hit }));
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  ev.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    const url = new URL(req.url);
    const cacheable = url.origin === location.origin ||
                      url.hostname.endsWith('gstatic.com') ||
                      url.hostname.endsWith('googleapis.com');
    // 背景更新：即使忘了 bump 版本，下次載入也會拿到新檔
    const refresh = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque') && cacheable){
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() => null);
    if (cached){
      report(true);
      ev.waitUntil(refresh);           // stale-while-revalidate
      return cached;
    }
    report(false);
    const res = await refresh;
    if (res) return res;
    if (req.mode === 'navigate'){      // 離線導航後備
      const home = await caches.match('./index.html');
      if (home) return home;
    }
    return Response.error();
  })());
});
