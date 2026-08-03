import { test, expect } from "@playwright/test";
import type { Game } from "../../src/core/Game";
import type { BlockHit } from "../../src/player/BlockPicker";
import { waitForReady, watchErrors } from "./util";

test.describe("world editing and streaming", () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    watchErrors(page, errors);
    await page.goto("/?seed=42");
    await expect(page.locator("#fatal")).toBeHidden();
    await waitForReady(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test("block targeting, breaking and placing update the world and stats", async ({ page }) => {
    // At seed 42 the player spawns in water, which confuses targeting (the eye
    // cell is water → (0,0,0) face normal). Move to a dry terrain column first
    // so the ray safely targets real grass/dirt with a proper face normal.
    await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const t = g.manager.terrain;
      let spot: { x: number; z: number; h: number } | null = null;
      outer: for (let r = 0; r <= 40; r += 2) {
        for (let dx = -r; dx <= r; dx += 2) {
          for (let dz = -r; dz <= r; dz += 2) {
            const h = t.heightAt(dx, dz);
            if (h > 23 && h < 45 && !t.shouldPlaceTree(dx, dz, h)) {
              spot = { x: dx, z: dz, h };
              break outer;
            }
          }
        }
      }
      if (!spot) throw new Error("no dry terrain column found");
      g.player.pos.set(spot.x + 0.5, spot.h + 2, spot.z + 0.5);
      g.player.vel.set(0, 0, 0);
      g.player.keys.clear();
    });
    await page.waitForTimeout(600); // let the player settle on the ground

    // Clear head cells so the eye is in air even if a tree canopy overhangs.
    await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const p = g.player;
      const m = g.manager;
      const x = p.pos.x;
      const y = p.pos.y;
      const z = p.pos.z;
      for (let yi = Math.floor(y) + 1; yi <= Math.floor(y) + 3; yi++) {
        for (let xi = Math.floor(x) - 1; xi <= Math.floor(x) + 1; xi++) {
          for (let zi = Math.floor(z) - 1; zi <= Math.floor(z) + 1; zi++) {
            if (m.getBlockWorld(xi, yi, zi) !== 0) m.setBlockWorld(xi, yi, zi, 0);
          }
        }
      }
      // Aim steeply downward: the ray then reliably hits the ground.
      g.player.pitch = -1.4;
    });
    await page.waitForTimeout(300); // let the loop sync camera pitch

    const info = await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const hit = (g as unknown as { currentHit(): BlockHit | null }).currentHit();
      if (!hit) return { hit: null, beforeId: null };
      return {
        hit: { x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz },
        beforeId: g.manager.getBlockWorld(hit.x, hit.y, hit.z),
      };
    });
    expect(info.hit).not.toBeNull();
    const h = info.hit!;
    expect(info.beforeId).not.toBe(0); // a real (non-air) block was targeted
    expect(h.nx + h.ny + h.nz).not.toBe(0); // a real face normal, not the eye cell

    // Break the targeted block (mimics Game.breakBlock).
    const broken = await page.evaluate(
      (b: { x: number; y: number; z: number }) => {
        const g = (window as unknown as { __mc: Game }).__mc;
        const before = g.manager.stats().editedCells;
        g.manager.setBlockWorld(b.x, b.y, b.z, 0); // Air
        return {
          now: g.manager.getBlockWorld(b.x, b.y, b.z),
          delta: g.manager.stats().editedCells - before,
        };
      },
      h
    );
    expect(broken.now).toBe(0);
    expect(broken.delta).toBeGreaterThan(0);

    // Place Grass (HOTBAR[0]) at the hit face (mimics Game.placeBlock).
    const placed = await page.evaluate(
      (b: { x: number; y: number; z: number; nx: number; ny: number; nz: number }) => {
        const g = (window as unknown as { __mc: Game }).__mc;
        const bx = b.x + b.nx;
        const by = b.y + b.ny;
        const bz = b.z + b.nz;
        const before = g.manager.stats().editedCells;
        g.manager.setBlockWorld(bx, by, bz, 1); // Grass
        return {
          now: g.manager.getBlockWorld(bx, by, bz),
          delta: g.manager.stats().editedCells - before,
          at: [bx, by, bz],
        };
      },
      h
    );
    expect(placed.now).toBe(1);
    expect(placed.delta).toBeGreaterThan(0);

    const edited = await page.evaluate(
      () => (window as unknown as { __mc: Game }).__mc.manager.stats().editedCells
    );
    expect(edited).toBeGreaterThanOrEqual(2);
  });

  test("chunk streaming loads, unloads and reloads around the player", async ({ page }) => {
    const spawn = await page.evaluate(() => {
      const p = (window as unknown as { __mc: Game }).__mc.player;
      return { x: p.pos.x, z: p.pos.z };
    });
    const spawnKey = `${Math.floor(spawn.x / 16)},${Math.floor(spawn.z / 16)}`;
    // `chunks` is a private field on ChunkManager; read it structurally. The
    // whole expression is inlined because evaluate callbacks run in the page.
    const chunkKeys = () =>
      page.evaluate(() =>
        Array.from(
          (
            (window as unknown as { __mc: Game }).__mc.manager as unknown as {
              chunks: { keys(): IterableIterator<string> };
            }
          ).chunks.keys()
        )
      );

    const initial = await chunkKeys();
    expect(initial.length).toBeGreaterThan(0);
    expect(initial).toContain(spawnKey);

    // Teleport far away; the new center chunk must stream in.
    await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const t = g.manager.terrain;
      g.player.pos.set(256.5, t.heightAt(256, 256) + 2.2, 256.5);
      g.player.vel.set(0, 0, 0);
      g.player.keys.clear();
    });
    await page.waitForFunction(
      () =>
        (
          (window as unknown as { __mc: Game }).__mc.manager as unknown as {
            chunks: { has(k: string): boolean };
          }
        ).chunks.has("16,16"),
      null,
      { timeout: 30_000 }
    );
    expect(await chunkKeys()).toContain("16,16");

    // Old chunks drift out of range and are unloaded (~1 simulated second).
    await page.waitForFunction(
      (k: string) =>
        !(
          (window as unknown as { __mc: Game }).__mc.manager as unknown as {
            chunks: { has(k: string): boolean };
          }
        ).chunks.has(k),
      spawnKey,
      { timeout: 20_000 }
    );
    expect(await chunkKeys()).not.toContain(spawnKey);

    // Teleport back; chunks stream in again.
    await page.evaluate((s: { x: number; z: number }) => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const t = g.manager.terrain;
      g.player.pos.set(s.x + 0.5, t.heightAt(Math.floor(s.x), Math.floor(s.z)) + 2.2, s.z + 0.5);
      g.player.vel.set(0, 0, 0);
      g.player.keys.clear();
    }, spawn);
    await page.waitForFunction(
      (k: string) =>
        (
          (window as unknown as { __mc: Game }).__mc.manager as unknown as {
            chunks: { has(k: string): boolean };
          }
        ).chunks.has(k),
      spawnKey,
      { timeout: 30_000 }
    );
    expect(await chunkKeys()).toContain(spawnKey);
    const stats = await page.evaluate(
      () => (window as unknown as { __mc: Game }).__mc.manager.stats()
    );
    expect(stats.loaded).toBeGreaterThan(0);
  });
});

test.describe("production bundle", () => {
  test("built bundle boots without a fatal overlay or console errors", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "prod", "production smoke test runs against the preview build");
    const errors: string[] = [];
    watchErrors(page, errors);
    await page.goto("/?seed=7");
    await expect(page.locator("#fatal")).toBeHidden();
    await expect(page.locator("#loadtext")).toHaveText("World ready", { timeout: 30_000 });
    const info = await page.evaluate(() => {
      const g = (window as unknown as { __mc?: Game }).__mc;
      return {
        hasHook: typeof g !== "undefined",
        frames: g ? g.renderer.renderer.info.render.frame : 0,
        loaded: g ? g.manager.loadedCount() : 0,
      };
    });
    expect(info.hasHook).toBe(true);
    expect(info.frames).toBeGreaterThan(0);
    expect(info.loaded).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});