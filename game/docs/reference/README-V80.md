# Rizo.game v80 — Strategy & Feel

v80 is the consumer-response pass built directly on v79. It preserves the fixed-step simulation, bounded enemy density, hybrid Canvas presentation, orientation math, signed saves, and centralized Rizo renderer, while changing the parts a player actually feels: HUD, controls, powers, difficulty, enemy readability, upgrades, rewards, bosses, and final-run presentation.

## Product rule

**Keep the smooth engine. Make individual choices matter.**

Late-game difficulty is no longer allowed to come primarily from rendering more balloons. v80 keeps the existing density budgets and increases strategic pressure through durable threats, boss scaling, POWER/CONTROL differentiation, and Super Rizos.

## Consumer HUD and wave flow

- hearts are now a stylized heart object with the live gate number inside it
- taking damage animates the heart; healing has its own response
- currency is presented consistently as **GOLD** with a gold symbol and animated gain/spend feedback
- wave-clear gold uses a centered, dismissible reward moment long enough to register
- **START WAVE** has its own high-contrast battlefield button instead of sharing the cramped utility grid
- default next-wave intel is semantic and count-free; settings support `OFF`, `SIMPLE`, and `FULL`
- detailed packet/count information is no longer normal-player UI
- the final Canvas presentation is force-rendered at wave completion so the last defeated balloon cannot remain painted as a stale frame

## Rizo inspector and selling

- tower inspection is simplified around Rizo identity, level-up, targeting, doctrine/leader state, and Super progression
- SELL is a small red secondary control
- selling now opens an explicit confirmation surface before removing the Rizo
- upgrade aura/glow is substantially stronger at Charged, Awakened, Apex, and Super tiers

## Field Leader powers

The normal player no longer chooses from a tray of every placed Rizo ability.

- the first surviving Rizo placed becomes the **Field Leader**
- the main power control belongs to that Rizo
- the Field Leader remains stable as additional Rizos are deployed
- POWER and CONTROL use materially different active effects
- POWER emphasizes direct damage/burst/boss pressure
- CONTROL emphasizes slow, root, reveal, rewind, disruption, and trail manipulation

Legacy ability-group internals remain available for migration/QA, but are no longer the primary consumer interaction.

## Ember Pod

Gate Flame is reworked/reframed as **Ember Pod**:

- one clear place-on-road tactical installation
- visible radial zone treatment
- timed burning/slow pressure
- clearer `WAVE ONLY`, aiming, active, and cooldown states
- aiming is cancelled when paused/interrupted
- placement revalidates live-wave state, preventing placement while paused
- active/cooldown/position/tick state is restored from signed checkpoints

The internal `gateFlame*` field names remain for backward save compatibility.

## Difficulty without more balloons

Two durable threat classes are introduced by replacing slots in existing wave plans rather than appending extra entities:

- **CERAMIC BALLOON** — high HP, slower, visibly cracking shell
- **LEAD BALLOON** — high HP and heavy armor

Late waves apply additional durability scaling, with bosses receiving a stronger multiplier. Enemy-count and fixed-step performance budgets are unchanged.

## Boss pass

Boss identities are now physical/visual rather than symbol-first:

- THE WARDEN
- THE MAW
- THE MIRROR
- THE REDLINE

Bosses receive stronger durability, clearer silhouette treatments, longer entrance presentation, and a dedicated lower/half-time procedural boss music pulse rather than merely louder normal music. Existing boss mechanics remain intact.

## Balloon readability and effects

Normal enemy identity is communicated through silhouette/material rather than abstract glyphs.

- Ceramic uses visible layered brick/shell treatment
- Lead uses metallic banding
- boss markings are physical shape treatments
- Field Guide cards use visual balloon representations rather than triangle/diamond shorthand
- burn, frost, armor/crack and related Canvas treatments were strengthened while preserving the low-cost renderer

## Super Rizos

A maxed Rizo on a POWER or CONTROL path can ascend when ten matching non-Super copies are present.

- nine matching copies are sacrificed into the selected tenth
- resulting tower becomes **SUPER POWER** or **SUPER CONTROL**
- Super forms receive unmistakable aura/silhouette treatment
- combat multipliers and active cooldown behavior are materially stronger
- Super state is included in signed v7 checkpoints

## Pine Bend

Pine Bend receives a first-map atmosphere pass without adding runtime entity pressure: authored edge tree silhouettes, tiny environmental lights, stronger prop treatment, and field atmosphere are implemented in CSS while preserving the route and placement geometry.

## Whiteout clarity

Whiteout Pass still intentionally reduces most Rizo range. v80 makes that rule explicit:

- `WHITEOUT • RANGE -18%` communicates the event
- affected range geometry visibly transitions
- Frost/Aurora display `RESIST`

The mechanic was retained; the hidden-rule feeling was removed.

## End-of-run presentation

The first recap layer is now a result screen rather than an analytics dump:

- Wave reached
- New Best when applicable
- medal/reward
- MVP
- three primary stats
- detailed analytics moved behind `RUN DETAILS`
- Wave 100 receives a dedicated century-clear presentation class

## Consistency/audit fixes folded into v80

- landscape utility controls no longer overflow into/steal touches from the battlefield
- landscape roster retains its own touch surface
- landscape controls use a two-column stacked-label layout so labels remain readable
- Field Guide tab row no longer collapses behind content
- Ember Pod checkpoint fields actually restore
- Ember Pod cannot be placed through stale aim while paused
- lobby placement copy consistently explains tap-or-drag
- DEN and HOUSE no longer share the same navigation symbol

## Save/checkpoint compatibility

Defense checkpoint schema is v7. v80 accepts and migrates signed v79/v6 checkpoints as well as older supported checkpoint generations. The v7 signature additionally covers `superForm`. The existing v6 Gate/Ember tactical fields retain their signature coverage.

## Final regression matrix

The v80 implementation was validated against the current regression set used for this pass:

- 29 core logic
- 4 service-worker policy
- 80 static architecture
- 77 gameplay/economy integration
- 76 Defense device surfaces
- 20 v79 consumer behavior regression
- 17 v80 Strategy & Feel behavior
- 11 v78 Canvas/flow regression
- 33 v77 route/drag/feel regression
- 17 Arcade behavior/training
- 66 Arcade device surfaces

**430 / 430 checks passed.**

Physical iPhone/iPad Home-Screen-PWA testing is still recommended because browser automation cannot reproduce every iOS thermal, safe-area, browser chrome, or backgrounding edge case.
