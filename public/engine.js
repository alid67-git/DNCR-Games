/**
 * Toprak Kati — tahta + AI (Node ve tarayıcı).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ToprakEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const NODES = [
    "C",
    "TC",
    "BC",
    "FL",
    "FR",
    "TL",
    "BL",
    "TR",
    "BR",
    "LI",
    "RI",
  ];

  const POSITIONS = {
    C: { x: 50, y: 50 },
    TC: { x: 50, y: 12 },
    BC: { x: 50, y: 88 },
    FL: { x: 8, y: 50 },
    FR: { x: 92, y: 50 },
    TL: { x: 22, y: 22 },
    BL: { x: 22, y: 78 },
    TR: { x: 78, y: 22 },
    BR: { x: 78, y: 78 },
    LI: { x: 29, y: 50 },
    RI: { x: 71, y: 50 },
  };

  const ADJACENT = {
    C: ["TC", "BC", "LI", "RI"],
    TC: ["C", "TL", "TR"],
    BC: ["C", "BL", "BR"],
    FL: ["LI", "TL", "BL"],
    FR: ["RI", "TR", "BR"],
    TL: ["TC", "FL", "LI"],
    BL: ["BC", "FL", "LI"],
    TR: ["TC", "FR", "RI"],
    BR: ["BC", "FR", "RI"],
    LI: ["C", "FL", "TL", "BL"],
    RI: ["C", "FR", "TR", "BR"],
  };

  const JUMP_LINES = [
    ["FL", "LI", "C"],
    ["LI", "C", "RI"],
    ["C", "RI", "FR"],
    ["FR", "RI", "C"],
    ["RI", "C", "LI"],
    ["C", "LI", "FL"],
    ["TC", "C", "BC"],
    ["BC", "C", "TC"],
    ["TL", "LI", "BL"],
    ["BL", "LI", "TL"],
    ["TR", "RI", "BR"],
    ["BR", "RI", "TR"],
    ["TC", "TL", "FL"],
    ["FL", "TL", "TC"],
    ["TL", "FL", "BL"],
    ["BL", "FL", "TL"],
    ["FL", "BL", "BC"],
    ["BC", "BL", "FL"],
    ["TC", "TR", "FR"],
    ["FR", "TR", "TC"],
    ["TR", "FR", "BR"],
    ["BR", "FR", "TR"],
    ["FR", "BR", "BC"],
    ["BC", "BR", "FR"],
  ];

  const BOARD_EDGES = [
    ["TC", "C"],
    ["C", "BC"],
    ["FL", "LI"],
    ["LI", "C"],
    ["C", "RI"],
    ["RI", "FR"],
    ["TL", "LI"],
    ["LI", "BL"],
    ["TR", "RI"],
    ["RI", "BR"],
    ["TC", "TL"],
    ["TL", "FL"],
    ["FL", "BL"],
    ["BL", "BC"],
    ["TC", "TR"],
    ["TR", "FR"],
    ["FR", "BR"],
    ["BR", "BC"],
  ];

  const PLAYERS = { tomato: "tomato", gourd: "gourd" };

  function initialBoard() {
    const board = Object.fromEntries(NODES.map((n) => [n, null]));
    for (const n of ["FL", "TL", "BL", "LI", "TC"]) board[n] = PLAYERS.tomato;
    for (const n of ["FR", "TR", "BR", "RI", "BC"]) board[n] = PLAYERS.gourd;
    return board;
  }

  function opponent(player) {
    return player === PLAYERS.tomato ? PLAYERS.gourd : PLAYERS.tomato;
  }

  function countPieces(board, player) {
    return NODES.filter((n) => board[n] === player).length;
  }

  function getSimpleMoves(board, from) {
    return (ADJACENT[from] || []).filter((to) => board[to] === null);
  }

  function getCapturesFrom(board, from, player) {
    const enemy = opponent(player);
    const captures = [];
    for (const [a, over, to] of JUMP_LINES) {
      if (a !== from) continue;
      if (board[over] !== enemy) continue;
      if (board[to] !== null) continue;
      captures.push({ from, over, to, capture: true });
    }
    return captures;
  }

  function getMovesFrom(board, from, player, mustCapture) {
    if (board[from] !== player) return [];
    const captures = getCapturesFrom(board, from, player);
    if (mustCapture || captures.length > 0) return captures;
    return getSimpleMoves(board, from).map((to) => ({
      from,
      to,
      over: null,
      capture: false,
    }));
  }

  function anyCaptureAvailable(board, player) {
    for (const n of NODES) {
      if (board[n] !== player) continue;
      if (getCapturesFrom(board, n, player).length > 0) return true;
    }
    return false;
  }

  function getAllLegalMoves(board, player, chainFrom = null) {
    if (chainFrom) return getCapturesFrom(board, chainFrom, player);
    const must = anyCaptureAvailable(board, player);
    const moves = [];
    for (const n of NODES) {
      if (board[n] !== player) continue;
      moves.push(...getMovesFrom(board, n, player, must));
    }
    return moves;
  }

  function applyMove(board, move) {
    const next = { ...board };
    const player = next[move.from];
    next[move.from] = null;
    next[move.to] = player;
    if (move.capture && move.over) next[move.over] = null;
    return next;
  }

  function hasAnyMove(board, player) {
    return getAllLegalMoves(board, player).length > 0;
  }

  function checkWinner(board, currentPlayer) {
    const t = countPieces(board, PLAYERS.tomato);
    const g = countPieces(board, PLAYERS.gourd);
    if (t === 0) return PLAYERS.gourd;
    if (g === 0) return PLAYERS.tomato;
    if (!hasAnyMove(board, currentPlayer)) return opponent(currentPlayer);
    return null;
  }

  function createGameState(starter) {
    const start =
      starter === PLAYERS.gourd || starter === PLAYERS.tomato
        ? starter
        : PLAYERS.tomato;
    return {
      board: initialBoard(),
      turn: start,
      starter: start,
      chainFrom: null,
      winner: null,
      lastMove: null,
      moveCount: 0,
      capturedBy: { tomato: 0, gourd: 0 },
    };
  }

  function tryMove(state, player, from, to) {
    if (state.winner) return { ok: false, error: "Oyun bitti." };
    if (player !== state.turn) return { ok: false, error: "Sıra sizde değil." };
    if (state.chainFrom && from !== state.chainFrom) {
      return { ok: false, error: "Yakalama zincirine aynı taşla devam etmelisiniz." };
    }
    const legal = getAllLegalMoves(state.board, player, state.chainFrom);
    const move = legal.find((m) => m.from === from && m.to === to);
    if (!move) return { ok: false, error: "Geçersiz hamle." };

    const board = applyMove(state.board, move);
    let chainFrom = null;
    let turn = player;
    const capturedBy = {
      tomato: (state.capturedBy && state.capturedBy.tomato) || 0,
      gourd: (state.capturedBy && state.capturedBy.gourd) || 0,
    };
    if (move.capture) {
      capturedBy[player] = (capturedBy[player] || 0) + 1;
      const more = getCapturesFrom(board, move.to, player);
      if (more.length > 0) chainFrom = move.to;
      else turn = opponent(player);
    } else {
      turn = opponent(player);
    }
    const next = {
      ...state,
      board,
      turn,
      chainFrom,
      lastMove: move,
      moveCount: state.moveCount + 1,
      capturedBy,
      winner: null,
    };
    next.winner = checkWinner(board, next.turn);
    return { ok: true, state: next };
  }

  const CENTER_BONUS = {
    C: 4,
    LI: 2,
    RI: 2,
    TC: 1,
    BC: 1,
    TL: 0.5,
    TR: 0.5,
    BL: 0.5,
    BR: 0.5,
    FL: 0,
    FR: 0,
  };

  function evaluate(board, forPlayer) {
    const me = countPieces(board, forPlayer);
    const them = countPieces(board, opponent(forPlayer));
    if (them === 0) return 1000;
    if (me === 0) return -1000;
    let pos = 0;
    for (const n of NODES) {
      if (board[n] === forPlayer) pos += CENTER_BONUS[n] || 0;
      else if (board[n] === opponent(forPlayer)) pos -= CENTER_BONUS[n] || 0;
    }
    const myMoves = getAllLegalMoves(board, forPlayer).length;
    const theirMoves = getAllLegalMoves(board, opponent(forPlayer)).length;
    return (me - them) * 12 + pos + (myMoves - theirMoves) * 0.35;
  }

  function minimax(state, depth, maximizing, rootPlayer, alpha, beta) {
    if (state.winner) {
      if (state.winner === rootPlayer) return { score: 900 + depth, path: [] };
      return { score: -900 - depth, path: [] };
    }
    if (depth <= 0) {
      return { score: evaluate(state.board, rootPlayer), path: [] };
    }

    const player = state.turn;
    const moves = getAllLegalMoves(state.board, player, state.chainFrom);
    if (!moves.length) {
      return { score: player === rootPlayer ? -800 : 800, path: [] };
    }

    const wantMax = player === rootPlayer;
    let best = wantMax
      ? { score: -Infinity, path: null }
      : { score: Infinity, path: null };

    const ordered = moves.slice().sort((a, b) => {
      const ac = (a.capture ? 10 : 0) + (a.to === "C" ? 2 : 0);
      const bc = (b.capture ? 10 : 0) + (b.to === "C" ? 2 : 0);
      return bc - ac;
    });

    for (const m of ordered) {
      const result = tryMove(state, player, m.from, m.to);
      if (!result.ok) continue;

      let childState = result.state;
      let pathPrefix = [{ from: m.from, to: m.to }];

      while (
        !childState.winner &&
        childState.chainFrom &&
        childState.turn === player
      ) {
        const cont = getAllLegalMoves(
          childState.board,
          player,
          childState.chainFrom
        );
        if (!cont.length) break;
        let bestCont = null;
        let bestContScore = -Infinity;
        for (const c of cont) {
          const r = tryMove(childState, player, c.from, c.to);
          if (!r.ok) continue;
          const sc = evaluate(r.state.board, rootPlayer);
          if (sc > bestContScore) {
            bestContScore = sc;
            bestCont = { move: c, state: r.state };
          }
        }
        if (!bestCont) break;
        pathPrefix.push({ from: bestCont.move.from, to: bestCont.move.to });
        childState = bestCont.state;
      }

      const nextDepth = childState.turn === player ? depth : depth - 1;
      const child = minimax(
        childState,
        Math.max(0, nextDepth),
        maximizing,
        rootPlayer,
        alpha,
        beta
      );
      const scored = {
        score: child.score,
        path: pathPrefix.concat(child.path || []),
      };

      if (wantMax) {
        if (scored.score > best.score) best = scored;
        alpha = Math.max(alpha, scored.score);
      } else {
        if (scored.score < best.score) best = scored;
        beta = Math.min(beta, scored.score);
      }
      if (beta <= alpha) break;
    }

    return best.path ? best : { score: wantMax ? -500 : 500, path: [] };
  }

  /**
   * Zorluk: easy / normal / hard / veryhard
   * Aynı konumda hep aynı hamleyi seçmeyi kırar — en iyi skora yakın
   * hamleler arasından rastgele seçer.
   */
  const DIFFICULTY = {
    easy: { depth: 1, variety: 10, blunderChance: 0.28 },
    normal: { depth: 2, variety: 3, blunderChance: 0.08 },
    hard: { depth: 3, variety: 1.2, blunderChance: 0 },
    veryhard: { depth: 4, variety: 0.6, blunderChance: 0 },
  };

  function resolveAiOptions(depthOrOpts, maybeOpts) {
    let difficulty = "normal";
    let depth;
    let variety;
    let blunderChance;
    if (typeof depthOrOpts === "object" && depthOrOpts) {
      difficulty = depthOrOpts.difficulty || "normal";
      if (difficulty === "medium") difficulty = "normal";
      const preset = DIFFICULTY[difficulty] || DIFFICULTY.normal;
      depth = depthOrOpts.depth != null ? depthOrOpts.depth : preset.depth;
      variety = depthOrOpts.variety != null ? depthOrOpts.variety : preset.variety;
      blunderChance =
        depthOrOpts.blunderChance != null
          ? depthOrOpts.blunderChance
          : preset.blunderChance;
    } else {
      if (maybeOpts && typeof maybeOpts === "object") {
        difficulty = maybeOpts.difficulty || "normal";
        const preset = DIFFICULTY[difficulty] || DIFFICULTY.normal;
        depth = depthOrOpts !== undefined ? depthOrOpts : preset.depth;
        variety = maybeOpts.variety != null ? maybeOpts.variety : preset.variety;
        blunderChance =
          maybeOpts.blunderChance != null
            ? maybeOpts.blunderChance
            : preset.blunderChance;
      } else if (depthOrOpts !== undefined) {
        // Eski API: chooseMove(state, player, depth) — hard + küçük çeşitlilik
        depth = depthOrOpts;
        variety = 1.2;
        blunderChance = 0;
        difficulty = "hard";
      } else {
        const preset = DIFFICULTY.normal;
        depth = preset.depth;
        variety = preset.variety;
        blunderChance = preset.blunderChance;
      }
    }
    return { difficulty, depth, variety, blunderChance };
  }

  function pickFromScored(scored, variety, blunderChance) {
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].score;
    let pool = scored.filter((s) => s.score >= best - variety);
    if (
      blunderChance > 0 &&
      Math.random() < blunderChance &&
      scored.length > 1
    ) {
      // Bilinçli hata: en iyi dışındaki orta dilim
      const weaker = scored.slice(1, Math.min(scored.length, 4));
      if (weaker.length) pool = weaker;
    }
    if (!pool.length) pool = [scored[0]];
    const pick = pool[(Math.random() * pool.length) | 0];
    return { from: pick.move.from, to: pick.move.to };
  }

  /** Hamleyi uygula; zincir varsa greedy (küçük çeşitlilikle) tamamla. */
  function applyMoveResolveChain(state, player, move, rootPlayer) {
    const result = tryMove(state, player, move.from, move.to);
    if (!result.ok) return null;
    let childState = result.state;
    while (
      !childState.winner &&
      childState.chainFrom &&
      childState.turn === player
    ) {
      const cont = getAllLegalMoves(
        childState.board,
        player,
        childState.chainFrom
      );
      if (!cont.length) break;
      const contScored = [];
      for (const c of cont) {
        const r = tryMove(childState, player, c.from, c.to);
        if (!r.ok) continue;
        contScored.push({
          move: c,
          score: evaluate(r.state.board, rootPlayer),
          state: r.state,
        });
      }
      if (!contScored.length) break;
      contScored.sort((a, b) => b.score - a.score);
      const bestC = contScored[0].score;
      const near = contScored.filter((s) => s.score >= bestC - 1.5);
      const chosen = near[(Math.random() * near.length) | 0];
      childState = chosen.state;
    }
    return childState;
  }

  function chooseMove(state, aiPlayer, depthOrOpts, maybeOpts) {
    if (aiPlayer === undefined) aiPlayer = PLAYERS.gourd;
    const opts = resolveAiOptions(depthOrOpts, maybeOpts);
    if (state.winner || state.turn !== aiPlayer) return null;
    const moves = getAllLegalMoves(state.board, aiPlayer, state.chainFrom);
    if (!moves.length) return null;

    if (state.chainFrom) {
      const scored = [];
      for (const m of moves) {
        const r = tryMove(state, aiPlayer, m.from, m.to);
        if (!r.ok) continue;
        scored.push({
          move: m,
          score: evaluate(r.state.board, aiPlayer),
        });
      }
      return pickFromScored(scored, Math.max(opts.variety, 1), opts.blunderChance);
    }

    const scored = [];
    for (const m of moves) {
      const childState = applyMoveResolveChain(state, aiPlayer, m, aiPlayer);
      if (!childState) continue;
      let score;
      if (childState.winner) {
        score =
          childState.winner === aiPlayer
            ? 900 + opts.depth
            : -900 - opts.depth;
      } else {
        const child = minimax(
          childState,
          Math.max(0, opts.depth - 1),
          true,
          aiPlayer,
          -Infinity,
          Infinity
        );
        score = child.score;
      }
      scored.push({ move: m, score });
    }

    const picked = pickFromScored(scored, opts.variety, opts.blunderChance);
    if (picked) return picked;
    const m = moves[(Math.random() * moves.length) | 0];
    return { from: m.from, to: m.to };
  }

  return {
    NODES,
    POSITIONS,
    ADJACENT,
    JUMP_LINES,
    BOARD_EDGES,
    PLAYERS,
    DIFFICULTY,
    initialBoard,
    opponent,
    countPieces,
    getAllLegalMoves,
    tryMove,
    createGameState,
    checkWinner,
    chooseMove,
    evaluate,
  };
});
