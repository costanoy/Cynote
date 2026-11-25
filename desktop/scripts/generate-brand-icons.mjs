import sharp from "sharp";
import pngToIco from "png-to-ico";
import { mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Cynote's mark: a steno pad on its green cover. Two pale rules, the ballpoint
// rule in blue, the red margin line. Drawn here as SVG so every size (app,
// installer, tray, Dashnotes, Android) comes from one source. The in-app
// version is AppMark in src/icons.tsx.
//
//   node scripts/generate-brand-icons.mjs
//   npx tauri icon icon-source/icon-source.png   (rebuilds src-tauri/icons)

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(scriptsDir, "..", "icon-source");
const iconsDir = join(scriptsDir, "..", "src-tauri", "icons");
const trayDir = join(iconsDir, "tray");
const androidRes = join(scriptsDir, "..", "..", "mobile", "android", "app", "src", "main", "res");
mkdirSync(sourceDir, { recursive: true });
mkdirSync(trayDir, { recursive: true });

const COVER = "#2F5240";
const COVER_DARK = "#1C3027";
const PAPER = "#EDF2E8";
const RULE_ON_COVER = "#E6EFE4";
const BALLPOINT_ON_COVER = "#9DB8FF";
const BALLPOINT = "#2350C0";
const MARGIN = "#E58A80";
const MARGIN_ON_PAPER = "#C9463D";
const RULE_ON_PAPER = "#9FB59A";

/** The app mark on a 64 grid. `inset` leaves room around it (Android's safe zone). */
function appMark({ inset = 4, radius = 14 } = {}) {
  const s = 64 - inset * 2;
  const k = s / 56; // geometry below is drawn for a 56-unit square at 4,4
  const x = (v) => (inset + (v - 4) * k).toFixed(2);
  const w = (v) => (v * k).toFixed(2);
  // The spiral binding: coils crossing the top edge, like a top-bound steno pad.
  const coils = [19, 25, 31, 37, 43, 49].map((cx) => `M${x(cx)} ${x(1.8)}V${x(9.6)}`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="${inset}" y="${inset}" width="${s}" height="${s}" rx="${w(radius)}" fill="${COVER}"/>
  <path d="${coils}" stroke="${RULE_ON_COVER}" stroke-opacity=".9" stroke-width="${w(2.6)}" stroke-linecap="round"/>
  <path d="M${x(22)} ${x(26)}H${x(50)}M${x(22)} ${x(36)}H${x(50)}" stroke="${RULE_ON_COVER}" stroke-opacity=".62" stroke-width="${w(3.4)}" stroke-linecap="round"/>
  <path d="M${x(22)} ${x(46)}H${x(50)}" stroke="${BALLPOINT_ON_COVER}" stroke-width="${w(4)}" stroke-linecap="round"/>
  <path d="M${x(15)} ${x(17)}V${x(53)}" stroke="${MARGIN}" stroke-width="${w(2.4)}" stroke-linecap="round"/>
</svg>`;
}

/** Dashnotes: the same pad seen as the open page, so the two differ in the taskbar. */
function dashMark() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="5" y="5" width="54" height="54" rx="13" fill="${PAPER}" stroke="${COVER}" stroke-width="3"/>
  <path d="M22 22H49M22 32H49" stroke="${RULE_ON_PAPER}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M22 42H49" stroke="${BALLPOINT}" stroke-width="4" stroke-linecap="round"/>
  <path d="M15 11V53" stroke="${MARGIN_ON_PAPER}" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;
}

/** Tray marks: drawn for 16px, bolder, with a dark outline for light and dark taskbars. */
function trayMark(alert) {
  const bg = alert ? BALLPOINT_ON_COVER : "#3E6B54";
  const rule = alert ? COVER_DARK : RULE_ON_COVER;
  const pen = alert ? COVER_DARK : BALLPOINT_ON_COVER;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3.6" fill="${bg}" stroke="${COVER_DARK}" stroke-width="1"/>
  <path d="M5.4 6.2H12.2M5.4 8.9H12.2" stroke="${rule}" stroke-opacity="${alert ? 1 : 0.7}" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M5.4 11.6H12.2" stroke="${pen}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M3.4 3.4V12.8" stroke="${MARGIN}" stroke-width="1" stroke-linecap="round"/>
</svg>`;
}

const render = (svg, size) => sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 16) }).resize(size, size);

// 1. App icon source (tauri icon makes every desktop size from it).
await writeFile(join(sourceDir, "cynote-mark.svg"), appMark());
await render(appMark(), 1024).png().toFile(join(sourceDir, "icon-source.png"));
console.log("Wrote icon-source/icon-source.png");

// 2. Tray icons, raw RGBA at 32px (see TRAY_ICON_SIZE in src-tauri/src/lib.rs).
const TRAY = 32;
for (const [name, svg] of Object.entries({
  simple: trayMark(false),
  "simple-alert": trayMark(true),
  detailed: trayMark(false),
  "detailed-alert": trayMark(true),
})) {
  const img = render(svg, TRAY);
  await writeFile(join(trayDir, `${name}.rgba`), await img.clone().ensureAlpha().raw().toBuffer());
  await img.clone().png().toFile(join(trayDir, `${name}.png`));
}
console.log("Wrote tray icons");

// 3. Dashnotes icon (.ico with real small sizes, plus a 256 png).
await writeFile(join(sourceDir, "dashnotes-mark.svg"), dashMark());
const dashPng = join(iconsDir, "dashboard-icon-256.png");
await render(dashMark(), 256).png().toFile(dashPng);
const tmp = [];
for (const size of [16, 24, 32, 48, 64]) {
  const p = join(iconsDir, `dashboard-icon-${size}.tmp.png`);
  await render(dashMark(), size).png().toFile(p);
  tmp.push(p);
}
await writeFile(join(iconsDir, "dashboard.ico"), await pngToIco([...tmp, dashPng]));
await Promise.all(tmp.map((p) => unlink(p)));
console.log("Wrote dashboard.ico");

// 4. Android launcher icons (legacy square, with the mark inset like the system's).
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(densities)) {
  const dir = join(androidRes, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  await render(appMark({ inset: 3, radius: 13 }), size).png().toFile(join(dir, "ic_launcher.png"));
}
console.log("Wrote Android launcher icons");
