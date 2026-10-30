/**
 * DNCR Games — basit undo/redo yığını
 * window.DncrHistory.create({ max?: number })
 *
 * Snapshots are opaque (string/object); caller serializes/deserializes.
 */
(function (root) {
  "use strict";

  function create(opts) {
    const max = (opts && opts.max) || 40;
    let undo = [];
    let redo = [];

    return {
      clear() {
        undo = [];
        redo = [];
      },
      push(snap) {
        if (snap == null) return;
        undo.push(snap);
        if (undo.length > max) undo.shift();
        redo = [];
      },
      canUndo() {
        return undo.length > 0;
      },
      canRedo() {
        return redo.length > 0;
      },
      /** current → redo; returns previous snap or null */
      undo(current) {
        if (!undo.length) return null;
        if (current != null) {
          redo.push(current);
          if (redo.length > max) redo.shift();
        }
        return undo.pop();
      },
      /** current → undo; returns next redo snap or null */
      redo(current) {
        if (!redo.length) return null;
        if (current != null) {
          undo.push(current);
          if (undo.length > max) undo.shift();
        }
        return redo.pop();
      },
      sizes() {
        return { undo: undo.length, redo: redo.length };
      },
    };
  }

  root.DncrHistory = { create };
})(typeof window !== "undefined" ? window : globalThis);
