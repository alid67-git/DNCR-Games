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
  assert.strictEqual(DIGIT_COUNT, 5);
  assert.strictEqual(PLAYERS.a, "a");
  assert.strictEqual(PLAYERS.b, "b");
  assert.strictEqual(opponent(PLAYERS.a), PLAYERS.b);
}

function testScoreExact() {
  const sc = scoreGuess("01234", "01234");
  assert.deepStrictEqual(sc, { plus: 5, minus: 0 });
  assert.strictEqual(formatScore(sc), "+5−0");
}

function testScoreNone() {
  const sc = scoreGuess("01234", "56789");
  assert.deepStrictEqual(sc, { plus: 0, minus: 0 });
}

function testScoreMixed() {
  // secret 01234 guess 43210 → pos2 '2' is +1; 0,1,3,4 wrong place → -4
  const sc = scoreGuess("01234", "43210");
  assert.deepStrictEqual(sc, { plus: 1, minus: 4 });
}

function testInvalidSecret() {
  assert.strictEqual(isValidSecret("11223"), false);
  assert.strictEqual(isValidSecret("01234"), true);
  assert.strictEqual(isValidSecret("0123"), false);
  assert.strictEqual(isValidSecret("012345"), false);
  assert.strictEqual(isValidSecret("01a34"), false);
}

function testRandomSecretValid() {
  for (let i = 0; i < 40; i++) {
    const s = randomSecret();
    assert.ok(isValidSecret(s), s);
  }
}

function testMatchFlow() {
  const state = createMatch({
    secretA: "01234",
    secretB: "56789",
    starter: PLAYERS.a,
  });
  assert.strictEqual(state.turn, PLAYERS.a);
  assert.strictEqual(state.winner, null);

  const miss = applyGuess(state, PLAYERS.a, "56780");
  assert.ok(miss.ok, miss.error);
  assert.strictEqual(miss.score.plus, 4);
  assert.strictEqual(miss.state.turn, PLAYERS.b);

  const badTurn = applyGuess(miss.state, PLAYERS.a, "56789");
  assert.ok(!badTurn.ok);

  const win = applyGuess(miss.state, PLAYERS.b, "01234");
  assert.ok(win.ok);
  assert.strictEqual(win.score.plus, 5);
  assert.strictEqual(win.state.winner, PLAYERS.b);
  assert.strictEqual(win.state.status, "done");
}

function testRejectInvalidGuess() {
  const state = createMatch({ secretA: "01234", secretB: "56789" });
  const r = applyGuess(state, PLAYERS.a, "11223");
  assert.ok(!r.ok);
  assert.strictEqual(r.error, "invalid_guess");
}

function run() {
  testConstants();
  testScoreExact();
  testScoreNone();
  testScoreMixed();
  testInvalidSecret();
  testRandomSecretValid();
  testMatchFlow();
  testRejectInvalidGuess();
  console.log("engine.test.js OK");
}

run();
