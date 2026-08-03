# Tasks: CHANGE-002 — Edit persistence & error handling

Status: all tasks complete; verification in `verification.md`.

1. [x] `ChunkManager`: add `edits` overlay map; record on `setBlockWorld`;
       mark boundary neighbors dirty on face edits.
2. [x] `ChunkManager.generateChunk`: reapply the overlay after
       `terrain.generate`.
3. [x] `ChunkManager.stats()`: report `editedCells`.
4. [x] `Chunk.applyEdits` (bounds-guarded replay).
5. [x] `main.ts`: `REQUIRED_IDS` + `getRequired` DOM validation; try/catch
       that surfaces errors into `#fatal` (or `alert`), hiding the intro
       overlays.
6. [x] `HUD`: `setDebug`/`toggleDebug` for the F3 overlay.
7. [x] `Game`: `KeyF3` handler + per-frame `setDebug` feed.
8. [x] `TextureAtlas.build`: 2D-context guard.
9. [x] `index.html`: `#fatal` + `#debug` elements; `<link rel="icon"
       href="data:," />`.
10. [x] Browser round-trip test of edit persistence (see `verification.md`).