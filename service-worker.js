// WCoW 2026 — Service Worker
// Stratégie : network-first pour tout, cache utilisé seulement en cas de panne réseau.

const CACHE_NAME = 'wcow26-v1';

// Au déploiement d'une nouvelle version du SW : on installe immédiatement
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// À l'activation : on supprime les anciens caches et on prend le contrôle des pages
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Interception des requêtes : network-first avec fallback cache
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne gère que les GET (pas les POST, etc.)
  if (req.method !== 'GET') return;

  // On ignore les requêtes vers des domaines tiers volumineux qu'on ne veut pas cacher
  // (PDF.js depuis CDN, openfootball, Google Sheets API) — laisser le navigateur gérer
  const url = new URL(req.url);
  const isApiOrCdn = url.hostname === 'sheets.googleapis.com'
                  || url.hostname === 'cdnjs.cloudflare.com'
                  || url.pathname.includes('worldcup.json');

  if (isApiOrCdn) {
    // Network-only pour ces ressources, mais avec fallback cache en cas de panne
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  // Pour le reste (HTML, images depuis raw.githubusercontent.com, manifest, etc.) :
  // network-first, on met à jour le cache au passage
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // On ne cache que les réponses OK
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
