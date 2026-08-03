# Tasks: CHANGE-001 — Project bootstrap

Status: all tasks complete; verification in `verification.md`.

1. [x] Add `package.json` with scripts, `three` dependency, and dev
       dependencies (`vite`, `typescript`, `typescript-eslint`, `eslint`,
       `vitest`, `@types/three`).
2. [x] Add `tsconfig.json` (strict, bundler resolution, `noEmit`, includes
       `src`/`tests`/configs).
3. [x] Add `vite.config.ts` (`base: "./"`, es2020 target, port 5173).
4. [x] Add `vitest.config.ts` (node env, `tests/**/*.test.ts` include).
5. [x] Add `eslint.config.js` (ESLint 9 flat config + typescript-eslint).
6. [x] Add `index.html` entry (canvas, HUD ids, hotbar, overlays, favicon).
7. [x] `npm install` and resolve the lockfile (`package-lock.json`).
8. [x] Run the full pipeline: typecheck, lint, build, test, dev server.