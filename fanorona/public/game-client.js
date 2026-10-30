(() => {
  const E = window.FanoronaEngine;
  const Ai = window.FanoronaAi;
  const CFG = window.FanoronaConfig;
  const I18N = window.FanoronaI18n;
  const P2P = window.FanoronaP2P;
  if (!E || !Ai || !CFG || !I18N || !P2P) {
    console.error("Fanorona: missing modules");
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
    opponent,
  } = E;

  const SETTINGS_KEY = "fanorona_settings";
  const SEEN_VER_KEY = "fanorona_seen_version";
  const STARTER_KEY = "fanorona_next_starter";

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
  let selected = null;
  let pendingChoice = null; // { from, to, options: moves[] }
  let aiTimer = null;
  let boardReady = false;
  let p2p = null;
  let p2pLobby = null;
  let hubBackCtl = null;
  let moveFlashTimer = null;
  const Sfx = window.DncrMoveSfx || null;

  function playMoveSfx(kind) {
    if (!Sfx) return;
    Sfx.unlock();
    Sfx.play(kind || "move");
  }

  function loadSettings() {
    const defaults = {
      lang: "tr",
      aiDifficulty: "normal",
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
    if ($("settings-version")) $("settings-version").textContent = ver;
    if ($("updates-current"))
      $("updates-current").textContent = `${CFG.version} (${CFG.build})`;
    renderChangelog();
    updateUpdatesDot();
    renderDiffGrid();
    if (hubBackCtl && hubBackCtl.refresh) hubBackCtl.refresh();
  }

  function renderScores() {
    if (!window.ArenaScore || !$("scores-panel")) return;
    window.ArenaScore.renderInto($("scores-panel"), {
      lang: lang(),
      gameId: "fanorona",
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
    const cw = (session.state.capturedBy && session.state.capturedBy.white) || 0;
    const cb = (session.state.capturedBy && session.state.capturedBy.black) || 0;
    const chW = (session.state.chainsBy && session.state.chainsBy.white) || 0;
    const chB = (session.state.chainsBy && session.state.chainsBy.black) || 0;
    const myCaps =
      session.mode === "solo" || session.you === PLAYERS.white
        ? cw
        : session.mode === "p2p"
          ? session.you === PLAYERS.white
            ? cw
            : cb
          : Math.max(cw, cb);
    const myChains =
      session.mode === "twop"
        ? Math.max(chW, chB)
        : session.mode === "solo" || session.you === PLAYERS.white
          ? chW
          : chB;
    window.ArenaScore.record({
      gameId: "fanorona",
      result: session.mode === "twop" ? "win" : result,
      difficulty: session.difficulty || settings.aiDifficulty || "normal",
      mode: session.mode === "twop" ? "twop" : session.mode,
      stats: {
        captures: myCaps,
        chains: myChains,
      },
    });
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
      if (v === PLAYERS.white || v === PLAYERS.black) return v;
    } catch (_) {}
    return PLAYERS.white;
  }

  function writeNextStarter(starter) {
    try {
      localStorage.setItem(STARTER_KEY, opponent(starter));
    } catch (_) {}
  }

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
      ring.setAttribute("r", 1.7);
      ring.setAttribute("class", "node-ring");
      ring.dataset.node = id;
      nodes.appendChild(ring);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("cx", p.x);
      hit.setAttribute("cy", p.y);
      hit.setAttribute("r", 4.2);
      hit.setAttribute("class", "node-hit");
      hit.dataset.node = id;
      hit.addEventListener("click", () => onNodeClick(id));
      nodes.appendChild(hit);
    }
    boardReady = true;
  }

  function makePiece(owner, x, y, selectedNode) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute(
      "class",
      `piece ${owner}-piece${selectedNode ? " selected" : ""}`
    );
    const skin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    skin.setAttribute("class", "skin");
    skin.setAttribute("cx", x);
    skin.setAttribute("cy", y);
    skin.setAttribute("r", 3.15);
    skin.setAttribute(
      "fill",
      owner === PLAYERS.white ? "url(#whiteFill)" : "url(#blackFill)"
    );
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    mark.setAttribute("x", x - 1.05);
    mark.setAttribute("y", y - 1.05);
    mark.setAttribute("width", 2.1);
    mark.setAttribute("height", 2.1);
    mark.setAttribute("rx", 0.25);
    mark.setAttribute(
      "fill",
      owner === PLAYERS.white ? "rgba(90,50,20,0.35)" : "rgba(255,230,180,0.28)"
    );
    mark.setAttribute("pointer-events", "none");
    const gloss = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    gloss.setAttribute("cx", x - 0.9);
    gloss.setAttribute("cy", y - 1.05);
    gloss.setAttribute("r", 0.85);
    gloss.setAttribute("fill", "rgba(255,255,255,0.28)");
    gloss.setAttribute("pointer-events", "none");
    g.appendChild(skin);
    g.appendChild(mark);
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

  function showHints(targets, captureMode) {
    clearHints();
    const g = $("board-hints");
    for (const to of targets) {
      const p = POSITIONS[to];
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", 1.9);
      c.setAttribute("class", captureMode ? "hint-dot hint-remove" : "hint-dot");
      g.appendChild(c);
    }
  }

  function showBanner(text) {
    const el = $("mill-banner");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(showBanner._t);
    showBanner._t = setTimeout(() => el.classList.add("hidden"), 900);
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function svgPointToWrap(nodeId) {
    const svg = $("board");
    const wrap = document.querySelector("#screen-game .board-wrap");
    const p = POSITIONS[nodeId];
    if (!svg || !wrap || !p) return null;
    try {
      const pt = svg.createSVGPoint();
      pt.x = p.x;
      pt.y = p.y;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const screen = pt.matrixTransform(ctm);
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        leftPct: ((screen.x - rect.left) / rect.width) * 100,
        topPct: ((screen.y - rect.top) / rect.height) * 100,
        sizePx: Math.max(22, rect.width * 0.065),
      };
    } catch (_) {
      return null;
    }
  }

  function flashMoveNode(nodeId, owner) {
    if (!nodeId) return;
    clearTimeout(moveFlashTimer);
    document.querySelectorAll(".piece.move-flash").forEach((el) => {
      el.classList.remove("move-flash", "move-flash-red", "move-flash-black", "move-flash-white");
    });
    const el = document.querySelector(`.piece[data-node="${nodeId}"]`);
    if (!el) return;
    el.classList.add("move-flash");
    if (owner === PLAYERS.white) el.classList.add("move-flash-white", "move-flash-red");
    else el.classList.add("move-flash-black");
    const skin = el.querySelector(".skin");
    if (skin) {
      skin.dataset.prevFill = skin.getAttribute("fill") || "";
      skin.setAttribute("fill", owner === PLAYERS.white ? "#ffe0a8" : "#b0bec5");
      skin.setAttribute("stroke", "#fff8e1");
      skin.setAttribute("stroke-width", "0.9");
    }
    moveFlashTimer = setTimeout(() => {
      document.querySelectorAll(".piece.move-flash").forEach((p) => {
        p.classList.remove("move-flash", "move-flash-red", "move-flash-black", "move-flash-white");
        const sk = p.querySelector(".skin");
        if (sk) {
          const prev = sk.dataset.prevFill;
          if (prev) sk.setAttribute("fill", prev);
          else sk.removeAttribute("fill");
          sk.removeAttribute("stroke");
          sk.removeAttribute("stroke-width");
          delete sk.dataset.prevFill;
        }
      });
      if (session) renderPieces(session.state.board);
      moveFlashTimer = null;
    }, 1000);
  }

  function flashCapturedNodes(nodeIds) {
    const fx = $("board-fx");
    if (!fx || !nodeIds || !nodeIds.length) return;
    fx.innerHTML = "";
    for (const id of nodeIds) {
      const pos = POSITIONS[id];
      if (!pos) continue;
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", pos.x);
      ring.setAttribute("cy", pos.y);
      ring.setAttribute("r", "4.2");
      ring.setAttribute("class", "mill-ring capture-ring");
      fx.appendChild(ring);
    }
    setTimeout(() => {
      if (fx) fx.innerHTML = "";
    }, 700);
  }

  async function animateEjectPiece(nodeId, owner) {
    const layer = $("board-fx-html");
    const loc = svgPointToWrap(nodeId);
    if (!layer || !loc || !owner) return;
    const orb = document.createElement("div");
    orb.className = `eject-orb from-${owner === PLAYERS.white ? "red" : "black"}`;
    orb.style.left = `${loc.leftPct}%`;
    orb.style.top = `${loc.topPct}%`;
    orb.style.width = `${loc.sizePx}px`;
    orb.style.height = `${loc.sizePx}px`;
    orb.style.marginLeft = `${-loc.sizePx / 2}px`;
    orb.style.marginTop = `${-loc.sizePx / 2}px`;
    layer.appendChild(orb);
    await waitMs(40);
    orb.classList.add("is-charged");
    await waitMs(180);
    const dirX = Math.random() > 0.5 ? 1 : -1;
    const dx = dirX * (140 + Math.random() * 120);
    const dy = -(110 + Math.random() * 130);
    if (typeof orb.animate === "function") {
      const anim = orb.animate(
        [
          { transform: "translate(0,0) scale(1.2) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(${(dx * 0.4).toFixed(0)}px, ${(dy * 0.45).toFixed(0)}px) scale(1) rotate(70deg)`,
            opacity: 1,
            offset: 0.38,
          },
          {
            transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(0.28) rotate(${dirX * 220}deg)`,
            opacity: 0,
          },
        ],
        { duration: 880, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)", fill: "forwards" }
      );
      await anim.finished.catch(() => waitMs(880));
    } else {
      await waitMs(880);
    }
    if (orb.parentNode) orb.parentNode.removeChild(orb);
  }

  function teamLabel(p) {
    return p === PLAYERS.white ? t("white") : t("black");
  }

  function controllingPlayer() {
    if (!session) return null;
    if (session.mode === "solo") return PLAYERS.white;
    if (session.mode === "twop") return session.state.turn;
    if (session.mode === "p2p") return session.you;
    return null;
  }

  function canAct() {
    if (!session || session.state.winner) return false;
    if (pendingChoice) return true;
    if (session.mode === "solo") {
      return session.state.turn === PLAYERS.white && !session.aiThinking;
    }
    if (session.mode === "twop") return true;
    if (session.mode === "p2p") {
      return session.you === session.state.turn && session.status === "playing";
    }
    return false;
  }

  function updateChoiceUi() {
    const bar = $("capture-choice");
    if (!bar) return;
    if (!pendingChoice) {
      bar.classList.add("hidden");
      bar.innerHTML = "";
      return;
    }
    bar.classList.remove("hidden");
    bar.innerHTML = "";
    const title = document.createElement("p");
    title.textContent = t("phaseChoose");
    bar.appendChild(title);
    const row = document.createElement("div");
    row.className = "capture-choice-row";
    for (const opt of pendingChoice.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary btn-choice";
      btn.textContent =
        opt.method === "approach" ? t("chooseApproach") : t("chooseWithdraw");
      btn.addEventListener("click", () => {
        const choice = pendingChoice;
        pendingChoice = null;
        updateChoiceUi();
        applyAction({
          type: "capture",
          from: choice.from,
          to: choice.to,
          method: opt.method,
        });
      });
      row.appendChild(btn);
    }
    bar.appendChild(row);
  }

  function renderGame() {
    if (!session) return;
    const s = session.state;
    renderPieces(s.board);
    updateHints();
    updateChoiceUi();

    const onW = countPieces(s.board, PLAYERS.white);
    const onB = countPieces(s.board, PLAYERS.black);
    $("score-red").textContent = String(onW);
    $("score-black").textContent = String(onB);
    $("name-chip-red").textContent = session.names.white;
    $("name-chip-black").textContent = session.names.black;

    const capW = (s.capturedBy && s.capturedBy.white) || 0;
    const capB = (s.capturedBy && s.capturedBy.black) || 0;
    $("meta-red").textContent = `${capW} ${t("captured")}`;
    $("meta-black").textContent = `${capB} ${t("captured")}`;

    $("chip-red").classList.toggle("active", s.turn === PLAYERS.white && !s.winner);
    $("chip-black").classList.toggle("active", s.turn === PLAYERS.black && !s.winner);

    let phaseText = "";
    if (s.winner) phaseText = t("gameOver");
    else if (pendingChoice) phaseText = t("phaseChoose");
    else if (s.chain) phaseText = t("phaseChain");
    else {
      const moves = getAllLegalMoves(s, s.turn);
      phaseText =
        moves.length && moves[0].type === "capture" ? t("phaseCapture") : t("phaseMove");
    }
    $("phase-label").textContent = phaseText;

    const mine = canAct();
    if (s.winner) $("status-msg").textContent = "";
    else if (session.aiThinking) $("status-msg").textContent = t("statusCpu");
    else if (!mine && session.mode !== "twop" && !pendingChoice)
      $("status-msg").textContent = t("statusOpp");
    else if (pendingChoice) $("status-msg").textContent = t("statusChoose");
    else if (s.chain) $("status-msg").textContent = t("statusChain");
    else {
      const moves = getAllLegalMoves(s, s.turn);
      $("status-msg").textContent =
        moves.length && moves[0].type === "capture"
          ? t("statusCapture")
          : t("statusMove");
    }

    const end = $("end-panel");
    if (s.winner) {
      maybeRecordScore();
      end.classList.remove("hidden");
      if (session.mode === "solo") {
        $("end-text").textContent =
          s.winner === PLAYERS.white ? t("winYou") : t("winCpu");
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
    if (!session || !canAct() || pendingChoice) {
      clearHints();
      return;
    }
    const s = session.state;
    const actor = session.mode === "twop" ? s.turn : controllingPlayer();
    const moves = getAllLegalMoves(s, actor);
    const isCap = moves.some((m) => m.type === "capture");
    if (s.chain) {
      showHints(
        moves.filter((m) => m.from === s.chain.piece).map((m) => m.to),
        true
      );
      return;
    }
    if (selected) {
      showHints(
        moves.filter((m) => m.from === selected).map((m) => m.to),
        isCap
      );
    } else if (isCap) {
      // Alma zorunlu: oynanabilir taşları işaretle
      const froms = [...new Set(moves.map((m) => m.from))];
      showHints(froms, true);
    } else clearHints();
  }

  async function applyAction(action, opts) {
    if (!session) return;
    const fromNet = opts && opts.fromNet;
    const actor = session.state.turn;
    if (!fromNet && session.mode === "p2p" && actor !== session.you) {
      toast(t("notYourTurn"));
      return;
    }

    const hadChain = !!session.state.chain;
    const r = tryAction(session.state, actor, action);
    if (!r.ok) {
      if (!fromNet) toast(r.error);
      return;
    }

    // Yaklaşma / uzaklaşma belirsiz — tahta değişmez, UI seçimi bekler
    if (r.state.phase === "choose" && r.state.pendingChoices && r.state.pendingChoices.length > 1) {
      pendingChoice = {
        from: action.from || r.state.pendingChoices[0].from,
        to: action.to || r.state.pendingChoices[0].to,
        options: r.state.pendingChoices,
      };
      renderGame();
      return;
    }

    const captured = (r.state.lastMove && r.state.lastMove.captured) || [];
    const capturedOwner = captured.length ? opponent(actor) : null;
    const stillChain = !!r.state.chain;
    session.state = r.state;
    selected = stillChain && r.state.chain ? r.state.chain.piece : null;
    pendingChoice = null;

    if (captured.length) {
      playMoveSfx("capture");
      showBanner(hadChain || stillChain ? t("chainBanner") : t("captureBanner"));
      flashCapturedNodes(captured);
    } else {
      playMoveSfx("move");
    }

    renderGame();
    if (r.state.lastMove && r.state.lastMove.to) {
      flashMoveNode(r.state.lastMove.to, actor);
    }

    const ejects = captured.map((id) => animateEjectPiece(id, capturedOwner));
    if (ejects.length) await Promise.all(ejects);

    if (session.mode === "p2p" && !fromNet && p2p) {
      p2p.send({ type: "action", action, moveCount: r.state.moveCount });
    }

    if (
      session.mode === "solo" &&
      !session.state.winner &&
      session.state.turn === PLAYERS.black
    ) {
      scheduleAi(captured.length ? 280 : 480);
    } else if (
      session.mode === "solo" &&
      !session.state.winner &&
      session.state.turn === PLAYERS.white &&
      session.state.chain &&
      session.state.chain.piece
    ) {
      // human continues chain — no AI
    }
  }

  function onNodeClick(nodeId) {
    if (!session || session.state.winner) return;
    if (pendingChoice) {
      toast(t("statusChoose"));
      return;
    }
    if (!canAct()) {
      if (session.mode === "solo") toast(t("statusCpu"));
      else toast(t("notYourTurn"));
      return;
    }
    const s = session.state;
    const actor = session.mode === "twop" ? s.turn : controllingPlayer();
    const moves = getAllLegalMoves(s, actor);

    if (s.chain) {
      const m = moves.find((x) => x.from === s.chain.piece && x.to === nodeId);
      if (m) applyAction(m);
      return;
    }

    if (selected) {
      const opts = moves.filter((x) => x.from === selected && x.to === nodeId);
      if (opts.length === 1) {
        applyAction(opts[0]);
        return;
      }
      if (opts.length > 1) {
        pendingChoice = { from: selected, to: nodeId, options: opts };
        renderGame();
        return;
      }
      if (s.board[nodeId] === actor) {
        const mine = moves.filter((x) => x.from === nodeId);
        if (mine.length) {
          selected = nodeId;
          renderGame();
        }
        return;
      }
      selected = null;
      renderGame();
      return;
    }

    if (s.board[nodeId] === actor) {
      const mine = moves.filter((x) => x.from === nodeId);
      if (!mine.length) {
        toast(t("statusCapture"));
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
        difficulty: session.difficulty || "normal",
      });
      session.aiThinking = false;
      if (pick) applyAction(pick);
      else renderGame();
    }, delay);
  }

  function startSolo() {
    clearTimeout(aiTimer);
    destroyP2P();
    pendingChoice = null;
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "solo",
      difficulty: setupDiff,
      names: {
        white: t("you"),
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
    pendingChoice = null;
    const p1 = ($("p1-name").value || "").trim() || t("player1Ph");
    const p2 = ($("p2-name").value || "").trim() || t("player2Ph");
    saveSettings({ p1, p2 });
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "twop",
      names: { white: p1, black: p2 },
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
    $("name-red").textContent = p2pLobby.names.white || "—";
    $("name-black").textContent = p2pLobby.names.black || t("waitingGuest");
    $("ready-red").textContent = p2pLobby.ready.white ? t("readyOn") : t("waiting");
    $("ready-red").classList.toggle("on", !!p2pLobby.ready.white);
    $("ready-black").textContent = p2pLobby.guestJoined
      ? p2pLobby.ready.black
        ? t("readyOn")
        : t("waiting")
      : "—";
    $("ready-black").classList.toggle("on", !!p2pLobby.ready.black);
    const btn = $("btn-ready");
    btn.disabled = !p2pLobby.guestJoined;
    const iAmReady =
      p2pLobby.you === "white" ? p2pLobby.ready.white : p2pLobby.ready.black;
    btn.textContent = iAmReady ? t("readyOn") : t("ready");
    $("share-hint").textContent =
      p2pLobby.you === "white"
        ? `${t("shareHintHost")} ${p2pLobby.code}`
        : t("shareHintGuest");
  }

  function maybeStartP2PGame() {
    if (!p2pLobby || !p2pLobby.guestJoined) return;
    if (!p2pLobby.ready.white || !p2pLobby.ready.black) return;
    if (p2pLobby.you !== "white") return;
    const starter = p2pLobby.nextStarter || PLAYERS.white;
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
    pendingChoice = null;
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
    sessionP2P.on("disconnected", () => toast(t("disconnect")));
    sessionP2P.on("error", (msg) => {
      toast(typeof msg === "string" ? msg : t("peerFail"));
    });
    sessionP2P.on("message", (data) => {
      if (!data || !data.type) return;
      if (data.type === "hello") {
        if (p2pLobby.you === "white" && data.role === "guest") {
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
        beginP2PGame(createGameState(data.starter), p2pLobby.names);
      } else if (data.type === "action") {
        if (!session || session.mode !== "p2p") return;
        if (data.moveCount !== session.state.moveCount + 1) return;
        applyAction(data.action, { fromNet: true });
      } else if (data.type === "rematch-ask") {
        p2pLobby.ready = { white: false, black: false };
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
      p2p = window.ArenaP2P
        ? ArenaP2P.createSession({
            prefix: "fanorona",
            transport: ArenaP2P.getTransport(),
          })
        : new P2P.P2PSession();
      bindP2PHandlers(p2p);
      const code = await p2p.host();
      p2pLobby = {
        code,
        you: "white",
        names: { white: name, black: null },
        ready: { white: false, black: false },
        guestJoined: false,
        nextStarter: PLAYERS.white,
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
      p2p = window.ArenaP2P
        ? ArenaP2P.createSession({
            prefix: "fanorona",
            transport: ArenaP2P.getTransport(),
          })
        : new P2P.P2PSession();
      bindP2PHandlers(p2p);
      await p2p.join(code);
      p2pLobby = {
        code,
        you: "black",
        names: { white: "—", black: name },
        ready: { white: false, black: false },
        guestJoined: false,
        nextStarter: PLAYERS.white,
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
    const diff = settings.aiDifficulty || "normal";
    document.querySelectorAll('input[name="defDiff"]').forEach((r) => {
      r.checked = r.value === diff;
    });
    if ($("p1-name")) $("p1-name").value = settings.p1 || "";
    if ($("p2-name")) $("p2-name").value = settings.p2 || "";
    if ($("p2p-name")) $("p2p-name").value = settings.name || "";
    if ($("settings-display-name") && window.ArenaScore) {
      const store = window.ArenaScore.load();
      $("settings-display-name").value =
        store.displayName || settings.name || "";
    }
  }

  function goHome() {
    clearTimeout(aiTimer);
    selected = null;
    pendingChoice = null;
    session = null;
    destroyP2P();
    showScreen("home");
  }

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
    saveSettings({
      lang: selectedLang,
      aiDifficulty: ["easy", "normal", "hard", "veryhard"].includes(selectedDiff)
        ? selectedDiff
        : "normal",
      name: displayName.trim() || settings.name,
    });
    if (window.ArenaScore) window.ArenaScore.setDisplayName(displayName);
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
    showScreen("settings");
  });

  $("btn-game-back").addEventListener("click", () => {
    if (session && session.mode === "p2p" && p2pLobby) {
      session = null;
      pendingChoice = null;
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
      p2pLobby.ready = { white: false, black: false };
      p2p.send({ type: "rematch-ask", who: p2pLobby.you });
      session = null;
      pendingChoice = null;
      showScreen("room");
      renderRoom();
    }
  });

  $("btn-rematch").addEventListener("click", () => {
    $("btn-game-restart").click();
  });

  if (Sfx && Sfx.bindFirstGesture) Sfx.bindFirstGesture(document);
  if (window.ArenaHubBack) {
    hubBackCtl = window.ArenaHubBack.bind({ getLang: lang });
  }
  applyI18n();
  if (window.ArenaP2P && ArenaP2P.initTransportUi) ArenaP2P.initTransportUi();
  fillSettingsForm();
  initBoardSvg();
  if (window.ArenaSW) window.ArenaSW.register("./sw.js");
})();
