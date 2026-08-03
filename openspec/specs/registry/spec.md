# Capability: Registry

## Purpose
Define the block registry: the canonical set of block ids, their properties (`solid`, `opaque`, per-face textures), the procedural texture atlas that paints one tile per texture, the tile-to-block mapping, and the hotbar block list. The registry is the single vocabulary shared by terrain generation, the mesher, physics, the raycast, and the HUD — a block id anywhere in the pipeline must mean the same block everywhere (`src/blocks/Blocks.ts`, `src/blocks/TextureAtlas.ts`).

## Scope
In scope:
- The `Block` enum (10 ids) and the `Tex` enum (11 textures).
- The `BlockDef` interface and the `BLOCKS` record (`id/name/solid/opaque/breakable/textures`).
- The `HOTBAR` list (9 slots) and the `isSolid()` predicate.
- Per-face texture mapping, including special cases (grass top/`Dirt` bottom/`GrassSide` sides; `LogTop` top and bottom/`LogSide` sides).
- The procedural atlas layout: 16×16 tiles in 18 px cells on a 288×1080 canvas, seeding, sampling filters, and `drawTile` for HUD icons.
- The prompt-required block set (prompt.txt §13) and its satisfaction by the implemented registry.

Out of scope:
- Terrain composition and where each block is placed (see `world-generation` spec).
- Meshing, face culling, per-face brightness and UV insets (see `rendering`/`performance` specs; the mesher *consumes* the registry).
- Hotbar interaction, wheel/number-key selection (see `inventory` and `user-interface` specs).

## Functional Requirements

- **FR-REG-1** — The `Block` enum defines exactly ten ids in order: `Air = 0`, `Grass = 1`, `Dirt = 2`, `Stone = 3`, `Sand = 4`, `Water = 5`, `Bedrock = 6`, `Log = 7`, `Leaves = 8`, `Brick = 9`; `Air` is the zero byte that fills unset chunk storage (`src/blocks/Blocks.ts:1-12`).
- **FR-REG-2** — The `Tex` enum defines exactly eleven textures in order: `GrassTop = 0`, `GrassSide = 1`, `Dirt = 2`, `Stone = 3`, `Sand = 4`, `Water = 5`, `Bedrock = 6`, `LogSide = 7`, `LogTop = 8`, `Leaves = 9`, `Brick = 10` (`Blocks.ts:14-26`).
- **FR-REG-3** — `BlockDef` exposes `id: Block`, `name: string`, `solid: boolean` (blocks movement), `opaque: boolean` (fully occludes neighboring faces for culling), `breakable: boolean` (whether left-click can remove it), and `textures: readonly [Tex, Tex, Tex, Tex, Tex, Tex]` ordered top, bottom, +x, −x, +z, −z (`Blocks.ts:28-38`).
- **FR-REG-4** — `BLOCKS: Record<number, BlockDef>` registers exactly the nine placeable blocks; `Air` is implicit (its id reads as the empty byte and never appears in `BLOCKS`) (`Blocks.ts:44-66`).
- **FR-REG-4b** — exactly one registered block is unbreakable: `Bedrock` has `breakable: false`; all other registered blocks are `breakable: true` (`Blocks.ts:44-66`). `Game.breakBlock` skips unbreakable targets (`src/core/Game.ts:157-160`).
- **FR-REG-5** — Special per-face mappings: `Grass` = `[GrassTop, Dirt, GrassSide, GrassSide, GrassSide, GrassSide]` (green top, dirt bottom, grass-clad sides); `Log` = `[LogTop, LogTop, LogSide, LogSide, LogSide, LogSide]` (bark rings on top/bottom, striped bark on the sides); every other block uses one texture on all six faces (`Blocks.ts:44-62`).
- **FR-REG-6** — `solid`/`opaque` matrix: `Water` is `solid: false, opaque: false`; `Leaves` is `solid: true, opaque: false` (movement-blocking but not face-occluding, so leaves faces render against each other); all other placeable blocks are `solid: true, opaque: true` (`Blocks.ts:44-64`).
- **FR-REG-7** — `isSolid(id)` returns `id !== Air && id !== Water` as the canonical movement-blocking predicate (`Blocks.ts:79-81`).
- **FR-REG-8** — `HOTBAR` is exactly the nine placeable blocks in slot order `Grass, Dirt, Stone, Sand, Log, Leaves, Water, Bedrock, Brick` (`Blocks.ts:67-77`).
- **FR-REG-9** — The atlas paints exactly eleven 16×16 tiles into 18 px cells (`ATLAS_TILE 16`, `ATLAS_CELL 18`, `ATLAS_PAD 1`) on a `16×60`-cell canvas of `ATLAS_W 288 × ATLAS_H 1080`; tile `t` is painted at cell `(t % 16, ⌊t/16⌋)` (`src/blocks/TextureAtlas.ts:13-21, 32-39, 51-53`).
- **FR-REG-10** — Tile index `n` of the `Tex` enum paints texture `n` to the atlas cell `n` (`paintTile` switch, `TextureAtlas.ts:105-189`); the resulting `THREE.CanvasTexture` uses `NearestFilter` for min and mag, `ClampToEdgeWrapping`, no mipmaps, and `SRGBColorSpace` (`TextureAtlas.ts:40-47`).
- **FR-REG-11** — Every texture is drawn procedurally by a seeded painter (`mulberry32(seed * 7919 + 1337)` or a fixed per-tile seed); no PNGs, downloads, or third-party texture files exist anywhere (`TextureAtlas.ts:68-75`; prompt.txt §13 — no copyrighted/proprietary Minecraft textures).
- **FR-REG-12** — `drawTile(ctx, tile, x, y, size)` copies a tile from the atlas onto the HUD icon canvases with `imageSmoothingEnabled = false` (`TextureAtlas.ts:55-59`); the HUD picks a representative texture per hotbar block (`GrassTop` for Grass, `LogSide` for Log, else `textures[0]`, `src/ui/HUD.ts:4-13`).
- **FR-REG-13** — The prompt-required block set (prompt.txt §13: Air, Grass, Dirt, Stone, Sand, Water, Bedrock, Wood/Log, Leaves) is fully satisfied; `Brick` is an extra block beyond the required set (`Blocks.ts:43-65` vs. prompt.txt §13).

## Non-functional Requirements

- **NR-REG-1** — One block id space: ids 0–9 are the only allowed values in chunk storage; `Uint8Array` storage makes ids fixed-width, valid, and stable (`Blocks.ts:1-12`; `src/world/Chunk.ts:16`).
- **NR-REG-2** — Single-sourcing: the HUD hotbar labels and icons read from `BLOCKS[b].name`/`Tex` only, never from a parallel copy (`HUD.ts:52`).
- **NR-REG-3** — `opaque: false` is the only enumeration of face-emitting blocks; the mesher must never hard-code block-specific culling (see `rendering` spec FR-R).
- **NR-REG-4** — The atlas is built once at boot and shared by all materials/meshes; it is never re-painted at runtime.
- **NR-REG-5** — Texture independence: artists can change a tile's pixels without touching any block logic, and block face mappings can change without touching the painters (registry ↔ atlas are decoupled through the `Tex` enum).

## Inputs and Outputs

Inputs:
- None at runtime (the atlas is generated; no external assets are read).
- At boot: `document.createElement("canvas")` for the atlas (a 2D-capable canvas is required).

Outputs:
- `Block`, `Tex`, `BlockDef`, `BLOCKS`, `HOTBAR`, `isSolid` exports from `src/blocks/Blocks.ts`.
- `TextureAtlas` instance with `.canvas`, `.texture` (`THREE.CanvasTexture`), `cell(tile)`, `drawTile(ctx, tile, x, y, size)` from `src/blocks/TextureAtlas.ts`.
- The nine hotbar slot icon canvases (40×40) painted by `HUD.attachAtlas` (`src/ui/HUD.ts:60-66`).

## Core Data Structures
- `enum Block` (`Blocks.ts:1-12`): 10 ids, the storage contract for chunk bytes.
- `enum Tex` (`Blocks.ts:14-26`): 11 atlas tile indices.
- `interface BlockDef` (`Blocks.ts:28-38`): `{ id; name; solid; opaque; breakable; textures: readonly [Tex×6] }`.
- `const BLOCKS: Record<number, BlockDef>` (`Blocks.ts:44-66`): 9 entries keyed by `Block` id.
- `const HOTBAR: readonly Block[]` (`Blocks.ts:67-77`): 9 entries.
- Atlas constants (`TextureAtlas.ts:13-21`): `ATLAS_TILE 16`, `ATLAS_CELL 18`, `ATLAS_PAD 1`, `ATLAS_COLS 16`, `ATLAS_ROWS 60`, `ATLAS_W 288`, `ATLAS_H 1080`, `PX_U`, `PX_V`.
- Tile painters (`TextureAtlas.ts:105-189`): one function/path per texture id (grass top, grass side, dirt, stone, sand, water, bedrock, log side, log top, leaves, brick).

## Dependencies
- `src/blocks/Blocks.ts` — no imports (pure vocabulary; the base layer for all consumers).
- `src/blocks/TextureAtlas.ts` → `three` (`CanvasTexture`), `src/utils/Random.ts` (`mulberry32`).
- Consumers (import direction only): `src/world/Mesher.ts`, `src/world/TerrainGenerator.ts`, `src/world/Chunk.ts`, `src/player/PlayerController.ts`, `src/player/BlockPicker.ts`, `src/core/Game.ts`, `src/ui/HUD.ts` (see `openspec/architecture.md` §2).

## Error and Edge-Case Behavior
- **Missing 2D context**: `TextureAtlas.build` throws `"2D canvas context unavailable — cannot build texture atlas."` when `getContext("2d")` returns `null` (`TextureAtlas.ts:33-34`); the error propagates to `main.ts`'s `#fatal` path.
- **Unknown block id**: `BLOCKS` has no `Air` entry and no sentinel entry; consumers treat id `0` as empty and never look up `BLOCKS[0]` (verified: mesher and physics branch on `Air`/`Water` explicitly).
- **`isSolid` edge case**: `Water` and `Air` are the only non-solid ids — `isSolid(5) === false`, `isSolid(0) === false` (`Blocks.ts:79-81`).
- **Out-of-range tile drawing**: `drawTile` clamps nothing; callers only pass the 9 hotbar `Tex` values (`HUD.ts:4-13, 64`), all inside the 16-cell row.

## Performance Expectations
- Atlas build is one-time at boot: 11 × 16×16 pixel paints; negligible (< 1 ms).
- The atlas is a single texture; all 169 chunk meshes sample it through three shared materials (no per-block or per-chunk textures).
- Tile-to-cell math is constant-time (`t % 16`, `⌊t/16⌋`); the HUD redraws icons only once at `attachAtlas`.

## Acceptance Criteria
- **AC-REG-1** — `Block` has exactly the ten ids `Air=0 … Brick=9` and `BLOCKS` registers the nine placeable blocks, each with `id`, `name`, `solid`, `opaque`, `breakable` and a 6-tuple `textures` ordered top/bottom/±x/±z.
- **AC-REG-2** — `opaque: false` applies to exactly `Water` and `Leaves`; all other placeable blocks are `opaque: true`, and the mesher skips faces against opaque neighbors (see `rendering` spec).
- **AC-REG-2b** — `breakable: false` applies to exactly `Bedrock`; all other registered blocks are `breakable: true`, and `Game.breakBlock` leaves unbreakable targets intact.
- **AC-REG-3** — The atlas paints exactly 11 procedural 16×16 tiles in 18 px cells on the 288×1080 canvas (`ATLAS_COLS × ATLAS_ROWS`), sampled with `NearestFilter`/`ClampToEdge` and no mipmaps; `drawTile` renders icon tiles for the HUD.
- **AC-REG-4** — `isSolid(id)` returns `true` for every block except `Air` and `Water`.
- **AC-REG-5** — Per-face texture mapping renders correctly in-game: grass has a green top, dirt bottom and grass-clad sides; logs have bark rings on top/bottom and striped bark on the sides.
- **AC-REG-6** — The prompt-required block set (§13) is present and functional: Air, Grass, Dirt, Stone, Sand, Water, Bedrock, Log, Leaves (Brick is extra).

## Verification Method
- **AC-REG-1 / AC-REG-4**: Unit — read `Block`/`BLOCKS`/`isSolid` directly from `src/blocks/Blocks.ts` in a node test (covered by `tests/unit/Hotbar.test.ts`: 9 distinct registered entries, 6-tuple textures, `def.id === id`).
- **AC-REG-2**: Code inspection — compare the `opaque` flags (`Blocks.ts:44-66`) against the mesher's expose rule (`src/world/Mesher.ts:122-123`); E2E — observe culled faces only against opaque neighbors.
- **AC-REG-2b**: Unit — `tests/unit/Blocks.test.ts` asserts `breakable === false` for exactly `Bedrock` and `true` for every other registered block; E2E/browser — real left-click breaks ground blocks but leaves bedrock intact (verified 2026-08-03).
- **AC-REG-3 / AC-REG-5**: E2E — boot the game, confirm atlas `canvas.width/height` are 288/1080 with 11 non-empty cells, and observe the grass/log face pixels in a live world; HUD icons via the 9 hotbar slots.
- **AC-REG-6**: Unit/structural — enumerate `prompt.txt §13`'s list and assert each is a key of `BLOCKS` (or the implicit Air).
