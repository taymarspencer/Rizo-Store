// Composition checks against the real Liquid templates and a dated public
// catalog snapshot. Commerce endpoints remain local simulations.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/screens/design-2026');
fs.mkdirSync(out, { recursive: true });
const port = 9494;
const server = spawn(process.execPath, [path.join(root, 'tools/preview/server.mjs')], { env: { ...process.env, PORT: String(port), RIZO_PREVIEW_CATALOG: 'snapshot' }, stdio: ['ignore', 'pipe', 'pipe'] });
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Preview failed to start')), 10000);
  server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  server.once('error', reject);
});
const browser = await chromium.launch({ headless: true });
const home = `http://localhost:${port}/?rizo_event=on&rizo_event_seed=412&rizo_event_governor=off`;
try {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 750, hasTouch: width < 750, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(home, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const title = document.querySelector('.gate-title-main');
      const range = document.createRange(); range.selectNodeContents(title);
      const glyphs = range.getBoundingClientRect();
      const copy = document.querySelector('.world-gate-copy').getBoundingClientRect();
      const button = document.querySelector('.world-gate-actions .button');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, textLeft: glyphs.left, textRight: glyphs.right, insetLeft: copy.left, insetRight: copy.right, shopBottom: rect.bottom, shopHit: button === hit || button.contains(hit), dockTop: document.querySelector('.mobile-dock').getBoundingClientRect().top, titleFont: getComputedStyle(title).fontFamily };
    });
    assert(geometry.documentWidth === width, `${width}: page overflow`);
    assert(geometry.insetLeft >= 16, `${width}: hero inset lost`);
    assert(geometry.textLeft >= geometry.insetLeft - 1 && geometry.textRight <= geometry.insetRight + 1, `${width}: WEARABLE glyphs clip`);
    assert(geometry.shopHit, `${width}: initial shop button covered`);
    if (width < 750) assert(geometry.shopBottom < geometry.dockTop, `${width}: shop below dock`);
    await page.screenshot({ path: path.join(out, `hero-${width}x${height}.png`) });
    // Trigger native lazy loading and reveal observers before full-page capture.
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    for (let y = 0; y < await page.evaluate(() => document.body.scrollHeight); y += height - 120) {
      await page.evaluate(y => window.scrollTo(0, y), y);
      await page.waitForTimeout(80);
    }
    await page.waitForFunction(() => [...document.images].filter(img => img.getBoundingClientRect().width > 0 && !img.closest('details:not([open])')).every(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    if (width === 390 || width === 1440) await page.screenshot({ path: path.join(out, `homepage-${width}.png`), fullPage: true });
    assert(errors.length === 0, `${width}: ${errors.join('; ')}`);
    results.push({ size: `${width}x${height}`, status: 'pass', ...geometry });
    console.log(`PASS ${width}x${height}: title, inset, shop hit target, lazy images, console`);

    if (width === 390) {
      // The original sketch is available to touch and keyboard with no script.
      const summary = page.locator('.origin-pocket summary');
      await summary.focus(); await page.keyboard.press('Enter');
      assert(await page.locator('.origin-pocket').getAttribute('open') !== null, 'Archive pocket did not open with keyboard');
      await page.locator('.origin-pocket').screenshot({ path: path.join(out, 'original-drawing-open.png') });
      await page.keyboard.press('Enter');
      assert(await page.locator('.origin-pocket').getAttribute('open') === null, 'Archive pocket did not close');
      // Test inherited 320px cleanup on genuine product/collection layouts.
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(`http://localhost:${port}/collections/all?rizo_event=on`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'Collection overflow at 320');
      await page.goto(`http://localhost:${port}/products/412-rizo-hoodie?rizo_event=on`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'Product overflow at 320');
      await page.screenshot({ path: path.join(out, 'product-320.png') });
    }
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(home, { waitUntil: 'networkidle' });
  const perch = page.locator('[data-rizo-perch]');
  await page.waitForFunction(() => document.querySelector('[data-rizo-perch]')?.hasAttribute('data-ready'));
  const rect = await perch.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  assert(await perch.evaluate(node => node.getAnimations().length > 0), 'Perched bat did not react');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert(await perch.evaluate(node => node.getAnimations().length === 0), 'Perch ignores live reduced-motion change');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.RizoEventLayer.deactivate());
  await page.waitForTimeout(900);
  assert(await perch.getAttribute('data-ready') === null, 'Perch failed event cleanup');
  await page.goto(`${home}&set.event_layer=off`, { waitUntil: 'networkidle' });
  assert(await page.locator('[data-rizo-event-hero]').count() === 0, 'Event off still has art');
  await page.screenshot({ path: path.join(out, 'hero-event-off.png') });
  await page.close();
  console.log('PASS archive keyboard, 320px collection/product, bat reaction, live reduced motion, event cleanup and event off');
  fs.writeFileSync(path.join(root, 'docs/DESIGN-2026-CHECKS.json'), JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'Chromium local Liquid preview; catalog snapshot, simulated commerce', results, interactions: ['archive keyboard open/close', '320px collection and product', 'perched bat proximity reaction', 'live reduced-motion change', 'event cleanup', 'event off'] }, null, 2) + '\n');
} finally {
  await browser.close(); server.kill();
}
