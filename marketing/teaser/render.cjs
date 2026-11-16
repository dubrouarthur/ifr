// Teaser — frame renderer. Opens the teaser page at 1920 × 1080, waits for it to be ready, then for each frame calls
// window.seek(t) and screenshots the stage. Frames are written as PNG (or JPEG for a draft); ffmpeg assembles them.
//   NODE_PATH=$(npm root -g) node marketing/teaser/render.cjs <outDir> [fps=30] [from=0] [to=duration] [every=1] [jpg]
// (the Vite dev server must serve the worktree: npx vite --port 4620 --strictPort)
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const [outDir, fpsArg, fromArg, toArg, everyArg, fmt] = process.argv.slice(2);
const fps = Number(fpsArg ?? 30);
const every = Number(everyArg ?? 1);
const url = process.env.TEASER_URL ?? "http://localhost:4620/marketing/teaser/teaser.html";
const W = Number(process.env.TEASER_W ?? 1920);
const H = Number(process.env.TEASER_H ?? 1080);

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--disable-gpu-vsync"] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.teaserReady === true, null, { timeout: 180000 });
  const info = await page.evaluate(() => window.teaserInfo);
  console.log(JSON.stringify(info));
  const duration = info.duration;
  const from = Number(fromArg ?? 0);
  const to = Number(toArg ?? duration);
  const n0 = Math.round(from * fps);
  const n1 = Math.min(Math.round(to * fps), Math.round(duration * fps) - 1);
  const t0 = Date.now();
  for (let n = n0; n <= n1; n += every) {
    await page.evaluate((ms) => window.seek(ms), (n * 1000) / fps);
    const file = path.join(outDir, `f${String(n).padStart(5, "0")}.${fmt === "jpg" ? "jpg" : "png"}`);
    await page.screenshot({ path: file, type: fmt === "jpg" ? "jpeg" : "png", ...(fmt === "jpg" ? { quality: 92 } : {}) });
    if ((n - n0) % (every * 30) === 0) console.log(`frame ${n} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  console.log(`done ${n0}..${n1} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await browser.close();
})();
