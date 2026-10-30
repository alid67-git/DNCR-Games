/**
 * Arena shared — service worker kaydı (çevrimdışı solo / local 2P).
 * Yeni SW gelince bir kez yeniler; her açılışta update() dener.
 */
(function (root) {
  "use strict";

  function register(path) {
    if (!("serviceWorker" in navigator)) return;
    // Capacitor APK içinde SW, çok sayfalı hub yönlendirmesini bozabiliyor
    try {
      if (window.Capacitor && typeof Capacitor.isNativePlatform === "function" && Capacitor.isNativePlatform()) {
        return;
      }
      if (location.hostname === "localhost" || location.protocol === "capacitor:") {
        return;
      }
    } catch (_) {}
    const src = path || "./sw.js";
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(src)
        .then((reg) => {
          try {
            reg.update();
          } catch (_) {}
          // Yeni worker bekliyorsa hemen al
          if (reg.waiting) {
            try {
              reg.waiting.postMessage({ type: "SKIP_WAITING" });
            } catch (_) {}
          }
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                try {
                  nw.postMessage({ type: "SKIP_WAITING" });
                } catch (_) {}
              }
            });
          });
        })
        .catch(() => {});
    });
  }

  root.ArenaSW = { register };
})(typeof self !== "undefined" ? self : this);
