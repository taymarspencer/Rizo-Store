# V82 — Arcade Soul Pass

## Consumer direction
Ember Beat remains the benchmark cabinet. v82 focuses on making every other Arcade activity earn repeat play through a distinct mastery fantasy rather than more taps or more entities. Defense simulation/economy is intentionally untouched.

## Major changes
- Added **Rizo Runaway**, a Rizo-native maze chase with Ember trails, three Shadow hunter personalities, Prism Hunt role reversal, hunter-tag chains, level clears, swipe/d-pad/keyboard controls, and bounded DOM entities.
- **Spark Catch DX:** clean chains now trigger a short high-speed **Spark Rush** with faster targets, more gold signals, and doubled scoring; missing during the rush kills it. Decoys remain the restraint test.
- **Power Tap DX:** added readable bag feints. Panic swings are countered; holding through the fake builds heat and score.
- **Forest Forage DX:** spawns authored two-lane choices so the lunch order matters. Wrong edible catches now cost a point instead of being free consolation.
- **Rizo Rush DX:** collectibles occupy different jump heights; clean obstacle clears can earn close-call bonuses.
- **Forest Memory DX:** every fifth round introduces an OPPOSITES rule in addition to forward/reverse play.
- **Skybound Rizo:** fixed the variant-animation conflict that could replace the flight transform for Retro Rizo; flight rendering now owns its transform shell.
- **Ember Breaker:** added Ember blocks that trigger a temporary piercing fireball, while Prism blocks keep the wide-paddle reward.
- **Ember Beat:** preserved as the proven pillar rather than changed for novelty.
- **Rain Walk:** preserved as the exploration pillar; its existing weather, finds, and route forks already occupy a unique control/fantasy space.

## Save / economy
- Added a migrated `maze` personal-best score.
- Fixed an older normalization omission: `glide` and `breaker` scores are now clamped through the same score-sanitization path as the original Arcade scores.
- Fixed whole-save integrity coverage so `glide`, `breaker`, and `maze` personal bests are included in the signed Arcade progression surface.
- Rizo Runaway trains Instinct + Speed and uses bounded rewards.

## Performance rule
No new particle/entity spam. Runaway uses one static maze, one player, and three hunters; other upgrades reuse existing bounded entities.
