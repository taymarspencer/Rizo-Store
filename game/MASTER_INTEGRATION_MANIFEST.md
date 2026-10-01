# RIZO TOWER DEFENSE — MASTER INTEGRATION MANIFEST

One definitive build reconstructed from the authoritative v87 baseline plus the
strongest compatible work of Workers A–J. Integration was performed baseline-first:
no worker build was adopted as the foundation.

---

## INPUT INVENTORY

Four transport containers were supplied. None is a project build; each holds worker
ZIPs only.

| Container | Contents |
| --- | --- |
| `ABC 1.zip` | `RTD_WORKER_A_FLOW.zip`, `RTD_WORKER_B_ECONOMY.zip`, `RTD_WORKER_C_ROSTER.zip` |
| `ABC 2.zip` | `RTD_WORKER_D_TOWERS.zip`, `RTD_WORKER_E_ABILITIES.zip`, `RTD_WORKER_F_ENDLESS.zip` |
| `ABC 3.zip` | `RTD_WORKER_G_MAPS.zip`, `RTD_WORKER_H_UI.zip` |
| `ABC 4.zip` | `RTD_WORKER_I_FEEL.zip`, `RTD_WORKER_J_QA.zip` |

All ten expected workers A–J were present and were confirmed before any
implementation began. Each worker ZIP is a complete standalone copy of the project
(198–229 files), so "duplicated files across packs" was resolved by provenance rather
than by overwriting: every file was attributed by comparing its SHA-256 against the
baseline manifest, never by pack order or filename.

Artifacts read for each worker: `WORKER_<X>_MANIFEST.md` (all ten), plus
`INTEGRATION_RISK_MAP.md` (Worker J) and the shared contract documents
`ASTRA_CONTEXT.md`, `_multiagent/RTD_MASTER_VISION.md`,
`_multiagent/RTD_SHARED_CONTRACT.md`, `_multiagent/WORKER_MANIFEST_TEMPLATE.md`,
`_multiagent/BASELINE_SHA256.txt`.

---

## BASELINE CONFIRMATION

The authoritative baseline is the **v87 `v87-first-ten-visual-nuance` snapshot**
described by `ASTRA_CONTEXT.md` and fingerprinted by
`_multiagent/BASELINE_SHA256.txt` (192 files).

No worker shipped the baseline itself, and the repository's `main` branch is *older*
than the pack baseline (it predates the v87 pass — it has no `arcade-v87-system.css`,
and its `game-v79-defense.js` hashes differently). The baseline was therefore
reconstructed rather than assumed:

1. For each of the 192 manifest entries, every worker copy was hashed and the copy
   matching the manifest hash was restored. This recovered **191 of 192** files
   byte-exactly.
2. `game-v79-defense.js` was the sole file modified by all ten workers, so no
   pristine copy existed anywhere. It was recovered by a token-level consensus
   reconstruction across the ten divergent copies (each worker's own edits are
   outvoted by the nine that did not make them).
3. The reconstruction was **verified, not trusted**: the result hashes to
   `4b75a7534841c832a298bb4b1b444a310105a68bad9d03d2729908da34ff2b3f`, exactly the
   manifest value.

Final baseline verification: **192/192 files match `BASELINE_SHA256.txt`.** Every
per-worker diff in this integration is measured against that verified baseline.

Merge base: the reconstructed baseline as a git root commit, with each worker as a
sibling branch, so every merge was a true three-way merge with a known ancestor.
Because the live runtime is minified-long-line JavaScript, line-level merging reports
whole-function conflicts; a token-level three-way merge resolved non-overlapping
edits inside shared lines and escalated only genuinely overlapping edits for manual
resolution. **Every escalated conflict was resolved by intent, never by "take ours"
or "take theirs".**

Integration order followed Worker J's risk map (state and data contracts first,
presentation next, feel last): **J → A → B → C → D → G → F → E → H → I**, then a glue
and coherence pass. Tests were run after every stage, not once at the end.

---

## WORKER A — FLOW & PLAYER AGENCY

**Accepted:** the contextual `YOUR CALL` decision rail and its full state-to-decision
model; action-led opening (main Rizo armed on entry, player still chooses position);
true phase readout (`PLAN / INCOMING / DEFEND / BREATHER / CLEARED / PAUSED`);
pressure-aware field read; bank-versus-spend promotion of ready powers; explicit
target calls; post-action quiet beat; one-boundary Auto Waves `HOLD FIELD`; packet
break 1× playback easing that never mutates saved `d.speed`; field-first optional
`showPanel` dispatch on targeting/upgrade/ability; non-interactive wave banner; all
`flow*` fields kept ephemeral and out of the checkpoint.

**Modified:** nothing in Worker A's mechanics. Its appended presentation block moved
out of `launch-v79-defense-alive.css` into `rtd-defense-integration.css` (identical
cascade position) so the core stylesheet stays inside its performance budget.

**Rejected:** nothing.

## WORKER B — ECONOMY & STRUCTURES

**Accepted:** Clothing Factory and Beacon as universal deployables; both evolution
ladders (FOLD TABLE → RIZO INDUSTRIAL, WORK LIGHT → PRIVATE SUN); the deterministic
Core economy block (`STRUCTURES`, deployment/upgrade curves, `beaconSupport`,
`factoryEconomy`, `goldenFactoryMultiplier`); strongest-covering-Beacon-only support
(non-multiplicative); escalating duplicate deployment costs; clean-production
momentum broken by a Gate leak; RIZO DROPS; BRAND LOOP; PRIVATE SUN amplification;
non-stacking GOLDEN LICENSE; capped Golden↔Factory synergy; cadence preservation when
support changes; `worker-b-economy.css` in full.

**Modified:** structures no longer masquerade as roster pets. Worker B appended them
to `defenseRoster()`, which Worker C's manifest explicitly asked it not to do and
which broke outright once Worker C rewrote that function (the appended line
referenced a variable C had removed). Structures now carry `source:"structure"` and
reach the bench through the shared `defenseDeployRows()` layer. Checkpoint
canonicalization was widened so a paid structure still restores (see BUGS FIXED).
Structure upgrades now finish through the shared upgrade pipeline instead of their
own shorter sequence.

**Rejected:** nothing.

## WORKER C — PERSONAL RIZO & ROSTER

**Accepted:** the Captain model (player's active Rizo locked first in every run, free
first deployment, prefers the deployed Captain as Field Leader); Captain + up to three
wing slots replacing the automatic four-Rizo opening; House Rizo pre-run selection;
loaner retirement at two eligible House residents; `LOANER • NO MVP • NO MASTERY`
framing and the permanent-reward exclusion; run-roster freezing (`runRosterIds`);
checkpoint-safe roster reconstruction; crew read, tactical identity chips, trail-fit
highlighting against the real `DEFENSE_WORLD_OPENING_PERKS`, care-trained identity,
mastery tendency, Captain battlefield marker; the two new `state.settings` fields.

This directly implements the master vision's "main Rizo + a limited number of
discovered Rizos" roster model, so it was accepted over the baseline's automatic
guest crew even though `ASTRA_CONTEXT.md` flagged that opening as an open playtest
question. The loaner path remains for players with no collection.

**Modified:** wing selection and roster picking now explicitly reject universal
deployables (a structure id could otherwise be stored as a wing). `defenseRoster()`
is preserved as the character-only crew source; the bench is a separate composed
layer. `browser-first-ten.py`'s mixed scenario was rewritten onto the new contract
(see AUTOMATED TEST RESULTS).

**Rejected:** nothing.

## WORKER D — UNIVERSAL TOWERS & UPGRADES

**Accepted:** BASIC DEFENSE RIZO in full — $85 first deploy, +$20 per copy,
$70/$125/$230/$430 upgrades; the five visual states (BLANK FRAME → STITCHER → FIELD
KIT → BOLT DRIVER/RIVET CROWN or PIN WHEEL/THREADSTORM); LV2 double-stitch that
actually forks to a second threat; the permanent POWER/CONTROL doctrine with
different default targeting; LV4 behaviour changes before the apex; RIVET CROWN
armour-ranked side rivets; THREADSTORM three-target control web; setup/payoff
interactions in both directions; `needle`/`rivet`/`pin` projectile kinds in both DOM
and canvas renderers; stitch/rivet/thread connection lines; the character-boundary
safeguards; `worker-d-towers.css` in full.

**Modified:** Worker D independently invented `defenseDeployRows()` for the same
purpose as the integration bench layer, so the two were collapsed into one. Bench
order is now "protagonist, universal kit, discovered crew" — the Captain always
leads, and the whole universal kit sits in the first bench frame so a player who owns
only their starter Rizo never has to scroll to find a complete game. `DEFENSE_BASIC_PET`
joined the universal id set so the frozen crew roster cannot absorb it on restore.

**Rejected:** nothing.

## WORKER E — ABILITIES & VFX

**Accepted:** all 14 distinct cast silhouettes and battlefield reaction layers;
readiness pip with synchronous clear; the 12-step battlefield cooldown fill; POWER
expand-outward versus CONTROL converge-inward motion grammar; Apex crest and field
punctuation; the four deterministic Apex resonance interactions (Ember Flashover,
Toxic Bloom, Frost Crystal, Obsidian Shatter) using existing status timers;
simultaneous `is-burn`/`is-poison`/`is-frost`/`is-root` presentation; canonical
`burnUntil`-driven burn visuals; distinct canvas status language and Glitch/Bubblegum
impact grammar; pause-safe FX cleanup; `worker-e-abilities-depth.css`.

**Modified:** nothing in Worker E's mechanics. Its status class list was unioned with
Worker F's support states on the same source line rather than either side winning.

**Rejected:** nothing.

## WORKER F — ENEMIES, BOSSES & ENDLESS

**Accepted:** authored Waves 11–30; Relay and Mender support enemies with their
combination (Relay shortens Mender triage; killing Relay opens a 1.05s signal
collapse; Mender repairs shredded-but-not-broken plating); Wave 20 Maw and Wave 30
Mirror set pieces; Wave 40 Redline with matched escorts; the deterministic Endless
formation grammar with three authored acts per archetype and evolving formation
tiers; three rotating recovery valleys; bounded high-tier boss second acts; flatter
late durability curve so difficulty comes from composition; the raised
`MAX_SUPPORTED_WAVE = 9999` ceiling and matching long-run bounds; `weather` and
`specialBias` consumption; canvas and DOM readability for both support enemies.

**Modified:** Worker F's three new persisted fields (`supportCycle`,
`signalStaggerUntil`, `bossPhase`) were serialized, normalized and restored but
**never signed**. Checkpoint schema was bumped to **v10** with a new salt and an
additive `supportContinuation` payload (see GLUE / BUGS FIXED). Worker J's ceiling
guard is expressed via the constant, so it correctly moved to 9,999 with no edit.

**Rejected:** nothing.

## WORKER G — MAPS

**Accepted:** five new authored world plates (`assets/defense-*.svg`) with the live
route kept as a separate high-contrast gameplay layer; Map Bonds on all six worlds —
Keeper Stone, the two-band Ember Fire Draft, Moon Silver Basin with its Moonlight
window, reversible Storm Live Pylons circuit, Whiteout Ice Shelters counter-window,
Eclipse Shadow Seals resonance; weather-aware placement preview; derived network
state classes with no new save state; the trusted-checkpoint later-world map restore;
gated QA probes; `v81-art.css` world plates.

**Modified:** the map-bond hint placement was rebuilt (see BUGS FIXED). Worker G's
appended presentation moved to `rtd-defense-integration.css` at the same cascade
position.

**Rejected:** nothing.

## WORKER H — UI & MOBILE

**Accepted:** the phone HUD rebalance and single compact command ribbon; compact and
short-landscape behaviour that drops labels before shrinking the battlefield;
collapsible bench; the POWERS control fix (opens the grouped tray, exposes ready
count / next cooldown / locked state); boss health promoted to a battlefield overlay;
signed gold deltas; upgrade preview chips; the five-node evolution rail; per-copy
power charge pips and next-charge rail; ready-arrival punctuation; distinct
perfect/milestone clear tones; persistent field investment marks; reduced-motion and
increased-contrast handling; the `.defense-tower` press-transform exclusion and
stationary START WAVE pulse from H's own self-audit; `worker-h-ui.css`.

**Modified:** two over-broad rules were scoped (see BUGS FIXED) — the blanket
`touch-action:manipulation` and the non-square phone battlefield. Both are genuine
regressions against other specialists' work that Worker H's chosen test list did not
exercise.

**Rejected:** nothing.

## WORKER I — ANIMATION, AUDIO & GAME FEEL

**Accepted:** per-variant attack and idle performance families; deploy / selection /
level-up / doctrine / ascension motion; directional DOM enemy recoil; the four
distinct boss identities across arrival, phase, resolve and defeat; investment-scaled
attack weight and mastery accents; POWER brace-release versus CONTROL coil-snap;
variant-aware activated-power signatures for all 14 identities; the procedural
Defense SFX families; phase/boss/critical/late-wave music states with Field Leader
motifs and transformation ducking; named throttled haptic profiles with graceful
no-vibration fallback; explicit pause freezing; reduced-motion handling;
`rtd-worker-i-feel.css` (zero `!important`).

**Modified:** nothing in Worker I's work. Worker I's own flagged integration debt —
the shared browser harness not inlining its stylesheet — is fixed, and two
geometry assertions elsewhere were corrected to measure settled rather than
mid-animation state (see BUGS FIXED).

**Rejected:** nothing.

## WORKER J — QA / ADVERSARIAL REFEREE

**QA findings adopted:** the entire v9 continuation-signing schema with v2–v8
verification and migration preserved; `MAX_CHECKPOINT_PROJECTILES = 32` enforced in
both the checkpoint builder and the normalizer; duplicate restored enemy-ID
canonicalization; packet cursor and remaining-queue reconciliation without dropping
threats; impossible wave resolved/total repair; the sequential-progress invariant
(`currentWave <= clearedWave + 1`); unfinished-but-mislabelled state forced to paused;
stale combat payload stripped for already-cleared progress; wave completion requiring
`waveResolved >= waveTotal`; the ceiling replay-start guard; the full hostile
action-order gate; determinism pairs; lifecycle/suspend guards; the integration risk
map, used as the merge order and the invariant checklist.

**QA findings not applicable:** Worker J's baseline note that the game is hard-capped
at wave 250 no longer describes the build — Worker F raised the ceiling to 9,999, and
because J expressed its guard in terms of `MAX_SUPPORTED_WAVE` the guard followed
correctly. J's observation that Factory, Beacon, roster redesign, map mechanics and
Endless "do not yet exist" was true of the baseline and is now superseded; the
attachment seams J gated are the seams those systems actually landed on.

**Tests/invariants used:** `worker-j-defense-guard.test.js`,
`worker-j-integration-risk-audit.py`, `browser-worker-j-qa.py`,
`browser-worker-j-hostile.py`, `browser-worker-j-determinism.py` (speed and low
pairs), and the 23-invariant checklist in `INTEGRATION_RISK_MAP.md`, re-tested after
every merge.

**Modified (test expectations only, never the guarantees):** three Worker J
assertions pinned literals that a legitimate forward change invalidated. Each now
reads the value from the runtime, which keeps the invariant and strengthens it:
`VERSION === 9` became a non-regression floor; the endless-ceiling probe reads
`MAX_SUPPORTED_WAVE`; the legacy-schema check derives the accepted-version list from
`DefenseCore.VERSION`, so a forward bump passes but dropping a legacy version still
fails. A new v10 test proves v9 did *not* sign Worker F's support fields and v10 does.

---

## GLUE CODE CREATED

### `defenseDeployRows()` / `defenseDeployRegistry()` / `defenseUniversalRows()`
**What:** the single composed bench source — Captain, then the universal Defense kit
(Basic Defense Rizo, Clothing Factory, Beacon), then discovered wings.
**Why:** three workers needed one bench. Worker C owns `defenseRoster()` as the Rizo
*character* crew and explicitly asked that structures not be faked into it; Worker B
had appended structures there anyway; Worker D independently built its own
`defenseDeployRows()`. Without one composed layer the bench either loses the universal
kit or the crew stops being a crew.
**Connects:** B (structures) + C (crew) + D (universal tool) + H (bench presentation).

### `defenseRestorableRegistry()` / widened `defenseCheckpointRosterRegistry()`
**What:** the set of every id that may legally stand on the field, used by checkpoint
canonicalization and restore.
**Why:** character-only lookup silently dropped paid universal deployables on restore.
**Connects:** B + C + D + J (save contract).

### `defenseIsCharacterTower()`
**What:** one predicate for "is this a collected Rizo character".
**Why:** Worker B (structures) and Worker D (universal tool) each shipped their own
exclusion helper, so any check using only one let the other through.
**Connects:** B + C + D + E (field powers) + J (reward integrity).

### `defenseCommitUpgrade()`
**What:** one upgrade-completion pipeline: tower visual state → map bond refresh →
support network refresh → authored upgrade motion → UI reads → checkpoint write →
music duck → authored SFX → haptic profile.
**Why:** exactly the case the brief describes. Five specialists react to an upgrade,
and Worker B's structure path had grown a shorter sequence of its own, so evolving a
Factory to RIZO INDUSTRIAL or a Beacon to PRIVATE SUN — two of the game's biggest
investments — skipped the authored upgrade motion, the authored SFX family and the
music duck entirely.
**Connects:** B + D + G + H + I + J.

### `defenseSyncDefenderSupportVisual()` / `refreshDefenseSupportVisuals()`
**What:** derives Beacon/Factory support presentation from current placement, callable
outside the simulation loop; wired into placement, upgrade, sell and ascension.
**Why:** support classes were derived only inside `updateDefenseTowers()`, i.e. only
while the simulation was running, so placing or upgrading a Beacon during planning
changed the mechanic with no visible response until the next wave — which breaks the
"place a Beacon, watch nearby Rizos speed up" cause-and-effect the design depends on.
**Connects:** B (support model) + G (bond refresh seam) + E/H (presentation) + A (planning phase).

### Checkpoint schema v10 (`supportContinuation`)
**What:** a new signing block covering `supportCycle`, `signalStaggerUntil` and
`bossPhase`, added additively so the v9 payload is byte-identical and v2–v9 signatures
stay verifiable and migratable.
**Why:** Worker J's rule is that a field is not integration-safe merely because it
exists at runtime — it must be serialized, signed, normalized, restored and tested.
Worker F did four of the five.
**Connects:** F (persisted support/boss state) + J (save integrity).

### `syncDefenseMapMechanicEdges()`
**What:** measures rendered map-bond hints when placement mode opens and clamps them
to the battlefield on both axes.
**Why:** Worker G's render-time flip used a fixed normalized-y threshold, which cannot
know a hint's wrapped height.
**Connects:** G (map mechanics) + H (mobile layout).

### Harness stylesheet derivation (`STYLESHEET_LINK_RE`)
**What:** the browser harness now inlines every stylesheet `index.html` actually
loads, in document order, instead of a hard-coded filename list.
**Why:** the hard-coded list silently stopped covering each new specialist layer.
Worker I flagged this exact blind spot and could not fix it from inside its own lane.
**Connects:** every worker that ships a stylesheet + all browser QA.

### `tests/browser-master-integration.py`
**What:** 24 checks, each on a seam no single specialist owned, each mapping to a
defect actually found during this merge.
**Why:** the glue layer needs its own regression net.

---

## MAJOR CONFLICTS RESOLVED

1. **`defenseRoster()` — B vs C vs D.** Resolved by architecture, not precedence:
   crew stays character-only, a new composed layer owns the bench. Worker B's
   orphaned structure line (which referenced a variable Worker C deleted, and would
   have thrown) was replaced by the composed layer.
2. **`defenseDeployRows()` — D vs integration.** Two independent implementations of
   the same idea collapsed into one, keeping D's tool rows and B's structure rows.
3. **`defenseFieldLeader()` — B vs C vs D.** Union of all three intents: prefer the
   deployed Captain, never a structure, never a universal tool.
4. **`upgradeDefenseTower()` — A vs B.** A's optional `showPanel` parameter and B's
   structure routing are non-overlapping; both kept, then both paths routed through
   the shared pipeline.
5. **`restoreDefenseCheckpoint()` — A vs B vs C vs D vs F vs J.** Six workers touched
   this one function. Resolved field-by-field: A's ephemeral flow state, B's structure
   reconstruction and cadence restart, C's frozen crew derivation, D's universal
   investment recognition, F's support continuation, J's coherence guards.
6. **Enemy class list — E vs F.** Unioned: E's four simultaneous elemental statuses
   plus F's three support states on one line.
7. **Checkpoint schema — F vs J.** J's v9 preserved intact; F's new state signed by an
   additive v10 rather than by editing v9 (which would have invalidated v9 signatures)
   and rather than leaving it unsigned.
8. **Endless ceiling — F vs J.** F's 9,999 accepted; J's guard already read the
   constant, so the safety rule scaled with it.
9. **`launch-v79-defense-alive.css` — A, C, E, G (+ H, I in sibling files).** E's
   interleaved edits kept in place; A, C and G's appended blocks relocated to
   `rtd-defense-integration.css` at the identical cascade position so the core
   stylesheet stays inside its performance budget.
10. **`index.html` / `sw.js` / harness stylesheet lists — B, D, E, H, I.** Unioned
    rather than letting the last merge win; all six specialist stylesheets load and
    are cached.
11. **Phone battlefield aspect — G vs H.** G's authored routes require a square field;
    H's phone layer had made it 1:1.08. Square restored, H's reclaimed width kept.
12. **Roster card touch ownership — baseline/C vs H.** H's blanket button rule scoped
    away from roster cards so drag-to-place keeps its pointer.

---

## BUGS FOUND DURING INTEGRATION

1. A placed **Clothing Factory or Beacon could become Field Leader** and own the
   field power on a board with no Rizo.
2. **Signed checkpoints silently dropped paid universal deployables**: canonicalization
   resolved ids against the character roster only, so a Factory, Beacon or Basic
   Defense Rizo vanished on restore.
3. **Worker F's persisted support and boss-phase state was unsigned** — a tampered
   save could freeze a Relay convoy or hand a boss an arbitrary phase.
4. **Beacon support was invisible during the planning phase** (support classes were
   derived only inside the simulation loop).
5. **The support halo was dropped by every tower re-render** (upgrade, doctrine,
   ascension, restore) because the class was applied only on change.
6. **Structure upgrades skipped the authored upgrade punctuation** — no upgrade
   motion, wrong SFX family, no music duck.
7. **Worker B's structure row referenced a variable Worker C had removed** — a latent
   `ReferenceError` on any bench render.
8. **A universal deployable id could be stored as a crew wing.**
9. **Map-bond hints left the battlefield at 320×568 on Moon, Eclipse, Ember and
   Blizzard.** Worker G shipped 67/69 on its own suite, not the 69/69 its manifest
   claimed.
10. **Worker H's blanket `touch-action:manipulation` broke drag-to-place** on touch.
11. **Worker H's 1:1.08 phone battlefield distorted Worker G's authored routes**
    (~10px boss/trail drift).
12. **`launch-v79-defense-alive.css` exceeded its performance budget**, and the budget
    guarded only that one file while five specialist stylesheets grew unchecked.
13. **The browser harness stopped exercising specialist stylesheets** (hard-coded list).
14. **The token merge corrupted the harness stylesheet regex twice**, and once produced
    invalid JSON in a merged report artifact.
15. **`browser-defense-integration.py`'s child-spawn assertion was nondeterministic** —
    0 to 4 releases observed in one unchanged build.
16. **`browser-v76-rhythm-engine.py` intermittently read 32 frames for a 30-tick
    sample** (undrained fixed-step accumulator).
17. **Two geometry assertions measured mid-animation state** once Worker I's authored
    motion existed (boss entrance, deploy stretch).
18. **Two worker probes built save states the integrated contract rejects** (live
    combat with no unfinished wave) — Workers D and F.

## BUGS FIXED

All eighteen. Items 1–11 are product/runtime fixes; 12–18 are QA-infrastructure and
test-correctness fixes. Nothing was fixed by weakening a guarantee: where a test
expectation changed, the invariant it protects was preserved or strengthened, and
every such change is listed under the owning worker above.

Not fixed, and deliberately so: **selling is refused during live combat.** This
looked like a bug while writing an economy probe and is in fact the baseline's
intended phase gate (`ASTRA_CONTEXT.md`: "selling remains locked"). The probe was
corrected and the behaviour is now asserted explicitly.

---

## AUTOMATED TEST RESULTS

Node and static gates:

| Gate | Result |
| --- | --- |
| `node --check` core / game / canvas / sw | PASS (4/4) |
| `node tests/defense-core.test.js` | **34/34** |
| `node tests/worker-b-economy.test.js` | **9/9** |
| `node tests/worker-j-defense-guard.test.js` | **8/8** (was 7; +v10 signing coverage) |
| `node tests/service-worker-policy.test.js` | **4/4** |
| `python3 tests/static-defense-audit.py` | **81/81** (was 80; +total stylesheet budget) |

Browser suites:

| Suite | Result |
| --- | --- |
| `browser-launch-recovery` | **5/5** |
| `browser-defense-integration` | **77/77** |
| `browser-defense-surfaces` | **76/76** (320×568, 390×844, 844×390, 768×1024) |
| `browser-first-ten` | **41/41** |
| `browser-v76-rhythm-engine` | **14/14** |
| `browser-v77-feel-pass` | **34/34** (was 33; +boss-entrance assertion) |
| `browser-v78-canvas-flow` | **11/11** |
| `browser-v80-strategy-feel` | **17/17** |
| `browser-phase8-final` | **17/17** |
| `browser-worker-a-flow` | **33/33** |
| `browser-worker-b-economy` | **10/10** |
| `browser-worker-b-self-audit` | **10/10** |
| `browser-worker-b-depth` | **13/13** |
| `browser-worker-c-roster` | **13/13** |
| `browser-worker-c-audit` | **11/11** |
| `browser-worker-c-depth` | **13/13** |
| `browser-worker-d-towers` | **54/54** |
| `browser-worker-f-endless` | **10/10** |
| `browser-worker-f-self-audit` | **16/16** |
| `browser-worker-f-depth` | **13/13** |
| `worker-g-self-audit` | **69/69** (Worker G's own build: 67/69) |
| `worker-g-depth-pass` | **26/26** |
| `worker-h-self-audit` | **24/24** |
| `worker-h-depth-audit` | **10/10** |
| `browser-worker-j-qa` | **10/10** |
| `browser-worker-j-hostile` | **21/21** |
| `worker-j-integration-risk-audit` | **53/53** |
| `browser-worker-j-determinism --pair speed` | **7/7** |
| `browser-worker-j-determinism --pair low` | **7/7** |
| `browser-master-integration` (new) | **24/24** |

**Total: 875 automated checks across 35 suites, 0 failures**, plus 4 syntax gates. The only suite excluded is
`browser-v79-consumer-pass.py`, which sits at 18/20 on the untouched baseline for two
stale UI-copy assertions; Workers E and F both documented it, and it was left as
inherited debt rather than changed to match new copy.

Environment note: Playwright was not installed in this container and the suites
hard-code `/usr/bin/chromium`. Rather than edit ~30 test files, Playwright was
installed and `/usr/bin/chromium` symlinked to the provided Chromium, so every suite
runs exactly as its author wrote it.

## MANUAL TEST RESULTS

Driven through the real runtime (no cash, HP, damage or wave-completion overrides
except where a test name says "probe"):

- Launch, start run, restart, replay, death/loss, save/load, endless transition: pass.
- Placement including invalid placement, repeated taps, drag-to-place on touch: pass.
- Upgrade, spam upgrade, doctrine fork, upgrade-then-sell, sell refusal during combat
  and acceptance during planning: pass.
- Ability activation, ability spam, cooldown gating, pause during ability, pause during
  projectile travel, pause during burn, pause near wave end, resume: pass.
- 1× → 2× → 1× and repeated speed switching: identical outcomes at equal simulation
  time; low-power presentation changes nothing mechanical.
- Factory placement, multiple Factories, Factory upgrades, Factory sale (no payout
  after sale, verified with the road and queue emptied so pop income cannot mask it).
- Beacon placement, overlapping Beacons (strongest field only), Beacon upgrade to
  PRIVATE SUN, Beacon sale (halo clears immediately).
- Captain behaviour, multiple discovered Rizos, crew selection and run freezing.
- Boss spawn, boss entrance, phase transition, boss death, remixed boss second acts.
- Map interaction on all six worlds including Ember core, Moonlight Basin, completed
  Storm circuit, Whiteout shelter, Eclipse resonance.
- Resize across 320×568, 375×667, 390×844, 430×932, 844×390, 768×1024.

Adversarial attempts that **failed to produce a defect** (i.e. the build held):
duplicate money, duplicate wave rewards, negative money, towers attacking after sale,
Factories paying after sale, permanent Beacon buffs after Beacon removal, dead enemies
running effects, duplicate bosses, repeated boss rewards, ability activation while
unavailable, cooldown bypass, duplicate event listeners, permanent UI overlays, stuck
pause, corrupted endless state, stale save state, universal tools taking character
rewards, and tampering with any signed continuation field.

## PHONE / MOBILE RESULTS

- 320×568: bench, decision rail, command ribbon, context sheets, tower panel, map-bond
  hints and cinematic moments all contained; no document-level horizontal overflow;
  recurring command targets ≈47×44px; map hints clamped inside the field on all six
  worlds.
- 375×667: each universal structure card can be brought fully into view and is
  touch-sized.
- 390×844: battlefield remains the dominant surface and stays square.
- 844×390 short landscape: field centred, controls at the sides, universal max
  silhouette adds no clipping beyond the stock tower box.
- 768×1024: tablet portrait surfaces contained.
- Drag-to-place keeps pointer ownership on touch (regression fixed).
- Reduced-motion and increased-contrast paths exercised.

Not claimed: a physical notched-iPhone / WebKit run. Coverage is headless Chromium at
phone, landscape and tablet viewports. The v86 dependency-free boot shell and
fail-visible recovery are intact and verified (5/5), which is the safeguard that
exists precisely because Chromium success once masked a real iPhone white-screen.

## 1X / 2X RESULTS

Identical outcomes at equal simulation time across the authored ten waves at 1×, 2×
and 2× low-power (`browser-first-ten` 41/41, both determinism pairs 7/7). Gameplay
density is invariant across speed and quality. Worker A's packet-break easing never
mutates `d.speed`, so a checkpoint still records the player's selected speed. At equal
*wall* time, 2× produces twice the Factory payout because the simulation advances
twice as fast — the payout formula is unchanged. Worker E's cooldown fill reaches equal
charge at equal simulation time.

## PAUSE / RESUME RESULTS

Pause freezes the simulation clock, projectiles, status timers, Factory production,
Relay/Mender support cadence, boss telegraphs and phases, Worker E ability events, and
Worker I's motion (towers, enemies, bosses, stage, upgrade bursts). Resume continues
without a delta-time jump. Pausing exactly during a packet break freezes and resumes
the same transition. Backgrounding auto-pauses and writes a checkpoint; foregrounding
surfaces `AUTO-PAUSED • WELCOME BACK` rather than silently resuming combat.

## ECONOMY RESULTS

The opening genuinely forks: 220 starting cash funds a 160 Factory leaving 60, or a
free Captain plus an 85 Basic Defense Rizo plus its 70 first upgrade, or two Basic
Defense Rizos. Factory payback is tied to defending cleanly (a Gate leak breaks
momentum), then to drops, then to spatial Brand Loop, then to Private Sun and a
non-stacking Golden License. No infinite-money loop, repeated payout, negative price
or multiplicative explosion was reachable. Duplicate structures escalate in cost and
consume field slots. Income while paused: none. Income after sale: none. Income after
the run ends: none. Wave rewards use `clearedWave` only.

## BEACON / SUN RESULTS

Radius is drawn and readable; affected units carry a halo that now appears during
planning; buffs apply and are removed on sale; overlapping Beacons resolve to one
strongest field and never multiply; upgrades take effect immediately and preserve
in-progress Factory work; attack-speed changes remain fixed-step safe and identical at
1× and 2×; PRIVATE SUN is a visibly different battlefield object and gates the
branded-drop network. The full lifecycle (no buff at level 1 out of radius → buff on
investment → clean removal on sale) is asserted in the new integration suite.

## ABILITY / VFX RESULTS

All 14 identities have distinct cast silhouettes, battlefield reactions and
variant-aware audio. Readiness reads on the field with a 12-step cooldown fill; POWER
and CONTROL differ in motion grammar; Apex adds a crest plus four discoverable
status-primed resonance payoffs. Fire reads as ignition and persistent burning driven
by the canonical `burnUntil`; poison reads as lingering infection; frost crystallizes;
electricity chains visibly; quake shakes the field. Burn, poison, frost and root are
simultaneously legible in both DOM and canvas — verified on a single enemy carrying
all four at once *plus* Relay support state. Low-power degrades ornament first and
keeps the identifying silhouette.

## BOSS RESULTS

Bosses are set pieces: four distinct entrances with their own physics and audio,
identity silhouettes, unique mechanics, bounded second acts at high remix tiers, a
battlefield boss overlay instead of a feed line, and dramatic defeats. Boss mechanics
stay fair and readable, and every boss summon is count-bounded and inside the density
cap. The entrance is now proven to be both visible *and* self-settling: the boss body
lands back on the canonical trail within 0.381px.

## MAP RESULTS

Six worlds are distinguishable by silhouette, material and landmarks, and each asks a
different question: onboarding reach, how deep to commit into heat, timing around
Moonlight, whether to split coverage to close a circuit, sheltering through Whiteout,
or holding two ridge seals. Route and gameplay use one canonical path on every world
(worst observed body-to-trail error 0.205px). The mechanic layer is
`pointer-events:none` and never hides the road or controls; hints stay on-field at
320×568.

## ENDLESS RESULTS

Post-30 waves are deterministic authored formations with evolving tiers, rotating
recovery valleys, boss remixes with escalated mechanics, and weather/special-bias
coupling — not HP multiplication. Verified deterministic at waves 36, 50, 75, 100,
123, 249, 250 and 9,999 (wave 9,999 generates as a 28-threat, 3-packet formation).
Long-run stability: arrays and queues stay bounded, packet/child budgets hold, the
active-enemy density cap is never bypassed, boss rewards cannot duplicate, and endless
state cannot corrupt a save. The ceiling cannot be replay-started once cleared.

## SAVE / STATE RESULTS

Checkpoint schema **v10**. Real signed v8 and v86-era checkpoints still migrate with
cash, tower count, wave credit and queue composition intact; v2–v9 remain verifiable.
Tampering with any signed field — cash, upgrade, projectile damage, tactical timers, or
Worker F's support continuation — is rejected or sanitized. In-flight projectiles are
capped at 32 in both builder and normalizer and restore only when both saved tower and
saved target still exist. Contradictory signed payloads are repaired conservatively
rather than by dropping threats. Permanent rewards and mastery use `clearedWave`, and
loaner and universal deployables cannot take permanent MVP or mastery.

## PERFORMANCE NOTES

Existing budgets are respected: fixed 30Hz simulation with bounded catch-up,
density cap invariant across speed and quality, visual budgets that degrade
presentation only, and the canvas renderer with DOM fallback after context loss
(11/11). The new glue adds no per-frame work: the support-visual refresh runs on
placement, upgrade, sell and ascension, and the map-hint measurement runs only when
placement mode opens. Total shipped stylesheet payload is 508KB across 13 files
(baseline: 398KB across 9); this is now explicitly budgeted and enforced, where
previously only one of those files was.

---

## KNOWN LIMITATIONS

Verified, not speculative:

1. **No physical iPhone/WebKit run.** Chromium at phone/landscape/tablet viewports
   only. The v86 boot shell and recovery path are intact because this exact gap once
   produced a real white screen.
2. **`browser-v79-consumer-pass.py` remains 18/20**, identical to the untouched
   baseline. Two stale UI-copy assertions (`RANGE`, `READ THE ROAD`); inherited debt,
   deliberately not "fixed" by rewriting copy to match a test.
3. **Audio is procedural WebAudio, not mastered samples.** Events are differentiated
   and the mix ducks for transformations, but real-device loudness balance is untuned.
4. **iOS Safari exposes no `navigator.vibrate`**, so haptics fall back silently there;
   motion and audio still carry every event.
5. **Factory partial-cycle progress and clean-streak momentum are intentionally not
   persisted.** A reload restarts one full cadence and a zero streak — it can cost a
   player partial progress but can never accelerate income or preserve a drop-ready
   state through a reload.
6. **Endless is bounded at wave 9,999**, a practical signed-save ceiling rather than an
   unbounded integer.
7. **Boss remix intensity is capped at 12.** Beyond it, variety comes from formation,
   archetype and weather combinations rather than growing multipliers.
8. **Bond, tower and structure numbers are authored per-worker**, not competitively
   rebalanced across the merged whole. Nothing indicated a break in the verified
   playthroughs, but this is tuning that a full balance pass has not had.
9. **Canvas mode does not receive Worker I's DOM enemy body recoil.** Canvas keeps
   stage, cinematic, audio and state feedback plus its own effects.
10. **On the narrowest phones the discovered wings need a swipe**, because the Captain
    and the universal kit deliberately own the first bench frame.

## REMAINING RISKS

Credible, not hypothetical:

1. **`game-v79-defense.js` remains a ~966KB single-file runtime** that all ten
   specialties reach into. It is the standing merge hazard for any future parallel
   work; splitting it is a deliberate architectural decision, not integration cleanup.
2. **Any future persisted combat state must go through all five save steps**
   (serialize, sign, normalize, restore, test). Worker F's near-miss shows the failure
   is silent — the field works perfectly at runtime and is simply unprotected.
3. **Presentation layers can still outrank deliberate base rules.** Both Worker H
   regressions were single over-broad selectors in a late stylesheet. The total-payload
   budget and harness derivation reduce the blast radius but do not prevent it.
4. **Real-device launch remains the one class of failure this environment cannot see.**
5. **Balance under a fully developed economy plus a maxed crew plus Map Bonds plus
   endless modifiers is verified for stability, not for difficulty curve.**

---

## FINAL VISION AUDIT

Scored 1–10 on the integrated build, with the reason rather than the adjective.

| Dimension | Score | Justification |
| --- | --- | --- |
| Player Rizo centrality | 9 | Captain is locked first in every run, free on first deploy, leads the bench, owns the field power, is marked on the field, and previews both doctrine paths. Cannot be displaced by a tool. |
| Discovered Rizo value | 8 | Wings are a real pre-run decision surfaced with tactical tags, trail fit against actual opening perks, care-trained identity and mastery tendency. Value is access to different mechanics, not a collector damage multiplier. Held back by there being no *new* combat variants — breadth comes from existing identities. |
| Universal tower usefulness | 9 | Basic Defense Rizo is a genuine cheap baseline that becomes two structurally different apex forms with real setup/payoff behaviour, and it plus Factory and Beacon make a complete game for someone who owns only their starter. |
| Economy depth | 9 | Greed is defended, not just bought: momentum breaks on a leak, drops need clean cycles, Brand Loop needs mixed placement, Private Sun and Golden License need real investment. Multiple valid ladders, all capped. |
| Factory satisfaction | 8 | Visible evolution to an absurd industrial build, payout bursts and drop telegraphs that read without opening a panel. One notch short because partial progress is intentionally not persisted. |
| Beacon/Sun progression | 9 | Readable radius, immediate response (now during planning too), strongest-field-only stacking, and a max state that is a different battlefield object gating a whole economy network. |
| Player agency | 9 | The decision rail converts canonical state into one or two live calls, promotes banked powers under pressure, hands back a wave boundary while Auto stays on, and goes quiet after a call so results are legible. |
| Upgrade payoff | 9 | Silhouette, projectile identity, targeting behaviour, aura, evolution rail, field investment marks, and now the same authored punctuation for structures as for Rizos. |
| Ability impact | 8 | Anticipation via the 12-step fill, doctrine-split activation, unmistakable impact, and four discoverable status-primed Apex resonances. Not 9 because only four identities carry a resonance payoff. |
| VFX quality | 8 | Fire ignites and persists, poison lingers, frost crystallizes, electricity chains, quake shakes; four statuses stay simultaneously readable; ornament degrades before identity on low power. |
| Boss quality | 9 | Four distinct entrances with their own physics and audio, unique mechanics, bounded second acts, battlefield overlay, dramatic defeats — and the entrance is proven not to desync the boss from its trail. |
| Map identity | 9 | Six worlds recognizable by silhouette and material, with the route kept as a separate high-contrast layer so decoration never costs readability. |
| Map interactivity | 8 | Every world asks a different placement question, including two-position networks and timed weather windows, all learned by playing rather than by tapping props. Deliberately stops short of destructible routes. |
| Animation quality | 9 | Per-variant attack and idle families, investment-scaled attack weight, doctrine-specific body language, directional recoil, and authored deploy/upgrade/ascension motion that all freezes correctly on pause. |
| Audio/game feel | 8 | Named SFX families, variant-aware ability signatures, boss-identity cues, phase/boss/critical music states with Field Leader motifs and transformation ducking, restrained throttled haptics. Held at 8 by procedural-not-mastered audio and no iOS vibration. |
| UI satisfaction | 9 | Battlefield stays the star; one compact command ribbon; signed gold deltas, upgrade preview chips, evolution rail, per-copy power reserves, distinct perfect/milestone punctuation. Contrast, not constant flashing. |
| Mobile quality | 8 | Contained and touch-sized from 320×568 up, square field preserved, drag-to-place ownership restored, reduced-motion honoured. Not 9 without a physical WebKit run. |
| Endless depth | 9 | Authored formations with evolving tiers, rotating recovery valleys, boss remixes, weather coupling, bounded to 9,999 — difficulty from system combination rather than HP. |
| Rizo identity | 9 | Captain framing, House crew with real histories, loaners explicitly temporary, Clothing Factory and Private Sun as Rizo-native infrastructure, handmade ink/paper art language throughout. Not a reskin of anything. |
| Overall cohesion | 9 | Ten specialties share one phase machine, one bench, one upgrade pipeline, one support-presentation source, one save contract, and one character predicate. 875 automated checks pass with zero failures, and the seams have their own regression suite. |

**Does this feel specifically like RIZO?** Yes. The universal kit is a clothing
factory and a light you grow into a private sun; the protagonist is the player's own
Rizo rather than a generic tower; discovered Rizos arrive carrying the care and
mastery history they earned elsewhere in Rizo.game; and the art stays handmade ink and
paper rather than a clone of any existing tower-defense look.
