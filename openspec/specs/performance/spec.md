# Capability: Performance

## Purpose
Define the performance targets and bounds for TryMC: the per-frame time budgets for chunk generation and meshing, the memory footprint of the chunk grid, the vertex/triangle budget reduction via greedy meshing, the pixel-ratio cap, and the frame-rate target. Where a target is structural (enforced by code) versus aspirational (needs measurement), this spec distinguishes them explicitly.

## Scope
In scope:
- Per-frame budgets: 6 ms generation, 6 ms meshing (`src/world/ChunkManager.ts:115-127`).
- Frame-rate target and the `dt` cap (`src/core/Game.ts:181-186`).
- Memory: chunk storage size, resident chunk count bound, texture atlas dimensions.
- Pixel-ratio cap and renderer sizing (`src/render/WorldRenderer.ts:43`).
- Triangle/vertex reduction via greedy meshing and face culling.
- Unload cadence and its cost.

Out of scope:
- Per-capability correctness (covered by their own specs); this spec is the cross-cutting budget and sizing contract.

## Functional Requirements

- **FR-P-1** — The main loop caps `dt` at `0.05` s (`Math.min((now - last) / 1000, 0.05)`) so a dropped frame never causes a physics explosion (`Game.ts:183`).
- **FR-P-2** — Chunk generation runs within a 6 ms per-frame budget: `while (queue.length && performance.now() - genStart < 6)` (`ChunkManager.ts:115-120`).
- **FR-P-3** — Chunk meshing runs within a 6 ms per-frame budget: `for (const chunk of rebuild) { if (performance.now() - meshStart > 6) break; ... }` (`ChunkManager.ts:122-127`).
- **FR-P-4** — Pixel ratio is capped (currently 1.5, never above 2) to bound fill-rate (`WorldRenderer.ts`).
- **FR-P-5** — Unload runs at most once per second (`unloadTimer > 1`) to bound maintenance cost (`ChunkManager.ts:129-133`).
- **FR-P-6** — Chunk storage is a fixed `Uint8Array(16*64*16)` per chunk (`Chunk.ts:16`).
- **FR-P-7** — The texture atlas is a fixed 16×60 tile canvas (288×1080 px) with `NearestFilter`, no mipmaps (`TextureAtlas.ts:13-21, 40-46`).
- **FR-P-8** — Greedy meshing merges adjacent faces with identical texture into single quads; runs are not capped by atlas cell because UVs are computed per block in the fragment shader (`src/render/voxelShader.ts`), so a merged quad can span a whole chunk without texture stretching.
- **FR-P-9** — Face culling hides faces between opaque neighbors and between opaque/water neighbors (`Mesher.ts:122-124`).

## Non-functional Requirements

- **NR-P-1** — Generation and meshing must each stay within 6 ms/frame; exceeding the budget defers work to later frames rather than blocking the frame (`ChunkManager.ts:116, 124`).
- **NR-P-2** — Resident chunks are bounded: unload removes chunks beyond `|dx| > VIEW_RADIUS + 2` or `|dz| > VIEW_RADIUS + 2`; worst-case resident ≈ `(2*8+1)² = 289` chunks (`ChunkManager.ts:170-180`).
- **NR-P-3** — Memory upper bound ≈ 289 chunks × 16 KiB data = ~4.6 MiB of block data, plus geometry (bounded by greedy meshing) — designed to stay within browser budgets (`Chunk.ts:16`).
- **NR-P-4** — **To be measured**: the target is a stable framerate (≈60 FPS) on target hardware; measured FPS is surfaced via the `#fps` HUD but no committed number is yet confirmed.
- **NR-P-5** — **To be measured**: actual per-frame generation/mesh budget utilization and triangle counts are not profiled; `stats()`/`triangles()` expose the raw numbers for measurement.

## Inputs and Outputs

Inputs:
- `performance.now()` timestamps for budget checks.
- `dt` from the main loop.
- `window.devicePixelRatio` for the pixel-ratio cap.
- `stats()` and `triangles()` diagnostics.

Outputs:
- Per-frame time sliced across generation/mesh.
- Resident chunk count (bounded).
- Triangle count reported to the F3 debug overlay.

## Core Data Structures
- Budgets: `genStart`/`meshStart` snapshots in `update` (`ChunkManager.ts:115, 122`).
- `queue: {cx,cz}[]` and `rebuild: Set<Chunk>` — pending work (`ChunkManager.ts:22-24`).
- `stats()` → `{ loaded, pendingGen, pendingMesh, editedCells }` (`ChunkManager.ts:60-69`).
- `renderer.info.render.triangles` via `triangles()` (`WorldRenderer.ts:126-129`).
- `Chunk.data: Uint8Array(16384)` (`Chunk.ts:16`).

## Dependencies
- `src/core/Game.ts` → `ChunkManager.update`, `WorldRenderer.render`, `triangles()`, `stats()`.
- `src/world/ChunkManager.ts` → `Chunk`, `TerrainGenerator`.
- `src/render/WorldRenderer.ts` → `three`, atlas sizing.
- `src/world/Mesher.ts` → atlas constants (`ATLAS_COLS`, `ATLAS_ROWS`, `ATLAS_TILE`).

## Error and Edge-Case Behavior
- **Budget exhaustion**: when the 6 ms budget is hit mid-queue, the loop breaks and remaining chunks stay queued for the next frame; no data is lost (`ChunkManager.ts:116, 124`).
- **Slow frame**: `dt` is capped at 0.05 s, so a long frame does not cause a physics step explosion (`Game.ts:183`).
- **High-DPI device**: pixel ratio is clamped to 2, so a 3× display still renders at ≤ 2× (bounded fill-rate) (`WorldRenderer.ts:43`).
- **Leave-and-return**: chunks unload over the tolerance and regenerate on return; the edit overlay preserves edits (see `chunk-streaming`), so perf pressure does not corrupt state.
- **Mesh budget with a huge rebuild set**: only as many chunks as fit in 6 ms are rebuilt per frame; the rest rebuild next frame (`ChunkManager.ts:123-127`).

## Performance Expectations
- Per-frame budget: ≤ 6 ms generation + ≤ 6 ms meshing, contiguous with the rest of the frame (target ≤ 16.6 ms total at 60 FPS).
- Area: `(2*6+1)² = 169` chunk positions in the spiral; max resident `(2*8+1)² = 289` (`ChunkManager.ts:46-53, 174`).
- Storage: 16,384 B data per chunk; greedy meshing keeps geometry small (each face either culled or merged).
- Atlas: 16 columns × 60 rows, 288×1080 px, nearest-neighbor sampling, no mipmaps — one texture upload, minimal GPU memory (`TextureAtlas.ts:13-21`).
- Unload: O(resident) scan at most once per second (`ChunkManager.ts:170-180`).
- **To be measured**: measured FPS, per-frame budget utilization, and triangle counts under sustained fast travel; the constants above are enforced, the actual numbers are not yet profiled.

## Acceptance Criteria
- **AC-P-1** — Generation and meshing each complete within their 6 ms per-frame budget (work is deferred, never dropped) (`ChunkManager.ts:115-127`).
- **AC-P-2** — `dt` is capped at 0.05 s in the main loop (`Game.ts:183`).
- **AC-P-3** — Pixel ratio never exceeds 2 (`WorldRenderer.ts:43`).
- **AC-P-4** — Resident chunks are bounded by the unload tolerance (≤ 289 worst case) (`ChunkManager.ts:170-180`).
- **AC-P-5** — Chunk data is exactly 16,384 bytes; the atlas is exactly 288×1080 px with nearest-neighbor sampling (`Chunk.ts:16`, `TextureAtlas.ts:13-21`).
- **AC-P-6** — Face culling and greedy meshing keep the triangle count low (no faces between adjacent opaque blocks; merged runs) (`Mesher.ts:122-124, 139-154`).
- **AC-P-7** — **To be measured**: the game sustains a stable framerate (target ≈60 FPS) during normal play and fast travel on target hardware; measured via the `#fps` HUD.
- **AC-P-8** — **To be measured**: memory stays within a browser-viable budget across a long session (no unbounded growth in `loaded`/`pendingGen`/`pendingMesh` after leveling off).

## Verification Method
- **AC-P-1**: Unit — drive `ChunkManager.update` with a large queue and measure `performance.now()` deltas per phase; assert ≤ 6 ms per phase and that remaining work persists. (No unit tests exist yet; create under `tests/**/*.test.ts`.)
- **AC-P-2**: Unit/spy — simulate a long `now` delta and assert `dt` passed to `update` is ≤ 0.05.
- **AC-P-3**: E2E — on a device with `devicePixelRatio > 2`, assert `window.__mc.renderer.renderer.getPixelRatio() <= 2`.
- **AC-P-4**: E2E — travel far and assert `stats().loaded <= 289` and that `unloadFar` keeps only chunks within tolerance.
- **AC-P-5**: Unit — import `Chunk` and assert `data.length === 16384`; import `TextureAtlas` constants and assert `ATLAS_W === 288`, `ATLAS_H === 1080`, `ATLAS_COLS === 16`, `ATLAS_ROWS === 60`.
- **AC-P-6**: Unit — build geometry for a flat grass chunk and assert zero interior faces (only exposed top/side faces); assert a merged run yields one quad instead of N.
- **AC-P-7**: E2E — run the game, travel fast, and log `#fps`; record the sustained average. **To be measured** — no pass/fail until a baseline is recorded.
- **AC-P-8**: E2E — keep the session open and periodically read `stats()`; assert `loaded`/`pendingGen`/`pendingMesh` remain bounded after the initial stream converges. **To be measured**.