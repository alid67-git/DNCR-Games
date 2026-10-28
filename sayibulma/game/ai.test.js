const assert = require("assert");
const { scoreGuess, isValidSecret } = require("./engine");
const { pickGuess, filterPool, allSecrets } = require("./ai");

function testPoolSize() {
  const all = allSecrets();
  // 9 choices for first digit (1-9) × P(9,3) for the rest = 9*9*8*7 = 4536
  assert.strictEqual(all.length, 4536);
  assert.ok(all.every(isValidSecret));
  assert.ok(all.every((s) => s[0] !== "0"));
}

function testFilterAfterExactHint() {
  const hist = [{ guess: "1234", plus: 4, minus: 0 }];
  const pool = filterPool(hist);
  assert.deepStrictEqual(pool, ["1234"]);
}

function testFilterConsistency() {
  const secret = "1234";
  const hist = [
    { guess: "5678", plus: 0, minus: 0 },
    { guess: "4321", plus: 0, minus: 4 },
  ];
  assert.deepStrictEqual(scoreGuess(secret, "5678"), { plus: 0, minus: 0 });
  assert.deepStrictEqual(scoreGuess(secret, "4321"), { plus: 0, minus: 4 });
  const pool = filterPool(hist);
  assert.ok(pool.includes(secret));
  for (const cand of pool) {
    for (const h of hist) {
      const sc = scoreGuess(cand, h.guess);
      assert.strictEqual(sc.plus, h.plus);
      assert.strictEqual(sc.minus, h.minus);
    }
  }
}

function testPickGuessHardFromPool() {
  const hist = [{ guess: "1234", plus: 0, minus: 0 }];
  const g = pickGuess(hist, "hard", { rng: () => 0.1 });
  assert.ok(isValidSecret(g));
  const pool = filterPool(hist);
  assert.ok(pool.includes(g));
}

function testPickGuessVeryHard() {
  const hist = [];
  const g = pickGuess(hist, "veryhard", { rng: () => 0.42 });
  assert.ok(isValidSecret(g));
}

function testPickGuessEasyReturnsValid() {
  const hist = [{ guess: "1234", plus: 1, minus: 2 }];
  for (let i = 0; i < 12; i++) {
    const g = pickGuess(hist, "easy");
    assert.ok(isValidSecret(g), g);
  }
}

function run() {
  testPoolSize();
  testFilterAfterExactHint();
  testFilterConsistency();
  testPickGuessHardFromPool();
  testPickGuessVeryHard();
  testPickGuessEasyReturnsValid();
  console.log("ai.test.js OK");
}

run();
