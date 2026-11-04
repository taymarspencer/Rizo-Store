# RIZO OPS storefront contract

Candidate on `feat/rizo-ops-theme-contract`, existing draft PR #5. **Production release: NO-GO.** The published Shopify theme is a newer implementation than this repository's `main`; see the release gate below. This PR is verified against the repository theme, not an interchangeable replacement for the current live design.

## Verified state, November 4, 2026

| Item | Observed result |
| --- | --- |
| Store | `rizo.store` / `rizo-apperal.myshopify.com` |
| SHOP owner | `gid://shopify/Shop/27906474062` |
| Published theme | `gid://shopify/OnlineStoreTheme/155243118670`, `RIZO Skeleton — review only`, role `MAIN` |
| Repository homepage | `rizo-world-gate` + `rizo-live-products` |
| Published homepage | `rizo-hero`, `rizo-skeleton-drop`, `rizo-products`, `rizo-feature-world`, `rizo-story`, `rizo-interlude`, `rizo-gallery`, `rizo-signup` |
| Definitions | Seven created and re-read; IDs below |
| Metafield values | None before or after setup; bridge OFF |
| Products, quantities, theme files, publication | Unchanged |
| Native candidate preview | Not uploaded/tested; source reconciliation required first |
| GitHub → published-theme auto-deploy | Not verified; never infer it from merge status |

The published manifest contains 146 files. Only 25 match `main` byte-for-byte; newer source includes different product/cart/event components, 412 content, fonts and images. No inspected repository branch matches the published manifest. Files and checksums are retained in `docs/ops-theme-qa/published-source-manifest.json`. The separate `Rizo-World-` repository was not edited.

## Contract: definitions first, then values, then verification

All definitions are **merchant-owned**, owner type `SHOP`, namespace `rizo_ops`. Do not use `$app`, `app`, or a second namespace. Merchant ownership intentionally survives changes to the OPS app installation. Values are written only through server-side Admin GraphQL `metafieldsSet`, API `2026-10`.

Admin access was re-read as `PUBLIC_READ_WRITE`. The create inputs omit `access.admin`, which is not a mechanism for restricting merchant-owned fields. Storefront API access is `NONE`; this does not restrict Liquid, which can still read `.value`. No private data belongs in these fields.

| Key | Shopify type | Definition GID suffix | Consumer / missing behavior |
| --- | --- | --- | --- |
| `theme_enabled` | `boolean` | `553641345102` | All bridge consumers; absent/false preserves theme settings |
| `hero_heading` | `single_line_text_field` | `553641377870` | `rizo-world-gate`; existing heading |
| `hero_intro` | `multi_line_text_field` | `553641410638` | `rizo-world-gate`; existing rich text intro |
| `hero_shop_label` | `single_line_text_field` | `553641443406` | `rizo-world-gate`; existing shop label and destination |
| `announcement_text` | `single_line_text_field` | `553641476174` | `rizo-header`; existing world-state/manual message |
| `home_collection` | `collection_reference` | `553641508942` | `rizo-live-products`; existing collection |
| `featured_product` | `product_reference` | `553641541710` | `rizo-live-products` native home feature; optional `rizo-live-hero` also consumes it |

Each complete definition ID is `gid://shopify/MetafieldDefinition/<suffix>`. `shop { id }` supplies the owner ID for value writes, not a definition ID. Reference values use `gid://shopify/Product/...` or `gid://shopify/Collection/...`; Liquid receives resource objects through `.value`, not handles.

`tools/ops/contract.mjs` is the executable source for exact definitions and operations. `tools/ops/setup.mjs` inspects before creating, refuses definition/type mismatches and unstructured merchant values, creates only missing definitions, and re-queries them. It never changes products, inventory or themes.

## Rendering and precedence

1. Unless `shop.metafields.rizo_ops.theme_enabled.value == true`, bridge values are ignored.
2. A nonblank valid override replaces only its corresponding content field. Missing/blank text falls back; valid empty collections deliberately show an empty state.
3. OPS text is escaped. Intro text uses `escape` then `newline_to_br`; HTML/script tags are displayed as text. No browser credentials or query-string overrides exist in production Liquid.
4. A nonempty active seasonal announcement outranks the OPS announcement. When the event ends, OPS/default text returns. Header visibility remains controlled by its existing theme setting.
5. The homepage now renders a native product-card feature for a resolved product with `id`, `url` and `published_at`; missing/unpublished references do not render an empty card. Shopify availability governs purchase controls, including sold-out states and variant selection. The feature is omitted from the following collection grid to prevent duplication. The collection candidate limit remains unchanged, so deduplication may reduce that grid by one card; an out-of-collection feature adds one card.
6. The optional live hero only reads the product reference when the section is actually rendered. It keeps the existing theme-editor feature as its fallback. The homepage integration does not depend on this optional section.
7. A missing/invalid collection reference falls back to the configured collection. `.value.id` and `.value.url` are checked. Shopify handles deleted/unpublished reference resolution; OPS must validate publication/status before writing.

OFF homepage screenshots match `main` at 320, 390 and 1440 pixels. The intentional unrelated differences are narrow product-gallery and collection-toolbar fixes, safe title escaping and removal of three pre-existing Theme Check offenses. No working theme JS was rewritten.

## Evidence-backed gap matrix

| Surface | Existing source | Gap / owner | Fix or boundary | Verification |
| --- | --- | --- | --- | --- |
| Home headline, intro, shop CTA | `rizo-world-gate` settings | App cannot edit theme-specific copy / theme | Three typed text overrides; destination remains existing anchor/link | ON, OFF, blank and hostile-copy browser cases |
| Announcement | `rizo-header` state settings + Event Layer | Need safe override without seasonal precedence regression / theme | Single plain-text field below active seasonal copy | Active → expired event test |
| Home collection | Section collection setting | Handle/settings coupling / Shopify + theme | Collection reference; canonical collection editing stays Admin GraphQL | Valid, missing and intentionally empty collections |
| Featured product | Optional `rizo-live-hero`, absent from index | Original PR control did not affect homepage / theme | Native feature inside rendered `rizo-live-products`; no redesign | Native media, duplicate prevention, sold-out, cart and no-JS tests |
| Product price/title/description/media/status/options | Shopify Product/Variant/Media | App/backend work, not theme CMS | Native GraphQL edits only; no duplicate metafields | Canonical mappings and acceptance tests in app handoff |
| Stock | Shopify InventoryItem + Location | Uncounted, inconsistent historical data / merchant + OPS | Read-only audit and reviewed reconciliation proposals | All 28 products / 123 variants, no truncated pages |
| CTA destination / feature visibility | Existing section link / absent reference | No demonstrated additional bridge requirement | Existing destination; feature presence derives from reference + master flag | Link target/no-JS checks |
| Drop schedule/status | Event Layer settings + optional hero/world state | Separate seasonal controls / theme | No additional remote scheduler or timers | Start/end, hidden tab, reload, governor, accessibility tests |
| Pittsburgh/412 | Live-only `rizo-feature-world`, missing from this main | Source divergence / release owner | Preserve live source during reconciliation; do not add a second 412 CMS | Published manifest + actual index read |
| Published source | Shopify current theme vs Git main | Releasing this tree would replace current live implementation / release owner | NO-GO until real source imported/ported on existing PR | 146-file checksum comparison |

## Safe setup and sandbox flow

Use Node `22.23.4`. Set `SHOPIFY_SHOP` to the verified canonical `.myshopify.com` domain and supply `SHOPIFY_ADMIN_TOKEN` only through a secret environment variable. Never commit `.env`, snapshot or plan files. From `tools/`:

```bash
node ops/setup.mjs --help
node ops/setup.mjs inspect --out ops/snapshot.local.json
node ops/setup.mjs definitions
node ops/setup.mjs definitions --apply --expect-shop gid://shopify/Shop/27906474062
```

The last command is a no-op when the seven observed definitions still exist. It must stop if the shop or definitions differ. Creating a definition can validate/retype an existing unstructured value, so the script refuses that case instead of assuming creation is harmless.

For an actual **development shop**, set that shop's credentials, create definitions there, and prepare a values object such as `{"theme_enabled":true,"hero_heading":"RIZO TEST","featured_product":"<development Product GID>"}` in `ops/values.local.json`. Replace the placeholder with a real published development product; do not copy production IDs into a dev store.

```bash
node ops/setup.mjs plan --values ops/values.local.json --out ops/plan.local.json
node ops/setup.mjs apply --plan ops/plan.local.json --sandbox --expect-shop <development-Shop-GID>
node ops/setup.mjs inspect --out ops/verified.local.json
```

The script always includes `compareDigest`, using explicit null for a missing value and the reviewed digest for an existing value. It rejects stale plans, re-validates types/identity, writes atomically, checks Shopify userErrors, and re-reads actual values. It refuses value writes to the production Rizo shop even with `--sandbox`. It does not delete overrides or retry uncertain mutations automatically.

**SHOP values are storewide, including on unpublished themes.** An unpublished theme is not a separate namespace. Do not turn the flag on merely to preview staging while any published bridged theme exists. Dedicated dev-store round trips are the safe default. ON local mock behavior is not native Shopify ON verification. `?ops.*` exists only inside `tools/preview/server.mjs`, which is excluded from theme upload.

## Rollback and release

Rollback of the bridge is an authorized `metafieldsSet` of `theme_enabled=false` with the current digest, then read-back and actual storefront verification. Existing section settings stay in place. It does not undo native product/inventory edits, which need separately reviewed inverse operations. Do not delete definitions or overwrite saved merchant copy as a rollback.

Before any production enable:

1. In Shopify Admin → Online Store → Themes, identify the **Current theme** and its actual ID; the “review only” name is not an indication of role.
2. Download/export the current theme and reconcile it into this same PR, preserving merchant JSON settings, 412 content, Skeleton media and working runtime. Port the seven consumers into the real rendered sections. Do not publish the older Portal tree.
3. Verify the theme's GitHub connection/branch in Admin. Keep this PR unmerged while the relationship is unknown.
4. Deploy only an unpublished candidate, complete native preview and sandbox value/rollback checks, record evidence, then obtain the required release authorization.

The complete private app boundary, canonical GraphQL operations, REST routes, auth, webhooks, idempotency rules and launch tests are in `docs/RIZO_OPS_APP_HANDOFF.md`. Test evidence and limitations are in `docs/OPS_THEME_QA.md`; merchant reconciliation candidates are in `docs/SHOPIFY_DATA_AUDIT.md`.

## Official references

- [Metafield ownership, permissions and Liquid access](https://shopify.dev/docs/apps/build/metafields)
- [Liquid metafield reference values](https://shopify.dev/docs/api/liquid/objects/metafield)
- [Create definitions](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/metafieldDefinitionCreate)
- [Atomic writes and compareDigest](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/metafieldsSet)
- [Theme performance practices](https://shopify.dev/docs/storefronts/themes/best-practices/performance)
