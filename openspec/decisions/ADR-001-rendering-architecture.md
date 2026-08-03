# ADR-001: Rendering architecture

**Status:** Accepted
**Date:** 2026-08-03
**Applies to:** `src/render/WorldRenderer.ts`, `src/world/Chunk.ts`, `src/world/Mesher.ts`, `src/blocks/TextureAtlas.ts`

## Context

TryMC is a browser voxel sandbox with a streaming 16×16×64-chunk world. Every
frame it must draw: up to **169 loaded chunks** (view radius 6 → a 13×13 spiral
grid), procedurally painted block textures, and three visually distinct classes
of blocks — fully opaque solids, translucent water, and alpha-tested leaves.
The renderer must keep draw calls low enough for 60 fps on modest hardware
while the world is still streaming in, and the texture source must be available
with zero external assets (no PNGs to download, fully offline initial load).

The system makes no use of post-processing, shadows, fog-based depth tricks, or
deferred rendering; the whole scene is a set of meshes with per-vertex colors,
lit by a small fixed light rig.

## Decision

Render everything with **one Three.js `WebGLRenderer`** and a small set of
**three shared `MeshLambertMaterial`s** (one per render pass), whose textures
all come from a **single procedural canvas texture atlas**. Chunk geometry is
**greedy-meshed** into as few quads as possible, per pass, with both
per-face-culling and quad merging reducing geometry before it ever reaches the
GPU.

Concretely, in `src/render/WorldRenderer.ts`:

- `new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })`.
- Caps supersampling: `setPixelRatio(Math.min(devicePixelRatio, 2))` — a 4K
  monitor is rendered at 2× rather than native, trading some sharpness for a
  large fill-rate saving.
- `PerspectiveCamera(75, aspect, 0.1, 500)`; the far plane matches the fog far
  distance (210) plus headroom.
- Three materials built once in `setMaterials(atlas)`:
  - `solid` — `MeshLambertMaterial({ map: atlas, vertexColors: true })`,
  - `cutout` — same + `alphaTest: 0.5` and `side: DoubleSide` (leaves),
  - `water` — same + `transparent: true, opacity: 0.72, depthWrite: false,
    side: DoubleSide`.

All chunk meshes share these three materials; **no per-block or per-chunk
material instances** are created.

Geometry is produced by the greedy mesher in `src/world/Mesher.ts`:

- A two-dimensional mask per face direction per slice; a face is emitted only
  when the neighboring cell in that direction is
  `Block.Air` (or `Block.Water` when the face belongs to a solid — so water
  never occludes its neighbor, and underwater stone faces are culled against
  the water body).
- Runs of identical texture along both mask axes are merged into single quads
  (`visited` back-2D marking, run capped so merged-quad UVs stay inside the
  16×60 atlas).
- Faces are bucketed by texture into three passes: `solid` / `cutout`
  (`Tex.Leaves`) / `water` (`Tex.Water`), each accumulating its own
  `BufferGeometry`.
- Per-face brightness is baked as a vertex attribute color (top 1.0, +x/−x
  0.72, north/south 0.84, bottom 0.5), multiplied against the Lambert lighting
  via `vertexColors` — cheap static shading with no per-face extra draw.

The atlas (`src/blocks/TextureAtlas.ts`) is an 18 px-cell canvas — 288×1080 —
with 16×16 tiles, `NearestFilter` (no anisotropic/mip filtering), no mipmaps,
and 1 px tile padding. UV insets of 1 px are applied in the mesher so nearest
sampling never bleeds across tile boundaries, even for merged quads.

Rendering order is baked per mesh at the Chunk level: water meshes get
`renderOrder: 1` so they draw after opaque geometry without a separate
sorting pass.

## Alternatives Considered

### Per-face / per-chunk instanced rendering
One `Mesh` per quad (up to tens of thousands of draw calls) or an instanced
`InstancedMesh` per block type. Rejected: the lightweight Lambert material +
Lit-style per-face baking achieves the same result with ~1 draw call per pass
per chunk (up to ~3×169 = 507 worst case), while instancing would still need
per-quad matrix setup, texture handling per instance, and more CPU bookkeeping,
for no visual gain in this palette.

### A single mesh per chunk (no pass splitting)
Tried-and-true in small demos but fails here: translucent water must render
after opaque geometry, and alpha-tested leaves need `alphaTest` + `DoubleSide`
which would then be forced onto every face. Three pass-meshes cost only a few
extra draw calls and let each pass set exactly the material flags it needs.

### Naive per-block meshes (one box per block, full 6 faces each)
Rejected as the baseline since the start: an un-merged 16×16×64 chunk with even
a 50% fill rate would emit > 100k triangles; interior faces between two solid
blocks would need to be culled anyway, which half of the greedy algorithm
already provides, so emitting per-block boxes first and culling later doubles
the work with zero benefit. Culling + greedy merging reduces a chunk to
typically a few thousand triangles per pass.

### Raw per-frame 16×16 tile `drawTexture` (non-atlas)
Scattering dozens of separate `CanvasTexture`s would multiply material/state
switches and break greedy quads; a single atlassed canvas keeps one bind per
pass. (The atlas also serves the hotbar icons in `src/ui/HUD.ts`, which reuse
`atlas.drawTile`.)

## Consequences

➕ **One texture bind per pass** — all solid geometry shares a single
`CanvasTexture`, cutting texture switches to ~3 per frame.

➕ **Draw calls scale with chunks, not blocks** — at a full 13×13 view the
worst case is ~3 meshes per chunk, with empty passes producing no geometry at
all (`buildChunkGeometry` returns `null` for empty sets).

➕ **Zero-asset startup** — terrain textures are painted on a canvas at boot;
there are no external files to fetch, so initial load works offline.

➕ **Vertex-colored shading keeps materials static** — day/night state is
handled purely via light intensities and sky/fog colors
(`WorldRenderer.update`), never by touching per-chunk materials.

➕ **Water and leaves look correct by construction** — dedicated pass materials
(`alphaTest 0.5`, opacity 0.72, `depthWrite: false`) are layered in the right
order without per-face hacks.

➖ **No per-frame UV animation** — water "flow" or texture animation would need
either material-level changes or shader work; out of scope today.

➖ **Lambert, not PBR** — no specular highlights or physically based response;
acceptable for the current flat-shaded aesthetic, but a barrier to realistic
materials later.

➖ **Pixel-ratio cap at 2** — on high-DPI displays (2.5×–3× phone screens) the
image is downscaled and slightly softer than native; a deliberate
triangle-fill-rate trade-off.

➖ **Chunk-shaped draw granularity** — a single visible block in a far chunk
forces drawing that chunk's whole merged pass mesh; geometry bounds are
computed per chunk, so frustum culling at Three's scene level cannot clip
inside-chunk detail.
