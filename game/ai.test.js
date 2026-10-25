const assert = require("assert");
const { createGameState, tryMove, PLAYERS } = require("./board");
const { chooseMove } = require("./ai");

function testAiOpensWithLegalMove() {
  const state = createGameState();
  // İnsan ilk hamlesini yapar
  const r = tryMove(state, PLAYERS.tomato, "LI", "C");
  assert.ok(r.ok);
  const pick = chooseMove(r.state, PLAYERS.gourd, 2);
  assert.ok(pick, "AI hamle seçmeli");
  const applied = tryMove(r.state, PLAYERS.gourd, pick.from, pick.to);
  assert.ok(applied.ok, applied.error);
}

function testAiMustCapture() {
  const state = createGameState();
  const r1 = tryMove(state, PLAYERS.tomato, "LI", "C");
  assert.ok(r1.ok);
  // Merkezde domates var; AI yakalamalı (RI -> LI)
  const pick = chooseMove(r1.state, PLAYERS.gourd, 2);
  assert.ok(pick);
  assert.strictEqual(pick.from, "RI");
  assert.strictEqual(pick.to, "LI");
}

testAiOpensWithLegalMove();
testAiMustCapture();
console.log("ai.test.js — tüm testler geçti");
