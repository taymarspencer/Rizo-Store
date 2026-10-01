# Worker G Manifest

## Scope
Owned the Rizo Defense map/world pass: world identity, authored environment art, route and placement readability, strategic map-native terrain, environmental feedback, and map-side weather integration. Enemy/wave/boss design, global UI architecture, elemental combat VFX, global motion/audio, tower upgrade design, and economy were not redesigned.

## Player-visible changes
- Rebuilt the five post-Pine Defense worlds with original authored vector environment plates so Ember Switchback, Moon Loop, Storm Circuit, Whiteout Pass, and Eclipse Ridge are recognizable by silhouette, material, landmarks, and terrain rather than palette alone. Pine Bend keeps its existing authored plate.
- Preserved the live route as a separate high-contrast gameplay layer so decoration does not obscure the road or legal placement space.
- Added deterministic positional **Map Bonds** to all six worlds. They are strategic build-location decisions and never require random tapping.
- Added quiet field rings, landmarks, build pockets, compact bond badges, tower-detail explanations, map-intro/Field Guide support, and map-side weather feedback. The mechanic layer is `pointer-events:none`.
- Added weather-aware placement feedback: a candidate tower's visible range and short placement label reflect the terrain effect it would receive, including temporary Moonlight, Surge, and Whiteout windows.

### Final map identities after the depth pass
- **Pine Bend — Keeper Stone:** intentionally simple onboarding terrain. A tower in the stone ring gains **+12% reach**.
- **Ember Switchback — Fire Draft:** a spatial risk/reward field rather than one binary bonus. The **outer draft** gives **+16% attack speed / -4% reach**. The visibly hotter **core** gives **+28% attack speed / -12% reach**. Players choose safer coverage versus compressed high-output positioning.
- **Moon Loop — Silver Basin:** the basin always grants **veil/camouflage sight +8% reach**. During the existing Moonlight state it visibly wakes and also grants **+18% attack speed**, creating a timed offensive window distinct from Eclipse.
- **Storm Circuit — Live Pylons:** one occupied pylon gives **+8% attack speed**. Occupying both separated pylon fields closes a visible circuit and raises both bonded positions to **+16%**. During the existing lightning surge, a single pylon reaches **+28%** and a completed circuit reaches **+34%**, rewarding split-field commitment.
- **Whiteout Pass — Ice Shelters:** a shelter normally ignores the Whiteout penalty and adds **+4% reach**. During Whiteout it becomes an opportunity instead of mere immunity, opening to **+14% reach** while ordinary exposed towers still suffer the map penalty.
- **Eclipse Ridge — Shadow Seals:** one seal grants **veil sight +6% reach**. Occupying the two separated ridge seals creates a visible resonance and raises both bonded positions to **+14% reach**, making inner-coil/late-ridge coverage a deliberate two-position mastery layer.

## Files changed
- `game-v79-defense.js` — map definitions/zones, derived Map Bond logic, multi-zone occupancy/resonance, combat-stat/sight integration, weather-aware bond states, placement feedback, legal late-world zone adjustments, tower feedback, checkpoint-safe map restore, and QA exposure.
- `launch-v79-defense-alive.css` — scoped Worker G map mechanics, bond badges, weather feedback, Ember inner heat band, Storm/Eclipse connection lines, linked-state feedback, placement feedback, and low-FX restraint.
- `v81-art.css` — authored world-plate backgrounds for worlds 2–6 and route readability tuning over those plates.
- `sw.js` — optional shell entries for the five new local Defense world SVGs.
- `ASSET-CREDITS.md` — records the world plates as original local Rizo.game artwork with no remote/third-party dependency.
- `assets/defense-ember-switchback.svg`
- `assets/defense-moon-loop.svg`
- `assets/defense-storm-circuit.svg`
- `assets/defense-whiteout-pass.svg`
- `assets/defense-eclipse-ridge.svg`
- `tests/worker-g-self-audit.py` — focused functional regression audit across all worlds, live bond math, weather, restore, 1×/2×, pause/resume, phone containment, and unrelated Defense smoke paths.
- `tests/worker-g-depth-pass.py` — depth-specific assertions for Ember tiers, Moonlight activation, Storm circuit completion/breakage/surge, Whiteout counter-window, Eclipse resonance, visual communication, and Pine restraint.
- `reports/worker-g-self-audit.json`
- `reports/worker-g-depth-pass.json`
- `WORKER_G_MANIFEST.md`

## Important symbols / systems changed
- `DEFENSE_MAPS` — `mechanic` metadata and `mechanicZones`; some late-world zones were moved/expanded only enough to make their intended legal build positions actually usable.
- `defenseMapMechanicMarkup(map)` — renders non-interactive fields, optional inner-band metadata, optional two-zone connection lines, and edge-aware phone-safe hint placement.
- `defenseMapZoneMatch(map, x, y)` — canonical zone membership/normalized distance helper.
- `defenseMapOccupiedZones(d, extraMatch)` — derives which mechanic zones are occupied from current tower positions.
- `syncDefenseMapBondStateClasses(d)` — derives `map-circuit-linked` and `map-seal-resonance` battlefield states. This replaced a relational-CSS-only prototype for simpler, more portable state feedback.
- `defenseMapBondForTower(tower, d, {preview})` — derives all positional bonuses, Ember tier, weather state, circuit/resonance state, and concise placement feedback. No persistent bond state is stored.
- `refreshDefenseMapBondVisuals()` — refreshes the small tower set after placement/removal/sacrifice so a newly completed or broken spatial network is immediately visible.
- `updateDefensePlacementPreview(...)` — previews the terrain-adjusted reach ring and concise current Map Bond payoff before placement where the existing placement interaction supplies a preview.
- `defenseCombatStats(tower)` — consumes bond rate/range modifiers and Whiteout protection.
- `dealDefenseDamage(...)` — consumes terrain-provided camouflage/veil sight.
- `initializeDefenseRun(..., {allowLockedMap})` — narrowly scoped restore path used only after checkpoint trust/migration validation so a legitimate later-world checkpoint preserves its validated map identity. Normal unlock gating is unchanged.
- `defenseMapRoutesForQA()`, `defenseSnapshotForQA()`, `defenseTowerCombatStatsForQA()` — gated QA probes for mechanic metadata, derived state, and real combat math.

## New DOM / CSS / state hooks
- Existing map mechanic hooks remain: `.defense-map-mechanics`, `.defense-map-mechanic`, `.defense-map-bond-badge`, `.defense-map-bond-copy`, `.field-guide-map-mechanic`.
- Depth-pass hooks: `.mechanic-has-core`, `.defense-map-bond-link`, `.link-pylon`, `.link-seal`, `.map-circuit-linked`, `.map-seal-resonance`, `.map-bond-zone-<n>`, `.map-bond-tier-<tier>`, `.map-bond-state-<state>`, `.map-bond-preview`.
- No new save/checkpoint schema. Terrain state remains derived from existing tower `x/y`, map identity, and existing weather timers.
- No new currency, input mode, random-tap object, or global overlay.

## Cross-worker dependencies / boundaries
- Worker F can consume `map.mechanic` / `mechanicZones` when enemy or boss pressure needs to acknowledge terrain, but enemy/wave/boss behavior remains F-owned.
- Worker E can attach elemental combat spectacle to the new map hooks without changing G's bond math.
- Worker H should preserve the mechanic layer and bond detail if replacing the tower/global UI, but G did not redesign global UI.
- Worker I can add global audio/motion reactions to completed circuits, Moonlight, Whiteout, etc. G kept only lightweight map-local animation and no new sound ownership.
- Worker D/B may rebalance tower/economy values after merge. G deliberately did not create terrain-specific upgrade trees or economy bonuses.

## Likely merge conflicts
- `game-v79-defense.js`: high because the Defense runtime is monolithic. Preserve the G semantics around `DEFENSE_MAPS`, zone/bond helpers, placement preview, combat/sight consumers, restore handling, and QA probes rather than taking whole-file hunks blindly.
- `launch-v79-defense-alive.css`: moderate with H/I. The final depth work is appended under `/* Worker G depth pass — readable map mastery, not extra input */`; unrelated CSS was explicitly restored during the restraint check.
- `v81-art.css`: moderate with E/I visual work. Preserve the authored world-plate section and gameplay contrast.
- `sw.js`: low-risk additive conflict; keep the five world SVG entries optional, not required-shell blockers.

## Deliberate functional self-audit fixes retained
Two reproducible G-scope bugs from the earlier self-audit remain fixed:
- **Later-world checkpoint identity:** verified/migrated later-world checkpoints preserve the validated map instead of being re-gated to Pine Bend during initialization. Sanitized/tampered checkpoints still use normal unlock resolution.
- **Small-phone mechanic hint containment:** edge-aware mechanic labels remain inside the battlefield at 320×568 without adding media-query debt.

# DEPTH PASS

## Flatness/issues discovered
1. **Most bonds were one-step stat circles.** Once a player learned “put tower in ring,” several maps were solved immediately and repeated runs exposed little additional terrain mastery.
2. **Moon Loop and Eclipse Ridge overlapped mechanically.** Both were essentially camouflage/veil sight plus reach, so two visually distinct worlds produced nearly the same build decision.
3. **Storm Circuit did not fulfill its own fantasy.** Two pylons existed, but each worked independently; the map said “split coverage” without rewarding a player for actually completing the circuit.
4. **Weather often changed presentation more than map strategy.** Several fields lit up during weather, but the player did not gain a new tactical reason to care about that state.
5. **Two later-world strategic positions were technically authored but not meaningfully usable.** One Whiteout shelter area and the late Eclipse seal sat too poorly against the route/blocked geometry to support the intended two-position decision.

## Improvements made
- Turned **Ember Fire Draft** into an authored two-band spatial tradeoff with a visible inner heat band and materially different reach/speed profiles.
- Gave **Moon Basin** a real Moonlight power window while keeping its always-on veil-sight identity.
- Made **Storm Pylons** a reversible two-position network: occupy both to close the circuit, visibly connect them, strengthen both placements, and compound the payoff during surge.
- Changed **Whiteout Shelter** from simple immunity into a counter-window: Whiteout now makes the protected position temporarily stronger while exposed positions become weaker.
- Split **Eclipse** away from Moon by making it a two-position resonance puzzle across inner coil and late ridge, with a visible completed connection.
- Relocated/expanded only the specific late-world mechanic zones necessary to ensure the intended strategic positions are legally buildable.
- Made placement feedback reflect the bond's actual tier/current weather state so play communicates the decision without depending on paragraphs of explanation.
- Replaced a first-pass relational CSS inference for network completion with an explicit **derived** world class. This is simpler, portable, reversible, and still requires no save state.

## Deeper interactions now present
- **Distance mastery:** Ember rewards knowing not only *which field* to use but *how deep* into it to commit.
- **Timed terrain windows:** Moon and Whiteout change the value of an already chosen position when their existing environmental state arrives.
- **Spatial composition:** Storm and Eclipse reward maintaining two separated strategic positions; selling/sacrificing one immediately breaks the network and returns the survivor to its base bond.
- **Weather + network combination:** a completed Storm circuit during surge is stronger than either mechanic alone, creating a discoverable compound state without adding a new button or resource.
- **Build readability:** range-preview geometry, field bands, tower badges, completed links, and weather-local feedback carry more of the teaching burden than explanatory copy.
- **Repeated-run expression:** advanced maps now ask different questions: safe versus hot positioning, timing around Moonlight, split circuit coverage, storm sheltering, or dual-ridge resonance rather than repeating a generic bonus-ring answer.

## Anything intentionally left simple and why
- **Pine Bend remains one-step:** Keeper Stone stays at +12% reach. It is the first-world vocabulary lesson for “terrain can matter,” so adding tiers, timing, or a network there would make onboarding noisier and flatten the progression curve between worlds.
- **No manual terrain buttons/taps:** every deeper mechanic is learned through placement and existing weather. This preserves phone clarity and avoids gimmicky chores.
- **No new persistent terrain resource/progression:** depth comes from spatial/timing decisions, not another currency or menu.
- **No per-map tower upgrade tree:** transformative tower investment belongs to Worker D, not G. Terrain multiplies the value/shape of a tower choice without owning its upgrade architecture.

## Remaining opportunities outside your jurisdiction
- Worker I could add authored map-local audio stingers for a circuit closing, Moon Basin waking, Whiteout shelter opening, or seals resonating.
- Worker E could make bonded elemental attacks visually inherit the map state without changing G's mechanics.
- Worker F could design enemy/boss behaviors that pressure these spaces in later waves, creating richer counterplay while keeping ownership of enemies and waves.
- Worker D/B may need final post-merge tuning so bond percentages remain meaningful against the finished tower/economy curves.
- Worker H could surface terrain state through broader UI only if needed; the current map itself intentionally communicates the basics without requiring that redesign.

## Final restraint check
1. **Removed unnecessary complexity:** restored all unrelated pre-depth CSS that had been touched during an intermediate static-audit cleanup. The final stylesheet depth diff is only the scoped Worker G block. Replaced the relational-selector-only network prototype with one derived map-state class path.
2. **Learnable through play:** mechanic rings remain pointer-safe; Ember shows its inner band; placement range/labels reflect the current bond; Storm/Eclipse visibly connect; weather wakes local terrain. Field Guide/tower text remains backup explanation rather than the sole communication channel.
3. **Ownership respected:** no enemy/wave/boss redesign, no global UI restructuring, no new elemental combat VFX system, no global audio system, no tower upgrade architecture, and no economy expansion.
4. **Mobile/performance restrained:** max tower count is small; network occupancy is derived only on placement/render/sell/sacrifice paths, not every simulation tick. Low-FX mode removes the added network animation/shadows. No extra media query was added.
5. **State/save restraint:** all deeper state is derived from existing coordinates/map/weather timers. No migration/version burden was introduced.

## Regression checks rerun
- `python tests/worker-g-depth-pass.py` — PASS, **26/26**.
- `python tests/worker-g-self-audit.py` — PASS, **69/69** after the depth changes.
- `node --check game-v79-defense.js` — PASS.
- `node --check sw.js` — PASS.
- `node tests/defense-core.test.js` — PASS, **31/31**.
- `python tests/static-defense-audit.py` — PASS, **80/80** after restoring unrelated CSS.
- `node tests/service-worker-policy.test.js` — PASS, **4/4**.
- `python tests/browser-defense-integration.py` — PASS, **77/77**.
- `python tests/browser-defense-surfaces.py` — PASS, **76/76** at 320×568, 390×844, 844×390, and 768×1024.
- `python tests/browser-first-ten.py` — PASS, **41/41** with identical 1×/2×/low-FX opening outcomes.
- `python tests/browser-launch-recovery.py` — PASS, **5/5**.
- A focused 390×844 visual re-experience was also performed across Ember core, Moonlight Basin, completed Storm circuit, Whiteout shelter, and Eclipse resonance; the advanced worlds remained visually distinct and readable during live states.

## Known limitations / regression risks
- Bond percentages are authored for this baseline, not guaranteed final competitive balance after B/D/F merge. Retune numbers rather than deleting the spatial identities if merged balance shifts.
- Map-side feedback consumes existing weather timers/classes. If another worker renames or replaces those states, remap G's hooks instead of creating a parallel weather system.
- The monolithic runtime makes semantic merge discipline important: circuit/resonance refreshes must remain after placement, selling, and Super Rizo sacrifice so derived two-position state cannot become visually stale.
- Environmental change intentionally stops short of moving/destructible routes. That would materially affect enemy pathing/wave design and crosses Worker F/A territory.
- No known unresolved Worker G functional or depth-specific failure remains in this build.

## Integration order
1. Copy the five `assets/defense-*.svg` plates and retain their optional `sw.js` entries.
2. Merge the six `DEFENSE_MAPS` mechanic definitions/zones, including the final legal Whiteout/Eclipse placements.
3. Port `defenseMapMechanicMarkup`, zone/occupancy helpers, `defenseMapBondForTower`, and derived network state classes.
4. Preserve `.defense-map-mechanics` inside the battlefield layer stack.
5. Merge the small combat/sight consumers and placement/tower visual refresh hooks.
6. Append the Worker G blocks from `launch-v79-defense-alive.css` and `v81-art.css`.
7. Preserve the trusted-checkpoint map restore behavior and gated QA probes.
8. Run the depth/self-audit plus the shared core/static/browser suites before accepting the merge.
