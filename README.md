# rizo-store

The Shopify theme for [rizo.store](https://rizo.store): Rizo Apparel,
Pittsburgh. Online Store 2.0, no build step, no framework.

The whole site is one design system (`assets/rizo.css`) set against a fixed
night sky. Seasonal events (Halloween 2026 is the first) are a separate,
reversible layer on top of that sky: [`docs/EVENT-LAYER.md`](docs/EVENT-LAYER.md).
Art layers, phone art direction and how to add interactions:
[`ENGINEERING-NOTES.md`](ENGINEERING-NOTES.md). What changed:
[`CHANGELOG.md`](CHANGELOG.md).

## Files

| Path | What it is |
|---|---|
| `layout/theme.liquid` | The page: fonts, sky, header group, `main`, footer group, drawers, dialogs. Sets `data-route` and `--seed` on `body`. |
| `assets/rizo.css` | The design system: tokens, type voices, surfaces, every component and route. |
| `assets/rizo.js` | Commerce and small interactions: cart drawer, quick add, variant pickers, search, filters, recommendations, the first drawing, the camo lens, releases. |
| `assets/rizo-art.js`, `snippets/rizo-art.liquid` | Art layers: the *Art* block every major section accepts. |
| `sections/rizo-*.liquid` | Building blocks for any page (see below). |
| `sections/main-*.liquid` | Product, collection, cart, search, page, 404. |
| `snippets/rizo-sky.liquid` | The fixed sky behind every page. |
| `snippets/rizo-event-*.liquid`, `assets/rizo-event-*`, `assets/event-halloween*` | The Event Layer. |
| `templates/*.json` | Home, product, collection, cart, search, 404, and the page templates `page` (default), `page.about`, `page.world`, `page.circle`, `page.contact`. |
| `docs/` | Event Layer guide, font licences, reference screenshots, last design-check results. |
| `tools/` | Local Liquid preview, browser tests, Theme Check. Not part of the theme. |

`docs/`, `tools/` and the Markdown files at the root are in `.shopifyignore`, so
`shopify theme push` uploads only the theme.

## Building a page

A new page in Shopify admin uses the default `page` template and already
looks like Rizo: its title over open sky, the page content in a reading
column, and the moon in a position derived from the page id (`--seed`), so
two pages never hang it in the same place. For anything more, pick a
template (`page.about`, `page.world`, `page.circle`, `page.contact`) or
compose one in the theme editor from these sections:

| Section | Use |
|---|---|
| Page title | Title in the spoken or sign voice, a line under it, optional tonight's-moon line. |
| Text | Reading, a single statement, or a quote with who said it. Can sit on paper. |
| Story | Photo and words; optional first-drawing pocket that slides out. |
| Photographs | Photo spread (editorial rhythm) or strip. |
| Objects | Things on a table: paper, print, photo, scan, object. Width, placement, tilt, a lens, a download. |
| Products | A collection as a grid or a sideways shelf, with quick add. |
| Release countdown | A dated drop; turns into “Out now.” when it lands. |
| Where we’ll be | Rizo in person: dates and places as blocks, past ones kept. |
| Open sky | An empty stretch of night between sections. Collapses when no event is live. |
| Email sign-up, Questions, Contact form | As named. |

Sections share the same settings, so the sky behaves the same way
everywhere:

- **Surface** (`data-surface`): `open` lets the sky, moon, fog and back bats
  show through; `solid`, `raised` and `paper` cover it.
- **Space** (`data-space`): tight, normal, loose.
- **Fog** (`data-fog`, 0–100%): how much mist collects there during an event.

Most sections also take **Art** blocks: drawings, stickers, scans or
textures placed by percentage, behind or in front of the content, with
their own image, placement and visibility on phones. See
`ENGINEERING-NOTES.md`.

Two attributes are for hand-written markup: `data-roost="hang"` gives the
roosting bat somewhere to hang, and `data-rizo-event-quiet` keeps bats and
front fog away from an area.

## Type

Two families, five voices (`assets/rizo.css §3`):

| Voice | Face | For |
|---|---|---|
| `v-sign` | Bebas Neue (as *Rizo Display*) | The name, numbers, a few page titles. |
| `v-say` | Bricolage Grotesque, heavy, sentence case | How Rizo talks in headlines. |
| `v-say-n` | The same, condensed | A second headline that shouldn't compete. |
| `v-text` | Bricolage Grotesque, regular | Reading. |
| `v-label`, `v-note` | Small spaced caps; small muted text | Structure; asides. |

Both fonts are self-hosted WOFF2 under the SIL Open Font Licence (licences in
`docs/`).

## Working locally

```sh
cd tools
npm ci
npm run preview:catalog   # http://localhost:9292, real catalog snapshot
                          # add ?rizo_event=on for Halloween, ?set.event_layer=off for normal Rizo
npm test                  # Event Layer and commerce checks in Chromium
npm run test:design       # layout at 8 screen sizes, every route, the interactions;
                          # writes docs/screens/ and docs/DESIGN-CHECKS.json
                          # (art and phone compositions: ?fixture=art, ?fixture=phone)
npm run check             # Art block in sync across sections + Shopify Theme Check
npm run sync:art          # after editing tools/schema/art-block.json
```

The preview renders the real Liquid with liquidjs. Cart and checkout are
simulated; production uses Shopify's live product, inventory and cart
objects. Playwright uses the system Chromium if `PLAYWRIGHT_BROWSERS_PATH`
is set, otherwise run `npx playwright install chromium` once.
