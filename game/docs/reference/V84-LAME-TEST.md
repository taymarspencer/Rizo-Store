# Rizo.game v84 — Lame Test

Phase 1 exists for one question: **would a player voluntarily run this cabinet again after understanding it once?**

A cabinet failed if its entire identity was “tap the thing,” “remember the pattern,” “Flappy with Rizo,” or another familiar template with only mascot art changed. Familiar controls were allowed only when Rizo.game added a real decision layer, escalating mastery, authored structure, or a persistent reason to care.

## Cabinet verdicts

| Cabinet | Verdict | v84 reason to replay |
|---|---|---|
| Ember Beat | KEEP / HEADLINER | Already has timing mastery, chart variety, harder songs, clean-run pressure, and permanent Bond/training. It remains the quality bar. |
| Rizo Runaway | KEEP + DEEPEN | Maze chase now records movement habits; later ambush behavior can read the player's favored direction. Prism hunt mode, level clears, hunter roles, combos, and lives already create a full chase loop. |
| Rain Walk | KEEP | It is intentionally the low-pressure exploration cabinet: route forks, weather, biome/lore changes, actual-Rizo continuity. It should not become another reflex game. |
| Power Tape | REBUILD | JAB / BODY / HOOK coach calls, moving timing window, deliberate restraint during feints, wrong-technique mistakes, and Overdrive. Mashing is no longer the strategy. |
| Spark Stash | REBUILD | Catches create an unbanked stash. The player chooses when to BANK; a miss or Shadow can spill greed. Clean chains trigger Spark Rush. Risk appetite is now the game. |
| Forest Lunch | REBUILD | Short food tickets grow with completed lunches. Every second ticket triggers Picnic Panic, forcing quick wanted-vs-bad lane reads instead of endless object catching. |
| Rizo Courier | REBUILD | Prism pickups become packages. The player must survive two obstacle clears while carrying one; crashing loses it, successful delivery pays. Jumping now serves a delivery objective. |
| Lost Signal | REBUILD | The broadcast can require forward, reverse, opposite, rotate, reverse-opposite, or reverse-rotate input. Later rounds stack corruption rules rather than merely adding sequence length. |
| Skybound | REBUILD | Center-threading gates builds Draft. Three Draft charges trigger a Thermal Burst with altered flight feel and doubled gate scoring. The player chooses precision lines instead of only surviving gravity. |
| Ember Forge | REBUILD | Random brick walls were replaced by authored patterns (Broken X, Fire Teeth, Bridge Mark, Keeper Eye). Core blocks collapse nearby wall structure and become tactical targets; Ember piercing remains a power moment. |
| Rizo Defense | KEEP | Already the strategy/depth anchor. This phase intentionally did not turn the Arcade pass back into another Defense overhaul. |

## Product corrections found during the lame test

- Removed player-facing `DX`, `REBUILT`, and `NEW` patch-history language. Shipped cabinets have identities, not changelog labels.
- Promoted Power Tape into the actual Play deck instead of hiding a real cabinet inside “More Care.”
- Updated Home's Play sheet so each cabinet explains its current rule instead of legacy/generic copy.
- Closed incomplete mechanic contracts: growing Forage tickets, stacked Lost Signal transforms, Forge Core behavior, and Runaway habit learning now have actual runtime effects and UI feedback.
- Preserved v83 anti-farming rules: a cabinet must contain meaningful play before permanent rewards/energy consumption qualify.

## Phase 1 verification

`tests/browser-v84-lame-test.py`: **34/34**

The final v85 build also re-runs all legacy Arcade, rhythm, surface, save, launch, and Defense regressions; see `V85-HANDMADE-UI.md` and `reports/v85-final-verification.txt`.
