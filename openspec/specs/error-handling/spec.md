# Capability: Error Handling

## Purpose
Define how TryMC fails — and fails gracefully. The boot path must detect a broken DOM or an unavailable WebGL/2D context before the game starts and surface a readable diagnostic; the runtime world-access path must never throw on out-of-range or unloaded input but instead degrade to safe values; and the physics loop must contain a safety net for unrecoverable player positions. This spec covers the `main.ts` boot/catch path (`#fatal` overlay with alert fallback), the atlas context guard, the world-access guards, the raycast bounds, and the player fall-through recovery.

## Scope
In scope:
- Required-DOM validation (`REQUIRED_IDS`, `getRequired`) and the boot sequence in `src/main.ts`.
- The top-level `try/catch` that renders init failures into `#fatal` (with `alert()` fallback).
- The texture-atlas 2D-context guard in `TextureAtlas.build`.
- Graceful world access: out-of-world `y` and unloaded chunks in `getBlockWorld`/`setBlockWorld`.
- The raycast termination bounds (512 steps, `maxDist`).
- The player fall-through safety net (`y < −16`).

Out of scope:
- WebGL context-lost handling mid-game and GPU error recovery (none exists; see Performance/known limitations).
- Graceful degradation of missing non-critical assets (there are no external assets, so there is nothing to degrade).
- Restart/reload flows, save/restore of error state, or telemetry.

## Functional Requirements

- **FR-ERR-1** — `REQUIRED_IDS` lists exactly the twelve DOM ids the game needs: `game`, `fps`, `pos`, `chunks`, `cycle`, `clickToPlay`, `loading`, `loadbarfill`, `loadtext`, `hotbar`, `debug`, `fatal` (`src/main.ts:6-19`).
- **FR-ERR-2** — `getRequired(id)` throws `Error('Required DOM element "#<id>" is missing.')` when `document.getElementById(id)` returns `null` (`main.ts:21-25`).
- **FR-ERR-3** — `boot()` validates every required id before constructing anything (HUD/Game/renderer), so a missing element fails fast with no partial initialization (`main.ts:27-31`).
- **FR-ERR-4** — The whole init sequence runs inside `try { boot() } catch (err)` (`main.ts:39-59`); any failure — missing DOM id, WebGL unavailable, atlas failure, or a constructor throw — reaches the handler.
- **FR-ERR-5** — The catch handler logs `console.error("[trymc] failed to initialize:", err)`, extracts a message (`err.message` for `Error`, `String(err)` otherwise), and renders `Failed to initialize TryMC:\n<message>` into the `#fatal` overlay, hiding the `#clickToPlay` and `#loading` overlays at the same time (`main.ts:41-55`).
- **FR-ERR-6** — If `#fatal` itself is missing, the handler falls back to `alert('Failed to initialize TryMC:\n<message>')` instead of dying silently (`main.ts:56-58`).
- **FR-ERR-7** — `TextureAtlas.build` throws `"2D canvas context unavailable — cannot build texture atlas."` when `canvas.getContext("2d")` returns `null`, before any painting begins (`src/blocks/TextureAtlas.ts:33-34`).
- **FR-ERR-8** — `getBlockWorld(x, y, z)` returns `Block.Air` for `y < 0 || y >= CHUNK_HEIGHT` and for unloaded chunk coordinates, never throwing (`src/world/ChunkManager.ts:71-78`); this is the single lookup used by the mesher, physics and raycast, so neighbor queries of not-yet-loaded chunks degrade to Air.
- **FR-ERR-9** — `setBlockWorld(x, y, z, id)` returns `false` (and records nothing) for out-of-world `y` and for unloaded chunks instead of throwing or allocating (`ChunkManager.ts:80-87`).
- **FR-ERR-10** — `Game.placeBlock` additionally refuses to place at `by < 0 || by >= CHUNK_HEIGHT` before calling `setBlockWorld`, so the interaction layer guards the height bounds itself (`src/core/Game.ts:175`).
- **FR-ERR-11** — The voxel raycast is bounded: it iterates at most 512 steps and returns `null` once `t > maxDist`, so it terminates even when the origin is inside solid geometry or the direction is degenerate (`src/player/BlockPicker.ts:49, 75`; verified by `tests/unit/BlockPicker.test.ts` "terminates on a degenerate zero-length direction").
- **FR-ERR-12** — If the player ever falls out of the world (`pos.y < −16`), position and velocity are reset to `(0, 60, 0)` and zero — a fall-through safety net inside `PlayerController.update` (`src/player/PlayerController.ts:87-91`).
- **FR-ERR-13** — Pointer-lock affordances are null-safe: the optional `#clickToPlay` overlay lookup in `Game.bindEvents` is guarded with `if (lockOverlay)`, so its absence cannot crash boot (`Game.ts:132-137`).

## Non-functional Requirements

- **NR-ERR-1** — Fail-fast at boot: the game never starts partially (no renderer without valid DOM, no HUD without elements).
- **NR-ERR-2** — User-visible diagnostics instead of silent crashes: every init failure produces a readable message in the DOM (or an alert); browser console also receives the error.
- **NR-ERR-3** — No exception escapes the runtime world-access path: `getBlockWorld`/`setBlockWorld` are total for all integer inputs (`ChunkManager.ts:71-87`).
- **NR-ERR-4** — Deterministic and bounded raycast: the 512-step and `maxDist` caps make worst-case cost linear and the loop always terminates.

## Inputs and Outputs

Inputs:
- `document` DOM state at boot (must supply the 12 required ids).
- `HTMLCanvasElement#game` (WebGL target) and the atlas's 2D canvas context.
- Any `(x, y, z)` triple passed to `getBlockWorld`/`setBlockWorld`, including negative and out-of-world values.
- Ray origin/direction and `maxDist` into `raycastBlocks`.

Outputs:
- `Error` objects with descriptive messages from `getRequired`, `TextureAtlas.build`, and the `WorldRenderer` constructor.
- DOM state on failure: `#fatal` visible, `#clickToPlay`/`#loading` hidden, a `<pre>` with the message (or a native `alert`).
- Safe sentinel values: `Block.Air` for failed reads, `false` for refused writes, `null` for an unbounded raycast, a respawned player for `y < −16`.

## Core Data Structures
- `REQUIRED_IDS: string[]` (12 entries, `main.ts:6-19`).
- `getRequired(id: string): HTMLElement` (`main.ts:21-25`).
- `boot(): void` + the module-level `try/catch` (`main.ts:27-59`).
- World-access guards: `getBlockWorld` (`ChunkManager.ts:71-78`), `setBlockWorld` (`ChunkManager.ts:80-104`).
- The player safety net constants: `y < −16` trigger and `pos.set(0, 60, 0)` reset (`PlayerController.ts:87-91`).

## Dependencies
- `src/main.ts` → `src/core/Game.ts`, `src/ui/HUD.ts`, `src/style.css`.
- `src/world/ChunkManager.ts` → `src/world/Chunk.ts`, `src/world/TerrainGenerator.ts`, `src/blocks/Blocks.ts` (`Block.Air`), `src/Constants.ts`.
- `src/blocks/TextureAtlas.ts` → `three`, `src/utils/Random.ts`.
- `src/player/BlockPicker.ts` → `src/blocks/Blocks.ts`.
- `src/core/Game.ts` → `src/player/BlockPicker.ts` (raycast bounds), `src/world/ChunkManager.ts`.

## Error and Edge-Case Behavior
- **Missing DOM id**: `getRequired` throws; `boot` aborts before any construction; catch shows `#fatal` with `Required DOM element "#<id>" is missing.` (`main.ts:23, 41-55`).
- **WebGL unavailable**: `new THREE.WebGLRenderer(canvas)` throws; it propagates through the `Game` constructor to the catch handler, which surfaces it in `#fatal` (see `rendering` spec, Error section).
- **2D context unavailable**: atlas build throws the dedicated message before painting (`TextureAtlas.ts:33-34`).
- **Reads outside the world**: `getBlockWorld(0, -1, 0)` and `getBlockWorld(0, 64, 0)` return Air; reads on unloaded chunks return Air (`ChunkManager.ts:71-78`).
- **Writes outside the world / unloaded**: `setBlockWorld` returns `false`; no crash, no edit recorded (`ChunkManager.ts:80-87`). Boundary placement is also pre-checked in `Game.placeBlock` (`Game.ts:175`).
- **Raycast edge cases**: origin inside solid geometry, zero-length direction, and empty space all terminate (`BlockPicker.ts:49, 75`; unit-tested).
- **Player out of bounds**: `y < −16` respawns at `(0, 60, 0)` with zero velocity (`PlayerController.ts:87-91`); this is a hard guarantee independent of terrain.
- **Missing optional elements**: `#clickToPlay` absence does not crash `bindEvents` (`Game.ts:132-137`); `#fatal` absence switches to `alert` (`main.ts:56-58`).

## Performance Expectations
- Boot failure paths run at most once and only on failure: O(12) DOM lookups to validate, then one overlay render — irrelevant to frame cost.
- Guards are constant-time: two comparisons plus a map lookup on every `getBlockWorld`/`setBlockWorld`; no measurable cost per frame.
- The raycast caps bound worst-case cost at 512 lookups (each a guarded world read) — see `block-interaction`/`performance` specs.
- The safety net only triggers on a pathological state and costs nothing in the happy path (a single float compare per frame).

## Acceptance Criteria
- **AC-ERR-1** — Boot throws a descriptive `Error` (`Required DOM element "#<id>" is missing.`) for any of the 12 required ids that is absent.
- **AC-ERR-2** — Any boot/init failure is caught and rendered into the `#fatal` overlay, which hides the `#clickToPlay` and `#loading` overlays; if `#fatal` is absent, an `alert` is used instead.
- **AC-ERR-3** — Atlas construction fails with a clear message when a 2D canvas context is unavailable.
- **AC-ERR-4** — The raycast terminates safely after at most 512 voxel steps or once past `maxDist`, never hanging even when the origin is inside solid geometry.
- **AC-ERR-5** — Out-of-world/out-of-bounds world access is graceful: `getBlockWorld` returns Air for `y` outside `[0, 64)` and for unloaded chunks; `setBlockWorld` refuses such writes and returns `false`; boundary placement is refused above/below the world.
- **AC-ERR-6** — If the player ever falls out of the world (`y < −16`), position and velocity are reset to a safe location.

## Verification Method
- **AC-ERR-1 / AC-ERR-2**: E2E — remove/rename an element (or block WebGL) in the page, reload, and assert `#fatal` becomes visible with the message and `#clickToPlay`/`#loading` are hidden; DOM-inspect the missing-id message text. Alert fallback: assert via page dialog listener when `#fatal` is absent.
- **AC-ERR-3**: Unit — stub `getContext` to return `null` and assert `TextureAtlas.build()` throws the exact message; E2E — block 2D context and confirm `#fatal` shows it.
- **AC-ERR-4**: Unit — `tests/unit/BlockPicker.test.ts` ("terminates on a degenerate zero-length direction", "terminates when shooting into empty space", "hits nothing beyond MAX_REACH").
- **AC-ERR-5**: Unit — `tests/unit/ChunkManager.test.ts` ("treats y outside [0, CHUNK_HEIGHT) as empty and unwritable", "setBlockWorld on an unloaded chunk returns false without throwing"); E2E — placement at world top/bottom is refused (`Game.ts:175`).
- **AC-ERR-6**: Unit — drive `PlayerController.update` with `pos.y` below −16 and assert the reset position/velocity (no dedicated test yet — candidate for `tests/unit/PlayerController.test.ts`); Browser (manual) — fall off the world, confirm respawn.