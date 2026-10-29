const assert = require("assert");
const E = require("./engine.js");
const Ai = require("./ai.js");

const s = E.createGameState(E.PLAYERS.black);
const move = Ai.chooseMove(s, E.PLAYERS.black, { difficulty: "easy" });
assert.ok(move, "AI should pick a move");
const r = E.tryAction(s, E.PLAYERS.black, move);
assert.ok(r.ok, r.error);
console.log("fanorona ai tests passed", move.type);
