# Shopify data audit and RECONCILIATION_CANDIDATES

Read-only Shopify Admin inspection, November 4, 2026. No product, option, SKU, location, publication or quantity changes were made. Every quantity is a Shopify observation, not a physical count. Re-fetch before acting.

## Coverage

- 28 products and 123 variants; every product, variant and inventory-level page was exhausted. Maximum six variants on a product; no truncated nested pages.
- One active, online-fulfilling location: `gid://shopify/Location/35066216526`. Its historical label needs owner confirmation against the actual stock location; the address is intentionally omitted from this public repository.
- All 123 variants have blank SKUs. No duplicate nonempty SKUs were observed; this does not mean identifiers are clean.
- Five variants have negative aggregate quantities; 95 report zero. Seventy-six are untracked. Twenty-three use CONTINUE (overselling), which may be intentional for past presales.
- Two products are DRAFT. Seventeen ACTIVE products have no Online Store URL in this read; treat this as a publication review candidate, not proof that they should be published.
- Size values include `S`, `Small`, `M`, `Medium`, `L`, `Large`, `XL`, `Extra Large`, `2XL`, `2 XL`, `3XL`, and `OSFM`. Preserve Shopify option values/GIDs until reviewed.

## Current Skeleton product, distinguished from the old draft

The current `RIZO Skeleton Crewneck` is `gid://shopify/Product/8164322508878`, ACTIVE with an Online Store URL. Its five S/M/L/XL/2XL variants are tracked, DENY, and report one unit each. They have not been physically counted. The similarly named `RAGING Skeleton Sweat Shirt`, `gid://shopify/Product/6831439315022`, is a separate DRAFT legacy product with different variants and negative observations. Do not link production to it by title similarity.

| Size | ProductVariant GID | InventoryItem GID | Location GID |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/44655369420878` | `gid://shopify/InventoryItem/46787047522382` | `gid://shopify/Location/35066216526` |
| M | `gid://shopify/ProductVariant/44655422210126` | `gid://shopify/InventoryItem/46787100639310` | `gid://shopify/Location/35066216526` |
| L | `gid://shopify/ProductVariant/44655422242894` | `gid://shopify/InventoryItem/46787100672078` | `gid://shopify/Location/35066216526` |
| XL | `gid://shopify/ProductVariant/44655422275662` | `gid://shopify/InventoryItem/46787100704846` | `gid://shopify/Location/35066216526` |
| 2XL | `gid://shopify/ProductVariant/44655422308430` | `gid://shopify/InventoryItem/46787100737614` | `gid://shopify/Location/35066216526` |

## Candidate actions (proposals only)

| Code | Observation | Safe proposed next step |
| --- | --- | --- |
| SKU | Missing SKU | Propose a unique readable identifier in OPS; review before assignment. Preserve existing GID mapping. Never infer a SKU from size/title alone. |
| NEG | Negative reported quantity | Compare available/on_hand/committed and order history, physically count, then propose a location-specific CAS correction. Never clamp to zero automatically. |
| ZERO | Zero reported quantity | Confirm sold-out, stale data or intentional untracked operation; do not automatically restock. |
| UNTRACKED | InventoryItem.tracked=false | Confirm whether custom order/presale or counted stock; do not toggle tracking without reviewed business intent. |
| CONTINUE | Overselling permitted | Confirm intentional preorder/made-to-order policy before proposing DENY. |
| SIZE | Noncanonical size spelling | Normalize only inside the private app display/mapping initially; keep original Shopify option text and identities. |
| PUB | ACTIVE with no Online Store URL | Inspect channel publication, product intent and status. Publish only with an explicit decision. |
| DRAFT | Draft product | Keep hidden; verify whether legacy/archive rather than activating automatically. |

SKU suggestions, counted corrections and label/policy/publication changes require separate review. Historical negative/untracked observations do not authorize updates. The full tuple is Shop → Product → Variant → InventoryItem → Location. Native Shopify is the finished-stock authority; the app must not subtract online order stock a second time.

## Product overview

| Product | Product GID | State | Variants | Publication review |
| --- | --- | --- | --- | --- |
| Beauty of Thee Flame T-Shirt | `gid://shopify/Product/4949618262094` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Beauty of Thee Flame T-Shirt | `gid://shopify/Product/6536726511694` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Beauty of Thee Flame (graphic tee) | `gid://shopify/Product/6553870303310` | ACTIVE | 1 | No Online Store URL; inspect intent/channels |
| Distressed Beauty of Thee Flame T-Shirt | `gid://shopify/Product/6593153335374` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Pink Tie-Dye | `gid://shopify/Product/6633206808654` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Bleach Tie-Dye | `gid://shopify/Product/6633242263630` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Grey Tie-Dye | `gid://shopify/Product/6650294337614` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Purple Tie-Dye | `gid://shopify/Product/6650294599758` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Light Blue Tie-Dye | `gid://shopify/Product/6650294960206` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Pink Tie-Dye | `gid://shopify/Product/6650979254350` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Skull T-Shirt | `gid://shopify/Product/6650983809102` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Rizo Skull Shorts | `gid://shopify/Product/6650984464462` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| "Y'all Got me Hot" T-Shirt | `gid://shopify/Product/6650987610190` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| "Y'all Got me Hot" Blue Hoodie | `gid://shopify/Product/6735770222670` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| "Y'all Got me Hot" Red Hoodie | `gid://shopify/Product/6736367812686` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Passion Sweat Pants | `gid://shopify/Product/6812017688654` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| Passion Sweat Shirt | `gid://shopify/Product/6812095840334` | ACTIVE | 4 | No Online Store URL; inspect intent/channels |
| RAGING Skeleton Sweat Shirt | `gid://shopify/Product/6831439315022` | DRAFT | 5 | No Online Store URL; inspect intent/channels |
| Official '412' Rizo Hoodie | `gid://shopify/Product/6849311375438` | ACTIVE | 6 | Online Store URL present |
| Official '412' Rizo Beanie | `gid://shopify/Product/6849694662734` | DRAFT | 1 | No Online Store URL; inspect intent/channels |
| Grim RIZO Deluxe Tee | `gid://shopify/Product/7242622009422` | ACTIVE | 5 | Online Store URL present |
| Rizo “I Love You More Than Art” Zip-Up Hoodie — Preorder | `gid://shopify/Product/7828511948878` | UNLISTED | 6 | Online Store URL present |
| Limited Valentine Rizo Shirt | `gid://shopify/Product/7828571586638` | UNLISTED | 6 | Online Store URL present |
| Pastel Blue ‘Rizo’ Hoodie | `gid://shopify/Product/7870967316558` | ACTIVE | 6 | Online Store URL present |
| Pastel Pink ‘Rizo’ Hoodie | `gid://shopify/Product/7870968234062` | ACTIVE | 6 | Online Store URL present |
| Pastel Purple ‘Rizo’ Hoodie | `gid://shopify/Product/7870968332366` | ACTIVE | 6 | Online Store URL present |
| Gold ‘Rizo’ Hoodie | `gid://shopify/Product/7891189334094` | ACTIVE | 6 | Online Store URL present |
| RIZO Skeleton Crewneck | `gid://shopify/Product/8164322508878` | ACTIVE | 5 | Online Store URL present |

## Resource-specific reconciliation candidates

All rows include SKU because none has an assigned SKU. Codes reference the safe proposals above. Quantity numbers are omitted from this public per-variant mapping; re-fetch private current quantities in OPS before presenting a proposed correction. The common location is `gid://shopify/Location/35066216526`; every observed level in this audit maps there.

### Beauty of Thee Flame T-Shirt

Product `gid://shopify/Product/4949618262094`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/32890235846734` | `gid://shopify/InventoryItem/35104088916046` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/32890235879502` | `gid://shopify/InventoryItem/35104088948814` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/32890235912270` | `gid://shopify/InventoryItem/35104088981582` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/32890235945038` | `gid://shopify/InventoryItem/35104089014350` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Beauty of Thee Flame T-Shirt

Product `gid://shopify/Product/6536726511694`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/39248849928270` | `gid://shopify/InventoryItem/41342740365390` | SKU, ZERO, UNTRACKED, PUB |
| M | `gid://shopify/ProductVariant/39248849961038` | `gid://shopify/InventoryItem/41342740398158` | SKU, ZERO, UNTRACKED, PUB |
| L | `gid://shopify/ProductVariant/39248849993806` | `gid://shopify/InventoryItem/41342740430926` | SKU, ZERO, UNTRACKED, PUB |
| XL | `gid://shopify/ProductVariant/39248850026574` | `gid://shopify/InventoryItem/41342740463694` | SKU, ZERO, UNTRACKED, PUB |

### Beauty of Thee Flame (graphic tee)

Product `gid://shopify/Product/6553870303310`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Default Title | `gid://shopify/ProductVariant/39284323352654` | `gid://shopify/InventoryItem/41378221981774` | SKU, ZERO, UNTRACKED, PUB |

### Distressed Beauty of Thee Flame T-Shirt

Product `gid://shopify/Product/6593153335374`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/39351732502606` | `gid://shopify/InventoryItem/41445787074638` | SKU, ZERO, UNTRACKED, PUB |
| M | `gid://shopify/ProductVariant/39351732535374` | `gid://shopify/InventoryItem/41445787107406` | SKU, ZERO, UNTRACKED, PUB |
| L | `gid://shopify/ProductVariant/39351732568142` | `gid://shopify/InventoryItem/41445787140174` | SKU, ZERO, UNTRACKED, PUB |
| XL | `gid://shopify/ProductVariant/39351732600910` | `gid://shopify/InventoryItem/41445787172942` | SKU, ZERO, UNTRACKED, PUB |

### Rizo Pink Tie-Dye

Product `gid://shopify/Product/6633206808654`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39455418646606` | `gid://shopify/InventoryItem/41549730086990` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39455418679374` | `gid://shopify/InventoryItem/41549730119758` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39455418712142` | `gid://shopify/InventoryItem/41549730152526` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39455418744910` | `gid://shopify/InventoryItem/41549730185294` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Rizo Bleach Tie-Dye

Product `gid://shopify/Product/6633242263630`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39455501320270` | `gid://shopify/InventoryItem/41549812727886` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39455501353038` | `gid://shopify/InventoryItem/41549812760654` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39455501385806` | `gid://shopify/InventoryItem/41549812793422` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39455501418574` | `gid://shopify/InventoryItem/41549812826190` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Rizo Grey Tie-Dye

Product `gid://shopify/Product/6650294337614`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39501073317966` | `gid://shopify/InventoryItem/41595532443726` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39501073350734` | `gid://shopify/InventoryItem/41595532476494` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39501073383502` | `gid://shopify/InventoryItem/41595532509262` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39501073416270` | `gid://shopify/InventoryItem/41595532542030` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Rizo Purple Tie-Dye

Product `gid://shopify/Product/6650294599758`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39501073711182` | `gid://shopify/InventoryItem/41595532836942` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39501073743950` | `gid://shopify/InventoryItem/41595532869710` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39501073776718` | `gid://shopify/InventoryItem/41595532902478` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39501073809486` | `gid://shopify/InventoryItem/41595532935246` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Rizo Light Blue Tie-Dye

Product `gid://shopify/Product/6650294960206`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39501074169934` | `gid://shopify/InventoryItem/41595533295694` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39501074202702` | `gid://shopify/InventoryItem/41595533328462` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39501074235470` | `gid://shopify/InventoryItem/41595533361230` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39501074268238` | `gid://shopify/InventoryItem/41595533393998` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Rizo Pink Tie-Dye

Product `gid://shopify/Product/6650979254350`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39502770307150` | `gid://shopify/InventoryItem/41597229695054` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39502770339918` | `gid://shopify/InventoryItem/41597229727822` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39502770372686` | `gid://shopify/InventoryItem/41597229760590` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39502770405454` | `gid://shopify/InventoryItem/41597229793358` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Rizo Skull T-Shirt

Product `gid://shopify/Product/6650983809102`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39502778564686` | `gid://shopify/InventoryItem/41597237952590` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39502778597454` | `gid://shopify/InventoryItem/41597237985358` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39502778630222` | `gid://shopify/InventoryItem/41597238018126` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39502778662990` | `gid://shopify/InventoryItem/41597238050894` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Rizo Skull Shorts

Product `gid://shopify/Product/6650984464462`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39502780366926` | `gid://shopify/InventoryItem/41597239754830` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39502780399694` | `gid://shopify/InventoryItem/41597239787598` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39502780432462` | `gid://shopify/InventoryItem/41597239820366` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39502780465230` | `gid://shopify/InventoryItem/41597239853134` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### "Y'all Got me Hot" T-Shirt

Product `gid://shopify/Product/6650987610190`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39502788591694` | `gid://shopify/InventoryItem/41597247979598` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39502788624462` | `gid://shopify/InventoryItem/41597248012366` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39502788657230` | `gid://shopify/InventoryItem/41597248045134` | SKU, NEG, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39502788689998` | `gid://shopify/InventoryItem/41597248077902` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### "Y'all Got me Hot" Blue Hoodie

Product `gid://shopify/Product/6735770222670`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39778321236046` | `gid://shopify/InventoryItem/41873466261582` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39778321268814` | `gid://shopify/InventoryItem/41873466294350` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39778321301582` | `gid://shopify/InventoryItem/41873466327118` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39778321334350` | `gid://shopify/InventoryItem/41873466359886` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### "Y'all Got me Hot" Red Hoodie

Product `gid://shopify/Product/6736367812686`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/39780373463118` | `gid://shopify/InventoryItem/41875518357582` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/39780373495886` | `gid://shopify/InventoryItem/41875518390350` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/39780373528654` | `gid://shopify/InventoryItem/41875518423118` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/39780373561422` | `gid://shopify/InventoryItem/41875518455886` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Passion Sweat Pants

Product `gid://shopify/Product/6812017688654`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/40020500447310` | `gid://shopify/InventoryItem/42115981246542` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/40020500480078` | `gid://shopify/InventoryItem/42115981279310` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/40020500512846` | `gid://shopify/InventoryItem/42115981312078` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/40020500545614` | `gid://shopify/InventoryItem/42115981344846` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### Passion Sweat Shirt

Product `gid://shopify/Product/6812095840334`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/40020662485070` | `gid://shopify/InventoryItem/42116143317070` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Medium | `gid://shopify/ProductVariant/40020662517838` | `gid://shopify/InventoryItem/42116143349838` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Large | `gid://shopify/ProductVariant/40020662550606` | `gid://shopify/InventoryItem/42116143382606` | SKU, ZERO, UNTRACKED, SIZE, PUB |
| Extra Large | `gid://shopify/ProductVariant/40020662583374` | `gid://shopify/InventoryItem/42116143415374` | SKU, ZERO, UNTRACKED, SIZE, PUB |

### RAGING Skeleton Sweat Shirt

Product `gid://shopify/Product/6831439315022`. Status DRAFT.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/40077289324622` | `gid://shopify/InventoryItem/42173092134990` | SKU, ZERO, UNTRACKED, SIZE, DRAFT |
| Medium | `gid://shopify/ProductVariant/40077289357390` | `gid://shopify/InventoryItem/42173092167758` | SKU, NEG, UNTRACKED, SIZE, DRAFT |
| Large | `gid://shopify/ProductVariant/40077289390158` | `gid://shopify/InventoryItem/42173092200526` | SKU, NEG, UNTRACKED, SIZE, DRAFT |
| Extra Large | `gid://shopify/ProductVariant/40077289422926` | `gid://shopify/InventoryItem/42173092233294` | SKU, ZERO, UNTRACKED, SIZE, DRAFT |
| 2 XL | `gid://shopify/ProductVariant/40077305839694` | `gid://shopify/InventoryItem/42173108650062` | SKU, ZERO, UNTRACKED, SIZE, DRAFT |

### Official '412' Rizo Hoodie

Product `gid://shopify/Product/6849311375438`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/40154900365390` | `gid://shopify/InventoryItem/42250808754254` | SKU, SIZE |
| Medium | `gid://shopify/ProductVariant/40154900398158` | `gid://shopify/InventoryItem/42250808787022` | SKU, SIZE |
| Large | `gid://shopify/ProductVariant/40154900430926` | `gid://shopify/InventoryItem/42250808819790` | SKU, SIZE |
| Extra Large | `gid://shopify/ProductVariant/40154900463694` | `gid://shopify/InventoryItem/42250808852558` | SKU, SIZE |
| 2XL | `gid://shopify/ProductVariant/40154900529230` | `gid://shopify/InventoryItem/42250808918094` | SKU |
| 3XL | `gid://shopify/ProductVariant/40154900561998` | `gid://shopify/InventoryItem/42250808950862` | SKU |

### Official '412' Rizo Beanie

Product `gid://shopify/Product/6849694662734`. Status DRAFT.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| OSFM | `gid://shopify/ProductVariant/40156402614350` | `gid://shopify/InventoryItem/42252309659726` | SKU, ZERO, UNTRACKED, DRAFT |

### Grim RIZO Deluxe Tee

Product `gid://shopify/Product/7242622009422`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| Small | `gid://shopify/ProductVariant/41226211164238` | `gid://shopify/InventoryItem/43321902792782` | SKU, ZERO, UNTRACKED, SIZE |
| Medium | `gid://shopify/ProductVariant/41226211295310` | `gid://shopify/InventoryItem/43321902825550` | SKU, NEG, UNTRACKED, SIZE |
| Large | `gid://shopify/ProductVariant/41226211360846` | `gid://shopify/InventoryItem/43321902858318` | SKU, NEG, UNTRACKED, SIZE |
| Extra Large | `gid://shopify/ProductVariant/41226211393614` | `gid://shopify/InventoryItem/43321902891086` | SKU, ZERO, UNTRACKED, SIZE |
| 2 XL | `gid://shopify/ProductVariant/41226211426382` | `gid://shopify/InventoryItem/43321902923854` | SKU, ZERO, UNTRACKED, SIZE |

### Rizo “I Love You More Than Art” Zip-Up Hoodie — Preorder

Product `gid://shopify/Product/7828511948878`. Status UNLISTED.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/43445616279630` | `gid://shopify/InventoryItem/45547714019406` | SKU |
| M | `gid://shopify/ProductVariant/43445616312398` | `gid://shopify/InventoryItem/45547714052174` | SKU |
| L | `gid://shopify/ProductVariant/43445616345166` | `gid://shopify/InventoryItem/45547714084942` | SKU |
| XL | `gid://shopify/ProductVariant/43445616377934` | `gid://shopify/InventoryItem/45547714117710` | SKU |
| 2XL | `gid://shopify/ProductVariant/43445616410702` | `gid://shopify/InventoryItem/45547714150478` | SKU |
| 3XL | `gid://shopify/ProductVariant/43445616443470` | `gid://shopify/InventoryItem/45547714183246` | SKU |

### Limited Valentine Rizo Shirt

Product `gid://shopify/Product/7828571586638`. Status UNLISTED.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/43445827797070` | `gid://shopify/InventoryItem/45547925733454` | SKU |
| M | `gid://shopify/ProductVariant/43445827829838` | `gid://shopify/InventoryItem/45547925766222` | SKU |
| L | `gid://shopify/ProductVariant/43445827862606` | `gid://shopify/InventoryItem/45547925798990` | SKU |
| XL | `gid://shopify/ProductVariant/43445827895374` | `gid://shopify/InventoryItem/45547925831758` | SKU |
| XXL | `gid://shopify/ProductVariant/43445827928142` | `gid://shopify/InventoryItem/45547925864526` | SKU |
| 3XL | `gid://shopify/ProductVariant/43445827960910` | `gid://shopify/InventoryItem/45547925897294` | SKU |

### Pastel Blue ‘Rizo’ Hoodie

Product `gid://shopify/Product/7870967316558`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/43607983816782` | `gid://shopify/InventoryItem/45712287563854` | SKU, ZERO, CONTINUE |
| M | `gid://shopify/ProductVariant/43607983849550` | `gid://shopify/InventoryItem/45712287596622` | SKU, ZERO |
| L | `gid://shopify/ProductVariant/43607983882318` | `gid://shopify/InventoryItem/45712287629390` | SKU, ZERO, CONTINUE |
| XL | `gid://shopify/ProductVariant/43607983915086` | `gid://shopify/InventoryItem/45712287662158` | SKU, ZERO, CONTINUE |
| XXL | `gid://shopify/ProductVariant/43607983947854` | `gid://shopify/InventoryItem/45712287694926` | SKU, ZERO, CONTINUE |
| 3XL | `gid://shopify/ProductVariant/43607983980622` | `gid://shopify/InventoryItem/45712287727694` | SKU, ZERO, CONTINUE |

### Pastel Pink ‘Rizo’ Hoodie

Product `gid://shopify/Product/7870968234062`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/43608009048142` | `gid://shopify/InventoryItem/45712313155662` | SKU, ZERO, CONTINUE |
| M | `gid://shopify/ProductVariant/43608009080910` | `gid://shopify/InventoryItem/45712313188430` | SKU, ZERO, CONTINUE |
| L | `gid://shopify/ProductVariant/43608009113678` | `gid://shopify/InventoryItem/45712313221198` | SKU, ZERO, CONTINUE |
| XL | `gid://shopify/ProductVariant/43608009146446` | `gid://shopify/InventoryItem/45712313253966` | SKU, ZERO, CONTINUE |
| XXL | `gid://shopify/ProductVariant/43608009179214` | `gid://shopify/InventoryItem/45712313286734` | SKU, ZERO, CONTINUE |
| 3XL | `gid://shopify/ProductVariant/43608009211982` | `gid://shopify/InventoryItem/45712313319502` | SKU, ZERO, CONTINUE |

### Pastel Purple ‘Rizo’ Hoodie

Product `gid://shopify/Product/7870968332366`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/43608009310286` | `gid://shopify/InventoryItem/45712313417806` | SKU, ZERO, CONTINUE |
| M | `gid://shopify/ProductVariant/43608009343054` | `gid://shopify/InventoryItem/45712313450574` | SKU, ZERO, CONTINUE |
| L | `gid://shopify/ProductVariant/43608009375822` | `gid://shopify/InventoryItem/45712313483342` | SKU, ZERO, CONTINUE |
| XL | `gid://shopify/ProductVariant/43608009408590` | `gid://shopify/InventoryItem/45712313516110` | SKU, ZERO, CONTINUE |
| XXL | `gid://shopify/ProductVariant/43608009441358` | `gid://shopify/InventoryItem/45712313548878` | SKU, ZERO, CONTINUE |
| 3XL | `gid://shopify/ProductVariant/43608009474126` | `gid://shopify/InventoryItem/45712313581646` | SKU, ZERO, CONTINUE |

### Gold ‘Rizo’ Hoodie

Product `gid://shopify/Product/7891189334094`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/43673941770318` | `gid://shopify/InventoryItem/45779960266830` | SKU, ZERO, CONTINUE |
| M | `gid://shopify/ProductVariant/43673941803086` | `gid://shopify/InventoryItem/45779960299598` | SKU, ZERO, CONTINUE |
| L | `gid://shopify/ProductVariant/43673941835854` | `gid://shopify/InventoryItem/45779960332366` | SKU, ZERO, CONTINUE |
| XL | `gid://shopify/ProductVariant/43673941868622` | `gid://shopify/InventoryItem/45779960365134` | SKU, ZERO, CONTINUE |
| XXL | `gid://shopify/ProductVariant/43673941901390` | `gid://shopify/InventoryItem/45779960397902` | SKU, ZERO, CONTINUE |
| 3XL | `gid://shopify/ProductVariant/43673941934158` | `gid://shopify/InventoryItem/45779960430670` | SKU, ZERO, CONTINUE |

### RIZO Skeleton Crewneck

Product `gid://shopify/Product/8164322508878`. Status ACTIVE.

| Variant / original size | ProductVariant GID | InventoryItem GID | Candidate codes |
| --- | --- | --- | --- |
| S | `gid://shopify/ProductVariant/44655369420878` | `gid://shopify/InventoryItem/46787047522382` | SKU |
| M | `gid://shopify/ProductVariant/44655422210126` | `gid://shopify/InventoryItem/46787100639310` | SKU |
| L | `gid://shopify/ProductVariant/44655422242894` | `gid://shopify/InventoryItem/46787100672078` | SKU |
| XL | `gid://shopify/ProductVariant/44655422275662` | `gid://shopify/InventoryItem/46787100704846` | SKU |
| 2XL | `gid://shopify/ProductVariant/44655422308430` | `gid://shopify/InventoryItem/46787100737614` | SKU |

## Apply sequence after review

1. Confirm physical storage/fulfillment location and choose the canonical Shopify location explicitly.
2. Import these identities read-only; flag unresolved SKU/size/publication issues. Re-read all current data with nested pagination.
3. Record physical counts and business intent privately. Review a before/after proposal per item/location; preserve active commitments.
4. Apply only approved changes through idempotent, location-aware Admin GraphQL operations with 2026-10 `changeFromQuantity` checks. Preserve the operation key on retries; report conflicts.
5. Re-read Shopify and record verification in an audit log. Do not treat theme screenshots, Shopify quantity observations or passing mocks as physical evidence.

See `RIZO_OPS_APP_HANDOFF.md` for exact API/auth/sync boundaries.
