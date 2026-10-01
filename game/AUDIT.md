# Rizo.game — Phase 0 Audit

**Baseline:** the v87 build from `RIZO_RTD_FINAL_PLAYER_EXPERIENCE_PASS.zip`, imported unchanged into
`game/` (commit `b9db29d`). The runtime build marker is `v87-first-ten-visual-nuance` and the service-worker
cache is `rizo-game-v87-first-ten-rtd-master-integrated`. This build is newer than
`taymarspencer/Rizo-World-` `main` (v86). That repo's runtime files all hash differently.

**Method:**
- A static read of every runtime file.
- All existing Node suites and 26 of the 52 Python browser scripts. The rest are screenshot/gallery capture scripts.
- Three new probes that drive the real build in headless Chromium:
  1. A save-migration probe: 10 old-save scenarios.
  2. A minigame smoke-play: real taps and keys, then the run clock is fast-forwarded.
  3. A two-tab and House-swap probe.

The probes live outside the repo for this phase (no code changes). They become committed tests in Phase 1.

Severity scale:

| Level | Meaning |
|---|---|
| **Critical** | Destroys saved player data or earned progress with no recovery. |
| **High** | Wrong outcome that players will hit, economy-breaking behaviour, or a structural problem that blocks Phases 1–3. |
| **Medium** | Real defect with a workaround or a narrow trigger, or a hard-rule violation. |
| **Low** | Cosmetic, copy, hygiene, or future-facing risk. |

Tags: `DATA` save/progress · `BUG` behaviour · `ECON` rewards/balance · `ARCH` module boundary ·
`RULE` hard-rule violation · `TEST` test suite · `PERF` · `COPY` · `DEAD` dead code.

---

## 1. Codebase map

### Files that ship

| File | Size | Role |
|---|---|---|
| `index.html` | 108 KB | Markup for every screen, a dependency-free boot/recovery shell (inline script), and a large inline stylesheet. |
| `game-v79-defense.js` | 966 KB / 9,532 lines | **One IIFE containing the entire game**: save, pet sim, renderer, hub, arcade, 10 minigames, Defense, House, audio, boot, QA hooks. |
| `defense-core-v79.js` | 64 KB | Pure Defense rules (phases, economy, waves, checkpoint signing) **plus the whole-save signature and global numeric limits**. |
| `defense-canvas-v79.js` | 46 KB | Canvas presenter for Defense enemies, projectiles and effects (presentation only). |
| `rizo-config.js`, `monetization.js`, `install-manager.js` | 16 KB | Owner config, dormant AdSense/H5 adapter, PWA install prompt (disabled). |
| `sw.js` | 8 KB | Versioned offline cache. Runtime files are network-first; art is cache-first. |
| 13 stylesheets | 516 KB | Layered per version/per worker (`launch-v79-defense-alive.css` alone is 301 KB with 252 `!important`). |

### Inside `game-v79-defense.js`

| Region (lines) | Size | Contents |
|---|---|---|
| 1–626 | 53 KB | Constants, content tables (variants, foods, wearables, events), DOM map `el`, ~40 mutable globals |
| 627–1260 | 46 KB | `createPet`, `defaultState`, `normalizeState` (migration), signed envelope, `loadState`/`saveState` |
| 1261–1475 | 10 KB | Pet simulation: offline decay, skills, alignment, forms, stage |
| 1476–1850 | 19 KB | Visual model (`getPetVisualState`) + renderer (`petMarkup`, `applyPetVisualToNodes`) |
| 1851–2170 | 31 KB | Keeper path, House unlock, **Defense roster/lobby glue** |
| 2171–3480 | 84 KB | Hub views, sheets, care actions, shop, garden visits, bond seeds |
| 3481–3750 | 16 KB | Ambient life behaviours, world events, cutscenes |
| 3751–5230 | 117 KB | Arcade runtime (`mini`, freeze/thaw, job queue) + the 10 training minigames |
| 5231–7334 | **386 KB** | **Rizo Defense**: maps, roster, simulation, UI, checkpoints, rewards |
| 7335–7700 | 32 KB | Arcade pause, results, **score → reward conversion** |
| 7701–8740 | 71 KB | Season, capsules, expeditions, recovery/rebirth, audio, origin story, export/import, House |
| 8741–9241 | 33 KB | Global click handler, lifecycle, service-worker registration, `boot()` |
| 9242–9532 | **69 KB** | `RizoRuntimeQA`: 200+ test hooks shipped to every player |

### Persistent data (all `localStorage`)

| Key | Contents |
|---|---|
| `rizo-life-overhaul-v2` | Signed envelope `{app, saveVersion:1, stateVersion:19, savedAt, state, signature}` |
| `…:verified-backup-v1` | Byte-identical mirror, written by the same `saveState` call |
| `…:pre-recovery` | Envelope saved before a Keeper recovery code is applied |
| `…:defense-checkpoint-v68` | In-progress Defense run (schema v10). Legacy keys v67/v66/v64/v42 are read once, then deleted. |
| `…:save-validation-warning`, `…:defense-validation-warning` | Last sanitisation event |
| `rizo-defense-map-seen:<mapId>` | Map intro seen. **Outside the save namespace.** |
| `rizo-life-save-v1` | Legacy key. **Never read.** |

---

## 2. Findings, ranked

### Critical

**C1 · DATA · An unreadable primary save is replaced by a fresh egg, and the original is overwritten.**
`loadState()` (`game-v79-defense.js:1213`) takes the backup only when the backup *verifies*. Otherwise it
uses `primary.state`. For unparseable JSON that is `defaultState()`. `loadState` then ends with
`saveState(true)`, which writes the fresh egg over **both** the primary and the backup. The `catch` branch
(any exception during normalisation) does the same. No copy of the original bytes survives.
*Probe S4* (truncated primary, no backup): Embers 4321→100, pet MOSSY/MATURE → `RIZO 01`/egg, scores and
collection wiped, new Keeper ID.

**C2 · DATA · A missing primary save ignores an intact backup, then overwrites it.**
The backup is consulted only when the primary exists and fails (`:1216`). If the primary key is absent
(partial clear, an extension, a storage bug), the game starts fresh and the first save destroys the backup.
*Probe S7*: same wipe as C1 with a perfectly valid backup present.

**C3 · DATA · Two open tabs or windows overwrite each other's progress.**
Each tab autosaves its own in-memory `state` every 5 s (`boot()` interval, `:9220`) and on hide
(`suspendRuntime`, `:8950`). There is no `storage`-event handling and no lock. *Probe:* tab A earned
+5,000 Embers and saved. Tab B's next 5 s tick wrote its stale state and the Embers were gone. Realistic
triggers include the PWA plus a browser tab, or coming back to an old tab: it becomes visible, resumes, and
saves its stale state.

**C4 · DATA · Defense runs expire after 7 days and their earned waves are never credited.**
`normalizeDefenseCheckpoint` rejects checkpoints older than `DEFENSE_CHECKPOINT_MAX_AGE` (`:35`, `:5690`).
`readDefenseCheckpoint` then **deletes** the key (`:5719`). Cleared waves, Embers, mastery and pet training
from a run are written only in `finishMiniGame` (`:7611`–`:7620`), so an unfinished run loses everything.
The in-run banner even says *"Permanent progress remains at Wave N"*.
*Probe S9*: an 8-day-old checkpoint is silently deleted the moment the Defense lobby opens.

### High

**H1 · DATA/ARCH · Signature failure wipes rewards. It is trivially bypassed and fragile to any schema edit.**
A signed save that fails verification goes through `hardenUnverifiedState` (`:1178`). That resets the wallet,
every arcade and Defense record, achievements, collection, season and counters, and the result overwrites
both keys (*probes S5, S6*: Embers 4321→100, collection reduced to one entry). It does not stop cheating: a
raw save with `version < 19` takes the trusted "migrated" path (*probe S2* keeps everything). So it only
ever hurts honest players. More importantly for this project: `stateSignaturePayload`
(`defense-core-v79.js:851`) has **one** shape for `saveVersion 1`. Adding any field to it (for example
training stats) invalidates every existing save and triggers this wipe for every player. Every Phase 1–3
schema change has to respect this.

**H2 · BUG/DATA · Swapping in a House resident applies up to 72 hours of neglect at once.**
House pets never refresh `lastTick`. `swapFarmPet` (`:8633`) calls `processElapsedTime()` on the incoming
pet. The swap modal itself says *"House Rizos live passively."*
*Probe:* a resident at 90/90/90/90 left for 5 days came out at hunger 4, health 1, and was sent straight to
recovery.

**H3 · ECON · Spark Stash rewards are uncapped.**
`finishMiniGame` (`:7635`) applies `bond += score*.5`, `xp += score*.8` and `embers += score`. There is no
`Math.min` (Rain Walk, Ember Beat and Lost Signal all have one). *Probe:* a naive 10-second bot scored 298.
The run took Bond from 0 to **100** (MATURE needs 80), and added +47.7 Instinct, +238 XP and +378 Embers.
One run can complete the bond side of evolution.

**H4 · ECON · Lost Signal's score is quadratic.**
`memoryTap` (`:5058`) awards `2+round` per correct rune plus `round×k` per round. *Probe:* a perfect bot
reached round 9 and **597 points** at 30 s of a 44 s run. The reward formula
`embers += max(7, floor(score*1.5))` pays roughly 900 Embers per run.

**H5 · ECON/ARCH · No common score→stat conversion.**
Each mode has a bespoke branch in `finishMiniGame` (`:7625`–`:7666`), and raw score scales differ by about
50× for similar effort. Smoke-play scores for 10–30 s of competent input:

| Game | Score |
|---|---|
| Lost Signal | 597 |
| Spark Stash | 298 |
| Rain Walk | 88 |
| Power Tape | 55 |
| Rizo Courier | 38 |
| Ember Forge | 26 |
| Forest Lunch | 20 |
| Rizo Runaway | 15 |
| Skybound | 11 |
| Ember Beat (random input) | 7 |

Only Ember Beat normalises its reward, via `rhythmQuality`, bounded 5–80. This is what the Phase 1
training contract must replace.

**H6 · ARCH · Rizo Defense is not a game mode. It is the eleventh arcade minigame, and it writes the core save directly.**
- It starts and ends through `startMiniGame("defense")` / `finishMiniGame`.
- It lives in `mini.defense`, and costs arcade Energy.
- `mini.defense` or `mode==="defense"` is checked 321 times. Outside the Defense region (and excluding the QA hooks) there are 156 Defense calls or state checks on
  341 lines, including 32 Defense branches in the global click handler.
- `rewardDefenseRun` (`:7331`) mutates directly:
  - `skills`, `xp` and `bond` of the active pet **and House pets**;
  - `wallet.embers`;
  - `pet.energy`, `hunger` and `mood`;
  - `meta.totalGames`, Heat and quests.
- That path bypasses `gainSkill`, `updateStage` and `evaluateForm`, so Defense XP does not trigger growth
  until some later action.

Full reach-in list: §4.

**H7 · ARCH · The whole pet game depends on the Defense module to boot and to save.**
The envelope version, `createStateSignature`/`verifyStateSignature` and every numeric `LIMITS` value (wallet,
XP, collection, arcade-score caps) live in `defense-core-v79.js`. `game-v79-defense.js:26` throws if it is
missing. A broken Defense file therefore takes down care, House and arcade too.

### Medium

**M1 · RULE · `petMarkup()` is not the only pet renderer.** Surfaces that draw a Rizo another way:

| Surface | Where | What it does |
|---|---|---|
| Release scene ("LET X GO?") | `:8656` | Raw variant `<img>` for an **owned pet**. Loses stage, wearable and form. Clear violation. |
| Capsule reveal / rare discovery | `:7783`, `:7682` | Raw variant `<img>` for the newly rolled pet, next to a `petMarkup` of the active pet. |
| Basic Defense Rizo | `:5359` | A second, CSS-drawn Rizo renderer (`defenseBasicVisualMarkup`). |
| Defense tower silhouette and upgrade burst | `:6634`, `:6733` | Raw variant sprite used as a CSS mask. |
| Den pet, garden visitor, closet, profile | `:1774` | Persistent-node path `applyPetVisualToNodes`. Same visual model, but not `petMarkup()`. |
| Egg actor (home) and origin egg | — | Separate egg rendering. |
| Collection cards | `:2547` | Species art (`<img src=variant.sprite>`). Arguably a catalogue, not a pet. **Needs a ruling.** |

**M2 · DATA · Legacy key `rizo-life-save-v1` is never read** (`:24`). It is only deleted by `resetSave`
(`:8514`). *Probe S10*: a player holding only that key boots a fresh egg. This was already true in v86, so
the affected population is probably tiny, but the data is still sitting there unmigrated.

**M3 · DATA · Import replaces the current save with no confirmation and no backup** (`importSave`, `:8463`).
Keeper recovery codes write a `:pre-recovery` copy first. File import does not.

**M4 · DATA · Failed saves are silent** (`saveState` catch → `console.warn`, `:1243`). Quota exceeded or
storage blocked means the player keeps playing with nothing persisting and no warning.

**M5 · BUG · Rizo Courier, Ember Forge and Lost Signal results lie about how the run ended.**
`arcadeEndReason` (`:7566`) maps "timer ran out with full hearts" to `cleared`. The result then says
*"CLEARED — THE WHOLE BOARD. CLEAN."*
*Probe:* Courier showed this with 0 deliveries, Forge with an uncleared wall, Lost Signal mid-sequence.

**M6 · ECON · Spark Stash's bank-or-lose mechanic is moot at the buzzer.**
The unbanked stash is auto-banked on *every* finish (`:7579`), not only on voluntary exit as the comment
says. *Probe:* 226 → 298 at time-up.

**M7 · BUG · Rain Walk does not fit a timed run.**
Two forks and one ending each pause the clock **indefinitely** until the player chooses (`:4181`, `:4285`).
Run length is unbounded, and the run cannot end without three modal decisions. It plays correctly
(*probe:* 88 pts with choices made), but it is a narrative activity, not a score game. Candidate to move out
of the training queue (§3).

**M8 · BUG · Defense towers read the live pet object.**
`tower.pet` is `state.pet` or the House pet itself (`:1993`), and `defenseTowerStats` (`:5915`) reads
`skills` and `stage` every shot. Idle growth from the 5 s boot tick, or any care action, changes tower
damage mid-run, so the "deterministic run" claim holds only while the pet doesn't change. Guest crew are
shallow copies of `state.pet` (`:1999`) and share its `genes`, `careProfile` and `lifeMemory` objects.

**M9 · BUG · Defense Energy cost is defined twice**: `ARCADE_GAMES.defense.energy = 8` and a hard-coded
`-8` in `rewardDefenseRun`. It is charged only if at least one wave is cleared.

**M10 · DATA · `rizo-defense-map-seen:*` keys are outside the save**. They are not exported, imported or
reset.

**M11 · RULE/BUG · Service-worker release integrity is hand-maintained.**
- The build identity is typed in **four** places: `index.html` meta, the boot shell's `expected`,
  `RIZO_RUNTIME_BUILD`, and the `sw.js` `CACHE` name. Any mismatch throws the recovery screen.
- `worker-e-abilities-depth.css` and `rtd-worker-i-feel.css` load on every page but are missing from
  `REQUIRED_SHELL`. They are therefore cache-first while every other runtime file is network-first. During a
  deploy the old worker can serve these two stale stylesheets with the new `index.html`.

**M12 · PERF · Every player pays for Defense on the pet screen.**
About 386 KB of Defense JS loads before the Den renders. So do about 130 KB of Defense-specific stylesheets (the six worker/integration files plus `v81-art.css`) and about 114 KB of Defense rules inside the 301 KB launch stylesheet. The 5 s boot tick
calls `renderAll()`, which re-renders the hidden hub during arcade and Defense runs. The 69 KB of QA hooks
also ship to everyone.

**M13 · TEST · The suites have drifted from the code.**
- `browser-v87-arcade-freeze` is at 64/65. Its deadline classifier lacks `forageFeedbackUntil`,
  `forageNextAt` and `rushLandingUntil`. The code does credit them.
- `browser-v82-arcade-soul` is at 24/25. It expects arcade scores capped at 1e9, but the code clamps them
  with Defense's `MAX_REASONABLE_DAMAGE` (1e12). Raising a Defense limit silently changed an arcade cap.
- Four partials are documented as pre-existing: rhythm-engine 12/14, phase7-art 42/43, consumer-pass 18/20,
  canvas-flow 10/11.
- All 49 browser scripts hard-code `/usr/bin/chromium`.
- `static-defense-audit.py` crashes when `reports/` is missing.

**M14 · ARCH · The production QA surface can overwrite a real save.**
`RizoRuntimeQA` turns on for any host when the URL has `?qa=1` (`:9241`). `loadForQA` replaces the live
`state`, and the next autosave persists it.

### Low

- **L1 · COPY** Lost Signal's round callout shows `+round×4`, but forward rounds pay `round×2` (`:5061`).
- **L2 · BUG** Ember Forge: a second prism or ember inside the effect window is cleared early by the first
  pickup's timer (`:5099`). The class drops while the effect is still active.
- **L3 · BUG** Frame `dt` is capped at 40 ms (`:4302`). Below 25 fps, Skybound, Forge, Courier and Runaway
  run in slow motion while the run clock keeps real time.
- **L4 · BUG** Skybound physics is in pixels measured at start (`:4116`). Rotating or resizing mid-run
  shifts the collision geometry.
- **L5 · BUG** Offline decay charges health as if the *end-state* criticality applied to the whole absence,
  up to 72 h (`:1300`). Long absences are over-punished.
- **L6 · DATA** `normalizeState` truncates: memories 60, graveyard 60, legacy 40, House roster to capacity,
  Defense history 12, mastery 80. This is safe today, but lowering any capacity constant later would
  silently drop pets.
- **L7 · BUG** `typeof EMBER_BEAT_TRACKS === "undefined"` (`:947`) does not guard a `const` declared later
  (`:3784`), because of the temporal dead zone. `DEFENSE_CONTRACT_TARGET` and `DEFENSE_MAPS` are the same.
  It works only because `boot()` runs at the end of the file.
- **L8 · COPY** The daily quest *"FINISH 1 POWER TAP RUN"* (`:727`) is also completed by Ember Forge
  (`:7662`), and the game is now called POWER TAPE.
- **L9 · COPY** The food "FOREST WINGS" uses the wearable wings thumbnail (`:317`).
- **L10 · BUG?** The egg's glow is the hidden variant's colour (`:2238`), so a Golden or Diamond egg is
  recognisable before hatching. It may be intentional. **Needs a ruling.**
- **L11 · DATA** `resetSave` leaves the verified backup, the validation warnings and the map-seen keys
  behind.
- **L12 · hygiene** The flat deploy publishes `WORKER_*_MANIFEST.md`, `MASTER_INTEGRATION_MANIFEST.md`,
  `_multiagent/` and `tests/` to play.rizo.store. `robots.txt` points at a `sitemap.xml` that does not exist.

### Dead code (DEAD)

- **19 functions declared and never called:**
  - Recovery replaced the old death flow, so `killPet` and `showDeathModal` are dead (constant `DEATH_INSULTS` too).
  - Defense lobby markup superseded inline: `defenseCheckpointLobbyMarkup`, `defenseDailyContractLobbyMarkup`, `defenseSchoolLobbyMarkup`.
  - Defense geometry helpers: `defensePlacementBounds`, `defensePlacementIntersectsOverlay`, `pointInDefenseObstacle`, `distanceToDefensePath`, `defenseMapPolyline`.
  - Other Defense functions: `defenseMapIntel`, `defensePanelStatsMarkup`, `defenseIsUniversalRow`, `defenseFxLowMode`, `activateDefenseFieldLeader`.
  - Stub: `renderRestoredDefenseProjectile` (returns `false`).
  - Elsewhere: `arcadeGame`, `livingSecretReaction`, `resolvePetSprite`.
- **Called only from QA hooks:** `chooseDefenseMapId`, `defenseCounterReadiness`, `defenseWorldPerkLabel`,
  `activateReleaseUpdate`.
- **Unused constants and scaffolds:**
  - `FARM_ROSTER_MAX`.
  - `LEGACY_KEY` (read path missing, see M2).
  - `CloudBridge` / `window.RizoCloud`: no provider anywhere.
  - `ARCADE_MODE_RULES`: a self-described legacy alias.
- **Unused DOM references:** `el.bestPower` … `el.bestDefense` (11 entries) and `el.expeditionOptions`.
  The elements exist, but JS reaches them by other selectors.
- **Unverified for Phase 0:** dead CSS across the 13 stylesheets. The cascade is version- and worker-layered,
  so a selector-coverage pass belongs to Phases 2–3.

---

## 3. Training minigames

Every game was started, played with real input, and then had its clock fast-forwarded. **None is hard-broken.**
All ten start, take input, score, end themselves and credit rewards, with no page errors.

| Mode id | Name | Run | Energy | Hearts | Trains | Smoke-play result | Problems | Phase 3 lean |
|---|---|---|---|---|---|---|---|---|
| `power` | POWER TAPE | 24 s | 15 | – | power | 55 pts, +9.9 Power | L8 quest copy | Keep |
| `spark` | SPARK STASH | 24 s | 10 | – | instinct, bond, mood | 298 pts, Bond 0→100 | **H3**, M6 | Keep, re-cap rewards |
| `forage` | FOREST LUNCH | 28 s | 11 | – | instinct, luck, +hunger | 20 pts | Also acts as food (`hunger += score×1.1`) | Keep |
| `rush` | RIZO COURIER | 30 s | 15 | 3 | speed | 38 pts | M5 | Keep |
| `walk` | RAIN WALK | 40 s + 3 indefinite pauses | 8 | – | stamina, luck, bond | 88 pts only with choices | **M7** | **Move to hub activity** (not a timed score game) |
| `rhythm` | EMBER BEAT | 27 s + 3.7 s lead-in | 12 | – | speed, bond | 7 pts random, credited | Audio-clock driven | Keep |
| `memory` | LOST SIGNAL | 44 s | 7 | 3 | instinct, luck | 597 pts perfect | **H4**, M5, L1 | Keep, re-scale |
| `glide` | SKYBOUND (the Flappy one) | 36 s | 10 | 3 | stamina, speed | 11 pts / 3 gates before 3 crashes | L3, L4 | Keep |
| `breaker` | EMBER FORGE | 46 s | 11 | 3 | power, instinct | 26 pts | M5, L2 | Keep |
| `maze` | RIZO RUNAWAY | 54 s | 10 | 3 | instinct, speed | 15 pts | — | Keep |

What every game shares, and the training contract must replace:
- Score feeds straight into bespoke reward code (H5).
- They all use one `mini` object with about 150 fields.
- Each one injects HTML into `#miniArena`.
- They share the pause-aware job queue. That queue is built on `setTimeout`, so it fails the letter of the
  "timestamp-based timers only" rule (§5).

---

## 4. Places where modules reach into each other's state

| # | Reach-in | Where |
|---|---|---|
| X1 | One closure holds three shared mutable globals: `state` (the save), `mini` (every run), and `el` (DOM). Every subsystem reads and writes all three. | whole file |
| X2 | Defense runs inside the arcade runtime: `mini.defense`, `mode==="defense"` special cases in start/finish/cleanup/frame/clock/suspend/resume, and 32 branches in the global click handler. | `:3970`, `:4300`, `:7334`, `:7573`, `:8740`, `:8950` |
| X3 | Defense writes the core save: pet and House-pet `skills`/`xp`/`bond`, wallet, energy/hunger/mood, `meta.totalGames`, Heat, quests, `scores.defenseHistory/Mastery/Contracts/PerfectMaps`, `player.defenseSchool`, `settings.defenseAutoStart`. | `:7331`, `:5520`, `:5753`, `:5279` |
| X4 | Defense's saved data is scattered across the core save: `scores.defense*` (7 keys), `settings.defense*` (7 keys), `player.defenseSchool`, `meta.unlockScenes` (`defense-origin-v37`), plus two keys outside the envelope. | §6 |
| X5 | The core save depends on the Defense module: envelope version, signature, and all clamps (wallet, XP, collection, arcade scores). | `:26`–`:36`, `defense-core:851` |
| X6 | `normalizeState` hard-codes Defense knowledge: the map-id list ×4, contract rules, `DEFENSE_CONTRACT_TARGET`, mastery and history normalisation, school inference. | `:943`–`:1047` |
| X7 | Arcade minigames write the pet, wallet, `meta.retroSignal`, alignment, Heat and quests directly in ten bespoke branches. | `:7625`–`:7666` |
| X8 | One `mini` god-object with about 150 per-game fields. Any game can touch any other's fields. Freeze/thaw credits deadlines by *naming convention* (any key ending `Until`/`At`). | `:3976`, `:3916` |
| X9 | The Defense roster holds live references to `state.pet` and House pets. Guest crew are shallow copies of `state.pet`. | `:1992`–`:2000` |
| X10 | Hub UI reads Defense and arcade internals: `renderArcade` (Defense milestones), `keeperPathSteps` (arcade and Defense bests), `renderAll` → `scheduleDefenseTowerGeometrySync`. | `:2372`, `:1892`, `:2212` |
| X11 | The Defense core's `stateSignaturePayload` encodes the hub's entire save schema: pet, House, inventory, meta, arcade. | `defense-core:851` |

---

## 5. Hard-rule compliance (current state)

| Rule | Status |
|---|---|
| One renderer (`petMarkup()`) for every pet surface | **Not met.** See M1: one clear violation, five other paths, and one ruling needed. |
| No frameworks, no build steps | **Met.** Vanilla HTML/CSS/JS loaded directly. |
| Timestamp-based timers only | **Mostly met.** Run clocks, buffs, i-frames, expeditions, offline decay and the Defense fixed-step clock are all timestamp-based. The exception is the arcade job queue (`queueMiniTimeout`, `:4840`), which sequences Lost Signal rounds, Ember Beat's countdown and several board rebuilds on `setTimeout`. It is pause-aware, but it is not timestamp-polled. The remaining raw timers (58 call sites in total) are UI
effects, or they poll timestamps (the 50 ms run clock and the 5 s life tick). |
| Defensive save migration; never lose player data | **Not met.** C1–C4, H1, H2. |
| Bump the SW cache every delivery | **Met by convention only.** It is manual and duplicated in four places (M11). |

---

## 6. Baselines

### Existing suites (unchanged build)

Every suite below was run against the unchanged import. The four partials marked "pre-existing" are the ones
the previous team documented as failing before their final pass.

| Suite | Result |
|---|---|
| `defense-core.test.js` | 34/34 |
| `service-worker-policy.test.js` | 4/4 |
| `worker-b-economy.test.js` | 9/9 |
| `worker-j-defense-guard.test.js` | 8/8 |
| `static-defense-audit.py` | 81/81 (after creating `reports/`) |
| `browser-launch-recovery` | 5/5 |
| `browser-v75-arcade` | 17/17 |
| `browser-v84-lame-test` | 34/34 |
| `browser-v83-player-pressure` | 27/27 |
| `browser-v85-handmade` | 33/33 |
| `browser-v88-authored` | 24/24 |
| `browser-first-ten` | 41/41 |
| `browser-defense-integration` | 77/77 |
| `browser-defense-surfaces` | 76/76 |
| `browser-master-integration` | 24/24 |
| `browser-v80-strategy-feel` | 17/17 |
| `browser-worker-j-qa` | 10/10 |
| `browser-worker-j-hostile` | 21/21 |
| `browser-worker-b-economy` | 10/10 |
| `browser-worker-d-towers` | 54/54 |
| `browser-worker-c-roster` | 13/13 |
| `browser-worker-f-endless` | 10/10 |
| `worker-j-integration-risk-audit` | 53/53 |
| `browser-v77-feel-pass` | 34/34 |
| `browser-worker-a-flow` | 33/33 |
| `browser-v87-arcade-freeze` | **64/65** (stale classifier, M13) |
| `browser-v82-arcade-soul` | **24/25** (stale cap, M13) |
| `browser-v76-rhythm-engine` | **12/14** (pre-existing) |
| `browser-phase7-art` | **42/43** (pre-existing) |
| `browser-v79-consumer-pass` | **18/20** (pre-existing) |
| `browser-v78-canvas-flow` | **10/11** (pre-existing) |

### Old-save migration probe

The real build boots in Chromium against seeded `localStorage`. "Lived-in" means 4,321 Embers, 17 shards, a
MATURE pet "MOSSY" with skills, a crown, 140 games, Defense best 23, and 2 Ember variants collected.

| Scenario | Result |
|---|---|
| S1 signed v19 envelope (normal live save) | All data kept. |
| S2 raw pre-v66 save (`version: 12`, older shape) | All data kept, rewritten as a signed v19 envelope. |
| S3 truncated primary + intact backup | Recovered from backup (warning `primary-signature-recovered`). |
| S4 truncated primary, no backup | **Wiped** to a fresh egg, original overwritten (C1). |
| S5 tampered signed envelope | Pet kept. **Wallet, scores and collection reset** (H1). |
| S6 raw unsigned v19 | Pet kept. **Wallet, scores and collection reset** (H1). |
| S7 primary missing + valid backup | **Wiped**, backup overwritten (C2). |
| S8 signed save + 1 h-old v7 Defense checkpoint | Checkpoint resumable. |
| S9 signed save + 8-day-old checkpoint | **Checkpoint deleted** on lobby open (C4). |
| S10 legacy `rizo-life-save-v1` only | Ignored, fresh game (M2). |

### Defense saved data that Phase 2 must migrate

- `scores.defense`, `defenseMilestones`, `defenseMaps`, `defensePerfectMaps`, `defenseHistory`,
  `defenseMastery`, `defenseContracts`
- `settings.defenseFx`, `defenseUiScale`, `defenseSignatures`, `defenseAutoStart`, `defenseWaveIntel`,
  `defenseRosterIds`, `defenseRosterConfigured`
- `player.defenseSchool`, and `meta.unlockScenes` entry `defense-origin-v37`
- `…:defense-checkpoint-v68` (schema v10, verifies v2–v9) plus the legacy keys, `…:defense-validation-warning`,
  and `rizo-defense-map-seen:*`
- All of `scores.defense*` is inside the signed payload (`defense-core:908`). Moving it means a new
  `saveVersion` with a branched payload (see H1). Editing the existing shape would wipe every save.

---

## 7. Constraints this puts on Phases 1–3

1. **Fix C1–C3 before any schema change.** Every later phase migrates the save, and today a single bad load
   destroys it. The minimum is: keep the original bytes under a quarantine key before anything overwrites
   them, consult the backup when the primary is missing, and stop a stale tab from writing over a newer save.
2. **Never edit `stateSignaturePayload` in place.** Add `saveVersion: 2` with its own payload, and keep v1
   verifiable forever.
3. **Save slices.** The game-mode contract's "own save slice" cannot live inside the current single signed
   blob without (2). Phase 1 has to decide between a v2 envelope containing a `modes` map and separate keys
   (more failure modes). The recommendation is a v2 envelope.
4. **Defense extraction** has to keep the checkpoint key and its v2–v10 verification readable, credit
   unfinished-run progress before any expiry, and keep `DefenseCore` loadable on its own (its Node tests
   import it).
5. **The training contract** must own the score→reward conversion (H3–H5). It also needs to settle whether a
   timed game may pause for a decision (Rain Walk).
