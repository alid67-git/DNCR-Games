/* Fanorona — offline cache; online’da ağ öncelikli (eski 1.0.1 cache’e takılma) */
const CACHE = "fanorona-v1.0.8";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app-config.js",
  "./i18n.js",
  "./engine.js",
  "./ai.js",
  "./p2p.js",
  "./game-client.js",
  "./manifest.webmanifest",
  "./shared/nearby-session.js",
  "./shared/p2p-session.js",
  "./shared/update-check.js",
  "./shared/register-sw.js",
  "./shared/mode-i18n.js",
  "./shared/hub-back.js",
  "./shared/move-sfx.js",
  "./shared/history-stack.js",
  "./shared/palette.css",
  "./shared/shell-ui.css",
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
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Online: önce ağ — eski cache’e takılma; offline: cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
