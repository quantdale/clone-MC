# Spec delta: CHANGE-003 — Verification-time fixes

## Added requirements

- `UI-POINTERLOCK-1`: The visible "Click to play" overlay must engage pointer
  lock when clicked (primary affordance), not only the canvas underneath it.
- `UI-POINTERLOCK-2`: After pointer lock exits (Esc), clicking the overlay
  must re-engage pointer lock (click-to-resume).
- `UI-DEBUG-TOGGLE-1`: The `F3` key must toggle the debug overlay (handlers
  must match the browser-reported key code `"F3"`).

## Changed requirements

- `HOTBAR-3` (wheel selection): the wrap-around selection arithmetic is now
  provided by the pure `wrapIndex` helper in `src/utils/MathUtils.ts`; the
  observable behavior is unchanged.

## Unchanged

- Pointer-lock target element remains the `#game` canvas.
- No changes to block data, world generation, or chunk streaming.