// E Tracker Service Worker v8 — bumped for security hardening rollout
const CACHE = 'et-v9';
const STATIC = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-384.png',
  '/manifest.json'
];

const RUNTIME_CACHE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => {
       /* Notify open clients to refresh — they can show "Update available" */
       return self.clients.matchAll({ type: 'window' }).then(clients => {
         clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE }));
       });
     })
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Only handle GET — skip POST/PUT/DELETE so they hit network directly */
  if (e.request.method !== 'GET') return;

  /* Never cache API or third-party tracking */
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname.includes('googlesyndication') ||
      url.hostname.includes('googleadservices') ||
      url.hostname.includes('anthropic') ||
      url.hostname.includes('google-analytics') ||
      url.hostname.includes('googletagmanager')) return;

  /* HTML — network first, cache fallback (so users get fresh UI when online) */
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp && resp.ok) {
            const respClone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, respClone)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('/')))
    );
    return;
  }

  /* Trusted CDN hosts — cache first, network fallback */
  if (RUNTIME_CACHE_HOSTS.some(host => url.hostname.includes(host))) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp && resp.status === 200) {
            const respClone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, respClone)).catch(() => {});
          }
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  /* Same-origin static assets — cache first */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && url.origin === self.location.origin) {
          const respClone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, respClone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
