const assert = require("assert");
const E = require("./engine.js");
const Ai = require("./ai.js");

function ok(r) {
  assert.ok(r.ok, r.error);
  return r.state;
}

function quickBattle() {
  let s = E.createGameState(1);
  // Minimal deploy skip
  s.phase = E.PHASE.BATTLE;
  s.turn = 1;
  s.nodes[0][0] = 1;
  s.nodes[0][1] = 1;
  s.nodes[0][2] = 1;
  s.nodes[1][0] = 1;
  s.nodes[1][1] = 1;
  s.nodes[5][5] = 2;
  s.nodes[5][4] = 2;
  s.nodes[5][3] = 2;
  s.nodes[4][5] = 2;
  s.nodes[4][4] = 2;
  return s;
}

{
  const s = quickBattle();
  for (const diff of Ai.DIFFICULTY_LEVELS) {
    const move = Ai.chooseMove(s, 1, diff);
    assert.ok(move, `AI ${diff} hamle üretmeli`);
    const r = E.applyAction(s, 1, move);
    assert.ok(r.ok, r.error || `${diff} geçersiz`);
  }
  console.log("ok AI produces legal moves for all difficulties");
}

{
  let s = E.createGameState(1);
  s.phase = E.PHASE.DEPLOY;
  s.turn = 2;
  const a = Ai.chooseMove(s, 2, "easy");
  assert.strictEqual(a.type, "PLACE_SELECT");
  s = ok(E.applyAction(s, 2, a));
  const b = Ai.chooseMove(s, 2, "easy");
  assert.strictEqual(b.type, "PLACE_CONFIRM");
  console.log("ok AI deploy select+confirm");
}

{
  // Medium: 3 kenarı dolu kareyi kaçırmamalı
  let s = quickBattle();
  s.edgeDrawn["H_0_0"] = true;
  s.edgeDrawn["H_1_0"] = true;
  s.edgeDrawn["V_0_0"] = true;
  const move = Ai.chooseMove(s, 1, "medium");
  assert.ok(move);
  assert.strictEqual(move.type, "DRAW_LINE");
  assert.strictEqual(move.edgeId, "V_0_1");
  console.log("ok medium takes free box");
}

console.log("\nAll AI tests passed.");
