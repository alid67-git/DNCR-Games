const assert = require("assert");
const {
  createGameState,
  tryMove,
  getAllLegalMoves,
  PLAYERS,
  initialBoard,
} = require("./board");

function testInitialForcedCapturePath() {
  const state = createGameState();
  // Domates başlar; merkez boş. İlk hamle merkeze komşu bir taştan C'ye.
  const moves = getAllLegalMoves(state.board, PLAYERS.tomato);
  assert.ok(moves.length > 0, "açılışta hamle olmalı");
  assert.ok(
    moves.every((m) => !m.capture),
    "açılışta henüz yakalama yok"
  );
  assert.ok(
    moves.some((m) => m.to === "C"),
    "merkeze girilebilmeli"
  );

  // LI -> C
  const r1 = tryMove(state, PLAYERS.tomato, "LI", "C");
  assert.ok(r1.ok, r1.error);
  assert.strictEqual(r1.state.board.C, PLAYERS.tomato);
  assert.strictEqual(r1.state.board.LI, null);
  assert.strictEqual(r1.state.turn, PLAYERS.gourd);

  // Acur: merkezdeki domatesi yakalayabilir mi? RI üzerinden C'ye zıplamak için
  // C dolu (tomato), FR-RI-C çizgisinde RI acur, C tomato, FL tarafı...
  // Yakala: RI jumps over C to LI (LI boş)
  const caps = getAllLegalMoves(r1.state.board, PLAYERS.gourd);
  assert.ok(
    caps.some((m) => m.capture && m.from === "RI" && m.over === "C" && m.to === "LI"),
    "acur merkezdeki domatesi yiyebilmeli"
  );

  const r2 = tryMove(r1.state, PLAYERS.gourd, "RI", "LI");
  assert.ok(r2.ok, r2.error);
  assert.strictEqual(r2.state.board.C, null);
  assert.strictEqual(r2.state.board.LI, PLAYERS.gourd);
  assert.strictEqual(r2.state.board.RI, null);
}

function testRejectWrongTurn() {
  const state = createGameState();
  const r = tryMove(state, PLAYERS.gourd, "RI", "C");
  assert.ok(!r.ok);
}

function testRejectIllegal() {
  const state = createGameState();
  const r = tryMove(state, PLAYERS.tomato, "FL", "FR");
  assert.ok(!r.ok);
}

function testPieceCounts() {
  const b = initialBoard();
  const t = Object.values(b).filter((x) => x === PLAYERS.tomato).length;
  const g = Object.values(b).filter((x) => x === PLAYERS.gourd).length;
  assert.strictEqual(t, 5);
  assert.strictEqual(g, 5);
  assert.strictEqual(b.C, null);
}

testPieceCounts();
testInitialForcedCapturePath();
testRejectWrongTurn();
testRejectIllegal();
console.log("board.test.js — tüm testler geçti");
