const assert = require("assert");
const Boards = require("../public/boards.js");

function testSixBoards() {
  assert.strictEqual(Boards.BOARD_DEFS.length, 6, "tam olarak 6 oyun alanı olmalı");
  const ids = new Set(Boards.BOARD_DEFS.map((b) => b.id));
  assert.strictEqual(ids.size, 6, "board id'leri benzersiz olmalı");
  for (const id of [
    "grid-6x6",
    "grid-8x8",
    "grid-10x10",
    "shape-star",
    "shape-fish",
    "shape-heart",
  ]) {
    assert.ok(ids.has(id), `${id} tanımlı olmalı`);
  }
}

function testThreeGrids() {
  const grids = Boards.BOARD_DEFS.filter((b) => b.category === "grid");
  assert.strictEqual(grids.length, 3, "3 klasik ızgara tahtası olmalı");
  const sizes = {
    "grid-6x6": 6,
    "grid-8x8": 8,
    "grid-10x10": 10,
  };
  for (const def of grids) {
    const g = Boards.getGraph(def.id);
    const expect = sizes[def.id];
    assert.strictEqual(g.dotRows, expect, `${def.id} satır`);
    assert.strictEqual(g.dotCols, expect, `${def.id} sütun`);
  }
}

function testThreeShapes() {
  const shapes = Boards.BOARD_DEFS.filter((b) => b.category === "shape");
  assert.strictEqual(shapes.length, 3, "3 şekilli (yıldız/balık/kalp) tahta olmalı");
  for (const def of shapes) {
    const g = Boards.getGraph(def.id);
    assert.ok(g.totalBoxes > 10, `${def.id} yeterince kutuya sahip olmalı`);
    const rowLens = def.mask.map((row) => row.filter(Boolean).length);
    assert.ok(
      new Set(rowLens).size > 1 || rowLens[0] < def.mask[0].length,
      `${def.id} dikdörtgen olmayan bir silüet olmalı`
    );
  }
}

function testGraphIntegrity() {
  for (const def of Boards.BOARD_DEFS) {
    const g = Boards.getGraph(def.id);
    assert.strictEqual(g.boxes.length, g.totalBoxes);
    for (const box of g.boxes) {
      assert.strictEqual(box.edges.length, 4, "her kutunun tam 4 kenarı olmalı");
      for (const eid of box.edges) {
        assert.ok(g.edges.has(eid), `${def.id}: ${eid} grafikte tanımlı olmalı`);
      }
    }
    for (const [eid, boxIdxs] of g.edgeToBoxes) {
      assert.ok(boxIdxs.length === 1 || boxIdxs.length === 2, "bir kenar en fazla 2 kutuya ait olabilir");
    }
    const dotHasEdge = new Set();
    for (const e of g.edges.values()) {
      dotHasEdge.add(e.dotA.join(","));
      dotHasEdge.add(e.dotB.join(","));
    }
    for (const [r, c] of g.dots) {
      assert.ok(dotHasEdge.has(`${r},${c}`), `nokta (${r},${c}) en az bir kenara bağlı olmalı`);
    }
  }
}

testSixBoards();
testThreeGrids();
testThreeShapes();
testGraphIntegrity();
console.log("boards.test.js — tüm testler geçti");
