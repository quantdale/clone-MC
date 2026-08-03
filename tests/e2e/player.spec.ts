import { test, expect } from "@playwright/test";
import type { Game } from "../../src/core/Game";
import { waitForReady, watchErrors } from "./util";

test.describe("player behaviors", () => {
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

  test("clicking to play engages pointer lock and hides the overlay", async ({ page }) => {
    const overlay = page.locator("#clickToPlay");
    await expect(overlay).toBeVisible();

    // The full-screen "click to play" overlay is the primary pointer-lock
    // affordance; a click on it must engage pointer lock (regression guard
    // for the canvas-click routing fix).
    await page.click("#clickToPlay");
    await page.waitForFunction(() => document.pointerLockElement != null, null, {
      timeout: 5000,
    });
    await expect(overlay).toBeHidden();
  });

  test("KeyW moves the player forward (toward -Z) with nonzero velocity", async ({ page }) => {
    // Carve an open pocket in front of the player so walking cannot be stopped
    // by terrain or a tree within the test window.
    const start = await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const p = g.player;
      const m = g.manager;
      const x = p.pos.x;
      const y = p.pos.y;
      const z = p.pos.z;
      let cleared = 0;
      // At seed 42 the player spawns in/near water, so clear a deep, wide
      // pocket (down to the seabed floor, tall enough for headroom + tree
      // branches) so walking cannot be stopped by terrain within the window.
      for (let zi = Math.floor(z) - 12; zi <= Math.floor(z) + 1; zi++) {
        for (let xi = Math.floor(x) - 2; xi <= Math.floor(x) + 2; xi++) {
          for (let yi = Math.floor(y) - 4; yi <= Math.floor(y) + 4; yi++) {
            if (m.getBlockWorld(xi, yi, zi) !== 0) {
              m.setBlockWorld(xi, yi, zi, 0);
              cleared++;
            }
          }
        }
      }
      return { x, z, cleared };
    });
    expect(start.cleared).toBeGreaterThan(0);

    // Let the player settle (fall to the cleared floor) before measuring.
    await page.waitForTimeout(800);

    const startPos = await page.evaluate(() => {
      const p = (window as unknown as { __mc: Game }).__mc.player;
      return { x: p.pos.x, z: p.pos.z };
    });
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(700);
    await page.keyboard.up("KeyW");

    const after = await page.evaluate(() => {
      const p = (window as unknown as { __mc: Game }).__mc.player;
      return { x: p.pos.x, z: p.pos.z, vx: p.vel.x, vz: p.vel.z };
    });
    expect(after.z).toBeLessThan(startPos.z - 0.3); // moved forward along -Z
    expect(after.vz).toBeLessThan(-0.3); // still moving at the sample time
    expect(Math.abs(after.x - startPos.x)).toBeLessThan(0.6); // no strafe drift
    expect(Math.abs(after.vx)).toBeLessThan(0.4);
  });

  test("gravity pulls an airborne player down and decelerates a jump", async ({ page }) => {
    const out = await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const p = g.player;
      const m = g.manager;
      p.keys.clear();
      p.vel.set(0, 0, 0);

      // Clear a vertical shaft above the player so the fall is unobstructed.
      const x = p.pos.x;
      const y = p.pos.y;
      const z = p.pos.z;
      for (let yi = Math.floor(y) + 1; yi <= Math.floor(y) + 6; yi++) {
        for (let xi = Math.floor(x) - 1; xi <= Math.floor(x) + 1; xi++) {
          for (let zi = Math.floor(z) - 1; zi <= Math.floor(z) + 1; zi++) {
            if (m.getBlockWorld(xi, yi, zi) !== 0) m.setBlockWorld(xi, yi, zi, 0);
          }
        }
      }

      // Lift the player one block and let gravity act.
      p.pos.y = y + 1;
      p.onGround = false;
      const yBefore = p.pos.y;
      for (let i = 0; i < 8; i++) p.update(0.05, m);
      const fellWhileAirborne = p.pos.y < yBefore;

      // An upward impulse (jump) must decay under gravity.
      p.vel.set(0, 9.2, 0);
      p.onGround = false;
      let maxVy = 0;
      for (let i = 0; i < 30; i++) {
        p.update(0.05, m);
        maxVy = Math.max(maxVy, p.vel.y);
      }
      return { fellWhileAirborne, maxVy, finalVy: p.vel.y };
    });
    expect(out.fellWhileAirborne).toBe(true);
    expect(out.maxVy).toBeLessThanOrEqual(9.2);
    expect(out.finalVy).toBeLessThan(9.0); // gravity decelerated the jump
  });

  test("player AABB never overlaps a solid block", async ({ page }) => {
    // Let the loop run a bit so the player lands and settles by itself.
    await page.waitForTimeout(1200);
    const res = await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const p = g.player;
      const m = g.manager;
      const half = 0.3;
      const height = 1.8;
      const eps = 0.02;
      const x = p.pos.x;
      const y = p.pos.y;
      const z = p.pos.z;
      const clashes: number[][] = [];
      for (let bx = Math.floor(x - half + eps); bx <= Math.floor(x + half - eps); bx++) {
        for (let by = Math.floor(y + eps); by <= Math.floor(y + height - eps); by++) {
          for (let bz = Math.floor(z - half + eps); bz <= Math.floor(z + half - eps); bz++) {
            const id = m.getBlockWorld(bx, by, bz);
            if (id !== 0 && id !== 5) clashes.push([bx, by, bz, id]); // Air(0) / Water(5)
          }
        }
      }
      return { clashes, y, onGround: p.onGround, inWater: p.inWater };
    });
    expect(res.clashes).toEqual([]);
  });
});