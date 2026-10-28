(() => {
  const E = window.SayibulmaEngine;
  const Ai = window.SayibulmaAi;
  const CFG = window.SayibulmaConfig;
  const I18N = window.SayibulmaI18n;
  const P2P = window.SayibulmaP2P;
  if (!E || !Ai || !CFG || !I18N || !P2P) {
    console.error("Sayı Bulma: missing modules");
    return;
  }

  const {
    DIGIT_COUNT,
    PLAYERS,
    opponent,
    isValidSecret,
    randomSecret,
    createMatch,
    applyGuess,
  } = E;

  const SETTINGS_KEY = "sayibulma_settings";
  const SEEN_VER_KEY = "sayibulma_seen_version";
  const STARTER_KEY = "sayibulma_next_starter";
  const GAME_ID = "sayi";

  /** Bilgisayar her zaman düşük performans (kolay) */
  const AI_DIFFICULTY = "easy";
  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $("screen-home"),
    play: $("screen-play"),
    soloSetup: $("screen-solo-setup"),
    p2p: $("screen-p2p"),
    room: $("screen-room"),
    settings: $("screen-settings"),
    help: $("screen-help"),
    scores: $("screen-scores"),
    updates: $("screen-updates"),
    game: $("screen-game"),
  };

  let settings = loadSettings();
  /** @type {null | object} */
  let session = null;
  let aiTimer = null;
  /** @type {null | object} */
  let p2p = null;
  let p2pLobby = null;
  let hubBackCtl = null;
  const Sfx = window.DncrMoveSfx || null;

  const pads = {
    soloSecret: makeDigitPad("solo-secret-slots", "solo-secret-pad", { mask: true }),
    roomSecret: makeDigitPad("room-secret-slots", "room-secret-pad", { mask: true }),
    guess: makeDigitPad("guess-slots", "guess-pad", { mask: false }),
  };

  function playSfx(kind) {
    if (!Sfx) return;
    Sfx.unlock();
    Sfx.play(kind || "move");
  }

  function loadSettings() {
    const defaults = {
      lang: "tr",
      aiDifficulty: AI_DIFFICULTY,
      name: "",
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

  function makeDigitPad(slotsId, padId, opts) {
    const state = {
      /** @type {(string|null)[]} */
      slots: Array(DIGIT_COUNT).fill(null),
      active: 0,
      mask: !!(opts && opts.mask),
      locked: false,
      onChange: null,
    };
    const slotsEl = $(slotsId);
    const padEl = $(padId);
    if (!slotsEl || !padEl) return state;

    function firstEmpty(from) {
      const start = typeof from === "number" ? from : 0;
      for (let i = start; i < DIGIT_COUNT; i++) {
        if (state.slots[i] == null) return i;
      }
      for (let i = 0; i < start; i++) {
        if (state.slots[i] == null) return i;
      }
      return -1;
    }

    function filledCount() {
      let n = 0;
      for (let i = 0; i < DIGIT_COUNT; i++) if (state.slots[i] != null) n++;
      return n;
    }

    function render() {
      if (state.active < 0 || state.active >= DIGIT_COUNT) {
        state.active = Math.max(0, firstEmpty(0));
        if (state.active < 0) state.active = 0;
      }
      slotsEl.innerHTML = "";
      for (let i = 0; i < DIGIT_COUNT; i++) {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className =
          "digit-slot" +
          (state.slots[i] != null ? " is-filled" : "") +
          (!state.locked && i === state.active ? " is-active" : "") +
          (state.locked ? " is-locked" : "");
        const v = state.slots[i];
        slot.textContent = v == null ? "" : state.mask ? "•" : v;
        slot.disabled = state.locked;
        slot.setAttribute("aria-label", "Basamak " + (i + 1));
        slot.addEventListener("click", () => {
          if (state.locked) return;
          state.active = i;
          playSfx("select");
          render();
        });
        slotsEl.appendChild(slot);
      }
      padEl.querySelectorAll(".digit-key").forEach((btn) => {
        const d = btn.dataset.digit;
        const usedElsewhere =
          state.slots.some((x, idx) => x === d && idx !== state.active);
        const lead0 = state.active === 0 && d === "0";
        btn.disabled = state.locked || usedElsewhere || lead0;
        btn.classList.toggle("is-used", usedElsewhere);
        btn.classList.toggle("is-lead-block", lead0);
      });
      if (typeof state.onChange === "function") state.onChange(state.value());
    }

    padEl.innerHTML = "";
    for (let d = 0; d <= 9; d++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "digit-key";
      btn.dataset.digit = String(d);
      btn.textContent = String(d);
      btn.addEventListener("click", () => {
        if (state.locked) return;
        const dig = String(d);
        if (state.active === 0 && dig === "0") return;
        // Aynı rakam başka kutudaysa taşıma / yer değiştirme yok — engelle
        for (let i = 0; i < DIGIT_COUNT; i++) {
          if (i !== state.active && state.slots[i] === dig) return;
        }
        state.slots[state.active] = dig;
        playSfx("select");
        const next = firstEmpty(state.active + 1);
        state.active = next >= 0 ? next : state.active;
        render();
      });
      padEl.appendChild(btn);
    }

    state.value = () => {
      if (filledCount() < DIGIT_COUNT) return "";
      return state.slots.join("");
    };
    state.clear = () => {
      if (state.locked) return;
      state.slots = Array(DIGIT_COUNT).fill(null);
      state.active = 0;
      render();
    };
    /** Sil: seçili kutuyu temizle; boşsa önceki dolu basamağı sil */
    state.backspace = () => {
      if (state.locked) return;
      if (state.slots[state.active] != null) {
        state.slots[state.active] = null;
      } else {
        for (let i = state.active - 1; i >= 0; i--) {
          if (state.slots[i] != null) {
            state.slots[i] = null;
            state.active = i;
            break;
          }
        }
      }
      playSfx("select");
      render();
    };
    state.set = (str) => {
      if (state.locked) return;
      const s = String(str || "").replace(/\D/g, "").slice(0, DIGIT_COUNT);
      const seen = Object.create(null);
      const next = Array(DIGIT_COUNT).fill(null);
      let i = 0;
      for (const ch of s) {
        if (i >= DIGIT_COUNT) break;
        if (seen[ch]) continue;
        if (i === 0 && ch === "0") continue;
        seen[ch] = true;
        next[i] = ch;
        i++;
      }
      state.slots = next;
      state.active = firstEmpty(0);
      if (state.active < 0) state.active = 0;
      render();
    };
    state.setMask = (m) => {
      state.mask = !!m;
      render();
    };
    state.setLocked = (locked) => {
      state.locked = !!locked;
      render();
    };
    render();
    return state;
  }

  function setGuessInputLocked(locked) {
    const on = !!locked;
    pads.guess.setLocked(on);
    const stage = $("guess-stage");
    if (stage) {
      stage.classList.toggle("is-locked", on);
      stage.setAttribute("aria-disabled", on ? "true" : "false");
    }
    ["btn-guess-clear", "btn-guess-submit"].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = on;
    });
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
    const cur = `${CFG.version} (${CFG.build})`;
    if ($("updates-current")) $("updates-current").textContent = cur;
    if ($("updates-current-game")) $("updates-current-game").textContent = cur;
    renderChangelog();
    updateUpdatesDot();
    if (hubBackCtl && hubBackCtl.refresh) hubBackCtl.refresh();
  }

  function renderScores() {
    if (!window.ArenaScore || !$("scores-panel")) return;
    window.ArenaScore.renderInto($("scores-panel"), {
      lang: lang(),
      gameId: GAME_ID,
    });
  }

  function maybeRecordScore() {
    if (!session || !session.state || !session.state.winner || session.scoreRecorded) return;
    if (!window.ArenaScore) return;
    session.scoreRecorded = true;
    let result = "loss";
    if (session.mode === "solo") {
      result = session.state.winner === PLAYERS.a ? "win" : "loss";
    } else if (session.mode === "p2p") {
      result = session.state.winner === session.you ? "win" : "loss";
    }
    const youKey =
      session.mode === "p2p"
        ? session.you
        : PLAYERS.a;
    const guesses = (session.state.histories[youKey] || []).length;
    window.ArenaScore.record({
      gameId: GAME_ID,
      result,
      difficulty: AI_DIFFICULTY,
      mode: session.mode,
      stats: { guesses },
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

  function readNextStarter() {
    try {
      const v = localStorage.getItem(STARTER_KEY);
      if (v === PLAYERS.a || v === PLAYERS.b) return v;
    } catch (_) {}
    return PLAYERS.a;
  }

  function writeNextStarter(starter) {
    try {
      localStorage.setItem(STARTER_KEY, opponent(starter));
    } catch (_) {}
  }

  function canAct() {
    if (!session || session.state.winner) return false;
    if (session.mode === "solo") {
      return session.state.turn === PLAYERS.a && !session.aiThinking;
    }
    if (session.mode === "p2p") {
      return session.you === session.state.turn && session.status === "playing";
    }
    return false;
  }

  function spacedDigits(s) {
    return String(s || "")
      .split("")
      .join(" ");
  }

  function showLastFeedback(guess, score) {
    const box = $("last-feedback");
    if (!box || !score) return;
    $("lf-guess").textContent = spacedDigits(guess);
    $("lf-plus").textContent = `+${score.plus}`;
    $("lf-minus").textContent = `−${score.minus}`;
    box.classList.remove("hidden", "is-pop");
    void box.offsetWidth;
    box.classList.add("is-pop");
    clearTimeout(showLastFeedback._t);
    showLastFeedback._t = setTimeout(() => {
      box.classList.remove("is-pop");
    }, 900);
  }

  function renderHistoryList(el, rows) {
    if (!el) return;
    el.innerHTML = "";
    const list = rows || [];
    list.forEach((h, idx) => {
      const li = document.createElement("li");
      const latest = idx === list.length - 1;
      li.className = "guess-row" + (latest ? " is-latest" : "");
      li.innerHTML =
        `<span class="guess-digits">${spacedDigits(h.guess)}</span>` +
        `<span class="score-chips" aria-label="+${h.plus} −${h.minus}">` +
        `<span class="chip-plus">+${h.plus}</span>` +
        `<span class="chip-minus">−${h.minus}</span>` +
        `</span>`;
      el.appendChild(li);
    });
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      el.classList.toggle("is-scrollable", el.scrollHeight > el.clientHeight + 4);
    });
  }

  function renderGame() {
    if (!session) return;
    const s = session.state;
    $("name-chip-a").textContent = session.names.a;
    $("name-chip-b").textContent = session.names.b;
    const attemptsA = (s.histories.a || []).length;
    const attemptsB = (s.histories.b || []).length;
    $("score-a").textContent = String(attemptsA);
    $("score-b").textContent = String(attemptsB);
    if ($("attempts-label")) {
      const mine =
        session.mode === "p2p"
          ? (s.histories[session.you] || []).length
          : attemptsA;
      $("attempts-label").textContent = `${t("attemptsLabel")}: ${mine}`;
    }
    $("chip-a").classList.toggle("is-turn", s.turn === PLAYERS.a && !s.winner);
    $("chip-b").classList.toggle("is-turn", s.turn === PLAYERS.b && !s.winner);
    // Chip altında kısa durum — uzun cümleler phase-label'da
    $("meta-a").textContent =
      s.winner === PLAYERS.a ? "✓" : s.turn === PLAYERS.a && !s.winner ? "●" : "";
    $("meta-b").textContent =
      s.winner === PLAYERS.b ? "✓" : s.turn === PLAYERS.b && !s.winner ? "●" : "";

    if (session.mode === "solo") {
      $("hist-title-a").textContent = t("historyYou");
      $("hist-title-b").textContent = t("historyOpp");
    } else {
      const you = session.you;
      $("hist-title-a").textContent =
        you === PLAYERS.a ? t("historyYou") : session.names.a;
      $("hist-title-b").textContent =
        you === PLAYERS.b ? t("historyYou") : session.names.b;
    }

    renderHistoryList($("hist-a"), s.histories.a);
    renderHistoryList($("hist-b"), s.histories.b);

    const locked = !canAct();
    setGuessInputLocked(locked);
    const cpuWait =
      session.mode === "solo" && !s.winner && (session.aiThinking || s.turn === PLAYERS.b);
    updateCpuWaitUi(cpuWait);

    let phase = "";
    if (s.winner) {
      phase = t("gameOver");
    } else if (cpuWait) {
      phase = t("statusCpu");
    } else if (canAct()) {
      phase = t("turnYou");
    } else {
      phase = t("statusOpp");
    }
    $("phase-label").textContent = phase;
    // Pad altında tekrar etmeyelim; ipucu yalnızca henüz tahmin yokken
    const anyGuess =
      (s.histories.a && s.histories.a.length) || (s.histories.b && s.histories.b.length);
    $("status-msg").textContent =
      !s.winner && canAct() && !anyGuess ? t("statusGuess") : "";

    const end = $("end-panel");
    const showResultBtn = $("btn-show-result");
    const stage = $("guess-stage");
    if (s.winner) {
      fillEndPanelText();
      maybeRecordScore();
      if (stage) stage.classList.add("hidden");
      if (!session.endDismissed) {
        if (!session.endCardShown) {
          resetEndCardPosition();
          session.endCardShown = true;
        }
        end.classList.remove("hidden");
        if (showResultBtn) showResultBtn.classList.add("hidden");
      } else {
        end.classList.add("hidden");
        if (showResultBtn) showResultBtn.classList.remove("hidden");
      }
    } else {
      end.classList.add("hidden");
      if (showResultBtn) showResultBtn.classList.add("hidden");
      if (stage) stage.classList.remove("hidden");
      session.endDismissed = false;
      session.endCardShown = false;
      resetEndCardPosition();
    }
    renderNoteDigits();
  }

  function fillEndPanelText() {
    if (!session || !session.state || !session.state.winner) return;
    const s = session.state;
    let msg = t("winOther");
    if (session.mode === "solo") {
      msg = s.winner === PLAYERS.a ? t("winYou") : t("winCpu");
    } else if (session.mode === "p2p") {
      msg = s.winner === session.you ? t("winYou") : `${session.names[s.winner]} ${t("winOther")}`;
    }
    $("end-text").textContent = msg;
    const revealBits = [];
    if (session.mode === "solo") {
      revealBits.push(`${t("revealSecret")}: ${s.secrets.b}`);
      revealBits.push(`${t("yourSecretWas")}: ${s.secrets.a}`);
    } else if (session.mode === "p2p") {
      const opp = opponent(session.you);
      revealBits.push(`${t("revealSecret")}: ${s.secrets[opp]}`);
    }
    $("end-reveal").textContent = revealBits.join(" · ");
  }


  function resetEndCardPosition() {
    const card = $("end-card");
    if (!card) return;
    card.style.transform = "";
    card.dataset.dragX = "0";
    card.dataset.dragY = "0";
    card.classList.remove("is-dragging");
  }

  function dismissEndPanel() {
    if (!session || !session.state || !session.state.winner) return;
    session.endDismissed = true;
    const end = $("end-panel");
    if (end) end.classList.add("hidden");
    if ($("btn-show-result")) $("btn-show-result").classList.remove("hidden");
  }

  function openEndPanel() {
    if (!session || !session.state || !session.state.winner) return;
    session.endDismissed = false;
    session.endCardShown = true;
    fillEndPanelText();
    resetEndCardPosition();
    const end = $("end-panel");
    if (end) end.classList.remove("hidden");
    if ($("btn-show-result")) $("btn-show-result").classList.add("hidden");
  }

  function bindEndCardDrag() {
    const card = $("end-card");
    if (!card || card.dataset.dragBound) return;
    card.dataset.dragBound = "1";
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    let moved = false;

    function apply(x, y) {
      card.dataset.dragX = String(x);
      card.dataset.dragY = String(y);
      card.style.transform = "translate(" + x + "px," + y + "px)";
    }

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      const t = e.target;
      if (t && t.closest && t.closest("button, a, input")) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      baseX = parseFloat(card.dataset.dragX || "0") || 0;
      baseY = parseFloat(card.dataset.dragY || "0") || 0;
      card.classList.add("is-dragging");
      try {
        card.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      apply(baseX + dx, baseY + dy);
    }

    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("is-dragging");
      try {
        card.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", onPointerUp);
    card.addEventListener(
      "click",
      (e) => {
        if (moved) {
          e.preventDefault();
          e.stopPropagation();
          moved = false;
        }
      },
      true
    );
  }

  function noteMarks() {
    if (!session) return Object.create(null);
    if (!session.noteMarks) {
      // Eski oturumlarda noteStruck → out
      session.noteMarks = Object.create(null);
      if (session.noteStruck) {
        Object.keys(session.noteStruck).forEach((k) => {
          if (session.noteStruck[k]) session.noteMarks[k] = "out";
        });
      }
    }
    return session.noteMarks;
  }

  function cycleNoteMark(dig) {
    const map = noteMarks();
    const cur = map[dig] || "";
    if (cur === "out") map[dig] = "in";
    else if (cur === "in") delete map[dig];
    else map[dig] = "out";
  }

  function renderNoteDigits() {
    const wrap = $("note-digits");
    if (!wrap) return;
    const marks = noteMarks();
    wrap.innerHTML = "";
    for (let d = 0; d <= 9; d++) {
      const dig = String(d);
      const mark = marks[dig] || "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "note-digit" +
        (mark === "out" ? " is-out" : "") +
        (mark === "in" ? " is-in" : "");
      btn.textContent = dig;
      btn.setAttribute("aria-pressed", mark ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        mark === "out"
          ? `${dig}: ${t("noteMarkOut")}`
          : mark === "in"
            ? `${dig}: ${t("noteMarkIn")}`
            : dig
      );
      btn.title = t("noteDigitsHint");
      btn.addEventListener("click", () => {
        cycleNoteMark(dig);
        renderNoteDigits();
      });
      wrap.appendChild(btn);
    }
  }

  function submitGuess(guess, opts) {
    if (!session || session.state.winner) return;
    const options = opts || {};
    const player =
      session.mode === "solo"
        ? PLAYERS.a
        : session.mode === "p2p"
          ? session.you
          : session.state.turn;
    if (!options.fromNet && !canAct()) {
      toast(t("notYourTurn"));
      return;
    }
    if (!options.fromNet && session.mode === "p2p" && player !== session.state.turn) {
      toast(t("notYourTurn"));
      return;
    }
    const actor = options.fromNet ? options.player : player;
    const r = applyGuess(session.state, actor, guess);
    if (!r.ok) {
      if (r.error === "invalid_guess") toast(t("secretInvalid"));
      else if (r.error === "wrong_turn") toast(t("notYourTurn"));
      return;
    }
    session.state = r.state;
    playSfx(r.score.plus === DIGIT_COUNT ? "mill" : "place");
    showLastFeedback(guess, r.score);
    pads.guess.clear();
    renderGame();

    if (!options.fromNet && session.mode === "p2p" && p2p) {
      p2p.send({
        type: "guess",
        player: actor,
        guess: String(guess),
        moveCount: session.state.moveCount,
      });
    }
    if (session.mode === "solo" && !session.state.winner) scheduleAi();
  }

  function scheduleAi(delay = 520) {
    clearTimeout(aiTimer);
    if (!session || session.mode !== "solo" || session.state.winner) return;
    if (session.state.turn !== PLAYERS.b) return;
    // Önemli: aiThinking true iken early-return YOK.
    // clearTimeout + return yarışı AI'yi sonsuza dek "düşünüyor"da bırakıyordu.
    const gen = (session.aiGen = (session.aiGen || 0) + 1);
    session.aiThinking = true;
    setGuessInputLocked(true);
    updateCpuWaitUi(true);
    aiTimer = setTimeout(() => runAiTurn(gen), Math.max(180, delay | 0));
  }

  function updateCpuWaitUi(waiting) {
    const input = $("guess-input-panel");
    const wait = $("cpu-wait-panel");
    if (input) input.classList.toggle("hidden", !!waiting);
    if (wait) wait.classList.toggle("hidden", !waiting);
  }

  function runAiTurn(gen) {
    if (!session || session.aiGen !== gen) return;
    if (session.mode !== "solo" || session.state.winner || session.state.turn !== PLAYERS.b) {
      session.aiThinking = false;
      updateCpuWaitUi(false);
      renderGame();
      return;
    }

    let moved = false;
    try {
      const tried = Object.create(null);
      (session.state.histories.b || []).forEach((h) => {
        if (h && h.guess) tried[h.guess] = true;
      });
      let guess = null;
      try {
        guess = Ai.pickGuess(session.state.histories.b, AI_DIFFICULTY);
      } catch (err) {
        console.warn("Sayı Bulma AI:", err);
      }
      for (let attempt = 0; attempt < 8 && !moved; attempt++) {
        if (!isValidSecret(guess) || tried[guess]) {
          guess = randomSecret();
        }
        const r = applyGuess(session.state, PLAYERS.b, guess);
        if (r.ok) {
          session.state = r.state;
          playSfx(r.score.plus === DIGIT_COUNT ? "mill" : "place");
          showLastFeedback(guess, r.score);
          moved = true;
        } else {
          tried[guess] = true;
          guess = null;
        }
      }
    } catch (err) {
      console.warn("Sayı Bulma AI turn:", err);
    }

    if (session && session.aiGen === gen) {
      session.aiThinking = false;
      updateCpuWaitUi(false);
      renderGame();
      // Hâlâ bilgisayar sırasıysa (nadir) yeniden dene
      if (
        session &&
        !session.state.winner &&
        session.state.turn === PLAYERS.b &&
        session.mode === "solo"
      ) {
        aiTimer = setTimeout(() => scheduleAi(250), 200);
      }
    }
  }

  function startSolo() {
    clearTimeout(aiTimer);
    destroyP2P();
    const secretA = pads.soloSecret.value();
    if (!isValidSecret(secretA)) {
      toast(t("secretInvalid"));
      return;
    }
    const secretB = randomSecret();
    const starter = readNextStarter();
    writeNextStarter(starter);
    session = {
      mode: "solo",
      difficulty: AI_DIFFICULTY,
      names: { a: t("you"), b: t("computer") },
      state: createMatch({ secretA, secretB, starter }),
      aiThinking: false,
      endDismissed: false,
      noteMarks: Object.create(null),
    };
    pads.guess.clear();
    showScreen("game");
    renderGame();
    toast(starter === PLAYERS.b ? t("cpuStarts") : t("youStart"));
    if (starter === PLAYERS.b) scheduleAi(650);
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
    $("name-a").textContent = p2pLobby.names.a || "—";
    $("name-b").textContent = p2pLobby.names.b || t("waitingGuest");
    $("ready-a").textContent = p2pLobby.ready.a ? t("readyOn") : t("waiting");
    $("ready-a").classList.toggle("on", !!p2pLobby.ready.a);
    $("ready-b").textContent = p2pLobby.guestJoined
      ? p2pLobby.ready.b
        ? t("readyOn")
        : t("waiting")
      : "—";
    $("ready-b").classList.toggle("on", !!p2pLobby.ready.b);
    const btn = $("btn-ready");
    const mySecretOk = isValidSecret(p2pLobby.mySecret);
    btn.disabled = !p2pLobby.guestJoined || !mySecretOk;
    const iAmReady = p2pLobby.ready[p2pLobby.you];
    btn.textContent = iAmReady ? t("readyOn") : t("ready");
    $("share-hint").textContent =
      p2pLobby.you === PLAYERS.a
        ? `${t("shareHintHost")} ${p2pLobby.code}`
        : t("shareHintGuest");
  }

  function maybeStartP2PGame() {
    if (!p2pLobby || !p2pLobby.guestJoined) return;
    if (!p2pLobby.ready.a || !p2pLobby.ready.b) return;
    if (!p2pLobby.secrets.a || !p2pLobby.secrets.b) return;
    if (p2pLobby.you !== PLAYERS.a) return;
    const starter = p2pLobby.nextStarter || PLAYERS.a;
    p2pLobby.nextStarter = opponent(starter);
    const state = createMatch({
      secretA: p2pLobby.secrets.a,
      secretB: p2pLobby.secrets.b,
      starter,
    });
    p2p.send({
      type: "start",
      starter,
      names: p2pLobby.names,
      secrets: p2pLobby.secrets,
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
      endDismissed: false,
      noteMarks: Object.create(null),
    };
    pads.guess.clear();
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
          name: p2pLobby.names.a,
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
        if (p2pLobby.you === PLAYERS.a && data.role === "guest") {
          p2pLobby.names.b = data.name || t("player2Ph");
          p2pLobby.guestJoined = true;
          p2pLobby.ready.b = false;
          p2p.send({
            type: "lobby",
            names: p2pLobby.names,
            ready: p2pLobby.ready,
            guestJoined: true,
          });
          renderRoom();
        } else if (p2pLobby.you === PLAYERS.b && data.role === "host") {
          p2pLobby.names.a = data.name || t("player1Ph");
          p2pLobby.guestJoined = true;
          renderRoom();
        }
      } else if (data.type === "lobby") {
        p2pLobby.names = data.names || p2pLobby.names;
        p2pLobby.ready = data.ready || p2pLobby.ready;
        p2pLobby.guestJoined = !!data.guestJoined;
        renderRoom();
      } else if (data.type === "secret") {
        p2pLobby.secrets[data.who] = data.secret;
        maybeStartP2PGame();
      } else if (data.type === "ready") {
        p2pLobby.ready[data.who] = !!data.value;
        if (data.secret) p2pLobby.secrets[data.who] = data.secret;
        renderRoom();
        maybeStartP2PGame();
      } else if (data.type === "start") {
        p2pLobby.names = data.names || p2pLobby.names;
        p2pLobby.nextStarter = data.nextStarter;
        p2pLobby.secrets = data.secrets || p2pLobby.secrets;
        beginP2PGame(
          createMatch({
            secretA: p2pLobby.secrets.a,
            secretB: p2pLobby.secrets.b,
            starter: data.starter,
          }),
          p2pLobby.names
        );
      } else if (data.type === "guess") {
        if (!session || session.mode !== "p2p") return;
        if (data.moveCount !== session.state.moveCount + 1) return;
        submitGuess(data.guess, { fromNet: true, player: data.player });
      } else if (data.type === "rematch-ask") {
        p2pLobby.ready = { a: false, b: false };
        p2pLobby.secrets = { a: null, b: null };
        p2pLobby.mySecret = "";
        p2pLobby.ready[data.who] = true;
        pads.roomSecret.clear();
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
            prefix: "sayibulma",
            transport: ArenaP2P.getTransport(),
          })
        : new P2P.P2PSession();
      bindP2PHandlers(p2p);
      const code = await p2p.host();
      p2pLobby = {
        code,
        you: PLAYERS.a,
        names: { a: name, b: null },
        ready: { a: false, b: false },
        secrets: { a: null, b: null },
        mySecret: "",
        guestJoined: false,
        nextStarter: PLAYERS.a,
      };
      pads.roomSecret.clear();
      showScreen("room");
      renderRoom();
    } catch (_) {
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
            prefix: "sayibulma",
            transport: ArenaP2P.getTransport(),
          })
        : new P2P.P2PSession();
      bindP2PHandlers(p2p);
      await p2p.join(code);
      p2pLobby = {
        code,
        you: PLAYERS.b,
        names: { a: "—", b: name },
        ready: { a: false, b: false },
        secrets: { a: null, b: null },
        mySecret: "",
        guestJoined: false,
        nextStarter: PLAYERS.a,
      };
      pads.roomSecret.clear();
      showScreen("room");
      renderRoom();
    } catch (_) {
      toast(t("peerFail"));
      destroyP2P();
    }
  }

  function fillSettingsForm() {
    document.querySelectorAll('input[name="lang"]').forEach((r) => {
      r.checked = r.value === lang();
    });
    if ($("p2p-name")) $("p2p-name").value = settings.name || "";
    if ($("settings-display-name") && window.ArenaScore) {
      const store = window.ArenaScore.load();
      $("settings-display-name").value =
        store.displayName || settings.name || "";
    }
  }

  function gameInProgress() {
    return !!(session && session.state && !session.state.winner);
  }

  function confirmLeaveOrRestart(kind) {
    if (!gameInProgress()) return true;
    const key = kind === "restart" ? "confirmRestart" : "confirmLeave";
    return window.confirm(t(key));
  }

  function goHome() {
    clearTimeout(aiTimer);
    if (session) session.aiThinking = false;
    session = null;
    destroyP2P();
    updateCpuWaitUi(false);
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
    pads.soloSecret.clear();
    showScreen("soloSetup");
  });
  $("btn-mode-p2p").addEventListener("click", () => {
    fillSettingsForm();
    showScreen("p2p");
  });

  $("btn-solo-secret-clear").addEventListener("click", () => pads.soloSecret.backspace());
  $("btn-solo-secret-random").addEventListener("click", () => {
    pads.soloSecret.set(randomSecret());
  });
  $("btn-solo-start").addEventListener("click", () => {
    saveSettings({ aiDifficulty: AI_DIFFICULTY });
    startSolo();
  });

  $("btn-p2p-create").addEventListener("click", () => hostP2P());
  $("btn-p2p-join").addEventListener("click", () => joinP2P());
  $("p2p-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-p2p-join").click();
  });

  pads.roomSecret.onChange = (val) => {
    if (!p2pLobby) return;
    p2pLobby.mySecret = val;
    if (p2pLobby.ready[p2pLobby.you] && !isValidSecret(val)) {
      p2pLobby.ready[p2pLobby.you] = false;
    }
    renderRoom();
  };
  $("btn-room-secret-clear").addEventListener("click", () => pads.roomSecret.backspace());
  $("btn-room-secret-random").addEventListener("click", () => {
    pads.roomSecret.set(randomSecret());
  });

  $("btn-ready").addEventListener("click", () => {
    if (!p2pLobby || !p2p) return;
    const who = p2pLobby.you;
    const secret = pads.roomSecret.value();
    if (!isValidSecret(secret)) {
      toast(t("needSecretReady"));
      return;
    }
    p2pLobby.mySecret = secret;
    p2pLobby.secrets[who] = secret;
    p2pLobby.ready[who] = !p2pLobby.ready[who];
    p2p.send({
      type: "ready",
      who,
      value: p2pLobby.ready[who],
      secret: p2pLobby.ready[who] ? secret : null,
    });
    p2p.send({
      type: "lobby",
      names: p2pLobby.names,
      ready: p2pLobby.ready,
      guestJoined: p2pLobby.guestJoined,
    });
    if (p2pLobby.ready[who]) {
      p2p.send({ type: "secret", who, secret });
    }
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

  $("btn-guess-clear").addEventListener("click", () => {
    if (!canAct()) return;
    pads.guess.backspace();
  });
  $("btn-guess-submit").addEventListener("click", () => {
    if (!canAct()) return;
    const g = pads.guess.value();
    if (!isValidSecret(g)) {
      toast(t("secretInvalid"));
      return;
    }
    submitGuess(g);
  });

  $("btn-settings-save").addEventListener("click", () => {
    const selectedLang =
      (document.querySelector('input[name="lang"]:checked') || {}).value || "tr";
    const displayName =
      ($("settings-display-name") && $("settings-display-name").value) || "";
    saveSettings({
      lang: selectedLang,
      aiDifficulty: AI_DIFFICULTY,
      name: displayName.trim() || settings.name,
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

  $("btn-game-back").addEventListener("click", () => {
    if (!confirmLeaveOrRestart("leave")) return;
    clearTimeout(aiTimer);
    if (session && session.mode === "p2p" && p2pLobby) {
      session = null;
      updateCpuWaitUi(false);
      showScreen("room");
      renderRoom();
      return;
    }
    goHome();
  });

  $("btn-game-home").addEventListener("click", () => {
    if (!confirmLeaveOrRestart("leave")) return;
    goHome();
  });

  function restartCurrentMode() {
    if (!session) return;
    clearTimeout(aiTimer);
    session.aiThinking = false;
    updateCpuWaitUi(false);
    if (session.mode === "solo") {
      pads.soloSecret.setLocked(false);
      pads.soloSecret.set(session.state.secrets.a);
      session = null;
      showScreen("soloSetup");
      return;
    }
    if (session.mode === "p2p" && p2p && p2pLobby) {
      p2pLobby.ready = { a: false, b: false };
      p2pLobby.secrets = { a: null, b: null };
      p2pLobby.mySecret = "";
      pads.roomSecret.clear();
      p2p.send({ type: "rematch-ask", who: p2pLobby.you });
      session = null;
      showScreen("room");
      renderRoom();
    }
  }

  $("btn-game-restart").addEventListener("click", () => {
    if (!session) return;
    if (!confirmLeaveOrRestart("restart")) return;
    restartCurrentMode();
  });

  $("btn-rematch").addEventListener("click", () => {
    // Bitiş panelinden — onay yok
    restartCurrentMode();
  });

  if ($("btn-end-close")) {
    $("btn-end-close").addEventListener("click", () => dismissEndPanel());
  }
  if ($("btn-guess-random")) {
    $("btn-guess-random").addEventListener("click", () => {
      if (!canAct()) return;
      pads.guess.set(randomSecret());
      playSfx("select");
    });
  }

  if ($("btn-show-result")) {
    $("btn-show-result").addEventListener("click", () => openEndPanel());
  }
  bindEndCardDrag();

  // Boot
  if (Sfx && Sfx.bindFirstGesture) Sfx.bindFirstGesture(document);
  if (window.ArenaHubBack) {
    hubBackCtl = window.ArenaHubBack.bind({ getLang: lang });
  }
  if (window.ArenaSW) window.ArenaSW.register("./sw.js");
  applyI18n();
  if (window.ArenaP2P && ArenaP2P.initTransportUi) ArenaP2P.initTransportUi();
  fillSettingsForm();
  showScreen("home");
})();
