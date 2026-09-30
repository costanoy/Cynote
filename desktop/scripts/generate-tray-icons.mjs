import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptsDir, "..", "src-tauri", "icons", "tray");
mkdirSync(outDir, { recursive: true });

// The tray marks from the design handoff (prototipos/icons/bandeja-*.svg).
// "simple" is the 16px drawing - a gold C on the green disc, with a dark
// outline so it reads on light and dark taskbars; "detailed" is the 32px one,
// which adds the inner ring and the leaf. The "alert" pair swaps the colors:
// the tray alternates between the two while another device asks to sync.
const MARKS = {
  simple: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.3" fill="#37604F" stroke="#1C3027" stroke-width="1"/><path d="M10.9 5.1A4.1 4.1 0 1 0 10.9 10.9" fill="none" stroke="#E2B85C" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  "simple-alert": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.3" fill="#E2B85C" stroke="#1C3027" stroke-width="1"/><path d="M10.9 5.1A4.1 4.1 0 1 0 10.9 10.9" fill="none" stroke="#1C3027" stroke-width="1.9" stroke-linecap="round"/></svg>`,
  detailed: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#37604F" stroke="#1C3027" stroke-width="1.2"/><circle cx="16" cy="16" r="12.6" fill="none" stroke="#E2B85C" stroke-width="0.9" opacity=".7"/><path d="M21.6 10.4A7.9 7.9 0 1 0 21.6 21.6" fill="none" stroke="#E2B85C" stroke-width="3" stroke-linecap="round"/><path d="M22.5 7.5c-2.6.3-4 1.8-4 3.8 2.3-.1 3.7-1.6 4-3.8z" fill="#86B96F"/></svg>`,
  "detailed-alert": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#E2B85C" stroke="#1C3027" stroke-width="1.2"/><circle cx="16" cy="16" r="12.6" fill="none" stroke="#1C3027" stroke-width="0.9" opacity=".7"/><path d="M21.6 10.4A7.9 7.9 0 1 0 21.6 21.6" fill="none" stroke="#1C3027" stroke-width="3" stroke-linecap="round"/><path d="M22.5 7.5c-2.6.3-4 1.8-4 3.8 2.3-.1 3.7-1.6 4-3.8z" fill="#3D7A4C"/></svg>`,
};

// Written as raw RGBA (what the tray API takes directly), so the Rust side
// can embed them without pulling in a PNG decoder. Keep SIZE in sync with
// TRAY_ICON_SIZE in src-tauri/src/lib.rs.
const SIZE = 32;

for (const [name, svg] of Object.entries(MARKS)) {
  const image = sharp(Buffer.from(svg), { density: 72 * (SIZE / 16) * 4 }).resize(SIZE, SIZE);
  await writeFile(join(outDir, `${name}.rgba`), await image.clone().ensureAlpha().raw().toBuffer());
  await image.clone().png().toFile(join(outDir, `${name}.png`));
  console.log("Wrote", name);
}
