/* eslint-disable no-undef -- Playwright page callbacks run in the browser; this script is node. */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
await page.goto("http://localhost:5201/?seed=1337", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.getElementById("loadtext")?.textContent === "World ready", null, {
  timeout: 30000,
});
// Hide overlays so screenshots show the actual render, not the menu.
await page.evaluate(() => {
  document.getElementById("clickToPlay")?.classList.add("hidden");
  document.getElementById("loading")?.classList.add("hidden");
});
await page.waitForTimeout(2500);
const stats = await page.evaluate(async () => {
  const g = window.__mc;
  g.renderer.cycleOn = false;
  g.renderer.timeOfDay = 0.27;
  // Drain streaming so the view matches a settled world.
  for (let i = 0; i < 400; i++) {
    g.manager.update(g.player.pos.x, g.player.pos.z, 0.05);
    const s = g.manager.stats();
    if (s.pendingGen === 0 && s.pendingMesh === 0 && s.loaded >= 100) break;
  }
  g.player.pitch = -0.22;
  g.player.yaw = 0.4;
  g.renderer.update(0, g.player.pos);
  g.renderer.render();
  const s = g.manager.stats();
  return {
    pos: { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
    loaded: s.loaded,
    pendingGen: s.pendingGen,
    pendingMesh: s.pendingMesh,
    tris: g.renderer.triangles(),
    sky: g.renderer.scene.background.getHexString(),
    fog: g.renderer.scene.fog.color.getHexString(),
    errors: null,
  };
});
await page.screenshot({ path: "docs/screenshot-fixed.png" });

// Second angle: look down at a shoreline-ish column if we can find one.
await page.evaluate(() => {
  const g = window.__mc;
  const t = g.manager.terrain;
  let spot = null;
  for (let x = -40; x <= 40 && !spot; x += 2) {
    for (let z = -40; z <= 40; z += 2) {
      const h = t.heightAt(x, z);
      if (h > 24 && h < 36 && !t.shouldPlaceTree(x, z, h)) {
        spot = { x, z, h };
        break;
      }
    }
  }
  if (spot) {
    g.player.pos.set(spot.x + 0.5, spot.h + 8, spot.z + 0.5);
    g.player.pitch = -0.45;
    g.player.yaw = 0.8;
  }
  for (let i = 0; i < 200; i++) g.manager.update(g.player.pos.x, g.player.pos.z, 0.05);
  g.renderer.update(0, g.player.pos);
  g.renderer.render();
});
await page.waitForTimeout(400);
await page.screenshot({ path: "docs/screenshot-overview.png" });

const gl = await page.evaluate(() => {
  const g = window.__mc;
  const r = g.renderer.renderer;
  r.render(g.renderer.scene, g.renderer.camera);
  const gl = r.getContext();
  const w = r.domElement.width;
  const h = r.domElement.height;
  const samples = [];
  for (let gy = 0; gy < 6; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const px = new Uint8Array(4);
      gl.readPixels(Math.floor(w * (0.08 + gx * 0.1)), Math.floor(h * (0.08 + gy * 0.12)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      samples.push([px[0], px[1], px[2]]);
    }
  }
  return { w, h, samples, programErrors: null };
});

fs.writeFileSync(
  "docs/shot-stats.json",
  JSON.stringify({ stats, gl, errors }, null, 2)
);
console.log(JSON.stringify({ stats, errorCount: errors.length, errors: errors.slice(0, 8), sampleCount: gl.samples.length }, null, 2));
await browser.close();
