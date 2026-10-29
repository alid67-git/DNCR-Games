#!/usr/bin/env node
/**
 * GitHub Pages statik site:
 *   /           hub (iPhone giriş)
 *   /kati/      Kati
 *   /noktalar/  Noktalar ve Kutular
 *   /dokuztas/  Dokuztaş
 *   /kusatma/   Kuşatma
 *   /sayi/      Sayı Bulma
 *   /fanorona/  Fanorona
 *   /tavla/     Tavla
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const out = path.join(root, "_site");

execSync("node scripts/sync-shared.mjs", { cwd: root, stdio: "inherit" });

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}
function cpDir(src, dest) {
  mkdirp(dest);
  for (const name of fs.readdirSync(src)) {
    if (name === "node_modules") continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) cpDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

rmrf(out);
mkdirp(out);

// Hub
cpDir(path.join(root, "site", "hub"), out);

// Games
cpDir(path.join(root, "public"), path.join(out, "kati"));
cpDir(path.join(root, "dots-and-boxes", "public"), path.join(out, "noktalar"));
cpDir(path.join(root, "dokuztas", "public"), path.join(out, "dokuztas"));
cpDir(path.join(root, "kusatma", "public"), path.join(out, "kusatma"));
cpDir(path.join(root, "sayibulma", "public"), path.join(out, "sayi"));
cpDir(path.join(root, "fanorona", "public"), path.join(out, "fanorona"));
cpDir(path.join(root, "tavla", "public"), path.join(out, "tavla"));

// robots
fs.writeFileSync(
  path.join(out, "robots.txt"),
  "User-agent: *\nAllow: /\n"
);

console.log("built", out);
console.log("  /           hub");
console.log("  /kati/      Kati");
console.log("  /noktalar/  Noktalar ve Kutular");
console.log("  /dokuztas/  Dokuztaş");
console.log("  /kusatma/   Kuşatma");
console.log("  /sayi/      Sayı Bulma");
console.log("  /fanorona/  Fanorona");
console.log("  /tavla/     Tavla");
