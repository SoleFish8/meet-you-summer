const CACHE = 'meet-you-summer-v2';
const ASSETS = [
  '/meet-you-summer/',
  '/meet-you-summer/index.html',
  '/meet-you-summer/_shared/reader.css',
  '/meet-you-summer/_shared/reader.js',
  '/meet-you-summer/_shared/fonts/CrimsonPro-Regular.ttf',
  '/meet-you-summer/_shared/fonts/CrimsonPro-Bold.ttf',
  '/meet-you-summer/_shared/fonts/CrimsonPro-Italic.ttf',
  '/meet-you-summer/_shared/fonts/InstrumentSerif-Regular.ttf',
  '/meet-you-summer/_shared/fonts/InstrumentSerif-Italic.ttf',
  '/meet-you-summer/assets/cover_16x9.jpg'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetched = fetch(e.request).then(function(res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function() { return cached; });
      return cached || fetched;
    })
  );
});