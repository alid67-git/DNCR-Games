/* Noktalar ve Kutular — çevrimdışı cache (iPhone Ana Ekran) */
const CACHE = "noktalar-v1.1.0";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app-config.js",
  "./i18n.js",
  "./boards.js",
  "./engine.js",
  "./ai.js",
  "./game-client.js",
  "./manifest.webmanifest",
  "./fonts/fonts.css",
  "./fonts/manrope-latin.woff2",
  "./fonts/manrope-latinext.woff2",
  "./fonts/sora-latin.woff2",
  "./fonts/sora-latinext.woff2",
  "./assets/logo.svg",
  "./assets/logo.png",
  "./assets/logo-192.png",
  "./assets/favicon.png",
  "./assets/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isShell(url) {
  const p = url.pathname;
  return (
    p.endsWith("/") ||
    p.endsWith(".html") ||
    p.endsWith(".js") ||
    p.endsWith(".css") ||
    p.endsWith("manifest.webmanifest")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML/JS/CSS: önce ağ (güncelleme gelsin), sonra cache
  if (isShell(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
