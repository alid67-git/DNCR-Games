// Checks GitHub Releases for a newer Kati Arena build than the one bundled
// in app-config.js, and (on confirmation) hands the user to the new APK.
window.KatiUpdateCheck = (function () {
  const REPO = "alid67-git/KatiArena";
  const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
  const LAST_CHECK_KEY = "kati_arena_update_last_check";
  const MIN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // avoid hammering the API on every app open

  function parseVersion(raw) {
    return String(raw || "")
      .trim()
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

  function findApkAsset(release) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    return assets.find((a) => /\.apk$/i.test(a.name || "")) || null;
  }

  function shouldSkipCheck(force) {
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

  async function fetchLatestRelease() {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    return res.json();
  }

  /**
   * @param {{currentVersion: string, force?: boolean}} opts
   * @returns {Promise<{status: "skipped"|"up-to-date"|"available"|"error", version?: string, notes?: string, htmlUrl?: string, apkUrl?: string|null}>}
   */
  async function run({ currentVersion, force = false } = {}) {
    if (shouldSkipCheck(force)) return { status: "skipped" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { status: "error" };
    }
    markChecked();
    try {
      const release = await fetchLatestRelease();
      const latestVersion = parseVersion(release.tag_name || release.name);
      if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
        return { status: "up-to-date" };
      }
      const asset = findApkAsset(release);
      return {
        status: "available",
        version: latestVersion,
        notes: release.body || "",
        htmlUrl: release.html_url,
        apkUrl: asset ? asset.browser_download_url : null,
      };
    } catch (err) {
      console.warn("Kati Arena: update check failed", err);
      return { status: "error" };
    }
  }

  return { run, compareVersions, parseVersion };
})();
