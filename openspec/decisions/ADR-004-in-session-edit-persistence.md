# ADR-004: In-session edit persistence

**Status:** Accepted
**Date:** 2026-08-03
**Applies to:** `src/world/ChunkManager.ts`, `src/world/Chunk.ts`, `src/core/Game.ts`

## Context

Players can break and place blocks (`Game.breakBlock` / `Game.placeBlock`
write through `ChunkManager.setBlockWorld`). Meanwhile the chunk grid is
dynamic: chunks **unload** when the player moves away (`unloadFar`, beyond
`VIEW_RADIUS + 2`) and are **re-generated from scratch** when re-entered
(generation is a pure function of the seed — see ADR-003). Without extra
bookkeeping, any edit a player makes in a chunk that later unloads and
reloads would be silently wiped, making building pointless.

The edit must therefore survive the chunk's lifecycle *for the duration of the
session*. There is no server and no save system; the world is otherwise a pure
function of the seed (ADR-003), and remains so *except* for these edits.

## Decision

Keep an **edit overlay** in `ChunkManager`:

```ts
// chunk key -> (cell index -> block id)
private edits = new Map<string, Map<number, number>>();
```

- **Record on every write:** `setBlockWorld` resolves world → chunk → local
  cell, writes the chunk data, and appends `cellEdits.set(chunk.index(lx, y,
  lz), id)` — an absolute cell state (`chunk.index` uses the same flat
  `(ly*16 + lz)*16 + lx` layout as the data array), stored as absolute cell
  index rather than coordinates.
- **Reapply on every regeneration:** `generateChunk` calls
  `this.terrain.generate(chunk)` and then `chunk.applyEdits(cellEdits)`, which
  replays the overlay *on top of* the freshly generated terrain
  (`Chunk.applyEdits` reads the `Map` and writes each in-range cell — cells
  outside the chunk, impossible for an edit recorded against it, are ignored
  by a bounds guard).
- **Boundary edits stay consistent:** `setBlockWorld` marks the edited chunk
  dirty and, for cells on a chunk face (lx/lz 0 or 15), also dirties the
  neighboring chunk (whose mesher must see the new neighbor value for its own
  face culling). Mesh rebuild happens through the normal dirty-set mechanism,
  so the visual update is a cheap per-frame rebuild, not a full chunk
  re-generation.

Why an **overlay of absolute states** instead of a diff:

- **Determinism coupling (ADR-003):** regeneration must start from the seeded
  terrain and then *override*; diffs would need to be inverted against a
  terrain state that could theoretically differ, and absolute states are
  trivially idempotent. Re-applying `{index → id}` after generation is
  `O(edits)` with no ordering concerns.
- **Simplicity:** a `Map<chunkKey, Map<cellIndex, blockId>>` needs no
  undo/rebase machinery, no versioning, and no full-world serialization; the
  same structure powers the F3 debug counter (`stats().editedCells` sums the
  inner map sizes).

Why **no `localStorage` (not yet):** the scope is in-session survival across
chunk unload/reload. Persistent saves would require: a serialize/deserialize
format, a seed-ingress rule (a save implies its seed; entering with a
different `?seed=` must reconcile), a storage-quota policy and a UI surface.
None exist today; the session-only overlay keeps the change minimal and
leaves the persistence boundary in one place for a future change.

**Memory bounds:** each edit is one `Map` entry — key 0..16383 (1 slot) +
block id. Full-view worst case is bounded by the reachable world: a player can
only edit cells within the loaded grid (`setBlockWorld` writes into existing
chunks; cells in unloaded chunks up to `MAX_REACH` lookups simply miss). In
practice the overlay grows only with actual player actions; a determined
session editing every cell of a 13×13 chunk area would hold ~169 × 16,384 =
~2.8 M entries — far beyond a human session, and the entries are tiny (two
numbers per edit, no per-edit allocations beyond the map node).

**Edge cases covered:**

- *Edit, then edit again* — the inner map is keyed by cell; `set` overwrites,
  so the last state wins and `applyEdits` replays exactly the final state.
- *Chunk unloads during the generation/meshing budget* — edits live in
  `ChunkManager.edits`, independent of the chunk object; a chunk unloaded
  before its queue turn simply retains its overlay for the later
  regeneration. No edits are stored on the `Chunk` instance itself, so no
  reference keeps a disposed chunk alive.
- *Edit before the chunk exists* — `setBlockWorld` bails (`return false`)
  when the chunk is not loaded; the player cannot edit a chunk that is not
  generated, so there is no "pending edit for an unborn chunk" state to
  persist — the edit overlay only ever records cells that physically exist.
- *Edit on a chunk face* — handled by the neighbor-dirty rule above, so
  meshes on the other side of the boundary re-cull their faces.
- *Edit a cell that was air in generated terrain* — applyEdits writes it into
  the data; the mesher then sees a solid where the generator produced air;
  the same pure-function + overlay path produces the correct block.

## Alternatives Considered

### Diff/undo-log per chunk (store only changed blocks relative to generated terrain)
Rejected: more complex to apply (must recompute "terrain minus diff"), harder
to reason about idempotency across multiple unload/reload cycles, and it
offers nothing the absolute overlay does not.

### Persistent storage (`localStorage` / `IndexedDB`) now
Rejected to keep this change scoped to the known requirement (session-lifetime
edits). See above for what a later persistence change must add.

### Write-through into some "loaded-only" cache that keeps chunk objects alive
Rejected: retaining unloaded `Chunk`s would defeat the whole streaming memory
design (16 KB per chunk × everything visited); the overlay keeps the chunk set
as the single source of live data.

## Consequences

➕ **Edits survive chunk unload/reload** — breaking a block, walking away and
returning shows it still broken; the same applies to placed blocks.

➕ **Determinism preserved for unedited cells** — the seed world is untouched
everywhere the overlay has no entry, so ADR-003 guarantees hold.

➕ **Small, surgical implementation** — one map + one reapply call
(`applyEdits`) + one stats counter; the rest of the pipeline is unchanged.

➕ **Type-safe absolute states** — the cell index is the same flat index used
by `Chunk.index`, so no coordinate-round-trip drift between write and
reapply.

➖ **Session-only scope** — reloading the page loses all edits; not a bug, but
a stated limitation until a persistence change lands.

➖ **No per-edit undo** — a mistake is unrecoverable (re-break/re-place or
restart); an undo stack is future work and would need to live *next to* (not
inside) the overlay to keep it absolute.

➖ **Edited-cell stats grow** — the F3 `edited` counter reflects total edited
cells ever, not "dirty since last save"; fine while there is no save, but the
semantics will need revisiting when persistence arrives.
