const assert = require("assert");
const Boards = require("../public/boards.js");
const Engine = require("../public/engine.js");
const { PLAYERS, createGameState, applyMove, opponent } = Engine;

/** Tek kutuluk mini tahta: hızlı/kesin testler için. */
function oneBoxGraph() {
  return Boards.buildGraphFromMask([[1]]);
}

/** 1x2 iki kutuluk zincir tahtası (yan yana). */
function twoBoxChainGraph() {
  return Boards.buildGraphFromMask([[1, 1]]);
}

function testSingleBoxCompletion() {
  const graph = oneBoxGraph();
  let state = createGameState(graph, PLAYERS.A);
  assert.strictEqual(state.totalBoxes, 1);
  assert.strictEqual(state.totalEdges, 4);

  const edges = graph.edgeIds;
  // İlk 3 kenar kimseye kutu kazandırmaz, sıra el değiştirir.
  let r = applyMove(graph, state, edges[0], PLAYERS.A);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.turn, PLAYERS.B, "kutu tamamlanmazsa sıra geçer");
  state = r.state;

  r = applyMove(graph, state, edges[1], PLAYERS.B);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.turn, PLAYERS.A);
  state = r.state;

  r = applyMove(graph, state, edges[2], PLAYERS.A);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.turn, PLAYERS.B);
  state = r.state;

  // 4. (son) kenar kutuyu tamamlar -> aynı oyuncu devam eder (ama oyun bitti).
  r = applyMove(graph, state, edges[3], PLAYERS.B);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.boxOwner[0], PLAYERS.B);
  assert.strictEqual(r.state.scores.B, 1);
  assert.strictEqual(r.state.scores.A, 0);
  assert.ok(r.state.winner, "tüm kenarlar çizildi, oyun bitmeli");
  assert.strictEqual(r.state.winner, PLAYERS.B);
}

function testExtraTurnOnCapture() {
  const graph = twoBoxChainGraph();
  let state = createGameState(graph, PLAYERS.A);
  // Kutu 0: top,bottom,left,right (left box); kutu1 sağdaki kutu, ortak kenarı paylaşır.
  const box0 = graph.boxes[0];
  const box1 = graph.boxes[1];
  const shared = box0.edges.find((e) => box1.edges.includes(e));
  assert.ok(shared, "iki kutu ortak bir kenarı paylaşmalı");

  // box0'ı 3 kenara kadar doldur (shared hariç), sonra shared'i çizerek
  // HEM box0'ı tamamla HEM box1'i 3 kenarlı yap.
  const others = box0.edges.filter((e) => e !== shared);
  let cur = state;
  for (let i = 0; i < others.length; i++) {
    const player = cur.turn;
    const r = applyMove(graph, cur, others[i], player);
    assert.ok(r.ok, r.error);
    cur = r.state;
  }
  assert.strictEqual(cur.boxOwner[0], null, "box0 henüz tamamlanmadı");

  const playerBefore = cur.turn;
  const r = applyMove(graph, cur, shared, playerBefore);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.boxOwner[0], playerBefore, "shared kenar box0'ı tamamlamalı");
  assert.strictEqual(r.state.turn, playerBefore, "kutu kazanınca sıra aynı oyuncuda kalmalı");
}

function testRejectWrongTurnAndRedraw() {
  const graph = oneBoxGraph();
  const state = createGameState(graph, PLAYERS.A);
  const bad = applyMove(graph, state, graph.edgeIds[0], PLAYERS.B);
  assert.ok(!bad.ok, "sırası olmayan oyuncu oynayamamalı");

  const r1 = applyMove(graph, state, graph.edgeIds[0], PLAYERS.A);
  assert.ok(r1.ok);
  const r2 = applyMove(graph, r1.state, graph.edgeIds[0], PLAYERS.B);
  assert.ok(!r2.ok, "aynı kenar iki kez çizilemez");
}

function testFullRandomGameEndsConsistently() {
  for (const def of Boards.BOARD_DEFS.slice(0, 3)) {
    const graph = Boards.getGraph(def.id);
    let state = createGameState(graph, PLAYERS.A);
    let guard = 0;
    while (!state.winner && guard < graph.totalEdges + 5) {
      guard++;
      const undrawn = Engine.getUndrawnEdges(graph, state.edgeDrawnBy);
      assert.ok(undrawn.length > 0, "kenar bitmeden oyun bitmemeli");
      const edge = undrawn[(Math.random() * undrawn.length) | 0];
      const r = applyMove(graph, state, edge, state.turn);
      assert.ok(r.ok, r.error);
      state = r.state;
    }
    assert.ok(state.winner, `${def.id}: oyun bir kazananla bitmeli`);
    assert.strictEqual(
      state.scores.A + state.scores.B,
      graph.totalBoxes,
      "tüm kutular birine ait olmalı"
    );
    if (state.scores.A === state.scores.B) assert.strictEqual(state.winner, "draw");
    else
      assert.strictEqual(
        state.winner,
        state.scores.A > state.scores.B ? PLAYERS.A : PLAYERS.B
      );
  }
}

function testSafeAndCompletingEdgeHelpers() {
  const graph = twoBoxChainGraph();
  const state = createGameState(graph, PLAYERS.A);
  const safe = Engine.getSafeEdges(graph, state.edgeDrawnBy);
  // Başlangıçta hiçbir kenar kutuyu 3 kenarlı yapmaz (her kutu en fazla 1 kenar paylaşıyor başta 0).
  assert.strictEqual(safe.length, graph.edgeIds.length);
  const completing = Engine.getCompletingEdges(graph, state.edgeDrawnBy);
  assert.strictEqual(completing.length, 0);
}

/**
 * N kutuluk düz bir zinciri, son kutudaki "dead-end" kenarı hariç tüm
 * hamlelerini önceden oynanmış hâle getirir; geriye sadece zinciri
 * başlatacak tek bir "shared[0]" kenarı kalır. Böylece gerçek bir kademeli
 * yakalama zincirini test edebiliriz.
 */
function setupPrimedChain(mask, chainBoxCoords) {
  const graph = Boards.buildGraphFromMask(mask);
  const boxes = chainBoxCoords.map(([r, c]) => graph.boxes.find((b) => b.r === r && b.c === c));
  const shared = [];
  for (let i = 0; i < boxes.length - 1; i++) {
    shared.push(boxes[i].edges.find((e) => boxes[i + 1].edges.includes(e)));
  }
  const last = boxes[boxes.length - 1];
  const lastOthers = last.edges.filter((e) => e !== shared[shared.length - 1]);
  const deadEnd = lastOthers[lastOthers.length - 1];

  let state = createGameState(graph, PLAYERS.A);
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const sharedToPrev = i > 0 ? shared[i - 1] : null;
    const sharedToNext = i < boxes.length - 1 ? shared[i] : null;
    const skip = new Set([sharedToPrev, sharedToNext, i === boxes.length - 1 ? deadEnd : null]);
    for (const e of box.edges) {
      if (skip.has(e)) continue;
      const r = applyMove(graph, state, e, state.turn);
      assert.ok(r.ok, r.error);
      state = r.state;
    }
  }
  return { graph, state, startEdge: shared[0], deadEnd };
}

function testSimulateForcedChainFollowsNeighborOnly() {
  const { graph, state, startEdge } = setupPrimedChain(
    [[1, 1, 1, 1]],
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]
  );
  const chain = Engine.simulateForcedChain(graph, state, startEdge, state.turn);
  assert.strictEqual(chain.totalBoxes, 4, "zincir tüm 4 kutuyu da almalı");
  assert.ok(chain.boxesPerEdge.every((n) => n === 1), "düz zincirde her kenar 1 kutu tamamlamalı");
}

function testDoubleCrossLeavesLastTwo() {
  const Ai = require("../public/ai.js");
  // 1x4 zincir + ayrı bir izole kutu — kontrolü korumanın anlamlı olması
  // için tahtanın bitmemesi gerekir.
  const { graph, state, startEdge } = setupPrimedChain(
    [
      [1, 1, 1, 1],
      [0, 0, 0, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ]
  );
  const player = state.turn;
  const move = Ai.chooseMove(graph, state, player, { difficulty: "hard" });
  assert.ok(move, "AI bir hamle seçmeli");
  // Zincirde henüz 4 kutu var (son 2'ye gelinmedi) — normal ilerlemeli.
  assert.strictEqual(move.edgeId, startEdge);
}

testSingleBoxCompletion();
testExtraTurnOnCapture();
testRejectWrongTurnAndRedraw();
testFullRandomGameEndsConsistently();
function testDoubleCrossActuallyLeavesDomino() {
  const Ai = require("../public/ai.js");
  // box0-box1 bitişik (domino olacak); col2 boş; box3 tamamen ayrı/izole —
  // "oyunda hâlâ oynanacak yer var" koşulunu sağlamak için.
  const graph = Boards.buildGraphFromMask([[1, 1, 0, 1]]);
  const box0 = graph.boxes.find((b) => b.r === 0 && b.c === 0);
  const box1 = graph.boxes.find((b) => b.r === 0 && b.c === 1);
  const shared = box0.edges.find((e) => box1.edges.includes(e));

  let cur = createGameState(graph, PLAYERS.A);
  // box0'ı shared hariç tamamen doldur (3 kenar) -> box0 serbest kalır.
  for (const e of box0.edges.filter((x) => x !== shared)) {
    const r = applyMove(graph, cur, e, cur.turn);
    assert.ok(r.ok, r.error);
    cur = r.state;
  }
  // box1'in shared dışındaki 3 kenarından 2 tanesini doldur (domino: box1'de
  // tam 2 açık kenar kalsın: shared + bir "dead-end").
  const box1Others = box1.edges.filter((x) => x !== shared);
  const deadEnd = box1Others[2];
  for (const e of [box1Others[0], box1Others[1]]) {
    const r = applyMove(graph, cur, e, cur.turn);
    assert.ok(r.ok, r.error);
    cur = r.state;
  }

  assert.strictEqual(Engine.boxDrawnCount(graph, cur.edgeDrawnBy, box0.index), 3);
  assert.strictEqual(Engine.boxDrawnCount(graph, cur.edgeDrawnBy, box1.index), 2);

  const player = cur.turn;
  const move = Ai.chooseMove(graph, cur, player, { difficulty: "hard" });
  assert.ok(move, "hamle dönmeli");
  assert.strictEqual(
    move.edgeId,
    deadEnd,
    "hard AI, son 2 kutuluk zincirde shared kenarı değil dead-end'i oynayarak double-cross yapmalı"
  );

  // Bu hamle hiçbir kutu tamamlamamalı (double-cross skorsuz bir hamledir).
  const r = applyMove(graph, cur, move.edgeId, player);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.lastMove.boxesCompleted.length, 0);
  assert.strictEqual(r.state.turn, opponent(player), "double-cross sırayı rakibe devretmeli");
}

testSafeAndCompletingEdgeHelpers();
testSimulateForcedChainFollowsNeighborOnly();
testDoubleCrossLeavesLastTwo();
testDoubleCrossActuallyLeavesDomino();
console.log("engine.test.js — tüm testler geçti");
