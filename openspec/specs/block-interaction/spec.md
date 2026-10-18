# Capability: Block Interaction

## Purpose
Define how TryMC lets the player target, break, and place blocks in the world. This includes the voxel raycast (`BlockPicker.raycastBlocks`), the reach limit, the selection-box highlight, and the break/place actions that mutate chunk data through `ChunkManager.setBlockWorld` and trigger the appropriate mesh rebuilds. Block interaction is the player-facing manifestation of the world-edit pipeline.

## Scope
In scope:
- `BlockPicker.raycastBlocks` (`src/player/BlockPicker.ts`): Amanatides & Woo grid DDA, first-hit return with face normal.
- `Game.currentHit`, `Game.breakBlock`, `Game.placeBlock` (`src/core/Game.ts`).
- Reach limit `MAX_REACH`, selection box updates.
- The `setBlockWorld` edit path including boundary remesh and edit overlay (owner: `ChunkManager`).

Out of scope:
- Inventory/hotbar selection mechanics (see `inventory`).
- Chunk streaming/rebuild scheduling (see `chunk-streaming`).
- Player collision/physics (see `player-controller`).

## Functional Requirements

- **FR-BI-1** — `raycastBlocks(ox,oy,oz,dx,dy,dz,maxDist,getBlock)` steps through the voxel grid using the DDA algorithm and returns the first cell whose `getBlock` value is non-`Air`, skipping the cell the ray starts inside so targeting never returns the block the player's eye is in (e.g. swimming) with a zero normal (`BlockPicker.ts`).
- **FR-BI-2** — The returned `BlockHit` is `{ x, y, z, nx, ny, nz }` where `(nx,ny,nz)` is the face normal of the hit face (`BlockPicker.ts:3-12, 50-53`).
- **FR-BI-3** — The raycast is bounded by `maxDist` and a 512-step safety cap; it returns `null` when no block is hit within reach (`BlockPicker.ts:49, 75`).
- **FR-BI-4** — `Game.currentHit()` casts the ray from the camera position along the camera's forward direction (via `(0,0,-1)` rotated by the camera quaternion), with `maxDist = MAX_REACH` (6) and `getBlock` backed by `manager.getBlockWorld` (`Game.ts:137-150`).
- **FR-BI-5** — `breakBlock()` sets the targeted cell to `Block.Air` via `setBlockWorld` when a hit exists (`Game.ts:152-156`).
- **FR-BI-6** — `placeBlock()` places the currently selected hotbar block at the cell adjacent to the hit face (`hit + normal`), rejecting out-of-range `y` and refusing to place a solid block that overlaps the player's AABB (`Game.ts:158-179`).
- **FR-BI-7** — The selection box (`selectionBox`) is shown at the targeted cell and hidden when nothing is targeted (`Game.ts:193-195`).
- **FR-BI-8** — Left mouse button (button 0) breaks; right mouse button (button 2) places; both only fire while pointer-locked (`Game.ts:105-109`).
- **FR-BI-9** — Right-click context menu is suppressed globally (`window.addEventListener("contextmenu", e => e.preventDefault())`, `Game.ts:119`).
- **FR-BI-10** — `setBlockWorld` returns `false` (no-op) for out-of-range `y` or missing chunks, and the caller's `breakBlock`/`placeBlock` still succeed from the user's perspective (the action is simply a no-op for invalid targets) (`ChunkManager.ts:80-104`).

## Non-functional Requirements

- **NR-BI-1** — Reach is bounded by `MAX_REACH = 6` (`src/Constants.ts:5`).
- **NR-BI-2** — The raycast is deterministic and bounded (`maxDist`, 512-step cap) so it cannot loop forever (`BlockPicker.ts:49, 75`).
- **NR-BI-3** — Placed solid blocks must not intersect the player (`Game.ts:169-176`); out-of-range `y` placements are rejected (`Game.ts:165`).
- **NR-BI-4** — **To be measured**: raycast cost per frame is a single grid DDA over ≤ `MAX_REACH` cells; negligible but not instrumented.

## Inputs and Outputs

Inputs:
- `ox,oy,oz` ray origin; `dx,dy,dz` unit direction; `maxDist`; `getBlock` callback — to `raycastBlocks`.
- Mouse button (0/2) and pointer-lock state — to `breakBlock`/`placeBlock`.
- `selected` hotbar index (for `placeBlock`).

Outputs:
- `BlockHit | null` from `raycastBlocks`/`currentHit`.
- World mutations via `setBlockWorld` (block id at a cell, plus neighbor remesh and edit-overlay record).
- `selectionBox` visibility/position.

## Core Data Structures
- `BlockHit` interface (`BlockPicker.ts:3-12`): `{ x; y; z; nx; ny; nz }`.
- `Block` enum (`src/blocks/Blocks.ts:1-12`): `Air=0 … Brick=9`.
- `HOTBAR: readonly Block[]` (`Blocks.ts:67-77`): the 9 placeable blocks.
- `BlockDef` (`Blocks.ts:28-37`): `{ id; name; solid; opaque; textures }`; `BLOCKS[id].solid` gates player-collision placement.
- `setBlockWorld` edit overlay: `edits: Map<chunkKey, Map<cellIndex, blockId>>` (`ChunkManager.ts:35`).

## Dependencies
- `src/player/BlockPicker.ts` → `src/blocks/Blocks.ts` (`Block`).
- `src/core/Game.ts` → `src/player/BlockPicker.ts`, `src/blocks/Blocks.ts`, `src/Constants.ts`, `src/world/ChunkManager.ts`.
- `BlockPicker` is pure (no three dependency) and unit-testable without a renderer.

## Error and Edge-Case Behavior
- **No hit within reach**: `raycastBlocks` returns `null`; `breakBlock`/`placeBlock` return early; `selectionBox` hidden (`Game.ts:153, 159, 194`).
- **Out-of-range y**: `placeBlock` rejects `by < 0 || by >= CHUNK_HEIGHT` (`Game.ts:165`); `setBlockWorld` also guards `y` (`ChunkManager.ts:81`).
- **Missing chunk**: `setBlockWorld` returns `false` for a missing chunk; the target cell is treated as Air by `getBlockWorld`, so the raycast can still return a hit on a neighboring present chunk (`ChunkManager.ts:86`).
- **Player overlap on place**: placing a solid block that would overlap the player's AABB is rejected (`Game.ts:169-176`); placing water (non-solid) is allowed even if it overlaps.
- **Ray through water**: `getBlock` returns `Block.Water` (non-Air), so water blocks are targetable and breakable/placeable; the DDA treats only `Block.Air` as empty (`BlockPicker.ts:50`).
- **Boundary edits**: `setBlockWorld` marks the neighbor chunk dirty on boundary faces, so a break/place at a chunk edge remeshes both chunks (`ChunkManager.ts:99-102`).
- **Edit persistence**: successful `setBlockWorld` records the edit in the overlay so it survives chunk unload/reload (`ChunkManager.ts:90-96`).

## Performance Expectations
- Raycast cost: one DDA over ≤ 6 cells per frame (plus the 512-step safety cap), each step one `getBlockWorld` lookup.
- A break/place triggers at most one chunk rebuild, plus one neighbor rebuild on a boundary edit (both within the 6 ms mesh budget).
- **To be measured**: no standalone timing; interaction is expected to be sub-millisecond per event.

## Acceptance Criteria
- **AC-BI-1** — `raycastBlocks` returns the first non-Air block along the ray with the correct face normal; returns `null` beyond `maxDist`.
- **AC-BI-2** — From a camera direction, `currentHit()` returns a hit within `MAX_REACH` for a targeted block and `null` when aimed at the sky/empty space.
- **AC-BI-3** — Left-click breaks the targeted block (cell becomes `Air`) and the block disappears from the world.
- **AC-BI-4** — Right-click places the selected hotbar block at the cell adjacent to the targeted face, and the block appears.
- **AC-BI-5** — Placing a solid block so it would overlap the player is rejected (block not placed).
- **AC-BI-6** — Placing a block at `y < 0` or `y >= 64` is rejected even if the raycast returns a hit.
- **AC-BI-7** — Breaking/placing a block on a chunk boundary remeshes both the owning and neighboring chunk (no visual seam).
- **AC-BI-8** — A placed/removed block persists across a chunk unload/reload (edit overlay).
- **AC-BI-9** — The selection box highlights the targeted block and disappears when nothing is targeted.
- **AC-BI-10** — Right-clicking does not open the browser context menu.

## Verification Method
- **AC-BI-1**: Unit — call `raycastBlocks` with a synthetic `getBlock` over a known grid and assert the hit cell and face normal; assert `null` beyond `maxDist`. (No unit tests exist yet; create under `tests/**/*.test.ts`.)
- **AC-BI-2**: E2E — aim at a block, read `window.__mc.currentHit()` (exposed via `Game`); aim at the sky and assert `null`.
- **AC-BI-3 / AC-BI-4**: Manual — left/right click and observe the block removed/added. E2E — after a click, read `getBlockWorld` at the target cell and assert `Air`/placed id.
- **AC-BI-5 / AC-BI-6**: Unit — place a solid block overlapping the player AABB and assert it is not placed; place at `y = 64`/`y = -1` and assert rejection.
- **AC-BI-7**: E2E — break a block at `lx = 0` of a chunk and confirm the neighbor's meshes update (no seam); verify via `stats().pendingMesh` during the rebuild.
- **AC-BI-8**: E2E — place a block, leave range, return, verify it persists. Unit — assert `edits` overlay contains the cell after `setBlockWorld`.
- **AC-BI-9**: E2E — observe the selection box toggling with the target.
- **AC-BI-10**: Manual — right-click and confirm no context menu appears.