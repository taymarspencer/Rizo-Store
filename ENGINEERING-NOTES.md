# Engineering notes

This pass didn't change the design. It gives the next visual pass room to
work: art can be placed in any major section from the theme editor, phones
get their own artwork and placement, and the Event Layer has more controls.
Everything runs on one animation frame and survives editor reloads.

## 1. Systems added

| System | What it does |
|---|---|
| **Art layers** | An *Art* block in 16 sections: upload an image, place it by percentage, turn, fade, blend, layer it behind or in front of the content, give phones their own image and placement, pick a movement. |
| **Phone versions of photos** | Story, Photographs and Objects take a separate phone image. Crops follow each image's focal point from Shopify admin, and a phone image can have its own. Objects get a width for phones. |
| **Moon placement by hand** | Hero and Page title can place the moon for their page, separately on phones. With no event on, the Rizo mark moves instead. |
| **Event Layer controls** | *On phones* (same / lighter / sky only), colour overrides (sky, fog, moonlight), the bat sprite now comes from the preset, a `rizo-event:start` DOM event. |
| **One frame for the theme** | `window.RizoFrame` (inline in the layout) batches every `requestAnimationFrame`: Event Layer, art layers, header, camo lens. The audit test counts exactly one real request per frame. |
| **Shared low-power flag** | `html[data-low-power]` is decided once in the head (Save-Data, ≤2 GB RAM, ≤2 cores). The Event Layer starts at its lite tier and art skips scroll- and pointer-driven movement. It used to be two different rules: rizo.js flagged every 4-core device. |
| **Fallbacks** | `vh` before `lvh`/`svh` (older Safari lost the whole sky), `overflow: hidden` before `clip`, a CSS failsafe for art waiting to appear, touch devices get the product zoom button (it was an invisible tap target), hover-only transforms no longer stick after a tap. |

## 2. Important files

| File | Change |
|---|---|
| `snippets/rizo-art.liquid` | **New.** Renders a section's Art blocks. |
| `assets/rizo-art.js` | **New.** Depth, shy, settle, wobble and spin; off-screen pausing; editor lifecycle. ~13 KB, deferred. |
| `assets/rizo.css` | §19 Art layers, focal points, Objects on phones, Safari fallbacks, touch fixes. |
| `snippets/rizo-image.liquid` | `mobile_image`, focal points; fixed the uploaded image's alt text never being used as a fallback. |
| `snippets/rizo-moon-place.liquid` | **New.** Per-page moon override. |
| `layout/theme.liquid` | `RizoFrame`, low-power flag, loads `rizo-art.js`. |
| `snippets/rizo-event-head.liquid` | Flyer sheet from the preset, colour overrides, *On phones*. |
| `assets/rizo-event-layer.js`, `rizo-event-flock.js` | Loop on the shared frame, shared low-power flag, phone scaling, `rizo-event:start`. |
| `sections/*` (16) | Art block schema (generated), `render 'rizo-art'`; block loops filter by type. |
| `tools/schema/art-block.json`, `sync-art.mjs` | The one definition of the Art block and the script that writes it into each section. |
| `tools/preview/server.mjs`, `fixtures/` | Test compositions (`?fixture=art`, `?fixture=phone`), real image sizes, colours, focal points. |

## 3. New theme editor controls

- **Art block** (Hero, Page title, Story, Photographs, Objects, Open sky,
  Text, Products, Email sign-up, Release countdown, Where we'll be, Footer,
  Product, Collection, Page, 404): Artwork, Phone version, Across, Down,
  Size, Turn, Opacity, Layer, Blend, Show on, Across/Down/Size on phones,
  Movement, How much, When, Name for custom CSS.
- **Story**: Photo on phones. **Photographs → Photo**: Photo on phones.
  **Objects → Object**: Image on phones, Width on phones.
- **Hero / Page title → Moon on this page**: Place the moon by hand, Across,
  Down, Size, and the same three for phones.
- **Theme settings → Event layer**: On phones; Colour (Night sky, Fog,
  Moonlight glow; blank uses the event's own colours).

## 4. How art layers work

Each Art block becomes a `.art-piece` inside a `.art` box that covers the
section. It's the first child of the section, so:

- **Behind the content** (`z-index: 0`) paints over the section's own
  background and under its content. Everything after `.art` is made
  `position: relative` (via `:where`, so any existing rule still wins).
- **In front** (`z-index: 6`) paints over the content and can hang into the
  next section. It stays under the sticky buy bar, dock, header, drawers
  and the event's front fog.
- The box clips sideways and not vertically: a piece can bleed off the edge
  of the screen without the page scrolling sideways, and *Down* below 0% or
  above 100% hangs it over the neighbouring section.

Position is the piece's centre, as a percentage of the section; *Size* is a
percentage of the section's width. Later blocks sit on top of earlier ones.
Placement is on `.art-piece`, movement on `.art-move`, the turn on the
image, so they never fight over one `transform`.

Pieces never take a click, focus or a screen reader's attention
(`pointer-events: none`, `aria-hidden`). Touch reactions are hit-tested from
one passive document listener, so a tap on a button under a piece still
presses the button (tested on the hero's Shop button).

Loading: lazy, except in the first section of the template, where
desktop pieces load eagerly. `srcset`/`sizes` follow the piece's size, so a
10% sticker doesn't download a full-width image.

**Adding art to another section:** add its name to `SECTIONS` in
`tools/schema/sync-art.mjs`, run `npm run sync:art`, and put
`{% render 'rizo-art', section: section %}` as the first child of the
section's positioned element. `npm run check` fails if a section's copy of
the block drifts from `art-block.json`. Never edit the block in a section
by hand.

## 5. Phones

The breakpoint is 749px everywhere (same as the layout).

- **Art:** *Phone version* swaps the image through `<picture>` (it can be a
  different crop or a different piece). *Across / Down / Size on phones*
  are independent of desktop. *Show on* makes a piece desktop-only or
  phones-only (hidden pieces are lazy, so they're never downloaded). Two
  *Layer* options flip behind/in front between devices. Pieces on phones
  can be bigger than the screen (up to 140%) and bleed off it.
- **Photos:** Story, Photographs and Objects take a phone image; crops use
  the focal point set on each image in Shopify admin (`--focal`,
  `--focal-m`). Objects has *Width on phones*.
- **Moon:** placed separately on phones.
- **Event:** *On phones → Lighter* halves the bats and thins the fog; *Sky,
  moon and countdown only* never loads the bat scripts or draws fog.
- **Touch:** wobble and shy answer a finger (shy eases away from where it
  landed, then drifts back); spin needs a tap. Hover-only effects are
  limited to devices that can hover.

## 6. Event Layer configuration

Unchanged in shape (see `docs/EVENT-LAYER.md`): one preset snippet per
event (`snippets/event-<id>.liquid`) answers keys; `rizo-event-value`
applies theme-setting overrides; the head boot decides activation before
first paint and loads the runtime only while live. This pass:

- Presets now also answer `flyer_sheet` (the bat the roost flies in on).
  It used to be hard-coded to the Halloween bat.
- Colour settings override the preset's tokens without touching CSS.
- `config.phone` is read by the boot (quiet phones skip fog and bats) and
  by the fog and flock (lighter).
- Art can be tied to the event with *When*: only while an event is on, or
  only when none is. The event ending live (schedule end) hides/shows those
  pieces immediately.
- Hooks for event-aware code: `html.rizo-event`, `html.rizo-event--<id>`,
  `html[data-rizo-event]`, and `rizo-event:start` / `rizo-event:end` on
  `document`.

## 7. Adding creative interactions (for Astra)

In order of effort:

1. **No code:** place art and choose a *Movement* (float, sway, depth,
   settle, shy, wobble, spin) and *How much*.
2. **CSS only:** name the piece (*Name for custom CSS*), then in the
   section's *Custom CSS* in the editor:
   `[data-art="hero-face"] img { filter: drop-shadow(0 0 12px #20bdf2); }`.
   Other hooks: `html.rizo-event--halloween`, `html[data-motion='calm']`,
   `html[data-low-power]`, `.art-piece.is-in` (has appeared),
   `.art-piece.is-off` (off-screen).
3. **A little script:** every piece reports to `document`:
   ```js
   document.addEventListener('rizo:art', ({ detail }) => {
     // detail.kind: 'touch' | 'enter' | 'appear'; detail.name: the piece's name
     if (detail.name === 'hero-face' && detail.kind === 'touch') { /* … */ }
   });
   ```
4. **A new movement for the Art block:** add the option in
   `tools/schema/art-block.json` and run `npm run sync:art`. Then either add
   CSS keyed on `.art-piece[data-motion='new'] .art-move` (preferred: it runs
   on the compositor) or handle it in `assets/rizo-art.js`: `tick()` for
   anything continuous, `react()` for a one-shot on touch.
5. **Anything per-frame:** use `RizoFrame.request(fn)`, never your own
   `requestAnimationFrame` loop. Stop requesting when nothing moves. Check
   `matchMedia('(prefers-reduced-motion: reduce)')` and `html[data-low-power]`.
6. **Event motion:** `RizoEventLayer.define(name, factory)` for a module,
   `RizoEventLayer.defineBehavior(name, …)` for how flyers move (see
   `assets/event-halloween.js`).

Rules the tests hold you to: one frame per frame for the whole theme, no
page overflow on phones, nothing decorative takes a tap, editor reloads
don't leak, reduced motion means still.

## 8. Known limitations

- **Blend modes** blend with the section and the page's content, not with
  the sky, moon or fog (those sit in a separate layer behind the page).
- **Front art** can hang over the next section, but not over the footer,
  header, sticky buy bar or drawers.
- **Safari before 16** clips art vertically at the section edge
  (`overflow: clip` fallback). Movement needs Safari 14.1+ (individual
  transform properties); older browsers show art still.
- ***When: during an event*** means any live event, not a particular one.
- **Art is decorative only:** no links, no alt text.
- **Tablets** (750px and up) use desktop placement.
- ***On phones*** is decided on page load; resizing across the breakpoint
  doesn't switch it mid-visit.
- The Art block's settings are duplicated in 16 sections because Shopify
  requires it; the sync script and `npm run check` keep them identical.
  Theme blocks (the `blocks/` folder) would remove this, but sections can't
  mix theme blocks with their own blocks (Photographs, Objects, Product),
  so it would mean reworking working sections.
- **Focal points:** if Shopify's `image_tag` writes its own inline
  `object-position`, the phone focal point still wins (`!important` under
  750px). Worth confirming on the live store.
- Everything was verified in headless Chromium against the local Liquid
  preview (`tools/`): 39 Event Layer checks, the design suite and Theme
  Check. The theme editor's own UI (block settings panels, live updates)
  and a real iPhone still need a look.
