#!/usr/bin/env node
const assert = require("assert");
const E = require("./engine.js");
const Ai = require("./ai.js");

function test(name, fn) {
  try {
    fn();
    console.log("ok —", name);
  } catch (err) {
    console.error("FAIL —", name);
    throw err;
  }
}

test("chooseMove returns legal move", () => {
  let s = E.createState();
  s = E.applyRoll(s, [3, 5]).state;
  const m = Ai.chooseMove(s, "hard");
  assert.ok(m);
  const legal = E.legalMoves(s);
  assert.ok(legal.some((x) => x.from === m.from && x.to === m.to && x.die === m.die));
});

test("playTurn advances or skips", () => {
  const s = E.createState();
  const out = Ai.playTurn(s, "easy", () => 0.1);
  assert.ok(out.state);
  assert.ok(out.state.turn === "blue" || out.state.winner || out.state.phase === "move");
});

test("easy and hard both return something on open board", () => {
  let s = E.createState();
  s = E.applyRoll(s, [6, 5]).state;
  assert.ok(Ai.chooseMove(s, "easy"));
  assert.ok(Ai.chooseMove(s, "hard"));
  assert.ok(Ai.chooseMove(s, "veryhard"));
});

console.log("\nAll AI tests passed.");
