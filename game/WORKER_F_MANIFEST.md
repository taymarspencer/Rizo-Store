# Worker F Manifest

## Scope
Owned enemies, authored wave opposition, boss behavior/remixes, and Endless generation for Rizo Defense. I intentionally did not rebalance universal economy structures, author map mechanics, or take over the broader ability/presentation systems owned by other workers.

## Player-visible changes
- Waves 11–30 are now a second authored chapter instead of generic procedural filler. They progressively ask about cross-traffic targeting, split cleanup, mixed elemental pressure, camouflage/phasing, heavy armor, support priority, and boss preparation.
- Added **Relay Balloon**: nearby non-Relay enemies move 22% faster and gain temporary protection while inside its signal. The support state gets an immediate readable ring/state mark.
- Added **Mender Balloon**: periodically repairs the most wounded nearby non-boss enemy, creating a focus-fire/control target instead of another raw HP body.
- Wave 20 is an authored **Maw** set piece and Wave 30 an authored **Mirror** set piece. Wave 40 introduces **Redline** with a mechanic-matched escort formation.
- Endless now cycles deterministic story formations: support convoy, blackout pack, stampede, moving wall, weather lock, fracture train, triage line, crossfire, milestone gauntlets, recovery waves, and boss remixes.
- Returning bosses escalate their original language rather than only gaining health: Warden changes its guard package, Maw range-collapse grows stronger/faster, Mirror can eventually fracture three ways, and Redline begins dragging surge escorts into the event.
- Boss remix entrances/defeats identify the remix tier. Bosses still receive a dedicated final entrance packet with a pre-boss breath.
- Late difficulty is less HP-inflation-heavy. The health curve is substantially flatter after the authored chapter, while composition, support, boss mechanics, weather coupling, and pacing carry more of the difficulty.
- Endless progression/save sanitation now supports waves through **9,999** instead of the old 250 ceiling, with matching higher long-run kill/damage/perfect-wave bounds.

## Files changed
- `defense-core-v79.js` — authored Waves 11–30, Endless formation/remix generator, boss escort profiles, long-run limits, weather/special-bias pressure hooks.
- `game-v79-defense.js` — Relay/Mender runtime behavior, late durability curve, support targeting/readability, boss remix mechanics, boss announcements/defeat copy, checkpoint-safe support timing.
- `defense-canvas-v79.js` — Relay/Mender identity marks plus Relay-supported and Mender-pulse readability in the canvas renderer.
- `launch-v79-defense-alive.css` — DOM-renderer Relay/Mender silhouettes, support-state feedback, threat preview and field-guide identity.
- `tests/defense-core.test.js` — coverage for authored chapter, deterministic Endless remixes, density bounds, and 9,999-wave generation.
- `tests/static-defense-audit.py` — canonical reward roster count updated from 15 to 17 because Relay and Mender are now canonical enemies.
- `tests/browser-defense-integration.py` — sanitation expectations updated to the new intentional long-run ceilings.
- `tests/browser-v76-rhythm-engine.py` — stale Wave 1 pacing assertion replaced with the exact already-authored Wave 1 packet score; late pacing assertion remains intact.
- `tests/browser-worker-f-endless.py` — Worker F browser smoke covering support behavior, boss set pieces/remixes, gauntlets, density, and four-digit Endless generation.
- `tests/browser-worker-f-self-audit.py` — deliberate acceptance coverage for Worker F mechanics at 1x/2x, pause/resume, late-wave phone runtime, actual remixed boss behaviors, density, and all six existing Defense worlds.
- `tests/browser-worker-f-depth.py` — dedicated depth acceptance for evolving Endless acts, rotating recovery valleys, Relay-collapse payoff, Mender armor repair, checkpoint continuity, and high-tier boss second acts.
- `WORKER_F_MANIFEST.md` — this merge contract plus final self-audit record.

## Important symbols / systems changed
- `DefenseCore.LIMITS.MAX_SUPPORTED_WAVE` → `9999`.
- `DefenseCore.LIMITS.MAX_REASONABLE_KILLS` → `1_000_000`.
- `DefenseCore.LIMITS.MAX_REASONABLE_DAMAGE` → `1_000_000_000_000`.
- `DefenseCore.LIMITS.MAX_REASONABLE_PERFECT_WAVES` → `9999`.
- `authoredSecondChapterPlan()` — explicit Waves 11–30.
- `endlessWavePlan()` — deterministic post-30 formation/remix grammar.
- `createWavePlan()` — routes 1–10 to the existing authored opening, 11–30 to Worker F authored chapter, and 31+ to Endless.
- `defenseHealthScale()` / `defenseDurabilityScale()` — flatter late durability growth with bounded boss remix scaling.
- `DEFENSE_ENEMIES.relay` / `DEFENSE_ENEMIES.mender`.
- `defenseRelaySupport()` / `pulseDefenseMender()`.
- `triggerCrownGuards()`, `triggerVortexPulse()`, `splitMirrorBoss()`, `resolveDefenseBossTelegraph()`, `handleDefenseBossMechanics()` — returning-boss escalation hooks.
- `defenseWavePlan()` — preserves authored boss copy and surfaces Endless remix tier.

## New assets / DOM / CSS / state / schema / hooks
- No external assets and no new DOM nodes were required.
- New enemy type ids: `relay`, `mender`. Integrators merging queue/enemy allowlists must retain both.
- Enemy runtime state now includes `supportAura`, `healer`, `supportCycle`, `relayBoosted`, `supportFlashUntil`, `signalStaggerUntil`, and bounded `bossPhase`.
- `supportCycle`, `signalStaggerUntil`, and `bossPhase` are checkpointed so support cadence, Relay-collapse windows, and boss second acts survive pause/save/restore exactly. They are backward-compatible optional continuation fields under the existing v8 checkpoint contract, so no save-version bump was required; the v8 signature source itself was intentionally not expanded.
- `relayBoosted` and `supportFlashUntil` remain presentation/runtime transients and are intentionally reconstructed rather than persisted.
- New CSS classes: `.balloon-relay`, `.balloon-mender`, `.relay-supported`, `.signal-staggered`, `.mender-flashing`, plus threat-preview / field-guide variants for Relay and Mender.
- Endless consumes existing map `weather` and `specialBias` inputs; no Worker G map mechanic is reimplemented here.
- `pressureTags` / `chapter` metadata are emitted by new core wave plans for future presentation/telemetry consumers but are not required for simulation correctness. Depth-pass Endless plans additionally emit `formationTier`; recovery plans carry a rotating recovery-style pressure tag.

## Cross-worker dependencies
- **G / maps:** Worker F only consumes `weather` and `specialBias`. If G exposes stronger route/weather pressure hooks, wire them into `endlessWavePlan()` rather than duplicating map behavior.
- **E / abilities & VFX:** Relay/Mender and boss remix mechanics expose readable state already, but E may layer stronger VFX over `relayBoosted`, `supportFlashUntil`, boss telegraphs, and boss-remix announcements without changing combat math.
- **H/I / presentation/audio:** boss remix titles, support enemy classes, telegraph state, and `pressureTags` are safe presentation hooks. Current visuals are deliberately minimal and performant.
- **B / economy:** no starting cash, structure income, Golden cap, wave bonus, deployment cost, or economy constant was changed. Enemy reward math remains the shared core implementation.

## Likely merge conflicts
- High: `defense-core-v79.js` around `LIMITS`, `createWavePlan()`, and packet/wave generation.
- High: `game-v79-defense.js` around `DEFENSE_ENEMIES`, `DEFENSE_THREAT_PRIORITY`, checkpoint enemy canonicalization, `spawnDefenseEnemy()`, enemy update loop, and boss mechanics.
- Medium: `defense-canvas-v79.js` inside `drawEnemy()` if another worker also changes enemy art.
- Medium: `launch-v79-defense-alive.css` around balloon identity styles / threat minis / field guide.
- Low: test expectation files, unless the integrator changes long-run ceilings or canonical enemy count.

## Tests run
- `node -c defense-core-v79.js` — PASS.
- `node -c game-v79-defense.js` — PASS.
- `node -c defense-canvas-v79.js` — PASS.
- `node tests/defense-core.test.js` — PASS, **34/34**.
- `python tests/static-defense-audit.py` — PASS, **80/80**.
- `node tests/service-worker-policy.test.js` — PASS, **4/4**.
- `PYTHONPATH=tests python tests/browser-worker-f-endless.py` — PASS, **10/10**.
- `PYTHONPATH=tests python tests/browser-first-ten.py` — PASS, **41/41**; existing opening balance/outcomes remain deterministic at 1x, 2x, and low-power.
- `PYTHONPATH=tests python tests/browser-defense-integration.py` — PASS, **77/77** after updating intentional long-run ceiling expectations.
- `PYTHONPATH=tests python tests/browser-v80-strategy-feel.py` — PASS, **17/17**; late boss wave remains density-bounded and includes durable Heavy threats.
- `PYTHONPATH=tests python tests/browser-v76-rhythm-engine.py` — PASS, **14/14** after correcting its stale Wave 1 assertion to the baseline's exact authored `.95/.72` opening packet timing.
- `PYTHONPATH=tests python tests/browser-launch-recovery.py` — PASS, **5/5**; foreground recovery and runtime-loss recovery remain intact.
- `PYTHONPATH=tests python tests/browser-defense-surfaces.py` — PASS, **76/76** across 320×568, 390×844, 844×390, and 768×1024 surface containment/legibility checks.
- `PYTHONPATH=tests python tests/browser-v78-canvas-flow.py` — PASS, **11/11**; Canvas combat, fallback, density, and visual-budget behavior remain intact.
- `PYTHONPATH=tests python tests/browser-worker-f-self-audit.py` — PASS, **16/16**; Worker F support mechanics match at equal simulation time in 1x/2x, pause freezes and resume continues Relay/Mender state, Wave 40 runs on a 390×844 phone canvas within density budget, all four returning boss remixes execute their escalated mechanics, and all six unlocked Defense worlds still launch/place/start Wave 1.
- `PYTHONPATH=tests python tests/browser-worker-f-depth.py` — PASS, **13/13**; verifies formation-tier evolution, three rotating recovery valleys, Relay kill payoff, Mender armor repair, new checkpointed support state, bounded Warden second act, Mirror phase echoes, Maw support pulls, and Redline lane-switch escorts.
- `PYTHONPATH=tests python tests/browser-v79-consumer-pass.py` — **18/20 on Worker F and 18/20 on the untouched baseline**. The same two pre-existing stale UI-copy assertions fail in both builds (`POWER/RANGE` wording and an old `READ THE ROAD` Wave 1 preview phrase), so they are documented rather than changed outside Worker F ownership.

## Deliberate final self-audit
- Re-read Worker F scope against the implementation after packaging. Enemy roles/counters, authored Waves 11–30, boss escalation, Endless remix rules, weather/special-bias hooks, flatter late durability, spawn density, and save/checkpoint bounds are all represented.
- **1x/2x:** Relay movement and Mender healing produced identical state at equal simulation time (4.0s) in 1x and 2x. Existing full Waves 1–10 also remain outcome-identical at 1x/2x/low-power.
- **Pause/resume:** while paused, simulation clock, Relay-boosted target progress, and Mender target HP remained frozen; after resume, movement/healing continued normally.
- **Phone:** actual Wave 40 runtime was exercised at 390×844 with Canvas enabled; shell/stage stayed inside the viewport, no page errors occurred, and observed active enemies stayed below the canonical density cap.
- **Bosses:** high-tier Warden, Mirror, Redline, and Maw remix mechanics were restored through signed checkpoints and executed in live simulation, verifying support guards, three-way fracture, surge escorts, and accelerated Maw repeat timing.
- **Unrelated Defense:** with worlds unlocked through QA state (not bypassing production lock rules), Grove/Ember/Moon/Storm/Blizzard/Eclipse each launched, placed a Rizo, and entered Wave 1 without runtime errors. Canvas flow, launch recovery, strategy/feel, surfaces, checkpoint/save, service worker, and first-ten suites remain green.
- No verified Worker F regression required a gameplay fix during this final audit. One initially failing cross-map audit was a test-setup mistake (locked maps correctly fell back to Grove); the audit was corrected to unlock worlds through state rather than altering production progression.

## Manual play observations
- Wave 17 preview clearly introduces Relay as a target-priority problem; affected traffic gains the support read on the same simulation step the buff activates.
- Wave 18 Mender successfully healed a nearby wounded Iron Balloon from 10 to 17.5 HP during deterministic browser simulation. In the depth pass, Mender also restores partially shredded armor (but never resurrects fully broken plating), and a nearby Relay shortens its triage cycle from 3.6s to 3.0s.
- Wave 40 Redline preview contains Fleet/Storm plus Relay, Mender, Brick and Lead while remaining at 12 planned enemies and preserving the dedicated boss entrance beat.
- Wave 50 returns Warden at remix intensity 1; Wave 100 reaches remix intensity 2.
- Wave 75 resolves to the milestone Endless Gauntlet with both Relay and Mender represented.
- Wave 9,999 generated deterministically as a 28-threat, 3-packet formation; no screen-density explosion was introduced.

## Known limitations / follow-ups
- The broad `browser-v79-consumer-pass.py` suite remains 18/20, exactly matching the untouched baseline. Its two failing expectations are stale UI wording checks outside Worker F jurisdiction; no UI rewrite was performed for them.
- “Effectively unlimited” is implemented as a practical signed-save ceiling of Wave 9,999 rather than an unbounded JavaScript integer. This is intentionally far beyond normal play while keeping imported/save state finite and auditable.
- Boss remix intensity is capped at 12 for health/mechanic safety. Endless continues changing formation/archetype/weather combinations after that cap instead of letting boss multipliers grow without bound.
- Relay and Mender use minimal Worker F readability art. E/H/I can intensify their VFX/audio language without touching the mechanics.
- Worker F does not author new map mechanics; future G hooks should be consumed as composition modifiers rather than copied into this system.

## Integration notes
Safest merge order: port `defense-core-v79.js` wave/limit changes first; then add the `relay`/`mender` enemy definitions and runtime support helpers in `game-v79-defense.js`; then merge boss-remix changes; finally merge canvas/CSS readability and tests. Preserve the existing v8 checkpoint signature/version. If another worker changed `createWavePlan()`, retain the invariant that Waves 1–10 stay untouched, Waves 11–30 remain explicit authored questions, bosses reserve the final entrance packet, and 31+ formations remain deterministic and bounded. If another worker changed enemy HP/rewards, prefer their economy-owned numbers but retain Worker F's flatter late scaling and composition-led Endless structure.
## DEPTH & FLATNESS PASS

### Flatness/issues discovered
1. **Endless archetypes were strategically named but too flat internally.** Once a player learned “kill support / answer armor / answer speed,” later instances mostly reshuffled the same ingredient list. The labels evolved faster than the actual formation grammar.
2. **Relay and Mender were useful but their strongest effects were mostly invisible math.** Relay removal simply removed a multiplier; Mender mostly restored HP. Correct target priority existed, but the payoff for executing it was not memorable enough.
3. **Returning bosses escalated mostly by more/faster.** Their original mechanics were preserved, but high remix tiers lacked a true second act, and Redline’s repeated escort creation could continue indefinitely during a long fight.
4. **Every post-boss recovery wave was the same.** The valley was useful, but repetition made the Endless structure feel procedural rather than authored.

### Improvements made
- Replaced flat post-30 enemy-list shuffles with `endlessFormationPackets()`: each archetype now arrives as a readable sequence of three authored acts (four for the milestone Gauntlet). Later formation tiers alter composition and pacing while preserving packet/density bounds.
- Added three rotating recovery profiles — **Aftershock**, **Open Road**, and **Patch Window** — with two quick packets and one clear breath. A broader rhythm test caught the first version being too slow, so cadence was restrained to `.34/.32` spawn gaps with a `2.25s` midpoint breath.
- Killing a Relay now triggers a **1.05s signal collapse** on its nearby convoy. Affected traffic temporarily runs at `0.72×` movement, drops stale Relay-supported presentation immediately, and receives a broken-signal read in both DOM and Canvas renderers.
- Mender now prioritizes recoverable shredded armor before ordinary chip healing. It can restore plating that has not fully broken, while fully broken armor stays broken. A Relay-linked Mender cycles at **3.0s** instead of **3.6s**, making the two support enemies a real combination rather than independent buffs.
- Added bounded high-tier boss second acts: **Warden** can call one final self-supporting Brick/Relay/Mender guard at low HP; **Maw** can pull limited Relay/Mender support through later range collapses; **Mirror** can hide Ghost/Shade echoes inside a late three-way fracture; **Redline** alternates fast-signal and armored-repair escort language at high tier.
- Capped Redline escort creation to the first four resolved surges and capped Maw support pulls to three eligible pulses. Bosses can stay alive indefinitely without turning “depth” into unbounded spawn pressure.
- Persisted `supportCycle`, `signalStaggerUntil`, and `bossPhase` in checkpoint continuation state so the deeper mechanics remain deterministic across pause/save/restore without invalidating existing v8 signatures.

### Deeper interactions now present
- **Relay → Mender:** Relay speeds Mender triage, so killing the signal indirectly slows both movement pressure and sustain.
- **Armor shred ↔ Mender:** partially cracked armor can be repaired, creating a timing window: finish the break or eliminate/isolate the Mender before investing more damage. A fully broken plate cannot be magically rebuilt.
- **Relay death → convoy vulnerability:** correct target priority creates an immediate short control window that can rescue a leaking lane or amplify a burst window.
- **Formation mastery:** the same Endless archetype develops over the run instead of merely receiving larger stats; later acts deliberately combine support with armor, phase/camo, weather, or speed.
- **Boss phase ↔ support language:** late boss remixes reuse the normal enemy vocabulary the player already learned, then recombine it into boss-specific second acts instead of introducing unreadable one-off rules.

### Anything intentionally left simple and why
- Recovery waves stay **easy and low-synergy**. They now rotate texture, but they intentionally avoid Relay/Mender chains, bosses, or dense elite puzzles because their job is to create a planning valley, not another exam.
- No third support enemy, new currency, permanent modifier tree, or random affix system was added. The existing enemy vocabulary had enough unused combinatorial depth; expanding the roster would have increased explanation burden more than strategy.
- Boss second acts are late-tier and bounded. Early boss appearances remain clean enough to teach the core mechanic before Endless starts remixing it.
- Worker F presentation remains lightweight: a signal-collapse cue, existing impact hooks, boss copy/state, and Canvas marks. Larger spectacle belongs to E/I/H.

### Remaining opportunities outside Worker F jurisdiction
- **E / I:** stronger bespoke VFX, audio stingers, and haptics for Relay collapse, armor repair, Mirror echoes, Warden last guard, Maw pulls, and Redline lane switches.
- **H:** stronger non-text visual hierarchy for late formation/boss-phase intel if the shared UI pass wants to surface `formationTier`, `pressureTags`, or `bossPhase`.
- **G:** world-native route/weather hooks can feed Worker F composition pressure so the same formation behaves differently by map without Worker F duplicating map mechanics.
- **B:** economy tuning may eventually decide whether support-heavy waves deserve reward adjustments; this pass deliberately did not alter global income, wave bonuses, structures, starting cash, or reward formulas.

### Restraint check
- Removed the contradictory post-Relay frame where an enemy could display both `relay-supported` and `signal-staggered`; Relay state is recomputed immediately when the source dies.
- The first recovery redesign was rejected by the existing rhythm suite because it created dead air. It was simplified/faster rather than defending extra complexity.
- All new boss summons are count-bounded; no new mechanic bypasses the canonical active-enemy density limit or child-spawn queue.
- Deeper rules are learnable through existing cause/effect: pop signal → convoy visibly stutters; Mender pulse → cracks disappear; returning boss → familiar support enemies join its established mechanic. No tutorial wall is required.
- Ownership remains limited to enemies, waves, bosses, Endless, minimal readability hooks, deterministic save state, and Worker F QA. No economy/map/tower/ability/UI redesign was performed.

### Regression checks rerun after depth changes
- JS syntax (`defense-core-v79.js`, `game-v79-defense.js`, `defense-canvas-v79.js`) — PASS.
- `node tests/defense-core.test.js` — **34/34 PASS**.
- `python tests/static-defense-audit.py` — **80/80 PASS**.
- `node tests/service-worker-policy.test.js` — **4/4 PASS**.
- `PYTHONPATH=tests python tests/browser-worker-f-endless.py` — **10/10 PASS**.
- `PYTHONPATH=tests python tests/browser-worker-f-self-audit.py` — **16/16 PASS**.
- `PYTHONPATH=tests python tests/browser-worker-f-depth.py` — **13/13 PASS**.
- `PYTHONPATH=tests python tests/browser-first-ten.py` — **41/41 PASS**.
- `PYTHONPATH=tests python tests/browser-v80-strategy-feel.py` — **17/17 PASS**.
- `PYTHONPATH=tests python tests/browser-v76-rhythm-engine.py` — **14/14 PASS** after simplifying the initial over-slow recovery cadence.
- `PYTHONPATH=tests python tests/browser-defense-integration.py` — **77/77 PASS**.
- `PYTHONPATH=tests python tests/browser-v78-canvas-flow.py` — **11/11 PASS**.
- `PYTHONPATH=tests python tests/browser-launch-recovery.py` — **5/5 PASS**.
- `PYTHONPATH=tests python tests/browser-defense-surfaces.py` — **76/76 PASS** across phone, landscape, and tablet targets.
- `PYTHONPATH=tests python tests/browser-v79-consumer-pass.py` — **18/20**, matching the untouched baseline’s same two stale UI-copy assertions. No Worker F fix was made outside jurisdiction.

