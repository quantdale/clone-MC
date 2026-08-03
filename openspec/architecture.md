# TryMC — Technical Architecture

This document describes how the implemented TryMC system is built: module layers and their dependency graph, the per-frame and event-driven data flows, the chunk lifecycle state machine, the edit-persistence mechanism, the render pipeline, and the determinism guarantees. All statements reference the real source in `src/` (verified by code inspection, 2026-08-03).

## 1. Overview

TryMC is a plain TypeScript application with no framework. `src/main.ts` is the composition root: it validates the DOM, constructs the `HUD`, constructs the `Game` with the `#game` canvas, starts the animation loop, and exposes the game instance on `window.__mc` for automated validation. Everything else hangs off `Game`:

- `Game.renderer` — `WorldRenderer` (Three.js scene, camera, lights, materials, sky/fog).
- `Game.manager` — `ChunkManager` (the streaming voxel grid).
- `Game.player` — `PlayerController` (first-person physics and camera sync).
- `Game.hud` — DOM HUD.

The world is a grid of 16×16×64 chunks. Each chunk stores one `Uint8Array(16·64·16)` of block ids and produces up to three `THREE.Mesh` instances (solid / cutout / water) whose geometries are built by the greedy mesher. Meshes are added directly to the single shared `THREE.Scene`; Three.js performs per-mesh frustum culling via each geometry's bounding sphere.

## 2. Module layers and dependency graph

Static import graph (A → B means "A imports B"):

```
src/main.ts
   │  boot(); window.__mc hook; #fatal path
   ├───────────────────────────────► ui/HUD.ts ──► blocks/Blocks.ts
   │                                        └──► blocks/TextureAtlas.ts (type)
   ▼
core/Game.ts ──────────────────────────► blocks/Blocks.ts  (BLOCKS, HOTBAR, Block)
   │  │  │  │  │
   │  │  │  │  └──► blocks/TextureAtlas.ts ──► utils/Random.ts
   │  │  │  │
   │  │  │  └──► render/WorldRenderer.ts ──► utils/MathUtils.ts
   │  │  │                              └──► blocks/TextureAtlas.ts
   │  │  │
   │  │  └──► player/BlockPicker.ts ──► blocks/Blocks.ts
   │  │
   │  └──► player/PlayerController.ts ──► world/ChunkManager.ts (type)
   │                                 └──► blocks/Blocks.ts
   │
   └──► world/ChunkManager.ts ──► world/Chunk.ts ──► world/Mesher.ts ──► blocks/Blocks.ts
        │                            │  ▲             │  (type only)   └──► blocks/TextureAtlas.ts
        │                            │  └─────────────┘
        │                            └──► world/TerrainGenerator.ts ──► utils/Noise.ts ──► utils/Random.ts
        │                                                           └──► utils/Random.ts (hash2)
        │                                                           └──► blocks/Blocks.ts
        ▼
   (world access: getBlockWorld / setBlockWorld)
```

Legend: `A ──► B` = static import edge (A imports B). `(type)` = `import type`, erased at runtime.
Key runtime edges: `game → chunkManager → chunk → mesher`; `mesher → chunk` is type-only (no runtime cycle).

Layer summary (bottom = pure, top = composed):

| Layer | Modules | Imports | Notes |
|---|---|---|---|
| 0 — pure utilities | `utils/Random.ts`, `utils/Noise.ts`, `utils/MathUtils.ts` | none | Seeded RNG + seeded simplex noise (Gustavson port) + small math helpers; no Three.js, no DOM |
| 1 — domain vocabulary | `blocks/Blocks.ts`, `Constants.ts` | none | `Block` enum, `BlockDef` registry, `HOTBAR`, `isSolid`, all tuning constants |
| 2 — data services | `blocks/TextureAtlas.ts`, `world/Mesher.ts`, `world/TerrainGenerator.ts` | Layer 0–1 | Atlas painting; greedy meshing; pure terrain functions |
| 3 — stateful systems | `world/Chunk.ts`, `world/ChunkManager.ts`, `player/BlockPicker.ts`, `player/PlayerController.ts`, `render/WorldRenderer.ts`, `ui/HUD.ts` | Layers 0–2 | Chunk storage/streaming, raycast, physics, rendering, DOM HUD |
| 4 — composition root | `core/Game.ts` | Layers 1–3 | Wires everything, owns input + loop |
| 5 — entry | `main.ts` | Layer 4 + `ui/HUD` | DOM validation, boot, test hook |

Notes / caveats:

- `world/Chunk.ts` → `world/Mesher.ts` is a runtime (value) import; `world/Mesher.ts` imports `Chunk` as a **type-only** import, so there is no runtime import cycle.
- `Game.ts` imports `HUD` only as a type (`import type { HUD }`) — the HUD instance is injected by `main.ts`.
- `ChunkManager` is passed to `PlayerController.update()` as a type-only import; physics reads blocks through its `getBlockWorld`.
- `blocks/Blocks.ts:79` defines `isSolid()` as the canonical "blocks movement" predicate, but it is currently only exported — `PlayerController` and `BlockPicker` inline the equivalent `id === Air || id === Water` checks.

## 3. Data flows

### 3.1 Per-frame pipeline (`Game.loop` → `Game.update`, `src/core/Game.ts:182-222`)

```
requestAnimationFrame
        │ dt = min((now - last)/1000, 0.05)          ← cap: no physics spirals after tab switch
        ▼
manager.update(player.pos.x, player.pos.z, dt)        ← ChunkManager (src/world/ChunkManager.ts:106-134)
   │   • if player chunk changed → refreshQueue()     (distance-ordered refill)
   │   • generation budget: pop queue, generate +     (≤ 6 ms/frame)
   │     mesh new chunks (edits overlay reapplied)
   │   • rebuild budget: remesh dirty chunks          (≤ 6 ms/frame)
   │   • unloadTimer > 1 s → unloadFar()              (drop chunks beyond VIEW_RADIUS+2)
        ▼
player.update(dt, manager)                            ← PlayerController (src/player/PlayerController.ts:44-107)
   │   keys → wish direction (yaw-rotated) → velocity smoothing
   │   water swim / gravity / jump → axis-separated AABB collision
   │   → camera position (eye + head bob) + rotation (pitch/yaw, "YXZ") + FOV lerp
        ▼
renderer.update(dt, player.pos)                       ← WorldRenderer (src/render/WorldRenderer.ts:92-120)
   │   day/night phase → sun orbit, sun/hemi/amb intensities, sky+fog color, sun disc
        ▼
hit = currentHit()                                    ← raycastBlocks(camera) (src/core/Game.ts:138-151)
   │   selection box visible iff hit; positioned at (hit.x+0.5, hit.y+0.5, hit.z+0.5)
        ▼
renderer.render()                                     ← one WebGL draw of the whole scene
        ▼
HUD sync (fps 4×/s · xyz · chunks · debug · loading progress until 25 chunks)
```

### 3.2 Event-driven (input) flow (`src/core/Game.ts:88-131`)

```text
pointer lock:  click canvas → requestPointerLock(); pointerlockchange → hud.setLocked(), keys.clear() when unlocked
mousemove:     if locked → player.addMouse(movementX, movementY)   → yaw/pitch (pitch clamped ±1.55)
mousedown LMB: currentHit() → manager.setBlockWorld(hit, Air)      → break
mousedown RMB: currentHit() → bounds check → player-overlap check  → setBlockWorld(hit+normal, HOTBAR[selected]) → place
wheel:         select(wrapIndex(selected, dir, HOTBAR.length))     → hotbar wraps (cyclic)
keydown:       Digit1..9 → select(n-1) · N → toggleCycle() + hud.setCycle · F3 → hud.toggleDebug()
```

`setBlockWorld` (`src/world/ChunkManager.ts:80-104`) is the single mutation point for the world: it writes the byte, records the cell in the in-session `edits` overlay, and marks the chunk (plus up to 4 boundary neighbors when the cell is on a border) dirty for remeshing.

### 3.3 Interaction chain (break/place, end to end)

```text
mouse input → currentHit() → BlockPicker.raycastBlocks(camera, MAX_REACH=6)   [player/BlockPicker.ts]
           → {x,y,z, face normal nx,ny,nz} | null
break  → setBlockWorld(x,y,z, Air)
place  → setBlockWorld(x+nx, y+ny, z+nz, HOTBAR[selected]), rejected if:
           - y outside [0, CHUNK_HEIGHT)          (src/core/Game.ts:166)
           - placed block is solid AND its AABB overlaps the player AABB (half 0.3, height 1.8)
setBlockWorld → chunk.set() → edits overlay → markDirty() [self + borders]
           → next frame rebuild budget → Chunk.buildMesh() → Mesher.buildChunkGeometry()
           → replaceMesh(): old geometry disposed, new mesh added at world offset
```

## 4. Chunk lifecycle state machine

A chunk moves through the following states. (Transitions labeled with the responsible function.)

```text
                        player enters VISIBLE_RADIUS  (refreshQueue, src/world/ChunkManager.ts:136-146)
                                   │
                                   ▼
                    ┌───────────────────────────┐
        ──────────► │  QUEUED                   │  offset stored in `queue` + `queued` Set
                    │  (spiral/distance order)  │  169 offsets inside VIEW_RADIUS=6, sorted by squared distance
                    └───────────┬───────────────┘
                                │ generateChunk()  (6 ms generation budget, per frame)
                                │  1. terrain.generate(chunk)          → fills voxel data
                                │  2. chunk.applyEdits(edits[key])     → re-applies in-session edits
                                │  3. chunks.set(key, chunk)           → becomes readable via getBlockWorld
                                │  4. chunk.buildMesh(ctx)             → meshed immediately (see below)
                                │  5. markDirty(8 neighbours)          → border faces converge
                                ▼
                    ┌───────────────────────────┐
                    │  GENERATED / MESHED       │  data set; solid/cutout/water meshes added to the
                    │  (visible)                │  scene at (cx·16, 0, cz·16); Three.js frustum culls
                    └───────────┬───────────────┘
                                │
        local edit or neighbor  │ markDirty(chunk)   (setBlockWorld self+borders; generateChunk act. 5)
        chunk appears/reloads   │
                                ▼
                    ┌───────────────────────────┐
                    │  DIRTY                    │  chunk is in the `rebuild` Set
                    │  (pending remesh)         │
                    └───────────┬───────────────┘
                                │ 6 ms rebuild budget (per frame, rebuild loop)
                                ▼
                    ┌───────────────────────────┐
                    │  MESHED (visible)         │  buildMesh() replaced geometries in place
                    └───────────┬───────────────┘
                                │ unloadFar()  (once per simulated second)
                                │ |cx − centerCx| > VIEW_RADIUS+2  OR  |cz − centerCz| > VIEW_RADIUS+2
                                ▼
                    ┌───────────────────────────┐
                    │  UNLOADED                 │  dispose(): meshes removed + geometry.dispose();
                    └───────────┬───────────────┘  chunk dropped from `chunks` Map and `rebuild`
                                │                    `edits` overlay entry is KEPT (session persistence)
                                ▼ revisit within radius → back to State 1 (QUEUED)
```

Facts worth noting:

- **Generation and initial meshing happen together**: `generateChunk()` calls `chunk.buildMesh()` inline, so "generated" and "first meshed" are one transition inside the generation budget; the separate *rebuild* budget only covers chunks already loaded whose borders/contents changed.
- **Border convergence**: the mesher samples neighboring cells via `getWorldBlock`, which returns Air for not-yet-loaded chunks, so a chunk's border faces can be incomplete until its neighbors generate; because generating a chunk marks all 8 neighbors dirty, the geometry converges to the correct final state as the ring loads.
- **Boundary edits**: an edit on `lx == 0 / 15` or `lz == 0 / 15` additionally marks the adjacent chunk dirty (`ChunkManager.ts:98-102`) so shared faces redraw.
- `Chunk.hasData` (declared `src/world/Chunk.ts:17`) is currently unused by any consumer — presence in `chunks` + filled `data` is the de-facto "has data" signal.

## 5. Edit persistence mechanism

In-session persistence (survives chunk unload → regenerate; NOT across page reloads):

```text
ChunkManager.edits: Map<chunkKey, Map<cellIndex, blockId>>
                        │
setBlockWorld(x,y,z,id) │  records ABSOLUTE state (not a delta):
   └─ edits[key].set(chunk.index(lx,y,lz), id)         (ChunkManager.ts:96)
                        │
generateChunk(cx,cz)    │  after terrain.generate(chunk):
   └─ chunk.applyEdits(edits[key])                     (Chunk.ts:45-49) writes edit bytes over the
                                                        freshly generated terrain; out-of-range
                                                        indices ignored
```

- Overlay is absolute per-cell, so it composes with any freshly generated base terrain and stays correct across multiple unload/reload cycles.
- The HUD debug overlay reports `editedCells` = Σ sizes of the per-chunk edit maps (`stats()`, `ChunkManager.ts:59-68`).
- There is **no** long-term persistence: nothing writes to `localStorage`, IndexedDB, or a server; a full page reload resets the world to the seed.

## 6. Render pipeline

```text
procedural canvas atlas (TextureAtlas, 11 tiles)
   16×16 tile inside 18 px cell · 16 cols × 60 rows canvas (288×1080)
   NearestFilter mag+min · ClampToEdge · generateMipmaps=false · SRGBColorSpace
                        │  (1 px gutters + 1 px UV insets ⇒ no bleeding; tall canvas ⇒
                        ▼   greedy quads spanning up to 64 tiles vertically stay in-atlas)
greedy mesher per chunk (Mesher.buildChunkGeometry)
   for each of 6 face dirs: expose mask (neighbor queries via getWorldBlock)
   greedy-merge runs of equal texture (capped: w ≤ 16−col, h ≤ 60−row)
   per-face brightness baked into vertex colors (top 1.0, bottom 0.5, ±x 0.72, ±z 0.84)
   three passes: solid → cutout (leaves) → water, each a BufferGeometry
   exposed-face rule: water renders only against Air; other blocks also render against Water
                        │
Chunk.buildMesh (Chunk.ts:51-58) → replaceMesh()
   3 shared materials (WorldRenderer.setMaterials, src/render/WorldRenderer.ts:68-86)
   • solid:  MeshLambertMaterial { map: atlas, vertexColors: true }
   • cutout: + alphaTest 0.5, side: DoubleSide            (leaves)
   • water:  + transparent, opacity 0.72, depthWrite:false, side: DoubleSide
   mesh positioned at (cx·16, 0, cz·16); renderOrder 0 / 0 / 1 (water drawn last)
                        │
scene → fog (THREE.Fog 0x87ceeb, near 70, far 210) → directional+hemisphere+ambient lights
        → WebGLRenderer.render(scene, camera)
        per-mesh frustum culling by Three.js (computed bounding spheres)
        pixelRatio = min(devicePixelRatio, 2); antialias; high-performance preference
```

Day/night (same frame, `WorldRenderer.update`, `src/render/WorldRenderer.ts:92-120`):

- Phase advances `timeOfDay += dt / 240` while enabled (starts at 0.27, just after sunrise).
- Sun angle `ang = timeOfDay·2π`, `sunH = sin(ang)`; `dayF = smoothstep(-0.15, 0.35, sunH)`; `dawnF = max(0, 1−|sunH|/0.3)`.
- Sky = night `0x0d1226` lerped to day `0x87ceeb` plus 50 % dawn tint `0xff9d4d`; fog color tracks the sky.
- Sun mesh (sphere, `fog:false`, `renderOrder −1`) orbits 300 units around the player and is visible only when `sunH > −0.08`; sun/hemi/amb intensities scale with day/dawn factors.

## 7. Determinism guarantees

- **Seeded noise**: `utils/Random.mulberry32` (deterministic 32-bit PRNG) shuffles the permutation table of `SimplexNoise` (Gustavson public-domain port); four noise fields are seeded as `seed ⊕ {0x1001, 0x2002, 0x3003, 0x4004}` (`TerrainGenerator` constructor).
- **Pure height/tree functions**: `heightAt(x,z)` (fbm octaves at fixed frequencies 0.0012/0.005/0.018/0.06) and `shouldPlaceTree(x,z,h)` (`hash2 < 0.02`, height ∈ (24, 34)) are pure functions of world coordinates — any chunk can be regenerated in any order with identical results.
- **Tree self-containment**: trunk height and canopy shape derive from `hash2` of the root column; canopies are written only into Air cells; an extra scan of roots up to 2 cells outside the chunk (`TerrainGenerator.generate`, lines 77-83) fills overhanging leaves so chunk order never changes the world.
- **Seed source**: `?seed=<n>` URL parameter, default `1337` (`src/core/Game.ts:33`).
- **Caveat (transient, not final)**: meshing samples neighbors through `getBlockWorld` (Air if unloaded), so border faces may appear incomplete while chunks stream in; the dirty-set convergence described in §4 guarantees the final geometry is identical regardless of load order.

## 8. Performance model

| Mechanism | Where | Effect |
|---|---|---|
| Per-frame time budgets | `ChunkManager.update` (6 ms gen + 6 ms rebuild) | Streaming never blocks a frame; hitch-free while moving |
| Greedy meshing | `Mesher` | Merges up to N×N faces into 1 quad (within atlas span caps) — far fewer triangles than naive per-face quads |
| Face culling via `opaque` flag | `Mesher` mask | Only faces adjacent to non-opaque blocks are emitted |
| One mesh per pass per chunk | `Chunk.buildMesh` | ≤ 3 draw calls per chunk (~169 chunks in radius 6), no per-block geometry |
| Shared materials | `WorldRenderer.setMaterials` | 3 materials total; fewer state changes per frame |
| Frustum culling | Three.js (bounding spheres) | Off-screen chunks are skipped during draw |
| Bounded loaded set | `unloadFar()` (radius+2, once/s) | Memory stays near the view window |
| Device-pixel ratio cap | `setPixelRatio(min(dpr, 2))` | Bounded fill-rate on hi-DPI displays |
| `dt` clamp 0.05 s | `Game.loop` | No physics instability/tunneling after tab switches |
| Procedural assets | `TextureAtlas`, `TerrainGenerator` | Zero network/asset load at runtime |
