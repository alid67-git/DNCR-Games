/**
 * Tavla — zar/hamle SFX + arka plan piyano (müzik ve efektler ayrı)
 * window.TavlaAudio
 */
(function (root) {
  "use strict";

  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let musicEl = null;
  let unlocked = false;
  let loadPromise = null;

  const state = {
    music: true,
    sfx: true,
    musicVol: 0.22,
    sfxVol: 0.7,
  };

  /** @type {AudioBuffer[]} */
  let diceBuffers = [];
  /** @type {AudioBuffer[]} */
  let woodBuffers = [];

  const DICE_URLS = [
    "assets/sfx/dice-roll-06.ogg",
    "assets/sfx/dice-roll-08.ogg",
    "assets/sfx/dice-roll-11.ogg",
    "assets/sfx/dice-roll-17.ogg",
    "assets/sfx/wood-die-1.ogg",
    "assets/sfx/wood-die-3.ogg",
    "assets/sfx/wood-die-4.ogg",
  ];
  const DICE_FALLBACK = [
    "assets/sfx/dice-roll-06.mp3",
    "assets/sfx/dice-roll-08.mp3",
    "assets/sfx/dice-roll-11.mp3",
    "assets/sfx/dice-roll-17.mp3",
    "assets/sfx/wood-die-1.mp3",
    "assets/sfx/wood-die-3.mp3",
    "assets/sfx/wood-die-4.mp3",
  ];
  const MUSIC_OGG = "assets/sfx/piano-concerto-mini.ogg";
  const MUSIC_MP3 = "assets/sfx/piano-concerto-mini.mp3";

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
    preload();
    return unlocked;
  }

  function decodeFetch(url) {
    const c = ensure();
    if (!c) return Promise.resolve(null);
    return fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("fetch " + url);
        return r.arrayBuffer();
      })
      .then((buf) => c.decodeAudioData(buf.slice(0)))
      .catch(() => null);
  }

  function preload() {
    if (loadPromise) return loadPromise;
    const c = ensure();
    if (!c) return Promise.resolve();
    loadPromise = Promise.all(
      DICE_URLS.map((url, i) =>
        decodeFetch(url).then((buf) => {
          if (buf) return buf;
          return decodeFetch(DICE_FALLBACK[i]);
        })
      )
    ).then((bufs) => {
      diceBuffers = bufs.filter(Boolean).slice(0, 4);
      woodBuffers = bufs.filter(Boolean).slice(4);
      if (!diceBuffers.length && woodBuffers.length) diceBuffers = woodBuffers.slice();
    });
    return loadPromise;
  }

  function playBuffer(buf, gainMul, when, rate) {
    const c = ensure();
    if (!c || !sfxGain || !buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    if (rate) src.playbackRate.value = rate;
    const g = c.createGain();
    const t0 = when != null ? when : c.currentTime;
    const vol = Math.max(0.001, (gainMul != null ? gainMul : 1) * 0.95);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.08, buf.duration * 0.98));
    src.connect(g);
    g.connect(sfxGain);
    src.start(t0);
  }

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[(Math.random() * arr.length) | 0];
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
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq || 900;
    f.Q.value = q != null ? q : 0.8;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Zar — kayıtlı örnek; yoksa yumuşak tahta tıkırtısı */
  function playDiceRoll() {
    if (!state.sfx) return;
    const c = ensure();
    if (!c || !sfxGain) return;
    unlock();
    preload().then(() => {
      const c2 = ensure();
      if (!c2 || !sfxGain || !state.sfx) return;
      const primary = pick(diceBuffers) || pick(woodBuffers);
      if (primary) {
        const rate = 0.92 + Math.random() * 0.16;
        playBuffer(primary, 1.05, c2.currentTime, rate);
        const wood = pick(woodBuffers);
        if (wood && wood !== primary) {
          playBuffer(wood, 0.45, c2.currentTime + 0.05 + Math.random() * 0.08, 0.95 + Math.random() * 0.1);
        }
        return;
      }
      // Fallback: softer wood clacks (no harsh square wave)
      const t = c2.currentTime;
      noiseBurst(0.07, 0.1, t, 1600, 0.6);
      [0.1, 0.22, 0.36, 0.52, 0.7].forEach((off, i) => {
        noiseBurst(0.04, 0.08 - i * 0.01, t + off, 1100 + i * 120, 0.9);
        tone(160 + i * 18, 0.04, "triangle", 0.04, t + off, sfxGain);
      });
      noiseBurst(0.08, 0.1, t + 0.85, 700, 0.7);
      tone(120, 0.1, "sine", 0.06, t + 0.85, sfxGain);
    });
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
        tone(420, 0.05, "sine", 0.05, t, sfxGain);
        break;
      case "place":
      case "move":
        tone(280, 0.09, "sine", 0.07, t, sfxGain, 340);
        noiseBurst(0.035, 0.04, t, 600, 0.7);
        break;
      case "capture":
        tone(200, 0.1, "triangle", 0.07, t, sfxGain);
        noiseBurst(0.05, 0.06, t + 0.02, 500);
        break;
      case "claim":
      case "bear":
        tone(360, 0.1, "sine", 0.07, t, sfxGain);
        tone(480, 0.12, "sine", 0.05, t + 0.06, sfxGain);
        break;
      case "win":
        [392, 494, 587, 784].forEach((f, i) =>
          tone(f, 0.26, "sine", 0.07, t + i * 0.1, sfxGain)
        );
        break;
      case "lose":
        tone(280, 0.25, "sine", 0.06, t, sfxGain, 140);
        break;
      default:
        tone(400, 0.06, "sine", 0.04, t, sfxGain);
        break;
    }
  }

  function stopMusic() {
    if (musicEl) {
      try {
        musicEl.pause();
        musicEl.currentTime = 0;
      } catch (_) {}
    }
  }

  function ensureMusicEl() {
    if (musicEl) return musicEl;
    const a = new Audio();
    a.loop = true;
    a.preload = "auto";
    const o = document.createElement("source");
    o.src = MUSIC_OGG;
    o.type = "audio/ogg";
    const m = document.createElement("source");
    m.src = MUSIC_MP3;
    m.type = "audio/mpeg";
    a.appendChild(o);
    a.appendChild(m);
    a.volume = Math.min(1, Math.max(0.05, state.musicVol));
    musicEl = a;
    return a;
  }

  /** Arka plan piyano — SFX’ten bağımsız; yalnızca state.music açıkken */
  function startMusic() {
    const c = ensure();
    if (!c || !musicGain || !state.music) return;
    stopMusic();
    musicGain.gain.setTargetAtTime(state.musicVol, c.currentTime, 0.35);
    const el = ensureMusicEl();
    el.volume = Math.min(1, Math.max(0.05, state.musicVol));
    const play = () => {
      if (!state.music) return;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    if (el.readyState >= 2) play();
    else {
      el.addEventListener("canplaythrough", play, { once: true });
      el.load();
    }
  }

  function setMusic(on) {
    state.music = !!on;
    const c = ensure();
    if (!c || !musicGain) return;
    if (state.music) {
      musicGain.gain.setTargetAtTime(state.musicVol, c.currentTime, 0.25);
      startMusic();
    } else {
      musicGain.gain.setTargetAtTime(0, c.currentTime, 0.3);
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
    if (musicEl) musicEl.volume = Math.min(1, Math.max(0.05, state.musicVol));
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
    preload,
    getState: () => ({ ...state, unlocked, diceReady: diceBuffers.length > 0 }),
  };
})(typeof window !== "undefined" ? window : globalThis);
