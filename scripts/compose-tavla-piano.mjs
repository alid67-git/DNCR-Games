#!/usr/bin/env node
/**
 * Original soft piano miniature for Tavla BGM (loopable).
 * Writes WAV → ffmpeg → ogg + mp3 under tavla/public/assets/sfx/
 *
 * Not a licensed recording — synthesized for this project.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "tavla/public/assets/sfx");
const wavPath = path.join(outDir, "piano-concerto-mini.wav");

const SR = 44100;
const BPM = 72;
const BEAT = 60 / BPM;

function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Soft struck-string / piano-ish voice */
function pianoSample(freq, dur, velocity = 0.55) {
  const n = Math.max(1, Math.floor(SR * dur));
  const data = new Float64Array(n);
  const attack = Math.min(0.012, dur * 0.08);
  const decay = Math.min(0.35, dur * 0.45);
  // Inharmonic partials approximate a small upright
  const partials = [
    [1, 1],
    [2, 0.42],
    [3, 0.18],
    [4.002, 0.1],
    [5.01, 0.06],
    [6.02, 0.035],
    [7.04, 0.02],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env;
    if (t < attack) env = t / attack;
    else {
      const u = (t - attack) / Math.max(0.001, dur - attack);
      env = Math.exp(-u * (2.2 + (1 - velocity) * 2.5)) * (1 - 0.15 * u);
    }
    // Soft hammer noise blip
    const hammer = t < 0.008 ? (Math.random() * 2 - 1) * (1 - t / 0.008) * 0.12 * velocity : 0;
    let s = hammer;
    for (const [mul, amp] of partials) {
      const f = freq * mul;
      const damp = Math.exp(-t * (0.35 + mul * 0.55));
      s += Math.sin(2 * Math.PI * f * t) * amp * damp;
      // subtle detuned twin for body
      if (mul <= 2) {
        s += Math.sin(2 * Math.PI * f * 1.0015 * t) * amp * 0.22 * damp;
      }
    }
    data[i] = s * env * velocity * 0.34;
  }
  return data;
}

function mixInto(out, sample, startSec, gain = 1) {
  const start = Math.floor(startSec * SR);
  for (let i = 0; i < sample.length; i++) {
    const j = start + i;
    if (j >= out.length) break;
    out[j] += sample[i] * gain;
  }
}

/**
 * Miniature in C major — gentle "concerto" feel:
 * Alberti left hand + singing right-hand melody, ABA, loop-friendly cadence.
 * Form (~64s): Intro → Theme A → Episode → Theme A' → Soft coda
 */
function compose() {
  const bars = 32; // 4/4
  const duration = bars * 4 * BEAT + 0.6;
  const out = new Float64Array(Math.floor(SR * duration));

  // Left-hand Alberti patterns (midi)
  // C: C3 E3 G3 E3  | F: F3 A3 C4 A3 | G: G3 B3 D4 B3 | Am: A2 C3 E3 C3
  const LH = {
    C: [48, 52, 55, 52],
    F: [53, 57, 60, 57],
    G: [55, 59, 62, 59],
    Am: [45, 48, 52, 48],
    Dm: [50, 53, 57, 53],
    Em: [52, 55, 59, 55],
    G7: [55, 59, 62, 53],
  };

  // Harmony plan per bar
  const harm = [
    "C", "C", "F", "C",
    "Am", "Em", "F", "G",
    "C", "Am", "Dm", "G",
    "C", "F", "G", "C",
    // Episode (slightly brighter)
    "Am", "Em", "F", "C",
    "Dm", "G", "Em", "Am",
    // Return
    "C", "F", "Am", "G",
    "C", "F", "G7", "C",
  ];

  // Melody (midi, null = rest) — quarter / eighth mix as list of [beatOffsetInBar, midi, durBeats, vel]
  const melA = [
    [0, 72, 1, 0.62], [1, 74, 0.5, 0.5], [1.5, 76, 0.5, 0.55], [2, 77, 1, 0.58], [3, 76, 1, 0.5],
  ];
  const melA2 = [
    [0, 74, 1, 0.55], [1, 72, 1, 0.5], [2, 71, 1, 0.52], [3, 72, 1, 0.58],
  ];
  const melB = [
    [0, 76, 0.5, 0.55], [0.5, 77, 0.5, 0.5], [1, 79, 1, 0.6], [2, 77, 0.5, 0.5], [2.5, 76, 0.5, 0.48], [3, 74, 1, 0.52],
  ];
  const melC = [
    [0, 72, 1.5, 0.58], [1.5, 71, 0.5, 0.45], [2, 69, 1, 0.5], [3, 67, 1, 0.48],
  ];
  const melResolve = [
    [0, 72, 1, 0.55], [1, 76, 1, 0.5], [2, 79, 1, 0.52], [3, 84, 1, 0.45],
  ];
  const melSoft = [
    [0, 76, 2, 0.4], [2, 72, 2, 0.35],
  ];

  const themes = [
    melA, melA2, melB, melA,
    melC, melB, melA2, melResolve,
    melA, melC, melB, melA2,
    melA, melSoft, melResolve, melSoft,
    melB, melC, melA2, melA,
    melC, melResolve, melB, melSoft,
    melA, melA2, melC, melB,
    melA, melSoft, melResolve, melSoft,
  ];

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * BEAT;
    const chord = LH[harm[bar]] || LH.C;
    // Alberti: 8 eighth notes (repeat pattern twice)
    for (let i = 0; i < 8; i++) {
      const note = chord[i % 4];
      const when = t0 + i * (BEAT / 2);
      const sample = pianoSample(midiToHz(note), BEAT * 0.72, 0.28 + (i % 4 === 0 ? 0.06 : 0));
      mixInto(out, sample, when, 0.78);
    }
    // Melody
    const mel = themes[bar] || melSoft;
    for (const [off, midi, durB, vel] of mel) {
      if (midi == null) continue;
      const when = t0 + off * BEAT;
      const sample = pianoSample(midiToHz(midi), durB * BEAT * 1.05, vel);
      mixInto(out, sample, when, 1.05);
    }
  }

  // Soft pedal reverb: short feedback delay mix
  const delaySamples = Math.floor(SR * 0.085);
  const wet = new Float64Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const echo = i >= delaySamples ? wet[i - delaySamples] * 0.28 + out[i - delaySamples] * 0.22 : 0;
    wet[i] = out[i] + echo;
  }

  // Normalize + gentle fade in/out for loop
  let peak = 1e-9;
  for (let i = 0; i < wet.length; i++) peak = Math.max(peak, Math.abs(wet[i]));
  const norm = 0.72 / peak;
  const fadeIn = Math.floor(SR * 0.8);
  const fadeOut = Math.floor(SR * 1.6);
  for (let i = 0; i < wet.length; i++) {
    let g = norm;
    if (i < fadeIn) g *= i / fadeIn;
    if (i > wet.length - fadeOut) g *= (wet.length - i) / fadeOut;
    wet[i] *= g;
  }

  // Write 16-bit mono WAV
  const dataSize = wet.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < wet.length; i++) {
    const s = Math.max(-1, Math.min(1, wet[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(wavPath, buf);
  console.log("Wrote", wavPath, `(${(duration).toFixed(1)}s)`);

  const ogg = path.join(outDir, "piano-concerto-mini.ogg");
  const mp3 = path.join(outDir, "piano-concerto-mini.mp3");
  const r1 = spawnSync(
    "ffmpeg",
    ["-y", "-i", wavPath, "-c:a", "libvorbis", "-q:a", "5", ogg],
    { stdio: "inherit" }
  );
  if (r1.status !== 0) process.exit(r1.status || 1);
  const r2 = spawnSync(
    "ffmpeg",
    ["-y", "-i", wavPath, "-c:a", "libmp3lame", "-q:a", "4", mp3],
    { stdio: "inherit" }
  );
  if (r2.status !== 0) process.exit(r2.status || 1);

  // Remove old drone from active use (keep files for now or delete)
  for (const name of ["ambient-soft.ogg", "ambient-soft.mp3", "piano-concerto-mini.wav"]) {
    // keep wav only as intermediate — delete wav to save repo size
  }
  fs.unlinkSync(wavPath);
  console.log("Encoded", ogg, mp3);
}

compose();
