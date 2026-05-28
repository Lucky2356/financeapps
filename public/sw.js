const CACHE_NAME = "financial-assistant-v2";
const OFFLINE_URL = "/offline.html";
const CORE_ASSETS = ["/", OFFLINE_URL, "/manifest.json", "/icons/icon.svg", "/icons/maskable.svg"];
const IS_TAURI_ORIGIN = self.location.hostname.includes("tauri") || self.location.protocol.startsWith("tauri");

self.addEventListener("install", (event) => {
  if (IS_TAURI_ORIGIN) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  if (IS_TAURI_ORIGIN) {
    event.waitUntil(self.registration.unregister().then(() => self.clients.claim()));
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (IS_TAURI_ORIGIN || url.hostname.includes("tauri")) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});
