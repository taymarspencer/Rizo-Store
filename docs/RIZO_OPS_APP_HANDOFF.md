# RIZO OPS app handoff

Status: backend contract ready; production storefront integration is **NO-GO** until the published-theme source mismatch below is resolved. This document is standalone input for the separate private `taymarspencer/Rizo-Ops` app. It does not authorize deployment or production product/inventory edits.

## Verified identity and release gate

Read-only Shopify inspection on November 4, 2026 verified:

- Canonical domain: `rizo-apperal.myshopify.com`; storefront: `rizo.store`.
- Shop: `gid://shopify/Shop/27906474062`.
- Published theme: `gid://shopify/OnlineStoreTheme/155243118670`, `RIZO Skeleton — review only`, role `MAIN`. Its name does not make it a preview.
- `Rizo-Store/main` is `95b469f44d4400e9f420853efcbf2edc34e601f6`. Its homepage renders `rizo-world-gate` and `rizo-live-products`.
- The published homepage instead renders `rizo-hero`, `rizo-skeleton-drop`, `rizo-products`, `rizo-feature-world`, `rizo-story`, `rizo-interlude`, `rizo-gallery`, and `rizo-signup`. It has newer Pittsburgh/412 content and different CSS, JS, snippets and product pages. Do not replace it with the older Portal theme to activate OPS.
- All seven merchant-owned SHOP definitions below were created and re-read. **No values were written.** `theme_enabled` is absent, so OFF.

Implement a server-owned `storefrontReleaseStatus` with `sourceVerified`, `previewVerified`, `publishedThemeId`, `sourceCommit`, and a reason. Initially both booleans are false. Return HTTP 409 for production bridge enable/publish while either is false. A metafield write succeeding does not mean the live theme consumes it. Show a simple user-facing message: “Storefront connection needs setup.” Product editing and read-only inventory can be built independently of this bridge gate.

To clear the gate: export the real published theme into the existing theme PR without replacing merchant content; port the seven small consumers into its actual sections; run native unpublished-theme QA; record its reviewed source SHA and actual theme ID. Verify GitHub integration in Shopify Admin. GitHub branch protection/actions cannot prove whether Shopify auto-updates a published theme. There is no verified auto-deploy relationship in this audit.

## Architecture and ownership

Use the OPS repository's established stack if it has one. For an empty Shopify app repository, scaffold the official Shopify React Router app template with Shopify CLI; use the supported server authentication/session helpers, encrypted offline Admin token storage, a durable SQL database, and a transactional outbox. The authenticated mobile UI may run inside Shopify Admin; do not make an unauthenticated storefront control panel. Allowlist the verified Shop GID and authorized staff; a shop domain submitted by a browser is never authorization.

| Data | Authority | App behavior |
| --- | --- | --- |
| Product title, HTML description, price, variants/options, media, status | Shopify Admin GraphQL | Edit native resources by GID; read back after writes |
| Collection membership, ordering and publication | Shopify | Distinguish manual membership from rule-based collections; distinguish ACTIVE status from Online Store publication |
| Finished sellable stock | Shopify InventoryItem + Location | Read location-specific states; send deliberate adjustments through durable operations |
| Blanks, transfers, materials, production jobs, costs | Private OPS database | Transactional append-only movements; no public metafield ledger |
| Seven merchandising overrides | Merchant-owned SHOP metafields | Exact namespace/type contract below; optimistic concurrency |
| Layout, art placement, section structure, seasonal settings | Theme Git repository / theme editor | No routine Theme Files API writes from OPS |

Backend tokens, staff details, costs, blank quantities and production quantities must never enter Liquid, storefront JSON, public metafields, client bundles, logs or preview query strings.

## Stable storefront contract

Admin GraphQL endpoint: `https://rizo-apperal.myshopify.com/admin/api/2026-10/graphql.json`. Require the response `X-Shopify-API-Version` to equal `2026-10`. API authentication stays server-side.

Owner type `SHOP`; namespace `rizo_ops`; owner ID from `shop { id }`. Do not use `$app` or `app`, and do not create parallel fields. Merchant ownership is intentional so installation identity does not change the contract. Admin access is implicitly `PUBLIC_READ_WRITE`; omit `access.admin` on creation. All seven definitions have `access.storefront=NONE`. This controls Storefront API exposure and does not prevent Liquid access.

| Key | Type | Meaning in this PR | Fallback |
| --- | --- | --- | --- |
| `theme_enabled` | `boolean` | Master opt-in; only typed `true` enables consumers | Missing/false restores theme settings |
| `hero_heading` | `single_line_text_field` | Homepage world-gate heading | Existing heading |
| `hero_intro` | `multi_line_text_field` | Escaped plain text; newlines become `<br>` | Existing intro rich text |
| `hero_shop_label` | `single_line_text_field` | Existing shop CTA label | Existing label; destination stays unchanged |
| `announcement_text` | `single_line_text_field` | Header default message | Theme/world-state copy; active nonempty seasonal message wins |
| `home_collection` | `collection_reference` | Homepage shop section source, `.value` is a Collection | Theme collection if invalid/missing; a valid empty collection remains empty |
| `featured_product` | `product_reference` | Native card before the homepage collection; same product omitted from the grid; optional live hero also reads it | No homepage feature; optional hero uses its theme setting |

The homepage feature uses Shopify title, images, price, variant options and availability. It never constructs an artificial “in stock” state. Sold-out products remain visible with disabled purchase controls. Require resolved product `id`, `url`, and `published_at`. The backend must additionally reject draft/archived/unpublished product references. A valid feature may lie outside the chosen collection. The collection limit applies to collection candidates before deduplication; the separate feature can add one card. Product references never override Skeleton-specific photography or a fixed product template.

Do not add schedule, 412 content, feature visibility, arbitrary CTA destinations, product prices, descriptions, images or quantity metafields. Missing `featured_product` hides the optional home feature. The existing home CTA points to `#RizoLiveShop`. Seasonal scheduling remains the existing Event Layer's job. The live 412 section is part of the source mismatch and must be preserved during reconciliation, not replaced by a new CMS.

## Scope verification

At installation, query `currentAppInstallation { accessScopes { handle } }`, compare against features actually enabled, and test each capability on a dev store. The connected audit tool's broad permissions are not the future app's grants. There is no general `write_metafields` scope to invent; metafield access follows the owner resource/namespace rules. Prove SHOP definition creation and a value round trip with the app's own token in a sandbox.

| Operation family | Scopes to verify |
| --- | --- |
| Product/variant reads and writes, collections | `read_products`, `write_products` |
| Inventory reads/adjustments | `read_inventory`, `write_inventory` |
| Location selection | `read_locations` |
| Publication discovery and publish/unpublish | `read_publications`, `write_publications` |
| File uploads, attachment and media processing | `read_files`, `write_files` plus product permissions for attachment |
| Native page content if that feature is enabled | `read_content`, `write_content` |
| Read-only source verification | `read_themes`; never request `write_themes` for normal app content editing |
| Order lifecycle reconciliation | `read_orders`; protected customer-data requirements apply if collecting that data; do not request `read_all_orders` unless historical backfill actually requires it |

Do not request customer, discounts, shipping, fulfillment, theme publishing, or broad staff-management access for this contract. Storefront API tokens are unnecessary for a Liquid bridge.

## Definitions, writes, reads and conflicts

The executable operations are exported by `tools/ops/contract.mjs`; `tools/ops/setup.mjs --help` documents the dry-run-first CLI. It creates only missing definitions, rejects type mismatches and unstructured pre-existing values, and verifies definitions after creation. Its example value-writing mode is **sandbox-only** and rejects the real Rizo Shop GID/domain.

Definition creation (only after inspecting the exact namespace/key and any unstructured value):

```graphql
mutation OpsDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id key type { name } }
    userErrors { field message code }
  }
}
```

Variables for one missing definition: `{"definition":{"ownerType":"SHOP","namespace":"rizo_ops","key":"hero_heading","name":"RIZO OPS hero heading","type":"single_line_text_field","access":{"storefront":"NONE"}}}`. Apply the seven types from the table; never migrate an existing definition automatically.

Before any content change, query definitions and `shop.metafields(namespace:"rizo_ops",first:100)` with `key type value compareDigest` and `pageInfo`. A missing value requires **explicit `compareDigest:null`**, which means create only if still absent. Updates require the digest the user actually reviewed. Omission of `compareDigest` opts out of protection and is forbidden.

```graphql
mutation OpsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { key type value compareDigest }
    userErrors { field message code }
  }
}
```

Each input contains `ownerId`, `namespace:"rizo_ops"`, exact `key`, `type`, serialized string `value`, and `compareDigest`. Boolean values are strings `"true"`/`"false"`; reference values are Product/Collection GIDs. `metafieldsSet` is atomic across its batch (max 25). Check both top-level errors and `userErrors`, then re-read and compare actual values/types. Return HTTP 409 for stale digests; retain the user's draft and show the changed field. Never silently refresh a digest and overwrite a merchant's edit.

GET responses return types, current values, reference identities, digests, saved drafts and the release gate. A successful PATCH returns re-read values and new digests. A timeout is an unknown outcome: inspect current data before retrying. Repeating an identical operation ID must return its recorded result, not create another write with new preconditions.

Blank/whitespace/missing overrides fall back in the theme. Shopify can reject empty metafield writes; do not assume `value:""` clears a reference. An intentional “use theme default” action requires a separate `metafieldsDelete` flow, explicit reviewed identifiers, per-field backend serialization, a fresh read and an audit record. This API has no `compareDigest` delete guarantee: surface that limitation and concurrent external edits; do not describe a pre-read as atomic CAS. The shipped setup tool deliberately does not implement deletion.

The verified Online Store publication is `gid://shopify/Publication/42339795022`, identified through `publications { nodes { id channels { nodes { name handle } } } }` with channel handle `online_store`. Re-discover it per shop/install; do not copy this ID into a development store or identify channels from generated catalog titles. For collection references, use `publishedOnPublication(publicationId: ...)`; for product references, require ACTIVE plus Online Store publication/URL.

## Native product operations

Use GraphQL, not legacy Shopify REST. The REST routes below are OPS's own backend routes, not Shopify REST URLs. The following mutation families were checked against the Admin schema; validate their exact input fields when implementing and pin the API version.

| Edit | Shopify operation / input |
| --- | --- |
| Title, sanitized description, status, SEO | `productUpdate(product: ProductUpdateInput)`; send only edited fields plus `id` |
| Variant prices, option values, policy, SKU | `productVariantsBulkUpdate(productId:,variants:,allowPartialUpdates:false)`; `ProductVariantsBulkInput` has `price`, `compareAtPrice`, `optionValues`, `inventoryPolicy`, and `inventoryItem:{sku:...}`. Do not send a top-level `sku` or replace variant identities |
| New variants/options | Explicit `productOptionsCreate` / `productOptionsUpdate` and `productVariantsBulkCreate` flows after reviewing the resulting matrix; preserve existing GIDs |
| Media upload/attach/order | `stagedUploadsCreate` → upload to returned signed target → `fileCreate`/`fileUpdate` and product attachment using current supported fields; poll processing READY; preserve existing images until replacements are verified; use native media reordering |
| Manual collection membership | `productUpdate` with `collectionsToJoin` / `collectionsToLeave`; validate collection type; automated collections are controlled by rules |
| Channel publication | `publishablePublish(id:,input:[{publicationId:...}])` / `publishableUnpublish`; ACTIVE status alone does not publish to Online Store |

For native fields without API CAS, keep a reviewed before snapshot/resource `updatedAt`, re-read immediately before writing, serialize writes per resource and return conflict on observed differences. This does not prevent all external-app races: send a minimal field patch and re-read after writing. Never claim native product updates offer `compareDigest` semantics.

Product descriptions may contain deliberately authored HTML; sanitize on the server with an allowlist, including safe link protocols. All bridge copy stays plain text. Validate money as decimal strings/currency-aware values, accept only scoped Shopify GIDs, allowlist fields, limit payloads, and prevent SSRF in media handling. Do not accept arbitrary Admin GraphQL from clients.

## Inventory mapping and mutation rules

The canonical physical location observed is `gid://shopify/Location/35066216526`; its active/online-fulfillment flags are true. It is a legacy address label, **not proof of where stock is physically kept**. Require owner confirmation before selecting a production/vending location. Do not create, rename or deactivate a location automatically.

Store the tuple `(shopId, productId, variantId, inventoryItemId, locationId)`; location inventory is keyed by `(inventoryItemId,locationId)`. Never use SKU or size text as the primary key. A variant-to-inventory-item relationship must be revalidated; the schema can expose multiple variants per inventory item, so don't assume the reverse mapping is universally one-to-one. Store Shopify GIDs losslessly as strings.

Read `inventoryItem { id tracked inventoryLevels { nodes { id location { id isActive } quantities(names:["available","on_hand","committed"]) { name quantity } } pageInfo {...} } }`, and paginate variants, levels and products independently. Do not infer available quantity by subtracting from `inventoryQuantity` again. Negative, untracked and CONTINUE-policy observations are reconciliation candidates, not automatic repairs.

- Physical counts are reviewed corrections; production completion is a delta. Keep their operation types distinct.
- On completion, atomically consume private materials and write an outbox intent. A worker uses `inventoryAdjustQuantities` for the mapped finished item/location, with a durable `@idempotent(key:$idempotencyKey)` on the mutation field. Persist the exact same key and payload across retries.
- Both adjust and set inputs in 2026-10 require explicit `changeFromQuantity`; supply the freshly reviewed quantity, never a stale global total. Do not use removed `compareQuantity` / `ignoreCompareQuantity` fields. Do not bypass conflicts by substituting null.
- Use `inventorySetQuantities` only for an authorized counted correction. It also requires the mutation-field `@idempotent` directive. For `on_hand`, understand committed/reserved states before writing; do not force available stock to equal a physical total blindly.
- Use `referenceDocumentUri` such as `gid://rizo-ops/ProductionBatch/<uuid>`; for adjustments to quantity names other than `available`, provide a non-Shopify `ledgerDocumentUri` per change.
- For `CHANGE_FROM_QUANTITY_STALE`, re-read and ask for a fresh business decision where necessary. Do not “fix” the mismatch by retrying against a new number automatically.
- Shopify online orders already affect Shopify stock. Order webhooks must never trigger another inventory deduction. If vending is recorded through Shopify/POS, also do not deduct twice. For an OPS-only vending sale, create one explicit idempotent adjustment against its chosen location.

```graphql
mutation OpsAdjust($input: InventoryAdjustQuantitiesInput!, $key: String!) {
  inventoryAdjustQuantities(input: $input) @idempotent(key: $key) {
    inventoryAdjustmentGroup { createdAt reason }
    userErrors { field message code }
  }
}
```

No inventory mutation was run during this mission. The audit found 123/123 blank SKUs, five negative quantities, 76 untracked variants, 23 CONTINUE policies and mixed size labels. The current Skeleton Crewneck reports five tracked DENY variants at one unit each; none has been physically counted. Use `docs/SHOPIFY_DATA_AUDIT.md` for resource-specific candidates. Re-fetch before acting.

## Backend REST contract

All routes require a verified server session, shop/staff authorization, CSRF protection where cookie auth is used, request validation and an audit record. Mutating routes require an `Idempotency-Key` and an expected version/digest. Never expose tokens in responses. Distinguish saved drafts from writes to Shopify.

| Route | Behavior |
| --- | --- |
| `GET /api/shopify/status` | Verified shop, scopes, selected location, connection state and storefront release gate |
| `GET /api/storefront-controls` | Seven values/types/digests and resolved references; editor draft is separate |
| `PUT /api/storefront-drafts/:id` | Save a private proposal without modifying SHOP metafields |
| `POST /api/storefront-drafts/:id/validate` | Validate fields/reference publication and show a reviewable diff |
| `POST /api/storefront-drafts/:id/publish` | Release gate check; atomic `metafieldsSet` with reviewed digests; re-read verification |
| `POST /api/storefront-controls/disable` | Reviewed master OFF write with fresh digest; idempotent rollback |
| `GET /api/products`, `GET /api/products/:id` | Paginated canonical Shopify data and current versions |
| `PATCH /api/products/:id`, `PATCH /api/products/:id/variants` | Minimal native patches; prohibit stock edits through price/variant routes |
| `POST /api/products/:id/media` | Authenticated staged upload/processing workflow; explicit verified replacement |
| `POST /api/products/:id/publication` | Explicit publish/unpublish for selected publication; separate from saving content |
| `GET /api/inventory/reconciliation` | Read-only canonical quantities, missing SKU, negative/untracked/policy/location issues |
| `POST /api/inventory/counts` | Save a physical count as a private proposal; no Shopify write yet |
| `POST /api/inventory/counts/:id/apply` | Reviewed location-aware CAS correction and outbox/idempotency |
| `POST /api/production/batches`, `POST /api/production/batches/:id/complete` | Private atomic material ledger plus durable finished-stock intent |
| `POST /api/shopify/webhooks` | Raw-body HMAC validation and durable event intake |

Use 400 for validation, 401/403 for auth, 409 for stale state/release gate/idempotency-key payload mismatch, 422 for actionable Shopify userErrors, and 202 only for an actually persisted queued job. UI must show pending, verified, conflict and failed states accurately. “Saved” must not imply customer-visible publication.

## Webhooks and recovery

Subscribe only to needed topics, with pinned API version: `app/uninstalled`, `products/create`, `products/update`, `products/delete`, `collections/create`, `collections/update`, `collections/delete`, `inventory_items/update`, `inventory_levels/update`, `inventory_levels/connect`, `inventory_levels/disconnect`, `locations/update`, `locations/activate`, `locations/deactivate`; add `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create` only if the app actually needs order lifecycle reconciliation. Corresponding GraphQL enum names are uppercase with underscores. Prefer app-config subscriptions supported by the chosen Shopify scaffold.

Verify `X-Shopify-Hmac-Sha256` against the exact raw bytes with a timing-safe comparison before JSON parsing or durable effects. Validate shop identity; deduplicate durably using the event/webhook ID plus shop/topic. Acknowledge promptly after durable intake; process asynchronously. Events can be repeated or out of order: re-fetch authoritative state instead of applying blind deltas. `app/uninstalled` disables jobs and invalidates tokens. Do not log raw customer payloads or over-collect PII. Add a retry/dead-letter view and a scheduled reconciliation job; webhook success alone is not a consistency guarantee.

## Preview, release and rollback

SHOP values are **storewide**, including across published and unpublished themes. Saving a draft is private OPS storage. Preview does not create isolated SHOP values. A URL parameter cannot select production bridge values.

Use a dedicated development shop for real definition/value/ON/OFF and conflict tests. For the production shop, compare OFF on live and ON in the local mock until source alignment and an explicit release plan exist. Upload only to a new/unpublished theme during native QA, preserve the actual live design, and verify its theme role before every file operation. No preview/publish API endpoint should mutate theme files as part of ordinary content edits.

After source and native QA are verified, a separately authorized rollout may populate reviewed content with the flag OFF, then set `theme_enabled=true` as the final controlled change. Re-read, load the actual storefront, and verify resolved text/references and cart. A flag rollback is a fresh-digest write of `false`; this restores theme settings but does not undo product price/status/inventory mutations, which need their own explicit inverses and fresh state. Never delete definitions as a rollback.

## Acceptance and launch checklist

1. Verify shop identity, granted app scopes, location choice, encryption/session authorization and no tokens in client code.
2. Inspect definitions; reuse the seven existing GIDs/types; complete a sandbox value write/read with explicit CAS, including two-editor conflict and create-only conflict. No production sample values.
3. Preserve the published theme's current layout, 412 section, Skeleton images, seasonal behavior and native Shopify commerce while reconciling its source. Read the published manifest evidence before selecting a Git ref.
4. Pass OFF parity, ON copy/reference changes, hostile text, null/unpublished references, sold-out/size/cart flows, no-JS/slow-script behavior, 320/390/desktop checks and native unpublished preview. Record true results and limitations.
5. Validate product price/description/media/status/publication independently on a development product, including failure/read-back handling. No hardcoded product handles in saved references.
6. Pass production ledger/outbox crash recovery, repeated webhook/operation delivery, stale inventory conflict, stock-location mismatch and no double deduction for Shopify orders.
7. Leave production bridge publish disabled until the source/preview gate is satisfied. Keep inventory reconciliation read-only until a physical count and reviewed mappings exist. Complete the private app, including disabled-state explanations, without pretending these merchant steps occurred.

## Primary references checked

- [Metafield ownership and permissions](https://shopify.dev/docs/apps/build/metafields)
- [Liquid metafield objects](https://shopify.dev/docs/api/liquid/objects/metafield)
- [Definition creation, 2026-10](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/metafieldDefinitionCreate)
- [Atomic metafield writes and CAS](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/metafieldsSet)
- [Inventory adjustments](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/inventoryAdjustQuantities)
- [Count corrections](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/inventorySetQuantities)
- [Product update](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/productUpdate)
- [Variant bulk update](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/productVariantsBulkUpdate)
- [Webhooks](https://shopify.dev/docs/apps/build/webhooks)

Live schema discovery checked SHOP ownership, definitions/access inputs, compareDigest, native product/variant inputs, publication objects, inventory inputs and webhook topics. The connector's compatibility validation tool reported “validation skipped”; executed read/definition operations were validated by its execution layer. Do not treat that compatibility response as schema validation of unexecuted mutations.
