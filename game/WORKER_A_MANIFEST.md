# WORKER A MANIFEST — PLAYER FLOW & AGENCY

## Scope
Worker A owns Rizo Defense player flow and agency: opening sequence, planning/combat/wave-transition rhythm, contextual access to existing deployment/upgrades/targeting/powers, manual/auto-wave readability, pressure/relief cadence, removal of dead taps/dead time, fast-forward readability, and keeping the player's main Rizo present in the run flow.

I did **not** rebalance Clothing Factory/Beacon economy, redesign collection/loadouts, invent universal tower identities, alter elemental spectacle, author enemy/wave/boss content, create map mechanics, broadly redesign the UI, or change audio/haptic/motion systems. Those remain with Workers B–I per the shared contract.

Authoritative context re-read before the final audit:
- `ASTRA_CONTEXT.md`
- `_multiagent/RTD_MASTER_VISION.md`
- `_multiagent/RTD_SHARED_CONTRACT.md`
- `_multiagent/WORKER_MANIFEST_TEMPLATE.md`

## Delivered player-flow changes
- Entering an empty Defense field now arms the player's active/main Rizo automatically. The player still chooses its position; there is no forced placement or tutorial wall.
- Added a compact contextual `YOUR CALL` rail that continuously converts canonical run state into one or two useful decisions instead of making the player hunt through panels.
- Opening sequence is action-led: enter field -> main Rizo armed -> place on grass -> immediate `SPEND OR SEND?` choice -> start when ready.
- Planning explicitly exposes save-vs-spend tension without changing Worker B's prices: start the next wave, level the Field Leader, choose its path, or open reinforcements.
- Live combat surfaces already-existing Field Leader targeting, upgrades, powers, Ember Pod, and reinforcements without adding new combat mechanics.
- Packet breaks are explicit tactical breathers. If the player selected 2x, the first 1.15 real seconds of a packet break *play back* at 1x, then automatically return to 2x.
- Temporary breather easing never mutates `d.speed`; signed checkpoints still record the player's selected 2x speed and fixed-step combat rules are unchanged.
- Actual phase information remains visible as `PLAN / INCOMING / DEFEND / BREATHER / CLEARED / PAUSED` instead of being replaced by a generic performance label.
- The rail occupies the field feed's existing reserved footprint rather than adding a new row, preserving battlefield/control height on phones and short landscape.
- Informational wave-banner pixels no longer intercept battlefield pointer input beneath them.

## Deliberate final self-audit — 2026-09-12
I retested the primary opening path, live decisions, obvious edge cases, pause/resume, 1x/2x behavior, checkpoint speed state, 320px phone geometry, short landscape, tablet surfaces, launch/recovery, renderer fallback, and unrelated Defense context surfaces.

### Defects found and fixed during the audit
1. **Quick actions could hide the battlefield.** The rail originally delegated upgrade/target/power actions to canonical functions that reopened the tower sheet afterward. That violated the assignment's field-first live-decision requirement.
   - `cycleDefenseTarget(id,{showPanel=true}={})`
   - `upgradeDefenseTower(id,{showPanel=true}={})`
   - `activateDefenseAbility(id,{keepAbilityTray=false,showPanel=true}={})`
   - Rail calls now pass `showPanel:false`; existing callers retain old behavior by default.
   - Reaching the doctrine fork is the intentional exception: the path-choice sheet opens because a real POWER/CONTROL decision is required.

2. **Doctrine fork could advertise a dead `LEVEL UP` tap.** At Level 3 with no doctrine selected, the rail could still prioritize upgrade even though the canonical upgrade path requires choosing POWER or CONTROL first.
   - Doctrine need now has precedence over upgrade affordability.
   - Rail shows `CHOOSE PATH` in planning, combat, and packet breaks until the path is resolved.

3. **Post-wave settle window could promise a temporarily blocked START.** Canonical wave completion intentionally prevents another start for 0.72 real seconds while the last pop settles. The rail could show `START WAVE` during that lockout.
   - It now shows `FIELD SETTLING • PLAN NOW` and exposes a valid aim/upgrade/path/reinforcement action.
   - When the canonical lockout expires, normal `SPEND OR SEND?` / `START WAVE` flow returns.

4. **320px rail geometry leaked outside its reserved feed.** The absolute rail was 48px tall inside a 42px feed and a secondary action could collapse to 44px wide.
   - Rail now uses `height:100%; box-sizing:border-box` inside the existing feed.
   - Standard decision buttons have a 60px minimum width; narrow container fallback remains bounded without adding media-query debt.
   - Verified at 320x568: feed and rail are both exactly 297.625x42, no horizontal overflow, and both actions remain 32px high / >=60px wide in that phone layout.

### Audit assumption rejected rather than “fixed”
A draft smoke test tried to launch all six worlds from a fresh progression state. The runtime correctly falls back to the unlocked Grove when later maps are locked. I did **not** change progression/map rules to satisfy an invalid test. The final regression check instead verifies that all six authored map/route definitions remain registered and separately verifies a normal fresh-state Grove launch.

## Dedicated depth & flatness pass — 2026-09-12
The functional pass proved the flow worked; this pass re-experienced the same subsystem for repeat-play depth and deliberately looked for places where the rail was merely *present* rather than strategically authored.

### Highest-impact flatness found
1. **The rail was too static.** It mostly behaved like a priority list, so repeated combat could collapse into the same `LEVEL UP / AIM / POWER` rhythm regardless of what was actually happening on the road.
2. **Readiness was being confused with urgency.** A ready Field Power or Ember Pod was almost always promoted immediately, teaching the player to spend cooldowns simply because they were lit instead of deliberately banking them.
3. **Targeting was opaque.** A field-first `AIM` button existed, but cycling modes without a battlefield read was still a low-information interaction.
4. **Successful actions immediately produced another demand.** The rail could nag the player into constant micro instead of allowing a choice to breathe and become legible.
5. **Auto Waves was strategically binary.** An experienced player either accepted every automatic boundary or disabled Auto Waves entirely, which removed a useful one-wave timing decision.

### Depth improvements made
- Added a lightweight `defenseFlowFieldRead()` that observes only already-canonical live facts: boss presence, front-most enemy progress, active density relative to the existing cap, and Gate pressure. It changes **presentation priority only**; no enemy AI, stats, wave composition, damage, targeting semantics, or economy values were changed.
- Ready powers and Ember Pod can now be **banked** on a calm road. Under boss/Gate pressure they promote themselves to the primary call, creating an understandable hold-versus-cash-in rhythm without adding a new meter or resource.
- Targeting now communicates the next call explicitly (`AIM → TOUGHEST`) and, when the road provides a strong read, can surface a direct tactical call such as `AIM TOUGHEST` or `AIM FRONT` instead of asking the player to blindly cycle.
- After a live target/upgrade/power/Pod call, the rail enters a brief `CALL MADE • LET IT WORK` quiet beat. This intentionally prevents the deeper system from becoming higher-frequency busywork.
- Combat investment language now exposes the actual flow tension as `CASH WINDOW • INVEST OR HOLD`; Worker B's prices and economy formulas remain untouched.
- Auto Waves now exposes `AUTO COMMIT` with `SEND NOW` versus **`HOLD FIELD`**. Holding gives the player exactly this boundary back while leaving Auto Waves enabled; clearing the next wave naturally returns to automatic cadence.
- Decision emphasis is eventful rather than constant: the rail pulses when the *class of meaningful choice* changes, and render-key caching prevents unnecessary DOM rewrites every UI tick.
- Packet breaks were tightened conceptually to `BREATHER • MAKE ONE CHANGE`, preserving relief and readability rather than turning the pause into a checklist.

### Deeper interactions now present
- **Bank versus spend:** a ready power is no longer synonymous with “press now”; the player can carry it into a boss/Gate window.
- **Road read versus formation plan:** target priority can respond to a clear boss/front-line condition while still allowing the player to keep the existing plan when the field is stable.
- **Investment versus patience:** cash availability is surfaced as an option, not a command, and the post-action quiet beat makes the result observable.
- **Automation versus agency:** Auto Waves can stay useful for tempo while the player claims one specific boundary when a formation deserves another decision.
- **Pressure/relief rhythm:** calm fields deliberately become quieter, meaningful pressure promotes the relevant tool, and packet breaks ask for one considered adjustment.

### Restraint check
- Removed the rail's 2px positional pulse after it caused a tiny 320px feed excursion. The remaining outline/shadow emphasis communicates a new decision without moving the control surface.
- Aligned the flow's critical Gate read to the existing `.88` live-status threshold rather than inventing a second “critical” semantic threshold.
- Kept the field read intentionally small instead of building a hidden scoring/AI-director system. Clear boss/front/Gate conditions can influence priority; ambiguous situations remain the player's judgment.
- `HOLD FIELD` is deliberately ephemeral and is **not** added to checkpoint/save schemas. It is a one-boundary convenience, not a new persistent game rule.
- No new modal, tutorial wall, currency, cooldown, tower mechanic, wave mechanic, map mechanic, or sensory system was added.

## Files changed
- `game-v79-defense.js`
  - phase/decision flow hook
  - first-Rizo arming
  - contextual decision selection/action routing
  - pressure-aware field read and explicit tactical targeting calls
  - banked-versus-pressure promotion for existing powers/Pod
  - post-action quiet beat and meaningful-choice pulse cadence
  - one-boundary Auto Waves `HOLD FIELD` override
  - field-first optional dispatch for targeting/upgrades/powers
  - doctrine/settling-state precedence
  - phase/readout synchronization
  - packet-break playback easing
  - ephemeral flow state
- `launch-v79-defense-alive.css`
  - contextual decision rail presentation
  - meaningful-choice emphasis without positional motion
  - existing-feed footprint/layout safety
  - 320px action sizing correction
  - narrow-sidebar container adaptation
  - non-interactive informational wave banner
- `tests/browser-worker-a-flow.py`
  - focused Worker A regression suite expanded for depth, pressure reads, banking, quiet beats, direct targeting, and one-boundary Auto control
- `WORKER_A_MANIFEST.md`
  - this final integration/audit record

No image/audio assets were added or changed.

## Important symbols / systems changed
- `defensePlaybackSpeed()` — derives temporary playback speed without changing selected/saved `d.speed`.
- `defenseFlowOnPhaseChange()` — creates decision beats and starts a 2x packet-break ease window.
- `defenseSetPhase()` — invokes the flow hook after valid phase transitions.
- `closeDefenseMapIntro()` — arms the active/main Rizo on an empty field.
- `defenseFlowFieldRead()` — reads canonical battlefield pressure for flow priority only; it never modifies combat.
- `defenseFlowTargetCall()` — turns clear field reads into explicit existing target-mode calls, otherwise previews the next normal target cycle.
- `defenseFlowChoice()` — maps canonical state to the highest-value current decision, including banking, pressure windows, doctrine, auto-boundary holds, and post-wave settling precedence.
- `updateDefenseDecisionRail()` — renders/caches the contextual decision and emphasizes only meaningful choice-class transitions.
- `defenseRecordFlowAction()` — creates a short post-action quiet beat so live agency does not become nagging micro.
- `runDefenseFlowAction()` — delegates to canonical placement/start/resume/target/upgrade/inspect/power/pod functions plus the ephemeral one-boundary Auto hold.
- `cycleDefenseTarget(...,{showPanel})` — optional field-first target cycling; default remains prior panel behavior.
- `upgradeDefenseTower(...,{showPanel})` — optional field-first upgrade; doctrine fork still opens the required path sheet.
- `activateDefenseAbility(...,{showPanel})` — optional field-first power activation; default remains prior panel behavior.
- `updateDefenseHud()` — true phase text, flow rail, and effective breather-speed display.
- `cycleDefenseSpeed()` — manual speed input cancels temporary automatic easing.
- `updateDefenseRealTime()` — expires easing using real/control time and respects a one-boundary Auto Waves hold without disabling the global setting.
- `advanceDefenseFixedFrame()` — applies `defensePlaybackSpeed()` to wall-time progression while preserving the fixed 30 Hz simulation contract.
- `handleDefensePointerDown()` — routes `[data-defense-flow-action]` through the shared input path.

## New DOM / CSS / state / schema
New DOM surface in `renderDefenseWorld()`:
- `#defenseDecisionRail`
- `#defenseDecisionTitle`
- `#defenseDecisionCopy`
- `#defenseDecisionPrimary`
- `#defenseDecisionSecondary`
- `[data-defense-flow-action]`

New CSS/state:
- `.defense-decision-rail`
- `.defense-decision-rail.pulse`
- decision tones: `plan`, `combat`, `power`, `breather`, `paused`

New runtime fields are ephemeral only and deliberately excluded from checkpoint/save schemas and signatures:
- `flowDecisionBeat`
- `flowPulseUntilReal`
- `flowEaseUntilReal`
- `flowChoiceKey`
- `flowLastAction`
- `flowActionQuietUntilReal`
- `flowAutoHeldWave`

No persistent save migration, economy schema, enemy schema, wave schema, or reward schema was changed.

## Cross-worker dependencies / boundaries
- **B / Economy:** rail reads canonical cash and cost functions. Prices, Factory, Beacon, and economy balance remain B-owned.
- **C / Roster:** first-entry arming uses the existing roster row whose source is `active`. Collection/loadout mechanics remain C-owned.
- **D / Towers:** tower identity, upgrade behavior, targeting semantics, and doctrine mechanics remain D-owned. Worker A only changes when existing actions are surfaced. D should preserve or merge the optional `showPanel` behavior if touching the same functions.
- **E / Abilities:** power mechanics/VFX remain E-owned. Worker A only requests a field-first activation path. E should preserve or merge `showPanel` when touching `activateDefenseAbility()`.
- **F / Waves:** breather flow reacts to canonical `PACKET_BREAK`; authored packet structure, boss pacing, and Endless composition remain F-owned.
- **G / Maps:** Worker A surfaces map interactions when canonical hooks exist; it does not invent map mechanics.
- **H / UI:** preserve the decision rail IDs/action attributes or update `updateDefenseDecisionRail()` with H's replacement. Most importantly, do not stack another feed row and shrink the battlefield.
- **I / Feel:** existing action SFX/haptics remain intact. Worker A adds only restrained visual pulse state, not sensory-system ownership.

## Verification — final audited build
Fully completed on the final audited files:
- `node --check game-v79-defense.js` — PASS.
- `node tests/defense-core.test.js` — **31/31 PASS**.
- `python tests/static-defense-audit.py` — **80/80 PASS**; no new `!important` debt and media-query limit preserved.
- `node tests/service-worker-policy.test.js` — **4/4 PASS**.
- `python tests/browser-worker-a-flow.py` — **33/33 PASS**.
  - opening/main-Rizo arming and placement -> spend/send
  - canonical START/countdown and exact pause/resume phase restoration
  - field-first upgrade/aim/power behavior and post-action quiet beat
  - explicit target-cycle labels plus direct boss `AIM TOUGHEST` call
  - doctrine fork -> `CHOOSE PATH`
  - calm ready power stays banked; boss pressure promotes it
  - meaningful option arrival produces a visible decision beat
  - 1x packet break remains 1x; selected 2x eases visibly while checkpoint remains 2x
  - 320px rail containment/tappable actions/no overflow
  - post-wave settling never advertises blocked START
  - Auto Waves `AUTO COMMIT` offers `SEND NOW` vs `HOLD FIELD`
  - one-boundary hold survives the normal countdown without silently starting
  - all six map/route definitions remain registered; fresh Grove launch works
  - tower/bench/intel unrelated surface smoke; no runtime errors in tested paths
- `python tests/browser-v80-strategy-feel.py` — **17/17 PASS**.
- `python tests/browser-defense-surfaces.py` — **76/76 PASS** across 320x568, 390x844, 844x390, and 768x1024.
- `python tests/browser-v78-canvas-flow.py` — **11/11 PASS**; production canvas path, logical/visual projectile separation, performance governor, and DOM fallback remain intact.
- `python tests/browser-launch-recovery.py` — **5/5 PASS**.

Long-suite status, recorded transparently:
- `browser-defense-integration.py` completed **77/77** on the first Worker A build. A post-audit rerun produced no failures through the checkpoint/signature validation portion before the execution window expired; the audit fixes are confined to flow choice/dispatch/layout paths additionally covered by the 33/33 Worker A suite above.
- `browser-first-ten.py` completed **41/41** on the pre-depth Worker A build. The depth-build rerun again exceeded the execution window, but before cutoff both mixed 1x and mixed 2x completed waves 1–10 with identical per-wave clear times, bounded density/projectile budgets, non-negative earned cash, purchased field-power use, boss-with-escort presence, and a dead Warden; no failure appeared before cutoff. The depth pass does not alter simulation math, damage, density, economy values, wave/enemy content, or serialized selected speed.

## What remains intentionally partial / unimplemented
- **Endless cadence is only as good as Worker F's authored packetization.** Worker A reacts to canonical packet breaks and keeps them readable; it does not invent Endless enemies/waves to manufacture decisions.
- **The rail prioritizes the Field Leader/main Rizo.** Other placed Rizos remain available through normal inspection/roster surfaces. This is intentional to keep the player's own Rizo central and avoid turning every live second into tower-by-tower micromanagement.
- **Map-interaction decisions are not present until Worker G provides canonical map mechanics/hooks.** No fake interaction was added.
- **Factory/Beacon decisions are not present until Worker B provides those structures.** The flow layer is built to read canonical costs/state rather than duplicating future economy logic.
- **No broad targeting UI redesign was attempted.** The live rail can make an explicit existing target-mode call when the field read is unambiguous; detailed tower inspection and all targeting semantics remain D-owned.
- **The field read is intentionally not a hidden tactical autopilot.** It only promotes obvious boss/front/Gate pressure states. Ambiguous formation choices remain player expression instead of being “solved” by Worker A.
- **The one-boundary Auto hold is not checkpointed.** Reloading/restoring returns to the configured Auto Waves behavior. Persisting a transient boundary preference would add save/schema complexity without enough strategic value.
- **Exact first-minute decision count still depends on player pace.** The opening exposes multiple understandable choices immediately after placement and during wave flow, but Worker A does not force timed modal decisions simply to hit a quota.

## Regression / merge risks
- Highest collision risk is Worker H in `.defense-field-feed`, `.defense-wave-banner`, and the compact decision surface. Preserve one reserved feed height.
- Workers D/E may touch `cycleDefenseTarget`, `upgradeDefenseTower`, or `activateDefenseAbility`. Their normal existing behavior is preserved by default arguments; merge the optional field-first `showPanel:false` path rather than deleting either worker's mechanics.
- Worker F may change packet-break timing. Keep Worker F's authored duration authoritative; Worker A's `flowEaseUntilReal` is only a short real-time readability aid.
- Do not serialize `flowEaseUntilReal`, `flowPulseUntilReal`, `flowDecisionBeat`, `flowChoiceKey`, `flowLastAction`, `flowActionQuietUntilReal`, or `flowAutoHeldWave`; checkpoint compatibility and the intentionally transient flow layer depend on these remaining ephemeral.

## Integration note
The safest merge preserves Worker A's flow-read/selection/dispatch block plus the final CSS block and `tests/browser-worker-a-flow.py`. Keep `d.speed` as the persistent player-selected speed and all `flow*` cadence/readability fields ephemeral. Preserve `[data-defense-flow-action]` delegation rather than cloning mechanics into button-specific handlers. If Worker H replaces the visual rail, keep the canonical state-to-decision behavior while maintaining the existing feed footprint and battlefield visibility.
