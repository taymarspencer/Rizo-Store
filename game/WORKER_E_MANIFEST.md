# Worker E Manifest

## Scope
Owned the Rizo Defense ability spectacle layer: active ability presentation, elemental/status readability, ability readiness and persistent-effect hooks, ability-specific battlefield reactions, and graceful VFX degradation. Gameplay math, targeting, wave/boss design, economy, global layout, and general locomotion/audio were intentionally left alone.

## Player-visible changes
- Active abilities are staged events instead of one generic ring. All 14 current Rizo identities receive a distinct cast silhouette/language, with POWER vs CONTROL and APEX presentation hooks.
- All 14 current Rizo identities now also trigger an explicit battlefield reaction layer: Rally/power punch, Ember heat, Toxic spore tint, Violet storm flash, Moss root edge, Bubblegum bounce, Frost freeze, Glitch tear, Obsidian quake, Aurora prism, Golden payday flash, Diamond shard edge, Shadow blackout, and Retro rewind/glitch motion.
- Field Rizos visibly announce a charged ability with a readiness pip/aura, then clear that cue synchronously when the cooldown begins.
- Classic Rally, Aurora Prism, and Retro Overclock become visible immediately on cast and remain visible for the same duration as their existing simulation timers.
- Burn, poison, frost/chill, and root can all remain visible simultaneously instead of the old primary-skin priority hiding secondary statuses.
- Burn presentation is driven by the canonical `burnUntil` timer, so a stale burn magnitude can no longer imply that an expired burn is still visually active.
- Canvas status language is distinct: flames, poison motes, frost crystal marks, and roots. Low-power mode reduces mark count without erasing the identity.
- Violet active power visibly chains between its existing targets; Bubblegum active power gets explicit elastic impact punctuation. Glitch and Bubblegum also gained dedicated Canvas impact grammar.
- Ability casts use the existing cinematic-moment system for a short named activation beat so a spectator can tell what fired without opening a panel.
- Manual Defense pause now freezes an in-progress ability event instead of allowing its presentation to finish/disappear while gameplay is paused.

## Files changed
- `game-v79-defense.js` — ability event hooks, synchronous readiness/persistent-timer presentation state, pause-safe FX cleanup, simultaneous DOM status classes, doctrine-aware readiness progress, Apex cast state, and four deterministic Apex elemental resonance interactions.
- `defense-canvas-v79.js` — simultaneous elemental/status rendering, dedicated Glitch/Bubblegum impact effects, and Canvas punctuation for Flashover/Bloom/Crystal/Shatter.
- `launch-v79-defense-alive.css` — original Worker E spectacle pass: authored ability silhouettes, readiness/persistent states, elemental impacts, all-variant battlefield reactions, pause behavior, low-power/reduced-motion degradation. It remains within the existing stylesheet budget and was intentionally not expanded during the depth pass.
- `worker-e-abilities-depth.css` — depth-pass-only presentation layer for tactical cooldown fill, POWER/CONTROL motion grammar, Apex crest/field reaction, resonance impacts, and low-power degradation.
- `index.html` — loads the Worker E depth stylesheet after the core Defense stylesheet.
- `sw.js` — adds the depth stylesheet to the optional shell cache list so offline installs can retain the authored presentation without changing required boot assets.
- `tests/browser_harness.py` — includes the depth stylesheet in the existing inlined browser QA build so regression tests exercise production presentation rather than silently omitting it.
- `WORKER_E_MANIFEST.md` — this handoff and depth-pass record.

## Important symbols / systems changed
- `renderDefenseTower()`
- `updateDefenseEnemyNode()`
- `spawnDefenseAbilityFx()`
- `activateDefenseAbility()`
- `updateDefenseTowers()`
- `DEFENSE_ABILITY_REACTIONS`
- `DefenseCanvasRenderer.drawEnemy()`
- `DefenseCanvasRenderer.drawEffect()`
- Existing `showDefenseCinematicMoment()` is consumed; its ownership/layout was not changed.

## New assets / DOM / CSS / state / schema / hooks
- No new binary/image/audio assets.
- New tower DOM child: `.defense-ability-pip`; depth pass gives it doctrine-specific glyphs and a quantized `--ability-charge` fill.
- Ability FX creates `.ability-core`, three `.ability-detail` children, and an Apex-only `.ability-apex-mark` inside the existing `#defenseEffects` host.
- New presentation classes include `ability-ready`, `ability-charging`, `overclock-active`, `rally-active`, `prism-active`, `is-burn`, `is-poison`, `is-frost`, `is-root`, `ability-react-*`, and `ability-react-apex`.
- Presentation-only runtime caches: `tower.abilityChargedVisual`, `tower.abilityChargingVisual`, `tower.abilityChargeVisual`, `tower.overclockVisualActive`, `d.rallyVisualActive`, `d.prismVisualActive`. None are checkpointed or used to choose gameplay outcomes.
- No save/checkpoint/schema changes.
- Depth pass deliberately adds four deterministic Apex POWER interactions using already-canonical enemy status timers: Ember Flashover, Toxic Bloom, Frost Crystal, and Obsidian Shatter. No new RNG, target-selection system, cooldown rule, density/reward/economy rule, wave rule, or presentation-quality-dependent gameplay was introduced.

## Cross-worker dependencies
- Worker I can add/coordinate audio/haptics against the existing `ability-cast`, `ability-*`, `ability-react-*`, and cinematic hooks; this pass does not take over general sound/locomotion.
- Worker H should preserve `#defenseEffects`, `#defenseWorld`, and the existing cinematic host if global Defense UI is rearranged.
- Workers C/D can add roster/tower work normally; any brand-new future Rizo variant should receive a matching ability reaction/signature class rather than falling back permanently to the generic core.
- Worker F can continue boss/status work; overlapping burn/poison/frost/root presentation reads canonical timers independently.

## Likely merge conflicts / regression risks
- `game-v79-defense.js`: `renderDefenseTower`, `updateDefenseEnemyNode`, `spawnDefenseAbilityFx`, `activateDefenseAbility`, and `updateDefenseTowers` are likely hotspots for Workers C/D/I.
- `launch-v79-defense-alive.css`: tower readiness/aura rules, ability FX, status FX, battlefield reaction selectors, and late Defense overrides may overlap Workers D/H/I.
- `defense-canvas-v79.js`: only `drawEnemy` status punctuation and `drawEffect` branches were changed; preserve other workers' renderer work around those insertions.
- Ability-event cleanup now relies on the normal CSS `animationend` path, with a reduced-motion fallback. If another worker replaces the `workerE-ability-event` animation name or removes the event animation, preserve equivalent cleanup semantics.
- Field reaction effects are deliberately presentation-only. Do not move their timing/classes into simulation or checkpoint state during merge.

## Deliberate self-audit findings and fixes
- Found: non-damaging/persistent casts could leave the `ability-ready` pip visible until a later simulation update. Fixed by clearing readiness synchronously when a cast succeeds.
- Found: Rally/Prism/Overclock presentation could lag one simulation update after activation. Fixed by synchronizing the presentation class immediately from the already-canonical timers.
- Found: an ability event could visually complete/disappear while Defense was manually paused because presentation cleanup used a wall-time timeout. Fixed by letting the CSS animation own normal cleanup and pausing Worker E animations with the Defense pause state; reduced-motion cleanup rechecks pause state before removal.
- Found while re-reading the assignment: seven variants had unique local cast silhouettes and reaction hooks but no separate whole-field reaction styling. Added restrained field reactions for Rally, Toxic, Moss, Bubblegum, Golden, Diamond, and Retro so all 14 current variants now satisfy the battlefield-reaction requirement.
- Found in packaging: validation had modified report JSONs and generated a screenshot/`__pycache__`. Reverted/removed all generated artifacts. The later depth pass adds only the explicitly documented integration files (`worker-e-abilities-depth.css`, its index/service-worker references, and the browser-harness include) beyond the owned gameplay/renderer changes.
- No unresolved Worker E-owned functional defect was found after the fixes above.

## Tests run on the final post-fix tree
- `node --check game-v79-defense.js` — PASS.
- `node --check defense-canvas-v79.js` — PASS.
- `node tests/defense-core.test.js` — PASS, 31/31.
- `python tests/static-defense-audit.py` — PASS, 80/80; stylesheet remains below the project size budget and adds no `!important` debt.
- `node tests/service-worker-policy.test.js` — PASS, 4/4.
- `python tests/browser-first-ten.py` — PASS, 41/41. Full first-ten outcomes remained identical at 1x, 2x, and 2x low-power presentation; pause/checkpoint paths also passed.
- `python tests/browser-defense-integration.py` — PASS, 77/77. Core launch, phase/economy/save invariants, 1x/2x scheduling, low-presentation budgets, and unrelated Defense flows remain functional.
- `python tests/browser-defense-surfaces.py` — PASS, 76/76 across 320x568, 390x844, 844x390, and 768x1024.
- Deliberate Worker E targeted headless self-audit — PASS, 74/74: all 14 variant cast signatures/reaction hooks; immediate cooldown/readiness; overlapping burn+poison+frost+root; canonical burn expiry; cast→pause→resume persistence/cleanup; low-power core readability/no overflow at 320x568, 390x844, 844x390; unrelated placement/upgrade/wave/combat smoke.
- CONTROL doctrine cross-check — PASS, 14/14 variants: all current variants cast through the CONTROL path with the correct variant reaction plus `ability-react-control`, with zero runtime errors.
- Earlier comparison of `browser-v79-consumer-pass.py` against the untouched baseline produced the same 18/20 in both trees. The two inherited assertions expect unrelated copy (`RANGE` and `READ THE ROAD`) and are not caused by Worker E.

## Manual / visual observations
- At phone sizes the charged field Rizo reads as actionable before opening a panel; after casting, the readiness mark disappears immediately and the named event reads over the battlefield.
- Simultaneous burn + poison + frost + root remains legible in DOM fallback and Canvas no longer treats those states as mutually exclusive.
- Low-power/potato presentation removes satellites/spinning/whole-field extras but retains the central signature silhouette, so the ability remains identifiable.
- Headless Chromium showed no runtime errors or viewport escape in the tested portrait/landscape sizes.

## Known limitations / intentionally unimplemented work
- Physical-device visual QA was not available in this worker environment; phone coverage is headless Chromium at the required small portrait/landscape sizes.
- This pass intentionally does not globally retune ability cooldowns/damage curves, bosses/waves, economy, or global UI layout. The only new gameplay output is the four Apex conditional elemental payoffs documented below; presentation quality and speed modes never change their outcomes.
- General attack/recoil/death audio and broad haptic choreography are Worker I territory; Worker E leaves the existing SFX/haptic hooks available rather than duplicating that ownership.
- The two inherited v79 consumer-copy assertions remain for the owner of those surfaces; they were not broadened into Worker E work.

## DEPTH & FLATNESS PASS

### Flatness/issues discovered
1. **Too many correct casts still reduced to “press when crowded.”** The spectacle was readable, but experienced play had little incentive to set up an ability rather than simply wait for density.
2. **Cooldown communication was binary.** The field pip said READY or nothing, so timing a cast around an approaching threat required opening UI/readout surfaces instead of reading the battlefield.
3. **POWER and CONTROL shared too much motion grammar.** Their gameplay roles differed, but both still looked like variations of the same expanding event at a glance.
4. **APEX investment was visually larger but not sufficiently transformative.** A maxed Rizo deserved at least one discoverable extra layer instead of only “same active, more.”

### Improvements made
- Added a **12-step battlefield cooldown fill** to the existing ability pip. It advances from canonical simulation time, freezes with pause, and therefore gives tactical anticipation without another meter or text panel. POWER keeps the star-like mark; CONTROL uses a compact lock/wave glyph and squared pip language.
- Split doctrine motion grammar: **POWER expands/throws energy outward**, while **CONTROL converges inward into a locking ring**. This is presentation-only and uses the existing doctrine decision.
- Added an **Apex crest + short whole-field punctuation** so max investment reads immediately. Potato/low-power mode removes the expensive crest/field filter while retaining the core ability silhouette.
- Added four status-first **Apex POWER resonance interactions** that are discoverable from existing combat language rather than tutorial copy:
  - **Ember — Flashover:** casting into an already-burning target produces a stronger immediate hit and a dedicated flame-burst punctuation.
  - **Toxic — Bloom:** casting into an already-poisoned target triggers an immediate toxin burst before refreshing the poison window.
  - **Frost — Crystal:** casting into an already slowed/rooted target crystallizes it into a substantially longer root.
  - **Obsidian — Shatter:** casting into an already slowed/rooted target produces a stronger quake burst, then consumes that control setup.
- Added distinct DOM + Canvas impact grammar for all four resonance moments so the deeper mechanic is visible without explanatory text.

### Deeper interactions now present
- Ember and Toxic reward **status maintenance before the active**, turning prior elemental pressure into an active-cast payoff.
- Frost can deliberately **convert existing control into a harder lock**, creating a setup window rather than only an emergency freeze.
- Obsidian creates a readable **setup → cash-out** relationship with chill/root: prior control increases the quake, then is consumed. This makes pairing/timing matter and prevents the interaction from being a free permanent multiplier.
- Cooldown fill enables **threat timing at field level**; equal simulated time produces equal charge at 1x and 2x, while real-time fast-forward naturally reaches the cast sooner.
- POWER/CONTROL and normal/APEX now have separable silhouettes, so repeated play exposes doctrine and investment state visually before reading labels.

### Anything intentionally left simple and why
- Only four Apex resonance rules were added. The other identities already have strong roles (chain, roots, knockback, execute, economy, rally/prism/overclock); forcing a bespoke hidden combo onto all 14 would add memorization rather than depth.
- Resonance uses **existing burn/poison/slow/root states**. No combo counter, meter, currency, recipe list, or extra button was added; players can learn the relationship by seeing the upgraded impact happen when a familiar status is present.
- Cooldown progress is quantized to **12 visual steps**, avoiding per-frame DOM style churn while still being tactically readable on a phone.
- No new random proc was added. Glitch retains its pre-existing authored randomness, while the new depth mechanics remain deterministic and testable.

### Remaining opportunities outside Worker E jurisdiction
- Worker I can make the four resonance moments and POWER/CONTROL split even more memorable with authored audio/haptic signatures; Worker E only preserves/hooks the visual event language.
- Worker F can author boss/wave situations that naturally pressure ability timing or status setup; Worker E did not redesign enemy schedules or boss rules to showcase its own mechanics.
- Worker H may choose how much doctrine/readiness information belongs in global panels; Worker E kept the field cue self-contained and did not redesign UI layout/onboarding.
- Workers C/D own broader Rizo/tower progression and balance context; Worker E did not add upgrade economy or roster progression solely to force more ability use.

### Restraint check
- No new tutorial wall, combo chart, resource, navigation, targeting mode, save field, or global UI surface was added.
- The deeper mechanics are signaled by pre-existing status visuals plus a visibly different impact; no reading is required to execute them accidentally, and repeated play can reveal how to reproduce them intentionally.
- All gameplay additions stay inside active ability behavior/status interaction, which Worker E explicitly owns. Boss/wave/economy/global-layout/audio ownership remains untouched.
- Expensive Apex ornament degrades first in low-power mode; the core cast and status feedback remain recognizable.

### Regression checks rerun after depth changes
- Dedicated Worker E depth probe — **32/32 PASS**: four primed-vs-clean Apex resonance outcomes, resonance impact visibility, doctrine motion split, Apex crest/field reaction, doctrine pip language, cooldown progress, pause freeze, equal-simulation-time 1x/2x charge parity, and low-power degradation.
- Apex resonance Canvas probe — **4/4 PASS**: Ember/Toxic/Frost/Obsidian resonance effects rendered through the production Canvas path with active effect counts and zero runtime errors.
- `python tests/browser-first-ten.py` — **41/41 PASS** with the depth stylesheet included by the browser harness; 1x, 2x, and 2x-low full-wave outcomes remain identical.
- `python tests/browser-defense-integration.py` — **77/77 PASS** with the production depth stylesheet loaded.
- `python tests/browser-defense-surfaces.py` — **76/76 PASS** across 320×568, 390×844, 844×390, and 768×1024 with the production depth stylesheet loaded.
- Core/static/service-worker/syntax gates are rerun again at final packaging; results are recorded below.

## Integration notes
Port the three owned code slices rather than replacing whole files if another worker has touched the same baseline. Merge `defense-canvas-v79.js` status/effect branches first, then the ability/readiness/pause-safe hooks in `game-v79-defense.js`, then the late Worker E CSS rules while keeping the superseded generic ability-ring rules removed. Preserve the presentation-only nature of the timer caches/classes; none should enter checkpoints or gameplay calculations. Re-run the mandatory contract gates, targeted cast/pause checks, and first-ten browser suite after resolving conflicts.
