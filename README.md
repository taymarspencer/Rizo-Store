# Rizo Portal — Shopify theme

This folder holds the Rizo Apparel Shopify theme (rizo.store). It is separate
from the Rizo.game PWA that lives at the repository root.

| Path | What it is |
|---|---|
| `theme/` | The complete, upload-ready Shopify theme (Online Store 2.0). Zip the *contents* of this folder (so `layout/`, `sections/`, … sit at the zip root) or push it with `shopify theme push --path shopify/theme`. |
| `docs/EVENT-LAYER.md` | How the seasonal **Event Layer** works: switching it on and off, scheduling, modules, tokens, replacing artwork, adding a future event. |
| `docs/HALLOWEEN-2026-IMPLEMENTATION-REPORT.md` | What changed for Halloween 2026, the test results, and known limitations. |
| `docs/screens/` | Reference screenshots (placeholder art). |
| `tools/` | Local preview harness, browser audit and Theme Check. **Not part of the theme upload.** |

```
cd shopify/tools
npm install
npm run preview   # http://localhost:9292 (add ?rizo_event=on)
npm test          # event-layer browser audit
npm run check     # Shopify Theme Check
```

History: Rizo Portal v2.3 (accessibility pass) → v2.3 + Event Layer (Halloween 2026).
