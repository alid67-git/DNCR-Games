(() => {
  const E = window.ToprakEngine;
  if (!E) {
    console.error("engine.js yüklenmedi");
    return;
  }

  const { POSITIONS, BOARD_EDGES: EDGES, PLAYERS, createGameState, tryMove, getAllLegalMoves, chooseMove } = E;
  const LABELS = { tomato: "Domates", gourd: "Acur" };

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

  function renderPieces(board, lastMove) {
    const g = $("board-pieces");
    g.innerHTML = "";
    for (const [id, owner] of Object.entries(board || {})) {
      if (!owner) continue;
      const p = POSITIONS[id];
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", `piece ${owner}-piece${selected === id ? " selected" : ""}`);
      group.dataset.node = id;

      const skin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      skin.setAttribute("class", "skin");
      skin.setAttribute("cx", p.x);
      skin.setAttribute("cy", p.y);
      skin.setAttribute("r", 4.2);
      skin.setAttribute("fill", owner === "tomato" ? "url(#tomatoFill)" : "url(#gourdFill)");

      const gloss = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      gloss.setAttribute("cx", p.x - 1.2);
      gloss.setAttribute("cy", p.y - 1.4);
      gloss.setAttribute("r", 1.2);
      gloss.setAttribute("fill", "rgba(255,255,255,0.35)");
      gloss.setAttribute("pointer-events", "none");

      if (owner === "tomato") {
        const stem = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        stem.setAttribute("cx", p.x);
        stem.setAttribute("cy", p.y - 3.6);
        stem.setAttribute("r", 0.9);
        stem.setAttribute("fill", "#2e7d32");
        stem.setAttribute("pointer-events", "none");
        group.appendChild(stem);
      }

      group.appendChild(skin);
      group.appendChild(gloss);
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
    if (socket) {
      try {
        socket.emit("room:leave");
      } catch (_) {}
    }
    applyState(makeLocalState(createGameState()));
  }

  function scheduleLocalAi() {
    clearTimeout(aiTimer);
    if (!state || !state.local || state.game.winner) return;
    if (state.game.turn !== PLAYERS.gourd) return;
    aiTimer = setTimeout(() => {
      if (!state || !state.local) return;
      const pick = chooseMove(state.game, PLAYERS.gourd, 3);
      if (!pick) return;
      const r = tryMove(state.game, PLAYERS.gourd, pick.from, pick.to);
      if (!r.ok) return;
      applyState(makeLocalState(r.state));
      if (r.state.turn === PLAYERS.gourd && !r.state.winner) scheduleLocalAi();
    }, 520);
  }

  function playLocalMove(from, to) {
    const r = tryMove(state.game, state.you, from, to);
    if (!r.ok) {
      toast(r.error);
      return;
    }
    applyState(makeLocalState(r.state));
    scheduleLocalAi();
  }

  function onNodeClick(nodeId) {
    if (!state || state.status !== "playing") return;
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

  function applyState(s) {
    state = s;
    if (!s) return;
    localMode = !!s.local;

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
    const existing = document.querySelector('script[data-socket-io]');
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

  // —— Events ——
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
    if (state.local || state.vsAi && localMode) {
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
  // Capacitor köprüsü bazen biraz gecikir
  setTimeout(applyNativeUi, 300);

  initBoardSvg();
  connectOptional();
})();
