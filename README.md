# rizo-store

**Design branch: `design/halloween-2026`.** Based on the complete
`fix/final-responsive-cleanup` branch at `ceb1103f157f98738f56afb9a6952d1ac78380b2`.
The homepage now uses the September 2026 Rizo art direction. Start with
[`docs/HALLOWEEN-2026-DESIGN-HANDOFF.md`](docs/HALLOWEEN-2026-DESIGN-HANDOFF.md)
for design decisions, validation, asset provenance, and production caveats.

For the visual preview with a dated snapshot of actual Rizo products:

```sh
cd tools
npm ci
npx playwright install chromium
npm run preview:catalog
# Open http://localhost:9292/?rizo_event=on
```

`npm run test:design` checks the four requested mobile sizes and desktop,
and saves screenshots. `npm test` uses the controlled mock catalog for the
commerce and Event Layer regression suite. Preview cart/checkout are simulated.
Production continues to use Shopify's live product, variant, inventory and cart
objects. Halloween is scheduled to begin September 23, 2026 in New York time for an early seasonal rollout.

The Rizo Apparel Shopify theme (rizo.store): Rizo Portal with the seasonal
**Event Layer** (Halloween 2026 is the first preset).

| Path | What it is |
|---|---|
| `assets/` `config/` `layout/` `locales/` `sections/` `snippets/` `templates/` | The Shopify theme (Online Store 2.0), at the repository root so Shopify's GitHub integration can connect this repo directly. |
| `docs/EVENT-LAYER.md` | How the Event Layer works: switching it on and off, scheduling, modules, tokens, replacing artwork, adding a future event. |
| `docs/HALLOWEEN-2026-IMPLEMENTATION-REPORT.md` | What changed for Halloween 2026, the test results, and known limitations. |
| `docs/screens/` | Reference screenshots (placeholder art). |
| `tools/` | Local preview harness, browser audit and Theme Check. **Not part of the theme.** |

`docs/`, `tools/` and this README are listed in `.shopifyignore`, so
`shopify theme push` uploads only the theme.

```
cd tools
npm install
npm run preview   # http://localhost:9292 (add ?rizo_event=on)
npm test          # event-layer browser audit
npm run check     # Shopify Theme Check
```

History: Rizo Portal v2.3 (accessibility pass) → v2.3 + Event Layer (Halloween 2026).
