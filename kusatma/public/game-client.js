(() => {
  const Engine = window.SiegeEngine;
  const Ai = window.SiegeAi;
  const CFG = window.SiegeConfig;
  const I18N = window.SiegeI18n;
  if (!Engine || !Ai || !CFG || !I18N) {
    console.error("Kuşatma: missing modules");
    return;
  }

  const { PLAYERS, PHASE, createGameState, applyAction, opponent, legalMovesFrom, ALL_EDGES, edgeEndpoints, cellCorners, SHIELD_BREAK_COST } = Engine;

  const SETTINGS_KEY = "kusatma_settings_v1";
  const $ = (id) => document.getElementById(id);

  const screens = {
    home: $("screen-home"),
    play: $("screen-play"),
    soloSetup: $("screen-solo-setup"),
    twoPSetup: $("screen-2p-setup"),
    remote: $("screen-remote"),
    settings: $("screen-settings"),
    help: $("screen-help"),
    scores: $("screen-scores"),
    game: $("screen-game"),
  };

  let settings = loadSettings();
  let setup = {
    mode: "solo",
    difficulty: settings.aiDifficulty || "medium",
    p1: settings.p1 || "",
    p2: settings.p2 || "",
  };

  /** @type {null | object} */
  let session = null;
  let selectedStone = null; // {r,c}
  let aiTimer = null;
  let hubBackCtl = null;

  const PAD = 8;
  const SPAN = 100 - PAD * 2;
  const STEP = SPAN / (Engine.N - 1);

  function xy(r, c) {
    return { x: PAD + c * STEP, y: PAD + r * STEP };
  }

  function loadSettings() {
    const defaults = { lang: "tr", aiDifficulty: "medium", p1: "", p2: "" };
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
    toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
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
    if ($("set-lang")) $("set-lang").value = lang();
    if ($("set-diff")) $("set-diff").value = settings.aiDifficulty || "medium";
    renderDiffGrid();
    if (hubBackCtl && hubBackCtl.refresh) hubBackCtl.refresh();
  }

  function renderDiffGrid() {
    const grid = $("diff-grid");
    if (!grid) return;
    const diffs = [
      { id: "easy", i18n: "diffEasy", hint: "diffEasyHint" },
      { id: "medium", i18n: "diffMedium", hint: "diffMediumHint" },
      { id: "hard", i18n: "diffHard", hint: "diffHardHint" },
    ];
    grid.innerHTML = "";
    for (const d of diffs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diff-card" + (setup.difficulty === d.id ? " is-on" : "");
      btn.innerHTML = `<strong>${t(d.i18n)}</strong><span>${t(d.hint)}</span>`;
      btn.addEventListener("click", () => {
        setup.difficulty = d.id;
        saveSettings({ aiDifficulty: d.id });
        renderDiffGrid();
      });
      grid.appendChild(btn);
    }
  }

  function renderScores() {
    if (!window.ArenaScore || !$("scores-panel")) return;
    window.ArenaScore.renderInto($("scores-panel"), {
      lang: lang(),
      gameId: "kusatma",
    });
  }

  function nameFor(player) {
    if (!session) return player === 1 ? t("player1") : t("player2");
    if (session.mode === "solo") {
      if (player === session.humanPlayer) return session.names.human || t("youAre");
      return t("computer");
    }
    return player === 1
      ? session.names.p1 || t("player1")
      : session.names.p2 || t("player2");
  }

  function isHumanTurn() {
    if (!session || !session.state) return false;
    if (session.state.phase === PHASE.GAME_OVER) return false;
    if (session.mode === "solo") return session.state.turn === session.humanPlayer;
    return true;
  }

  function startGame(mode) {
    clearTimeout(aiTimer);
    selectedStone = null;
    const state = createGameState(PLAYERS.P1);
    session = {
      mode,
      difficulty: setup.difficulty,
      humanPlayer: PLAYERS.P1,
      names: {
        human: ($("solo-name") && $("solo-name").value.trim()) || setup.p1,
        p1: ($("p1-name") && $("p1-name").value.trim()) || setup.p1,
        p2: ($("p2-name") && $("p2-name").value.trim()) || setup.p2,
      },
      state,
      scoreRecorded: false,
    };
    saveSettings({
      p1: session.names.p1 || session.names.human || "",
      p2: session.names.p2 || "",
    });
    $("game-over").classList.add("hidden");
    showScreen("game");
    renderAll();
    maybeAiTurn();
  }

  function renderAll() {
    if (!session) return;
    renderHud();
    renderBoard();
    renderHint();
    renderDeployActions();
    renderGameOver();
  }

  function renderHud() {
    const s = session.state;
    const hud = $("hud");
    const mk = (p) => {
      const active = s.turn === p && s.phase !== PHASE.GAME_OVER;
      return `<div class="hud-card p${p}${active ? " is-turn" : ""}">
        <div class="hud-name">${nameFor(p)} · ${p === 1 ? "○" : "△"}</div>
        <div class="hud-stats">
          <span>${t("score")}: <b style="color:inherit">${s.scores[p]}</b></span>
          <span>${t("stones")}: <b style="color:inherit">${Engine.countStones(s, p)}</b></span>
          <span>${t("shield")}: <b style="color:inherit">${s.shieldPoints[p]}</b></span>
        </div>
      </div>`;
    };
    hud.innerHTML = mk(1) + mk(2);
    const phase =
      s.phase === PHASE.DEPLOY
        ? t("phaseDeploy")
        : s.phase === PHASE.BATTLE
          ? t("phaseBattle")
          : t("gameOver");
    $("phase-pill").textContent = phase;
  }

  function renderHint() {
    const s = session.state;
    if (s.phase === PHASE.GAME_OVER) {
      $("game-hint").textContent = "";
      return;
    }
    if (s.phase === PHASE.DEPLOY) $("game-hint").textContent = t("actionHintDeploy");
    else $("game-hint").textContent = t("actionHintBattle");
  }

  function renderDeployActions() {
    const s = session.state;
    const box = $("deploy-actions");
    const show =
      s.phase === PHASE.DEPLOY &&
      s.pendingDeploy &&
      isHumanTurn() &&
      s.pendingDeploy.player === s.turn;
    box.classList.toggle("hidden", !show);
  }

  function renderGameOver() {
    const s = session.state;
    const box = $("game-over");
    if (s.phase !== PHASE.GAME_OVER) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    if (s.winner === "draw") $("go-result").textContent = t("draw");
    else $("go-result").textContent = `${t("winner")}: ${nameFor(s.winner)}`;
    const reasonKey = s.endReason ? `reason_${s.endReason}` : "";
    $("go-reason").textContent = reasonKey ? t(reasonKey) : "";
    maybeRecordScore();
  }

  function maybeRecordScore() {
    if (!session || !session.state || session.state.phase !== PHASE.GAME_OVER) return;
    if (session.scoreRecorded || !window.ArenaScore) return;
    session.scoreRecorded = true;
    const s = session.state;
    let result = "loss";
    if (s.winner === "draw") result = "draw";
    else if (session.mode === "solo") {
      result = s.winner === session.humanPlayer ? "win" : "loss";
    } else result = "win";
    window.ArenaScore.record({
      gameId: "kusatma",
      result,
      difficulty: session.mode === "solo" ? session.difficulty : "normal",
      mode: session.mode === "solo" ? "solo" : "local2p",
      stats: {
        score: s.scores[session.mode === "solo" ? session.humanPlayer : 1],
      },
    });
  }

  function colorFor(player) {
    return player === 1 ? "#00B4D8" : "#E63946";
  }

  function renderBoard() {
    const s = session.state;
    const svg = $("board");
    const NS = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Cells
    for (let i = 0; i < Engine.C; i++) {
      for (let j = 0; j < Engine.C; j++) {
        const owner = s.cellOwner[i][j];
        if (!owner) continue;
        const a = xy(i, j);
        const b = xy(i + 1, j + 1);
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", a.x);
        rect.setAttribute("y", a.y);
        rect.setAttribute("width", b.x - a.x);
        rect.setAttribute("height", b.y - a.y);
        rect.setAttribute("fill", colorFor(owner));
        rect.setAttribute("class", "cell-fill");
        svg.appendChild(rect);
        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", (a.x + b.x) / 2);
        label.setAttribute("y", (a.y + b.y) / 2 + 1.1);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", colorFor(owner));
        label.setAttribute("class", "cell-mark");
        label.textContent = owner === 1 ? "○" : "△";
        svg.appendChild(label);
      }
    }

    // Edges (visual + hit)
    for (const id of ALL_EDGES) {
      const ends = edgeEndpoints(id);
      if (!ends) continue;
      const [p0, p1] = ends;
      const a = xy(p0[0], p0[1]);
      const b = xy(p1[0], p1[1]);
      const drawn = s.edgeDrawn[id];
      const insured = s.edgeInsured[id];

      const hit = document.createElementNS(NS, "line");
      hit.setAttribute("x1", a.x);
      hit.setAttribute("y1", a.y);
      hit.setAttribute("x2", b.x);
      hit.setAttribute("y2", b.y);
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", "7");
      hit.setAttribute("stroke-linecap", "round");
      hit.setAttribute("class", "edge-hit");
      hit.dataset.edge = id;
      if (!drawn && s.phase === PHASE.BATTLE) {
        hit.addEventListener("click", () => onEdgeClick(id));
      }
      svg.appendChild(hit);

      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("class", "edge-line");
      if (drawn) {
        // drawn by last mover approx: use lastMove or neutral bright
        const who =
          s.lastMove && s.lastMove.edgeId === id ? s.lastMove.player : null;
        line.setAttribute("stroke", who ? colorFor(who) : "#c4b7c5");
        line.setAttribute("stroke-width", "1.35");
      } else if (insured) {
        line.setAttribute("stroke", "#FFB703");
        line.setAttribute("stroke-width", "1.5");
        line.setAttribute("stroke-dasharray", "2 1.2");
      } else {
        line.setAttribute("stroke", "#9A8C98");
        line.setAttribute("stroke-width", "0.55");
        line.setAttribute("opacity", "0.55");
      }
      svg.appendChild(line);
    }

    // Nodes
    for (let r = 0; r < Engine.N; r++) {
      for (let c = 0; c < Engine.N; c++) {
        const p = xy(r, c);
        const owner = s.nodes[r][c];
        const pend =
          s.pendingDeploy && s.pendingDeploy.r === r && s.pendingDeploy.c === c;

        const hit = document.createElementNS(NS, "circle");
        hit.setAttribute("cx", p.x);
        hit.setAttribute("cy", p.y);
        hit.setAttribute("r", "4.2");
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("class", "node-hit");
        hit.addEventListener("click", () => onNodeClick(r, c));
        svg.appendChild(hit);

        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", p.x);
        dot.setAttribute("cy", p.y);
        dot.setAttribute("r", owner || pend ? "2.35" : "1.15");
        if (owner) {
          dot.setAttribute("fill", colorFor(owner));
          if (selectedStone && selectedStone.r === r && selectedStone.c === c) {
            dot.setAttribute("stroke", "#fff");
            dot.setAttribute("stroke-width", "0.55");
          }
        } else if (pend) {
          dot.setAttribute("fill", colorFor(s.pendingDeploy.player));
          dot.setAttribute("opacity", "0.55");
          dot.setAttribute("stroke", "#FFB703");
          dot.setAttribute("stroke-width", "0.4");
        } else {
          dot.setAttribute("fill", "#4A4E69");
        }
        svg.appendChild(dot);

        if (owner) {
          const mark = document.createElementNS(NS, "text");
          mark.setAttribute("x", p.x);
          mark.setAttribute("y", p.y + 1.05);
          mark.setAttribute("text-anchor", "middle");
          mark.setAttribute("fill", "#0a0a0e");
          mark.setAttribute("font-size", "2.6");
          mark.setAttribute("font-weight", "700");
          mark.style.pointerEvents = "none";
          mark.textContent = owner === 1 ? "○" : "△";
          svg.appendChild(mark);
        }
      }
    }

    // Move highlights
    if (selectedStone && s.phase === PHASE.BATTLE && isHumanTurn()) {
      for (const m of legalMovesFrom(s, selectedStone.r, selectedStone.c)) {
        const p = xy(m.r, m.c);
        const ring = document.createElementNS(NS, "circle");
        ring.setAttribute("cx", p.x);
        ring.setAttribute("cy", p.y);
        ring.setAttribute("r", "2.8");
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", colorFor(s.turn));
        ring.setAttribute("stroke-width", "0.45");
        ring.setAttribute("opacity", "0.9");
        ring.style.pointerEvents = "none";
        svg.appendChild(ring);
      }
    }
  }

  function onEdgeClick(edgeId) {
    if (!session || !isHumanTurn()) return;
    const s = session.state;
    if (s.phase !== PHASE.BATTLE) return;
    selectedStone = null;
    if (s.edgeInsured[edgeId] && s.shieldPoints[s.turn] < SHIELD_BREAK_COST) {
      toast(t("insuredHint"));
      return;
    }
    const r = applyAction(s, s.turn, { type: "DRAW_LINE", edgeId });
    if (!r.ok) {
      toast(r.error || t("toastInvalid"));
      return;
    }
    session.state = r.state;
    renderAll();
    maybeAiTurn();
  }

  function onNodeClick(r, c) {
    if (!session || !isHumanTurn()) return;
    const s = session.state;
    const player = s.turn;

    if (s.phase === PHASE.DEPLOY) {
      const res = applyAction(s, player, { type: "PLACE_SELECT", r, c });
      if (!res.ok) {
        toast(res.error || t("toastInvalid"));
        return;
      }
      session.state = res.state;
      renderAll();
      return;
    }

    if (s.phase !== PHASE.BATTLE) return;

    // Select own stone or move to highlight
    if (s.nodes[r][c] === player) {
      selectedStone = { r, c };
      renderBoard();
      return;
    }

    if (selectedStone && s.nodes[r][c] === 0) {
      const res = applyAction(s, player, {
        type: "MOVE_PIECE",
        from: { ...selectedStone },
        to: { r, c },
      });
      selectedStone = null;
      if (!res.ok) {
        toast(res.error || t("toastInvalid"));
        renderBoard();
        return;
      }
      session.state = res.state;
      renderAll();
      maybeAiTurn();
      return;
    }

    selectedStone = null;
    renderBoard();
  }

  function maybeAiTurn() {
    clearTimeout(aiTimer);
    if (!session || session.mode !== "solo") return;
    const s = session.state;
    if (s.phase === PHASE.GAME_OVER) return;
    if (s.turn === session.humanPlayer) return;

    toast(t("toastAi"));
    aiTimer = setTimeout(() => {
      runAiStep();
    }, s.phase === PHASE.DEPLOY ? 280 : 420);
  }

  function runAiStep() {
    if (!session || session.mode !== "solo") return;
    const s = session.state;
    if (s.phase === PHASE.GAME_OVER) return;
    if (s.turn === session.humanPlayer) return;

    const action = Ai.chooseMove(s, s.turn, session.difficulty);
    if (!action) return;
    const r = applyAction(s, s.turn, action);
    if (!r.ok) {
      console.warn("AI invalid", action, r.error);
      return;
    }
    session.state = r.state;
    selectedStone = null;
    renderAll();

    // Deploy: select then confirm on next tick; battle extra turns
    if (session.state.phase !== PHASE.GAME_OVER && session.state.turn !== session.humanPlayer) {
      aiTimer = setTimeout(runAiStep, session.state.phase === PHASE.DEPLOY ? 200 : 380);
    }
  }

  // --- Navigation ---
  $("btn-home-play").addEventListener("click", () => showScreen("play"));
  $("btn-home-scores").addEventListener("click", () => {
    renderScores();
    showScreen("scores");
  });
  $("btn-home-settings").addEventListener("click", () => showScreen("settings"));
  $("btn-home-help").addEventListener("click", () => showScreen("help"));
  $("btn-scores-back").addEventListener("click", () => showScreen("home"));
  $("btn-play-back").addEventListener("click", () => showScreen("home"));
  $("btn-solo-back").addEventListener("click", () => showScreen("play"));
  $("btn-2p-back").addEventListener("click", () => showScreen("play"));
  $("btn-remote-back").addEventListener("click", () => showScreen("play"));
  $("btn-settings-back").addEventListener("click", () => showScreen("home"));
  $("btn-help-back").addEventListener("click", () => showScreen("home"));

  $("btn-mode-solo").addEventListener("click", () => {
    setup.mode = "solo";
    showScreen("soloSetup");
  });
  $("btn-mode-2p").addEventListener("click", () => {
    setup.mode = "twop";
    showScreen("twoPSetup");
  });
  $("btn-mode-remote").addEventListener("click", () => showScreen("remote"));

  $("btn-solo-start").addEventListener("click", () => startGame("solo"));
  $("btn-2p-start").addEventListener("click", () => startGame("twop"));

  $("btn-deploy-confirm").addEventListener("click", () => {
    if (!session || !isHumanTurn()) return;
    const s = session.state;
    const r = applyAction(s, s.turn, { type: "PLACE_CONFIRM" });
    if (!r.ok) {
      toast(r.error || t("toastInvalid"));
      return;
    }
    session.state = r.state;
    renderAll();
    maybeAiTurn();
  });
  $("btn-deploy-cancel").addEventListener("click", () => {
    if (!session || !isHumanTurn()) return;
    const s = session.state;
    const r = applyAction(s, s.turn, { type: "PLACE_CANCEL" });
    if (!r.ok) return;
    session.state = r.state;
    renderAll();
  });

  $("btn-resign").addEventListener("click", () => {
    if (!session || session.state.phase === PHASE.GAME_OVER) return;
    const p = session.mode === "solo" ? session.humanPlayer : session.state.turn;
    const r = applyAction(session.state, p, { type: "RESIGN" });
    if (!r.ok) return;
    session.state = r.state;
    renderAll();
  });

  $("btn-game-back").addEventListener("click", () => {
    if (session && session.state.phase !== PHASE.GAME_OVER) {
      if (!confirm(lang() === "en" ? "Leave the match?" : "Maçtan çıkılsın mı?")) return;
    }
    clearTimeout(aiTimer);
    session = null;
    showScreen("home");
  });

  $("btn-again").addEventListener("click", () => {
    if (!session) return;
    startGame(session.mode);
  });
  $("btn-to-menu").addEventListener("click", () => {
    session = null;
    showScreen("home");
  });

  $("set-lang").addEventListener("change", (e) => {
    saveSettings({ lang: e.target.value });
    applyI18n();
  });
  $("set-diff").addEventListener("change", (e) => {
    setup.difficulty = e.target.value;
    saveSettings({ aiDifficulty: e.target.value });
  });

  if (window.ArenaHubBack) {
    hubBackCtl = window.ArenaHubBack.bind({ getLang: lang });
  }
  if (window.ArenaSW && window.ArenaSW.register) {
    try {
      window.ArenaSW.register("./sw.js");
    } catch (_) {}
  }

  applyI18n();
  showScreen("home");
})();
