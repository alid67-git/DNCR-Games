const assert = require("assert");
const {
  DIGIT_COUNT,
  PLAYERS,
  isValidSecret,
  randomSecret,
  scoreGuess,
  formatScore,
  createMatch,
  applyGuess,
  opponent,
} = require("./engine");

function testConstants() {
  assert.strictEqual(DIGIT_COUNT, 4);
  assert.strictEqual(PLAYERS.a, "a");
  assert.strictEqual(PLAYERS.b, "b");
  assert.strictEqual(opponent(PLAYERS.a), PLAYERS.b);
}

function testScoreExact() {
  const sc = scoreGuess("0123", "0123");
  assert.deepStrictEqual(sc, { plus: 4, minus: 0 });
  assert.strictEqual(formatScore(sc), "+4−0");
}

function testScoreNone() {
  const sc = scoreGuess("0123", "5678");
  assert.deepStrictEqual(sc, { plus: 0, minus: 0 });
}

function testScoreAllWrongPlace() {
  // secret 0123 guess 3210 → all digits present, none in place → +0−4
  const sc = scoreGuess("0123", "3210");
  assert.deepStrictEqual(sc, { plus: 0, minus: 4 });
}

function testScoreMixed() {
  // secret 0123 guess 0132 → +2 (0,1) −2 (2,3 swapped)
  const sc = scoreGuess("0123", "0132");
  assert.deepStrictEqual(sc, { plus: 2, minus: 2 });
}

function testInvalidSecret() {
  assert.strictEqual(isValidSecret("1122"), false);
  assert.strictEqual(isValidSecret("0123"), true);
  assert.strictEqual(isValidSecret("012"), false);
  assert.strictEqual(isValidSecret("01234"), false);
  assert.strictEqual(isValidSecret("01a3"), false);
}

function testRandomSecretValid() {
  for (let i = 0; i < 40; i++) {
    const s = randomSecret();
    assert.ok(isValidSecret(s), s);
  }
}

function testMatchFlow() {
  const state = createMatch({
    secretA: "0123",
    secretB: "5678",
    starter: PLAYERS.a,
  });
  assert.strictEqual(state.turn, PLAYERS.a);
  assert.strictEqual(state.winner, null);

  const miss = applyGuess(state, PLAYERS.a, "5670");
  assert.ok(miss.ok, miss.error);
  assert.strictEqual(miss.score.plus, 3);
  assert.strictEqual(miss.state.turn, PLAYERS.b);

  const badTurn = applyGuess(miss.state, PLAYERS.a, "5678");
  assert.ok(!badTurn.ok);

  const win = applyGuess(miss.state, PLAYERS.b, "0123");
  assert.ok(win.ok);
  assert.strictEqual(win.score.plus, 4);
  assert.strictEqual(win.state.winner, PLAYERS.b);
  assert.strictEqual(win.state.status, "done");
}

function testRejectInvalidGuess() {
  const state = createMatch({ secretA: "0123", secretB: "5678" });
  const r = applyGuess(state, PLAYERS.a, "1122");
  assert.ok(!r.ok);
  assert.strictEqual(r.error, "invalid_guess");
}

function run() {
  testConstants();
  testScoreExact();
  testScoreNone();
  testScoreAllWrongPlace();
  testScoreMixed();
  testInvalidSecret();
  testRandomSecretValid();
  testMatchFlow();
  testRejectInvalidGuess();
  console.log("engine.test.js OK");
}

run();
