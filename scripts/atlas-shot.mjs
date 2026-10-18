/* eslint-disable no-undef -- Playwright page callbacks run in the browser; this script is node. */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:5201/?seed=1337", { waitUntil: "networkidle" });
const dataUrl = await page.evaluate(async () => {
  const mod = await import("/src/blocks/TextureAtlas.ts");
  const atlas = new mod.TextureAtlas();
  atlas.build();
  const c = atlas.canvas;
  // Blow up the 288x1080 atlas so individual 16px tiles are visible.
  const out = document.createElement("canvas");
  out.width = c.width * 3;
  out.height = c.height * 3;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
});
fs.writeFileSync("docs/atlas.png", Buffer.from(dataUrl.split(",")[1], "base64"));
console.log("wrote docs/atlas.png");
await browser.close();
