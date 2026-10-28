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
  const sc = scoreGuess("1234", "1234");
  assert.deepStrictEqual(sc, { plus: 4, minus: 0 });
  assert.strictEqual(formatScore(sc), "+4−0");
}

function testScoreNone() {
  const sc = scoreGuess("1234", "5678");
  assert.deepStrictEqual(sc, { plus: 0, minus: 0 });
}

function testScoreAllWrongPlace() {
  // secret 1234 guess 4321 → all present, none in place → +0−4
  const sc = scoreGuess("1234", "4321");
  assert.deepStrictEqual(sc, { plus: 0, minus: 4 });
}

function testScoreMixed() {
  // secret 1234 guess 1243 → +2 (1,2) −2 (3,4 swapped)
  const sc = scoreGuess("1234", "1243");
  assert.deepStrictEqual(sc, { plus: 2, minus: 2 });
}

function testInvalidSecret() {
  assert.strictEqual(isValidSecret("1122"), false);
  assert.strictEqual(isValidSecret("0123"), false, "no leading zero");
  assert.strictEqual(isValidSecret("1023"), true);
  assert.strictEqual(isValidSecret("1234"), true);
  assert.strictEqual(isValidSecret("012"), false);
  assert.strictEqual(isValidSecret("01234"), false);
  assert.strictEqual(isValidSecret("01a3"), false);
}

function testRandomSecretValid() {
  for (let i = 0; i < 40; i++) {
    const s = randomSecret();
    assert.ok(isValidSecret(s), s);
    assert.notStrictEqual(s[0], "0");
  }
}

function testMatchFlow() {
  const state = createMatch({
    secretA: "1234",
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

  const win = applyGuess(miss.state, PLAYERS.b, "1234");
  assert.ok(win.ok);
  assert.strictEqual(win.score.plus, 4);
  assert.strictEqual(win.state.winner, PLAYERS.b);
  assert.strictEqual(win.state.status, "done");
}

function testRejectInvalidGuess() {
  const state = createMatch({ secretA: "1234", secretB: "5678" });
  const r = applyGuess(state, PLAYERS.a, "1122");
  assert.ok(!r.ok);
  assert.strictEqual(r.error, "invalid_guess");
  const lead0 = applyGuess(state, PLAYERS.a, "0123");
  assert.ok(!lead0.ok);
  assert.strictEqual(lead0.error, "invalid_guess");
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
