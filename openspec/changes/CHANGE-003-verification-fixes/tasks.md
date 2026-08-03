# Tasks: CHANGE-003 — Verification-time fixes

- [x] Add `wrapIndex(current, delta, size)` to `src/utils/MathUtils.ts`.
- [x] Use `wrapIndex` in `Game.ts` wheel handler (semantics identical to the
      prior `(selected + dir + HOTBAR.length) % HOTBAR.length`).
- [x] Change F3 key check from `"KeyF3"` to `"F3"` in `Game.ts`.
- [x] Add `#clickToPlay` overlay click listener in `Game.ts` that requests
      pointer lock on the canvas when not locked.
- [x] Tighten `tests/e2e/player.spec.ts` pointer-lock test to the primary
      overlay-click path (remove the hide-overlay fallback).
- [x] Add unit coverage for `wrapIndex` in `tests/unit/Hotbar.test.ts`.
- [x] Re-run typecheck, lint, build, unit tests, and the full e2e suite.