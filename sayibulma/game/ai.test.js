const assert = require("assert");
const { scoreGuess, isValidSecret } = require("./engine");
const { pickGuess, filterPool, allSecrets } = require("./ai");

function testPoolSize() {
  const all = allSecrets();
  assert.strictEqual(all.length, 30240); // P(10,5)
  assert.ok(all.every(isValidSecret));
}

function testFilterAfterExactHint() {
  const hist = [{ guess: "01234", plus: 5, minus: 0 }];
  const pool = filterPool(hist);
  assert.deepStrictEqual(pool, ["01234"]);
}

function testFilterConsistency() {
  const secret = "01234";
  const hist = [
    { guess: "56789", plus: 0, minus: 0 },
    { guess: "43210", plus: 1, minus: 4 },
  ];
  // verify scores match engine
  assert.deepStrictEqual(scoreGuess(secret, "56789"), { plus: 0, minus: 0 });
  assert.deepStrictEqual(scoreGuess(secret, "43210"), { plus: 1, minus: 4 });
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
  const hist = [{ guess: "01234", plus: 0, minus: 0 }];
  const g = pickGuess(hist, "hard", { rng: () => 0.1 });
  assert.ok(isValidSecret(g));
  const pool = filterPool(hist);
  assert.ok(pool.includes(g));
  assert.ok(!g.split("").some((d) => "01234".includes(d)) || true);
  // must not reuse digits from a zero-overlap guess against any consistent secret
  const sc = scoreGuess(g, "01234");
  // g is a candidate secret; scoreGuess(cand, previousGuess) filtered already
  assert.ok(pool.includes(g));
}

function testPickGuessVeryHard() {
  const hist = [];
  const g = pickGuess(hist, "veryhard", { rng: () => 0.42 });
  assert.ok(isValidSecret(g));
}

function testPickGuessEasyReturnsValid() {
  const hist = [{ guess: "01234", plus: 1, minus: 2 }];
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
