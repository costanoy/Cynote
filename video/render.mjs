// Renders index.html frame by frame and assembles the video with the music
// and sound effects.
//
//   node render.mjs                 -> out/cynote.mp4 (full film)
//   node render.mjs --stills 3,12   -> out/still-3.png, out/still-12.png (preview frames)
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, ".."); // served so the page can use the desktop app's bundled fonts
const out = join(here, "out");
const FPS = 30;
const DURATION = 45;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// When each sound effect plays, in seconds (matched to render(t) in index.html).
const SFX = [
  ["01.mp3", 0.1, 0.8], // vine drawing the arch
  ["02.mp3", 3.0, 0.8], // lamp lights
  ["03.mp3", 7.75, 0.9], // Ctrl+Shift+Space
  ["04.mp3", 9.5, 0.8], // window appears
  ["05.mp3", 11.0, 0.7], // stained-glass tabs light up
  ["06.mp3", 12.0, 0.45], // typing
  ["07.mp3", 28.0, 0.9], // sync flower blooms
  ["08.mp3", 34.3, 0.8], // day turns to night
  ["09.mp3", 40.3, 0.9], // closing medallion
];

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff", ".mjs": "text/javascript" };
const server = http.createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(req.url.split("?")[0])));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/video/index.html`;

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);

const stillsArg = process.argv.indexOf("--stills");
if (stillsArg !== -1) {
  for (const s of process.argv[stillsArg + 1].split(",").map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.screenshot({ path: join(out, `still-${s}.png`) });
    console.log("still", s);
  }
} else {
  const silent = join(out, "video-only.mp4");
  const enc = spawn(ffmpegPath, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = FPS * DURATION;
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
  }
  enc.stdin.end();
  await new Promise((r, j) => enc.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg " + c)))));

  // Mix: music + each effect delayed to its moment, then mux with the picture.
  const inputs = ["-i", silent, "-i", join(here, "audio", "musica.wav")];
  const filters = [];
  SFX.forEach(([file, at, vol], k) => {
    inputs.push("-i", join(here, "audio", file));
    const ms = Math.round(at * 1000);
    filters.push(`[${k + 2}:a]volume=${vol},adelay=${ms}|${ms}[s${k}]`);
  });
  filters.push(`[1:a]${SFX.map((_, k) => `[s${k}]`).join("")}amix=inputs=${SFX.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[a]`);
  const mux = spawn(ffmpegPath, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", join(out, "cynote.mp4")], { stdio: "inherit" });
  await new Promise((r, j) => mux.on("close", (c) => (c === 0 ? r() : j(new Error("ffmpeg mux " + c)))));
  console.log("wrote", join(out, "cynote.mp4"));
}

await browser.close();
server.close();
