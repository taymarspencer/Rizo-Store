# RTD Multi-Agent Shared Contract

You are one specialist in a 10-worker parallel development experiment. Every specialist receives the exact same baseline. Your value comes from making your assigned subsystem excellent without creating unnecessary integration burden.

## Required reading order
1. `ASTRA_CONTEXT.md`
2. `_multiagent/RTD_MASTER_VISION.md`
3. `_multiagent/RTD_SHARED_CONTRACT.md`
4. `_multiagent/WORKER_MANIFEST_TEMPLATE.md`
5. Your worker-specific prompt supplied in chat

## Baseline rules
- `index.html` must remain at deployment root.
- Static vanilla HTML/CSS/JS is the baseline architecture. Do not introduce a framework or build-system rewrite.
- Runtime files with older-looking version numbers may still be authoritative. Do not rename them merely for cleanliness.
- Preserve the dependency-free launch/recovery shell and real-iPhone launch resilience.
- Preserve save/reward correctness or perform a deliberate backwards-compatible migration.
- Preserve deterministic/fixed-step gameplay behavior unless your assigned task absolutely requires a documented change.
- Tests are guardrails, not the product. Player-visible quality is the goal.
- Do not perform broad cleanup/refactors unrelated to your assignment.
- Do not delete another subsystem merely because you would have designed it differently.
- Do not change Arcade or unrelated Rizo.game systems unless a minimal integration fix is truly necessary.

## Ownership rule
You may inspect the entire codebase. You may make the smallest cross-boundary edits necessary to connect your work. However, do not redesign another worker's subsystem.

If your work requires something another specialist should own, implement a minimal compatible hook/default and document the dependency instead of absorbing their whole job.

## Player-facing rule
Do not optimize for line count or novelty. Optimize for felt improvement.

A successful change should be observable in play. Prefer readable cause/effect, meaningful decisions, visible transformations, strong feedback, and robust behavior over invisible architecture work.

## Integration discipline
Before editing, identify the smallest set of live files/functions/data you expect to touch. Preserve public behavior outside your scope.

Avoid creating duplicated sources of truth. Reuse existing canonical state/data where possible.

If you introduce new constants, events, hooks, CSS classes, DOM nodes, save fields, or asset conventions that another worker/integrator must know about, list them explicitly in your manifest.

## Required deliverable
Return a complete playable ZIP, not a patch-only response.

Naming:
`RTD_WORKER_<LETTER>_<SHORTNAME>.zip`

The ZIP must:
- contain `index.html` at root
- contain the full working project
- contain `WORKER_<LETTER>_MANIFEST.md` at root
- preserve the `_multiagent/` reference docs

Also provide a short final message summarizing what materially improved and any known integration collisions.

## Manifest requirement
Use `_multiagent/WORKER_MANIFEST_TEMPLATE.md` and fill it honestly.

At minimum record:
- scope
- player-visible changes
- exact files changed
- important symbols/systems changed
- new assets/state/schema/hooks
- cross-worker dependencies
- likely merge conflicts
- tests run and results
- known limitations
- manual play observations

## Minimum verification
Run whatever existing tests are relevant to your changes. At minimum, unless impossible in your environment:
- `node tests/defense-core.test.js`
- `python tests/static-defense-audit.py`
- `node tests/service-worker-policy.test.js`

Run relevant browser suites when your environment supports them. Do not spend the entire task fighting an unavailable browser. If visual/browser QA cannot be completed, say so clearly in the manifest and still ship the complete ZIP.

## Non-goals
- Do not turn RTD into a different genre.
- Do not clone BTD assets, names, maps, characters, code, or proprietary content.
- Do not make the game "deeper" by dumping explanatory text everywhere.
- Do not solve difficulty with pure HP inflation or screen flooding.
- Do not reward yourself for touching many files.

## Success definition
Make your one assigned part of RTD feel like it was handled by an obsessive specialist, while leaving the rest of the game stable enough that an integrator can merge all specialists into one coherent master build.
