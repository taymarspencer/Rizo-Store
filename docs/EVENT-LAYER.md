# Rizo Event Layer

A reversible seasonal change to the world around the store. Halloween 2026
is the first event; the architecture is built for the next ones (Christmas,
New Year, Pittsburgh moments, a drop).

```
NORMAL RIZO (design system + sky)  +  ONE EVENT PRESET  →  what visitors see
```

With the layer Off, nothing seasonal is requested or rendered: normal Rizo is
the design system in `assets/rizo.css` under a plain night sky, with the Rizo
mark where the moon would be.

---

## 1. Turning it on and off

**Theme settings → Event layer**

| Setting | What it does |
|---|---|
| **Active event** | `Off — normal Rizo` or `Halloween`. Off removes every event file from the page. Nothing is deleted. |
| **Activation** | `Scheduled` (default) runs between Start and End. `Always on` is the manual override. |
| **Start / End** | ISO date/time. Blank = the preset's own window. Halloween: **Sep 23 2026 12:00 AM → Nov 1 2026 6:00 AM, New York time.** A value without an offset is read in the event's timezone, never the visitor's. |
| **Always preview in the theme editor** | The editor shows the event even outside its window. Customers still follow the schedule. |
| **Announcement during the event** | A line above the header, only while the event is live. |
| **On phones** | *Same as desktop*; *Lighter* (half the bats, 60% of the fog); *Sky, moon and countdown only* (bat scripts are never requested, no fog). |
| **Colour** | Night sky, Fog, Moonlight glow. Blank uses the preset's colours (`assets/event-<id>.css`). |

Preview in a normal tab: `?rizo_event=on` (persists for the tab), `?rizo_event=off`,
`?rizo_event=clear` (back to the schedule).

Every module has its own switch (night sky, moon, fog, bats, countdown).
Fog density 0% or bat count 0% remove those modules too.

**Moon on one page:** the Hero and Page title sections have *Moon on this
page → Place the moon by hand* (desktop and phones separately). It
overrides the route position below for that page only.

**Art for the event:** any Art block (see `ENGINEERING-NOTES.md`) can be set
to *When: only while a seasonal event is on* or *only when no event is on*.

---

## 2. How it sits in the page

```
<body>
  .sky                      fixed, behind everything (snippets/rizo-sky.liquid)
    .sky-tone               night gradient; route tokens decide where it glows
    .rizo-event-stage--back moon → far fog canvas → bats that fly behind the page
  header, main (sections), footer
    each section: data-surface = open | solid | raised | paper
                  data-fog     = 0 … 1, data-fog-bias = ground | even | ceiling
  .rizo-event-stage--front  fixed above sections, below sticky buy bar, dock,
                            header and drawers: near fog, bats that cross in front
```

- **Open** sections are transparent: the sky, moon, fog and back bats show
  through. **Solid** ones cover it. So the atmosphere appears *between* parts
  of the page instead of on top of the store.
- Sections without `data-fog` are clear. Product grids, the product page and
  the cart are clear (and marked `data-rizo-event-quiet`, where bats keep to
  the top band and the front fog is suppressed).
- Fog collects low in open sections (`ground`) and spills a little over the
  top edge of whatever solid surface comes next.

---

## 3. Modules

| Module | File | Behaviour |
|---|---|---|
| **Night** | CSS | Deepens the sky and lets the moon light a little of it. Product photos are never filtered. |
| **Moon** | stage snippet + `moon` module | Lives in the sky, so it stays put while the page scrolls over it and follows the visitor between pages (`view-transition-name: rizo-moon`, cross-document view transitions). **Phase:** tonight's real phase is masked out of the artwork with a soft terminator and earthshine (setting: *Always full* turns this off). **Set:** scrolling toward the footer lowers it toward the ground fog, where it grows slightly and warms. **Drift:** over a long visit it crosses the sky slowly (≈6% of the width in 40 minutes), carried across pages. **Touch:** tapping it gives it weight and whatever was behind it leaves (`moon-tap`). Where it hangs on each route is CSS art direction (`assets/rizo.css → Sky positions`). |
| **Fog** | `fog` module | Two low-resolution canvases (≈1/5 of the screen) painted from tileable noise generated once per visit: a dim cloud layer behind the page (darker than the moon, so it veils it) and mist in front of open sections. Each layer drifts at its own speed and moves with scroll at its own depth; density follows the sections on screen. The pointer or a finger parts it; it closes again. **Pittsburgh's clock** (setting): thicker around dawn when the rivers fog over, thinnest mid-afternoon. Painted every other frame; stops under drawers and on hidden tabs. |
| **Flock** | `rizo-event-flock.js` + behaviour | Bounded pool (10 desktop, 6 phones, 4 low-power × *How many at once*). Two depths: *back* bats disappear behind solid sections, *front* bats cross over the page; a bat can change depth mid-flight. Sprite sheets, not squashed images: the wing beat steps through drawn frames. Long quiet stretches (roughly 20–75 s at the default activity), fast-scroll wakes, taps that scatter nearby bats and flush one out of open space, and the moon tap. Never intercepts a click. |
| **Roost** | `event-halloween.js` (`halloween-roost`) | One bat hangs under an edge: the solid header (once scrolled), the bottom of a solid section with open sky below, or anything marked `data-roost` (the full stop of the homepage headline). Ambient (looks around, stretches, sways) → notices a pointer within ~170 px → drops and flies off inside ~70 px, on a nearby tap or a fast scroll → comes back 26–60 s later, preferably somewhere else. |
| **Countdown** | countdown snippet + module | Absolute target (timezone-aware), minute or second ticks, fixed-width digits, pauses with the tab. At zero it shows the ended line (*Tonight.*) or hides. Screen readers get one static sentence. |
| **Quiet zones** | `quiet` module | `[data-rizo-event-quiet], .pdp, .cart-page`. |
| **Governor** | engine | Sustained frames slower than ~30 fps step down to **lite** (one fog layer per stage, fewer bats), then **still** (fog and moon stop moving, bat cap halves). Only ever steps down. |

**Reduced motion:** bats and the roost never load; the moon stays put (no set,
no drift) and the fog is painted still, updating only as the page scrolls.
*Visitors who prefer reduced motion → Night sky and countdown only* removes the
moon and fog too. The theme's **Calm** motion setting halves event motion.

---

## 4. Tuning

Art direction lives in `assets/event-<id>.css` as custom properties on
`html.rizo-event.rizo-event--<id>`:

| Token | Purpose |
|---|---|
| `--rizo-event-sky-top`, `--rizo-event-sky-low` | Night sky gradient |
| `--rizo-event-halo-rgb` | Light around the moon |
| `--rizo-event-fog-rgb`, `--rizo-event-fog-back-rgb` | Mist in front / cloud behind |
| `--rizo-event-fog-front`, `--rizo-event-fog-back` | Share of the fog field on each stage |
| `--rizo-event-moon-warm` | CSS filter for the moon near the horizon |
| `--rizo-event-flyer-opacity`, `--rizo-event-front-z` | Bats; stacking of the front stage |

Where the moon hangs: `--moon-x`, `--moon-y`, `--moon-size` per route in
`assets/rizo.css` (§6 Sky positions). Pages made in Shopify admin vary
automatically with the page id (`--seed`). A section can override it for its
page (`snippets/rizo-moon-place.liquid`).

The three colour settings write `--rizo-event-sky-top/-low`,
`--rizo-event-fog-rgb` (and a darker `-fog-back-rgb`) and
`--rizo-event-halo-rgb` after the preset's stylesheet.

Per-section fog: every section has a **Fog** setting in the editor
(`data-fog`), and *Open sky* has **Where fog collects** (`data-fog-bias`).

---

## 5. Artwork

| Art | File | Notes |
|---|---|---|
| Moon | `event-halloween-moon.webp` (or *Moon artwork* setting) | Square, transparent, disc filling the frame (centre 488, radius 487 of 1000 — the phase mask assumes this). No baked glow. |
| Bats | `event-halloween-bat-a.svg`, `-bat-b.svg` | Flight sheets: 4 frames of 120×84 side by side (wings up → level → down → level). Listed in `snippets/event-halloween.liquid → flock_sprites` with `"frames"` and `"ratio"`; `flyer_sheet` names the one the roosting bat arrives on. |
| Roost | `event-halloween-bat-roost.svg` | 3 frames of 64×96: wrapped (the folded wing edges cross into an X), looking, stretching. Hangs from its top edge. |

The bats were drawn from one skeleton (shoulder, elbow, wrist, three finger
tips, leg) rotated through the wing beat with slight three-quarter
perspective, so the four frames are anatomically consistent and neither wing
is a mirror of the other. A thin moonlit edge sits on the leading edge only.

---

## 6. Adding a future event

1. `snippets/event-<id>.liquid` modelled on `event-halloween.liquid`, listing
   only the `modules` it needs (a drop might be `night,countdown`; a
   Pittsburgh night `night,fog`).
2. One `when` line in `snippets/rizo-event-value.liquid`.
3. One option under **Active event** in `config/settings_schema.json`.
4. `assets/event-<id>.css` with tokens, and any `assets/event-<id>-*` art.
5. Only for genuinely new motion: `assets/event-<id>.js` calling
   `RizoEventLayer.defineBehavior(name, {...})` (snow: fall and sway, no
   scatter) or `RizoEventLayer.define(name, factory)` for a module.

Pool, limits, input safety, reduced motion, quiet zones, the sky, the fog
field and cleanup come from the engine. Code outside the layer can listen
for `rizo-event:start` and `rizo-event:end` on `document`.

---

## 7. Performance

- **Off:** zero event bytes, markup or script.
- **Selected, outside the window:** ~7 KB inline boot/config plus the two
  event stylesheets (~11 KB). The runtime is never requested.
- **Live:** ~384 KB uncompressed, of which the moon is 281 KB (cached across
  pages). Scripts are async.
- One frame task on the theme's shared frame (`window.RizoFrame`, inline in
  `layout/theme.liquid`), which the art layers and header also use: the
  whole theme makes one `requestAnimationFrame` request per frame (tested).
  It sleeps when nothing moves (no bats, fog still or off, no scroll).
- Weak devices (`html[data-low-power]`: Save-Data, ≤2 GB, ≤2 cores; decided
  once in the head) start at the lite tier. Fog repaints every other frame at ~1/5
  resolution: about 0.1 megapixels of canvas on a 1440×900 screen.
- Headless Chromium (CPU compositing, no GPU), scrolling the homepage:
  desktop 60.5 fps off / 57.8 fps on; phone 60.5 / 60.3. The previous build
  measured 51.8 / 20.5 on desktop in the same harness. Real devices composite
  on the GPU; check a physical iPhone before launch.

## 8. Accessibility

Every layer is `aria-hidden`, `pointer-events: none` and unfocusable; focus
order is identical with the event on or off (tested). The countdown is a
labelled `role="timer"` with a static sentence; digits are hidden from screen
readers. Reduced motion is honoured live.

## 9. QA

```
cd tools && npm ci
npm run preview:catalog   # http://localhost:9292/?rizo_event=on (real catalog snapshot)
npm test                  # 39 event-layer checks
npm run test:design       # hero at 8 sizes, every route, drawing, roost, moon, art layers, phone images
npm run check             # Art block in sync + Shopify Theme Check (0 offenses)
```

Preview helpers: `?set.<setting>=<value>`, `?section.<type>.<setting>=<value>`,
`?design_mode=1`, `?rizo_event_seed=7` (reproducible flights),
`?rizo_event_governor=off`. Console: `RizoEventLayer.stats()`.
