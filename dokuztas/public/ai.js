/**
 * Dokuztaş AI — kolay / zor / çok zor
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const Engine = require("./engine.js");
    module.exports = factory(Engine);
  } else {
    root.DokuztasAi = factory(root.DokuztasEngine);
  }
})(typeof self !== "undefined" ? self : this, function (Engine) {
  "use strict";

  const {
    PLAYERS,
    NODES,
    MILLS,
    opponent,
    countPieces,
    getAllLegalMoves,
    tryAction,
    allPlaced,
    canFly,
    inMill,
  } = Engine;

  const DIFFICULTY = {
    easy: { depth: 1, variety: 14, blunderChance: 0.35 },
    hard: { depth: 3, variety: 1.8, blunderChance: 0.04 },
    veryhard: { depth: 4, variety: 0.6, blunderChance: 0 },
  };

  function millCount(board, player) {
    let n = 0;
    for (const mill of MILLS) {
      if (mill.every((p) => board[p] === player)) n++;
    }
    return n;
  }

  function almostMills(board, player) {
    let n = 0;
    for (const mill of MILLS) {
      let mine = 0;
      let empty = 0;
      for (const p of mill) {
        if (board[p] === player) mine++;
        else if (board[p] === null) empty++;
      }
      if (mine === 2 && empty === 1) n++;
    }
    return n;
  }

  function mobility(state, player) {
    const probe = { ...state, turn: player, phase: state.phase === "remove" ? "move" : state.phase };
    if (probe.phase === "remove") probe.phase = allPlaced(probe) ? "move" : "place";
    return getAllLegalMoves(
      { ...state, turn: player, phase: allPlaced(state) || state.phase === "move" ? "move" : "place", winner: null },
      player
    ).length;
  }

  function evaluate(state, forPlayer) {
    const board = state.board;
    const me = countPieces(board, forPlayer);
    const them = countPieces(board, opponent(forPlayer));
    if (allPlaced(state)) {
      if (them < 3) return 5000;
      if (me < 3) return -5000;
    }
    if (state.winner === forPlayer) return 5000;
    if (state.winner === opponent(forPlayer)) return -5000;

    const myMills = millCount(board, forPlayer);
    const theirMills = millCount(board, opponent(forPlayer));
    const myAlmost = almostMills(board, forPlayer);
    const theirAlmost = almostMills(board, opponent(forPlayer));
    const placedBonus =
      (PIECES_PLACED(state, forPlayer) - PIECES_PLACED(state, opponent(forPlayer))) * 2;

    let mob = 0;
    if (allPlaced(state) || state.phase === "move") {
      mob = mobility(state, forPlayer) - mobility(state, opponent(forPlayer));
    }

    const flyBonus =
      (canFly(state, forPlayer) ? 3 : 0) - (canFly(state, opponent(forPlayer)) ? 3 : 0);

    const centerish = centerScore(board, forPlayer);

    return (
      (me - them) * 18 +
      (myMills - theirMills) * 22 +
      (myAlmost - theirAlmost) * 10 +
      mob * 0.45 +
      flyBonus +
      centerish +
      placedBonus +
      ((state.removedBy && state.removedBy[forPlayer]) || 0) * 16 -
      ((state.removedBy && state.removedBy[opponent(forPlayer)]) || 0) * 16
    );
  }

  function PIECES_PLACED(state, player) {
    return 9 - (state.toPlace[player] || 0);
  }

  function centerScore(board, forPlayer) {
    const weight = {
      a1: 1, a3: 1, a5: 1, a7: 1,
      b1: 2, b3: 2, b5: 2, b7: 2,
      c1: 1.5, c3: 1.5, c5: 1.5, c7: 1.5,
      b0: 0.5, b2: 0.5, b4: 0.5, b6: 0.5,
    };
    let s = 0;
    for (const n of NODES) {
      const w = weight[n] || 0.2;
      if (board[n] === forPlayer) s += w;
      else if (board[n] === opponent(forPlayer)) s -= w;
    }
    return s;
  }

  function orderMoves(moves, state, player) {
    return moves.slice().sort((a, b) => {
      const sa = quickScore(a, state, player);
      const sb = quickScore(b, state, player);
      return sb - sa;
    });
  }

  function quickScore(move, state, player) {
    let s = 0;
    if (move.type === "remove") {
      s += inMill(state.board, move.at, opponent(player)) ? 2 : 8;
      return s;
    }
    const r = tryAction(state, player, move);
    if (!r.ok) return -999;
    if (r.state.phase === "remove" && r.state.turn === player) s += 40;
    if (r.state.winner === player) s += 200;
    s += almostMills(r.state.board, player) * 5;
    s -= almostMills(r.state.board, opponent(player)) * 6;
    return s;
  }

  function minimax(state, depth, rootPlayer, alpha, beta) {
    if (state.winner) {
      if (state.winner === rootPlayer) return { score: 4000 + depth, move: null };
      return { score: -4000 - depth, move: null };
    }
    if (depth <= 0) {
      return { score: evaluate(state, rootPlayer), move: null };
    }

    const player = state.turn;
    const moves = orderMoves(getAllLegalMoves(state, player), state, player);
    if (!moves.length) {
      return {
        score: player === rootPlayer ? -3500 : 3500,
        move: null,
      };
    }

    const wantMax = player === rootPlayer;
    let best = {
      score: wantMax ? -Infinity : Infinity,
      move: moves[0],
    };

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
      const weaker = scored.slice(1, Math.min(scored.length, 5));
      if (weaker.length) pool = weaker;
    }
    if (!pool.length) pool = [scored[0]];
    return pool[(Math.random() * pool.length) | 0].move;
  }

  function chooseMove(state, aiPlayer, difficultyOrOpts) {
    if (aiPlayer === undefined) aiPlayer = PLAYERS.black;
    const opts = resolveOpts(difficultyOrOpts);
    if (state.winner || state.turn !== aiPlayer) return null;
    const moves = getAllLegalMoves(state, aiPlayer);
    if (!moves.length) return null;

    if (opts.difficulty === "easy" && Math.random() < 0.22) {
      return moves[(Math.random() * moves.length) | 0];
    }

    const scored = [];
    const ordered = orderMoves(moves, state, aiPlayer);
    const limit = Math.min(ordered.length, opts.difficulty === "veryhard" ? 28 : 20);
    for (let i = 0; i < limit; i++) {
      const m = ordered[i];
      const r = tryAction(state, aiPlayer, m);
      if (!r.ok) continue;
      let score;
      if (r.state.winner) {
        score = r.state.winner === aiPlayer ? 4000 + opts.depth : -4000 - opts.depth;
      } else {
        const child = minimax(
          r.state,
          Math.max(0, opts.depth - 1),
          aiPlayer,
          -Infinity,
          Infinity
        );
        score = child.score;
      }
      scored.push({ move: m, score });
    }

    const pick = pickFromScored(scored, opts.variety, opts.blunderChance);
    if (pick) return pick;
    return moves[(Math.random() * moves.length) | 0];
  }

  return {
    DIFFICULTY,
    evaluate,
    chooseMove,
  };
});
