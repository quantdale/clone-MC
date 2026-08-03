# Verification: CHANGE-003 — Verification-time fixes

## Static pipeline (run against final Change state, 2026-08-03)

| Step | Command | Result |
| --- | --- | --- |
| Type-check | `npm run typecheck` | **OK** — exit 0 |
| Lint | `npm run lint` | **OK** — exit 0 |
| Build | `npm run build` | **OK** — exit 0 (tsc + vite build) |
| Unit tests | `npm test` | **OK** — 9 files / 48 tests passed |
| Browser tests | `npm run test:e2e` | **OK** — 23 passed / 1 skipped by design (dev + prod projects) |

## Browser evidence (Playwright MCP, Chromium, dev server)

### Pointer-lock overlay click (regression fix)

1. Loaded `http://localhost:5174/?seed=7`, waited for "World ready".
2. Clicked the `#clickToPlay` overlay (the visible "Click to play" panel).
3. `document.pointerLockElement != null` → **true**; `#clickToPlay` gained the
   `hidden` class. **PASS** — the primary affordance now engages pointer lock.

### F3 debug toggle (regression fix)

1. Dispatched a `keydown` with `code: "F3"` on `window`.
2. `#debug` toggled from visible to hidden (`.hidden` class), then back.
   **PASS** — the handler now matches the browser-reported function-key code.

### Block break / place via real input (pointer-locked)

1. Aimed the camera straight down (`pitch = -1.55`), let the loop apply it.
2. `currentHit()` returned the grass block below the feet (`[0,46,6]`).
3. Left `mousedown` (button 0) broke it to Air (`brokeToAir: true`).
4. The player fell into the dug hole; a right-click placement targeting the
   now-inside-player cell was correctly rejected by the overlap guard
   (`editedCells` stayed 1 = only the break recorded). **PASS** — break via
   real input works, and the no-place-inside-player guard holds.

## Status

- **Complete.** All three fixes implemented and verified. The e2e pointer-lock
  test now asserts the primary overlay-click path (no fallback), so a future
  regression is caught by `npm run test:e2e`.