import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../qa-artifacts');
const NOW = new Date('2026-10-15T16:00:00Z');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const servers = [];
const start = async (port, theme) => {
  const server = spawn(process.execPath, [path.join(HERE, '../preview/server.mjs')], {
    env: { ...process.env, PORT: String(port), PREVIEW_NOW: NOW.toISOString(), ...(theme ? { THEME_DIR: theme } : {}) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  servers.push(server);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview startup timed out')), 10000);
    server.stdout.on('data', (data) => { if (String(data).includes('Rizo preview')) { clearTimeout(timeout); resolve(); } });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Preview exited: ${code}`)); });
  });
  return `http://localhost:${port}`;
};

let browser;
try {
  const port = Number(process.env.VISUAL_PORT || 9496);
  const base = await start(port);
  const baseline = process.env.BASELINE_THEME_DIR ? await start(port + 1, process.env.BASELINE_THEME_DIR) : null;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, timezoneId: 'America/New_York', reducedMotion: 'reduce', isMobile: width < 700, hasTouch: width < 700 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(NOW);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const load = async (origin, route) => {
      await page.goto(origin + route, { waitUntil: 'networkidle' });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter((image) => image.complete).map((image) => image.decode().catch(() => {}))); });
    };
    const layout = () => page.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    const checkLayout = async (name) => {
      const value = await layout();
      assert.equal(value.inner, width, `${name}: mobile viewport expanded`);
      assert(value.scroll <= width, `${name}: horizontal overflow ${JSON.stringify(value)}`);
    };
    await load(base, '/?set.event_layer=off');
    await checkLayout('home OFF');
    const off = await page.screenshot({ path: path.join(OUT, `${width}-home-off.png`), animations: 'disabled' });
    await load(base, '/?set.event_layer=off&ops.theme_enabled=false&ops.hero_heading=UNAPPROVED&ops.featured_product=flame-cap');
    const disabled = await page.screenshot({ animations: 'disabled' });
    assert(off.equals(disabled), `${width}: explicit OFF changed the homepage screenshot`);
    results.push({ name: `${width}px missing/false OFF screenshot parity`, ok: true });
    if (baseline) {
      await load(baseline, '/?set.event_layer=off');
      const before = await page.screenshot({ path: path.join(OUT, `${width}-baseline-home-off.png`), animations: 'disabled' });
      assert(off.equals(before), `${width}: homepage OFF differs from main`);
      results.push({ name: `${width}px homepage OFF pixel parity with main`, ok: true });
    }
    await load(base, '/?set.event_layer=off&ops.theme_enabled=true&ops.hero_heading=RIZO%20WORLD&ops.featured_product=flame-cap&ops.home_collection=limited');
    await checkLayout('home ON');
    await page.screenshot({ path: path.join(OUT, `${width}-home-on.png`), animations: 'disabled' });
    const feature = page.locator('[data-ops-featured-product]');
    await feature.scrollIntoViewIfNeeded();
    await feature.locator('img').first().evaluate((image) => image.decode());
    await feature.screenshot({ path: path.join(OUT, `${width}-feature-on.png`), animations: 'disabled' });
    assert.equal(await feature.locator('.product-card-media').getAttribute('href'), '/products/flame-cap');
    assert((await feature.locator('.product-card-media img').first().getAttribute('src')).includes('rizo-circle-gym.webp'), 'featured product media changed');
    results.push({ name: `${width}px ON controls and native product media`, ok: true });
    for (const [name, route] of [['product', '/products/night-signal-hoodie'], ['collection', '/collections/all']]) {
      if (baseline) {
        await load(baseline, `${route}?set.event_layer=off`);
        results.push({ name: `${width}px baseline ${name} dimensions`, diagnostic: await layout() });
        await page.screenshot({ path: path.join(OUT, `${width}-baseline-${name}.png`), animations: 'disabled' });
      }
      await load(base, `${route}?set.event_layer=off`);
      await checkLayout(name);
      await page.screenshot({ path: path.join(OUT, `${width}-${name}.png`), animations: 'disabled' });
      if (name === 'product') {
        const gallery = page.locator('[data-media-track]');
        assert(await gallery.locator('[data-media-id]').count() === 2, 'product media count changed');
        assert(await gallery.evaluate((node) => node.scrollWidth >= node.clientWidth), 'gallery cannot scroll');
      }
      results.push({ name: `${width}px ${name} has no horizontal overflow`, ok: true });
    }
    assert.deepEqual(errors, [], `${width}: JavaScript errors`);
    await context.close();
  }
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await nojs.newPage();
  await page.goto(base + '/?set.event_layer=off&ops.theme_enabled=true&ops.featured_product=flame-cap');
  assert.equal(await page.locator('[data-ops-featured-product] .product-card-media').getAttribute('href'), '/products/flame-cap');
  assert.equal(await page.locator('[data-ops-featured-product] form').getAttribute('action'), '/cart/add');
  results.push({ name: 'Featured product remains linked and purchasable without JavaScript', ok: true });
  await nojs.close();
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'NOTE'}  ${result.name}${result.diagnostic ? ' ' + JSON.stringify(result.diagnostic) : ''}`);
  fs.writeFileSync(path.join(OUT, 'visual-results.json'), JSON.stringify({ browser: browser.version(), results }, null, 2));
  console.log(`${results.filter((result) => result.ok).length} visual/browser checks passed`);
} finally {
  await browser?.close();
  servers.forEach((server) => server.kill());
}
