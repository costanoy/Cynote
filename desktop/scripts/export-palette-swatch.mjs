import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "..", "brand-assets");

const dark = [
  ["Painel (fundo)", "#1e1b22"],
  ["Bordas", "#332e3a"],
  ["Texto", "#f5eee6"],
  ["Menu/dropdown", "#262230"],
];
const light = [
  ["Painel (fundo)", "#fffaf5"],
  ["Bordas", "#ecdfd0"],
  ["Texto", "#2a1a10"],
  ["Laranja escuro", "#c1530a"],
];
const brand = [
  ["Laranja (accent)", "#ff8c3a"],
  ["Laranja claro", "#ffb066"],
  ["Sincronizado", "#2fae5a"],
  ["Erro", "#e0432c"],
];

function swatchRow(label, color, x, y) {
  return `
    <rect x="${x}" y="${y}" width="140" height="140" rx="16" fill="${color}" stroke="#00000022" stroke-width="1"/>
    <text x="${x + 70}" y="${y + 168}" font-family="Arial" font-size="15" fill="#2a1a10" text-anchor="middle">${label}</text>
    <text x="${x + 70}" y="${y + 188}" font-family="Arial" font-size="13" fill="#88807a" text-anchor="middle">${color}</text>
  `;
}

function section(title, colors, yOffset) {
  const row = colors
    .map((c, i) => swatchRow(c[0], c[1], 40 + i * 170, yOffset + 40))
    .join("");
  return `<text x="40" y="${yOffset + 20}" font-family="Arial" font-size="20" font-weight="bold" fill="#2a1a10">${title}</text>${row}`;
}

const svg = `
<svg width="740" height="760" viewBox="0 0 740 760" xmlns="http://www.w3.org/2000/svg">
  <rect width="740" height="760" fill="#ffffff"/>
  ${section("Marca", brand, 20)}
  ${section("Tema escuro", dark, 260)}
  ${section("Tema claro", light, 500)}
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(outDir, "color-palette-swatch.png"));
console.log("Wrote color-palette-swatch.png");
