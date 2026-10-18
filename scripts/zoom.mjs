/* eslint-disable no-undef -- Playwright page callbacks run in the browser; this script is node. */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const src = process.argv[2] ?? "docs/screenshot-fixed.png";
const cropX = Number(process.argv[3] ?? 120);
const cropY = Number(process.argv[4] ?? 380);
const zoom = Number(process.argv[5] ?? 6);
const out = process.argv[6] ?? "docs/zoom.png";

const dataUrl = "data:image/png;base64," + fs.readFileSync(src).toString("base64");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.setContent('<body style="margin:0;background:#111"><canvas id="c"></canvas></body>');
await page.evaluate(
  async ({ dataUrl, cropX, cropY, zoom }) => {
    const img = new Image();
    const loaded = new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
    img.src = dataUrl;
    await loaded;
    const c = document.getElementById("c");
    const size = 200;
    c.width = size * zoom;
    c.height = size * zoom;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, cropX, cropY, size, size, 0, 0, c.width, c.height);
  },
  { dataUrl, cropX, cropY, zoom }
);
await page.locator("#c").screenshot({ path: out });
console.log("wrote", out);
await browser.close();
