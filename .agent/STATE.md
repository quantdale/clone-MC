# Current State

**Repository:** `quantdale/clone-MC`  
**Product:** TryMC browser voxel sandbox  
**State classification:** IMPLEMENTED_BASELINE / NO_ACTIVE_EXECUTION_PROMPT_CONFIRMED_BY_THIS_DOC_SWEEP

## Durable baseline

The repository contains a complete TypeScript/Three.js browser implementation with Vite, Vitest, Playwright, ESLint, and OpenSpec documentation. The README documents the implemented gameplay surface, architecture, controls, performance observation, and known limitations.

The substantive implementation checkpoint recorded in Git history introduced the voxel sandbox plus its test/spec suite. Later commits added planner/executor adapters. This documentation refresh does **not** convert historical test counts or performance observations into a fresh validation result.

## Canonical validation surface

Current `package.json` exposes:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`

Run the commands relevant to a change before claiming current success. Browser E2E requires Playwright Chromium on a fresh environment.

## Continuation

If `.agent/EXECUTION_PROMPT.md` is created, reconcile it with current `main` before resuming and update this file as milestones land, become blocked, or are superseded. If no active prompt exists, use the current implementation, tests, README, and OpenSpec records to plan the next bounded campaign instead of replaying old work.

Historical ADRs/change records remain historical evidence and should not be edited merely to match newer implementation state.
