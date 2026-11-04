# OPS theme QA and release decision

**NO-GO for production publication.** Local repository integration is verified; the published storefront uses a different theme implementation. No candidate theme was published or merged, and no production metafield values/products/inventory were changed. Seven metadata definitions were created and re-read without values.

## Source and environment

- Baseline: `Rizo-Store/main` at `95b469f44d4400e9f420853efcbf2edc34e601f6`.
- Initial PR #5: `feat/rizo-ops-theme-contract` at `705656ba4faa013a93f1258525e64b3d04db776e`.
- Original GitHub failure: run `41773367199`, job `126387974168`, 35/40 passing; full retrieved log is `ops-theme-qa/original-ci.log`.
- Local comparisons: Node **22.23.4**, Playwright **1.64.1**, LiquidJS **10.30.1**, Theme Check **3.31.0**. Dependencies are now exact with a committed lockfile; CI uses `npm ci` and Node 22.23.4 on ubuntu-24.04.
- Local browser: **Chromium 153.0.8010.0**, an available sandbox binary. Playwright's expected Chromium 156 download returned a truncated archive, so it could not be installed locally. Both baseline and candidate used the same fallback binary. The workflow installs the browser matching the locked Playwright version; hosted results are separate evidence.
- Browser and render timezone: **America/New_York**. Default QA wall time: **2026-10-15T16:00:00Z**; explicit tests cover schedule boundaries, expired timers and multiple visitor timezones. Default tests offset Date while preserving real animation/performance timers; boundary tests use Playwright clock controls.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Original baseline, real November wall clock | 31/37 | `main-original.log` |
| Initial PR test set, real November wall clock | 34/40 | `pr-original.log`; identical six failing test names to baseline |
| Same repaired event suite against baseline source, fixed clocks | 36/37 initially; stochastic rAF setup timed out; targeted deterministic retest 1/1 | `main-fixed.log`, `main-fixed.json`, `main-raf-retest.log` |
| Candidate complete event/commerce/OPS suite | **45/45**, no skipped tests | `candidate-final.log`, `candidate-final.json` |
| Updated deterministic rAF setup, baseline and candidate | **1/1 each** | `main-raf-retest.*`, `candidate-raf-retest.*` |
| Setup/write safety | **6/6**, no skipped tests | `node --test tools/tests/ops-setup.test.mjs` |
| Visual/browser checks with baseline comparison | **16/16** | `visual.log`, `visual-results.json` |
| Theme Check | **0 offenses**, all offenses now fail CI | `theme-check.log` |
| Shopify full-theme validator, changed theme files | **7/7 valid** | `toolkit-liquid-validation-final.log` |
| JS/MJS and JSON syntax | **12 JS/MJS files + 17 JSON files parsed** | `node --check` and JSON parse; Liquid/section schema checks also covered by Theme Check |
| Native unpublished Shopify candidate / actual ON writes | **NOT RUN** | Published source mismatch and no isolated dev-store session |
| Catalog data | **28 products / 123 variants / 1 location**, nested pages exhausted | `SHOPIFY_DATA_AUDIT.md`; no mutations |

The first real-wall-clock comparison was an exploratory reproduction under concurrent CPU load. The PR harness remained the original test set; default storefront behavior was exercised while repository-only fixes were being developed. Treat it as failure-family reproduction, not an immutable original-PR screenshot benchmark. The definitive baseline comparison uses the same repaired harness and pinned dependencies against the untouched baseline worktree, sequentially before the candidate.

### Failure analysis

The five failure families in the original hosted run were all reproduced on `main`:

| Failure | Cause / repair | Product regression? |
| --- | --- | --- |
| Countdown ticks/mutation count | Test ran after the October 31 target; pin the test wall clock inside the intended window | No |
| Hidden-tab countdown resume | Same expired-target assumption, so no running countdown timer existed | No |
| Theme-editor reload timer wait | Same expired-target assumption | No |
| Countdown accessibility tree | Expired message was correct for the real date; test expected an active timer | No |
| Product quiet zone | Assertion read state before asynchronous IntersectionObserver delivery; wait for the actual quiet state before asserting commerce behavior | No |

The concurrent local reproduction also timed out in the existing frame-time governor case on both versions; the sequential fixed-clock runs passed it. A baseline rAF test later timed out while waiting for a random idle group of at least two bats. Its setup now explicitly triggers a real pointer startle, then measures the same animation-loop assertion. Both source versions pass that targeted test. No assertions, failing tests or product limits were removed or relaxed.

The candidate complete 45-case run passed before that last rAF setup-only change; the changed case was then retested against both baseline and candidate. The PR workflow runs the complete current suite.

### Browser coverage

- Missing/false OPS master flag ignores unapproved copy, collection and feature references.
- ON heading, intro, CTA label, announcement and collection; native homepage feature plus optional hero consumer.
- Valid empty collection versus missing/invalid reference fallback; missing, draft and archived products do not produce blank/buyable features.
- HTML/script payloads render as text; intro newlines survive; active seasonal announcement wins and OPS text returns when it ends.
- Native feature images, prices and forms; deduplication; sold-out state; variant selection; quick add; cart drawer; cart page; mock checkout handoff; no-JS form and delayed theme script.
- Event scheduling, countdown target/expiry/timezones, hidden-tab behavior, editor reloads, reduced motion, keyboard order, pointer safety, flock limits, animation loop and degradation governor.
- Every supported page type with event ON; 320/375/390/430, landscape, tablet and desktop overflow checks. Separate strict checks compare mobile `innerWidth` and `scrollWidth` to the **configured viewport width**, avoiding the old false-negative where both expanded together.

The test harness approximates Shopify using LiquidJS and mocked Shopify endpoints/catalog. It does not verify Shopify's hosted checkout, taxes, shipping rates, API conflict behavior on a real sandbox, actual print/product details, Lighthouse scores, or actual production storefront ON rendering. CPU headless frame samples are diagnostics, not device performance guarantees.

## Screenshots and parity

Homepage OFF screenshot bytes match `main` at 320, 390 and 1440 pixels. Missing and explicit false values also match. Product/collection differences are intentional overflow repairs: the baseline product viewport expanded by **18px** at narrow widths; the 320px collection expanded by **7px**. Candidate strict viewport checks pass. The gallery remains horizontally scrollable inside its own container; overflow is not hidden on the document to mask problems.

Representative stored screenshots:

- [390px homepage OFF](ops-theme-qa/390-home-off.png)
- [1440px homepage OFF](ops-theme-qa/1440-home-off.jpg)
- [390px native OPS feature](ops-theme-qa/390-feature-on.png)
- [320px product before](ops-theme-qa/320-baseline-product.png) / [after](ops-theme-qa/320-product.png)
- [320px collection before](ops-theme-qa/320-baseline-collection.png) / [after](ops-theme-qa/320-collection.png)

These are local mock-catalog images using existing Rizo photography. For example, the mock “Flame Cap” uses a fixture gym photo; this is not a claim about the real product's photography. Production product/media fidelity requires the native-preview stage after source reconciliation.

## Shopify state and source evidence

Definitions: **YES**, seven created under merchant-owned SHOP `rizo_ops`, admin access `PUBLIC_READ_WRITE`, Storefront API access `NONE`. Values changed: **NO**. Products/stock/locations changed: **NO**. Theme files/publish/merge changed: **NO**. The published theme ID remained `155243118670`, role `MAIN`, after definition creation. The exact create inputs and re-read result are in `definition-setup-verification.json`.

The current published theme's 146-file manifest is in `published-source-manifest.json`. Only 25 files match Git main. Its actual `templates/index.json` and settings were read through Admin GraphQL; the rendered section types differ, with live Skeleton and 412 modules missing from main. Other available branches were compared and none matched all published checksums. Do not mistake the theme name “review only” for an unpublished role. No verified GitHub-to-MAIN deployment relationship was found.

Official documentation and live schema discovery verified merchant ownership/access, typed Liquid reference values, `compareDigest` operations, product/variant inputs, inventory CAS/idempotency inputs and webhook topics. The connector's legacy `validate_graphql_codeblocks` returned “validation skipped”; read/definition operations were validated by its execution layer. The separate toolkit's GraphQL validator could not load its packaged Admin schema asset in this environment, so unexecuted sample inventory mutations were checked against discovered types/fields rather than falsely reported as a complete offline schema-validation pass.

## Reproduction

```bash
cd tools
npm ci
npx playwright install --with-deps chromium
npm run check
npm test
```

`npm test` runs six setup safety tests, 45 event/commerce/OPS cases and 13 visual/browser checks. With `BASELINE_THEME_DIR` pointing to a separate main checkout, the visual runner adds three main screenshot parity checks (16 total). `CHROMIUM_EXECUTABLE_PATH` optionally selects an existing browser; otherwise Playwright uses its locked browser. `QA_RESULTS` writes the event suite JSON. Artifacts go to ignored `tools/qa-artifacts/` and are uploaded by CI even on failure.

To compare the same repaired event harness with baseline Liquid/assets: set `THEME_DIR` to the untouched baseline checkout and run `npm run test:event -- '^(?!OPS)'`. This selects the original 37 event/storefront cases; OPS-only cases are intentionally excluded because baseline has no bridge. For the stochastic-setup repair, run `npm run test:event -- '^Exactly one animation'` on each tree through that same harness.

GitHub Actions runs on **every PR**, including documentation-only changes, plus manual dispatch. It uses pinned Node/dependency versions, lockfile cache keys and artifact retention. Assess the hosted check attached to the exact PR head; this document does not substitute local fallback-browser evidence for hosted status.

## Remaining release gates

1. **Source mismatch:** Shopify Admin → Online Store → Themes → Current theme (`155243118670`) → download/export. Reconcile current source/settings and port consumers into its real sections on PR #5. Preserve live Skeleton/412/media/event/cart behavior. Do not publish this older tree as a shortcut.
2. **Native integration evidence:** use a dedicated dev store for actual metafield ON/OFF/CAS tests, then an unpublished candidate of the reconciled current design for native rendering/cart/media/mobile checks. No isolated dev-store credentials were available in this session. SHOP metafields are storewide even for unpublished themes.
3. **Release authorization:** verify the connected Shopify GitHub branch and explicit deployment path before merging/publishing or enabling production values. Physical inventory reconciliation is a separate reviewed workflow; it is not a prerequisite for creating the private app in read-only mode.

The private backend can now implement the stable contract, native product operations and reviewed inventory workflows using `RIZO_OPS_APP_HANDOFF.md`, while keeping production bridge enable gated.
