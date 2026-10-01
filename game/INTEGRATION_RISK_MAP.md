# Rizo Defense — Integration Risk Map

Worker J safety map for integrating Workers A–I into the v87 multi-agent baseline.

## Baseline integration stance

Use this Worker J package as the merge base if possible. It preserves the playable v87 baseline while adding checkpoint schema **v9**, save-integrity coverage, an enforced 32-projectile checkpoint budget, deterministic-equivalence gates, hostile action-order/checkpoint-invariant gates, lifecycle/browser guards, and static integration diagnostics.

Do not replace the live files with files chosen by their legacy-looking names. `game-v79-defense.js`, `defense-core-v79.js`, and `defense-canvas-v79.js` are the active v87 Defense runtime named by `index.html` and the shared contract.

## Authoritative files and symbols by subsystem

| Subsystem | Authoritative file(s) | Primary symbols / sources of truth | Integration rule |
| --- | --- | --- | --- |
| Deployment / boot | `index.html`, `sw.js`, `rizo-config.js`, `install-manager.js` | active script order, inline boot/recovery guard, service-worker cache/network policy | Preserve `index.html` at ZIP root and keep core → canvas → game load order. Do not make an optional asset failure fatal. |
| Defense constants / deterministic math | `defense-core-v79.js` | `LIMITS`, `PHASES`, `PHASE_TRANSITIONS`, `BUDGETS`, `SIMULATION`, `ECONOMY` | Add shared numeric rules here rather than duplicating them in runtime/UI code. |
| Phase / action permissions | `defense-core-v79.js`, `game-v79-defense.js` | `phaseAllows`, `canTransitionPhase`, `defenseSetPhase`, `defenseIsActiveWave`, `defenseIsSimulating` | Flow/UI changes must preserve one phase machine. Never create a second boolean-only combat state. |
| Maps / routes / placement | `game-v79-defense.js` | `DEFENSE_MAPS`, `DEFENSE_MAP_ORDER`, `defenseMapSvgPath`, `defensePlacementGeometry`, `defensePlacementEvaluation`, `resolveDefensePlacement` | Extend the existing map registry and placement evaluation. Do not create parallel map state. |
| Roster / deployable Rizos | `game-v79-defense.js` | `defenseRoster`, `defenseRosterMarkup`, `updateDefenseRoster`, `placeDefenseTower`, `defenseDeployCost` | Owned/guest/universal additions must flow through one roster/deployment path so saves and spending remain canonical. |
| Universal/economy structures | `defense-core-v79.js`, `game-v79-defense.js` | `ECONOMY`, `deploymentCost`, `upgradeCost`, `queueDefenseIncome`, `flushDefenseIncome`, `defenseUpgradeCost`, `defenseSellRefund` | Factory/Beacon-style systems should attach to the existing income, spend, upgrade and placement contracts rather than add unsynchronized wallets/timers. |
| Tower combat / targeting | `game-v79-defense.js` | `defenseCombatStats`, `pickDefenseTarget`, target snapshot/retarget logic, `fireDefenseTower` | Preserve real-time target throttling and live-target invalidation. New tower types must not bypass density/projectile budgets. |
| Abilities / statuses | `game-v79-defense.js` | `DEFENSE_ABILITIES`, `DEFENSE_CONTROL_ABILITIES`, `defenseAbilityGroups`, `activateDefenseAbilityGroup`, enemy status fields | Persist any new combat-affecting timers/state in checkpoint build → signature → normalize → restore as one atomic change. |
| Enemies / bosses | `game-v79-defense.js` | `DEFENSE_ENEMIES`, `DEFENSE_BOSSES`, `spawnDefenseEnemy`, `dealDefenseDamage`, `updateDefenseEnemies`, boss telegraph/mechanic functions | New traits must have canonical normalization and deterministic update timing. Child/boss spawns count against gameplay density. |
| Waves / Endless-range grammar | `defense-core-v79.js`, `game-v79-defense.js` | `createWavePlan`, `splitIntoPackets`, `defenseWavePlan`, `startDefenseWave`, packet/child queues, `isWaveFullyResolved`, `completeDefenseWave` | Completion credit requires packet/child/live-enemy state to be empty **and** `waveResolved >= waveTotal`. `currentWave` is not reward credit. The current baseline ceiling is 250; replay-start after clearing 250 is rejected. |
| Projectile simulation | `game-v79-defense.js`, `defense-core-v79.js` | `updateDefenseProjectiles`, `fireDefenseTower`, `LIMITS.MAX_CHECKPOINT_PROJECTILES`, visual budget | Logical combat remains deterministic. Presentation may degrade. Checkpoint payload is capped at 32 live in-flight shots. |
| Rewards / mastery / records | `defense-core-v79.js`, `game-v79-defense.js` | `calculateWaveBonus`, `calculateRunEmbers`, `rewardDefenseRun`, `recordDefenseRun`, `state.scores.defense*` | Permanent rewards use `clearedWave`. Loaner `defense-crew-*` Rizos cannot receive permanent mastery/MVP credit. |
| Checkpoint save / migration | `defense-core-v79.js`, `game-v79-defense.js` | `DefenseCore.VERSION` = **9**, `createSaveSignature`, `verifySaveSignature`, `normalizeDefenseCheckpoint`, `buildDefenseCheckpoint`, `restoreDefenseCheckpoint`, `writeDefenseCheckpoint`, `readDefenseCheckpoint` | **Highest-risk merge seam.** Preserve v2–v8 verification/migration, v9 tactical continuation signing, unique restored enemy IDs, packet-cursor/queue coherence, sequential reached-vs-cleared progress, resolution-count coherence and fail-safe phase repair. New continuation state must be signed, clamped, capped and restored. |
| Whole-save integrity | `defense-core-v79.js`, `game-v79-defense.js` | `STATE_SAVE_VERSION`, `createStateSignature`, `verifyStateSignature`, signed Defense history/mastery surfaces | Any new permanent Defense progression must be included in the whole-save signature payload or explicitly remain non-authoritative. |
| HUD / contextual UI | `game-v79-defense.js`, `launch-v79-defense-alive.css` | `updateDefenseHud`, `flushDefenseUi`, `defenseContextSurface`, `defenseCloseContextSurfaces`, `defenseHandleContextKeydown` | Keep one context surface at a time, inert background behavior, Escape/focus contracts and phone-first HUD. |
| Canvas / visual budget | `defense-canvas-v79.js`, `game-v79-defense.js`, CSS | canvas renderer API, `defenseVisualBudget`, `defenseRenderTier`, `defenseApplyRenderTier`, frame governor metrics | VFX/feel may drop/coalesce presentation only; never alter damage, spawn count, rewards or simulation timing. |
| Lifecycle / mobile recovery | `game-v79-defense.js`, `index.html` | `suspendRuntime`, `resumeRuntime`, `pauseDefenseForInterruption`, `surfaceDefenseInterruptionPause`; `visibilitychange`, `pagehide`, `pageshow`, `freeze`, `resume`, `beforeunload` | Backgrounding must checkpoint and pause. Foregrounding may surface the pause, but must not silently advance combat. |
| QA surface | `game-v79-defense.js`, `tests/` | `IS_QA_BUILD`, `createRizoRuntimeQA`, `window.RizoRuntimeQA` | Add probes inside the single gated QA namespace only. Never expose QA globals in production. |

## Shared hot spots most likely to collide across Workers A–I

### 1. `game-v79-defense.js` — critical / near-universal collision

This is the primary merge hazard because nearly every specialty reaches the same live monolithic runtime.

- **A — Flow:** phase transitions, wave start/complete, pause, placement availability, `initializeDefenseRun`, HUD state.
- **B — Economy:** `queueDefenseIncome`, `flushDefenseIncome`, deployment/upgrade/sell functions, run initialization and checkpoint persistence.
- **C — Roster:** `defenseRoster`, roster markup, placement/deployment, run initialization, checkpoint tower canonicalization.
- **D — Towers:** combat stats, placement, targeting, upgrades, tower rendering, checkpoint tower snapshots.
- **E — Abilities/VFX:** ability registries, statuses, projectiles, impacts, render/presentation hooks, checkpoint combat timers.
- **F — Enemies/Waves/Endless:** enemy/boss registries, spawn/update/resolve, wave plan/start/complete, rewards, checkpoint queues.
- **G — Maps:** `DEFENSE_MAPS`, route/path/placement geometry, world rendering, environment state and likely checkpoint fields.
- **H — UI:** HUD, context manager, roster/tower/ability/intel panels, input routing, phone behavior.
- **I — Feel:** tower/enemy motion hooks, SFX/music calls, haptics, moment/cinematic hooks, transition timing.

**Referee rule:** merge symbol-by-symbol, never “take theirs” or “take ours” for this whole file.

### 2. `defense-core-v79.js` — critical rules and save-signature collision

Likely owners: A, B, D, F and any worker adding persisted mechanics. Worker J changes this file from checkpoint schema v8 to **v9**. A later merge must not accidentally revert `VERSION`, `CHECKPOINT_SALTS[9]`, `tacticalContinuation`, deterministic density, or the 32-projectile checkpoint limit.

### 3. `launch-v79-defense-alive.css` — high visual/UI collision

Likely owners: E, G, H, I and possibly D. Resolve by component/selector ownership. Re-run static z-index/`!important` audits and real phone geometry after every merge that touches this file.

### 4. Checkpoint object shape — critical hidden collision

Even workers that do not edit save code can add state that must survive backgrounding. Any new combat-affecting field from B–I is unsafe until all four steps exist together:

1. `buildDefenseCheckpoint` serializes it.
2. `createSaveSignature` v9 signs it (or a future version is deliberately introduced with migration).
3. `normalizeDefenseCheckpoint` clamps/validates it.
4. `restoreDefenseCheckpoint` restores it without creating duplicate entities/timers.

Additionally, the normalized checkpoint must remain internally coherent even when a future merge writes a correctly signed but contradictory payload: enemy IDs unique, packet cursor remainder matching `spawnQueue`, `currentWave <= clearedWave + 1`, active unfinished state paused rather than skippable, and resolution accounting unable to claim completion early.

### 5. `initializeDefenseRun` / run state object — critical shared-state collision

A, B, C, D, F and G are likely to add fields here. Missing defaults often appear only after restart/checkpoint restore. New fields should have one canonical initial value and one migration fallback.

### 6. `updateDefenseHud` / context manager — high A/H/E/B/F collision

Do not let separate panels invent separate pause/overlay semantics. `defenseContextSurface` remains the arbiter for mutually exclusive contextual surfaces.

### 7. `startDefenseWave` / spawn queues / `completeDefenseWave` — high A/F/G/E collision

Keep packet queues, child spawn queues, boss entries and environment-spawn consequences in the full-resolution invariant. No reward or mastery may be granted merely because the requested wave number advanced.

## Safest suggested merge order

Start from `RTD_WORKER_J_QA.zip` so the v9 safety net is present before feature branches are integrated.

1. **Worker A — Flow.** Establish the final decision cadence and phase/action permissions first because all later UI/economy/combat surfaces operate inside that rhythm.
2. **Worker B — Economy.** Integrate authoritative income/spend/Factory/Beacon mechanics next while flow and phase boundaries are stable.
3. **Worker C — Roster.** Establish owned/main/guest selection and deployment identities before expanding towers that depend on roster semantics.
4. **Worker D — Towers.** Integrate universal tower archetypes and upgrade evolution onto the now-stable deployment/economy contracts.
5. **Worker G — Maps.** Integrate map-native geometry/interactions before late wave logic consumes map/environment hooks.
9. **Worker F — Enemies/Waves/Endless.** Integrate opposition, wave grammar, bosses and Endless against the final route/environment state.
10. **Worker E — Abilities/VFX.** Integrate signature abilities/status spectacle after tower/enemy identities and combat semantics are final enough to target reliably.
11. **Worker H — UI/UX.** Reconcile the full set of mechanics into the phone-first HUD/context surfaces after their data contracts exist.
12. **Worker I — Feel.** Merge animation/audio/haptic timing last so sensory hooks attach to final events rather than transient implementation details.
13. **Worker J rebase/reconcile.** Re-apply any safety changes lost in conflict resolution, extend v9/future checkpoint signing for newly persisted state, run all gates, and make only concrete integration fixes.

If a worker branch has a hard dependency that contradicts this order, merge its prerequisite first but preserve the same principle: **state/data contracts before presentation, presentation before final feel**.

## Invariants to re-test after every merge

1. `index.html` remains at deployment root and loads `defense-core-v79.js` before canvas/game runtime.
2. Production does not expose `RizoRuntimeQA`, `RizoVisualQA`, or `RizoBeatQA`.
3. There is one canonical phase state machine; illegal phase jumps remain rejected.
4. `currentWave` may describe an active/reached wave; **only `clearedWave`** can drive permanent reward/mastery credit.
5. A wave cannot complete while packet entries, child spawns, live enemies, or required combat consequences remain unresolved; `waveResolved` must be at least `waveTotal`.
6. Checkpoint scheduler state is coherent: remaining packet entries equal the canonical `spawnQueue`, restored enemy IDs are unique, and impossible signed state is repaired conservatively rather than dropping threats.
7. Reached progress is sequential: `currentWave <= clearedWave + 1`. An unfinished checkpoint mislabeled as planning/wave-complete cannot start another wave; stale combat for already-cleared progress cannot deadlock or replay credit.
8. At the current baseline ceiling, clearing wave 250 prevents another wave-250 start. This is a ceiling safety rule, not the final effectively-infinite Endless implementation.
9. 1× and 2× produce identical gameplay outcomes; low-power changes presentation only.
10. Gameplay density is invariant across speed/quality. Boss/child/map-native spawns cannot bypass caps.
11. Target references are invalidated when enemies die/leak; saved projectiles restore only if both saved tower and live saved target exist.
12. Logical projectile and enemy behavior remains deterministic at the fixed 30 Hz simulation step; catch-up stays bounded.
13. Checkpoint schema remains current and older signed checkpoints still migrate. A current-signature tamper must fail closed.
14. Current checkpoint builder and normalizer both enforce `MAX_CHECKPOINT_PROJECTILES = 32`.
15. All new combat-affecting timers/statuses/economy/environment state survive checkpoint round-trip or are intentionally reset with documented safe behavior.
16. Background/page freeze pauses active Defense, writes a checkpoint, and does not advance simulation while paused.
17. Return from background surfaces the paused run without silently resuming combat.
18. Whole-save signature covers new permanent Defense progression surfaces.
19. Guest/loaner `defense-crew-*` Rizos cannot receive permanent mastery or run MVP credit.
20. HUD/context surfaces remain mutually exclusive, background controls become inert when required, Escape/focus return still work.
21. Real-mobile boot/recovery shell remains available even if the external runtime fails.
22. Service worker keeps runtime JS/navigation recovery policy and a failed optional shell asset cannot brick installation/update.
23. CSS does not reintroduce uncontrolled Defense `!important`/z-index debt or obscure the battlefield on phone layouts.

## Final integrator gate

Run these from the project root after each high-risk merge and all of them before shipping:

```bash
node -c defense-core-v79.js
node -c game-v79-defense.js
node tests/defense-core.test.js
python3 tests/static-defense-audit.py
node tests/service-worker-policy.test.js
node tests/worker-j-defense-guard.test.js
python3 tests/worker-j-integration-risk-audit.py
python3 tests/browser-worker-j-qa.py
python3 tests/browser-worker-j-hostile.py
python3 tests/browser-worker-j-determinism.py --pair speed
python3 tests/browser-worker-j-determinism.py --pair low
python3 tests/browser-launch-recovery.py
python3 tests/browser-first-ten.py
python3 tests/browser-master-integration.py
```

Also run the existing feature-specific browser suites touched by a merge (maps, strategy/feel, arcade freeze, mobile/visual suites) rather than relying only on the compact Worker J gates.

## Future-feature smoke status in this baseline

Worker J intentionally does **not** invent final Factory, Beacon, roster redesign, interactive-map mechanics, Endless implementation, or ability-state product behavior. `tests/worker-j-integration-risk-audit.py` instead gates their existing attachment seams:

- economy: `queueDefenseIncome`, `flushDefenseIncome`, deploy/upgrade cost functions
- roster: `defenseRoster`, roster markup/update
- abilities: canonical ability registry/group activation
- maps: map registry, route/path and placement evaluation
- endless-range waves: wave plan/start and `DefenseCore.createWavePlan` through wave 250; hostile tests exercise plans at 50/100/150/200/249/250 and runtime density near the ceiling
- UI events: HUD flush and context manager

The master vision calls for effectively-infinite Endless, while this baseline remains hard-capped at 250. Worker J does not invent Worker F’s final Endless implementation; it only guarantees that the existing ceiling cannot replay or duplicate credit.

Its JSON report at `reports/worker-j-integration-risk-audit.json` records whether future feature names already exist, but absence is informational and does not fail the baseline.
