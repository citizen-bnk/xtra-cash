/* XTRA-CASH service worker: fast app start (cached build files and images) and an offline screen. Balances, payments and anything else
 * under /api/ always go to the network and are never cached. Bump VERSION to drop old caches. */
const VERSION = 'xc-v4-nearby-offers';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/brand/mark.png', '/brand/lockup.png', '/brand/lockup-white.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', event => {
  let data; try { data = event.data.json(); } catch { return; }
  if (!data || !/^[a-f0-9-]{36}$/i.test(data.campaignId || '')) return;
  event.waitUntil(self.registration.showNotification('A nearby offer is available', { body: 'View the offer in XTRA-CASH. Eligibility checks and lender approval apply.', icon: '/icons/icon-192.png', tag: `offer-${data.campaignId}`, data: { url: `/offers/${data.campaignId}` } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.url;
  if (!/^\/offers\/[a-f0-9-]{36}$/i.test(path || '')) return;
  event.waitUntil(clients.openWindow(new URL(path, self.location.origin).href));
});

const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/icons/') ||
  (url.pathname.startsWith('/brand/') && !/\.(mp4|webm)$/.test(url.pathname));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always live

  // Pages: always from the network so users get the latest app and live data; the offline screen when there's no connection.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(req));
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Versioned build files, icons and images: cache first (their names change when their content does).
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
