import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "icon-source");
mkdirSync(outDir, { recursive: true });

// Same mark used in-app (see src/icons.tsx LogoIcon), rasterized at high res for `tauri icon`.
const svg = `
<svg width="1024" height="1024" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="18" height="18" rx="5" fill="#ff8c3a"/>
  <path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

const outPath = join(outDir, "icon-source.png");
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(outPath);
console.log("Wrote", outPath);
