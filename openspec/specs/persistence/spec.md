# Capability: Persistence

## Purpose
Define how in-session block edits (player breaks/places) survive chunk unload and reload. The world regenerates deterministically from the seed every time a chunk is generated, so edits must be recorded separately and re-applied on top of freshly generated terrain — otherwise a player's changes would vanish the moment a chunk streams out of range and back in. This spec covers the `ChunkManager.edits` overlay, `Chunk.applyEdits`, and the explicit non-goal of cross-session storage.

## Scope
In scope:
- The in-memory edit overlay `ChunkManager.edits: Map<chunkKey, Map<cellIndex, blockId>>`.
- Recording edits in `setBlockWorld`; re-applying them in `generateChunk` after `terrain.generate`.
- `Chunk.applyEdits` semantics (absolute per-cell overlay, out-of-range ignored, idempotent).
- The debug-overlay `editedCells` counter (`stats()`).
- Session-only scope by design: no `localStorage`, IndexedDB, or backend storage anywhere in `src/`.
- Memory bounds and the determinism guarantee for unedited cells.

Out of scope:
- Cross-session / cross-reload persistence (explicitly a non-goal; a page reload regenerates the world from the seed).
- Saving/loading to disk, cloud, or server, or any serialization format.
- Undo/redo history or per-edit metadata beyond the block id.
- The `edits` overlay's effect on the HUD count (see `user-interface` spec) and boundary remeshing (see `block-interaction` spec).

## Functional Requirements

- **FR-PERS-1** — `ChunkManager` holds `private edits = new Map<string, Map<number, number>>()`; the outer key is the chunk key `"cx,cz"` and the inner map is cell index → block id (`src/world/ChunkManager.ts:35`).
- **FR-PERS-2** — Every successful write through `setBlockWorld` records the edit: after `chunk.set`, it inserts `cellEdits.set(chunk.index(lx, y, lz), id)` into the per-chunk map, creating the map on first use (`ChunkManager.ts:80-96`).
- **FR-PERS-3** — Edits are recorded as **absolute** per-cell states, not deltas: the stored value is the exact block id the cell should hold after regeneration, so the overlay composes with any freshly generated terrain (`ChunkManager.ts:31-34` docstring; `ChunkManager.ts:96`).
- **FR-PERS-4** — On chunk generation, edits are applied **after** terrain generation and before the chunk becomes readable: `generateChunk` runs `this.terrain.generate(chunk)`, then `if (cellEdits) chunk.applyEdits(cellEdits)`, then stores the chunk and meshes it (`ChunkManager.ts:148-155`).
- **FR-PERS-5** — `Chunk.applyEdits(edits)` writes the recorded id into the block-data array for every edit whose index is in `[0, data.length)`, ignoring out-of-range indices (`src/world/Chunk.ts:45-49`).
- **FR-PERS-6** — `applyEdits` is idempotent: applying the same overlay twice yields the same data, and re-applying after a fresh regeneration reproduces the same cells (`Chunk.ts:45-49`; verified by `tests/unit/Chunk.test.ts` "applying the same overlay again is idempotent").
- **FR-PERS-7** — Unedited cells keep their deterministic generated values: `applyEdits` only touches the recorded indices and never rewrites the rest of the chunk (`Chunk.ts:45-49`; verified by `tests/unit/EditPersistence.test.ts`).
- **FR-PERS-8** — Deleting the chunk in `unloadFar` does **not** remove its edit overlay entry; the overlay survives unload so the edits re-apply on reload (`ChunkManager.ts:170-180`; overlay is a separate map, untouched by `unloadFar`).
- **FR-PERS-9** — `stats().editedCells` reports the total number of edited cells as the sum of the per-chunk edit-map sizes (`ChunkManager.ts:59-68`); the HUD debug overlay renders it as `edited N` (`src/ui/HUD.ts:90-94`).
- **FR-PERS-10** — Persistence is session-only by design: no `localStorage`, `indexedDB`, `fetch`, or any storage/backend API is referenced anywhere in `src/` (grep-verified). A page reload regenerates the world from the seed and discards all edits.

## Non-functional Requirements

- **NR-PERS-1** — The overlay must not change the terrain for unedited cells: determinism of the generated world is preserved exactly (see `world-generation` spec and `tests/unit/EditPersistence.test.ts` "an unedited chunk regenerates identically").
- **NR-PERS-2** — Memory is bounded by the number of edited cells, not by chunk size or world size: only cells the player actually wrote have an entry; unedited chunks contribute zero entries.
- **NR-PERS-3** — The overlay is a critical-path-adjacent write: `setBlockWorld` adds one map insert per edit, negligible vs. the subsequent remesh.
- **NR-PERS-4** — No persistence across page reloads is an intentional, documented decision (README "Known limitations"; `ADR-004-in-session-edit-persistence`).

## Inputs and Outputs

Inputs:
- `setBlockWorld(x, y, z, id)` — the single mutation point that feeds the overlay.
- `generateChunk(cx, cz)` — the point where the overlay is re-applied over freshly generated terrain.
- `unloadFar()` — the trigger that unloads a chunk while keeping its overlay entry.

Outputs:
- `ChunkManager.edits` (internal state) — `Map<chunkKey, Map<cellIndex, blockId>>`.
- `stats().editedCells` — a number for the F3 debug overlay.
- Re-applied chunk data — the block array after `generateChunk` includes the overlay.

## Core Data Structures
- `ChunkManager.edits: Map<string, Map<number, number>>` (`ChunkManager.ts:35`) — outer key `"cx,cz"`, inner cell index → block id.
- `Chunk.applyEdits(edits: Map<number, number>): void` (`Chunk.ts:45-49`) — writes recorded ids into `this.data` in range.
- `Chunk.index(lx, ly, lz): number` (`Chunk.ts:37-39`) — the cell index used as the inner-map key (`(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx`).
- `Chunk.stats()` return shape `{ loaded, pendingGen, pendingMesh, editedCells }` (`ChunkManager.ts:60-69`).

## Dependencies
- `src/world/ChunkManager.ts` → `src/world/Chunk.ts` (`applyEdits`, `index`), `src/world/TerrainGenerator.ts` (`generate`), `src/blocks/Blocks.ts` (`Block`), `src/Constants.ts` (`CHUNK_SIZE`, `CHUNK_HEIGHT`, `VIEW_RADIUS`).
- `src/world/Chunk.ts` → `src/Constants.ts`, `src/world/Mesher.ts`.
- `tests/unit/EditPersistence.test.ts` and `tests/unit/Chunk.test.ts` exercise the overlay directly (see `testing` spec).

## Error and Edge-Case Behavior
- **Out-of-range edit index**: `applyEdits` ignores indices `< 0` or `>= data.length`; a stale/foreign edit never corrupts the array (`Chunk.ts:45-49`).
- **Empty overlay**: `applyEdits(new Map())` is a no-op (`Chunk.ts:45-49`; `tests/unit/Chunk.test.ts`).
- **Edit to an unloaded chunk**: `setBlockWorld` returns `false` and records nothing (no overlay entry) when the chunk is not loaded (`ChunkManager.ts:83-87`).
- **Edit outside the world height**: `setBlockWorld` returns `false` for `y < 0 || y >= CHUNK_HEIGHT` and records nothing (`ChunkManager.ts:81`).
- **Repeated unload/reload cycles**: because the overlay is absolute and keyed by stable cell index, the same edit survives arbitrarily many cycles (`tests/unit/EditPersistence.test.ts` runs two cycles).
- **Overlay while chunk unloaded**: `editedCells` still counts the cell (the overlay is kept), so the debug counter is stable across unloads (`ChunkManager.ts:59-68`; `EditPersistence.test.ts` asserts `editedCells === 1` after unload).

## Performance Expectations
- Per-edit cost: one `Map.set` on the chunk's overlay and one `chunk.set`; the remesh that follows dominates.
- Regeneration cost: `applyEdits` iterates only the edited cells of that chunk (O(edits in chunk)), not the whole 16 KB array.
- Memory: O(total edited cells); no per-chunk entry is created unless the player edits that chunk.
- **To be measured**: with only a handful of in-session edits, the overlay has no measurable effect on frame time; the dominant cost remains the budgeted remesh (see `performance` spec).

## Acceptance Criteria
- **AC-PERS-1** — Every in-session block edit is recorded as an absolute cell state per chunk and re-applied over freshly generated terrain when that chunk regenerates, so breaks/places survive chunk unload and reload within the session.
- **AC-PERS-2** — The debug overlay reports the total number of edited cells.
- **AC-PERS-3** — Persistence is session-only by design: no localStorage/IndexedDB/backend usage exists, so a page reload regenerates the world from the seed.
- **AC-PERS-4** — Unedited cells keep their deterministic generated values after an edit overlay is applied (determinism preserved).

## Verification Method
- **AC-PERS-1**: Unit — `tests/unit/EditPersistence.test.ts` "keeps an edited cell while restoring seed values for untouched cells": place a block, teleport far (timing the 1 s unload), return, and assert the edit persisted while a control cell returned to its seed value; runs the cycle twice. E2E — place a block, move out of range and back, verify it persists.
- **AC-PERS-2**: Unit — after `setBlockWorld`, assert `manager.stats().editedCells` increments (covered in `EditPersistence.test.ts` and `tests/unit/ChunkManager.test.ts`); E2E — F3 overlay shows the `edited` count.
- **AC-PERS-3**: Code inspection — grep `src/` for `localStorage`/`indexedDB`/`fetch` (none); Browser — reload the page and confirm the world regenerates from the seed with edits gone.
- **AC-PERS-4**: Unit — `tests/unit/EditPersistence.test.ts` "an unedited chunk regenerates identically from scratch" (two managers, same seed, byte-equal samples); `tests/unit/Chunk.test.ts` asserts untouched cells are unchanged after `applyEdits`.