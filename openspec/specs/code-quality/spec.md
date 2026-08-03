# Capability: Code Quality

## Purpose
Define the mechanical and structural quality gates of TryMC's codebase: the strict TypeScript configuration, the ESLint 9 flat-config rulebed, the layered module architecture with no runtime import cycles, the separation of pure deterministic logic from stateful systems, the policy on explicit `any` and dead code, and the procedural-assets rule (no third-party textures). Together these keep the codebase navigable, deterministic, and free of silent type gaps.

## Scope
In scope:
- `tsconfig.json` compiler options applied to `src/` and `tests/`.
- `eslint.config.js` (flat config: ignores, js+ts recommended rules, TS overrides).
- Module layering and the dependency graph (`openspec/architecture.md` §2).
- The `no intentional any` rule and the `unknown`-bridge casting convention.
- Dead-code policy and the currently documented candidates.
- Centralized tuning constants in `src/Constants.ts`.
- The procedural-assets rule from the project prompt (§13): no copyrighted/proprietary or third-party textures.

Out of scope:
- Runtime behavior, rendering, and gameplay rules (see the other capability specs).
- Test-coverage thresholds (configured in `vitest.config.ts` but not enforced — see `testing` spec).
- Formatting/linting of JSON, HTML, or CSS (ESLint covers `js`/`ts` only).

## Functional Requirements

- **FR-QUAL-1** — `tsconfig.json` enables `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, and `noFallthroughCasesInSwitch: true`, with `target: "ES2020"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `isolatedModules`, `noEmit`, `esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames`, and `useDefineForClassFields` (`tsconfig.json:3-16`).
- **FR-QUAL-2** — The compiler project includes `src`, `tests`, `vite.config.ts`, `vitest.config.ts`, and `eslint.config.js`; `node_modules` and `dist` are excluded (`tsconfig.json:18-19`).
- **FR-QUAL-3** — `npm run typecheck` runs `tsc --noEmit` with that strict set and must exit 0 (`package.json` `typecheck` script).
- **FR-QUAL-4** — `eslint.config.js` uses the ESLint 9 flat-config API (`tseslint.config(...)`) and joins `js.configs.recommended` plus `tseslint.configs.recommended`; the built-in ignore list is exactly `["dist/**", "node_modules/**", "coverage/**", ".vite/**"]` (`eslint.config.js:4-7`). Generated test artifacts (`test-results/`, `playwright-report/`) hold no lintable TS/JS sources and are excluded from the repository via `.gitignore`.
- **FR-QUAL-5** — For TypeScript files, the config sets `ecmaVersion: 2022`, `sourceType: "module"`, and `@typescript-eslint/no-unused-vars` to `error` with `argsIgnorePattern: "^_"` and `varsIgnorePattern: "^_"` so intentional underscores are allowed (`eslint.config.js:8-17`).
- **FR-QUAL-6** — `npm run lint` runs `eslint .` over the whole project and must exit 0 (`package.json` `lint` script).
- **FR-QUAL-7** — No intentional `any` exists in `src/`; grep for `any` annotations returns nothing. Type-bridging uses `unknown` casts only — e.g. `(window as unknown as { __mc: Game }).__mc` (`src/main.ts:36`) — so no capability is smuggled in as `any`.
- **FR-QUAL-8** — Modules are layered by concern with imports flowing bottom-up only: layer 0 `utils/` (no imports) → layer 1 `blocks/` + `Constants.ts` (no imports) → layer 2 `TextureAtlas`, `Mesher`, `TerrainGenerator` → layer 3 stateful systems (`Chunk`, `ChunkManager`, `BlockPicker`, `PlayerController`, `WorldRenderer`, `HUD`) → layer 4 `core/Game.ts` → layer 5 `main.ts` (see `openspec/architecture.md` §2).
- **FR-QUAL-9** — There are no runtime circular imports; the only back-edge is `world/Mesher.ts → world/Chunk.ts` which is type-only (`import type { Chunk }`), erased at runtime (`architecture.md` §2 caveats).
- **FR-QUAL-10** — Pure deterministic logic is separated from stateful systems: `utils/Noise.ts`, `utils/Random.ts`, `utils/MathUtils.ts`, `blocks/Blocks.ts`, `world/TerrainGenerator.ts`, and `player/BlockPicker.ts` hold no mutable world state and no DOM/WebGL dependency; all mutable state lives in `ChunkManager`, `Chunk`, `PlayerController`, `WorldRenderer`, and the DOM HUD (`architecture.md` §2 table).
- **FR-QUAL-11** — All tuning constants are centralized in `src/Constants.ts` (exactly 16: `CHUNK_SIZE`, `CHUNK_HEIGHT`, `SEA_LEVEL`, `VIEW_RADIUS`, `MAX_REACH`, `GRAVITY`, `JUMP_SPEED`, `WALK_SPEED`, `SPRINT_SPEED`, `PLAYER_HALF_WIDTH`, `PLAYER_HEIGHT`, `EYE_HEIGHT`, `TREE_SEED`, `DAY_CYCLE_SECONDS`, …) and referenced by import across `core`, `world`, `player`, and `render`; the two deviation values are intentional locational constants (`CHUNK_TOP = 60` in the player safety net, `INITIAL_TARGET = 25` in `Game`) documented at their definition sites (`src/Constants.ts`; `src/player/PlayerController.ts:163`; `src/core/Game.ts:13`).
- **FR-QUAL-12** — Dead code is not deliberately shipped: the compiler/linter flags unused locals/parameters (FR-QUAL-1, FR-QUAL-5). Two legacy candidates are documented in the docs rather than silently kept: `isSolid()` (`src/blocks/Blocks.ts:79-81`) is currently exported with no caller (players inline the `Air`/`Water` check), and `Chunk.hasData` (`src/world/Chunk.ts:17`) is unused — both are noted as cleanup candidates in `verification-matrix.md` / `architecture.md` and must be removed or adopted when touched.
- **FR-QUAL-13** — All texture assets are procedural and original: every atlas tile is painted at runtime by a seeded painter (`TextureAtlas.ts:68-189`); there are no PNG/image assets, no network asset loads, and no third-party or copyrighted (Minecraft-style) textures anywhere (`prompt.txt §13` asset requirement).

## Non-functional Requirements

- **NR-QUAL-1** — Type-safe by construction: `strict`, `isolatedModules`, and the `noUnused*`/`noFallthrough` flags make entire classes of bugs compile-time errors.
- **NR-QUAL-2** — Determinism-by-convention: pure modules never touch `Date`, `Math.random`, DOM, or WebGL, so seeded behavior is reproducible (enforced by architecture, verified by the `testing` spec's determinism suites).
- **NR-QUAL-3** — Layer discipline means a new feature touches at most one stateful layer plus its vocabulary; cross-layer imports are visible in the documented graph and reviewed against `architecture.md` §2.
- **NR-QUAL-4** — Zero-warning gates: `typecheck` and `lint` are part of the CI-able check set (`testing` spec AC-TEST-3) and must stay exit-0 on every change.
- **NR-QUAL-5** — Constant tuning without recompiles of consumers: values live in one file; a gameplay tweak touches `Constants.ts` only (except the two documented locational constants).

## Inputs and Outputs

Inputs:
- `tsconfig.json`, `eslint.config.js`, `src/**/*.ts`, `tests/**/*.ts` (+ `vite.config.ts`, `vitest.config.ts`).
- `package.json` scripts `typecheck` / `lint` / `build`.

Outputs:
- `tsc --noEmit` exit status and diagnostics.
- `eslint .` exit status and diagnostics.
- The documented dependency graph and layer table (`openspec/architecture.md` §2) as the ground truth for module boundaries.

## Core Data Structures
- `tsconfig.json` compiler option set (FR-QUAL-1).
- `eslint.config.js` flat-config array: `[{ ignores: [...] }, js.configs.recommended, ...tseslint.configs.recommended, { files: ["**/*.ts"], languageOptions, rules }]` (`eslint.config.js:4-17`).
- Layer taxonomy per `architecture.md` §2 (six layers 0–5 with the `Mesher → Chunk` type-only exception).

## Dependencies
- `typescript` ^5.6.3, `eslint` ^9.17.0, `typescript-eslint` ^8.18.2 (devDependencies, `package.json`).
- `@eslint/js` (via the `typescript-eslint` dependency graph) for `js.configs.recommended`.
- No runtime dependency: quality gates run at build/CI time only.

## Error and Edge-Case Behavior
- **Unused symbols**: strict `noUnusedLocals`/`noUnusedParameters` fail the build; intentional placeholder parameters must be prefixed `_` to pass the `no-unused-vars` ESLint rule (`eslint.config.js:15`).
- **Fallthroughs**: `noFallthroughCasesInSwitch` rejects accidental switch fallthrough (the atlas painter's `paintTile` switch is exhaustive with a default, so it is safe).
- **Ignored paths**: only the four built-in ignores are configured; anything else (e.g. a stray TS file under `dist/` or `node_modules/`) is still linted/type-checked by design.
- **Dead-code candidates**: `isSolid()` and `Chunk.hasData` are documented, not deleted — deleting them is safe but deferred until their dedicated cleanup; removal must be accompanied by the docs update noted in FR-QUAL-12.
- **The `any` guard**: because `unknown` is used for capability bridging, `eslint` recommended rules additionally forbid implicit `any` via `noImplicitAny` (part of `strict`), so no untyped leak is possible.

## Performance Expectations
- `typecheck` and `lint` complete in seconds on this small codebase; they are cheap enough to run pre-commit and in CI.
- Strictness has zero runtime cost — all checks compile away (`noEmit` typechecking only; the build's `tsc` pass emits nothing beyond `vite build`).
- The layered architecture keeps per-layer compile units small, so incremental `tsc --noEmit` stays fast.

## Acceptance Criteria
- **AC-QUAL-1** — TypeScript strict mode is on (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) and ESLint (flat config, js+ts recommended) reports zero violations: `npm run typecheck` and `npm run lint` both exit 0.
- **AC-QUAL-2** — Modules are layered by concern (`utils → blocks → world/player/render/ui → core → main`) with no runtime circular imports.
- **AC-QUAL-3** — Pure deterministic logic (terrain, noise, raycast, math, registry) is separated from stateful systems (chunk streaming, player physics, renderer, HUD).
- **AC-QUAL-4** — All tuning constants are centralized in `src/Constants.ts` and referenced by value elsewhere.
- **AC-QUAL-5** — No `any` appears in `src/`; capability bridging uses `unknown` casts.
- **AC-QUAL-6** — Assets are procedural: the texture atlas is fully generated at runtime; no third-party or copyrighted textures exist.

## Verification Method
- **AC-QUAL-1**: CLI — run `npm run typecheck` and `npm run lint`; both exit 0 (observed 2026-08-03). Config review — `tsconfig.json:7, 14-16` and `eslint.config.js:4-17`.
- **AC-QUAL-2 / AC-QUAL-3**: Code inspection — trace all imports against `architecture.md` §2; the `Mesher → Chunk` edge is type-only (`import type`), so no runtime cycle exists; confirm the pure modules hold no mutable state.
- **AC-QUAL-4**: Code inspection — `src/Constants.ts` defines all 16 constants; consumers import them; the two locational constants are documented at their sites (`Game.ts:13`, `PlayerController.ts:163`).
- **AC-QUAL-5**: Grep — search `src/` for `: any`, `as any`, `<any>` (zero matches); `main.ts:36` shows the `unknown`-bridge idiom.
- **AC-QUAL-6**: Code inspection — `TextureAtlas.ts` paints all 11 tiles from seeded painters; `package.json` lists no asset dependencies; no `.png`/`.jpg` texture files exist under `src/`.