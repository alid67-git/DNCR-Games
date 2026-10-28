/**
 * Sayı Bulma — 5 haneli artı/eksi düello motoru (Node ve tarayıcı).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SayibulmaEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIGIT_COUNT = 5;
  const PLAYERS = { a: "a", b: "b" };

  function opponent(player) {
    return player === PLAYERS.a ? PLAYERS.b : PLAYERS.a;
  }

  function normalizeDigits(value) {
    return String(value == null ? "" : value).replace(/\D/g, "");
  }

  function isValidSecret(value) {
    const s = normalizeDigits(value);
    if (s.length !== DIGIT_COUNT) return false;
    const seen = Object.create(null);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (seen[ch]) return false;
      seen[ch] = true;
    }
    return true;
  }

  function randomSecret(rng) {
    const rand = typeof rng === "function" ? rng : Math.random;
    const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = digits[i];
      digits[i] = digits[j];
      digits[j] = tmp;
    }
    return digits.slice(0, DIGIT_COUNT).join("");
  }

  /**
   * Standard bulls/cows (artı/eksi). Same digit never counted twice.
   * +N = correct digit in correct position
   * -M = digit present but wrong position
   */
  function scoreGuess(secret, guess) {
    const s = normalizeDigits(secret);
    const g = normalizeDigits(guess);
    if (s.length !== DIGIT_COUNT || g.length !== DIGIT_COUNT) {
      return { plus: 0, minus: 0 };
    }
    let plus = 0;
    const secretLeft = [];
    const guessLeft = [];
    for (let i = 0; i < DIGIT_COUNT; i++) {
      if (s[i] === g[i]) {
        plus++;
      } else {
        secretLeft.push(s[i]);
        guessLeft.push(g[i]);
      }
    }
    let minus = 0;
    const pool = secretLeft.slice();
    for (let i = 0; i < guessLeft.length; i++) {
      const idx = pool.indexOf(guessLeft[i]);
      if (idx !== -1) {
        minus++;
        pool.splice(idx, 1);
      }
    }
    return { plus, minus };
  }

  function formatScore(score) {
    const plus = (score && score.plus) || 0;
    const minus = (score && score.minus) || 0;
    return "+" + plus + "−" + minus;
  }

  function createMatch(opts) {
    const options = opts || {};
    const secretA = normalizeDigits(options.secretA);
    const secretB = normalizeDigits(options.secretB);
    if (!isValidSecret(secretA) || !isValidSecret(secretB)) {
      throw new Error("Invalid secrets");
    }
    const starter =
      options.starter === PLAYERS.b ? PLAYERS.b : PLAYERS.a;
    return {
      secrets: { a: secretA, b: secretB },
      histories: { a: [], b: [] },
      turn: starter,
      winner: null,
      status: "playing",
      moveCount: 0,
    };
  }

  function cloneMatch(state) {
    return {
      secrets: { a: state.secrets.a, b: state.secrets.b },
      histories: {
        a: state.histories.a.map((h) => ({ ...h })),
        b: state.histories.b.map((h) => ({ ...h })),
      },
      turn: state.turn,
      winner: state.winner,
      status: state.status,
      moveCount: state.moveCount,
    };
  }

  /**
   * Player guesses the opponent's secret.
   * @returns {{ ok: boolean, state?: object, error?: string, score?: {plus:number,minus:number} }}
   */
  function applyGuess(state, player, guess) {
    if (!state || state.status === "done" || state.winner) {
      return { ok: false, error: "game_over" };
    }
    if (player !== PLAYERS.a && player !== PLAYERS.b) {
      return { ok: false, error: "bad_player" };
    }
    if (state.turn !== player) {
      return { ok: false, error: "wrong_turn" };
    }
    const g = normalizeDigits(guess);
    if (!isValidSecret(g)) {
      return { ok: false, error: "invalid_guess" };
    }
    const target = opponent(player);
    const score = scoreGuess(state.secrets[target], g);
    const next = cloneMatch(state);
    next.histories[player] = next.histories[player].concat([
      { guess: g, plus: score.plus, minus: score.minus },
    ]);
    next.moveCount = (state.moveCount || 0) + 1;
    if (score.plus === DIGIT_COUNT) {
      next.winner = player;
      next.status = "done";
    } else {
      next.turn = opponent(player);
      next.status = "playing";
    }
    return { ok: true, state: next, score };
  }

  function publicState(state, viewer) {
    if (!state) return null;
    const out = {
      histories: {
        a: state.histories.a.map((h) => ({ ...h })),
        b: state.histories.b.map((h) => ({ ...h })),
      },
      turn: state.turn,
      winner: state.winner,
      status: state.status,
      moveCount: state.moveCount,
      secrets: { a: null, b: null },
    };
    if (viewer === PLAYERS.a || viewer === PLAYERS.b) {
      out.secrets[viewer] = state.secrets[viewer];
    }
    return out;
  }

  return {
    DIGIT_COUNT,
    PLAYERS,
    opponent,
    normalizeDigits,
    isValidSecret,
    randomSecret,
    scoreGuess,
    formatScore,
    createMatch,
    applyGuess,
    cloneMatch,
    publicState,
  };
});
