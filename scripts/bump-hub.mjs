#!/usr/bin/env node
/**
 * Hub APK sürümünü bir patch yükseltir (oyun değişince zorunlu).
 *
 * Günceller:
 *   site/hub/app-config.js  (version + build)
 *   hub/package.json
 *   hub/android/app/build.gradle (versionName + versionCode)
 *   README.md APK / release linkleri
 *
 * Kullanım:
 *   node scripts/bump-hub.mjs           # 1.0.18 → 1.0.19
 *   node scripts/bump-hub.mjs 1.0.20    # hedef sürüm
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text);
}

function parseHubVersion(src) {
  const m = src.match(/version:\s*"([^"]+)"/);
  if (!m) throw new Error("site/hub/app-config.js: version bulunamadı");
  return m[1];
}

function parseHubBuild(src) {
  const m = src.match(/build:\s*(\d+)/);
  if (!m) throw new Error("site/hub/app-config.js: build bulunamadı");
  return Number(m[1]);
}

function bumpPatch(v) {
  const parts = String(v).split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}

const cfgPath = "site/hub/app-config.js";
const cfg = read(cfgPath);
const current = parseHubVersion(cfg);
const currentBuild = parseHubBuild(cfg);
const next = process.argv[2] || bumpPatch(current);
const nextBuild = currentBuild + 1;

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error("Sürüm X.Y.Z olmalı:", next);
  process.exit(1);
}

write(
  cfgPath,
  cfg
    .replace(/version:\s*"[^"]+"/, `version: "${next}"`)
    .replace(/build:\s*\d+/, `build: ${nextBuild}`)
);

const pkgPath = "hub/package.json";
const pkg = JSON.parse(read(pkgPath));
pkg.version = next;
write(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const gradlePath = "hub/android/app/build.gradle";
write(
  gradlePath,
  read(gradlePath)
    .replace(/versionCode\s+\d+/, `versionCode ${nextBuild}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${next}"`)
);

const readmePath = "README.md";
let readme = read(readmePath);
readme = readme
  .replace(
    /releases\/download\/hub-v[\d.]+\/DNCR-Games-hub-[\d.]+\.apk/g,
    `releases/download/hub-v${next}/DNCR-Games-hub-${next}.apk`
  )
  .replace(
    /releases\/tag\/hub-v[\d.]+/g,
    `releases/tag/hub-v${next}`
  );
write(readmePath, readme);

console.log(`Hub ${current} (build ${currentBuild}) → ${next} (build ${nextBuild})`);
console.log("Sonraki adım: commit + merge main → tag hub-v" + next + " (CI otomatik de basabilir)");
console.log(`  git tag hub-v${next} && git push origin hub-v${next}`);
