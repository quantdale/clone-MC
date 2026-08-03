# Capability: Chunk Streaming

## Purpose
Define how TryMC manages the on-disk-less chunk grid in memory: which chunks exist, how they are generated and meshed within per-frame time budgets, how dirty chunks are rebuilt, how far the world streams, and how far-away chunks are unloaded. The `ChunkManager` is the single owner of the chunk grid, the mesh rebuild schedule, and the in-session edit overlay.

## Scope
In scope:
- `ChunkManager` (`src/world/ChunkManager.ts`): chunk map, spiral queue, generation/mesh budgets, dirty-set rebuild, boundary edits, unload, `stats()`, `loadedCount()`, `getBlockWorld`, `setBlockWorld`.
- `Chunk` (`src/world/Chunk.ts`): data storage, index layout, `applyEdits`, `buildMesh`, `dispose`.
- The in-session edit overlay (`edits` map) and its reapplication on regeneration.
- Constants: `VIEW_RADIUS`, `CHUNK_SIZE`, `CHUNK_HEIGHT`.

Out of scope:
- Terrain generation internals (see `world-generation`).
- Meshing algorithm details (see `world-generation`/`rendering`).
- Player physics and interaction layers (see `player-controller`, `block-interaction`).

## Functional Requirements

- **FR-CS-1** — Chunks are stored in a `Map<string, Chunk>` keyed by `` `${cx},${cz}` `` (`ChunkManager.ts:21, 182-184`).
- **FR-CS-2** — On construction, a spiral order of offsets within `VIEW_RADIUS` (±6) is computed and sorted by squared distance from the center (`ChunkManager.ts:46-53`); the area is `(2*6+1)² = 169` chunk positions.
- **FR-CS-3** — `update(playerWorldX, playerWorldZ, dt)` recomputes the center chunk from the player position and refreshes the queue whenever the center chunk changes (`ChunkManager.ts:106-113`).
- **FR-CS-4** — Generation is budgeted: `update` generates chunks from the queue while `performance.now() - genStart < 6` ms per frame (`ChunkManager.ts:115-120`). A chunk is generated only if not already present.
- **FR-CS-5** — Meshing is budgeted: `update` rebuilds dirty chunks while `performance.now() - meshStart < 6` ms per frame (`ChunkManager.ts:122-127`).
- **FR-CS-6** — Unload runs at most once per simulated second: `unloadTimer` accumulates `dt` and `unloadFar()` runs when `unloadTimer > 1` (`ChunkManager.ts:129-133`).
- **FR-CS-7** — `unloadFar()` disposes any chunk whose `|cx - centerCx| > VIEW_RADIUS + 2` or `|cz - centerCz| > VIEW_RADIUS + 2`, removes it from the map and the rebuild set (`ChunkManager.ts:170-180`).
- **FR-CS-8** — `generateChunk(cx, cz)` creates a `Chunk`, runs `terrain.generate`, applies the edit overlay via `chunk.applyEdits`, inserts it into the map, builds its mesh, and marks all 8 neighboring chunks dirty (`ChunkManager.ts:148-163`).
- **FR-CS-9** — `getBlockWorld(x, y, z)` returns `Block.Air` for `y < 0 || y >= CHUNK_HEIGHT` or for a missing chunk; otherwise maps world→local and returns the cell (`ChunkManager.ts:71-78`).
- **FR-CS-10** — `setBlockWorld(x, y, z, id)` returns `false` for out-of-range `y` or a missing chunk; otherwise writes the cell, records the edit in the overlay, marks the chunk dirty, and marks the appropriate neighbor dirty when the edit is on a chunk boundary (`lx === 0`, `lx === CHUNK_SIZE-1`, `lz === 0`, `lz === CHUNK_SIZE-1`) (`ChunkManager.ts:80-104`).
- **FR-CS-11** — `stats()` returns `{ loaded, pendingGen, pendingMesh, editedCells }` where `pendingGen = queue.length`, `pendingMesh = rebuild.size`, and `editedCells` sums the overlay maps (`ChunkManager.ts:60-69`).
- **FR-CS-12** — `loadedCount()` returns `chunks.size` (`ChunkManager.ts:55-57`).
- **FR-CS-13** — The edit overlay (`edits: Map<chunkKey, Map<cellIndex, blockId>>`) is non-delta absolute per-cell state; it is reapplied in `generateChunk` after `terrain.generate` so player edits survive a chunk unload + reload (`ChunkManager.ts:34-35, 152-153`).

## Non-functional Requirements

- **NR-CS-1** — Generation and meshing must each complete within a 6 ms per-frame budget (`ChunkManager.ts:116, 124`). Work exceeding the budget is deferred to subsequent frames.
- **NR-CS-2** — The chunk grid is bounded by `VIEW_RADIUS + 2` on each axis; at most `(2*(6+2)+1)² = 289` chunks may be resident before unload begins (`ChunkManager.ts:174`).
- **NR-CS-3** — Boundary edits must not leave T-junctions/visual seams: `setBlockWorld` marks the sibling chunk dirty on any boundary face (`ChunkManager.ts:99-102`).
- **NR-CS-4** — Unload scheduling must not thrash: unload runs at most once per second and only disposes chunks beyond the tolerance (`ChunkManager.ts:129-133`).
- **NR-CS-5** — **To be measured**: actual per-frame generation/mesh time consumed in real scenes; the budget is enforced but observed utilization is not instrumented.

## Inputs and Outputs

Inputs:
- `scene`, `materials` (construction).
- `seed` (construction; forwarded to `TerrainGenerator`).
- `playerWorldX`, `playerWorldZ`, `dt` to `update`.
- `x, y, z` to `getBlockWorld` / `setBlockWorld`.

Outputs:
- `loadedCount()`, `stats()` diagnostics.
- `getBlockWorld` cell value; `setBlockWorld` boolean success.
- Mutations of `chunks`, `queue`, `queued`, `rebuild`, `edits`, and the scene graph (via `Chunk.buildMesh`/`dispose`).

## Core Data Structures
- `chunks: Map<string, Chunk>` — key `` `${cx},${cz}` `` (`ChunkManager.ts:21`).
- `queue: { cx; cz }[]` and `queued: Set<string>` — pending generation (`ChunkManager.ts:22-23`).
- `rebuild: Set<Chunk>` — dirty chunks pending mesh rebuild (`ChunkManager.ts:24`).
- `spiral: { cx; cz }[]` — precomputed, distance-sorted offsets (`ChunkManager.ts:25, 46-53`).
- `centerCx/centerCz` — last seen player chunk (`ChunkManager.ts:26-27`).
- `edits: Map<string, Map<number, number>>` — chunk key → (cell index → block id) (`ChunkManager.ts:35`).
- `Chunk.cx/cz`, `Chunk.data: Uint8Array(16384)`, `Chunk.hasData`, `Chunk.solid/cutout/water` (`src/world/Chunk.ts:14-21`).
- Cell index layout: `(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx` (`Chunk.ts:36-39`).

## Dependencies
- `src/world/ChunkManager.ts` → `three` (types), `src/blocks/Blocks.ts`, `src/Constants.ts`, `src/world/Chunk.ts`, `src/world/TerrainGenerator.ts`.
- `src/world/Chunk.ts` → `three`, `src/Constants.ts`, `src/world/Mesher.ts`.
- `src/core/Game.ts` → `ChunkManager` (drives `update`, reads `stats`/`loadedCount`, calls `getBlockWorld`/`setBlockWorld`).

## Error and Edge-Case Behavior
- **Negative coordinates**: `Math.floor(x / CHUNK_SIZE)` handles negative world coords correctly (`ChunkManager.ts:73-74`); `key` stringifies negative integers unambiguously.
- **Out-of-range y**: `getBlockWorld`/`setBlockWorld` return `Block.Air` / `false` for `y < 0 || y >= CHUNK_HEIGHT` (`ChunkManager.ts:72, 81`).
- **Missing chunk**: `getBlockWorld` returns `Block.Air`; `setBlockWorld` returns `false` and records no edit; `markDirty` no-ops for absent chunks (`ChunkManager.ts:76, 86, 165-168`).
- **Chunk-boundary edit**: `setBlockWorld` marks the immediate neighbor dirty for boundary cells so the neighbor's faces remesh (`ChunkManager.ts:99-102`).
- **Stale async jobs**: there is no async — generation and meshing are synchronous within the frame budget; `unloadFar` removes the chunk from `rebuild` on disposal so no stale rebuild fires (`ChunkManager.ts:177`).
- **Unload race (edit overlay)**: a chunk unloaded and later regenerated reapplies its overlay edits, so no player edit is lost (`ChunkManager.ts:152-153`).
- **Queue refresh**: `refreshQueue` rebuilds `queue`/`queued` from the spiral each time the center changes, skipping already-present chunks (`ChunkManager.ts:136-146`).
- **Duplicate generation guard**: `generateChunk` is only invoked when the chunk is absent (checked in the update loop and `refreshQueue`), preventing double-write (`ChunkManager.ts:119`).

## Performance Expectations
- Resident area: `(2*6+1)² = 169` possible chunk positions; unload tolerance extends to `(2*8+1)² = 289` max resident (`ChunkManager.ts:46-53, 174`).
- Storage per chunk: `Uint8Array(16*64*16) = 16,384` bytes (16 KiB).
- Generation budget: ≤ 6 ms/frame (`ChunkManager.ts:116`); mesh budget: ≤ 6 ms/frame (`ChunkManager.ts:124`).
- Greedy meshing (see `world-generation`) reduces per-chunk geometry; meshes are only rebuilt on dirty (data change or neighbor appearance).
- Unload scan is O(resident chunks) at most once per second (`ChunkManager.ts:170-180`).
- **To be measured**: observed values of `pendingGen`/`pendingMesh` during fast travel and the real per-frame budget utilization; targets are enforced but not yet profiled.

## Acceptance Criteria
- **AC-CS-1** — After the player stands still, all chunks within `VIEW_RADIUS` of the player's chunk are eventually loaded (`stats().loaded` reaches 169, or `pendingGen`/`pendingMesh` drop to 0).
- **AC-CS-2** — `stats()` returns accurate `pendingGen`/`pendingMesh`/`editedCells` that match the live queue/rebuild/overlay sizes.
- **AC-CS-3** — `getBlockWorld` returns `Block.Air` for out-of-range `y` and for missing chunks; returns actual terrain otherwise.
- **AC-CS-4** — `setBlockWorld` rejects out-of-range `y` and missing chunks (returns `false`, no side effects).
- **AC-CS-5** — A boundary edit (e.g. `lx === 0`) marks both the owning chunk and the `cx-1` neighbor dirty, so both faces remesh.
- **AC-CS-6** — A player edit survives a chunk unload + reload: after `unloadFar` disposes the chunk and the player re-enters its range, the edited cell retains the edited value.
- **AC-CS-7** — `unloadFar` removes chunks beyond `VIEW_RADIUS + 2` on either axis and does not remove chunks within the tolerance.
- **AC-CS-8** — Generation and meshing each stay within their 6 ms per-frame budget (work is deferred, not dropped).
- **AC-CS-9** — `loadedCount()` equals the number of resident chunks and matches the world's visible chunk count.

## Verification Method
- **AC-CS-1**: E2E — open the page, wait for `#loading` to hide, read `window.__mc.manager.stats().loaded`; move to an empty area and confirm it converges to 169. Manual — fly out and observe no pop-in beyond the fog.
- **AC-CS-2**: Unit — drive `ChunkManager.update` with a fake player and assert `stats()` mirror the queue/rebuild sizes. (No unit tests exist yet; create under `tests/**/*.test.ts`.)
- **AC-CS-3 / AC-CS-4**: Unit — call `getBlockWorld`/`setBlockWorld` for `y = -1`, `y = 64`, and a missing chunk key; assert the return values and that no edit is recorded.
- **AC-CS-5**: Unit — `setBlockWorld` at a boundary cell and assert both chunks are in `rebuild` (via `stats().pendingMesh` and a spy on `markDirty`).
- **AC-CS-6**: Unit — generate a chunk, edit a cell, unload it (simulate `unloadFar`), regenerate; assert the cell retains the edited value. E2E — edit a block, leave range, return, verify the block persists.
- **AC-CS-7**: Unit — set center, populate chunks including one at distance `VIEW_RADIUS + 3`, run `unloadFar`, assert it is removed and the `VIEW_RADIUS + 2` one remains.
- **AC-CS-8**: Unit — time `update` with a large queue and assert `performance.now()` deltas stay under 6 ms per phase (or that pending counts remain for later frames).
- **AC-CS-9**: E2E — compare `loadedCount()` with `stats().loaded` and the F3 `Chunks` HUD value.