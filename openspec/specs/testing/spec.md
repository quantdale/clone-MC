# Capability: Testing

## Purpose
Define how TryMC is verified: a Vitest unit suite for the deterministic, headless-testable logic, a Playwright end-to-end suite that boots the real browser (dev and production builds) and exercises the full game loop, and the CLI commands that run them. The tests are the enforcement mechanism for the determinism, persistence, collision, raycast, and registry guarantees described by the other capability specs.

## Scope
In scope:
- The Vitest unit suite under `tests/unit/` (9 suites, 48 tests) and its shared helper `testHelpers.ts`.
- The Playwright e2e suite under `tests/e2e/` (3 spec files, 12 tests across 2 projects) and `util.ts`.
- The tooling: `vitest.config.ts`, `playwright.config.ts`, and the npm scripts `test`, `test:watch`, `test:e2e`.
- The `window.__mc` browser hook that makes the running game inspectable for e2e assertions.
- The CI-able commands `npm test`, `npm run test:e2e`, and the static checks `typecheck`/`lint`/`build`.

Out of scope:
- Coverage thresholds / CI gate configuration (vitest coverage is configured to v8 with `include: src/**/*.ts` but no threshold is enforced).
- Visual/regression snapshot testing (none exists).
- Unit tests for the renderer/WebGL path (no WebGL under node; the renderer is covered by e2e only).
- A dedicated mesher unit test or atlas-UV unit test — **not yet present** (see the gap note under AC-TEST-1).

## Functional Requirements

- **FR-TEST-1** — `npm test` runs `vitest run` over `tests/**/*.test.ts` in the `node` environment (`package.json` `test` script; `vitest.config.ts` `environment: "node"`, `include`).
- **FR-TEST-2** — The unit suite is headless: `testHelpers.makeManager` builds a `ChunkManager` with a plain `THREE.Scene` and `MeshLambertMaterial`/`MeshBasicMaterial` only — no `WebGLRenderer` — so meshing and chunk streaming run under node (`tests/unit/testHelpers.ts:10-18`).
- **FR-TEST-3** — The unit suite covers the deterministic logic across nine files:
  - `Random.test.ts` (8 tests) — `mulberry32` determinism, `[0,1)` range, seed variance, boundary/32-bit seeds; `hash2` determinism, seed variance, coordinate variance, bounded output.
  - `Noise.test.ts` (4 tests) — same-seed determinism, cross-seed variance, bounded `noise2`/`noise3` envelope, bounded-and-varying `fbm2`.
  - `TerrainGenerator.test.ts` (6 tests) — per-seed determinism incl. byte-for-byte chunk equality, cross-seed divergence, bedrock + valid block ids, `heightAt` non-negative integers, grass column layering, water fill/beach seabed.
  - `Chunk.test.ts` (4 tests) — `index()` data layout, `get`/`set` round-trip, `applyEdits` overlay (in-range writes, out-of-range ignored, idempotent), empty-edits no-op.
  - `ChunkManager.test.ts` (5 tests) — coordinate conversion round-trip across chunk borders (incl. negatives), `y` outside `[0, CHUNK_HEIGHT)` reads Air / writes false, unloaded-chunk writes return false without throwing, boundary edits dirty neighbor chunks, boundary edit visible from either side.
  - `BlockPicker.test.ts` (8 tests) — first-solid hit + face normals, `MAX_REACH` boundary (exact hit vs. just-beyond), −x/+y directional face normals, diagonal slab, degenerate zero-length direction, empty space.
  - `PlayerController.test.ts` (6 tests) — settle on solid ground, gravity + landing, jump arc, wall collision, water buoyancy, settle on generated terrain.
  - `Hotbar.test.ts` (5 tests) — 9 distinct registered entries with 6-tuple textures, `wrapIndex` forward/back/whole-ring semantics matching the Game wheel.
  - `EditPersistence.test.ts` (2 tests) — an edit survives chunk unload/reload (two cycles) with seed values restored for untouched cells; an unedited chunk regenerates identically.
- **FR-TEST-4** — `testHelpers` provides `makeManager(seed)`, `loadAll(manager[, x, z, maxIter])` (pump until the generation and mesh queues drain), `pump(manager, x, z, n)`, and `pumpUntilLoaded(manager, x, y, z)` (`tests/unit/testHelpers.ts`).
- **FR-TEST-5** — `npm run test:e2e` runs Playwright against `tests/e2e/` (`playwright.config.ts` `testDir`), with `browserName: "chromium"`, `headless: true`, `viewport 1280×720`, `fullyParallel: false`, `workers: 1`, and 60 s test / 15 s expect timeouts (`playwright.config.ts:9-18`).
- **FR-TEST-6** — The e2e config defines two projects: `dev` (baseURL `http://localhost:5199`) and `prod` (baseURL `http://localhost:5198`), and two `webServer` entries that boot the dev server (`npm run dev -- --port 5199 --strictPort`) and rebuild+serve the production bundle (`npm run build && npx vite preview --port 5198 --strictPort`) (`playwright.config.ts:20-41`).
- **FR-TEST-7** — The e2e suite covers three areas:
  - `game.spec.ts` (5 tests) — boots without a `#fatal` overlay and exposes `window.__mc`; renders actual non-black pixels to the WebGL canvas; the loading overlay reaches "World ready" with HUD counters updating; the hotbar renders 9 slots and selection follows digit keys + wheel; the F3 debug overlay shows pipeline stats.
  - `player.spec.ts` (4 tests) — click-to-play engages pointer lock and hides the overlay; `KeyW` moves forward with nonzero velocity; gravity pulls an airborne player down and decelerates a jump; the player AABB never overlaps a solid block.
  - `world.spec.ts` (3 tests) — block targeting/breaking/placing update the world and `stats()`; chunk streaming loads, unloads and reloads around the player; the production bundle boots with no fatal overlay or console errors.
- **FR-TEST-8** — `util.ts` provides `watchErrors(page, sink)` (captures `pageerror` and `console.error`, filtering benign `autofill` and `net::ERR_INTERNET_DISCONNECTED`) and `waitForReady(page)` (waits for `window.__mc` and the `#loadtext` "World ready" state) (`tests/e2e/util.ts`).
- **FR-TEST-9** — The production smoke test self-skips on the dev project: `test.skip(testInfo.project.name !== "prod", …)` (`tests/e2e/world.spec.ts:207`), so it runs only against the built bundle.
- **FR-TEST-10** — Browser assertions read live game state through the `window.__mc` hook (`src/main.ts:36`), which exposes the `Game` instance; e2e uses `g.renderer.renderer.getPixelRatio()`, `g.manager.stats()`, `g.manager.loadedCount()`, `g.player.pos`, and the private `manager.chunks` map (read structurally) to assert behavior.
- **FR-TEST-11** — Static checks are part of the verification story: `npm run typecheck` (`tsc --noEmit`, strict), `npm run lint` (ESLint 9 flat config), and `npm run build` (`tsc && vite build`) all exit 0 (see `code-quality` spec).

## Non-functional Requirements

- **NR-TEST-1** — Determinism-first: the unit suite targets the pure deterministic modules (noise, RNG, terrain, raycast, registry, persistence) so the same seed yields the same assertions in CI and locally.
- **NR-TEST-2** — Headless and fast: the node unit suite needs no browser; the e2e suite runs headless Chromium with `workers: 1` to avoid resource contention.
- **NR-TEST-3** — Zero console errors: every e2e `afterEach` asserts the captured error array is empty, so any browser-side error fails the suite.
- **NR-TEST-4** — Both dev and production are exercised: the `dev` project covers the development server, the `prod` project rebuilds and serves `dist/` to verify the shipped bundle.
- **NR-TEST-5** — The suite must remain green in CI: `npm test` and `npm run test:e2e` are the runnable gates; `test:e2e` requires a one-time `npx playwright install chromium`.

## Inputs and Outputs

Inputs:
- `tests/unit/*.test.ts` + `tests/unit/testHelpers.ts` (Vitest).
- `tests/e2e/*.spec.ts` + `tests/e2e/util.ts` (Playwright).
- `vitest.config.ts`, `playwright.config.ts`, `package.json` scripts.
- Runtime: the live game state via `window.__mc` (e2e).

Outputs:
- `npm test` exit code (0 = green) and per-file pass/fail summary.
- `npm run test:e2e` exit code and Playwright list report (dev + prod projects).
- `test-results/` and `playwright-report/` artifacts (gitignored).
- Coverage output when requested (`coverage/`, v8 provider, `include: src/**/*.ts`).

## Core Data Structures
- `tests/unit/testHelpers.ts`: `makeManager(seed)`, `loadAll(manager, x, z, maxIter)`, `pump(manager, x, z, n)`, `pumpUntilLoaded(manager, x, y, z)`.
- `tests/e2e/util.ts`: `watchErrors(page, sink)`, `waitForReady(page)`.
- `playwright.config.ts` projects: `{ name: "dev", baseURL: DEV_URL }`, `{ name: "prod", baseURL: PROD_URL }` with `DEV_URL = :5199`, `PROD_URL = :5198`.
- `window.__mc: Game` — the browser test hook (`src/main.ts:36`).

## Dependencies
- `tests/unit/*` → `src/utils/*`, `src/blocks/*`, `src/world/*`, `src/player/*` (deep imports, no browser/lib mocking beyond `three`).
- `tests/e2e/*` → `@playwright/test`, `src/core/Game.ts` (type-only).
- Tooling: `vitest` (^3.2.4), `@playwright/test` (^1.62.1), `typescript`, `eslint` (`package.json` devDependencies).
- `tests/unit/testHelpers.ts` → `three`, `src/world/ChunkManager.ts`, `src/blocks/Blocks.ts`.

## Error and Edge-Case Behavior
- **Unloaded world writes**: `ChunkManager.test.ts` asserts `setBlockWorld` on an unloaded/far chunk returns `false` without throwing (guards the `#fatal`-free runtime path).
- **Out-of-world reads/writes**: `ChunkManager.test.ts` asserts `y` outside `[0, 64)` reads Air and refuses writes.
- **Degenerate raycast**: `BlockPicker.test.ts` asserts a zero-length direction and empty space terminate (never hang).
- **Spawn heuristic**: `PlayerController.test.ts` and `EditPersistence.test.ts` use generous timeouts (60–120 s) because the full 13×13 world load is slow under node.
- **Skipped-by-design**: the production smoke test is skipped on the `dev` project (`world.spec.ts:207`), so the 24 runs yield 23 passes + 1 skip — a deliberate, not a failure, outcome.
- **Console noise**: `watchErrors` filters benign `autofill` and `net::ERR_INTERNET_DISCONNECTED` messages so environment noise does not fail the suite (`util.ts:13-17`).

## Performance Expectations
- The unit suite is deterministic and reproducible; the full world-load tests dominate wall-clock time (default 60 s, generous up to 120 s timeouts).
- The e2e suite runs `workers: 1` and `fullyParallel: false` to keep the browser and the two web servers from exhausting resources; a full run takes well under the 60 s per-test budget.
- The `prod` web server rebuilds `dist/` on each e2e run (`npm run build`) before serving, so the built bundle is always verified fresh.
- **To be measured**: no CI running time is pinned; the suite is expected to complete in the low minutes locally.

## Acceptance Criteria
- **AC-TEST-1** — Automated unit tests exist covering the deterministic logic: RNG/noise determinism, terrain determinism per seed, chunk/coordinate conversion, chunk-boundary edits, `applyEdits` persistence overlay, voxel DDA raycast, hotbar registry, and player collision. (Gap: the suite does **not** yet include a dedicated mesher-invariant or atlas-UV unit test — those behaviors are covered by code inspection and e2e.)
- **AC-TEST-2** — `npm test` passes with a green suite (9 files / 48 tests, exit 0).
- **AC-TEST-3** — Static checks are green: `npm run typecheck`, `npm run lint`, `npm run build` all exit 0.
- **AC-TEST-4** — Browser smoke: the app boots in a real browser, the `window.__mc` hook is present, the canvas renders pixels, and no console errors are thrown during startup — verified on both the dev and production bundles.

## Verification Method
- **AC-TEST-1**: Structural — enumerate `tests/unit/*.test.ts` and map each to the capability it covers (see FR-TEST-3); the nine files are present and named for their module.
- **AC-TEST-2**: CLI — run `npm test`; expect 9 files / 48 tests, exit 0. (Observed 2026-08-03: 48/48 passed, exit 0.)
- **AC-TEST-3**: CLI — run `npm run typecheck`, `npm run lint`, `npm run build`; each exits 0.
- **AC-TEST-4**: CLI — run `npm run test:e2e`; expect 24 runs (12 tests × dev/prod), 23 passed + 1 skipped-by-design (the prod smoke test skips on `dev`), exit 0. The `game.spec.ts` "renders actual pixels" and "initializes without a fatal overlay and exposes the __mc hook" tests, plus `world.spec.ts` "production bundle boots", are the primary smoke assertions.