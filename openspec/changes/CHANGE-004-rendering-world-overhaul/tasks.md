# CHANGE-004 tasks

1. [x] Diagnose the checkerboard: greedy quads stretched UVs across atlas
   tiles and empty canvas.
2. [x] `src/render/voxelShader.ts`: per-block tile sampling via
   `onBeforeCompile` on `MeshLambertMaterial`; `aTile` attribute; water scroll.
3. [x] `src/world/Mesher.ts`: texture-only merge key, merged-corner AO in
   vertex colors, `opaque`-aware face culling, plant sprites, water surface
   sink.
4. [x] `src/world/TerrainGenerator.ts`: smoother shape, stone/snow caps,
   sealed caves, oak/spruce trees with forest clustering and slope check,
   tall grass + flowers.
5. [x] `src/blocks/Blocks.ts` + `TextureAtlas.ts`: TallGrass/Flower/Snow,
   14 tiles, redrawn art.
6. [x] `src/render/SkyDome.ts` + `WorldRenderer.ts`: gradient sky, sun/moon/
   stars/clouds, horizon-matched fog, allocation-free update.
7. [x] `src/player/PlayerController.ts`: solid-flag collision, auto step-up.
8. [x] `src/player/BlockPicker.ts`: skip the origin cell.
9. [x] `src/core/Game.ts`, `src/ui/HUD.ts`, `src/style.css`, `index.html`:
   spawn search, held block, HUD panel, crosshair gap, DOM write dedup.
10. [x] Tests: `tests/unit/Mesher.test.ts` (new), raycast origin test, terrain
    surface/water tests, block-id bounds.
11. [x] Docs: spec deltas + README.
