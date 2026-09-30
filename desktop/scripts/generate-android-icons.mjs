import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Same mark as the desktop icon (icon-source/cynote-logo.png, see
// generate-icon.mjs), resized to each Android legacy launcher density.
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptsDir, "..", "icon-source", "cynote-logo.png");

const sizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const outRoot = join(scriptsDir, "..", "..", "mobile", "android", "app", "src", "main", "res");

for (const [density, size] of Object.entries(sizes)) {
  const dir = join(outRoot, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, "ic_launcher.png");
  await sharp(sourcePath).resize(size, size).png().toFile(outPath);
  console.log("Wrote", outPath);
}
