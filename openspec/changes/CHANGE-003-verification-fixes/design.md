# Design: CHANGE-003 — Verification-time fixes

## Affected components

| Component | Change |
| --- | --- |
| `src/core/Game.ts` | Add a click listener on the `#clickToPlay` overlay that routes to the same `canvas.requestPointerLock()` path; change the F3 check to `e.code === "F3"`; use `wrapIndex` for wheel selection. |
| `src/utils/MathUtils.ts` | Add pure `wrapIndex(current, delta, size)` (double-modulo, safe for any-magnitude negative deltas). |
| `tests/e2e/player.spec.ts` | Pointer-lock test now asserts the primary path (click the overlay → `pointerLockElement` set) instead of the old fallback that hid the overlay and clicked the canvas. |
| `tests/unit/Hotbar.test.ts` | Pins `wrapIndex` semantics incl. wraparound at both ends. |

## Pointer-lock routing decision

Two listeners now exist: the original on the canvas (still valid once the
overlay is hidden after lock exit) and a new one on the overlay (the visible
"Click to play" affordance). Both guard on `!isLocked()` so re-clicking cannot
re-lock while already locked, and both request lock on `canvas` itself —
requesting on the canvas keeps the pointer-lock target element stable. The
overlay hides via `pointerlockchange` (`HUD.setLocked`), and reappears on
unlock (Esc), so click-to-resume uses the same overlay listener.

## Why not alternatives

- Overlay `pointer-events: none` + a button: changes markup/CSS and adds a
  narrower click target; delegating on the overlay is simpler.
- Single listener on a common ancestor: the overlay and canvas are siblings
  with different stacking contexts; two small listeners are clearer.
