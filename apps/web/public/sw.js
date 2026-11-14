/* XTRA-CASH service worker: fast app start (cached build files and images) and an offline screen. Balances, payments and anything else
 * under /api/ always go to the network and are never cached. Bump VERSION to drop old caches. */
const VERSION = 'xc-v5-offline-scans';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const SCAN_URL = '/scanqr';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/brand/mark.png', '/brand/lockup.png', '/brand/lockup-white.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then(async (cache) => {
        await cache.addAll(PRECACHE);
        await prepareScanner(cache).catch(() => undefined);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('xc-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)));
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

// Cache the public scanner shell and only the hashed Next.js assets it references.
// No account pages, API responses, authentication headers or payment requests are stored.
async function prepareScanner(shell) {
  const page = await fetch(SCAN_URL, { credentials: 'omit', cache: 'reload' });
  if (!page.ok || new URL(page.url).pathname.replace(/\/$/, '') !== SCAN_URL) return;
  const markup = await page.clone().text();
  const paths = [...new Set(Array.from(markup.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css|woff2)(?:\?[^"]*)?)"/g), match => match[1]))];
  if (!paths.length) return;
  const assets = await caches.open(STATIC);
  await assets.addAll(paths);
  await shell.put(SCAN_URL, page);
}

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
          if (url.pathname.replace(/\/$/, '') === SCAN_URL) {
            const scanner = await caches.match(SCAN_URL);
            if (scanner) return scanner;
          }
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
