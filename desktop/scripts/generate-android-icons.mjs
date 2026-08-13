import sharp from "sharp";
import { mkdirSync } from "node:fs";

// Same in-app mark as generate-icon.mjs (src/icons.tsx LogoIcon),
// rasterized directly at each Android legacy launcher density.
const svg = `
<svg width="1024" height="1024" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="18" height="18" rx="5" fill="#ff8c3a"/>
  <path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

const sizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const outRoot = "../../mobile/android/app/src/main/res";

for (const [density, size] of Object.entries(sizes)) {
  const dir = `${outRoot}/mipmap-${density}`;
  mkdirSync(dir, { recursive: true });
  const outPath = `${dir}/ic_launcher.png`;
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log("Wrote", outPath);
}
