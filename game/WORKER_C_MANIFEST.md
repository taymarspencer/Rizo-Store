# Worker C Manifest

## Scope
Owned the Defense relationship between the player's main Rizo, collected House Rizos, temporary loaners, pre-run roster selection, and Defense-facing owned-Rizo identity. Did not redesign universal Defense structures/towers, signature ability spectacle, or the final visual skin of roster UI.

## Player-visible changes
- The player's active Rizo is now the locked **Captain** of every new Defense run and is explicitly framed as the run protagonist in the lobby, deploy dock, and map entrance.
- Captain's first deployment remains free, so a player with no collection can still play a complete Defense run using repeated Captain deployments.
- Replaced the automatic four-Rizo opening with a limited crew model: Captain + up to three wing slots.
- House Rizos are selectable before a run. Collection rewards strategic breadth by letting the player choose which existing variant/combat identities to bring, without adding a collector-only flat damage multiplier.
- Loaners are now onboarding support rather than a permanent default army: players with fewer than two eligible House Rizos may bring at most one temporary trial Rizo. Once two House Rizos are available, loaners retire from new-run selection.
- Trial Rizos are visibly labeled `LOANER` and `NO MVP • NO MASTERY`; the existing permanent reward filter remains intact.
- Owned Rizo cards surface their existing Defense mastery title when available.
- Crew choices persist in save settings and are frozen for the duration of a run so changing House state cannot silently rewrite an active lineup.
- Existing checkpoints lock roster editing until resumed/discarded. Legacy checkpoints preserve every distinct Rizo already deployed even when they came from the older broad-roster model.
- Short-phone roster lobby is vertically scrollable and roster action labels meet the existing readability floor.

## Files changed
- `game-v79-defense.js` — Captain/owned/loaner roster model, pre-run crew selection, run-roster freezing, checkpoint-safe roster restoration, protagonist framing, QA hooks.
- `launch-v79-defense-alive.css` — functional roster-builder layout, Captain/owned/loaner treatment, readable mobile behavior; intentionally leaves final art direction to Worker H.
- `tests/browser-worker-c-roster.py` — Worker C regression coverage for collection thresholds, slot rules, Captain behavior, run freezing, loaner reward messaging, and mobile scrolling.
- `reports/browser-worker-c-roster.json` — result record for the Worker C browser suite.
- `tests/browser-worker-c-audit.py` — deliberate handoff audit covering edge cases, speed, pause/resume, checkpoint continuity, smallest-phone usability, mastery presentation, and unrelated Defense launch.
- `reports/browser-worker-c-self-audit.json` — machine-readable result record for the deliberate self-audit.
- `WORKER_C_MANIFEST.md` — this handoff manifest and final audit record.

## Important symbols / systems changed
- `DEFENSE_ROSTER_WING_SLOTS`
- `DEFENSE_GUEST_CREW`
- `defenseOwnedRosterEntries()`
- `defenseGuestRosterEntry()`
- `defenseFullRosterRegistry()`
- `defenseGuestAccessAllowed()`
- `defenseDefaultWingIds()`
- `defenseConfiguredWingIds()`
- `defenseConfiguredRoster()`
- `defenseSetConfiguredWingIds()`
- `toggleDefenseRosterPick()`
- `defenseRosterLobbyMarkup()`
- `defenseRoster()`
- `defenseFieldLeader()` — now prefers a deployed Captain before falling back to the first available tower.
- `initializeDefenseRun()` — snapshots the selected roster into run state.
- `restoreDefenseCheckpoint()` — rebuilds a checkpoint-safe run roster from placed pet IDs plus current compatible selections.
- `defenseWorldLobbyMarkup()` / Defense lobby click routing — adds roster selection.
- `defenseRosterMarkup()` / map intro — adds Captain/Owned/Loaner framing.

## New assets / DOM / CSS / state / schema / hooks
- New assets: none.
- Persistent save fields under `state.settings`:
  - `defenseRosterIds: string[]` — selected wing IDs, normalized to at most three.
  - `defenseRosterConfigured: boolean` — distinguishes an explicit empty crew from an untouched/default crew.
- Volatile run state:
  - `mini.defense.runRosterIds` — lineup snapshot used for the active run. This is deliberately not a checkpoint schema field; checkpoint restoration derives compatibility from placed tower IDs.
- Checkpoint schema/version: unchanged (`DefenseCore.VERSION` / checkpoint v8 remains authoritative).
- New lobby interaction attribute: `data-defense-roster-pick`.
- Existing deploy attribute `data-defense-roster-id` now represents the run-frozen crew.
- New functional CSS hooks include `.defense-roster-builder`, `.defense-roster-build-card`, `.defense-roster-selected`, `.defense-roster-pool`, `.defense-roster-tag`, `.roster-active`, `.roster-house`, `.roster-guest`, and `.defense-intro-captain`.
- QA hooks gated under the existing QA namespace:
  - `RizoRuntimeQA.defenseRosterConfigForQA()`
  - `RizoRuntimeQA.defenseSetRosterForQA(ids)`

## Cross-worker dependencies
- Worker D should keep universal Defense-only structures/towers separate from the pet roster. `defenseRoster()` is specifically the Rizo crew source; do not turn Factory/Beacon into fake pets just to share this UI.
- Worker E can continue using the selected Rizo's existing variant identity for signature ability spectacle; Worker C adds no new ability definitions.
- Worker H may freely reskin/recompose the roster builder and Captain/Owned/Loaner presentation, but should preserve the roster data attributes, disabled Captain behavior, slot semantics, readable reward exclusion, and scroll/touch accessibility.
- Economy/deployment pricing remains canonical in `DefenseCore`; Worker C did not introduce collector stat or cash advantages.

## Likely merge conflicts
- `game-v79-defense.js` around default/normalized settings, Defense lobby helpers, `defenseWorldLobbyMarkup()`, `defenseRoster()`, `defenseFieldLeader()`, `restoreDefenseCheckpoint()`, `initializeDefenseRun()`, `defenseRosterMarkup()`, Defense click routing, and the QA export object.
- `launch-v79-defense-alive.css` at the end-of-file Defense presentation layer and `.defense-world-lobby.v79-simple` overflow rule.
- Integrators should port the roster helpers/state first, then reapply other workers' visual/economy/ability edits around them rather than replacing whole functions blindly.

## Tests run
- `node --check game-v79-defense.js` — PASS.
- `node tests/defense-core.test.js` — PASS, 31/31.
- `python tests/static-defense-audit.py` — PASS, 80/80.
- `node tests/service-worker-policy.test.js` — PASS, 4/4.
- `python tests/browser-worker-c-roster.py` — PASS, 13/13.
- `python tests/browser-defense-integration.py` — PASS, 77/77.
- `python tests/browser-defense-surfaces.py` — PASS, 76/76 after raising Worker C action labels to the project readability floor.
- `python tests/browser-v80-strategy-feel.py` — PASS, 17/17.
- `python tests/browser-v78-canvas-flow.py` — PASS, 11/11.
- `python tests/browser-v77-feel-pass.py` — PASS, 33/33.
- `python tests/browser-launch-recovery.py` — PASS, 5/5.
- `python tests/browser-first-ten.py` — 38/41. The three failures are only `mixed-* kills the Warden`. The old mixed driver assumes all three legacy guest Rizos are automatically available and attempts to purchase that exact four-Rizo opening. Worker C intentionally removes that opening. The same suite still passes wave 1–10 resolution, deterministic 1x/2x outcomes, low-power parity, budgets, checkpoint migration, in-flight projectile restoration, and both guest MVP/mastery protections.
- `python tests/browser-worker-c-audit.py` — PASS, 11/11. Explicit empty crew/Captain-only viability, one-loaner normalization, 1x→2x roster stability, pause/resume roster stability, owned-Rizo checkpoint round trip, 320×568 touch usability, owned mastery surfacing, unrelated Defense records launch, and runtime-error check.

## Deliberate self-audit before final handoff
Re-read `ASTRA_CONTEXT.md`, `_multiagent/RTD_MASTER_VISION.md`, `_multiagent/RTD_SHARED_CONTRACT.md`, the Worker C assignment, and the baseline diff before repackaging. The audit intentionally stayed inside roster/collection ownership.

### Primary path verified
- Deep-collection account can choose a non-default owned trio; Captain remains locked first and the exact selected crew becomes the active run roster.
- Captain's first deployment is free; an explicitly empty crew still launches as Captain-only and can place/play normally.
- Owned Rizo mastery titles surface in the pre-run roster and existing permanent mastery continues to accrue only to non-loaners.
- Loaners remain real combat contributors but cannot become permanent MVP or receive permanent mastery/boss credit.

### Edge cases verified
- 0 House Rizos: Captain + one default Violet trial unless the player explicitly chooses Captain-only.
- 1 House Rizo: owned resident + at most one trial.
- 2+ House Rizos: trial access retires from new-run selection.
- Malformed/saved multi-loaner selection is normalized to one guest maximum.
- Three-wing slot limit is enforced and stale/unavailable IDs are filtered.
- A selected owned Rizo already placed in a checkpoint survives restore even if the current configured trio differs. Legacy guest-heavy checkpoint compatibility remains handled by the full registry path.
- Existing checkpoints lock normal roster editing until resume/discard.

### Speed / pause / device verification
- Frozen run roster remains identical at 1x and 2x; simulation advances at 2x without mutating roster membership.
- Pausing an active wave freezes simulation while preserving the selected roster; resume continues the run with the same crew.
- 320×568 lobby is vertically scrollable and roster controls exceed the 44px touch target floor. 390×844, 844×390 and 768×1024 are also covered by the surface suite.

### Unrelated Defense regression check
- Defense core 31/31, static audit 80/80, service-worker policy 4/4, browser integration 77/77, Defense surfaces 76/76, strategy/feel 17/17, canvas/flow 11/11, and launch recovery 5/5 all pass after the Worker C implementation.
- Baseline diff confirms Worker C changes only two gameplay/presentation source files: `game-v79-defense.js` and `launch-v79-defense-alive.css`. Other changed/added files are Worker C tests, reports, or this manifest.

### Failed / partial / risk findings
- **No verified Worker C-owned gameplay bug remained at the end of the functional self-audit.** No additional gameplay source patch was necessary at that stage; the later depth/flatness pass below deliberately improves authored depth without changing the functional contract.
- `browser-first-ten.py` remains 38/41 solely because its three `mixed-* kills the Warden` assertions hard-code the retired automatic Violet+Frost+Obsidian opening. All three mixed runs still resolve waves 1–10, and 1x/2x/low-power outcomes are identical. This should be updated by the integrator/QA owner to target the new roster contract; restoring three automatic loaners just to make the stale test green would violate Worker C's assignment.
- Final roster visual composition/polish is intentionally partial because Worker H owns final roster UI treatment. Worker C supplies functional, readable hooks and phone-safe behavior only.
- Worker C does not invent new combat abilities, VFX, or universal Defense towers. Owned Rizos gain strategic breadth through the baseline's existing variant identities; Worker E owns signature spectacle and Worker D owns universal Defense-only towers.
- Loaner retirement currently uses a simple policy threshold of two eligible House residents. This is deliberately isolated in `defenseGuestAccessAllowed()` so a future progression rule can replace it without rewriting the roster system.
- Active-run roster persistence is intentionally a volatile `runRosterIds` snapshot rather than a checkpoint schema bump. Checkpoint restoration reconstructs compatibility from placed pet IDs plus the locked configuration. Normal UI cannot change that configuration while a checkpoint exists, but integrators should preserve that lock if other workers touch save/lobby code.

## Manual play observations
- A solo account opens with Captain + one Violet trial rather than Captain + all three tactical guests.
- One House resident opens Captain + owned resident + one trial; at two House residents the trial pool retires automatically.
- With five House residents, selecting a non-default trio (`HOUSE-4`, `HOUSE-5`, `HOUSE-2`) carries exactly that trio into the deploy dock with Captain still first and locked.
- At 390×844 the expanded roster lobby exceeds one viewport by design but scrolls correctly; action labels remain readable. A visual inspection showed the one-column selected-card treatment is clearer on phone while still allowing denser layouts at larger modal widths.
- The solo/default reduced roster still resolves the authored first ten waves in the existing automated playthrough; it does not reproduce the old mixed-roster scripted Warden kill because the scripted purchases target retired automatic guests.

## Known limitations / follow-ups
- Worker H still owns the final roster UI art direction. Worker C styling is intentionally functional rather than a final visual overhaul.
- The existing `browser-first-ten.py` mixed-roster scenario should eventually be rewritten around the new onboarding roster contract or replaced with a Worker C-aware strategy script. Do not restore three automatic loaners solely to satisfy that stale assumption.
- Loaner graduation is based on the number of eligible non-egg House residents (`>=2`). If a later progression worker creates a more explicit Defense unlock milestone, this threshold is the single policy point to replace.
- This pass does not add new Rizo combat variants. Strategic breadth comes from the combat identities already attached to collected variants.

## Integration notes
Port the two new settings fields and roster helper block first. Then merge the lobby roster builder and `data-defense-roster-pick` click path. Preserve `mini.defense.runRosterIds` initialization and the `defenseRoster()` run-freeze behavior together; taking only one side can make the lobby selection differ from the active deploy dock. Finally merge the checkpoint registry/restore changes so old guest-heavy checkpoints remain restorable. Keep the existing guest-prefix permanent mastery exclusion in `recordDefenseRun()` unchanged. CSS can be ported last and Worker H can replace its appearance while preserving behavior and accessibility.

## DEPTH & FLATNESS PASS

### Flatness / issues discovered
1. **Collection depth existed in combat but was nearly invisible at selection.** Owned cards mostly reduced a Rizo to one broad profile label, so a deep collection could still read like a shelf of cosmetically different buttons instead of a strategic vocabulary.
2. **The trail-to-roster interaction was hidden.** Defense already has one-shot world opening deals tied to specific variants, but the crew picker did not reveal which owned Rizos could actually claim the selected trail's deal. A meaningful loadout decision therefore looked accidental.
3. **Care investment and mastery history were flattened.** Defense already reads each owned Rizo's care-trained Power/Speed/Instinct/Stamina into combat stats and already records POWER/CONTROL path history, but pre-run selection exposed neither. Two owned Rizos could look interchangeable even when the wider Rizo.game history made them meaningfully different.
4. **Captain was mechanically the field leader but visually understated.** The active Rizo owned the field power when deployed, yet the roster and battlefield did not make that protagonist privilege sufficiently legible.

### Improvements made
- Added a compact, factual **crew read** above the selected lineup. It surfaces the Captain's two possible doctrine field powers, the selected crew's distinct tactical tools, and the selected trail's actual opening-upgrade deal.
- Added tactical identity chips for owned/selected Rizos using their real Defense behaviors (burn, poison, chain, root, knockback, slow, reveal, armor pressure, aura, profit, pierce, critical, rapid/rewind, etc.). These are selection-language hooks only; no new combat effect was invented.
- Connected the picker to the existing `DEFENSE_WORLD_OPENING_PERKS`: matching Rizos receive a visible `TRAIL FIT` treatment, and changing trails immediately changes which selected/owned Rizos are highlighted. Grove correctly reads as a balanced opening instead of falsely implying a missing discount.
- Surfaced **care-trained identity** from the Rizo's existing skills (`POWER-TRAINED`, `QUICK-TRAINED`, `SHARP-EYE`, `STURDY CORE`) when one training axis is established. The underlying stat effects already existed; this pass makes that investment visible before deployment.
- Surfaced persistent mastery tendency (`POWER-LEANING`, `CONTROL-LEANING`, `SPLIT-PATH`) from the Rizo's existing Defense path history. This adds authored continuity without granting a collector-only stat multiplier.
- Added a restrained `CAPTAIN` field marker and Captain tower class so the player's own Rizo remains visually identifiable after deployment.
- Replaced meta/developer copy such as “not flat damage” with game-facing language: `DIFFERENT RIZOS, DIFFERENT ANSWERS` and `Captain deploys free. Bring the crew that answers this trail.`
- Corrected depth-layout polish found during visual inspection: roster pet art now owns a stable column instead of inheriting absolute mini-pet positioning; important training/mastery text may wrap instead of being ellipsized; all new roster text respects the existing readable type floor; no additional media-query branch was added.

### Deeper interactions now present
- **Trail choice ↔ collection choice:** the one-shot 20% opening upgrade deal visibly favors different variants on Ember, Moon, Storm, Blizzard, and Eclipse. A collector can alter the crew because the map changes, not because a rare pet has a blanket damage bonus.
- **Care history ↔ roster choice:** a trained owned Rizo now advertises the axis the player has actually invested in, making the wider care game legible inside Defense while retaining the existing combat formulas.
- **Mastery history ↔ player expression:** repeated POWER/CONTROL choices leave a visible tendency on that specific owned Rizo. Two Rizos of the same general family can therefore carry different player-authored histories without a permanent numerical advantage being added here.
- **Captain ↔ run identity:** Captain remains mandatory, free on first deploy, owns the field-power role while deployed, previews both doctrine possibilities, and is visually marked on the field. Crew selection expands answers around that protagonist rather than replacing them.

### Anything intentionally left simple and why
- Kept **Captain + three wing slots**. No reserve bench, mid-run swapping, chemistry meter, or extra roster currency was added; those would create UI and rules overhead rather than clearer strategic breadth.
- Added **no roster-only damage buffs, rarity multipliers, collector bonuses, or mastery stat bonuses**. Collection is rewarded through access to different real mechanics and trail fits, preserving the shared rule that a solo/new player remains fully viable.
- Kept mastery tendency informational rather than another progression tree. The persistent record gives identity and replay expression without competing with D's tower upgrade ownership.
- Kept the crew read to three cells and five unique tool tags maximum so it remains learnable by play and usable on a 320×568 phone.

### Final restraint check
- Removed an unused `distinctVariants` metric from the depth helper/export rather than shipping a number that had no player-facing consequence.
- Consolidated the temporary type-size override into the actual depth rules after the surface test caught undersized chips.
- Removed stale/meta breadth wording and shortened the House framing rather than adding more instructional paragraphs.
- No Defense combat coefficients, upgrade curves, universal towers, enemy rules, signature ability effects, care systems, currencies, save schema, or map mechanics were changed during this pass.
- Source scope remains Worker C-owned: `game-v79-defense.js` roster/Captain hooks and `launch-v79-defense-alive.css` functional roster presentation, plus Worker C tests/reports/manifest.

### Remaining opportunities outside Worker C jurisdiction
- **Worker H:** final art direction/composition can make the new crew-read, trail-fit, training, mastery, and Captain hooks more visually premium while preserving their semantics and touch/readability behavior.
- **Worker E:** signature ability spectacle can make the Captain's field-power branch and each collected Rizo's existing ability identity more memorable in combat; Worker C did not alter those effects.
- **Worker D:** universal Defense tower evolution remains separate; this pass intentionally does not solve upgrade spectacle through roster code.
- **Worker J / integrator:** `browser-first-ten.py` should replace its retired automatic Violet+Frost+Obsidian purchase script with a strategy that explicitly selects the new roster. Restoring three automatic loaners just to satisfy that scenario would violate the roster contract.

### Regression checks rerun after depth changes
- `node --check game-v79-defense.js` — PASS.
- `node tests/defense-core.test.js` — PASS, **31/31**.
- `node tests/service-worker-policy.test.js` — PASS, **4/4**.
- `python tests/static-defense-audit.py` — PASS, **80/80**.
- `python tests/browser-worker-c-roster.py` — PASS, **13/13**.
- `python tests/browser-worker-c-audit.py` — PASS, **11/11**.
- `python tests/browser-worker-c-depth.py` — PASS, **13/13**. New depth-specific coverage verifies Captain doctrine-power preview, real world-opening matches, trail-dependent fit changes, balanced-Grove behavior, care-trained identity, mastery tendency, tactical tags, self-explanatory crew read, trail-fit treatment, Captain battlefield marker, 320×568 touch/scroll behavior, and runtime cleanliness.
- `python tests/browser-defense-integration.py` — PASS, **77/77**.
- `python tests/browser-defense-surfaces.py` — PASS, **76/76** after correcting the initial depth-pass typography regression.
- `python tests/browser-v80-strategy-feel.py` — PASS, **17/17**.
- `python tests/browser-v78-canvas-flow.py` — PASS, **11/11**.
- `python tests/browser-launch-recovery.py` — PASS, **5/5**.
- `python tests/browser-v77-feel-pass.py` — PASS, **33/33**.
- `python tests/browser-first-ten.py` — **38/41**, unchanged known legacy debt. The only failures remain the three `mixed-* kills the Warden` assertions that hard-code the retired three-loaner opening; 1x/2x/low-power wave outcomes remain identical and guest reward protections still pass.

### Depth-pass files added/updated
- `game-v79-defense.js` — roster identity/read helpers, trail-fit integration, care/mastery surfacing, Captain field marker hooks, authored lobby copy.
- `launch-v79-defense-alive.css` — crew-read, tactical chips, trail-fit treatment, Captain marker, stable roster art column, wrapping/readability restraint.
- `tests/browser-worker-c-depth.py` — dedicated repeated-play/depth assertions.
- `reports/browser-worker-c-depth.json` — depth suite result.
- `reports/worker-c-depth-final-regression.txt` — final regression summary.
- `tests/browser-worker-c-roster.py` — wording assertion updated from removed meta copy to the authored breadth framing.
- `WORKER_C_MANIFEST.md` — this depth-pass record.
