/**
 * Tavla AI — kolay / zor / çok zor.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./engine.js"));
  } else {
    root.TavlaAi = factory(root.TavlaEngine);
  }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  function scoreBoard(state, me) {
    const opp = E.opponent(me);
    let s = 0;
    s += (E.offCount(state, me) - E.offCount(state, opp)) * 120;
    s += (E.pipCount(state, opp) - E.pipCount(state, me)) * 1.15;
    s += (E.barCount(state, opp) - E.barCount(state, me)) * 28;
    s += (state.captures[me] - state.captures[opp]) * 18;

    // Blok / anchor (2+ taş)
    for (let i = 1; i <= 24; i++) {
      const mine = E.pointsOwned(state.points, i, me);
      const theirs = E.pointsOwned(state.points, i, opp);
      if (mine >= 2) {
        s += 6;
        const [lo, hi] = E.homeRange(me);
        if (i >= lo && i <= hi) s += 4;
      }
      if (mine === 1) s -= 9; // blot
      if (theirs === 1) s += 3;
      if (theirs >= 2) s -= 4;
    }
    return s;
  }

  function pickRandom(arr, rng) {
    const r = typeof rng === "function" ? rng : Math.random;
    return arr[Math.floor(r() * arr.length)];
  }

  /**
   * Bir tur boyunca (kalan zarlar) en iyi hamle zincirini seç, ilk adımı döndür.
   */
  function chooseMove(state, difficulty, rng) {
    const moves = E.legalMoves(state);
    if (!moves.length) return null;
    const diff = String(difficulty || "hard").toLowerCase();
    const r = typeof rng === "function" ? rng : Math.random;

    if (diff === "easy") {
      // %70 rastgele, %30 hafif skor
      if (r() < 0.7) return pickRandom(moves, r);
    }

    const me = state.turn;
    let best = [];
    let bestScore = -Infinity;

    for (const m of moves) {
      let after = E.applyMove(state, m).state;
      // Greedy: aynı turda kalan zarları da kaba değerlendir
      let depth = 0;
      while (
        after &&
        after.phase === "move" &&
        after.turn === me &&
        !after.winner &&
        depth < 4
      ) {
        const more = E.legalMoves(after);
        if (!more.length) break;
        let localBest = more[0];
        let localScore = -Infinity;
        for (const nm of more) {
          const ns = E.applyMove(after, nm).state;
          const sc = scoreBoard(ns, me) + (nm.hit ? 15 : 0);
          if (sc > localScore) {
            localScore = sc;
            localBest = nm;
          }
        }
        after = E.applyMove(after, localBest).state;
        depth += 1;
      }
      let sc = scoreBoard(after, me);
      if (m.hit) sc += 22;
      if (m.to === "off") sc += 30;
      if (diff === "veryhard") {
        // Prim: rakip barı + kendi ev bloku
        sc += E.barCount(after, E.opponent(me)) * 8;
      }
      if (sc > bestScore + 0.01) {
        bestScore = sc;
        best = [m];
      } else if (Math.abs(sc - bestScore) < 0.01) {
        best.push(m);
      }
    }

    if (diff === "easy" && best.length) {
      // Ara sıra kötü hamle
      if (r() < 0.35) return pickRandom(moves, r);
    }
    return pickRandom(best.length ? best : moves, r);
  }

  /**
   * AI turunu oynar: zar at + tüm hamleler.
   * @returns {{ state, roll, moves }}
   */
  function playTurn(state, difficulty, rng) {
    let s = E.cloneState(state);
    const rolled = E.applyRoll(s, null, rng);
    if (!rolled.ok) return { state: s, roll: null, moves: [] };
    s = rolled.state;
    const roll = s.lastRoll ? s.lastRoll.slice() : null;
    const moves = [];
    let guard = 0;
    while (s.phase === "move" && s.turn === state.turn && !s.winner && guard < 8) {
      const m = chooseMove(s, difficulty, rng);
      if (!m) {
        s = E.endTurnIfStuck(s);
        break;
      }
      const res = E.applyMove(s, m);
      if (!res.ok) break;
      moves.push(m);
      s = res.state;
      guard += 1;
    }
    return { state: s, roll, moves, skipped: !!rolled.skipped };
  }

  return {
    chooseMove,
    playTurn,
    scoreBoard,
  };
});
