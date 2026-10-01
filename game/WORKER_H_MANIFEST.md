# Worker H Manifest

## Scope
Owned the Defense UI/UX, phone-first responsive layout, touch/accessibility presentation, HUD hierarchy, placement/selection/upgrade presentation, ability readiness surfaces, economy feedback, boss/event HUD, roster/loadout presentation hooks, and self-explanatory affordances. No combat balance, enemy math, tower math, wave composition, rewards, persistence schema, or other worker-owned gameplay systems were redesigned.

## Player-visible changes
- Rebalanced the phone HUD so lives/gold stay legible while the six command controls collapse into one compact ribbon, returning meaningful vertical space to the battlefield.
- Added compact/short-phone behavior that drops secondary labels before shrinking the battlefield, plus a dedicated landscape control rail that keeps the map central.
- Made the existing Rizo bench explicitly collapsible on phone instead of permanently consuming field space.
- Fixed the visible **POWERS** control so it opens the existing grouped Rizo power tray instead of immediately trying to cast only the field leader's power.
- The Powers control now exposes ready count, next cooldown, locked/unavailable state, and accessible status text without opening the tray.
- Moved boss health/status out of the lower feed and onto the battlefield as a high-authority overlay; the normal wave badge yields while a boss is active.
- Added signed gold feedback for meaningful gains and spends (for example, `−110`) while preserving the underlying economy values.
- Added upgrade preview chips showing the next level's damage, speed, and range percentage gains before purchase.
- Strengthened upgrade, placement, ready-power, and wave-start tactile/visual feedback while keeping the normal baseline quiet.
- Tightened roster cards, context sheets, field messages, placement coach, and command touch behavior for thumb use.
- Added reduced-motion and increased-contrast handling for the new Worker H effects.

## Deliberate self-audit findings and fixes
- **Fixed an H-owned selection regression:** the generic tactile `button:active` translation was overriding the placed Rizo's canonical `translate:-50% -88%` while the pointer was down. That could make a Rizo jump underneath the pointer and fail ordinary click completion. The press transform is now explicitly excluded from `.defense-tower`; normal locator/touch selection passes again.
- **Fixed an H-owned core-control stability issue:** the idle START WAVE breathing animation moved the actual button upward by 1px. The pulse now animates shadow only, preserving a stationary touch target while retaining the visual cue.
- A self-audit assertion initially sampled power readiness immediately after the simulation entered `combat`, before the normal throttled HUD refresh. Waiting one normal UI refresh interval produces the correct `1 READY` state; this required no production gameplay change.
- No unresolved H-owned runtime failure remained after the fixes below.

## Files changed
- `index.html` — loads the Worker H authority stylesheet after the existing visual layers.
- `game-v79-defense.js` — HUD markup/behavior, grouped Powers routing/readiness, signed cash delta, boss HUD placement, upgrade delta preview, and tray refresh integration.
- `worker-h-ui.css` — new Defense-only UI/mobile authority layer; self-audit also scopes tactile press translation away from battlefield Rizos and keeps START WAVE pulse geometry stationary.
- `sw.js` — includes `worker-h-ui.css` in the versioned app shell so the UI survives cached/offline launch.
- `tests/browser_harness.py` — inlines `worker-h-ui.css` so browser regression tests exercise the actual active UI layer.
- `tests/worker-h-self-audit.py` — reproducible H-specific primary-path/mobile/event audit.
- `reports/browser-defense-surfaces.json` — responsive surface results with the Worker H layer active.
- `reports/worker-h-ui-verification.json` — targeted Powers routing/spend/boss checks from the implementation pass.
- `reports/worker-h-self-audit.json` — 24-check deliberate self-audit result.
- `reports/worker-h-self-audit-primary.png` — audited 390×844 primary path capture.
- `reports/worker-h-self-audit-320x568.png` — audited compact-phone capture.
- `reports/worker-h-final-regression.txt` — final post-fix regression summary.
- `WORKER_H_MANIFEST.md` — this manifest.

## Important symbols / systems changed
- `renderDefenseWorld()` Defense shell/HUD markup.
- `updateDefenseHud()` presentation state for cash, powers, and UI refreshes.
- `updateDefenseAbilityTray()` readiness badge continuity when tray refreshes directly.
- `showDefenseTowerPanel()` next-upgrade delta preview.
- `handleDefensePointerDown()` Powers control routing.
- Existing `defenseAbilityGroups()` / `toggleDefenseAbilityTray()` are reused rather than replaced.
- Existing context-surface focus/inert system is preserved.

## New assets / DOM / CSS / state / schema / hooks
- New stylesheet: `worker-h-ui.css`.
- New DOM node: `#defenseCashDelta` inside the gold stat.
- Existing `#defenseBossBar` is relocated into `.defense-stage-frame` and gains `.defense-boss-overlay`.
- New upgrade preview DOM: `.defense-upgrade-deltas` with damage/speed/range chips.
- No new save state, checkpoint field, currency, balance constant, asset dependency, or persistence schema.
- No new Rizo roster data contract; Worker C can continue supplying the existing roster markup/data.

## Cross-worker dependencies
- Worker C: this pass styles the current roster/bench and grouped Rizo power presentation without changing roster ownership or loadout rules.
- Worker E: ability presentation continues to use the canonical ability data and grouped tray; E can replace ability behavior/VFX without needing to undo this UI routing.
- Worker F: boss overlay consumes the existing boss runtime state and health/telegraph values; boss mechanics remain F-owned.
- Worker B: cash feedback reads existing cash deltas only; economy values remain B-owned.
- Worker A: Start/Pause/Auto-wave mechanics are not changed; H only changes their visual hierarchy/affordance.

## Likely merge conflicts / regression risks
- `game-v79-defense.js` around `renderDefenseWorld()`, `updateDefenseHud()`, `showDefenseTowerPanel()`, `updateDefenseAbilityTray()`, and the Defense pointer handler.
- `index.html` stylesheet list if another worker adds a late authority stylesheet.
- `sw.js` shell arrays if another worker adds active root assets.
- `tests/browser_harness.py` active CSS list if another worker adds a stylesheet.
- Boss DOM placement may overlap Worker F changes if F also moves/rebuilds `#defenseBossBar`; preserve the stage-overlay placement while porting F's boss data/mechanics.
- Do not re-generalize the H tactile `button:active` translate rule onto `.defense-tower`; placed Rizos use `translate` for their field anchoring and the deliberate self-audit proved that overriding it destabilizes selection.
- If START WAVE motion is revised later, keep the button's hitbox stationary; animate shadow/pseudo-elements instead of the control's geometry.

## Final tests run after self-audit fixes
- `node --check game-v79-defense.js` — PASS.
- `node tests/defense-core.test.js` — PASS, **31/31**.
- `python tests/static-defense-audit.py` — PASS, **80/80**.
- `node tests/service-worker-policy.test.js` — PASS, **4/4**.
- `python tests/browser-defense-integration.py` — PASS, **77/77**; includes deterministic 1×/2× behavior, real-time income batching, phase/action gates, save/checkpoint surfaces, overlay exclusivity, and eight responsive viewport shapes.
- `python tests/browser-defense-surfaces.py` — PASS, **76/76**; covers 320×568, 390×844, 844×390, and 768×1024 context surfaces, type floor, touch controls, containment, and runtime errors.
- `python tests/browser-launch-recovery.py` — PASS, **5/5**.
- `python tests/browser-first-ten.py` — PASS, **41/41**; full waves 1–10 resolve identically at 1× and 2×, pause/restored-countdown timing is preserved, checkpoint projectile continuation survives, boss/escort coexistence works, and low-power presentation does not change outcomes.
- `python tests/browser-v78-canvas-flow.py` — PASS, **11/11**; production Canvas path, bounded tracer presentation, responsive wave-start surface, and Canvas→DOM context-loss recovery all pass.
- `python tests/browser-v80-strategy-feel.py` — PASS, **17/17** after the `.defense-tower` tactile fix; includes ordinary placed-Rizo selection, landscape touch ownership, sell confirmation, Ember Pod persistence, heavy-wave budget, and Super Rizo presentation.
- `python tests/worker-h-self-audit.py` — PASS, **24/24**; real UI placement → selection → upgrade → doctrine → Powers tray/readiness → 1×→2× → start → pause/resume → boss HUD, compact 320×568 touch/layout, reduced motion, and all six canonical map launches.

## Manual / browser play observations
- 390×844 portrait: battlefield remains the dominant surface; command controls fit in one ribbon and contextual sheets rise from the bottom without turning the top half into a dashboard.
- 320×568 compact portrait: all six recurring command targets remain approximately 47×44px, the shell remains contained, and the battlefield retains about 52.7% of viewport area in the dedicated H audit.
- 844×390 landscape: field remains centered with compact controls/roster at the sides instead of being vertically crushed; sampled battlefield touches are not stolen by the command deck.
- Upgrade selection keeps the selected tower/range readable above the sheet and communicates what the purchase changes before the tap.
- Boss telegraph presentation reads as a battlefield event rather than another line of HUD text.
- The Powers entry point matches the grouped tray the game already had, removing a UI/behavior mismatch that made multiple Rizos feel less controllable.

## Assignment items intentionally partial / not broadened
- **Controlled dopamine moments:** H supplies hierarchy, animation, cash/upgrade feedback, boss takeover, and styling for existing wave-clear/milestone/event surfaces. H did **not** invent new gameplay definitions for clutch survival or personal-best events because those triggers/reward semantics belong to the owning gameplay/progression systems.
- **Worker C roster/loadout hooks:** presentation hooks are ready, but H did not create or alter roster/loadout rules, ownership requirements, or collection data contracts.
- **Physical-device validation:** responsive behavior, pointer/touch-size constraints, landscape, reduced motion, and safe-area CSS were tested in Chromium mobile-sized viewports. This pass did not claim a physical notched-iPhone hardware run.
- No balance, wave, enemy, map, tower, ability-effect, economy, save-schema, or progression issue outside H ownership was changed merely because it was visible during QA.

## Integration notes
Safest port order: copy `worker-h-ui.css`; load it last among the current visual styles; port the small `game-v79-defense.js` changes to Defense shell markup, `updateDefenseHud()`, `updateDefenseAbilityTray()`, `showDefenseTowerPanel()`, and the Powers pointer route; then add the stylesheet to `sw.js` and `tests/browser_harness.py`. Preserve the existing context manager, roster renderer, ability data, economy math, boss mechanics, and checkpoint/state schema. Preserve the `.defense-tower` exclusion on the tactile active-state translate. Re-run the required project gates plus `browser-defense-surfaces.py`, `browser-v80-strategy-feel.py`, and `tests/worker-h-self-audit.py` after resolving shared-file conflicts.

## DEPTH & FLATNESS PASS — 2026-09-12

### Flatness / issues discovered
1. **Field investment memory was too weak.** A leveled/path-committed Rizo became strategically different, but after closing the sheet most of that investment disappeared back into a small level badge. Repeated runs therefore asked the player to remember state instead of letting the field communicate it.
2. **The upgrade sheet described the next transaction more strongly than the longer arc.** Percentage deltas made a purchase legible, but there was no compact visual sense of "where this Rizo is going" across Levels 1–5 or where the doctrine split sits.
3. **Grouped powers were functionally useful but timing-flat.** Duplicate Rizos with the same activated effect collapsed into text such as `1 READY`; the tray did not make staggered reserves or the next recharge visually learnable at a glance.
4. **Meaningful clears read too much like ordinary receipts.** Perfect defense and the Wave 10 milestone already had meaningful game state behind them, but their H-side reward punctuation was too close to normal gold feedback.
5. **Depth QA exposed a presentation leak in the grouped-power stack.** Multiple Rizo portraits could inherit their full thumbnail size and spill below the ability card. This was H-owned UI presentation and was corrected during the pass.

### Improvements made
- Reused the existing `.defense-power-mark` field hook as a quiet persistent investment signature: stitch bars show upgrade depth and the doctrine glyph shows Power vs Control. It dims in crowded fields unless selected so information does not become confetti.
- Added a compact five-node `.defense-evolution-rail` to the tower sheet. It shows current level, the Level 3 doctrine fork, current path identity, and the apex node while preserving the existing purchase button and stat deltas.
- Added per-copy charge pips plus a continuous next-charge rail to grouped powers. Two copies of one ability can now visibly read as one ready / one charging instead of only as prose.
- Added a one-shot `ready-arrival` punctuation when a power group newly becomes available during live combat. This is runtime-only presentation; it does not create or persist readiness state.
- Gave existing perfect-wave and major milestone clears distinct visual tones and authored copy while preserving the canonical reward calculation and the existing cinematic `kind` contract.
- Bounded and layered `.defense-ability-stack` portraits inside the ability card so duplicate-power presentation stays composed on phone and landscape.
- Added `tests/worker-h-depth-audit.py` and depth-pass captures/results to make the new information hierarchy reproducible rather than subjective only.

### Deeper interactions now present
- Investment is readable **on the battlefield**, so experienced players can scan a formation and recover which Rizos are deeper investments and which doctrine they serve without reopening every panel.
- The upgrade surface now communicates a **development arc**, not merely a cost. The doctrine fork and apex are visible before the next purchase, improving anticipation without prescribing which path to choose.
- Multiple copies of one activated power expose **stagger timing** as a player-readable resource: ready pips communicate reserves while the rail shows the next copy returning. No ability behavior or cooldown value was changed.
- Perfect and milestone defense now have different punctuation from routine income, so repeated play has a clearer hierarchy of "ordinary gain" versus "I actually did something notable."

### Intentionally left simple after restraint check
- No new buttons, currencies, tutorial walls, auto-spend advice, recommended builds, or strategic scoring were added. UI should reveal the game, not solve it.
- The five-node evolution rail uses the game's existing five levels and doctrine split; it does not add another progression system.
- Power charge UI shows only ready copies and next recharge rather than a detailed timer dashboard for every Rizo. That keeps the battlefield and cast decision primary.
- Boss phase mechanics/thresholds were not invented in H. Showing fake phase depth would be worse than leaving the boss overlay truthful to Worker F's canonical state.
- No new definitions for clutch survival, personal best, roster synergy, or economic greed were created because their trigger/mechanical semantics belong to other workers. H continues to style those events when canonical state exists.
- The one-shot ready punctuation remains visual-only and is disabled under reduced motion; no extra sound/haptic loop was added.

### Remaining opportunities outside H jurisdiction
- Worker C can deepen the strategic meaning and rules behind roster/loadout composition; H now has presentation room to surface those hooks.
- Worker E can deepen ability behaviors, combinations, and signature VFX; H now makes staggered readiness/copy timing legible without owning those effects.
- Worker B can deepen economy structures and risk/reward choices; H intentionally does not add recommendations or alter prices/rewards.
- Worker F can deepen boss phases and authored encounter mechanics; H will surface canonical phase/warning state but does not manufacture it.
- Any larger silhouette/material transformation of Rizos as they evolve belongs with the owning art/tower implementation. H adds a restrained field progression signature rather than duplicating that ownership.

### Depth-pass implementation / merge notes
- `game-v79-defense.js`: added `defenseEvolutionRailMarkup()` and `defenseAbilityChargeMarkup()`; integrated them into `showDefenseTowerPanel()` / `updateDefenseAbilityTray()`; `updateDefenseHud()` tracks runtime-only `lastReadyAbilityGroups` for the one-shot ready punctuation; `completeDefenseWave()` now selects perfect/milestone presentation tone while leaving reward math and cinematic `kind` compatibility intact.
- `worker-h-ui.css`: added field progression marks, evolution rail, grouped-power charge meter, ready-arrival treatment, perfect/milestone cinematic tones, bounded power portrait stack, compact-phone adaptations, and reduced-motion overrides.
- `tests/worker-h-depth-audit.py`: new 10-check depth-specific browser gate covering persistent investment identity, five-step evolution, doctrine identity, duplicate-power reserves/recharge, perfect/milestone distinction, runtime errors, and 320×568 containment.
- New/updated reports: `reports/worker-h-depth-audit.json`, `worker-h-depth-upgrade.png`, `worker-h-depth-powers.png`, `worker-h-depth-milestone.png`, `worker-h-depth-320x568.png`, and `depth-*.txt` regression logs.
- Highest shared-file conflict points remain `updateDefenseHud()`, `updateDefenseAbilityTray()`, `showDefenseTowerPanel()`, and `completeDefenseWave()` in `game-v79-defense.js`. Preserve gameplay math/state from the owning workers when merging; H's additions are presentation reads of canonical state.
- No save/checkpoint schema, balance constant, cooldown value, reward value, enemy state, tower stat, wave plan, map contract, or roster data contract was added or changed in this pass.

### Regression checks rerun after depth changes
- `node --check game-v79-defense.js` — PASS.
- `node tests/defense-core.test.js` — **31/31 PASS**.
- `python tests/static-defense-audit.py` — **80/80 PASS**.
- `node tests/service-worker-policy.test.js` — **4/4 PASS**.
- `python tests/worker-h-depth-audit.py` — **10/10 PASS**.
- `python tests/worker-h-self-audit.py` — **24/24 PASS**.
- `python tests/browser-defense-integration.py` — **77/77 PASS**; includes deterministic 1×/2× behavior, phase/action gates, save/checkpoint protections, income timing, overlay exclusivity, and required viewport shapes.
- `python tests/browser-defense-surfaces.py` — **76/76 PASS**; phone/landscape/tablet containment, minimum type floor, usable controls, and runtime-error checks all pass with the depth layer active.
- `python tests/browser-v80-strategy-feel.py` — **17/17 PASS**; ordinary placed-Rizo selection remains stable, landscape touch ownership remains clean, sell confirmation and Super Rizo presentation still function.
- `python tests/browser-v78-canvas-flow.py` — **11/11 PASS**; production canvas presentation and context-loss recovery remain intact.
- `python tests/browser-first-ten.py` — **41/41 PASS**; full-wave outcomes remain identical at 1×/2× and under low-power presentation, pause/checkpoint/boss behavior remains safe.
- `python tests/browser-launch-recovery.py` — **5/5 PASS**.
- `python tests/browser-phase8-final.py` — **17/17 PASS**; perfect-wave cinematic still preserves the canonical `money` kind, boss/danger/defeat priority stays correct, reduced-motion and 320×568 cinematic containment remain safe.
