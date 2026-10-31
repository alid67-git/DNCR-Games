/**
 * Arena shared — DNCR Games hub’a dönüş (onaylı).
 * window.ArenaHubBack.bind({ getLang })  veya  ArenaHubBack.attach(btn)
 */
(function (root) {
  "use strict";

  const DEFAULT_HUB = "https://alid67-git.github.io/DNCR-Games/";
  const STYLE_ID = "arena-hub-back-style";

  const COPY = {
    tr: {
      hubBack: "DNCR Games",
      hubBackTitle: "Hub’a dön?",
      hubBackConfirm: "DNCR Games ana sayfasına dönmek istediğine emin misin?",
      hubBackYes: "Evet, dön",
      hubBackNo: "Vazgeç",
    },
    en: {
      hubBack: "DNCR Games",
      hubBackTitle: "Back to hub?",
      hubBackConfirm: "Are you sure you want to return to DNCR Games?",
      hubBackYes: "Yes, go back",
      hubBackNo: "Cancel",
    },
  };

  function isNativeShell() {
    try {
      if (root.Capacitor && typeof root.Capacitor.isNativePlatform === "function") {
        return !!root.Capacitor.isNativePlatform();
      }
    } catch (_) {}
    try {
      const proto = root.location && root.location.protocol;
      const host = root.location && root.location.hostname;
      return proto === "capacitor:" || host === "localhost";
    } catch (_) {}
    return false;
  }

  function resolveHubUrl() {
    // APK / Capacitor: hub dış URL’ye değil, paket içi relative path’e dön
    try {
      if (isNativeShell()) {
        const path = root.location && root.location.pathname;
        if (path && /\/(kati|noktalar|dokuztas|kusatma|sayi|fanorona|dama|tavla)(\/|$)/i.test(path)) {
          return new URL("../index.html", root.location.href).href;
        }
        return new URL("./index.html", root.location.href).href;
      }
    } catch (_) {}

    try {
      const cfg =
        root.TavlaConfig ||
        root.DamaConfig ||
        root.FanoronaConfig ||
        root.SayibulmaConfig ||
        root.SiegeConfig ||
        root.DokuztasConfig ||
        root.DotsBoxesConfig ||
        root.DotsConfig ||
        root.KatiConfig ||
        root.AppConfig ||
        null;
      const share = cfg && (cfg.hubUrl || cfg.shareBaseUrl);
      if (typeof share === "string" && share) {
        if (/\/(kati|noktalar|dokuztas|kusatma|sayi|fanorona|dama|tavla)\/?$/i.test(share)) {
          return share.replace(/\/(kati|noktalar|dokuztas|kusatma|sayi|fanorona|dama|tavla)\/?$/i, "/");
        }
        if (/DNCR-Games/i.test(share)) {
          const m = share.match(/^(https?:\/\/[^/]+\/DNCR-Games\/?)/i);
          if (m) return m[1].endsWith("/") ? m[1] : m[1] + "/";
        }
      }
    } catch (_) {}

    try {
      const path = root.location && root.location.pathname;
      if (path && /\/(kati|noktalar|dokuztas|kusatma|sayi|fanorona|dama|tavla)\/?/i.test(path)) {
        return new URL("../", root.location.href).href;
      }
      if (path && /\/DNCR-Games\/?$/i.test(path.replace(/\/+$/, "") + "/")) {
        return root.location.href;
      }
    } catch (_) {}

    return DEFAULT_HUB;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .arena-hub-overlay {
        position: fixed; inset: 0; z-index: 80;
        display: flex; align-items: center; justify-content: center;
        padding: 1.25rem;
        background: rgba(8, 5, 2, 0.72);
        backdrop-filter: blur(3px);
      }
      .arena-hub-overlay[hidden] { display: none !important; }
      .arena-hub-card {
        width: min(400px, 100%);
        padding: 1.35rem 1.25rem 1.2rem;
        border-radius: 16px;
        border: 1px solid rgba(212, 180, 131, 0.32);
        background: #1c130a;
        color: #f3e6c8;
        box-shadow: 0 22px 48px rgba(0,0,0,.55);
      }
      .arena-hub-card h2 {
        margin: 0 0 0.55rem;
        font-size: 1.2rem;
        font-weight: 700;
        color: #e8c878;
      }
      .arena-hub-card p {
        margin: 0 0 1.15rem;
        line-height: 1.45;
        font-size: 0.95rem;
        color: rgba(243,230,200,.82);
      }
      .arena-hub-actions {
        display: flex; flex-direction: column; gap: 0.55rem;
      }
      .arena-hub-actions button {
        appearance: none; font: inherit; cursor: pointer;
        border-radius: 12px; padding: 0.72rem 1rem; font-weight: 650;
      }
      .arena-hub-yes {
        border: none;
        background: linear-gradient(90deg, #e8c878, #c9a05a);
        color: #1a1108;
      }
      .arena-hub-no {
        border: 1px solid rgba(212,180,131,.35);
        background: transparent;
        color: #f3e6c8;
      }
      .btn-hub-back {
        margin-top: 0.55rem;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        gap: 0.55rem;
        opacity: 0.96;
      }
      .btn-hub-back .hub-mark {
        width: 1.45rem;
        height: 1.45rem;
        border-radius: 28%;
        object-fit: cover;
        box-shadow: 0 0 0 1px rgba(232, 200, 120, 0.35);
        flex: 0 0 auto;
      }
    `;
    document.head.appendChild(s);
  }

  function pack(lang) {
    return COPY[lang === "en" ? "en" : "tr"];
  }

  function ensureModal(getLang) {
    let el = document.getElementById("arena-hub-overlay");
    if (el) return el;
    ensureStyle();
    el = document.createElement("div");
    el.id = "arena-hub-overlay";
    el.className = "arena-hub-overlay";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `
      <div class="arena-hub-card">
        <h2 id="arena-hub-title"></h2>
        <p id="arena-hub-body"></p>
        <div class="arena-hub-actions">
          <button type="button" class="arena-hub-yes" id="arena-hub-yes"></button>
          <button type="button" class="arena-hub-no" id="arena-hub-no"></button>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    const close = () => {
      el.hidden = true;
    };
    el.addEventListener("click", (e) => {
      if (e.target === el) close();
    });
    el.querySelector("#arena-hub-no").addEventListener("click", close);
    el.querySelector("#arena-hub-yes").addEventListener("click", () => {
      close();
      root.location.href = resolveHubUrl();
    });
    el._getLang = getLang;
    return el;
  }

  function openConfirm(getLang) {
    const el = ensureModal(getLang);
    const L = pack(typeof getLang === "function" ? getLang() : "tr");
    el.querySelector("#arena-hub-title").textContent = L.hubBackTitle;
    el.querySelector("#arena-hub-body").textContent = L.hubBackConfirm;
    el.querySelector("#arena-hub-yes").textContent = L.hubBackYes;
    el.querySelector("#arena-hub-no").textContent = L.hubBackNo;
    el.hidden = false;
  }

  function labelFor(getLang) {
    return pack(typeof getLang === "function" ? getLang() : "tr").hubBack;
  }

  function attach(btn, opts) {
    if (!btn) return;
    ensureStyle();
    const getLang = (opts && opts.getLang) || (() => "tr");
    btn.classList.add("btn-hub-back");
    const refresh = () => {
      const markSrc = (opts && opts.markSrc) || "assets/dncr-mark.png";
      btn.innerHTML = "";
      const img = document.createElement("img");
      img.className = "hub-mark";
      img.src = markSrc;
      img.alt = "";
      img.width = 24;
      img.height = 24;
      const span = document.createElement("span");
      span.textContent = labelFor(getLang);
      btn.appendChild(img);
      btn.appendChild(span);
    };
    refresh();
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openConfirm(getLang);
    });
    btn._arenaHubRefresh = refresh;
    return { refresh };
  }

  function bind(opts) {
    const getLang = (opts && opts.getLang) || (() => document.documentElement.lang || "tr");
    const btn = document.getElementById("btn-hub-back");
    return attach(btn, { getLang });
  }

  root.ArenaHubBack = {
    resolveHubUrl,
    attach,
    bind,
    openConfirm,
    labelFor,
  };
})(typeof self !== "undefined" ? self : this);
