# Capability: World Generation

## Purpose
Define how TryMC procedurally generates deterministic, seeded terrain for any chunk: a heightmap-driven column profile (bedrock, stone, dirt/grass/sand, water), 3D-noise caves, and hashed tree placement with canopy overhang across chunk borders. Generation must be a pure function of world coordinates plus a seed, so any chunk can be regenerated identically at any time (including after unload/reload).

## Scope
In scope:
- `TerrainGenerator` (`src/world/TerrainGenerator.ts`): seeded simplex noise (2D/3D), `heightAt`, `shouldPlaceTree`, `generate(chunk)`, caves, tree placement, bedrock.
- Determinism guarantees: same seed + same world coordinates → same terrain; edit overlay reapplication on top of regenerated terrain.
- Noise and RNG utilities: `src/utils/Noise.ts` (`SimplexNoise`), `src/utils/Random.ts` (`mulberry32`, `hash2`).
- Constants controlling generation: `SEA_LEVEL`, `CHUNK_HEIGHT`, `TREE_SEED`.

Out of scope:
- Chunk scheduling, budgets, rebuilds, unload (see `chunk-streaming`).
- Mesh building from generated data (see `rendering`).
- Editing behavior once generated (see `block-interaction`; the edit overlay lifetime is handled by `ChunkManager`).

## Functional Requirements

- **FR-WG-1** — `TerrainGenerator` is constructed with a 32-bit seed and derives four noise instances: `seed ^ 0x1001` (continental), `seed ^ 0x2002` (hills), `seed ^ 0x3003` (detail), `seed ^ 0x4004` (caves) (`TerrainGenerator.ts:15-25`).
- **FR-WG-2** — `heightAt(x, z)` returns the terrain surface height as a clamped integer in `[1, CHUNK_HEIGHT - 4]`, built from broad continental fBm, rolling hill fBm, low-amplitude detail, and a ridged mountain mask (`smooth01` windowed) so mountains are rare and slopes stay gentle (`TerrainGenerator.ts`).
- **FR-WG-3** — `generate(chunk)` fills every cell for the chunk's x/z column range: `y = 0` is `Block.Bedrock`; `y < h - 3` is `Block.Stone`; `y < h` is `Block.Dirt` except beaches (`h <= SEA_LEVEL + 1`) which are `Block.Sand`; `y === h` is `Block.Grass`, `Block.Sand` on beaches, `Block.Stone` above y=40 and `Block.Snow` above y=50; `SEA_LEVEL < y` above ground is `Block.Air`; water fills `y <= SEA_LEVEL` (`TerrainGenerator.ts`).
- **FR-WG-4** — Caves: `Block.Stone` cells are replaced by `Block.Air` when `isCave` returns true — 3D fBm (`nCave`) with threshold `> 0.6`, only when `y > 4` and `y < h - 5`, and never near a cliff face (suppressed when the cell is within one block of the minimum neighbor column height) so caves don't punch holes in hillsides (`TerrainGenerator.ts`).
- **FR-WG-5** — `shouldPlaceTree(x, z, h)` requires `SEA_LEVEL + 2 < h < 40`, slope ≤ 1 across the 4-neighbors, and a forest-clumped hash draw (≈4% in forest noise, ≈0.8% in plains, ≈0.15% elsewhere) (`TerrainGenerator.ts`).
- **FR-WG-6** — Trees are planted on the chunk's own columns: either an oak (4–5 log trunk, rounded radius-2 canopy with gapped edges) or a spruce (6–7 log trunk, layered radius 2→1→0 crown) chosen by a seeded draw (`TerrainGenerator.ts`).
- **FR-WG-7** — Tree overhang: the generator scans tree roots in `[x0 - 2, x0 + 16) × [z0 - 2, z0 + 16)` around the chunk and plants canopies of outside-rooted trees that overhang the chunk border (`setIfAir` clips to the chunk); uncrowned surface cells may receive tall grass or flowers (`TerrainGenerator.ts`).
- **FR-WG-8** — All generation functions are pure functions of world coordinates and the seed; no hidden global state, so regeneration of any chunk is deterministic (`TerrainGenerator.ts:7-13`).
- **FR-WG-9** — Player edits are layered on top of freshly generated terrain as an absolute per-cell overlay (`Chunk.applyEdits` in `src/world/Chunk.ts:45-49`; applied by `ChunkManager.generateChunk`, see `chunk-streaming` spec) — an edit is never overwritten by regeneration while it remains in the overlay.

## Non-functional Requirements

- **NR-WG-1** — Determinism: `heightAt`, `shouldPlaceTree`, `generate`, `isCave`, and `placeTree` must return identical results for identical `(seed, x, z)` inputs across calls and across chunk load lifetimes.
- **NR-WG-2** — Noise is deterministic given a seed (`SimplexNoise` permutation table built with `mulberry32`; `src/utils/Noise.ts:11-25`); `hash2` is a pure integer hash (`src/utils/Random.ts:14-20`).
- **NR-WG-3** — Height must stay within `[1, CHUNK_HEIGHT - 4]` so the top of the world is always above the top terrain column (`TerrainGenerator.ts:33-34`).
- **NR-WG-4** — Tree density is bounded by the forest-clumped hash draw (roughly 0.15–4% of eligible columns depending on the forest noise band) (`TerrainGenerator.ts`).
- **NR-WG-5** — **To be measured**: generation cost per chunk shares the `ChunkManager` per-frame budget (see `chunk-streaming`); no standalone timing target exists.

## Inputs and Outputs

Inputs:
- `seed: number` (constructor; from `?seed=` query param defaulting to 1337, see `src/core/Game.ts:32`).
- `chunk: Chunk` (target; `cx`/`cz` define the world column range).
- World coordinates `(x, z)` for `heightAt`, `shouldPlaceTree`.

Outputs:
- `heightAt(x, z)`: integer height in `[1, CHUNK_HEIGHT - 4]`.
- `shouldPlaceTree(x, z, h)`: boolean.
- `generate(chunk)`: writes all 16384 cells of `chunk.data` (side effect on the passed `Chunk`).

## Core Data Structures
- `Chunk.data: Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE)` — 16384 bytes; cell index `(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx` (`src/world/Chunk.ts:16`).
- `Block` enum values used by generation: `Air=0, Grass=1, Dirt=2, Stone=3, Sand=4, Water=5, Bedrock=6, Log=7, Leaves=8` (`src/blocks/Blocks.ts:1-12`).
- `SimplexNoise` instance fields: `perm: Uint8Array(512)`, `permMod12: Uint8Array(512)` (`src/utils/Noise.ts:8-9`).
- `hash2(x, z, seed)`: 32-bit integer avalanched hash in `[0, 1)` (`src/utils/Random.ts:14`).

## Dependencies
- `src/world/TerrainGenerator.ts` → `src/blocks/Blocks.ts`, `src/Constants.ts` (`CHUNK_HEIGHT`, `CHUNK_SIZE`, `SEA_LEVEL`, `TREE_SEED`), `src/utils/Random.ts` (`hash2`), `src/utils/Noise.ts` (`SimplexNoise`), `src/world/Chunk.ts` (type only).
- `src/utils/Noise.ts` → `src/utils/Random.ts` (`mulberry32`).
- `src/core/Game.ts` instantiates `TerrainGenerator` indirectly via `ChunkManager(..., seed)`.

## Error and Edge-Case Behavior
- **Negative world coordinates**: `heightAt`/`shouldPlaceTree`/`generate` operate on raw world coordinates; `Math.floor`/integer hash handle negatives deterministically. Column mapping in `setIfAir` uses `wx - chunk.cx * CHUNK_SIZE`, which is correct for negative chunk indices (`TerrainGenerator.ts:118`).
- **Out-of-range y**: `setIfAir` refuses cells with `y < 0 || y >= CHUNK_HEIGHT`; `generate` only writes `y ∈ [0, CHUNK_HEIGHT)` (`TerrainGenerator.ts:121`).
- **Trees crossing chunk borders**: trunks and canopies are clipped by `setIfAir` to the current chunk; overhang trees are handled by the outer scan (FR-WG-7) so canopy edges never create floating/absent blocks at borders.
- **Cave near surface**: caves cannot carve cells at `y <= 3` (bedrock layer protection) or `y >= h - 2` (surface protection) (`TerrainGenerator.ts:87`).
- **Water at chunk edges**: water fill is a pure function of `SEA_LEVEL` per column, so adjacent chunks agree at borders.
- **Height extremes**: `heightAt` clamps to `[1, CHUNK_HEIGHT - 4]`; generation never writes above `CHUNK_HEIGHT - 1` (`TerrainGenerator.ts:33-34`).
- **Regeneration after edits**: `Chunk.applyEdits` ignores cell indices outside the chunk (`i >= 0 && i < data.length`), so a stale per-chunk overlay cannot write out of bounds when a chunk regenerates with a different provenance (`Chunk.ts:46-48`).

## Performance Expectations
- Cell count per chunk: `16 × 64 × 16 = 16,384` writes; height per column evaluated as `heightAt` (4 fBm evaluations).
- Tree scan adds ≤ 2 rows of overhang columns per side (`(16+4)² = 400` columns × 1 `heightAt` + `shouldPlaceTree` each).
- Cave check runs only for the `Block.Stone` band per column.
- Generation shares the 6 ms per-frame budget in `ChunkManager.update` (`src/world/ChunkManager.ts:115-120`); see `chunk-streaming`.
- **To be measured**: absolute wall time per `generate(chunk)` call under debugger/VRM measuring; typical expectation on target hardware is well under 6 ms but no committed number has been measured.

## Acceptance Criteria
- **AC-WG-1** — `heightAt(x, z)` is deterministic: repeated calls with the same seed and coordinates return identical integers.
- **AC-WG-2** — `generate` fills every cell with a valid `Block` value; bedrock occupies `y = 0`; no cell is left at the default 0 ambiguity that conflicts with the column profile (all cells explicitly written/overwritten).
- **AC-WG-3** — The same seed regenerates the identical chunk: `generate` twice on fresh chunks of the same coordinates yields byte-identical `data`.
- **AC-WG-4** — Different seeds produce different terrain for the same coordinates (spot check heights differ).
- **AC-WG-5** — Terrain height is clamped to `[1, CHUNK_HEIGHT - 4]` for all sampled coordinates.
- **AC-WG-6** — Beach columns below/at `SEA_LEVEL + 1` use `Sand`, non-beach hilltops use `Grass`/(`Dirt`), matching FR-WG-3.
- **AC-WG-7** — Water fills all cells with `y <= SEA_LEVEL` above the terrain surface; above-water columns contain no `Water`.
- **AC-WG-8** — Caves only remove `Block.Stone`, never bedrock, surface, or tree/log columns.
- **AC-WG-9** — No tree trunk or canopy block is ever placed inside `Block.Water` or below the terrain surface (`setIfAir` + canopy clipping).
- **AC-WG-10** — Two horizontally adjacent chunks have matching border columns (no cliffs of water/air mismatch) — verified by sampling `heightAt` at `(x0 - 1)` vs. the neighbor's `(x0 + 15)`.

## Verification Method
- **AC-WG-1 / AC-WG-3 / AC-WG-4 / AC-WG-5**: Unit — add `tests/**/*.test.ts` (vitest, node env) constructing `TerrainGenerator` with fixed seeds and asserting `heightAt` determinism, repeated `generate` byte-equality, cross-seed inequality, and height bounds. No unit tests exist yet (`vitest.config.ts` include: `tests/**/*.test.ts`).
- **AC-WG-2 / AC-WG-6 / AC-WG-7 / AC-WG-8**: Unit — assert per-y block allocation against FR-WG-3 rules for sampled columns; assert no `Water` above `SEA_LEVEL`; assert cave cells are only `Stone`-replaced.
- **AC-WG-9**: Unit — after `generate`, assert no `Log`/`Leaves` cell sits at `y <= heightAt(x,z)` (trunks start at `h + 1`).
- **AC-WG-10**: Unit — generate two adjacent chunks and compare the shared border columns' `data` at `lx=15`/`lx=0`.
- Manual — boot with `?seed=1337`, fly to a coastline, confirm water/sand transitions and tree overhangs look continuous.
