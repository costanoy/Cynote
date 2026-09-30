import sharp from "sharp";
import { mkdirSync } from "node:fs";
import pngToIco from "png-to-ico";
import { unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptsDir, "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// Dashnotes' mark (a stained-glass window in the gold-ringed medallion),
// cut out of its cream backdrop - see icon-source/dashboard-logo.png.
// Distinct from the main Cynote icon (window vs. the gold "C") so
// the two show up differently in the taskbar.
const sourcePath = join(scriptsDir, "..", "icon-source", "dashboard-logo.png");

const pngPath = join(outDir, "dashboard-icon-256.png");
await sharp(sourcePath).resize(256, 256).png().toFile(pngPath);
console.log("Wrote", pngPath);

// Small sizes rendered separately, so the taskbar and Explorer don't have
// to shrink the 256px image on the fly (which blurs the lead lines).
const sizedPaths = [];
for (const size of [16, 24, 32, 48, 64]) {
  const path = join(outDir, `dashboard-icon-${size}.tmp.png`);
  await sharp(sourcePath).resize(size, size).png().toFile(path);
  sizedPaths.push(path);
}
const icoBuffer = await pngToIco([...sizedPaths, pngPath]);
await Promise.all(sizedPaths.map((path) => unlink(path)));
const icoPath = join(outDir, "dashboard.ico");
await writeFile(icoPath, icoBuffer);
console.log("Wrote", icoPath);
