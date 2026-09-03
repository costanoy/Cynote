import sharp from "sharp";
import { mkdirSync } from "node:fs";
import pngToIco from "png-to-ico";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptsDir, "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// Cynote Dashboard's mark, designed in Canva and cleaned up (recovered real
// transparency from a black-matte export - see icon-source/dashboard-logo.png).
// Distinct from the main Cynote icon (folder + note grid vs. note lines) so
// the two show up differently in the taskbar.
const sourcePath = join(scriptsDir, "..", "icon-source", "dashboard-logo.png");

const pngPath = join(outDir, "dashboard-icon-256.png");
await sharp(sourcePath).resize(256, 256).png().toFile(pngPath);
console.log("Wrote", pngPath);

const icoBuffer = await pngToIco([pngPath]);
const icoPath = join(outDir, "dashboard.ico");
await writeFile(icoPath, icoBuffer);
console.log("Wrote", icoPath);
