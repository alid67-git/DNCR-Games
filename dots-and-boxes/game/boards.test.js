const assert = require("assert");
const Boards = require("../public/boards.js");

function testSevenBoards() {
  assert.strictEqual(Boards.BOARD_DEFS.length, 7, "tam olarak 7 oyun alanı olmalı");
  const ids = new Set(Boards.BOARD_DEFS.map((b) => b.id));
  assert.strictEqual(ids.size, 7, "board id'leri benzersiz olmalı");
}

function testFourClassicGrids() {
  const grids = Boards.BOARD_DEFS.filter((b) => b.category === "grid");
  assert.strictEqual(grids.length, 4, "4 klasik ızgara tahtası olmalı");
  const expected = {
    "grid-6x6": [6, 6],
    "grid-6x8": [6, 8],
    "grid-8x10": [8, 10],
    "grid-10x10": [10, 10],
  };
  for (const def of grids) {
    const g = Boards.getGraph(def.id);
    const want = expected[def.id];
    assert.ok(want, `beklenmeyen grid id: ${def.id}`);
    assert.strictEqual(g.dotRows, want[0], `${def.id} dot satırı`);
    assert.strictEqual(g.dotCols, want[1], `${def.id} dot sütunu`);
    assert.ok(g.totalBoxes > 0, `${def.id} en az bir kutu olmalı`);
  }
}

function testThreeShapes() {
  const shapes = Boards.BOARD_DEFS.filter((b) => b.category === "shape");
  assert.strictEqual(shapes.length, 3, "3 şekilli tahta olmalı");
  const shapeIds = shapes.map((b) => b.id).sort();
  assert.deepStrictEqual(shapeIds, ["shape-diamond", "shape-plus", "shape-star"]);
  for (const def of shapes) {
    const g = Boards.getGraph(def.id);
    assert.ok(g.totalBoxes > 10, `${def.id} yeterince kutuya sahip olmalı`);
    // Dikdörtgen olmayan bir şekil olmalı (en az bir satırda eksik kutu var)
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
    // Her aktif nokta en az bir kenara bağlı olmalı.
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

testSevenBoards();
testFourClassicGrids();
testThreeShapes();
testGraphIntegrity();
console.log("boards.test.js — tüm testler geçti");
