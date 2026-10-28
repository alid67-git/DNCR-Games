/**
 * Sayı Bulma AI — kolay / zor / çok zor (aday havuzu filtreleme).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const Engine = require("./engine.js");
    module.exports = factory(Engine);
  } else {
    root.SayibulmaAi = factory(root.SayibulmaEngine);
  }
})(typeof self !== "undefined" ? self : this, function (Engine) {
  "use strict";

  const { DIGIT_COUNT, isValidSecret, scoreGuess, randomSecret } = Engine;

  let ALL_SECRETS = null;

  function allSecrets() {
    if (ALL_SECRETS) return ALL_SECRETS;
    const out = [];
    const digits = "0123456789";
    function walk(prefix, used) {
      if (prefix.length === DIGIT_COUNT) {
        if (isValidSecret(prefix)) out.push(prefix);
        return;
      }
      for (let i = 0; i < 10; i++) {
        const d = digits[i];
        if (used[d]) continue;
        used[d] = true;
        walk(prefix + d, used);
        used[d] = false;
      }
    }
    walk("", Object.create(null));
    ALL_SECRETS = out;
    return out;
  }

  function filterPool(history) {
    let pool = allSecrets();
    const hist = history || [];
    for (let i = 0; i < hist.length; i++) {
      const h = hist[i];
      const guess = String(h.guess || "");
      const plus = h.plus | 0;
      const minus = h.minus | 0;
      pool = pool.filter((cand) => {
        const sc = scoreGuess(cand, guess);
        return sc.plus === plus && sc.minus === minus;
      });
    }
    return pool;
  }

  function pickRandom(list, rng) {
    const rand = typeof rng === "function" ? rng : Math.random;
    if (!list || !list.length) return null;
    return list[Math.floor(rand() * list.length)];
  }

  /** Count how many candidates remain if secret were `cand` and we guess `guess`. */
  function remainingAfter(pool, guess) {
    const buckets = Object.create(null);
    for (let i = 0; i < pool.length; i++) {
      const sc = scoreGuess(pool[i], guess);
      const key = sc.plus + ":" + sc.minus;
      buckets[key] = (buckets[key] || 0) + 1;
    }
    let worst = 0;
    let sumSq = 0;
    const keys = Object.keys(buckets);
    for (let i = 0; i < keys.length; i++) {
      const n = buckets[keys[i]];
      if (n > worst) worst = n;
      sumSq += n * n;
    }
    return { worst, sumSq, partitions: keys.length };
  }

  /**
   * Very-hard: minimize worst-case remaining pool size among a sample of candidates.
   */
  function pickOptimal(pool, rng) {
    if (pool.length <= 2) return pickRandom(pool, rng);
    const rand = typeof rng === "function" ? rng : Math.random;
    const sampleSize = Math.min(pool.length, 36);
    // Stride sample so a constant/fake rng cannot loop forever.
    const start = Math.floor(rand() * pool.length) % pool.length;
    const step = Math.max(1, Math.floor(pool.length / sampleSize));
    const sample = [];
    const used = Object.create(null);
    for (let i = 0; i < pool.length && sample.length < sampleSize; i++) {
      const c = pool[(start + i * step) % pool.length];
      if (used[c]) continue;
      used[c] = true;
      sample.push(c);
    }
    if (!sample.length) return pickRandom(pool, rng);
    let best = sample[0];
    let bestWorst = Infinity;
    let bestSumSq = Infinity;
    for (let i = 0; i < sample.length; i++) {
      const g = sample[i];
      const m = remainingAfter(pool, g);
      if (
        m.worst < bestWorst ||
        (m.worst === bestWorst && m.sumSq < bestSumSq)
      ) {
        bestWorst = m.worst;
        bestSumSq = m.sumSq;
        best = g;
      }
    }
    return best;
  }

  /**
   * @param {Array<{guess:string,plus:number,minus:number}>} history
   * @param {string} difficulty easy|hard|veryhard
   * @param {{rng?: function}|string} [opts]
   */
  function pickGuess(history, difficulty, opts) {
    const options = typeof opts === "function" ? { rng: opts } : opts || {};
    const rng = options.rng;
    const diff = String(difficulty || "hard").toLowerCase();
    const pool = filterPool(history);

    if (diff === "easy") {
      // Sometimes ignore constraints and guess a random valid code.
      const noise = typeof rng === "function" ? rng() : Math.random();
      if (noise < 0.38 || !pool.length) {
        let g = randomSecret(rng);
        const hist = history || [];
        const seen = Object.create(null);
        for (let i = 0; i < hist.length; i++) seen[hist[i].guess] = true;
        let guard = 0;
        while (seen[g] && guard++ < 40) g = randomSecret(rng);
        return g;
      }
      return pickRandom(pool, rng);
    }

    if (!pool.length) {
      return randomSecret(rng);
    }

    if (diff === "veryhard") {
      // Mobilde büyük havuzda entropy araması UI'yi dondurmasın.
      if (pool.length > 900) return pickRandom(pool, rng);
      return pickOptimal(pool, rng);
    }

    // hard: uniform from consistent pool
    return pickRandom(pool, rng);
  }

  return {
    allSecrets,
    filterPool,
    pickGuess,
    isValidSecret,
  };
});
