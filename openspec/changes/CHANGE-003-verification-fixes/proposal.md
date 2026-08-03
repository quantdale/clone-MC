# Proposal: CHANGE-003 — Verification-time fixes

## What is being changed and why

Browser verification (Playwright, real Chromium) surfaced defects and
testability gaps after CHANGE-001/002 as the mandatory §23 checklist was
exercised:

1. **Pointer lock never engaged from the primary affordance.** The full-screen
   `#clickToPlay` overlay (z-index 9) covers the `#game` canvas, so clicks
   landed on the overlay and never reached the canvas's single
   `requestPointerLock` listener. The game was effectively unplayable by mouse.
2. **F3 debug toggle never fired.** The `keydown` handler checked
   `e.code === "KeyF3"`, but browsers report function keys as `e.code === "F3"`.
3. **Wheel-selection logic was untestable in isolation.** The wrap arithmetic
   lived inline in `Game.ts`; a pure helper was extracted so unit tests can
   pin the wrap semantics.

## Status: Complete