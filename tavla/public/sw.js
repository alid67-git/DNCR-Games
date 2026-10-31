/* Tavla — offline cache (solo + local 2P + P2P shell) */
const CACHE = "tavla-v1.0.23";
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
  "./shared/palette.css",
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
  "./assets/sfx/dice-roll-06.ogg",
  "./assets/sfx/dice-roll-08.ogg",
  "./assets/sfx/dice-roll-11.ogg",
  "./assets/sfx/dice-roll-17.ogg",
  "./assets/sfx/wood-die-1.ogg",
  "./assets/sfx/wood-die-3.ogg",
  "./assets/sfx/wood-die-4.ogg",
  "./assets/sfx/piano-concerto-mini.ogg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          ASSETS.map((u) =>
            cache.add(u).catch((err) => {
              console.warn("[tavla-sw] skip", u, err);
            })
          )
        )
      )
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
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isShellRequest(req) {
  const url = new URL(req.url);
  if (req.mode === "navigate") return true;
  const p = url.pathname;
  return (
    /\.(?:js|css|webmanifest|html)$/i.test(p) ||
    /\/(app-config|i18n|engine|ai|audio|game-client|p2p|sw)\.js$/i.test(p)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // HTML/JS/CSS: network-first — Android eski sürümde takılı kalmasın
  if (isShellRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) {
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

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
