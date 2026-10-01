# V79 — Defense Alive / Consumer Finish

## Why this release exists

The v78 engine had the right skeleton: fixed simulation, packetized pacing, hybrid Canvas combat, direct drag placement, checkpoint recovery, and bounded effects. Consumer testing showed that the remaining problem was not a missing engine feature. It was translation.

The game exposed too much implementation language and too little intuitive cause-and-effect. The player could technically act, but often had to read, guess, or remember what a button meant. v79 treats that as a product bug.

The design north star remains the BTD5 research translation: pressure should be scheduled, the battlefield should dominate attention, difficulty should come from composition rather than endless entity growth, and presentation should fail before mechanics. Rizo keeps its own art, systems, enemies, worlds, powers, and identity.

## Consumer findings translated into systems

### "I do not know what I am clicking" -> visual hierarchy

- world browser became a selected-world hero + six level buttons
- advanced data moved behind MORE
- threat preview collapsed to total threats + up to three useful chips
- routine phase/packet labels are not part of normal play
- phone command deck exposes plain labels instead of mystery icons

### "Upgrades feel random" -> one obvious purchase

The tower sheet now answers, in order:

1. Which Rizo is this?
2. What is it good at?
3. How much money do I have?
4. What happens if I level it up?
5. What are the optional advanced controls?

The primary upgrade action is one large button. Doctrine branching appears only when the player reaches the choice and is framed as two playstyles rather than a stat spreadsheet.

### "Money has no weight" -> economy feedback

Cash is rendered as a first-class HUD resource, mirrored in the tower wallet, and shortfall feedback is immediate. Purchases never rely on the player comparing several small numbers scattered across the screen.

### "Rizos look on the path" -> visual geometry, not mathematical geometry

Old legality checks could pass while the visible Rizo body/shadow still intruded into the road. v79 increases the tower footprint used by placement legality and reduces auto-snap. The tower can still intentionally cover useful curves with range, but its body belongs to grass.

### "Rounds get stuck" -> mechanical completion ignores decoration

Wave resolution checks scheduled enemies, active enemies, and pending children. Presentation-only projectiles/effects are retired at cleanup and cannot block progression.

### "Normal looks choppy" -> remove artificial oscillation

Normal Canvas balloons no longer bob continuously. Their bodies are drawn axis-aligned with lighter line weights and higher-quality smoothing. Pacing is slowed by authored gaps/breaths instead of making each individual balloon crawl.

### "The game feels flat" -> reaction and punctuation

- tower firing/casting/doctrine/tap animations
- animated intro Rizo
- centered wave/boss callouts
- per-map authored wave voice
- Gate Flame emergency interaction
- stronger status readability
- concise hit/ability confirmation

The game should react to the player without filling the screen with particles.

## Gate Flame design contract

Gate Flame is a universal Rizo mechanic, not a tower replacement.

- duration: 10 seconds game time
- cooldown: 40 seconds game time
- tick: 0.5 seconds
- road placement only
- fireproof resistance preserved
- checkpointed/signed
- active field instance ends on wave clear
- cooldown persists

Its design job is to create a memorable clutch decision when a formation leaks through a strategy.

## Pacing contract

Core packet ranges are authored by wave role rather than one global faucet. v79 increases the v76/v78 breathing windows while preserving short, recognizable rush exceptions. Manual wave ownership remains the baseline interaction.

The game's difficulty vocabulary already includes armor, split behavior, fire/frost resistance, storm/surge behavior, phasing, camouflage, bosses, doctrines, and active abilities. v79 therefore does not add more paragraph-driven mechanics. It exposes existing depth more clearly.

## Rendering contract

- 30 Hz deterministic simulation remains authoritative.
- Canvas renders balloons/projectiles/common combat FX.
- DOM renders map/towers/touch/UI/major feedback.
- renderer never owns combat state.
- visual quality can downshift without thinning the authored formation.
- rapid logical fire can remain visually coalesced.

## Tablet and orientation contract

- iPad portrait: tower inspector is a contained bottom overlay.
- tablet/landscape: tower inspector uses a full-height side bay.
- live upgrades remain available during combat.
- opening/closing an inspector never resizes the map coordinate system.

## QA gates

Release gate: **510 / 510** automated checks passed.

Consumer-specific tests include live iPad upgrade, tower tap acknowledgement, Gate Flame placement/tick/cooldown, simplified preview copy, money shortfall feedback, placement clearance, center announcements, Rizo ability animation, and no runtime errors on the phone harness.

## Known next work

The next pass should return to the Arcade suite: finish Skybound's intermittent art issue, then perform the same consumer/product finish on the remaining minigames without destabilizing Defense.
