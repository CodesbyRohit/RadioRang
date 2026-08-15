/* RadioRang service worker.
 *  - Precaches the app shell so the app loads offline.
 *  - Audio files: cache-first with network backfill — a device that has
 *    fetched a track once can keep (re)playing it when the network drops.
 */
'use strict';

const SHELL_CACHE = 'rr-shell-v1';
const AUDIO_CACHE = 'rr-audio-v1';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.webmanifest', '/lib/sync/clock.js', '/data/azaadi.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isAudio(req) {
  return /\.(mp3|ogg|m4a|webm|wav)(\?.*)?$/i.test(req.url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // App shell: network-first, cache fallback (fresh code wins; offline still works).
  if (req.mode === 'navigate') {
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

  // Audio: cache-first with network backfill.
  if (isAudio(req)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          fetch(req)
            .then((res) => {
              if (res.ok) caches.open(AUDIO_CACHE).then((c) => c.put(req, res)).catch(() => {});
            })
            .catch(() => {});
          return cached;
        }
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(AUDIO_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
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
