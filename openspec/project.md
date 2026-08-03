# TryMC — Project Overview

TryMC is a browser-based voxel sandbox ("clone-MC" style) written in TypeScript on top of Three.js. It streams a procedurally generated block world around a first-person player, lets the player break and place blocks from a 9-slot hotbar, and renders everything through a shared-texture greedy mesher with a day/night lighting cycle. There is no server and no asset pipeline: terrain, block textures and trees are all generated procedurally at runtime from a numeric seed.

> **Status baseline.** This document describes the *implemented* behavior at the time of writing, verified by code inspection on 2026-08-03, with `npm run typecheck`, `npm run lint` and `npm run build` green and both dev servers (5173 / 5174) serving the app. Anything not yet independently verified (automated tests, fresh end-to-end browser pass) is explicitly marked as pending in [verification-matrix.md](./verification-matrix.md).

## Purpose

- A self-contained block game that runs entirely in the browser.
- Demonstrate the full core loop of a voxel game: chunk streaming, greedy meshing, deterministic seeded terrain, first-person physics, and block interaction — without external assets or a backend.
- Keep the world deterministic per seed so results are reproducible (`?seed=<n>` URL parameter, default `1337`).

## Tech stack

| Piece | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.6, strict mode | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` in `tsconfig.json` |
| Bundler / dev server | Vite 6.4.3 | `base: "./"`, build target `es2020`; dev server configured on port 5173 |
| 3D engine | Three.js 0.170.0 (`@types/three` 0.170.0) | `WebGLRenderer`, `PerspectiveCamera`, `MeshLambertMaterial`, `CanvasTexture` |
| Procedural pixels | Canvas 2D | 16×16 block tiles painted with `putImageData` into a tall atlas canvas |
| Tests | Vitest 3.2.7 + Playwright 1.62 | Unit suite `tests/unit/` (10 files / 51 tests, node env) and Playwright browser suite `tests/e2e/` (24 runs across dev+prod, 23 pass + 1 skip-by-design). Verified green 2026-08-03 (`npm test` exit 0; `npm run test:e2e` exit 0) |
| Linting | ESLint 9 flat config + typescript-eslint | `eslint .` (js + ts recommended rule sets) |
| Architecture | Vanilla TS classes + DOM | No framework, no global state library |

## Feature inventory (implemented)

- **Procedural terrain** — seeded 2D/3D simplex-noise heightmap (fbm octaves), oceans at `y ≤ SEA_LEVEL` (22), beaches of sand, grass/dirt/stone layers, bedrock floor at `y = 0`, 3D-noise caves.
- **Deterministic trees** — ~2 % of suitable columns (`hash2 < 0.02`), trunks 4–6 tall, layered canopies, canopies from trees rooted up to 2 cells outside a chunk overhang onto its border.
- **Blocks & textures** — 10 block ids (Air + 9 placeable), 11 procedural textures, per-face texture mapping, per-face baked brightness.
- **Streaming chunk grid** — distance-ordered loading within `VIEW_RADIUS` (6) of the player chunk, per-frame time budgets (6 ms generation + 6 ms mesh rebuilds), dirty-set rebuilds, unloading beyond `VIEW_RADIUS + 2` once per simulated second.
- **Greedy voxel mesher** — merges runs of identical faces into single quads, three render passes (solid / cutout / water), 1 px UV inset against bleeding, spans capped at the atlas cell (16×60 tiles).
- **First-person player** — pointer-lock mouse look (pitch clamped ±1.55 rad), WASD + sprint + jump, gravity, water buoyancy/swim, AABB collision (half-width 0.3, height 1.8), head bob, sprint FOV kick to 82.
- **Block interaction** — Amanatides-Woo voxel DDA raycast with `MAX_REACH` 6 returning the block + face normal; left-click break, right-click place with world-bounds and player-overlap guard; black selection box on the targeted block.
- **Day/night cycle** — sun orbits over 240 s; sky/fog colors and sun/hemisphere/ambient intensities lerped between night, dawn and day; sun disc mesh visible by day; toggled with `N`.
- **DOM HUD** — FPS, player XYZ, loaded-chunk count, cycle state, F3 debug overlay (pending gen/mesh, edited cells, triangles), loading screen with progress bar, click-to-play overlay, fatal-error overlay.
- **In-session edit persistence** — every break/place is recorded as an absolute per-cell edit overlay per chunk; re-applied when a chunk regenerates after unload, so edits survive within the session. No cross-session storage (in-memory only).

## How to play

1. Open the app (dev server or built `dist/`). Click the canvas to capture the mouse (pointer lock).
2. Move with `WASD`, jump with `Space`, sprint with `Shift`.
3. Aim with the mouse; the black box marks the targeted block.
4. `Left click` breaks the targeted block; `Right click` places the currently selected block against the targeted face.
5. Select hotbar blocks with keys `1–9` or the scroll wheel (wraps around).
6. `N` toggles the day/night cycle; `F3` toggles the debug overlay.
7. Start a different world with a query parameter: `?seed=<n>` (default 1337).

### Commands

| Command | Meaning |
|---|---|
| `npm run dev` | Start the Vite dev server (port 5173) |
| `npm run typecheck` | `tsc --noEmit` — strict type check |
| `npm run lint` | ESLint over the repo |
| `npm test` | Vitest run — executes `tests/unit/*.test.ts`; verified green 2026-08-03 (10 files / 51 tests, exit 0) |
| `npm run build` | `tsc && vite build` — production bundle into `dist/` |

## Module map (`src/`)

| Module | Path | Responsibility |
|---|---|---|
| Bootstrap | `src/main.ts` | Validates the 12 required DOM ids, builds `HUD` + `Game`, starts the loop, exposes `window.__mc` test hook, renders fatal startup errors into `#fatal` |
| Game | `src/core/Game.ts` | Composition root: owns renderer, chunk manager, player, HUD; frame loop; input bindings; block break/place; spawn; selection box |
| Constants | `src/Constants.ts` | All tuning constants (chunk size, heights, speeds, gravity, reach, seeds, cycle duration) |
| Blocks registry | `src/blocks/Blocks.ts` | `Block` enum (Air…Brick), `BlockDef` registry with per-face textures, `HOTBAR`, `isSolid()` |
| Texture atlas | `src/blocks/TextureAtlas.ts` | Procedural 11-tile canvas atlas (16×16 tiles in 18 px cells on a 288×1080 canvas), `NearestFilter`, `drawTile()` for HUD icons |
| Chunk | `src/world/Chunk.ts` | Per-chunk voxel storage (`Uint8Array` 16×64×16), get/set/index, `applyEdits()`, owns 3 meshes at world offset `(cx·16, 0, cz·16)`, dispose |
| Chunk manager | `src/world/ChunkManager.ts` | Streaming grid: distance-ordered queue, 6 ms gen + 6 ms rebuild budgets, dirty set, unload, `edits` overlay, `getBlockWorld`/`setBlockWorld`, `stats()` |
| Mesher | `src/world/Mesher.ts` | Greedy voxel mesher: 6 face directions, per-face brightness, 3 passes, UV insets, atlas span caps |
| Terrain generator | `src/world/TerrainGenerator.ts` | Seeded heightmap + caves + trees; pure functions of world coordinates; cross-chunk tree overhang scan |
| Player controller | `src/player/PlayerController.ts` | Pointer-lock mouse look, WASD/sprint/jump, gravity, water physics, axis-separated AABB collision, head bob, FOV kick, camera sync |
| Block picker | `src/player/BlockPicker.ts` | Amanatides-Woo voxel DDA `raycastBlocks()` → `{x,y,z,nx,ny,nz}` |
| Renderer | `src/render/WorldRenderer.ts` | `WebGLRenderer` (antialias, pixel ratio ≤ 2), camera, lights, sun mesh, sky/fog, 3 shared materials, day/night update, resize |
| HUD | `src/ui/HUD.ts` | DOM HUD: FPS/pos/chunks/cycle/debug text, 9-slot hotbar with 40 px icons, loading bar, click-to-play, lock state |
| Utils | `src/utils/` (Random, Noise, MathUtils) | `mulberry32`, `hash2`, seeded `SimplexNoise` (2D/3D + fbm), `clamp`/`lerp`/`smoothstep`/`wrapIndex` |
| Entry markup | `index.html`, `src/style.css` | DOM skeleton (canvas, crosshair, HUD, hotbar, overlays) and all visual styling |

## Repository layout (top level)

- `src/` — game source as mapped above.
- `index.html` — single-page entry markup.
- `package.json`, `package-lock.json` — dependencies and scripts.
- `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts` — tooling.
- `openspec/` — this specification set (`project.md`, `architecture.md`, `acceptance-criteria.md`, `verification-matrix.md`, plus `specs/` and `changes/` working directories).
- `dist/` — build output (regenerated by `npm run build`; do not edit by hand).

## Specification files

| File | Content |
|---|---|
| [architecture.md](./architecture.md) | Layered design, module dependency graph, data flows, chunk lifecycle state machine, edit persistence, render pipeline, determinism guarantees |
| [acceptance-criteria.md](./acceptance-criteria.md) | Numbered, testable acceptance criteria per capability (ID | Criterion | Verification) |
| [verification-matrix.md](./verification-matrix.md) | Traceability: every requirement ID → spec reference → implementation reference → verification method → status → evidence |
| `openspec/specs/<cap>/spec.md` | Per-capability spec files. All fifteen exist as of 2026-08-03: rendering, world-generation, chunk-streaming, player-controller, block-interaction, inventory, lighting, user-interface, performance, registry, persistence, error-handling, testing, code-quality, documentation |

The spec set is generated/synced per the rules in `openspec/config.yaml` (schema: `spec-driven`).
