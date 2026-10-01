# Rizo.game v79 — Defense Alive

v79 is the consumer-finish pass for Rizo Defense. The goal is not to add more systems; it is to make the systems already present behave like a game a child can understand by looking, touching, and watching the battlefield react.

## Product rule

**Software -> toy.**

If the player needs developer vocabulary, a paragraph, or trial-and-error button tapping to understand a normal action, the interface failed. v79 removes or demotes diagnostic language and makes money, placement, upgrades, waves, threats, powers, and feedback visible through shape, motion, position, and short copy.

## World selection

The Defense lobby is now a level selector rather than a dashboard/list:

- one large selected-world hero card
- a simple route preview and one short strategy phrase
- six numbered world buttons with clear locks
- a prominent PLAY button
- an obvious CONTINUE RUN when a checkpoint exists
- advanced records/guide/trail-school/daily information behind MORE
- one instruction: **Drag a Rizo onto grass. Protect the Gate.**

## Upgrades and iPad

Tower inspection was rebuilt as a shop card:

- Rizo portrait, role, and level
- literal POWER / SPEED / RANGE bars
- large **YOU HAVE X** coin display
- one dominant **LEVEL UP** action
- insufficient-cash feedback says how much is missing
- level-3 doctrine choice is framed as two understandable fantasies: **HIT HARDER** or **CONTROL TRAIL**
- target, ability, and sell are secondary actions
- each active power gets a one-line explanation
- selling remains a between-wave strategic action and is labeled **SELL AFTER WAVE** during combat instead of a vague WAIT state

Upgrading is allowed during active waves. Portrait iPad uses a contained bottom sheet; landscape uses a full-height side bay so the panel does not collapse into an unusable strip.

## Placement and range

The v77 drag system remains intact, but v79 corrects the visual placement footprint:

- placement clearance now accounts for the visible Rizo body and road border/shadow, not merely the abstract tower center
- placement snap radius is reduced from 20 px to 9 px so the game assists without hijacking a player's strategy
- the exact range ring is solid and readable
- tower base range was increased modestly so what appears reachable on the composed maps is more likely to be mechanically reachable

## Wave flow

v79 keeps the v76 fixed-step/packet engine but slows **session pressure**, not balloon animation into molasses.

- early, mid, late, rush, wall, and boss packet gaps/breaths are longer
- first threat enters later so a wave has an anticipation beat
- ordinary balloon movement remains decisive at 0.94 of the v78 global pace
- routine phase/packet diagnostics are hidden during normal play
- short center-field announcements own the player's existing point of attention
- bosses receive stronger center-field warnings
- first ten waves of every authored map receive handcrafted short flavor/foreshadow lines
- endless waves fall back to procedural concise lines
- stale presentation projectiles/effects are retired and cannot keep a mechanically cleared wave stranded

## Money

Cash has more visual weight:

- larger yellow coin HUD
- clear current-cash wallet in the upgrade panel
- unaffordable purchases shake and explain the shortfall
- logical cash changes remain immediate

## Gate Flame

Rizo Defense now has a universal emergency field power:

- choose **FLAME**
- tap a point on the road
- a Rizo flame burns that section for 10 seconds
- 40 seconds of game-time cooldown
- damage ticks every 0.5 seconds
- fireproof threats take reduced damage
- other threats receive a short burn
- active Gate Flame state is included in the signed checkpoint

It is designed as a leak-catcher and tactical panic button, not an automatic strategy replacement.

## Alive battlefield feedback

Rizos now visibly react to play:

- firing animation
- ability-cast animation
- doctrine-strike animation
- tap acknowledgement
- animated/scouting map-intro Rizo

Combat statuses are more legible:

- burn, poison, frost, and root are clipped to/read on the balloon itself
- old random state/trait glyph clutter is hidden
- ordinary hit FX are concise and game-specific
- close buttons are consistent centered round controls

## Canvas quality pass

The v78 hybrid Canvas architecture remains the production renderer. v79 tunes presentation quality rather than reverting to DOM enemies:

- full-quality Canvas DPR cap: 2.0
- pressure tier: 1.5
- lowest tier: 1.08
- high image smoothing enabled
- normal balloons no longer bob every frame
- normal balloon outlines reduced to 1.8 px equivalent; shell 2.15; boss 2.55
- normal bodies are axis-aligned to reduce subpixel shimmer
- face/detail strokes are lighter
- status effects remain clipped inside the balloon silhouette

The deterministic combat simulation remains the source of truth.

## Save/checkpoint compatibility

Defense checkpoint schema is now v6. Gate Flame fields are signed:

- `gateFlameReadyAt`
- `gateFlameUntil`
- `gateFlameProgress`
- `gateFlameNextTick`
- `gateFlameTicks`

Verification remains backward compatible with v5/v4/v3/v2 checkpoints.

## QA

Final automated regression matrix: **510 / 510** checks.

- 28 core logic
- 4 service-worker policy
- 80 static architecture
- 20 v79 consumer behavior
- 76 Defense device surfaces
- 77 gameplay/economy integration
- 33 v77 feel/drag regression
- 19 route fidelity
- 43 battlefield art
- 17 cinematic/exploit
- 14 v76 rhythm/fixed-step
- 11 v78 Canvas/flow
- 17 Arcade behavior/training
- 66 Arcade device surfaces
- 5 launch recovery

The route-fidelity suite remains sub-pixel, while the new placement rule separately tests visible Rizo clearance from the road.

## Deliberately deferred

- The reported intermittent Skybound/Flappy art issue belongs to the next Arcade finalization pass and is intentionally not mixed into this Defense release.
- Physical iPhone Low Power Mode + screen sharing remains the most important performance/feel validation. Browser automation cannot reproduce Apple's full thermal/power behavior.
- OffscreenCanvas/Worker migration remains optional future headroom. v79 first finishes the player-facing game on the current proven hybrid renderer.
