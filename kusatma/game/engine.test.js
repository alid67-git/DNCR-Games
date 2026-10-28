const assert = require("assert");
const E = require("./engine.js");

function ok(r, msg) {
  assert.ok(r.ok, msg || r.error || "expected ok");
  return r.state;
}

function fillDeploy(s) {
  for (let i = 0; i < 10; i++) {
    const p = s.turn;
    let placed = false;
    for (let r = 0; r < 6 && !placed; r++) {
      for (let c = 0; c < 6 && !placed; c++) {
        if (s.nodes[r][c] !== 0) continue;
        s = ok(E.selectDeploy(s, p, r, c));
        s = ok(E.confirmDeploy(s, p));
        placed = true;
      }
    }
  }
  return s;
}

{
  let s = fillDeploy(E.createGameState(1));
  assert.strictEqual(s.phase, E.PHASE.BATTLE);
  assert.strictEqual(E.countStones(s, 1), 5);
  assert.strictEqual(E.countStones(s, 2), 5);
  console.log("ok deploy 5+5 → BATTLE");
}

{
  let s = E.createGameState(1);
  s.phase = E.PHASE.BATTLE;
  s.turn = 1;
  s.nodes[0][0] = 1;
  s.nodes[0][5] = 1;
  s.nodes[5][0] = 1;
  s.nodes[5][5] = 1;
  s.nodes[1][5] = 1;
  s.nodes[5][1] = 2;
  s.nodes[5][2] = 2;
  s.nodes[5][3] = 2;
  s.nodes[5][4] = 2;
  s.nodes[4][5] = 2;

  s = ok(E.applyDrawLine(s, 1, "H_0_0"));
  assert.strictEqual(s.turn, 2);
  s.turn = 1;
  s = ok(E.applyDrawLine(s, 1, "H_1_0"));
  s.turn = 1;
  s = ok(E.applyDrawLine(s, 1, "V_0_0"));
  s.turn = 1;
  const before = s.scores[1];
  s = ok(E.applyDrawLine(s, 1, "V_0_1"));
  assert.strictEqual(s.cellOwner[0][0], 1);
  assert.strictEqual(s.scores[1], before + 10);
  assert.strictEqual(s.shieldPoints[1], 1);
  assert.strictEqual(s.turn, 1, "ekstra hamle");
  assert.strictEqual(s.comboIndex, 1);
  console.log("ok clean capture +10 + shield + extra turn");
}

{
  let s = E.createGameState(1);
  s.phase = E.PHASE.BATTLE;
  s.turn = 1;
  s.nodes[0][0] = 2;
  s.nodes[2][2] = 1;
  s.nodes[2][3] = 1;
  s.nodes[3][2] = 1;
  s.nodes[3][3] = 1;
  s.nodes[4][4] = 1;
  s.nodes[5][0] = 2;
  s.nodes[5][1] = 2;
  s.nodes[5][2] = 2;
  s.nodes[5][3] = 2;
  for (const id of ["H_0_0", "H_1_0", "V_0_0"]) s.edgeDrawn[id] = true;
  s = ok(E.applyDrawLine(s, 1, "V_0_1"));
  assert.strictEqual(s.cellOwner[0][0], 1);
  assert.strictEqual(s.nodes[0][0], 0);
  assert.strictEqual(s.scores[1], 50);
  console.log("ok siege hit +50");
}

{
  let s = E.createGameState(1);
  s.phase = E.PHASE.BATTLE;
  s.turn = 1;
  s.nodes[2][2] = 1;
  s.edgeDrawn["H_2_2"] = true;
  const moves = E.legalMovesFrom(s, 2, 2);
  assert.ok(!moves.some((m) => m.r === 2 && m.c === 3));
  console.log("ok stone blocked by drawn edge");
}

{
  let s = E.createGameState(1);
  s.phase = E.PHASE.BATTLE;
  s.turn = 1;
  s.nodes[2][2] = 2;
  s.nodes[2][3] = 2;
  s.nodes[4][1] = 1;
  s.nodes[4][2] = 1;
  s.nodes[4][3] = 1;
  s.nodes[4][4] = 1;
  s.nodes[5][5] = 1;
  s.insuranceActive[2] = true;

  const legal = E.legalMovesFrom(s, 4, 1);
  assert.ok(legal.length, "P1 hareket edebilmeli");
  s = ok(E.applyMoveStone(s, 1, { r: 4, c: 1 }, { r: legal[0].r, c: legal[0].c }));
  assert.strictEqual(s.insuranceActive[2], true);
  const insuredCount = E.ALL_EDGES.filter((id) => s.edgeInsured[id]).length;
  assert.ok(insuredCount >= 1, "sigorta kenarları");

  const insuredEdge = E.ALL_EDGES.find((id) => s.edgeInsured[id]);
  s.turn = 1;
  s.shieldPoints[1] = 0;
  assert.ok(!E.applyDrawLine(s, 1, insuredEdge).ok);

  s.shieldPoints[1] = 2;
  const win = E.applyDrawLine(s, 1, insuredEdge);
  assert.ok(win.ok);
  assert.strictEqual(win.state.shieldPoints[1], 0);
  assert.strictEqual(win.state.edgeDrawn[insuredEdge], true);
  console.log("ok insurance + shield break");
}

{
  let s = E.createGameState(1);
  s = ok(E.resign(s, 1));
  assert.strictEqual(s.winner, 2);
  assert.strictEqual(s.endReason, "resign");
  console.log("ok resign");
}

{
  assert.strictEqual(Math.floor(10 * 1.5), 15);
  assert.strictEqual(Math.floor(50 * 1.5), 75);
  console.log("ok combo floor math");
}

{
  // Öğrenme: sigorta kapalı, kombo düz puan
  let s = E.createGameState(1, { insurance: false, combo: false });
  assert.strictEqual(s.rules.insurance, false);
  assert.strictEqual(s.rules.combo, false);
  s.phase = E.PHASE.BATTLE;
  s.turn = 1;
  s.nodes[0][0] = 1;
  s.nodes[0][1] = 1;
  s.nodes[1][0] = 1;
  s.nodes[1][1] = 1;
  s.nodes[5][5] = 2;
  s.nodes[5][4] = 2;
  // 2 taş kalsa bile sigorta tetiklenmemeli
  s.nodes[5][3] = 0;
  s.nodes[5][2] = 0;
  s.nodes[5][1] = 0;
  // P2 only 2 stones → would trigger insurance in full rules
  s = ok(E.applyDrawLine(s, 1, "H_0_0"));
  s.turn = 1;
  s = ok(E.applyDrawLine(s, 1, "H_1_0"));
  s.turn = 1;
  s = ok(E.applyDrawLine(s, 1, "V_0_0"));
  s.turn = 1;
  const before = s.scores[1];
  s = ok(E.applyDrawLine(s, 1, "V_0_1"));
  assert.strictEqual(s.scores[1], before + 10, "flat +10 no combo");
  assert.ok(!Object.values(s.edgeInsured).some(Boolean), "no insurance edges");
  console.log("ok learning rules flat + no insurance");
}

console.log("\nAll engine tests passed.");
