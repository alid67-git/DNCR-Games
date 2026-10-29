#!/usr/bin/env node
const assert = require("assert");
const E = require("./engine.js");

function test(name, fn) {
  try {
    fn();
    console.log("ok —", name);
  } catch (err) {
    console.error("FAIL —", name);
    throw err;
  }
}

test("initial counts 15 each", () => {
  const s = E.createState();
  assert.strictEqual(E.countOnBoard(s.points, "white") + s.bar.white + s.off.white, 15);
  assert.strictEqual(E.countOnBoard(s.points, "blue") + s.bar.blue + s.off.blue, 15);
  assert.strictEqual(s.points[24], 2);
  assert.strictEqual(s.points[1], -2);
});

test("roll enters move phase", () => {
  const s = E.createState();
  const r = E.applyRoll(s, [3, 5]);
  assert.ok(r.ok);
  assert.strictEqual(r.state.phase, "move");
  assert.deepStrictEqual(r.state.diceRaw, [3, 5]);
  assert.deepStrictEqual(r.state.dice, [3, 5]);
});

test("doubles give four dice", () => {
  const s = E.createState();
  const r = E.applyRoll(s, [4, 4]);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.state.dice, [4, 4, 4, 4]);
});

test("white can move 24 with die 2 to 22", () => {
  let s = E.createState();
  s = E.applyRoll(s, [2, 3]).state;
  const moves = E.legalMoves(s);
  assert.ok(moves.some((m) => m.from === 24 && m.to === 22 && m.die === 2));
});

test("hit sends opponent to bar", () => {
  let s = E.createState();
  // Clear and place: white blot on 5, blue on bar entering with 5 → point 5
  s.points = Array(25).fill(0);
  s.points[5] = 1; // white blot
  s.bar.blue = 1;
  s.off.white = 14;
  s.off.blue = 14;
  s.turn = "blue";
  s.phase = "roll";
  s = E.applyRoll(s, [5, 1]).state;
  const hit = E.legalMoves(s).find((m) => m.from === "bar" && m.to === 5);
  assert.ok(hit && hit.hit);
  const res = E.applyMove(s, hit);
  assert.ok(res.ok);
  assert.strictEqual(res.state.bar.white, 1);
  assert.strictEqual(res.state.points[5], -1);
});

test("must enter from bar first", () => {
  let s = E.createState();
  s.bar.white = 1;
  s.points[24] = 1; // still have a piece but bar blocks
  s.turn = "white";
  s.phase = "roll";
  s = E.applyRoll(s, [1, 2]).state;
  const moves = E.legalMoves(s);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.from === "bar"));
});

test("bearing off exact", () => {
  let s = E.createState();
  s.points = Array(25).fill(0);
  s.points[3] = 1;
  s.off.white = 14;
  s.bar.white = 0;
  s.turn = "white";
  s.phase = "roll";
  s = E.applyRoll(s, [3, 1]).state;
  const off = E.legalMoves(s).find((m) => m.from === 3 && m.to === "off");
  assert.ok(off);
  const res = E.applyMove(s, off);
  assert.ok(res.ok);
  assert.strictEqual(res.state.winner, "white");
  assert.strictEqual(res.state.phase, "over");
});

test("blocked point cannot land", () => {
  let s = E.createState();
  s.points = Array(25).fill(0);
  s.points[24] = 1;
  s.points[22] = -2; // blue anchor
  s.off.white = 14;
  s.off.blue = 13;
  s.turn = "white";
  s.phase = "roll";
  s = E.applyRoll(s, [2, 3]).state;
  const moves = E.legalMoves(s);
  assert.ok(!moves.some((m) => m.to === 22));
});

test("serialize roundtrip", () => {
  const s = E.createState({ starter: "blue" });
  const again = E.deserialize(E.serialize(s));
  assert.strictEqual(again.turn, "blue");
  assert.deepStrictEqual(again.points, s.points);
});

console.log("\nAll engine tests passed.");
