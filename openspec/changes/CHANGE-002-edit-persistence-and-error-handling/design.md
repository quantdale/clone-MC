# Design: CHANGE-002 — Edit persistence & error handling

## Part A — In-session edit persistence

### Edit overlay (`ChunkManager`)

```ts
private edits = new Map<string, Map<number, number>>();
```

- `setBlockWorld(x, y, z, id)`:
  1. Resolve world → chunk (`Math.floor(x / CHUNK_SIZE)`, `Math.floor(z /
     CHUNK_SIZE)`); bail `false` if `y < 0 || y >= CHUNK_HEIGHT` or the chunk
     is not loaded.
  2. Write the chunk data (`chunk.set(lx, y, lz, id)`).
  3. Record the absolute cell state: `cellEdits.set(chunk.index(lx, y, lz),
     id)` (lazily create the inner map).
  4. Mark the chunk dirty; if the cell is on a chunk face (`lx/lz === 0` or
     `15`), also mark the adjacent chunk dirty so its face culling refreshes.
- `generateChunk(cx, cz)`: after `terrain.generate(chunk)`, look up
  `this.edits.get(key)` and call `chunk.applyEdits(cellEdits)` — the overlay
  is replayed on top of freshly generated terrain.
- `stats()` sums the inner-map sizes into `editedCells` for the F3 overlay.

### `Chunk.applyEdits`

```ts
applyEdits(edits: Map<number, number>): void {
  for (const [i, id] of edits) {
    if (i >= 0 && i < this.data.length) this.data[i] = id;
  }
}
```

Bounds-guarded replay over the flat `Uint8Array`; cells outside the chunk are
ignored (they should never be recorded, but the guard keeps the invariant
cheaply enforced).

Rationale (detailed in ADR-004): overlay of **absolute** states, not diffs —
idempotent, deterministic, `O(edits)` to reapply, no undo/versioning
machinery. **No localStorage yet** — persistence is scoped to the session;
saving would require a serialize format, seed-reconciliation rules, and quota
UI.

## Part B — Startup error handling (`src/main.ts`)

- `REQUIRED_IDS` lists the 12 DOM ids the game needs (`game`, `fps`, `pos`,
  `chunks`, `cycle`, `clickToPlay`, `loading`, `loadbarfill`, `loadtext`,
  `hotbar`, `debug`, `fatal`).
- `getRequired(id)` throws `Error("Required DOM element "#id" is missing.")`
  for any absent id.
- `boot()` validates all ids before constructing the HUD/Game, then exposes
  `window.__mc` as the test hook.
- A top-level `try { boot(); } catch (err)`:
  - logs `[trymc] failed to initialize: <err>` via `console.error`,
  - if `#fatal` exists: unhides it, appends a `<pre>` with the message, and
    hides `#clickToPlay` + `#loading`;
  - otherwise falls back to `alert(...)`.

### Texture-context guard (`TextureAtlas.build`)

```ts
const ctx = this.canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable — cannot build texture atlas.");
```

Surfaces a WebGL/2D-context failure as a clear initialization error (caught by
`main.ts`) instead of a null-deref crash.

### F3 debug overlay (`HUD` + `Game`)

- `Game` keydown handler: `KeyF3` (ignoring `e.repeat`) calls
  `hud.toggleDebug()`.
- Each frame `Game.update` calls `hud.setDebug({ pendingGen, pendingMesh,
  editedCells, triangles })` from `ChunkManager.stats()` and
  `WorldRenderer.triangles()`.
- `HUD.setDebug` writes the line (`pending gen N · pending mesh N · edited N
  · tris N`) into `#debug`; `toggleDebug` toggles the `.hidden` class.

### Favicon

`index.html` ships `<link rel="icon" href="data:," />` — a zero-byte data URI
that stops the browser from issuing a `/favicon.ico` request (verified: a page
without it 404s favicon.ico; the game page does not).