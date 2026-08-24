# Universal Planner → Executor Handoff

Version: 1

This is additive and does not replace repository-specific product, architecture, governance, campaign, state, validation, OpenSpec, or Git rules.

The repository planner writes the next execution-ready campaign to `.agent/EXECUTION_PROMPT.md`. It must record `Status: ACTIVE | BLOCKED | COMPLETED`, `Planned-From`, `Planned-At`, and `Target-Branch`, then define mission, rationale/findings, preserved behavior, scope/out-of-scope, ordered workstreams, implementation constraints, migrations/data work when relevant, automated and integration/E2E validation, acceptance criteria, completion gate, Git requirements, and final reporting.

Planner: inspect actual code/config/tests/docs, recent commits/diffs, useful issues/PRs, and native agent/state files; build on completed work; choose exactly one coherent high-impact long-session campaign; avoid duplicate work and unnecessary rewrites; require no known Critical/High regressions; write/update `EXECUTION_PROMPT.md`, commit/push the planning-only change per repository policy, and stop without implementing.

Executor for `/goal continue`, `continue`, or the shared `goal` command/skill: read applicable repository instructions, this file, `EXECUTION_PROMPT.md` if present, and native goal/campaign/state/OpenSpec files; inspect current Git/tests/implementation; reconcile `Planned-From` with already-landed work; if the prompt is `ACTIVE`, resume the first genuinely incomplete requirement without redoing completed work; work autonomously, follow existing patterns, avoid unrelated rewrites, run required validation, repair introduced Critical/High regressions, update durable state, and commit/push per repository policy; mark `COMPLETED` only when acceptance criteria pass and `BLOCKED` only for a genuine blocker.

If the planner prompt is absent/completed, use native continuation semantics. If neither an active planner prompt nor native active campaign exists, do not invent a major campaign in executor mode; report that a planner pass is required. Explicit user instructions and stricter repository rules remain authoritative.