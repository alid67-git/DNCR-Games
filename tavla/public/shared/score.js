/**
 * Arena shared — yerel kariyer puanı / skor tablosu.
 * window.ArenaScore
 *
 * Oyun bazlı puan + DNCR toplamı. Rakibe bağlı değil; zorluk ve moda göre ağırlık.
 */
(function (root) {
  "use strict";

  const KEY = "dncr_scores_v1";
  const DIFF_MULT = { easy: 1, medium: 1.25, hard: 1.5, veryhard: 2, normal: 1.25 };
  const MODE_MULT = { solo: 1, twop: 0.55, local2p: 0.55, p2p: 1.2, remote: 1.2 };
  const GAME_LABELS = {
    tr: {
      kati: "Kati",
      noktalar: "Noktalar ve Kutular",
      dokuztas: "Dokuztaş",
      kusatma: "Kuşatma",
      sayi: "Sayı Bulma",
      fanorona: "Fanorona",
      dama: "Dama",
      tavla: "Tavla",
      dncr: "DNCR toplam",
    },
    en: {
      kati: "Kati",
      noktalar: "Noktalar ve Kutular",
      dokuztas: "Dokuztaş",
      kusatma: "Kuşatma",
      sayi: "Number Hunt",
      fanorona: "Fanorona",
      dama: "Dama",
      tavla: "Tavla",
      dncr: "DNCR total",
    },
  };

  function emptyGame() {
    return {
      points: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      games: 0,
      byDiff: {},
      history: [],
    };
  }

  function defaultStore() {
    return {
      displayName: "",
      games: {
        kati: emptyGame(),
        noktalar: emptyGame(),
        dokuztas: emptyGame(),
        kusatma: emptyGame(),
        sayi: emptyGame(),
        fanorona: emptyGame(),
        dama: emptyGame(),
        tavla: emptyGame(),
      },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      const base = defaultStore();
      return {
        displayName: parsed.displayName || "",
        games: {
          kati: { ...base.games.kati, ...(parsed.games && parsed.games.kati) },
          noktalar: { ...base.games.noktalar, ...(parsed.games && parsed.games.noktalar) },
          dokuztas: { ...base.games.dokuztas, ...(parsed.games && parsed.games.dokuztas) },
          kusatma: { ...base.games.kusatma, ...(parsed.games && parsed.games.kusatma) },
          sayi: { ...base.games.sayi, ...(parsed.games && parsed.games.sayi) },
          fanorona: { ...base.games.fanorona, ...(parsed.games && parsed.games.fanorona) },
          dama: { ...base.games.dama, ...(parsed.games && parsed.games.dama) },
          tavla: { ...base.games.tavla, ...(parsed.games && parsed.games.tavla) },
        },
      };
    } catch (_) {
      return defaultStore();
    }
  }

  function save(store) {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function clampBonus(n, max) {
    const v = Number(n) || 0;
    return Math.max(0, Math.min(max, v));
  }

  /**
   * @param {object} opts
   * @param {'kati'|'noktalar'|'dokuztas'|'kusatma'|'sayi'|'fanorona'|'dama'|'tavla'} opts.gameId
   * @param {'win'|'loss'|'draw'} opts.result
   * @param {string} [opts.difficulty]
   * @param {string} [opts.mode] solo|twop|p2p
   * @param {object} [opts.stats] oyun-içi sayaçlar
   */
  function record(opts) {
    if (!opts || !opts.gameId || !opts.result) return null;
    const store = load();
    const g = store.games[opts.gameId] || emptyGame();
    const diff = String(opts.difficulty || "hard").toLowerCase();
    const mode = String(opts.mode || "solo").toLowerCase();
    const dm = DIFF_MULT[diff] != null ? DIFF_MULT[diff] : 1.25;
    const mm = MODE_MULT[mode] != null ? MODE_MULT[mode] : 1;

    let base = 0;
    if (opts.result === "win") base = 100;
    else if (opts.result === "draw") base = 40;
    else base = 18;

    const st = opts.stats || {};
    let bonus = 0;
    bonus += clampBonus(st.mills, 5) * 8;
    bonus += clampBonus(st.removes, 6) * 5;
    bonus += clampBonus(st.captures, 12) * 4;
    bonus += clampBonus(st.boxes, 40) * 2;
    bonus += clampBonus(st.boxLead, 20) * 3;
    bonus += clampBonus(st.chains, 8) * 6;
    // Sayı Bulma: az tahminle bitirmek bonus (guesses düşükse daha çok)
    if (st.guesses != null) {
      const g = Number(st.guesses) || 0;
      bonus += clampBonus(Math.max(0, 12 - g), 10) * 5;
    }

    const gained = Math.round((base + bonus) * dm * mm);
    g.points += gained;
    g.games += 1;
    if (opts.result === "win") g.wins += 1;
    else if (opts.result === "draw") g.draws += 1;
    else g.losses += 1;
    if (!g.byDiff[diff]) g.byDiff[diff] = { games: 0, wins: 0, points: 0 };
    g.byDiff[diff].games += 1;
    g.byDiff[diff].points += gained;
    if (opts.result === "win") g.byDiff[diff].wins += 1;

    g.history.unshift({
      at: Date.now(),
      result: opts.result,
      difficulty: diff,
      mode,
      gained,
    });
    g.history = g.history.slice(0, 40);

    store.games[opts.gameId] = g;
    save(store);
    return { gained, total: g.points, store };
  }

  function setDisplayName(name) {
    const store = load();
    store.displayName = String(name || "").trim().slice(0, 20);
    save(store);
    return store.displayName;
  }

  function totalPoints(store) {
    const s = store || load();
    return (
      (s.games.kati.points || 0) +
      (s.games.noktalar.points || 0) +
      (s.games.dokuztas.points || 0) +
      ((s.games.kusatma && s.games.kusatma.points) || 0) +
      ((s.games.sayi && s.games.sayi.points) || 0) +
      ((s.games.fanorona && s.games.fanorona.points) || 0) +
      ((s.games.dama && s.games.dama.points) || 0) +
      ((s.games.tavla && s.games.tavla.points) || 0)
    );
  }

  function summary(gameId, lang) {
    const store = load();
    const L = lang === "en" ? "en" : "tr";
    const labels = GAME_LABELS[L];
    const rows = ["tavla", "dama", "fanorona", "sayi", "kusatma", "dokuztas", "noktalar", "kati"].map((id) => {
      const g = store.games[id];
      return {
        id,
        label: labels[id],
        points: g.points || 0,
        wins: g.wins || 0,
        losses: g.losses || 0,
        draws: g.draws || 0,
        games: g.games || 0,
      };
    });
    rows.sort((a, b) => b.points - a.points);
    return {
      displayName: store.displayName || (L === "en" ? "Player" : "Oyuncu"),
      dncr: totalPoints(store),
      dncrLabel: labels.dncr,
      rows,
      current: gameId ? store.games[gameId] : null,
    };
  }

  function renderInto(el, opts) {
    if (!el) return;
    const lang = (opts && opts.lang) || "tr";
    const gameId = opts && opts.gameId;
    const s = summary(gameId, lang);
    const tr = lang !== "en";
    const cur = gameId ? s.rows.find((r) => r.id === gameId) : null;
    el.innerHTML = `
      <div class="score-hero">
        <p class="score-name">${escapeHtml(s.displayName)}</p>
        <p class="score-dncr"><span>${escapeHtml(s.dncrLabel)}</span> <strong>${s.dncr}</strong></p>
      </div>
      ${
        cur
          ? `<div class="score-current">
        <h3>${escapeHtml(cur.label)}</h3>
        <ul class="score-stats">
          <li><span>${tr ? "Puan" : "Points"}</span><strong>${cur.points}</strong></li>
          <li><span>${tr ? "Galibiyet" : "Wins"}</span><strong>${cur.wins}</strong></li>
          <li><span>${tr ? "Mağlubiyet" : "Losses"}</span><strong>${cur.losses}</strong></li>
          <li><span>${tr ? "Oyun" : "Games"}</span><strong>${cur.games}</strong></li>
        </ul>
      </div>`
          : ""
      }
      <h3 class="score-table-title">${tr ? "Oyunlara göre" : "By game"}</h3>
      <ol class="score-table">
        ${s.rows
          .map(
            (r) => `<li class="${r.id === gameId ? "is-current" : ""}">
          <span class="score-game">${escapeHtml(r.label)}</span>
          <span class="score-pts">${r.points}</span>
          <span class="score-wl">${r.wins}W · ${r.losses}L</span>
        </li>`
          )
          .join("")}
      </ol>
      <p class="score-note">${
        tr
          ? "Puanlar bu cihazda saklanır. Zorluk ve moda göre çarpan uygulanır; rakibin kimliği etkili değildir."
          : "Scores stay on this device. Difficulty and mode multipliers apply; opponent identity does not."
      }</p>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  root.ArenaScore = {
    load,
    save,
    record,
    setDisplayName,
    totalPoints,
    summary,
    renderInto,
    DIFF_MULT,
    MODE_MULT,
  };
})(typeof self !== "undefined" ? self : this);
