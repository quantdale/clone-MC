# Verification: CHANGE-001 — Project bootstrap

## Environment

- Node/npm toolchain as required by `package.json`; Vite 6.4.3, Vitest 3.2.x,
  TypeScript 5.6, ESLint 9 (`npm ls`-style install, below).
- Commands run in the project root `D:/Documents/tryPython/tryMC` (Git Bash
  on Windows).

## Pipeline results (run 2026-08-03)

| Step | Command | Result |
| --- | --- | --- |
| Install | `npm install` | **OK** — resolved from lockfile; "found 0 vulnerabilities"; exit 0 |
| Type-check | `npm run typecheck` | **OK** — `tsc --noEmit` exit 0, no diagnostics |
| Lint | `npm run lint` | **OK** — `eslint .` exit 0, no warnings |
| Test | `npm test` | **exit 1 — `No test files found`** (see note below) |
| Build | `npm run build` | **OK** — `tsc` clean, then `vite build` exit 0 |
| Dev server | `npm run dev -- --port 5199 --strictPort` | **OK** — `VITE v6.4.3 ready in 362 ms`; `GET /` → HTTP 200 |

Build output (vite 6.4.3):

```
✓ 20 modules transformed.
dist/index.html                   1.47 kB │ gzip:   0.68 kB
dist/assets/index-C2FSwSOA.css    2.46 kB │ gzip:   0.89 kB
dist/assets/index-kb4nozPc.js   499.36 kB │ gzip: 129.59 kB
✓ built in 792ms
```

### Note on `npm test`

`tests/` currently contains no `*.test.ts` files, so `vitest run` exits 1 with
`No test files found` despite correct configuration (include pattern
`tests/**/*.test.ts`, node environment). This is a **pre-existing, documented
condition** (README.md, "Test commands" section) and not a failure of this
change; unit test coverage is scheduled under CHANGE-002 / later changes.

### Browser smoke test (dev server)

Loaded `http://localhost:5199/` in a real Chromium browser (Playwright):

- Page title "TryMC — Voxel Sandbox"; no console errors.
- HUD snapshot shows `FPS 60`, `Chunks 169` (the full 13×13 view), `Day/night:
  ON`, `pending gen 0 · pending mesh 0 · edited 0 · tris 89514`.
- Loading overlay resolved to **"World ready"**; hotbar rendered 9 slots.
- Screenshot: `docs/docs-verify-roundtrip.png`.

## Artifacts verified

- `package.json` scripts resolve (`dev`, `build`, `preview`, `typecheck`,
  `test`, `test:watch`, `lint`).
- `tsconfig.json` strict options honored (typecheck catches no `any` / unused
  violations — `noUnusedLocals`/`noUnusedParameters` active).
- `vite.config.ts` `base: "./"` honored in emitted `dist/index.html` asset
  paths.
- `eslint.config.js` ignores `dist/`, `node_modules/`, `coverage/`.
- `index.html` required DOM ids all present (boot succeeds — see browser
  smoke test).