# Halloween 2026 on the Rizo Event Layer: implementation report

Engineering pass on **Rizo Portal v2.3**. The goal was to build a reusable,
reversible **Event Layer** and plug **Halloween 2026 ("October mode")** into it
as the first preset, ready for Astra's visual pass. Reference guide:
[`EVENT-LAYER.md`](EVENT-LAYER.md). Screenshots: [`screens/`](screens/).

Artwork is **temporary and deliberately plain**: a flat moon disc, three slate
bat silhouettes, and a generated fog texture. All of it is replaceable without
touching code.

---

## Files added (theme)

| File | Purpose |
|---|---|
| `snippets/rizo-event-value.liquid` | Resolver: active preset plus setting overrides, key by key. The only place that knows which event is active. |
| `snippets/rizo-event-head.liquid` | `<head>`: event CSS, setting "dials", `#RizoEventConfig`, inline activation boot. Empty when Off. |
| `snippets/rizo-event-stage.liquid` | Fixed page layers: night backdrop, low page fog, flock container. |
| `snippets/rizo-event-hero.liquid` | Hero slot: moon and hero fog. |
| `snippets/rizo-event-countdown.liquid` | Countdown markup (two placements). |
| `snippets/event-halloween.liquid` | Halloween preset definition. |
| `assets/rizo-event-layer.css` | Engine styles and default tokens (inert until `html.rizo-event`). |
| `assets/rizo-event-layer.js` | Engine runtime: loop, input, state, governor, modules `hero`, `quiet`, `countdown`, `fog`, `moon`. |
| `assets/rizo-event-flock.js` | Generic ambient-flyer pool. |
| `assets/event-halloween.css` | Halloween art-direction tokens. |
| `assets/event-halloween.js` | Halloween bat flight behaviour. |
| `assets/event-halloween-moon.svg` | Placeholder moon (0.7 KB). |
| `assets/event-halloween-bat-1.svg`, `-bat-1-b.svg`, `-bat-2.svg` | Placeholder bats (two poses for bat 1), about 0.9 KB each. |
| `assets/event-halloween-fog.webp` | Placeholder tileable fog, 1280×224, 43 KB. |

## Files modified (theme)

| File | Change |
|---|---|
| `layout/theme.liquid` | +2 lines: `render 'rizo-event-head'` in `<head>`, `render 'rizo-event-stage'` after `<body>`. |
| `sections/rizo-world-gate.liquid` | +3 lines: hero slot and two countdown placements (homepage and world page hero). |
| `sections/rizo-live-hero.liquid` | +3 lines: same hooks (not on a template today; verified via the harness). |
| `sections/rizo-header.liquid` | Signal bar can show the event message while live (CSS swap, so it also works for a scheduled event). |
| `config/settings_schema.json` | 5 new groups (*Event layer*, *moon*, *fog*, *bats*, *countdown*), 39 settings (plus one paragraph and one header). |
| `config/settings_data.json` | `event_layer: halloween`, `event_activation: scheduled`. |
| `assets/rizo-theme.js` | **Separate commit, a pre-existing bug fix, not event code** (see *Pre-existing issues*). |

No other theme file was touched. There is no `!important` in the event CSS, no
new dependencies, and no framework.

## Added outside the theme (not uploaded to Shopify)

- `tools/preview/server.mjs`: local storefront. Renders the real theme
  with liquidjs, with a mock catalog, cart AJAX, checkout stub and Section
  Rendering API.
- `tools/tests/event-layer.test.mjs`: 37-check Playwright audit.
  `tests/theme-check.mjs`: Shopify Theme Check.
- `tools/assets/generate-halloween-placeholders.mjs`: reproducible placeholder art.
- `docs/`: this report, the guide and the screenshots.

---

## Where each seasonal module lives

| Module | Markup | Styles | Behaviour |
|---|---|---|---|
| Event controller / activation | `rizo-event-head` | — | boot (inline) and `rizo-event-layer.js` |
| Theme variables / night | — | `rizo-event-layer.css` §2–3, `event-halloween.css` | — |
| Moon | `rizo-event-hero` | §5 | `moon` module (parallax) |
| Fog | `rizo-event-hero`, `rizo-event-stage` | §6 | `fog` module (low-res canvas) |
| Ambient flyers (bats) | `rizo-event-stage` | §7 | `rizo-event-flock.js` and `event-halloween.js` |
| Countdown | `rizo-event-countdown` | §8 | `countdown` module |
| Quiet zones | — | §6 | `quiet` module |
| Interaction (scroll/tap) | — | — | `input` in `rizo-event-layer.js`, used by flock and moon |
| Asset configuration | `event-halloween.liquid` | `--rizo-event-fog-texture` | config JSON |

## How to enable / disable October mode

- **Off (normal Rizo):** Theme settings → Event layer → **Active event → Off**.
- **On, scheduled (as delivered):** Active event → Halloween, Activation →
  Scheduled. Live Oct 1 2026 00:00 ET until Nov 1 2026 06:00 ET. It switches
  on and off by itself, even on pages already open.
- **On now (manual):** Activation → **Always on**.
- **Preview before Oct 1:** the theme editor shows it automatically. In a browser tab, add `?rizo_event=on` (`?rizo_event=clear` to stop).
- **Per module:** separate switches for night treatment, moon, hero fog, page fog, bats, and countdown.

## Replacing artwork

- **Moon:** Event layer: moon → *Moon artwork* (image picker), or overwrite
  `assets/event-halloween-moon.svg`. Any aspect ratio. Keep the glow out of
  the file (it's a CSS glow with its own setting).
- **Bats:** overwrite `event-halloween-bat-1.svg`, `event-halloween-bat-1-b.svg`
  (second wing pose) and `event-halloween-bat-2.svg`, or edit `flock_sprites`
  in `snippets/event-halloween.liquid` to point at other files or add a third bat.
- **Fog:** Event layer: fog → *Fog texture*, or overwrite
  `event-halloween-fog.webp`. It must tile horizontally. Update `fog_ratio` if
  the aspect ratio changes.

Details, formats and sizes: [`EVENT-LAYER.md` §6](EVENT-LAYER.md#6-replacing-artwork).

## Controls for Astra

1. **`assets/event-halloween.css`** is the art-direction file: palette,
   backdrop glow, hero-art dim, moon glow colour and drift, the character of
   every fog layer (opacity, speed, direction, scale, height, position, blur,
   stacking), page fog, bat opacity and filter, and countdown type. Engine
   defaults and the full token list are at the top of `rizo-event-layer.css`.
2. **Theme settings → Event layer:** night intensity, motion intensity, moon
   size, position (desktop and mobile), opacity, glow, layer and motion; fog
   intensity and speed; bat count and idle activity; countdown position and copy.
3. **`TUNING` in `assets/event-halloween.js`:** flight character (speed,
   group sizes, flutter, turn rate, flap timing, bank angle, scatter force).
4. **Structure hooks:** countdown markup `.rizo-event-countdown*` (two
   placements), moon `.rizo-event-moon` / `-glow` / `-body` / `-art`, fog
   `.rizo-event-fog--hero|page.rizo-event-fog--lN`.
5. **Preview:** `cd tools && npm install && npm run preview`, then
   `http://localhost:9292/?rizo_event=on&set.event_moon_size=420` (any setting
   via `?set.<id>=`).

---

## Performance decisions

- **Off costs nothing.** No event CSS, JS or markup is emitted.
  Selected-but-outside-window costs about 6.5 KB inline plus 22 KB of cached
  CSS, and the runtime is never requested.
- **Activation before first paint** (inline boot), so there's no flash of the
  normal theme. Runtime scripts are async and ordered; nothing blocks rendering.
- **One rAF loop** for the whole layer. It sleeps when no bat flies and
  nothing scrolls (verified: 0 tasks and no frames between flights). Scroll
  handlers only flag work; velocity is sampled once per frame. Layout is read
  on mount and resize only.
- **Compositor-only motion:** fog drift, moon drift and wing flaps are CSS
  transform/opacity animations. There's no live blur by default (the fog
  texture carries its own softness).
- **Fog memory:** strips are repainted into low-resolution canvases (0.35 px
  per CSS px). On the default layout that's 0.77 megapixels total on desktop
  and 0.13 on phones, instead of about 5.2 M × DPR² for full-resolution
  layers. Hero fog is removed while the hero is off-screen, page fog stops
  animating while it's hidden, and everything pauses under open drawers.
- **Bounded DOM:** at most 16 flyer nodes (8 on phones, 5 on low-power),
  created lazily and recycled, never removed and recreated.
- **Adaptive:** phones get 2 hero fog layers and 1 page layer. Save-Data or
  weak devices get the *lite* tier. A frame-time governor steps a struggling
  device down to lite, then to still.
- **Quiet zones:** page fog thins to 30–35% and bats stay high over product
  grids, the product page and the cart.

## Tests performed

**Tooling.** The local harness renders the real theme files with liquidjs
and mocks Shopify's objects and endpoints. Playwright drives Chromium
headless (desktop 1440×900; phone 390×844 @3×, touch). Shopify Theme Check
(`@shopify/theme-check-node` 3.x) lints the theme. These tests exercise the
**theme code**. They do not exercise Shopify's servers, the real theme editor
UI, or the real checkout.

**Theme Check:** 3 offenses, all pre-existing in `sections/main-product.liquid`, and **0 new**.

**Browser audit, final run: see the results block at the end of this report.** Coverage:

| Area | Checks |
|---|---|
| Reversibility & scheduling | Off loads no event bytes or markup. Selected-but-outside-window stays inert (no runtime request, no classes, normal colours). Activates live at the start time; deactivates and cleans up at the end time. Manual override. Editor preview (and opt-out). `?rizo_event=` on/off/clear. |
| Toggles | Each module switched off individually (moon, hero fog, page fog, bats including their scripts, countdown, night), plus bat count 0%. Signal bar message only while live. |
| Countdown | Identical remaining time in New York, Los Angeles, London, Tokyo and Auckland (29d 15h 25m 04s at 2026-10-01T12:34:56Z). An offset-less target is read in New York time. Ticks each second with ≤ 4 DOM writes per tick and a fixed box (no layout shift). Ended → message, and ended → hide. Seconds off. Server pre-renders an already-past countdown. Pauses on a hidden tab and resyncs. |
| Bats & input | Clicks and taps aimed at moving bats always reach page content (`elementFromPoint` never hits the flock). The hero SHOP link works with a bat parked on it. 200 rapid taps (desktop and phone) and 40 fast scroll bursts both ways stay within limits. Bats are recycled and the loop sleeps. At most one event rAF per frame. Drawer open pauses the flock and fog; closing resumes. |
| Robustness | Governor steps down under simulated 60 ms frames. Theme-editor section reload ×8 (simulated `shopify:section:unload/load` with the Section Rendering API) leaks no timers, observers or listeners. Resize and orientation (844×390 ↔ 390×844 ↔ 320×568 ↔ 430×932; desktop narrowed to 600 px and back). 5 reloads, one engine each. Every page type loads with 0 console errors. |
| Motion & a11y | Reduced motion: night, moon, still fog and countdown stay, and bat scripts never load. "Minimal" mode. Reduced motion toggled mid-visit stops and resumes bats. Decorative layers `aria-hidden` with nothing focusable. Countdown is a labelled timer with a static sentence. Keyboard focus order identical with the event on and off. |
| Commerce with bats flying | Quick add with a variant (sold-out size disabled) and a single-variant add, drawer count, cart page with both lines, checkout submit (desktop and phone). Product page variant picker, sold-out state, add to cart, sticky bar above the fog. Menu (focus returns), search overlay, newsletter form POST. |
| Layout | Event layer adds no horizontal overflow at 320×568, 375×667, 390×844, 430×932, 844×390, 768×1024, 1024×768 and 1440×900 on home, product, collection and cart (compared with the same page event-off). |

**Visual review:** hero on/off (desktop and phone), product grid quiet
fog, ended countdown, reduced motion, alternate placement with the moon in
front, and the product page. See `screens/`.

**Not tested:** a real Shopify store (upload, theme editor UI, real section
reloads, checkout), Safari, Firefox, real phones and GPUs, VoiceOver and
TalkBack, and native iOS momentum scrolling.

## Known limitations and follow-ups

1. **Placeholder art** (moon, bats, fog) is intentionally plain and must be replaced.
2. **Performance numbers from this sandbox are not device numbers.** Headless
   Chromium here composites on the CPU. On the phone profile the event was
   within noise of Off (57.3 vs 59.5 fps while scrolling, same p95). On
   desktop, full-width animated fog costs heavily in CPU compositing (21.5 vs
   46.5 fps).
   GPUs do this in hardware, but **profile on a real mid-range Android and
   an older iPhone before launch**. The first levers are fewer hero fog
   layers (`hero_fog_layers` in the preset) and the governor thresholds.
3. **Verify on Shopify before publishing:** upload as an unpublished theme,
   open the editor (Halloween previews automatically), and walk through the
   storefront preview with `?rizo_event=on`. The harness approximates
   Shopify's Liquid; it isn't Shopify.
4. **Countdown default placement** (below the hero buttons) sits under the
   fold at 1440×900 and 320×568. *Above the hero heading* is one setting away.
   The final call is Astra's.
5. Mask-mode bat sprites (CSS-recolourable) need same-origin or CORS-enabled
   files. The default image mode has no such constraint.
6. A schedule start more than 24 h after page load only activates on the next
   page view (pages are rarely open that long). The end timer has the same
   bound.
7. `/pages/world` uses the same world-gate section, so it also gets the moon,
   fog and countdown.

## Pre-existing issues found during the audit

| Issue | Status |
|---|---|
| `rizo-theme.js` `initStickyAtc` read `[data-sticky-submit]` from a `null` sticky bar on every non-product page. The throw aborted the rest of the theme script: predictive search, live signal clocks, form feedback focus, recently viewed, impressions and the theme-editor `section:unload` cleanup never ran. | **Fixed** (one-line guard, its own commit). |
| Product page overflows horizontally by 18 px on phones (`.product-gallery-shell` full-bleed negative margins), and the collection page by 4 px at 320 px. It also offsets mobile touch coordinates. | Not changed (layout, not event scope). Flag for Astra. |
| World gate hero copy sits flush against the left edge (`.world-gate-copy { width: 100% }` overrides `.page-width`). | Not changed. Flag for Astra. |
| At 320×568 the hero's SHOP button sits under the mobile dock. | Not changed. |

---

## Final audit output (verbatim)

`node tests/event-layer.test.mjs` on the delivered code (the sandbox date was 2026-09-22; time-dependent checks use Playwright's fake clock):

```
PASS  OFF: normal Rizo loads no event CSS/JS and has no event markup
PASS  Scheduled, outside window: CSS present but inert, runtime never requested
PASS  Schedule switches the event on at its start time without a reload
PASS  Schedule switches the event off at its end time and cleans up
PASS  Manual override (Always on) ignores the schedule
PASS  Theme editor previews the event outside its window (and can opt out)
PASS  ?rizo_event=on persists across pages for the tab; ?rizo_event=clear and =off work
PASS  Each module can be switched off on its own
PASS  Signal bar shows the event message only while the event is live
PASS  Countdown targets Oct 31 12:00 AM New York regardless of visitor timezone
PASS  Countdown target without an offset is read in New York time, not the visitor's
PASS  Countdown ticks each second, rewrites only changed digits and never shifts layout
PASS  Countdown reaching zero shows the ended message (setting: message)
PASS  Countdown reaching zero hides itself (setting: hide) and seconds can be turned off
PASS  Server renders an already-past countdown in its ended state (no flash)
PASS  Countdown pauses on a hidden tab and resyncs when visible
PASS  Clicks and taps pass straight through moving bats
PASS  SHOP still shops: hero CTA works with a bat parked on top of it
PASS  Rapid tapping (200 taps) keeps the flock bounded
PASS  Aggressive scrolling both ways wakes bats but stays bounded
PASS  Bats leave and are recycled; the loop sleeps during quiet periods
PASS  Exactly one animation loop: at most one event-layer rAF request per frame
PASS  Open drawer/menu pauses the flock; closing resumes it
PASS  Frame-time governor steps a struggling device down to lite, then still
PASS  Theme editor section reloads (x8) never duplicate timers, observers or listeners
PASS  Resize and orientation changes keep limits and layout sane
PASS  Multiple reloads: one engine per page, no errors
PASS  Reduced motion: night, moon, still fog and countdown stay; bats never load
PASS  Reduced motion switched on mid-visit stops bats; switched off brings them back
PASS  Decorative layers stay out of the accessibility tree; countdown is a labelled timer
PASS  Keyboard focus order is identical with the event on and off
PASS  Quick add (variant + single-variant), cart drawer, cart page and checkout work with bats flying
PASS  Product page: variant picker, sold-out state, add to cart and sticky bar with the event live
PASS  Menu, search and newsletter form work with the event live
PASS  Every page type loads without errors with the event live
PASS  Event layer adds no horizontal overflow at 320, 375, 390, 430, landscape, tablet and desktop widths
PASS  Performance sample: frame pacing (event Off vs On) while the page scrolls; event asset weight

Notes
  - Countdown at 2026-10-01T12:34:56Z → America/New_York: 29d 15h 25m 04s | America/Los_Angeles: 29d 15h 25m 04s | Europe/London: 29d 15h 25m 04s | Asia/Tokyo: 29d 15h 25m 04s | Pacific/Auckland: 29d 15h 25m 04s
  - Countdown: 8 DOM mutations over ~4s of ticking; box stayed 390.3x69.8
  - Hidden-tab behaviour verified by simulating document.hidden + visibilitychange (headless Chromium cannot background a tab).
  - Desktop: 18 clicks aimed at moving bats; every one reached page content (H1, DIV).
  - Phone: 12 clicks aimed at moving bats; every one reached page content (DIV).
  - desktop: 200 taps → spawned 2, scattered 0, peak 2/16 active, 2 pooled elements (cap 16).
  - mobile: 200 taps → spawned 18, scattered 41, peak 6/8 active, 6 pooled elements (cap 8).
  - desktop: 40 fast scroll bursts + two full-page jumps → 7 bats woken, peak 3/10.
  - mobile: 40 fast scroll bursts + two full-page jumps → 2 bats woken, peak 2/5.
  - rAF audit: 90 event-layer requests over 90 frames while bats flew and the page scrolled.
  - Governor: with 60ms of work per frame the layer stepped down to lite + still (bat limit 2).
  - Editor reloads x8: countdown timers 1→1, heroes 1→1, event visibility listeners 2→2.
  - Countdown ARIA: - paragraph: HALLOWEEN IN / - timer "HALLOWEEN IN": Halloween begins Saturday, October 31, 2026 at 12:00 AM EDT.
  - Pre-existing overflow (same with the event Off, not caused by the event layer): /products/night-signal-hoodie at 320px: +18px; /collections/all at 320px: +4px; /products/night-signal-hoodie at 375px: +18px; /products/night-signal-hoodie at 390px: +18px; /products/night-signal-hoodie at 430px: +18px
  - desktop 1440x900 (CPU-composited headless): Off 46.5 fps (p95 66.7ms) vs On 21.5 fps (p95 83.4ms), peak bats 6, fog canvases 0.77 MP. Event assets 119.8 KB uncompressed: rizo-event-layer.css 20.0, event-halloween.css 2.5, event-halloween-moon.svg 0.7, rizo-event-layer.js 30.0, rizo-event-flock.js 12.7, event-halloween.js 9.1, event-halloween-fog.webp 42.1, event-halloween-bat-1.svg 0.9, event-halloween-bat-1-b.svg 0.9, event-halloween-bat-2.svg 0.9
  - phone 390x844@3x (CPU-composited headless): Off 59.5 fps (p95 16.8ms) vs On 57.3 fps (p95 16.8ms), peak bats 6, fog canvases 0.13 MP. Event assets 119.8 KB uncompressed: rizo-event-layer.css 20.0, event-halloween.css 2.5, event-halloween-moon.svg 0.7, rizo-event-layer.js 30.0, rizo-event-flock.js 12.7, event-halloween.js 9.1, event-halloween-fog.webp 42.1, event-halloween-bat-1.svg 0.9, event-halloween-bat-1-b.svg 0.9, event-halloween-bat-2.svg 0.9

37/37 passed
```

`node tests/theme-check.mjs`:

```
baseline ERROR ImgWidthAndHeight sections/main-product.liquid:157 Missing width and height attributes on img tag
baseline WARN RemoteAsset sections/main-product.liquid:157 Use one of the asset_url filters to serve assets for better performance.
baseline WARN UnusedAssign sections/main-product.liquid:15 The variable 'has_multiple_options' is assigned but not used

3 offense(s), 0 new since v2.3.
```
