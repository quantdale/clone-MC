# Verification: CHANGE-002 — Edit persistence & error handling

## Static pipeline (all run on 2026-08-03 against the final Change state)

| Step | Command | Result |
| --- | --- | --- |
| Type-check | `npm run typecheck` | **OK** — exit 0 |
| Lint | `npm run lint` | **OK** — exit 0 |
| Build | `npm run build` | **OK** — tsc + vite build exit 0 |
| Unit tests | `npm test` | **OK** — 9 files / 48 tests passed, exit 0 (see below) |
| Browser tests | `npm run test:e2e` | **OK** — 23 passed / 1 skipped by design, dev + prod projects |

## Unit tests — status: VERIFIED

`tests/unit/` ships 9 test files / 48 tests (vitest, node env). Relevant to
this change:

- `tests/unit/EditPersistence.test.ts` — edit survives chunk unload→reload
  (two cycles), unedited cells return to seeded values, cross-manager
  regeneration equality.
- `tests/unit/Chunk.test.ts` — `applyEdits` bounds (out-of-range indices
  ignored), idempotent, empty-map no-op.
- `tests/unit/TerrainGenerator.test.ts` — seed determinism (full chunk
  `Uint8Array` equality), bedrock, id range.

## Browser verification — status: VERIFIED (this session)

Performed with Playwright (Chromium) against the Vite dev server
(`npm run dev`, port 5199, HTTP 200), using the `window.__mc` test hook.
Screenshot evidence: `docs/docs-verify-roundtrip.png`.

### 1. Boot / main page

- Title "TryMC — Voxel Sandbox"; no console errors.
- HUD snapshot: `FPS 60`, `Chunks 169`, `Day/night: ON`,
  `pending gen 0 · pending mesh 0 · edited 0 · tris 89514`, overlay
  **"World ready"**.

### 2. Edit persistence round-trip (`setBlockWorld` → unload → reload)

1. `window.__mc.manager.setBlockWorld(-2, 41, 2, 9)` (Brick) → returned
   `true`; `getBlockWorld(-2, 41, 2)` returned `9`; `stats().editedCells` =
   `1`; owner chunk key `"-1,0"`.
2. Teleported player to `(400, 62, 400)` (>128 blocks away; `VIEW_RADIUS+2` =
   8 chunks). After 3 s: `stats().editedCells` still `1` while chunk `-1,0`
   was outside the stream window.
3. Teleported back to `(-2.5, 41, 2.5)`; waited 3 s for regeneration.
4. `getBlockWorld(-2, 41, 2)` returned **`9`** — the edit survived chunk
   unload + regeneration + reload via the overlay. **PASS**
5. `setBlockWorld(-2, 41, 2, 0)` (Air) returned `true`; subsequent read
   returned `0` — overwrite (edit-then-edit edge case) behaves correctly.

### 3. Fatal-path error handling

Two temporary pages (deleted after the run) exercised `main.ts`'s catch:

- **Page missing all required ids** (no `#game`, no `#fatal`): console error
  `[trymc] failed to initialize: Error: Required DOM element "#game" is
  missing.` (thrown at `src/main.ts:20`); the `alert` fallback fired (dialog
  observed and accepted). **No `#fatal` → alert branch: VERIFIED.**
- **Page with `#fatal` present but `#game` missing**: no dialog; snapshot
  showed heading **"Failed to start"** plus the `<pre>` text `Failed to
  initialize TryMC: Required DOM element "#game" is missing.`, with
  `#clickToPlay` and `#loading` hidden. **`#fatal` overlay branch:
  VERIFIED.**

### 4. Favicon suppression

The bare fatal-path test page (no favicon `<link>`) logged `404
(Not Found) favicon.ico`; the real `index.html` page (with `<link rel="icon"
href="data:," />`) logged **no** favicon request. — Support for §21/CHANGE-001.

## Not browser-exercised (code-inspected only)

- **Texture-context guard** (`TextureAtlas.build`): cannot be provoked in a
  working browser (2D context succeeds on real canvases); the throw branch is
  verified by code inspection only.
- **`N` day/night toggle**: delivered by earlier browser sessions; not
  re-driven here.

## Status summary

- VERIFIED (this session): boot, edit round-trip persistence, both fatal-path
  branches, favicon suppression, full static pipeline, unit suite (48/48),
  browser suite (23/23 + 1 skip).
- VERIFIED (later session): F3 keyboard toggle (browser), pointer-lock entry
  and block break/place via real input (browser) — see CHANGE-003.
- PENDING: texture-context guard failure path (not triggerable without
  breaking the browser).