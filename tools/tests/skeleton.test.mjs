import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/skeleton-review');
await fs.mkdir(out, { recursive: true });
const servers = [];
const results = [];
const start = async (port, state) => {
  const server = spawn(process.execPath, [path.join(root, 'tools/preview/server.mjs')], { env: { ...process.env, PORT: String(port), RIZO_PREVIEW_CATALOG: 'snapshot', RIZO_PREVIEW_SKELETON: state }, stdio: ['ignore', 'pipe', 'pipe'] });
  servers.push(server);
  await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`Preview exited: ${code}`))); });
  return `http://localhost:${port}`;
};
const browser = await chromium.launch({ headless: true });
const check = (name, value) => { assert.ok(value, name); results.push({ name, passed: true }); };
const productPath = '/products/raging-skeleton-crewneck-reworked';
const chromeOff = '.header,.dock,.skip-link { visibility:hidden!important }';
try {
  const draft = await start(9393, 'draft');
  const live = await start(9494, 'available');
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const base of [draft, live]) {
    await page.goto(`${base}/?fixture=skeleton&set.event_layer=off`);
    check(`Gate off hides feature (${base})`, await page.locator('.skeleton-drop').count() === 0);
    check(`Gate off loads no feature CSS (${base})`, !await page.locator('link[href*="rizo-skeleton.css"]').count());
    await page.goto(`${base}${productPath}?set.event_layer=off`);
    check(`Gate off omits purchase form (${base})`, !await page.locator('[data-product-form], [data-sticky-atc], [name="id"]').count());
    check(`Locked page has no false sold-out badge (${base})`, !await page.locator('.pdp .card-badges,.pdp-soldout').count());
  }
  await page.goto(`${draft}/?fixture=skeleton&set.skeleton_feature_enabled=true&set.skeleton_launch_enabled=true`);
  check('Draft stays hidden with gate on', !await page.locator('.skeleton-drop').count());
  await page.goto(`${draft}${productPath}?set.skeleton_feature_enabled=true&set.skeleton_launch_enabled=true`);
  check('Draft cannot buy even with gate on', !await page.locator('[data-product-form]').count());
  await page.goto(`${live}/?fixture=skeleton&set.skeleton_feature_enabled=true&set.skeleton_launch_enabled=true&section.rizo-skeleton-drop.product=gold-rizo-hoodie`);
  check('Wrong product cannot activate feature', !await page.locator('.skeleton-drop').count());

  for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[1440,1000]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${draft}/?fixture=skeleton&design_mode=1&set.event_layer=off`);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.skeleton-drop').scrollIntoViewIfNeeded();
    check(`Editor feature renders at ${width}`, await page.locator('.skeleton-drop').count() === 1);
    check(`No draft commerce link at ${width}`, !await page.locator('.skeleton-link').count());
    check(`Homepage has no overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const photos = await page.locator('.skeleton-drop img').evaluateAll(imgs => imgs.map(img => ({ loaded: img.complete && img.naturalWidth > 0, ratio: img.clientWidth / img.clientHeight, natural: img.naturalWidth / img.naturalHeight })));
    check(`All photographs load without cropping at ${width}`, photos.length === 3 && photos.every(p => p.loaded && Math.abs(p.ratio-p.natural) < .02));
    await page.locator('.skeleton-drop').screenshot({ path: path.join(out, `skeleton-${width}.png`), style: chromeOff });
    await page.goto(`${draft}${productPath}?set.event_layer=off`);
    await page.evaluate(() => document.fonts.ready);
    check(`Product has no overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`Seven approved gallery images at ${width}`, await page.locator('.pdp-media').count() === 7);
    check(`Entire artwork retained at ${width}`, await page.locator('.pdp-media img').first().evaluate(img => getComputedStyle(img).objectFit === 'contain'));
    await page.locator('[data-media-zoom]').first().click();
    check(`Zoom opens at ${width}`, await page.locator('[data-overlay="product-media"]').isVisible());
    await page.keyboard.press('Escape');
    check(`Escape closes zoom at ${width}`, !await page.locator('[data-overlay="product-media"]').isVisible());
    if (width < 750) {
      await page.locator('[data-media-track]').evaluate(track => { track.scrollLeft = track.clientWidth; });
      await page.waitForTimeout(250);
      check(`Mobile gallery scrolls at ${width}`, await page.locator('[data-media-track]').evaluate(track => track.scrollLeft > 0));
      await page.locator('[data-media-track]').evaluate(track => { track.scrollLeft = 0; });
    }
    if ([390,1440].includes(width)) await page.screenshot({ path: path.join(out, `product-${width}.png`), fullPage: true, style: chromeOff });
  }
  await page.goto(`${live}/?fixture=skeleton&set.skeleton_feature_enabled=true&set.skeleton_launch_enabled=true&set.event_layer=off`);
  check('Published + available + approved exposes discovery link', await page.locator('.skeleton-link').getAttribute('href') === productPath);
  await page.locator('.skeleton-link').click();
  // Carry the local-only query override to emulate the saved Shopify theme setting.
  await page.goto(`${live}${productPath}?set.skeleton_feature_enabled=true&set.skeleton_launch_enabled=true&set.event_layer=off`);
  check('Approved release restores original size picker', await page.locator('[data-option-button]').count() === 5);
  check('Established price preserved', (await page.locator('[data-product-price]').textContent()).includes('39.99'));
  await page.locator('[data-option-button][data-value="M"]').click();
  check('Size selects a mock variant', !!await page.locator('[data-variant-input]').inputValue());
  await page.locator('[data-product-submit]').click();
  await page.waitForTimeout(300);
  const cart = await page.evaluate(() => fetch('/cart.js').then(r => r.json()));
  check('Local simulated cart receives selected size', cart.item_count === 1 && cart.items[0].variant_title === 'M');
  check('No browser runtime errors', errors.length === 0);
  // Rendered source for the offline review; no live cart or Shopify admin requests.
  await page.goto(`${live}/?fixture=skeleton&set.skeleton_feature_enabled=true&set.skeleton_launch_enabled=true&set.event_layer=off`);
  await fs.writeFile(path.join(out, 'feature-rendered.html'), await page.locator('.skeleton-drop').evaluate(el => el.outerHTML));
  await page.goto(`${draft}${productPath}?set.event_layer=off`);
  await fs.writeFile(path.join(out, 'product-rendered.html'), await page.locator('.pdp').evaluate(el => el.outerHTML));
  console.log(`${results.length} Skeleton checks passed.`);
} finally {
  await fs.writeFile(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
  await browser.close();
  servers.forEach(server => server.kill());
}
