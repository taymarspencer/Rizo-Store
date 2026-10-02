# rizo-store

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
