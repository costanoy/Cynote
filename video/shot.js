// Stills for checking the animation: node shot.js <pasta> 3.2 12.5 17 ...
const fs = require("fs");
const path = require("path");
const { startServer, openPage } = require("./lib");

(async () => {
  const [dir, ...times] = process.argv.slice(2);
  fs.mkdirSync(dir, { recursive: true });
  const server = await startServer();
  const { browser, page } = await openPage(server);
  for (const t of times) {
    await page.evaluate((x) => window.seek(x), +t);
    await page.screenshot({ path: path.join(dir, `t${(+t).toFixed(2).padStart(5, "0")}.jpg`), type: "jpeg", quality: 88 });
  }
  await browser.close();
  server.close();
})();
