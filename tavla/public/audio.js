/**
 * Tavla — Web Audio müzik + zar/hamle SFX (dosya yok, sentez)
 * window.TavlaAudio
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

  const state = {
    music: true,
    sfx: true,
    musicVol: 0.18,
    sfxVol: 0.55,
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

  function noiseBurst(dur, gain, when, freq, q) {
    const c = ensure();
    if (!c || !sfxGain) return;
    const t0 = when != null ? when : c.currentTime;
    const n = Math.max(1, (c.sampleRate * dur) | 0);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq || 1200;
    f.Q.value = q != null ? q : 0.9;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Zar yuvarlanma — çıtır gürültü + tahta tıkırtısı */
  function playDiceRoll() {
    if (!state.sfx) return;
    const c = ensure();
    if (!c || !sfxGain) return;
    unlock();
    const t = c.currentTime;
    // Başlangıç fırlatma
    noiseBurst(0.09, 0.14, t, 1800, 0.7);
    tone(180, 0.06, "triangle", 0.05, t, sfxGain, 90);
    // Yuvarlanma tıkırtıları
    const clacks = [0.08, 0.16, 0.24, 0.34, 0.44, 0.55, 0.66, 0.76];
    clacks.forEach((off, i) => {
      const g = 0.09 - i * 0.006;
      noiseBurst(0.045, Math.max(0.03, g), t + off, 1400 + (i % 3) * 280, 1.1);
      tone(220 + (i % 4) * 40, 0.035, "square", 0.028, t + off, sfxGain);
    });
    // Masaya oturma
    noiseBurst(0.07, 0.12, t + 0.84, 900, 0.8);
    tone(140, 0.08, "triangle", 0.07, t + 0.84, sfxGain);
    tone(280, 0.1, "sine", 0.05, t + 0.88, sfxGain);
  }

  function playSfx(name) {
    if (!state.sfx) return;
    const c = ensure();
    if (!c || !sfxGain) return;
    const t = c.currentTime;
    switch (name) {
      case "dice":
      case "roll":
        playDiceRoll();
        break;
      case "select":
        tone(520, 0.05, "sine", 0.07, t, sfxGain);
        tone(780, 0.06, "triangle", 0.04, t + 0.02, sfxGain);
        break;
      case "place":
      case "move":
        tone(360, 0.12, "triangle", 0.1, t, sfxGain, 480);
        tone(560, 0.1, "sine", 0.06, t + 0.05, sfxGain);
        break;
      case "capture":
        tone(240, 0.12, "square", 0.08, t, sfxGain);
        tone(380, 0.16, "triangle", 0.1, t + 0.04, sfxGain);
        noiseBurst(0.06, 0.05, t + 0.02, 700);
        break;
      case "claim":
      case "bear":
        tone(480, 0.1, "triangle", 0.1, t, sfxGain);
        tone(720, 0.14, "sine", 0.08, t + 0.05, sfxGain);
        break;
      case "win":
        [523, 659, 784, 987].forEach((f, i) =>
          tone(f, 0.28, "triangle", 0.1, t + i * 0.1, sfxGain)
        );
        break;
      case "lose":
        tone(320, 0.28, "triangle", 0.09, t, sfxGain, 160);
        tone(200, 0.35, "sine", 0.08, t + 0.12, sfxGain);
        break;
      default:
        tone(500, 0.07, "sine", 0.06, t, sfxGain);
        break;
    }
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

  /** Sakin tahta ambiyansı — yeşil/mavi hissi, düşük arpej */
  function startMusic() {
    const c = ensure();
    if (!c || !musicGain || !state.music) return;
    stopMusic();
    musicGain.gain.setTargetAtTime(state.musicVol, c.currentTime, 0.35);

    const pads = [98, 146.83, 196, 246.94];
    pads.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      g.gain.value = 0.028 + (i === 0 ? 0.015 : 0);
      o.connect(g);
      g.connect(musicGain);
      o.start();
      musicNodes.push(o);
    });

    let step = 0;
    const arp = [196, 246.94, 293.66, 349.23, 293.66, 246.94, 220, 196];
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
      g.gain.exponentialRampToValueAtTime(0.038, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.35);
      o.connect(g);
      g.connect(musicGain);
      o.start(t0);
      o.stop(t0 + 1.45);
    }, 1600);
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

  root.TavlaAudio = {
    unlock,
    playSfx,
    playDiceRoll,
    startMusic,
    stopMusic,
    setMusic,
    setSfx,
    applyPrefs,
    getState: () => ({ ...state, unlocked }),
  };
})(typeof window !== "undefined" ? window : globalThis);
