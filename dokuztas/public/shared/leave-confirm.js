/**
 * Arena shared — oyun içi geri / çıkış onayı.
 * ArenaLeaveConfirm.ask({ getLang }) → Promise<boolean>
 */
(function (root) {
  "use strict";

  const STYLE_ID = "arena-leave-confirm-style";
  const OVERLAY_ID = "arena-leave-overlay";

  const COPY = {
    tr: {
      title: "Oyundan çık?",
      body: "Maç devam ediyor. Çıkarsan bu el kaybolur. Emin misin?",
      yes: "Evet, çık",
      no: "Vazgeç",
    },
    en: {
      title: "Leave the match?",
      body: "The match is still going. If you leave, this game will be lost. Are you sure?",
      yes: "Yes, leave",
      no: "Cancel",
    },
  };

  function pack(lang) {
    return COPY[lang === "en" ? "en" : "tr"];
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .arena-leave-overlay {
        position: fixed; inset: 0; z-index: 85;
        display: flex; align-items: center; justify-content: center;
        padding: 1.25rem;
        background: rgba(8, 5, 2, 0.72);
        backdrop-filter: blur(3px);
      }
      .arena-leave-overlay[hidden] { display: none !important; }
      .arena-leave-card {
        width: min(400px, 100%);
        padding: 1.35rem 1.25rem 1.2rem;
        border-radius: 16px;
        border: 1px solid rgba(212, 180, 131, 0.32);
        background: #1c130a;
        color: #f3e6c8;
        box-shadow: 0 22px 48px rgba(0,0,0,.55);
      }
      .arena-leave-card h2 {
        margin: 0 0 0.55rem;
        font-size: 1.2rem;
        font-weight: 700;
        color: #e8c878;
      }
      .arena-leave-card p {
        margin: 0 0 1.15rem;
        line-height: 1.45;
        font-size: 0.95rem;
        color: rgba(243,230,200,.82);
      }
      .arena-leave-actions {
        display: flex; flex-direction: column; gap: 0.55rem;
      }
      .arena-leave-actions button {
        appearance: none; font: inherit; cursor: pointer;
        border-radius: 12px; padding: 0.72rem 1rem; font-weight: 650;
      }
      .arena-leave-yes {
        border: none;
        background: linear-gradient(90deg, #e8c878, #c9a05a);
        color: #1a1108;
      }
      .arena-leave-no {
        border: 1px solid rgba(212,180,131,.35);
        background: transparent;
        color: #f3e6c8;
      }
    `;
    document.head.appendChild(s);
  }

  function ensureModal() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;
    ensureStyle();
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.className = "arena-leave-overlay";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `
      <div class="arena-leave-card">
        <h2 id="arena-leave-title"></h2>
        <p id="arena-leave-body"></p>
        <div class="arena-leave-actions">
          <button type="button" class="arena-leave-yes" id="arena-leave-yes"></button>
          <button type="button" class="arena-leave-no" id="arena-leave-no"></button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function ask(opts) {
    const getLang = (opts && opts.getLang) || (() => "tr");
    const L = pack(typeof getLang === "function" ? getLang() : getLang);

    if (typeof document === "undefined") {
      return Promise.resolve(
        typeof root.confirm === "function" ? root.confirm(L.body) : true
      );
    }

    const el = ensureModal();
    el.querySelector("#arena-leave-title").textContent = L.title;
    el.querySelector("#arena-leave-body").textContent = L.body;
    el.querySelector("#arena-leave-yes").textContent = L.yes;
    el.querySelector("#arena-leave-no").textContent = L.no;
    el.hidden = false;

    return new Promise((resolve) => {
      const finish = (ok) => {
        el.hidden = true;
        el.querySelector("#arena-leave-yes").onclick = null;
        el.querySelector("#arena-leave-no").onclick = null;
        el.onclick = null;
        resolve(!!ok);
      };
      el.querySelector("#arena-leave-yes").onclick = () => finish(true);
      el.querySelector("#arena-leave-no").onclick = () => finish(false);
      el.onclick = (e) => {
        if (e.target === el) finish(false);
      };
    });
  }

  root.ArenaLeaveConfirm = { ask, COPY };
})(typeof self !== "undefined" ? self : this);
