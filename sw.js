/* 防詐迷宮 Service Worker — 快取優先策略＋命中率回報
   相對路徑設計，可直接部署 GitHub Pages 子目錄 */
'use strict';
const CACHE = 'asmd-v1.4.1';   // 與 game.js 的 APP_VERSION 同步遞增，確保更新後不吃舊快取
const ASSETS = ['./', './index.html', './style.css', './game.js', './i18n.js'];

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
    if (cached){ report(true); return cached; }
    report(false);
    try {
      const res = await fetch(req);
      // 同源與字型資源存入快取（Google Fonts 為 opaque 亦可存）
      const url = new URL(req.url);
      const cacheable = url.origin === location.origin ||
                        url.hostname.endsWith('gstatic.com') ||
                        url.hostname.endsWith('googleapis.com');
      if (res && (res.ok || res.type === 'opaque') && cacheable){
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
      }
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
