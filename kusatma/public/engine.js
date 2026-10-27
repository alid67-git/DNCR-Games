/**
 * Kuşatma — Ruleset v1.0 oyun motoru
 * Tarayıcı (window.SiegeEngine) ve Node (require) uyumlu.
 *
 * Tahta: Nodes[6][6], Cells[5][5]
 * Kenarlar: H_r_c  r=0..5, c=0..4  (yatay: (r,c)→(r,c+1))
 *           V_r_c  r=0..4, c=0..5  (dikey: (r,c)→(r+1,c))
 *
 * Sprint notu (sigorta kırma): 2 ShieldPoint + sigortalı kenara tıklama
 * korumayı kaldırır VE aynı hamlede kenarı çizer (tempo adil olsun diye).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.SiegeEngine = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const N = 6;
  const C = 5;
  const STONES_EACH = 5;
  const PLAYERS = { P1: 1, P2: 2 };
  const PHASE = {
    DEPLOY: "DEPLOY",
    BATTLE: "BATTLE",
    GAME_OVER: "GAME_OVER",
  };

  const COMBO_MULT = [1.0, 1.5, 2.0];
  const SCORE_CLEAN = 10;
  const SCORE_SIEGE = 50;
  const STONE_END_BONUS = 10;
  const SHIELD_BREAK_COST = 2;

  function opponent(p) {
    return p === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;
  }

  function edgeIds() {
    const ids = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < C; c++) ids.push(`H_${r}_${c}`);
    }
    for (let r = 0; r < C; r++) {
      for (let c = 0; c < N; c++) ids.push(`V_${r}_${c}`);
    }
    return ids;
  }

  const ALL_EDGES = edgeIds();

  function emptyEdgeMap() {
    const drawn = Object.create(null);
    const insured = Object.create(null);
    const owner = Object.create(null);
    for (const id of ALL_EDGES) {
      drawn[id] = false;
      insured[id] = false;
      owner[id] = 0;
    }
    return { drawn, insured, owner };
  }

  function cellEdges(i, j) {
    return [`H_${i}_${j}`, `H_${i + 1}_${j}`, `V_${i}_${j}`, `V_${i}_${j + 1}`];
  }

  function cellCorners(i, j) {
    return [
      [i, j],
      [i, j + 1],
      [i + 1, j],
      [i + 1, j + 1],
    ];
  }

  function nodeKey(r, c) {
    return `${r},${c}`;
  }

  function edgesAtNode(r, c) {
    const out = [];
    if (c > 0) out.push(`H_${r}_${c - 1}`);
    if (c < N - 1) out.push(`H_${r}_${c}`);
    if (r > 0) out.push(`V_${r - 1}_${c}`);
    if (r < N - 1) out.push(`V_${r}_${c}`);
    return out;
  }

  function parseEdge(id) {
    const m = /^([HV])_(\d+)_(\d+)$/.exec(id);
    if (!m) return null;
    return { dir: m[1], r: +m[2], c: +m[3] };
  }

  function edgeEndpoints(id) {
    const e = parseEdge(id);
    if (!e) return null;
    if (e.dir === "H") {
      return [
        [e.r, e.c],
        [e.r, e.c + 1],
      ];
    }
    return [
      [e.r, e.c],
      [e.r + 1, e.c],
    ];
  }

  function cellsTouchingEdge(id) {
    const e = parseEdge(id);
    if (!e) return [];
    const out = [];
    if (e.dir === "H") {
      if (e.r > 0) out.push([e.r - 1, e.c]);
      if (e.r < C) out.push([e.r, e.c]);
    } else {
      if (e.c > 0) out.push([e.r, e.c - 1]);
      if (e.c < C) out.push([e.r, e.c]);
    }
    return out.filter(([i, j]) => i >= 0 && i < C && j >= 0 && j < C);
  }

  function createGameState(starter) {
    const nodes = Array.from({ length: N }, () => Array(N).fill(0));
    const { drawn, insured, owner } = emptyEdgeMap();
    const owners = Array.from({ length: C }, () => Array(C).fill(0));
    const start = starter === PLAYERS.P2 ? PLAYERS.P2 : PLAYERS.P1;
    return {
      phase: PHASE.DEPLOY,
      turn: start,
      starter: start,
      nodes,
      edgeDrawn: drawn,
      edgeInsured: insured,
      edgeOwner: owner,
      cellOwner: owners,
      scores: { 1: 0, 2: 0 },
      shieldPoints: { 1: 0, 2: 0 },
      stonesLeft: { 1: 0, 2: 0 },
      placed: { 1: 0, 2: 0 },
      insuranceActive: { 1: false, 2: false },
      comboIndex: 0,
      winner: null, // 1 | 2 | 'draw'
      endReason: null, // stones | board_full | resign | softlock | null
      lastMove: null,
      moveCount: 0,
      pendingDeploy: null, // {r,c,player} onay öncesi
    };
  }

  function cloneState(state) {
    return {
      ...state,
      nodes: state.nodes.map((row) => row.slice()),
      edgeDrawn: { ...state.edgeDrawn },
      edgeInsured: { ...state.edgeInsured },
      edgeOwner: { ...state.edgeOwner },
      cellOwner: state.cellOwner.map((row) => row.slice()),
      scores: { ...state.scores },
      shieldPoints: { ...state.shieldPoints },
      stonesLeft: { ...state.stonesLeft },
      placed: { ...state.placed },
      insuranceActive: { ...state.insuranceActive },
      pendingDeploy: state.pendingDeploy ? { ...state.pendingDeploy } : null,
      lastMove: state.lastMove ? { ...state.lastMove } : null,
    };
  }

  function countStones(state, player) {
    let n = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) if (state.nodes[r][c] === player) n++;
    }
    return n;
  }

  function refreshStoneCounts(state) {
    state.stonesLeft[1] = countStones(state, 1);
    state.stonesLeft[2] = countStones(state, 2);
  }

  function drawnCountForCell(state, i, j) {
    let n = 0;
    for (const id of cellEdges(i, j)) if (state.edgeDrawn[id]) n++;
    return n;
  }

  function isCriticalEdge(state, edgeId) {
    if (state.edgeDrawn[edgeId]) return false;
    for (const [i, j] of cellsTouchingEdge(edgeId)) {
      if (state.cellOwner[i][j]) continue;
      if (drawnCountForCell(state, i, j) === 3) return true;
    }
    return false;
  }

  function clockwiseEdgesAtNode(r, c) {
    // sağ, aşağı, sol, yukarı
    const ordered = [];
    if (c < N - 1) ordered.push(`H_${r}_${c}`);
    if (r < N - 1) ordered.push(`V_${r}_${c}`);
    if (c > 0) ordered.push(`H_${r}_${c - 1}`);
    if (r > 0) ordered.push(`V_${r - 1}_${c}`);
    return ordered;
  }

  function clearInsuranceForPlayer(state, player) {
    for (const id of ALL_EDGES) {
      if (!state.edgeInsured[id]) continue;
      // Sigorta yalnızca o oyuncunun taş düğümlerine bağlı kenarlardan takip edilir;
      // temizlemede tüm insured'ı sıfırlayıp yeniden basmak daha güvenli.
    }
    // Yeniden hesaplamadan önce oyuncunun eski sigortasını kaldırmak için
    // tüm sigortayı temizleyip her aktif oyuncu için yeniden uygula.
  }

  function recomputeAllInsurance(state) {
    for (const id of ALL_EDGES) state.edgeInsured[id] = false;
    for (const p of [1, 2]) {
      if (!state.insuranceActive[p]) continue;
      applyInsuranceForPlayer(state, p);
    }
  }

  function applyInsuranceForPlayer(state, player) {
    const stones = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (state.nodes[r][c] === player) stones.push([r, c]);
      }
    }
    if (stones.length !== 2) return;

    for (const [r, c] of stones) {
      const candidates = clockwiseEdgesAtNode(r, c).filter(
        (id) => !state.edgeDrawn[id]
      );
      const critical = candidates.filter((id) => isCriticalEdge(state, id));
      const pick = [];
      for (const id of critical) {
        if (pick.length >= 2) break;
        if (!pick.includes(id)) pick.push(id);
      }
      for (const id of candidates) {
        if (pick.length >= 2) break;
        if (!pick.includes(id)) pick.push(id);
      }
      for (const id of pick) state.edgeInsured[id] = true;
    }
  }

  function maybeTriggerInsurance(state) {
    for (const p of [1, 2]) {
      const n = countStones(state, p);
      if (n === 2 && !state.insuranceActive[p]) {
        state.insuranceActive[p] = true;
      }
      // Taş 1'e veya 0'a düşerse sigorta fiilen anlamsız; bayrak kalabilir.
    }
    recomputeAllInsurance(state);
  }

  function hybridScore(state, player) {
    return state.scores[player] + countStones(state, player) * STONE_END_BONUS;
  }

  function finishByHybrid(state, reason) {
    const s1 = hybridScore(state, 1);
    const s2 = hybridScore(state, 2);
    state.phase = PHASE.GAME_OVER;
    state.endReason = reason;
    if (s1 === s2) state.winner = "draw";
    else state.winner = s1 > s2 ? 1 : 2;
    refreshStoneCounts(state);
  }

  function finishByStones(state, loser) {
    state.phase = PHASE.GAME_OVER;
    state.endReason = "stones";
    state.winner = opponent(loser);
    refreshStoneCounts(state);
  }

  function ownedCellsCount(state) {
    let n = 0;
    for (let i = 0; i < C; i++) {
      for (let j = 0; j < C; j++) if (state.cellOwner[i][j]) n++;
    }
    return n;
  }

  function scoreForCapture(base, comboIndex) {
    const mult = COMBO_MULT[Math.min(comboIndex, COMBO_MULT.length - 1)];
    return Math.floor(base * mult);
  }

  function captureCell(state, i, j, player, comboIndex) {
    state.cellOwner[i][j] = player;
    let siege = false;
    const removed = [];
    for (const [r, c] of cellCorners(i, j)) {
      if (state.nodes[r][c] === opponent(player)) {
        siege = true;
        removed.push([r, c]);
        state.nodes[r][c] = 0;
      }
    }
    const base = siege ? SCORE_SIEGE : SCORE_CLEAN;
    const gained = scoreForCapture(base, comboIndex);
    state.scores[player] += gained;
    // Nötr (temiz) kare → saldırgana +1 ShieldPoint
    if (!siege) state.shieldPoints[player] += 1;
    return { siege, gained, removed, base };
  }

  /** Deployment: taş seç (onay öncesi). */
  function selectDeploy(state, player, r, c) {
    if (state.phase !== PHASE.DEPLOY) return { ok: false, error: "Konuşlandırma değil." };
    if (player !== state.turn) return { ok: false, error: "Sıra sende değil." };
    if (r < 0 || r >= N || c < 0 || c >= N) return { ok: false, error: "Geçersiz düğüm." };
    if (state.nodes[r][c] !== 0) return { ok: false, error: "Düğüm dolu." };
    if (state.placed[player] >= STONES_EACH) return { ok: false, error: "Taş hakkın bitti." };
    const next = cloneState(state);
    next.pendingDeploy = { r, c, player };
    next.lastMove = { type: "PLACE_SELECT", player, r, c };
    return { ok: true, state: next };
  }

  function cancelDeploy(state, player) {
    if (state.phase !== PHASE.DEPLOY) return { ok: false, error: "Konuşlandırma değil." };
    if (!state.pendingDeploy || state.pendingDeploy.player !== player) {
      return { ok: false, error: "Bekleyen yerleşim yok." };
    }
    const next = cloneState(state);
    next.pendingDeploy = null;
    next.lastMove = { type: "PLACE_CANCEL", player };
    return { ok: true, state: next };
  }

  function confirmDeploy(state, player) {
    if (state.phase !== PHASE.DEPLOY) return { ok: false, error: "Konuşlandırma değil." };
    if (player !== state.turn) return { ok: false, error: "Sıra sende değil." };
    const pend = state.pendingDeploy;
    if (!pend || pend.player !== player) return { ok: false, error: "Önce bir düğüm seç." };
    const { r, c } = pend;
    if (state.nodes[r][c] !== 0) return { ok: false, error: "Düğüm dolu." };

    const next = cloneState(state);
    next.nodes[r][c] = player;
    next.placed[player] += 1;
    next.pendingDeploy = null;
    next.moveCount += 1;
    next.lastMove = { type: "PLACE", player, r, c };
    refreshStoneCounts(next);

    if (next.placed[1] >= STONES_EACH && next.placed[2] >= STONES_EACH) {
      next.phase = PHASE.BATTLE;
      next.turn = next.starter;
      next.comboIndex = 0;
    } else {
      next.turn = opponent(player);
    }
    return { ok: true, state: next };
  }

  function legalMovesFrom(state, r, c) {
    const player = state.nodes[r][c];
    if (!player) return [];
    const dirs = [
      [-1, 0, (rr, cc) => `V_${rr - 1}_${cc}`],
      [1, 0, (rr, cc) => `V_${rr}_${cc}`],
      [0, -1, (rr, cc) => `H_${rr}_${cc - 1}`],
      [0, 1, (rr, cc) => `H_${rr}_${cc}`],
    ];
    const out = [];
    for (const [dr, dc, edgeFn] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      if (state.nodes[nr][nc] !== 0) continue;
      const eid = edgeFn(r, c);
      if (state.edgeDrawn[eid]) continue; // çizili kenarın üzerinden atlanamaz
      out.push({ r: nr, c: nc, edgeId: eid });
    }
    return out;
  }

  function listLegalStoneMoves(state, player) {
    const moves = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (state.nodes[r][c] !== player) continue;
        for (const m of legalMovesFrom(state, r, c)) {
          moves.push({ from: { r, c }, to: { r: m.r, c: m.c } });
        }
      }
    }
    return moves;
  }

  function listDrawableEdges(state, player) {
    const out = [];
    for (const id of ALL_EDGES) {
      if (state.edgeDrawn[id]) continue;
      if (state.edgeInsured[id]) {
        if ((state.shieldPoints[player] || 0) < SHIELD_BREAK_COST) continue;
      }
      out.push(id);
    }
    return out;
  }

  function hasLegalBattleMove(state, player) {
    return (
      listDrawableEdges(state, player).length > 0 ||
      listLegalStoneMoves(state, player).length > 0
    );
  }

  function checkSoftlockOrEnd(state) {
    if (state.phase !== PHASE.BATTLE) return;
    if (!hasLegalBattleMove(state, state.turn)) {
      finishByHybrid(state, "softlock");
    }
  }

  function afterCaptures(state, player, completedMeta, nextComboIndex) {
    refreshStoneCounts(state);
    for (const p of [1, 2]) {
      if (countStones(state, p) === 0) {
        finishByStones(state, p);
        return;
      }
    }
    maybeTriggerInsurance(state);
    if (ownedCellsCount(state) >= C * C) {
      finishByHybrid(state, "board_full");
      return;
    }
    if (completedMeta.length > 0) {
      // Ekstra 1 hamle; kombo zinciri kare sayısına göre devam eder
      state.turn = player;
      state.comboIndex =
        typeof nextComboIndex === "number"
          ? nextComboIndex
          : state.comboIndex + completedMeta.length;
    } else {
      state.turn = opponent(player);
      state.comboIndex = 0;
      checkSoftlockOrEnd(state);
    }
  }

  function applyDrawLine(state, player, edgeId) {
    if (state.phase !== PHASE.BATTLE) return { ok: false, error: "Savaş evresi değil." };
    if (state.winner) return { ok: false, error: "Oyun bitti." };
    if (player !== state.turn) return { ok: false, error: "Sıra sende değil." };
    if (!ALL_EDGES.includes(edgeId)) return { ok: false, error: "Geçersiz kenar." };
    if (state.edgeDrawn[edgeId]) return { ok: false, error: "Kenar zaten çizili." };

    const next = cloneState(state);
    let brokeShield = false;
    if (next.edgeInsured[edgeId]) {
      if (next.shieldPoints[player] < SHIELD_BREAK_COST) {
        return { ok: false, error: "Sigortayı kırmak için 2 ShieldPoint gerekir." };
      }
      next.shieldPoints[player] -= SHIELD_BREAK_COST;
      next.edgeInsured[edgeId] = false;
      brokeShield = true;
    }

    next.edgeDrawn[edgeId] = true;
    next.edgeOwner[edgeId] = player;
    next.moveCount += 1;

    const completed = [];
    const captureDetails = [];
    // Aynı anda birden fazla kare kapanabilir; kombo indeksi kare sırasına göre artar
    let localCombo = next.comboIndex;
    for (const [i, j] of cellsTouchingEdge(edgeId)) {
      if (next.cellOwner[i][j]) continue;
      if (drawnCountForCell(next, i, j) === 4) {
        const detail = captureCell(next, i, j, player, localCombo);
        completed.push([i, j]);
        captureDetails.push({ i, j, ...detail });
        localCombo += 1;
      }
    }

    next.lastMove = {
      type: "DRAW_LINE",
      player,
      edgeId,
      completed,
      captureDetails,
      brokeShield,
    };

    // localCombo = bir sonraki zincir adımının indeksi
    afterCaptures(next, player, completed, localCombo);
    return { ok: true, state: next };
  }

  function applyMoveStone(state, player, from, to) {
    if (state.phase !== PHASE.BATTLE) return { ok: false, error: "Savaş evresi değil." };
    if (state.winner) return { ok: false, error: "Oyun bitti." };
    if (player !== state.turn) return { ok: false, error: "Sıra sende değil." };
    if (!from || !to) return { ok: false, error: "Eksik koordinat." };
    if (state.nodes[from.r][from.c] !== player) {
      return { ok: false, error: "Kendi taşın değil." };
    }
    const legal = legalMovesFrom(state, from.r, from.c);
    const okMove = legal.some((m) => m.r === to.r && m.c === to.c);
    if (!okMove) return { ok: false, error: "Yasadışı taş hareketi." };

    const next = cloneState(state);
    next.nodes[from.r][from.c] = 0;
    next.nodes[to.r][to.c] = player;
    next.moveCount += 1;
    next.lastMove = { type: "MOVE_PIECE", player, from: { ...from }, to: { ...to } };
    // Taş hareketi kare kapatmaz → sıra değişir; sigorta yeniden hesaplanır
    maybeTriggerInsurance(next);
    next.turn = opponent(player);
    next.comboIndex = 0;
    refreshStoneCounts(next);
    checkSoftlockOrEnd(next);
    return { ok: true, state: next };
  }

  function resign(state, player) {
    if (state.phase === PHASE.GAME_OVER) return { ok: false, error: "Oyun bitti." };
    const next = cloneState(state);
    next.phase = PHASE.GAME_OVER;
    next.endReason = "resign";
    next.winner = opponent(player);
    next.lastMove = { type: "RESIGN", player };
    return { ok: true, state: next };
  }

  /** AI / UI için tüm yasal savaş hamleleri */
  function listLegalActions(state, player) {
    if (state.phase !== PHASE.BATTLE || state.turn !== player) return [];
    const actions = [];
    for (const edgeId of listDrawableEdges(state, player)) {
      actions.push({ type: "DRAW_LINE", edgeId });
    }
    for (const m of listLegalStoneMoves(state, player)) {
      actions.push({ type: "MOVE_PIECE", from: m.from, to: m.to });
    }
    return actions;
  }

  function applyAction(state, player, action) {
    if (!action || !action.type) return { ok: false, error: "Geçersiz aksiyon." };
    if (action.type === "DRAW_LINE") return applyDrawLine(state, player, action.edgeId);
    if (action.type === "MOVE_PIECE") return applyMoveStone(state, player, action.from, action.to);
    if (action.type === "PLACE_SELECT") return selectDeploy(state, player, action.r, action.c);
    if (action.type === "PLACE_CONFIRM") return confirmDeploy(state, player);
    if (action.type === "PLACE_CANCEL") return cancelDeploy(state, player);
    if (action.type === "RESIGN") return resign(state, player);
    return { ok: false, error: "Bilinmeyen aksiyon." };
  }

  return {
    N,
    C,
    STONES_EACH,
    PLAYERS,
    PHASE,
    ALL_EDGES,
    SHIELD_BREAK_COST,
    SCORE_CLEAN,
    SCORE_SIEGE,
    opponent,
    createGameState,
    cloneState,
    cellEdges,
    cellCorners,
    edgesAtNode,
    edgeEndpoints,
    parseEdge,
    cellsTouchingEdge,
    selectDeploy,
    cancelDeploy,
    confirmDeploy,
    applyDrawLine,
    applyMoveStone,
    resign,
    applyAction,
    listLegalActions,
    listDrawableEdges,
    listLegalStoneMoves,
    legalMovesFrom,
    hybridScore,
    drawnCountForCell,
    countStones,
    hasLegalBattleMove,
    isCriticalEdge,
  };
});
