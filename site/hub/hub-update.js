/**
 * Hub APK — GitHub Releases üzerinden otomatik güncelleme.
 * Yalnızca hub-v* etiketli / DNCR-Games-hub*.apk asset’lerini dikkate alır.
 * Android’de HubApk eklentisi ile indir + kur (WebView tek başına APK yüklemez).
 */
(function () {
  "use strict";

  const CFG = window.HubConfig || { version: "0", githubOwner: "alid67-git", githubRepo: "DNCR-Games" };
  const LAST_CHECK_KEY = "dncr_hub_update_last_check";
  const MIN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const TAG_PREFIX = (CFG.releaseTagPrefix || "hub-v").toLowerCase();
  const APK_RE = CFG.apkNamePattern || /DNCR-Games-hub.*\.apk$/i;

  let pending = null;
  let installing = false;

  function $(id) {
    return document.getElementById(id);
  }

  function parseVersion(raw) {
    return String(raw || "")
      .trim()
      .replace(/^hub-v/i, "")
      .replace(/^v/i, "");
  }

  function compareVersions(a, b) {
    const pa = parseVersion(a).split(".").map((n) => parseInt(n, 10) || 0);
    const pb = parseVersion(b).split(".").map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
  }

  function toast(msg) {
    const el = $("hub-toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function getHubApkPlugin() {
    try {
      const C = window.Capacitor;
      if (!C || typeof C.isNativePlatform !== "function" || !C.isNativePlatform()) {
        return null;
      }
      if (C.Plugins && C.Plugins.HubApk) return C.Plugins.HubApk;
      if (typeof C.registerPlugin === "function") return C.registerPlugin("HubApk");
    } catch (_) {}
    return null;
  }

  async function openExternal(url) {
    if (!url) return;
    const plugin = getHubApkPlugin();
    if (plugin && typeof plugin.openExternal === "function") {
      await plugin.openExternal({ url });
      return;
    }
    try {
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser) {
        Capacitor.Plugins.Browser.open({ url });
        return;
      }
    } catch (_) {}
    try {
      if (
        window.Capacitor &&
        typeof Capacitor.isNativePlatform === "function" &&
        Capacitor.isNativePlatform()
      ) {
        // WebView içinde kalmasın — görünür <a download> ile dene
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
    } catch (_) {}
    window.open(url, "_blank", "noopener");
  }

  async function downloadAndInstall(url) {
    const plugin = getHubApkPlugin();
    if (!plugin || typeof plugin.downloadAndInstall !== "function") {
      await openExternal(url);
      return { mode: "browser" };
    }
    try {
      if (typeof plugin.addListener === "function" && !downloadAndInstall._bound) {
        downloadAndInstall._bound = true;
        plugin.addListener("installReady", () => {
          toast("Kurulum ekranı açıldı");
          installing = false;
        });
        plugin.addListener("installError", (ev) => {
          toast("Kurulum açılamadı — tarayıcıdan dene");
          installing = false;
          if (pending && pending.apkUrl) openExternal(pending.apkUrl);
        });
      }
    } catch (_) {}
    const result = await plugin.downloadAndInstall({ url });
    return { mode: "native", result };
  }

  function shouldSkip(force) {
    if (force) return false;
    try {
      const last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
      return Date.now() - last < MIN_CHECK_INTERVAL_MS;
    } catch (_) {
      return false;
    }
  }

  function markChecked() {
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
    } catch (_) {}
  }

  function findHubRelease(releases) {
    const list = Array.isArray(releases) ? releases : [];
    for (const rel of list) {
      if (rel.draft || rel.prerelease) continue;
      const tag = String(rel.tag_name || "").toLowerCase();
      const assets = Array.isArray(rel.assets) ? rel.assets : [];
      const apk = assets.find((a) => APK_RE.test(a.name || ""));
      if (!apk && !tag.startsWith(TAG_PREFIX)) continue;
      if (!apk) continue;
      return {
        version: parseVersion(rel.tag_name || rel.name),
        tag: rel.tag_name,
        name: rel.name || rel.tag_name,
        notes: rel.body || "",
        htmlUrl: rel.html_url,
        apkUrl: apk.browser_download_url || null,
      };
    }
    return null;
  }

  async function fetchHubLatest() {
    const owner = CFG.githubOwner || "alid67-git";
    const repo = CFG.githubRepo || "DNCR-Games";
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("release-fetch " + res.status);
    return findHubRelease(await res.json());
  }

  function showModal(info) {
    pending = info;
    const modal = $("hub-update-modal");
    const body = $("hub-update-body");
    if (!modal || !body) return;
    body.textContent =
      "v" +
      (info.version || "?") +
      " hazır. İndirip kurunca hub güncellenir (eski sürümün üzerine).";
    modal.hidden = false;
  }

  function hideModal() {
    const modal = $("hub-update-modal");
    if (modal) modal.hidden = true;
  }

  async function check({ force = false, silent = true } = {}) {
    if (shouldSkip(force)) return { status: "skipped" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (!silent) toast("Çevrimdışı — güncelleme kontrol edilemedi");
      return { status: "error" };
    }
    if (!silent) toast("Güncelleme kontrol ediliyor…");
    markChecked();
    try {
      const info = await fetchHubLatest();
      if (!info || !info.version) {
        if (!silent) toast("Sürüm bilgisi alınamadı");
        return { status: "error" };
      }
      if (compareVersions(info.version, CFG.version) <= 0) {
        if (!silent) toast("Güncelsin (v" + CFG.version + ")");
        return { status: "up-to-date", version: info.version };
      }
      showModal(info);
      return { status: "available", ...info };
    } catch (err) {
      console.warn("Hub update check failed", err);
      if (!silent) toast("Güncelleme kontrolü başarısız");
      return { status: "error" };
    }
  }

  async function applyUpdate() {
    if (!pending || installing) return;
    const url = pending.apkUrl || pending.htmlUrl;
    if (!url) {
      toast("APK linki yok");
      return;
    }
    installing = true;
    const btn = $("btn-hub-update-now");
    if (btn) btn.disabled = true;
    toast("İndiriliyor… bildirimde izle, bitince kur");
    hideModal();
    try {
      await downloadAndInstall(url);
    } catch (err) {
      console.warn("Hub update apply failed", err);
      toast("İndirme başarısız — tarayıcı açılıyor");
      try {
        await openExternal(url);
      } catch (_) {
        toast("APK açılamadı");
      }
      installing = false;
    } finally {
      if (btn) btn.disabled = false;
      // native indirme arka planda; ~2 sn sonra kilidi aç
      setTimeout(() => {
        installing = false;
      }, 2000);
    }
  }

  function init() {
    const ver = $("hub-ver");
    if (ver) ver.textContent = "v" + CFG.version;

    const btnCheck = $("btn-hub-check-update");
    if (btnCheck) {
      btnCheck.addEventListener("click", () => check({ force: true, silent: false }));
    }
    const btnNow = $("btn-hub-update-now");
    if (btnNow) btnNow.addEventListener("click", () => applyUpdate());
    const btnLater = $("btn-hub-update-later");
    if (btnLater) btnLater.addEventListener("click", hideModal);
    const modal = $("hub-update-modal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) hideModal();
      });
    }

    setTimeout(() => check({ force: false, silent: true }), 1100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.HubUpdate = { check, compareVersions, parseVersion };
})();
