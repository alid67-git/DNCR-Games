/**
 * Dama AI — kolay / zor / çok zor
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const Engine = require("./engine.js");
    module.exports = factory(Engine);
  } else {
    root.DamaAi = factory(root.DamaEngine);
  }
})(typeof self !== "undefined" ? self : this, function (Engine) {
  "use strict";

  const {
    PLAYERS,
    SQUARES,
    opponent,
    countPieces,
    countKings,
    getAllLegalMoves,
    tryAction,
  } = Engine;

  const DIFFICULTY = {
    easy: { depth: 1, variety: 20, blunderChance: 0.42 },
    hard: { depth: 3, variety: 2.5, blunderChance: 0.06 },
    veryhard: { depth: 4, variety: 0.9, blunderChance: 0 },
  };

  function mobility(state, player) {
    return getAllLegalMoves(
      { ...state, turn: player, winner: null },
      player
    ).length;
  }

  function advanceScore(board, player) {
    let s = 0;
    for (const id of SQUARES) {
      const p = board[id];
      if (!p || p.color !== player) continue;
      const r = Number(id.split(",")[0]);
      // white wants small r, black wants large r
      const prog = player === PLAYERS.white ? 7 - r : r;
      s += p.king ? 0 : prog * 0.35;
    }
    return s;
  }

  function evaluate(state, forPlayer) {
    const me = countPieces(state.board, forPlayer);
    const them = countPieces(state.board, opponent(forPlayer));
    if (them === 0 || state.winner === forPlayer) return 9000;
    if (me === 0 || state.winner === opponent(forPlayer)) return -9000;

    const kMe = countKings(state.board, forPlayer);
    const kThem = countKings(state.board, opponent(forPlayer));
    const capMe = (state.capturedBy && state.capturedBy[forPlayer]) || 0;
    const capThem =
      (state.capturedBy && state.capturedBy[opponent(forPlayer)]) || 0;

    return (
      (me - them) * 28 +
      (kMe - kThem) * 18 +
      (capMe - capThem) * 4 +
      (mobility(state, forPlayer) - mobility(state, opponent(forPlayer))) * 0.45 +
      (advanceScore(state.board, forPlayer) -
        advanceScore(state.board, opponent(forPlayer)))
    );
  }

  function orderMoves(moves) {
    return moves.slice().sort((a, b) => {
      const ca = (a.captured && a.captured.length) || 0;
      const cb = (b.captured && b.captured.length) || 0;
      if (cb !== ca) return cb - ca;
      const ka = a.becomesKing ? 1 : 0;
      const kb = b.becomesKing ? 1 : 0;
      return kb - ka;
    });
  }

  function minimax(state, depth, rootPlayer, alpha, beta) {
    if (state.winner) {
      if (state.winner === rootPlayer) return { score: 8000 + depth, move: null };
      return { score: -8000 - depth, move: null };
    }
    if (depth <= 0) return { score: evaluate(state, rootPlayer), move: null };

    const player = state.turn;
    let moves = orderMoves(getAllLegalMoves(state, player));
    if (!moves.length) {
      return {
        score: player === rootPlayer ? -7000 : 7000,
        move: null,
      };
    }

    const wantMax = player === rootPlayer;
    let best = { score: wantMax ? -Infinity : Infinity, move: moves[0] };

    for (const m of moves) {
      const r = tryAction(state, player, m);
      if (!r.ok) continue;
      const child = minimax(r.state, depth - 1, rootPlayer, alpha, beta);
      if (wantMax) {
        if (child.score > best.score) best = { score: child.score, move: m };
        alpha = Math.max(alpha, child.score);
      } else {
        if (child.score < best.score) best = { score: child.score, move: m };
        beta = Math.min(beta, child.score);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function resolveOpts(difficultyOrOpts) {
    let difficulty = "hard";
    let depth;
    let variety;
    let blunderChance;
    if (typeof difficultyOrOpts === "object" && difficultyOrOpts) {
      difficulty = difficultyOrOpts.difficulty || "hard";
      const preset = DIFFICULTY[difficulty] || DIFFICULTY.hard;
      depth = difficultyOrOpts.depth != null ? difficultyOrOpts.depth : preset.depth;
      variety = difficultyOrOpts.variety != null ? difficultyOrOpts.variety : preset.variety;
      blunderChance =
        difficultyOrOpts.blunderChance != null
          ? difficultyOrOpts.blunderChance
          : preset.blunderChance;
    } else {
      difficulty = difficultyOrOpts || "hard";
      const preset = DIFFICULTY[difficulty] || DIFFICULTY.hard;
      depth = preset.depth;
      variety = preset.variety;
      blunderChance = preset.blunderChance;
    }
    return { difficulty, depth, variety, blunderChance };
  }

  function pickFromScored(scored, variety, blunderChance) {
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].score;
    let pool = scored.filter((s) => s.score >= best - variety);
    if (blunderChance > 0 && Math.random() < blunderChance && scored.length > 1) {
      const weaker = scored.slice(1, Math.min(scored.length, 6));
      if (weaker.length) pool = weaker;
    }
    if (!pool.length) pool = [scored[0]];
    return pool[(Math.random() * pool.length) | 0].move;
  }

  function chooseMove(state, aiPlayer, difficultyOrOpts) {
    if (aiPlayer === undefined) aiPlayer = PLAYERS.black;
    const opts = resolveOpts(difficultyOrOpts);
    if (state.winner || state.turn !== aiPlayer) return null;

    let moves = getAllLegalMoves(state, aiPlayer);
    if (!moves.length) return null;

    if (opts.difficulty === "easy" && Math.random() < 0.3) {
      return moves[(Math.random() * moves.length) | 0];
    }

    const scored = [];
    const ordered = orderMoves(moves);
    const limit = Math.min(
      ordered.length,
      opts.difficulty === "veryhard" ? 40 : 28
    );
    for (let i = 0; i < limit; i++) {
      const m = ordered[i];
      const r = tryAction(state, aiPlayer, m);
      if (!r.ok) continue;
      let score;
      if (r.state.winner) {
        score = r.state.winner === aiPlayer ? 8000 + opts.depth : -8000 - opts.depth;
      } else {
        score = minimax(
          r.state,
          Math.max(0, opts.depth - 1),
          aiPlayer,
          -Infinity,
          Infinity
        ).score;
      }
      score += ((m.captured && m.captured.length) || 0) * 2;
      if (m.becomesKing) score += 3;
      scored.push({ move: m, score });
    }

    return pickFromScored(scored, opts.variety, opts.blunderChance) || moves[0];
  }

  return { DIFFICULTY, evaluate, chooseMove };
});
