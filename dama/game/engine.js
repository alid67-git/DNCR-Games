/**
 * Türk Daması — 8×8 ortogonal dama (tahta + kurallar).
 * Node ve tarayıcı.
 *
 * - 16’şar taş, ilk iki sıra dolu
 * - Piyon: ileri / yana bir kare; geri gitmez
 * - Alma: dikey/yatay kısa sıçrama (geri alma serbest); zorunlu + maksimum alma
 * - Dama (kral): kale gibi kayar; uzun mesafe alma; zincir devam
 * - Son sıraya varınca dama olur (zincirde de devam edebilir)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DamaEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PLAYERS = { white: "white", black: "black" };
  const SIZE = 8;
  const ORTHO = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];

  function sq(r, c) {
    return r + "," + c;
  }

  function parseSq(id) {
    const p = String(id).split(",");
    return { r: Number(p[0]), c: Number(p[1]) };
  }

  const SQUARES = [];
  const POSITIONS = {};
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const id = sq(r, c);
      SQUARES.push(id);
      // viewBox 0..100 square board with padding
      POSITIONS[id] = {
        x: 6.25 + c * 12.5,
        y: 6.25 + r * 12.5,
      };
    }
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function opponent(player) {
    return player === PLAYERS.white ? PLAYERS.black : PLAYERS.white;
  }

  function forwardDir(player) {
    // white at bottom (rows 6–7), moves toward smaller row
    return player === PLAYERS.white ? -1 : 1;
  }

  function isPromotionRow(player, r) {
    return player === PLAYERS.white ? r === 0 : r === SIZE - 1;
  }

  function emptyBoard() {
    return Object.fromEntries(SQUARES.map((id) => [id, null]));
  }

  function piece(color, king) {
    return { color: color, king: !!king };
  }

  function initialBoard() {
    const board = emptyBoard();
    for (let c = 0; c < SIZE; c++) {
      board[sq(0, c)] = piece(PLAYERS.black, false);
      board[sq(1, c)] = piece(PLAYERS.black, false);
      board[sq(6, c)] = piece(PLAYERS.white, false);
      board[sq(7, c)] = piece(PLAYERS.white, false);
    }
    return board;
  }

  function cloneBoard(board) {
    const next = emptyBoard();
    for (const id of SQUARES) {
      const p = board[id];
      next[id] = p ? piece(p.color, p.king) : null;
    }
    return next;
  }

  function countPieces(board, player) {
    let n = 0;
    for (const id of SQUARES) {
      const p = board[id];
      if (p && p.color === player) n++;
    }
    return n;
  }

  function countKings(board, player) {
    let n = 0;
    for (const id of SQUARES) {
      const p = board[id];
      if (p && p.color === player && p.king) n++;
    }
    return n;
  }

  function createGameState(starter) {
    const start =
      starter === PLAYERS.black || starter === PLAYERS.white
        ? starter
        : PLAYERS.white;
    return {
      board: initialBoard(),
      turn: start,
      winner: null,
      moveCount: 0,
      capturedBy: { white: 0, black: 0 },
      lastMove: null,
    };
  }

  /** Man quiet moves: forward or sideways one empty square. */
  function manQuietTargets(board, from, player) {
    const { r, c } = parseSq(from);
    const fwd = forwardDir(player);
    const dirs = [
      [fwd, 0],
      [0, 1],
      [0, -1],
    ];
    const out = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const id = sq(nr, nc);
      if (!board[id]) out.push(id);
    }
    return out;
  }

  /** King quiet moves: rook-like any distance until blocked. */
  function kingQuietTargets(board, from) {
    const { r, c } = parseSq(from);
    const out = [];
    for (const [dr, dc] of ORTHO) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const id = sq(nr, nc);
        if (board[id]) break;
        out.push(id);
        nr += dr;
        nc += dc;
      }
    }
    return out;
  }

  /**
   * Single capture hops from `from` (man).
   * Returns [{ to, captured }] — captured is the jumped square id.
   */
  function manCaptureHops(board, from, player, alreadyCaptured) {
    const { r, c } = parseSq(from);
    const opp = opponent(player);
    const taken = alreadyCaptured || new Set();
    const hops = [];
    for (const [dr, dc] of ORTHO) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
      const mid = sq(mr, mc);
      const land = sq(lr, lc);
      const midP = board[mid];
      if (!midP || midP.color !== opp) continue;
      if (taken.has(mid)) continue;
      if (board[land]) continue;
      hops.push({ to: land, captured: mid });
    }
    return hops;
  }

  /**
   * King capture hops: jump over one enemy with empty landing beyond (any distance).
   */
  function kingCaptureHops(board, from, player, alreadyCaptured) {
    const { r, c } = parseSq(from);
    const opp = opponent(player);
    const taken = alreadyCaptured || new Set();
    const hops = [];
    for (const [dr, dc] of ORTHO) {
      let nr = r + dr;
      let nc = c + dc;
      // skip empties until first piece
      while (inBounds(nr, nc) && !board[sq(nr, nc)]) {
        nr += dr;
        nc += dc;
      }
      if (!inBounds(nr, nc)) continue;
      const mid = sq(nr, nc);
      const midP = board[mid];
      if (!midP || midP.color !== opp || taken.has(mid)) continue;
      // landings beyond mid
      let lr = nr + dr;
      let lc = nc + dc;
      while (inBounds(lr, lc) && !board[sq(lr, lc)]) {
        hops.push({ to: sq(lr, lc), captured: mid });
        lr += dr;
        lc += dc;
      }
    }
    return hops;
  }

  function captureHops(board, from, player, isKing, alreadyCaptured) {
    return isKing
      ? kingCaptureHops(board, from, player, alreadyCaptured)
      : manCaptureHops(board, from, player, alreadyCaptured);
  }

  /**
   * DFS all capture sequences from a square. Promotes mid-chain if landing on last row.
   * Each sequence: { from, to, path, captured, becomesKing }
   */
  function gatherCaptureSequences(board, from, player) {
    const startPiece = board[from];
    if (!startPiece || startPiece.color !== player) return [];
    const sequences = [];

    function dfs(curBoard, curFrom, isKing, path, capturedSet, capturedList) {
      const hops = captureHops(curBoard, curFrom, player, isKing, capturedSet);
      if (!hops.length) {
        if (capturedList.length) {
          sequences.push({
            type: "move",
            from: path[0],
            to: curFrom,
            path: path.slice(),
            captured: capturedList.slice(),
            becomesKing: isKing && !startPiece.king,
          });
        }
        return;
      }
      for (const hop of hops) {
        const nextBoard = cloneBoard(curBoard);
        const moving = nextBoard[curFrom];
        nextBoard[curFrom] = null;
        nextBoard[hop.captured] = null;
        let nextKing = !!(moving && moving.king) || isKing;
        const landR = parseSq(hop.to).r;
        if (!nextKing && isPromotionRow(player, landR)) nextKing = true;
        nextBoard[hop.to] = piece(player, nextKing);
        const nextSet = new Set(capturedSet);
        nextSet.add(hop.captured);
        path.push(hop.to);
        capturedList.push(hop.captured);
        dfs(nextBoard, hop.to, nextKing, path, nextSet, capturedList);
        path.pop();
        capturedList.pop();
      }
    }

    dfs(board, from, !!startPiece.king, [from], new Set(), []);
    return sequences;
  }

  function allCaptureMoves(board, player) {
    const moves = [];
    for (const id of SQUARES) {
      const p = board[id];
      if (!p || p.color !== player) continue;
      moves.push(...gatherCaptureSequences(board, id, player));
    }
    return moves;
  }

  function allQuietMoves(board, player) {
    const moves = [];
    for (const id of SQUARES) {
      const p = board[id];
      if (!p || p.color !== player) continue;
      const targets = p.king
        ? kingQuietTargets(board, id)
        : manQuietTargets(board, id, player);
      for (const to of targets) {
        const landR = parseSq(to).r;
        const becomesKing = !p.king && isPromotionRow(player, landR);
        moves.push({
          type: "move",
          from: id,
          to: to,
          path: [id, to],
          captured: [],
          becomesKing: becomesKing,
        });
      }
    }
    return moves;
  }

  function getAllLegalMoves(state, player) {
    if (!state || state.winner) return [];
    const who = player || state.turn;
    const caps = allCaptureMoves(state.board, who);
    if (caps.length) {
      let max = 0;
      for (const m of caps) max = Math.max(max, m.captured.length);
      return caps.filter((m) => m.captured.length === max);
    }
    return allQuietMoves(state.board, who);
  }

  function applyMoveOnBoard(board, move, player) {
    const next = cloneBoard(board);
    const moving = next[move.from];
    if (!moving || moving.color !== player) return null;
    next[move.from] = null;
    for (const cap of move.captured || []) next[cap] = null;
    let king = !!moving.king;
    // Walk path for mid-sequence promotion
    const path = move.path && move.path.length ? move.path : [move.from, move.to];
    for (let i = 1; i < path.length; i++) {
      const landR = parseSq(path[i]).r;
      if (!king && isPromotionRow(player, landR)) king = true;
    }
    if (move.becomesKing) king = true;
    next[move.to] = piece(player, king);
    return next;
  }

  function tryAction(state, player, action) {
    if (!state || state.winner) return { ok: false, error: "game_over" };
    if (player !== state.turn) return { ok: false, error: "not_your_turn" };
    if (!action || action.type !== "move") return { ok: false, error: "bad_action" };

    const legal = getAllLegalMoves(state, player);
    const match = legal.find(
      (m) =>
        m.from === action.from &&
        m.to === action.to &&
        JSON.stringify(m.captured || []) === JSON.stringify(action.captured || []) &&
        JSON.stringify(m.path || []) === JSON.stringify(action.path || [])
    );
    // Also allow matching by from/to when unique among legal
    let move = match;
    if (!move) {
      const sameEnds = legal.filter((m) => m.from === action.from && m.to === action.to);
      if (sameEnds.length === 1) move = sameEnds[0];
      else if (action.path && action.path.length) {
        move = legal.find(
          (m) =>
            m.from === action.from &&
            m.to === action.to &&
            JSON.stringify(m.path) === JSON.stringify(action.path)
        );
      }
    }
    if (!move) return { ok: false, error: "illegal" };

    const board = applyMoveOnBoard(state.board, move, player);
    if (!board) return { ok: false, error: "illegal" };

    const next = {
      board: board,
      turn: opponent(player),
      winner: null,
      moveCount: (state.moveCount || 0) + 1,
      capturedBy: {
        white: (state.capturedBy && state.capturedBy.white) || 0,
        black: (state.capturedBy && state.capturedBy.black) || 0,
      },
      lastMove: {
        from: move.from,
        to: move.to,
        path: move.path.slice(),
        captured: move.captured.slice(),
        player: player,
      },
    };
    next.capturedBy[player] += move.captured.length;

    const opp = opponent(player);
    if (countPieces(board, opp) === 0) {
      next.winner = player;
      next.turn = player;
      return { ok: true, state: next, move: move };
    }
    // Opponent must have a legal move
    if (!getAllLegalMoves(next, opp).length) {
      next.winner = player;
      next.turn = player;
    }
    return { ok: true, state: next, move: move };
  }

  /** Checkerboard dark square helper for UI (r+c odd or even). */
  function isDarkSquare(id) {
    const { r, c } = parseSq(id);
    return (r + c) % 2 === 1;
  }

  return {
    PLAYERS,
    SIZE,
    SQUARES,
    NODES: SQUARES,
    POSITIONS,
    BOARD_EDGES: [],
    opponent,
    createGameState,
    tryAction,
    getAllLegalMoves,
    countPieces,
    countKings,
    parseSq,
    sq,
    isDarkSquare,
    piece,
    cloneBoard,
  };
});
