# TryMC — Agent Instructions

This file is the canonical repository-level contract for agents working on `quantdale/clone-MC`.

## Repository identity

TryMC is a browser-only voxel sandbox implemented in TypeScript with Three.js and Vite. The repository documents procedural terrain, streamed 16×16×64 chunks, first-person movement, block interaction, a fixed hotbar, day/night rendering, in-session edit persistence, Vitest unit tests, Playwright browser tests, and OpenSpec design records. There is no server-side world or multiplayer backend.

Do not infer capabilities from the project name. Reconcile claims against the current source, `package.json`, tests, and OpenSpec records.

## Read before editing

1. `README.md` for setup, controls, architecture, limitations, and the OpenSpec index.
2. `.agent/STATE.md` for the concise current checkpoint.
3. `.agent/PLANNER_HANDOFF.md` and `.agent/EXECUTION_PROMPT.md` if one exists.
4. Relevant material under `openspec/` before changing established architecture or capability contracts.

Historical OpenSpec change records and ADRs are evidence. Preserve them as historical records; update living docs/specs instead of rewriting history.

## Canonical commands

From the repository root:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run dev` starts Vite for interactive development. Playwright may require `npx playwright install chromium` on a new machine.

Never report a command as passing unless it was actually run at the current checkout. A prior checkpoint or README benchmark is not proof that current `main` still passes.

## Engineering discipline

- Preserve deterministic world generation unless a task explicitly changes the seed/terrain contract.
- Treat chunk streaming, meshing budgets, collision, raycasting, and edit persistence as coupled systems; add regression coverage when changing them.
- Keep browser-only deployment and the existing static-build model unless a deliberate architecture change is approved.
- Do not silently expand scope into networking, persistence across restarts, crafting, survival systems, or asset pipelines simply because they are Minecraft-like features.
- Prefer focused changes with observable acceptance criteria over broad speculative rewrites.

## Documentation discipline

When behavior, controls, setup, architecture, supported capabilities, known limitations, validation commands, or OpenSpec status changes, update the corresponding living documentation in the same change.

Evidence precedence is:

`current executable validation` > `current implementation/configuration` > `active agent state/prompt` > `living documentation` > `historical records` > `assumptions`.

Do not persist volatile live-HEAD claims in living docs unless the document is explicitly a historical checkpoint. If docs disagree with stronger evidence, record and fix the discrepancy.

## Git safety

Inspect the working tree and diff before committing. Do not discard unrelated work, rewrite history, force-push, or use destructive cleanup as a shortcut. Commit only intentional, validated changes and state any unverified platform/browser assumptions explicitly.

More specific instructions in subdirectories may add stricter requirements but must not silently weaken this contract.
