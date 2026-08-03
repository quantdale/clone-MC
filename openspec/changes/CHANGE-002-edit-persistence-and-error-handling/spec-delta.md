# Spec Delta: CHANGE-002 — Edit persistence & error handling

Spec sections added by this change (spec draft lives in `openspec/specs/`).

## §18 In-session edit persistence

- Player edits are recorded in `ChunkManager.edits` as an overlay:
  `Map<chunkKey "${cx},${cz}", Map<cellIndex, blockId>>`, where `cellIndex`
  is the flat `(ly*16 + lz)*16 + lx` layout index.
- The overlay is absolute per-cell state (not a diff), replayed on top of
  freshly generated terrain via `Chunk.applyEdits`, so edits survive chunk
  unload/reload within the session.
- Edits are **not** persisted across page reloads (no `localStorage`).
- `setBlockWorld` on a chunk-face cell also dirties the neighboring chunk.
- `ChunkManager.stats().editedCells` counts total overlay entries for the F3
  debug overlay.

## §19 Startup validation & error surfacing

- `src/main.ts` requires the 12 DOM ids in `REQUIRED_IDS`; any missing id
  throws `Error('Required DOM element "#<id>" is missing.')` before the game
  constructs.
- Initialization failures are caught and surfaced: into the `#fatal` overlay
  (hiding `#clickToPlay` and `#loading`) when present, else via `alert`, and
  always logged via `console.error("[trymc] failed to initialize: …")`.
- `TextureAtlas.build` throws a clear error if the 2D canvas context is
  unavailable.
- `window.__mc` exposes the `Game` instance as an automated-validation hook.

## §20 Debug overlay (F3)

- `#debug` shows `pending gen N · pending mesh N · edited N · tris N`,
  updated each frame from `ChunkManager.stats()` and
  `WorldRenderer.triangles()`.
- `KeyF3` toggles the overlay's visibility (`HUD.toggleDebug`).

## §21 Favicon

- `index.html` declares `<link rel="icon" href="data:," />` to suppress the
  `/favicon.ico` request; the game ships no favicon file.