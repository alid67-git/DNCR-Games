/**
 * Tavla (Backgammon) — tahta + kurallar (Node ve tarayıcı).
 * Standart uluslararası tavla; zar küpü yok.
 *
 * Nokta numarası 1–24 (klasik):
 *   Beyaz 24 → 1 yönünde ilerler (ev: 1–6)
 *   Mavi   1 → 24 yönünde ilerler (ev: 19–24)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TavlaEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PLAYERS = { white: "white", blue: "blue" };
  const CHECKERS = 15;

  /** Beyaz: azalan; Mavi: artan */
  function dir(player) {
    return player === PLAYERS.white ? -1 : 1;
  }

  function opponent(player) {
    return player === PLAYERS.white ? PLAYERS.blue : PLAYERS.white;
  }

  function homeRange(player) {
    return player === PLAYERS.white ? [1, 6] : [19, 24];
  }

  function bearOffPoint(player) {
    return player === PLAYERS.white ? 0 : 25;
  }

  function clonePoints(points) {
    return points.map((n) => n);
  }

  function emptyPoints() {
    return Array(25).fill(0); // index 1..24 used; 0 unused
  }

  /** Klasik açılış düzeni. Pozitif = beyaz, negatif = mavi. */
  function initialPoints() {
    const p = emptyPoints();
    p[24] = 2;
    p[13] = 5;
    p[8] = 3;
    p[6] = 5;
    p[1] = -2;
    p[12] = -5;
    p[17] = -3;
    p[19] = -5;
    return p;
  }

  function countOnBoard(points, player) {
    let n = 0;
    const sign = player === PLAYERS.white ? 1 : -1;
    for (let i = 1; i <= 24; i++) {
      if (points[i] * sign > 0) n += Math.abs(points[i]);
    }
    return n;
  }

  function barCount(state, player) {
    return state.bar[player] || 0;
  }

  function offCount(state, player) {
    return state.off[player] || 0;
  }

  function allInHome(state, player) {
    if (barCount(state, player) > 0) return false;
    const [lo, hi] = homeRange(player);
    const sign = player === PLAYERS.white ? 1 : -1;
    for (let i = 1; i <= 24; i++) {
      if (pointsOwned(state.points, i, player) > 0) {
        if (i < lo || i > hi) return false;
      }
    }
    return true;
  }

  function pointsOwned(points, point, player) {
    const v = points[point] || 0;
    if (player === PLAYERS.white) return v > 0 ? v : 0;
    return v < 0 ? -v : 0;
  }

  function createState(opts) {
    const starter =
      opts && opts.starter === PLAYERS.blue ? PLAYERS.blue : PLAYERS.white;
    return {
      points: initialPoints(),
      bar: { white: 0, blue: 0 },
      off: { white: 0, blue: 0 },
      turn: starter,
      dice: [],
      diceRaw: [],
      phase: "roll",
      winner: null,
      lastRoll: null,
      moveLog: [],
      captures: { white: 0, blue: 0 },
    };
  }

  function cloneState(state) {
    return {
      points: clonePoints(state.points),
      bar: { white: state.bar.white, blue: state.bar.blue },
      off: { white: state.off.white, blue: state.off.blue },
      turn: state.turn,
      dice: state.dice.slice(),
      diceRaw: (state.diceRaw || []).slice(),
      phase: state.phase,
      winner: state.winner,
      lastRoll: state.lastRoll ? state.lastRoll.slice() : null,
      moveLog: (state.moveLog || []).slice(),
      captures: {
        white: state.captures.white,
        blue: state.captures.blue,
      },
    };
  }

  function rollTwo(rng) {
    const r = typeof rng === "function" ? rng : Math.random;
    const a = 1 + Math.floor(r() * 6);
    const b = 1 + Math.floor(r() * 6);
    return [a, b];
  }

  function diceFromRoll(a, b) {
    if (a === b) return [a, a, a, a];
    return [a, b];
  }

  function applyRoll(state, roll, rng) {
    if (state.phase !== "roll" || state.winner) {
      return { ok: false, error: "not_roll_phase" };
    }
    const next = cloneState(state);
    let pair = roll;
    if (!pair || pair.length !== 2) {
      pair = rollTwo(rng);
    }
    const a = Number(pair[0]);
    const b = Number(pair[1]);
    if (!(a >= 1 && a <= 6 && b >= 1 && b <= 6)) {
      return { ok: false, error: "bad_dice" };
    }
    next.diceRaw = [a, b];
    next.lastRoll = [a, b];
    next.dice = diceFromRoll(a, b);
    next.phase = "move";
    const moves = listLegalMoves(next);
    if (moves.length === 0) {
      // Zar kullanılabilir değil — tur geçer
      next.dice = [];
      next.phase = "roll";
      next.turn = opponent(next.turn);
      return { ok: true, state: next, skipped: true };
    }
    return { ok: true, state: next, skipped: false };
  }

  function destination(player, from, pip) {
    if (from === "bar") {
      return player === PLAYERS.white ? 25 - pip : pip;
    }
    const to = from + dir(player) * pip;
    return to;
  }

  function canLand(state, player, to) {
    if (to < 1 || to > 24) return false;
    const opp = opponent(player);
    const theirs = pointsOwned(state.points, to, opp);
    return theirs < 2;
  }

  function canBearOff(state, player, from, pip) {
    if (!allInHome(state, player)) return false;
    const [lo, hi] = homeRange(player);
    if (from < lo || from > hi) return false;
    const need =
      player === PLAYERS.white ? from : 25 - from;
    if (pip === need) return true;
    if (pip < need) return false;
    // Exact higher die: only if no checkers farther from off
    if (player === PLAYERS.white) {
      for (let i = from + 1; i <= 6; i++) {
        if (pointsOwned(state.points, i, player) > 0) return false;
      }
      return true;
    }
    for (let i = from - 1; i >= 19; i--) {
      if (pointsOwned(state.points, i, player) > 0) return false;
    }
    return true;
  }

  /**
   * Tek zar adımı: { from: number|'bar', to: number|'off', die: number, hit?: boolean }
   */
  function listStepsForDie(state, player, die) {
    const steps = [];
    if (barCount(state, player) > 0) {
      const to = destination(player, "bar", die);
      if (canLand(state, player, to)) {
        const hit = pointsOwned(state.points, to, opponent(player)) === 1;
        steps.push({ from: "bar", to, die, hit: !!hit });
      }
      return steps;
    }

    for (let from = 1; from <= 24; from++) {
      if (pointsOwned(state.points, from, player) === 0) continue;
      const to = destination(player, from, die);
      if (to >= 1 && to <= 24) {
        if (canLand(state, player, to)) {
          const hit = pointsOwned(state.points, to, opponent(player)) === 1;
          steps.push({ from, to, die, hit: !!hit });
        }
      } else if (canBearOff(state, player, from, die)) {
        steps.push({ from, to: "off", die, hit: false });
      }
    }
    return steps;
  }

  function applyStep(state, player, step) {
    const next = cloneState(state);
    const sign = player === PLAYERS.white ? 1 : -1;
    const opp = opponent(player);

    if (step.from === "bar") {
      next.bar[player] -= 1;
    } else {
      next.points[step.from] -= sign;
    }

    if (step.to === "off") {
      next.off[player] += 1;
    } else {
      if (step.hit) {
        next.points[step.to] = 0;
        next.bar[opp] += 1;
        next.captures[player] += 1;
      }
      next.points[step.to] += sign;
    }

    const di = next.dice.indexOf(step.die);
    if (di >= 0) next.dice.splice(di, 1);
    next.moveLog.push({
      player,
      from: step.from,
      to: step.to,
      die: step.die,
      hit: !!step.hit,
    });

    if (next.off[player] >= CHECKERS) {
      next.winner = player;
      next.phase = "over";
      next.dice = [];
    }
    return next;
  }

  /** Tüm yasal tek-adım hamleler (kalan zarlardan). */
  function listLegalMoves(state) {
    if (state.phase !== "move" || state.winner) return [];
    const player = state.turn;
    const uniqueDice = [...new Set(state.dice)];
    const moves = [];
    const seen = new Set();
    for (const die of uniqueDice) {
      for (const step of listStepsForDie(state, player, die)) {
        const key = `${step.from}->${step.to}:${step.die}`;
        if (seen.has(key)) continue;
        seen.add(key);
        moves.push(step);
      }
    }
    return moves;
  }

  /**
   * Maksimum zar kullanımı zorunlu (standart tavla).
   * Çift değilken iki zar da oynanabiliyorsa tek zarla bitirmek yasak.
   * Tek zar oynanacaksa daha yüksek olan tercih edilir.
   */
  function filterForcedMoves(state, moves) {
    if (!moves.length) return moves;
    if (state.dice.length <= 1) return moves;

    // Hangi hamlelerden sonra kalan zar(lar) oynanabilir?
    const canContinue = [];
    const cannot = [];
    for (const m of moves) {
      const after = applyStep(state, state.turn, m);
      if (after.winner || after.dice.length === 0) {
        canContinue.push(m);
        continue;
      }
      if (listLegalMoves(after).length > 0) canContinue.push(m);
      else cannot.push(m);
    }
    if (canContinue.length > 0) return canContinue;

    // Hiçbirinden devam yok — mümkün olan tek zar; yüksek zar öncelikli
    if (state.dice.length === 2 && state.dice[0] !== state.dice[1]) {
      const hi = Math.max(state.dice[0], state.dice[1]);
      const withHi = moves.filter((m) => m.die === hi);
      if (withHi.length) return withHi;
    }
    return moves;
  }

  function legalMoves(state) {
    return filterForcedMoves(state, listLegalMoves(state));
  }

  function applyMove(state, move) {
    if (state.phase !== "move" || state.winner) {
      return { ok: false, error: "not_move_phase" };
    }
    const allowed = legalMoves(state);
    const match = allowed.find(
      (m) =>
        m.from === move.from &&
        m.to === move.to &&
        m.die === move.die
    );
    if (!match) return { ok: false, error: "illegal" };

    let next = applyStep(state, state.turn, match);
    if (next.winner) return { ok: true, state: next };

    if (next.dice.length === 0) {
      next.phase = "roll";
      next.turn = opponent(next.turn);
      return { ok: true, state: next };
    }

    const more = legalMoves(next);
    if (more.length === 0) {
      next.dice = [];
      next.phase = "roll";
      next.turn = opponent(next.turn);
    }
    return { ok: true, state: next };
  }

  /** Turu zar kalmadan bitir (yasal hamle yoksa). */
  function endTurnIfStuck(state) {
    if (state.phase !== "move" || state.winner) return state;
    if (legalMoves(state).length > 0) return state;
    const next = cloneState(state);
    next.dice = [];
    next.phase = "roll";
    next.turn = opponent(next.turn);
    return next;
  }

  function publicState(state, perspective) {
    return {
      points: clonePoints(state.points),
      bar: { white: state.bar.white, blue: state.bar.blue },
      off: { white: state.off.white, blue: state.off.blue },
      turn: state.turn,
      dice: state.dice.slice(),
      diceRaw: (state.diceRaw || []).slice(),
      phase: state.phase,
      winner: state.winner,
      lastRoll: state.lastRoll ? state.lastRoll.slice() : null,
      you: perspective || null,
      captures: {
        white: state.captures.white,
        blue: state.captures.blue,
      },
    };
  }

  function serialize(state) {
    return JSON.stringify(state);
  }

  function deserialize(raw) {
    const s = typeof raw === "string" ? JSON.parse(raw) : raw;
    return cloneState(s);
  }

  /** Basit pip sayısı (ev + bar). */
  function pipCount(state, player) {
    let pips = 0;
    const sign = player === PLAYERS.white ? 1 : -1;
    for (let i = 1; i <= 24; i++) {
      const n = pointsOwned(state.points, i, player);
      if (!n) continue;
      const dist =
        player === PLAYERS.white ? i : 25 - i;
      pips += n * dist;
    }
    pips += barCount(state, player) * 25;
    return pips;
  }

  return {
    PLAYERS,
    CHECKERS,
    opponent,
    homeRange,
    createState,
    cloneState,
    applyRoll,
    applyMove,
    legalMoves,
    listLegalMoves,
    endTurnIfStuck,
    publicState,
    serialize,
    deserialize,
    pointsOwned,
    barCount,
    offCount,
    allInHome,
    pipCount,
    countOnBoard,
    rollTwo,
    diceFromRoll,
  };
});
