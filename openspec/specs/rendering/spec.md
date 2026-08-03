# Capability: Rendering

## Purpose
Define how TryMC produces visual output from the voxel world through a WebGL renderer. This includes the Three.js `WebGLRenderer` setup, camera, chunk meshes, the shared per-material pipeline (solid / cutout / water), face culling and greedy meshing feeding the GPU, and the diagnostics used to measure draw cost. The renderer is the durable visual contract between the world state (`ChunkManager`) and the pixels on screen.

## Scope
In scope:
- `WebGLRenderer` construction, pixel ratio capping, and sizing/resize.
- `PerspectiveCamera` setup and aspect handling.
- Scene graph: chunk meshes, selection box, sun, lights, fog.
- The three shared materials (`solid`, `cutout`, `water`) and their settings.
- Mesh geometry produced by `buildChunkGeometry` (Mesher) and mounted by `Chunk.buildMesh`.
- Triangle-count diagnostics (`triangles()`).

Out of scope:
- Day/night lighting and sky color computation (see `lighting` spec).
- Terrain generation, chunk scheduling, and meshing algorithms (see `chunk-streaming` and `world-generation` specs).
- Texture atlas painting (see `world-generation`/`inventory` cross-references; atlas is a shared asset).

## Functional Requirements

- **FR-R-1** — The renderer creates a `THREE.WebGLRenderer` on the supplied canvas with `antialias: true` and `powerPreference: "high-performance"` (`src/render/WorldRenderer.ts:38`).
- **FR-R-2** — Pixel ratio is capped at 2: `setPixelRatio(Math.min(window.devicePixelRatio, 2))` (`WorldRenderer.ts:43`).
- **FR-R-3** — The camera is a `THREE.PerspectiveCamera(75, aspect, 0.1, 500)` (`WorldRenderer.ts:46`).
- **FR-R-4** — A scene background color (`0x87ceeb`) and `THREE.Fog(0x87ceeb, 70, 210)` are applied (`WorldRenderer.ts:48-50`).
- **FR-R-5** — `setMaterials(atlas)` creates three shared materials used by all chunk meshes (`WorldRenderer.ts:68-86`):
  - `solid`: `MeshLambertMaterial` with `map: atlas`, `vertexColors: true`.
  - `cutout`: `MeshLambertMaterial` with `map: atlas`, `vertexColors: true`, `alphaTest: 0.5`, `side: THREE.DoubleSide`.
  - `water`: `MeshLambertMaterial` with `map: atlas`, `vertexColors: true`, `transparent: true`, `opacity: 0.72`, `depthWrite: false`, `side: THREE.DoubleSide`.
- **FR-R-6** — `Chunk.buildMesh(ctx)` builds geometry via `buildChunkGeometry` and mounts up to three meshes (solid/cutout/water) at world offset `(cx*16, 0, cz*16)` with `renderOrder` 0/0/1 (`src/world/Chunk.ts:51-58`).
- **FR-R-7** — `resize(w, h)` updates camera aspect, calls `updateProjectionMatrix()`, and calls `renderer.setSize(w, h)` (`WorldRenderer.ts:131-135`); it is invoked on window resize and at startup (`src/core/Game.ts:128-129`).
- **FR-R-8** — `render()` renders the scene each frame (`WorldRenderer.ts:122-124`); `Game.update` calls it once per frame after the world/player update (`Game.ts:197`).
- **FR-R-9** — `triangles()` returns `renderer.info.render.triangles` for the F3 debug overlay (`WorldRenderer.ts:126-129`).
- **FR-R-10** — The selection box is a `LineSegments` over an `EdgesGeometry(BoxGeometry(1.002,1.002,1.002))` with a black semi-transparent material; it is positioned at the targeted block cell and hidden when no block is targeted (`Game.ts:44-48, 193-195`).

## Non-functional Requirements

- **NR-R-1** — Pixel ratio must never exceed 2 to bound fill-rate cost (`WorldRenderer.ts:43`).
- **NR-R-2** — All chunk meshes share exactly three materials; no per-chunk material allocation (keeps state changes low).
- **NR-R-3** — Render ordering: solid/cutout first, water drawn last via `renderOrder = 1` with `depthWrite: false` so translucent water sorts after opaque geometry (`Chunk.ts:57`).
- **NR-R-4** — The geometry pipeline must tolerate per-chunk geometry rebuilds (on edit / neighbor load) without leaking GPU memory; old geometries are disposed in `replaceMesh` (`Chunk.ts:79-84`).

## Inputs and Outputs

Inputs:
- `canvas: HTMLCanvasElement` (WebGL context target).
- `Texture` (the procedural atlas) passed to `setMaterials`.
- `dt`, `playerPos` passed to `update` (used by lighting; see `lighting` spec).
- `ChunkMeshContext` (`solidMat`, `cutoutMat`, `waterMat`, `getWorldBlock`) for mesh mounting.
- `window.innerWidth` / `window.innerHeight` for sizing.

Outputs:
- `WorldRenderer` instance exposing `renderer`, `scene`, `camera`, `materials`, `cycleOn`, `timeOfDay`, `setMaterials`, `update`, `render`, `triangles`, `resize`, `toggleCycle`.
- Pixel output on the canvas; `triangles()` number for diagnostics.

## Core Data Structures
- `RenderMaterials` interface (`WorldRenderer.ts:5-9`): `{ solid: THREE.Material; cutout: THREE.Material; water: THREE.Material }`.
- `ChunkMeshContext` interface (`src/world/Chunk.ts:5-11`): `{ scene; solidMat; cutoutMat; waterMat; getWorldBlock }`.
- `ChunkGeometrySet` (`src/world/Mesher.ts:88-92`): `{ solid; cutout; water }` each `THREE.BufferGeometry | null`.
- Per-chunk mesh fields on `Chunk`: `private solid/cutout/water: THREE.Mesh | null`.
- `FaceBuffers` (`Mesher.ts:47-86`): `pos/uv/normal/color/index` numeric arrays plus `addQuad`/`isEmpty`/`toGeometry`.

## Dependencies
- `src/render/WorldRenderer.ts` → `three`, `src/Constants.ts` (`DAY_CYCLE_SECONDS`), `src/utils/MathUtils.ts` (`smoothstep`).
- `src/world/Chunk.ts` → `three`, `src/Constants.ts`, `src/world/Mesher.ts`.
- `src/world/Mesher.ts` → `three`, `src/blocks/Blocks.ts`, `src/blocks/TextureAtlas.ts`, `src/Constants.ts`.
- `src/core/Game.ts` → `src/render/WorldRenderer.ts`, `src/blocks/TextureAtlas.ts`.

## Error and Edge-Case Behavior
- **WebGL unavailable**: `new THREE.WebGLRenderer` throws; `Game` constructor propagates the error to `main.ts`, which surfaces it in the `#fatal` overlay and hides the loading/click-to-play overlays (`src/main.ts:39-59`).
- **Missing canvas or DOM**: `getRequired` throws before renderer construction; handled by `main.ts` fatal path (`main.ts:21-25`).
- **Empty geometry**: a chunk with no faces in a pass produces `null` geometry; `replaceMesh` returns `null` and no mesh is added (`Chunk.ts:84-85`).
- **Mesh rebuild**: `replaceMesh` removes and disposes the old geometry before adding the new one, so stale geometry is not leaked (`Chunk.ts:79-84`).
- **Resize with zero/invalid size**: `resize` is only called with `window.innerWidth/innerHeight`; aspect is computed from those values (`Game.ts:128`).
- **Disposal**: `Chunk.dispose` removes and disposes all three meshes when a chunk unloads (`Chunk.ts:60-68`).

## Performance Expectations
- Fill rate bounded by pixel ratio cap of 2 (`NR-R-1`).
- Greedy meshing (see `world-generation`/`chunk-streaming`) minimizes triangle count per chunk so the GPU draw cost stays low; `triangles()` exposes the actual count.
- Water is a single overlaid pass with `depthWrite: false`, avoiding a separate translucent pass per chunk.
- **To be measured**: target FPS under sustained movement (see `performance` spec) is not instrumented in the renderer itself; only `triangles()` is reported.

## Acceptance Criteria
- **AC-R-1** — The renderer initializes without throwing on a WebGL-capable browser and renders the scene.
- **AC-R-2** — `renderer.setPixelRatio` is capped at 2 (no pixel ratio above 2 regardless of device).
- **AC-R-3** — Exactly three materials are shared across all chunk meshes (`solid`, `cutout`, `water`).
- **AC-R-4** — Water renders translucent (`opacity 0.72`), after opaque geometry, and does not occlude what is behind it (`depthWrite: false`, `renderOrder 1`).
- **AC-R-5** — Leaves render as cutout with `alphaTest 0.5` and double-sided, so the transparent holes in the leaf texture are visible.
- **AC-R-6** — Resizing the window keeps the viewport correct (no distortion, no stretching).
- **AC-R-7** — The selection box appears exactly on the targeted block cell and disappears when nothing is targeted.
- **AC-R-8** — `triangles()` returns a non-negative number each frame and is displayed in the F3 debug overlay.

## Verification Method
- **AC-R-1**: Unit — construction requires a WebGL context; verify via browser (see AC-R-2 e2e). E2E — run `npm run dev`, open the page, confirm the world renders and no `#fatal` overlay appears.
- **AC-R-2**: E2E — from `window.__mc.renderer.renderer.getPixelRatio()` in DevTools against a device with devicePixelRatio > 2; assert value ≤ 2.
- **AC-R-3**: E2E — inspect `window.__mc.renderer.materials` (three distinct materials) and that all chunk meshes reference them.
- **AC-R-4**: E2E — place water, observe translucent rendering over terrain; verify no depth artifacts.
- **AC-R-5**: E2E — place/log leaves, observe transparent holes in the leaf texture.
- **AC-R-6**: E2E — resize the browser window and confirm no distortion.
- **AC-R-7**: E2E — aim at a block, observe the outline; aim at the sky, observe it disappear.
- **AC-R-8**: E2E — press F3, confirm the `tris` value updates and matches `renderer.info.render.triangles`.