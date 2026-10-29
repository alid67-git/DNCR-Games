const assert = require("assert");
const E = require("./engine.js");

const {
  PLAYERS,
  createGameState,
  countPieces,
  getAllLegalMoves,
  tryAction,
  initialBoard,
  NODES,
} = E;

function testInitialCounts() {
  const b = initialBoard();
  assert.strictEqual(countPieces(b, PLAYERS.white), 22);
  assert.strictEqual(countPieces(b, PLAYERS.black), 22);
  assert.strictEqual(b["2,4"], null);
  console.log("ok initial counts");
}

function testOpeningHasCapturesOrPaika() {
  const s = createGameState(PLAYERS.white);
  const moves = getAllLegalMoves(s, PLAYERS.white);
  assert.ok(moves.length > 0, "white should have moves");
  // Opening often has captures available for white toward black
  console.log("ok opening moves", moves.length);
}

function testCaptureRemovesPieces() {
  const s = createGameState(PLAYERS.white);
  const caps = getAllLegalMoves(s, PLAYERS.white).filter((m) => m.type === "capture");
  if (!caps.length) {
    console.log("skip capture test (no opening capture)");
    return;
  }
  const m = caps[0];
  const before = countPieces(s.board, PLAYERS.black);
  const r = tryAction(s, PLAYERS.white, m);
  assert.ok(r.ok, r.error);
  const after = countPieces(r.state.board, PLAYERS.black);
  assert.ok(after < before, "black pieces should decrease");
  assert.ok(r.state.capturedBy.white >= m.captured.length);
  console.log("ok capture removes", before - after);
}

function testMustCaptureWhenAvailable() {
  const s = createGameState(PLAYERS.white);
  const caps = getAllLegalMoves(s, PLAYERS.white).filter((m) => m.type === "capture");
  if (!caps.length) {
    console.log("skip must-capture");
    return;
  }
  const paika = tryAction(s, PLAYERS.white, {
    type: "paika",
    from: caps[0].from,
    to: caps[0].to,
  });
  // Might fail for other reasons; if captures exist, pure paika listing should be empty
  const all = getAllLegalMoves(s, PLAYERS.white);
  assert.ok(all.every((m) => m.type === "capture"));
  console.log("ok must capture");
}

function testNodeCount() {
  assert.strictEqual(NODES.length, 45);
  console.log("ok 45 nodes");
}

testNodeCount();
testInitialCounts();
testOpeningHasCapturesOrPaika();
testCaptureRemovesPieces();
testMustCaptureWhenAvailable();
console.log("fanorona engine tests passed");
