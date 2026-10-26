const assert = require("assert");
const Boards = require("../public/boards.js");
const Engine = require("../public/engine.js");
const Ai = require("../public/ai.js");
const { PLAYERS, createGameState, applyMove, opponent } = Engine;

/** Bir bilgisayar-bilgisayar partisini sonuna kadar oynatır, hata fırlatmaz. */
function playFullAiGame(boardId, diffA, diffB) {
  const graph = Boards.getGraph(boardId);
  let state = createGameState(graph, PLAYERS.A);
  let guard = 0;
  const maxMoves = graph.totalEdges + 5;
  while (!state.winner && guard < maxMoves) {
    guard++;
    const diff = state.turn === PLAYERS.A ? diffA : diffB;
    const move = Ai.chooseMove(graph, state, state.turn, { difficulty: diff });
    assert.ok(move, `${boardId}: AI (${diff}) bir hamle bulamadı ama oyun bitmedi`);
    const r = applyMove(graph, state, move.edgeId, state.turn);
    assert.ok(r.ok, r.error);
    state = r.state;
  }
  assert.ok(state.winner, `${boardId}: oyun ${maxMoves} hamle içinde bitmedi`);
  assert.strictEqual(state.scores.A + state.scores.B, graph.totalBoxes);
  return state;
}

function testAllDifficultiesOnAllBoards() {
  const diffs = Ai.DIFFICULTY_LEVELS;
  for (const def of Boards.BOARD_DEFS) {
    for (const d of diffs) {
      playFullAiGame(def.id, d, "medium");
    }
  }
}

function testHarderDifficultyWinsMoreOftenOnAverage() {
  // İstatistiksel bir sağlık kontrolü: "çok zor", "kolay"a karşı pek çok
  // partide ortalamada daha iyi bir skor farkı elde etmeli. (Tek bir parti
  // şans eseri ters gidebilir — bu yüzden birden çok parti ortalanır.)
  const N = 12;
  let veryHardMarginTotal = 0;
  for (let i = 0; i < N; i++) {
    const starter = i % 2 === 0 ? PLAYERS.A : PLAYERS.B;
    const graph = Boards.getGraph("grid-8x8");
    let state = createGameState(graph, starter);
    let guard = 0;
    while (!state.winner && guard < graph.totalEdges + 5) {
      guard++;
      const diff = state.turn === PLAYERS.A ? "veryhard" : "easy";
      const move = Ai.chooseMove(graph, state, state.turn, { difficulty: diff });
      const r = applyMove(graph, state, move.edgeId, state.turn);
      state = r.state;
    }
    veryHardMarginTotal += state.scores.A - state.scores.B;
  }
  const avgMargin = veryHardMarginTotal / N;
  assert.ok(
    avgMargin > 0,
    `veryhard AI, easy AI'ya karşı ortalamada önde olmalı (ortalama fark: ${avgMargin})`
  );
}

testAllDifficultiesOnAllBoards();
testHarderDifficultyWinsMoreOftenOnAverage();
console.log("ai.test.js — tüm testler geçti");
