const assert = require("assert");
const E = require("./engine.js");

function testInitial() {
  const s = E.createGameState();
  assert.strictEqual(E.countPieces(s.board, E.PLAYERS.white), 16);
  assert.strictEqual(E.countPieces(s.board, E.PLAYERS.black), 16);
  assert.strictEqual(s.turn, E.PLAYERS.white);
  const moves = E.getAllLegalMoves(s, E.PLAYERS.white);
  assert.ok(moves.length > 0, "white has quiet moves");
  assert.ok(moves.every((m) => !m.captured.length), "opening has no captures");
}

function testManForwardAndSide() {
  const s = E.createGameState();
  // Clear clutter: keep one white man at 5,3 with space
  for (const id of E.SQUARES) s.board[id] = null;
  s.board["5,3"] = E.piece(E.PLAYERS.white, false);
  s.board["0,0"] = E.piece(E.PLAYERS.black, false); // keep black alive
  s.turn = E.PLAYERS.white;
  const moves = E.getAllLegalMoves(s, E.PLAYERS.white);
  const tos = moves.map((m) => m.to).sort();
  assert.deepStrictEqual(tos, ["4,3", "5,2", "5,4"].sort());
}

function testMandatoryMaxCapture() {
  const s = E.createGameState();
  for (const id of E.SQUARES) s.board[id] = null;
  // White at 4,2 can capture one or (better) two
  s.board["4,2"] = E.piece(E.PLAYERS.white, false);
  s.board["4,3"] = E.piece(E.PLAYERS.black, false);
  s.board["4,5"] = E.piece(E.PLAYERS.black, false);
  // Single capture path: jump 4,3 → 4,4 then 4,5 → 4,6
  s.turn = E.PLAYERS.white;
  const moves = E.getAllLegalMoves(s, E.PLAYERS.white);
  assert.ok(moves.length >= 1);
  assert.ok(moves.every((m) => m.captured.length === 2), "must take max=2");
  const r = E.tryAction(s, E.PLAYERS.white, moves[0]);
  assert.ok(r.ok);
  assert.strictEqual(E.countPieces(r.state.board, E.PLAYERS.black), 0);
  assert.strictEqual(r.state.winner, E.PLAYERS.white);
}

function testKingLongCapture() {
  const s = E.createGameState();
  for (const id of E.SQUARES) s.board[id] = null;
  s.board["7,0"] = E.piece(E.PLAYERS.white, true);
  s.board["7,3"] = E.piece(E.PLAYERS.black, false);
  s.turn = E.PLAYERS.white;
  const moves = E.getAllLegalMoves(s, E.PLAYERS.white);
  assert.ok(moves.some((m) => m.to === "7,4" || m.to === "7,5" || m.to === "7,6" || m.to === "7,7"));
  assert.ok(moves.every((m) => m.captured.includes("7,3")));
}

function testPromotion() {
  const s = E.createGameState();
  for (const id of E.SQUARES) s.board[id] = null;
  s.board["1,3"] = E.piece(E.PLAYERS.white, false);
  s.board["7,7"] = E.piece(E.PLAYERS.black, false);
  s.turn = E.PLAYERS.white;
  const moves = E.getAllLegalMoves(s, E.PLAYERS.white);
  const promo = moves.find((m) => m.to === "0,3");
  assert.ok(promo);
  assert.ok(promo.becomesKing);
  const r = E.tryAction(s, E.PLAYERS.white, promo);
  assert.ok(r.ok);
  assert.ok(r.state.board["0,3"].king);
}

function testIllegalReject() {
  const s = E.createGameState();
  const r = E.tryAction(s, E.PLAYERS.white, {
    type: "move",
    from: "7,0",
    to: "5,0",
    path: ["7,0", "5,0"],
    captured: [],
  });
  assert.ok(!r.ok);
}

testInitial();
testManForwardAndSide();
testMandatoryMaxCapture();
testKingLongCapture();
testPromotion();
testIllegalReject();
console.log("dama engine tests ok");
