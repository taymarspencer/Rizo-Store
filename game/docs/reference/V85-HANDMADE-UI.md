# Rizo.game v85 — Handmade UI Pass

Phase 2 is separate from the gameplay pass. Its goal is not “make the dark UI prettier.” Its goal is to remove the visual grammar that makes AI-built pet apps converge on the same product: rounded glass cards, floating pills, centered dashboards, identical icon tiles, generic modal furniture, and every feature receiving the same component weight.

## New design grammar

Rizo.game now behaves like a **streetwear field manual + battered handheld + back-room arcade + photocopied zine**.

Rules:

1. **Curves belong to the world, not the interface.** A rug, window, puddle, aura, Rizo silhouette, or toy may be round. Functional UI is generally rails, tickets, ledgers, plates, physical keys, clipped paper, or arcade hardware.
2. **Hierarchy is editorial, not component-uniform.** Ember Beat is visibly the house favorite. The Arcade has a masthead and poster wall; cards do not all pretend to be equally important.
3. **The interface shows authorship.** Serial labels, `FIELD UNIT 01`, `CAM 01 // DEN`, numbered cabinets, crooked stamps, cabinet-specific accent colors, and physical verbs replace generic “card + icon + PLAY.”
4. **Rizo remains the world.** The rehaul changes the frame around Rizo without turning the pet into a sterile dashboard stat object.
5. **No CSS archaeology as art direction.** The new `rizo-v85-handmade.css` and `arcade-v84-depth.css` contain zero `!important` declarations.

## Surface rehaul

### Den / Home
- Header is now `RIZO APPAREL // FIELD UNIT` / `RIZO.GAME`.
- Habitat is presented as a keeper camera with a structural side rail, `CAM 01 // DEN`, REC state, clipped frame, and physical scene labels.
- Four needs read as one instrument strip rather than four floating cards.
- Care actions are physical keeper keys.
- Growth and Keeper Path survivors were converted from rounded app cards into field-ledger modules after the final visual audit.
- Bottom navigation is a device rail instead of a floating iOS pill.

### Arcade
- New editorial masthead: `THE BACK ROOM.`
- Cabinet order is intentionally curated, with Ember Beat first and Rizo Runaway second.
- Eleven numbered poster/cabinet panels use distinct accents and vertical action plates.
- Ember Beat has a larger headliner treatment and `HOUSE FAVORITE` stamp.
- Player-facing patch labels (`DX`, `REBUILT`, `NEW`) are removed.
- Core body copy was raised again after real 320px visual review; the design test now requires 8px at the standard phone size.

### Journal / long-term progression
- Hero, tabs, profile, path progression, aptitude rows, and counters use editorial ledger language.
- The final “roundness audit” removed remaining pill rows and rounded path cards.

### House
- The room illustration remains atmospheric, but room rails, resident counters, adoption actions, and utility controls now use the same hard material system as the rest of Rizo.game.
- The room itself can contain curved furniture/architecture; the UI around it no longer looks like a separate Tamagotchi template.

### Sheets, modals, and live cabinets
- Bottom sheets are field drawers/ticket queues.
- Backup/general modal furniture was rebuilt after the final visual audit exposed it as a remaining generic rounded-app survivor.
- Live minigames use the same structural left rail and hard cabinet frame.
- Defense retains its specialized larger tactical typography while inheriting the authored outer material language.

## Final visual QA lesson

The first v85 design gate was too generous because it checked the major shell pieces. Manual screenshot review exposed rounded survivors below the fold. A second DOM audit enumerated every visible functional element with a radius >= 6px on Home, Arcade, Journal, and House.

After correction, the remaining large-radius elements in those inspected surfaces are world art/decor (windows, rugs, puddles, aura rings, props), not interface furniture.

## Verification

Phase 2 dedicated gate: `tests/browser-v85-handmade.py` — **33/33**.

Final combined build: **746/746 checks across 21 suites**. This includes the previous 679-check v83 wall plus v84 gameplay-depth checks and the expanded v85 handmade-design checks.

See `reports/v85-final-verification.txt` for the exact matrix and `reports/v85-final/gallery/` for final phone/landscape captures.
