/**
 * Arena shared — service worker kaydı (çevrimdışı solo / local 2P).
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
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(src).catch(() => {});
    });
  }

  root.ArenaSW = { register };
})(typeof self !== "undefined" ? self : this);
