const assert = require("assert");
const { createGameState, tryMove, PLAYERS, getAllLegalMoves } = require("./board");
const { chooseMove } = require("./ai");
const { DIFFICULTY } = require("../public/engine.js");

function testAiOpensWithLegalMove() {
  const state = createGameState();
  const r = tryMove(state, PLAYERS.tomato, "LI", "C");
  assert.ok(r.ok);
  const pick = chooseMove(r.state, PLAYERS.gourd, { difficulty: "normal" });
  assert.ok(pick, "AI hamle seçmeli");
  const applied = tryMove(r.state, PLAYERS.gourd, pick.from, pick.to);
  assert.ok(applied.ok, applied.error);
}

function testAiMustCapture() {
  const state = createGameState();
  const r1 = tryMove(state, PLAYERS.tomato, "LI", "C");
  assert.ok(r1.ok);
  // Merkezde kırmızı var; AI yakalamalı (RI -> LI) — tek zorunlu yeme
  const pick = chooseMove(r1.state, PLAYERS.gourd, { difficulty: "hard" });
  assert.ok(pick);
  assert.strictEqual(pick.from, "RI");
  assert.strictEqual(pick.to, "LI");
}

function testDifficultyPresetsExist() {
  assert.ok(DIFFICULTY.easy && DIFFICULTY.normal && DIFFICULTY.hard);
  assert.ok(DIFFICULTY.easy.depth < DIFFICULTY.hard.depth);
}

function testVarietyCanDifferOnOpen() {
  // Birkaç boş açılışta çeşitlilik: 40 denemede en az 2 farklı hamle
  const state = createGameState(PLAYERS.gourd);
  const legal = getAllLegalMoves(state.board, PLAYERS.gourd);
  assert.ok(legal.length >= 2, "açılışta birden fazla hamle olmalı");
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const pick = chooseMove(state, PLAYERS.gourd, {
      difficulty: "easy",
      variety: 50,
      blunderChance: 0.5,
    });
    assert.ok(pick);
    seen.add(`${pick.from}-${pick.to}`);
  }
  assert.ok(
    seen.size >= 2,
    `çeşitlilik beklenirdi, görülen: ${[...seen].join(", ")}`
  );
}

testAiOpensWithLegalMove();
testAiMustCapture();
testDifficultyPresetsExist();
testVarietyCanDifferOnOpen();
console.log("ai.test.js — tüm testler geçti");
