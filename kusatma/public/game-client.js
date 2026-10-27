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
    tutorialMenu: $("screen-tutorial-menu"),
    soloSetup: $("screen-solo-setup"),
    twoPSetup: $("screen-2p-setup"),
    p2p: $("screen-p2p"),
    settings: $("screen-settings"),
    help: $("screen-help"),
    scores: $("screen-scores"),
    game: $("screen-game"),
  };

  let p2pSession = null;
  let p2pLobby = null;

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
  let tutorialCtl = null;
  let fxBusy = false;
  let demo = null; // { index, busy }
  const Audio = window.SiegeAudio || null;
  const DemoMatch = window.SiegeDemoMatch || null;

  // Kenarlardan uzak tut: köşe tıklamaları düğüme gitsin
  const PAD = 10;
  const SPAN = 100 - PAD * 2;
  const STEP = SPAN / (Engine.N - 1);
  const NODE_HIT_R = 7.2;
  const NODE_PICK_R = 8.5;
  const EDGE_INSET = 3.2; // kenar hit uçlarını düğüm merkezinden içeri çek
  const EDGE_PICK_MAX = 5.5;

  function xy(r, c) {
    return { x: PAD + c * STEP, y: PAD + r * STEP };
  }

  function clientToSvg(svg, clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
  }

  function distPointToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    // Uçlara yakın bölgeyi düğüme bırak (köşe çakışması)
    const insetT = EDGE_INSET / Math.sqrt(len2);
    if (t < insetT || t > 1 - insetT) return Infinity;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  function insetEdgeEnds(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = (dx / len) * EDGE_INSET;
    const uy = (dy / len) * EDGE_INSET;
    return {
      a: { x: a.x + ux, y: a.y + uy },
      b: { x: b.x - ux, y: b.y - uy },
    };
  }

  function pickBoardTarget(svgX, svgY, state) {
    let bestNode = null;
    let bestNodeD = NODE_PICK_R;
    for (let r = 0; r < Engine.N; r++) {
      for (let c = 0; c < Engine.N; c++) {
        const p = xy(r, c);
        const d = Math.hypot(svgX - p.x, svgY - p.y);
        if (d <= bestNodeD) {
          bestNodeD = d;
          bestNode = { type: "node", r, c, d };
        }
      }
    }
    if (bestNode) return bestNode;

    if (state.phase !== PHASE.BATTLE) return null;

    let bestEdge = null;
    let bestEdgeD = EDGE_PICK_MAX;
    for (const id of ALL_EDGES) {
      if (state.edgeDrawn[id]) continue;
      const ends = edgeEndpoints(id);
      if (!ends) continue;
      const a0 = xy(ends[0][0], ends[0][1]);
      const b0 = xy(ends[1][0], ends[1][1]);
      const { a, b } = insetEdgeEnds(a0, b0);
      const d = distPointToSeg(svgX, svgY, a.x, a.y, b.x, b.y);
      if (d < bestEdgeD) {
        bestEdgeD = d;
        bestEdge = { type: "edge", edgeId: id, d };
      }
    }
    return bestEdge;
  }

  function onBoardPointer(ev) {
    if (!session || fxBusy || session.mode === "demo") return;
    if (ev.button != null && ev.button !== 0) return;
    const svg = $("board");
    if (!svg) return;
    const pt = clientToSvg(svg, ev.clientX, ev.clientY);
    if (!pt) return;
    const hit = pickBoardTarget(pt.x, pt.y, session.state);
    if (!hit) return;
    ev.preventDefault();
    if (hit.type === "node") onNodeClick(hit.r, hit.c);
    else if (hit.type === "edge") onEdgeClick(hit.edgeId);
  }

  function loadSettings() {
    const defaults = {
      lang: "tr",
      aiDifficulty: "medium",
      p1: "",
      p2: "",
      music: true,
      sfx: true,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch (_) {
      return defaults;
    }
  }

  function bootAudio() {
    if (!Audio) return;
    Audio.applyPrefs({ music: settings.music !== false, sfx: settings.sfx !== false });
  }

  async function ensureAudio() {
    if (!Audio) return;
    await Audio.unlock();
    bootAudio();
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
    if ($("set-music")) $("set-music").checked = settings.music !== false;
    if ($("set-sfx")) $("set-sfx").checked = settings.sfx !== false;
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
    if (session.mode === "p2p") {
      return player === 1
        ? session.names.p1 || t("player1")
        : session.names.p2 || t("player2");
    }
    return player === 1
      ? session.names.p1 || t("player1")
      : session.names.p2 || t("player2");
  }

  function isHumanTurn() {
    if (!session || !session.state) return false;
    if (session.state.phase === PHASE.GAME_OVER) return false;
    if (session.mode === "solo") return session.state.turn === session.humanPlayer;
    if (session.mode === "p2p") return session.state.turn === session.humanPlayer;
    return true; // local 2p
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function runAnim(ms, onFrame) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      function frame(now) {
        const p = Math.min(1, (now - t0) / ms);
        onFrame(easeInOut(p), p);
        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255;
    const ag = (pa >> 8) & 255;
    const ab = pa & 255;
    const br = (pb >> 16) & 255;
    const bg = (pb >> 8) & 255;
    const bb = pb & 255;
    const r = Math.round(lerp(ar, br, t));
    const g = Math.round(lerp(ag, bg, t));
    const bl = Math.round(lerp(ab, bb, t));
    return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
  }

  function ensureBoardDefs(svg) {
    const NS = "http://www.w3.org/2000/svg";
    if (svg.querySelector("#siege-glow")) return;
    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML = `
      <filter id="siege-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="siege-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
    svg.insertBefore(defs, svg.firstChild);
  }

  async function animateDrawLine(edgeId, player) {
    const svg = $("board");
    if (!svg) return;
    ensureBoardDefs(svg);
    const ends = edgeEndpoints(edgeId);
    if (!ends) return;
    const [p0, p1] = ends;
    const a = xy(p0[0], p0[1]);
    const b = xy(p1[0], p1[1]);
    const NS = "http://www.w3.org/2000/svg";
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("class", "edge-line is-drawing");
    line.setAttribute("stroke-dasharray", String(len));
    line.setAttribute("stroke-dashoffset", String(len));
    line.setAttribute("stroke-width", "2.4");
    svg.appendChild(line);
    const base = colorFor(player);
    const hi = player === 1 ? "#7FE9FF" : "#FF8A93";
    if (Audio) Audio.playSfx("draw");
    await runAnim(780, (e) => {
      line.setAttribute("stroke-dashoffset", String(len * (1 - e)));
      line.setAttribute("stroke", lerpColor(hi, base, e));
      line.setAttribute("stroke-width", String(lerp(2.8, 1.55, e)));
      line.setAttribute("opacity", String(lerp(0.55, 1, e)));
    });
    line.remove();
  }

  async function animateMoveStone(from, to, player) {
    const svg = $("board");
    if (!svg) return;
    ensureBoardDefs(svg);
    const a = xy(from.r, from.c);
    const b = xy(to.r, to.c);
    const NS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "stone-flying");
    const glow = document.createElementNS(NS, "circle");
    glow.setAttribute("r", "4.2");
    glow.setAttribute("opacity", "0.35");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "2.55");
    const mark = document.createElementNS(NS, "text");
    mark.setAttribute("text-anchor", "middle");
    mark.setAttribute("font-size", "2.6");
    mark.setAttribute("font-weight", "700");
    mark.setAttribute("fill", "#0a0a0e");
    mark.textContent = player === 1 ? "○" : "△";
    g.appendChild(glow);
    g.appendChild(dot);
    g.appendChild(mark);
    svg.appendChild(g);
    const base = colorFor(player);
    const hi = player === 1 ? "#9AF0FF" : "#FFB0B6";
    if (Audio) Audio.playSfx("move");
    await runAnim(920, (e) => {
      const x = lerp(a.x, b.x, e);
      const y = lerp(a.y, b.y, e);
      const col = lerpColor(base, hi, Math.sin(e * Math.PI));
      glow.setAttribute("cx", x);
      glow.setAttribute("cy", y);
      glow.setAttribute("fill", col);
      glow.setAttribute("opacity", String(0.2 + 0.35 * Math.sin(e * Math.PI)));
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("fill", col);
      mark.setAttribute("x", x);
      mark.setAttribute("y", y + 1.05);
    });
    g.remove();
  }

  async function animateCaptureFlash(details, player) {
    if (!details || !details.length) return;
    const svg = $("board");
    if (!svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const els = [];
    for (const d of details) {
      const a = xy(d.i, d.j);
      const b = xy(d.i + 1, d.j + 1);
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", a.x);
      rect.setAttribute("y", a.y);
      rect.setAttribute("width", b.x - a.x);
      rect.setAttribute("height", b.y - a.y);
      rect.setAttribute("fill", colorFor(player));
      rect.setAttribute("class", "cell-flash");
      rect.setAttribute("opacity", "0.45");
      svg.appendChild(rect);
      els.push(rect);
      if (d.siege && Audio) Audio.playSfx("siege");
      else if (Audio) Audio.playSfx("capture");
    }
    await new Promise((r) => setTimeout(r, 700));
    els.forEach((el) => el.remove());
  }

  async function playMoveFx(prevLast, nextState) {
    const lm = nextState.lastMove;
    if (!lm) return;
    const board = $("board");
    if (board) board.classList.add("is-fx-busy");
    fxBusy = true;
    try {
      if (lm.type === "DRAW_LINE") {
        if (lm.brokeShield && Audio) Audio.playSfx("shield");
        await animateDrawLine(lm.edgeId, lm.player);
        if (lm.captureDetails && lm.captureDetails.length) {
          await animateCaptureFlash(lm.captureDetails, lm.player);
        }
      } else if (lm.type === "MOVE_PIECE") {
        await animateMoveStone(lm.from, lm.to, lm.player);
      } else if (lm.type === "PLACE") {
        if (Audio) Audio.playSfx("place");
        await runAnim(360, () => {});
      } else if (lm.type === "RESIGN") {
        if (Audio) Audio.playSfx("lose");
      }
      if (nextState.phase === PHASE.GAME_OVER && nextState.winner !== "draw" && Audio) {
        const human =
          session && (session.mode === "solo" || session.mode === "p2p")
            ? session.humanPlayer
            : null;
        if (human != null) {
          Audio.playSfx(nextState.winner === human ? "win" : "lose");
        } else if (Audio) Audio.playSfx("win");
      }
    } finally {
      fxBusy = false;
      if (board) board.classList.remove("is-fx-busy");
    }
  }

  function commitAction(player, action, opts) {
    const fromNet = opts && opts.fromNet;
    const skipFx = opts && opts.skipFx;
    const silent = opts && opts.silent;
    if (!session) return Promise.resolve(false);
    if (fxBusy && !fromNet && !skipFx) return Promise.resolve(false);
    const r = applyAction(session.state, player, action);
    if (!r.ok) {
      if (!fromNet && !silent) {
        if (Audio) Audio.playSfx("invalid");
        toast(r.error || t("toastInvalid"));
      }
      if (silent) console.warn("demo action fail", action, r.error);
      return Promise.resolve(false);
    }
    const next = r.state;
    selectedStone = null;

    if (!fromNet && session.mode === "p2p" && p2pSession) {
      p2pSession.send({ type: "action", player, action });
    }

    // Sadece bu hamlenin ürettiği lastMove için FX (eski PLACE artığı tetiklemesin)
    const fxFromAction = {
      DRAW_LINE: "DRAW_LINE",
      MOVE_PIECE: "MOVE_PIECE",
      PLACE_CONFIRM: "PLACE",
      RESIGN: "RESIGN",
    };
    const expected = fxFromAction[action.type];
    const needsFx =
      !skipFx && expected && next.lastMove && next.lastMove.type === expected;

    const finish = () => {
      session.state = next;
      renderAll();
      if (!fromNet && session.mode !== "demo") maybeAiTurn();
      return true;
    };

    if (needsFx) {
      return playMoveFx(session.state.lastMove, next).then(finish);
    }
    return Promise.resolve(finish());
  }

  async function startGame(mode) {
    clearTimeout(aiTimer);
    selectedStone = null;
    await ensureAudio();
    if (Audio && settings.music !== false) Audio.startMusic();
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
    else if (session.mode === "solo" || session.mode === "p2p") {
      result = s.winner === session.humanPlayer ? "win" : "loss";
    } else result = "win";
    window.ArenaScore.record({
      gameId: "kusatma",
      result,
      difficulty: session.mode === "solo" ? session.difficulty : "normal",
      mode: session.mode === "solo" ? "solo" : session.mode === "p2p" ? "p2p" : "local2p",
      stats: {
        score: s.scores[session.humanPlayer || 1],
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
    ensureBoardDefs(svg);

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
        rect.style.pointerEvents = "none";
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

    // Edges (görsel). Tıklama SVG koordinat picker ile — köşe çakışması yok.
    for (const id of ALL_EDGES) {
      const ends = edgeEndpoints(id);
      if (!ends) continue;
      const [p0, p1] = ends;
      const a = xy(p0[0], p0[1]);
      const b = xy(p1[0], p1[1]);
      const drawn = s.edgeDrawn[id];
      const insured = s.edgeInsured[id];

      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("stroke-linecap", "round");
      line.dataset.edge = id;
      let cls = "edge-line";
      if (drawn) cls += " is-drawn";
      else if (insured) cls += " is-insured";
      line.setAttribute("class", cls);
      if (drawn) {
        const who = s.edgeOwner[id] || 0;
        line.setAttribute("stroke", who ? colorFor(who) : "#c4b7c5");
        line.setAttribute("stroke-width", "1.45");
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

    // Nodes (üstte çiz)
    for (let r = 0; r < Engine.N; r++) {
      for (let c = 0; c < Engine.N; c++) {
        const p = xy(r, c);
        const owner = s.nodes[r][c];
        const pend =
          s.pendingDeploy && s.pendingDeploy.r === r && s.pendingDeploy.c === c;

        const hit = document.createElementNS(NS, "circle");
        hit.setAttribute("cx", p.x);
        hit.setAttribute("cy", p.y);
        hit.setAttribute("r", String(NODE_HIT_R));
        hit.setAttribute("fill", "transparent");
        hit.setAttribute("class", "node-hit");
        hit.dataset.node = `${r},${c}`;
        hit.style.pointerEvents = "none"; // picker kullanıyoruz
        svg.appendChild(hit);

        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", p.x);
        dot.setAttribute("cy", p.y);
        dot.setAttribute("r", owner || pend ? "2.45" : "1.35");
        dot.style.pointerEvents = "none";
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
    if (!session || !isHumanTurn() || fxBusy) return;
    const s = session.state;
    if (s.phase !== PHASE.BATTLE) return;
    selectedStone = null;
    if (s.edgeInsured[edgeId] && s.shieldPoints[s.turn] < SHIELD_BREAK_COST) {
      if (Audio) Audio.playSfx("invalid");
      toast(t("insuredHint"));
      return;
    }
    ensureAudio();
    commitAction(s.turn, { type: "DRAW_LINE", edgeId });
  }

  function onNodeClick(r, c) {
    if (!session || !isHumanTurn() || fxBusy) return;
    const s = session.state;
    const player = s.turn;

    if (s.phase === PHASE.DEPLOY) {
      ensureAudio();
      if (Audio) Audio.playSfx("select");
      commitAction(player, { type: "PLACE_SELECT", r, c });
      return;
    }

    if (s.phase !== PHASE.BATTLE) return;

    if (s.nodes[r][c] === player) {
      selectedStone = { r, c };
      if (Audio) Audio.playSfx("select");
      renderBoard();
      return;
    }

    if (selectedStone && s.nodes[r][c] === 0) {
      const from = { ...selectedStone };
      selectedStone = null;
      commitAction(player, { type: "MOVE_PIECE", from, to: { r, c } });
      return;
    }

    selectedStone = null;
    renderBoard();
  }

  function destroyP2P() {
    if (p2pSession) {
      try {
        p2pSession.destroy();
      } catch (_) {}
    }
    p2pSession = null;
    p2pLobby = null;
    if ($("p2p-room")) $("p2p-room").classList.add("hidden");
  }

  function updateP2pRoomUi() {
    if (!p2pLobby || !$("p2p-room")) return;
    $("p2p-room").classList.remove("hidden");
    if ($("p2p-room-code")) $("p2p-room-code").textContent = p2pLobby.code;
    if ($("p2p-room-hint")) {
      $("p2p-room-hint").textContent = p2pLobby.guestJoined
        ? `${p2pLobby.names.p1} vs ${p2pLobby.names.p2 || "…"}`
        : t("waitingGuest");
    }
    const btn = $("btn-p2p-ready");
    if (btn) {
      btn.disabled = !p2pLobby.guestJoined;
      const me = p2pLobby.you;
      btn.textContent = p2pLobby.ready[me] ? t("readyOn") : t("ready");
    }
  }

  function beginP2PGame(names) {
    ensureAudio().then(() => {
      if (Audio && settings.music !== false) Audio.startMusic();
    });
    const state = createGameState(PLAYERS.P1);
    session = {
      mode: "p2p",
      difficulty: null,
      humanPlayer: p2pLobby.you === "A" ? PLAYERS.P1 : PLAYERS.P2,
      names: { p1: names.p1, p2: names.p2 },
      state,
      scoreRecorded: false,
    };
    $("game-over").classList.add("hidden");
    showScreen("game");
    renderAll();
  }

  function maybeStartP2P() {
    if (!p2pLobby || !p2pLobby.guestJoined) return;
    if (!p2pLobby.ready.A || !p2pLobby.ready.B) return;
    if (p2pLobby.you !== "A") return;
    p2pSession.send({ type: "start", names: p2pLobby.names });
    beginP2PGame(p2pLobby.names);
  }

  function bindP2P(sessionObj) {
    sessionObj.on("message", (data) => {
      if (!data || !data.type) return;
      if (data.type === "hello") {
        if (p2pLobby.you === "A" && data.role === "guest") {
          p2pLobby.names.p2 = data.name || t("player2");
          p2pLobby.guestJoined = true;
          p2pSession.send({
            type: "lobby",
            names: p2pLobby.names,
            ready: p2pLobby.ready,
            guestJoined: true,
          });
          updateP2pRoomUi();
        } else if (p2pLobby.you === "B" && data.role === "host") {
          p2pLobby.names.p1 = data.name || t("player1");
          p2pLobby.guestJoined = true;
          updateP2pRoomUi();
        }
      } else if (data.type === "lobby") {
        p2pLobby.names = data.names || p2pLobby.names;
        p2pLobby.ready = data.ready || p2pLobby.ready;
        p2pLobby.guestJoined = !!data.guestJoined;
        updateP2pRoomUi();
      } else if (data.type === "ready") {
        p2pLobby.ready[data.who] = !!data.value;
        updateP2pRoomUi();
        maybeStartP2P();
      } else if (data.type === "start") {
        beginP2PGame(data.names || p2pLobby.names);
      } else if (data.type === "action") {
        if (!session || session.mode !== "p2p") return;
        commitAction(data.player, data.action, { fromNet: true });
      }
    });
    sessionObj.on("connected", () => {
      if (!p2pLobby) return;
      if (p2pLobby.you === "A") {
        p2pSession.send({
          type: "hello",
          role: "host",
          name: p2pLobby.names.p1,
        });
      } else {
        p2pSession.send({
          type: "hello",
          role: "guest",
          name: p2pLobby.names.p2,
        });
      }
    });
  }

  async function hostP2P() {
    if (!window.ArenaP2P) {
      toast(t("peerFail"));
      return;
    }
    destroyP2P();
    const name = ($("p2p-name").value || "").trim() || t("player1");
    toast(t("connecting"));
    try {
      p2pSession = new ArenaP2P.P2PSession({ prefix: "kusatma" });
      bindP2P(p2pSession);
      const code = await p2pSession.host();
      p2pLobby = {
        code,
        you: "A",
        names: { p1: name, p2: null },
        ready: { A: false, B: false },
        guestJoined: false,
      };
      updateP2pRoomUi();
    } catch (_) {
      toast(t("peerFail"));
      destroyP2P();
    }
  }

  async function joinP2P() {
    if (!window.ArenaP2P) {
      toast(t("peerFail"));
      return;
    }
    const code = ($("p2p-code").value || "").trim().toUpperCase();
    if (!code) {
      toast(t("needCode"));
      return;
    }
    destroyP2P();
    const name = ($("p2p-name").value || "").trim() || t("player2");
    toast(t("connecting"));
    try {
      p2pSession = new ArenaP2P.P2PSession({ prefix: "kusatma" });
      bindP2P(p2pSession);
      await p2pSession.join(code);
      p2pLobby = {
        code,
        you: "B",
        names: { p1: "—", p2: name },
        ready: { A: false, B: false },
        guestJoined: false,
      };
      updateP2pRoomUi();
    } catch (_) {
      toast(t("peerFail"));
      destroyP2P();
    }
  }

  function maybeAiTurn() {
    clearTimeout(aiTimer);
    if (!session || session.mode !== "solo") return;
    if (fxBusy) return;
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
    if (fxBusy) {
      aiTimer = setTimeout(runAiStep, 120);
      return;
    }
    const s = session.state;
    if (s.phase === PHASE.GAME_OVER) return;
    if (s.turn === session.humanPlayer) return;

    const action = Ai.chooseMove(s, s.turn, session.difficulty);
    if (!action) return;
    commitAction(s.turn, action).then((ok) => {
      if (!ok) console.warn("AI invalid", action);
      // ekstra tur / deploy zinciri: maybeAiTurn finish içinde çağrılır
    });
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
  if ($("btn-p2p-back")) {
    $("btn-p2p-back").addEventListener("click", () => {
      destroyP2P();
      showScreen("play");
    });
  }
  $("btn-settings-back").addEventListener("click", () => showScreen("home"));
  $("btn-help-back").addEventListener("click", () => showScreen("home"));

  function openTutorialMenu() {
    showScreen("tutorialMenu");
  }

  function openTutorialRules() {
    const overlay = $("tutorial-overlay");
    if (!overlay || !window.SiegeTutorial) return;
    overlay.setAttribute("aria-hidden", "false");
    if (!tutorialCtl) {
      tutorialCtl = window.SiegeTutorial.createController({
        root: overlay,
        onClose() {
          tutorialCtl.close();
          overlay.setAttribute("aria-hidden", "true");
          try {
            localStorage.setItem("kusatma_tutorial_seen_v1", "1");
          } catch (_) {}
          showScreen("tutorialMenu");
        },
      });
    }
    tutorialCtl.open(0);
  }

  function updateDemoCaption(step) {
    if (!$("demo-caption")) return;
    if ($("demo-kicker")) $("demo-kicker").textContent = t("tutDemoTitle");
    if ($("demo-title")) $("demo-title").textContent = step.title;
    if ($("demo-text")) $("demo-text").textContent = step.caption;
    if ($("demo-step") && demo) {
      $("demo-step").textContent = `${demo.index + 1} / ${DemoMatch.STEPS.length}`;
    }
    if ($("btn-demo-next")) {
      $("btn-demo-next").textContent = step.finale ? t("demoFinish") : t("demoNext");
    }
  }

  async function runDemoActionSpec(spec, opts) {
    if (!spec) return true;
    const player = spec.player;
    const action = { ...spec };
    delete action.player;
    return commitAction(player, action, { silent: true, ...(opts || {}) });
  }

  async function executeDemoStep(step) {
    if (step.batch && step.batch.length) {
      for (const spec of step.batch) {
        const ok = await runDemoActionSpec(spec, { skipFx: true });
        if (!ok) break;
        await new Promise((r) => setTimeout(r, 90));
      }
      renderAll();
      if (Audio) Audio.playSfx("place");
      return;
    }
    if (step.action) {
      await runDemoActionSpec(step.action);
      if (step.follow) await runDemoActionSpec(step.follow);
    }
  }

  function exitDemo() {
    demo = null;
    session = null;
    document.body.classList.remove("is-demo");
    if ($("demo-caption")) $("demo-caption").classList.add("hidden");
    if ($("btn-resign")) $("btn-resign").classList.remove("hidden");
    if (Audio) Audio.stopMusic();
    showScreen("tutorialMenu");
  }

  async function startDemoMatch() {
    if (!DemoMatch || !DemoMatch.STEPS) {
      toast("Demo yüklenemedi");
      return;
    }
    clearTimeout(aiTimer);
    selectedStone = null;
    await ensureAudio();
    if (Audio && settings.music !== false) Audio.startMusic();
    session = {
      mode: "demo",
      difficulty: null,
      humanPlayer: null,
      names: {
        p1: lang() === "en" ? "Blue (PC)" : "Mavi (PC)",
        p2: lang() === "en" ? "Red (PC)" : "Kırmızı (PC)",
      },
      state: createGameState(PLAYERS.P1),
      scoreRecorded: true,
    };
    demo = { index: 0, busy: false };
    document.body.classList.add("is-demo");
    if ($("demo-caption")) $("demo-caption").classList.remove("hidden");
    if ($("btn-resign")) $("btn-resign").classList.add("hidden");
    $("game-over").classList.add("hidden");
    showScreen("game");
    renderAll();
    updateDemoCaption(DemoMatch.STEPS[0]);
  }

  async function onDemoNext() {
    if (!demo || !DemoMatch || demo.busy) return;
    const step = DemoMatch.STEPS[demo.index];
    if (step.finale) {
      exitDemo();
      return;
    }
    demo.busy = true;
    if ($("btn-demo-next")) $("btn-demo-next").disabled = true;
    try {
      await executeDemoStep(step);
      demo.index += 1;
      if (demo.index >= DemoMatch.STEPS.length) {
        exitDemo();
        return;
      }
      updateDemoCaption(DemoMatch.STEPS[demo.index]);
    } finally {
      demo.busy = false;
      if ($("btn-demo-next")) $("btn-demo-next").disabled = false;
    }
  }

  if ($("btn-home-tutorial")) {
    $("btn-home-tutorial").addEventListener("click", () => openTutorialMenu());
  }
  if ($("btn-help-tutorial")) {
    $("btn-help-tutorial").addEventListener("click", () => openTutorialMenu());
  }
  if ($("btn-tutorial-menu-back")) {
    $("btn-tutorial-menu-back").addEventListener("click", () => showScreen("home"));
  }
  if ($("btn-tut-rules")) {
    $("btn-tut-rules").addEventListener("click", () => openTutorialRules());
  }
  if ($("btn-tut-demo")) {
    $("btn-tut-demo").addEventListener("click", () => startDemoMatch());
  }
  if ($("btn-demo-next")) {
    $("btn-demo-next").addEventListener("click", () => onDemoNext());
  }
  if ($("btn-demo-exit")) {
    $("btn-demo-exit").addEventListener("click", () => exitDemo());
  }

  // İlk açılışta tutorial menüsü yerine kurallar turu
  try {
    if (!localStorage.getItem("kusatma_tutorial_seen_v1")) {
      setTimeout(() => openTutorialRules(), 450);
    }
  } catch (_) {}

  $("btn-mode-solo").addEventListener("click", () => {
    setup.mode = "solo";
    showScreen("soloSetup");
  });
  $("btn-mode-2p").addEventListener("click", () => {
    setup.mode = "twop";
    showScreen("twoPSetup");
  });
  if ($("btn-mode-p2p")) {
    $("btn-mode-p2p").addEventListener("click", () => {
      setup.mode = "p2p";
      if ($("p2p-room")) $("p2p-room").classList.add("hidden");
      showScreen("p2p");
    });
  }

  $("btn-solo-start").addEventListener("click", () => startGame("solo"));
  $("btn-2p-start").addEventListener("click", () => startGame("twop"));

  if ($("btn-p2p-create")) $("btn-p2p-create").addEventListener("click", () => hostP2P());
  if ($("btn-p2p-join")) $("btn-p2p-join").addEventListener("click", () => joinP2P());
  if ($("btn-p2p-ready")) {
    $("btn-p2p-ready").addEventListener("click", () => {
      if (!p2pLobby || !p2pSession) return;
      const who = p2pLobby.you;
      p2pLobby.ready[who] = !p2pLobby.ready[who];
      p2pSession.send({ type: "ready", who, value: p2pLobby.ready[who] });
      p2pSession.send({
        type: "lobby",
        names: p2pLobby.names,
        ready: p2pLobby.ready,
        guestJoined: p2pLobby.guestJoined,
      });
      updateP2pRoomUi();
      maybeStartP2P();
    });
  }
  if ($("btn-p2p-copy")) {
    $("btn-p2p-copy").addEventListener("click", async () => {
      if (!p2pLobby) return;
      try {
        await navigator.clipboard.writeText(p2pLobby.code);
        toast(t("copied"));
      } catch (_) {
        toast(p2pLobby.code);
      }
    });
  }

  $("btn-deploy-confirm").addEventListener("click", () => {
    if (!session || !isHumanTurn()) return;
    commitAction(session.state.turn, { type: "PLACE_CONFIRM" });
  });
  $("btn-deploy-cancel").addEventListener("click", () => {
    if (!session || !isHumanTurn()) return;
    commitAction(session.state.turn, { type: "PLACE_CANCEL" });
  });

  $("btn-resign").addEventListener("click", () => {
    if (!session || session.state.phase === PHASE.GAME_OVER) return;
    const p =
      session.mode === "solo" || session.mode === "p2p"
        ? session.humanPlayer
        : session.state.turn;
    commitAction(p, { type: "RESIGN" });
  });

  $("btn-game-back").addEventListener("click", () => {
    if (session && session.mode === "demo") {
      exitDemo();
      return;
    }
    if (session && session.state.phase !== PHASE.GAME_OVER) {
      if (!confirm(lang() === "en" ? "Leave the match?" : "Maçtan çıkılsın mı?")) return;
    }
    clearTimeout(aiTimer);
    if (session && session.mode === "p2p") destroyP2P();
    session = null;
    if (Audio) Audio.stopMusic();
    showScreen("home");
  });

  $("btn-again").addEventListener("click", () => {
    if (!session) return;
    if (session.mode === "p2p") {
      destroyP2P();
      session = null;
      showScreen("p2p");
      return;
    }
    startGame(session.mode);
  });
  $("btn-to-menu").addEventListener("click", () => {
    if (session && session.mode === "p2p") destroyP2P();
    session = null;
    if (Audio) Audio.stopMusic();
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
  if ($("set-music")) {
    $("set-music").addEventListener("change", async (e) => {
      const on = !!e.target.checked;
      saveSettings({ music: on });
      await ensureAudio();
      if (Audio) {
        Audio.setMusic(on);
        if (on && session) Audio.startMusic();
      }
    });
  }
  if ($("set-sfx")) {
    $("set-sfx").addEventListener("change", async (e) => {
      const on = !!e.target.checked;
      saveSettings({ sfx: on });
      await ensureAudio();
      if (Audio) {
        Audio.setSfx(on);
        if (on) Audio.playSfx("click");
      }
    });
  }

  // Tahta tıklama: SVG user-space → en yakın düğüm (köşe öncelikli) / kenar
  const boardEl = $("board");
  if (boardEl) {
    boardEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
    boardEl.addEventListener("pointerup", onBoardPointer);
    boardEl.addEventListener("pointermove", (ev) => {
      if (!session || fxBusy || session.state.phase !== PHASE.BATTLE) return;
      const pt = clientToSvg(boardEl, ev.clientX, ev.clientY);
      if (!pt) return;
      const hit = pickBoardTarget(pt.x, pt.y, session.state);
      boardEl.querySelectorAll(".edge-line.is-hover").forEach((el) => {
        el.classList.remove("is-hover");
        const id = el.dataset.edge;
        if (!id) return;
        if (session.state.edgeInsured[id]) {
          el.setAttribute("stroke", "#FFB703");
          el.setAttribute("stroke-width", "1.5");
        } else if (!session.state.edgeDrawn[id]) {
          el.setAttribute("stroke", "#9A8C98");
          el.setAttribute("stroke-width", "0.55");
          el.setAttribute("opacity", "0.55");
        }
      });
      if (hit && hit.type === "edge") {
        const line = boardEl.querySelector(`.edge-line[data-edge="${hit.edgeId}"]`);
        if (line && !session.state.edgeDrawn[hit.edgeId]) {
          line.classList.add("is-hover");
          if (session.state.edgeInsured[hit.edgeId]) {
            line.setAttribute("stroke", "#FFD56A");
          } else {
            line.setAttribute("stroke", "#D7CFE0");
            line.setAttribute("stroke-width", "1.25");
            line.setAttribute("opacity", "0.95");
          }
        }
      }
    });
    boardEl.addEventListener("pointerleave", () => {
      boardEl.querySelectorAll(".edge-line.is-hover").forEach((el) => {
        el.classList.remove("is-hover");
        const id = el.dataset.edge;
        if (!id || !session) return;
        if (session.state.edgeInsured[id]) {
          el.setAttribute("stroke", "#FFB703");
          el.setAttribute("stroke-width", "1.5");
        } else if (!session.state.edgeDrawn[id]) {
          el.setAttribute("stroke", "#9A8C98");
          el.setAttribute("stroke-width", "0.55");
          el.setAttribute("opacity", "0.55");
        }
      });
    });
  }

  // İlk kullanıcı jestiyle ses kilidini aç
  ["pointerdown", "keydown"].forEach((ev) => {
    window.addEventListener(
      ev,
      () => {
        ensureAudio();
      },
      { once: true, passive: true }
    );
  });
  bootAudio();

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
