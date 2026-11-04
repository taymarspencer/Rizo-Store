# RIZO OPS 2.0 — storefront control contract (theme PR)

**Status: candidate, not deployed.** This branch changes the Rizo Portal Shopify theme only. It does **not** modify live Shopify product, variant, inventory, collection, metafield, or order data. It does not authorize a theme publish. Verify against an unpublished theme before merging.

## Purpose and separation of responsibilities

- **Shopify is authoritative** for sellable variants, product media, collection membership, publication, orders and location-specific inventory.
- **RIZO OPS (private backend)** is authoritative for blank garments, print transfers, production batches, vending events, costs, staff and audit ledger. It maps each finished garment to a Shopify inventory item and location.
- **Shopify Liquid theme** reads a deliberately small, merchant-owned `SHOP` metafield contract for storefront merchandising. No private RIZO OPS credentials or production data are sent to browser JavaScript.
- **GitHub theme repository** remains authoritative for layout, CSS, JS, artwork, templates and structural/theme-code changes. The OPS app must not use the Theme Files API to mutate Liquid or JSON template files in normal operations.

## The opt-in storefront controls

Create **definitions first** with the Shopify Admin GraphQL API (or manually in Shopify Admin), then write values via `metafieldsSet`, then verify by reading them back and testing Liquid. These are merchant-owned on purpose: the separately developed OPS app, Shopify Admin and Shopify theme all need stable access to the same fields, independent of a particular app installation. They cannot be declared as merchant-owned definitions in `shopify.app.toml`.

Owner type: `SHOP`. Namespace: `rizo_ops`. Fields:

| Key | Shopify metafield type | Theme consumer | Missing/disabled behavior |
| --- | --- | --- | --- |
| `theme_enabled` | `boolean` | all bridge sections | Missing/false leaves legacy theme behavior unchanged |
| `hero_heading` | `single_line_text_field` | `sections/rizo-world-gate.liquid` | Use existing section heading |
| `hero_intro` | `multi_line_text_field` | `sections/rizo-world-gate.liquid` | Use existing rich text section setting |
| `hero_shop_label` | `single_line_text_field` | `sections/rizo-world-gate.liquid` | Use existing section CTA label; destination unchanged |
| `announcement_text` | `single_line_text_field` | `sections/rizo-header.liquid` | Use existing world-state/manual text; seasonal event overlay retains its priority |
| `home_collection` | `collection_reference` | `sections/rizo-live-products.liquid` | Use existing collection setting |
| `featured_product` | `product_reference` | `sections/rizo-live-hero.liquid` (optional section, not the current homepage world gate) | Use existing theme-editor featured product |

`theme_enabled` is **not** a storefront feature flag that anyone can flip with a URL. Liquid reads only the Shopify SHOP metafield. The local preview harness supports `?ops.*` purely as a mock test control.

### Contract details

- Treat empty override values as “fall back to theme setting”, not “erase storefront content.” Later, use an explicit `null`/clear action or a per-field override mode if intentionally blank content is needed.
- Escape OPS-provided plain-text fields in Liquid. `hero_intro` is plain text with safe newlines, **not** raw HTML.
- Use Shopify native `collection_reference` and `product_reference` values, not string handles that can drift. The API writes the matching GID as the metafield value and Liquid receives an actual object via `.value`.
- The homepage world gate uses its own established layout. No theme structure, event behavior, pricing or product tiles should change with `theme_enabled=false`.
- The optional `rizo-live-hero` uses `featured_product` only when the section appears in a template. It does not magically add a new section to the homepage.
- Never write counts like “only 2 left” into static marketing text unless derived from currently tracked sellable inventory; rely on Shopify variant availability and inventory policy for checkout decisions.

### Safe definition creation

1. Authenticate to the **specific** shop (verify `rizo.store` maps to the expected Shopify shop and use the canonical `.myshopify.com` domain for Admin API); fetch `shop { id }` for the metafield owner GID.
2. Inspect `metafieldDefinitions(ownerType: SHOP)` for existing `rizo_ops` keys; don't blindly recreate or change types.
3. Create only missing merchant-owned definitions via `metafieldDefinitionCreate` with `ownerType: SHOP` and the types above. Choose storefront access consistent with Shopify Liquid/the actual app requirements. The theme should never contain private information.
4. Query each definition and existing value before using `metafieldsSet`; for updates, use `compareDigest` compare-and-set to avoid overwriting newer changes. Store original values in an audit log.
5. Test a staged value while `theme_enabled=false`; then enable on an unpublished theme only in a controlled preview/staging setup. **Warning:** the SHOP-level flag is storewide, not theme-specific. If the bridge is already deployed to the live theme, switching the flag changes the live theme too.
6. Roll back by setting `theme_enabled=false`; existing theme settings remain intact. Clearing a value should never delete the underlying definitions or published products.

Reference: https://shopify.dev/docs/apps/build/metafields/definitions and https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/metafieldsSet .

## Inventory and merchandising boundaries

The theme **is not** an inventory ledger. Do not mirror available quantities in a public metafield, hidden browser state or a second storefront database.

- Shopify variant/inventory-item/location IDs are canonical. SKUs are human-readable identifiers: standardize and make unique, but do not treat SKUs as primary keys.
- Maintain separate private counts for blanks (style × color × size × condition × physical location), finished garments (Shopify variant/location), reserved material, transfers and work in progress.
- Producing an item moves blank material and transfers through an atomic, append-only production ledger. Only after successful production should the OPS backend adjust Shopify's **finished** inventory for the mapped inventory item/location; if Shopify fails, keep a retriable pending sync record and flag the discrepancy.
- 2026-10 Admin GraphQL `inventoryAdjustQuantities` requires an `@idempotent(key: ...)` directive. Use a durable unique operation key per production/sale; never generate a new key when retrying the same event. Use `changeFromQuantity` where appropriate, handle stale conflicts and reconcile rather than silently overwriting counts.
- Online Shopify order webhook events are signed/verified, stored idempotently, and reconciled against API snapshots. They must not blindly decrease Shopify stock again if Shopify has already deducted it.
- A vending sale must choose a Shopify inventory location and document when/where stock transfers occur. Don't deduct from two locations or from both a local mirror and Shopify for the same sale.
- Stock reconciliation starts with a **physical count** and a mismatch report. Do not mass-fix historical negative quantities or missing SKUs without review.

### Current preflight findings (read-only inspection, November 2026)

- Skeleton Crewneck was observed with five Shopify size variants at one reported unit each. **Not physical verification.**
- Some legacy products have negative variant quantity values; many SKUs are blank. Production app should expose these as actionable reconciliation tasks before accepting inventory changes.
- Size labeling across old products is inconsistent (`S` versus `Small`; `2XL` versus `2 XL`). Do not alter old variant option values or variant identities automatically.

## Checks before merge

1. `cd tools && npm install && npm run check && npm test`; browsers may need Playwright installation.
2. The test harness has mock `?ops.theme_enabled=true&ops.hero_heading=...&ops.home_collection=limited` for local-only override tests. Test both flag OFF and flag ON; check desktop and iPhone widths, empty reference fallbacks, same home markup when flag is missing.
3. Preview on a **duplicate/unpublished Shopify theme** using actual SHOP metafield values and an opt-in plan that won't impact the currently published theme. Compare screenshots.
4. Ensure old Halloween/Event Layer scheduling, announcement priority, checkout/cart, product variants, images and Lighthouse performance are unchanged.
5. Review the GitHub diff and release/publish separately. No live product mutations or credential exposure in this PR.

## OPS app handoff: initial API endpoints (illustrative, not live)

- `GET /api/storefront-controls` -> resolved values with Shopify object IDs, types, `compareDigest` and last refresh.
- `PATCH /api/storefront-controls` -> validate permissions and input types, write Shopify metafields through server-side `metafieldsSet`, return changed fields and exact Shopify userErrors on failure.
- `GET /api/inventory/reconciliation` -> read-only product/variant/location inventory with unlinked SKU and negative-quantity warnings.
- `POST /api/production/batches` -> private blank-to-finished ledger and idempotent outbox intent; no client-side Shopify access tokens.
- `POST /api/shopify/webhooks` -> signed HMAC verification, durable deduplication and response under Shopify timeout expectations.

**Scope is purposely tiny:** the theme bridge solves content ownership; Claude's new OPS repository solves authenticated mutations, source-of-truth inventory, vendor blanks, production and people. Keep them separate.
