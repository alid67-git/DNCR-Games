(() => {
  const E = window.DokuztasEngine;
  const Ai = window.DokuztasAi;
  const CFG = window.DokuztasConfig;
  const I18N = window.DokuztasI18n;
  const P2P = window.DokuztasP2P;
  if (!E || !Ai || !CFG || !I18N || !P2P) {
    console.error("Dokuztaş: missing modules");
    return;
  }

  const {
    POSITIONS,
    BOARD_EDGES,
    PLAYERS,
    createGameState,
    tryAction,
    getAllLegalMoves,
    countPieces,
    canFly,
    opponent,
    allPlaced,
  } = E;

  const SETTINGS_KEY = "dokuztas_settings";
  const SEEN_VER_KEY = "dokuztas_seen_version";
  const STARTER_KEY = "dokuztas_next_starter";

  const DIFFS = [
    { id: "easy", i18n: "diffEasy", hint: "diffEasyHint" },
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
    updates: $("screen-updates"),
    game: $("screen-game"),
  };

  let settings = loadSettings();
  let setupDiff = settings.aiDifficulty || "hard";
  /** @type {null | object} */
  let session = null;
  let selected = null;
  let aiTimer = null;
  let boardReady = false;
  /** @type {null | import('./p2p').P2PSession} */
  let p2p = null;
  let p2pLobby = null;

  function loadSettings() {
    const defaults = {
      lang: "tr",
      aiDifficulty: "hard",
      name: "",
      p1: "",
      p2: "",
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
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
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
    if ($("updates-current"))
      $("updates-current").textContent = `${CFG.version} (${CFG.build})`;
    renderChangelog();
    updateUpdatesDot();
    renderDiffGrid();
  }

  function renderChangelog() {
    const list = $("changelog-list");
    if (!list) return;
    list.innerHTML = "";
    const L = lang();
    CFG.changelog.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "upgrade-card";
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
      if (v === PLAYERS.red || v === PLAYERS.black) return v;
    } catch (_) {}
    return PLAYERS.red;
  }

  function writeNextStarter(starter) {
    try {
      localStorage.setItem(STARTER_KEY, opponent(starter));
    } catch (_) {}
  }

  // —— Board SVG ——
  function initBoardSvg() {
    if (boardReady) return;
    const lines = $("board-lines");
    for (const [a, b] of BOARD_EDGES) {
      const pa = POSITIONS[a];
      const pb = POSITIONS[b];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pa.x);
      line.setAttribute("y1", pa.y);
      line.setAttribute("x2", pb.x);
      line.setAttribute("y2", pb.y);
      lines.appendChild(line);
    }
    const nodes = $("board-nodes");
    for (const [id, p] of Object.entries(POSITIONS)) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", p.x);
      ring.setAttribute("cy", p.y);
      ring.setAttribute("r", 2.6);
      ring.setAttribute("class", "node-ring");
      ring.dataset.node = id;
      nodes.appendChild(ring);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("cx", p.x);
      hit.setAttribute("cy", p.y);
      hit.setAttribute("r", 5.8);
      hit.setAttribute("class", "node-hit");
      hit.dataset.node = id;
      hit.addEventListener("click", () => onNodeClick(id));
      nodes.appendChild(hit);
    }
    boardReady = true;
  }

  function makePiece(owner, x, y, selectedNode) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", `piece ${owner}-piece${selectedNode ? " selected" : ""}`);
    const skin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    skin.setAttribute("class", "skin");
    skin.setAttribute("cx", x);
    skin.setAttribute("cy", y);
    skin.setAttribute("r", 4.1);
    skin.setAttribute("fill", owner === "red" ? "url(#redFill)" : "url(#blackFill)");
    const gloss = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    gloss.setAttribute("cx", x - 1.15);
    gloss.setAttribute("cy", y - 1.35);
    gloss.setAttribute("r", 1.15);
    gloss.setAttribute("fill", "rgba(255,255,255,0.32)");
    gloss.setAttribute("pointer-events", "none");
    g.appendChild(skin);
    g.appendChild(gloss);
    return g;
  }

  function renderPieces(board) {
    const g = $("board-pieces");
    g.innerHTML = "";
    for (const [id, owner] of Object.entries(board || {})) {
      if (!owner) continue;
      const p = POSITIONS[id];
      const piece = makePiece(owner, p.x, p.y, selected === id);
      piece.dataset.node = id;
      piece.addEventListener("click", (e) => {
        e.stopPropagation();
        onNodeClick(id);
      });
      g.appendChild(piece);
    }
  }

  function clearHints() {
    $("board-hints").innerHTML = "";
  }

  function showHints(targets, removeMode) {
    clearHints();
    const g = $("board-hints");
    for (const to of targets) {
      const p = POSITIONS[to];
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", 2.5);
      c.setAttribute("class", removeMode ? "hint-dot hint-remove" : "hint-dot");
      g.appendChild(c);
    }
  }

  function showMillBanner() {
    const el = $("mill-banner");
    if (!el) return;
    el.textContent = t("millBanner");
    el.classList.remove("hidden");
    clearTimeout(showMillBanner._t);
    showMillBanner._t = setTimeout(() => el.classList.add("hidden"), 900);
  }

  function teamLabel(p) {
    return p === PLAYERS.red ? t("red") : t("black");
  }

  function controllingPlayer() {
    if (!session) return null;
    if (session.mode === "solo") return PLAYERS.red;
    if (session.mode === "twop") return session.state.turn;
    if (session.mode === "p2p") return session.you;
    return null;
  }

  function canAct() {
    if (!session || session.state.winner) return false;
    if (session.mode === "solo") {
      return session.state.turn === PLAYERS.red && !session.aiThinking;
    }
    if (session.mode === "twop") return true;
    if (session.mode === "p2p") {
      return session.you === session.state.turn && session.status === "playing";
    }
    return false;
  }

  function renderGame() {
    if (!session) return;
    const s = session.state;
    renderPieces(s.board);
    updateHints();

    const onBoardRed = countPieces(s.board, PLAYERS.red);
    const onBoardBlack = countPieces(s.board, PLAYERS.black);
    $("score-red").textContent = String(onBoardRed);
    $("score-black").textContent = String(onBoardBlack);
    $("name-chip-red").textContent = session.names.red;
    $("name-chip-black").textContent = session.names.black;

    const handR = s.toPlace.red;
    const handB = s.toPlace.black;
    $("meta-red").textContent =
      handR > 0 ? `${handR} ${t("toPlace")}` : `${onBoardRed} ${t("piecesLeft")}`;
    $("meta-black").textContent =
      handB > 0 ? `${handB} ${t("toPlace")}` : `${onBoardBlack} ${t("piecesLeft")}`;

    $("chip-red").classList.toggle("active", s.turn === PLAYERS.red && !s.winner);
    $("chip-black").classList.toggle("active", s.turn === PLAYERS.black && !s.winner);

    let phaseText = "";
    if (s.winner) phaseText = t("gameOver");
    else if (s.phase === "remove") phaseText = t("phaseRemove");
    else if (s.phase === "place") phaseText = t("phasePlace");
    else if (canFly(s, s.turn)) phaseText = t("phaseFly");
    else phaseText = t("phaseMove");
    $("phase-label").textContent = phaseText;

    const mine = canAct();
    if (s.winner) $("status-msg").textContent = "";
    else if (session.aiThinking) $("status-msg").textContent = t("statusCpu");
    else if (!mine && session.mode !== "twop") $("status-msg").textContent = t("statusOpp");
    else if (s.phase === "remove") $("status-msg").textContent = t("statusRemove");
    else if (s.phase === "place") $("status-msg").textContent = t("statusPlace");
    else $("status-msg").textContent = t("statusMove");

    const end = $("end-panel");
    if (s.winner) {
      end.classList.remove("hidden");
      if (session.mode === "solo") {
        $("end-text").textContent =
          s.winner === PLAYERS.red ? t("winYou") : t("winCpu");
      } else if (session.mode === "p2p") {
        $("end-text").textContent =
          s.winner === session.you
            ? t("winYou")
            : `${teamLabel(s.winner)} ${t("winOther")}`;
      } else {
        $("end-text").textContent = `${session.names[s.winner]} ${t("winOther")}`;
      }
    } else end.classList.add("hidden");
  }

  function updateHints() {
    if (!session || !canAct()) {
      clearHints();
      return;
    }
    const s = session.state;
    const actor = session.mode === "twop" ? s.turn : controllingPlayer();
    const moves = getAllLegalMoves(s, actor);
    if (s.phase === "remove") {
      showHints(
        moves.map((m) => m.at),
        true
      );
      return;
    }
    if (s.phase === "place") {
      showHints(moves.map((m) => m.to), false);
      return;
    }
    if (selected) {
      showHints(
        moves.filter((m) => m.from === selected).map((m) => m.to),
        false
      );
    } else clearHints();
  }

  function applyAction(action, opts) {
    if (!session) return;
    const fromNet = opts && opts.fromNet;
    const actor = session.state.turn;
    if (!fromNet && session.mode === "p2p" && actor !== session.you) {
      toast(t("notYourTurn"));
      return;
    }
    const prevPhase = session.state.phase;
    const r = tryAction(session.state, actor, action);
    if (!r.ok) {
      if (!fromNet) toast(r.error);
      return;
    }
    if (prevPhase !== "remove" && r.state.phase === "remove") showMillBanner();
    session.state = r.state;
    selected = null;
    renderGame();

    if (session.mode === "p2p" && !fromNet && p2p) {
      p2p.send({ type: "action", action, moveCount: r.state.moveCount });
    }

    if (session.mode === "solo" && !session.state.winner && session.state.turn === PLAYERS.black) {
      scheduleAi();
    }
  }

  function onNodeClick(nodeId) {
    if (!session || session.state.winner) return;
    if (!canAct()) {
      if (session.mode === "solo") toast(t("statusCpu"));
      else toast(t("notYourTurn"));
      return;
    }
    const s = session.state;
    const actor = session.mode === "twop" ? s.turn : controllingPlayer();
    const moves = getAllLegalMoves(s, actor);

    if (s.phase === "remove") {
      const m = moves.find((x) => x.at === nodeId);
      if (m) applyAction(m);
      return;
    }

    if (s.phase === "place") {
      const m = moves.find((x) => x.to === nodeId);
      if (m) applyAction(m);
      return;
    }

    // move / fly
    if (selected) {
      const m = moves.find((x) => x.from === selected && x.to === nodeId);
      if (m) {
        applyAction(m);
        return;
      }
      if (s.board[nodeId] === actor) {
        selected = nodeId;
        renderGame();
        return;
      }
      selected = null;
      renderGame();
      return;
    }

    if (s.board[nodeId] === actor) {
      const mine = moves.filter((x) => x.from === nodeId);
      if (!mine.length) {
        toast(t("statusMove"));
        return;
      }
      selected = nodeId;
      renderGame();
    }
  }

  function scheduleAi(delay = 480) {
    clearTimeout(aiTimer);
    if (!session || session.mode !== "solo" || session.state.winner) return;
    if (session.state.turn !== PLAYERS.black) return;
    session.aiThinking = true;
    renderGame();
    aiTimer = setTimeout(() => {
      if (!session || session.state.turn !== PLAYERS.black) return;
      const pick = Ai.chooseMove(session.state, PLAYERS.black, {
        difficulty: session.difficulty || "hard",
      });
      session.aiThinking = false;
      if (pick) applyAction(pick);
      else renderGame();
    }, delay);
  }

  function startSolo() {
    clearTimeout(aiTimer);
    destroyP2P();
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "solo",
      difficulty: setupDiff,
      names: {
        red: t("you"),
        black: t("computer"),
      },
      state: createGameState(starter),
      aiThinking: false,
    };
    selected = null;
    showScreen("game");
    renderGame();
    toast(starter === PLAYERS.black ? t("cpuStarts") : t("youStart"));
    if (starter === PLAYERS.black) scheduleAi(650);
  }

  function startTwoP() {
    clearTimeout(aiTimer);
    destroyP2P();
    const p1 = ($("p1-name").value || "").trim() || t("player1Ph");
    const p2 = ($("p2-name").value || "").trim() || t("player2Ph");
    saveSettings({ p1, p2 });
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "twop",
      names: { red: p1, black: p2 },
      state: createGameState(starter),
    };
    selected = null;
    showScreen("game");
    renderGame();
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
    $("name-red").textContent = p2pLobby.names.red || "—";
    $("name-black").textContent = p2pLobby.names.black || t("waitingGuest");
    $("ready-red").textContent = p2pLobby.ready.red ? t("readyOn") : t("waiting");
    $("ready-red").classList.toggle("on", !!p2pLobby.ready.red);
    $("ready-black").textContent = p2pLobby.guestJoined
      ? p2pLobby.ready.black
        ? t("readyOn")
        : t("waiting")
      : "—";
    $("ready-black").classList.toggle("on", !!p2pLobby.ready.black);
    const btn = $("btn-ready");
    btn.disabled = !p2pLobby.guestJoined;
    const iAmReady =
      p2pLobby.you === "red" ? p2pLobby.ready.red : p2pLobby.ready.black;
    btn.textContent = iAmReady ? t("readyOn") : t("ready");
    $("share-hint").textContent =
      p2pLobby.you === "red"
        ? `${t("shareHintHost")} ${p2pLobby.code}`
        : t("shareHintGuest");
  }

  function maybeStartP2PGame() {
    if (!p2pLobby || !p2pLobby.guestJoined) return;
    if (!p2pLobby.ready.red || !p2pLobby.ready.black) return;
    if (p2pLobby.you !== "red") return; // host starts
    const starter = p2pLobby.nextStarter || PLAYERS.red;
    p2pLobby.nextStarter = opponent(starter);
    const state = createGameState(starter);
    p2p.send({
      type: "start",
      starter,
      names: p2pLobby.names,
      nextStarter: p2pLobby.nextStarter,
    });
    beginP2PGame(state, p2pLobby.names);
  }

  function beginP2PGame(state, names) {
    session = {
      mode: "p2p",
      status: "playing",
      you: p2pLobby.you,
      names: names || p2pLobby.names,
      state,
    };
    selected = null;
    showScreen("game");
    renderGame();
  }

  function bindP2PHandlers(sessionP2P) {
    sessionP2P.on("connected", () => {
      toast(t("connected"));
      if (sessionP2P.isHost) {
        p2pLobby.guestJoined = true;
        p2p.send({
          type: "hello",
          name: p2pLobby.names.red,
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
        if (p2pLobby.you === "red" && data.role === "guest") {
          p2pLobby.names.black = data.name || t("black");
          p2pLobby.guestJoined = true;
          p2pLobby.ready.black = false;
          p2p.send({
            type: "lobby",
            names: p2pLobby.names,
            ready: p2pLobby.ready,
            guestJoined: true,
          });
          renderRoom();
        } else if (p2pLobby.you === "black" && data.role === "host") {
          p2pLobby.names.red = data.name || t("red");
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
        beginP2PGame(createGameState(data.starter), p2pLobby.names);
      } else if (data.type === "action") {
        if (!session || session.mode !== "p2p") return;
        if (data.moveCount !== session.state.moveCount + 1) return;
        applyAction(data.action, { fromNet: true });
      } else if (data.type === "rematch-ask") {
        p2pLobby.ready = { red: false, black: false };
        p2pLobby.ready[data.who] = true;
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
      p2p = new P2P.P2PSession();
      bindP2PHandlers(p2p);
      const code = await p2p.host();
      p2pLobby = {
        code,
        you: "red",
        names: { red: name, black: null },
        ready: { red: false, black: false },
        guestJoined: false,
        nextStarter: PLAYERS.red,
      };
      showScreen("room");
      renderRoom();
    } catch (err) {
      toast(t("peerFail"));
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
      p2p = new P2P.P2PSession();
      bindP2PHandlers(p2p);
      await p2p.join(code);
      p2pLobby = {
        code,
        you: "black",
        names: { red: "—", black: name },
        ready: { red: false, black: false },
        guestJoined: false,
        nextStarter: PLAYERS.red,
      };
      showScreen("room");
      renderRoom();
    } catch (err) {
      toast(t("peerFail"));
      destroyP2P();
    }
  }

  function fillSettingsForm() {
    document.querySelectorAll('input[name="lang"]').forEach((r) => {
      r.checked = r.value === lang();
    });
    const diff = settings.aiDifficulty || "hard";
    document.querySelectorAll('input[name="defDiff"]').forEach((r) => {
      r.checked = r.value === diff;
    });
    if ($("p1-name")) $("p1-name").value = settings.p1 || "";
    if ($("p2-name")) $("p2-name").value = settings.p2 || "";
    if ($("p2p-name")) $("p2p-name").value = settings.name || "";
  }

  function goHome() {
    clearTimeout(aiTimer);
    selected = null;
    session = null;
    destroyP2P();
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
  $("btn-solo-setup-back").addEventListener("click", () => showScreen("play"));
  $("btn-2p-setup-back").addEventListener("click", () => showScreen("play"));
  $("btn-p2p-back").addEventListener("click", () => showScreen("play"));
  $("btn-settings-back").addEventListener("click", () => showScreen("home"));
  $("btn-help-back").addEventListener("click", () => showScreen("home"));
  $("btn-updates-back").addEventListener("click", () => showScreen("home"));

  $("btn-mode-solo").addEventListener("click", () => {
    setupDiff = settings.aiDifficulty || "hard";
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
    // also push lobby snapshot
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
      "hard";
    saveSettings({
      lang: selectedLang,
      aiDifficulty: ["easy", "hard", "veryhard"].includes(selectedDiff)
        ? selectedDiff
        : "hard",
    });
    setupDiff = settings.aiDifficulty;
    applyI18n();
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

  $("btn-game-back").addEventListener("click", () => {
    if (session && session.mode === "p2p" && p2pLobby) {
      session = null;
      showScreen("room");
      renderRoom();
      return;
    }
    goHome();
  });

  $("btn-game-home").addEventListener("click", () => goHome());

  $("btn-game-restart").addEventListener("click", () => {
    if (!session) return;
    if (session.mode === "solo") startSolo();
    else if (session.mode === "twop") startTwoP();
    else if (session.mode === "p2p" && p2p && p2pLobby) {
      p2pLobby.ready = { red: false, black: false };
      p2p.send({ type: "rematch-ask", who: p2pLobby.you });
      session = null;
      showScreen("room");
      renderRoom();
    }
  });

  $("btn-rematch").addEventListener("click", () => {
    $("btn-game-restart").click();
  });

  // Boot
  applyI18n();
  fillSettingsForm();
  initBoardSvg();
})();
