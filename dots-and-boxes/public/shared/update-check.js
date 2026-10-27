/**
 * Arena shared — GitHub Releases güncelleme kontrolü (APK).
 * window.ArenaUpdateCheck.check({ owner, repo, currentVersion, t })
 */
(function (root) {
  "use strict";

  function parseVer(v) {
    return String(v || "0")
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  }

  function isNewer(remote, local) {
    const a = parseVer(remote);
    const b = parseVer(local);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }

  async function check(opts) {
    const owner = opts.owner || "alid67-git";
    const repo = opts.repo || "KatiArena";
    const current = opts.currentVersion || "0";
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("release-fetch");
    const data = await res.json();
    const tag = data.tag_name || "";
    const assets = data.assets || [];
    const apk = assets.find((a) => /\.apk$/i.test(a.name));
    return {
      tag,
      newer: isNewer(tag, current),
      apkUrl: apk ? apk.browser_download_url : null,
      htmlUrl: data.html_url || null,
      name: data.name || tag,
    };
  }

  root.ArenaUpdateCheck = { check, isNewer, parseVer };
})(typeof self !== "undefined" ? self : this);
