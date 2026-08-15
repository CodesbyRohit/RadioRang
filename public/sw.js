/* 80 Years of Freedom — service worker.
 * Precaches the app shell so the tribute loads offline. The page is fully
 * static (no dynamic data), so a simple network-first shell + cache fallback
 * is all that is needed.
 *
 * Cache versioning: bump the version suffix (rr-shell-v1 -> v2) on every
 * deploy whose assets changed — the activate handler deletes old caches.
 */
'use strict';

const SHELL_CACHE = 'rr-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/icon.svg',
  '/data/freedom.js',
  '/data/azaadi.js',
];

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(
    SHELL.map(async (url) => {
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      } catch {}
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    // Network-first so fresh deploys win; cached shell as offline fallback.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
