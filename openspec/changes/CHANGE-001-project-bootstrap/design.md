# Design: CHANGE-001 — Project bootstrap

## Overview

The bootstrap is a set of six root files plus the `package.json` scripts that
orchestrate them. Each file is minimal and does exactly what the corresponding
tool needs; no options are added speculatively.

## `package.json`

- `"type": "module"` — ESM throughout, matching Vite 6 and the `import`/`export`
  usage in `src/`.
- Scripts:
  - `dev` → `vite`
  - `build` → `tsc && vite build` (type-check, then bundle)
  - `preview` → `vite preview`
  - `typecheck` → `tsc --noEmit`
  - `test` → `vitest run`
  - `test:watch` → `vitest`
  - `lint` → `eslint .`
- Dependencies: `three@^0.170.0` (runtime).
- Dev dependencies: `@types/three@^0.170.0`, `eslint@^9.17.0`,
  `typescript@^5.6.3`, `typescript-eslint@^8.18.2`, `vite@^6.4.3`,
  `vitest@^3.2.4`.

## `tsconfig.json`

Strict mode throughout (`"strict": true`), plus `noUnusedLocals`,
`noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`,
`esModuleInterop`, `forceConsistentCasingInFileNames`, `useDefineForClassFields`.
`target: ES2020`, `module: ESNext`, `moduleResolution: bundler`, `lib` includes
`ES2020`, `DOM`, `DOM.Iterable`. `noEmit: true` (Vite emits). `include` covers
`src`, `tests`, and the three config files (`vite.config.ts`,
`vitest.config.ts`, `eslint.config.js`); `exclude` is `node_modules`, `dist`.

## `vite.config.ts`

- `base: "./"` so the build works from any static sub-path.
- `build.target: "es2020"`, `chunkSizeWarningLimit: 1024` (the Three.js bundle
  is large by design).
- `server.port: 5173`.

## `vitest.config.ts`

- `environment: "node"` (pure logic tests; no DOM assumptions).
- `include: ["tests/**/*.test.ts"]`.
- `coverage.provider: "v8"`, `include: ["src/**/*.ts"]`.

## `eslint.config.js`

ESLint 9 flat config via `typescript-eslint`:
`js.configs.recommended` + `tseslint.configs.recommended`, with ignores for
`dist/`, `node_modules/`, `coverage/`, and a `no-unused-vars` rule that
tolerates `_`-prefixed args/vars.

## `index.html`

The single Vite entry: a `<canvas id="game">`, the HUD overlay panel
(`#fps #pos #chunks #cycle #debug`), `#hotbar`, `#loading` + `#loadbarfill`,
`#clickToPlay`, and `#fatal` (hidden), plus `<link rel="icon" href="data:," />`
to suppress a 404 favicon request. It loads `/src/main.ts` as a module script.
These exact ids are required by `src/main.ts` (REQUIRED_IDS) and `src/ui/HUD.ts`.

## Interaction with the codebase

`src/main.ts` boots the game and validates the DOM ids; `Game` constructs the
renderer, player, HUD, and chunk manager. The config files only enable the
toolchain; the runtime does not read them.