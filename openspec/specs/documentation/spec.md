# Capability: Documentation

## Purpose
Define the documentation contract of TryMC: the required README sections, the OpenSpec suite layout, the committed screenshot evidence, and — most importantly — the rule that documentation must never drift from the implemented code. Every stated fact is expected to trace to a real file, and every cross-reference (IDs, spec paths, ADRs, change records) must resolve. This spec is the policy under which `README.md` and the `openspec/` set are maintained and reviewed.

## Scope
In scope:
- `README.md` and its required sections (prereqs, install, dev, tests incl. `test:e2e`, lint, typecheck, build, preview, controls table, architecture, configuration `?seed`, performance notes, known limitations, openspec index).
- The `openspec/` suite: `project.md`, `architecture.md`, `acceptance-criteria.md`, `verification-matrix.md`, `config.yaml`, the 15 per-capability spec files, the 4 architecture decision records, and the 2 change records.
- `docs/screenshot.png` as the committed visual evidence of the running game.
- The no-drift rule: specs describe the implemented system; any code change that invalidates a documented claim must update the docs in the same change.

Out of scope:
- User-facing in-game help/tutorial wording (the game shows no such UI).
- Release notes, changelogs, or versioning policy.
- API reference generation (no exported public API beyond `window.__mc`).

## Functional Requirements

- **FR-DOC-1** — `README.md` is the entry-point user document and must contain, in order: intro, **Prerequisites** (Node.js 20+, npm, WebGL browser), **Installation** (`npm install`), **Development** (`npm run dev`, port 5173), **Test commands** (`npm test` and `npm run test:e2e`, incl. the `npx playwright install chromium` one-time setup), **Lint command**, **Type-check command**, **Production build**, **Preview / deployment**, a **Controls** table, **How it works / Architecture**, **Configuration** (URL parameter `?seed=N` default 1337 + the constants table), **Performance notes**, **Known limitations**, and the **OpenSpec documentation index** (`README.md:18-215`).
- **FR-DOC-2** — The README architecture section describes the six key systems accurately: greedy mesher with the three render passes, procedural seeded terrain, chunk streaming with per-frame budgets, AABB collision, voxel raycasting, and in-session edit persistence (`README.md:119-145`).
- **FR-DOC-3** — The README **Known limitations** section must list the intentional non-goals: no cross-restart persistence, no audio, no multiplayer, no crafting/inventory beyond the 9-slot hotbar, water with no physics, leaves/water as single-block materials, cosmetic day/night (`README.md:181-195`).
- **FR-DOC-4** — The README OpenSpec index table lists every top-level doc and spec group and must stay in sync with the actual `openspec/` tree (`README.md:197-215`).
- **FR-DOC-5** — `openspec/project.md` accurately describes purpose, tech stack, feature inventory, commands, the `src/` module map, repository layout, and the specification-file index, all traced to real files (`openspec/project.md`).
- **FR-DOC-6** — `openspec/architecture.md` accurately documents the module layers and dependency graph, per-frame and event-driven data flows, the chunk lifecycle state machine, the edit-persistence mechanism, the render pipeline, the determinism guarantees, and the performance model (`openspec/architecture.md`).
- **FR-DOC-7** — `openspec/acceptance-criteria.md` contains testable, numbered acceptance criteria grouped by capability with explicit verification methods, and every criterion ID appears in `verification-matrix.md` with matching semantics (`openspec/acceptance-criteria.md`; `verification-matrix.md` reading guide).
- **FR-DOC-8** — `openspec/verification-matrix.md` traces every requirement ID to (a) one of the fifteen per-capability spec files under `openspec/specs/<cap>/spec.md`, (b) a real implementation reference with file/line citations, (c) a verification method, status, evidence, and remaining-issue cells — with no blank cells and no dangling spec references (`openspec/verification-matrix.md`).
- **FR-DOC-9** — Exactly 15 capability spec files exist under `openspec/specs/` — nine pre-existing (`rendering`, `world-generation`, `chunk-streaming`, `player-controller`, `block-interaction`, `inventory`, `lighting`, `user-interface`, `performance`) plus six authored to close the matrix (`registry`, `persistence`, `error-handling`, `testing`, `code-quality`, `documentation`) — and every matrix row's spec reference points to one of them.
- **FR-DOC-10** — `openspec/decisions/` holds exactly four architecture decision records: `ADR-001-rendering-architecture`, `ADR-002-chunk-data-model`, `ADR-003-world-generation-determinism`, `ADR-004-in-session-edit-persistence`.
- **FR-DOC-11** — `openspec/changes/` holds exactly two change records — `CHANGE-001-project-bootstrap` and `CHANGE-002-edit-persistence-and-error-handling` — each with `proposal.md`, `design.md`, `tasks.md`, `spec-delta.md`, and `verification.md`; an `archive/` directory exists for retired records.
- **FR-DOC-12** — `docs/screenshot.png` is committed and shows authentic gameplay; `README.md` references it as the screenshot placeholder target (`README.md:8-16`; file present, ~223 KB).
- **FR-DOC-13** — `openspec/config.yaml` declares `schema: spec-driven` as the artifact-generation schema for the suite (`openspec/config.yaml:1`).
- **FR-DOC-14** — The no-drift rule: specs and README describe the **implemented** behavior, verified by code inspection against `src/` (the 2026-08-03 baseline); any functional change must either keep every documented statement true or update the affected doc in the same change set. The "Remaining issue" column of the matrix is the sanctioned place to record known gaps.

## Non-functional Requirements

- **NR-DOC-1** — Single source of truth: docs reference canonical locations (paths, line ranges) rather than duplicating behavior; where two docs may disagree, the matrix is the reconciliation point.
- **NR-DOC-2** — Cross-reference integrity: every spec reference in the matrix, every ID in the acceptance criteria, and every item in the README index resolves to a real file/row; dangling references are a documentation defect.
- **NR-DOC-3** — Currency: the docs set is re-verified by code inspection whenever a capability spec or a matrix row changes; the baseline date header in `verification-matrix.md` records the last verification.
- **NR-DOC-4** — Human-verifiable: the acceptance criteria and matrix use a fixed status vocabulary ("Implemented (code inspection)" / "Verified (executed)" / "Pending final verification") so readers can judge confidence from the status cell alone.

## Inputs and Outputs

Inputs:
- The implemented codebase (`src/`, `tests/`, configs) as the factual source.
- The project prompt (`prompt.txt`), which constrains required features/documents.

Outputs:
- `README.md` (entry-point user doc).
- `openspec/project.md`, `openspec/architecture.md`, `openspec/acceptance-criteria.md`, `openspec/verification-matrix.md`, `openspec/config.yaml`.
- `openspec/specs/<cap>/spec.md` — 15 capability specs (9 pre-existing + 6 this task completes).
- `openspec/decisions/ADR-001…004`, `openspec/changes/CHANGE-001…002` (5 files each).
- `docs/screenshot.png` (visual evidence).

## Core Data Structures
- Matrix row schema: `| ID | Requirement | Specification ref | Implementation ref | Verification method | Status | Evidence | Remaining issue |` (`verification-matrix.md:15`).
- Acceptance-criteria row schema: `| ID | Criterion | Verification |` grouped per capability (`acceptance-criteria.md`).
- Capability-spec skeleton: 11 `##` sections in fixed order — Purpose; Scope; Functional Requirements (FR-<cap>-n); Non-functional Requirements (NR-<cap>-n); Inputs and Outputs; Core Data Structures; Dependencies; Error and Edge-Case Behavior; Performance Expectations; Acceptance Criteria (AC-<cap>-n); Verification Method (canonical example: `openspec/specs/rendering/spec.md`).
- Change-record file set: `proposal.md`, `design.md`, `tasks.md`, `spec-delta.md`, `verification.md`.

## Dependencies
- `README.md` → `docs/screenshot.png`, `openspec/` index links, `src/` code facts.
- `openspec/verification-matrix.md` → every file under `openspec/specs/`, plus `src/` line citations.
- `openspec/acceptance-criteria.md` → `verification-matrix.md` (ID parity).
- `openspec/architecture.md` → `src/` modules and line ranges (`ChunkManager`, `Mesher`, `TerrainGenerator`, `PlayerController`, `WorldRenderer`, `Game`).
- `openspec/project.md` → `README.md` facts, `package.json`, `src/` module map.
- `config.yaml` (schema: `spec-driven`) manages the artifact workflow.

## Error and Edge-Case Behavior
- **Dangling matrix reference**: a spec-ref column pointing to a nonexistent file is a hard defect — the whole point of the matrix is resolvability; the six newly added specs close the six pending references (registry, persistence, error-handling, testing, code-quality, documentation).
- **Doc/code drift**: a claimed line range that no longer holds after a refactor is a defect; the fix is updating the doc in the same change as the code (FR-DOC-14).
- **Status vocabulary misuse**: evidence cells must not claim "Verified (executed)" without a reproducible command result; claims without evidence use "Implemented (code inspection)" or "Pending final verification".
- **Stale limitation notes**: removing a limitation (e.g. adding audio) requires deleting the matching README bullet in the same change.

## Performance Expectations
- Documentation is free at runtime: no doc file is shipped with or read by the game (Vite bundles only `src/`; `docs/` and `openspec/` are dev-time artifacts).
- The cost is maintenance-time only: a functional change touches at most the affected spec + matrix row + README, keeping the doc set reviewable.

## Acceptance Criteria
- **AC-DOC-1** — `openspec/project.md` accurately describes purpose, stack, features, controls, and module map.
- **AC-DOC-2** — `openspec/architecture.md` accurately documents architecture incl. diagrams and the chunk-lifecycle state machine.
- **AC-DOC-3** — `openspec/acceptance-criteria.md` gives testable assertions with verification methods, all IDs matching the matrix.
- **AC-DOC-4** — `openspec/verification-matrix.md` maps every ID to spec/implementation/verification/status/evidence/issue with no blank cells and every spec reference resolving to a real file.
- **AC-DOC-5** — `README.md` contains all required sections (prereqs, install, dev, test commands incl. `test:e2e`, lint, typecheck, build, preview, controls, architecture, `?seed` configuration, performance notes, known limitations, openspec index) and its stated facts trace to real behavior.
- **AC-DOC-6** — All 15 capability specs exist under `openspec/specs/`, all 4 ADRs and both change records exist, `docs/screenshot.png` is present, and the no-drift rule (documented behavior must match implementation) is enforced on changes.

## Verification Method
- **AC-DOC-1 / AC-DOC-2**: Review — compare each stated fact against the referenced `src/` files (baseline verification process of 2026-08-03).
- **AC-DOC-3**: Structural check — cross-reference every ID in `acceptance-criteria.md` with the matrix; all 81 IDs appear with matching semantics.
- **AC-DOC-4**: Structural check — for every matrix row, resolve `Specification ref` to `openspec/specs/<cap>/spec.md` and assert the file exists; assert no blank cells (the six references created by this task's new specs all resolve).
- **AC-DOC-5**: Review — walk `README.md` section by section against `src/`, `package.json` scripts, and `playwright.config.ts` (test commands, ports) and confirm accuracy.
- **AC-DOC-6**: Structural — list `openspec/specs/`, `openspec/decisions/`, `openspec/changes/`, and `docs/`; assert counts and that README's index matches the tree. Drift enforcement: none of the six new specs references a behavior that does not exist in `src/` (verified by writing them from the source read of 2026-08-03).