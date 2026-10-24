import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = process.env.REVIEW_DIR || '/tmp/rizo-skeleton-review';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const page = await browser.newPage({ ignoreHTTPSErrors: true, reducedMotion: 'reduce' });
const checks = [];
const verify = (name, value) => { assert.ok(value, name); checks.push({ name, passed: true }); };
const origin = 'https://rizo.store';
const preview = '?preview_theme_id=155243118670';
const product = '/products/raging-skeleton-crewneck-reworked';
const currentProduct = await (await page.request.get(origin + product + '.js')).json();
const hideChrome = '.header,.dock,.skip-link,iframe,[id*="preview-bar"],[class*="preview-bar"],shopify-preview-bar { visibility:hidden!important }';
try {
  for (const width of [320,375,390,430,1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(origin + '/' + preview, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    verify(`Native unpublished theme ${width}`, await page.evaluate(() => Shopify.theme.id === 155243118670 && Shopify.theme.role === 'unpublished'));
    await page.locator('.skeleton-drop').scrollIntoViewIfNeeded();
    verify(`Native homepage fits ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    verify(`Native price ${width}`, (await page.locator('.skeleton-meta').textContent()).includes('$39.99'));
    await page.locator('.skeleton-drop img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    if ([390,1440].includes(width)) {
      await page.setViewportSize({ width, height: 1800 });
      await page.locator('.skeleton-drop').scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.skeleton-drop').screenshot({ path: `${out}/Skeleton-${width === 1440 ? 'Desktop' : 'Mobile'}.png`, style: hideChrome });
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    }
    await page.locator('.skeleton-link').click();
    await page.waitForURL('**/products/raging-skeleton-crewneck-reworked**');
    verify(`Discovery reaches product ${width}`, await page.locator('.pdp-title').textContent() === 'RIZO Skeleton Crewneck');
    verify(`Native product fits ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    verify(`No purchase controls ${width}`, !await page.locator('[data-product-form], [data-sticky-atc], [name="id"]').count());
    verify(`All current product images ${width}`, await page.locator('.pdp-media').count() === currentProduct.images.length);
    verify(`Native gallery contains whole image ${width}`, await page.locator('.pdp-media img').first().evaluate(i => getComputedStyle(i).objectFit === 'contain'));
    await page.locator('[data-media-zoom]').first().click();
    verify(`Native full-size viewer ${width}`, await page.locator('[data-overlay="product-media"]').isVisible());
    await page.keyboard.press('Escape');
    if (width === 390) await page.locator('.pdp').screenshot({ path: `${out}/Skeleton-Product-Mobile.png`, style: hideChrome });
  }
  verify('SEO title renders', (await page.title()) === 'Skeleton Crewneck — Black Graphic Sweatshirt | Rizo Apparel');
  verify('Canonical stays on public product URL', await page.locator('link[rel="canonical"]').getAttribute('href') === origin + product);
  verify('Editorial social image renders', (await page.locator('meta[property="og:image"]').getAttribute('content')).includes('lifestyle-editorial'));
  const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
  verify('Native product structured data has five truthful offers', schema.hasVariant.length === 5 && schema.hasVariant.every(v => v.offers.price === '39.99' && v.offers.availability.endsWith('OutOfStock')));
  await page.goto(origin + '/pages/outside' + preview, { waitUntil: 'domcontentloaded', timeout:45000 });
  const editorial = page.locator('#worn img[src*="lifestyle-editorial"]');
  verify('Editorial photograph added once to worn archive', await editorial.count() === 1);
  await editorial.scrollIntoViewIfNeeded();
  await editorial.evaluate(i => i.decode());
  await editorial.locator('xpath=ancestor::figure').screenshot({path:`${out}/Skeleton-Archive.png`,style:hideChrome});
  console.log(`${checks.length} native Shopify preview checks passed.`);
} finally {
  await fs.writeFile(`${out}/native-checks.json`, JSON.stringify(checks, null, 2));
  await browser.close();
}
