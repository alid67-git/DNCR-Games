const assert = require("assert");
const Boards = require("../public/boards.js");

function testTenBoards() {
  assert.strictEqual(Boards.BOARD_DEFS.length, 10, "tam olarak 10 oyun alanı olmalı");
  const ids = new Set(Boards.BOARD_DEFS.map((b) => b.id));
  assert.strictEqual(ids.size, 10, "board id'leri benzersiz olmalı");
}

function testSixGridsInRange() {
  const grids = Boards.BOARD_DEFS.filter((b) => b.category === "grid");
  assert.strictEqual(grids.length, 6, "6 klasik ızgara tahtası olmalı");
  for (const def of grids) {
    const g = Boards.getGraph(def.id);
    assert.ok(g.dotRows >= 8 && g.dotRows <= 10, `${def.id} dot satırı 8-10 aralığında olmalı`);
    assert.ok(g.dotCols >= 8 && g.dotCols <= 10, `${def.id} dot sütunu 8-10 aralığında olmalı`);
  }
}

function testFourShapes() {
  const shapes = Boards.BOARD_DEFS.filter((b) => b.category === "shape");
  assert.strictEqual(shapes.length, 4, "4 şekilli (yıldız/hayvan) tahta olmalı");
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

testTenBoards();
testSixGridsInRange();
testFourShapes();
testGraphIntegrity();
console.log("boards.test.js — tüm testler geçti");
