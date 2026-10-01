// Renders every frame (1920x1080, 30 fps) to frames/. Optional: node render.js <de> <até> (segundos).
const fs = require("fs");
const path = require("path");
const { startServer, openPage, FPS } = require("./lib");

const WORKERS = 4;

(async () => {
  const from = Math.round((+process.argv[2] || 0) * FPS);
  const to = Math.round((+process.argv[3] || 45) * FPS);
  const dir = path.join(__dirname, "frames");
  fs.mkdirSync(dir, { recursive: true });
  const server = await startServer();
  let next = from;
  let done = 0;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      const { browser, page } = await openPage(server);
      while (next < to) {
        const f = next++;
        await page.evaluate((t) => window.seek(t), f / FPS);
        await page.screenshot({ path: path.join(dir, `f${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 96 });
        if (++done % 150 === 0) console.log(`${done}/${to - from} quadros, ${Math.round((Date.now() - started) / 1000)} s`);
      }
      await browser.close();
    }),
  );
  server.close();
  console.log(`Pronto: ${done} quadros em ${Math.round((Date.now() - started) / 1000)} s`);
})();
