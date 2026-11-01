/**
 * Tavla — yerel kayıt / devam (solo · 2p · p2p)
 * window.TavlaStore
 */
(function (root) {
  "use strict";

  const KEY = "tavla_saved_games_v1";
  const MAX = 12;

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveAll(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch (_) {}
  }

  function upsert(rec) {
    if (!rec || !rec.id) return;
    const list = loadAll().filter((g) => g.id !== rec.id);
    list.unshift({
      ...rec,
      updatedAt: Date.now(),
    });
    saveAll(list);
  }

  function remove(id) {
    saveAll(loadAll().filter((g) => g.id !== id));
  }

  function get(id) {
    return loadAll().find((g) => g.id === id) || null;
  }

  function listActive() {
    return loadAll().filter((g) => g.status === "active");
  }

  function newId() {
    return `tg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  root.TavlaStore = {
    loadAll,
    listActive,
    upsert,
    remove,
    get,
    newId,
  };
})(typeof window !== "undefined" ? window : globalThis);
