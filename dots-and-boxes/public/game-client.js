(() => {
  const Boards = window.DotsBoards;
  const Engine = window.DotsEngine;
  const Ai = window.DotsAi;
  const CFG = window.DotsConfig;
  const I18N = window.DotsI18n;
  if (!Boards || !Engine || !Ai || !CFG || !I18N) {
    console.error("Dots: missing modules");
    return;
  }

  const { PLAYERS, createGameState, applyMove, opponent } = Engine;
  const SETTINGS_KEY = "dots_boxes_settings";
  const SEEN_VER_KEY = "dots_boxes_seen_version";

  const DIFFS = [
    { id: "easy", i18n: "diffEasy", hint: "diffEasyHint" },
    { id: "medium", i18n: "diffMedium", hint: "diffMediumHint" },
    { id: "hard", i18n: "diffHard", hint: "diffHardHint" },
    { id: "veryhard", i18n: "diffVeryHard", hint: "diffVeryHardHint" },
  ];

  /** Zorluk → önerilen tahta id'leri (önceden tanımlanmış eşleme). */
  const DIFF_BOARDS = {
    easy: ["grid-6x6", "grid-6x8", "shape-star"],
    medium: ["grid-8x10", "shape-star", "shape-diamond"],
    hard: ["grid-8x10", "shape-diamond", "shape-plus"],
    veryhard: ["grid-10x10", "shape-plus", "shape-diamond"],
  };

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("screen-home"),
    play: $("screen-play"),
    soloSetup: $("screen-solo-setup"),
    twoPSetup: $("screen-2p-setup"),
    p2p: $("screen-p2p"),
    settings: $("screen-settings"),
    help: $("screen-help"),
    scores: $("screen-scores"),
    updates: $("screen-updates"),
    game: $("screen-game"),
  };

  let settings = loadSettings();
  let setup = {
    mode: "solo", // solo | twop
    difficulty: settings.aiDifficulty || "medium",
    boardId: recommendedBoard(settings.aiDifficulty || "medium"),
    p1: "",
    p2: "",
  };

  /** @type {null | {mode, difficulty, boardId, graph, state, humanPlayer, names, aiThinking}} */
  let session = null;
  let aiTimer = null;
  let layout = null; // {pad, cell, coords: Map "r,c" -> {x,y}}
  let hubBackCtl = null;
  let inputLockUntil = 0; // çift dokunuş / pointer+touch çift hamle kilidi
  let claimFlashTimer = null;
  const Sfx = window.DncrMoveSfx || null;

  function playMoveSfx(kind) {
    if (!Sfx) return;
    Sfx.unlock();
    Sfx.play(kind || "claim");
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

  function recommendedBoard(diff) {
    const list = DIFF_BOARDS[diff] || DIFF_BOARDS.medium;
    return list[0];
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
    renderBoardGrids();
    if (hubBackCtl && hubBackCtl.refresh) hubBackCtl.refresh();
  }

  function renderScores() {
    if (!window.ArenaScore || !$("scores-panel")) return;
    window.ArenaScore.renderInto($("scores-panel"), {
      lang: lang(),
      gameId: "noktalar",
    });
  }

  function maybeRecordNoktalarScore() {
    if (!session || !session.state || !session.state.winner || session.scoreRecorded) return;
    if (!window.ArenaScore) return;
    session.scoreRecorded = true;
    const state = session.state;
    let result = "loss";
    if (state.winner === "draw") result = "draw";
    else if (session.mode === "solo") {
      result = state.winner === session.humanPlayer ? "win" : "loss";
    } else if (session.mode === "p2p") {
      result = state.winner === session.you ? "win" : "loss";
    } else result = "win";
    const myScore =
      session.mode === "solo" || session.mode === "p2p"
        ? state.scores[session.mode === "solo" ? session.humanPlayer : session.you]
        : Math.max(state.scores.A, state.scores.B);
    const oppScore =
      session.mode === "solo"
        ? state.scores[session.humanPlayer === PLAYERS.A ? PLAYERS.B : PLAYERS.A]
        : Math.min(state.scores.A, state.scores.B);
    window.ArenaScore.record({
      gameId: "noktalar",
      result,
      difficulty: session.difficulty || "medium",
      mode: session.mode === "twop" ? "twop" : session.mode,
      stats: {
        boxes: myScore || 0,
        boxLead: Math.max(0, (myScore || 0) - (oppScore || 0)),
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
      btn.className = "diff-card" + (setup.difficulty === d.id ? " selected" : "");
      btn.dataset.diff = d.id;
      btn.innerHTML = `<strong>${t(d.i18n)}</strong><span>${t(d.hint)}</span>`;
      btn.addEventListener("click", () => {
        setup.difficulty = d.id;
        // Zorluk değişince önerilen tahtaya geç (kullanıcı seçimini sıfırla)
        setup.boardId = recommendedBoard(d.id);
        renderDiffGrid();
        renderBoardGrids();
      });
      grid.appendChild(btn);
    }
  }

  function renderBoardPicker(containerId, selectedId, onPick, highlightRecommended) {
    const grid = $(containerId);
    if (!grid) return;
    grid.innerHTML = "";
    const recommended = new Set(DIFF_BOARDS[setup.difficulty] || []);
    for (const def of Boards.BOARD_DEFS) {
      const g = Boards.getGraph(def.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "board-card" + (selectedId === def.id ? " selected" : "");
      btn.dataset.board = def.id;
      const name = def.names[lang()] || def.names.tr;
      const winNeed = Math.floor(g.totalBoxes / 2) + 1;
      const rec =
        highlightRecommended && recommended.has(def.id)
          ? `<span class="rec-badge">${t("recommendedBadge")}</span>`
          : "";
      btn.innerHTML = `
        <strong>${name}</strong>
        <span class="board-meta">${g.dotRows}×${g.dotCols} · ${g.totalBoxes} ${t("boxesCount")} · ≥${winNeed}</span>
        ${rec}
      `;
      btn.addEventListener("click", () => onPick(def.id));
      grid.appendChild(btn);
    }
  }

  function renderBoardGrids() {
    renderBoardPicker(
      "solo-board-grid",
      setup.boardId,
      (id) => {
        setup.boardId = id;
        renderBoardGrids();
      },
      true
    );
    renderBoardPicker(
      "twop-board-grid",
      setup.boardId,
      (id) => {
        setup.boardId = id;
        renderBoardGrids();
      },
      false
    );
  }

  function fillSettingsForm() {
    document.querySelectorAll('input[name="lang"]').forEach((r) => {
      r.checked = r.value === lang();
    });
    const diff = settings.aiDifficulty || "medium";
    document.querySelectorAll('input[name="defDiff"]').forEach((r) => {
      r.checked = r.value === diff;
    });
    if ($("settings-display-name") && window.ArenaScore) {
      $("settings-display-name").value =
        window.ArenaScore.load().displayName || settings.p1 || "";
    }
  }

  // —— Board layout / SVG ——
  function computeLayout(graph) {
    const pad = 6;
    const usable = 100 - pad * 2;
    const cell = Math.min(usable / (graph.dotCols - 1), usable / (graph.dotRows - 1));
    const w = cell * (graph.dotCols - 1);
    const h = cell * (graph.dotRows - 1);
    const ox = (100 - w) / 2;
    const oy = (100 - h) / 2;
    const coords = new Map();
    for (const [r, c] of graph.dots) {
      coords.set(`${r},${c}`, { x: ox + c * cell, y: oy + r * cell });
    }
    return { pad, cell, coords, ox, oy };
  }

  function clearBoardSvg() {
    clearTimeout(claimFlashTimer);
    claimFlashTimer = null;
    ["box-layer", "edge-layer", "edge-hit-layer", "dot-layer", "fx-layer"].forEach(
      (id) => {
        const el = $(id);
        if (el) el.innerHTML = "";
      }
    );
  }

  /** Ekran (client) koordinatını SVG viewBox birimine çevirir — Safari dahil. */
  function clientToSvgPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      };
    }
    return pt.matrixTransform(ctm.inverse());
  }

  /** Noktadan doğru parçasına (a→b) en kısa mesafe. */
  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /**
   * Dokunulan noktaya en yakın çizilmemiş kenarı bulur.
   * Safari’de ince SVG <line> hit-test güvenilmez olduğu için tercih edilen yol budur.
   */
  function nearestUndrawnEdge(svgX, svgY) {
    if (!session || !layout) return null;
    const threshold = Math.max(4.5, (layout.cell || 10) * 0.42);
    let best = null;
    let bestDist = threshold;
    for (const edge of session.graph.edges.values()) {
      if (session.state.edgeDrawnBy[edge.id]) continue;
      const a = layout.coords.get(edge.dotA.join(","));
      const b = layout.coords.get(edge.dotB.join(","));
      if (!a || !b) continue;
      const d = distToSegment(svgX, svgY, a.x, a.y, b.x, b.y);
      if (d < bestDist) {
        bestDist = d;
        best = edge.id;
      }
    }
    return best;
  }

  let lastPointerEdgeAt = 0;
  let previewedEdgeId = null;

  /** Hover önizlemesi — tıklama ile aynı nearestUndrawnEdge mantığı (kalın hit stroke çakışmasın). */
  function setEdgePreview(edgeId) {
    if (previewedEdgeId === edgeId) return;
    if (previewedEdgeId) {
      const prev = document.querySelector(
        `#edge-layer line[data-edge="${previewedEdgeId}"]`
      );
      if (prev) prev.classList.remove("edge-preview");
    }
    previewedEdgeId = edgeId || null;
    if (!previewedEdgeId) return;
    if (session && session.state.edgeDrawnBy[previewedEdgeId]) {
      previewedEdgeId = null;
      return;
    }
    const line = document.querySelector(
      `#edge-layer line[data-edge="${previewedEdgeId}"]`
    );
    if (line) line.classList.add("edge-preview");
  }

  function onBoardHoverMove(ev) {
    // Sadece fare: dokunmada sarı flash istenmez
    if (ev.pointerType && ev.pointerType !== "mouse") return;
    if (!session || session.state.winner || session.aiThinking) {
      setEdgePreview(null);
      return;
    }
    const svg = $("board");
    if (!svg) return;
    const p = clientToSvgPoint(svg, ev.clientX, ev.clientY);
    setEdgePreview(nearestUndrawnEdge(p.x, p.y));
  }

  function onBoardHoverLeave() {
    setEdgePreview(null);
  }

  function onBoardPointer(ev) {
    if (!session || session.state.winner || session.aiThinking) return;
    if (Date.now() < inputLockUntil) return;
    // Çoklu dokunuş / sağ tık yok say
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const svg = $("board");
    if (!svg) return;
    const p = clientToSvgPoint(svg, ev.clientX, ev.clientY);
    const edgeId = nearestUndrawnEdge(p.x, p.y);
    if (!edgeId) return;
    ev.preventDefault();
    lastPointerEdgeAt = Date.now();
    setEdgePreview(null);
    onEdgeClick(edgeId);
  }

  function bindBoardPointerOnce() {
    const svg = $("board");
    if (!svg || svg.dataset.pointerBound === "1") return;
    svg.dataset.pointerBound = "1";
    // Tek yol: pointerdown. touchstart+pointerdown çift hamle ekstra turu çalıyordu.
    if (window.PointerEvent) {
      svg.addEventListener("pointerdown", onBoardPointer, { passive: false });
    } else {
      svg.addEventListener(
        "touchstart",
        (ev) => {
          if (!ev.touches || !ev.touches[0]) return;
          const t = ev.touches[0];
          onBoardPointer({
            clientX: t.clientX,
            clientY: t.clientY,
            pointerType: "touch",
            button: 0,
            preventDefault: () => ev.preventDefault(),
          });
        },
        { passive: false }
      );
    }
    // Masaüstü hover: en yakın kenar (hit stroke sırasına değil)
    svg.addEventListener("pointermove", onBoardHoverMove, { passive: true });
    svg.addEventListener("pointerleave", onBoardHoverLeave);
  }

  /** Çizilen kenarı 0.5s parlat + renk değiştir + uçlardan ~%10 uzat. */
  function flashClaimedEdge(edgeId, boxed) {
    const line = document.querySelector(`#edge-layer line[data-edge="${edgeId}"]`);
    if (!line) return;
    clearTimeout(claimFlashTimer);
    document.querySelectorAll("#edge-layer line.edge-claim-flash").forEach((el) => {
      restoreEdgeGeometry(el);
      el.classList.remove("edge-claim-flash");
    });

    const x1 = Number(line.dataset.x1 != null ? line.dataset.x1 : line.getAttribute("x1"));
    const y1 = Number(line.dataset.y1 != null ? line.dataset.y1 : line.getAttribute("y1"));
    const x2 = Number(line.dataset.x2 != null ? line.dataset.x2 : line.getAttribute("x2"));
    const y2 = Number(line.dataset.y2 != null ? line.dataset.y2 : line.getAttribute("y2"));
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const grow = 1.1;
    line.setAttribute("x1", mx + (x1 - mx) * grow);
    line.setAttribute("y1", my + (y1 - my) * grow);
    line.setAttribute("x2", mx + (x2 - mx) * grow);
    line.setAttribute("y2", my + (y2 - my) * grow);
    line.classList.add("edge-claim-flash");
    playMoveSfx(boxed ? "box" : "claim");

    claimFlashTimer = setTimeout(() => {
      restoreEdgeGeometry(line);
      line.classList.remove("edge-claim-flash");
      claimFlashTimer = null;
    }, 500);
  }

  function restoreEdgeGeometry(line) {
    if (!line) return;
    if (line.dataset.x1 != null) line.setAttribute("x1", line.dataset.x1);
    if (line.dataset.y1 != null) line.setAttribute("y1", line.dataset.y1);
    if (line.dataset.x2 != null) line.setAttribute("x2", line.dataset.x2);
    if (line.dataset.y2 != null) line.setAttribute("y2", line.dataset.y2);
  }

  function buildBoardSvg(graph) {
    clearBoardSvg();
    layout = computeLayout(graph);
    const edgeLayer = $("edge-layer");
    const hitLayer = $("edge-hit-layer");
    const dotLayer = $("dot-layer");
    bindBoardPointerOnce();

    for (const edge of graph.edges.values()) {
      const a = layout.coords.get(edge.dotA.join(","));
      const b = layout.coords.get(edge.dotB.join(","));
      if (!a || !b) continue;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
      line.setAttribute("class", "edge-idle");
      line.dataset.edge = edge.id;
      line.dataset.x1 = String(a.x);
      line.dataset.y1 = String(a.y);
      line.dataset.x2 = String(b.x);
      line.dataset.y2 = String(b.y);
      edgeLayer.appendChild(line);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hit.setAttribute("x1", a.x);
      hit.setAttribute("y1", a.y);
      hit.setAttribute("x2", b.x);
      hit.setAttribute("y2", b.y);
      hit.setAttribute("class", "edge-hit");
      hit.dataset.edge = edge.id;
      // Hover SVG pointermove ile (nearestUndrawnEdge); hit sadece dokunma/yedek tık
      hit.addEventListener("click", (e) => {
        // pointerdown zaten işlediyse / kilit varken çift hamle olmasın
        if (Date.now() - lastPointerEdgeAt < 450 || Date.now() < inputLockUntil) {
          e.preventDefault();
          return;
        }
        onEdgeClick(edge.id);
      });
      hitLayer.appendChild(hit);
    }

    for (const [r, c] of graph.dots) {
      const p = layout.coords.get(`${r},${c}`);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", Math.max(1.1, layout.cell * 0.09));
      circle.setAttribute("class", "board-dot");
      circle.setAttribute("pointer-events", "none");
      dotLayer.appendChild(circle);
    }
  }

  function renderBoxes(graph, state) {
    const layer = $("box-layer");
    // Mevcut fill'leri koruyup yenilerini ekle (animasyon için).
    const existing = new Set(
      Array.from(layer.children).map((el) => el.dataset.box)
    );
    for (let i = 0; i < state.boxOwner.length; i++) {
      const owner = state.boxOwner[i];
      if (!owner || existing.has(String(i))) continue;
      const box = graph.boxes[i];
      const tl = layout.coords.get(`${box.r},${box.c}`);
      if (!tl) continue;
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", tl.x);
      rect.setAttribute("y", tl.y);
      rect.setAttribute("width", layout.cell);
      rect.setAttribute("height", layout.cell);
      rect.setAttribute("rx", Math.min(1.2, layout.cell * 0.08));
      rect.setAttribute("class", owner === PLAYERS.A ? "box-fill-a" : "box-fill-b");
      rect.dataset.box = String(i);
      layer.appendChild(rect);
    }
  }

  function renderEdges(state) {
    previewedEdgeId = null;
    document.querySelectorAll("#edge-layer line[data-edge]").forEach((line) => {
      const id = line.dataset.edge;
      const owner = state.edgeDrawnBy[id];
      const flashing = line.classList.contains("edge-claim-flash");
      line.classList.remove("edge-idle", "edge-a", "edge-b", "edge-preview", "edge-claim-flash");
      if (owner === PLAYERS.A) line.classList.add("edge-a");
      else if (owner === PLAYERS.B) line.classList.add("edge-b");
      else {
        restoreEdgeGeometry(line);
        line.classList.add("edge-idle");
      }
      if (flashing && owner) line.classList.add("edge-claim-flash");
    });
  }

  function updateHud() {
    if (!session) return;
    const { state, names, mode, humanPlayer } = session;
    $("name-a").textContent = names.A;
    $("name-b").textContent = names.B;
    $("score-a").textContent = String(state.scores.A);
    $("score-b").textContent = String(state.scores.B);

    const chipA = $("chip-a");
    const chipB = $("chip-b");
    chipA.classList.toggle("active-turn", !state.winner && state.turn === PLAYERS.A);
    chipB.classList.toggle("active-turn", !state.winner && state.turn === PLAYERS.B);

    const statusA = $("status-a");
    const statusB = $("status-b");
    statusA.textContent = "";
    statusB.textContent = "";
    if (!state.winner) {
      if (state.turn === PLAYERS.A) {
        statusA.textContent =
          mode === "solo" && humanPlayer === PLAYERS.A ? t("yourTurn") : t("yourTurn");
      } else {
        if (mode === "solo") statusB.textContent = session.aiThinking
          ? t("computerThinking")
          : t("opponentTurn");
        else statusB.textContent = t("yourTurn");
      }
    }

    const left = state.totalBoxes - state.scores.A - state.scores.B;
    $("boxes-left").textContent = `${left} ${t("boxesLeft")}`;

    const msg = $("status-msg");
    if (state.winner) msg.textContent = "";
    else if (session.aiThinking) msg.textContent = t("computerThinking");
    else if (
      state.lastMove &&
      state.lastMove.boxesCompleted.length > 0 &&
      state.turn === state.lastMove.player
    ) {
      msg.textContent = t("extraTurn");
    } else if (mode === "solo" && state.turn !== humanPlayer) {
      msg.textContent = t("computerThinking");
    } else {
      msg.textContent = t("yourTurn");
    }

    const end = $("end-panel");
    if (state.winner) {
      maybeRecordNoktalarScore();
      end.classList.remove("hidden");
      let text;
      if (state.winner === "draw") text = t("draw");
      else if (mode === "solo") {
        text = state.winner === humanPlayer ? t("youWin") : t("computerWins");
      } else {
        text = `${names[state.winner]} ${t("playerWins")}`;
      }
      $("end-text").textContent = text;
      $("end-score").textContent = `${t("finalScore")}: ${names.A} ${state.scores.A} · ${names.B} ${state.scores.B}`;
    } else {
      end.classList.add("hidden");
    }
  }

  function renderAll() {
    if (!session) return;
    renderEdges(session.state);
    renderBoxes(session.graph, session.state);
    updateHud();
  }

  function startGame(opts) {
    clearTimeout(aiTimer);
    clearTimeout(claimFlashTimer);
    claimFlashTimer = null;
    inputLockUntil = 0;
    const boardId = opts.boardId;
    const graph = Boards.getGraph(boardId);
    const state = createGameState(boardId, PLAYERS.A);
    const mode = opts.mode;
    const humanPlayer = PLAYERS.A;
    const names =
      mode === "solo"
        ? {
            A: opts.p1 || t("you"),
            B: t("computer"),
          }
        : {
            A: opts.p1 || t("player1Ph"),
            B: opts.p2 || t("player2Ph"),
          };

    session = {
      mode,
      difficulty: opts.difficulty || "medium",
      boardId,
      graph,
      state,
      humanPlayer,
      names,
      aiThinking: false,
    };

    buildBoardSvg(graph);
    showScreen("game");
    renderAll();

    // Solo: eğer AI başlıyorsa (şimdilik A=insan başlar) — gerekmez.
    maybeScheduleAi();
  }

  function onEdgeClick(edgeId) {
    if (!session || session.state.winner) return;
    if (session.aiThinking) return;
    if (Date.now() < inputLockUntil) return;
    const { state, mode, humanPlayer } = session;
    if (mode === "solo" && state.turn !== humanPlayer) {
      toast(t("notYourTurn"));
      return;
    }
    if (mode === "p2p" && state.turn !== humanPlayer) {
      toast(t("notYourTurn"));
      return;
    }
    playHumanMove(edgeId);
  }

  function playHumanMove(edgeId, opts) {
    if (!session) return;
    const fromNet = opts && opts.fromNet;
    if (!fromNet && Date.now() < inputLockUntil) return;
    const player = session.state.turn;
    const r = applyMove(session.boardId, session.state, edgeId, player);
    if (!r.ok) {
      if (!fromNet) {
        toast(r.error === "Bu çizgi zaten çizili." ? t("edgeTaken") : r.error);
      }
      return;
    }
    const boxed =
      r.state.lastMove && r.state.lastMove.boxesCompleted
        ? r.state.lastMove.boxesCompleted.length
        : 0;
    // Kutu sonrası çift tetikleme (pointer+click/ghost) ekstra turu çalıyordu
    if (!fromNet) {
      inputLockUntil = Date.now() + (boxed > 0 ? 520 : 360);
    }
    session.state = r.state;
    renderAll();
    flashClaimedEdge(edgeId, boxed > 0);
    if (session.mode === "p2p" && !fromNet && p2pSession) {
      p2pSession.send({ type: "edge", edgeId, moveCount: session.state.moveCount || 0 });
    }
    maybeScheduleAi();
  }

  // —— P2P ——
  let p2pSession = null;
  let p2pLobby = null;

  function destroyDotsP2P() {
    if (p2pSession) {
      try {
        p2pSession.destroy();
      } catch (_) {}
    }
    p2pSession = null;
    p2pLobby = null;
  }

  function renderP2pBoardGrid() {
    renderBoardPicker(
      "p2p-board-grid",
      setup.boardId,
      (id) => {
        setup.boardId = id;
        renderP2pBoardGrid();
      },
      false
    );
  }

  function bindDotsP2P(sessionP2P) {
    sessionP2P.on("connected", () => {
      toast(t("connected"));
      if (sessionP2P.isHost) {
        p2pLobby.guestJoined = true;
        sessionP2P.send({
          type: "hello",
          name: p2pLobby.names.A,
          role: "host",
          boardId: p2pLobby.boardId,
        });
      } else {
        sessionP2P.send({
          type: "hello",
          name: p2pLobby.names.B,
          role: "guest",
        });
      }
      updateP2pRoomUi();
    });
    sessionP2P.on("error", () => toast(t("peerFail")));
    sessionP2P.on("disconnected", () => toast(t("peerFail")));
    sessionP2P.on("message", (data) => {
      if (!data || !data.type) return;
      if (data.type === "hello") {
        if (p2pLobby.you === "A" && data.role === "guest") {
          p2pLobby.names.B = data.name || t("player2Ph");
          p2pLobby.guestJoined = true;
          sessionP2P.send({
            type: "lobby",
            names: p2pLobby.names,
            ready: p2pLobby.ready,
            boardId: p2pLobby.boardId,
            guestJoined: true,
          });
        } else if (p2pLobby.you === "B" && data.role === "host") {
          p2pLobby.names.A = data.name || t("player1Ph");
          if (data.boardId) p2pLobby.boardId = data.boardId;
          p2pLobby.guestJoined = true;
        }
        updateP2pRoomUi();
      } else if (data.type === "lobby") {
        p2pLobby.names = data.names || p2pLobby.names;
        p2pLobby.ready = data.ready || p2pLobby.ready;
        if (data.boardId) p2pLobby.boardId = data.boardId;
        p2pLobby.guestJoined = !!data.guestJoined;
        updateP2pRoomUi();
      } else if (data.type === "ready") {
        p2pLobby.ready[data.who] = !!data.value;
        updateP2pRoomUi();
        maybeStartDotsP2P();
      } else if (data.type === "start") {
        beginDotsP2PGame(data.boardId, data.names || p2pLobby.names);
      } else if (data.type === "edge") {
        if (!session || session.mode !== "p2p") return;
        playHumanMove(data.edgeId, { fromNet: true });
      }
    });
  }

  function updateP2pRoomUi() {
    if (!p2pLobby) return;
    const room = $("p2p-room");
    if (room) room.classList.remove("hidden");
    if ($("p2p-room-code")) $("p2p-room-code").textContent = p2pLobby.code;
    if ($("p2p-room-hint")) {
      $("p2p-room-hint").textContent = p2pLobby.guestJoined
        ? `${p2pLobby.names.A} vs ${p2pLobby.names.B || "…"}`
        : t("waitingGuest");
    }
    const btn = $("btn-p2p-ready");
    if (btn) {
      btn.disabled = !p2pLobby.guestJoined;
      const me = p2pLobby.you;
      btn.textContent = p2pLobby.ready[me] ? t("readyOn") : t("ready");
    }
  }

  function maybeStartDotsP2P() {
    if (!p2pLobby || !p2pLobby.guestJoined) return;
    if (!p2pLobby.ready.A || !p2pLobby.ready.B) return;
    if (p2pLobby.you !== "A") return;
    p2pSession.send({
      type: "start",
      boardId: p2pLobby.boardId,
      names: p2pLobby.names,
    });
    beginDotsP2PGame(p2pLobby.boardId, p2pLobby.names);
  }

  function beginDotsP2PGame(boardId, names) {
    const graph = Boards.getGraph(boardId);
    const state = createGameState(boardId);
    session = {
      mode: "p2p",
      difficulty: null,
      boardId,
      graph,
      state,
      humanPlayer: p2pLobby.you === "A" ? PLAYERS.A : PLAYERS.B,
      names: { A: names.A, B: names.B },
      aiThinking: false,
    };
    buildBoardSvg(graph);
    showScreen("game");
    renderAll();
  }

  async function hostDotsP2P() {
    if (!window.ArenaP2P) {
      toast(t("peerFail"));
      return;
    }
    destroyDotsP2P();
    const name = ($("p2p-name").value || "").trim() || t("player1Ph");
    toast(t("connecting"));
    try {
      p2pSession = new ArenaP2P.P2PSession({ prefix: "noktalar" });
      bindDotsP2P(p2pSession);
      const code = await p2pSession.host();
      p2pLobby = {
        code,
        you: "A",
        names: { A: name, B: null },
        ready: { A: false, B: false },
        guestJoined: false,
        boardId: setup.boardId,
      };
      updateP2pRoomUi();
    } catch (_) {
      toast(t("peerFail"));
      destroyDotsP2P();
    }
  }

  async function joinDotsP2P() {
    if (!window.ArenaP2P) {
      toast(t("peerFail"));
      return;
    }
    const code = ($("p2p-code").value || "").trim().toUpperCase();
    if (!code) {
      toast(t("needCode"));
      return;
    }
    destroyDotsP2P();
    const name = ($("p2p-name").value || "").trim() || t("player2Ph");
    toast(t("connecting"));
    try {
      p2pSession = new ArenaP2P.P2PSession({ prefix: "noktalar" });
      bindDotsP2P(p2pSession);
      await p2pSession.join(code);
      p2pLobby = {
        code,
        you: "B",
        names: { A: "—", B: name },
        ready: { A: false, B: false },
        guestJoined: false,
        boardId: setup.boardId,
      };
      updateP2pRoomUi();
    } catch (_) {
      toast(t("peerFail"));
      destroyDotsP2P();
    }
  }

  function maybeScheduleAi() {
    if (!session || session.mode !== "solo") return;
    if (session.state.winner) {
      clearTimeout(aiTimer);
      session.aiThinking = false;
      return;
    }
    // Ekstra tur insanda: bekleyen AI zamanlayıcısını iptal et
    if (session.state.turn === session.humanPlayer) {
      clearTimeout(aiTimer);
      session.aiThinking = false;
      return;
    }
    session.aiThinking = true;
    updateHud();
    clearTimeout(aiTimer);
    const delay = 380 + Math.random() * 420;
    aiTimer = setTimeout(runAiTurn, delay);
  }

  function runAiTurn() {
    if (!session || session.mode !== "solo") return;
    if (session.state.winner) {
      session.aiThinking = false;
      updateHud();
      return;
    }
    if (session.state.turn === session.humanPlayer) {
      session.aiThinking = false;
      updateHud();
      return;
    }

    const move = Ai.chooseMove(session.graph, session.state, session.state.turn, {
      difficulty: session.difficulty,
    });
    if (!move) {
      session.aiThinking = false;
      updateHud();
      return;
    }
    const r = applyMove(session.boardId, session.state, move.edgeId, session.state.turn);
    if (!r.ok) {
      session.aiThinking = false;
      updateHud();
      return;
    }
    session.state = r.state;
    renderAll();
    const boxed =
      r.state.lastMove && r.state.lastMove.boxesCompleted
        ? r.state.lastMove.boxesCompleted.length
        : 0;
    flashClaimedEdge(move.edgeId, boxed > 0);

    // Ekstra tur: AI yine oynuyor
    if (!session.state.winner && session.state.turn !== session.humanPlayer) {
      const nextDelay = 280 + Math.random() * 320;
      aiTimer = setTimeout(runAiTurn, nextDelay);
    } else {
      session.aiThinking = false;
      updateHud();
    }
  }

  function rematch() {
    if (!session) return;
    startGame({
      mode: session.mode,
      difficulty: session.difficulty,
      boardId: session.boardId,
      p1: session.names.A,
      p2: session.mode === "twop" ? session.names.B : "",
    });
  }

  function changeBoard() {
    if (!session) {
      showScreen("play");
      return;
    }
    setup.mode = session.mode;
    setup.difficulty = session.difficulty;
    setup.boardId = session.boardId;
    clearTimeout(aiTimer);
    session = null;
    if (setup.mode === "solo") {
      renderDiffGrid();
      renderBoardGrids();
      showScreen("soloSetup");
    } else {
      renderBoardGrids();
      showScreen("twoPSetup");
    }
  }

  function goHome() {
    clearTimeout(aiTimer);
    session = null;
    showScreen("home");
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
    setup.mode = "solo";
    setup.difficulty = settings.aiDifficulty || "medium";
    setup.boardId = recommendedBoard(setup.difficulty);
    renderDiffGrid();
    renderBoardGrids();
    showScreen("soloSetup");
  });
  $("btn-mode-2p").addEventListener("click", () => {
    setup.mode = "twop";
    if ($("p1-name")) $("p1-name").value = settings.p1 || "";
    if ($("p2-name")) $("p2-name").value = settings.p2 || "";
    if (!setup.boardId) setup.boardId = "grid-6x6";
    renderBoardGrids();
    showScreen("twoPSetup");
  });

  $("btn-solo-start").addEventListener("click", () => {
    startGame({
      mode: "solo",
      difficulty: setup.difficulty,
      boardId: setup.boardId,
      p1: t("you"),
    });
  });

  $("btn-2p-start").addEventListener("click", () => {
    const p1 = ($("p1-name").value || "").trim() || t("player1Ph");
    const p2 = ($("p2-name").value || "").trim() || t("player2Ph");
    saveSettings({ p1, p2 });
    startGame({
      mode: "twop",
      difficulty: "medium",
      boardId: setup.boardId,
      p1,
      p2,
    });
  });

  $("btn-settings-save").addEventListener("click", () => {
    const selectedLang =
      (document.querySelector('input[name="lang"]:checked') || {}).value || "tr";
    const selectedDiff =
      (document.querySelector('input[name="defDiff"]:checked') || {}).value ||
      "medium";
    const displayName =
      ($("settings-display-name") && $("settings-display-name").value) || "";
    saveSettings({
      lang: selectedLang,
      aiDifficulty: ["easy", "medium", "hard", "veryhard"].includes(selectedDiff)
        ? selectedDiff
        : "medium",
    });
    if (window.ArenaScore) window.ArenaScore.setDisplayName(displayName);
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

  $("btn-rematch").addEventListener("click", rematch);
  $("btn-change-board").addEventListener("click", changeBoard);
  $("btn-game-home").addEventListener("click", goHome);
  $("btn-game-back").addEventListener("click", () => {
    clearTimeout(aiTimer);
    if (!session) {
      goHome();
      return;
    }
    changeBoard();
  });
  $("btn-game-restart").addEventListener("click", () => {
    if (session) rematch();
  });

  function isIosSafari() {
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const webkit = /WebKit/.test(ua);
    const notOther = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return iOS && webkit && notOther;
  }

  function isStandalone() {
    try {
      if (window.navigator.standalone) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (_) {}
    return false;
  }

  function showSafariTipIfNeeded() {
    const tip = $("safari-tip");
    if (!tip) return;
    if (isIosSafari() && !isStandalone()) {
      tip.classList.remove("hidden");
      tip.textContent = t("safariTip");
    } else {
      tip.classList.add("hidden");
    }
  }

  if ($("btn-mode-p2p")) {
    $("btn-mode-p2p").addEventListener("click", () => {
      destroyDotsP2P();
      if ($("p2p-room")) $("p2p-room").classList.add("hidden");
      renderP2pBoardGrid();
      showScreen("p2p");
    });
  }
  if ($("btn-p2p-back")) {
    $("btn-p2p-back").addEventListener("click", () => {
      destroyDotsP2P();
      showScreen("play");
    });
  }
  if ($("btn-p2p-create")) {
    $("btn-p2p-create").addEventListener("click", () => hostDotsP2P());
  }
  if ($("btn-p2p-join")) {
    $("btn-p2p-join").addEventListener("click", () => joinDotsP2P());
  }
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
        boardId: p2pLobby.boardId,
        guestJoined: p2pLobby.guestJoined,
      });
      updateP2pRoomUi();
      maybeStartDotsP2P();
    });
  }
  if ($("btn-p2p-copy")) {
    $("btn-p2p-copy").addEventListener("click", async () => {
      if (!p2pLobby) return;
      try {
        await navigator.clipboard.writeText(p2pLobby.code);
        toast(t("codeCopied"));
      } catch (_) {
        toast(p2pLobby.code);
      }
    });
  }

  // Boot
  if (Sfx && Sfx.bindFirstGesture) Sfx.bindFirstGesture(document);
  if (window.ArenaHubBack) {
    hubBackCtl = window.ArenaHubBack.bind({ getLang: lang });
  }
  applyI18n();
  fillSettingsForm();
  showSafariTipIfNeeded();
  if (window.ArenaSW) window.ArenaSW.register("./sw.js");
})();
