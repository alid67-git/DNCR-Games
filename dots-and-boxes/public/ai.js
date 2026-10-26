/**
 * Noktalar ve Kutular — bilgisayar (AI) zorluk seviyeleri.
 *
 * Dört seviye: easy / medium / hard / veryhard.
 *  - easy:     Bazen serbest kutuyu kaçırır, bazen güvensiz oynar.
 *  - medium:   Serbest kutuları her zaman alır, güvensiz oynamaz, ama
 *              kurban verirken zincir uzunluğunu hesaba katmaz.
 *  - hard:     "Double-cross" (son iki kutuyu bırakıp kontrolü koruma) ve
 *              en küçük zinciri kurban verme stratejisi uygular.
 *  - veryhard: hard + eşit maliyetli kurban adayları arasında kısa bir
 *              simülasyon (rollout) ile en iyi seçeneği arar.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./engine.js"));
  } else {
    root.DotsAi = factory(root.DotsEngine);
  }
})(typeof window !== "undefined" ? window : globalThis, function (Engine) {
  "use strict";

  const {
    opponent,
    resolveGraph,
    applyMove,
    getUndrawnEdges,
    getSafeEdges,
    getCompletingEdges,
    simulateForcedChain,
    estimateSacrifice,
  } = Engine;

  const DIFFICULTY_LEVELS = ["easy", "medium", "hard", "veryhard"];
  const EASY_MISTAKE_RATE = 0.3;
  const EASY_RANDOM_SAFE_RATE = 0.4;

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

  function pickCaptureEdge(graph, state, player, difficulty) {
    const completing = getCompletingEdges(graph, state.edgeDrawnBy);
    if (!completing.length) return null;
    const start = randPick(completing);

    if (difficulty !== "hard" && difficulty !== "veryhard") {
      return start;
    }

    const chain = simulateForcedChain(graph, state, start, player);
    const simpleChain = chain.boxesPerEdge.every((n) => n === 1);
    const edgesLeftAfterChain = state.totalEdges - state.edgesDrawn - chain.edges.length;

    // Zincirde tam olarak son iki kutu kaldıysa ve tahtada oynanacak başka
    // yer de varsa: "double-cross" — ikisini de rakibe bırak, kontrolü koru.
    if (simpleChain && chain.edges.length === 2 && edgesLeftAfterChain > 0) {
      return chain.edges[1];
    }
    return start;
  }

  function pickSafeEdge(graph, state, difficulty) {
    const safe = getSafeEdges(graph, state.edgeDrawnBy);
    if (!safe.length) return null;
    if (difficulty === "easy" && Math.random() < EASY_RANDOM_SAFE_RATE) {
      const all = getUndrawnEdges(graph, state.edgeDrawnBy);
      return randPick(all);
    }
    return randPick(safe);
  }

  function pickSacrificeEdge(graph, state, player, difficulty) {
    const undrawn = getUndrawnEdges(graph, state.edgeDrawnBy);
    if (!undrawn.length) return null;
    if (difficulty === "easy") return randPick(undrawn);

    const scored = undrawn.map((id) => ({
      id,
      cost: estimateSacrifice(graph, state, id, player),
    }));
    scored.sort((a, b) => a.cost - b.cost);

    if (difficulty === "medium") {
      // Dengeli: en kötü yarıyı eler ama en küçüğü aramaz (hesapsız).
      const pool = scored.slice(0, Math.max(1, Math.ceil(scored.length / 2)));
      return randPick(pool).id;
    }

    const minCost = scored[0].cost;
    let bestCandidates = scored.filter((s) => s.cost <= minCost).map((s) => s.id);
    const MAX_UNDRAWN_FOR_ROLLOUT = 46; // performans: çok erken/büyük tahtalarda rollout atla
    if (
      difficulty === "hard" ||
      bestCandidates.length <= 1 ||
      undrawn.length > MAX_UNDRAWN_FOR_ROLLOUT
    ) {
      return randPick(bestCandidates);
    }
    const MAX_ROLLOUT_CANDIDATES = 4;
    if (bestCandidates.length > MAX_ROLLOUT_CANDIDATES) {
      bestCandidates = shuffle(bestCandidates).slice(0, MAX_ROLLOUT_CANDIDATES);
    }
    return pickBySimulatedRollout(graph, state, player, bestCandidates);
  }

  /** Oyunu, her iki taraf da "hard" oynuyormuş gibi sona kadar simüle eder. */
  function rollout(graph, state, selfPlayer, maxSteps) {
    let cur = state;
    let steps = 0;
    while (!cur.winner && steps < maxSteps) {
      steps++;
      const mover = cur.turn;
      const move = chooseMove(graph, cur, mover, { difficulty: "hard" });
      if (!move) break;
      const r = applyMove(graph, cur, move.edgeId, mover);
      if (!r.ok) break;
      cur = r.state;
    }
    return cur;
  }

  function pickBySimulatedRollout(graph, state, player, candidates) {
    let best = candidates[0];
    let bestMargin = -Infinity;
    for (const edgeId of candidates) {
      const r = applyMove(graph, state, edgeId, player);
      if (!r.ok) continue;
      const finalState = rollout(graph, r.state, player, graph.totalEdges + 2);
      const margin =
        (finalState.scores[player] || 0) - (finalState.scores[opponent(player)] || 0);
      if (margin > bestMargin) {
        bestMargin = margin;
        best = edgeId;
      }
    }
    return best;
  }

  /**
   * Tek bir kenar hamlesi seçer (atomik). Hamle bir kutu tamamlarsa aynı
   * oyuncunun sırası devam eder — çağıran taraf bu durumda chooseMove'u
   * tekrar çağırmalıdır (bkz. public/game-client.js).
   *
   * @returns {{edgeId:string, kind:string}|null}
   */
  function chooseMove(boardIdOrGraph, state, player, opts) {
    const graph = resolveGraph(boardIdOrGraph);
    const difficulty = (opts && opts.difficulty) || "medium";
    if (state.winner) return null;

    const blunder = difficulty === "easy" && Math.random() < EASY_MISTAKE_RATE;

    if (!blunder) {
      const captureEdge = pickCaptureEdge(graph, state, player, difficulty);
      if (captureEdge) return { edgeId: captureEdge, kind: "capture" };
    }

    const safeEdge = pickSafeEdge(graph, state, difficulty);
    if (safeEdge) return { edgeId: safeEdge, kind: "safe" };

    const sacrificeEdge = pickSacrificeEdge(graph, state, player, difficulty);
    if (sacrificeEdge) return { edgeId: sacrificeEdge, kind: "sacrifice" };

    const undrawn = getUndrawnEdges(graph, state.edgeDrawnBy);
    if (undrawn.length) return { edgeId: randPick(undrawn), kind: "fallback" };
    return null;
  }

  return { chooseMove, DIFFICULTY_LEVELS };
});
