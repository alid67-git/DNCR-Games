#!/usr/bin/env node
/**
 * shared/js + shared/css → her oyunun public/shared/
 * Yapısal değişiklik: shared/'da yap, sonra bu scripti çalıştır.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const targets = [
  path.join(root, "public", "shared"),
  path.join(root, "dots-and-boxes", "public", "shared"),
  path.join(root, "dokuztas", "public", "shared"),
  path.join(root, "kusatma", "public", "shared"),
  path.join(root, "sayibulma", "public", "shared"),
  path.join(root, "fanorona", "public", "shared"),
  path.join(root, "dama", "public", "shared"),
];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

for (const dest of targets) {
  copyDir(path.join(root, "shared", "js"), dest);
  copyDir(path.join(root, "shared", "css"), dest);
  console.log("synced →", path.relative(root, dest));
}
