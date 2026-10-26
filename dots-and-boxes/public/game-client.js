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
    easy: ["grid-8x8", "grid-8x9", "shape-star"],
    medium: ["grid-9x9", "grid-8x10", "shape-cat", "shape-star"],
    hard: ["grid-9x10", "shape-fish", "shape-rabbit", "grid-8x10"],
    veryhard: ["grid-10x10", "shape-rabbit", "grid-9x10", "shape-fish"],
  };

  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("screen-home"),
    play: $("screen-play"),
    soloSetup: $("screen-solo-setup"),
    twoPSetup: $("screen-2p-setup"),
    settings: $("screen-settings"),
    help: $("screen-help"),
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
  let inputLockUntil = 0; // çift dokunuş / pointer+touch çift hamle kilidi
  let leaveAction = null; // "home" | "setup" | null
  const GAME_DURATION_MS = 60 * 60 * 1000; // 1 saat
  let timerStartedAt = 0;
  let timerRaf = 0;

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
    document.body.classList.toggle("in-game", name === "game");
    if (name !== "game") {
      document.body.classList.remove("game-solo", "game-twop", "landscape-game");
      const hint = $("couch-hint");
      if (hint) hint.classList.add("hidden");
      stopGameTimer();
      hideConfirmLeave();
    }
  }

  function formatTimer(msLeft) {
    const ms = Math.max(0, msLeft);
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${h}:${pad(m)}:${pad(s)}`;
  }

  function updateTimerDisplay() {
    const el = $("game-timer");
    if (!el || !session || !timerStartedAt) return;
    const left = GAME_DURATION_MS - (Date.now() - timerStartedAt);
    el.textContent = formatTimer(left);
    el.classList.toggle("timer-low", left <= 5 * 60 * 1000 && left > 0);
    el.classList.toggle("timer-done", left <= 0);
    if (left <= 0 && session && !session.state.winner) {
      endByTimeout();
    }
  }

  function tickTimer() {
    updateTimerDisplay();
    if (!session || session.state.winner) {
      timerRaf = 0;
      return;
    }
    timerRaf = window.setTimeout(tickTimer, 250);
  }

  function startGameTimer() {
    stopGameTimer();
    timerStartedAt = Date.now();
    updateTimerDisplay();
    tickTimer();
  }

  function stopGameTimer() {
    if (timerRaf) {
      clearTimeout(timerRaf);
      timerRaf = 0;
    }
  }

  function endByTimeout() {
    if (!session || session.state.winner) return;
    clearTimeout(aiTimer);
    session.aiThinking = false;
    clearAiFx();
    const next = Engine.cloneState(session.state);
    const a = next.scores.A;
    const b = next.scores.B;
    next.winner = a === b ? "draw" : a > b ? PLAYERS.A : PLAYERS.B;
    session.state = next;
    stopGameTimer();
    const el = $("game-timer");
    if (el) {
      el.textContent = "0:00:00";
      el.classList.add("timer-done");
    }
    renderAll();
    toast(t("timeUp"));
  }

  function showConfirmLeave(action) {
    leaveAction = action;
    const box = $("confirm-leave");
    if (!box) return;
    const text = $("confirm-leave-text");
    if (text) text.textContent = t("confirmLeave");
    box.classList.remove("hidden");
  }

  function hideConfirmLeave() {
    leaveAction = null;
    const box = $("confirm-leave");
    if (box) box.classList.add("hidden");
  }

  function confirmLeaveYes() {
    const action = leaveAction;
    hideConfirmLeave();
    clearTimeout(aiTimer);
    clearAiFx();
    stopGameTimer();
    if (action === "setup") changeBoard();
    else goHome();
  }

  function applyGameLayout(mode) {
    document.body.classList.toggle("game-solo", mode === "solo");
    document.body.classList.toggle("game-twop", mode === "twop");
    syncLandscapeClass();
    const hint = $("couch-hint");
    if (hint) hint.classList.add("hidden");
    if (mode === "twop") {
      tryLockLandscape(true);
    } else {
      tryLockLandscape(false);
    }
  }

  function syncLandscapeClass() {
    const landscape =
      window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
    document.body.classList.toggle("landscape-game", !!landscape);
  }

  function tryLockLandscape(want) {
    const orient = screen.orientation;
    if (!orient || typeof orient.lock !== "function") return;
    if (want) {
      orient.lock("landscape").catch(() => {});
    } else if (typeof orient.unlock === "function") {
      try {
        orient.unlock();
      } catch (_) {}
    }
  }

  window.addEventListener("orientationchange", () => {
    setTimeout(syncLandscapeClass, 120);
  });
  if (window.matchMedia) {
    const mq = window.matchMedia("(orientation: landscape)");
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", syncLandscapeClass);
    else if (typeof mq.addListener === "function") mq.addListener(syncLandscapeClass);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clearAiFx() {
    const fx = $("fx-layer");
    if (fx) fx.innerHTML = "";
    const wrap = document.querySelector(".board-wrap");
    if (wrap) {
      wrap.classList.remove("ai-spotlight");
      wrap.classList.remove("ai-striking");
    }
    const banner = $("ai-move-banner");
    if (banner) {
      banner.classList.add("hidden");
      banner.textContent = "";
    }
  }

  function showAiFocusFx(edgeId) {
    const edge = session.graph.edges.get(edgeId);
    const fx = $("fx-layer");
    const wrap = document.querySelector(".board-wrap");
    const banner = $("ai-move-banner");
    if (!edge || !fx || !layout) return false;
    clearAiFx();
    if (wrap) wrap.classList.add("ai-spotlight");
    if (banner) {
      banner.textContent = t("aiWatchHere");
      banner.classList.remove("hidden");
    }

    const a = layout.coords.get(edge.dotA.join(","));
    const b = layout.coords.get(edge.dotB.join(","));
    if (!a || !b) return false;

    const dim = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    dim.setAttribute("x", 0);
    dim.setAttribute("y", 0);
    dim.setAttribute("width", 100);
    dim.setAttribute("height", 100);
    dim.setAttribute("class", "fx-dim");
    fx.appendChild(dim);

    // Geniş sarı halo → orta glow → parlak çekirdek (üç katman)
    const halo = document.createElementNS("http://www.w3.org/2000/svg", "line");
    halo.setAttribute("x1", a.x);
    halo.setAttribute("y1", a.y);
    halo.setAttribute("x2", b.x);
    halo.setAttribute("y2", b.y);
    halo.setAttribute("class", "fx-ai-halo");
    fx.appendChild(halo);

    const glow = document.createElementNS("http://www.w3.org/2000/svg", "line");
    glow.setAttribute("x1", a.x);
    glow.setAttribute("y1", a.y);
    glow.setAttribute("x2", b.x);
    glow.setAttribute("y2", b.y);
    glow.setAttribute("class", "fx-ai-glow");
    fx.appendChild(glow);

    const core = document.createElementNS("http://www.w3.org/2000/svg", "line");
    core.setAttribute("x1", a.x);
    core.setAttribute("y1", a.y);
    core.setAttribute("x2", b.x);
    core.setAttribute("y2", b.y);
    core.setAttribute("class", "fx-ai-core");
    fx.appendChild(core);

    for (const p of [a, b]) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", p.x);
      ring.setAttribute("cy", p.y);
      ring.setAttribute("r", 5.5);
      ring.setAttribute("class", "fx-ai-ring");
      fx.appendChild(ring);

      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", 4);
      c.setAttribute("class", "fx-ai-dot");
      fx.appendChild(c);
    }
    return true;
  }

  /** AI hamlesi: kısa sarı vurgu → çiz → kutu dolduysa hızlı parlat. */
  async function highlightAndPlayAi(edgeId) {
    const wrap = document.querySelector(".board-wrap");
    showAiFocusFx(edgeId);
    updateHud();
    await sleep(420);

    if (wrap) wrap.classList.add("ai-striking");
    await sleep(160);

    const r = applyMove(session.boardId, session.state, edgeId, session.state.turn);
    if (!r.ok) {
      if (wrap) wrap.classList.remove("ai-striking");
      clearAiFx();
      return false;
    }
    session.state = r.state;
    if (wrap) wrap.classList.remove("ai-striking");
    clearAiFx();
    renderAll();

    const completed = (session.state.lastMove && session.state.lastMove.boxesCompleted) || [];
    const drawn = document.querySelector(`#edge-layer line[data-edge="${edgeId}"]`);
    if (drawn) {
      drawn.classList.add(completed.length ? "edge-ai-reveal edge-ai-box" : "edge-ai-reveal");
      completed.forEach((bi) => {
        const el = document.querySelector(`#box-layer [data-box="${bi}"]`);
        if (el) el.classList.add("box-ai-flash");
      });
      // Kutu doldururken de hızlı — sadece kısa vurgu
      await sleep(completed.length ? 520 : 380);
      drawn.classList.remove("edge-ai-reveal", "edge-ai-box");
      document.querySelectorAll(".box-ai-flash").forEach((el) => el.classList.remove("box-ai-flash"));
    } else {
      await sleep(220);
    }
    return true;
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
    renderBoardGrids();
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
        <span class="board-meta">${g.dotRows}×${g.dotCols} · ${g.totalBoxes} ${t("boxesCount")}</span>
        <span>${t("winTarget")} ${winNeed}</span>
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
      svg.addEventListener("mousedown", (ev) => onBoardPointer(ev), { passive: false });
    }
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
      edgeLayer.appendChild(line);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hit.setAttribute("x1", a.x);
      hit.setAttribute("y1", a.y);
      hit.setAttribute("x2", b.x);
      hit.setAttribute("y2", b.y);
      hit.setAttribute("class", "edge-hit");
      hit.dataset.edge = edge.id;
      // Masaüstü hover önizleme; dokunma ana yol board pointer
      hit.addEventListener("pointerenter", () => previewEdge(edge.id, true));
      hit.addEventListener("pointerleave", () => previewEdge(edge.id, false));
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

  function previewEdge(edgeId, on) {
    if (!session || session.state.edgeDrawnBy[edgeId]) return;
    const line = document.querySelector(`.edge-idle[data-edge="${edgeId}"]`);
    if (!line) return;
    if (on) line.classList.add("edge-preview");
    else line.classList.remove("edge-preview");
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
    document.querySelectorAll("#edge-layer line[data-edge]").forEach((line) => {
      const id = line.dataset.edge;
      const owner = state.edgeDrawnBy[id];
      line.classList.remove("edge-idle", "edge-a", "edge-b", "edge-preview");
      if (owner === PLAYERS.A) line.classList.add("edge-a");
      else if (owner === PLAYERS.B) line.classList.add("edge-b");
      else line.classList.add("edge-idle");
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
        statusA.textContent = mode === "twop" ? t("sideTurn") : t("yourTurn");
      } else if (mode === "solo") {
        statusB.textContent = session.aiThinking ? t("computerThinking") : t("opponentTurn");
      } else {
        statusB.textContent = t("sideTurn");
      }
    }

    const left = state.totalBoxes - state.scores.A - state.scores.B;
    $("boxes-left").textContent = `${left} ${t("boxesLeft")}`;

    const msg = $("status-msg");
    if (state.winner) msg.textContent = "";
    else if (session.aiThinking) msg.textContent = t("aiMoveHint");
    else if (
      state.lastMove &&
      state.lastMove.boxesCompleted.length > 0 &&
      state.turn === state.lastMove.player
    ) {
      msg.textContent = t("extraTurn");
    } else if (mode === "solo" && state.turn !== humanPlayer) {
      msg.textContent = t("aiMoveHint");
    } else if (mode === "twop") {
      msg.textContent =
        state.turn === PLAYERS.A
          ? `${names.A} — ${t("sideTurn")}`
          : `${names.B} — ${t("sideTurn")}`;
    } else {
      msg.textContent = t("yourTurn");
    }

    const end = $("end-panel");
    if (state.winner) {
      stopGameTimer();
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
    applyGameLayout(mode);
    startGameTimer();
    renderAll();
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
    playHumanMove(edgeId);
  }

  function playHumanMove(edgeId) {
    if (!session) return;
    const player = session.state.turn;
    const r = applyMove(session.boardId, session.state, edgeId, player);
    if (!r.ok) {
      toast(r.error === "Bu çizgi zaten çizili." ? t("edgeTaken") : r.error);
      return;
    }
    // Kutu kazanınca ikinci dokunuşun yanlışlıkla başka kenarı çizmesini engelle
    inputLockUntil = Date.now() + 380;
    session.state = r.state;
    renderAll();
    maybeScheduleAi();
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
    const delay = 380 + Math.random() * 220;
    aiTimer = setTimeout(() => {
      runAiTurn().catch(() => {
        if (session) {
          session.aiThinking = false;
          clearAiFx();
          updateHud();
        }
      });
    }, delay);
  }

  async function runAiTurn() {
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

    const ok = await highlightAndPlayAi(move.edgeId);
    if (!ok || !session) {
      if (session) {
        session.aiThinking = false;
        updateHud();
      }
      return;
    }

    // Ekstra tur: AI yine oynuyor — kısa ara
    if (!session.state.winner && session.state.turn !== session.humanPlayer) {
      await sleep(220);
      aiTimer = setTimeout(() => {
        runAiTurn().catch(() => {
          if (session) {
            session.aiThinking = false;
            clearAiFx();
            updateHud();
          }
        });
      }, 40);
    } else {
      session.aiThinking = false;
      clearAiFx();
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
    tryLockLandscape(false);
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
  $("btn-settings-back").addEventListener("click", () => showScreen("home"));
  $("btn-help-back").addEventListener("click", () => showScreen("home"));
  $("btn-updates-back").addEventListener("click", () => showScreen("home"));

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
    if (!setup.boardId) setup.boardId = "grid-8x8";
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
    saveSettings({
      lang: selectedLang,
      aiDifficulty: ["easy", "medium", "hard", "veryhard"].includes(selectedDiff)
        ? selectedDiff
        : "medium",
    });
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

  $("btn-rematch").addEventListener("click", rematch);
  $("btn-change-board").addEventListener("click", changeBoard);
  $("btn-game-home").addEventListener("click", goHome);
  $("btn-game-back").addEventListener("click", () => {
    if (!session) {
      goHome();
      return;
    }
    if (session.state.winner) {
      changeBoard();
      return;
    }
    showConfirmLeave("setup");
  });
  $("btn-game-end").addEventListener("click", () => {
    if (!session) {
      goHome();
      return;
    }
    if (session.state.winner) {
      goHome();
      return;
    }
    showConfirmLeave("home");
  });
  $("btn-confirm-leave-yes").addEventListener("click", confirmLeaveYes);
  $("btn-confirm-leave-no").addEventListener("click", hideConfirmLeave);

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

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // file:// ve capacitor’da SW gerekmez / desteklenmez
    if (location.protocol === "file:") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // Boot
  applyI18n();
  fillSettingsForm();
  showSafariTipIfNeeded();
  registerServiceWorker();
})();
