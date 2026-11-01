(() => {
  const E = window.TavlaEngine;
  const Ai = window.TavlaAi;
  const CFG = window.TavlaConfig;
  const I18N = window.TavlaI18n;
  const P2P = window.TavlaP2P;
  if (!E || !Ai || !CFG || !I18N) {
    console.error("Tavla: missing modules");
    return;
  }

  const { PLAYERS, createState, applyRoll, applyMove, legalMoves, serialize, deserialize, opponent, offCount, barCount, pointsOwned } = E;

  const SETTINGS_KEY = "tavla_settings";
  const SEEN_VER_KEY = "tavla_seen_version";
  const STARTER_KEY = "tavla_next_starter";
  const MAX_VISIBLE = 5;

  const DIFFS = [
    { id: "easy", i18n: "diffEasy", hint: "diffEasyHint" },
    { id: "normal", i18n: "diffNormal", hint: "diffNormalHint" },
    { id: "hard", i18n: "diffHard", hint: "diffHardHint" },
    { id: "veryhard", i18n: "diffVeryHard", hint: "diffVeryHardHint" },
  ];

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("screen-home"),
    play: $("screen-play"),
    soloSetup: $("screen-solo-setup"),
    twoPSetup: $("screen-2p-setup"),
    p2p: $("screen-p2p"),
    room: $("screen-room"),
    settings: $("screen-settings"),
    help: $("screen-help"),
    scores: $("screen-scores"),
    updates: $("screen-updates"),
    game: $("screen-game"),
  };

  let settings = loadSettings();
  let setupDiff = settings.aiDifficulty || "normal";
  /** @type {null | object} */
  let session = null;
  /** @type {null | number | 'bar'} */
  let selected = null;
  let aiTimer = null;
  let boardReady = false;
  /** @type {null | object} */
  let p2p = null;
  let p2pLobby = null;
  let hubBackCtl = null;
  const Sfx = window.DncrMoveSfx || null;
  const Audio = window.TavlaAudio || null;
  /** @type {Map<number, HTMLButtonElement>} */
  const pointEls = new Map();
  /** Undo / Redo — hamle geçmişi */
  /** @type {string[]} */
  let undoStack = [];
  /** @type {string[]} */
  let redoStack = [];
  const UNDO_MAX = 40;
  /** @type {null | number} hangi zar önce oynanacak */
  let selectedDie = null;
  /** Tahta bakış açısı — P2P’de her oyuncu kendi tarafını altta görür */
  let boardPerspective = PLAYERS.white;
  /** @type {WakeLockSentinel | null} */
  let wakeLockSentinel = null;
  /** Uzaktan hamle kuyruğu (animasyon sırası) */
  let netQueue = [];
  let netPumping = false;
  /** @type {null | 'undo' | 'redo'} */
  let pendingHistoryKind = null;
  const Store = window.TavlaStore || null;
  const MATCH_OPTS = [1, 3, 5, 7];

  function playMoveSfx(kind) {
    if (Audio) {
      Audio.unlock();
      Audio.playSfx(kind || "move");
      return;
    }
    if (!Sfx) return;
    Sfx.unlock();
    Sfx.play(kind || "move");
  }

  function ensureMusic() {
    const musicOn = settings.music !== false;
    const sfxOn = settings.sfx !== false;
    if (Audio) {
      Audio.unlock();
      Audio.applyPrefs({ music: musicOn, sfx: sfxOn });
      if (musicOn) Audio.startMusic();
    }
    applySfxPref(sfxOn);
  }

  function loadSettings() {
    const defaults = {
      lang: "tr",
      aiDifficulty: "normal",
      name: "",
      p1: "",
      p2: "",
      music: true,
      sfx: true,
      matchTo: 1,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch (_) {
      return defaults;
    }
  }

  function saveSettings(next) {
    settings = { ...settings, ...next };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  function lang() {
    return settings.lang === "en" ? "en" : "tr";
  }
  function t(key) {
    return I18N.t(lang(), key);
  }

  function showScreen(name) {
    Object.values(screens).forEach((el) => el && el.classList.remove("active"));
    if (screens[name]) screens[name].classList.add("active");
    if (name === "game") acquireWakeLock();
    else releaseWakeLock();
    if (name === "p2p") renderSavedGamesList();
  }

  async function acquireWakeLock() {
    try {
      if (!navigator.wakeLock || typeof navigator.wakeLock.request !== "function") {
        return;
      }
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      wakeLockSentinel.addEventListener("release", () => {
        wakeLockSentinel = null;
      });
    } catch (_) {
      wakeLockSentinel = null;
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLockSentinel) await wakeLockSentinel.release();
    } catch (_) {}
    wakeLockSentinel = null;
  }

  function readMatchLen(containerId) {
    const root = $(containerId);
    if (!root) return settings.matchTo || 1;
    const checked = root.querySelector('input[name="matchLen"]:checked');
    const n = checked ? Number(checked.value) : 1;
    return MATCH_OPTS.includes(n) ? n : 1;
  }

  function renderMatchLenRows() {
    ["solo-match-len", "twop-match-len", "p2p-match-len"].forEach((id) => {
      const root = $(id);
      if (!root) return;
      const cur = settings.matchTo || 1;
      root.innerHTML = "";
      MATCH_OPTS.forEach((n) => {
        const lab = document.createElement("label");
        const inp = document.createElement("input");
        inp.type = "radio";
        inp.name = "matchLen";
        inp.value = String(n);
        inp.checked = n === cur;
        inp.addEventListener("change", () => {
          if (inp.checked) saveSettings({ matchTo: n });
        });
        const span = document.createElement("span");
        span.textContent = t(`matchLen${n}`);
        lab.appendChild(inp);
        lab.appendChild(span);
        root.appendChild(lab);
      });
    });
  }

  function persistSession() {
    if (!Store || !session || !session.state) return;
    if (session.state.winner) {
      const ms = session.matchScore || { white: 0, blue: 0 };
      const matchTo = session.matchTo || 1;
      if (matchTo <= 1 || ms.white >= matchTo || ms.blue >= matchTo) {
        if (session.saveId) Store.remove(session.saveId);
        return;
      }
    }
    if (!session.saveId) session.saveId = Store.newId();
    Store.upsert({
      id: session.saveId,
      status: "active",
      mode: session.mode,
      transport: session.transport || null,
      names: session.names,
      you: session.you || null,
      matchTo: session.matchTo || 1,
      matchScore: session.matchScore || { white: 0, blue: 0 },
      state: serialize(session.state),
      difficulty: session.difficulty || null,
    });
  }

  function clearPersistedSession() {
    if (Store && session && session.saveId) Store.remove(session.saveId);
  }

  function renderSavedGamesList() {
    const list = $("p2p-saved-list");
    if (!list || !Store) return;
    const games = Store.listActive();
    list.innerHTML = "";
    if (!games.length) {
      const li = document.createElement("li");
      li.textContent = t("savedEmpty");
      list.appendChild(li);
      return;
    }
    games.forEach((g) => {
      const li = document.createElement("li");
      const meta = document.createElement("div");
      meta.className = "saved-meta";
      const title = document.createElement("strong");
      const modeLabel =
        g.mode === "solo" ? t("vsCpu") : g.mode === "twop" ? t("local2p") : t("remote");
      title.textContent = `${(g.names && g.names.white) || "—"} · ${(g.names && g.names.blue) || "—"}`;
      const sub = document.createElement("span");
      const when = g.updatedAt ? new Date(g.updatedAt).toLocaleString() : "";
      sub.textContent = `${modeLabel} · ${t("savedAt")} ${when}`;
      meta.appendChild(title);
      meta.appendChild(sub);
      const actions = document.createElement("div");
      actions.className = "saved-actions";
      const btnGo = document.createElement("button");
      btnGo.type = "button";
      btnGo.className = "btn btn-secondary";
      btnGo.textContent = t("savedResume");
      btnGo.addEventListener("click", () => resumeSavedGame(g.id));
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn-ghost";
      btnDel.textContent = t("savedDelete");
      btnDel.addEventListener("click", () => {
        Store.remove(g.id);
        renderSavedGamesList();
      });
      actions.appendChild(btnGo);
      actions.appendChild(btnDel);
      li.appendChild(meta);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  async function resumeSavedGame(id) {
    if (!Store) return;
    const g = Store.get(id);
    if (!g || !g.state) return;
    if (g.mode === "p2p") {
      toast(t("savedGamesHint"));
      // Yerel tahta durumunu aç — rakip yeniden bağlanınca sync gerekir
    }
    destroyP2P();
    ensureMusic();
    clearUndo();
    session = {
      mode: g.mode === "p2p" ? "twop" : g.mode, // P2P kaydı tek cihazda 2p gibi açılır
      status: "playing",
      you: g.you || PLAYERS.white,
      names: g.names || { white: t("white"), blue: t("blue") },
      state: deserialize(g.state),
      matchTo: g.matchTo || 1,
      matchScore: g.matchScore || { white: 0, blue: 0 },
      difficulty: g.difficulty || "normal",
      saveId: g.id,
      scoreRecorded: false,
      endSfxPlayed: false,
      matchPointCredited: !!g.state.winner,
      resumed: true,
    };
    if (g.mode === "solo") session.mode = "solo";
    selected = null;
    selectedDie = null;
    showScreen("game");
    hideStartPanel();
    if ($("end-panel")) $("end-panel").classList.add("hidden");
    renderGame();
  }

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  function syncAudioSwitch(kind, on) {
    const checked = !!on;
    const input = $(kind === "music" ? "set-music" : "set-sfx");
    const btn = $(kind === "music" ? "btn-music-toggle" : "btn-sfx-toggle");
    if (input) input.checked = checked;
    if (btn) {
      btn.setAttribute("aria-pressed", checked ? "true" : "false");
      const lab = btn.querySelector(".switch-label");
      if (lab) lab.textContent = checked ? t("audioOn") : t("audioOff");
    }
  }

  function applySfxPref(on) {
    if (Audio) Audio.setSfx(on);
    if (Sfx && typeof Sfx.setEnabled === "function") Sfx.setEnabled(on);
  }

  function applyI18n() {
    document.documentElement.lang = lang();
    document.title = t("appName");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      const key = el.getAttribute("data-i18n-ph");
      if (key) el.setAttribute("placeholder", t(key));
    });
    const ver = `v${CFG.version} · build ${CFG.build}`;
    if ($("home-version")) $("home-version").textContent = ver;
    if ($("settings-version")) $("settings-version").textContent = ver;
    if ($("updates-current"))
      $("updates-current").textContent = `${CFG.version} (${CFG.build})`;
    if ($("updates-current-game"))
      $("updates-current-game").textContent = `${CFG.version} (${CFG.build})`;
    syncAudioSwitch("music", settings.music !== false);
    syncAudioSwitch("sfx", settings.sfx !== false);
    renderMatchLenRows();
    renderChangelog();
    updateUpdatesDot();
    renderDiffGrid();
    if (hubBackCtl && hubBackCtl.refresh) hubBackCtl.refresh();
  }

  function renderScores() {
    if (!window.ArenaScore || !$("scores-panel")) return;
    window.ArenaScore.renderInto($("scores-panel"), {
      lang: lang(),
      gameId: "tavla",
    });
  }

  function maybeRecordScore() {
    if (!session || !session.state || !session.state.winner || session.scoreRecorded) return;
    if (!window.ArenaScore) return;
    session.scoreRecorded = true;
    let result = "loss";
    if (session.mode === "solo") {
      result = session.state.winner === PLAYERS.white ? "win" : "loss";
    } else if (session.mode === "p2p") {
      result = session.state.winner === session.you ? "win" : "loss";
    } else {
      result = "win";
    }
    const winnerCaps =
      (session.state.captures && session.state.captures[session.state.winner]) || 0;
    window.ArenaScore.record({
      gameId: "tavla",
      result: session.mode === "twop" ? "win" : result,
      difficulty: session.difficulty || settings.aiDifficulty || "normal",
      mode: session.mode === "twop" ? "twop" : session.mode,
      stats: { captures: winnerCaps },
    });
  }

  function renderChangelog() {
    const list = $("changelog-list");
    if (!list) return;
    list.innerHTML = "";
    const L = lang();
    (CFG.changelog || []).forEach((entry) => {
      const card = document.createElement("article");
      card.className = "upgrade-card";
      const items = (entry.items && entry.items[L]) || (entry.items && entry.items.tr) || [];
      card.innerHTML = `
        <div class="upgrade-head">
          <span class="upgrade-badge">v${entry.version}</span>
          <h2>build ${entry.build}${entry.date ? " · " + entry.date : ""}</h2>
        </div>
        <ul class="upgrade-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>
      `;
      list.appendChild(card);
    });
  }

  function updateUpdatesDot() {
    let seen = "";
    try {
      seen = localStorage.getItem(SEEN_VER_KEY) || "";
    } catch (_) {}
    const dot = $("updates-dot");
    if (!dot) return;
    if (seen !== CFG.version) dot.classList.remove("hidden");
    else dot.classList.add("hidden");
  }

  function renderDiffGrid() {
    const grid = $("diff-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const d of DIFFS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diff-card" + (setupDiff === d.id ? " selected" : "");
      btn.innerHTML = `<strong>${t(d.i18n)}</strong><span>${t(d.hint)}</span>`;
      btn.addEventListener("click", () => {
        setupDiff = d.id;
        renderDiffGrid();
      });
      grid.appendChild(btn);
    }
  }

  function readNextStarter() {
    try {
      const v = localStorage.getItem(STARTER_KEY);
      if (v === PLAYERS.white || v === PLAYERS.blue) return v;
    } catch (_) {}
    return PLAYERS.white;
  }

  function writeNextStarter(starter) {
    try {
      localStorage.setItem(STARTER_KEY, opponent(starter));
    } catch (_) {}
  }

  // —— Board ——
  function makePoint(n, tipClass) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `point ${tipClass} ${n % 2 === 0 ? "even" : "odd"}`;
    btn.dataset.point = String(n);
    btn.setAttribute("aria-label", `Point ${n}`);
    btn.addEventListener("click", () => onPointClick(n));
    pointEls.set(n, btn);
    return btn;
  }

  function buildBoard(perspective) {
    const view = perspective === PLAYERS.blue ? PLAYERS.blue : PLAYERS.white;
    if (boardReady && boardPerspective === view) return;
    const leftTop = $("board-left-top");
    const leftBot = $("board-left-bottom");
    const rightTop = $("board-right-top");
    const rightBot = $("board-right-bottom");
    if (!leftTop || !leftBot || !rightTop || !rightBot) return;
    leftTop.innerHTML = "";
    leftBot.innerHTML = "";
    rightTop.innerHTML = "";
    rightBot.innerHTML = "";
    pointEls.clear();
    boardPerspective = view;
    const boardEl = $("board");
    if (boardEl) {
      boardEl.classList.toggle("is-flipped-perspective", view === PLAYERS.blue);
    }
    if (view === PLAYERS.white) {
      // Klasik: sol 13–18 / 12–7 · sağ 19–24 / 6–1 (beyaz evi alt-sağ)
      for (let n = 13; n <= 18; n++) leftTop.appendChild(makePoint(n, "tip-up"));
      for (let n = 12; n >= 7; n--) leftBot.appendChild(makePoint(n, "tip-down"));
      for (let n = 19; n <= 24; n++) rightTop.appendChild(makePoint(n, "tip-up"));
      for (let n = 6; n >= 1; n--) rightBot.appendChild(makePoint(n, "tip-down"));
    } else {
      // Mavi bakışı: mavi evi (19–24) alt-sağda
      for (let n = 12; n >= 7; n--) leftTop.appendChild(makePoint(n, "tip-up"));
      for (let n = 13; n <= 18; n++) leftBot.appendChild(makePoint(n, "tip-down"));
      for (let n = 6; n >= 1; n--) rightTop.appendChild(makePoint(n, "tip-up"));
      for (let n = 19; n <= 24; n++) rightBot.appendChild(makePoint(n, "tip-down"));
    }
    boardReady = true;
  }

  function ensureBoardForSession() {
    const you =
      session && session.mode === "p2p"
        ? session.you || PLAYERS.white
        : PLAYERS.white;
    buildBoard(you);
  }

  function appendCheckers(container, count, color) {
    const show = Math.min(count, MAX_VISIBLE);
    for (let i = 0; i < show; i++) {
      const c = document.createElement("span");
      c.className = `checker ${color}`;
      container.appendChild(c);
    }
    if (count > MAX_VISIBLE) {
      const badge = document.createElement("span");
      badge.className = "overflow";
      badge.textContent = String(count);
      container.appendChild(badge);
    }
  }

  function renderBar(state) {
    const stack = $("bar-stack");
    const zone = $("bar-zone");
    if (!stack) return;
    stack.innerHTML = "";
    const w = barCount(state, PLAYERS.white);
    const b = barCount(state, PLAYERS.blue);
    const whiteEl = document.createElement("div");
    whiteEl.className = "bar-half bar-white";
    appendCheckers(whiteEl, w, "white");
    const blueEl = document.createElement("div");
    blueEl.className = "bar-half bar-blue";
    appendCheckers(blueEl, b, "blue");
    // Mavi bakışında kendi barı altta (oyuncuya yakın)
    if (boardPerspective === PLAYERS.blue) {
      stack.appendChild(whiteEl);
      stack.appendChild(blueEl);
    } else {
      stack.appendChild(whiteEl);
      stack.appendChild(blueEl);
    }
    if (zone) {
      zone.classList.toggle("selected", selected === "bar");
      zone.classList.toggle("legal-from", isSelectableFrom("bar"));
    }
  }

  function renderOff(state) {
    const ow = $("off-white");
    const ob = $("off-blue");
    if (ow) {
      ow.textContent = String(offCount(state, PLAYERS.white));
      ow.classList.toggle("legal", isLegalTarget("off", PLAYERS.white));
    }
    if (ob) {
      ob.textContent = String(offCount(state, PLAYERS.blue));
      ob.classList.toggle("legal", isLegalTarget("off", PLAYERS.blue));
    }
  }

  let diceAnimTimer = null;
  let diceBusy = false;
  let moveBusy = false;

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Ortak tempo — oyuncu ve bilgisayar aynı animasyon hızı */
  const PACE = {
    flyMs: 680,
    flyHitMs: 560,
    betweenMovesMs: 480,
    afterDiceMs: 420,
    aiThinkMs: 1400,
    aiFirstMs: 900,
  };

  function rectCenter(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      size: Math.min(r.width, r.height) || 28,
    };
  }

  function pointLanding(n) {
    const el = pointEls.get(n);
    if (!el) return null;
    const isTop = !!el.closest(".board-quad.top");
    const checkers = el.querySelectorAll(".checker");
    if (checkers.length) {
      const last = checkers[checkers.length - 1];
      const pos = rectCenter(last);
      if (!pos) return null;
      return { x: pos.x, y: pos.y + (isTop ? 11 : -11), size: pos.size };
    }
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: isTop ? r.top + Math.min(22, r.height * 0.18) : r.bottom - Math.min(22, r.height * 0.18),
      size: Math.min(r.width * 0.88, 32),
    };
  }

  function barLanding(color) {
    const halfSel = color === PLAYERS.white ? ".bar-white" : ".bar-blue";
    const half = document.querySelector(`#bar-stack ${halfSel}`);
    if (!half) return rectCenter($("bar-zone"));
    const checkers = half.querySelectorAll(".checker");
    if (checkers.length) return rectCenter(checkers[checkers.length - 1]);
    return rectCenter(half) || rectCenter($("bar-zone"));
  }

  function offLanding(color) {
    return rectCenter(color === PLAYERS.white ? $("off-white") : $("off-blue"));
  }

  function slotLanding(slot, color) {
    if (slot === "bar") return barLanding(color);
    if (slot === "off") return offLanding(color);
    if (typeof slot === "number") return pointLanding(slot);
    return null;
  }

  function peelChecker(slot, color) {
    if (slot === "bar") {
      const halfSel = color === PLAYERS.white ? ".bar-white" : ".bar-blue";
      const half = document.querySelector(`#bar-stack ${halfSel}`);
      const checkers = half ? half.querySelectorAll(".checker") : [];
      const c = checkers[checkers.length - 1];
      if (c) {
        const pos = rectCenter(c);
        c.remove();
        return pos;
      }
      return barLanding(color);
    }
    if (typeof slot === "number") {
      const el = pointEls.get(slot);
      const checkers = el ? el.querySelectorAll(".checker") : [];
      const c = checkers[checkers.length - 1];
      if (c) {
        const pos = rectCenter(c);
        c.remove();
        return pos;
      }
      return pointLanding(slot);
    }
    return null;
  }

  function flyChecker(from, to, color, opts) {
    return new Promise((resolve) => {
      if (!from || !to) {
        resolve();
        return;
      }
      const size = Math.max(18, from.size || to.size || 28);
      const el = document.createElement("span");
      el.className = `checker-fly ${color}${opts && opts.hit ? " is-hit" : ""}`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${from.x - size / 2}px`;
      el.style.top = `${from.y - size / 2}px`;
      document.body.appendChild(el);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const arc = Math.min(64, Math.max(18, dist * 0.24));
      const dur =
        (opts && opts.duration) ||
        (opts && opts.hit ? PACE.flyHitMs : PACE.flyMs);
      const finish = () => {
        if (el.parentNode) el.parentNode.removeChild(el);
        resolve();
      };
      if (typeof el.animate !== "function") {
        waitMs(dur).then(finish);
        return;
      }
      const anim = el.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", offset: 0 },
          {
            transform: `translate(${(dx * 0.48).toFixed(1)}px, ${(dy * 0.48 - arc).toFixed(1)}px) scale(1.04)`,
            offset: 0.48,
          },
          {
            transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(1)`,
            offset: 1,
          },
        ],
        {
          duration: dur,
          easing: "cubic-bezier(0.2, 0.75, 0.22, 1)",
          fill: "forwards",
        }
      );
      anim.finished.then(finish).catch(finish);
    });
  }

  async function animateMoveFlight(move, player) {
    const fromPos = peelChecker(move.from, player) || slotLanding(move.from, player);
    const toPos = slotLanding(move.to, player);
    let hitPos = null;
    if (move.hit && typeof move.to === "number") {
      const el = pointEls.get(move.to);
      const blot = el && el.querySelector(".checker");
      if (blot) hitPos = rectCenter(blot);
    }
    await flyChecker(fromPos, toPos, player);
    if (move.hit) {
      const opp = opponent(player);
      if (hitPos) {
        const blotEl = pointEls.get(move.to) && pointEls.get(move.to).querySelector(".checker");
        if (blotEl) blotEl.remove();
      }
      const barPos = barLanding(opp);
      await flyChecker(hitPos || toPos, barPos, opp, { hit: true, duration: PACE.flyHitMs });
    }
  }

  function makeDieFace(faceValue) {
    const face = document.createElement("span");
    face.className = "die-face";
    face.dataset.face = String(faceValue);
    face.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 9; i++) {
      face.appendChild(document.createElement("span")).className = "pip";
    }
    return face;
  }

  function makeDieEl(value, extraClass) {
    const die = document.createElement("span");
    die.className = "die" + (extraClass ? " " + extraClass : "");
    die.dataset.value = String(value);
    die.setAttribute("aria-label", String(value));
    const cube = document.createElement("span");
    cube.className = "die-cube";
    for (let face = 1; face <= 6; face++) {
      cube.appendChild(makeDieFace(face));
    }
    die.appendChild(cube);
    return die;
  }

  function paintDice(values, opts) {
    const row = $("dice-row");
    if (!row) return;
    const rolling = !!(opts && opts.rolling);
    const settle = !!(opts && opts.settle);
    const remaining = (opts && opts.remaining ? opts.remaining.slice() : null);
    const prev = !!(opts && opts.previous);
    const playable = !!(opts && opts.playable);
    row.innerHTML = "";
    const list = values && values.length ? values : [];
    const remCopy = remaining ? remaining.slice() : null;
    list.forEach((v, i) => {
      let cls = "";
      if (rolling) cls = "rolling";
      else if (settle) cls = "settle";
      const die = makeDieEl(v, cls);
      if (prev) die.classList.add("prev-roll");
      let isUsed = false;
      if (!rolling && !prev && remCopy) {
        const idx = remCopy.indexOf(v);
        if (idx >= 0) remCopy.splice(idx, 1);
        else {
          die.classList.add("used");
          isUsed = true;
        }
      }
      if (
        playable &&
        !rolling &&
        !prev &&
        !isUsed &&
        selectedDie != null &&
        Number(selectedDie) === Number(v)
      ) {
        die.classList.add("is-selected");
        die.title = t("dieSelected");
      }
      if (playable && !rolling && !prev && !isUsed) {
        die.classList.add("playable");
        die.setAttribute("role", "button");
        die.tabIndex = 0;
        die.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDieClick(v);
        });
      }
      if (rolling) {
        const side = i % 2 === 0 ? -1 : 1;
        const tx = side * (22 + Math.random() * 36 + i * 8);
        const tr = side * (28 + Math.random() * 40);
        die.style.setProperty("--throw-x", `${tx}px`);
        die.style.setProperty("--throw-r", `${tr}deg`);
        die.style.animationDelay = `${i * 0.08}s`;
      }
      row.appendChild(die);
    });
  }

  function renderDice(state) {
    if (diceBusy) return;
    const raw = state.lastRoll || state.diceRaw;
    if (!raw || !raw.length) {
      paintDice([]);
      return;
    }
    // Önceki tur zarları — çiftte 4 yüz göster (rakip beklerken)
    if (state.phase === "roll") {
      const isDouble = raw[0] === raw[1];
      const slots = isDouble
        ? [raw[0], raw[0], raw[0], raw[0]]
        : [raw[0], raw[1]];
      paintDice(slots, { previous: true });
      return;
    }
    const isDouble = raw[0] === raw[1];
    const slots = isDouble ? [raw[0], raw[0], raw[0], raw[0]] : [raw[0], raw[1]];
    const canPlay =
      isMyTurn() &&
      state.phase === "move" &&
      !state.winner &&
      !moveBusy;
    paintDice(slots, {
      remaining: (state.dice || []).slice(),
      playable: canPlay,
    });
  }

  /** Zar üzerine dokununca: önce bu zarı seç / o zarı kullan */
  function onDieClick(dieValue) {
    if (!session || session.state.winner || moveBusy || diceBusy) return;
    if (!isMyTurn() || session.state.phase !== "move") return;
    const die = Number(dieValue);
    const allForDie = legalMoves(session.state).filter((m) => m.die === die);
    if (!allForDie.length) {
      toast(t("dieUnused"));
      return;
    }

    // Aynı zara tekrar dokun = seçimi kaldır (sırayı serbest bırak)
    if (selectedDie === die && selected == null) {
      selectedDie = null;
      renderGame();
      return;
    }
    selectedDie = die;

    const prefer = (list) => {
      const off = list.find((m) => m.to === "off");
      if (off) return off;
      return list.slice().sort((a, b) => {
        if (a.to === "off") return -1;
        if (b.to === "off") return 1;
        return b.die - a.die;
      })[0];
    };

    if (selected != null) {
      const fromMoves = allForDie.filter((m) => m.from === selected);
      if (fromMoves.length) {
        doMove(prefer(fromMoves));
        return;
      }
      const offsOnly = allForDie.filter((m) => m.to === "off");
      if (offsOnly.length === 1) {
        doMove(offsOnly[0]);
        return;
      }
      toast(t("dieWrongPiece"));
      renderGame();
      return;
    }

    if (allForDie.length === 1) {
      doMove(allForDie[0]);
      return;
    }
    const froms = [...new Set(allForDie.map((m) => m.from))];
    if (froms.length === 1) {
      const targets = [...new Set(allForDie.map((m) => m.to))];
      if (targets.length === 1) {
        doMove(allForDie[0]);
        return;
      }
      selected = froms[0];
      playMoveSfx("select");
      renderGame();
      return;
    }
    const offs = allForDie.filter((m) => m.to === "off");
    if (offs.length === 1) {
      doMove(offs[0]);
      return;
    }
    // Birden fazla taş — zar seçili kalsın, taş seçilsin
    playMoveSfx("select");
    toast(t("dieSelected"));
    renderGame();
  }

  function playDiceRollAnim(finalPair, done) {
    clearTimeout(diceAnimTimer);
    diceBusy = true;
    const btn = $("btn-roll");
    if (btn) {
      btn.classList.add("is-rolling", "hidden");
      btn.disabled = true;
    }
    updateUndoBtn();
    if (Audio) {
      Audio.unlock();
      Audio.playDiceRoll();
    } else {
      playMoveSfx("place");
    }
    const rollingSlots =
      finalPair[0] === finalPair[1]
        ? [finalPair[0], finalPair[0], finalPair[0], finalPair[0]]
        : [finalPair[0], finalPair[1]];
    paintDice(rollingSlots, { rolling: true });
    diceAnimTimer = setTimeout(() => {
      const isDouble = finalPair[0] === finalPair[1];
      const slots = isDouble
        ? [finalPair[0], finalPair[0], finalPair[0], finalPair[0]]
        : [finalPair[0], finalPair[1]];
      paintDice(slots, { settle: true });
      diceAnimTimer = setTimeout(() => {
        diceBusy = false;
        if (btn) btn.classList.remove("is-rolling");
        if (typeof done === "function") done();
      }, 380);
    }, 1100);
  }

  function clearUndo() {
    undoStack = [];
    redoStack = [];
    updateUndoBtn();
  }

  function pushUndo() {
    if (!session || !session.state) return;
    try {
      undoStack.push(serialize(session.state));
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      redoStack = [];
    } catch (_) {}
    updateUndoBtn();
  }

  function historyIdle() {
    return (
      !!session &&
      !diceBusy &&
      !moveBusy &&
      !netPumping &&
      !session.aiThinking &&
      !session.state.winner &&
      !pendingHistoryKind
    );
  }

  function updateUndoBtn() {
    const u = $("btn-game-undo");
    const r = $("btn-game-redo");
    const idle = historyIdle();
    if (u) u.disabled = !(idle && undoStack.length > 0);
    if (r) r.disabled = !(idle && redoStack.length > 0);
  }

  function restoreSnap(snap) {
    session.state = deserialize(snap);
    selected = null;
    selectedDie = null;
    session.endSfxPlayed = false;
    session.scoreRecorded = false;
    clearTimeout(aiTimer);
    session.aiThinking = false;
    renderGame();
    updateUndoBtn();
    persistSession();
  }

  function applyLocalUndo() {
    if (!undoStack.length) return false;
    try {
      redoStack.push(serialize(session.state));
      if (redoStack.length > UNDO_MAX) redoStack.shift();
      restoreSnap(undoStack.pop());
      toast(t("undoDone"));
      return true;
    } catch (_) {
      updateUndoBtn();
      return false;
    }
  }

  function applyLocalRedo() {
    if (!redoStack.length) return false;
    try {
      undoStack.push(serialize(session.state));
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      restoreSnap(redoStack.pop());
      toast(t("redoDone"));
      return true;
    } catch (_) {
      updateUndoBtn();
      return false;
    }
  }

  function doUndo() {
    if (!historyIdle() || !undoStack.length) return;
    if (session.mode === "p2p" && p2p) {
      pendingHistoryKind = "undo";
      updateUndoBtn();
      toast(t("undoRequested"));
      p2p.send({ type: "history-ask", kind: "undo", who: session.you });
      return;
    }
    applyLocalUndo();
  }

  function doRedo() {
    if (!historyIdle() || !redoStack.length) return;
    if (session.mode === "p2p" && p2p) {
      pendingHistoryKind = "redo";
      updateUndoBtn();
      toast(t("undoRequested"));
      p2p.send({ type: "history-ask", kind: "redo", who: session.you });
      return;
    }
    applyLocalRedo();
  }

  function showUndoAsk(kind) {
    const panel = $("undo-ask-panel");
    const text = $("undo-ask-text");
    if (text) text.textContent = kind === "redo" ? t("redoAskPeer") : t("undoAskPeer");
    if (panel) panel.classList.remove("hidden");
    panel && (panel.dataset.kind = kind || "undo");
  }

  function hideUndoAsk() {
    const panel = $("undo-ask-panel");
    if (panel) panel.classList.add("hidden");
  }

  function currentMoves() {
    if (!session || session.state.phase !== "move" || session.state.winner) return [];
    if (!isMyTurn()) return [];
    let moves = legalMoves(session.state);
    if (selectedDie != null) {
      moves = moves.filter((m) => m.die === selectedDie);
    }
    return moves;
  }

  function isSelectableFrom(from) {
    return currentMoves().some((m) => m.from === from);
  }

  function isLegalTarget(to, forPlayer) {
    if (!session || !isMyTurn() || session.state.phase !== "move") return false;
    if (selected == null) return false;
    if (to === "off") {
      if (forPlayer && session.state.turn !== forPlayer) return false;
      return currentMoves().some((m) => m.from === selected && m.to === "off");
    }
    return currentMoves().some((m) => m.from === selected && m.to === to);
  }

  function renderBoard() {
    if (!session) return;
    ensureBoardForSession();
    if (!boardReady) return;
    const s = session.state;
    for (let n = 1; n <= 24; n++) {
      const el = pointEls.get(n);
      if (!el) continue;
      el.innerHTML = "";
      const w = pointsOwned(s.points, n, PLAYERS.white);
      const b = pointsOwned(s.points, n, PLAYERS.blue);
      if (w > 0) appendCheckers(el, w, "white");
      else if (b > 0) appendCheckers(el, b, "blue");
      el.classList.toggle("selected", selected === n);
      el.classList.toggle("legal-from", isSelectableFrom(n));
      el.classList.toggle("legal", isLegalTarget(n));
    }
    renderBar(s);
    renderOff(s);
    renderDice(s);
  }

  function isMyTurn() {
    if (!session || session.state.winner) return false;
    if (session.mode === "solo") {
      return session.state.turn === PLAYERS.white && !session.aiThinking;
    }
    if (session.mode === "twop") return true;
    if (session.mode === "p2p") {
      const you = session.you || (p2pLobby && p2pLobby.you);
      return session.state.turn === you && session.status === "playing";
    }
    return false;
  }

  function renderGame() {
    if (!session) return;
    const s = session.state;
    renderBoard();

    const matchTo = session.matchTo || 1;
    const ms = session.matchScore || { white: 0, blue: 0 };
    if (matchTo > 1) {
      $("score-white").textContent = String(ms.white || 0);
      $("score-blue").textContent = String(ms.blue || 0);
    } else {
      $("score-white").textContent = String(offCount(s, PLAYERS.white));
      $("score-blue").textContent = String(offCount(s, PLAYERS.blue));
    }
    $("name-chip-white").textContent = session.names.white;
    $("name-chip-blue").textContent = session.names.blue;

    const pipW = E.pipCount ? E.pipCount(s, PLAYERS.white) : 0;
    const pipB = E.pipCount ? E.pipCount(s, PLAYERS.blue) : 0;
    $("meta-white").textContent = `${t("pipLabel")} ${pipW}`;
    $("meta-blue").textContent = `${t("pipLabel")} ${pipB}`;

    const infoPips = $("info-pips");
    const infoAhead = $("info-ahead");
    const infoMatch = $("info-match");
    if (infoPips) {
      infoPips.textContent = t("pipLine")
        .replace("{w}", String(pipW))
        .replace("{b}", String(pipB));
    }
    if (infoAhead) {
      let ahead = t("aheadTied");
      if (pipW < pipB) {
        ahead =
          session.mode === "p2p"
            ? session.you === PLAYERS.white
              ? t("aheadYou")
              : t("aheadOpp")
            : t("aheadWhite");
      } else if (pipB < pipW) {
        ahead =
          session.mode === "p2p"
            ? session.you === PLAYERS.blue
              ? t("aheadYou")
              : t("aheadOpp")
            : t("aheadBlue");
      }
      infoAhead.textContent = ahead;
    }
    if (infoMatch) {
      infoMatch.textContent =
        matchTo > 1
          ? t("matchScore")
              .replace("{a}", String(ms.white || 0))
              .replace("{b}", String(ms.blue || 0))
              .replace("{n}", String(matchTo))
          : "";
    }

    $("chip-white").classList.toggle("active", s.turn === PLAYERS.white && !s.winner);
    $("chip-blue").classList.toggle("active", s.turn === PLAYERS.blue && !s.winner);

    const mine = isMyTurn();
    let phaseText = "";
    if (s.winner) phaseText = lang() === "en" ? "Game over" : "Oyun bitti";
    else if (session.aiThinking || diceBusy) phaseText = t("statusCpu");
    else if (moveBusy) phaseText = t("movePhase");
    else if (!mine && session.mode !== "twop") phaseText = t("oppTurn");
    else if (s.phase === "move") phaseText = t("movePhase");
    else phaseText = "";
    if ($("phase-label")) $("phase-label").textContent = phaseText || "\u00a0";

    const rollBtn = $("btn-roll");
    if (rollBtn) {
      const showRoll = s.phase === "roll" && !s.winner && !diceBusy;
      const canRoll = showRoll && mine && !moveBusy && !session.aiThinking;
      rollBtn.disabled = !canRoll;
      rollBtn.classList.toggle("hidden", !showRoll);
      rollBtn.classList.toggle("is-rolling", !!diceBusy);
    }
    updateUndoBtn();

    let statusText = "\u00a0";
    if (s.winner) statusText = "\u00a0";
    else if (diceBusy || moveBusy) statusText = "\u00a0";
    else if (session.aiThinking) statusText = t("statusCpu");
    else if (!mine && session.mode !== "twop") statusText = "\u00a0";
    else if (s.phase === "roll") statusText = "\u00a0";
    else if (selected != null) statusText = t("selectTarget");
    else statusText = t("selectPoint");
    $("status-msg").textContent = statusText;

    const end = $("end-panel");
    if (s.winner) {
      handleGameWinnerUI();
    } else end.classList.add("hidden");
  }

  function handleGameWinnerUI() {
    if (!session || !session.state.winner) return;
    const s = session.state;
    const end = $("end-panel");
    maybeRecordScore();
    maybeCreditMatchPoint();
    if (!session.endSfxPlayed) {
      session.endSfxPlayed = true;
      if (session.mode === "solo") {
        playMoveSfx(s.winner === PLAYERS.white ? "win" : "lose");
      } else if (session.mode === "p2p") {
        playMoveSfx(s.winner === session.you ? "win" : "lose");
      } else {
        playMoveSfx("win");
      }
    }
    end.classList.remove("hidden");
    const ms = session.matchScore || { white: 0, blue: 0 };
    const matchTo = session.matchTo || 1;
    const matchOver =
      matchTo > 1 && (ms.white >= matchTo || ms.blue >= matchTo);
    const rematchBtn = $("btn-rematch");
    if (rematchBtn) {
      rematchBtn.textContent = matchOver
        ? t("rematch")
        : matchTo > 1
          ? t("continueMatch")
          : t("rematch");
    }
    let text;
    if (matchTo > 1) {
      const a = String(ms.white || 0);
      const b = String(ms.blue || 0);
      if (matchOver) {
        if (session.mode === "p2p") {
          text =
            ms[session.you === PLAYERS.white ? "white" : "blue"] >= matchTo
              ? t("matchWon").replace("{a}", a).replace("{b}", b)
              : t("matchLost").replace("{a}", a).replace("{b}", b);
        } else if (session.mode === "solo") {
          text =
            ms.white >= matchTo
              ? t("matchWon").replace("{a}", a).replace("{b}", b)
              : t("matchLost").replace("{a}", a).replace("{b}", b);
        } else {
          text =
            (ms.white >= matchTo ? t("winWhite") : t("winBlue")) +
            ` (${a}–${b})`;
        }
      } else if (session.mode === "solo") {
        text =
          (s.winner === PLAYERS.white ? t("matchGameWin") : t("matchGameLose"))
            .replace("{a}", a)
            .replace("{b}", b);
      } else if (session.mode === "p2p") {
        text =
          (s.winner === session.you ? t("matchGameWin") : t("matchGameLose"))
            .replace("{a}", a)
            .replace("{b}", b);
      } else {
        text =
          (s.winner === PLAYERS.white ? t("winWhite") : t("winBlue")) +
          ` · ${a}–${b}`;
      }
    } else if (session.mode === "solo") {
      text = s.winner === PLAYERS.white ? t("winYou") : t("winOpp");
    } else if (session.mode === "p2p") {
      text = s.winner === session.you ? t("winYou") : t("winOpp");
    } else {
      text = s.winner === PLAYERS.white ? t("winWhite") : t("winBlue");
    }
    $("end-text").textContent = text;
    if (matchOver || matchTo <= 1) clearPersistedSession();
    else persistSession();
  }

  function maybeCreditMatchPoint() {
    if (!session || !session.state.winner) return;
    if (session.matchPointCredited) return;
    session.matchPointCredited = true;
    if (!session.matchScore) session.matchScore = { white: 0, blue: 0 };
    if (session.state.winner === PLAYERS.white) session.matchScore.white += 1;
    else session.matchScore.blue += 1;
  }

  function sendSync() {
    if (session && session.mode === "p2p" && p2p) {
      p2p.send({ type: "sync", state: serialize(session.state) });
    }
  }

  function enqueueNet(job) {
    netQueue.push(job);
    pumpNetQueue();
  }

  async function pumpNetQueue() {
    if (netPumping) return;
    netPumping = true;
    updateUndoBtn();
    try {
      while (netQueue.length) {
        const job = netQueue.shift();
        try {
          await job();
        } catch (_) {}
      }
    } finally {
      netPumping = false;
      updateUndoBtn();
    }
  }

  function doRoll(opts) {
    if (!session || session.state.winner || diceBusy || moveBusy) return;
    const fromNet = opts && opts.fromNet;
    const skipAnim = !!(opts && opts.skipAnim);
    if (!fromNet && !isMyTurn()) {
      toast(t("oppTurn"));
      return;
    }
    if (session.state.phase !== "roll") return;
    if (!fromNet) pushUndo();
    const r = applyRoll(session.state, opts && opts.roll);
    if (!r.ok) {
      if (!fromNet) {
        undoStack.pop();
        updateUndoBtn();
        toast(r.error || t("rollPhase"));
      }
      return;
    }
    const pair = (r.state.lastRoll || r.state.diceRaw || [1, 1]).slice(0, 2);
    if (!fromNet && session.mode === "p2p" && p2p) {
      p2p.send({ type: "roll", roll: pair });
    }
    const finish = () => {
      session.state = r.state;
      selected = null;
      selectedDie = null;
      if (r.skipped) toast(t("noMoves"));
      renderGame();
      persistSession();
      if (!fromNet && session.mode !== "p2p") sendSync();
      if (!fromNet && session.mode === "p2p") sendSync();
      maybeScheduleAi();
    };
    if (skipAnim) {
      playMoveSfx("place");
      finish();
      return;
    }
    const rollBtn = $("btn-roll");
    if (rollBtn) {
      rollBtn.disabled = true;
      rollBtn.classList.add("is-rolling", "hidden");
    }
    playDiceRollAnim(pair, finish);
  }

  async function doMove(move, opts) {
    if (!session || session.state.winner || moveBusy || diceBusy) return;
    const fromNet = opts && opts.fromNet;
    const skipAnim = !!(opts && opts.skipAnim);
    if (!fromNet && !isMyTurn()) {
      toast(t("oppTurn"));
      return;
    }
    if (!fromNet) pushUndo();
    moveBusy = true;
    updateUndoBtn();
    try {
      const r = applyMove(session.state, move);
      if (!r.ok) {
        if (!fromNet) {
          undoStack.pop();
          updateUndoBtn();
          toast(r.error || t("selectTarget"));
        }
        return;
      }
      const player = session.state.turn;
      selected = null;
      if (!fromNet && session.mode === "p2p" && p2p) {
        p2p.send({ type: "move", move });
      }
      if (!skipAnim) {
        await animateMoveFlight(move, player);
      }
      session.state = r.state;
      if (!(session.state.dice && session.state.dice.includes(selectedDie))) {
        selectedDie = null;
      }
      if (move.hit) playMoveSfx("capture");
      else if (move.to === "off") playMoveSfx("claim");
      else playMoveSfx("move");
      renderGame();
      persistSession();
      if (!fromNet) sendSync();
    } finally {
      moveBusy = false;
      updateUndoBtn();
    }
    if (!(opts && opts.skipAi)) maybeScheduleAi();
  }

  function pickMove(from, to) {
    const moves = currentMoves().filter((m) => m.from === from && m.to === to);
    if (!moves.length) return null;
    if (selectedDie != null) {
      const preferred = moves.filter((m) => m.die === selectedDie);
      if (preferred.length) {
        preferred.sort((a, b) => b.die - a.die);
        return preferred[0];
      }
    }
    moves.sort((a, b) => b.die - a.die);
    return moves[0];
  }

  function onPointClick(n) {
    if (!session || session.state.winner || moveBusy || diceBusy) return;
    if (!isMyTurn()) {
      toast(session.mode === "solo" ? t("statusCpu") : t("oppTurn"));
      return;
    }
    if (session.state.phase !== "move") {
      toast(t("rollPhase"));
      return;
    }
    const moves = currentMoves();

    if (selected != null) {
      const m = pickMove(selected, n);
      if (m) {
        doMove(m);
        return;
      }
      // Retarget: click another legal from
      if (isSelectableFrom(n)) {
        const fromMoves = moves.filter((x) => x.from === n);
        if (fromMoves.length === 1) {
          doMove(fromMoves[0]);
          return;
        }
        selected = n;
        renderGame();
        return;
      }
      selected = null;
      renderGame();
      return;
    }

    if (isSelectableFrom(n)) {
      const fromMoves = moves.filter((x) => x.from === n);
      if (fromMoves.length === 1) {
        doMove(fromMoves[0]);
        return;
      }
      // Unique destinations → still need choice if >1 target
      const targets = [...new Set(fromMoves.map((x) => x.to))];
      if (targets.length === 1) {
        doMove(fromMoves[0]);
        return;
      }
      selected = n;
      playMoveSfx("select");
      renderGame();
      return;
    }

    // Direct click on a unique complete-move target (no from selected)
    const toMoves = moves.filter((x) => x.to === n);
    if (toMoves.length === 1) {
      doMove(toMoves[0]);
    }
  }

  function onBarClick() {
    if (!session || session.state.winner || moveBusy || diceBusy) return;
    if (!isMyTurn() || session.state.phase !== "move") return;
    const moves = currentMoves().filter((m) => m.from === "bar");
    if (!moves.length) return;
    if (selected === "bar") {
      selected = null;
      renderGame();
      return;
    }
    const targets = [...new Set(moves.map((m) => m.to))];
    if (targets.length === 1) {
      doMove(moves[0]);
      return;
    }
    selected = "bar";
    playMoveSfx("select");
    renderGame();
  }

  function onOffClick(player) {
    if (!session || session.state.winner || moveBusy || diceBusy) return;
    if (!isMyTurn() || session.state.phase !== "move") return;
    if (session.state.turn !== player) return;
    if (selected == null) {
      // Unique off move
      const offs = currentMoves().filter((m) => m.to === "off");
      if (offs.length === 1) {
        doMove(offs[0]);
      } else if (offs.length > 1) {
        // Prefer selecting from if ambiguous
        const froms = [...new Set(offs.map((m) => m.from))];
        if (froms.length === 1) {
          selected = froms[0];
          renderGame();
        }
      }
      return;
    }
    const m = pickMove(selected, "off");
    if (m) doMove(m);
  }

  function maybeScheduleAi() {
    if (!session || session.mode !== "solo" || session.state.winner) return;
    if (session.state.phase === "roll" && session.state.turn === PLAYERS.blue) {
      scheduleAi(PACE.aiThinkMs);
    }
  }

  function scheduleAi(delay) {
    clearTimeout(aiTimer);
    if (!session || session.mode !== "solo" || session.state.winner) return;
    if (session.state.turn !== PLAYERS.blue || session.state.phase !== "roll") return;
    session.aiThinking = true;
    renderGame();
    aiTimer = setTimeout(() => {
      if (!session || session.mode !== "solo") return;
      if (session.state.turn !== PLAYERS.blue || session.state.winner) {
        session.aiThinking = false;
        renderGame();
        return;
      }
      // AI turunun tamamı tek undo adımı
      pushUndo();
      const result = Ai.playTurn(session.state, session.difficulty || "normal");
      selected = null;
      const pair = (result.roll || (result.state && result.state.lastRoll) || [1, 1]).slice(0, 2);
      playDiceRollAnim(pair, async () => {
        if (!session || session.mode !== "solo") return;
        const rolled = applyRoll(session.state, result.roll);
        if (!rolled.ok) {
          session.state = result.state;
          session.aiThinking = false;
          renderGame();
          return;
        }
        session.state = rolled.state;
        renderGame();
        if (result.skipped) {
          toast(t("noMoves"));
          session.aiThinking = false;
          renderGame();
          return;
        }
        await waitMs(PACE.afterDiceMs);
        for (let i = 0; i < (result.moves || []).length; i++) {
          if (!session || session.mode !== "solo") return;
          await doMove(result.moves[i], { fromNet: true, skipAi: true });
          if (i < result.moves.length - 1) await waitMs(PACE.betweenMovesMs);
        }
        // Güvenli senkron — AI sonucuyla hizala
        if (session && session.mode === "solo" && result.state) {
          session.state = result.state;
        }
        if (session) session.aiThinking = false;
        renderGame();
      });
    }, delay == null ? PACE.aiThinkMs : delay);
  }

  let startResolve = null;

  function hideStartPanel() {
    const panel = $("start-panel");
    if (panel) panel.classList.add("hidden");
  }

  function showStartBanner(starter, names) {
    return new Promise((resolve) => {
      const panel = $("start-panel");
      const text = $("start-text");
      const brow = $("start-eyebrow");
      if (!panel || !text) {
        resolve();
        return;
      }
      if (brow) brow.textContent = t("startMatch");
      if (session && session.mode === "solo") {
        text.textContent =
          starter === PLAYERS.white ? t("youStart") : t("cpuStarts");
      } else {
        const name =
          starter === PLAYERS.white
            ? (names && names.white) || t("white")
            : (names && names.blue) || t("blue");
        text.textContent = t("namedStarts").replace("{name}", name);
      }
      hideStartPanel();
      panel.classList.remove("hidden");
      startResolve = resolve;
    });
  }

  function dismissStartBanner() {
    hideStartPanel();
    const r = startResolve;
    startResolve = null;
    if (typeof r === "function") r();
  }

  async function startSolo(opts) {
    clearTimeout(aiTimer);
    destroyP2P();
    ensureMusic();
    clearUndo();
    const keepMatch = !!(opts && opts.continueMatch && session);
    const matchTo = keepMatch
      ? session.matchTo || 1
      : readMatchLen("solo-match-len");
    const matchScore = keepMatch
      ? session.matchScore || { white: 0, blue: 0 }
      : { white: 0, blue: 0 };
    const saveId = keepMatch ? session.saveId : null;
    saveSettings({ matchTo });
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "solo",
      difficulty: setupDiff,
      names: {
        white: t("you"),
        blue: t("computer"),
      },
      state: createState({ starter }),
      matchTo,
      matchScore,
      saveId,
      aiThinking: false,
      scoreRecorded: false,
      endSfxPlayed: false,
      matchPointCredited: false,
    };
    selected = null;
    selectedDie = null;
    showScreen("game");
    hideStartPanel();
    if ($("end-panel")) $("end-panel").classList.add("hidden");
    renderGame();
    persistSession();
    await showStartBanner(starter, session.names);
    if (!session || session.mode !== "solo") return;
    if (starter === PLAYERS.blue) scheduleAi(PACE.aiFirstMs);
  }

  async function startTwoP(opts) {
    clearTimeout(aiTimer);
    destroyP2P();
    ensureMusic();
    clearUndo();
    const keepMatch = !!(opts && opts.continueMatch && session);
    const matchTo = keepMatch
      ? session.matchTo || 1
      : readMatchLen("twop-match-len");
    const matchScore = keepMatch
      ? session.matchScore || { white: 0, blue: 0 }
      : { white: 0, blue: 0 };
    const saveId = keepMatch ? session.saveId : null;
    const p1 = ($("p1-name").value || "").trim() || t("player1Ph");
    const p2 = ($("p2-name").value || "").trim() || t("player2Ph");
    saveSettings({ p1, p2, matchTo });
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "twop",
      names: { white: p1, blue: p2 },
      state: createState({ starter }),
      matchTo,
      matchScore,
      saveId,
      scoreRecorded: false,
      endSfxPlayed: false,
      matchPointCredited: false,
    };
    selected = null;
    selectedDie = null;
    showScreen("game");
    hideStartPanel();
    if ($("end-panel")) $("end-panel").classList.add("hidden");
    renderGame();
    persistSession();
    await showStartBanner(starter, session.names);
  }

  function destroyP2P() {
    if (p2p) {
      try {
        p2p.destroy();
      } catch (_) {}
    }
    p2p = null;
    p2pLobby = null;
  }

  function renderRoom() {
    if (!p2pLobby) return;
    $("room-code-display").textContent = p2pLobby.code || "----";
    $("name-white").textContent = p2pLobby.names.white || "—";
    $("name-blue").textContent = p2pLobby.names.blue || t("waitingGuest");
    $("ready-white").textContent = p2pLobby.ready.white ? t("readyOn") : t("waiting");
    $("ready-white").classList.toggle("on", !!p2pLobby.ready.white);
    $("ready-blue").textContent = p2pLobby.guestJoined
      ? p2pLobby.ready.blue
        ? t("readyOn")
        : t("waiting")
      : "—";
    $("ready-blue").classList.toggle("on", !!p2pLobby.ready.blue);
    const btn = $("btn-ready");
    btn.disabled = !p2pLobby.guestJoined;
    const iAmReady = p2pLobby.ready[p2pLobby.you];
    btn.textContent = iAmReady ? t("readyOn") : t("ready");
    $("share-hint").textContent =
      p2pLobby.you === PLAYERS.white
        ? `${t("shareHintHost")} ${p2pLobby.code}`
        : t("shareHintGuest");
    const info = $("room-match-info");
    if (info) {
      const n = p2pLobby.matchTo || 1;
      const ms = p2pLobby.matchScore || { white: 0, blue: 0 };
      info.textContent =
        n > 1
          ? t("matchScore")
              .replace("{a}", String(ms.white || 0))
              .replace("{b}", String(ms.blue || 0))
              .replace("{n}", String(n))
          : t("matchLen1");
    }
  }

  function maybeStartP2PGame() {
    if (!p2pLobby || !p2pLobby.guestJoined) return;
    if (!p2pLobby.ready.white || !p2pLobby.ready.blue) return;
    if (p2pLobby.you !== PLAYERS.white) return; // host starts
    const starter = p2pLobby.nextStarter || PLAYERS.white;
    p2pLobby.nextStarter = opponent(starter);
    const state = createState({ starter });
    const matchTo = p2pLobby.matchTo || readMatchLen("p2p-match-len") || 1;
    const matchScore = p2pLobby.matchScore || { white: 0, blue: 0 };
    p2pLobby.matchTo = matchTo;
    p2p.send({
      type: "start",
      starter,
      state: serialize(state),
      names: p2pLobby.names,
      nextStarter: p2pLobby.nextStarter,
      matchTo,
      matchScore,
    });
    beginP2PGame(state, p2pLobby.names, { matchTo, matchScore });
  }

  async function beginP2PGame(state, names, matchMeta) {
    ensureMusic();
    clearUndo();
    const matchTo =
      (matchMeta && matchMeta.matchTo) ||
      (p2pLobby && p2pLobby.matchTo) ||
      1;
    const matchScore =
      (matchMeta && matchMeta.matchScore) ||
      (p2pLobby && p2pLobby.matchScore) ||
      { white: 0, blue: 0 };
    if (p2pLobby) {
      p2pLobby.matchTo = matchTo;
      p2pLobby.matchScore = matchScore;
    }
    session = {
      mode: "p2p",
      status: "playing",
      you: p2pLobby.you,
      names: names || p2pLobby.names,
      state,
      matchTo,
      matchScore: { white: matchScore.white || 0, blue: matchScore.blue || 0 },
      transport:
        window.ArenaP2P && window.ArenaP2P.getTransport
          ? window.ArenaP2P.getTransport()
          : null,
      scoreRecorded: false,
      endSfxPlayed: false,
      matchPointCredited: false,
    };
    selected = null;
    selectedDie = null;
    showScreen("game");
    hideStartPanel();
    if ($("end-panel")) $("end-panel").classList.add("hidden");
    renderGame();
    persistSession();
    await showStartBanner(state.turn, session.names);
  }

  function createP2PSession() {
    if (window.ArenaP2P) {
      return ArenaP2P.createSession({
        prefix: "tavla",
        transport: ArenaP2P.getTransport(),
      });
    }
    if (P2P && P2P.P2PSession) return new P2P.P2PSession();
    throw new Error("no p2p");
  }

  function bindP2PHandlers(sessionP2P) {
    sessionP2P.on("connected", () => {
      toast(t("connected"));
      if (sessionP2P.isHost) {
        p2pLobby.guestJoined = true;
        p2p.send({
          type: "hello",
          name: p2pLobby.names.white,
          role: "host",
        });
        renderRoom();
      } else {
        p2p.send({
          type: "hello",
          name: ($("p2p-name").value || "").trim() || t("you"),
          role: "guest",
        });
      }
    });
    sessionP2P.on("disconnected", () => {
      toast(t("disconnect"));
    });
    sessionP2P.on("error", (msg) => {
      toast(typeof msg === "string" ? msg : t("peerFail"));
    });
    sessionP2P.on("message", (data) => {
      if (!data || !data.type) return;
      if (data.type === "hello") {
        if (p2pLobby.you === PLAYERS.white && data.role === "guest") {
          p2pLobby.names.blue = data.name || t("blue");
          p2pLobby.guestJoined = true;
          p2pLobby.ready.blue = false;
          p2p.send({
            type: "lobby",
            names: p2pLobby.names,
            ready: p2pLobby.ready,
            guestJoined: true,
          });
          renderRoom();
        } else if (p2pLobby.you === PLAYERS.blue && data.role === "host") {
          p2pLobby.names.white = data.name || t("white");
          p2pLobby.guestJoined = true;
          renderRoom();
        }
      } else if (data.type === "lobby") {
        p2pLobby.names = data.names || p2pLobby.names;
        p2pLobby.ready = data.ready || p2pLobby.ready;
        p2pLobby.guestJoined = !!data.guestJoined;
        renderRoom();
      } else if (data.type === "ready") {
        p2pLobby.ready[data.who] = !!data.value;
        renderRoom();
        maybeStartP2PGame();
      } else if (data.type === "start") {
        p2pLobby.names = data.names || p2pLobby.names;
        p2pLobby.nextStarter = data.nextStarter;
        if (data.matchTo) p2pLobby.matchTo = data.matchTo;
        if (data.matchScore) p2pLobby.matchScore = data.matchScore;
        const st = data.state
          ? deserialize(data.state)
          : createState({ starter: data.starter });
        beginP2PGame(st, p2pLobby.names, {
          matchTo: data.matchTo || p2pLobby.matchTo || 1,
          matchScore: data.matchScore || p2pLobby.matchScore,
        });
      } else if (data.type === "sync") {
        if (!session || session.mode !== "p2p") return;
        // Animasyonlu roll/move varken snap’i yutmuyoruz — kuyruk boşsa uygula
        if (diceBusy || moveBusy || netPumping || netQueue.length) return;
        try {
          session.state = deserialize(data.state);
          selected = null;
          selectedDie = null;
          if (data.matchScore) session.matchScore = data.matchScore;
          renderGame();
          persistSession();
        } catch (_) {}
      } else if (data.type === "roll") {
        if (!session || session.mode !== "p2p") return;
        enqueueNet(
          () =>
            new Promise((resolve) => {
              doRoll({ fromNet: true, roll: data.roll });
              const wait = () => {
                if (!diceBusy) resolve();
                else setTimeout(wait, 60);
              };
              setTimeout(wait, 40);
            })
        );
      } else if (data.type === "move") {
        if (!session || session.mode !== "p2p") return;
        if (data.move) {
          enqueueNet(() => doMove(data.move, { fromNet: true }));
        } else if (data.state) {
          enqueueNet(async () => {
            try {
              session.state = deserialize(data.state);
              selected = null;
              selectedDie = null;
              renderGame();
            } catch (_) {}
          });
        }
      } else if (data.type === "history-ask") {
        if (!session || session.mode !== "p2p") return;
        if (data.who === session.you) return;
        showUndoAsk(data.kind === "redo" ? "redo" : "undo");
      } else if (data.type === "history-reply") {
        if (!session || session.mode !== "p2p") return;
        const kind = pendingHistoryKind;
        pendingHistoryKind = null;
        updateUndoBtn();
        if (!data.ok) {
          toast(t("undoDenied"));
          return;
        }
        const ok = kind === "redo" ? applyLocalRedo() : applyLocalUndo();
        if (ok && p2p) {
          p2p.send({
            type: "history-apply",
            kind: kind || "undo",
            state: serialize(session.state),
            matchScore: session.matchScore,
          });
        }
      } else if (data.type === "history-apply") {
        if (!session || session.mode !== "p2p") return;
        if (data.state) {
          try {
            session.state = deserialize(data.state);
            if (data.matchScore) session.matchScore = data.matchScore;
            selected = null;
            selectedDie = null;
            // Yerel geçmişi sıfırla — otorite peer’dan gelen durum
            clearUndo();
            renderGame();
            persistSession();
            toast(data.kind === "redo" ? t("redoDone") : t("undoDone"));
          } catch (_) {}
        }
      } else if (data.type === "rematch-ask") {
        p2pLobby.ready = { white: false, blue: false };
        p2pLobby.ready[data.who] = true;
        if (data.matchScore) p2pLobby.matchScore = data.matchScore;
        if (data.matchTo) p2pLobby.matchTo = data.matchTo;
        session = null;
        showScreen("room");
        renderRoom();
      }
    });
  }

  async function hostP2P() {
    destroyP2P();
    const name = ($("p2p-name").value || "").trim() || t("you");
    saveSettings({ name });
    toast(t("connecting"));
    try {
      p2p = createP2PSession();
      bindP2PHandlers(p2p);
      const code = await p2p.host();
      const matchTo = readMatchLen("p2p-match-len");
      saveSettings({ matchTo });
      p2pLobby = {
        code,
        you: PLAYERS.white,
        names: { white: name, blue: null },
        ready: { white: false, blue: false },
        guestJoined: false,
        nextStarter: PLAYERS.white,
        matchTo,
        matchScore: { white: 0, blue: 0 },
      };
      showScreen("room");
      renderRoom();
    } catch (err) {
      toast((window.ArenaP2P && ArenaP2P.mapError) ? ArenaP2P.mapError(err, t) : t("peerFail"));
      destroyP2P();
    }
  }

  async function joinP2P() {
    const code = ($("p2p-code").value || "").trim().toUpperCase();
    if (!code) {
      toast(t("needCode"));
      return;
    }
    destroyP2P();
    const name = ($("p2p-name").value || "").trim() || t("you");
    saveSettings({ name });
    toast(t("connecting"));
    try {
      p2p = createP2PSession();
      bindP2PHandlers(p2p);
      await p2p.join(code);
      p2pLobby = {
        code,
        you: PLAYERS.blue,
        names: { white: "—", blue: name },
        ready: { white: false, blue: false },
        guestJoined: false,
        nextStarter: PLAYERS.white,
        matchTo: readMatchLen("p2p-match-len") || 1,
        matchScore: { white: 0, blue: 0 },
      };
      showScreen("room");
      renderRoom();
    } catch (err) {
      toast((window.ArenaP2P && ArenaP2P.mapError) ? ArenaP2P.mapError(err, t) : t("peerFail"));
      destroyP2P();
    }
  }

  function fillSettingsForm() {
    document.querySelectorAll('input[name="lang"]').forEach((r) => {
      r.checked = r.value === lang();
    });
    const diff = settings.aiDifficulty || "normal";
    document.querySelectorAll('input[name="defDiff"]').forEach((r) => {
      r.checked = r.value === diff;
    });
    syncAudioSwitch("music", settings.music !== false);
    syncAudioSwitch("sfx", settings.sfx !== false);
    if ($("p1-name")) $("p1-name").value = settings.p1 || "";
    if ($("p2-name")) $("p2-name").value = settings.p2 || "";
    if ($("p2p-name")) $("p2p-name").value = settings.name || "";
    if ($("settings-display-name") && window.ArenaScore) {
      const store = window.ArenaScore.load();
      $("settings-display-name").value =
        store.displayName || settings.name || "";
    }
  }

  function leaveGameToHome() {
    clearTimeout(aiTimer);
    if (session && session.state && !session.state.winner) persistSession();
    selected = null;
    selectedDie = null;
    session = null;
    clearUndo();
    startResolve = null;
    hideStartPanel();
    hideUndoAsk();
    destroyP2P();
    releaseWakeLock();
    showScreen("home");
  }

  function goHome(opts) {
    const skipConfirm = !!(opts && opts.skipConfirm);
    const inMatch = !!(session && session.state && !session.state.winner);
    if (inMatch && !skipConfirm) {
      if (!window.confirm(t("confirmLeave"))) return;
    }
    leaveGameToHome();
  }

  function doRematch() {
    if (!session) return;
    const matchTo = session.matchTo || 1;
    const ms = session.matchScore || { white: 0, blue: 0 };
    const matchOver = matchTo > 1 && (ms.white >= matchTo || ms.blue >= matchTo);
    if (session.mode === "solo") {
      if (!matchOver && matchTo > 1) startSolo({ continueMatch: true });
      else startSolo();
      return;
    }
    if (session.mode === "twop") {
      if (!matchOver && matchTo > 1) startTwoP({ continueMatch: true });
      else startTwoP();
      return;
    }
    if (session.mode === "p2p" && p2p && p2pLobby) {
      if (matchOver) {
        p2pLobby.matchScore = { white: 0, blue: 0 };
      } else {
        p2pLobby.matchScore = { ...ms };
      }
      p2pLobby.matchTo = matchTo;
      p2pLobby.ready = { white: false, blue: false };
      p2p.send({
        type: "rematch-ask",
        who: p2pLobby.you,
        matchTo,
        matchScore: p2pLobby.matchScore,
      });
      session = null;
      clearUndo();
      showScreen("room");
      renderRoom();
    }
  }

  // —— Events ——
  $("btn-home-play").addEventListener("click", () => showScreen("play"));
  if ($("btn-home-scores")) {
    $("btn-home-scores").addEventListener("click", () => {
      renderScores();
      showScreen("scores");
    });
  }
  $("btn-home-settings").addEventListener("click", () => {
    fillSettingsForm();
    showScreen("settings");
  });
  $("btn-home-help").addEventListener("click", () => {
    applyI18n();
    showScreen("help");
  });

  $("btn-play-back").addEventListener("click", () => showScreen("home"));
  if ($("btn-scores-back")) {
    $("btn-scores-back").addEventListener("click", () => showScreen("home"));
  }
  $("btn-solo-setup-back").addEventListener("click", () => showScreen("play"));
  $("btn-2p-setup-back").addEventListener("click", () => showScreen("play"));
  $("btn-p2p-back").addEventListener("click", () => showScreen("play"));
  $("btn-settings-back").addEventListener("click", () => showScreen("home"));
  $("btn-help-back").addEventListener("click", () => showScreen("home"));
  $("btn-updates-back").addEventListener("click", () => showScreen("settings"));
  if ($("btn-open-updates")) {
    $("btn-open-updates").addEventListener("click", () => {
      applyI18n();
      showScreen("updates");
    });
  }

  $("btn-mode-solo").addEventListener("click", () => {
    setupDiff = settings.aiDifficulty || "normal";
    renderDiffGrid();
    showScreen("soloSetup");
  });
  $("btn-mode-2p").addEventListener("click", () => {
    fillSettingsForm();
    showScreen("twoPSetup");
  });
  $("btn-mode-p2p").addEventListener("click", () => {
    fillSettingsForm();
    showScreen("p2p");
  });

  $("btn-solo-start").addEventListener("click", () => {
    saveSettings({ aiDifficulty: setupDiff });
    startSolo();
  });
  $("btn-2p-start").addEventListener("click", () => startTwoP());
  $("btn-p2p-create").addEventListener("click", () => hostP2P());
  $("btn-p2p-join").addEventListener("click", () => joinP2P());
  $("p2p-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-p2p-join").click();
  });

  $("btn-ready").addEventListener("click", () => {
    if (!p2pLobby || !p2p) return;
    const who = p2pLobby.you;
    p2pLobby.ready[who] = !p2pLobby.ready[who];
    p2p.send({ type: "ready", who, value: p2pLobby.ready[who] });
    p2p.send({
      type: "lobby",
      names: p2pLobby.names,
      ready: p2pLobby.ready,
      guestJoined: p2pLobby.guestJoined,
    });
    renderRoom();
    maybeStartP2PGame();
  });

  $("btn-copy-code").addEventListener("click", async () => {
    if (!p2pLobby) return;
    try {
      await navigator.clipboard.writeText(p2pLobby.code);
      toast(t("codeCopied"));
    } catch (_) {
      toast(p2pLobby.code);
    }
  });

  $("btn-room-home").addEventListener("click", () => goHome());

  $("btn-settings-save").addEventListener("click", () => {
    const selectedLang =
      (document.querySelector('input[name="lang"]:checked') || {}).value || "tr";
    const selectedDiff =
      (document.querySelector('input[name="defDiff"]:checked') || {}).value ||
      "normal";
    const displayName =
      ($("settings-display-name") && $("settings-display-name").value) || "";
    const musicOn = $("set-music") ? !!$("set-music").checked : true;
    const sfxOn = $("set-sfx") ? !!$("set-sfx").checked : true;
    saveSettings({
      lang: selectedLang,
      aiDifficulty: ["easy", "normal", "hard", "veryhard"].includes(selectedDiff)
        ? selectedDiff
        : "normal",
      name: displayName.trim() || settings.name,
      music: musicOn,
      sfx: sfxOn,
    });
    if (window.ArenaScore) window.ArenaScore.setDisplayName(displayName);
    if (Audio) {
      Audio.unlock();
      Audio.setMusic(musicOn);
      applySfxPref(sfxOn);
      if (musicOn) Audio.startMusic();
    } else {
      applySfxPref(sfxOn);
    }
    syncAudioSwitch("music", musicOn);
    syncAudioSwitch("sfx", sfxOn);
    setupDiff = settings.aiDifficulty;
    applyI18n();
    toast(t("saved"));
  });

  if ($("btn-music-toggle")) {
    $("btn-music-toggle").addEventListener("click", async () => {
      const on = !($("set-music") && $("set-music").checked);
      syncAudioSwitch("music", on);
      saveSettings({ music: on });
      if (Audio) {
        await Audio.unlock();
        Audio.setMusic(on);
        if (on) Audio.startMusic();
      }
    });
  }
  if ($("btn-sfx-toggle")) {
    $("btn-sfx-toggle").addEventListener("click", async () => {
      const on = !($("set-sfx") && $("set-sfx").checked);
      syncAudioSwitch("sfx", on);
      saveSettings({ sfx: on });
      if (Audio) await Audio.unlock();
      else if (Sfx) await Sfx.unlock();
      applySfxPref(on);
      if (on && Audio) Audio.playSfx("select");
      else if (on && Sfx) Sfx.play("select");
    });
  }

  $("btn-updates-seen").addEventListener("click", () => {
    try {
      localStorage.setItem(SEEN_VER_KEY, CFG.version);
    } catch (_) {}
    updateUpdatesDot();
    toast(t("saved"));
    showScreen("settings");
  });

  $("btn-game-back").addEventListener("click", () => {
    if (session && session.mode === "p2p" && p2pLobby) {
      const inMatch = !!(session.state && !session.state.winner);
      if (inMatch && !window.confirm(t("confirmLeave"))) return;
      session = null;
      clearUndo();
      showScreen("room");
      renderRoom();
      return;
    }
    goHome();
  });

  $("btn-game-home").addEventListener("click", () => goHome({ skipConfirm: true }));

  if ($("btn-game-undo")) {
    $("btn-game-undo").addEventListener("click", () => doUndo());
  }
  if ($("btn-game-redo")) {
    $("btn-game-redo").addEventListener("click", () => doRedo());
  }

  if ($("btn-undo-allow")) {
    $("btn-undo-allow").addEventListener("click", () => {
      const kind = ($("undo-ask-panel") && $("undo-ask-panel").dataset.kind) || "undo";
      hideUndoAsk();
      if (p2p) p2p.send({ type: "history-reply", ok: true, kind });
    });
  }
  if ($("btn-undo-deny")) {
    $("btn-undo-deny").addEventListener("click", () => {
      const kind = ($("undo-ask-panel") && $("undo-ask-panel").dataset.kind) || "undo";
      hideUndoAsk();
      if (p2p) p2p.send({ type: "history-reply", ok: false, kind });
    });
  }

  if ($("btn-start-ok")) {
    $("btn-start-ok").addEventListener("click", () => dismissStartBanner());
  }
  $("btn-rematch").addEventListener("click", () => doRematch());

  $("btn-roll").addEventListener("click", () => doRoll());
  if ($("bar-zone")) $("bar-zone").addEventListener("click", () => onBarClick());
  if ($("off-white"))
    $("off-white").addEventListener("click", () => onOffClick(PLAYERS.white));
  if ($("off-blue"))
    $("off-blue").addEventListener("click", () => onOffClick(PLAYERS.blue));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session && screens.game && screens.game.classList.contains("active")) {
      acquireWakeLock();
    }
  });

  // Boot
  if (Audio) {
    Audio.applyPrefs({
      music: settings.music !== false,
      sfx: settings.sfx !== false,
    });
    const unlockOnce = () => {
      Audio.unlock();
      document.removeEventListener("pointerdown", unlockOnce, true);
      document.removeEventListener("keydown", unlockOnce, true);
    };
    document.addEventListener("pointerdown", unlockOnce, true);
    document.addEventListener("keydown", unlockOnce, true);
  }
  if (Sfx && Sfx.bindFirstGesture) Sfx.bindFirstGesture(document);
  if (window.ArenaHubBack) {
    hubBackCtl = window.ArenaHubBack.bind({ getLang: lang });
  }
  applyI18n();
  if (window.ArenaP2P && ArenaP2P.initTransportUi) ArenaP2P.initTransportUi();
  fillSettingsForm();
  buildBoard(PLAYERS.white);
  if (window.ArenaSW) window.ArenaSW.register("./sw.js");
})();
