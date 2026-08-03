import { defineConfig } from "@playwright/test";

/** Fixed dev-server port (avoids the dev servers that may already be running on 5173/5174). */
const DEV_URL = "http://localhost:5199";
/** Built-bundle preview port served from dist/ via `vite preview`. */
const PROD_URL = "http://localhost:5198";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    // End-to-end tests against the Vite dev server.
    { name: "dev", use: { baseURL: DEV_URL } },
    // The same specs (incl. a production smoke test) against the built bundle.
    // The prod smoke test skips itself on the dev project via testInfo (see world.spec.ts).
    { name: "prod", use: { baseURL: PROD_URL } },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 5199 --strictPort",
      url: DEV_URL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Rebuild (tsc + vite build) and serve dist/ so the bundle is verified fresh.
      command: "npm run build && npx vite preview --port 5198 --strictPort",
      url: PROD_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
