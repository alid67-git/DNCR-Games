(() => {
  const E = window.ToprakEngine;
  const CFG = window.KatiConfig;
  const I18N = window.KatiI18n;
  if (!E || !CFG || !I18N) {
    console.error("Kati: missing modules");
    return;
  }

  const {
    POSITIONS,
    BOARD_EDGES: EDGES,
    PLAYERS,
    createGameState,
    tryMove,
    getAllLegalMoves,
    chooseMove,
    opponent,
  } = E;

  const SETTINGS_KEY = "kati_arena_settings";
  const STARTER_KEY = "kati_arena_next_starter";
  const SEEN_VER_KEY = "kati_arena_seen_version";

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("screen-home"),
    play: $("screen-play"),
    twoPSetup: $("screen-2p-setup"),
    online: $("screen-online"),
    settings: $("screen-settings"),
    help: $("screen-help"),
    scores: $("screen-scores"),
    updates: $("screen-updates"),
    room: $("screen-room"),
    game: $("screen-game"),
  };

  function detectNative() {
    try {
      if (window.Capacitor && typeof Capacitor.isNativePlatform === "function") {
        return !!Capacitor.isNativePlatform();
      }
    } catch (_) {}
    return location.protocol === "capacitor:" || location.protocol === "file:";
  }
  let isNative = detectNative();

  let settings = loadSettings();
  let socket = null;
  let p2pSession = null;
  let state = null;
  let selected = null;
  let lanIps = [];
  let port = 3847;
  let localMode = false;
  let aiTimer = null;
  let animating = false;
  let lastSeenMoveCount = -1;
  let prevGuestJoined = false;
  let moveFlashTimer = null;
  const Sfx = window.DncrMoveSfx || null;

  function playMoveSfx(kind) {
    if (!Sfx) return;
    Sfx.unlock();
    Sfx.play(kind || "move");
  }
  let hubBackCtl = null;
  const Hist = (window.DncrHistory && window.DncrHistory.create({ max: 40 })) || null;

  function snap() {
    return JSON.stringify(state && state.game);
  }

  function pushHist() {
    if (!Hist || !state || !state.local || !state.game) return;
    try {
      Hist.push(snap());
    } catch (_) {}
    updateHistBtns();
  }

  function clearHist() {
    if (Hist) Hist.clear();
    updateHistBtns();
  }

  function historyIdle() {
    return (
      !!state &&
      !!state.local &&
      !animating &&
      !(state.game && state.game.winner)
    );
  }

  function updateHistBtns() {
    const u = $("btn-game-undo");
    const r = $("btn-game-redo");
    const idle = historyIdle();
    if (u) u.disabled = !(idle && Hist && Hist.canUndo());
    if (r) r.disabled = !(idle && Hist && Hist.canRedo());
  }

  function restoreGameSnap(raw) {
    const game = JSON.parse(raw);
    clearTimeout(aiTimer);
    selected = null;
    animating = false;
    const hotseat = !!(state && state.hotseat);
    const names = state && state.names;
    state = makeLocalState(game, { hotseat, names });
    lastSeenMoveCount = game.moveCount || 0;
    renderGame(state);
    updateHistBtns();
    if (
      state &&
      state.local &&
      !state.hotseat &&
      !state.game.winner &&
      state.game.turn === PLAYERS.gourd
    ) {
      scheduleLocalAi(420);
    }
  }

  function doUndo() {
    if (!historyIdle() || !Hist || !Hist.canUndo()) return;
    const prev = Hist.undo(snap());
    if (prev == null) return;
    try {
      restoreGameSnap(prev);
      toast(t("undoDone"));
    } catch (_) {
      updateHistBtns();
    }
  }

  function doRedo() {
    if (!historyIdle() || !Hist || !Hist.canRedo()) return;
    const next = Hist.redo(snap());
    if (next == null) return;
    try {
      restoreGameSnap(next);
      toast(t("redoDone"));
    } catch (_) {
      updateHistBtns();
    }
  }

  function useLegacySocket() {
    return !!(settings.serverUrl && String(settings.serverUrl).trim());
  }

  function loadSettings() {
    const defaults = {
      lang: "tr",
      name: "",
      serverUrl: "",
      notifications: true,
      aiDifficulty: "normal",
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

  function teamLabel(player) {
    return player === PLAYERS.tomato ? t("red") : t("green");
  }

  function showScreen(name) {
    Object.values(screens).forEach((el) => el && el.classList.remove("active"));
    if (screens[name]) screens[name].classList.add("active");
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
  }

  function playerName() {
    const n =
      ($("player-name") && $("player-name").value) ||
      settings.name ||
      "";
    return n.trim() || (lang() === "en" ? "Player" : "Oyuncu");
  }

  function serverBase() {
    const raw = (settings.serverUrl || "").trim().replace(/\/$/, "");
    if (raw) return raw;
    if (isNative) return "";
    return location.origin;
  }

  function inviteUrl(code) {
    // Always share the public web URL so APK hosts can invite Safari users.
    const configured = (CFG.shareBaseUrl || "").trim().replace(/\/$/, "");
    let base = configured;
    if (!base && (location.protocol === "http:" || location.protocol === "https:")) {
      base = location.href.split("?")[0].split("#")[0].replace(/\/index\.html$/i, "");
      base = base.replace(/\/$/, "");
    }
    if (!base) base = "https://alid67-git.github.io/DNCR-Games";
    try {
      const u = new URL(base.endsWith("/") ? base : base + "/");
      u.searchParams.set("join", code);
      return u.toString();
    } catch (_) {
      return `${base}?join=${encodeURIComponent(code)}`;
    }
  }

  function mapP2pError(err) {
    if (window.ArenaP2P && ArenaP2P.mapError) {
      const mapped = ArenaP2P.mapError(err, (k) => {
        if (k === "nearbyTimeout") return t("nearbyTimeout") || t("p2pTimeout");
        if (k === "nearbyPerm") return t("nearbyPerm") || t("p2pFail");
        if (k === "nearbyFail") return t("nearbyFail") || t("p2pFail");
        if (k === "needCode") return t("needCode");
        if (k === "peerFail") return t("p2pFail");
        return t(k) || t("p2pFail");
      });
      if (mapped) return mapped;
    }
    const msg = (err && err.message) || String(err || "");
    if (msg === "timeout" || msg === "join_fail") return t("p2pTimeout");
    if (msg === "nearby_permission_denied") return t("nearbyPerm") || t("p2pFail");
    if (msg === "room_full") return t("roomFull");
    if (msg === "need_code") return t("needCode");
    return t("p2pFail");
  }

  function endP2p() {
    if (p2pSession) {
      try {
        p2pSession.leave();
      } catch (_) {
        try {
          p2pSession.destroy();
        } catch (_) {}
      }
      p2pSession = null;
    }
  }

  function startP2pHandlers() {
    return {
      onState: (st) => {
        localMode = false;
        applyState(st);
      },
      onError: (msg) => {
        if (msg === "room_full") toast(t("roomFull"));
        else if (msg && typeof msg === "string" && msg.length < 80 && !/^[a-z_]+$/.test(msg))
          toast(msg);
        else toast(mapP2pError(msg));
      },
      onClosed: () => {
        toast(t("toHome"));
        p2pSession = null;
        state = null;
        showScreen("home");
      },
    };
  }

  async function p2pCreateRoom() {
    if (!window.KatiP2P) {
      toast(t("p2pFail"));
      return;
    }
    endP2p();
    toast(t("connecting"));
    const session = window.KatiP2P.createSession(startP2pHandlers());
    p2pSession = session;
    try {
      await session.host(playerName());
    } catch (err) {
      endP2p();
      toast(mapP2pError(err));
    }
  }

  async function p2pJoinRoom(code) {
    if (!window.KatiP2P) {
      toast(t("p2pFail"));
      return;
    }
    endP2p();
    toast(t("connecting"));
    const session = window.KatiP2P.createSession(startP2pHandlers());
    p2pSession = session;
    try {
      await session.join(code, playerName());
    } catch (err) {
      endP2p();
      toast(mapP2pError(err));
    }
  }

  // —— i18n DOM ——
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
    if ($("updates-current")) $("updates-current").textContent = `${CFG.version} (${CFG.build})`;
    if ($("settings-updates-current"))
      $("settings-updates-current").textContent = `${CFG.version} (${CFG.build})`;
    renderChangelog();
    updateUpdatesDot();
    if (hubBackCtl && hubBackCtl.refresh) hubBackCtl.refresh();
  }

  function renderScores() {
    if (!window.ArenaScore || !$("scores-panel")) return;
    window.ArenaScore.renderInto($("scores-panel"), { lang: lang(), gameId: "kati" });
  }

  function maybeRecordKatiScore(s, g) {
    if (!s || !g || !g.winner || s.scoreRecorded || !window.ArenaScore) return;
    s.scoreRecorded = true;
    let result = "loss";
    if (s.you === g.winner) result = "win";
    const cap = g.capturedBy || {};
    const captures =
      s.you === PLAYERS.tomato ? cap.tomato || 0 : cap.gourd || 0;
    window.ArenaScore.record({
      gameId: "kati",
      result,
      difficulty: s.vsAi ? settings.aiDifficulty || "normal" : "hard",
      mode: s.vsAi ? "solo" : s.hotseat ? "twop" : "p2p",
      stats: { captures },
    });
  }

  function renderChangelog() {
    const list = $("changelog-list");
    if (!list) return;
    list.innerHTML = "";
    const L = lang();
    CFG.changelog.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "upgrade-card changelog-card";
      const items = (entry.items && entry.items[L]) || entry.items.tr || [];
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

  // —— Update check (GitHub Releases) ——
  let pendingUpdate = null;

  function openExternal(url) {
    if (!url) return;
    try {
      if (isNative && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
        window.Capacitor.Plugins.Browser.open({ url });
        return;
      }
    } catch (_) {}
    window.open(url, "_blank", "noopener");
  }

  function showUpdateModal(info) {
    pendingUpdate = info;
    const modal = $("update-modal");
    if (!modal) return;
    const body = $("update-modal-body");
    if (body) body.textContent = t("updateAvailableBody").replace("{version}", info.version);
    modal.classList.remove("hidden");
  }

  function hideUpdateModal() {
    pendingUpdate = null;
    const modal = $("update-modal");
    if (modal) modal.classList.add("hidden");
  }

  function applyPendingUpdate() {
    if (!pendingUpdate) return;
    const info = pendingUpdate;
    hideUpdateModal();
    if (!isNative) {
      toast(t("updateWebNote"));
      openExternal(info.htmlUrl);
      return;
    }
    if (!info.apkUrl) {
      toast(t("updateNoApk"));
      openExternal(info.htmlUrl);
      return;
    }
    toast(t("updateOpeningDownload"));
    openExternal(info.apkUrl);
  }

  async function checkForUpdate({ force = false, silent = true } = {}) {
    if (!window.KatiUpdateCheck) return;
    if (!silent) toast(t("updatesChecking"));
    const result = await window.KatiUpdateCheck.run({
      currentVersion: CFG.version,
      force,
    });
    if (result.status === "available") {
      showUpdateModal(result);
    } else if (!silent && result.status === "up-to-date") {
      toast(t("updatesUpToDate"));
    } else if (!silent && result.status === "error") {
      toast(t("updatesCheckFailed"));
    }
  }

  // —— Notifications ——
  async function ensureNotifPermission() {
    if (!settings.notifications) return false;
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
      const p = await Notification.requestPermission();
      return p === "granted";
    } catch (_) {
      return false;
    }
  }

  function notify(title, body) {
    if (!settings.notifications) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title || t("appName"), {
        body: body || "",
        silent: false,
      });
    } catch (_) {}
  }

  // —— Board ——
  function initBoardSvg() {
    const lines = $("board-lines");
    if (!lines || lines.childElementCount) return;

    for (const [a, b] of EDGES) {
      const pa = POSITIONS[a];
      const pb = POSITIONS[b];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pa.x);
      line.setAttribute("y1", pa.y);
      line.setAttribute("x2", pb.x);
      line.setAttribute("y2", pb.y);
      lines.appendChild(line);
    }

    $("left-arc").setAttribute(
      "d",
      `M ${POSITIONS.TC.x} ${POSITIONS.TC.y}
       Q ${POSITIONS.FL.x - 6} ${POSITIONS.TC.y}, ${POSITIONS.FL.x} ${POSITIONS.FL.y}
       Q ${POSITIONS.FL.x - 6} ${POSITIONS.BC.y}, ${POSITIONS.BC.x} ${POSITIONS.BC.y}`
    );
    $("right-arc").setAttribute(
      "d",
      `M ${POSITIONS.TC.x} ${POSITIONS.TC.y}
       Q ${POSITIONS.FR.x + 6} ${POSITIONS.TC.y}, ${POSITIONS.FR.x} ${POSITIONS.FR.y}
       Q ${POSITIONS.FR.x + 6} ${POSITIONS.BC.y}, ${POSITIONS.BC.x} ${POSITIONS.BC.y}`
    );

    const nodes = $("board-nodes");
    for (const [id, p] of Object.entries(POSITIONS)) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", p.x);
      ring.setAttribute("cy", p.y);
      ring.setAttribute("r", 2.4);
      ring.setAttribute("class", "node-ring");
      ring.dataset.node = id;
      nodes.appendChild(ring);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("cx", p.x);
      hit.setAttribute("cy", p.y);
      hit.setAttribute("r", 5.5);
      hit.setAttribute("class", "node-hit");
      hit.dataset.node = id;
      hit.addEventListener("click", () => onNodeClick(id));
      nodes.appendChild(hit);
    }
  }

  function makePieceGroup(owner, x, y, selectedNode) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "class",
      `piece ${owner}-piece${selectedNode ? " selected" : ""}`
    );
    const skin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    skin.setAttribute("class", "skin");
    skin.setAttribute("cx", x);
    skin.setAttribute("cy", y);
    skin.setAttribute("r", 4.2);
    skin.setAttribute("fill", owner === "tomato" ? "url(#tomatoFill)" : "url(#gourdFill)");
    const gloss = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    gloss.setAttribute("cx", x - 1.2);
    gloss.setAttribute("cy", y - 1.4);
    gloss.setAttribute("r", 1.2);
    gloss.setAttribute("fill", "rgba(255,255,255,0.35)");
    gloss.setAttribute("pointer-events", "none");
    group.appendChild(skin);
    group.appendChild(gloss);
    return group;
  }

  function renderPieces(board, lastMove, hideNodes) {
    const g = $("board-pieces");
    g.innerHTML = "";
    const hide = hideNodes || new Set();
    for (const [id, owner] of Object.entries(board || {})) {
      if (!owner || hide.has(id)) continue;
      const p = POSITIONS[id];
      const group = makePieceGroup(owner, p.x, p.y, selected === id);
      group.dataset.node = id;
      group.addEventListener("click", (e) => {
        e.stopPropagation();
        onNodeClick(id);
      });
      g.appendChild(group);
    }
    document.querySelectorAll(".node-ring").forEach((el) => {
      el.classList.remove("last-move-from", "last-move-to");
      if (lastMove) {
        if (el.dataset.node === lastMove.from) el.classList.add("last-move-from");
        if (el.dataset.node === lastMove.to) el.classList.add("last-move-to");
      }
    });
  }

  function clearHints() {
    $("board-hints").innerHTML = "";
  }

  function showHints(targets, captures) {
    clearHints();
    const g = $("board-hints");
    for (const to of targets) {
      const p = POSITIONS[to];
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", 2.4);
      c.setAttribute("class", captures.has(to) ? "hint-dot hint-capture" : "hint-dot");
      g.appendChild(c);
    }
  }

  function legalMoves(board, player, chainFrom) {
    return getAllLegalMoves(board, player, chainFrom);
  }

  function anyCapture(board, player) {
    return getAllLegalMoves(board, player).some((m) => m.capture);
  }

  function renderTrays(capturedBy) {
    const tCount = (capturedBy && capturedBy.tomato) || 0;
    const gCount = (capturedBy && capturedBy.gourd) || 0;
    const tEl = $("tray-tomato");
    const gEl = $("tray-gourd");
    if (!tEl || !gEl) return;
    tEl.innerHTML = "";
    gEl.innerHTML = "";
    for (let i = 0; i < tCount; i++) {
      const d = document.createElement("span");
      d.className = "tray-dot";
      d.style.background = "radial-gradient(circle at 35% 30%, #a5d6a7, #2e7d32)";
      tEl.appendChild(d);
    }
    for (let i = 0; i < gCount; i++) {
      const d = document.createElement("span");
      d.className = "tray-dot";
      d.style.background = "radial-gradient(circle at 35% 30%, #ff8a80, #c62828)";
      gEl.appendChild(d);
    }
  }

  function showEatBanner(attacker) {
    const el = $("eat-banner");
    if (!el) return;
    const victim = opponent(attacker);
    el.textContent = `${teamLabel(attacker)} → ${teamLabel(victim)} ${t("ate")}`;
    el.className = `eat-banner ${attacker}-eat`;
    clearTimeout(showEatBanner._t);
    showEatBanner._t = setTimeout(() => el.classList.add("hidden"), 900);
  }

  /** Hamle sonrası 1 sn parlama + renk + %50 büyüme (kalkış/iniş halkası + taş). */
  function flashMoveEmphasis(move, attacker) {
    clearTimeout(moveFlashTimer);
    document.querySelectorAll(".node-ring.move-flash, .piece.move-flash").forEach((el) => {
      el.classList.remove("move-flash", "move-flash-from", "move-flash-to");
    });
    if (!move) return;
    document.querySelectorAll(".node-ring").forEach((el) => {
      if (el.dataset.node === move.from) {
        el.classList.add("move-flash", "move-flash-from");
      }
      if (el.dataset.node === move.to) {
        el.classList.add("move-flash", "move-flash-to");
      }
    });
    const piece = document.querySelector(`.piece[data-node="${move.to}"]`);
    if (piece) {
      piece.classList.add("move-flash", "move-flash-to");
      if (attacker) piece.classList.add(`move-flash-${attacker}`);
    }
    moveFlashTimer = setTimeout(() => {
      document.querySelectorAll(".move-flash").forEach((el) => {
        el.classList.remove("move-flash", "move-flash-from", "move-flash-to", "move-flash-tomato", "move-flash-gourd");
      });
      moveFlashTimer = null;
    }, 1000);
  }

  async function animateMove(prevBoard, move, attacker) {
    const fx = $("board-fx");
    if (!fx || !move) return;
    animating = true;
    fx.innerHTML = "";
    const from = POSITIONS[move.from];
    const to = POSITIONS[move.to];
    if (!from || !to) {
      animating = false;
      return;
    }
    const hide = new Set([move.from]);
    if (move.capture && move.over) hide.add(move.over);
    renderPieces(prevBoard, null, hide);

    let vic = null;
    let vp = null;
    if (move.capture && move.over) {
      vp = POSITIONS[move.over];
      const victim = opponent(attacker);
      vic = makePieceGroup(victim, vp.x, vp.y, false);
      vic.setAttribute("class", `fx-victim ${victim}-piece`);
      fx.appendChild(vic);
      showEatBanner(attacker);
      playMoveSfx("capture");
    } else {
      playMoveSfx("move");
    }

    const flyer = makePieceGroup(attacker, from.x, from.y, false);
    flyer.setAttribute("class", `fx-flyer ${attacker}-piece move-flying`);
    flyer.setAttribute("transform", "translate(0 0)");
    fx.appendChild(flyer);

    // Normal hamle de vurgu süresiyle hizalı (~1 sn); uçuşta da %50 peake yaklaş
    const duration = move.capture ? 1060 : 1000;
    const start = performance.now();
    await new Promise((resolve) => {
      function frame(now) {
        const tt = Math.min(1, (now - start) / duration);
        const ease = tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2;
        const x = from.x + (to.x - from.x) * ease;
        const y = from.y + (to.y - from.y) * ease;
        const lift = (move.capture ? 5 : 2.4) * Math.sin(Math.PI * ease);
        const pulse = 1 + 0.5 * Math.sin(Math.PI * ease);
        flyer.setAttribute(
          "transform",
          `translate(${x - from.x} ${y - from.y - lift}) scale(${pulse})`
        );
        if (vic && vp && tt >= 0.42) {
          const vt = Math.min(1, (tt - 0.42) / 0.55);
          const s = Math.max(0.05, 1.15 * (1 - vt));
          vic.setAttribute(
            "transform",
            `translate(${vp.x} ${vp.y}) scale(${s}) translate(${-vp.x} ${-vp.y})`
          );
          vic.setAttribute("opacity", String(1 - vt));
        }
        if (tt < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    fx.innerHTML = "";
    animating = false;
  }

  function readNextStarter() {
    try {
      const v = localStorage.getItem(STARTER_KEY);
      if (v === PLAYERS.gourd || v === PLAYERS.tomato) return v;
    } catch (_) {}
    return PLAYERS.tomato;
  }

  function writeNextStarter(starter) {
    try {
      localStorage.setItem(STARTER_KEY, opponent(starter));
    } catch (_) {}
  }

  function makeLocalState(game, opts) {
    const hotseat = !!(opts && opts.hotseat);
    const names = (opts && opts.names) || {
      tomato: playerName(),
      gourd: lang() === "en" ? "Computer" : "Bilgisayar",
    };
    return {
      code: hotseat ? "LOCAL" : "SOLO",
      status: game.winner ? "finished" : "playing",
      vsAi: !hotseat,
      local: true,
      hotseat,
      you: hotseat ? game.turn : PLAYERS.tomato,
      names,
      ready: { tomato: true, gourd: true },
      guestJoined: true,
      game,
    };
  }

  function startLocalSolo() {
    clearTimeout(aiTimer);
    localMode = true;
    selected = null;
    lastSeenMoveCount = -1;
    clearHist();
    endP2p();
    if (socket) {
      try {
        socket.emit("room:leave");
      } catch (_) {}
    }
    const starter = readNextStarter();
    writeNextStarter(starter);
    const game = createGameState(starter);
    applyState(makeLocalState(game), { skipAnim: true });
    updateHistBtns();
    toast(starter === PLAYERS.gourd ? t("cpuStarts") : t("youStart"));
    if (game.turn === PLAYERS.gourd) scheduleLocalAi(700);
  }

  function startLocalHotseat() {
    clearTimeout(aiTimer);
    localMode = true;
    selected = null;
    lastSeenMoveCount = -1;
    clearHist();
    endP2p();
    if (socket) {
      try {
        socket.emit("room:leave");
      } catch (_) {}
    }
    const p1 = ($("p1-name") && $("p1-name").value.trim()) || t("red");
    const p2 = ($("p2-name") && $("p2-name").value.trim()) || t("green");
    saveSettings({ name: p1 });
    const starter = readNextStarter();
    writeNextStarter(starter);
    const game = createGameState(starter);
    applyState(
      makeLocalState(game, {
        hotseat: true,
        names: { tomato: p1, gourd: p2 },
      }),
      { skipAnim: true }
    );
    updateHistBtns();
  }

  function scheduleLocalAi(delay = 520) {
    clearTimeout(aiTimer);
    if (!state || !state.local || state.hotseat || state.game.winner) return;
    if (state.game.turn !== PLAYERS.gourd) return;
    aiTimer = setTimeout(async () => {
      if (!state || !state.local || animating) return;
      const pick = chooseMove(state.game, PLAYERS.gourd, {
        difficulty: settings.aiDifficulty || "normal",
      });
      if (!pick) return;
      await playLocalMove(pick.from, pick.to, PLAYERS.gourd);
      if (state && state.game.turn === PLAYERS.gourd && !state.game.winner) {
        scheduleLocalAi(380);
      }
    }, delay);
  }

  async function playLocalMove(from, to, asPlayer) {
    if (animating) return;
    const player = asPlayer || state.you;
    const prevBoard = { ...state.game.board };
    const r = tryMove(state.game, player, from, to);
    if (!r.ok) {
      toast(r.error);
      return;
    }
    pushHist();
    const move = r.state.lastMove;
    await animateMove(prevBoard, move, player);
    lastSeenMoveCount = r.state.moveCount;
    await applyState(
      makeLocalState(r.state, {
        hotseat: !!state.hotseat,
        names: state.names,
      }),
      { skipAnim: true }
    );
    flashMoveEmphasis(move, player);
    if (
      state &&
      state.local &&
      !state.hotseat &&
      !state.game.winner &&
      state.game.turn === PLAYERS.gourd
    ) {
      scheduleLocalAi(move && move.capture ? 480 : 420);
    }
  }

  function onNodeClick(nodeId) {
    if (!state || state.status !== "playing" || animating) return;
    const game = state.game;
    if (!state.you || state.you !== game.turn) {
      toast(state.vsAi ? t("cpuPlaying") : t("oppTurn"));
      return;
    }
    if (game.winner) return;
    const board = game.board;
    const moves = legalMoves(board, state.you, game.chainFrom);

    if (selected) {
      const move = moves.find((m) => m.from === selected && m.to === nodeId);
      if (move) {
        selected = null;
        clearHints();
        if (state.local) playLocalMove(move.from, move.to);
        else if (p2pSession) p2pSession.move(move.from, move.to);
        else if (socket) socket.emit("game:move", { code: state.code, from: move.from, to: move.to });
        return;
      }
      if (board[nodeId] === state.you && (!game.chainFrom || game.chainFrom === nodeId)) {
        selected = nodeId;
        updateHints();
        renderPieces(board, game.lastMove);
        return;
      }
      selected = null;
      clearHints();
      renderPieces(board, game.lastMove);
      return;
    }

    if (board[nodeId] === state.you) {
      if (game.chainFrom && game.chainFrom !== nodeId) {
        toast(t("statusChain"));
        return;
      }
      const myMoves = moves.filter((m) => m.from === nodeId);
      if (!myMoves.length) {
        toast(anyCapture(board, state.you) ? t("statusMustCapture") : t("statusPick"));
        return;
      }
      selected = nodeId;
      updateHints();
      renderPieces(board, game.lastMove);
    }
  }

  function updateHints() {
    if (!selected || !state) {
      clearHints();
      return;
    }
    const moves = legalMoves(state.game.board, state.you, state.game.chainFrom).filter(
      (m) => m.from === selected
    );
    showHints(
      moves.map((m) => m.to),
      new Set(moves.filter((m) => m.capture).map((m) => m.to))
    );
  }

  async function applyState(s, opts) {
    if (!s) return;
    const skipAnim = opts && opts.skipAnim;
    const prev = state;
    localMode = !!s.local;

    let emphasizedWho = null;
    if (
      !skipAnim &&
      prev &&
      prev.game &&
      s.game &&
      s.game.lastMove &&
      s.game.moveCount > lastSeenMoveCount &&
      s.game.moveCount === (prev.game.moveCount || 0) + 1
    ) {
      emphasizedWho = prev.game.board[s.game.lastMove.from] || prev.game.turn || PLAYERS.tomato;
      await animateMove(prev.game.board, s.game.lastMove, emphasizedWho);
      lastSeenMoveCount = s.game.moveCount;
    } else if (s.game) {
      lastSeenMoveCount = s.game.moveCount;
    }

    // notifications
    if (prev && !prev.guestJoined && s.guestJoined && !s.local) {
      notify(t("appName"), t("notifJoined"));
    }
    if (
      prev &&
      s.game &&
      prev.game &&
      s.you === s.game.turn &&
      prev.you !== prev.game.turn &&
      !s.game.winner &&
      s.status === "playing"
    ) {
      notify(t("appName"), t("notifYourTurn"));
    }

    state = s;
    prevGuestJoined = !!s.guestJoined;

    if (s.vsAi || s.status === "playing" || s.status === "finished") {
      showScreen("game");
      renderGame(s);
      if (emphasizedWho && s.game && s.game.lastMove) {
        flashMoveEmphasis(s.game.lastMove, emphasizedWho);
      }
    } else if (s.status === "waiting") {
      showScreen("room");
      renderRoom(s);
    }
  }

  function renderRoom(s) {
    $("room-code-display").textContent = s.code;
    $("name-tomato").textContent = s.names.tomato || t("red");
    $("name-gourd").textContent = s.names.gourd || t("waitingGuest");
    $("ready-tomato").textContent = s.ready.tomato ? t("readyOn") : t("waiting");
    $("ready-tomato").classList.toggle("on", s.ready.tomato);
    $("ready-gourd").textContent = s.guestJoined
      ? s.ready.gourd
        ? t("readyOn")
        : t("waiting")
      : "—";
    $("ready-gourd").classList.toggle("on", !!s.ready.gourd);
    const btn = $("btn-ready");
    btn.disabled = !s.guestJoined;
    const iAmReady = s.you === "tomato" ? s.ready.tomato : s.ready.gourd;
    btn.textContent = iAmReady ? t("readyOn") : t("ready");
    $("share-hint").textContent =
      s.you === "tomato"
        ? `${t("shareHintHost")} ${s.code}`
        : t("shareHintGuest");
  }

  function renderGame(s) {
    const g = s.game;
    selected = g.chainFrom && s.you === g.turn ? g.chainFrom : selected;
    if (selected && g.board[selected] !== s.you) selected = null;
    renderPieces(g.board, g.lastMove);
    updateHints();
    renderTrays(g.capturedBy);

    const turnName = teamLabel(g.turn);
    if (g.winner) $("turn-label").textContent = t("gameOver");
    else if (g.chainFrom && s.you === g.turn) $("turn-label").textContent = t("turnChain");
    else
      $("turn-label").textContent =
        s.you === g.turn ? `${t("turnYou")} (${turnName})` : `${t("turnOf")}: ${turnName}`;

    $("you-label").textContent = s.vsAi
      ? `${t("youAre")}: ${teamLabel(s.you)} · ${t("vsCpu")}`
      : s.you
        ? `${t("youAre")}: ${teamLabel(s.you)} · ${t("room")} ${s.code}`
        : `${t("room")} ${s.code}`;

    const starterEl = $("starter-label");
    if (starterEl) {
      starterEl.textContent = `${t("starter")}: ${teamLabel(g.starter || PLAYERS.tomato)}`;
    }

    if (g.chainFrom && s.you === g.turn) $("status-msg").textContent = t("statusChain");
    else if (s.you === g.turn && !g.winner)
      $("status-msg").textContent = anyCapture(g.board, s.you)
        ? t("statusMustCapture")
        : t("statusPick");
    else if (!g.winner) $("status-msg").textContent = s.vsAi ? t("statusCpu") : t("statusOpp");
    else $("status-msg").textContent = "";

    updateHistBtns();

    const end = $("end-panel");
    if (g.winner) {
      maybeRecordKatiScore(s, g);
      end.classList.remove("hidden");
      if (s.you === g.winner) $("end-text").textContent = t("winYou");
      else if (s.vsAi) $("end-text").textContent = t("winCpu");
      else $("end-text").textContent = `${teamLabel(g.winner)} ${t("winOther")}`;
    } else end.classList.add("hidden");
  }

  // —— Socket ——
  function bindSocketHandlers(s) {
    s.on("hello", (info) => {
      lanIps = info.lanIps || [];
      port = info.port || 3847;
    });
    s.on("room:created", (st) => {
      localMode = false;
      applyState(st);
    });
    s.on("room:state", (st) => {
      localMode = false;
      applyState(st);
    });
    s.on("room:closed", ({ reason }) => {
      toast(reason || t("toHome"));
      state = null;
      showScreen("home");
    });
    s.on("error:msg", (msg) => toast(msg));
  }

  function loadIoScript(base, done, { silent = false } = {}) {
    if (typeof io === "function") {
      done();
      return;
    }
    const src = (base || "") + "/socket.io/socket.io.js";
    const existing = document.querySelector("script[data-socket-io]");
    if (existing) {
      existing.addEventListener("load", () => done());
      existing.addEventListener("error", () => {
        if (!silent) toast(t("connectFail"));
      });
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.dataset.socketIo = "1";
    el.onload = () => done();
    el.onerror = () => {
      if (!silent) toast(t("connectFail"));
    };
    document.body.appendChild(el);
  }

  function ensureSocket(cb) {
    const base = serverBase();
    if (!base) {
      toast(t("needServer"));
      return;
    }
    loadIoScript(base === location.origin ? "" : base, () => {
      if (typeof io !== "function") {
        toast(t("connectFail"));
        return;
      }
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      const url = base === location.origin ? undefined : base;
      socket = io(url, { transports: ["websocket", "polling"] });
      bindSocketHandlers(socket);
      socket.on("connect", () => cb(socket));
      socket.on("connect_error", () => toast(t("connectFail")));
    });
  }

  function fillSettingsForm() {
    if ($("settings-name")) $("settings-name").value = settings.name || "";
    if ($("settings-server")) $("settings-server").value = settings.serverUrl || "";
    if ($("settings-notif")) $("settings-notif").checked = !!settings.notifications;
    document.querySelectorAll('input[name="lang"]').forEach((r) => {
      r.checked = r.value === lang();
    });
    const diff = settings.aiDifficulty || "normal";
    document.querySelectorAll('input[name="aiDiff"]').forEach((r) => {
      r.checked = r.value === diff;
    });
    if ($("player-name") && settings.name) $("player-name").value = settings.name;
    if (window.ArenaScore && settings.name) {
      const store = window.ArenaScore.load();
      if (!store.displayName) window.ArenaScore.setDisplayName(settings.name);
    }
  }

  function goHome() {
    clearTimeout(aiTimer);
    selected = null;
    state = null;
    localMode = false;
    clearHist();
    endP2p();
    showScreen("home");
  }

  function leaveGameScreen() {
    const inMatch = !!(state && state.game && !state.game.winner);
    if (inMatch) {
      const msg =
        lang() === "en" ? "Leave the match?" : "Maçtan çıkılsın mı?";
      if (!window.confirm(msg)) return;
    }
    if (state && state.local) {
      goHome();
      showScreen("play");
      return;
    }
    if (state && !state.local) {
      endP2p();
      if (socket) {
        try {
          socket.emit("room:leave");
        } catch (_) {}
      }
      state = null;
      clearHist();
      showScreen("play");
      return;
    }
    goHome();
  }

  function restartCurrentMode() {
    if (!state) return;
    selected = null;
    if (state.hotseat) {
      startLocalHotseat();
      return;
    }
    if (state.local || (state.vsAi && localMode)) {
      startLocalSolo();
      return;
    }
    if (p2pSession) p2pSession.rematch();
    else if (socket) socket.emit("game:rematch", { code: state.code });
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
  $("btn-online-back").addEventListener("click", () => showScreen("play"));
  if ($("btn-2p-setup-back")) {
    $("btn-2p-setup-back").addEventListener("click", () => showScreen("play"));
  }
  $("btn-settings-back").addEventListener("click", () => showScreen("home"));
  $("btn-help-back").addEventListener("click", () => showScreen("home"));
  $("btn-updates-back").addEventListener("click", () => showScreen("settings"));
  if ($("btn-open-updates")) {
    $("btn-open-updates").addEventListener("click", () => {
      applyI18n();
      showScreen("updates");
    });
  }
  if ($("btn-settings-check-update")) {
    $("btn-settings-check-update").addEventListener("click", () => {
      checkForUpdate({ force: true, silent: false });
    });
  }

  $("btn-mode-solo").addEventListener("click", () => startLocalSolo());
  if ($("btn-mode-2p")) {
    $("btn-mode-2p").addEventListener("click", () => {
      fillSettingsForm();
      if ($("p1-name") && settings.name) $("p1-name").value = settings.name;
      showScreen("twoPSetup");
    });
  }
  if ($("btn-2p-start")) {
    $("btn-2p-start").addEventListener("click", () => startLocalHotseat());
  }
  $("btn-mode-online").addEventListener("click", () => {
    if (window.ArenaP2P && ArenaP2P.initTransportUi) ArenaP2P.initTransportUi();
    fillSettingsForm();
    showScreen("online");
  });

  $("btn-settings-save").addEventListener("click", async () => {
    const selectedLang =
      (document.querySelector('input[name="lang"]:checked') || {}).value || "tr";
    const selectedDiff =
      (document.querySelector('input[name="aiDiff"]:checked') || {}).value ||
      "normal";
    const name = ($("settings-name").value || "").trim();
    saveSettings({
      lang: selectedLang,
      name,
      serverUrl: ($("settings-server").value || "").trim().replace(/\/$/, ""),
      notifications: !!$("settings-notif").checked,
      aiDifficulty: ["easy", "normal", "hard", "veryhard"].includes(selectedDiff)
        ? selectedDiff
        : "normal",
    });
    if (window.ArenaScore) window.ArenaScore.setDisplayName(name);
    if (settings.notifications) await ensureNotifPermission();
    applyI18n();
    fillSettingsForm();
    toast(t("saved"));
  });

  $("btn-updates-seen").addEventListener("click", () => {
    try {
      localStorage.setItem(SEEN_VER_KEY, CFG.version);
    } catch (_) {}
    updateUpdatesDot();
    toast(t("saved"));
    showScreen("settings");
  });

  $("btn-updates-check").addEventListener("click", () => {
    checkForUpdate({ force: true, silent: false });
  });

  $("btn-update-now").addEventListener("click", () => {
    applyPendingUpdate();
  });
  $("btn-update-later").addEventListener("click", () => {
    hideUpdateModal();
  });

  $("btn-create").addEventListener("click", () => {
    saveSettings({ name: playerName() });
    if (useLegacySocket()) {
      ensureSocket((s) => s.emit("room:create", { name: playerName() }));
    } else {
      p2pCreateRoom();
    }
  });

  $("btn-join").addEventListener("click", () => {
    const code = ($("join-code").value || "").trim().toUpperCase();
    if (!code) {
      toast(t("needCode"));
      return;
    }
    saveSettings({ name: playerName() });
    if (useLegacySocket()) {
      ensureSocket((s) => s.emit("room:join", { code, name: playerName() }));
    } else {
      p2pJoinRoom(code);
    }
  });

  $("join-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-join").click();
  });

  $("btn-ready").addEventListener("click", () => {
    if (!state || state.local) return;
    const iAmReady = state.you === "tomato" ? state.ready.tomato : state.ready.gourd;
    if (p2pSession) p2pSession.setReady(!iAmReady);
    else if (socket) socket.emit("room:ready", { code: state.code, ready: !iAmReady });
  });

  $("btn-copy-link").addEventListener("click", async () => {
    if (!state || state.local) return;
    const text = inviteUrl(state.code);
    try {
      await navigator.clipboard.writeText(text);
      toast(t("linkCopied"));
    } catch (_) {
      toast(text);
    }
  });

  $("btn-room-home").addEventListener("click", () => {
    if (socket) socket.emit("room:leave");
    goHome();
  });

  if ($("btn-game-back")) {
    $("btn-game-back").addEventListener("click", () => leaveGameScreen());
  }
  if ($("btn-game-undo")) {
    $("btn-game-undo").addEventListener("click", () => doUndo());
  }
  if ($("btn-game-redo")) {
    $("btn-game-redo").addEventListener("click", () => doRedo());
  }
  if ($("btn-game-restart")) {
    $("btn-game-restart").addEventListener("click", () => restartCurrentMode());
  }

  $("btn-rematch").addEventListener("click", () => restartCurrentMode());

  $("btn-lobby").addEventListener("click", () => {
    if (state && state.local) {
      goHome();
      return;
    }
    if (socket) socket.emit("room:leave");
    goHome();
  });

  // Auto-join from ?join=CODE
  function handleInviteQuery() {
    try {
      const params = new URLSearchParams(location.search);
      const code = (params.get("join") || "").toUpperCase();
      if (!code) return;
      fillSettingsForm();
      showScreen("online");
      if ($("join-code")) $("join-code").value = code;
      setTimeout(() => $("btn-join").click(), 700);
    } catch (_) {}
  }

  // Boot
  if (Sfx && Sfx.bindFirstGesture) Sfx.bindFirstGesture(document);
  if (window.ArenaHubBack) {
    hubBackCtl = window.ArenaHubBack.bind({ getLang: lang });
  }
  applyI18n();
  if (window.ArenaP2P && ArenaP2P.initTransportUi) ArenaP2P.initTransportUi();
  fillSettingsForm();
  initBoardSvg();
  if (window.ArenaSW) window.ArenaSW.register("./sw.js");
  if (settings.notifications) ensureNotifPermission();
  // Same-origin socket preload for web (silent: static hosts like GitHub Pages have no /socket.io)
  if (!isNative && location.protocol !== "file:" && location.protocol !== "capacitor:") {
    loadIoScript("", () => {}, { silent: true });
  }
  handleInviteQuery();
  // Check for a newer release shortly after the app first opens.
  setTimeout(() => checkForUpdate({ force: false, silent: true }), 1200);
})();
