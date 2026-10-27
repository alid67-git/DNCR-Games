(() => {
  const E = window.ToprakEngine;
  const CFG = window.KatiConfig;
  const I18N = window.KatiI18n;
  if (!E || !CFG || !I18N) {
    console.error("Kati Arena: missing modules");
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
    online: $("screen-online"),
    settings: $("screen-settings"),
    help: $("screen-help"),
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
  let state = null;
  let selected = null;
  let lanIps = [];
  let port = 3847;
  let localMode = false;
  let aiTimer = null;
  let animating = false;
  let lastSeenMoveCount = -1;
  let prevGuestJoined = false;

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
    const onlineEl = $("online-server-url");
    const fromOnline = onlineEl && onlineEl.value.trim();
    const raw = (fromOnline || settings.serverUrl || "").trim().replace(/\/$/, "");
    if (raw) return raw;
    if (isNative) return "";
    return location.origin;
  }

  function inviteUrl(code) {
    const base = serverBase() || location.origin;
    try {
      const u = new URL(base);
      u.searchParams.set("join", code);
      return u.toString();
    } catch (_) {
      return `${base}?join=${encodeURIComponent(code)}`;
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
    if ($("updates-current")) $("updates-current").textContent = `${CFG.version} (${CFG.build})`;
    renderChangelog();
    updateUpdatesDot();
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
    }

    const flyer = makePieceGroup(attacker, from.x, from.y, false);
    flyer.setAttribute("class", `fx-flyer ${attacker}-piece`);
    flyer.setAttribute("transform", "translate(0 0)");
    fx.appendChild(flyer);

    const duration = move.capture ? 520 : 300;
    const start = performance.now();
    await new Promise((resolve) => {
      function frame(now) {
        const tt = Math.min(1, (now - start) / duration);
        const ease = tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2;
        const x = from.x + (to.x - from.x) * ease;
        const y = from.y + (to.y - from.y) * ease;
        const lift = (move.capture ? 5 : 1.8) * Math.sin(Math.PI * ease);
        flyer.setAttribute("transform", `translate(${x - from.x} ${y - from.y - lift})`);
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

  function makeLocalState(game) {
    return {
      code: "SOLO",
      status: game.winner ? "finished" : "playing",
      vsAi: true,
      local: true,
      you: PLAYERS.tomato,
      names: { tomato: playerName(), gourd: lang() === "en" ? "Computer" : "Bilgisayar" },
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
    if (socket) {
      try {
        socket.emit("room:leave");
      } catch (_) {}
    }
    const starter = readNextStarter();
    writeNextStarter(starter);
    const game = createGameState(starter);
    applyState(makeLocalState(game), { skipAnim: true });
    toast(starter === PLAYERS.gourd ? t("cpuStarts") : t("youStart"));
    if (game.turn === PLAYERS.gourd) scheduleLocalAi(700);
  }

  function scheduleLocalAi(delay = 520) {
    clearTimeout(aiTimer);
    if (!state || !state.local || state.game.winner) return;
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
    const move = r.state.lastMove;
    await animateMove(prevBoard, move, player);
    lastSeenMoveCount = r.state.moveCount;
    await applyState(makeLocalState(r.state), { skipAnim: true });
    if (state && state.local && !state.game.winner && state.game.turn === PLAYERS.gourd) {
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
        else socket.emit("game:move", { code: state.code, from: move.from, to: move.to });
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

    if (
      !skipAnim &&
      prev &&
      prev.game &&
      s.game &&
      s.game.lastMove &&
      s.game.moveCount > lastSeenMoveCount &&
      s.game.moveCount === (prev.game.moveCount || 0) + 1
    ) {
      const who = prev.game.board[s.game.lastMove.from] || prev.game.turn || PLAYERS.tomato;
      await animateMove(prev.game.board, s.game.lastMove, who);
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

    const end = $("end-panel");
    if (g.winner) {
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

  function loadIoScript(base, done) {
    if (typeof io === "function") {
      done();
      return;
    }
    const src = (base || "") + "/socket.io/socket.io.js";
    const existing = document.querySelector("script[data-socket-io]");
    if (existing) {
      existing.addEventListener("load", () => done());
      existing.addEventListener("error", () => toast(t("connectFail")));
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.dataset.socketIo = "1";
    el.onload = () => done();
    el.onerror = () => toast(t("connectFail"));
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
    if ($("online-server-url")) $("online-server-url").value = settings.serverUrl || "";
  }

  function goHome() {
    clearTimeout(aiTimer);
    selected = null;
    state = null;
    localMode = false;
    showScreen("home");
  }

  // —— Events ——
  $("btn-home-play").addEventListener("click", () => showScreen("play"));
  $("btn-home-settings").addEventListener("click", () => {
    fillSettingsForm();
    showScreen("settings");
  });
  $("btn-home-help").addEventListener("click", () => {
    applyI18n();
    showScreen("help");
  });
  $("btn-home-updates").addEventListener("click", () => {
    applyI18n();
    showScreen("updates");
  });

  $("btn-play-back").addEventListener("click", () => showScreen("home"));
  $("btn-online-back").addEventListener("click", () => showScreen("play"));
  $("btn-settings-back").addEventListener("click", () => showScreen("home"));
  $("btn-help-back").addEventListener("click", () => showScreen("home"));
  $("btn-updates-back").addEventListener("click", () => showScreen("home"));

  $("btn-mode-solo").addEventListener("click", () => startLocalSolo());
  $("btn-mode-online").addEventListener("click", () => {
    fillSettingsForm();
    showScreen("online");
  });

  $("btn-settings-save").addEventListener("click", async () => {
    const selectedLang =
      (document.querySelector('input[name="lang"]:checked') || {}).value || "tr";
    const selectedDiff =
      (document.querySelector('input[name="aiDiff"]:checked') || {}).value ||
      "normal";
    saveSettings({
      lang: selectedLang,
      name: ($("settings-name").value || "").trim(),
      serverUrl: ($("settings-server").value || "").trim().replace(/\/$/, ""),
      notifications: !!$("settings-notif").checked,
      aiDifficulty: ["easy", "normal", "hard"].includes(selectedDiff)
        ? selectedDiff
        : "normal",
    });
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
    showScreen("home");
  });

  $("btn-create").addEventListener("click", () => {
    const url = ($("online-server-url").value || "").trim().replace(/\/$/, "");
    if (url) saveSettings({ serverUrl: url, name: playerName() });
    else saveSettings({ name: playerName() });
    ensureSocket((s) => s.emit("room:create", { name: playerName() }));
  });

  $("btn-join").addEventListener("click", () => {
    const code = ($("join-code").value || "").trim().toUpperCase();
    if (!code) {
      toast(t("needCode"));
      return;
    }
    const url = ($("online-server-url").value || "").trim().replace(/\/$/, "");
    if (url) saveSettings({ serverUrl: url, name: playerName() });
    else saveSettings({ name: playerName() });
    ensureSocket((s) => s.emit("room:join", { code, name: playerName() }));
  });

  $("join-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-join").click();
  });

  $("btn-ready").addEventListener("click", () => {
    if (!state || state.local) return;
    const iAmReady = state.you === "tomato" ? state.ready.tomato : state.ready.gourd;
    socket.emit("room:ready", { code: state.code, ready: !iAmReady });
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

  $("btn-rematch").addEventListener("click", () => {
    if (!state) return;
    selected = null;
    if (state.local || (state.vsAi && localMode)) {
      startLocalSolo();
      return;
    }
    socket.emit("game:rematch", { code: state.code });
  });

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
      // mild delay for socket.io on same origin
      setTimeout(() => $("btn-join").click(), 400);
    } catch (_) {}
  }

  // Boot
  applyI18n();
  fillSettingsForm();
  initBoardSvg();
  if (settings.notifications) ensureNotifPermission();
  // Same-origin socket preload for web
  if (!isNative && location.protocol !== "file:") {
    loadIoScript("", () => {});
  }
  handleInviteQuery();
})();
