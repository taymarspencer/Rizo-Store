# Rizo.game — Astra Working Baseline

## Canonical snapshot
- Repository: `taymarspencer/Rizo-World-`
- Source branch at packaging time: `main`
- Source commit: `e5f09048ec472850c44e69cb4f2e98c8006de02b`
- Commit message: `Rizo World final release candidate`
- Current runtime/build marker: `v87-first-ten-visual-nuance`
- Playable entrypoint: `index.html`

## Read this before editing
This package is intentionally focused on the live game rather than the repo's full historical archaeology.

Some live runtime filenames still contain older version numbers (`v79`, `v81`, `v84`, `v85`). They are NOT automatically obsolete. They are intentionally retained compatibility filenames and are referenced by the current v87 build. Do not rename or replace them merely to make version numbers look consistent.

The deployable site is intentionally flat: `index.html` belongs at the archive/deployment root. Do not wrap the playable site in an extra parent directory when deploying.

## Architecture / working style
- Static vanilla HTML/CSS/JavaScript game. Do not introduce a framework or build-system rewrite unless the task explicitly requires it.
- Preserve working URLs and asset paths.
- `assets/` contains live visual assets.
- `tests/` is included because regressions matter, but tests are a guardrail, not the product goal.
- `docs/current/` describes the authoritative v86 launch hotfix.
- `docs/reference/` is prior design/implementation context. Treat it as history and design intent, not as authority over the live code.
- Old reports/screenshots/version documents were intentionally excluded from this clean pack to reduce context pollution.

## Important launch invariant
v86 exists because v85 could white-screen on a real iPhone despite Chromium-heavy test success. The dependency-free boot shell and fail-visible recovery behavior are intentional. Do not casually remove them.

## Gameplay direction
Rizo should feel authored, handmade, immediate, and weird rather than like a generic template. For gameplay passes, prefer changes the player can actually feel over invisible cleanup. Strong rewrites are allowed when they produce a substantially better game, but preserve state/reward correctness and launch reliability.

## Current Defense baseline — v87 first ten
The first Astra Defense pass is now implemented. Do not rediscover or recreate it from scratch.

Player-visible baseline:
- Waves 1–10 are an explicit authored score with packet rhythm and named beats.
- The opening exposes a Defense-only guest crew alongside the player's Rizo: Violet chain, Frost setup/control, and Obsidian heavy/armor cracking.
- Placement is freeform on valid ground and preview communicates trail coverage. Paid reinforcements/upgrades remain available during live combat; selling remains locked.
- Tower roles are materially different: chaining, chill/setup, heavy splash/armor cracking, and stronger target priorities.
- Wave 5 is a readable Zip rush; waves 6–9 layer split/armor/fireproof/storm pressure; wave 10 brings the Warden in with escorts instead of as an isolated cleanup target.
- Storm enemies visibly wind up and surge. Leaked/dead targets cannot remain valid cached projectile targets. Chain/splash energy persists even when the first hit kills.
- 1×, 2×, and low-power presentation use the same fixed simulation outcomes.
- Checkpoint schema is v8. It additionally signs/restores in-flight projectiles and precise armor continuation while still verifying/migrating legacy v1–v7 checkpoints.

Verification already added:
- `node tests/defense-core.test.js`
- `python tests/browser-first-ten.py`
- `python tests/browser-defense-integration.py`
- `python tests/browser-defense-surfaces.py`
- `python tests/browser-v80-strategy-feel.py`
- `python tests/browser-v78-canvas-flow.py`
- `python tests/browser-launch-recovery.py`
- `python tests/static-defense-audit.py`
- `node tests/service-worker-policy.test.js`

Design uncertainty intentionally left open: the four-Rizo opening crew is playable and strategically useful, but the product owner is still deciding whether four immediate choices is the right long-term onboarding shape. Do not remove it casually; treat it as a live playtest question.

Difficulty should continue to come from pacing, enemy composition, mechanics, pressure, and meaningful decisions—not only HP inflation or screen flooding.


## Current visual baseline
- Pine Bend uses the authored `assets/defense-pine-bend.svg` terrain from the Astra Light foundation pass.
- Balloon, projectile and pop rendering has dimensional ink/material treatment in canvas and DOM fallback.
- Follow-up nuance pass adds variant-specific attack weight, muzzle language and bespoke Ember/Violet/Frost/Obsidian projectile/impact identities without changing combat balance.
- Defense-only guest crew remain tactical loaners and cannot steal permanent MVP/boss mastery.
