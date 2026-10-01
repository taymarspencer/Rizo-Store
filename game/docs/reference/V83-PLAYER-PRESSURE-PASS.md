# V83 — Player Pressure Pass

## Product standard
Ember Beat remains the quality reference. v83 stress-tests the rest of Arcade as a player would: Does the cabinet teach the real rule? Can I cheese it? Does a miss count as success? Is the opening fair? Does replaying leave junk state behind? Does the Energy number mean what it says?

## Player-facing fixes
- **One Arcade rules table:** duration and Energy requirements now come from one source of truth.
- **Exact Energy truth:** Power Tap / Rizo Rush cost 15, Spark Catch 10, Forest Forage / Ember Breaker 11, Ember Beat 12, Rain Walk 8, Forest Memory 7, Skybound / Runaway 10. The entry gate and completed-run deduction use the same number.
- **Cabinet-specific verbs survive live rendering:** PUNCH, CHASE, FORAGE, RUN, WALK, PLAY, REMEMBER, FLY, BREAK, RUN and DEFEND no longer collapse back to generic PLAY.
- **Honest onboarding:** Spark Catch explicitly teaches Shadow decoys; Forage teaches order chains and mushrooms; Rush teaches double-jump and pickup height; Power teaches feints and restraint.
- **Home Play sheet updated:** Skybound, Ember Breaker and Rizo Runaway are now represented alongside the current Memory rules and other live mechanics.

## Anti-cheese / fairness fixes
- **No passive-credit runs:** a cabinet must show evidence of its actual core interaction before it can award Energy spend, Embers, XP, Heat, skill growth or a personal best. AFK / accidental launches return a clearly labeled warm-up result and spend nothing.
- **Power Tap spam lock:** one physical timing window cannot be multi-scored by rapid taps.
- **Power Tap hit integrity:** whiffs no longer increment landed-hit counters, move the target as if they connected, or crack the training bag.
- **Runaway opening fairness:** Rizo starts moving away from the side hunters and receives a short hunter wake-up grace. Subsequent mazes use a shorter grace rather than an instant ambush.
- **Runaway anti-AFK:** automatically eaten opening pellets can appear on screen, but cannot become a permanent score without real direction input and enough real progress.
- **Runaway recovery:** clearing a maze restores one life up to the three-life cap.
- **Ember Breaker collision guard:** an individual block rejects duplicate ball contacts inside the same tiny collision window, preventing overlapping-frame multi-hit jitter.
- **Skybound result accuracy:** result screens report gates actually cleared instead of gates merely spawned/seen.

## Replay / runtime durability
- Added a dedicated v83 adversarial browser suite covering exact Energy gates, passive-credit rejection, qualified reward behavior, Power spam/whiffs, Runaway grace/input, and repeated cabinet hopping.
- Stress-tested 20 rapid cabinet swaps to verify the Arcade returns to an inactive clean state without page errors.
- Corrected three stale historical assertions that were already failing in the v82 baseline: the v81 authored Defense road width and two newer Defense cinematic-copy contracts. No Defense gameplay was rolled backward to satisfy old test wording.

## Scope discipline
Defense gameplay/economy was not redesigned in this pass. Historical Defense suites were rerun to make sure Arcade changes did not leak into the mature tower-defense runtime.
