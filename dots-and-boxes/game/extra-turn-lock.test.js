/**
 * Ekstra tur: kutu tamamlanınca sıra aynı oyuncuda kalmalı.
 * Çift hamle (yanlışlıkla ikinci kenar) sırayı rakibe verir — regresyon uyarısı.
 */
const path = require("path");
const fs = require("fs");
const vm = require("vm");

function loadBrowserScript(file, sandbox) {
  const code = fs.readFileSync(file, "utf8");
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox;
}

const root = path.join(__dirname, "..", "public");
const sandbox = { window: {}, console };
sandbox.window = sandbox;
loadBrowserScript(path.join(root, "boards.js"), sandbox);
loadBrowserScript(path.join(root, "engine.js"), sandbox);

const Boards = sandbox.window.DotsBoards;
const Engine = sandbox.window.DotsEngine;
const { PLAYERS, createGameState, applyMove } = Engine;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const boardId = "grid-8x8";
const graph = Boards.getGraph(boardId);
let state = createGameState(boardId, PLAYERS.A);

// İlk kutunun üç kenarını çiz (A), dördüncüyü de A çizince kutu + ekstra tur
const box0 = graph.boxes[0];
const edges = box0.edges.slice();
assert(edges.length === 4, "kutu 4 kenar olmalı");

for (let i = 0; i < 3; i++) {
  const r = applyMove(boardId, state, edges[i], state.turn);
  assert(r.ok, `ön kenar ${i} başarısız`);
  state = r.state;
  // Sıra değişmiş olabilir; test için turu A'ya zorla (setup)
  state = { ...state, turn: PLAYERS.A };
}

const before = state.scores.A;
const closing = applyMove(boardId, state, edges[3], PLAYERS.A);
assert(closing.ok, "kapanış kenarı başarısız");
assert(closing.state.scores.A === before + 1, "skor artmalı");
assert(
  closing.state.lastMove.boxesCompleted.length >= 1,
  "boxesCompleted dolu olmalı"
);
assert(
  closing.state.turn === PLAYERS.A,
  `ekstra tur A'da kalmalı, turn=${closing.state.turn}`
);

// Çift hamle simülasyonu: kutu sonrası hemen başka kenar → sıra B'ye geçer
const undrawn = [...graph.edges.keys()].find((id) => !closing.state.edgeDrawnBy[id]);
assert(undrawn, "boş kenar olmalı");
const stolen = applyMove(boardId, closing.state, undrawn, PLAYERS.A);
assert(stolen.ok, "ikinci hamle engine'de geçerli");
assert(
  stolen.state.turn === PLAYERS.B || stolen.state.lastMove.boxesCompleted.length > 0,
  "kutu yoksa sıra B'ye geçmeli — UI kilidi bunu engellemeli"
);

console.log("extra-turn-lock.test.js — tüm testler geçti");
