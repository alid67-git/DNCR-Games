/**
 * Tutorial adımlarını ekran görüntüsü alıp Türkçe altyazılı MP4 üretir.
 * Kullanım: node scripts/record-tutorial-video.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "tutorial-video");
const framesDir = path.join(outDir, "frames");
const artifactsDir = "/opt/cursor/artifacts";
const STEP_SECONDS = 3.2;

fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 2 });
await page.goto("http://localhost:3860/", { waitUntil: "networkidle0", timeout: 30000 });
await page.evaluate(() => localStorage.removeItem("kusatma_tutorial_seen_v1"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForSelector("#tutorial-overlay:not(.hidden) #tut-next", { timeout: 10000 });

const total = await page.evaluate(() => window.SiegeTutorial.STEPS.length);
console.log("steps", total);

for (let i = 0; i < total; i++) {
  await new Promise((r) => setTimeout(r, 350));
  const file = path.join(framesDir, `step-${String(i + 1).padStart(2, "0")}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log("frame", i + 1, file);
  if (i < total - 1) {
    await page.click("#tut-next");
    await page.waitForFunction(
      (n) => {
        const el = document.querySelector(".tut-stepnum");
        return el && el.textContent.includes(`${n} /`);
      },
      { timeout: 5000 },
      i + 2
    );
  }
}

await browser.close();

const listFile = path.join(outDir, "frames.txt");
const lines = [];
for (let i = 1; i <= total; i++) {
  const f = path.join(framesDir, `step-${String(i).padStart(2, "0")}.png`);
  lines.push(`file '${f}'`);
  lines.push(`duration ${STEP_SECONDS}`);
}
lines.push(`file '${path.join(framesDir, `step-${String(total).padStart(2, "0")}.png`)}'`);
fs.writeFileSync(listFile, lines.join("\n"));

const mp4 = path.join(outDir, "kusatma-nasil-oynanir.mp4");
const mp4Artifact = path.join(artifactsDir, "kusatma-nasil-oynanir.mp4");

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ],
  { stdio: "inherit" }
);

fs.copyFileSync(mp4, mp4Artifact);
console.log("wrote", mp4);
console.log("artifact", mp4Artifact);
