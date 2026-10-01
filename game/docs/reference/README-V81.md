# Rizo.game v81 — Art Cohesion Pass

v81 is a visual-direction release built directly on the tested v80 Strategy & Feel build. It deliberately does not change the fixed-step simulation, enemy-density budgets, economy authority, checkpoint model, rotation geometry, or centralized Rizo renderer.

## Art-direction goals

- Make Defense read as one professionally directed game rather than layered generations of UI.
- Keep Rizo as the visual hero; UI should frame the battlefield instead of competing with it.
- Give all six maps distinct materials and atmosphere while retaining one shared Rizo-world outline/shadow language.
- Improve hierarchy: health/gold are game objects, utility actions are dark hardware, START WAVE remains the unmistakable primary field action.
- Reclaim visible terrain from oversized road treatment without altering route geometry or tower/enemy simulation coordinates.
- Make upgrade state readable at a glance through stronger silhouette/aura hierarchy.
- Bring lobby, menus, roster cards, inspector, wave overlays, and battlefield into the same chassis system.

## Map identity

- **Pine Bend:** storybook pine forest, warm dirt, mossy green layering, small warm environmental accents.
- **Ember Switchback:** charcoal earth, iron/ash material, hot orange seams and crater treatment.
- **Moon Loop:** lavender rock, cool silver/luminous accents, softer nocturnal contrast.
- **Storm Circuit:** wet steel-blue terrain, cyan electrical accents, slick charged atmosphere.
- **Whiteout Pass:** frosted rock, pale ice shelf, higher-value snow/ice contrast.
- **Eclipse Ridge:** deep void rock, muted purple terrain, controlled magenta fracture light.

## UI cohesion

- Rebuilt Defense chassis styling with more restrained borders and shadows.
- Heart and Gold HUD objects retain v80 feedback but use more intentional material depth.
- Utility controls share one subdued family; active surfaces use cyan; wave start remains green and spatially separate.
- Wave banner and field feed use translucent field-glass treatment rather than opaque dashboard cards.
- Roster cards and tower inspector share the same card material system.
- SELL remains intentionally small/red but preserves readable touch/type floors.
- World select and field sheets now share the Defense chassis language.

## Battlefield art

- Reduced road visual width while preserving the exact route path and simulation geometry.
- Raised authored landmarks/obstacles above terrain so they read as physical world objects.
- Strengthened per-world color/material separation.
- Strengthened upgraded and Super Rizo aura hierarchy.
- Kept adaptive enemy/health-bar contrast contracts intact for bright Whiteout and dark Eclipse maps.

## Validation

- Core logic: 29/29
- Service-worker policy: 4/4
- Static architecture: 80/80
- v80 Strategy & Feel regression: 17/17
- Defense device surfaces: 76/76
- Defense art regression: 43/43

The art layer is additive (`v81-art.css`) so v80 gameplay remains easy to audit and future art changes do not need to destabilize the mature Defense runtime.
