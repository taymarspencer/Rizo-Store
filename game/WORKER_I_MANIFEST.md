# WORKER I MANIFEST — FEEL

## Scope
Worker I owns the Defense sensory-feel pass only: animation timing/body performance, event motion hooks, procedural SFX families, Defense music-state mixing, restrained haptic hooks, and reduced-motion behavior.

This pass deliberately does **not** redesign combat mechanics, balance, elemental/ability VFX mechanics, UI hierarchy, map art/mechanics, enemy/wave design, or tower upgrade definitions. It consumes existing states and lifecycle hooks from those systems.

## Player-visible changes
- Gave previously generic Rizo variants distinct attack/performance body rhythms while preserving the existing authored Classic, Ember, Violet, Frost, and Obsidian motion.
- Added quiet Defense idle personality families so Rizos breathe, brace, hover, or twitch subtly when not actively attacking.
- Added tactile deploy, selection, level-up, doctrine-commitment, and Super-Rizo ascension motion. Major transformations now use stronger audio/haptic punctuation and briefly duck the music to create space.
- Added generic physical enemy hit response and stronger boss entrance, phase-windup/interruption, and defeat motion hooks without replacing elemental VFX.
- Added named procedural Defense SFX families for deploy, selection, upgrade/apex, enemy pops, abilities, bosses, gate damage, wave clear, and selling.
- Reworked the procedural Defense music state so planning, combat, packet breaks, boss presence, critical life pressure, and later waves have distinct intensity/space instead of one continuous groove.
- Added restrained named haptic profiles with throttling and graceful no-vibration fallback. Ordinary enemy pops intentionally do not vibrate.
- Added explicit pause freezing and reduced-motion behavior for Worker-I movement while retaining static visual emphasis for important states.
- **Depth pass:** investment now changes attack weight and mastery accents; POWER and CONTROL have distinct body/audio performance; active abilities inherit Rizo-variant signatures; the Field Leader subtly colors the combat score; boss species have distinct entrance/phase/audio identities; and DOM enemy recoil now follows incoming attack direction.

## Files changed
- `game-v79-defense.js` — Defense feel helpers, event call sites, procedural audio/haptics, music-state logic, runtime feel hooks.
- `index.html` — loads the isolated Worker-I feel stylesheet after existing Defense art CSS.
- `sw.js` — caches the new feel stylesheet as an optional shell asset; it is not promoted to a boot-critical dependency.
- `rtd-worker-i-feel.css` — **new** isolated animation/motion/pause/reduced-motion layer.
- `WORKER_I_MANIFEST.md` — **new** integration and verification manifest.
- `reports/worker-i-self-audit-*.txt` — audit evidence from final verification runs.

## Important symbols / systems changed
- `sfx(name, intensity)` — added Defense-specific procedural sound families; existing sound API remains intact.
- `DEFENSE_HAPTICS` / `defenseHaptic(kind)` — named, throttled haptic policy layered over the existing global fallback-safe haptic helper.
- `musicBeat()` — `mini-defense` branch now keys musical density to actual Defense phase, boss presence, life pressure, packet break, and later-wave context.
- `defenseFeelIdleClass(variant)` — maps Rizo visual variants into subtle idle-performance families.
- `defenseFeelPulseTower(tower, kind, duration)` — retrigger-safe temporary tower feel state helper.
- `DEFENSE_FEEL_PITCH` / `defenseSignatureTone(...)` — variant/mastery/doctrine-aware attack timbre with a restrained global/tower mix throttle.
- `defenseAbilitySignature(tower)` — variant + doctrine + Super-aware activated-power sound signature.
- `defenseBossCue(moment, bossId)` — boss-identity procedural audio across arrival/phase/resolve/interrupt/defeat.
- `DEFENSE_BOSS_FEEL_CLASSES` / `defenseBossStagePulse(...)` — retrigger-safe boss identity motion hooks; a token prevents an old timeout from erasing a newer boss moment.
- `renderDefenseTower(...)` — adds the non-mechanical idle feel class.
- Existing deploy/select/upgrade/doctrine/ascension/ability/sell/wave-clear/gate-hit/boss event call sites now emit Worker-I sensory punctuation.
- Boss runtime presentation uses `enemy.feelEnterUntil` plus canonical `boss-entering` / `feel-boss-windup` classes so class rewrites do not erase motion state.

## New assets / DOM / CSS / state / schema / hooks
### Assets
- No sampled audio, image, font, or external media assets were added. Audio remains procedural WebAudio.

### DOM
- No required new DOM structure was introduced. Worker-I animates existing tower, enemy, stage, doctrine, and upgrade-burst surfaces.

### CSS hooks
- Idle: `feel-idle-breathe`, `feel-idle-braced`, `feel-idle-hover`, `feel-idle-twitch`
- Tower moments: `feel-deployed`, `feel-selected`, `feel-upgraded`
- Boss/enemy moments: `boss-entering`, `feel-boss-windup`, stage-level `feel-boss-arrival`, `feel-boss-phase`, `feel-boss-defeat`
- Existing `hit`, firing, ability, doctrine, tier, and upgrade classes are consumed rather than replaced.

### Runtime-only state
- Defense runtime timestamps: `lastFeelHapticAtReal`, `lastSelectionSfxAtReal`
- Enemy presentation timestamp: `feelEnterUntil`
- Enemy presentation cache: `feelHitSignature` plus CSS variables `--feel-hit-x` / `--feel-hit-y` for directional recoil.
- Stage-only transient token: `_rizoBossFeelToken` prevents overlapping boss-moment cleanup races.
- These are transient presentation state only. No save/checkpoint schema version, persistent player state, economy value, combat stat, or reward contract changed.

## Cross-worker dependencies
- **Worker E — Abilities / elemental VFX:** Worker I only adds body anticipation/recovery, generic audio punctuation, and generic hit motion. E remains authoritative for elemental projectile/impact/DOT/status/ability spectacle.
- **Worker F — Enemies / bosses:** Worker I consumes current boss spawn, telegraph, interrupt, and defeat events. F can change boss mechanics/composition; preserve or reattach the feel call sites to equivalent lifecycle hooks.
- **Worker D — Towers:** upgrade level/path/state definitions remain D-owned. Worker I only reacts to current tier/max-upgrade state for motion/audio intensity.
- **Worker H — UI:** no Defense HUD hierarchy/layout ownership was taken. Selection feedback attaches to existing tower selection state.
- **Worker G — Maps:** no map art, route, landmark, or interaction mechanics were changed.

## Likely merge conflicts
- `game-v79-defense.js` is the main collision surface because several workers may touch central Defense event functions. Integrators should port the Worker-I helper blocks and sensory call sites onto the newest gameplay logic rather than resolving by taking this entire file wholesale.
- `index.html` conflict is one stylesheet `<link>` insertion only.
- `sw.js` conflict is one optional shell entry only.
- `rtd-worker-i-feel.css` is isolated and should be low-conflict.

## Deliberate self-audit — final pass
I re-read the Worker-I assignment and shared contract, then audited the **final patched build**, not only the initial implementation.

### Issues found and fixed
1. **Real CSS coverage blind spot:** the repo's shared `tests/browser_harness.py` inlines the older CSS bundle but does not inline the new `rtd-worker-i-feel.css`. Existing browser suites therefore exercised the JS hooks but could miss Worker-I cascade failures. I did not modify the shared QA harness because that belongs to integration/QA; instead I ran a dedicated browser audit with the actual Worker-I stylesheet inlined and recorded the result below.
2. **Selection/upgrade animation cascade bug:** the new idle selector was more specific than the temporary selection/upgrade selector, so the feel classes fired while the body could keep playing the idle animation. Fixed by excluding `feel-selected` and `feel-upgraded` from the idle animation selector. Computed-style verification now resolves to `rtd-feel-select` and `rtd-feel-upgrade` at the right moments.
3. **Pause visual freeze:** Worker-I CSS animations originally kept moving while Defense simulation was paused. Added a pause-state rule that freezes Worker-I tower, enemy, boss, stage, and upgrade-burst animations. Resume restores running animation state.
4. **Contract cleanup:** removed the four `!important` declarations introduced by the first reduced-motion pass. Worker-I CSS now contains zero `!important` declarations.
5. **Major transformation hierarchy gap:** doctrine commitment and Super-Rizo ascension still used generic legacy sensory feedback. Both now use the authored upgrade/apex motion/audio/haptic language without changing their mechanics.

### Primary path / edge-case verification
- Dedicated **actual-Worker-I-CSS browser audit: 21/21**. Verified deploy motion, deploy sound/haptic activity, selection motion, upgrade burst/body transformation, a non-baseline Toxic attack performance, boss windup, pause freeze/resume, 2x presentation-pressure reduction, user reduced-motion, OS reduced-motion, three phone/landscape surfaces, and an unrelated Arcade launch. No page errors.
- Dedicated **transformation hierarchy audit: 3/3**. Doctrine commitment and Super-Rizo ascension both resolve to the authored upgrade body animation; Super ascension still leaves exactly one sacrificed/ascended tower and produces no runtime errors.
- **1x / 2x / low-power deterministic playthrough: 41/41**. Waves 1–10 produce identical full-wave outcomes at 1x, 2x, and 2x low-power; Warden resolves; pause/checkpoint restoration, in-flight projectile restoration, legacy checkpoint migration, and guest mastery ownership remain correct.
- **Phone/layout coverage:** the Worker-I CSS-inclusive audit passed at 320x568, 390x844, and 844x390 with no horizontal overflow or tower-panel escape. The broader integration suite also passed its full viewport matrix.
- **Unrelated Defense/app safety:** launch/recovery 5/5, Defense integration 77/77, v77 feel-pass 33/33, v80 strategy/feel 17/17. The Worker-I audit separately launched Arcade successfully with no runtime errors.

## DEPTH & FLATNESS PASS — final

### Flatness / issues discovered
1. **Investment was mechanically meaningful but sensorially too flat.** A heavily upgraded or mastered Rizo still attacked with nearly the same physical/audio weight as an early copy, so long-term investment was not obvious enough without reading stats.
2. **Activated powers shared too much generic punctuation.** Existing ability mechanics differed, but Worker-I audio/body language made several casts feel interchangeable.
3. **POWER vs CONTROL was legible in text/mechanics more than performance.** Doctrine choice needed to alter anticipation/release rhythm so the path could be felt before reading the panel.
4. **Boss lifecycle presentation was authored by event but repetitive by identity.** Crown/Warden, Vortex/Maw, Mirror, and Apex/Redline used the same basic entrance/phase language, weakening repeat-run memory.
5. **Combat feedback ignored source direction and build identity.** Generic hit recoil plus a mostly build-agnostic combat score made repeated compositions sound/feel more alike than their strategy deserved.

### Improvements made
- Scaled presentation-only attack vectors with tower investment: base attacks remain compact, max upgrades visibly commit farther, and Super Rizos get the strongest body motion. No targeting, timing, damage, or range math changed.
- Deepened mastery attack signatures: higher mastery can expose a second accent/harmonic and Legend-tier punctuation, while global/tower throttles prevent dense fights from becoming an audio wall.
- Added variant-specific activated-power signatures across all 14 Rizo variants, then changed POWER and CONTROL interval/body behavior and added a restrained Super accent.
- Added distinct POWER brace/release and CONTROL coil/snap body animations. Doctrine strikes also inherit different physical weight without replacing E-owned elemental spectacle.
- Made the Defense score subtly build-reactive: during active combat, the current Field Leader's variant pitch, doctrine, and Super state can add sparse motifs to the existing phase/boss/critical music logic. This is deliberately background-level, not a constant melody takeover.
- Gave the four boss identities different entrance physics, phase-stage rhythms, and procedural audio profiles at arrival, phase, resolve/interruption, and defeat. Lifecycle mechanics remain F-owned.
- Made DOM enemy hit response directional using the attacking tower's source vector, so crossfire reads physically rather than every balloon flinching the same way.
- Added token-safe boss-stage pulses so overlapping arrival/phase cleanup cannot erase a newer cue.
- Restraint cleanup removed superseded generic `defense-ability` / generic boss SFX branches and tightened doctrine-strike audio throttling after the depth work.

### Deeper interactions now present
- **Investment → performance:** upgrading/mastering a Rizo changes not only numbers but attack weight and harmonic detail, making investment payoff perceptible during play.
- **Variant × doctrine × Super:** the same activated-power event now inherits character identity, POWER/CONTROL intent, and Super status without needing a new mechanic or tutorial.
- **Field Leader → score:** an existing strategic decision quietly changes combat music vocabulary, so repeated builds can acquire different sonic character.
- **Attacker position → enemy recoil:** where a hit came from now affects physical response in DOM presentation, making multi-angle fields read more naturally.
- **Boss identity × lifecycle:** each existing boss now has a recognizable sensory grammar at entrance and phase changes rather than only a generic “boss event” treatment.

### Anything intentionally left simple and why
- Ambient idle personality stays restrained. Constant bespoke reactions would compete with targeting information, increase motion noise on phones, and drift toward broader character-state design. The deeper identity is concentrated in attacks, doctrines, abilities, upgrades, and bosses where the player is already paying attention.
- Haptics remain sparse and major-event-only; ordinary pops still never vibrate. Repeated-play depth comes from timing/audio/motion identity, not more buzzing.
- Build-reactive music adds sparse motifs rather than becoming a generative composition system. Planning/combat/boss/critical state must remain immediately readable and audio should leave room for SFX.
- No new currencies, combo meters, perks, tactical buttons, or combat rules were added. Worker I deepens feedback for decisions owned by the gameplay workers instead of manufacturing strategy outside its jurisdiction.

### Remaining opportunities outside Worker I jurisdiction
- Worker E can make the now-distinct doctrine/ability body performances line up with final elemental/status spectacle once branches merge.
- Worker F can preserve/rebind boss lifecycle hooks if final boss mechanics or phase composition changes.
- Worker D can preserve/rebind the investment/upgrade hooks around final tower evolution states.
- Worker J/integration should add `rtd-worker-i-feel.css` to the shared browser harness so future generic browser suites automatically exercise this layer.
- Final phone-speaker loudness and physical haptic tuning still require real-device audition; iOS Safari's lack of `navigator.vibrate` remains a platform limitation.

### Regression checks rerun after depth changes
- Dedicated Worker-I **CSS-inclusive depth audit: 27/27** — investment weight, directional recoil, POWER/CONTROL body language, pause freeze, reduced motion, four distinct boss identities, 320x568 / 390x844 / 844x390 containment, 14-variant ability signature coverage, build-reactive score hooks, boss lifecycle audio, and no runtime errors.
- `node --check game-v79-defense.js` — pass.
- `node tests/defense-core.test.js` — **31/31**.
- `python tests/static-defense-audit.py` — **80/80**.
- `node tests/service-worker-policy.test.js` — **4/4**.
- `python tests/browser-v77-feel-pass.py` — **33/33**.
- `python tests/browser-v80-strategy-feel.py` — **17/17**.
- `python tests/browser-first-ten.py` — **41/41**, including identical waves 1–10 at 1x, 2x, and 2x low-power plus Warden resolution and pause/checkpoint/guest-credit guards.
- `python tests/browser-defense-integration.py` — **77/77**, including phase/economy/save invariants and complete viewport containment matrix.
- `python tests/browser-v78-canvas-flow.py` — **11/11**, including production canvas path, stress quality degradation, and DOM fallback after context loss.
- `python tests/browser-launch-recovery.py` — **5/5**.
- Worker-I stylesheet remains at **0 `!important` declarations**.

## Final tests run
All of the following pass on the packaged source tree:
- `node --check game-v79-defense.js`
- `node tests/defense-core.test.js` — **31/31**
- `python tests/static-defense-audit.py` — **80/80**
- `node tests/service-worker-policy.test.js` — **4/4**
- Worker-I CSS-inclusive browser audit — **21/21**
- Worker-I transformation hierarchy audit — **3/3**
- Worker-I CSS-inclusive depth audit — **27/27**
- `python tests/browser-v77-feel-pass.py` — **33/33**
- `python tests/browser-v80-strategy-feel.py` — **17/17**
- `python tests/browser-first-ten.py` — **41/41**
- `python tests/browser-launch-recovery.py` — **5/5**
- `python tests/browser-defense-integration.py` — **77/77**
- `python tests/browser-v78-canvas-flow.py` — **11/11**
- `rtd-worker-i-feel.css` `!important` count — **0**

## Manual / browser observations
- Browser inspection with the actual Worker-I stylesheet active confirmed the upgrade cinematic plus body transformation registers before reading the stat panel.
- Boss telegraph/phase motion pauses with the game and resumes with it; the simulation clock likewise remains frozen during pause.
- 2x preserves gameplay outcomes while the existing presentation budget reduces projectile/impact pressure, so Worker-I does not add sensory spam at fast speed.
- Real physical iPhone speaker/haptic hardware was not available in this worker environment, so device-specific subjective loudness, speaker balance, and physical haptic feel were not auditioned.
- Direct `localhost` / `file://` browser navigation is blocked by the execution environment. The browser audit therefore uses the repo's established inline-app method, but explicitly injects the real Worker-I stylesheet to avoid the shared-harness blind spot.

## Partial implementation / known limitations / regression risks
- **Physical iPhone haptics are partial by platform:** iOS Safari does not expose `navigator.vibrate`; the haptic layer intentionally falls back silently there. Motion and audio still carry the event. Supported vibration platforms receive restrained patterns.
- **Audio is procedural, not mastered samples:** SFX/music remain WebAudio synthesis to preserve the dependency-free/offline baseline. Event differentiation and mix ducking exist, but final loudness/tonal mastering on real phone speakers remains a future audio-production task.
- **Ambient idle personality is intentionally restrained:** variants have distinct ambient idle families, while deeper identity now concentrates in attack/mastery/doctrine/ability performance. A full emotion/temperament reaction system would require broader character-state/product decisions and would add battlefield motion noise.
- **Canvas enemy body response is partial:** DOM enemies receive the new physical hit/boss-body motion. Canvas mode still receives canonical stage/cinematic/audio/state feedback and existing canvas effects; duplicating E/F-owned spectacle in canvas was intentionally avoided.
- **Adaptive music remains deliberately bounded:** later waves add density and the Field Leader can now contribute sparse variant/doctrine/Super motifs, but this is not a generative composition system. True Endless structure/mechanics remain Worker F territory.
- **Shared test-harness integration debt:** `tests/browser_harness.py` does not currently inline `rtd-worker-i-feel.css`. Worker J/integration should add the stylesheet to the shared harness so future generic browser suites automatically see this layer. The final Worker-I build itself loads the stylesheet correctly through `index.html` and caches it optionally in `sw.js`.
- **Central-file merge risk:** sensory calls in `game-v79-defense.js` can be dropped accidentally when A–H branches are merged. Preserve authoritative gameplay logic from those workers, then reattach Worker-I calls to equivalent lifecycle points.

## Integration notes
1. Keep `rtd-worker-i-feel.css` and its `index.html` link after `v81-art.css` so it can supply the final motion layer without rewriting base art rules.
2. Keep the stylesheet in `sw.js` as optional shell content, not required shell content, to preserve launch resilience.
3. Merge `DEFENSE_HAPTICS`, `defenseHaptic`, the Defense SFX names, `defenseFeelIdleClass`, and `defenseFeelPulseTower` as cohesive helper blocks.
4. Reattach the sensory calls to the newest deploy/select/upgrade/doctrine/ascension/ability/sell/wave-clear/gate-hit/boss lifecycle functions if those functions changed in another worker branch.
5. When resolving with E/F/D/H/G, preserve their mechanics and visual ownership first; Worker-I hooks should wrap those authoritative states rather than replace them.
