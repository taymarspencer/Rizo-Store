# WORKER D MANIFEST — UNIVERSAL DEFENSE TOWERS

## Scope

Worker D owns the universal combat-tower layer for Rizo Defense. This pass implements the **Basic Defense Rizo** as a true Defense-only universal tool with its own deployment economy, upgrade curve, targeting implications, behavioral branch evolution, and battlefield art states.

This pass deliberately does **not** edit Worker B's Clothing Factory or Beacon, Worker C's owned/collected Rizo roster rules, Worker E's major elemental/ability spectacle, or Worker I's final motion/audio polish.

No additional filler combat tower was added. The Basic Defense Rizo supplies the missing cheap baseline shooter while the existing shared plan already assigns universal economy/support jobs to Clothing Factory and Beacon. Keeping one Worker-D universal combat archetype preserves the intended distinction: **owned Rizos are characters; universal towers are tools.**

## Player-visible changes

- Added **BASIC DEFENSE RIZO** to the Defense deployment bench as an explicit universal tool, separate from owned/guest characters.
- Initial deploy cost: **$85**. Additional Basic Defense Rizo copies increase by **$20** each.
- Its four upgrade prices are **$70 / $125 / $230 / $430**.
- The visual progression is intentionally dramatic:
  - **LV 1 — BLANK FRAME:** almost-empty paper/ink Rizo with no inner path color.
  - **LV 2 — STITCHER:** visible stitching, harness, and first launcher hardware.
  - **LV 3 — FIELD KIT:** larger silhouette, stronger frame, exposed utility hardware, and path choice.
  - **POWER LV 4 — BOLT DRIVER / LV 5 — RIVET CROWN:** heavy orange armor and a much larger rivet weapon silhouette.
  - **CONTROL LV 4 — PIN WHEEL / LV 5 — THREADSTORM:** teal pin rig, control antenna, and a large thread-halo silhouette.
- Upgrades materially change behavior rather than only scaling numbers:
  - At LV 2, every fourth shot becomes a **double-stitch**: a visibly doubled tracer that forks into a second nearby threat when one is available.
  - At LV 3, the tower chooses a permanent **POWER** or **CONTROL** doctrine.
  - **POWER** defaults to **STRONG** targeting and becomes a setup/payoff armor specialist. LV 4 ordinary rivets begin shaving armor; charged rivets hit restrained targets harder; **RIVET CROWN** charges more often and deliberately hunts nearby armored/high-threat side targets instead of generic splash.
  - **CONTROL** defaults to **FIRST** targeting, fires faster/longer-range pins, slows and reveals threats, then learns to thread control through the lane. LV 4 passes a charged pin into one fresh/unrestrained neighbor; **THREADSTORM** expands that web to three and gains a stronger lock/rewind payoff on armor already opened by another defender.
- Projectile identity now evolves with the tower: neutral **needle**, POWER **rivet**, CONTROL **pin**. Both DOM and production canvas renderers have dedicated art for all three.
- The universal tool is explicitly not a collected character:
  - cannot become **Field Leader**;
  - has **no field active ability**;
  - cannot **Ascend/Super Rizo**;
  - gains no permanent **Defense mastery**;
  - cannot take permanent **MVP identity** away from an owned Rizo.
- The opening roster hint now makes the intended first-run choice legible: the player's active Rizo is free to field, while Basic Defense Rizo is the cheap universal backup.

## Files changed

- `game-v79-defense.js`
  - universal tool definition and synthetic Defense-only pet record;
  - deployment-row integration;
  - deployment/upgrade pricing;
  - stats, branch behavior, targeting defaults, hit effects;
  - checkpoint restoration/investment recognition;
  - panel, roster, battlefield render integration;
  - character-boundary safeguards for Field Leader, abilities, ascension, mastery, and MVP.
- `defense-canvas-v79.js`
  - dedicated needle/rivet/pin projectile drawing in the production canvas renderer;
  - double-stitch tracer state so the LV 2 mechanic remains readable in the production renderer.
- `worker-d-towers.css` **(new)**
  - isolated visual evolution system for LV 1–5 neutral/POWER/CONTROL Basic Defense Rizo states;
  - roster/panel differentiation for universal tools;
  - dedicated DOM projectile visuals, double-stitch tracer, and short-lived stitch/rivet/thread connection lines. The depth pass deliberately leaves final motion/audio treatment to Worker I.
- `index.html`
  - loads `worker-d-towers.css` after the existing arcade/Defense style layers.
- `sw.js`
  - includes `worker-d-towers.css` in required shell caching.
- `tests/browser-worker-d-towers.py` **(new)**
  - Worker-D-specific browser integration suite.
- `WORKER_D_MANIFEST.md` **(new)**
  - this integration/merge record.

## Important symbols/systems changed

### New Worker D symbols

- `DEFENSE_BASIC_TOWER`
- `DEFENSE_BASIC_PET`
- `defenseUniversalDeployRows()`
- `defenseDeployRows()`
- `defenseIsUniversalPet()`
- `defenseIsUniversalTower()`
- `defenseUniversalDeployCost()`
- `defenseTowerDisplayColor()`
- `defenseBasicVisualMarkup()`
- `defenseDeployPortraitMarkup()`
- `defenseTowerPortraitMarkup()`

### Existing systems extended with universal-tool handling

- `defenseCheckpointRosterRegistry()`
- `defenseCanonicalTowerSnapshots()` / Defense checkpoint restore path
- `defenseDeployCost()`
- `defenseTowerStats()`
- `defenseCombatStats()`
- `defenseUpgradeCost()`
- `defenseUpgradeName()`
- `defenseUpgradeMove()`
- `defenseRosterMarkup()`
- `renderDefenseTower()`
- `showDefenseTowerPanel()`
- `upgradeDefenseTower()`
- `chooseDefenseDoctrine()`
- `fireDefenseTower()`
- `applyDefenseHit()`
- `defenseFieldLeader()`
- `defenseReadyAbilities()`
- `defenseCanAscend()`
- `recordDefenseRun()` and Defense result MVP selection
- Defense QA placement/doctrine helpers

## New assets/DOM/CSS/state/schema/hooks

### Assets

- No binary image/audio assets were added.
- All Basic Defense Rizo evolution art is authored from existing DOM/CSS primitives so later workers can animate or replace details without introducing an asset pipeline dependency.

### DOM/CSS hooks

Important classes include:

- `.defense-roster-universal`
- `.defense-universal-tower`
- `.defense-basic-rizo`
- `.basic-evo-0` through `.basic-evo-4`
- `.basic-path-neutral`
- `.basic-path-power`
- `.basic-path-control`
- Worker-D shot classes for needle/rivet/pin states

These classes expose stable visual-state hooks for Worker I. POWER and CONTROL silhouettes are structurally different, not simple palette swaps.

### Combat/projectile hooks

New projectile kinds:

- `needle`
- `rivet`
- `pin`

`rivet` and `pin` are selected by doctrine and carry their corresponding Worker-D behavioral logic in the existing deterministic projectile/hit pipeline.

### Save/checkpoint schema

- **No save schema version bump.**
- The Basic Defense Rizo uses the existing tower snapshot shape with a recognized synthetic `petId` (`defense-tool-basic`).
- Canonical checkpoint restoration understands its deployment and upgrade investment independently from character/world-perk pricing.
- `_multiagent/BASELINE_SHA256.txt` is intentionally preserved as baseline provenance, not rewritten as an output hash.

## Cross-worker dependencies

### Worker B — Economy & Structures

- Worker B should preserve `DEFENSE_BASIC_TOWER` pricing/behavior ownership while integrating Clothing Factory/Beacon work.
- Basic Defense Rizo intentionally remains a combat tower; no Worker-D changes were made to Factory or Beacon.
- If Worker B retunes global starting cash or universal economy, re-evaluate the **85 / +20 copy / 70-125-230-430 upgrade** curve in integrated play, but preserve the branch behavior contract unless deliberately coordinated.

### Worker C — Main Rizo / Collection / Roster

- `defenseRoster()` remains character/collection territory.
- Worker D adds `defenseDeployRows()` as the battlefield bench composition layer so a universal tool can coexist without masquerading as a collected Rizo.
- Preserve the safeguards that universal towers cannot receive character mastery, Field Leader, active-power, Super Rizo, or persistent MVP identity.

### Worker E — Abilities / Elemental Spectacle

- Basic Defense Rizo intentionally has **no active field power** and no large elemental spectacle.
- Worker E should not need to attach an ability to `defense-tool-basic`.

### Worker I — Motion / Audio Feel

- Worker-D CSS supplies restrained authored attack/evolution states and stable class hooks only.
- Worker I can add final recoil timing, impact feel, audio, particles, or branch-specific polish while keeping projectile kinds and gameplay timing deterministic.

## Likely merge conflicts

`game-v79-defense.js` is the main shared hot file. The highest-risk overlap areas are:

- roster/bench composition;
- tower rendering and inspector panel;
- deploy and upgrade cost helpers;
- doctrine selection;
- projectile firing and hit resolution;
- Field Leader/ability eligibility;
- run-record/mastery/MVP bookkeeping;
- checkpoint roster restoration.

`defense-canvas-v79.js` may conflict with workers adding projectile/impact draw branches.

`index.html` and `sw.js` may conflict trivially if other workers add their own CSS/assets. Merge the shell entries rather than replacing another worker's additions.

**Recommended merge strategy:** port the Worker-D constants/helpers and the scoped `defenseIsUniversal*` branches into the integrated hot files, then include `worker-d-towers.css` and its shell-cache entry. Do not wholesale replace later shared files if another worker has touched the same regions.

## Tests run

A deliberate post-implementation self-audit was run on the final Worker-D tree. It covers the primary deploy → upgrade → doctrine → max-form path, duplicate pricing, actual branch hit effects, 1x/2x determinism, pause/resume, portrait and short-landscape phone geometry, valid checkpoint restoration, production canvas rendering, launch recovery, and unrelated first-ten Defense play.

Final regression suites:

- `node --check game-v79-defense.js` — **PASS**
- `node --check defense-canvas-v79.js` — **PASS**
- `node tests/defense-core.test.js` — **31/31 PASS**
- `python tests/static-defense-audit.py` — **80/80 PASS**
- `node tests/service-worker-policy.test.js` — **4/4 PASS**
- `python tests/browser-v78-canvas-flow.py` — **11/11 PASS**
- `python tests/browser-defense-integration.py` — **77/77 PASS**
- `python tests/browser-first-ten.py` — **41/41 PASS**
- `python tests/browser-launch-recovery.py` — **5/5 PASS**
- `python tests/browser-worker-d-towers.py` — **54/54 PASS**

Worker-D-specific audit assertions include:

- $85 first deploy, +$20 duplicate scaling, and $70/$125/$230/$430 upgrade curve;
- LV1 blank frame → LV2 forked double-stitch → permanent POWER/CONTROL choice → visually distinct max forms;
- LV2 double-stitch actually reaches a second nearby threat, not merely a hidden damage multiplier;
- POWER defaults STRONG, LV4 ordinary rivets gain armor shaving, charged rivets pay off prior restraint, and RIVET CROWN prioritizes armored side targets;
- CONTROL defaults FIRST, LV4 threading prefers an unrestrained neighbor, opened armor deepens its apex lock/rewind, and THREADSTORM controls three nearby threats;
- equal simulated time produces identical Worker-D shots/damage/enemy state at 1x and 2x;
- once pause is active, Worker-D simulation/projectile state remains frozen and resumes cleanly;
- 320x568 portrait keeps the universal roster row and action sheet inside the viewport;
- at 844x390 landscape, Worker D's max silhouette is capped to the stock 76px tower height so it adds **no extra** clipping beyond the shared baseline top-row behavior;
- universal towers cannot become Field Leader, use character actives, Ascend, create collection mastery, or become persistent MVP;
- a valid signed checkpoint restores the synthetic universal `petId`, LV5 investment, POWER doctrine, and in-flight rivet identity.

## Manual play observations

- Baseline starting cash of **$220** creates useful first-minute choices without replacing the player's main Rizo:
  - active/main Rizo can still take its intended free first deployment;
  - one Basic Defense Rizo costs $85 and its first upgrade costs $70, leaving meaningful reserve;
  - two Basic Defense Rizos cost $85 + $105, allowing a low-tech quantity opening but consuming most starting cash.
- LV 1 reads as intentionally blank/anonymous; LV 3 visibly becomes field equipment; max POWER and max CONTROL are immediately distinguishable at battlefield scale.
- POWER's default strongest-target behavior reinforces its armor/heavy-threat job without requiring tutorial text.
- CONTROL's default first-target behavior makes its slow/root/rewind kit naturally protect the front of the lane.
- The existing owned-Rizo roster remains the source of personality, Field Leader play, active abilities, mastery, and ascension. The universal tower feels useful without competing for those character privileges.

## DEPTH PASS — dedicated flatness review

### Flatness/issues discovered

1. **LV 2 was functionally noticeable but conceptually shallow.** The original double-stitch was mostly a fourth-shot multiplier, so its name promised a spatial idea that the battlefield did not actually deliver.
2. **LV 4 risked feeling like a hallway to LV 5.** Both branches had strong stat growth, but the penultimate investment did not create enough new decision texture by itself.
3. **Branch splash/control resolved too generically.** POWER and CONTROL looked different, but their secondary effects still leaned toward “special shot plus nearby units,” which flattened target-reading and positioning mastery.
4. **The tree had too little setup/payoff interaction.** A player could understand POWER or CONTROL in isolation without discovering many reasons to combine two Basic Defense Rizos or pair them with compatible collected-Rizo effects.
5. **Some branch identity lived more in inspector copy than on the trail.** The important relationship between “stitch,” “rivet,” and “thread” needed to be visible in projectile/connection behavior instead of explained only with words.

### Improvements made

- **STITCHER now stitches.** Every fourth LV 2+ shot still lands harder, but when another threat is close it visibly forks from the primary hit and deals a secondary strike. The DOM tracer gains a doubled stitch line and the canvas renderer mirrors that state.
- **LV 4 now changes behavior before the apex.** POWER ordinary rivets begin shaving armor on every hit. CONTROL charged pins begin passing thread into one nearby threat, preferring a threat that is not already meaningfully restrained.
- **POWER became a real payoff branch.** Charged rivets hit already-slowed/rooted targets harder. At LV 5, RIVET CROWN fires its doctrine strike every third shot and its side rivets rank nearby targets by armor/threat instead of blindly using nearest splash.
- **CONTROL became a real coverage branch.** At LV 5, THREADSTORM expands the charged pin into a three-target control web. If armor was already opened, the primary pin roots longer and rewinds farther; opened threaded neighbors also receive a slightly stronger lock.
- Added small, budget-governed **stitch/rivet/thread connection lines** using the existing effect pool/chain renderer. During the restraint check, a custom link animation was removed; the line itself communicates the mechanic and keeps final motion feel in Worker I's lane.
- Upgrade-preview copy now tells the player what LV 4 and LV 5 actually *do*, rather than describing effects that were already unlocked.

### Deeper interactions now present

- **CONTROL → POWER setup:** slows/roots from a CONTROL Basic Defense Rizo—or compatible existing Rizo control—prime a stronger charged POWER rivet.
- **POWER → CONTROL setup:** armor opened by POWER or an existing armor-breaker primes CONTROL for a deeper root/rewind.
- **Same-tool cadence mastery:** double-stitch runs every fourth shot; max POWER charges every third shot, creating a large twelve-shot cadence overlap, while max CONTROL intentionally folds its fourth-shot doctrine strike into the double-stitch rhythm. This is discoverable through repeated play without another UI meter.
- **Threat-shape mastery:** RIVET CROWN wants dense armored formations; CONTROL threading rewards lanes where multiple fresh threats pass close together. Placement at bends therefore matters more than raw DPS placement.
- **Waste avoidance:** CONTROL's LV 4 thread prefers an unrestrained nearby target, so stacking control does not simply re-apply the same lock when a fresh threat is available.

### Intentionally left simple

- **LV 1 remains a plain straight shooter.** The assignment specifically calls for a cheap Dart-Monkey-like baseline and for personality to be earned through investment.
- No combo meter, stitch resource, proc counter UI, extra currency, active ability, or second Worker-D tower was added. Those would make the universal tool compete with the player's owned Rizo instead of supporting it.
- The doctrine choice remains one permanent POWER/CONTROL decision. Depth comes from targets, cadence, positioning, and field interactions rather than a nested skill tree.
- Link feedback is intentionally minimal and audio-free. Worker I still owns premium motion/audio feel; Worker E still owns major spectacle.

### Remaining opportunities outside Worker D jurisdiction

- **Worker I:** premium recoil, impact audio, thread/rivet sound language, and final motion timing can make the newly visible seam moments feel even more memorable without changing combat math.
- **Worker B:** Factory/Beacon integration may create additional economy/support combinations; Worker D did not alter those structures.
- **Worker C:** collected-Rizo balance determines how often existing slow/root/armor-break kits naturally set up the new Worker-D payoffs; no collected-Rizo behavior was edited here.
- **Worker E:** any large apex spectacle or elemental presentation remains intentionally untouched.
- **Worker J:** the previously documented shared v8 mid-flight checkpoint signing edge remains a cross-system QA/save concern and was not broadened into this depth pass.

### Restraint check

- Removed the depth pass's first custom connection-line animation; retained only a short-lived line using the existing effect budget.
- No new persistent state, resource, tutorial modal, roster slot type, or save-schema version was introduced. `doubleStitch` is only an optional in-flight projectile continuation flag.
- All new targeting and combo logic reads existing enemy state and stays inside Worker D's universal tower hit path.
- Character mastery, Field Leader, active powers, Super Rizo, Factory/Beacon, collected-Rizo behavior, and major ability spectacle remain untouched.
- Mobile layout dimensions and the prior short-landscape cap are unchanged.

### Regression checks rerun after the depth mechanics

- `node --check game-v79-defense.js` — **PASS**
- `node --check defense-canvas-v79.js` — **PASS**
- `node tests/defense-core.test.js` — **31/31 PASS**
- `python tests/static-defense-audit.py` — **80/80 PASS** (rerun again after the restraint simplification)
- `node tests/service-worker-policy.test.js` — **4/4 PASS**
- `python tests/browser-worker-d-towers.py` — **54/54 PASS**
- `python tests/browser-v78-canvas-flow.py` — **11/11 PASS** (rerun again after the restraint simplification)
- `python tests/browser-v80-strategy-feel.py` — **17/17 PASS**
- `python tests/browser-defense-integration.py` — **77/77 PASS**
- `python tests/browser-first-ten.py` — **41/41 PASS**
- `python tests/browser-launch-recovery.py` — **5/5 PASS**

## Known limitations/follow-ups

### Assignment re-read / self-audit status

- **Failed Worker-D requirements:** none found after the second audit.
- **Intentionally partial by boundary:** final recoil/audio/impact polish remains Worker I territory; major ability/elemental spectacle remains Worker E territory; Factory/Beacon remain Worker B territory.
- **Additional universal combat tower:** intentionally not added. The assignment explicitly asked for restraint, and Basic Defense Rizo plus the planned Factory/Beacon plus owned Rizos already cover the baseline kit without filler.
- **Integrated balance:** prices and branch numbers should be rechecked after Workers B/C are merged because economy pacing and roster power can change first-ten pressure. Worker-D values are centralized in `DEFENSE_BASIC_TOWER`.

### Regression risks discovered during audit

- **Shared short-landscape top-row edge:** the baseline stock tower silhouette already extends roughly 6–7px above the battlefield at the highest auto-placement row on 844x390. Worker D initially added about 1px because its max form was 77px tall. This pass caps only Worker D's max form to the stock **76px** height in short landscape, so Worker D no longer worsens the baseline condition. The global placement anchor was not changed because that is shared UI/placement territory.
- **Shared v8 mid-flight checkpoint signing edge:** serializing a checkpoint with an in-flight projectile and then reading it through the normal signed path can sanitize both a stock owned-Rizo tower and the universal tower. This reproduces on the baseline behavior, so it is not a Worker-D regression and was not broadened into a save-security rewrite. Worker D was separately verified against a valid signed checkpoint: universal level, doctrine, investment, and rivet identity restore correctly. **Worker J should own the shared serialization/signature follow-up.**
- Final attack motion, audio, and premium impact polish are intentionally restrained for Worker I.
- Major ability/elemental spectacle is intentionally absent for Worker E.
- Clothing Factory and Beacon are intentionally untouched for Worker B.

## Integration notes

1. Preserve the root-level `worker-d-towers.css` file and its `index.html` load order.
2. Preserve its `sw.js` shell-cache entry.
3. Merge `DEFENSE_BASIC_TOWER`, `DEFENSE_BASIC_PET`, and the universal/deploy-row helper layer before merging downstream cost/render/combat branches.
4. Preserve `defenseRoster()` as the character-facing collection roster; use `defenseDeployRows()` only where the battlefield bench must contain both universal tools and characters.
5. Preserve universal exclusions from Field Leader, active powers, Super Rizo, mastery, and permanent MVP identity.
6. Preserve projectile kinds `needle`, `rivet`, and `pin` in both DOM and canvas renderers.
7. Keep the new Worker-D browser suite available during integration; it is specifically designed to catch accidental collapse of the tool/character boundary.
