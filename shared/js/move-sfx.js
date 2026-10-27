/**
 * DNCR Games — ortak hamle vurgusu SFX (Web Audio, dosya yok)
 * window.DncrMoveSfx
 *
 * Kullanım: unlock() ilk kullanıcı jestinde; play("move"|"place"|"claim"|"capture"|"mill"|"select"|"box")
 */
(function (root) {
  "use strict";

  const PREF_KEY = "dncr_move_sfx";
  let ctx = null;
  let sfxGain = null;
  let enabled = true;
  let unlocked = false;

  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw === "0" || raw === "false") enabled = false;
  } catch (_) {}

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = enabled ? 0.55 : 0;
    sfxGain.connect(ctx.destination);
    return ctx;
  }

  async function unlock() {
    const c = ensure();
    if (!c) return false;
    if (c.state === "suspended") {
      try {
        await c.resume();
      } catch (_) {}
    }
    unlocked = c.state === "running";
    return unlocked;
  }

  function tone(freq, dur, type, gain, when, slideTo) {
    const c = ensure();
    if (!c || !sfxGain) return;
    const t0 = when != null ? when : c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur * 0.85);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function play(name) {
    if (!enabled) return;
    const c = ensure();
    if (!c || !sfxGain) return;
    if (c.state === "suspended") {
      c.resume().catch(() => {});
    }
    const t = c.currentTime;
    switch (name) {
      case "select":
        tone(520, 0.05, "sine", 0.07, t);
        tone(780, 0.06, "triangle", 0.04, t + 0.02);
        break;
      case "place":
        tone(440, 0.09, "triangle", 0.11, t);
        tone(660, 0.12, "sine", 0.08, t + 0.04);
        break;
      case "claim":
      case "move":
        // Kısa parlak vurgu tonu (~0.5s görsel ile birlikte)
        tone(360, 0.12, "triangle", 0.12, t, 520);
        tone(620, 0.16, "sine", 0.09, t + 0.05);
        tone(880, 0.1, "triangle", 0.05, t + 0.12);
        break;
      case "box":
        tone(480, 0.1, "triangle", 0.12, t);
        tone(720, 0.14, "sine", 0.1, t + 0.06);
        tone(960, 0.12, "triangle", 0.06, t + 0.12);
        break;
      case "capture":
        tone(240, 0.14, "square", 0.09, t);
        tone(380, 0.18, "triangle", 0.11, t + 0.05);
        tone(560, 0.2, "sine", 0.08, t + 0.12);
        break;
      case "mill":
        tone(523, 0.14, "triangle", 0.12, t);
        tone(659, 0.16, "sine", 0.1, t + 0.08);
        tone(784, 0.18, "triangle", 0.08, t + 0.16);
        break;
      default:
        tone(500, 0.08, "sine", 0.08, t);
        break;
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    try {
      localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
    } catch (_) {}
    const c = ensure();
    if (c && sfxGain) {
      sfxGain.gain.setTargetAtTime(enabled ? 0.55 : 0, c.currentTime, 0.05);
    }
  }

  function isEnabled() {
    return enabled;
  }

  /** İlk dokunuşta AudioContext’i aç (iOS/Safari). */
  function bindFirstGesture(el) {
    const target = el || (typeof document !== "undefined" ? document : null);
    if (!target || target.__dncrSfxBound) return;
    const once = () => {
      unlock();
    };
    target.addEventListener("pointerdown", once, { once: true, passive: true });
    target.addEventListener("touchstart", once, { once: true, passive: true });
    target.addEventListener("keydown", once, { once: true });
    target.__dncrSfxBound = true;
  }

  root.DncrMoveSfx = {
    unlock,
    play,
    setEnabled,
    isEnabled,
    bindFirstGesture,
  };
})(typeof window !== "undefined" ? window : globalThis);
