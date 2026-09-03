import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "icon-source");
mkdirSync(outDir, { recursive: true });

// Cynote's mark, designed in Canva and cleaned up (recovered real
// transparency from a black-matte export - see icon-source/cynote-logo.png).
const sourcePath = join(outDir, "cynote-logo.png");
const outPath = join(outDir, "icon-source.png");
await sharp(sourcePath).resize(1024, 1024).png().toFile(outPath);
console.log("Wrote", outPath);
