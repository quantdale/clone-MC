# Spec Delta: CHANGE-001 — Project bootstrap

Spec sections added by this change (the spec draft lives in
`openspec/specs/`; these are the sections this change introduces):

## §1 Project structure & build system

- The repository is an npm package (`package.json`, `package-lock.json`)
  using ESM (`"type": "module"`).
- Required scripts: `dev` (Vite dev server on port 5173), `build` (`tsc &&
  vite build`, output to `dist/` with `base: "./"`), `preview`, `typecheck`
  (`tsc --noEmit`), `test` (`vitest run`), `test:watch`, `lint` (`eslint .`).
- Toolchain constraints: TypeScript strict, ES2020 target,
  `moduleResolution: bundler`; ESLint 9 flat config
  (`js.configs.recommended` + `typescript-eslint` recommended, ignoring
  `dist/`, `node_modules/`, `coverage/`); Vitest runs in the `node`
  environment over `tests/**/*.test.ts`.

## §2 Runtime entry point

- `index.html` is the Vite entry and must contain, at minimum: `<canvas
  id="game">`, HUD elements `#fps #pos #chunks #cycle #debug`, `#hotbar`,
  loading overlay `#loading` with `#loadtext` + `#loadbarfill`,
  `#clickToPlay`, and the hidden `#fatal` overlay. Missing ids are fatal
  startup errors (validated in `src/main.ts`).
- `src/main.ts` mounts the game and exposes `window.__mc` (the `Game`
  instance) as a test hook.

## §3 Dependency contract

- Runtime: `three@^0.170.0` and `@types/three@^0.170.0`.
- Dev: `vite@^6.4.3`, `typescript@^5.6.3`, `vitest@^3.2.4`,
  `typescript-eslint@^8.18.2`, `eslint@^9.17.0`.
- The build must not require external assets of any kind.