/**
 * Kuşatma — Web Audio müzik + SFX (dosya yok, sentez)
 * window.SiegeAudio
 */
(function (root) {
  "use strict";

  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicNodes = [];
  let musicTimer = null;
  let unlocked = false;
  let lastUiClickAt = 0;

  const state = {
    music: true,
    sfx: true,
    musicVol: 0.22,
    sfxVol: 0.5,
  };

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = state.music ? state.musicVol : 0;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = state.sfx ? state.sfxVol : 0;
    sfxGain.connect(master);
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

  function tone(freq, dur, type, gain, when, dest, slideTo) {
    const c = ensure();
    if (!c || !dest) return;
    const t0 = when != null ? when : c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur * 0.85);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, gain, when, freq) {
    const c = ensure();
    if (!c || !sfxGain) return;
    const t0 = when != null ? when : c.currentTime;
    const n = Math.max(1, (c.sampleRate * dur) | 0);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq || 900;
    f.Q.value = 0.8;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function playSfx(name) {
    if (!state.sfx) return;
    const c = ensure();
    if (!c || !sfxGain) return;
    const t = c.currentTime;
    switch (name) {
      case "ui":
      case "click": {
        // Kısa UI tık — yumuşak tick
        tone(880, 0.035, "triangle", 0.07, t, sfxGain);
        tone(1320, 0.028, "sine", 0.035, t + 0.012, sfxGain);
        noiseBurst(0.025, 0.025, t, 2400);
        break;
      }
      case "back":
        tone(520, 0.05, "triangle", 0.06, t, sfxGain, 360);
        tone(280, 0.06, "sine", 0.04, t + 0.02, sfxGain);
        break;
      case "confirm":
        tone(520, 0.07, "triangle", 0.09, t, sfxGain);
        tone(780, 0.1, "sine", 0.08, t + 0.04, sfxGain);
        break;
      case "toggle":
        tone(640, 0.05, "sine", 0.07, t, sfxGain);
        tone(960, 0.07, "triangle", 0.05, t + 0.03, sfxGain);
        break;
      case "place":
        tone(520, 0.12, "triangle", 0.18, t, sfxGain);
        tone(780, 0.1, "sine", 0.1, t + 0.04, sfxGain);
        noiseBurst(0.04, 0.03, t + 0.02, 1200);
        break;
      case "select":
        tone(480, 0.07, "sine", 0.09, t, sfxGain);
        tone(720, 0.08, "triangle", 0.05, t + 0.03, sfxGain);
        break;
      case "draw":
        tone(260, 0.32, "sawtooth", 0.055, t, sfxGain, 420);
        tone(420, 0.26, "triangle", 0.09, t + 0.05, sfxGain);
        noiseBurst(0.12, 0.035, t + 0.02, 700);
        break;
      case "move":
        tone(330, 0.2, "triangle", 0.12, t, sfxGain, 410);
        tone(390, 0.22, "sine", 0.08, t + 0.08, sfxGain);
        break;
      case "capture":
        tone(220, 0.2, "square", 0.1, t, sfxGain);
        tone(440, 0.25, "triangle", 0.14, t + 0.06, sfxGain);
        tone(660, 0.3, "sine", 0.1, t + 0.14, sfxGain);
        break;
      case "siege":
        tone(180, 0.25, "sawtooth", 0.12, t, sfxGain);
        tone(360, 0.28, "triangle", 0.14, t + 0.08, sfxGain);
        tone(540, 0.35, "sine", 0.12, t + 0.16, sfxGain);
        noiseBurst(0.18, 0.08, t + 0.05, 500);
        break;
      case "shield":
        tone(600, 0.15, "sine", 0.1, t, sfxGain);
        tone(900, 0.2, "triangle", 0.08, t + 0.05, sfxGain);
        tone(1200, 0.18, "sine", 0.05, t + 0.1, sfxGain);
        break;
      case "win":
        [523, 659, 784, 1046].forEach((f, i) =>
          tone(f, 0.35, "triangle", 0.12, t + i * 0.12, sfxGain)
        );
        break;
      case "lose":
        tone(300, 0.3, "triangle", 0.1, t, sfxGain, 180);
        tone(220, 0.4, "sine", 0.1, t + 0.15, sfxGain);
        break;
      case "invalid":
        tone(180, 0.1, "square", 0.07, t, sfxGain);
        tone(140, 0.12, "sawtooth", 0.05, t + 0.05, sfxGain);
        break;
      default:
        break;
    }
  }

  /** Menü / buton tıklamaları — debounce ile çift sesi engeller */
  function uiClick(kind) {
    const now = Date.now();
    if (now - lastUiClickAt < 40) return;
    lastUiClickAt = now;
    unlock();
    playSfx(kind || "ui");
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    for (const n of musicNodes) {
      try {
        n.stop();
      } catch (_) {}
    }
    musicNodes = [];
  }

  function startMusic() {
    const c = ensure();
    if (!c || !musicGain || !state.music) return;
    stopMusic();
    musicGain.gain.setTargetAtTime(state.musicVol, c.currentTime, 0.3);

    const freqs = [110, 164.81, 196, 246.94];
    freqs.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      g.gain.value = 0.035 + (i === 0 ? 0.02 : 0);
      o.connect(g);
      g.connect(musicGain);
      o.start();
      musicNodes.push(o);
    });

    let step = 0;
    const arp = [220, 261.63, 329.63, 392, 329.63, 261.63];
    musicTimer = setInterval(() => {
      if (!state.music || !musicGain) return;
      const c2 = ensure();
      if (!c2) return;
      const f = arp[step % arp.length];
      step += 1;
      const o = c2.createOscillator();
      const g = c2.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = c2.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
      o.connect(g);
      g.connect(musicGain);
      o.start(t0);
      o.stop(t0 + 1.2);
    }, 1400);
  }

  function setMusic(on) {
    state.music = !!on;
    const c = ensure();
    if (!c || !musicGain) return;
    if (state.music) {
      musicGain.gain.setTargetAtTime(state.musicVol, c.currentTime, 0.2);
      if (!musicNodes.length) startMusic();
    } else {
      musicGain.gain.setTargetAtTime(0, c.currentTime, 0.25);
      stopMusic();
    }
  }

  function setSfx(on) {
    state.sfx = !!on;
    const c = ensure();
    if (!c || !sfxGain) return;
    sfxGain.gain.setTargetAtTime(state.sfx ? state.sfxVol : 0, c.currentTime, 0.05);
  }

  function applyPrefs(prefs) {
    if (!prefs) return;
    if (prefs.music != null) state.music = !!prefs.music;
    if (prefs.sfx != null) state.sfx = !!prefs.sfx;
    if (typeof prefs.musicVol === "number") state.musicVol = prefs.musicVol;
    if (typeof prefs.sfxVol === "number") state.sfxVol = prefs.sfxVol;
    const c = ensure();
    if (c && musicGain) musicGain.gain.value = state.music ? state.musicVol : 0;
    if (c && sfxGain) sfxGain.gain.value = state.sfx ? state.sfxVol : 0;
  }

  root.SiegeAudio = {
    unlock,
    playSfx,
    uiClick,
    startMusic,
    stopMusic,
    setMusic,
    setSfx,
    applyPrefs,
    getState: () => ({ ...state, unlocked }),
  };
})(typeof window !== "undefined" ? window : globalThis);
