# Changelog

## 2026-09 · Engineering pass: art, phones, events

No visual redesign. Details in `ENGINEERING-NOTES.md`.

- **Art layers:** an *Art* block in 16 sections. Upload, place, turn, fade,
  blend, put behind or in front of the content; separate image, placement
  and visibility on phones; float, sway, depth, settle, shy, wobble, spin;
  show only during (or outside) an event. Never takes a tap, never widens
  the page.
- **Phones:** separate images and focal-point crops for Story,
  Photographs and Objects; Objects width on phones; the moon placed by hand
  per page, separately on phones.
- **Event Layer:** *On phones* (lighter, or sky only), colour overrides,
  the bat sprite from the preset instead of hard-coded, `rizo-event:start`.
- **Stability:** one `requestAnimationFrame` per frame for the whole
  theme, one low-power rule (rizo.js used to flag every 4-core device), an
  editor lifecycle for art, older-Safari fallbacks (the sky disappeared
  before Safari 15.4), the product zoom button visible on touch (it was an
  invisible tap target), hover effects that no longer stick after a tap,
  the uploaded image's own alt text now used as a fallback, dead code removed.
- **Tests:** 39 Event Layer checks, art/phone/moon checks in the design
  suite, and `npm run check` fails if a section's Art block drifts.

## 2026-09 · Creative overhaul

Rizo is now one design system under one living night sky. Every page,
including pages that don't exist yet, is built from the same surfaces, type
voices and sections, and the sky behind them carries the season. Commerce
behaves as before: same Shopify forms, cart endpoints, variant logic and
analytics events.

### Substantially redesigned

- **The whole visual system.** `rizo.css` replaces `rizo-theme.css` and
  `rizo-design.css` (two competing systems, ~190 KB) with one stylesheet
  (~73 KB): tokens, five type voices, four surfaces, components and routes.
- **Typography.** Everything used to be condensed capitals. Now Bebas Neue
  is kept for the sign voice (the name, numbers, a few titles) and
  Bricolage Grotesque, a variable grotesque with width and weight, carries
  headlines in sentence case, reading text, labels and notes. Both are
  self-hosted WOFF2 and preloaded; the 60 KB TTF is gone.
- **The sky.** A fixed layer behind the page instead of decorations placed
  in sections. Sections are *open* (the sky shows) or *solid/raised/paper*
  (they cover it), so the atmosphere appears between parts of the store,
  never on top of product. Each route places the moon by art direction;
  admin-made pages vary it by page id.
- **Homepage.** The Portal homepage (gate, live drop, world map, founder,
  circle, Signal Forge, sign-up) is now: headline and moon, the shop, the
  founder's story with the first drawing, an open stretch of night, the
  circle, sign-up.
- **Header, footer, mobile.** A quieter header that turns solid once you
  scroll, an X that marks where you are, a thumb-reach dock on phones, safe
  areas and `svh` units throughout. The footer is a horizon: open sky where
  the fog settles, the Rizo flame on the ground line (tap it), then the
  links.
- **Product, collection, cart, search, 404.** Same functionality, rebuilt
  on the shared components: calmer product page with notes blocks, filters
  as a drawer on phones, a 404 where the moon has set ("It used to be
  here.").
- **Copy.** Every line in templates, sections, schema defaults and scripts
  was read and most rewritten. Portal and system language ("SIGNAL",
  "TRANSMISSION", "PRODUCT FILE", "ENTER THE WORLD", heritage mode) is gone;
  what's left is short, plain and in Rizo's voice. The founder story was
  tightened without changing any fact in it.

### Restored from earlier Rizo, and why

| From the old build | Now | Why |
|---|---|---|
| The World / archive exploration | **World page** of objects on a table: the first sketch, the camo under a lens, the 412 mark, a stadium print, the wallpaper | It was the most Rizo idea in the old site. Kept the objects, dropped the map, passport and states around them. |
| Passport reward wallpaper | A plain **Save it** download on the World page | A good gift doesn't need a game in front of it. |
| "The world remembers where you've been" | **The moon persists**: it glides between pages, keeps drifting across a visit and knows tonight's real phase | The same feeling of a continuous world, without tracking UI. |
| The first-drawing reveal | **The pocket** on the founder story: a native `details` the drawing slides out of and tucks back into | Works with keyboard and without script. |
| Drop countdown | **Release countdown** section | Reusable for any drop, turns into "Out now." when it lands. |
| Events list | **Where we'll be** section | Dates as blocks; past ones stay as proof. |
| The perch | **The roost**: a bat hangs from the headline's full stop | One small discovery instead of a mascot. |
| 412 and camo material, the ember and shadow marks | Available as Objects and Story images | They were buried in removed sections. |

### Reusable systems

- **Surfaces and space:** `data-surface`, `data-space`, `data-fog` on every
  section, the same editor settings everywhere.
- **Page system:** the default `page` template gives any admin page a title
  over open sky and a reading column; `page.about`, `page.world`,
  `page.circle`, `page.contact` are compositions of the same sections.
- **Sections:** Page title, Text (reading / statement / quote), Story,
  Photographs (spread / strip), Objects, Products, Release countdown, Where
  we'll be, Open sky, Email sign-up, Questions, Contact form.
- **Built-in images:** `rizo-image` lets any section use Rizo's own
  photographs and scans before anything is uploaded.
- **Route-aware sky:** `data-route` and `--seed` on `body`; moon position
  tokens per route in `rizo.css §6`.
- **Event Layer hooks:** `data-roost`, `data-rizo-event-quiet`,
  `data-fog-bias`, `moon-tap` on the event bus, `RizoEventLayer.module()`.

### Halloween systems improved

- **Moon:** tonight's real phase masked from the artwork with a soft
  terminator and earthshine; sets toward the ground fog as you scroll and
  warms; drifts slowly across a visit; glides between pages with a view
  transition; tap it and it rocks and whatever was behind it leaves.
- **Fog:** replaced the CSS image strips with two low-resolution canvases
  painted from noise generated in the browser: dim cloud behind the page
  that veils the moon, mist in front of open sections. Density follows the
  sections on screen, each layer moves at its own depth, the pointer or a
  finger parts it, and it can follow Pittsburgh's clock (thickest near
  dawn). About 0.1 megapixels of canvas at 1440×900.
- **Bats:** redrawn as four-frame sprite sheets from one skeleton (the old
  ones were a single image squashed to fake a wing beat). Two depths, and a
  bat can cross from behind the page to in front of it. Hunting, pairs,
  distant bats and ones that leave the moon, with long quiet stretches
  (roughly 20–75 s) instead of a loop. Fast scrolls wake them; taps scatter
  them.
- **Roost:** a new module. One bat hangs under an edge, looks around,
  notices the pointer and leaves, and comes back later somewhere else.
- **Performance:** one animation loop that sleeps when nothing moves, a
  governor that steps quality down on slow devices. Scrolling the homepage
  in headless Chromium: 53 fps with the event on, versus 20.5 fps for the
  previous build in the same harness (60 on the phone profile).
- **Accessibility:** reduced motion is honoured live (no bats or roost,
  still moon, still fog); focus order is identical with the event on or
  off.

### Intentionally removed

Signal Forge, the World map and passport, world states and heritage mode,
datelines and the live clock, fake serials ("RZ-xxxx", "PRODUCT FILE"),
sound, the install guide, the hero heat canvas, card tilt, the marquee,
monospace microtext, the squash-animated bats, the CSS fog strips and fog
image, the SVG moon, and the Portal sections built around them (about,
contact signal, drop countdown, events, featured collection, founder
signal, legacy ledger, live hero, live products, local proof, manifesto,
next signal, paths, portal, product story, signal signup, team, world
cards, world gallery, world gate, world map, after hours). The old
implementation reports and the placeholder-art generator went with them.

### Needs human judgment

1. **Test on a real store and a real iPhone before launch.** Everything was
   verified in Chromium against a local Liquid preview and a catalog
   snapshot. Worth checking on the device: Safari's cross-page view
   transition for the moon (Safari 18.2+; older versions simply skip it),
   the phase mask, and fog smoothness.
2. **Merchant settings.** `config/settings_data.json` and the templates were
   rewritten. If the live theme has editor changes that aren't in this
   repo, reconcile them before publishing.
3. **Menus and page templates.** The header reads the `main-menu` menu, the
   footer reads `footer`. Assign `page.about`, `page.world`, `page.circle`
   and `page.contact` to the matching pages in admin.
4. **The moon's real phase.** Halloween night 2026 is about 65% lit; around
   October 10 it's a new moon and only earthshine shows, which leaves the
   homepage's biggest object nearly dark for a few nights. That's honest
   and a little eerie. If it reads as broken, Theme settings → Event layer:
   moon → Phase → *Always full*.
5. **Copy to confirm:** the founder story edits (facts unchanged; the
   "change the world" closing line was cut as generic), and the footer note
   "I don't know what I'm doing." (kept from the Bible; it's the owner's
   call whether it stays public).
6. **Left blank on purpose:** captions where the facts weren't known (the
   stadium photo's location; the line under the first drawing, e.g. when
   it was made). The old 02/22/2023 archive date isn't used anywhere
   because nothing confirmed it.
7. **Brand assets kept but unused:** classic logo, outline and white logos,
   origin mark, blue face variant, secondary face. Delete them if they're
   retired.
8. **Font choice.** Bricolage Grotesque was chosen for its width axis and
   slightly irregular drawing. A licensed house face could replace it by
   swapping one WOFF2 file.
