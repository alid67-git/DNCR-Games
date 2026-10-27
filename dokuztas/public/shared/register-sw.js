/**
 * Arena shared — service worker kaydı (çevrimdışı solo / local 2P).
 */
(function (root) {
  "use strict";

  function register(path) {
    if (!("serviceWorker" in navigator)) return;
    const src = path || "./sw.js";
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(src).catch(() => {});
    });
  }

  root.ArenaSW = { register };
})(typeof self !== "undefined" ? self : this);
