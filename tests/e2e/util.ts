import type { Page } from "@playwright/test";

/**
 * Collect page errors and console errors for a page. Assert the returned array
 * is empty at the end of a test to fail on any browser-side error.
 *
 * A few benign messages are filtered out (browser autofill hints / offline
 * network noise) per the task's guidance.
 */
export function watchErrors(page: Page, sink: string[]): void {
  page.on("pageerror", (e) => sink.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/autofill/i.test(text)) return;
    if (/net::ERR_INTERNET_DISCONNECTED/i.test(text)) return;
    sink.push(`console.error: ${text}`);
  });
}

/**
 * Wait until the game is booted and the initial chunk set has streamed in
 * (the loading overlay reaches "World ready").
 *
 * NOTE: evaluate/waitForFunction callbacks are serialized and run in the page,
 * so they cannot close over module-level helpers — inline the window access.
 */
export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __mc?: unknown }).__mc;
      const t = document.getElementById("loadtext")?.textContent ?? "";
      return g != null && t === "World ready";
    },
    null,
    { timeout: 30_000 }
  );
}