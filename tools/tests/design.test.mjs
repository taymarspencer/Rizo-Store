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

  /* Art layers (fixture: tools/preview/fixtures/art.json). */
  {
    const layout = async (width, height, query) => {
      const page = await newPage(width, height);
      await page.goto(`${base}/?fixture=art&rizo_event_governor=off&${query}`, { waitUntil: 'networkidle' });
      const r = await page.evaluate(() => {
        const piece = (id) => { const el = document.getElementById(id); const cs = getComputedStyle(el); return { shown: cs.display !== 'none', z: cs.zIndex }; };
        return { overflow: document.documentElement.scrollWidth - innerWidth, face: piece('Art-face'), mark: piece('Art-mark'), phone: piece('Art-phone'), desk: piece('Art-desk'), event: piece('Art-event'), normal: piece('Art-normal'), hidden: [...document.querySelectorAll('.art-piece')].every((el) => el.getAttribute('aria-hidden') === 'true'), src: document.querySelector('#Art-mark img').currentSrc };
      });
      assert(page.errors.length === 0, `art ${width}: ${page.errors.join('; ')}`);
      return { page, r };
    };
    let { page, r } = await layout(1440, 900, 'rizo_event=on');
    assert(r.overflow <= 0 && r.hidden, 'art: overflow or exposed to screen readers', r);
    assert(r.face.z === '6' && r.mark.z === '0' && r.desk.z === '0' && r.desk.shown && !r.phone.shown, 'art: desktop layers or visibility wrong', r);
    assert(r.event.shown && !r.normal.shown, 'art: event-only pieces wrong while the event is on', r);
    // Depth: a piece behind the content lags the scroll.
    const move = (id) => page.evaluate((id) => getComputedStyle(document.querySelector(`#${id} .art-move`)).translate, id);
    const before = await move('Art-mark');
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(400);
    const after = await move('Art-mark');
    assert(before !== after, 'art: depth piece did not move with scroll', { before, after });
    // Shy: eases away from a nearby pointer.
    await page.evaluate(() => document.getElementById('Art-shy').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    const shyBox = await page.locator('#Art-shy').boundingBox();
    await page.mouse.move(shyBox.x - 40, shyBox.y + shyBox.height / 2, { steps: 4 });
    await page.waitForTimeout(400);
    assert(await move('Art-shy') !== 'none', 'art: shy piece ignored the pointer');
    // Spin reacts to a click and reports it.
    await page.evaluate(() => document.getElementById('Art-spin').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    const spinBox = await page.locator('#Art-spin').boundingBox();
    const reported = page.evaluate(() => new Promise((resolve) => document.addEventListener('rizo:art', (event) => resolve(event.detail.kind), { once: true })));
    await page.mouse.click(spinBox.x + spinBox.width / 2, spinBox.y + spinBox.height / 2);
    assert(await reported === 'touch', 'art: spin did not react to a click');
    // Settle: hidden only until seen.
    await page.evaluate(() => document.getElementById('Art-event').scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#Art-event .art-move')).opacity === '1', null, { timeout: 4000 });
    await page.screenshot({ path: path.join(out, 'art-1440.png') });
    await page.close();

    ({ page, r } = await layout(1440, 900, 'set.event_layer=off'));
    assert(!r.event.shown && r.normal.shown, 'art: event-only pieces wrong with no event', r);
    await page.close();

    ({ page, r } = await layout(390, 844, 'rizo_event=on'));
    assert(r.overflow <= 0, 'art: phone overflow', r);
    assert(r.phone.shown && !r.desk.shown && r.phone.z === '6', 'art: phone visibility wrong', r);
    assert(/rizo-ember/.test(r.src), 'art: phone version not used on phones', r.src);
    await page.screenshot({ path: path.join(out, 'art-390.png') });
    // A tap on the Shop button under a front piece still shops.
    const overlap = await page.evaluate(() => { const a = document.getElementById('Art-phone').getBoundingClientRect(); const b = document.querySelector('.hero-actions .btn--solid').getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; });
    assert(overlap, 'art: fixture piece no longer covers the Shop button');
    const shop = await page.locator('.hero-actions .btn--solid').boundingBox();
    await Promise.all([page.waitForURL(/\/collections\/all/, { timeout: 5000 }), page.mouse.click(shop.x + 12, shop.y + shop.height / 2)]);
    await page.close();

    // Reduced motion: nothing moves, everything is visible.
    page = await newPage(1440, 900, { reducedMotion: 'reduce' });
    await page.goto(`${base}/?fixture=art&rizo_event=on&rizo_event_governor=off`, { waitUntil: 'networkidle' });
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
    const still = await page.evaluate(() => [...document.querySelectorAll('.art-move')].every((el) => { const cs = getComputedStyle(el); return cs.translate === 'none' && cs.opacity === '1' && cs.animationName === 'none'; }));
    assert(still, 'art: moves under reduced motion');
    await page.close();

    // No JavaScript: every piece is still placed and visible.
    page = await newPage(1440, 900, { javaScriptEnabled: false });
    await page.goto(`${base}/?fixture=art&set.event_layer=off`, { waitUntil: 'networkidle' });
    const noScript = await page.evaluate(() => ({ settle: getComputedStyle(document.querySelector('#Art-event .art-move')).opacity, face: document.getElementById('Art-face').getBoundingClientRect().width }));
    assert(noScript.face > 0 && noScript.settle === '1', 'art: hidden or unplaced without JavaScript', noScript);
    await page.close();

    // Theme editor: placeholder, reloads, selection.
    page = await newPage(1440, 900);
    await page.goto(`${base}/?fixture=art&design_mode=1&rizo_event_governor=off`, { waitUntil: 'networkidle' });
    assert(await page.locator('.art-empty').count() === 1, 'art: empty block has no placeholder in the editor');
    const first = await page.evaluate(() => window.RizoArt.stats().pieces);
    for (let index = 0; index < 8; index += 1) {
      await page.evaluate(async () => {
        const html = await (await fetch('/?fixture=art&design_mode=1&section_id=hero')).text();
        const old = document.getElementById('shopify-section-hero');
        old.dispatchEvent(new CustomEvent('shopify:section:unload', { bubbles: true }));
        const holder = document.createElement('div');
        holder.innerHTML = html;
        const fresh = holder.firstElementChild;
        old.replaceWith(fresh);
        fresh.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true }));
      });
    }
    assert(await page.evaluate(() => window.RizoArt.stats().pieces) === first, 'art: pieces leaked across editor reloads');
    await page.evaluate(() => document.getElementById('Art-mark').dispatchEvent(new CustomEvent('shopify:block:select', { bubbles: true })));
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => getComputedStyle(document.querySelector('#Art-mark .art-move')).translate) === 'none', 'art: selected piece keeps moving');
    assert(page.errors.length === 0, `art editor: ${page.errors.join('; ')}`);
    await page.close();
    interactions.push('art: layers per device, event-only pieces, depth, shy, spin, settle, tap-through on phones, reduced motion, no-JS, editor reloads x8 and selection');
  }

  /* Phone versions of photos, focal points, and Objects widths on phones. */
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await newPage(width, height);
    await page.goto(`${base}/?fixture=phone&set.event_layer=off`, { waitUntil: 'networkidle' });
    for (let y = 0; y < 5000; y += 500) { await page.evaluate((to) => window.scrollTo(0, to), y); await page.waitForTimeout(60); }
    const r = await page.evaluate(() => {
      const story = document.querySelector('.story-photo img');
      return { story: story.currentSrc, focal: getComputedStyle(story).objectPosition, gallery: document.querySelector('.gallery-item img').currentSrc, objects: [...document.querySelectorAll('.artifact')].map((el) => Math.round(el.getBoundingClientRect().width)), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    if (width < 750) {
      assert(/circle-pink/.test(r.story) && r.focal === '40% 20%' && /stadium/.test(r.gallery), 'phone versions not used on phones', r);
      assert(r.objects[0] < r.objects[1] && r.objects[1] < r.objects[2] + 1, 'Objects: phone widths not applied', r);
    } else {
      assert(/founder-mural/.test(r.story) && r.focal === '50% 30%' && /underpass/.test(r.gallery), 'desktop photos replaced by phone versions', r);
    }
    assert(r.overflow <= 0 && page.errors.length === 0, `phone fixture at ${width}`, r);
    await page.close();
  }
  interactions.push('phone versions: story, photographs, focal points, Objects widths');

  /* The moon placed by hand for one page (Hero → Moon on this page). */
  {
    const place = 'section.rizo-hero.moon_custom=true&section.rizo-hero.moon_x=20&section.rizo-hero.moon_y=30&section.rizo-hero.moon_size=20&section.rizo-hero.moon_mobile_x=50&section.rizo-hero.moon_mobile_y=60&section.rizo-hero.moon_mobile_size=40';
    for (const [width, height, x, y] of [[1440, 900, 20, 30], [390, 844, 50, 60]]) {
      const page = await newPage(width, height);
      await page.goto(`${base}/?rizo_event=on&rizo_event_governor=off&set.event_moon_motion=false&${place}`, { waitUntil: 'networkidle' });
      const at = await page.evaluate(() => { const b = document.querySelector('[data-rizo-event-moon]').getBoundingClientRect(); return [Math.round((b.x + b.width / 2) / innerWidth * 100), Math.round((b.y + b.height / 2) / innerHeight * 100)]; });
      assert(at[0] === x && at[1] === y, `moon not placed by hand at ${width}`, at);
      await page.close();
    }
    interactions.push('moon placed by hand, separately on phones');
  }

  console.log(`PASS interactions: ${interactions.join('; ')}`);
  fs.writeFileSync(path.join(root, 'docs/DESIGN-CHECKS.json'), JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'Chromium, local Liquid preview, catalog snapshot, simulated commerce', results, interactions }, null, 2) + '\n');
} finally {
  await browser.close();
  server.kill();
}
