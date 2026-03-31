const CACHE = 'asliceofg-v1';
const STATIC = [
  '/',
  '/index.html',
  '/shop.html',
  '/catering.html',
  '/gifting.html',
  '/about.html',
  '/contact.html',
  '/css/main.css',
  '/css/gifting.css',
  '/css/portal.css',
  '/js/cart-drawer.js',
  '/js/shop.js',
  '/js/nav.js',
  '/public/images/rumcake.png',
  '/public/images/rumring.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // never cache API calls

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
