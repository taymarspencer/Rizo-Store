// Composition and interaction checks for the 2026 Rizo design, against the
// real Liquid templates and the dated public catalog snapshot. Commerce
// endpoints stay local simulations (see preview/server.mjs).
//
//   node tests/design.test.mjs        writes docs/screens/*.png and
//                                     docs/DESIGN-CHECKS.json
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/screens');
fs.mkdirSync(out, { recursive: true });
const port = Number(process.env.TEST_PORT || 9595);
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, [path.join(root, 'tools/preview/server.mjs')], { env: { ...process.env, PORT: String(port), RIZO_PREVIEW_CATALOG: 'snapshot' }, stdio: ['ignore', 'pipe', 'pipe'] });
const results = [];
const interactions = [];
const assert = (condition, message, detail) => { if (!condition) throw new Error(`${message}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`); };
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Preview failed to start')), 10000);
  server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  server.once('error', reject);
});
const browser = await chromium.launch({ headless: true });
const home = `${base}/?rizo_event=on&rizo_event_seed=412&rizo_event_governor=off`;
const SIZES = [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const ROUTES = ['/', '/collections/all', '/products/412-rizo-hoodie', '/pages/about', '/pages/world', '/pages/circle', '/pages/contact', '/pages/faq', '/cart', '/search?q=hoodie', '/nope'];
const newPage = async (width, height, extra = {}) => {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 750, hasTouch: width < 750, deviceScaleFactor: 1, ...extra });
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/status of 404/.test(message.text())) page.errors.push(message.text()); });
  return page;
};

try {
  /* Hero at every size: lines fit, the button is reachable, above the dock. */
  for (const [width, height] of SIZES) {
    const page = await newPage(width, height);
    await page.goto(home, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const g = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.hero-title > span')].map((line) => { const range = document.createRange(); range.selectNodeContents(line); const r = range.getBoundingClientRect(); return { left: r.left, right: r.right }; });
      const button = document.querySelector('.hero-actions .btn--solid');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const dock = document.querySelector('.dock');
      return {
        documentWidth: document.documentElement.scrollWidth,
        lines,
        shopHit: button === hit || button.contains(hit),
        shopBottom: rect.bottom,
        dockTop: dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect().top : Infinity,
        font: getComputedStyle(document.querySelector('.hero-title')).fontFamily,
        fontLoaded: document.fonts.check('700 40px "Rizo Grotesque"'),
        moonName: getComputedStyle(document.querySelector('[data-rizo-event-moon]')).viewTransitionName
      };
    });
    assert(g.documentWidth === width, `${width}: page overflow`, g.documentWidth);
    assert(g.lines.every((line) => line.left >= 12 && line.right <= width - 12), `${width}: headline line leaves the screen`, g.lines);
    assert(g.shopHit, `${width}: shop button covered`);
    assert(g.shopBottom < g.dockTop, `${width}: shop button under the dock`, g);
    assert(g.fontLoaded && /Rizo Grotesque/.test(g.font), `${width}: grotesque not loaded`, g.font);
    assert(g.moonName === 'rizo-moon', `${width}: moon lost its view-transition name`, g.moonName);
    await page.screenshot({ path: path.join(out, `hero-${width}x${height}.png`) });
    assert(page.errors.length === 0, `${width}: ${page.errors.join('; ')}`);
    results.push({ size: `${width}x${height}`, check: 'hero', status: 'pass' });
    console.log(`PASS hero ${width}x${height}: lines fit, shop reachable${g.dockTop < Infinity ? ' above the dock' : ''}, fonts, moon transition name`);
    await page.close();
  }

  /* Every route: no sideways scroll, a visible title, no console errors. */
  for (const width of [320, 1440]) {
    const page = await newPage(width, width === 320 ? 568 : 900);
    for (const route of ROUTES) {
      await page.goto(`${base}${route}${route.includes('?') ? '&' : '?'}rizo_event=on&rizo_event_governor=off`, { waitUntil: 'networkidle' });
      const r = await page.evaluate(() => {
        const title = document.querySelector('h1');
        const rect = title?.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - innerWidth, title: title?.textContent.trim().slice(0, 40), inside: rect ? rect.left >= 0 && rect.right <= innerWidth + 1 : false };
      });
      assert(r.overflow <= 0, `${route} at ${width}: overflow`, r);
      assert(r.inside, `${route} at ${width}: title off screen`, r);
    }
    assert(page.errors.length === 0, `routes at ${width}: ${page.errors.join('; ')}`);
    results.push({ size: `${width}`, check: 'routes', status: 'pass', routes: ROUTES.length });
    console.log(`PASS ${ROUTES.length} routes at ${width}px: no overflow, titles on screen, no errors`);
    await page.close();
  }

  /* Full-page captures for the docs. */
  for (const [width, height, route, name] of [[1440, 900, '/', 'home-1440'], [390, 844, '/', 'home-390'], [1440, 900, '/pages/world', 'world-1440'], [390, 844, '/products/412-rizo-hoodie', 'product-390'], [1440, 900, '/collections/all', 'collection-1440']]) {
    const page = await newPage(width, height);
    await page.goto(`${base}${route}?rizo_event=on&rizo_event_seed=412&rizo_event_governor=off`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    await page.close();
  }

  /* The first drawing: native details, keyboard and no script needed. */
  {
    const page = await newPage(390, 844);
    await page.goto(home, { waitUntil: 'networkidle' });
    const summary = page.locator('.pocket summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert(await page.locator('.pocket').getAttribute('open') !== null, 'drawing did not come out with the keyboard');
    await page.waitForTimeout(1100);
    await page.locator('.story').screenshot({ path: path.join(out, 'first-drawing-out.png') });
    await page.keyboard.press('Enter');
    assert(await page.locator('.pocket').getAttribute('open') === null, 'drawing did not go back');
    interactions.push('first drawing: keyboard open/close');
    await page.close();
  }

  /* Roost: arrives, notices the pointer, leaves; respects reduced motion and cleanup. */
  {
    const page = await newPage(1440, 900);
    await page.goto(home, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.RizoEventLayer?.module('halloween-roost'));
    await page.evaluate(() => window.RizoEventLayer.module('halloween-roost').arriveNow());
    await page.waitForFunction(() => window.RizoEventLayer.stats().roosting, null, { timeout: 5000 });
    const box = await page.locator('.rizo-roost').boundingBox();
    await page.mouse.move(box.x + 400, box.y + 300);
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 6 });
    await page.waitForTimeout(200);
    assert(await page.locator('.rizo-roost').getAttribute('data-frame') === '1', 'roosting bat did not notice the pointer');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
    await page.waitForFunction(() => !document.querySelector('.rizo-roost'), null, { timeout: 4000 });
    await page.evaluate(() => window.RizoEventLayer.module('halloween-roost').arriveNow());
    await page.waitForFunction(() => window.RizoEventLayer.stats().roosting, null, { timeout: 5000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => !document.querySelector('.rizo-roost') || getComputedStyle(document.querySelector('.rizo-roost')).display === 'none'), 'roost ignores live reduced motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.RizoEventLayer.deactivate());
    await page.waitForTimeout(900);
    assert(await page.locator('.rizo-roost').count() === 0, 'roost left behind after the event ended');
    interactions.push('roost: arrive, notice pointer, leave, reduced motion, cleanup');
    await page.close();
  }

  /* The moon: real phase, touching it sends bats out from behind it. */
  {
    const page = await newPage(1440, 900);
    await page.goto(home, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.RizoEventLayer?.stats().flockBehavior === 'bats');
    const phase = await page.evaluate(() => ({ ...window.RizoEventLayer.moonPhase, masked: Boolean(document.querySelector('.rizo-event-moon-body').style.getPropertyValue('--rizo-moon-mask')) }));
    assert(phase.illumination >= .985 || phase.masked, 'moon phase not drawn', phase);
    const moon = await page.evaluate(() => { const r = document.querySelector('[data-rizo-event-moon]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.evaluate(() => document.addEventListener('click', (event) => event.preventDefault(), true));
    await page.mouse.click(moon.x + 30, moon.y - 40);
    await page.waitForFunction(() => window.RizoEventLayer.stats().flockFromMoon > 0, null, { timeout: 3000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, 'moon-touched.png') });
    await page.goto(`${base}/pages/world?rizo_event=on`, { waitUntil: 'networkidle' });
    const text = await page.locator('[data-rizo-moon-phase]').first().textContent();
    assert(/moon: .+ \d+% lit\./.test(text), 'World page does not name tonight’s moon', text);
    interactions.push(`moon: ${phase.masked ? 'phase mask' : 'full'}, tap → bats, World caption "${text.trim()}"`);
    await page.close();
  }

  /* Event off: normal Rizo, the mark instead of the moon. */
  {
    const page = await newPage(1440, 900);
    await page.goto(`${base}/?set.event_layer=off`, { waitUntil: 'networkidle' });
    const off = await page.evaluate(() => ({ moon: document.querySelectorAll('[data-rizo-event-moon]').length, mark: getComputedStyle(document.querySelector('.hero-mark')).display }));
    assert(off.moon === 0 && off.mark !== 'none', 'event off should show the mark and no moon', off);
    await page.screenshot({ path: path.join(out, 'hero-event-off.png') });
    await page.close();
    // The mark bleeds off the edge on phones; that must never widen the page.
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
      const phone = await newPage(width, height);
      await phone.goto(`${base}/?set.event_layer=off`, { waitUntil: 'networkidle' });
      const wide = await phone.evaluate(() => Math.max(document.documentElement.scrollWidth, innerWidth));
      assert(wide === width, `event off at ${width}: page wider than the screen`, wide);
      await phone.close();
    }
    interactions.push('event off: mark instead of moon, no sideways scroll on phones');
  }

  console.log(`PASS interactions: ${interactions.join('; ')}`);
  fs.writeFileSync(path.join(root, 'docs/DESIGN-CHECKS.json'), JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'Chromium, local Liquid preview, catalog snapshot, simulated commerce', results, interactions }, null, 2) + '\n');
} finally {
  await browser.close();
  server.kill();
}
