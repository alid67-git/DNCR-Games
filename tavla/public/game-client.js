(() => {
  const E = window.TavlaEngine;
  const Ai = window.TavlaAi;
  const CFG = window.TavlaConfig;
  const I18N = window.TavlaI18n;
  const P2P = window.TavlaP2P;
  if (!E || !Ai || !CFG || !I18N) {
    console.error("Tavla: missing modules");
    return;
  }

  const { PLAYERS, createState, applyRoll, applyMove, legalMoves, serialize, deserialize, opponent, offCount, barCount, pointsOwned } = E;

  const SETTINGS_KEY = "tavla_settings";
  const SEEN_VER_KEY = "tavla_seen_version";
  const STARTER_KEY = "tavla_next_starter";
  const MAX_VISIBLE = 5;

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
  /** @type {null | number | 'bar'} */
  let selected = null;
  let aiTimer = null;
  let boardReady = false;
  /** @type {null | object} */
  let p2p = null;
  let p2pLobby = null;
  let hubBackCtl = null;
  const Sfx = window.DncrMoveSfx || null;
  const Audio = window.TavlaAudio || null;
  /** @type {Map<number, HTMLButtonElement>} */
  const pointEls = new Map();

  function playMoveSfx(kind) {
    if (Audio) {
      Audio.unlock();
      Audio.playSfx(kind || "move");
      return;
    }
    if (!Sfx) return;
    Sfx.unlock();
    Sfx.play(kind || "move");
  }

  function ensureMusic() {
    if (!Audio) return;
    Audio.unlock();
    Audio.applyPrefs({
      music: settings.music !== false,
      sfx: settings.sfx !== false,
    });
    if (settings.music !== false) Audio.startMusic();
  }

  function loadSettings() {
    const defaults = {
      lang: "tr",
      aiDifficulty: "normal",
      name: "",
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
    if (!el) return;
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
    if ($("updates-current-game"))
      $("updates-current-game").textContent = `${CFG.version} (${CFG.build})`;
    renderChangelog();
    updateUpdatesDot();
    renderDiffGrid();
    if (hubBackCtl && hubBackCtl.refresh) hubBackCtl.refresh();
  }

  function renderScores() {
    if (!window.ArenaScore || !$("scores-panel")) return;
    window.ArenaScore.renderInto($("scores-panel"), {
      lang: lang(),
      gameId: "tavla",
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
    const winnerCaps =
      (session.state.captures && session.state.captures[session.state.winner]) || 0;
    window.ArenaScore.record({
      gameId: "tavla",
      result: session.mode === "twop" ? "win" : result,
      difficulty: session.difficulty || settings.aiDifficulty || "normal",
      mode: session.mode === "twop" ? "twop" : session.mode,
      stats: { captures: winnerCaps },
    });
  }

  function renderChangelog() {
    const list = $("changelog-list");
    if (!list) return;
    list.innerHTML = "";
    const L = lang();
    (CFG.changelog || []).forEach((entry) => {
      const card = document.createElement("article");
      card.className = "upgrade-card";
      const items = (entry.items && entry.items[L]) || (entry.items && entry.items.tr) || [];
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
      if (v === PLAYERS.white || v === PLAYERS.blue) return v;
    } catch (_) {}
    return PLAYERS.white;
  }

  function writeNextStarter(starter) {
    try {
      localStorage.setItem(STARTER_KEY, opponent(starter));
    } catch (_) {}
  }

  // —— Board ——
  function makePoint(n, tipClass) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `point ${tipClass} ${n % 2 === 0 ? "even" : "odd"}`;
    btn.dataset.point = String(n);
    btn.setAttribute("aria-label", `Point ${n}`);
    btn.addEventListener("click", () => onPointClick(n));
    pointEls.set(n, btn);
    return btn;
  }

  function buildBoard() {
    if (boardReady) return;
    const top = $("board-top");
    const bottom = $("board-bottom");
    if (!top || !bottom) return;
    top.innerHTML = "";
    bottom.innerHTML = "";
    pointEls.clear();
    for (let n = 13; n <= 18; n++) top.appendChild(makePoint(n, "tip-up"));
    for (let n = 19; n <= 24; n++) top.appendChild(makePoint(n, "tip-up"));
    for (let n = 12; n >= 7; n--) bottom.appendChild(makePoint(n, "tip-down"));
    for (let n = 6; n >= 1; n--) bottom.appendChild(makePoint(n, "tip-down"));
    boardReady = true;
  }

  function appendCheckers(container, count, color) {
    const show = Math.min(count, MAX_VISIBLE);
    for (let i = 0; i < show; i++) {
      const c = document.createElement("span");
      c.className = `checker ${color}`;
      container.appendChild(c);
    }
    if (count > MAX_VISIBLE) {
      const badge = document.createElement("span");
      badge.className = "overflow";
      badge.textContent = String(count);
      container.appendChild(badge);
    }
  }

  function renderBar(state) {
    const stack = $("bar-stack");
    const zone = $("bar-zone");
    if (!stack) return;
    stack.innerHTML = "";
    const w = barCount(state, PLAYERS.white);
    const b = barCount(state, PLAYERS.blue);
    const top = document.createElement("div");
    top.className = "bar-half bar-white";
    appendCheckers(top, w, "white");
    const bot = document.createElement("div");
    bot.className = "bar-half bar-blue";
    appendCheckers(bot, b, "blue");
    stack.appendChild(top);
    stack.appendChild(bot);
    if (zone) {
      zone.classList.toggle("selected", selected === "bar");
      zone.classList.toggle("legal-from", isSelectableFrom("bar"));
    }
  }

  function renderOff(state) {
    const ow = $("off-white");
    const ob = $("off-blue");
    if (ow) {
      ow.textContent = String(offCount(state, PLAYERS.white));
      ow.classList.toggle("legal", isLegalTarget("off", PLAYERS.white));
    }
    if (ob) {
      ob.textContent = String(offCount(state, PLAYERS.blue));
      ob.classList.toggle("legal", isLegalTarget("off", PLAYERS.blue));
    }
  }

  let diceAnimTimer = null;
  let diceBusy = false;

  function makeDieEl(value, extraClass) {
    const die = document.createElement("span");
    die.className = "die" + (extraClass ? " " + extraClass : "");
    die.dataset.value = String(value);
    die.setAttribute("aria-label", String(value));
    const pips = document.createElement("span");
    pips.className = "pips";
    pips.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 9; i++) {
      pips.appendChild(document.createElement("span")).className = "pip";
    }
    die.appendChild(pips);
    return die;
  }

  function paintDice(values, opts) {
    const row = $("dice-row");
    if (!row) return;
    const rolling = !!(opts && opts.rolling);
    const settle = !!(opts && opts.settle);
    const remaining = (opts && opts.remaining ? opts.remaining.slice() : null);
    row.innerHTML = "";
    const list = values && values.length ? values : [];
    list.forEach((v, i) => {
      let cls = "";
      if (rolling) cls = "rolling";
      else if (settle) cls = "settle";
      const die = makeDieEl(v, cls);
      if (!rolling && remaining) {
        const idx = remaining.indexOf(v);
        if (idx >= 0) remaining.splice(idx, 1);
        else die.classList.add("used");
      }
      if (rolling) die.style.animationDelay = `${i * 0.07}s`;
      row.appendChild(die);
    });
  }

  function renderDice(state) {
    if (diceBusy) return;
    const raw = state.lastRoll || state.diceRaw;
    if (!raw || !raw.length) {
      paintDice([]);
      return;
    }
    const isDouble = raw[0] === raw[1];
    const slots = isDouble ? [raw[0], raw[0], raw[0], raw[0]] : [raw[0], raw[1]];
    paintDice(slots, { remaining: (state.dice || []).slice() });
  }

  function playDiceRollAnim(finalPair, done) {
    clearTimeout(diceAnimTimer);
    diceBusy = true;
    const btn = $("btn-roll");
    if (btn) btn.classList.add("is-rolling");
    if (Audio) {
      Audio.unlock();
      Audio.playDiceRoll();
    } else {
      playMoveSfx("place");
    }
    let tick = 0;
    const flicker = () => {
      const a = 1 + ((Math.random() * 6) | 0);
      const b = 1 + ((Math.random() * 6) | 0);
      paintDice([a, b], { rolling: true });
      tick += 1;
      if (tick < 7) {
        diceAnimTimer = setTimeout(flicker, 90);
      } else {
        const isDouble = finalPair[0] === finalPair[1];
        const slots = isDouble
          ? [finalPair[0], finalPair[0], finalPair[0], finalPair[0]]
          : [finalPair[0], finalPair[1]];
        paintDice(slots, { settle: true });
        diceAnimTimer = setTimeout(() => {
          diceBusy = false;
          if (btn) btn.classList.remove("is-rolling");
          if (typeof done === "function") done();
        }, 420);
      }
    };
    flicker();
  }

  function currentMoves() {
    if (!session || session.state.phase !== "move" || session.state.winner) return [];
    if (!isMyTurn()) return [];
    return legalMoves(session.state);
  }

  function isSelectableFrom(from) {
    return currentMoves().some((m) => m.from === from);
  }

  function isLegalTarget(to, forPlayer) {
    if (!session || !isMyTurn() || session.state.phase !== "move") return false;
    if (selected == null) return false;
    if (to === "off") {
      if (forPlayer && session.state.turn !== forPlayer) return false;
      return currentMoves().some((m) => m.from === selected && m.to === "off");
    }
    return currentMoves().some((m) => m.from === selected && m.to === to);
  }

  function renderBoard() {
    if (!session || !boardReady) return;
    const s = session.state;
    for (let n = 1; n <= 24; n++) {
      const el = pointEls.get(n);
      if (!el) continue;
      el.innerHTML = "";
      const w = pointsOwned(s.points, n, PLAYERS.white);
      const b = pointsOwned(s.points, n, PLAYERS.blue);
      if (w > 0) appendCheckers(el, w, "white");
      else if (b > 0) appendCheckers(el, b, "blue");
      el.classList.toggle("selected", selected === n);
      el.classList.toggle("legal-from", isSelectableFrom(n));
      el.classList.toggle("legal", isLegalTarget(n));
    }
    renderBar(s);
    renderOff(s);
    renderDice(s);
  }

  function isMyTurn() {
    if (!session || session.state.winner) return false;
    if (session.mode === "solo") {
      return session.state.turn === PLAYERS.white && !session.aiThinking;
    }
    if (session.mode === "twop") return true;
    if (session.mode === "p2p") {
      const you = session.you || (p2pLobby && p2pLobby.you);
      return session.state.turn === you && session.status === "playing";
    }
    return false;
  }

  function renderGame() {
    if (!session) return;
    const s = session.state;
    renderBoard();

    $("score-white").textContent = String(offCount(s, PLAYERS.white));
    $("score-blue").textContent = String(offCount(s, PLAYERS.blue));
    $("name-chip-white").textContent = session.names.white;
    $("name-chip-blue").textContent = session.names.blue;

    const pipW = E.pipCount ? E.pipCount(s, PLAYERS.white) : 0;
    const pipB = E.pipCount ? E.pipCount(s, PLAYERS.blue) : 0;
    $("meta-white").textContent = `${t("pipLabel")} ${pipW}`;
    $("meta-blue").textContent = `${t("pipLabel")} ${pipB}`;

    $("chip-white").classList.toggle("active", s.turn === PLAYERS.white && !s.winner);
    $("chip-blue").classList.toggle("active", s.turn === PLAYERS.blue && !s.winner);

    const mine = isMyTurn();
    let phaseText = "";
    if (s.winner) phaseText = lang() === "en" ? "Game over" : "Oyun bitti";
    else if (session.aiThinking || diceBusy) phaseText = t("statusCpu");
    else if (!mine && session.mode !== "twop") phaseText = t("oppTurn");
    else if (s.phase === "move") phaseText = t("movePhase");
    else phaseText = "";
    if ($("phase-label")) $("phase-label").textContent = phaseText;

    const rollBtn = $("btn-roll");
    if (rollBtn) {
      const canRoll = s.phase === "roll" && mine && !s.winner && !diceBusy;
      rollBtn.disabled = !canRoll;
      rollBtn.classList.toggle("hidden", !(s.phase === "roll" || diceBusy) || !!s.winner);
    }

    if (s.winner) $("status-msg").textContent = "";
    else if (diceBusy) $("status-msg").textContent = "";
    else if (session.aiThinking) $("status-msg").textContent = t("statusCpu");
    else if (!mine && session.mode !== "twop") $("status-msg").textContent = "";
    else if (s.phase === "roll") $("status-msg").textContent = "";
    else if (selected != null) $("status-msg").textContent = t("selectTarget");
    else $("status-msg").textContent = t("selectPoint");

    const end = $("end-panel");
    if (s.winner) {
      maybeRecordScore();
      if (!session.endSfxPlayed) {
        session.endSfxPlayed = true;
        if (session.mode === "solo") {
          playMoveSfx(s.winner === PLAYERS.white ? "win" : "lose");
        } else if (session.mode === "p2p") {
          playMoveSfx(s.winner === session.you ? "win" : "lose");
        } else {
          playMoveSfx("win");
        }
      }
      end.classList.remove("hidden");
      if (session.mode === "solo") {
        $("end-text").textContent =
          s.winner === PLAYERS.white ? t("winYou") : t("winOpp");
      } else if (session.mode === "p2p") {
        $("end-text").textContent =
          s.winner === session.you ? t("winYou") : t("winOpp");
      } else {
        $("end-text").textContent =
          s.winner === PLAYERS.white ? t("winWhite") : t("winBlue");
      }
    } else end.classList.add("hidden");
  }

  function sendSync() {
    if (session && session.mode === "p2p" && p2p) {
      p2p.send({ type: "sync", state: serialize(session.state) });
    }
  }

  function doRoll(opts) {
    if (!session || session.state.winner || diceBusy) return;
    const fromNet = opts && opts.fromNet;
    const skipAnim = !!(opts && opts.skipAnim);
    if (!fromNet && !isMyTurn()) {
      toast(t("oppTurn"));
      return;
    }
    if (session.state.phase !== "roll") return;
    const r = applyRoll(session.state, opts && opts.roll);
    if (!r.ok) {
      if (!fromNet) toast(r.error || t("rollPhase"));
      return;
    }
    const finish = () => {
      session.state = r.state;
      selected = null;
      if (r.skipped) toast(t("noMoves"));
      renderGame();
      if (!fromNet) sendSync();
      maybeScheduleAi();
    };
    if (skipAnim || fromNet) {
      playMoveSfx("place");
      finish();
      return;
    }
    const pair = (r.state.lastRoll || r.state.diceRaw || [1, 1]).slice(0, 2);
    const rollBtn = $("btn-roll");
    if (rollBtn) {
      rollBtn.disabled = true;
      rollBtn.classList.add("is-rolling");
    }
    playDiceRollAnim(pair, finish);
  }

  function doMove(move, opts) {
    if (!session || session.state.winner) return;
    const fromNet = opts && opts.fromNet;
    if (!fromNet && !isMyTurn()) {
      toast(t("oppTurn"));
      return;
    }
    const r = applyMove(session.state, move);
    if (!r.ok) {
      if (!fromNet) toast(r.error || t("selectTarget"));
      return;
    }
    session.state = r.state;
    selected = null;
    if (move.hit) playMoveSfx("capture");
    else if (move.to === "off") playMoveSfx("claim");
    else playMoveSfx("move");
    renderGame();
    if (!fromNet) sendSync();
    maybeScheduleAi();
  }

  function pickMove(from, to) {
    const moves = currentMoves().filter((m) => m.from === from && m.to === to);
    if (!moves.length) return null;
    // Prefer higher die when several match same path
    moves.sort((a, b) => b.die - a.die);
    return moves[0];
  }

  function onPointClick(n) {
    if (!session || session.state.winner) return;
    if (!isMyTurn()) {
      toast(session.mode === "solo" ? t("statusCpu") : t("oppTurn"));
      return;
    }
    if (session.state.phase !== "move") {
      toast(t("rollPhase"));
      return;
    }
    const moves = currentMoves();

    if (selected != null) {
      const m = pickMove(selected, n);
      if (m) {
        doMove(m);
        return;
      }
      // Retarget: click another legal from
      if (isSelectableFrom(n)) {
        const fromMoves = moves.filter((x) => x.from === n);
        if (fromMoves.length === 1) {
          doMove(fromMoves[0]);
          return;
        }
        selected = n;
        renderGame();
        return;
      }
      selected = null;
      renderGame();
      return;
    }

    if (isSelectableFrom(n)) {
      const fromMoves = moves.filter((x) => x.from === n);
      if (fromMoves.length === 1) {
        doMove(fromMoves[0]);
        return;
      }
      // Unique destinations → still need choice if >1 target
      const targets = [...new Set(fromMoves.map((x) => x.to))];
      if (targets.length === 1) {
        doMove(fromMoves[0]);
        return;
      }
      selected = n;
      playMoveSfx("select");
      renderGame();
      return;
    }

    // Direct click on a unique complete-move target (no from selected)
    const toMoves = moves.filter((x) => x.to === n);
    if (toMoves.length === 1) {
      doMove(toMoves[0]);
    }
  }

  function onBarClick() {
    if (!session || session.state.winner) return;
    if (!isMyTurn() || session.state.phase !== "move") return;
    const moves = currentMoves().filter((m) => m.from === "bar");
    if (!moves.length) return;
    if (selected === "bar") {
      selected = null;
      renderGame();
      return;
    }
    const targets = [...new Set(moves.map((m) => m.to))];
    if (targets.length === 1) {
      doMove(moves[0]);
      return;
    }
    selected = "bar";
    playMoveSfx("select");
    renderGame();
  }

  function onOffClick(player) {
    if (!session || session.state.winner) return;
    if (!isMyTurn() || session.state.phase !== "move") return;
    if (session.state.turn !== player) return;
    if (selected == null) {
      // Unique off move
      const offs = currentMoves().filter((m) => m.to === "off");
      if (offs.length === 1) {
        doMove(offs[0]);
      } else if (offs.length > 1) {
        // Prefer selecting from if ambiguous
        const froms = [...new Set(offs.map((m) => m.from))];
        if (froms.length === 1) {
          selected = froms[0];
          renderGame();
        }
      }
      return;
    }
    const m = pickMove(selected, "off");
    if (m) doMove(m);
  }

  function maybeScheduleAi() {
    if (!session || session.mode !== "solo" || session.state.winner) return;
    if (session.state.phase === "roll" && session.state.turn === PLAYERS.blue) {
      scheduleAi(520);
    }
  }

  function scheduleAi(delay) {
    clearTimeout(aiTimer);
    if (!session || session.mode !== "solo" || session.state.winner) return;
    if (session.state.turn !== PLAYERS.blue || session.state.phase !== "roll") return;
    session.aiThinking = true;
    renderGame();
    aiTimer = setTimeout(() => {
      if (!session || session.mode !== "solo") return;
      if (session.state.turn !== PLAYERS.blue || session.state.winner) {
        session.aiThinking = false;
        renderGame();
        return;
      }
      const result = Ai.playTurn(session.state, session.difficulty || "normal");
      session.aiThinking = false;
      selected = null;
      const pair = (result.roll || (result.state && result.state.lastRoll) || [1, 1]).slice(0, 2);
      playDiceRollAnim(pair, () => {
        if (!session || session.mode !== "solo") return;
        session.state = result.state;
        if (result.skipped) toast(t("noMoves"));
        else if (result.moves && result.moves.some((m) => m.hit)) playMoveSfx("capture");
        else playMoveSfx("move");
        renderGame();
      });
    }, delay == null ? 520 : delay);
  }

  function startSolo() {
    clearTimeout(aiTimer);
    destroyP2P();
    ensureMusic();
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "solo",
      difficulty: setupDiff,
      names: {
        white: t("you"),
        blue: t("computer"),
      },
      state: createState({ starter }),
      aiThinking: false,
      scoreRecorded: false,
      endSfxPlayed: false,
    };
    selected = null;
    showScreen("game");
    renderGame();
    if (starter === PLAYERS.blue) scheduleAi(650);
  }

  function startTwoP() {
    clearTimeout(aiTimer);
    destroyP2P();
    ensureMusic();
    const p1 = ($("p1-name").value || "").trim() || t("player1Ph");
    const p2 = ($("p2-name").value || "").trim() || t("player2Ph");
    saveSettings({ p1, p2 });
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "twop",
      names: { white: p1, blue: p2 },
      state: createState({ starter }),
      scoreRecorded: false,
      endSfxPlayed: false,
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
    $("name-white").textContent = p2pLobby.names.white || "—";
    $("name-blue").textContent = p2pLobby.names.blue || t("waitingGuest");
    $("ready-white").textContent = p2pLobby.ready.white ? t("readyOn") : t("waiting");
    $("ready-white").classList.toggle("on", !!p2pLobby.ready.white);
    $("ready-blue").textContent = p2pLobby.guestJoined
      ? p2pLobby.ready.blue
        ? t("readyOn")
        : t("waiting")
      : "—";
    $("ready-blue").classList.toggle("on", !!p2pLobby.ready.blue);
    const btn = $("btn-ready");
    btn.disabled = !p2pLobby.guestJoined;
    const iAmReady = p2pLobby.ready[p2pLobby.you];
    btn.textContent = iAmReady ? t("readyOn") : t("ready");
    $("share-hint").textContent =
      p2pLobby.you === PLAYERS.white
        ? `${t("shareHintHost")} ${p2pLobby.code}`
        : t("shareHintGuest");
  }

  function maybeStartP2PGame() {
    if (!p2pLobby || !p2pLobby.guestJoined) return;
    if (!p2pLobby.ready.white || !p2pLobby.ready.blue) return;
    if (p2pLobby.you !== PLAYERS.white) return; // host starts
    const starter = p2pLobby.nextStarter || PLAYERS.white;
    p2pLobby.nextStarter = opponent(starter);
    const state = createState({ starter });
    p2p.send({
      type: "start",
      starter,
      state: serialize(state),
      names: p2pLobby.names,
      nextStarter: p2pLobby.nextStarter,
    });
    beginP2PGame(state, p2pLobby.names);
  }

  function beginP2PGame(state, names) {
    ensureMusic();
    session = {
      mode: "p2p",
      status: "playing",
      you: p2pLobby.you,
      names: names || p2pLobby.names,
      state,
      scoreRecorded: false,
      endSfxPlayed: false,
    };
    selected = null;
    showScreen("game");
    renderGame();
  }

  function createP2PSession() {
    if (window.ArenaP2P) {
      return ArenaP2P.createSession({
        prefix: "tavla",
        transport: ArenaP2P.getTransport(),
      });
    }
    if (P2P && P2P.P2PSession) return new P2P.P2PSession();
    throw new Error("no p2p");
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
    sessionP2P.on("disconnected", () => {
      toast(t("disconnect"));
    });
    sessionP2P.on("error", (msg) => {
      toast(typeof msg === "string" ? msg : t("peerFail"));
    });
    sessionP2P.on("message", (data) => {
      if (!data || !data.type) return;
      if (data.type === "hello") {
        if (p2pLobby.you === PLAYERS.white && data.role === "guest") {
          p2pLobby.names.blue = data.name || t("blue");
          p2pLobby.guestJoined = true;
          p2pLobby.ready.blue = false;
          p2p.send({
            type: "lobby",
            names: p2pLobby.names,
            ready: p2pLobby.ready,
            guestJoined: true,
          });
          renderRoom();
        } else if (p2pLobby.you === PLAYERS.blue && data.role === "host") {
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
        const st = data.state
          ? deserialize(data.state)
          : createState({ starter: data.starter });
        beginP2PGame(st, p2pLobby.names);
      } else if (data.type === "sync") {
        if (!session || session.mode !== "p2p") return;
        try {
          session.state = deserialize(data.state);
          selected = null;
          renderGame();
        } catch (_) {}
      } else if (data.type === "roll") {
        if (!session || session.mode !== "p2p") return;
        doRoll({ fromNet: true, roll: data.roll });
      } else if (data.type === "move") {
        if (!session || session.mode !== "p2p") return;
        if (data.state) {
          try {
            session.state = deserialize(data.state);
            selected = null;
            renderGame();
          } catch (_) {}
        } else if (data.move) {
          doMove(data.move, { fromNet: true });
        }
      } else if (data.type === "rematch-ask") {
        p2pLobby.ready = { white: false, blue: false };
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
      p2p = createP2PSession();
      bindP2PHandlers(p2p);
      const code = await p2p.host();
      p2pLobby = {
        code,
        you: PLAYERS.white,
        names: { white: name, blue: null },
        ready: { white: false, blue: false },
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
      p2p = createP2PSession();
      bindP2PHandlers(p2p);
      await p2p.join(code);
      p2pLobby = {
        code,
        you: PLAYERS.blue,
        names: { white: "—", blue: name },
        ready: { white: false, blue: false },
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
    if ($("set-music")) $("set-music").checked = settings.music !== false;
    if ($("set-sfx")) $("set-sfx").checked = settings.sfx !== false;
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
    session = null;
    destroyP2P();
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
    const musicOn = $("set-music") ? !!$("set-music").checked : true;
    const sfxOn = $("set-sfx") ? !!$("set-sfx").checked : true;
    saveSettings({
      lang: selectedLang,
      aiDifficulty: ["easy", "normal", "hard", "veryhard"].includes(selectedDiff)
        ? selectedDiff
        : "normal",
      name: displayName.trim() || settings.name,
      music: musicOn,
      sfx: sfxOn,
    });
    if (window.ArenaScore) window.ArenaScore.setDisplayName(displayName);
    if (Audio) {
      Audio.unlock();
      Audio.setMusic(musicOn);
      Audio.setSfx(sfxOn);
      if (musicOn) Audio.startMusic();
    }
    setupDiff = settings.aiDifficulty;
    applyI18n();
    toast(t("saved"));
  });

  if ($("set-music")) {
    $("set-music").addEventListener("change", async (e) => {
      const on = !!e.target.checked;
      saveSettings({ music: on });
      if (Audio) {
        await Audio.unlock();
        Audio.setMusic(on);
        if (on) Audio.startMusic();
      }
    });
  }
  if ($("set-sfx")) {
    $("set-sfx").addEventListener("change", async (e) => {
      const on = !!e.target.checked;
      saveSettings({ sfx: on });
      if (Audio) {
        await Audio.unlock();
        Audio.setSfx(on);
        if (on) Audio.playSfx("select");
      }
    });
  }

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
      p2pLobby.ready = { white: false, blue: false };
      p2p.send({ type: "rematch-ask", who: p2pLobby.you });
      session = null;
      showScreen("room");
      renderRoom();
    }
  });

  $("btn-rematch").addEventListener("click", () => {
    $("btn-game-restart").click();
  });

  $("btn-roll").addEventListener("click", () => doRoll());
  if ($("bar-zone")) $("bar-zone").addEventListener("click", () => onBarClick());
  if ($("off-white"))
    $("off-white").addEventListener("click", () => onOffClick(PLAYERS.white));
  if ($("off-blue"))
    $("off-blue").addEventListener("click", () => onOffClick(PLAYERS.blue));

  // Boot
  if (Audio) {
    Audio.applyPrefs({
      music: settings.music !== false,
      sfx: settings.sfx !== false,
    });
    const unlockOnce = () => {
      Audio.unlock();
      document.removeEventListener("pointerdown", unlockOnce, true);
      document.removeEventListener("keydown", unlockOnce, true);
    };
    document.addEventListener("pointerdown", unlockOnce, true);
    document.addEventListener("keydown", unlockOnce, true);
  }
  if (Sfx && Sfx.bindFirstGesture) Sfx.bindFirstGesture(document);
  if (window.ArenaHubBack) {
    hubBackCtl = window.ArenaHubBack.bind({ getLang: lang });
  }
  applyI18n();
  if (window.ArenaP2P && ArenaP2P.initTransportUi) ArenaP2P.initTransportUi();
  fillSettingsForm();
  buildBoard();
  if (window.ArenaSW) window.ArenaSW.register("./sw.js");
})();
