# Worker B Manifest

## Scope
Owned Rizo Defense economy and universal structures: Clothing Factory deployment/production/upgrades, Beacon support field/upgrades, greed-versus-survival pacing, structure costs, Golden Rizo economy interactions, and late-game/Endless economic scaling. Did not redesign wave content, collection/loadouts, Basic Defense Rizo combat identity, or the broad UI shell.

## Player-visible changes
- Added **Clothing Factory** as a universal deployable economy structure. It occupies a real field slot, cannot attack, and prints coins only while combat simulation is live.
- Factory evolves from a small handmade setup through **FOLD TABLE → TWO-PERSON SHOP → PRINT LINE → NIGHT SHIFT → RIZO INDUSTRIAL**, with visibly escalating production and battlefield art.
- Added **Beacon** as a universal deployable support structure with an always-readable influence field. Rizos inside the strongest field attack faster; later Beacon levels add damage and wider reach.
- Beacon evolves through **WORK LIGHT → SIGNAL LAMP → HALO ARRAY → DAYBREAK CORE → PRIVATE SUN**. Max level becomes a large sun-like battlefield object rather than a copied Village/Temple mechanic.
- Factory and Beacon teach themselves through placement preview copy, persistent field/progress feedback, payout bursts, buff halos, focused structure panels, and upgrade-specific cause/effect messaging.
- Opening economy now creates a real greed choice: the existing 220 starting cash can fund a 160 Factory while leaving only 60, so the player can compound early at the cost of immediate defensive flexibility.
- Duplicate structures use escalating deployment costs and consume field slots, preventing risk-free economy spam.
- Beacon stacking is intentionally non-multiplicative: only the strongest covering Beacon affects a target, reducing solved support stacks.
- Golden Rizo retains a distinct economy identity. Awakened Goldens increase Factory payout (capped), while deployed Factories improve Golden passive income and PAYDAY (also capped).
- Late-game Factory output scales aggressively enough to become intentionally absurd without uncapped multiplicative growth; wave scaling is bounded and support/Golden synergies have caps.
- **Depth pass:** upgraded Factories now build a **clean-production momentum** streak while the Gate stays untouched. A leak breaks the streak, turning survival quality into economy value instead of making Factory upgrades pure number inflation.
- From **PRINT LINE** onward, clean cycles periodically become **RIZO DROPS**: larger, clearly telegraphed payouts rather than identical coin ticks. Higher Factory investment increases both momentum ceiling and drop payoff.
- From **HALO ARRAY** onward, a Beacon that spatially links at least one combat Rizo and one Factory creates a **BRAND LOOP**, shortening the Factory drop cycle. This is learned through positioning, not a new menu or currency.
- A max **PRIVATE SUN** strengthens branded drops, and an **awakened Golden Rizo inside that same live network** creates a non-stacking **GOLDEN LICENSE** for those drops. Global Golden-to-Factory scaling remains capped separately.
- Beacon cadence changes preserve the Factory's in-progress production percentage, so moving into stronger support is felt immediately instead of only after a stale pre-buff cycle finishes.

## Files changed
- `defense-core-v79.js` — added deterministic structure definitions, deployment/upgrade curves, Beacon support model, Factory economy model, and Golden/Factory synergy helpers.
- `game-v79-defense.js` — integrated structures into roster, placement, field slots, rendering, upgrades, selling, live simulation, checkpoint reconstruction, Golden economy behavior, Field Guide/mastery filtering, and QA hooks.
- `worker-b-economy.css` — new isolated Factory/Beacon battlefield art, evolution states, influence/progress feedback, payout feedback, buff halos, structure panel styling, reduced-motion handling, and low-FX handling.
- `index.html` — loads `worker-b-economy.css` after the existing Defense stylesheet.
- `sw.js` — caches/requires the Worker B economy stylesheet in the offline shell and advances the cache key while retaining the current build lineage.
- `tests/browser_harness.py` — includes the Worker B stylesheet in the inline browser harness.
- `tests/worker-b-economy.test.js` — deterministic economy/structure balance tests.
- `tests/browser-worker-b-economy.py` — targeted playable/browser integration tests for structures, support, production, Golden synergy, checkpoint behavior, and runtime errors.
- `tests/browser-worker-b-self-audit.py` — deliberate acceptance audit covering 1x/2x Factory timing, pause/resume, overlapping Beacon fields, low-power semantics, 375×667 phone reachability/panels, and unrelated Defense launch.
- `tests/browser-worker-b-depth.py` — depth/flatness acceptance path covering Brand Loop activation, immediate cadence response, Golden License, clean streak/drop sequencing, leak reset, low-performance suppression, mobile containment, and runtime errors.
- `WORKER_B_MANIFEST.md` — this integration manifest, including final self-audit findings and regression risks.

## Important symbols / systems changed
- Core: `STRUCTURES`
- Core: `structureDefinition(type)`
- Core: `structureDeploymentCost(type, copyCount)`
- Core: `structureUpgradeCost(type, currentUpgradeLevel)`
- Core: `calculateStructureInvestment(type, baseCost, upgradeLevel)`
- Core: `beaconSupport(upgradeLevel)`
- Core: `goldenFactoryMultiplier(count)`
- Core: `factoryEconomy(...)`
- Runtime: `DEFENSE_STRUCTURE_META`
- Runtime: `defenseStructureType(...)`
- Runtime: `defenseStructurePet(...)`
- Runtime: `defenseBeaconNetwork(...)`
- Runtime: `defenseBeaconInfluence(...)`
- Runtime: `defenseFactoryEconomy(...)`
- Runtime: `renderDefenseStructureTower(...)`
- Runtime: `showDefenseStructurePanel(...)`
- Runtime: `updateDefenseFactory(...)`
- Runtime: `updateDefenseBeacon(...)`
- Runtime: `showDefenseFactoryPayout(...)` / `showDefenseBeaconPulse(...)`
- Runtime QA: `defenseEconomyForQA()` and `defenseStructuresForQA()`
- Golden active/passive economy branches now account for Factory count with explicit caps.

## New assets / DOM / CSS / state / schema / hooks
- No external/copied art assets added; structure visuals are original DOM/CSS artwork.
- Added universal pseudo-roster IDs:
  - `defense-structure-factory`
  - `defense-structure-beacon`
- New transient tower state includes `structureType`, `nextProductionAt`, `totalProduced`, `beaconSourceId`, `factoryCleanCycles`, `factoryLivesSnapshot`, and `factoryLastInterval` where applicable.
- New structure DOM hooks include `.defense-structure`, `.defense-structure-factory`, `.defense-structure-beacon`, `.defense-structure-field`, `.defense-structure-art`, `.defense-factory-payout`, `.beacon-buffed`, `.brand-loop`, `.private-sun-network`, `.golden-license`, `.drop-ready`, `.factory-drop`, `.factory-golden-drop`, `.factory-streak-broken`, and upgrade/max-state classes.
- Checkpoint schema version was **not** bumped. Structure identity is reconstructed from the signed `petId`; structure upgrade/spend is canonicalized from signed tower data and deterministic Core cost functions.
- Factory production timers are intentionally transient. On restore, a Factory begins one full current production cadence from the restored clock. This avoids unsigned timer persistence and removes reload-acceleration farming.
- `totalProduced` is run/readout-only cosmetic state and is not persisted.
- Depth state (`factoryCleanCycles`, partial production progress, Brand Loop/Golden License membership) is intentionally derived/transient rather than added to the signed checkpoint schema. Restore therefore restarts a full Factory cycle and a clean streak from zero; spatial network state is recalculated immediately from restored placement.

## Cross-worker dependencies
- **Worker F / wave content:** no ownership taken over wave plans or enemy pacing. Factory wave scaling reads the existing current/cleared wave only. If F changes wave duration materially, re-evaluate Factory payback timing rather than rewriting the structure system.
- **Worker C / collection-loadouts:** structures are pseudo-roster rows for universal deployment, not collectible Rizos. Field Guide/mastery filters already exclude them; preserve that distinction when changing roster/collection code.
- **Worker D / Basic Defense Rizo:** no Basic combat identity changes. Universal structures should remain separate from Basic Rizo implementation.
- **Workers E/I / feel, VFX, art:** may polish structure presentation, but preserve the semantic hooks and readable Factory production/Beacon influence cause-effect.
- **Worker H / UI:** may restyle panels/cards, but retain structure-specific information density and visible support/production feedback.

## Likely merge conflicts
- `defense-core-v79.js` — economy constants/exports and deterministic helper block.
- `game-v79-defense.js` — universal roster construction, tower stat routing, placement/deploy path, tower rendering/panels, update loop, checkpoint reconstruction/canonicalization, Golden active/passive economy, and QA exports.
- `index.html` — one stylesheet link.
- `sw.js` — cache key plus shell/required-shell lists.
- `tests/browser_harness.py` — stylesheet list.
- `worker-b-economy.css` and Worker B test files are isolated/new and should be low-conflict ports.

## Tests run
- `node --check defense-core-v79.js` — PASS — Core syntax.
- `node --check game-v79-defense.js` — PASS — runtime syntax.
- `node --check sw.js` — PASS — service-worker syntax.
- `node tests/defense-core.test.js` — PASS — 31/31 baseline deterministic Core checks.
- `node tests/worker-b-economy.test.js` — PASS — 9/9 targeted economy/depth checks.
- `python3 tests/static-defense-audit.py` — PASS — 80/80 static Defense checks.
- `node tests/service-worker-policy.test.js` — PASS — 4/4 offline policy checks.
- `python3 tests/browser-defense-integration.py` — PASS — 77/77 baseline browser integration checks.
- `python3 tests/browser-defense-surfaces.py` — PASS — 76/76 Defense surface checks.
- `python3 tests/browser-first-ten.py` — PASS — 41/41 opening-run checks.
- `python3 tests/browser-v80-strategy-feel.py` — PASS — 17/17 strategy/feel checks.
- `PYTHONPATH=tests python3 tests/browser-worker-b-economy.py` — PASS — 10/10 targeted Worker B browser checks.
- `PYTHONPATH=tests python3 tests/browser-worker-b-self-audit.py` — PASS — 10/10 deliberate acceptance checks: speed, pause/resume, strongest-only Beacon overlap, low-power structure semantics, 375×667 phone reachability/panels, unrelated Defense smoke.
- `PYTHONPATH=tests python3 tests/browser-worker-b-depth.py` — PASS — 13/13 depth checks: mixed-field Brand Loop, immediate cadence rescheduling, Golden License, periodic drops, clean momentum/leak reset, field readability, low-performance suppression, phone-safe readout, runtime errors.


## Deliberate final self-audit
- **Primary feature path:** PASS. Factory and Beacon deploy, upgrade to their max forms, interact with each other, generate/support during live combat, and remain checkpoint-canonical. Golden Rizo retains separate passive/PAYDAY value and gains bounded Factory interactions.
- **1× / 2×:** PASS. At equal simulation time, Factory payout is identical at 1× and 2×. At equal wall time, 2× produces exactly twice the Factory payout because the simulation advances twice as fast; the payout formula itself does not change.
- **Pause / resume:** PASS. Factory simulation clock and production stay frozen for the full pause and continue after resume without free ticks.
- **Beacon overlap edge case:** PASS. Overlapping Beacons select one strongest field; support does not multiply.
- **Low-power mode:** PASS. Factory art, Beacon art, and Beacon influence field remain semantically present while decorative pressure is reduced.
- **Phone 375×667:** PASS. The Defense roster remains horizontally scrollable; Factory and Beacon can both be brought fully into view with 84px-tall controls. Factory and Beacon inspect/upgrade panels remain inside the 375px viewport with no document-level horizontal overflow.
- **Unrelated Defense:** PASS. Existing browser integration remains 77/77, Defense surfaces 76/76, and first-ten playthrough coverage 41/41. A Worker B smoke path also starts Wave 1 with a normal Rizo plus Factory present and advances combat without runtime errors.
- **Failed Worker B requirements found:** none after the corrected acceptance audit. An early audit probe used artificial 100ms frame slices, which correctly triggered the fixed-step catch-up governor; the final speed test uses 60Hz slices representative of gameplay.

## Manual play observations
- At mobile viewport, max Factory reads as a distinct industrial RIZO building rather than a combat unit.
- Beacon influence is immediately legible as a support circle; max Beacon reads as a bright battlefield sun and nearby Rizos visibly pick up a support halo.
- Factory payout animation makes the income source understandable without opening the panel.
- A Factory inside a max Beacon visibly and mechanically cycles faster, making the support/economy interaction discoverable through play.
- The 160 opening Factory is tempting but leaves little cash, which creates the intended greed-versus-survival tension without removing the baseline free first main-Rizo deployment.

## Known limitations / follow-ups
- On narrow phones, Factory and Beacon come after the main/guest Rizos in the existing horizontal roster, so they are reachable by swipe rather than guaranteed visible on the first bench frame. The controls are fully reachable and touch-sized in the audited 375×667 layout. Reordering or redesigning the roster is intentionally left to Workers C/H rather than being absorbed into Worker B.
- Endless economy scaling is implemented and bounded, but final payback balance still depends on Worker F's merged wave durations/compositions. If F materially changes live-wave duration, re-evaluate Factory payback rather than changing wave content here.
- Factory partial production-cycle progress and clean-streak momentum are intentionally not saved. Reloading/resuming resets that Factory to one full current cadence and zero clean cycles. This conservative anti-exploit choice avoids a checkpoint schema bump; it can cost a player partial progress but cannot accelerate money generation or preserve a drop-ready state through reload.
- `totalProduced` resets after checkpoint restore because it is cosmetic/readout-only.
- Worker E/I/H can further polish art/animation/panel presentation, but economy mechanics and deterministic caps should remain intact unless rebalanced deliberately.

## Depth & flatness pass
### Highest-impact flatness found
1. **Factory upgrades were linear.** Each level mainly changed payout/cadence, so the optimal mental model became "same printer, bigger number."
2. **Beacon investment was linear.** Stronger support was useful but its relationship to Factory/Golden play was solved immediately and mostly lived in panel numbers.
3. **Golden synergy was too invisible.** It was economically valid, but a player could miss why a Golden/Factory network was special during live play.
4. **Late economy lacked a defend-the-greed mastery layer.** Once placed, Factory income did not care whether the player defended cleanly, so greed stopped being an active tension after purchase.
5. **Support cadence could feel delayed.** A Factory retained its old scheduled cycle after a Beacon cadence change, making a mechanically correct buff feel unresponsive.

### Improvements made
- Added clean-production momentum with level-specific step/cap values; any Gate leak immediately breaks the Factory streak.
- Added periodic RIZO DROPS from PRINT LINE onward. Drop cadence and multiplier evolve with Factory investment instead of every upgrade only inflating the same tick.
- Added the placement-driven BRAND LOOP at HALO ARRAY+: one combat Rizo + one Factory inside the same strongest Beacon field. It shortens the drop cycle but does not add another raw combat multiplier.
- Added PRIVATE SUN branded-drop amplification and a spatial, non-stacking GOLDEN LICENSE when an awakened Golden is inside that same loop. The existing capped global Golden multiplier remains separate.
- Added authored field feedback for momentum, drop-ready state, Brand Loop, Private Sun network, Golden License, streak break, and branded payout events. Existing reduced-motion and low-performance tiers suppress the new animations.
- Factory cadence now preserves in-progress work when Beacon support changes, so the support interaction is immediately legible.
- Expanded the structure panel/readout only with state that explains the live mechanic; no branch menu, extra currency, or new recurring control was added.

### Deeper interactions now present
- **Greed ↔ survival:** a player who protects the Gate compounds Factory momentum; a leak has an immediate opportunity cost beyond lives.
- **Investment ↔ event cadence:** PRINT LINE begins drops, later Factory levels increase momentum/drop value, and max Factory becomes a true drop engine rather than only a faster printer.
- **Positioning ↔ economy:** HALO ARRAY+ rewards a deliberately mixed field instead of isolated economy spam; strongest-Beacon-only rules still prevent support multiplication.
- **Beacon ↔ Golden ↔ Factory:** Private Sun + local awakened Golden transforms only branded drops, producing a discoverable top-end combo without making every ordinary payout multiplicative.
- **Repeated-run expression:** solo Factory, Golden-heavy Factory, Beacon-supported Factory, and full licensed network all remain valid investment ladders with different field-slot/cash commitments; local Golden License itself never stacks.

### Restraint decisions
- Level-one Factory and Beacon remain exactly legible as "makes money" and "supports nearby Rizos." Deeper rules unlock only after investment.
- No Factory branch tree, manual drop button, new economy currency, or separate combo meter was added.
- Brand Loop does **not** add another combat damage/rate bonus beyond the existing Beacon support model; its new value is economy-side only.
- Clean momentum is capped and drop cadence bottoms out at two clean cycles. Golden global scaling remains capped, and local Golden License is Boolean/non-stacking.
- The top-end network is intentionally outrageous but expensive: it requires Factory investment, a high-level Beacon, a mixed spatial cluster, an awakened Golden, field capacity, and clean defense.

### Depth-pass merge / regression notes
- New transient runtime fields: `factoryCleanCycles`, `factoryLivesSnapshot`, `factoryLastInterval`; they are intentionally not signed/persisted.
- New QA-visible Factory economy fields: `momentumMultiplier`, `cleanCycles`, `nextCycle`, `dropEvery`, `isDrop`, `dropMultiplier`, `brandLoop`, `privateSun`, `goldenLicensed`.
- New Beacon network calculation is placement-derived each update; strongest-field-only influence remains authoritative.
- Worker F should re-evaluate Factory payback after final Endless wave durations are merged; Worker H/C may change roster ordering; E/I may polish the semantic VFX, but none of those are required for the depth mechanics to function.

## Integration notes
Safest port order onto a common baseline: (1) copy `worker-b-economy.css` and add its `index.html`/service-worker/browser-harness references; (2) port the `STRUCTURES` block and Core structure/economy helpers/exports; (3) port the runtime structure meta/helpers, universal roster insertion, placement/deployment routing, structure renderer/panel/update path, and Beacon combat-stat influence; (4) port Golden Factory synergies and structure exclusions from Rizo-only Field Guide/mastery logic; (5) port checkpoint reconstruction/canonicalization handling while keeping the stable structure IDs; (6) add the four Worker B test files and run the targeted browser/self-audit/depth suites plus baseline Defense integration. Keep `defense-structure-factory` and `defense-structure-beacon` IDs stable so signed checkpoints can reconstruct structures consistently.
