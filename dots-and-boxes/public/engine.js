/**
 * Noktalar ve Kutular — oyun motoru (kurallar, hamleler, skor).
 * Hem tarayıcıda (window.DotsEngine) hem Node'da (require) çalışır.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./boards.js"));
  } else {
    root.DotsEngine = factory(root.DotsBoards);
  }
})(typeof window !== "undefined" ? window : globalThis, function (Boards) {
  "use strict";

  const PLAYERS = { A: "A", B: "B" };

  function opponent(p) {
    return p === PLAYERS.A ? PLAYERS.B : PLAYERS.A;
  }

  /**
   * boardId bir string ise kayıtlı board grafiğini döndürür; zaten bir
   * grafik nesnesiyse (ör. testlerde özel mask) olduğu gibi kullanır.
   */
  function resolveGraph(boardIdOrGraph) {
    if (boardIdOrGraph && typeof boardIdOrGraph === "object" && boardIdOrGraph.edges) {
      return boardIdOrGraph;
    }
    return Boards.getGraph(boardIdOrGraph);
  }

  /** Taze bir oyun durumu oluşturur. */
  function createGameState(boardId, starter) {
    const graph = resolveGraph(boardId);
    const boxOwner = new Array(graph.boxes.length).fill(null);
    const edgeDrawnBy = {}; // edgeId -> player | undefined
    return {
      boardId,
      turn: starter === PLAYERS.B ? PLAYERS.B : PLAYERS.A,
      starter: starter === PLAYERS.B ? PLAYERS.B : PLAYERS.A,
      edgeDrawnBy,
      boxOwner,
      scores: { A: 0, B: 0 },
      totalBoxes: graph.boxes.length,
      edgesDrawn: 0,
      totalEdges: graph.edgeIds.length,
      winner: null, // null | 'A' | 'B' | 'draw'
      lastMove: null, // {edgeId, boxesCompleted:[idx,...], player}
      moveCount: 0,
    };
  }

  function cloneState(state) {
    return {
      ...state,
      edgeDrawnBy: { ...state.edgeDrawnBy },
      boxOwner: state.boxOwner.slice(),
      scores: { ...state.scores },
    };
  }

  function boxDrawnCount(graph, edgeDrawnBy, boxIndex) {
    const box = graph.boxes[boxIndex];
    let n = 0;
    for (const eid of box.edges) if (edgeDrawnBy[eid]) n++;
    return n;
  }

  /** Bu kenarı çizmek kaç kutuyu TAMAMLAR (0, 1 ya da 2). */
  function wouldCompleteCount(graph, edgeDrawnBy, edgeId) {
    if (edgeDrawnBy[edgeId]) return 0;
    const boxIdxs = graph.edgeToBoxes.get(edgeId) || [];
    let n = 0;
    for (const bi of boxIdxs) {
      if (boxDrawnCount(graph, edgeDrawnBy, bi) === 3) n++;
    }
    return n;
  }

  /**
   * Güvenli hamle mi? Yani bu kenarı çizmek, tamamlanmayan hiçbir kutuyu
   * 3 kenarlı (rakibe açık) hâle getirmiyor mu?
   */
  function isSafeEdge(graph, edgeDrawnBy, edgeId) {
    if (edgeDrawnBy[edgeId]) return false;
    const boxIdxs = graph.edgeToBoxes.get(edgeId) || [];
    for (const bi of boxIdxs) {
      const before = boxDrawnCount(graph, edgeDrawnBy, bi);
      const after = before + 1;
      if (after === 3) return false;
    }
    return true;
  }

  function getUndrawnEdges(graph, edgeDrawnBy) {
    const out = [];
    for (const id of graph.edgeIds) if (!edgeDrawnBy[id]) out.push(id);
    return out;
  }

  function getSafeEdges(graph, edgeDrawnBy) {
    return getUndrawnEdges(graph, edgeDrawnBy).filter((id) =>
      isSafeEdge(graph, edgeDrawnBy, id)
    );
  }

  function getCompletingEdges(graph, edgeDrawnBy) {
    return getUndrawnEdges(graph, edgeDrawnBy).filter(
      (id) => wouldCompleteCount(graph, edgeDrawnBy, id) > 0
    );
  }

  /**
   * Bir kenar çizer; kutuyu/kutuları tamamlayıp tamamlamadığını işler.
   * Ekstra tur kuralı: en az bir kutu tamamlandıysa sıra AYNI oyuncuda kalır.
   */
  function applyMove(boardId, state, edgeId, player) {
    const graph = resolveGraph(boardId || state.boardId);
    if (state.winner) return { ok: false, error: "Oyun bitti." };
    if (player !== state.turn) return { ok: false, error: "Sıra sende değil." };
    if (state.edgeDrawnBy[edgeId]) return { ok: false, error: "Bu çizgi zaten çizili." };
    if (!graph.edges.has(edgeId)) return { ok: false, error: "Geçersiz kenar." };

    const next = cloneState(state);
    next.edgeDrawnBy[edgeId] = player;
    next.edgesDrawn += 1;
    next.moveCount += 1;

    const boxIdxs = graph.edgeToBoxes.get(edgeId) || [];
    const completed = [];
    for (const bi of boxIdxs) {
      if (next.boxOwner[bi] != null) continue;
      if (boxDrawnCount(graph, next.edgeDrawnBy, bi) === 4) {
        next.boxOwner[bi] = player;
        next.scores[player] += 1;
        completed.push(bi);
      }
    }

    next.lastMove = { edgeId, boxesCompleted: completed, player };

    if (next.edgesDrawn >= next.totalEdges) {
      const a = next.scores.A;
      const b = next.scores.B;
      next.winner = a === b ? "draw" : a > b ? PLAYERS.A : PLAYERS.B;
      next.turn = opponent(player);
    } else {
      next.turn = completed.length > 0 ? player : opponent(player);
    }

    return { ok: true, state: next };
  }

  /**
   * Bir kenarla başlayan zorunlu yakalama zincirini, SADECE az önce
   * tamamlanan kutuya komşu olan serbest kutuyu izleyerek simüle eder
   * (gerçek "zincir" kavramı — alakasız, tahtanın başka yerindeki serbest
   * kutuları karıştırmaz). AI'nin zincir uzunluğunu ölçmesi ve
   * "double-cross" (son ikiliyi rakibe bırakma) kararı vermesi için
   * kullanılır. Oyun durumunu DEĞİŞTİRMEZ — sadece bir öngörü döndürür.
   *
   * @returns {{ edges: string[], boxesPerEdge: number[], totalBoxes: number,
   *             endState: object }}
   */
  function simulateForcedChain(boardId, state, startEdge, player) {
    const graph = resolveGraph(boardId || state.boardId);
    let cur = cloneState(state);
    const edges = [];
    const boxesPerEdge = [];
    let totalBoxes = 0;

    let edgeToPlay = startEdge;
    while (edgeToPlay) {
      const r = applyMove(graph, cur, edgeToPlay, player);
      if (!r.ok) break;
      const newlyCompleted = r.state.lastMove.boxesCompleted;
      cur = r.state;
      edges.push(edgeToPlay);
      boxesPerEdge.push(newlyCompleted.length);
      totalBoxes += newlyCompleted.length;
      if (newlyCompleted.length === 0) break;

      // Zincirin doğal devamı: az önce kapanan kutuya komşu olup, onun
      // yüzünden şimdi serbest kalan (3 kenarlı) bir kutu var mı?
      let next = null;
      for (const bi of newlyCompleted) {
        const box = graph.boxes[bi];
        for (const eid of box.edges) {
          const neighbors = graph.edgeToBoxes.get(eid) || [];
          for (const nb of neighbors) {
            if (nb === bi) continue;
            if (cur.boxOwner[nb] != null) continue;
            if (boxDrawnCount(graph, cur.edgeDrawnBy, nb) === 3) {
              const openEdge = graph.boxes[nb].edges.find((x) => !cur.edgeDrawnBy[x]);
              if (openEdge) {
                next = openEdge;
                break;
              }
            }
          }
          if (next) break;
        }
        if (next) break;
      }
      edgeToPlay = next;
    }

    return { edges, boxesPerEdge, totalBoxes, endState: cur };
  }

  /**
   * Bir kenarı oynarsak rakibin açgözlü biçimde alabileceği toplam kutu
   * sayısını tahmin eder (en küçük kurban seçimi için kullanılır).
   */
  function estimateSacrifice(boardId, state, edgeId, player) {
    const graph = resolveGraph(boardId || state.boardId);
    const opp = opponent(player);
    const r1 = applyMove(graph, state, edgeId, player);
    if (!r1.ok) return Infinity;
    // Eğer bu hamle zaten bir kutu tamamlıyorsa bu bir kurban değildir.
    if (r1.state.lastMove.boxesCompleted.length > 0) return 0;
    const completing = getCompletingEdges(graph, r1.state.edgeDrawnBy);
    if (!completing.length) return 0;
    const chain = simulateForcedChain(graph, r1.state, completing[0], opp);
    return chain.totalBoxes;
  }

  function isGameOver(state) {
    return !!state.winner;
  }

  function boxesRemaining(graph, edgeDrawnBy) {
    let n = 0;
    for (let i = 0; i < graph.boxes.length; i++) {
      if (boxDrawnCount(graph, edgeDrawnBy, i) < 4) n++;
    }
    return n;
  }

  return {
    PLAYERS,
    opponent,
    resolveGraph,
    createGameState,
    cloneState,
    applyMove,
    wouldCompleteCount,
    isSafeEdge,
    getUndrawnEdges,
    getSafeEdges,
    getCompletingEdges,
    simulateForcedChain,
    estimateSacrifice,
    isGameOver,
    boxDrawnCount,
    boxesRemaining,
  };
});
