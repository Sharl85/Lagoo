/**
 * LaGo 🌸 - Service Worker (version web / PWA)
 * - Précache des fichiers de l'application (fonctionnement hors-ligne)
 * - Stratégie "stale-while-revalidate" : affichage immédiat + mise à jour en arrière-plan
 * - Les appels API ne sont jamais mis en cache (données intimes)
 * CACHE_VERSION est remplacé automatiquement par `npm run build`.
 */
const CACHE_VERSION = '__BUILD_VERSION__';
const CACHE_NAME = `lago-app-${CACHE_VERSION}`;
const STATIC_ASSETS = __ASSET_LIST__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('lago-app-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API : toujours le réseau, réponse "hors-ligne" explicite sinon
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ success: false, offline: true, message: 'Mode hors-ligne' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Navigation : réseau d'abord (pour recevoir les mises à jour), cache en secours
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Fichiers statiques : cache immédiat + rafraîchissement en arrière-plan
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
