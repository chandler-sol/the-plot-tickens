/* Service worker — generated at build time by vite.config.ts from src/sw/sw-template.js. */
/* eslint-disable */
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const DATA = __DATA__;
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL);
      // The quotation database is precached too, so the clock works fully offline
      // after the first visit. Reuse unchanged files from the previous edition.
      // Shard file names are content-hashed, so unchanged shards are copied from the
      // previous edition's cache instead of being downloaded again.
      const data = await caches.open(DATA_CACHE);
      const old = await Promise.all((await caches.keys()).filter((k) => k.startsWith('data-') && k !== DATA_CACHE).map((k) => caches.open(k)));
      await Promise.all(
        DATA.map(async (path) => {
          for (const c of old) {
            const hit = await c.match(path);
            if (hit) return data.put(path, hit);
          }
          return data.add(path);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, DATA_CACHE]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const path = url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : url.pathname.replace(/^\//, '');

  // Navigations: app shell, cache-first (the shell is versioned with the worker).
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = (await cache.match('./')) || (await cache.match('index.html'));
        if (cached) return cached;
        try {
          return await fetch(req);
        } catch {
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cacheName = path.startsWith('data/q/') ? DATA_CACHE : SHELL_CACHE;
      const cache = await caches.open(cacheName);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && (SHELL.includes(path) || DATA.includes(path))) cache.put(req, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })(),
  );
});
