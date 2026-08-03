# Change Proposal: CHANGE-002 — Edit persistence & error handling

**Status:** Accepted (implemented)
**Date:** 2026-08-03
**Change ID:** `openspec/changes/CHANGE-002-edit-persistence-and-error-handling/`
**Related ADRs:** ADR-004 (in-session edit persistence)

## Summary

Make player edits durable across chunk unload/reload within a session, and
make startup failures visible instead of silent. Concretely: an edits overlay
in `ChunkManager` + `Chunk.applyEdits`, DOM validation and a `#fatal` overlay
in `src/main.ts`, an F3 debug overlay in the HUD, a texture-context guard in
`TextureAtlas`, and a zero-byte favicon to suppress the 404 request.

## Motivation

Two correctness gaps existed before this change:

1. **Edits could vanish.** `ChunkManager.unloadFar` drops chunks when the
   player moves away; `generateChunk` then regenerates them from the seed
   (ADR-003). Any broken/placed block in an unloaded chunk would silently
   revert. Building was therefore useless beyond a single chunk's lifetime.
2. **Startup could fail silently.** If a required DOM id was missing or WebGL
   was unavailable, `src/main.ts` had no way to tell the player what went
   wrong. The same applied to the canvas texture atlas: a failed `getContext`
   would throw an unhelpful crash instead of a clear message, and browsers
   would 404 a `/favicon.ico` request on a game that has no favicon file.

## Scope

- `src/world/ChunkManager.ts`: edit overlay map, reapply on regeneration,
  `stats().editedCells`, boundary-neighbor dirtying.
- `src/world/Chunk.ts`: `applyEdits(edits)`.
- `src/main.ts`: `REQUIRED_IDS` validation, `getRequired`, try/catch boot
  with `#fatal` surfacing.
- `src/ui/HUD.ts`: `setDebug` + `toggleDebug` (F3 debug overlay).
- `src/core/Game.ts`: F3 key handler; per-frame debug HUD feed.
- `src/blocks/TextureAtlas.ts`: 2D context guard.
- `index.html`: `#fatal` element, `#debug` element, `<link rel="icon"
  href="data:," />`.

The full reasoning for the overlay design (why absolute states, why no
localStorage, memory bounds, edge cases) is recorded in **ADR-004**.

## Non-goals

- Persistent storage across page reloads (see ADR-004).
- Undo/redo for edits.
- Any renderer/terrain changes beyond the debug overlay.