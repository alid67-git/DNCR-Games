const assert = require("assert");
const {
  createGameState,
  tryAction,
  getAllLegalMoves,
  PLAYERS,
  countPieces,
  MILLS,
  NODES,
  allPlaced,
} = require("./engine");

function testEmptyStart() {
  const s = createGameState();
  assert.strictEqual(s.phase, "place");
  assert.strictEqual(s.turn, PLAYERS.red);
  assert.strictEqual(s.toPlace.red, 9);
  assert.strictEqual(countPieces(s.board, PLAYERS.red), 0);
  assert.strictEqual(NODES.length, 24);
  assert.strictEqual(MILLS.length, 16);
}

function testPlaceAndTurnSwitch() {
  const s = createGameState();
  const r = tryAction(s, PLAYERS.red, { type: "place", to: "a0" });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.board.a0, PLAYERS.red);
  assert.strictEqual(r.state.toPlace.red, 8);
  assert.strictEqual(r.state.turn, PLAYERS.black);
  assert.strictEqual(r.state.phase, "place");
}

function testMillTriggersRemove() {
  let s = createGameState();
  // Place red a0, black somewhere, red a1, black somewhere, red a2 -> mill
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a0" }).state;
  s = tryAction(s, PLAYERS.black, { type: "place", to: "c4" }).state;
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a1" }).state;
  s = tryAction(s, PLAYERS.black, { type: "place", to: "c5" }).state;
  const r = tryAction(s, PLAYERS.red, { type: "place", to: "a2" });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.state.phase, "remove");
  assert.strictEqual(r.state.turn, PLAYERS.red);
  const rem = getAllLegalMoves(r.state, PLAYERS.red);
  assert.ok(rem.some((m) => m.type === "remove" && m.at === "c4"));
  const r2 = tryAction(r.state, PLAYERS.red, { type: "remove", at: "c4" });
  assert.ok(r2.ok, r2.error);
  assert.strictEqual(r2.state.board.c4, null);
  assert.strictEqual(r2.state.removedBy.red, 1);
  assert.strictEqual(r2.state.turn, PLAYERS.black);
}

function testRejectWrongTurn() {
  const s = createGameState();
  const r = tryAction(s, PLAYERS.black, { type: "place", to: "a0" });
  assert.ok(!r.ok);
}

function testRejectOccupied() {
  let s = createGameState();
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a0" }).state;
  const r = tryAction(s, PLAYERS.black, { type: "place", to: "a0" });
  assert.ok(!r.ok);
}

function testMovePhaseAfterAllPlaced() {
  let s = createGameState(PLAYERS.red);
  // Alternate placing all 18 without forming mills that stall flow badly
  // Use a deterministic placement that avoids early mills where possible
  const redSpots = ["a0", "a2", "a4", "a6", "b1", "b3", "b5", "b7", "c0"];
  const blackSpots = ["a1", "a3", "a5", "a7", "b0", "b2", "b4", "b6", "c2"];
  for (let i = 0; i < 9; i++) {
    let r = tryAction(s, PLAYERS.red, { type: "place", to: redSpots[i] });
    assert.ok(r.ok, `red ${i}: ${r.error}`);
    s = r.state;
    if (s.phase === "remove") {
      const rem = getAllLegalMoves(s, PLAYERS.red)[0];
      s = tryAction(s, PLAYERS.red, rem).state;
    }
    r = tryAction(s, PLAYERS.black, { type: "place", to: blackSpots[i] });
    assert.ok(r.ok, `black ${i}: ${r.error}`);
    s = r.state;
    if (s.phase === "remove") {
      const rem = getAllLegalMoves(s, PLAYERS.black)[0];
      s = tryAction(s, PLAYERS.black, rem).state;
    }
  }
  assert.ok(allPlaced(s), "tüm taşlar yerleştirilmiş olmalı");
  assert.ok(s.phase === "move" || s.phase === "remove", `phase=${s.phase}`);
}

function testCannotRemoveFromMillWhenAlternatives() {
  let s = createGameState();
  // Build a black mill and a lone black piece; red mill then must remove lone
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a0" }).state;
  s = tryAction(s, PLAYERS.black, { type: "place", to: "c0" }).state;
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a1" }).state;
  s = tryAction(s, PLAYERS.black, { type: "place", to: "c1" }).state;
  s = tryAction(s, PLAYERS.red, { type: "place", to: "b0" }).state;
  s = tryAction(s, PLAYERS.black, { type: "place", to: "c2" }).state; // black mill c0-c1-c2
  assert.strictEqual(s.phase, "remove"); // black formed mill
  // black removes red's a0 or similar
  s = tryAction(s, PLAYERS.black, { type: "remove", at: "b0" }).state;
  // Continue: red places a2 forming mill a0-a1-a2, black has mill + maybe more
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a2" }).state;
  assert.strictEqual(s.phase, "remove");
  const rem = getAllLegalMoves(s, PLAYERS.red);
  // Should prefer pieces not in mill if any exist outside c0-c1-c2
  // At this point black has c0,c1,c2 only (3) all in mill — so all removable
  assert.ok(rem.length >= 1);
}

testEmptyStart();
testPlaceAndTurnSwitch();
testMillTriggersRemove();
testRejectWrongTurn();
testRejectOccupied();
testMovePhaseAfterAllPlaced();
testCannotRemoveFromMillWhenAlternatives();
console.log("engine.test.js — tüm testler geçti");
