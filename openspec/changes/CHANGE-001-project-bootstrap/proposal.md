# Change Proposal: CHANGE-001 — Project bootstrap

**Status:** Accepted (implemented)
**Date:** 2026-08-03
**Change ID:** `openspec/changes/CHANGE-001-project-bootstrap/`

## Summary

Restore and formalize the project's build and tooling configuration so the
repository is a complete, runnable, testable TypeScript + Vite package. This
change establishes the six root config files the game depends on, the
`npm` scripts that drive them, and the dependency set pinned in the lockfile.

## Motivation

TryMC is a browser game built with Three.js and TypeScript. Without a
`package.json` (scripts + dependencies), a `tsconfig.json`, a Vite
configuration, a Vitest configuration, an ESLint flat config, and an
`index.html` entry point, the project cannot be installed, type-checked,
linted, tested, built, or served. This change makes those capabilities
first-class and reproducible.

## Scope

- Root-level config files, scripts, and dependency declarations.
- The static HTML entry point that Vite serves and mounts `src/main.ts` into.
- No game logic changes; the runtime code in `src/` is untouched by this
  change.

## Non-goals

- Writing any game systems (those are covered by later changes).
- Server-side persistence, networking, or assets (the game is fully
  procedural / offline).

## Requirements

1. `npm install` resolves cleanly from the lockfile.
2. `npm run typecheck` (tsc `--noEmit`) passes with strict settings.
3. `npm run build` (tsc + vite build) emits a production bundle to `dist/`.
4. `npm run lint` (ESLint 9 flat config) passes over the whole project.
5. `npm test` (Vitest, node env, `tests/**/*.test.ts`) is wired up; see
   verification for the current no-test-files state.
6. `npm run dev` starts the Vite dev server and serves the DTD page.