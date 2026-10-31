/**
 * Hub APK — GitHub Releases üzerinden otomatik güncelleme.
 * Yalnızca Android Capacitor hub APK’da çalışır (iPhone / web / PWA’da yok).
 * hub-v* + DNCR-Games-hub*.apk; HubApk eklentisi ile indir + kur.
 */
(function () {
  "use strict";

  const CFG = window.HubConfig || { version: "0", githubOwner: "alid67-git", githubRepo: "DNCR-Games" };
  const LAST_CHECK_KEY = "dncr_hub_update_last_check";
  const MIN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const TAG_PREFIX = (CFG.releaseTagPrefix || "hub-v").toLowerCase();
  const APK_RE = CFG.apkNamePattern || /DNCR-Games-hub.*\.apk$/i;

  const COPY = {
    tr: {
      dlProgress: "İndiriliyor… %{pct}",
      dlDone: "İndirme tamam — kurulum açılıyor…",
      installOpening: "Kurulum ekranı açılıyor…",
      installOpened: "Kurulum ekranı açıldı",
      installFail: "Kurulum açılamadı — tarayıcıdan dene",
      apkAndroidOnly: "APK güncelleme yalnızca Android hub’da",
      offline: "Çevrimdışı — güncelleme kontrol edilemedi",
      checking: "Güncelleme kontrol ediliyor…",
      noVersion: "Sürüm bilgisi alınamadı",
      upToDate: "Güncelsin (v{ver})",
      checkFail: "Güncelleme kontrolü başarısız",
      readyBody: "v{ver} hazır. İndirip kurunca hub güncellenir (eski sürümün üzerine).",
      iosNoApk: "iPhone’da APK yok — Safari’den sayfayı yenilemen yeterli",
      noApkLink: "APK linki yok",
      downloadFail: "İndirme başarısız — tarayıcı açılıyor",
      apkOpenFail: "APK açılamadı",
    },
    en: {
      dlProgress: "Downloading… {pct}%",
      dlDone: "Download complete — opening installer…",
      installOpening: "Opening installer…",
      installOpened: "Installer opened",
      installFail: "Couldn't open installer — try in the browser",
      apkAndroidOnly: "APK updates are only on the Android hub",
      offline: "Offline — couldn't check for updates",
      checking: "Checking for updates…",
      noVersion: "Couldn't read version info",
      upToDate: "You're up to date (v{ver})",
      checkFail: "Update check failed",
      readyBody: "v{ver} is ready. Download and install to update the hub.",
      iosNoApk: "No APK on iPhone — refresh the page in Safari",
      noApkLink: "No APK link",
      downloadFail: "Download failed — opening browser",
      apkOpenFail: "Couldn't open the APK",
    },
  };

  let pending = null;
  let installing = false;
  let progressHideTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function lang() {
    try {
      if (window.HubI18n && window.HubI18n.lang) return window.HubI18n.lang;
      const stored = localStorage.getItem("dncr_lang") || localStorage.getItem("arena_lang");
      if (stored === "en" || stored === "tr") return stored;
      const keys = [
        "kati_arena_settings",
        "dots_boxes_settings",
        "dokuztas_settings",
        "kusatma_settings_v1",
        "sayibulma_settings",
        "fanorona_settings",
        "dama_settings",
        "tavla_settings",
      ];
      for (let i = 0; i < keys.length; i++) {
        const raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        const o = JSON.parse(raw);
        if (o && (o.lang === "en" || o.lang === "tr")) return o.lang;
      }
    } catch (_) {}
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "tr";
    return /^en\b/i.test(String(nav)) ? "en" : "tr";
  }

  function t(key, vars) {
    const pack = COPY[lang()] || COPY.tr;
    let s = (pack && pack[key]) || (COPY.tr && COPY.tr[key]) || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
      });
    }
    return s;
  }

  function showDownloadProgress(percent, label) {
    const wrap = $("hub-dl-progress");
    const fill = $("hub-dl-fill");
    const text = $("hub-dl-label");
    if (!wrap) return;
    clearTimeout(progressHideTimer);
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    wrap.hidden = false;
    if (fill) fill.style.width = pct + "%";
    if (text) {
      text.textContent =
        label ||
        (pct >= 100 ? t("dlDone") : t("dlProgress", { pct: pct }));
    }
  }

  function hideDownloadProgress(delayMs) {
    clearTimeout(progressHideTimer);
    const run = () => {
      const wrap = $("hub-dl-progress");
      const fill = $("hub-dl-fill");
      if (wrap) wrap.hidden = true;
      if (fill) fill.style.width = "0%";
    };
    if (delayMs && delayMs > 0) progressHideTimer = setTimeout(run, delayMs);
    else run();
  }

  /** APK güncelleme yalnızca native Android hub’da. iPhone Safari / PWA / masaüstü web: hayır. */
  function isAndroidHubApk() {
    try {
      const C = window.Capacitor;
      if (!C || typeof C.isNativePlatform !== "function" || !C.isNativePlatform()) {
        return false;
      }
      if (typeof C.getPlatform === "function" && C.getPlatform() === "android") {
        return true;
      }
      // iOS native olsaydı Capacitor platform ios olur — yine APK yok
      if (typeof C.getPlatform === "function" && C.getPlatform() === "ios") {
        return false;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function hideApkUpdateUi() {
    const btnCheck = $("btn-hub-check-update");
    if (btnCheck) {
      btnCheck.hidden = true;
      btnCheck.style.display = "none";
    }
    const actions = document.querySelector(".hub-actions");
    if (actions) {
      actions.hidden = true;
      actions.style.display = "none";
    }
    hideModal();
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
        plugin.addListener("downloadProgress", (ev) => {
          const pct =
            ev && typeof ev.percent === "number"
              ? ev.percent
              : ev && ev.total > 0
                ? Math.round((100 * (ev.bytes || 0)) / ev.total)
                : 0;
          showDownloadProgress(pct);
        });
        plugin.addListener("installReady", () => {
          showDownloadProgress(100, t("installOpening"));
          toast(t("installOpened"));
          installing = false;
          hideDownloadProgress(2200);
        });
        plugin.addListener("installError", (ev) => {
          hideDownloadProgress(0);
          toast(t("installFail"));
          installing = false;
          if (pending && pending.apkUrl) openExternal(pending.apkUrl);
        });
      }
    } catch (_) {}
    showDownloadProgress(0, t("dlProgress", { pct: 0 }));
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
    body.textContent = t("readyBody", { ver: info.version || "?" });
    modal.hidden = false;
  }

  function hideModal() {
    const modal = $("hub-update-modal");
    if (modal) modal.hidden = true;
  }

  async function check({ force = false, silent = true } = {}) {
    if (!isAndroidHubApk()) {
      if (!silent) toast(t("apkAndroidOnly"));
      return { status: "skipped-platform" };
    }
    if (shouldSkip(force)) return { status: "skipped" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      if (!silent) toast(t("offline"));
      return { status: "error" };
    }
    if (!silent) toast(t("checking"));
    markChecked();
    try {
      const info = await fetchHubLatest();
      if (!info || !info.version) {
        if (!silent) toast(t("noVersion"));
        return { status: "error" };
      }
      if (compareVersions(info.version, CFG.version) <= 0) {
        if (!silent) toast(t("upToDate", { ver: CFG.version }));
        return { status: "up-to-date", version: info.version };
      }
      showModal(info);
      return { status: "available", ...info };
    } catch (err) {
      console.warn("Hub update check failed", err);
      if (!silent) toast(t("checkFail"));
      return { status: "error" };
    }
  }

  async function applyUpdate() {
    if (!isAndroidHubApk()) {
      hideModal();
      toast(t("iosNoApk"));
      return;
    }
    if (!pending || installing) return;
    const url = pending.apkUrl || pending.htmlUrl;
    if (!url) {
      toast(t("noApkLink"));
      return;
    }
    installing = true;
    const btn = $("btn-hub-update-now");
    if (btn) btn.disabled = true;
    hideModal();
    showDownloadProgress(0, t("dlProgress", { pct: 0 }));
    try {
      await downloadAndInstall(url);
    } catch (err) {
      console.warn("Hub update apply failed", err);
      hideDownloadProgress(0);
      toast(t("downloadFail"));
      try {
        await openExternal(url);
      } catch (_) {
        toast(t("apkOpenFail"));
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

    // iPhone / web: APK güncelleme UI ve otomatik kontrol yok
    if (!isAndroidHubApk()) {
      hideApkUpdateUi();
      return;
    }

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

  window.HubUpdate = { check, compareVersions, parseVersion, isAndroidHubApk };
})();
