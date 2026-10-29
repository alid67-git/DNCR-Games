/**
 * Fanorona — Madagaskar strateji oyunu (tahta + kurallar).
 * Node ve tarayıcı.
 *
 * Kurgu:
 * - 5×9 kesişim; yatay/dikey + çift pariteli köşegenler
 * - Yaklaşma (approach) veya uzaklaşma (withdrawal) ile alma zorunlu
 * - Zincir (vela): aynı taşla yön değiştirerek devam
 * - Paika: alma yokken serbest kayma
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FanoronaEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PLAYERS = { white: "white", black: "black" };
  const ROWS = 5;
  const COLS = 9;
  const DIRS = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  function nodeId(r, c) {
    return r + "," + c;
  }

  function parseNode(id) {
    const p = String(id).split(",");
    return { r: Number(p[0]), c: Number(p[1]) };
  }

  const NODES = [];
  const POSITIONS = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = nodeId(r, c);
      NODES.push(id);
      // viewBox 0..100 — kenar payı
      POSITIONS[id] = {
        x: 5.5 + (c * 89) / (COLS - 1),
        y: 5.5 + (r * 49) / (ROWS - 1),
      };
    }
  }

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  /** Klasik Fanorona: köşegen yalnızca (r+c) çift noktalarda. */
  function hasDiagonal(r, c) {
    return (r + c) % 2 === 0;
  }

  function isNeighbor(a, b) {
    const A = parseNode(a);
    const B = parseNode(b);
    const dr = B.r - A.r;
    const dc = B.c - A.c;
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (dr === 0 && dc === 0)) return false;
    if (dr !== 0 && dc !== 0 && !hasDiagonal(A.r, A.c)) return false;
    return true;
  }

  function neighborsOf(id) {
    const { r, c } = parseNode(id);
    const out = [];
    for (const [dr, dc] of DIRS) {
      if (dr !== 0 && dc !== 0 && !hasDiagonal(r, c)) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc)) out.push(nodeId(nr, nc));
    }
    return out;
  }

  const ADJACENT = {};
  for (const id of NODES) ADJACENT[id] = neighborsOf(id);

  const BOARD_EDGES = [];
  const edgeSeen = new Set();
  for (const a of NODES) {
    for (const b of ADJACENT[a]) {
      const key = a < b ? a + "|" + b : b + "|" + a;
      if (edgeSeen.has(key)) continue;
      edgeSeen.add(key);
      BOARD_EDGES.push([a, b]);
    }
  }

  function opponent(player) {
    return player === PLAYERS.white ? PLAYERS.black : PLAYERS.white;
  }

  function emptyBoard() {
    return Object.fromEntries(NODES.map((n) => [n, null]));
  }

  function initialBoard() {
    const board = emptyBoard();
    for (let c = 0; c < COLS; c++) {
      board[nodeId(0, c)] = PLAYERS.black;
      board[nodeId(1, c)] = PLAYERS.black;
      board[nodeId(3, c)] = PLAYERS.white;
      board[nodeId(4, c)] = PLAYERS.white;
    }
    // Orta sıra: B W B W · W B W B
    const mid = [PLAYERS.black, PLAYERS.white, PLAYERS.black, PLAYERS.white, null, PLAYERS.white, PLAYERS.black, PLAYERS.white, PLAYERS.black];
    for (let c = 0; c < COLS; c++) board[nodeId(2, c)] = mid[c];
    return board;
  }

  function countPieces(board, player) {
    let n = 0;
    for (const id of NODES) if (board[id] === player) n++;
    return n;
  }

  function dirBetween(from, to) {
    const A = parseNode(from);
    const B = parseNode(to);
    return { dr: B.r - A.r, dc: B.c - A.c };
  }

  function step(id, dr, dc) {
    const { r, c } = parseNode(id);
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) return null;
    return nodeId(nr, nc);
  }

  function lineCaptures(board, start, dr, dc, victim) {
    const captured = [];
    let cur = step(start, dr, dc);
    while (cur && board[cur] === victim) {
      captured.push(cur);
      cur = step(cur, dr, dc);
    }
    return captured;
  }

  function captureSetsForMove(board, from, to, player) {
    if (!isNeighbor(from, to) || board[to] !== null || board[from] !== player) {
      return { approach: [], withdrawal: [] };
    }
    const { dr, dc } = dirBetween(from, to);
    const victim = opponent(player);
    const approach = lineCaptures(board, to, dr, dc, victim);
    const withdrawal = lineCaptures(board, from, -dr, -dc, victim);
    return { approach, withdrawal };
  }

  function applyCaptures(board, captured) {
    const next = { ...board };
    for (const id of captured) next[id] = null;
    return next;
  }

  function movePiece(board, from, to) {
    const next = { ...board };
    next[to] = next[from];
    next[from] = null;
    return next;
  }

  function dirsEqual(a, b) {
    return a && b && a.dr === b.dr && a.dc === b.dc;
  }

  function dirsOpposite(a, b) {
    return a && b && a.dr === -b.dr && a.dc === -b.dc;
  }

  /**
   * Zincir kısıtları: aynı yöne tekrar gidemez, hemen geri dönemez,
   * bu turda ziyaret edilen noktaya (bitiş hariç) tekrar inemez.
   */
  function continuationOk(state, from, to) {
    if (!state.chain) return true;
    const dir = dirBetween(from, to);
    if (dirsEqual(dir, state.chain.lastDir)) return false;
    if (dirsOpposite(dir, state.chain.lastDir)) return false;
    if (state.chain.visited.includes(to)) return false;
    return true;
  }

  function enumerateCapturesFrom(state, player, from) {
    const board = state.board;
    if (board[from] !== player) return [];
    const moves = [];
    for (const to of ADJACENT[from]) {
      if (board[to] !== null) continue;
      if (state.chain && !continuationOk(state, from, to)) continue;
      const sets = captureSetsForMove(board, from, to, player);
      if (sets.approach.length) {
        moves.push({
          type: "capture",
          from,
          to,
          method: "approach",
          captured: sets.approach,
        });
      }
      if (sets.withdrawal.length) {
        // Aynı taş seti ise tek hamle yeter
        const same =
          sets.approach.length === sets.withdrawal.length &&
          sets.approach.every((id, i) => id === sets.withdrawal[i]);
        if (!same) {
          moves.push({
            type: "capture",
            from,
            to,
            method: "withdrawal",
            captured: sets.withdrawal,
          });
        }
      }
    }
    return moves;
  }

  function getAllCaptures(state, player) {
    if (state.chain && state.chain.piece) {
      return enumerateCapturesFrom(state, player, state.chain.piece);
    }
    const moves = [];
    for (const id of NODES) {
      if (state.board[id] !== player) continue;
      moves.push(...enumerateCapturesFrom(state, player, id));
    }
    return moves;
  }

  function getPaikaMoves(state, player) {
    const moves = [];
    for (const from of NODES) {
      if (state.board[from] !== player) continue;
      for (const to of ADJACENT[from]) {
        if (state.board[to] !== null) continue;
        moves.push({ type: "paika", from, to, method: null, captured: [] });
      }
    }
    return moves;
  }

  function getAllLegalMoves(state, player) {
    if (state.winner || player !== state.turn) return [];
    if (state.phase === "choose") {
      // UI seçimi — legal olanlar state.pendingChoices
      return (state.pendingChoices || []).slice();
    }
    const caps = getAllCaptures(state, player);
    if (caps.length) return caps;
    if (state.chain) return []; // zincirde alma kalmadı → tur biter (endTurn ile)
    return getPaikaMoves(state, player);
  }

  function hasLegalMove(state, player) {
    const probe = {
      ...state,
      turn: player,
      phase: "move",
      chain: null,
      pendingChoices: null,
      winner: null,
    };
    return getAllLegalMoves(probe, player).length > 0;
  }

  function checkWinner(state) {
    const w = countPieces(state.board, PLAYERS.white);
    const b = countPieces(state.board, PLAYERS.black);
    if (w === 0) return PLAYERS.black;
    if (b === 0) return PLAYERS.white;
    const cur = state.turn;
    if (!hasLegalMove(state, cur)) return opponent(cur);
    return null;
  }

  function createGameState(starter) {
    const start =
      starter === PLAYERS.black || starter === PLAYERS.white
        ? starter
        : PLAYERS.white;
    return {
      board: initialBoard(),
      turn: start,
      starter: start,
      phase: "move", // move | choose
      chain: null, // { piece, visited[], lastDir, capturesThisTurn }
      pendingChoices: null,
      winner: null,
      lastMove: null,
      moveCount: 0,
      capturedBy: { white: 0, black: 0 },
      chainsBy: { white: 0, black: 0 },
    };
  }

  function endTurn(state, player) {
    const next = {
      ...state,
      phase: "move",
      chain: null,
      pendingChoices: null,
      turn: opponent(player),
    };
    next.winner = checkWinner(next);
    return next;
  }

  function afterCapture(state, player, from, to, method, captured) {
    let board = movePiece(state.board, from, to);
    board = applyCaptures(board, captured);
    const capturedBy = {
      white: state.capturedBy.white,
      black: state.capturedBy.black,
    };
    capturedBy[player] = (capturedBy[player] || 0) + captured.length;

    const visited = state.chain
      ? state.chain.visited.concat([from])
      : [from];
    const dir = dirBetween(from, to);
    const capturesThisTurn =
      (state.chain ? state.chain.capturesThisTurn : 0) + captured.length;
    const chain = {
      piece: to,
      visited,
      lastDir: dir,
      capturesThisTurn,
      lastMethod: method,
    };

    const next = {
      ...state,
      board,
      capturedBy,
      chain,
      phase: "move",
      pendingChoices: null,
      lastMove: {
        type: "capture",
        from,
        to,
        player,
        method,
        captured: captured.slice(),
      },
      moveCount: state.moveCount + 1,
      winner: null,
    };

    // Daha fazla alma var mı?
    const more = enumerateCapturesFrom(next, player, to);
    if (more.length) {
      next.turn = player;
      // Zincir sayısı: ikinci almadan itibaren
      if (capturesThisTurn > captured.length) {
        /* already chaining */
      } else if (state.chain) {
        const chainsBy = { ...state.chainsBy };
        chainsBy[player] = (chainsBy[player] || 0) + 1;
        next.chainsBy = chainsBy;
      }
      return next;
    }

    // Zincir bitti
    if (state.chain || capturesThisTurn > captured.length) {
      const chainsBy = { ...next.chainsBy };
      // ilk capture sonrası devam yoksa zincir sayma
    }
    if (state.chain) {
      const chainsBy = { ...next.chainsBy };
      chainsBy[player] = (chainsBy[player] || 0) + 1;
      next.chainsBy = chainsBy;
    }
    return endTurn(next, player);
  }

  function tryAction(state, player, action) {
    if (!action || !action.type) return { ok: false, error: "Geçersiz hamle." };
    if (state.winner) return { ok: false, error: "Oyun bitti." };
    if (player !== state.turn) return { ok: false, error: "Sıra sizde değil." };

    if (action.type === "endChain") {
      if (!state.chain) return { ok: false, error: "Zincir yok." };
      return { ok: true, state: endTurn(state, player) };
    }

    if (action.type === "paika") {
      if (state.chain) return { ok: false, error: "Zincirde paika olmaz." };
      const caps = getAllCaptures(state, player);
      if (caps.length) return { ok: false, error: "Alma zorunlu." };
      if (state.board[action.from] !== player) return { ok: false, error: "Kendi taşın değil." };
      if (state.board[action.to] !== null) return { ok: false, error: "Hedef dolu." };
      if (!isNeighbor(action.from, action.to)) return { ok: false, error: "Komşu değil." };
      const board = movePiece(state.board, action.from, action.to);
      const next = {
        ...state,
        board,
        lastMove: { type: "paika", from: action.from, to: action.to, player },
        moveCount: state.moveCount + 1,
        chain: null,
        phase: "move",
        pendingChoices: null,
        winner: null,
      };
      return { ok: true, state: endTurn(next, player) };
    }

    if (action.type === "capture") {
      const legal = getAllCaptures(state, player).filter(
        (m) =>
          m.from === action.from &&
          m.to === action.to &&
          (!action.method || m.method === action.method)
      );
      if (!legal.length) return { ok: false, error: "Geçersiz alma." };

      // Aynı from→to için iki yöntem varsa seçim gerekir
      const sameDest = getAllCaptures(state, player).filter(
        (m) => m.from === action.from && m.to === action.to
      );
      if (sameDest.length > 1 && !action.method) {
        return {
          ok: true,
          state: {
            ...state,
            phase: "choose",
            pendingChoices: sameDest,
            lastMove: { type: "choose", from: action.from, to: action.to, player },
          },
        };
      }

      const pick =
        action.method
          ? legal.find((m) => m.method === action.method) || legal[0]
          : legal[0];
      return {
        ok: true,
        state: afterCapture(state, player, pick.from, pick.to, pick.method, pick.captured),
      };
    }

    // Kısa yol: type move → capture veya paika çözümle
    if (action.type === "move") {
      const caps = getAllCaptures(state, player).filter(
        (m) => m.from === action.from && m.to === action.to
      );
      if (caps.length) {
        return tryAction(state, player, {
          type: "capture",
          from: action.from,
          to: action.to,
          method: action.method || null,
        });
      }
      return tryAction(state, player, {
        type: "paika",
        from: action.from,
        to: action.to,
      });
    }

    return { ok: false, error: "Bilinmeyen hamle." };
  }

  /** Geriye uyumluluk */
  function tryMove(state, player, from, to) {
    return tryAction(state, player, { type: "move", from, to });
  }

  return {
    NODES,
    POSITIONS,
    ADJACENT,
    BOARD_EDGES,
    PLAYERS,
    ROWS,
    COLS,
    opponent,
    emptyBoard,
    initialBoard,
    countPieces,
    isNeighbor,
    neighborsOf,
    captureSetsForMove,
    getAllCaptures,
    getPaikaMoves,
    getAllLegalMoves,
    hasLegalMove,
    createGameState,
    tryAction,
    tryMove,
    checkWinner,
    endTurn,
    parseNode,
    nodeId,
  };
});
