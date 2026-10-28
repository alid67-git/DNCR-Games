/**
 * Hub APK güncelleme — RideAtlas / Uğur tarzı:
 * Tek sabit etiket: android-latest (rolling release).
 * Alt banner: Yeni sürüm hazır → Güncelle.
 * Android’de HubApk eklentisi ile indir + kur.
 */
(function () {
  "use strict";

  const CFG = window.HubConfig || {
    version: "0",
    githubOwner: "alid67-git",
    githubRepo: "DNCR-Games",
  };
  const LAST_CHECK_KEY = "dncr_hub_update_last_check";
  const MIN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const LATEST_TAG = CFG.androidLatestTag || "android-latest";
  const APK_NAME = CFG.apkAssetName || "DNCR-Games-hub.apk";
  /** Release adından sürüm: "... - v1.0.9" veya "v1.0.9" */
  const VERSION_IN_NAME = /v[\d.]+(?:\s+\w+)?$/i;

  let pending = null;
  let installing = false;

  function $(id) {
    return document.getElementById(id);
  }

  function parseVersion(raw) {
    return String(raw || "")
      .trim()
      .replace(/^hub-v/i, "")
      .replace(/^v/i, "")
      .replace(/\s+\w+$/, "");
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
          setBannerInstalling(false);
        });
        plugin.addListener("installError", () => {
          toast("Kurulum açılamadı — tarayıcıdan dene");
          installing = false;
          setBannerInstalling(false);
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

  /**
   * RideAtlas: GET /releases/tags/android-latest
   * Sürüm release name içinden; APK sabit adla.
   */
  async function fetchAndroidLatest() {
    const owner = CFG.githubOwner || "alid67-git";
    const repo = CFG.githubRepo || "DNCR-Games";
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(LATEST_TAG)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("release-fetch " + res.status);
    const json = await res.json();
    const name = String(json.name || json.tag_name || "");
    const match = VERSION_IN_NAME.exec(name.trim());
    let version = match ? parseVersion(match[0]) : parseVersion(json.tag_name);
    if (!version || version === LATEST_TAG) {
      // body / tag yedek
      version = parseVersion(json.tag_name);
    }
    const assets = Array.isArray(json.assets) ? json.assets : [];
    let apk = assets.find((a) => String(a.name || "") === APK_NAME);
    if (!apk) {
      apk = assets.find((a) => /\.apk$/i.test(a.name || ""));
    }
    if (!apk || !apk.browser_download_url) {
      throw new Error("apk-missing");
    }
    return {
      version: version || "0",
      tag: json.tag_name || LATEST_TAG,
      name: name,
      notes: json.body || "",
      htmlUrl: json.html_url,
      apkUrl: apk.browser_download_url,
      sizeBytes: typeof apk.size === "number" ? apk.size : 0,
    };
  }

  function setBannerInstalling(on) {
    const banner = $("update-banner");
    const btn = $("update-btn");
    const text = $("update-banner-text");
    if (!banner) return;
    if (on) {
      banner.classList.add("show", "is-installing");
      if (text) text.textContent = "İndiriliyor…";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "…";
      }
    } else {
      banner.classList.remove("is-installing");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Güncelle";
      }
    }
  }

  function showBanner(info) {
    pending = info;
    const banner = $("update-banner");
    const text = $("update-banner-text");
    const btn = $("update-btn");
    if (!banner || !text) return;
    text.textContent = "Yeni sürüm hazır · v" + (info.version || "?");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Güncelle";
    }
    banner.classList.add("show");
    banner.hidden = false;
    // Eski modal varsa gizle
    const modal = $("hub-update-modal");
    if (modal) modal.hidden = true;
  }

  function hideBanner() {
    const banner = $("update-banner");
    if (banner) {
      banner.classList.remove("show", "is-installing");
      banner.hidden = true;
    }
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
      const info = await fetchAndroidLatest();
      if (!info || !info.version) {
        if (!silent) toast("Sürüm bilgisi alınamadı");
        return { status: "error" };
      }
      if (compareVersions(info.version, CFG.version) <= 0) {
        if (!silent) toast("Güncelsin (v" + CFG.version + ")");
        hideBanner();
        return { status: "up-to-date", version: info.version };
      }
      showBanner(info);
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
    setBannerInstalling(true);
    toast("İndiriliyor… bitince kurulum açılır");
    try {
      await downloadAndInstall(url);
    } catch (err) {
      console.warn("Hub update apply failed", err);
      toast("İndirme başarısız — tarayıcı açılıyor");
      setBannerInstalling(false);
      try {
        await openExternal(url);
      } catch (_) {
        toast("APK açılamadı");
      }
      installing = false;
    } finally {
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
    const updateBtn = $("update-btn");
    if (updateBtn) updateBtn.addEventListener("click", () => applyUpdate());
    const dismiss = $("update-dismiss");
    if (dismiss) dismiss.addEventListener("click", hideBanner);

    // Eski modal düğmeleri (varsa)
    const btnNow = $("btn-hub-update-now");
    if (btnNow) btnNow.addEventListener("click", () => applyUpdate());
    const btnLater = $("btn-hub-update-later");
    if (btnLater) {
      btnLater.addEventListener("click", () => {
        const modal = $("hub-update-modal");
        if (modal) modal.hidden = true;
        hideBanner();
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
