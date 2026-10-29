/**
 * Kuşatma AI — easy / normal / hard / veryhard (medium → normal)
 * Ruleset v1: Easy rastgele+yarı kör, Medium fırsatçı, Hard heuristic (+ sınırlı bakış).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./engine.js"));
  } else {
    root.SiegeAi = factory(root.SiegeEngine);
  }
})(typeof window !== "undefined" ? window : globalThis, function (Engine) {
  "use strict";

  const {
    PLAYERS,
    PHASE,
    opponent,
    applyAction,
    listLegalActions,
    listDrawableEdges,
    drawnCountForCell,
    cellsTouchingEdge,
    countStones,
    cloneState,
  } = Engine;

  const DIFFICULTY_LEVELS = ["easy", "normal", "hard", "veryhard", "learn"];

  function randPick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function wouldComplete(state, edgeId) {
    let n = 0;
    for (const [i, j] of cellsTouchingEdge(edgeId)) {
      if (state.cellOwner[i][j]) continue;
      if (drawnCountForCell(state, i, j) === 3) n++;
    }
    return n;
  }

  function wouldMakeThird(state, edgeId) {
    for (const [i, j] of cellsTouchingEdge(edgeId)) {
      if (state.cellOwner[i][j]) continue;
      if (drawnCountForCell(state, i, j) === 2) return true;
    }
    return false;
  }

  function stoneInDanger(state, player) {
    // Taşın köşe olduğu ve 3 kenarı dolu bir kare varsa tehlikede
    const danger = [];
    for (let r = 0; r < Engine.N; r++) {
      for (let c = 0; c < Engine.N; c++) {
        if (state.nodes[r][c] !== player) continue;
        let threatened = false;
        for (let i = 0; i < Engine.C; i++) {
          for (let j = 0; j < Engine.C; j++) {
            const corners = Engine.cellCorners(i, j);
            if (!corners.some(([rr, cc]) => rr === r && cc === c)) continue;
            if (state.cellOwner[i][j]) continue;
            if (drawnCountForCell(state, i, j) >= 3) threatened = true;
          }
        }
        if (threatened) danger.push({ r, c });
      }
    }
    return danger;
  }

  function evaluate(state, me) {
    const opp = opponent(me);
    const myCells = state.scores[me];
    const oppCells = state.scores[opp];
    const myStones = countStones(state, me);
    const oppStones = countStones(state, opp);
    let thirdGift = 0;
    // Basit pozisyon: rakibe açık 3. kenar sayısı
    for (const id of Engine.ALL_EDGES) {
      if (state.edgeDrawn[id]) continue;
      if (wouldComplete(state, id)) thirdGift += 1;
    }
    const myDanger = stoneInDanger(state, me).length;
    return (
      100 * (myCells - oppCells) +
      500 * (oppStones < myStones ? 1 : 0) +
      80 * (myStones - oppStones) -
      80 * thirdGift -
      200 * myDanger +
      15 * (state.shieldPoints[me] - state.shieldPoints[opp])
    );
  }

  function pickEasy(state, player) {
    const actions = listLegalActions(state, player);
    if (!actions.length) return null;

    const captures = actions.filter(
      (a) => a.type === "DRAW_LINE" && wouldComplete(state, a.edgeId) > 0
    );
    if (captures.length && Math.random() < 0.5) return randPick(captures);

    // %40 taş hareketi dene
    const moves = actions.filter((a) => a.type === "MOVE_PIECE");
    if (moves.length && Math.random() < 0.4) return randPick(moves);

    const draws = actions.filter((a) => a.type === "DRAW_LINE");
    if (draws.length) return randPick(draws);
    return randPick(actions);
  }

  /** Öğrenme: serbest kareyi seyrek alır, 3. kenarı daha sık bırakır */
  function pickLearn(state, player) {
    const actions = listLegalActions(state, player);
    if (!actions.length) return null;

    const captures = actions.filter(
      (a) => a.type === "DRAW_LINE" && wouldComplete(state, a.edgeId) > 0
    );
    if (captures.length && Math.random() < 0.28) return randPick(captures);

    const gifts = actions.filter(
      (a) => a.type === "DRAW_LINE" && wouldMakeThird(state, a.edgeId)
    );
    if (gifts.length && Math.random() < 0.55) return randPick(gifts);

    const moves = actions.filter((a) => a.type === "MOVE_PIECE");
    if (moves.length && Math.random() < 0.45) return randPick(moves);

    const safe = actions.filter(
      (a) => a.type === "DRAW_LINE" && !wouldComplete(state, a.edgeId)
    );
    if (safe.length) return randPick(safe);
    return randPick(actions);
  }

  function pickMedium(state, player) {
    const actions = listLegalActions(state, player);
    if (!actions.length) return null;

    const captures = actions.filter(
      (a) => a.type === "DRAW_LINE" && wouldComplete(state, a.edgeId) > 0
    );
    if (captures.length) return randPick(captures);

    // Tehlikeden kaç
    const danger = stoneInDanger(state, player);
    if (danger.length) {
      const escape = actions.filter(
        (a) =>
          a.type === "MOVE_PIECE" &&
          danger.some((d) => d.r === a.from.r && d.c === a.from.c)
      );
      if (escape.length) return randPick(escape);
    }

    const safeDraws = actions.filter(
      (a) => a.type === "DRAW_LINE" && !wouldMakeThird(state, a.edgeId)
    );
    if (safeDraws.length) return randPick(safeDraws);

    const draws = actions.filter((a) => a.type === "DRAW_LINE");
    if (draws.length) return randPick(draws);
    return randPick(actions);
  }

  function pickHard(state, player) {
    const actions = listLegalActions(state, player);
    if (!actions.length) return null;

    const captures = actions.filter(
      (a) => a.type === "DRAW_LINE" && wouldComplete(state, a.edgeId) > 0
    );
    if (captures.length) {
      // En yüksek anlık skor kazancı
      let best = null;
      let bestScore = -Infinity;
      for (const a of captures) {
        const r = applyAction(state, player, a);
        if (!r.ok) continue;
        const sc = evaluate(r.state, player);
        if (sc > bestScore) {
          bestScore = sc;
          best = a;
        }
      }
      if (best) return best;
    }

    // 1-ply heuristic tüm aksiyonlar üzerinde
    let best = null;
    let bestScore = -Infinity;
    const pool = shuffle(actions).slice(0, Math.min(40, actions.length));
    for (const a of pool) {
      const r = applyAction(state, player, a);
      if (!r.ok) continue;
      let sc = evaluate(r.state, player);
      // Rakibin cevap kaba tahmini (1 cevap)
      if (r.state.phase === PHASE.BATTLE && r.state.turn === opponent(player)) {
        const replies = listLegalActions(r.state, opponent(player));
        const caps = replies.filter(
          (x) => x.type === "DRAW_LINE" && wouldComplete(r.state, x.edgeId) > 0
        );
        if (caps.length) sc -= 120 * caps.length;
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = a;
      }
    }
    return best || randPick(actions);
  }

  function chooseDeploy(state, player) {
    // Boş düğümlerden merkez-ağırlıklı rastgele
    const empties = [];
    for (let r = 0; r < Engine.N; r++) {
      for (let c = 0; c < Engine.N; c++) {
        if (state.nodes[r][c] === 0) {
          const dist = Math.abs(r - 2.5) + Math.abs(c - 2.5);
          empties.push({ r, c, dist });
        }
      }
    }
    empties.sort((a, b) => a.dist - b.dist);
    const pool = empties.slice(0, Math.max(3, Math.ceil(empties.length / 3)));
    return randPick(pool);
  }

  function chooseMove(state, player, difficulty) {
    if (!state || state.phase === PHASE.GAME_OVER) return null;
    if (state.turn !== player) return null;

    if (state.phase === PHASE.DEPLOY) {
      if (state.pendingDeploy && state.pendingDeploy.player === player) {
        return { type: "PLACE_CONFIRM" };
      }
      const spot = chooseDeploy(state, player);
      if (!spot) return null;
      return { type: "PLACE_SELECT", r: spot.r, c: spot.c };
    }

    let diff = String(difficulty || "normal").toLowerCase();
    if (diff === "medium") diff = "normal";
    if (!DIFFICULTY_LEVELS.includes(diff)) diff = "normal";
    if (diff === "learn") return pickLearn(state, player);
    if (diff === "easy") return pickEasy(state, player);
    if (diff === "hard" || diff === "veryhard") return pickHard(state, player);
    return pickMedium(state, player);
  }

  return {
    DIFFICULTY_LEVELS,
    chooseMove,
    evaluate,
    wouldComplete,
  };
});
