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
  <defs>
    <linearGradient id="bg" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffa452"/>
      <stop offset="1" stop-color="#f2711a"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="cardClip">
      <rect x="2.5" y="2.5" width="19" height="19" rx="6"/>
    </clipPath>
  </defs>
  <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="url(#bg)"/>
  <ellipse cx="12" cy="6" rx="9" ry="5" fill="url(#sheen)" clip-path="url(#cardClip)"/>
  <path d="M7.6 8.8h8.8M7.6 12.2h8.8M7.6 15.6h5.6" stroke="#fffaf3" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const outPath = join(outDir, "icon-source.png");
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(outPath);
console.log("Wrote", outPath);
