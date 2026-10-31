#!/usr/bin/env node
/**
 * PR / CI: oyun kaynakları değiştiyse hub sürümü de yükselmiş olmalı.
 *
 * Env:
 *   BASE_SHA  — karşılaştırma tabanı (zorunlu CI'da)
 *   HEAD_SHA  — isteğe bağlı (varsayılan: çalışma ağacı / HEAD)
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const GAME_GLOBS = [
  "public/",
  "tavla/",
  "dama/",
  "fanorona/",
  "dokuztas/",
  "dots-and-boxes/",
  "kusatma/",
  "sayibulma/",
  "shared/",
  "scripts/sync-shared.mjs",
  "scripts/build-pages.mjs",
];

const HUB_VERSION_FILES = [
  "site/hub/app-config.js",
  "hub/package.json",
  "hub/android/app/build.gradle",
];

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
}

function fileAt(sha, rel) {
  try {
    return sh(`git show ${sha}:${rel}`);
  } catch {
    return null;
  }
}

function parseVersion(src) {
  if (!src) return null;
  const m = src.match(/version:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function parseBuild(src) {
  if (!src) return null;
  const m = src.match(/build:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseGradle(src) {
  if (!src) return { versionName: null, versionCode: null };
  const name = (src.match(/versionName\s+"([^"]+)"/) || [])[1] || null;
  const code = Number((src.match(/versionCode\s+(\d+)/) || [])[1] || NaN);
  return { versionName: name, versionCode: Number.isFinite(code) ? code : null };
}

function parsePkgVersion(src) {
  if (!src) return null;
  try {
    return JSON.parse(src).version || null;
  } catch {
    return null;
  }
}

function cmpVer(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

const base = process.env.BASE_SHA;
if (!base) {
  console.error("BASE_SHA gerekli (PR base commit)");
  process.exit(2);
}
const head = process.env.HEAD_SHA || "HEAD";

const diff = sh(`git diff --name-only ${base}...${head}`);
const changed = diff ? diff.split("\n").filter(Boolean) : [];

const gamesTouched = changed.some((f) =>
  GAME_GLOBS.some((g) => (g.endsWith("/") ? f.startsWith(g) : f === g))
);

if (!gamesTouched) {
  console.log("Oyun kaynağı değişmedi — hub bump şart değil.");
  process.exit(0);
}

const baseCfg = fileAt(base, "site/hub/app-config.js");
const headCfg = fileAt(head, "site/hub/app-config.js");
const baseVer = parseVersion(baseCfg);
const headVer = parseVersion(headCfg);
const baseBuild = parseBuild(baseCfg);
const headBuild = parseBuild(headCfg);

const baseGradle = parseGradle(fileAt(base, "hub/android/app/build.gradle"));
const headGradle = parseGradle(fileAt(head, "hub/android/app/build.gradle"));
const basePkg = parsePkgVersion(fileAt(base, "hub/package.json"));
const headPkg = parsePkgVersion(fileAt(head, "hub/package.json"));

const problems = [];

if (cmpVer(headVer, baseVer) <= 0) {
  problems.push(
    `site/hub/app-config.js version yükselmedi (${baseVer} → ${headVer || "?"}). ` +
      `Çalıştır: node scripts/bump-hub.mjs`
  );
}
if (!(headBuild > baseBuild)) {
  problems.push(
    `site/hub/app-config.js build artmalı (${baseBuild} → ${headBuild || "?"})`
  );
}
if (headPkg !== headVer) {
  problems.push(`hub/package.json version (${headPkg}) app-config (${headVer}) ile aynı olmalı`);
}
if (headGradle.versionName !== headVer) {
  problems.push(
    `build.gradle versionName (${headGradle.versionName}) app-config (${headVer}) ile aynı olmalı`
  );
}
if (!(headGradle.versionCode > baseGradle.versionCode)) {
  problems.push(
    `build.gradle versionCode artmalı (${baseGradle.versionCode} → ${headGradle.versionCode})`
  );
}

const hubFilesTouched = HUB_VERSION_FILES.some((f) => changed.includes(f));
if (!hubFilesTouched) {
  problems.push(
    "Oyunlar değişti ama hub sürüm dosyalarına dokunulmadı: " + HUB_VERSION_FILES.join(", ")
  );
}

if (problems.length) {
  console.error("Hub bump zorunlu — Android APK oyunları paket içinden alır.\n");
  for (const p of problems) console.error(" • " + p);
  console.error("\nOyun PR’larında: node scripts/bump-hub.mjs && commit");
  console.error("Merge sonrası: hub-vX.Y.Z tag (veya tag-hub-release workflow) → APK yayınlanır.");
  process.exit(1);
}

console.log(`OK — hub ${baseVer} → ${headVer} (build ${headBuild}); oyun değişikliği ile uyumlu.`);
