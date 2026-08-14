import sharp from "sharp";
import { mkdirSync } from "node:fs";
import pngToIco from "png-to-ico";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// A folder with a few Cynote note-cards peeking out of the top, matching
// the "Cynote Dashboard" concept sketch (folder icon -> grid of saved notes).
const svg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect x="48" y="60" width="56" height="72" rx="8" fill="#fff" stroke="#e2b98a" stroke-width="3"/>
  <rect x="100" y="48" width="56" height="84" rx="8" fill="#fff" stroke="#e2b98a" stroke-width="3"/>
  <rect x="152" y="60" width="56" height="72" rx="8" fill="#fff" stroke="#e2b98a" stroke-width="3"/>
  <path d="M60 66h32M60 78h32M60 90h20" stroke="#ffb37a" stroke-width="4" stroke-linecap="round"/>
  <path d="M112 54h32M112 66h32M112 78h32M112 90h20" stroke="#ff8c3a" stroke-width="4" stroke-linecap="round"/>
  <path d="M164 66h32M164 78h32M164 90h20" stroke="#ffb37a" stroke-width="4" stroke-linecap="round"/>
  <path d="M28 108c0-6.6 5.4-12 12-12h44l14 16h94c6.6 0 12 5.4 12 12v78c0 6.6-5.4 12-12 12H40c-6.6 0-12-5.4-12-12z" fill="#ff8c3a"/>
  <path d="M28 108c0-6.6 5.4-12 12-12h44l14 16H40c-6.6 0-12 5.4-12 12z" fill="#ffa869"/>
  <path d="M28 140h200v66c0 6.6-5.4 12-12 12H40c-6.6 0-12-5.4-12-12z" fill="#c1530a"/>
</svg>`;

const pngPath = join(outDir, "dashboard-icon-256.png");
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(pngPath);
console.log("Wrote", pngPath);

const icoBuffer = await pngToIco([pngPath]);
const icoPath = join(outDir, "dashboard.ico");
await writeFile(icoPath, icoBuffer);
console.log("Wrote", icoPath);
