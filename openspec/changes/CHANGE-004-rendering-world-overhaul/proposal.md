# CHANGE-004 — Rendering, world and UX overhaul

**Status:** completed (verified 2026-08-04)

## Proposal

The game rendered a corrupted world: greedy-meshed faces sampled the texture
atlas with UV spans that crossed tile boundaries and empty canvas, producing a
black/white/color checkerboard across every merged quad (visible in
`docs/screenshot-fixed.png` history and the filed screenshot). Beyond that
first bug, terrain was spiky and noisy, trees were dense blobs, caves punched
holes in cliff faces, the sky was a flat fill, the HUD rewrote the DOM every
frame, and face culling treated leaves as opaque so stone behind leaf holes
recessed into voids.

This change fixes the rendering pipeline end-to-end and reworks the visual
and UX layers: shader-based tile sampling, corrected face culling, merged-quad
ambient occlusion, new terrain shape with snow/stone caps and sealed caves,
new trees and decoration blocks, a gradient sky dome, better textures, HUD
polish, player step-up, and raycast targeting that no longer hits the cell the
eye is inside.

## Design

- **`src/render/voxelShader.ts`** — `MeshLambertMaterial` keeps lighting, fog
  and alphaTest, but `onBeforeCompile` replaces the map sample: the fragment
  shader derives the per-block face UV from the face position and samples one
  atlas tile, so merged quads tile correctly at any size. A per-vertex `aTile`
  attribute carries the tile index; water tiles scroll with `uTime`.
- **`src/world/Mesher.ts`** — mask entries are pure texture ids (no UV-span
  caps), so same-texture runs merge fully. Occlusion is sampled at the merged
  quad's four corners (not per cell) and baked into vertex colors, which keeps
  greedy runs intact and avoids the dark grid that per-cell AO drew. Face
  culling uses the registry `opaque` flag, so stone faces stay visible behind
  leaf holes while leaves still hide against themselves. Plant blocks emit as
  crossed cutout sprites.
- **`src/world/TerrainGenerator.ts`** — broader continental + hill noise with
  a ridged mountain mask, low-amplitude detail (no more spiky jitter), stone
  caps above y=40, snow above y=50, caves sealed near cliff faces via neighbor
  column height, forest-clumped trees (oak + spruce), and grass/flower
  decoration.
- **`src/render/SkyDome.ts`** — gradient sky (horizon/zenith), sun halo and
  disc, moon, hashed stars and noise clouds, all fog-free; the renderer matches
  fog color to the horizon so terrain dissolves into the sky.
- **`src/core/Game.ts` / `src/ui/HUD.ts` / `src/style.css`** — reused vectors
  instead of per-frame allocations, HUD DOM writes only on change (debug text
  at 4 Hz), held-block name, crosshair gap, panel-styled HUD, new hotbar look.
- **`src/player/PlayerController.ts`** — collision honors the registry
  `solid` flag (plants don't block), and one-block auto step-up runs only after
  a horizontal collision with clear headroom.
- **`src/player/BlockPicker.ts`** — the ray skips the cell containing the eye,
  so targeting no longer returns a zero normal from inside water/leaves.
- **`src/utils/Random.ts`** — root-cause fix: `hash2`'s avalanche uses signed
  `Math.imul`, and the missing `>>> 0` on the final mix returned values in
  (−1, 1) — about 53% negative. Every `hash < chance` test therefore passed
  for half the world, which carpeted terrain with trees and grass. The hash
  now returns a true [0, 1) distribution, and a regression test asserts both
  the range and the uniformity.

## Tasks

- [x] Shader tile sampling (`voxelShader.ts`) wired into the three materials.
- [x] Mesher rewrite: merge key, corner AO, opaque-aware culling, sprites.
- [x] TerrainGenerator rewrite: shape, caps, sealed caves, trees, decoration.
- [x] New blocks/tiles: TallGrass, Flower, Snow (14-tile atlas).
- [x] SkyDome + fog/horizon matching; sun tuning.
- [x] Player: step-up, solid-flag collision, spawn-point search.
- [x] Raycast origin-cell skip.
- [x] HUD/CSS polish, allocation removal, DOM write dedup.
- [x] Unit tests: mesher suite, raycast origin, terrain surfaces, blocks.
- [x] Docs: spec deltas below + README refresh.

## Specification delta

- `rendering`: pixel ratio cap is now 1.5 (still ≤ 2); fog animates
  near 52–60 / far 118–134 and tracks the horizon; water uses polygon offset.
- `performance`: greedy runs are no longer capped by atlas cell — UVs come
  from the shader, so a merged quad can span the whole chunk.
- `registry`: the atlas paints 14 tiles (adds TallGrass, Flower, Snow); block
  set adds those three; `blocksMovement` is the collision predicate.
- `world-generation`: heightAt formula, surface caps (sand ≤ SEA_LEVEL+1,
  stone ≥ 40, snow ≥ 50), sealed caves (> 0.6, cliff-adjacent suppression),
  forest-clumped trees with slope requirement, decoration blocks.
- `lighting`: light intensities, sun sphere (r=8 at 360), sky dome and
  horizon-matched fog.
- `player-controller`: step-up; collision via the `solid` flag.
- `block-interaction`: raycast skips the origin cell.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint . --max-warnings 0` — clean.
- `npx vitest run` — 57/57 unit tests pass.
- `npx playwright test` — 23/23 pass, 1 correctly skipped (prod smoke on dev
  project). Covers both the dev server and the freshly built bundle, which
  boots with zero console errors.
- Screenshots (`docs/screenshot-fixed.png`, `docs/screenshot-overview.png`,
  `docs/atlas.png`): checkerboard gone, textures tile per block with crisp
  texels, gradient sky with clouds, sparse individual trees, working
  hotbar/HUD. A settled 169-chunk view renders ~47k triangles with 0 pending
  generation and 0 pending mesh work.

### Root-cause note

The `hash2` signedness bug was the reason the world looked like solid foliage
rather than terrain: with ~53% of samples negative, "2% of columns have a
tree" became "over 50% do". Fixing it dropped the settled triangle count from
~136k to ~47k and made trees read as individual objects.
