# RTD Multi-Agent Master Vision

## Product north star
Rizo Defense should capture the strategic clarity, economy tension, readable progression, and replayability that make classic tower defense compelling, while becoming unmistakably RIZO rather than a reskin or clone.

The game must feel authored, handmade, responsive, and alive. The player should almost always have something meaningful to consider or do. Strategy should come from tradeoffs, roster choices, timing, economy, map interaction, upgrades, abilities, and enemy mechanics — not merely bigger HP bars or more objects on screen.

## Core fantasy
**Your Rizo is the star. Towers are tools. Discovered Rizos are characters and strategic options.**

The player's personal Rizo should be the emotional and visual center of a run. It should feel important from the first seconds through extreme late game.

Other Rizos the player has actually discovered or owns should also feel special, characterful, and worth bringing. If someone has deeply engaged with Rizo.game and collected many Rizos, Defense should reward that engagement with a broader strategic vocabulary, not merely raw stat inflation.

A new player must still have a complete tower-defense game even if they own only their main Rizo.

## Universal Defense kit
The game may provide universal Defense-only tools so the tower-defense layer is immediately playable and strategically complete without invalidating collection.

Current concepts:

### Basic Defense Rizo
The Dart-Monkey-equivalent role: cheap, legible, dependable, purpose-built for Defense. Visually simple at first — potentially a blank/basic Rizo with no inner color — but capable of becoming much more expressive through upgrades. It should teach itself through behavior rather than exposition.

### Clothing Factory
The core economy structure. It generates cash in a way that is instantly legible from animation and feedback. The player sacrifices immediate defense for future economic strength. It should visually evolve from a tiny handmade clothing operation into an absurd late-game RIZO production machine.

### Beacon
A support structure. Towers/Rizos inside its influence become stronger and/or attack faster. The radius and benefit should be readable without text dependence. Its upgrade fantasy escalates dramatically; continued investment can eventually turn the Beacon into a literal sun-like battlefield object. The journey from small utility light to outrageous endgame centerpiece should be visible.

Universal structures should be simple to understand at level 1 and increasingly ridiculous, powerful, and RIZO-specific when heavily invested in.

## Rizo roster / collection
The player's main Rizo remains the protagonist, but discovered Rizos should not feel like generic NPC towers.

A sensible long-term model is a pre-run Defense roster/deck: main Rizo + a limited number of discovered Rizos + universal Defense structures. The exact slot count is a design variable, not a hard requirement.

Defense-only guest Rizos may remain as onboarding/loaners if useful, but they should be clearly framed as temporary/trial access and must not undermine the reward of truly discovering or owning a Rizo.

Each discovered Rizo should earn its place through a distinct strategic identity, visible upgrade evolution, signature ability/passive behavior, unique attack language, and personality.

## Player agency and flow
The present game is smooth but too much of the run can feel like watching systems happen.

Classic tower defense stays engaging because the player repeatedly faces decisions:
- spend or save
- greed for economy or stabilize defense
- deploy another unit or upgrade an existing one
- commit to one upgrade path or another
- trigger an ability now or hold it
- prepare for a known counter/mechanic
- interact with the map
- alter targeting/positioning/loadout

RTD should generate these decisions frequently without becoming busywork.

The opening should be self-explanatory through affordances, animation, layout, previews, and cause/effect. Avoid tutorial walls. A player should be able to place a Factory, watch a shirt/cash payoff happen, and understand what it does. A player should place a Beacon, see its field and nearby attacks accelerate, and understand the relationship.

## Economy
RTD needs a fully fledged economy, not incidental bonus income.

The economy should create meaningful greed-versus-survival decisions. A player who invests in production early can become dramatically stronger later, but should risk dying for that greed. Economy must remain relevant into late game/endless without becoming mandatory in one solved form.

Golden Rizo should retain a unique economy identity rather than becoming obsolete because universal economy structures exist. Golden may amplify, interact with, or bend the economy in ways other Rizos cannot.

## Upgrades must be visible
Upgrading should not primarily be hidden stat growth.

When a player spends serious resources on a Rizo or structure, they should be able to look at the battlefield and see the investment:
- silhouette/details change
- attack animation changes
- projectile/effect language evolves
- power/control branches diverge visually
- maxed units become unmistakable

UI must never hide the fact that an upgrade happened.

## Abilities and elemental identity
Abilities currently read as mechanically different but emotionally flat. An ability should be a battlefield event.

Fire should look and behave like fire. Poison should visibly infect/linger/spread or otherwise own its state. Frost should visibly crystallize/chill. Electricity should leap. Quakes should make the map react. Bubblegum-style knockback should read physically. Glitch effects may momentarily disrupt presentation in a controlled, legible way.

Simple art is acceptable. Weak or generic feedback is not.

Every signature ability should have:
1. anticipation/readiness
2. activation animation
3. unmistakable impact
4. persistent consequence where appropriate
5. strong cooldown/readiness communication
6. audio/haptic/visual punctuation

## Animation and game feel
Animations can be economical but must be intentional and intricate enough to wow. Towers/Rizos should not feel like static icons that emit projectiles.

Attack motion, recoil, anticipation, recovery, hit reactions, deaths, upgrades, ability activations, boss entrances, boss phase changes, economy payouts, and major purchases should all receive authored motion appropriate to their importance.

Quiet moments should remain quiet so important moments can hit harder.

## Bosses
Bosses should be set pieces, not merely large special enemies.

A boss should have:
- an entrance
- a clear identity/silhouette
- a readable unique mechanic
- escalation or phase behavior
- presentation changes in music/UI/map where appropriate
- dramatic defeat feedback

Existing concepts such as Warden summons, Maw range pressure, Mirror splitting, and Redline speed bursts can be retained and elevated if they remain strategically good.

## Maps
Maps should become materially better and more memorable. Route geometry alone is not enough.

Each world should have authored focal points, environmental storytelling, visual depth, and potentially an interactive mechanic that changes play. Examples include vents, pylons, keeper stones, moon basins, ice, shadow structures, or other map-native systems.

Map interaction must support strategy rather than become decorative clicking. Maps should be recognizable in screenshots and create different decisions.

## UI / UX
The battlefield is the star. UI must support it rather than bury it.

The interface should feel tactile, responsive, readable, and dopamine-rich without becoming noisy or casino-like. Important moments deserve controlled punctuation:
- money earned
- new wave
- upgrade purchased
- ability ready
- ability used
- perfect defense / clutch survival
- boss warning/health
- new personal best / endless milestone

Mobile is a first-class target. Touch targets, safe areas, battlefield visibility, placement, upgrade access, and performance must remain excellent on a real phone.

## Endless loop
After the authored progression, Defense should support an effectively infinite loop.

Endless must not be only `HP *= X` forever. It should increasingly remix systems:
- enemy compositions
- multiple mechanics at once
- weather changes
- route/map conditions
- elite traits
- boss returns/remixes
- multi-lane or packet pressure where supported
- economy pressure
- increasingly strange late-game events

Extreme late game should create screenshot-worthy boards: developed economy, absurd support infrastructure, maxed Rizos, spectacular effects, bosses, and meaningful pressure.

The player's goal should shift from "finish the level" to "how far can this build go?"

## What should be preserved from the current build
Do not casually throw away working depth. The current game already contains useful foundations including authored waves, differentiated guest Rizos, targeting, enemy resistances/traits, bosses, mastery, contracts, multiple worlds, deterministic/fixed simulation behavior, checkpoint/reward correctness, mobile launch safeguards, and existing tests.

Strong rewrites are allowed where the player experience materially improves, but retain or deliberately migrate reliable underlying behavior instead of resetting the game to a toy prototype.

## Final quality bar
A stranger should be able to open RTD on a phone, understand the basics without reading a manual, make meaningful decisions within the first minute, see and hear upgrades matter, recognize every important unit/ability/boss by behavior, and want to start another run because a different economy/roster/path/map strategy feels possible.

The target is not "BTD5 with Rizo graphics."

The target is: **classic tower-defense strategic satisfaction, rebuilt around Rizo ownership, Rizo personality, visible evolution, active maps, expressive abilities, and a deep endless sandbox.**
