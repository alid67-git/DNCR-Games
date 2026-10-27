/**
 * Noktalar ve Kutular — oyun alanı (board) tanımları.
 *
 * Her board bir "mask" (satır x sütun kutu ızgarası, true = kutu var) ile
 * tanımlanır. Dikdörtgen tahtalar için mask tamamen dolu; yıldız/hayvan
 * şekilli tahtalar için mask bir piksel-art silüeti temsil eder. Mask'tan
 * noktalar (dots), kenarlar (edges) ve kutular (boxes) grafiği otomatik
 * olarak üretilir — bu yüzden herhangi bir şekil güvenle eklenebilir.
 */
(function (root) {
  "use strict";

  // ——— basit geometri yardımcıları (şekil üretimi için) ———
  function pointInEllipse(x, y, cx, cy, rx, ry) {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function sign(x1, y1, x2, y2, x3, y3) {
    return (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  }

  function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = sign(px, py, ax, ay, bx, by);
    const d2 = sign(px, py, bx, by, cx, cy);
    const d3 = sign(px, py, cx, cy, ax, ay);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  }

  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0],
        yi = pts[i][1];
      const xj = pts[j][0],
        yj = pts[j][1];
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Beş köşeli yıldız poligonunun köşe noktalarını üretir. */
  function starPoints(cx, cy, outerR, innerR, rotationDeg) {
    const pts = [];
    const rot = ((rotationDeg || -90) * Math.PI) / 180;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = rot + (i * Math.PI) / 5;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  /** rows x cols boyutunda, test(cx,cy) fonksiyonuna göre mask üretir. */
  function rasterize(rows, cols, test) {
    const mask = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push(test(c + 0.5, r + 0.5) ? 1 : 0);
      }
      mask.push(row);
    }
    return mask;
  }

  function fullMask(rows, cols) {
    return rasterize(rows, cols, () => true);
  }

  /** En büyük bağlı bileşeni tutar, küçük izole adacıkları temizler. */
  function keepLargestComponent(mask) {
    const rows = mask.length;
    const cols = mask[0].length;
    const seen = rasterize(rows, cols, () => false).map((r) => r.map(() => false));
    let best = null;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!mask[r][c] || seen[r][c]) continue;
        const stack = [[r, c]];
        seen[r][c] = true;
        const cells = [];
        while (stack.length) {
          const [cr, cc] = stack.pop();
          cells.push([cr, cc]);
          const neigh = [
            [cr - 1, cc],
            [cr + 1, cc],
            [cr, cc - 1],
            [cr, cc + 1],
            [cr - 1, cc - 1],
            [cr - 1, cc + 1],
            [cr + 1, cc - 1],
            [cr + 1, cc + 1],
          ];
          for (const [nr, nc] of neigh) {
            if (
              nr >= 0 &&
              nr < rows &&
              nc >= 0 &&
              nc < cols &&
              mask[nr][nc] &&
              !seen[nr][nc]
            ) {
              seen[nr][nc] = true;
              stack.push([nr, nc]);
            }
          }
        }
        if (!best || cells.length > best.length) best = cells;
      }
    }
    const out = rasterize(rows, cols, () => false).map((r) => r.map(() => false));
    if (best) for (const [r, c] of best) out[r][c] = true;
    return out.map((row) => row.map((v) => (v ? 1 : 0)));
  }

  /** Tamamen boş kenar satır/sütunları kırpar. */
  function cropToBoundingBox(mask) {
    const rows = mask.length;
    const cols = mask[0].length;
    let minR = rows,
      maxR = -1,
      minC = cols,
      maxC = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (mask[r][c]) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }
    if (maxR < 0) return mask;
    const out = [];
    for (let r = minR; r <= maxR; r++) {
      out.push(mask[r].slice(minC, maxC + 1));
    }
    return out;
  }

  function maskToAscii(mask) {
    return mask.map((row) => row.map((v) => (v ? "#" : ".")).join("")).join("\n");
  }

  // ——— şekil üreticileri ———

  function starMask() {
    const size = 13;
    const pts = starPoints(size / 2, size / 2, size * 0.47, size * 0.19, -90);
    const m = rasterize(size, size, (x, y) => pointInPolygon(x, y, pts));
    return cropToBoundingBox(keepLargestComponent(m));
  }

  function catMask() {
    const cols = 11;
    const rows = 10;
    return cropToBoundingBox(keepLargestComponent(
      rasterize(rows, cols, (x, y) => {
        // Kafa (daire)
        const head = pointInEllipse(x, y, cols / 2, rows / 2 + 1.1, cols * 0.42, rows * 0.4);
        // Kulaklar (iki üçgen)
        const leftEar = pointInTriangle(
          x,
          y,
          cols * 0.18,
          rows * 0.08,
          cols * 0.1,
          rows * 0.46,
          cols * 0.46,
          rows * 0.34
        );
        const rightEar = pointInTriangle(
          x,
          y,
          cols * 0.82,
          rows * 0.08,
          cols * 0.9,
          rows * 0.46,
          cols * 0.54,
          rows * 0.34
        );
        return head || leftEar || rightEar;
      })
    ));
  }

  function fishMask() {
    const cols = 14;
    const rows = 8;
    return cropToBoundingBox(keepLargestComponent(
      rasterize(rows, cols, (x, y) => {
        const body = pointInEllipse(x, y, cols * 0.42, rows * 0.5, cols * 0.34, rows * 0.4);
        const tail = pointInTriangle(
          x,
          y,
          cols * 0.72,
          rows * 0.18,
          cols * 0.72,
          rows * 0.82,
          cols * 0.98,
          rows * 0.5
        );
        return body || tail;
      })
    ));
  }

  function rabbitMask() {
    const cols = 11;
    const rows = 13;
    return cropToBoundingBox(keepLargestComponent(
      rasterize(rows, cols, (x, y) => {
        const head = pointInEllipse(x, y, cols * 0.5, rows * 0.72, cols * 0.4, rows * 0.32);
        const leftEar = pointInEllipse(x, y, cols * 0.34, rows * 0.28, cols * 0.15, rows * 0.32);
        const rightEar = pointInEllipse(x, y, cols * 0.66, rows * 0.28, cols * 0.15, rows * 0.32);
        return head || leftEar || rightEar;
      })
    ));
  }

  function heartMask() {
    const size = 12;
    return cropToBoundingBox(keepLargestComponent(
      rasterize(size, size, (px, py) => {
        // normalize -1.3..1.3 aralığına
        const x = (px / size) * 2.6 - 1.3;
        const y = 1.2 - (py / size) * 2.5;
        const v = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
        return v <= 0;
      })
    ));
  }

  // ——— mask -> oyun grafiği (dots/edges/boxes) ———

  function buildGraphFromMask(mask) {
    const rows = mask.length;
    const cols = mask[0].length;
    const isBox = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && !!mask[r][c];

    const dotRows = rows + 1;
    const dotCols = cols + 1;
    const dotActive = [];
    for (let r = 0; r < dotRows; r++) {
      const row = [];
      for (let c = 0; c < dotCols; c++) {
        row.push(
          isBox(r - 1, c - 1) || isBox(r - 1, c) || isBox(r, c - 1) || isBox(r, c)
        );
      }
      dotActive.push(row);
    }

    const edges = new Map(); // id -> {type:'H'|'V', r, c, dotA, dotB}
    function hId(r, c) {
      return `H${r}_${c}`;
    }
    function vId(r, c) {
      return `V${r}_${c}`;
    }

    for (let r = 0; r < dotRows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isBox(r - 1, c) || isBox(r, c)) {
          edges.set(hId(r, c), {
            id: hId(r, c),
            type: "H",
            dotA: [r, c],
            dotB: [r, c + 1],
          });
        }
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < dotCols; c++) {
        if (isBox(r, c - 1) || isBox(r, c)) {
          edges.set(vId(r, c), {
            id: vId(r, c),
            type: "V",
            dotA: [r, c],
            dotB: [r + 1, c],
          });
        }
      }
    }

    const boxes = [];
    const boxIndexByCell = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isBox(r, c)) continue;
        const idx = boxes.length;
        boxIndexByCell[`${r}_${c}`] = idx;
        boxes.push({
          index: idx,
          r,
          c,
          edges: [hId(r, c), hId(r + 1, c), vId(r, c), vId(r, c + 1)],
        });
      }
    }

    const edgeToBoxes = new Map();
    for (const box of boxes) {
      for (const eid of box.edges) {
        if (!edgeToBoxes.has(eid)) edgeToBoxes.set(eid, []);
        edgeToBoxes.get(eid).push(box.index);
      }
    }

    const dots = [];
    for (let r = 0; r < dotRows; r++) {
      for (let c = 0; c < dotCols; c++) {
        if (dotActive[r][c]) dots.push([r, c]);
      }
    }

    return {
      rows,
      cols,
      dotRows,
      dotCols,
      dotActive,
      dots,
      edges, // Map id -> {id,type,dotA,dotB}
      edgeIds: Array.from(edges.keys()),
      boxes, // [{index,r,c,edges:[4 ids]}]
      edgeToBoxes, // Map id -> [boxIndex,...]
      totalBoxes: boxes.length,
      totalEdges: edges.size,
    };
  }

  // ——— 10 oyun alanı tanımı ———
  // 6 tanesi 8-10 nokta aralığında klasik ızgara, 4 tanesi yıldız/hayvan şekli.

  const BOARD_DEFS = [
    {
      id: "grid-8x8",
      category: "grid",
      names: { tr: "Klasik 8×8", en: "Classic 8×8" },
      mask: fullMask(7, 7),
      difficulty: "easy",
    },
    {
      id: "grid-8x9",
      category: "grid",
      names: { tr: "Klasik 8×9", en: "Classic 8×9" },
      mask: fullMask(7, 8),
      difficulty: "easy",
    },
    {
      id: "grid-9x9",
      category: "grid",
      names: { tr: "Klasik 9×9", en: "Classic 9×9" },
      mask: fullMask(8, 8),
      difficulty: "medium",
    },
    {
      id: "grid-8x10",
      category: "grid",
      names: { tr: "Klasik 8×10", en: "Classic 8×10" },
      mask: fullMask(7, 9),
      difficulty: "medium",
    },
    {
      id: "grid-9x10",
      category: "grid",
      names: { tr: "Klasik 9×10", en: "Classic 9×10" },
      mask: fullMask(8, 9),
      difficulty: "hard",
    },
    {
      id: "grid-10x10",
      category: "grid",
      names: { tr: "Klasik 10×10", en: "Classic 10×10" },
      mask: fullMask(9, 9),
      difficulty: "veryhard",
    },
    {
      id: "shape-star",
      category: "shape",
      names: { tr: "Yıldız", en: "Star" },
      mask: starMask(),
      difficulty: "medium",
    },
    {
      id: "shape-cat",
      category: "shape",
      names: { tr: "Kedi", en: "Cat" },
      mask: catMask(),
      difficulty: "medium",
    },
    {
      id: "shape-fish",
      category: "shape",
      names: { tr: "Balık", en: "Fish" },
      mask: fishMask(),
      difficulty: "hard",
    },
    {
      id: "shape-rabbit",
      category: "shape",
      names: { tr: "Tavşan", en: "Rabbit" },
      mask: rabbitMask(),
      difficulty: "hard",
    },
  ];

  const graphCache = new Map();
  function getBoardDef(id) {
    return BOARD_DEFS.find((b) => b.id === id) || BOARD_DEFS[0];
  }
  function getGraph(id) {
    if (graphCache.has(id)) return graphCache.get(id);
    const def = getBoardDef(id);
    const g = buildGraphFromMask(def.mask);
    graphCache.set(id, g);
    return g;
  }

  const api = {
    BOARD_DEFS,
    getBoardDef,
    getGraph,
    buildGraphFromMask,
    maskToAscii,
    heartMask, // exported mainly for tests/debug
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DotsBoards = api;
})(typeof window !== "undefined" ? window : globalThis);
