/**
 * Dokuztaş (Nine Men's Morris) — tahta + kurallar (Node ve tarayıcı).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DokuztasEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PLAYERS = { red: "red", black: "black" };
  const PIECES_EACH = 9;

  /** Dış → orta → iç; her halkada NW, N, NE, E, SE, S, SW, W */
  const NODES = [
    "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7",
    "b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7",
    "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7",
  ];

  const POSITIONS = {
    a0: { x: 8, y: 8 }, a1: { x: 50, y: 8 }, a2: { x: 92, y: 8 },
    a3: { x: 92, y: 50 }, a4: { x: 92, y: 92 }, a5: { x: 50, y: 92 },
    a6: { x: 8, y: 92 }, a7: { x: 8, y: 50 },
    b0: { x: 24, y: 24 }, b1: { x: 50, y: 24 }, b2: { x: 76, y: 24 },
    b3: { x: 76, y: 50 }, b4: { x: 76, y: 76 }, b5: { x: 50, y: 76 },
    b6: { x: 24, y: 76 }, b7: { x: 24, y: 50 },
    c0: { x: 38, y: 38 }, c1: { x: 50, y: 38 }, c2: { x: 62, y: 38 },
    c3: { x: 62, y: 50 }, c4: { x: 62, y: 62 }, c5: { x: 50, y: 62 },
    c6: { x: 38, y: 62 }, c7: { x: 38, y: 50 },
  };

  const ADJACENT = {
    a0: ["a1", "a7"],
    a1: ["a0", "a2", "b1"],
    a2: ["a1", "a3"],
    a3: ["a2", "a4", "b3"],
    a4: ["a3", "a5"],
    a5: ["a4", "a6", "b5"],
    a6: ["a5", "a7"],
    a7: ["a6", "a0", "b7"],
    b0: ["b1", "b7"],
    b1: ["b0", "b2", "a1", "c1"],
    b2: ["b1", "b3"],
    b3: ["b2", "b4", "a3", "c3"],
    b4: ["b3", "b5"],
    b5: ["b4", "b6", "a5", "c5"],
    b6: ["b5", "b7"],
    b7: ["b6", "b0", "a7", "c7"],
    c0: ["c1", "c7"],
    c1: ["c0", "c2", "b1"],
    c2: ["c1", "c3"],
    c3: ["c2", "c4", "b3"],
    c4: ["c3", "c5"],
    c5: ["c4", "c6", "b5"],
    c6: ["c5", "c7"],
    c7: ["c6", "c0", "b7"],
  };

  const MILLS = [
    ["a0", "a1", "a2"], ["a2", "a3", "a4"], ["a4", "a5", "a6"], ["a6", "a7", "a0"],
    ["b0", "b1", "b2"], ["b2", "b3", "b4"], ["b4", "b5", "b6"], ["b6", "b7", "b0"],
    ["c0", "c1", "c2"], ["c2", "c3", "c4"], ["c4", "c5", "c6"], ["c6", "c7", "c0"],
    ["a1", "b1", "c1"], ["a3", "b3", "c3"], ["a5", "b5", "c5"], ["a7", "b7", "c7"],
  ];

  const BOARD_EDGES = [
    ["a0", "a1"], ["a1", "a2"], ["a2", "a3"], ["a3", "a4"],
    ["a4", "a5"], ["a5", "a6"], ["a6", "a7"], ["a7", "a0"],
    ["b0", "b1"], ["b1", "b2"], ["b2", "b3"], ["b3", "b4"],
    ["b4", "b5"], ["b5", "b6"], ["b6", "b7"], ["b7", "b0"],
    ["c0", "c1"], ["c1", "c2"], ["c2", "c3"], ["c3", "c4"],
    ["c4", "c5"], ["c5", "c6"], ["c6", "c7"], ["c7", "c0"],
    ["a1", "b1"], ["b1", "c1"], ["a3", "b3"], ["b3", "c3"],
    ["a5", "b5"], ["b5", "c5"], ["a7", "b7"], ["b7", "c7"],
  ];

  function opponent(player) {
    return player === PLAYERS.red ? PLAYERS.black : PLAYERS.red;
  }

  function emptyBoard() {
    return Object.fromEntries(NODES.map((n) => [n, null]));
  }

  function countPieces(board, player) {
    let n = 0;
    for (const id of NODES) if (board[id] === player) n++;
    return n;
  }

  function inMill(board, node, player) {
    if (board[node] !== player) return false;
    for (const mill of MILLS) {
      if (!mill.includes(node)) continue;
      if (mill.every((p) => board[p] === player)) return true;
    }
    return false;
  }

  function formsMillAt(board, node, player) {
    return inMill(board, node, player);
  }

  function allPlaced(state) {
    return state.toPlace.red === 0 && state.toPlace.black === 0;
  }

  function canFly(state, player) {
    return allPlaced(state) && countPieces(state.board, player) === 3;
  }

  function removableTargets(board, victim) {
    const owned = NODES.filter((n) => board[n] === victim);
    const notInMill = owned.filter((n) => !inMill(board, n, victim));
    return notInMill.length ? notInMill : owned.slice();
  }

  function getPlaceMoves(state, player) {
    if (state.phase !== "place") return [];
    if (state.toPlace[player] <= 0) return [];
    return NODES.filter((n) => state.board[n] === null).map((to) => ({
      type: "place",
      to,
      from: null,
    }));
  }

  function getSlideMoves(state, player) {
    if (state.phase !== "move") return [];
    const fly = canFly(state, player);
    const moves = [];
    for (const from of NODES) {
      if (state.board[from] !== player) continue;
      const targets = fly
        ? NODES.filter((n) => state.board[n] === null)
        : (ADJACENT[from] || []).filter((n) => state.board[n] === null);
      for (const to of targets) {
        moves.push({ type: "move", from, to, fly });
      }
    }
    return moves;
  }

  function getRemoveMoves(state, player) {
    if (state.phase !== "remove") return [];
    const victim = opponent(player);
    return removableTargets(state.board, victim).map((at) => ({
      type: "remove",
      at,
    }));
  }

  function getAllLegalMoves(state, player) {
    if (state.winner || player !== state.turn) return [];
    if (state.phase === "place") return getPlaceMoves(state, player);
    if (state.phase === "move") return getSlideMoves(state, player);
    if (state.phase === "remove") return getRemoveMoves(state, player);
    return [];
  }

  function hasLegalMove(state, player) {
    if (!allPlaced(state) && state.toPlace[player] > 0) {
      return NODES.some((n) => state.board[n] === null);
    }
    if (!allPlaced(state)) return true;
    return getSlideMoves({ ...state, phase: "move", turn: player }, player).length > 0;
  }

  function checkWinner(state) {
    if (state.phase === "remove") return null;
    if (!allPlaced(state)) return null;
    for (const p of [PLAYERS.red, PLAYERS.black]) {
      if (countPieces(state.board, p) < 3) return opponent(p);
    }
    const cur = state.turn;
    if (!hasLegalMove(state, cur)) return opponent(cur);
    return null;
  }

  function createGameState(starter) {
    const start =
      starter === PLAYERS.black || starter === PLAYERS.red
        ? starter
        : PLAYERS.red;
    return {
      board: emptyBoard(),
      turn: start,
      starter: start,
      phase: "place",
      toPlace: { red: PIECES_EACH, black: PIECES_EACH },
      winner: null,
      lastMove: null,
      moveCount: 0,
      removedBy: { red: 0, black: 0 },
    };
  }

  function advanceAfterAction(next, player, formedMill) {
    if (formedMill) {
      const targets = removableTargets(next.board, opponent(player));
      if (targets.length) {
        next.phase = "remove";
        next.turn = player;
        next.winner = null;
        return next;
      }
    }

    const opp = opponent(player);
    if (allPlaced(next)) {
      next.phase = "move";
    } else if (next.toPlace[opp] > 0) {
      next.phase = "place";
    } else if (next.toPlace[player] > 0) {
      next.phase = "place";
      next.turn = player;
      next.winner = checkWinner(next);
      return next;
    } else {
      next.phase = "move";
    }
    next.turn = opp;
    next.winner = checkWinner(next);
    return next;
  }

  function tryAction(state, player, action) {
    if (!action || !action.type) return { ok: false, error: "Geçersiz hamle." };
    if (state.winner) return { ok: false, error: "Oyun bitti." };
    if (player !== state.turn) return { ok: false, error: "Sıra sizde değil." };

    if (action.type === "place") {
      if (state.phase !== "place") return { ok: false, error: "Yerleştirme aşaması değil." };
      if (state.toPlace[player] <= 0) return { ok: false, error: "Taşınız kalmadı." };
      if (!NODES.includes(action.to) || state.board[action.to] !== null) {
        return { ok: false, error: "Geçersiz konum." };
      }
      const board = { ...state.board, [action.to]: player };
      const toPlace = {
        red: state.toPlace.red,
        black: state.toPlace.black,
      };
      toPlace[player] -= 1;
      const next = {
        ...state,
        board,
        toPlace,
        lastMove: { type: "place", to: action.to, player },
        moveCount: state.moveCount + 1,
        winner: null,
      };
      const mill = formsMillAt(board, action.to, player);
      return { ok: true, state: advanceAfterAction(next, player, mill) };
    }

    if (action.type === "move") {
      if (state.phase !== "move") return { ok: false, error: "Hareket aşaması değil." };
      if (state.board[action.from] !== player) return { ok: false, error: "Kendi taşınız değil." };
      if (state.board[action.to] !== null) return { ok: false, error: "Hedef dolu." };
      const fly = canFly(state, player);
      const adj = ADJACENT[action.from] || [];
      if (!fly && !adj.includes(action.to)) {
        return { ok: false, error: "Komşu olmayan nokta." };
      }
      const board = { ...state.board, [action.from]: null, [action.to]: player };
      const next = {
        ...state,
        board,
        lastMove: {
          type: "move",
          from: action.from,
          to: action.to,
          player,
          fly,
        },
        moveCount: state.moveCount + 1,
        winner: null,
      };
      const mill = formsMillAt(board, action.to, player);
      return { ok: true, state: advanceAfterAction(next, player, mill) };
    }

    if (action.type === "remove") {
      if (state.phase !== "remove") return { ok: false, error: "Çıkarma aşaması değil." };
      const victim = opponent(player);
      const legal = removableTargets(state.board, victim);
      if (!legal.includes(action.at)) {
        return { ok: false, error: "Bu taş çıkarılamaz." };
      }
      const board = { ...state.board, [action.at]: null };
      const removedBy = {
        red: state.removedBy.red,
        black: state.removedBy.black,
      };
      removedBy[player] = (removedBy[player] || 0) + 1;
      const next = {
        ...state,
        board,
        removedBy,
        lastMove: { type: "remove", at: action.at, player },
        moveCount: state.moveCount + 1,
        winner: null,
      };
      return { ok: true, state: advanceAfterAction(next, player, false) };
    }

    return { ok: false, error: "Bilinmeyen hamle." };
  }

  /** Geriye uyumluluk: tryMove(state, player, from, to) — place/move için */
  function tryMove(state, player, from, to) {
    if (state.phase === "remove") {
      return tryAction(state, player, { type: "remove", at: to || from });
    }
    if (state.phase === "place") {
      return tryAction(state, player, { type: "place", to: to || from });
    }
    return tryAction(state, player, { type: "move", from, to });
  }

  return {
    NODES,
    POSITIONS,
    ADJACENT,
    MILLS,
    BOARD_EDGES,
    PLAYERS,
    PIECES_EACH,
    opponent,
    emptyBoard,
    countPieces,
    inMill,
    formsMillAt,
    allPlaced,
    canFly,
    removableTargets,
    getAllLegalMoves,
    hasLegalMove,
    createGameState,
    tryAction,
    tryMove,
    checkWinner,
  };
});
