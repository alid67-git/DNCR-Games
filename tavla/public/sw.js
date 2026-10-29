/* Tavla — offline cache (solo + local 2P + P2P shell) */
const CACHE = "tavla-v1.0.7";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app-config.js",
  "./i18n.js",
  "./engine.js",
  "./ai.js",
  "./audio.js",
  "./p2p.js",
  "./game-client.js",
  "./manifest.webmanifest",
  "./shared/nearby-session.js",
  "./shared/p2p-session.js",
  "./shared/update-check.js",
  "./shared/register-sw.js",
  "./shared/mode-i18n.js",
  "./shared/hub-back.js",
  "./shared/score.js",
  "./shared/move-sfx.js",
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
  "./assets/dncr-mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
