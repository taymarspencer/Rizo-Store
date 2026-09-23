# Rizo Halloween 2026 — design handoff

Branch: `design/halloween-2026`  
Base: `ceb1103f157f98738f56afb9a6952d1ac78380b2` (`fix/final-responsive-cleanup`)  
Brand authority: supplied Rizo Bible v1 and Visual Asset Library v1.  
Scope: complete Shopify theme source, homepage design and event artwork. No merge or live theme deployment.

## Decisions

| Area | Decision | Rizo fit, uniqueness, restraint, usability, realness |
| --- | --- | --- |
| Header and shopping | KEEP / refine | Original blue flame, short navigation, legible cart. Existing overlays, search, variants and cart retained. |
| Hero | MODIFY | Two deliberately composed lines, bundled Bebas Neue, original mark when the event is off. The page-width inset remains intact. Removed scan line, grid, camo wash and repeated face stamps. |
| Moon | CREATE | Crater eyes and five unequal fissures transform the face grammar into lunar material. It is not a logo pasted onto a disc. Compared with the canonical outline and face fragment; the unequal eyes and X rhythm remain legible without a flame silhouette. |
| Bats | MODIFY / CREATE | Replaced mirrored placeholders with continuous unequal wing cuts. A single resting bat reacts to proximity, tap and scroll, then returns. Flight pool and motion governor remain in the original engine. |
| Fog and countdown | KEEP / tune | Original seamless texture and runtime. Lower opacity over real photos and products, minutes rather than urgent seconds. Existing module switches and schedule remain usable. |
| Products | MODIFY | Four actual collection products, two columns on phones, visible prices and choose-size actions. No invented drop, scarcity, price or stock in production. |
| Founder | MODIFY | One real portrait, two short paragraphs, Pittsburgh provenance. Removed repeated watermark and homepage logo-evolution strip. |
| World entry | REMOVE / CREATE | Detailed map and forge removed from the homepage, retained on the World page. A native details pocket reveals the original pencil drawing. Accessible by keyboard and without JavaScript. |
| Circle | MODIFY | Real underpass and friends-at-night photos, unequal scale and staggered placement. No synthetic people, photo compositing or repeated slogans. Full Circle page retained. |
| Signup / footer | MODIFY | One signup, concise copy and clear email/button layout. Preserved Shopify customer form and navigation. |

Homepage sequence: hero → current rotation → Pittsburgh founder → World doorway → real people → signup → footer.

## Where to work

- `assets/rizo-design.css`: permanent typography and homepage composition. Separate from seasonal engine styles.
- `assets/event-halloween.css`: seasonal palette, atmosphere and composition.
- `assets/event-halloween.js`: existing bat behavior plus a lifecycle-managed `halloween-perch` module. No changes to the core engine or flock pooling implementation.
- `sections/rizo-after-hours.liquid`: original-drawing pocket and World entry.
- `templates/index.json`: editable homepage sections and copy.
- `tools/preview/catalog-snapshot.json`: public Rizo catalog retrieved September 23, 2026. **Preview only**, never production inventory authority.
- `docs/screens/design-2026/`: mobile/desktop renders, event-off hero, open sketch pocket, product at 320px.

The original responsive cleanup remains in `assets/rizo-theme.css`, unmodified by this design pass. No global overflow rule was added. Long custom hero headings wrap; the canonical heading gets an explicit two-line composition. The font is self-hosted, so phone and desktop glyph widths no longer depend on system Impact availability.

## Validation

- Visual and geometry checks at **320×568, 375×667, 390×844, 430×932**, plus **1440×900**.
- At all four mobile sizes, WEARABLE. glyphs fit inside the retained inset and the first shop CTA receives taps above the mobile dock.
- Full-page screenshots load the lazy photographs before capture. No broken visible images or browser exceptions.
- Native keyboard sketch reveal, perched-bat reaction, live reduced-motion change, event cleanup and event off verified.
- Collection and product pages checked at 320px. Additional regression coverage includes landscape and tablet widths.
- All **37 existing Event Layer checks** passed across the full run and targeted reruns. Tests now explicitly enable optional announcement/seconds controls when exercising them, and await the initial quiet-zone IntersectionObserver result.
- Quick add for variant and single-variant products, unavailable sizes, cart drawer, cart page, simulated checkout, menu, search, signup, countdown/timezones, scheduling, reduced motion, editor reloads, effect input passthrough and bounded flock behavior checked.
- Shopify Theme Check: **zero new findings**. Three pre-existing findings remain in `sections/main-product.liquid`: image dimensions, remote image URL and unused `has_multiple_options` assignment.
- Global setting IDs and numeric ranges validated.

Commands: `npm test`, `npm run test:design`, `npm run check` from `tools/`. Chromium was pinned to Playwright 1.56.0 with a lockfile for reproducibility. Historical placeholder generation now writes only to ignored test output, never final artwork.

## Production uncertainties for Claude

1. Local Liquid rendering approximates Shopify. Verify the branch in an unpublished **native Shopify theme**, especially real inventory, selected variants, cart section rendering, taxes/shipping, accelerated checkout and successful newsletter subscription. No real order or subscription was submitted.
2. Confirm the target store's existing `/pages/world`, `/pages/about` and `/pages/circle` page assignments and navigation menus. Source templates exist; a Git checkout cannot create Shopify Admin page records.
3. Reconcile `settings_data.json`, section-group JSON and `templates/index.json` with any merchant edits newer than the supplied repository. New design defaults intentionally disable heritage ornament and the announcement bar; both controls remain available.
4. Halloween is **scheduled September 23 to November 1, 2026** for an early seasonal rollout. Use `?rizo_event=on` outside that window, or the existing Always on setting when appropriate. This is a Halloween date countdown, not an unconfirmed merchandise-drop timer.
5. Test physical iPhone Safari: safe-area dock, text zoom, font loading, drawer scroll locking, touch and GPU performance. Headless Chromium checks do not establish actual iOS behavior or mobile frame rate.
6. The moon is about 281 KiB; the full event payload measured about 405 KiB uncompressed. Existing governor, off-screen dormancy and reduced motion remain. CPU-rendered headless FPS is not a device performance benchmark.
7. Shared typography/button styling affects secondary pages. Regression routes load and commerce checks pass, but the creative pass concentrated on the homepage. The detailed World experience is intentionally retained.

## Asset provenance

- `assets/event-halloween-moon.webp`: new built-in ImageGen asset, 1000×1000 RGBA WebP, generated from the supplied face-fragment reference; encoding/resizing only after generation.
- `assets/event-halloween-bat-1.svg`, `-1-b.svg`, `-2.svg`: authored native vector replacements, same sprite slots and aspect ratios as the engine expects.
- `assets/event-halloween-fog.webp`: original supplied seamless fog, retained.
- `assets/rizo-display.ttf`: Bebas Neue from Google Fonts' `ofl/bebasneue` source. SIL Open Font License in `docs/BEBAS-NEUE-LICENSE.txt`.
- Existing Rizo logo/portrait/sketch/underpass/friends photographs are unchanged source assets. Product preview photos are downloaded from Rizo's public Shopify catalog and optimized only for local testing.

Moon generation brief (built-in ImageGen):

> Isolated almost-full moon on transparency, cool chalk/silver with a tactile lunar surface. Extend Rizo's reduced face grammar through two small unequal dark oval craters and five uneven X-shaped fissures, noticed as geological accidents rather than applied ink. Keep the upper disc mostly unmarked; one chipped crater bite at the upper-right. Upper-left light and soft lower-right shadow. No exterior glow, stars, fog, bats, text, flame silhouette, rings or decoration. Reference: supplied eyes/X-mouth fragment. Premium editorial night art, not a cartoon game asset.

The accepted moon keeps the source family's primitive eyes, unequal marks, reduction and inversion while changing the material. Its face is a secondary discovery; the primary blue flame remains in the header.
