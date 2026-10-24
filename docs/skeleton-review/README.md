# Skeleton drop — implementation and release state

## Where to review

- Native Shopify preview: https://rizo.store/?preview_theme_id=155243118670
- Product: https://rizo.store/products/raging-skeleton-crewneck-reworked
- Archive preview: https://rizo.store/pages/outside?preview_theme_id=155243118670
- Preview theme: **RIZO Skeleton — review only**, ID 155243118670, UNPUBLISHED.
- Original live theme: **Rizo v7.5 — October launch**, ID 154284458062. Not modified or replaced.

## Implementation

One editorial section between the existing hero and shop grid. Uses the approved lifestyle portrait, full front/back photos, existing fonts, colors and buttons. No new animation JavaScript. Responsive Shopify image URLs and lazy loading. Product-specific gallery containment avoids mobile crops. Locked product UI shows sizes and price without a purchase form. No unrelated product design changes.

Repository branch `feat/skeleton-drop-presentation` starts at `bf99e5a` on `claude/rizo-creative-overhaul-abh05a`, the newest storefront development branch; this repository has no `develop` branch. `main` is the older Rizo Portal theme.

**The live October theme is newer than the repository. Do not upload this repository wholesale.** The native preview was duplicated from the live theme, then only ten scoped files were updated. `current-theme.patch` records that exact delta; `staged-files.json` records before/after checksums. `tools/preview/stage-skeleton.py` rebuilds those ten files from a current theme export and fails when a code patch anchor differs. It preserves existing homepage sections, art blocks, 412 content and saved settings.

Additional polish in that native preview: the editorial photo appears once in the existing worn archive; only this product uses the editorial sharing image; native Shopify ProductGroup JSON-LD supplies all five sizes, $39.99 USD and truthful out-of-stock offers. Existing canonical, Open Graph and Twitter machinery is reused. The seven product photographs remain in their original order.

## Latest user authorization and product state

The follow-up explicitly authorized publishing the draft product. Product 8164322508878 is now ACTIVE and published to the Online Store channel only. Price $39.99 and sizes S/M/L/XL/2XL are unchanged. Dedicated SEO title and meta description were saved, and the description was tightened using verified material and construction specifications. No invented size measurements, cotton percentage, delivery promise, reviews or scarcity.

The five units were explicitly described as planned stock, not fully received. Before publishing, their available counts were corrected from one per size to zero per size, using compare-and-set checks. Inventory tracking remains on and every variant retains DENY inventory policy. Description explains that ordering has not opened. This is a published discovery page, **not an open sale**.

## Controls and next release step

- `skeleton_feature_enabled`: shows the editorial section only for the published target product. Defaults false in source; true in the unpublished review theme.
- `skeleton_launch_enabled`: allows the normal product purchase UI only for the published target product. False in the review theme. Confirm physically received quantities before enabling.
- Shopify inventory is the authoritative checkout protection; theme flags alone are not a server-side stock rule.
- The Shopify connector supports edits to unpublished themes but blocks theme publishing. To make the reviewed presentation live, publish **RIZO Skeleton — review only** in Shopify admin. No production merge was made.
- When units are received, set the actual quantity for each size, remove the temporary availability paragraph, and enable purchasing. Do not restore all five based on this plan alone.

## Verification

All 39 existing event-layer and commerce regression checks passed after updating the local preview image mapping. Total: 66 local Skeleton checks + 50 native Shopify checks + 39 regression checks = 155 passing checks.

`tools/tests/skeleton.test.mjs`: 66 local browser checks, including 320/375/390/430/1440 widths, gate combinations, missing/wrong product, whole-image rendering, seven-image gallery, zoom/Escape, and simulated release cart flow. No real order or checkout was created.

`tools/tests/skeleton-storefront.mjs`: 50 passed read-only native Shopify checks and screenshots against the unpublished theme; results in the accompanying native-checks.json.

Shopify Liquid validation: all six repository theme files passed. All ten staged files also passed Shopify validation (one existing AMP include deprecation warning was preserved). Native Shopify accepted all ten staged files without user errors. Current homepage section values and existing saved theme settings were checked for exact preservation.

Local preview: `cd tools && npm ci && npm run preview:skeleton`, then open `http://localhost:9292/?fixture=skeleton&design_mode=1`. Run `npm run test:skeleton` to reproduce the local checks. Approved photographs are downloaded from the existing Shopify CDN into ignored preview files; no generated or replacement product photography is used.
