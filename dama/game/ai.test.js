const assert = require("assert");
const E = require("./engine.js");
const Ai = require("./ai.js");

function testChoosesCapture() {
  const s = E.createGameState();
  for (const id of E.SQUARES) s.board[id] = null;
  s.board["3,3"] = E.piece(E.PLAYERS.black, false);
  s.board["3,4"] = E.piece(E.PLAYERS.white, false);
  s.board["7,7"] = E.piece(E.PLAYERS.white, false);
  s.turn = E.PLAYERS.black;
  const m = Ai.chooseMove(s, E.PLAYERS.black, { difficulty: "hard" });
  assert.ok(m);
  assert.ok(m.captured && m.captured.length >= 1, "AI must capture when forced");
}

function testReturnsNullWrongTurn() {
  const s = E.createGameState();
  const m = Ai.chooseMove(s, E.PLAYERS.black, "easy");
  assert.strictEqual(m, null);
}

testChoosesCapture();
testReturnsNullWrongTurn();
console.log("dama ai tests ok");
