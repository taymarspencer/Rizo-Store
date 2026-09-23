# Rizo Event Layer

A reversible seasonal layer for the Rizo Portal theme.

```
DEFAULT RIZO SITE  +  ONE ACTIVE EVENT PRESET  (Halloween 2026 is the first)
```

The normal site is never edited to "become" an event. An event is a preset
that configures a small set of shared modules (night treatment, moon, fog,
ambient flyers, countdown). With the layer off, the theme renders and loads
exactly what v2.3 did.

---

## 1. Turning it on and off

**Theme settings → Event layer**

| Setting | What it does |
|---|---|
| **Active event** | `Off — normal Rizo` or `Halloween (October mode)`. Off removes every event file from the page. Nothing is deleted. |
| **Activation** | `Scheduled` (default) only runs between Start and End. `Always on` is the manual override. |
| **Start / End** | ISO date/time. Blank = the preset's own window. Halloween: **Oct 1 2026 12:00 AM → Nov 1 2026 6:00 AM, New York time.** A value without an offset (`2026-10-31T00:00:00`) is read in the event's timezone, never the visitor's. |
| **Always preview in the theme editor** | On by default. The editor shows the event even outside its window. Customers still follow the schedule. |
| **Signal bar message during the event** | Optional. Swaps the header signal bar text only while the event is live. |

Current `settings_data.json`: **Halloween, Scheduled**. The live store shows
normal Rizo until **Oct 1 2026 00:00 ET**, switches on by itself (including
for anyone with a page already open), and switches off by itself at the end.

**Preview in a normal browser tab** (useful before Oct 1, or on the unpublished
theme's preview link):

- `?rizo_event=on`: preview the selected event for this tab (persists while you browse)
- `?rizo_event=off`: hide it for this tab
- `?rizo_event=clear`: go back to the schedule

These only work while an event is selected. With **Active event = Off** there
is nothing on the page to switch on.

**Every module has its own switch** (Event layer: moon / fog / bats /
countdown, plus Night treatment). Switching one off removes its markup, and
for bats also its scripts.

---

## 2. Files

Engine files are prefixed `rizo-event-`. Everything Halloween-specific is
prefixed `event-halloween`. Shopify's `assets/` and `snippets/` folders are
flat, so the naming convention replaces sub-folders: **`event-<preset>-<role>.<ext>`**.

| File | Role |
|---|---|
| `snippets/rizo-event-value.liquid` | **Resolver.** The one place that knows the active preset. Returns a value for a key, with theme-setting overrides applied. Every consumer uses it. |
| `snippets/rizo-event-head.liquid` | `<head>` output: event stylesheets, setting-driven CSS "dials", `#RizoEventConfig` JSON, and the inline **boot** script. Renders nothing when Off. |
| `snippets/rizo-event-stage.liquid` | Page-level fixed layers: night backdrop, low page fog, flock container. |
| `snippets/rizo-event-hero.liquid` | Hero slot: moon plus hero fog layers. Rendered inside `rizo-world-gate` and `rizo-live-hero`. |
| `snippets/rizo-event-countdown.liquid` | Countdown markup, used before the hero heading or after the hero buttons. |
| `assets/rizo-event-layer.css` | Engine styles and default tokens. Everything is inert until `html.rizo-event`. |
| `assets/rizo-event-layer.js` | Engine runtime: loop, input, state, and the modules `hero`, `quiet`, `countdown`, `fog`, `moon`. |
| `assets/rizo-event-flock.js` | Generic ambient-flyer module: pool, limits, scheduling, recycling. |
| `snippets/event-halloween.liquid` | **Halloween preset**: name, window, copy, modules, asset names. |
| `assets/event-halloween.css` | Halloween art-direction tokens. **Astra's main file.** |
| `assets/event-halloween.js` | Halloween-only behaviour: how bats fly. |
| `assets/event-halloween-*.svg/webp` | Replaceable artwork (moon, bats, fog). **Temporary placeholders.** |

Integration points in existing theme files (the whole footprint):

- `layout/theme.liquid`: `{% render 'rizo-event-head' %}` in `<head>`, `{% render 'rizo-event-stage' %}` after `<body>`.
- `sections/rizo-world-gate.liquid`, `sections/rizo-live-hero.liquid`: `{% render 'rizo-event-hero' %}` plus two countdown slots.
- `sections/rizo-header.liquid`: the signal bar can show the event message.
- `config/settings_schema.json`: five "Event layer" groups. `config/settings_data.json`: Halloween, scheduled.

---

## 3. How a page activates

1. **Liquid.** If Active event is Off, nothing is emitted. Otherwise the head
   snippet emits the event CSS, the dials, the config JSON and the boot script.
2. **Boot (inline, before first paint).** It reads the config and decides:
   manual / schedule / editor preview / `?rizo_event=`. Only if the event is live
   does it add `html.rizo-event rizo-event--halloween rizo-october
   rizo-event--night` and inject the runtime scripts (async, ordered). If the
   start time is less than 24 h away it sets a timer and activates in place
   when it passes. There is no flash of the normal theme, because classes land
   before paint.
3. **Engine.** It waits for DOM ready, mounts modules, and handles
   `shopify:section:load/unload`. It sets an end-of-window timer and
   deactivates in place (0.8 s fade, then full cleanup) when the window closes.
4. **Flock + behaviour** scripts register themselves; the flock waits for its
   behaviour (`bats`) if it arrives later.

**Why the schedule runs in the browser:** Shopify caches storefront HTML, so
Liquid's `now` cannot switch an event on or off at an exact minute. The only
server-side time check is cosmetic: a countdown already past its target
renders directly in its ended state.

---

## 4. Modules

| Module | Where | Behaviour |
|---|---|---|
| **Night** | CSS | Shifts the theme's own `--ink`/`--paper` toward the event palette by *Night intensity* (via `color-mix`), paints the few literal-`#090909` surfaces with `--ink`, dims hero **texture** art (camo), and adds a backdrop glow *behind* content. Product photography is never filtered. |
| **Moon** | `rizo-event-hero` + CSS + `moon` module | Positioned by % of the hero (desktop and mobile separately), sized in px (clamped to the viewport), with opacity, glow and layer (behind or in front of hero art). Drift is a CSS animation. Scroll parallax is set by the runtime only while scrolling. Pointer parallax comes free from the world gate's existing `--world-*` variables. *Moon drift and parallax* off keeps it perfectly still. |
| **Fog** | hero slot, stage, CSS, `fog` module | Up to 4 hero layers and 3 page layers, each with its own opacity, duration, direction, scale, vertical position, height, optional filter and z-index token. Each layer is a clipped band holding a strip two tiles wide that slides exactly one tile (seamless, compositor-only). The runtime paints each strip into a **low-resolution canvas** (0.35 px per CSS px, whatever the screen density): about 8× less layer memory on 1× screens, 33× on 2× and 73× on 3× phones. Hero fog is dropped entirely while the hero is far off-screen. The page band waits until the hero scrolls away and thins over quiet zones. |
| **Flock** | `rizo-event-flock.js` + behaviour | Bounded pool: 16 on desktop, 8 on phones, 5 on low-power devices, times *Bat count*. Idle flights with quiet periods, fast-scroll wakes, taps that scatter nearby bats, and taps in open space that flush one or two out. The layer is `pointer-events: none`, and input is observed passively in the capture phase and never prevented. Bats are recycled off-screen. Nothing runs when no bat is flying. Frozen under drawers and menus. |
| **Countdown** | `rizo-event-countdown` + `countdown` module | Absolute target (timezone-aware). Ticks on second boundaries (minute boundaries without seconds), rewrites only digits that changed, and every number box has a fixed width, so layout never shifts. It pauses with the tab and resyncs. At zero it shows the ended message or hides, and dispatches `rizo-event:countdown-expired`. Screen readers get one static sentence ("Halloween begins Saturday, October 31, 2026 at 12:00 AM EDT."), never per-second announcements. |
| **Quiet zones** | `quiet` module | `.product-grid, .product-page-shell, .cart-page, .recently-viewed, [data-rizo-event-quiet]`. While one crosses the middle of the screen, page fog drops to 30–35% and bats keep to the top band and fly in smaller groups. Add `data-rizo-event-quiet` to any section to protect it. |
| **Governor** | engine | Measures frame time (a short probe after load, then whenever the loop runs). Sustained frames slower than about 30 fps step down to the **lite** tier (one fog layer, 5-bat cap), then to **still** (fog and moon drift freeze, bat cap halves). It only ever steps down. |

**Reduced motion** (`prefers-reduced-motion: reduce`): the flock scripts are
never loaded, fog and moon are still, and night treatment and countdown stay.
*Visitors who prefer reduced motion → Night treatment and countdown only*
removes moon and fog too. It reacts live if the preference changes. The
theme's **Calm** motion level halves event motion. *Motion intensity 0%*
freezes everything and removes bats.

---

## 5. Tuning: tokens vs settings

Three kinds of custom properties, so a designer never has to hunt:

- **Art direction.** Defaults live in `rizo-event-layer.css`. Each event
  overrides them in `assets/event-<id>.css` under
  `html.rizo-event.rizo-event--<id>`.
- **Dials.** Written from theme settings by `rizo-event-head.liquid` (size,
  position, opacity, intensity, speed).
- **Runtime.** Set by JS (`--rizo-event-moon-parallax`, `--rizo-flyer-*`). Don't set these.

### Art-direction tokens (edit in `assets/event-halloween.css`)

| Token | Purpose |
|---|---|
| `--rizo-event-bg`, `--rizo-event-paper` | Night targets for the theme's ink and paper (mixed in by *Night intensity*) |
| `--rizo-event-surface`, `--rizo-event-text`, `--rizo-event-accent` | Event surface, text and accent (the accent defaults to Rizo blue) |
| `--rizo-event-glow-rgb`, `--rizo-event-atmosphere-opacity` | Backdrop glow colour and strength |
| `--rizo-event-overlay-opacity` | How far night dims hero texture art |
| `--rizo-event-moon-glow-rgb`, `--rizo-event-moon-drift`, `--rizo-event-moon-z`, `--rizo-event-moon-z-front` | Moon glow colour, drift period and stacking |
| `--rizo-event-fog-N-{opacity,duration,direction,scale,bottom,height,filter,z}` | Hero fog layers 1–4 |
| `--rizo-event-page-fog-{height,opacity,quiet,z}`, `--rizo-event-page-fog-N-*` | Page fog band and layers 1–3 |
| `--rizo-event-flyer-opacity`, `--rizo-event-flyer-filter`, `--rizo-event-flyer-color`, `--rizo-event-flock-z` | Bats (`color` only applies to mask-mode sprites) |
| `--rizo-event-countdown-digit-font`, `--rizo-event-countdown-label-color` | Countdown type |

Hero stacking reference (world gate): camo −4, grid −3, **moon −2** (or 2
"in front"), **fog layers −1 / 2**, logo marks 1, copy 3, scan line 5.

### Dials (theme settings)

Night intensity, Motion intensity, Moon (image, desktop and mobile size and
position, opacity, glow, layer, motion), Fog (texture, intensity, speed, hero
and page on/off), Bats (count, idle activity, scroll, tap), Countdown (position,
target, label, seconds, ended behaviour, ended message).

Per-layer fog character (direction, scale, position) is deliberately **not** a
setting. It's art direction, tuned once in the preset CSS.

---

## 6. Replacing artwork

Keep the file names and upload over the placeholders (**Edit code →
Assets**), or use the settings where one exists.

| Art | File(s) | Setting override | Guidance |
|---|---|---|---|
| **Moon** | `event-halloween-moon.svg` | Event layer: moon → **Moon artwork** | Transparent PNG, WebP or SVG, any aspect ratio (height follows the image). About 1000–1600 px wide is plenty. The glow is CSS, so don't bake a big glow into the file. |
| **Bats** | `event-halloween-bat-1.svg`, `event-halloween-bat-1-b.svg` (second pose), `event-halloween-bat-2.svg` | none; list in `snippets/event-halloween.liquid` → `flock_sprites` | 1–3 silhouettes, about 200×100 viewBox. `ratio` = width ÷ height. A sprite with `pose2` alternates two poses. Without it, one silhouette gets a squash "flap". To add a third bat, add an entry to `flock_sprites`. For CSS-recolourable silhouettes add `"mode":"mask"` (colour = `--rizo-event-flyer-color`). Masks are fetched with CORS, so the asset must be same-origin; Shopify's `/cdn/shop/...` asset URLs are. |
| **Fog** | `event-halloween-fog.webp` | Event layer: fog → **Fog texture** | Soft, **horizontally tileable** (left edge continues the right), transparent, pale colour, about 4:1–6:1 (placeholder 1280×224, 43 KB). If the aspect changes, update `fog_ratio` in the preset. Keep it small: the runtime draws it at about 1/3 resolution anyway. |

`tools/assets/generate-halloween-placeholders.mjs` shows exactly how the placeholders were made.

---

## 7. Adding a future event (Christmas, New Year, Pittsburgh, a drop…)

1. Create `snippets/event-<id>.liquid` modelled on `event-halloween.liquid`.
   Pick only the `modules` it needs (for example Pittsburgh `night`, a drop
   `night,countdown`).
2. In `snippets/rizo-event-value.liquid` add one line:
   `{%- when '<id>' -%}{%- render 'event-<id>', key: ev_lookup -%}`.
3. Add `{"value":"<id>","label":"…"}` to **Active event** in `config/settings_schema.json`.
4. Add `assets/event-<id>.css` (tokens under `html.rizo-event.rizo-event--<id>`) and any `assets/event-<id>-*` art.
5. Only if it has genuinely new motion: `assets/event-<id>.js` calling
   `RizoEventLayer.defineBehavior('<name>', {...})` (for example snow: fall and
   sway, no scatter) and point `flock_behavior` / `behavior_script` at it.
   Pool, limits, input safety, reduced motion and cleanup come from the flock
   module for free.

No engine, snippet or section changes are needed. Only one event is active at a time.

### Retiring Halloween

- **Pause:** Active event → Off (or leave it scheduled; it ends itself on Nov 1).
- **Remove for good:** delete `snippets/event-halloween.liquid`,
  `assets/event-halloween*`, its `when` line in `rizo-event-value.liquid`, and its
  option in `settings_schema.json`. The engine stays for the next event.

---

## 8. Performance budget

- **Off:** zero event bytes, zero event markup, zero JS.
- **Selected but outside the window:** about 6.5 KB inline (dials, config and boot) plus
  `rizo-event-layer.css` and the preset CSS (about 22 KB uncompressed, cached).
  The runtime is **not** requested.
- **Live (Halloween):** about 120 KB uncompressed in total (JS 51 KB, CSS 22 KB,
  fog 43 KB, SVGs about 4 KB). Scripts are async and never block rendering.
  Flock scripts are skipped for reduced motion.
- One `requestAnimationFrame` loop for the whole layer. It **sleeps** when no
  bat is flying and nothing is scrolling. Scroll handlers only set a flag;
  velocity is measured once per frame. Layout is read only on mount and resize.
- Fog, moon drift and flaps are CSS transform/opacity animations with no live
  blur by default. Fog strips are low-resolution canvases. Hero fog is dropped
  off-screen. Page fog stops when hidden. Everything pauses under drawers.
- The DOM is bounded: at most 16 flyer elements (8 on phones), created lazily
  and reused, never removed and re-added.

## 9. Accessibility

Every layer is `aria-hidden`, `pointer-events: none`, and has no focusable
elements; the keyboard focus order is identical with the event on or off. The
countdown is a labelled `role="timer"` with a static sentence; digits are
`aria-hidden`. Measured contrast of theme text (`--paper`) on night surfaces (`--ink`): 15.2:1 at the default 60% night intensity, 13.8:1 at 100% (v2.3: 17.5:1). Rizo blue on night: 9.2:1. Reduced
motion is respected (section 4).

## 10. QA tools (not part of the theme upload)

```
cd tools && npm install
npm run preview      # local storefront at http://localhost:9292 (mock catalog, cart, checkout)
npm test             # 37-check browser audit (Playwright, starts its own server)
npm run check        # Shopify Theme Check
```

Preview helpers: `?rizo_event=on`, `?set.<setting_id>=<value>` (any theme
setting, for example `?set.event_moon_size=420`), `?design_mode=1`,
`?sections=rizo-live-hero,rizo-live-products`, `?rizo_event_seed=7`
(reproducible flights), `?rizo_event_governor=off`.

In any browser console: `RizoEventLayer.stats()` (live counters) and
`RizoEventLayer.deactivate()`.
