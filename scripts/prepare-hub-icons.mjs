#!/usr/bin/env node
/**
 * Hub Android mipmap ikonlarını site/hub/assets'ten kopyala.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "site", "hub", "assets", "icon-1024.png");
const res = path.join(root, "hub", "android", "app", "src", "main", "res");

if (!fs.existsSync(src) || !fs.existsSync(res)) {
  console.log("skip icons (missing src or android res)");
  process.exit(0);
}

const dens = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
];

for (const [folder, size] of dens) {
  const dir = path.join(res, folder);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "ic_launcher.png");
  const outRound = path.join(dir, "ic_launcher_round.png");
  const outFg = path.join(dir, "ic_launcher_foreground.png");
  execSync(
    `python3 -c "from PIL import Image; im=Image.open('${src}').convert('RGBA').resize((${size},${size}), Image.Resampling.LANCZOS); im.save('${out}'); im.save('${outRound}'); im.save('${outFg}')"`
  );
}

// strings
const strings = path.join(res, "values", "strings.xml");
if (fs.existsSync(strings)) {
  let t = fs.readFileSync(strings, "utf8");
  t = t.replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">DNCR Games</string>');
  t = t.replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">DNCR Games</string>');
  fs.writeFileSync(strings, t);
}

console.log("hub android icons updated");
