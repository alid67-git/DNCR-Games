(() => {
  const E = window.ToprakEngine;
  if (!E) {
    console.error("engine.js yüklenmedi");
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
  const LABELS = { tomato: "Domates", gourd: "Acur" };
  const STARTER_KEY = "toprak_kati_next_starter";

  const $ = (id) => document.getElementById(id);
  const screens = {
    lobby: $("screen-lobby"),
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

  let socket = null;
  let state = null;
  let selected = null;
  let lanIps = [];
  let port = 3847;
  let localMode = false;
  let aiTimer = null;
  let animating = false;
  let lastSeenMoveCount = -1;

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
  }

  function playerName() {
    return ($("player-name").value || "").trim() || "Oyuncu";
  }

  function serverBase() {
    const el = $("server-url");
    const raw = (el && el.value) || "";
    const trimmed = raw.trim();
    if (trimmed) return trimmed.replace(/\/$/, "");
    if (isNative) return "";
    return location.origin;
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

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // —— Board draw ——
  function initBoardSvg() {
    const lines = $("board-lines");
    const nodes = $("board-nodes");
    const defs = document.querySelector("#board defs");

    defs.insertAdjacentHTML(
      "beforeend",
      `
      <radialGradient id="tomatoFill" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ff8a80"/>
        <stop offset="55%" stop-color="#c62828"/>
        <stop offset="100%" stop-color="#7f0000"/>
      </radialGradient>
      <radialGradient id="gourdFill" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#c8e6c9"/>
        <stop offset="45%" stop-color="#43a047"/>
        <stop offset="100%" stop-color="#1b5e20"/>
      </radialGradient>
    `
    );

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

    if (owner === "tomato") {
      const stem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      stem.setAttribute("cx", x);
      stem.setAttribute("cy", y - 3.6);
      stem.setAttribute("r", 0.9);
      stem.setAttribute("fill", "#2e7d32");
      stem.setAttribute("pointer-events", "none");
      group.appendChild(stem);
    }

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
    const t = (capturedBy && capturedBy.tomato) || 0;
    const g = (capturedBy && capturedBy.gourd) || 0;
    const tEl = $("tray-tomato");
    const gEl = $("tray-gourd");
    if (!tEl || !gEl) return;
    tEl.innerHTML = "";
    gEl.innerHTML = "";
    for (let i = 0; i < t; i++) {
      const d = document.createElement("span");
      d.className = "tray-dot";
      // gourd pieces eaten by tomato → green dots in tomato tray
      d.style.background = "radial-gradient(circle at 35% 30%, #a5d6a7, #2e7d32)";
      tEl.appendChild(d);
    }
    for (let i = 0; i < g; i++) {
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
    el.textContent = `${LABELS[attacker]} → ${LABELS[victim]} yedi!`;
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

    // Tahta: hareket eden (ve yenilen) taş gizlensin
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

    // Uçan taş: sadece group transform (cx/cy'ye tekrar yazma — çift kaymayı önler)
    const flyer = makePieceGroup(attacker, from.x, from.y, false);
    flyer.setAttribute("class", `fx-flyer ${attacker}-piece`);
    flyer.setAttribute("transform", "translate(0 0)");
    fx.appendChild(flyer);

    const duration = move.capture ? 520 : 300;
    const start = performance.now();
    let victimPopStarted = false;

    await new Promise((resolve) => {
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = from.x + (to.x - from.x) * ease;
        const y = from.y + (to.y - from.y) * ease;
        const lift = (move.capture ? 5 : 1.8) * Math.sin(Math.PI * ease);
        flyer.setAttribute(
          "transform",
          `translate(${x - from.x} ${y - from.y - lift})`
        );

        // Ortaya gelince yenilen taşı küçült
        if (vic && vp && t >= 0.42) {
          if (!victimPopStarted) victimPopStarted = true;
          const vt = Math.min(1, (t - 0.42) / 0.55);
          const s = Math.max(0.05, 1.15 * (1 - vt));
          vic.setAttribute(
            "transform",
            `translate(${vp.x} ${vp.y}) scale(${s}) translate(${-vp.x} ${-vp.y})`
          );
          vic.setAttribute("opacity", String(1 - vt));
        }

        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    fx.innerHTML = "";
    animating = false;
  }

  // —— Local solo ——
  function makeLocalState(game) {
    return {
      code: "SOLO",
      status: game.winner ? "finished" : "playing",
      vsAi: true,
      local: true,
      you: PLAYERS.tomato,
      names: { tomato: playerName(), gourd: "Bilgisayar" },
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
    applyState(makeLocalState(game));
    if (game.turn === PLAYERS.gourd) {
      toast("Bu elde bilgisayar başlıyor.");
      scheduleLocalAi(700);
    } else {
      toast("Bu elde sen başlıyorsun.");
    }
  }

  function scheduleLocalAi(delay = 520) {
    clearTimeout(aiTimer);
    if (!state || !state.local || state.game.winner) return;
    if (state.game.turn !== PLAYERS.gourd) return;
    aiTimer = setTimeout(async () => {
      if (!state || !state.local || animating) return;
      const pick = chooseMove(state.game, PLAYERS.gourd, 3);
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
    if (
      state &&
      state.local &&
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
      toast(state.vsAi ? "Bilgisayar oynuyor." : "Sıra rakipte.");
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
        toast("Zincire aynı taşla devam et.");
        return;
      }
      const myMoves = moves.filter((m) => m.from === nodeId);
      if (!myMoves.length) {
        toast(anyCapture(board, state.you) ? "Yakalama zorunlu — başka taş seç." : "Bu taşın hamlesi yok.");
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
    const targets = moves.map((m) => m.to);
    const caps = new Set(moves.filter((m) => m.capture).map((m) => m.to));
    showHints(targets, caps);
  }

  async function applyState(s, opts) {
    if (!s) return;
    const skipAnim = opts && opts.skipAnim;
    const prev = state;
    localMode = !!s.local;

    // Network / remote: animate when moveCount advances
    if (
      !skipAnim &&
      prev &&
      prev.game &&
      s.game &&
      s.game.lastMove &&
      s.game.moveCount > lastSeenMoveCount &&
      s.game.moveCount === (prev.game.moveCount || 0) + 1
    ) {
      const who =
        prev.game.board[s.game.lastMove.from] || prev.game.turn || PLAYERS.tomato;
      await animateMove(prev.game.board, s.game.lastMove, who);
      lastSeenMoveCount = s.game.moveCount;
    } else if (s.game) {
      lastSeenMoveCount = s.game.moveCount;
    }

    state = s;

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
    $("name-tomato").textContent = s.names.tomato || "Domates";
    $("name-gourd").textContent = s.names.gourd || "Rakip bekleniyor…";
    $("ready-tomato").textContent = s.ready.tomato ? "hazır" : "bekliyor";
    $("ready-tomato").classList.toggle("on", s.ready.tomato);
    $("ready-gourd").textContent = s.guestJoined
      ? s.ready.gourd
        ? "hazır"
        : "bekliyor"
      : "—";
    $("ready-gourd").classList.toggle("on", !!s.ready.gourd);

    const btn = $("btn-ready");
    btn.disabled = !s.guestJoined;
    const iAmReady = s.you === "tomato" ? s.ready.tomato : s.ready.gourd;
    btn.textContent = iAmReady ? "Hazır ✓" : "Hazırım";

    const base = serverBase() || `${location.protocol}//${lanIps[0] || location.hostname}:${port}`;
    $("share-hint").textContent =
      s.you === "tomato"
        ? `Arkadaşın ${base} adresini açıp kodu yazısın: ${s.code}`
        : `Odaya katıldın. İkiniz de «Hazırım» deyin.`;
  }

  function renderGame(s) {
    const g = s.game;
    selected = g.chainFrom && s.you === g.turn ? g.chainFrom : selected;
    if (selected && g.board[selected] !== s.you) selected = null;

    renderPieces(g.board, g.lastMove);
    updateHints();
    renderTrays(g.capturedBy);

    const turnName = LABELS[g.turn];
    if (g.winner) {
      $("turn-label").textContent = "Oyun bitti";
    } else if (g.chainFrom && s.you === g.turn) {
      $("turn-label").textContent = "Yakalama zinciri — devam et!";
    } else {
      $("turn-label").textContent =
        s.you === g.turn ? `Sıra sende (${turnName})` : `Sıra: ${turnName}`;
    }

    $("you-label").textContent = s.vsAi
      ? `Sen: ${LABELS[s.you]} · bilgisayara karşı`
      : s.you
        ? `Sen: ${LABELS[s.you]} · Oda ${s.code}`
        : `Oda ${s.code}`;

    const starterEl = $("starter-label");
    if (starterEl) {
      const st = g.starter || PLAYERS.tomato;
      starterEl.textContent = `Bu el başlayan: ${LABELS[st]}`;
    }

    if (g.chainFrom && s.you === g.turn) {
      $("status-msg").textContent = "Aynı taşla yakalamaya devam et.";
    } else if (s.you === g.turn && !g.winner) {
      $("status-msg").textContent = anyCapture(g.board, s.you)
        ? "Yakalama zorunlu — taşını seç."
        : "Taşını seç, sonra hedef noktaya dokun.";
    } else if (!g.winner) {
      $("status-msg").textContent = s.vsAi ? "Bilgisayar düşünüyor…" : "Rakip oynuyor…";
    } else {
      $("status-msg").textContent = "";
    }

    const end = $("end-panel");
    if (g.winner) {
      end.classList.remove("hidden");
      if (s.you === g.winner) $("end-text").textContent = "Kazandın!";
      else if (s.vsAi) $("end-text").textContent = "Bilgisayar kazandı.";
      else $("end-text").textContent = `${LABELS[g.winner]} kazandı.`;
    } else {
      end.classList.add("hidden");
    }
  }

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
      toast(reason || "Oda kapandı.");
      state = null;
      showScreen("lobby");
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
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.dataset.socketIo = "1";
    el.onload = () => done();
    el.onerror = () => toast("Sunucu script’i yüklenemedi: " + src);
    document.body.appendChild(el);
  }

  function ensureSocket(cb) {
    const base = serverBase();
    if (!base && isNative) {
      toast("İki kişilik için PC’deki sunucu adresini yaz (örn. http://192.168.1.10:3847)");
      return;
    }
    loadIoScript(isNative ? base : "", () => {
      if (typeof io !== "function") {
        toast("Çok oyunculu için sunucu gerekli.");
        return;
      }
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      const url = isNative ? base : base && base !== location.origin ? base : undefined;
      socket = io(url, { transports: ["websocket", "polling"] });
      bindSocketHandlers(socket);
      socket.on("connect", () => cb(socket));
      socket.on("connect_error", () => toast("Sunucuya bağlanılamadı. Adresi kontrol et."));
    });
  }

  function connectOptional() {
    if (isNative) return;
    let tries = 0;
    (function waitIo() {
      if (typeof io === "function") {
        ensureSocket(() => {});
        return;
      }
      if (++tries > 40) return;
      setTimeout(waitIo, 50);
    })();
  }

  $("btn-solo").addEventListener("click", () => startLocalSolo());

  $("btn-create").addEventListener("click", () => {
    ensureSocket((s) => s.emit("room:create", { name: playerName() }));
  });

  $("btn-join").addEventListener("click", () => {
    const code = ($("join-code").value || "").trim().toUpperCase();
    if (!code) {
      toast("Oda kodunu yaz.");
      return;
    }
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
    const base = serverBase() || `${location.protocol}//${lanIps[0] || location.hostname}:${port}`;
    const text = `${base}  →  kod: ${state.code}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Bağlantı kopyalandı.");
    } catch {
      toast(text);
    }
  });

  $("btn-rematch").addEventListener("click", () => {
    if (!state) return;
    selected = null;
    if (state.local || (state.vsAi && localMode)) {
      startLocalSolo();
      return;
    }
    const vsAi = state.vsAi;
    socket.emit("game:rematch", { code: state.code });
    if (!vsAi) showScreen("room");
  });

  $("btn-lobby").addEventListener("click", () => {
    selected = null;
    clearTimeout(aiTimer);
    if (state && state.local) {
      state = null;
      localMode = false;
      showScreen("lobby");
      return;
    }
    if (socket) socket.emit("room:leave");
    state = null;
    showScreen("lobby");
  });

  function applyNativeUi() {
    isNative = detectNative();
    if (!isNative) return;
    document.body.classList.add("is-native");
    const hint = $("native-hint");
    if (hint) hint.classList.remove("hidden");
  }

  applyNativeUi();
  setTimeout(applyNativeUi, 300);

  initBoardSvg();
  connectOptional();
})();
