import { test, expect } from "@playwright/test";
import type { Game } from "../../src/core/Game";
import { waitForReady, watchErrors } from "./util";

test.describe("game boot and HUD", () => {
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

  test("initializes without a fatal overlay and exposes the __mc hook", async ({ page }) => {
    const mcType = await page.evaluate(
      () => typeof (window as unknown as { __mc?: unknown }).__mc
    );
    expect(mcType).toBe("object");
    const canvas = page.locator("#game");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("renders actual pixels to the WebGL canvas", async ({ page }) => {
    const info = await page.evaluate(() => {
      const g = (window as unknown as { __mc: Game }).__mc;
      const r = g.renderer.renderer;
      const meshCount = g.renderer.scene.children.filter(
        (c: unknown) =>
          (c as { isMesh?: boolean }).isMesh === true && (c as { geometry?: unknown }).geometry != null
      ).length;
      // Render a frame and read pixels synchronously, before the drawing
      // buffer is cleared by compositing (preserveDrawingBuffer is not set).
      r.render(g.renderer.scene, g.renderer.camera);
      const gl = r.getContext();
      const w = r.domElement.width;
      const h = r.domElement.height;
      // Sample a 5x5 grid; the exact center pixel is unreliable (first-person
      // view can center on water/sky/a dark face), so require at least one
      // opaque, non-black pixel.
      let nonBlack = 0;
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          const px = new Uint8Array(4);
          gl.readPixels(
            Math.floor(w * (0.1 + 0.2 * gx)),
            Math.floor(h * (0.1 + 0.2 * gy)),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            px
          );
          if (px[3] === 255 && px[0] + px[1] + px[2] > 0) nonBlack++;
        }
      }
      return {
        frame: r.info.render.frame,
        triangles: r.info.render.triangles,
        meshCount,
        nonBlack,
      };
    });
    expect(info.frame).toBeGreaterThan(0);
    expect(info.triangles).toBeGreaterThan(0);
    expect(info.meshCount).toBeGreaterThan(0);
    expect(info.nonBlack).toBeGreaterThan(0);
  });

  test("loading overlay reaches World ready and HUD counters update", async ({ page }) => {
    await expect(page.locator("#loadtext")).toHaveText("World ready");
    await expect(page.locator("#chunks")).toHaveText(/Chunks \d+/);
    const chunksText = await page.locator("#chunks").textContent();
    expect(parseInt(chunksText!.match(/\d+/)![0], 10)).toBeGreaterThan(0);
    await expect(page.locator("#fps")).toHaveText(/FPS \d+/, { timeout: 15_000 });
  });

  test("hotbar renders 9 slots and selection follows digit keys and the wheel", async ({ page }) => {
    const slots = page.locator("#hotbar .slot");
    await expect(slots).toHaveCount(9);
    const selectedIndex = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("#hotbar .slot")).findIndex((s) =>
          s.classList.contains("selected")
        )
      );

    expect(await selectedIndex()).toBe(0);
    await page.keyboard.press("Digit2");
    expect(await selectedIndex()).toBe(1);
    await page.mouse.wheel(0, 120);
    expect(await selectedIndex()).toBe(2);
    await page.mouse.wheel(0, 120);
    expect(await selectedIndex()).toBe(3);
    await page.mouse.wheel(0, -120);
    expect(await selectedIndex()).toBe(2);
    // 90-degree wrap: slot 9 wraps to slot 1 on wheel-forward.
    await page.keyboard.press("Digit9");
    expect(await selectedIndex()).toBe(8);
    await page.mouse.wheel(0, 120);
    expect(await selectedIndex()).toBe(0);
    // Exactly one slot is selected at all times.
    const selectedCount = await page.evaluate(
      () => document.querySelectorAll("#hotbar .slot.selected").length
    );
    expect(selectedCount).toBe(1);
  });

  test("debug overlay shows pipeline stats", async ({ page }) => {
    const debug = page.locator("#debug");
    await expect(debug).toBeVisible();
    await expect(debug).toHaveText(/pending gen \d+ · pending mesh \d+ · edited \d+ · tris \d+/);
  });
});