import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "..", "brand-assets");
mkdirSync(outDir, { recursive: true });

const svg = `
<svg width="1024" height="1024" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="18" height="18" rx="5" fill="#ff8c3a"/>
  <path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

for (const size of [256, 512, 1024]) {
  const outPath = join(outDir, `cynote-logo-${size}.png`);
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log("Wrote", outPath);
}

// Same mark on its own dark panel background, useful for a hero/favicon-style shot.
const svgOnDark = `
<svg width="1024" height="1024" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="6" fill="#1e1b22"/>
  <rect x="4" y="4" width="16" height="16" rx="4.5" fill="#ff8c3a"/>
  <path d="M8.3 8.3h7.4M8.3 12h7.4M8.3 15.7h4.6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;
await sharp(Buffer.from(svgOnDark), { density: 384 })
  .resize(1024, 1024)
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, "cynote-logo-on-dark-1024.png"));
console.log("Wrote cynote-logo-on-dark-1024.png");
