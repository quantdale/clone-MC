# TryMC — Acceptance Criteria

Numbered acceptance criteria grouped by capability. Each row is phrased as a testable assertion about the **implemented** system (source-verified 2026-08-03); the Verification column says how to check it. Cross-reference: [verification-matrix.md](./verification-matrix.md) traces every ID here to spec/implementation/status.

Status vocabulary used in verification results:

- **Code inspection** — a human/agent read the stated source and confirmed the behavior is present and coherent.
- **Browser (manual)** — end-to-end pass inside a real browser (pointer lock, rendering, interactions).
- **Unit test** — automated test under Vitest (`tests/unit/*.test.ts`), verified green 2026-08-03 (10 files / 51 tests).
- **CLI check** — `npm run typecheck` / `npm run lint` / `npm run build`.

## Rendering

| ID | Criterion | Verification |
|---|---|---|
| RENDER-01 | The world renders into the `#game` canvas through a `THREE.WebGLRenderer` (antialias, `powerPreference: "high-performance"`, pixel ratio ≤ 2) and a `PerspectiveCamera` (fov 75, near 0.1, far 500). | Code inspection: `src/render/WorldRenderer.ts:37-46`; Browser: canvas non-black, geometry visible |
| RENDER-02 | Resizing the window updates camera aspect ratio and renderer size. | Code inspection: `WorldRenderer.resize` (`WorldRenderer.ts:131-135`), wired to `resize` event in `src/core/Game.ts:129-130` |
| RENDER-03 | All chunk meshes share exactly three materials built once from the atlas texture: solid (`MeshLambertMaterial`, `vertexColors`), cutout (`alphaTest 0.5`, `DoubleSide`), water (`transparent`, `opacity 0.72`, `depthWrite false`, `DoubleSide`). | Code inspection: `WorldRenderer.setMaterials` (`WorldRenderer.ts:68-86`) used by `Chunk.buildMesh` |
| RENDER-04 | Water renders after opaque geometry (renderOrder 1) with transparent blending, and is double-sided. | Code inspection: `src/world/Chunk.ts:57` (`renderOrder = 1`), material in RENDER-03 |
| RENDER-05 | The scene has fog with color and distance ranges (near 70, far 210) that match the sky color, and sky + fog both update during the day/night cycle. | Code inspection: `WorldRenderer.ts:47-50, 102-105` |
| RENDER-06 | A black line selection box is visible on the targeted block exactly when the crosshair ray hits a block within reach, and hidden otherwise. | Code inspection: `src/core/Game.ts:45-49, 195-197` |
| RENDER-07 | Atlas sampling uses `NearestFilter`, `ClampToEdgeWrapping`, no mipmaps, and 1 px UV insets per tile, so block faces look pixelated with no neighbor-texture bleeding. | Code inspection: `src/blocks/TextureAtlas.ts:40-49`, UV computation in `src/world/Mesher.ts:214-231` |
| RENDER-08 | The sun disc mesh is visible during daytime and hidden when the sun is below the horizon. | Code inspection: `WorldRenderer.ts:60-65, 117-119` (`sunH > -0.08`) |

## World / Terrain

| ID | Criterion | Verification |
|---|---|---|
| WORLD-01 | The world is a grid of 16×16 chunks, each 64 blocks tall, stored as one `Uint8Array(16·64·16)` per chunk. | Code inspection: `src/Constants.ts:1-3`, `src/world/Chunk.ts:16` |
| WORLD-02 | Column composition: bedrock at y=0; stone below h−3; dirt (or sand on beaches where h ≤ SEA_LEVEL+1) down to h−1; grass (or sand) at the surface y=h; air above; water fills air below y ≤ SEA_LEVEL (22). | Code inspection: `TerrainGenerator.generate` (`src/world/TerrainGenerator.ts:46-63`) |
| WORLD-03 | Caves are carved into stone by 3D fbm noise (threshold 0.52) for y between 4 and h−3. | Code inspection: `isCave` (`TerrainGenerator.ts:86-89`) |
| WORLD-04 | Water surfaces at or below sea level render as translucent blocks with no bottom-facing geometry. | Code inspection: mesher water pass + exposed-face rule (`src/world/Mesher.ts:122-123`), `Block.Water` def |
| WORLD-05 | Trees grow on ~2 % of suitable columns (hash2 < 0.02, height > SEA_LEVEL+2 and < 34): trunk 4–6 logs above ground, layered canopy radius 1–2 with corner/center rules, leaves placed only into air. | Code inspection: `shouldPlaceTree` (`TerrainGenerator.ts:38-40`), `placeTree` (`TerrainGenerator.ts:91-115`) |
| WORLD-06 | Canopies of trees rooted inside a ring of ±2 cells outside a chunk overhang onto that chunk, so borders are consistent and tree shapes never depend on load order. | Code inspection: overhang scan `TerrainGenerator.ts:77-83` |
| WORLD-07 | Terrain functions (`heightAt`, `shouldPlaceTree`) are pure functions of world coordinates; regenerating any chunk in any order yields the same block data (incl. overhanging leaves). | Code inspection: `TerrainGenerator.ts:13, 27-40`; Unit test (pending): deterministic regen in a temp chunk |
| WORLD-08 | The world seed is taken from the `?seed=<n>` URL parameter (default 1337) and every generated feature (heightmap, caves, trees) is derived from it. | Code inspection: `src/core/Game.ts:33`, `TerrainGenerator` constructor |

## Chunking

| ID | Criterion | Verification |
|---|---|---|
| CHUNK-01 | Chunks inside `VIEW_RADIUS` (6) of the player chunk are queued in distance order (square offsets −6..6 sorted by squared distance, 169 candidates) and loaded as the player moves. | Code inspection: `src/world/ChunkManager.ts:45-52, 136-146` |
| CHUNK-02 | Generation is capped at a 6 ms per-frame budget and mesh rebuilds at a separate 6 ms per-frame budget. | Code inspection: `ChunkManager.update` (`ChunkManager.ts:115-127`) |
| CHUNK-03 | A chunk is remeshed only when its data changes or a neighboring chunk appears; boundary edits additionally mark the adjacent chunk dirty. | Code inspection: `markDirty` (`ChunkManager.ts:165-168`), `setBlockWorld` border cases (`ChunkManager.ts:98-102`), `generateChunk` neighbor marks (`ChunkManager.ts:157-162`) |
| CHUNK-04 | The loading overlay hides once `INITIAL_TARGET` (25) chunks are loaded; the bar reflects loaded/25. | Code inspection: `src/core/Game.ts:13, 217-221`; HUD `setLoadingProgress` (`src/ui/HUD.ts:106-115`) |
| CHUNK-05 | Chunks farther than `VIEW_RADIUS + 2` from the current center chunk are unloaded (meshes removed, geometries disposed) once per simulated second. | Code inspection: `unloadFar` + timer (`ChunkManager.ts:129-133, 170-180`) |
| CHUNK-06 | Crossing a chunk boundary refreshes the load queue around the new center chunk. | Code inspection: `ChunkManager.ts:107-113` |
| CHUNK-07 | `getBlockWorld` returns Air for out-of-world Y and unloaded chunks; `setBlockWorld` returns false for those cases instead of crashing. | Code inspection: `ChunkManager.ts:71-78, 80-86` |
| CHUNK-08 | Each chunk's data footprint is bounded: one 16 KB `Uint8Array` plus ≤ 3 mesh geometries while visible. | Code inspection: `Chunk.ts:16`, `Chunk.dispose`; Browser/PERF: debug overlay triangle + chunk counts stay stable over time |

## Player

| ID | Criterion | Verification |
|---|---|---|
| PLAYER-01 | Pointer-lock mouse look adjusts yaw and pitch with sensitivity 0.0022; pitch is clamped to ±1.55 rad. | Code inspection: `src/player/PlayerController.ts:37-42` |
| PLAYER-02 | WASD moves the player in yaw-relative heading with exponential smoothing; Shift sprints (5.9 vs 4.35 u/s); Space jumps (impulse 9.2) under gravity 28 (terminal −55). | Code inspection: `PlayerController.update` (`PlayerController.ts:44-79`), constants `src/Constants.ts:7-10` |
| PLAYER-03 | The player is an AABB (half-width 0.3, height 1.8) that collides with solid blocks axis-by-axis (Y first) with a 1e-4 epsilon; velocity is zeroed per colliding axis and `onGround` is set on downward contact. | Code inspection: `collideAxis` (`PlayerController.ts:118-160`) |
| PLAYER-04 | In water the player swims: buoyant vertical control (±4.2 / −2.5 target), no gravity, and horizontal speed reduced to 55 %. | Code inspection: `PlayerController.ts:64, 69-72`, `isInWater` (`PlayerController.ts:109-116`) |
| PLAYER-05 | Head bob (±0.055, faster when sprinting) applies while moving on ground, and sprinting triggers a smooth FOV kick from 75 to 82. | Code inspection: `PlayerController.ts:94-106` |
| PLAYER-06 | Spawn lands on terrain above sea level (< 42) near the spawn column with a spiral fallback, never inside a tree column; falling below y=−16 teleports the player back to safety. | Code inspection: `Game.spawnPlayer` (`src/core/Game.ts:60-86`), `PlayerController.ts:87-91` |

## Block Interaction

| ID | Criterion | Verification |
|---|---|---|
| INTERACT-01 | The crosshair ray (`MAX_REACH` 6, camera-forward) is stepped by Amanatides-Woo voxel DDA through the grid and returns the first non-Air block plus the face normal hit. | Code inspection: `src/player/BlockPicker.ts:18-78`, call site `src/core/Game.ts:138-151` |
| INTERACT-02 | Left click while pointer-locked breaks the targeted block (sets it to Air). | Code inspection: `src/core/Game.ts:106-110, 153-156`; Browser (manual): LMB removes block |
| INTERACT-03 | Right click places the selected hotbar block on the targeted face; placement is refused when the target cell is outside `[0, CHUNK_HEIGHT)` or when a solid block would overlap the player AABB. | Code inspection: `Game.placeBlock` (`src/core/Game.ts:159-180`); Browser (manual): RMB adds block, cannot place inside self |
| INTERACT-04 | The selection box tracks the targeted block every frame. | Code inspection: `src/core/Game.ts:195-197`; Browser (manual) |
| INTERACT-05 | Water can be both broken (set to Air) and placed (via hotbar selection), and the solid-overlap guard does not apply to non-solid blocks. | Code inspection: `Game.ts:167-178`, `Block.Water` def `src/blocks/Blocks.ts:54`; Browser (manual) |
| INTERACT-06 | Breaking/placing a block on a chunk boundary also remeshes the adjacent chunk so shared faces update. | Code inspection: `ChunkManager.setBlockWorld` (`ChunkManager.ts:98-102`); Unit test (pending): edit on `lx==0` marks neighbor |

## Registry / Textures

| ID | Criterion | Verification |
|---|---|---|
| REGISTRY-01 | The registry defines 9 placeable blocks (Grass, Dirt, Stone, Sand, Water, Bedrock, Log, Leaves, Brick) plus Air with id/name/solid/opaque and per-face textures (top, bottom, ±x, ±z). | Code inspection: `src/blocks/Blocks.ts:10-65` |
| REGISTRY-02 | The `opaque` flag drives sink-face culling: faces are only emitted when the neighbor does not occlude them (the mesher skips faces against opaque blocks). | Code inspection: mesher exposed-face rule `src/world/Mesher.ts:122-123` + solid blocks have `opaque: true` |
| REGISTRY-03 | The atlas paints 11 procedural 16×16 tiles from seeded painters into 18 px cells (16×60-cell canvas: 288×1080) and exposes `drawTile` for HUD icons. | Code inspection: `src/blocks/TextureAtlas.ts:13-19, 32-59, 105-189` |
| REGISTRY-04 | `isSolid(id)` returns true for every id except Air and Water (the canonical movement-blocking predicate). | Code inspection: `src/blocks/Blocks.ts:79-81` |
| REGISTRY-05 | Per-face brightness is baked into geometry as vertex colors: top 1.0, bottom 0.5, ±x 0.72, ±z 0.84. | Code inspection: `DIRS` table `src/world/Mesher.ts:30-37` + `addQuad` color; rendered via Lambert `vertexColors` |

## Inventory / Hotbar

| ID | Criterion | Verification |
|---|---|---|
| HOTBAR-01 | The hotbar renders 9 slots, one per hotbar block, each with a 40 px pixelated atlas icon, a number badge and a registry name. | Code inspection: `src/ui/HUD.ts:40-66`, `src/style.css:67-97`; Browser (manual) |
| HOTBAR-02 | Selection changes with keys 1–9 and the scroll wheel, wrapping around at both ends (cyclic). | Code inspection: `src/core/Game.ts:90-93, 111-119` |
| HOTBAR-03 | The selected slot is visually highlighted and is the source block used by right-click placement. | Code inspection: `HUD.setSelected` (`src/ui/HUD.ts:68-71`), `Game.placeBlock` (`Game.ts:162`) |
| HOTBAR-04 | Slot labels come from the block registry (`BLOCKS[b].name`), so naming is single-sourced. | Code inspection: `HUD.ts:52` |

## Lighting / Environment

| ID | Criterion | Verification |
|---|---|---|
| LIGHT-01 | The scene is lit by a hemisphere light (0.9), an ambient light (0.25) and a directional sun (1.3) targeting the player; blocks shade via Lambert with the baked vertex-color brightness. | Code inspection: `WorldRenderer.ts:52-58`; materials RENDER-03 |
| LIGHT-02 | A 240-second day/night cycle advances automatically while enabled and stops when toggled with N; the HUD reflects the state ("Day/night: ON/OFF"). | Code inspection: `DAY_CYCLE_SECONDS` (`Constants.ts:16`), `toggleCycle` + `update` (`WorldRenderer.ts:88-95`), `Game.ts:94-96` |
| LIGHT-03 | Sky and fog lerp from night `0x0d1226` to day `0x87ceeb` with a dawn tint `0xff9d4d`; sun/hemi/ambient intensities are modulated by sun height. | Code inspection: `WorldRenderer.ts:33-35, 96-115` |
| LIGHT-04 | The cycle starts just after sunrise (`timeOfDay 0.27`) and the sun disc is hidden at night. | Code inspection: `WorldRenderer.ts:23, 117-119` |

## UI

| ID | Criterion | Verification |
|---|---|---|
| UI-01 | The HUD continuously updates FPS (≈4×/s), player XYZ, loaded-chunk count and the day/night state string. | Code inspection: `src/core/Game.ts:200-209`, `HUD.setFps/setPos/setChunks/setCycle` |
| UI-02 | F3 toggles the debug overlay showing pending-generation, pending-mesh, edited-cells and per-frame triangle counts. | Code inspection: `Game.ts:97-99`, `HUD.setDebug/toggleDebug` (`HUD.ts:89-100`), updated from `manager.stats()` `Game.ts:208-215` |
| UI-03 | A "click to play" overlay requests pointer lock on click, hides while locked and reappears on unlock. | Code inspection: `index.html:32-40`, `HUD.setLocked` (`HUD.ts:102-104`), `Game.ts:121-128` |
| UI-04 | A loading overlay with a progress bar and percentage shows "Generating world… n %" until 25 chunks are loaded, then hides. | Code inspection: `HUD.setLoadingProgress` (`HUD.ts:106-115`), `Game.ts:217-221` |
| UI-05 | Boot validates all 12 required DOM ids and, on any missing id or init failure, shows a fatal overlay with the message (alert fallback if `#fatal` is missing). | Code inspection: `src/main.ts:5-25, 39-59` |

## Performance

| ID | Criterion | Verification |
|---|---|---|
| PERF-01 | The mesher greedily merges same-texture adjacent faces into single quads, capped so a merged quad stays inside its atlas cell (≤ 16−col wide, ≤ 60−row tall). | Code inspection: `src/world/Mesher.ts:129-155, 136-141` |
| PERF-02 | Generation and mesh rebuilds are budgeted at 6 ms per frame each, so streaming cannot stall the frame. | Code inspection: `ChunkManager.update` (`ChunkManager.ts:115-127`) |
| PERF-03 | The mesher only emits faces exposed to air/water (opaque neighbors hide faces), keeping triangle counts low. | Code inspection: `Mesher.ts:118-125` |
| PERF-04 | The renderer caps pixel ratio at 2, shares 3 materials across all chunks, and relies on Three.js per-mesh frustum culling. | Code inspection: `WorldRenderer.ts:43-44, 68-86`; `computeBoundingSphere` in `Mesher.toGeometry` (`Mesher.ts:76-85`) |
| PERF-05 | The loaded chunk set stays bounded: radius-6 window plus a 2-chunk unloading margin, pruned once per simulated second. | Code inspection: `unloadFar` (`ChunkManager.ts:170-180`) |
| PERF-06 | The frame update clamps `dt` to 0.05 s, preventing physics instability after large frame gaps (tab switch, hiccups). | Code inspection: `src/core/Game.ts:184` |

## Persistence

| ID | Criterion | Verification |
|---|---|---|
| PERSIST-01 | Every in-session block edit is recorded as an absolute cell state per chunk and re-applied over freshly generated terrain when that chunk regenerates — so breaks/places survive chunk unload and reload within the session. | Code inspection: `ChunkManager.edits` (`ChunkManager.ts:35, 91-96`), `generateChunk` (`ChunkManager.ts:152-153`), `Chunk.applyEdits` (`src/world/Chunk.ts:45-49`) |
| PERSIST-02 | The debug overlay reports the total number of edited cells. | Code inspection: `stats()` (`ChunkManager.ts:59-68`), HUD debug string `HUD.ts:90-94` |
| PERSIST-03 | Persistence is session-only by design: no localStorage/IndexedDB/backend usage exists, so a page reload regenerates the world from the seed. | Code inspection: no storage APIs referenced anywhere in `src/`; Browser (manual): reload resets edits |

## Error Handling

| ID | Criterion | Verification |
|---|---|---|
| ERR-01 | Boot throws a descriptive `Error` ("Required DOM element \"#<id>\" is missing.") for any of the 12 required ids that is absent. | Code inspection: `src/main.ts:21-25, 27-31` |
| ERR-02 | Any boot/init failure is caught and rendered into the `#fatal` overlay (which hides the click-to-play and loading overlays); if `#fatal` is absent, an alert is used instead. | Code inspection: `src/main.ts:39-59` |
| ERR-03 | Atlas construction fails with a clear message when a 2D canvas context is unavailable. | Code inspection: `src/blocks/TextureAtlas.ts:33-34` |
| ERR-04 | The raycast terminates safely after at most 512 voxel steps or once past `maxDist`, never hanging even when the origin is inside solid geometry. | Code inspection: `src/player/BlockPicker.ts:49-77` |
| ERR-05 | Out-of-world/out-of-bounds world access is graceful: `getBlockWorld` returns Air for y outside `[0, 64)` and for unloaded chunks; `setBlockWorld` refuses such writes and boundary placement is refused above/below the world. | Code inspection: `ChunkManager.ts:71-86`, `Game.ts:166` |
| ERR-06 | If the player ever falls out of the world (y < −16), position and velocity are reset to a safe location. | Code inspection: `PlayerController.ts:87-91` |

## Testing

| ID | Criterion | Verification |
|---|---|---|
| TEST-01 | Automated unit tests exist covering the pure logic: terrain determinism per seed, voxel DDA raycast, chunk edit overlay, and player collision. | Verified 2026-08-03: tests under `tests/unit/` (10 files, 51 tests) are **green** (`npm test` exit 0). Greedy-mesher invariants and atlas UVs are covered by code inspection + e2e rather than a dedicated unit test. |
| TEST-02 | `npm test` passes with a green suite. | **Satisfied 2026-08-03** — `npm test` exit 0 (10 files / 51 tests passed). |
| TEST-03 | Static checks are green: `npm run typecheck`, `npm run lint`, `npm run build`. | Verified 2026-08-03: typecheck exit 0, lint exit 0, build exit 0 (`dist/` re-emitted) |
| TEST-04 | Browser smoke: the app boots in a real browser, the `window.__mc` hook is present, and no console errors are thrown during startup. | Hook wiring: `src/main.ts:36` (code inspection). Full browser pass: pending (dev servers reachable at :5173/:5174, HTTP 200, 2026-08-03). |

## Code Quality

| ID | Criterion | Verification |
|---|---|---|
| QUALITY-01 | TypeScript strict mode is on (incl. `noUnusedLocals`/`noUnusedParameters`) and ESLint (flat config, js+ts recommended) reports zero violations. | CLI check: `npm run typecheck` / `npm run lint` (both green, 2026-08-03); `tsconfig.json`, `eslint.config.js` |
| QUALITY-02 | Modules are layered by concern (utils → blocks → world/player/render/ui → core → main) with no runtime circular imports. | Code inspection: architecture.md §2 dependency graph (Mesher→Chunk is type-only) |
| QUALITY-03 | Pure deterministic logic (terrain, noise, raycast, math) is separated from stateful systems (chunk streaming, player physics state, renderer). | Code inspection: `TerrainGenerator`, `SimplexNoise`, `BlockPicker`, `MathUtils` have no mutable world state |
| QUALITY-04 | All tuning constants are centralized in `src/Constants.ts` and referenced by value elsewhere. | Code inspection: `Constants.ts` (16 constants) and imports across `core`, `world`, `player`, `render` |

## Documentation

| ID | Criterion | Verification |
|---|---|---|
| DOC-01 | `openspec/project.md` accurately describes purpose, stack, features, controls, and module map. | Review against source (2026-08-03): all stated facts traced to real files |
| DOC-02 | `openspec/architecture.md` accurately documents layers, dependency graph, data flows, chunk lifecycle, persistence, render pipeline and determinism. | Review against source (2026-08-03): diagrams/state machine match `ChunkManager`/`Mesher` behavior |
| DOC-03 | `openspec/acceptance-criteria.md` criteria are testable assertions over the implemented behavior with concrete verification methods. | Review against source (2026-08-03) |
| DOC-04 | `openspec/verification-matrix.md` traces every requirement ID to a spec reference, implementation reference, verification method, status, evidence and remaining issue. | Structural review: every ID in this file appears in the matrix with no blank cells (2026-08-03) |
