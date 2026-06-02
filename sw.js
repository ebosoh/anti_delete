const CACHE_NAME = "antidelete-v1";
const ASSETS_TO_CACHE = [
  "index.html",
  "style.css",
  "app.js",
  "admin.html",
  "manifest.json"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-First falling back to Cache)
self.addEventListener("fetch", (e) => {
  // Only handle standard GET requests
  if (e.request.method !== "GET" || e.request.url.includes("script.google.com")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Cache the updated version if it is a valid response
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network is unavailable
        return caches.match(e.request);
      })
  );
});
