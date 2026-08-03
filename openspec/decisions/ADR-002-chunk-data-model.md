# ADR-002: Chunk data model

**Status:** Accepted
**Date:** 2026-08-03
**Applies to:** `src/world/Chunk.ts`, `src/world/ChunkManager.ts`, `src/Constants.ts`

## Context

The world is an infinite (in practice: streaming) grid of chunks. Each chunk is
`CHUNK_SIZE × CHUNK_HEIGHT × CHUNK_SIZE` = **16 × 64 × 16** cells, giving
16,384 cells per chunk. Cell values are block ids drawn from the `Block` enum
(`src/blocks/Blocks.ts`), which currently spans 10 values — comfortably within
a `Uint8Array`'s 0–255 range. Hot paths must handle:

- **Generation**: `TerrainGenerator.generate` runs 16×64×16 = 16,384
  `chunk.set(...)` calls per chunk under a 6 ms/frame budget.
- **Meshing**: `buildChunkGeometry` issues ~16 k `chunk.get(...)` calls per
  chunk, plus neighbor lookups through a world-coordinate callback.
- **Random access**: world-space queries from the raycast (`BlockPicker`),
  AABB collision (`PlayerController.collideAxis` — up to ~15 blocks per axis
  step), the current-block probe for break/place, and neighbor-face probing in
  the mesher — all funnel through `ChunkManager.getBlockWorld`.
- **Editing**: `setBlockWorld` maps world coordinates to one cell, writes it,
  records the edit, and dirties the affected chunks.

## Decision

Each chunk owns a **single flat `Uint8Array`** of length `CHUNK_SIZE *
CHUNK_HEIGHT * CHUNK_SIZE`, laid out as **y-major rows with z-major inner
loops** (`src/world/Chunk.ts:16`):

```ts
readonly data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
```

The canonical flat index is computed by the shared helper `index` (also used
verbatim by `get` and `set`):

```ts
index(lx, ly, lz): (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx
```

so `get`/`set` are thin wrappers over one multiplication-packed expression and
`applyEdits` can walk the array linearly.

Coordinates are handled at two distinct levels:

- **Chunk-local** (`lx, ly, lz`), always `0 <= lx,lz < 16`, `0 <= ly < 64`,
  are what `Chunk` stores. The chunk's world origin is `(cx*16, 0, cz*16)`.
- **World** (`x, y, z`) are converted with **floor division** everywhere:
  `Math.floor(x / CHUNK_SIZE)` for the chunk id and `x - cx * CHUNK_SIZE` for
  the local x/z — so negative world coordinates map to the correct negative
  chunk and the correct local offset (e.g. world x = −1 → chunk cx = −1, local
  lx = 15). `ChunkManager.getBlockWorld` performs this for every lookup;
  `TerrainGenerator.placeTree`/`setIfAir` do the same when writing overhang
  cells.

Chunk storage is a **`Map<string, Chunk>`** in `ChunkManager` (`chunks`),
keyed by the string `` `${cx},${cz}` ``. Membership queries (`has`), writes,
and deletes are all constant-time keyed lookups.

## Alternatives Considered

### Typed arrays per layer (16 × Uint8Array(16×16))
Kept as a rejected option. Per-layer arrays would make "slice at height y"
access free for terrain generation, but every world-space cell lookup would
first need to resolve the layer array and then index within it — an extra
indirection — and the mesher's per-direction masks (which iterate along
arbitrary axes) would lose the sequential-locality argument entirely. The flat
array's single M×N linear sweep also lets `applyEdits` iterate edits against
one contiguous buffer. The 16,384-byte total footprint is identical either
way. Chosen: flat layout wins on index simplicity and mesher/applyEdits cache
behavior.

### `Map<number, Chunk>` with a packed-integer key, e.g. `(cx << 16) | cz`
Rejected for correctness and clarity: it assumes 16-bit signed chunk ids and,
with `|`, breaks silently for negative coordinates (sign bits collide, and
chunk ids beyond ±32767 would alias). Achieving the same in bit-safe JS
(`((cx + 0x8000) << 16) | (cz + 0x8000)` style) is possible but opaque.
A string key is unambiguous, debuggable (`"3,-4"` in devtools), and string-map
lookup cost is negligible next to generation/meshing costs. Switching to a
packed `number` key would be a mechanical change confined to `ChunkManager`
if profiling ever justified it.

### Object/soup storage (coordinate → block lookup map, no arrays)
Rejected outright: it throws away the contiguous data the mesher's mask scans
and the generator's column writes need, and balloons memory with per-cell
hashtable overhead.

## Consequences

➕ **One allocation per chunk** for the world data — 16,384 bytes, so the
169-chunk full view peaks at ~2.8 MB for block storage, dominated by `Map`
entry overhead rather than data.

➕ **Index math shared across all writers/readers** — `index` is defined once
and reused by `get`, `set`, and the edit overlay in `ChunkManager`
(`chunk.index(lx, y, lz)`), so the layout cannot drift between subsystems.

➕ **`Uint8Array` semantics cover the domain** — block ids are 0–9 today and
wrap-safely up to 255; a block-id bump beyond 255 would require a schema
change, but that is far beyond the current palette.

➖ **No negative-Y storage** — world `y < 0` and `y >= CHUNK_HEIGHT` are
treated as `Block.Air` / writes return `false` in `getBlockWorld` /
`setBlockWorld`; the world is an extrusion, not a free 3D volume. Correct for
the current design (bedrock floor at y = 0, sky above 64).

➖ **Floor division is load-bearing** — every world-to-local conversion must
use `Math.floor`, not truncation/`>>`; a misplaced `>> 4` would subtly corrupt
negative coordinates (this is explicit in the code comments and the
`setIfAir` guard).

➖ **String keys are fatter than numbers** — `Map<string, Chunk>` pays ~2–4×
the key memory of `Map<number, Chunk>`; accepted for debuggability, and
revisitable if chunk-set sizes grow an order of magnitude.
