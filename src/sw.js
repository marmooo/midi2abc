const CACHE_NAME = "2025-05-06 12:35";
const urlsToCache = [
  "/midi2abc/",
  "/midi2abc/index.js",
  "/midi2abc/midi2abc.js",
  "/midi2abc/abt.mid",
  "/midi2abc/favicon/favicon.svg",
  "https://cdn.jsdelivr.net/combine/npm/tone@14.7.77,npm/@magenta/music@1.23.1/es6/core.js,npm/abcjs@6.4.4/dist/abcjs-basic-min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      );
    }),
  );
});
