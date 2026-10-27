const assert = require("assert");
const { createGameState, tryAction, PLAYERS, getAllLegalMoves } = require("./engine");
const { chooseMove, DIFFICULTY } = require("./ai");

function testDifficultyPresets() {
  assert.ok(DIFFICULTY.easy && DIFFICULTY.hard && DIFFICULTY.veryhard);
  assert.ok(DIFFICULTY.easy.depth < DIFFICULTY.hard.depth);
  assert.ok(DIFFICULTY.hard.depth <= DIFFICULTY.veryhard.depth);
}

function testAiPlacesLegal() {
  const s = createGameState();
  const pick = chooseMove(s, PLAYERS.red, { difficulty: "hard" });
  assert.ok(pick, "AI hamle seçmeli");
  assert.strictEqual(pick.type, "place");
  const r = tryAction(s, PLAYERS.red, pick);
  assert.ok(r.ok, r.error);
}

function testAiRemovesAfterMill() {
  let s = createGameState();
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a0" }).state;
  s = tryAction(s, PLAYERS.black, { type: "place", to: "c4" }).state;
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a1" }).state;
  s = tryAction(s, PLAYERS.black, { type: "place", to: "c5" }).state;
  s = tryAction(s, PLAYERS.red, { type: "place", to: "a2" }).state;
  assert.strictEqual(s.phase, "remove");
  const pick = chooseMove(s, PLAYERS.red, { difficulty: "veryhard" });
  assert.ok(pick && pick.type === "remove");
  const legal = getAllLegalMoves(s, PLAYERS.red).map((m) => m.at);
  assert.ok(legal.includes(pick.at));
}

function testEasyVariety() {
  const s = createGameState(PLAYERS.black);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const pick = chooseMove(s, PLAYERS.black, {
      difficulty: "easy",
      variety: 50,
      blunderChance: 0.6,
    });
    assert.ok(pick);
    seen.add(pick.to || pick.at || `${pick.from}-${pick.to}`);
  }
  assert.ok(seen.size >= 2, `çeşitlilik beklenirdi: ${[...seen].join(",")}`);
}

testDifficultyPresets();
testAiPlacesLegal();
testAiRemovesAfterMill();
testEasyVariety();
console.log("ai.test.js — tüm testler geçti");
