// Rizo Event Layer — browser audit.
//
// Starts the local preview harness, drives Chromium through the event layer
// and the storefront flows it must not disturb, and prints a pass/fail table.
//
//   node tests/event-layer.test.mjs            all tests
//   node tests/event-layer.test.mjs countdown  only tests whose name matches
//
// Everything runs against the mock storefront in preview/server.mjs, so the
// results describe the theme code, not Shopify's servers or checkout.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_PORT || 9393);
const BASE = `http://localhost:${PORT}`;
const FILTER = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const LIMITS = { desktop: 10, mobile: 6, lite: 4 };
const NIGHT = 'rgb(7, 9, 12)';

const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const EVENT_ASSET = /rizo-event|event-halloween/;

/* ------------------------------------------------------------------ */
/* Tiny runner                                                         */
/* ------------------------------------------------------------------ */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
class Failure extends Error {}
const assert = (condition, message, detail) => {
  if (!condition) throw new Failure(`${message}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
const notes = [];
const note = (text) => notes.push(text);

let browser;
// The theme scrolls smoothly (html { scroll-behavior: smooth }). Playwright's
// scroll-into-view retries restart that animation, so tests switch it off.
// The frame-time governor is disabled by default so tier limits stay fixed on
// this CPU-composited sandbox; the governor has its own test.
const open = async (url, options = {}, setup) => {
  const { clock, governor, ...contextOptions } = options;
  const context = await browser.newContext({ ...DESKTOP, ...contextOptions });
  const page = await context.newPage();
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'html { scroll-behavior: auto !important; }';
      document.head.append(style);
    });
  });
  if (url && !governor) url += `${url.includes('?') ? '&' : '?'}rizo_event_governor=off`;
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('request', (request) => requests.push(request.url()));
  if (clock?.install) await page.clock.install({ time: clock.install });
  if (clock?.fixed) await page.clock.setFixedTime(clock.fixed);
  if (setup) await setup(page);
  if (url) await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
  return { context, page, errors, requests, close: () => context.close() };
};
const stats = (page) => page.evaluate(() => window.RizoEventLayer?.stats() || null);
const waitFor = async (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const waitForFlock = (page) => waitFor(page, () => window.RizoEventLayer?.stats().flockBehavior === 'bats', null, 10000);
const waitForBats = (page, count = 1, timeout = 12000) => waitFor(page, (n) => (window.RizoEventLayer?.stats().flockActive || 0) >= n, count, timeout);
// Real input at the element's centre, after checking that the element (not a
// bat, the dock or anything else) is what a finger would actually hit there.
const press = async (page, locator, touch) => {
  await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await page.waitForTimeout(120);
  const point = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    // Input coordinates are relative to the visual viewport, which mobile
    // emulation can offset from the layout viewport after scrolling.
    const vv = window.visualViewport || { offsetLeft: 0, offsetTop: 0 };
    return { x: x - vv.offsetLeft, y: y - vv.offsetTop, hit: Boolean(top && (top === node || node.contains(top))), top: top ? `${top.tagName}.${String(top.className).slice(0, 40)}` : null };
  });
  assert(point.hit, 'tap target is covered', point);
  if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
};
const htmlClasses = (page) => page.evaluate(() => [...document.documentElement.classList]);
const noErrors = (errors, where) => assert(errors.length === 0, `console/page errors ${where}`, errors.slice(0, 5));

/* ------------------------------------------------------------------ */
/* Activation, scheduling, reversibility                               */
/* ------------------------------------------------------------------ */

test('OFF: normal Rizo loads no event CSS/JS and has no event markup', async () => {
  const t = await open('/?set.event_layer=off&rizo_event=on');
  await t.page.waitForLoadState('networkidle');
  const result = await t.page.evaluate(() => ({
    config: Boolean(document.getElementById('RizoEventConfig')),
    engine: typeof window.RizoEventLayer,
    classes: [...document.documentElement.classList].filter((name) => name.includes('rizo-event') || name.includes('october')),
    markup: document.querySelectorAll('[class*="rizo-event"]').length
  }));
  assert(!t.requests.some((url) => EVENT_ASSET.test(url)), 'event assets requested while Off', t.requests.filter((url) => EVENT_ASSET.test(url)));
  assert(!result.config && result.engine === 'undefined' && !result.classes.length && result.markup === 0, 'event traces while Off', result);
  noErrors(t.errors, 'with Off');
  await t.close();
});

test('Scheduled, outside window: CSS present but inert, runtime never requested', async () => {
  const t = await open('/', { clock: { fixed: new Date('2026-09-22T12:00:00-04:00') } });
  await t.page.waitForLoadState('networkidle');
  const result = await t.page.evaluate(() => ({
    reason: window.RizoEventBoot?.reason,
    active: window.RizoEventBoot?.active,
    engine: typeof window.RizoEventLayer,
    classes: [...document.documentElement.classList].filter((name) => name.startsWith('rizo-event')),
    stage: getComputedStyle(document.querySelector('.rizo-event-stage--back')).display,
    hero: getComputedStyle(document.querySelector('.rizo-event-stage--front')).display,
    countdown: getComputedStyle(document.querySelector('.rizo-event-countdown')).display,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    night: document.documentElement.classList.contains('rizo-event--night')
  }));
  assert(result.reason === 'before-start' && result.active === false, 'boot should be waiting for the start', result);
  assert(!t.requests.some((url) => /\.js/.test(url) && EVENT_ASSET.test(url)), 'runtime JS requested outside the window');
  assert(result.engine === 'undefined' && !result.classes.length, 'event active outside window', result);
  assert(result.stage === 'none' && result.hero === 'none' && result.countdown === 'none', 'event layers visible outside window', result);
  assert(result.bodyBg === NIGHT && !result.night, 'night treatment applied outside window', result);
  noErrors(t.errors, 'outside window');
  await t.close();
});

test('Schedule switches the event on at its start time without a reload', async () => {
  const start = new Date('2026-10-01T00:00:00-04:00');
  const t = await open(`/?set.event_start=${encodeURIComponent('2026-10-01T00:00:00-04:00')}`, { clock: { install: new Date(start.getTime() - 4000) } });
  let result = await t.page.evaluate(() => ({ active: window.RizoEventBoot.active, reason: window.RizoEventBoot.reason }));
  assert(!result.active && result.reason === 'before-start', 'should be inactive 4s before start', result);
  await t.page.clock.runFor(5000);
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  result = await t.page.evaluate(() => ({ reason: window.RizoEventBoot.reason, classes: [...document.documentElement.classList] }));
  assert(result.reason === 'schedule' && result.classes.includes('rizo-event') && result.classes.includes('rizo-october'), 'did not activate at start', result);
  noErrors(t.errors, 'activating at start');
  await t.close();
});

test('Schedule switches the event off at its end time and cleans up', async () => {
  const end = new Date('2026-11-01T06:00:00-05:00');
  const t = await open('/', { clock: { install: new Date(end.getTime() - 3000) } });
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  await t.page.clock.runFor(5000);
  const result = await t.page.evaluate(() => ({
    running: window.RizoEventLayer.state.running,
    reason: window.RizoEventBoot.reason,
    classes: [...document.documentElement.classList].filter((name) => name.includes('rizo-event') || name === 'rizo-october'),
    loop: window.RizoEventLayer.loop.size,
    flyers: document.querySelectorAll('.rizo-event-flyer').length
  }));
  assert(!result.running && result.reason === 'schedule-end' && !result.classes.length && result.loop === 0 && result.flyers === 0, 'did not clean up at end', result);
  noErrors(t.errors, 'ending');
  await t.close();
});

test('Manual override (Always on) ignores the schedule', async () => {
  const t = await open('/?set.event_activation=always', { clock: { fixed: new Date('2026-09-22T12:00:00-04:00') } });
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  assert(await t.page.evaluate(() => window.RizoEventBoot.reason) === 'manual', 'reason should be manual');
  await t.close();
});

test('Theme editor previews the event outside its window (and can opt out)', async () => {
  const on = await open('/?design_mode=1', { clock: { fixed: new Date('2026-09-22T12:00:00-04:00') } });
  await waitFor(on.page, () => window.RizoEventLayer?.state.running === true);
  assert(await on.page.evaluate(() => window.RizoEventBoot.reason) === 'editor-preview', 'editor preview not active');
  await on.close();
  const off = await open('/?design_mode=1&set.event_editor_preview=false', { clock: { fixed: new Date('2026-09-22T12:00:00-04:00') } });
  assert(await off.page.evaluate(() => window.RizoEventBoot.active) === false, 'editor preview should be off');
  await off.close();
});

test('?rizo_event=on persists across pages for the tab; ?rizo_event=clear and =off work', async () => {
  const t = await open('/?rizo_event=on', { clock: { fixed: new Date('2026-09-22T12:00:00-04:00') } });
  await t.page.goto(`${BASE}/collections/all`);
  assert(await t.page.evaluate(() => window.RizoEventBoot.reason) === 'preview', 'preview did not persist');
  await t.page.goto(`${BASE}/?rizo_event=clear`);
  assert(await t.page.evaluate(() => window.RizoEventBoot.active) === false, 'clear did not stop preview');
  await t.page.goto(`${BASE}/?rizo_event=off&set.event_activation=always`);
  assert(await t.page.evaluate(() => window.RizoEventBoot.active) === false, 'off did not win over always');
  await t.close();
});

test('Each module can be switched off on its own', async () => {
  const cases = [
    ['event_moon', () => !document.querySelector('.rizo-event-moon') && !window.RizoEventLayer.stats().moons],
    ['event_fog', () => !document.querySelector('.rizo-event-fog') && !window.RizoEventLayer.stats().fogCanvases],
    ['event_flock', () => !document.querySelector('.rizo-event-flock') && !window.RizoEventLayer.stats().modules.includes('flock')],
    ['event_countdown', () => !document.querySelector('.rizo-event-countdown')],
    ['event_night', () => !document.documentElement.classList.contains('rizo-event--night') && getComputedStyle(document.querySelector('.sky-tone')).backgroundImage === window.__baseSky],
  ];
  const base = await open('/?set.event_layer=off');
  const baseSky = await base.page.evaluate(() => getComputedStyle(document.querySelector('.sky-tone')).backgroundImage);
  await base.close();
  for (const [setting, check] of cases) {
    const t = await open(`/?rizo_event=on&set.${setting}=false`, DESKTOP, (page) => page.addInitScript((sky) => { window.__baseSky = sky; }, baseSky));
    await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
    await t.page.waitForTimeout(200);
    assert(await t.page.evaluate(check), `${setting}=false still renders/runs`);
    if (setting === 'event_flock') assert(!t.requests.some((url) => /rizo-event-flock|event-halloween\.js/.test(url)), 'flock scripts requested with bats off');
    noErrors(t.errors, `${setting}=false`);
    await t.close();
  }
  const t = await open('/?rizo_event=on&set.event_flock_density=0');
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  assert(!(await t.page.evaluate(() => Boolean(document.querySelector('.rizo-event-flock')))), 'bat count 0% should remove the flock');
  await t.close();
  const f = await open('/?rizo_event=on&set.event_fog_intensity=0');
  await waitFor(f.page, () => window.RizoEventLayer?.state.running === true);
  assert(!(await f.page.evaluate(() => Boolean(document.querySelector('.rizo-event-fog')))), 'fog density 0% should remove the fog');
  await f.close();
});

test('On phones: "sky, moon and countdown only" drops fog and bats; "Lighter" halves bats and thins fog', async () => {
  let t = await open('/?rizo_event=on&set.event_phone=off', PHONE);
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  await t.page.waitForTimeout(600);
  let s = await stats(t.page);
  const classes = await htmlClasses(t.page);
  assert(!t.requests.some((url) => /rizo-event-flock|event-halloween\.js/.test(url)), 'bat scripts loaded on a quiet phone');
  assert(!s.fogCanvases && classes.includes('rizo-event--phone-quiet') && s.moons === 1, 'phone-quiet mode wrong', { s, classes });
  noErrors(t.errors, 'phone quiet');
  await t.close();

  t = await open('/?rizo_event=on&set.event_phone=off', DESKTOP);
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  await t.page.waitForTimeout(600);
  s = await stats(t.page);
  assert(s.fogCanvases > 0 && t.requests.some((url) => /rizo-event-flock/.test(url)), 'desktop lost fog or bats in phone-quiet mode', s);
  await t.close();

  t = await open('/?rizo_event=on&set.event_phone=lighter&set.event_flock_density=100', PHONE);
  await waitForFlock(t.page);
  s = await stats(t.page);
  assert(s.flockLimit === Math.round(LIMITS.mobile * .5), 'lighter phones should halve the bats', s);
  note(`Phones: quiet mode → no fog/bats (moon kept); lighter → bat limit ${s.flockLimit} of ${LIMITS.mobile}.`);
  await t.close();
});

test('Colour settings override the preset\'s fog, sky and moonlight', async () => {
  const t = await open('/?rizo_event=on&set.event_fog_color=%23c8b89a&set.event_sky_color=%23080a12&set.event_glow_color=%23ffd9a0', DESKTOP);
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  const tokens = await t.page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ['--rizo-event-fog-rgb', '--rizo-event-sky-top', '--rizo-event-halo-rgb'].map((name) => cs.getPropertyValue(name).trim()); });
  assert(tokens[0] === '200 184 154' && tokens[1] === '#080a12' && tokens[2] === '255 217 160', 'colour overrides not applied', tokens);
  const plain = await open('/?rizo_event=on', DESKTOP);
  const preset = await plain.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--rizo-event-fog-rgb').trim());
  assert(preset === '170 183 197', 'preset fog colour changed without a setting', preset);
  await plain.close();
  await t.close();
});

test('Signal bar shows the event message only while the event is live', async () => {
  const message = 'OCTOBER SIGNAL / RIZO AFTER DARK';
  const read = (page) => page.evaluate(() => [...document.querySelectorAll('.notice-copy')].filter((node) => getComputedStyle(node).display !== 'none').map((node) => node.textContent.trim()));
  const live = await open(`/?rizo_event=on&section.rizo-header.show_announcement=true&section.rizo-header.announcement_text=${encodeURIComponent('Restock Friday.')}&set.event_announcement=${encodeURIComponent(message)}`);
  assert(JSON.stringify(await read(live.page)) === JSON.stringify([message]), 'event message not shown', await read(live.page));
  await live.close();
  const idle = await open(`/?section.rizo-header.show_announcement=true&section.rizo-header.announcement_text=${encodeURIComponent('Restock Friday.')}&set.event_announcement=${encodeURIComponent(message)}`, { clock: { fixed: new Date('2026-09-22T12:00:00-04:00') } });
  const visible = await read(idle.page);
  assert(visible.length === 1 && visible[0] !== message, 'default message should show outside the window', visible);
  await idle.close();
});

/* ------------------------------------------------------------------ */
/* Countdown                                                           */
/* ------------------------------------------------------------------ */

const readCountdown = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-rizo-event-countdown]');
  const unit = (name) => root.querySelector(`[data-unit="${name}"]`)?.textContent;
  return { state: root.dataset.state, ready: root.dataset.ready, hidden: root.hidden, days: unit('days'), hours: unit('hours'), minutes: unit('minutes'), seconds: unit('seconds'), summary: root.querySelector('[data-countdown-summary]')?.textContent, expiredVisible: !root.querySelector('[data-countdown-expired]').hidden };
});

test('Countdown targets Oct 31 12:00 AM New York regardless of visitor timezone', async () => {
  const now = new Date('2026-10-01T12:34:56Z'); // → 29d 15h 25m 04s before 2026-10-31T04:00:00Z
  const seen = [];
  for (const timezoneId of ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'Pacific/Auckland']) {
    const t = await open('/?set.event_countdown_seconds=true', { timezoneId, clock: { fixed: now } });
    await waitFor(t.page, () => document.querySelector('[data-rizo-event-countdown]')?.dataset.ready === 'true');
    const value = await readCountdown(t.page);
    seen.push(`${timezoneId}: ${value.days}d ${value.hours}h ${value.minutes}m ${value.seconds}s`);
    assert(value.days === '29' && value.hours === '15' && value.minutes === '25' && value.seconds === '04', `wrong remaining time in ${timezoneId}`, value);
    assert(/October 31, 2026/.test(value.summary) && /12:00\sAM/.test(value.summary) && /EDT/.test(value.summary), 'screen-reader sentence should name the New York moment', value.summary);
    await t.close();
  }
  note(`Countdown at 2026-10-01T12:34:56Z → ${seen.join(' | ')}`);
});

test('Countdown target without an offset is read in New York time, not the visitor\'s', async () => {
  const t = await open(`/?set.event_countdown_target=${encodeURIComponent('2026-10-31T00:00:00')}`, { timezoneId: 'Asia/Tokyo', clock: { fixed: new Date('2026-10-01T12:34:56Z') } });
  await waitFor(t.page, () => document.querySelector('[data-rizo-event-countdown]')?.dataset.ready === 'true');
  const value = await readCountdown(t.page);
  assert(value.days === '29' && value.hours === '15' && value.minutes === '25', 'offset-less target misread', value);
  await t.close();
});

test('Countdown ticks each second, rewrites only changed digits and never shifts layout', async () => {
  const t = await open('/?rizo_event=on&set.event_countdown_seconds=true', PHONE);
  await waitFor(t.page, () => document.querySelector('[data-rizo-event-countdown]')?.dataset.ready === 'true');
  const result = await t.page.evaluate(() => new Promise((resolve) => {
    const root = document.querySelector('[data-rizo-event-countdown]');
    const boxes = new Set();
    const unitBoxes = new Set();
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    const seconds = new Set();
    const sample = () => {
      const rect = root.getBoundingClientRect();
      boxes.add(`${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`);
      root.querySelectorAll('.rizo-event-countdown-unit').forEach((unit, index) => { const r = unit.getBoundingClientRect(); unitBoxes.add(`${index}:${r.x.toFixed(1)},${r.width.toFixed(1)}`); });
      seconds.add(root.querySelector('[data-unit="seconds"]').textContent);
    };
    const timer = setInterval(sample, 100);
    setTimeout(() => { clearInterval(timer); observer.disconnect(); resolve({ boxes: [...boxes], units: unitBoxes.size, seconds: seconds.size, mutations }); }, 4200);
  }));
  assert(result.seconds >= 4, 'seconds did not tick', result);
  assert(result.boxes.length === 1 && result.units === 4, 'countdown box or unit positions changed while ticking', result);
  assert(result.mutations <= 4 * 4 + 2, 'too many DOM writes per tick', result);
  note(`Countdown: ${result.mutations} DOM mutations over ~4s of ticking; box stayed ${result.boxes[0]}`);
  noErrors(t.errors, 'ticking');
  await t.close();
});

test('Countdown reaching zero shows the ended message (setting: message)', async () => {
  const target = '2026-10-31T00:00:00-04:00';
  const t = await open('/', { clock: { install: new Date(new Date(target).getTime() - 2500) } });
  await waitFor(t.page, () => document.querySelector('[data-rizo-event-countdown]')?.dataset.ready === 'true');
  const events = t.page.evaluate(() => new Promise((resolve) => document.addEventListener('rizo-event:countdown-expired', () => resolve(true), { once: true })));
  await t.page.clock.runFor(3500);
  const value = await readCountdown(t.page);
  assert(value.state === 'expired' && value.expiredVisible && !value.hidden, 'did not switch to the ended message', value);
  assert(await events, 'rizo-event:countdown-expired not dispatched');
  assert(/Tonight\./.test(await t.page.locator('[data-countdown-expired]').innerText()), 'wrong ended message');
  await t.close();
});

test('Countdown reaching zero hides itself (setting: hide) and seconds can be turned off', async () => {
  const target = '2026-10-31T00:00:00-04:00';
  const t = await open('/?set.event_countdown_expired=hide&set.event_countdown_seconds=false', { clock: { install: new Date(new Date(target).getTime() - 61000) } });
  await waitFor(t.page, () => document.querySelector('[data-rizo-event-countdown]')?.dataset.ready === 'true');
  assert(await t.page.evaluate(() => !document.querySelector('[data-unit="seconds"]')), 'seconds unit should not render');
  await t.page.clock.runFor(62000);
  const value = await readCountdown(t.page);
  assert(value.state === 'expired' && value.hidden, 'countdown should be hidden after zero', value);
  await t.close();
});

test('Server renders an already-past countdown in its ended state (no flash)', async () => {
  const html = await (await fetch(`${BASE}/?set.event_countdown_target=${encodeURIComponent('2026-01-01T00:00:00-05:00')}`)).text();
  const tag = html.match(/<div class="rizo-event-countdown[^>]*>/)?.[0] || '';
  assert(/data-state="expired"/.test(tag), 'server did not pre-render the ended state', tag);
  assert(/<p class="rizo-event-countdown-expired" data-countdown-expired>/.test(html), 'ended message should render visible');
});

test('Countdown pauses on a hidden tab and resyncs when visible', async () => {
  const t = await open('/?rizo_event=on');
  await waitFor(t.page, () => window.RizoEventLayer?.stats().countdownTimers === 1);
  const setHidden = (hidden) => t.page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await waitForBats(t.page, 1);
  await setHidden(true);
  await t.page.waitForTimeout(300);
  const hidden = await stats(t.page);
  assert(hidden.countdownTimers === 0 && hidden.loopRunning === false, 'timers/loop kept running while hidden', hidden);
  await setHidden(false);
  await t.page.waitForTimeout(300);
  const visible = await stats(t.page);
  assert(visible.countdownTimers === 1, 'countdown did not resume', visible);
  note('Hidden-tab behaviour verified by simulating document.hidden + visibilitychange (headless Chromium cannot background a tab).');
  await t.close();
});

/* ------------------------------------------------------------------ */
/* Bats: input safety, bounds, stress                                  */
/* ------------------------------------------------------------------ */

test('Clicks and taps pass straight through moving bats', async () => {
  for (const options of [DESKTOP, PHONE]) {
    const t = await open('/?rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100', options);
    await t.page.evaluate(() => {
      window.__clickTargets = [];
      document.addEventListener('click', (event) => { window.__clickTargets.push(event.target.closest('.rizo-event-flock') ? 'FLOCK' : event.target.tagName); event.preventDefault(); }, true);
    });
    await waitForBats(t.page, 1);
    let hits = 0;
    for (let index = 0; index < 20; index += 1) {
      const point = await t.page.evaluate(() => {
        const bat = [...document.querySelectorAll('.rizo-event-flyer.is-active')].map((node) => node.getBoundingClientRect()).find((rect) => rect.x > 0 && rect.y > 0 && rect.right < innerWidth && rect.bottom < innerHeight);
        if (!bat) return null;
        const x = bat.x + bat.width / 2;
        const y = bat.y + bat.height / 2;
        const top = document.elementFromPoint(x, y);
        return { x, y, underFlock: Boolean(top?.closest('.rizo-event-flock')) };
      });
      if (!point) { await t.page.waitForTimeout(250); continue; }
      assert(!point.underFlock, 'elementFromPoint hit a bat', point);
      if (options.hasTouch) await t.page.touchscreen.tap(point.x, point.y); else await t.page.mouse.click(point.x, point.y);
      hits += 1;
    }
    const targets = await t.page.evaluate(() => window.__clickTargets);
    assert(hits >= 5, 'could not find on-screen bats to click', hits);
    assert(!targets.includes('FLOCK'), 'a click landed on the flock layer', targets);
    note(`${options.hasTouch ? 'Phone' : 'Desktop'}: ${hits} clicks aimed at moving bats; every one reached page content (${[...new Set(targets)].join(', ')}).`);
    noErrors(t.errors, 'clicking bats');
    await t.close();
  }
});

test('SHOP still shops: hero CTA works with a bat parked on top of it', async () => {
  const t = await open('/?rizo_event=on');
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  const box = await t.page.locator('.hero-actions .btn--solid').boundingBox();
  // Clone a flyer onto the button: same classes, same CSS, stays put.
  await t.page.evaluate(({ x, y }) => {
    const bat = document.createElement('span');
    bat.className = 'rizo-event-flyer is-active';
    bat.style.transform = `translate3d(${x}px, ${y}px, 0) scale(3)`;
    bat.style.setProperty('--rizo-flyer-sheet', 'url("/cdn/assets/event-halloween-bat-a.svg")');
    bat.innerHTML = '<span class="rizo-event-flyer-sheet"></span>';
    document.querySelector('[data-rizo-event-flock="front"]').append(bat);
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await t.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await t.page.waitForURL(/\/collections\/all/, { timeout: 5000 }).catch(() => {});
  assert(new URL(t.page.url()).pathname === '/collections/all', 'SHOP click did not reach the link', t.page.url());
  await t.close();
});

test('Rapid tapping (200 taps) keeps the flock bounded', async () => {
  for (const [options, tier] of [[DESKTOP, 'desktop'], [PHONE, 'mobile']]) {
    const t = await open('/?rizo_event=on&set.event_flock_density=100&rizo_event_seed=3', options);
    await waitForFlock(t.page);
    await t.page.evaluate(() => document.addEventListener('click', (event) => event.preventDefault(), true));
    let peak = 0;
    for (let index = 0; index < 200; index += 1) {
      const x = 20 + Math.random() * (options.viewport.width - 40);
      const y = 120 + Math.random() * (options.viewport.height - 240);
      if (options.hasTouch) await t.page.touchscreen.tap(x, y); else await t.page.mouse.click(x, y);
      if (index % 20 === 0) {
        const s = await stats(t.page);
        peak = Math.max(peak, s.flockActive);
        assert(s.flockActive <= s.flockLimit && s.flockElements <= LIMITS[tier] && s.loopTasks <= 2, 'flock exceeded its bounds', s);
      }
    }
    const s = await stats(t.page);
    assert(s.flockPeak <= LIMITS[tier] && s.flockPeak <= s.flockLimit && s.flockElements <= LIMITS[tier], 'flock exceeded its bounds', s);
    assert(s.flockSpawned > 0, 'taps never startled a bat', s);
    note(`${tier}: 200 taps → spawned ${s.flockSpawned}, scattered ${s.flockScattered}, peak ${s.flockPeak}/${s.flockLimit} active, ${s.flockElements} pooled elements (cap ${LIMITS[tier]}).`);
    noErrors(t.errors, `rapid tapping (${tier})`);
    await t.close();
  }
});

test('Aggressive scrolling both ways wakes bats but stays bounded', async () => {
  for (const [options, tier] of [[DESKTOP, 'desktop'], [PHONE, 'mobile']]) {
    const t = await open('/?rizo_event=on&set.event_flock_activity=0&rizo_event_seed=9', options);
    await waitForFlock(t.page);
    for (let index = 0; index < 40; index += 1) {
      const delta = (index % 8 < 4 ? 1 : -1) * (600 + (index % 3) * 500);
      if (options.hasTouch) await t.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'instant' }), delta);
      else await t.page.mouse.wheel(0, delta);
      await t.page.waitForTimeout(40);
      if (index % 5 === 0) {
        const s = await stats(t.page);
        assert(s.flockActive <= s.flockLimit && s.flockElements <= LIMITS[tier], 'scrolling exceeded flock bounds', s);
      }
    }
    await t.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await t.page.evaluate(() => window.scrollTo(0, 0));
    await t.page.waitForTimeout(600);
    const s = await stats(t.page);
    assert(s.flockSpawned > 0, 'scrolling never woke a bat (idle activity was 0)', s);
    assert(s.flockPeak <= s.flockLimit, 'peak over limit', s);
    note(`${tier}: 40 fast scroll bursts + two full-page jumps → ${s.flockSpawned} bats woken, peak ${s.flockPeak}/${s.flockLimit}.`);
    noErrors(t.errors, `scrolling (${tier})`);
    await t.close();
  }
});

test('Bats leave and are recycled; the loop sleeps when nothing moves; fog paints at half rate', async () => {
  const t = await open('/?rizo_event=on&set.event_flock_activity=0&set.event_fog=false&set.event_flock_roost=false&rizo_event_seed=4');
  await waitForFlock(t.page);
  await t.page.evaluate(() => document.addEventListener('click', (event) => event.preventDefault(), true));
  await t.page.mouse.click(700, 600); // startle in open hero space
  await waitForBats(t.page, 1, 3000);
  await waitFor(t.page, () => window.RizoEventLayer.stats().flockActive === 0, null, 15000);
  await t.page.waitForTimeout(300);
  const s = await stats(t.page);
  assert(s.flockRecycled >= 1 && s.loopRunning === false && s.loopTasks === 0, 'bats not recycled or loop still running when idle', s);
  await t.close();
  const f = await open('/?rizo_event=on&set.event_flock=false');
  await waitFor(f.page, () => (window.RizoEventLayer?.stats().fogPaints || 0) > 5);
  const rate = await f.page.evaluate(() => new Promise((resolve) => {
    const before = window.RizoEventLayer.stats().fogPaints;
    let frames = 0;
    const tick = () => { frames += 1; if (frames < 120) requestAnimationFrame(tick); else resolve({ frames, paints: window.RizoEventLayer.stats().fogPaints - before }); };
    requestAnimationFrame(tick);
  }));
  assert(rate.paints <= rate.frames * .55 * 2 + 2, 'fog repainted more than every other frame', rate);
  note(`Idle fog: ${rate.paints} paints (two canvases) over ${rate.frames} frames.`);
  await f.close();
});

test('Exactly one animation loop: the whole theme makes at most one rAF request per frame', async () => {
  // Every real requestAnimationFrame call is counted. The measuring loop below
  // makes one per frame; everything else (event layer, art layers, header)
  // must share one more through window.RizoFrame.
  const t = await open('/?rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100', DESKTOP, (page) => page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    window.__raf = 0;
    window.requestAnimationFrame = (callback) => { window.__raf += 1; return original(callback); };
  }));
  await waitForBats(t.page, 1);
  const result = await t.page.evaluate(() => new Promise((resolve) => {
    const before = window.__raf;
    let frames = 0;
    const count = () => { frames += 1; if (frames < 90) requestAnimationFrame(count); else resolve({ frames, theme: window.__raf - before - frames, shared: Boolean(window.RizoFrame) }); };
    requestAnimationFrame(count);
    let y = 0;
    const scroller = setInterval(() => { y += 90; window.scrollTo(0, y); if (y > 2000) clearInterval(scroller); }, 30);
  }));
  assert(result.shared, 'shared frame missing');
  assert(result.theme <= result.frames + 2, 'more than one theme rAF per frame', result);
  note(`rAF audit: ${result.theme} theme requests over ${result.frames} frames while bats flew, fog drifted and the page scrolled (one shared frame).`);
  await t.close();
});

test('Open drawer/menu pauses the flock; closing resumes it', async () => {
  const t = await open('/?rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100');
  await waitForBats(t.page, 1);
  await t.page.locator('.hdr-cart').click();
  await waitFor(t.page, () => document.body.classList.contains('is-overlay-open'));
  await waitFor(t.page, () => getComputedStyle(document.querySelector('.rizo-event-stage--front')).opacity === '0', null, 4000).catch(() => {});
  await t.page.waitForTimeout(300);
  const open1 = await stats(t.page);
  const paused = await t.page.evaluate(() => ({ opacity: getComputedStyle(document.querySelector('.rizo-event-stage--front')).opacity, paints: window.RizoEventLayer.stats().fogPaints }));
  await t.page.waitForTimeout(500);
  const paintsLater = await t.page.evaluate(() => window.RizoEventLayer.stats().fogPaints);
  assert(open1.overlayOpen && !open1.loopRunning && paused.opacity === '0' && paintsLater === paused.paints, 'ambient motion kept running under the drawer', { ...open1, ...paused, paintsLater });
  await t.page.keyboard.press('Escape');
  await waitFor(t.page, () => !document.body.classList.contains('is-overlay-open'));
  await waitFor(t.page, () => window.RizoEventLayer.stats().flockIdleScheduled || window.RizoEventLayer.stats().loopRunning);
  noErrors(t.errors, 'drawer pause/resume');
  await t.close();
});

test('Frame-time governor steps a struggling device down to lite, then still', async () => {
  // Burn ~60ms in every frame to imitate a weak phone.
  const t = await open('/?rizo_event=on&set.event_flock_activity=100', { ...DESKTOP, governor: true }, (page) => page.addInitScript(() => {
    const burn = () => { const end = performance.now() + 60; while (performance.now() < end) { /* busy */ } requestAnimationFrame(burn); };
    requestAnimationFrame(burn);
  }));
  await waitFor(t.page, () => (window.RizoEventLayer?.stats().degrade || 0) >= 2, null, 45000);
  const s = await stats(t.page);
  const classes = await htmlClasses(t.page);
  const still = !s.fogMoving;
  assert(s.tier === 'lite' && classes.includes('rizo-event--tier-lite') && classes.includes('rizo-event--still') && still, 'governor did not step down', { s, classes, still });
  assert(s.flockLimit <= Math.ceil(LIMITS.lite * .5), 'bat limit not reduced', s);
  note(`Governor: with 60ms of work per frame the layer stepped down to lite + still (bat limit ${s.flockLimit}).`);
  await t.close();
});

/* ------------------------------------------------------------------ */
/* Theme editor, reloads, resize                                       */
/* ------------------------------------------------------------------ */

test('Theme editor section reloads (x8) never duplicate timers, observers or listeners', async () => {
  const t = await open('/?design_mode=1', DESKTOP, (page) => page.addInitScript(() => {
    window.__visibilityListeners = 0;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
      if (type === 'visibilitychange' && /rizo-event/.test(new Error().stack || '')) window.__visibilityListeners += 1;
      return add.call(this, type, ...rest);
    };
    EventTarget.prototype.removeEventListener = function (type, ...rest) {
      if (type === 'visibilitychange' && /rizo-event/.test(new Error().stack || '')) window.__visibilityListeners -= 1;
      return remove.call(this, type, ...rest);
    };
  }));
  await waitFor(t.page, () => window.RizoEventLayer?.stats().countdownTimers === 1);
  const before = await t.page.evaluate(() => ({ ...window.RizoEventLayer.stats(), listeners: window.__visibilityListeners }));
  for (let index = 0; index < 8; index += 1) {
    await t.page.evaluate(async () => {
      const html = await (await fetch('/?section_id=hero&design_mode=1')).text();
      const old = document.getElementById('shopify-section-hero');
      old.dispatchEvent(new CustomEvent('shopify:section:unload', { bubbles: true, detail: { sectionId: 'hero' } }));
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const fresh = holder.firstElementChild;
      old.replaceWith(fresh);
      fresh.dispatchEvent(new CustomEvent('shopify:section:load', { bubbles: true, detail: { sectionId: 'hero' } }));
    });
    await t.page.waitForTimeout(150);
  }
  await t.page.waitForTimeout(600);
  const after = await t.page.evaluate(() => ({ ...window.RizoEventLayer.stats(), listeners: window.__visibilityListeners }));
  for (const key of ['countdowns', 'countdownTimers', 'heroes', 'moons', 'quietZones']) assert(after[key] === before[key], `${key} changed after reloads`, { before: before[key], after: after[key] });
  assert(after.listeners === before.listeners, 'visibilitychange listeners leaked', { before: before.listeners, after: after.listeners });
  assert(after.flockElements <= LIMITS.desktop, 'flock duplicated', after);
  assert(await t.page.evaluate(() => document.querySelectorAll('[data-rizo-event-countdown][data-ready]').length) === 1, 'reloaded countdown not initialised');
  note(`Editor reloads x8: countdown timers ${before.countdownTimers}→${after.countdownTimers}, heroes ${before.heroes}→${after.heroes}, event visibility listeners ${before.listeners}→${after.listeners}.`);
  noErrors(t.errors, 'section reloads');
  await t.close();
});

test('Resize and orientation changes keep limits and layout sane', async () => {
  const t = await open('/?rizo_event=on&set.event_flock_density=100', PHONE);
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  for (const size of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 430, height: 932 }]) {
    await t.page.setViewportSize(size);
    await t.page.waitForTimeout(400);
    const s = await stats(t.page);
    const overflow = await t.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(s.flockActive <= s.flockLimit && s.flockElements <= LIMITS.mobile && overflow <= 0, 'bad state after resize', { size, s, overflow });
  }
  noErrors(t.errors, 'resizing');
  await t.close();
  const d = await open('/?rizo_event=on');
  await waitFor(d.page, () => window.RizoEventLayer?.state.running === true);
  await d.page.setViewportSize({ width: 600, height: 900 });
  await waitFor(d.page, () => window.RizoEventLayer.stats().tier === 'mobile', null, 5000).catch(() => {});
  assert((await stats(d.page)).tier === 'mobile', 'desktop window narrowed to phone width should use phone limits');
  await d.page.setViewportSize({ width: 1440, height: 900 });
  await waitFor(d.page, () => window.RizoEventLayer.stats().tier === 'desktop', null, 5000).catch(() => {});
  assert((await stats(d.page)).tier === 'desktop', 'tier did not return to desktop');
  await d.close();
});

test('Multiple reloads: one engine per page, no errors', async () => {
  const t = await open('/?rizo_event=on');
  for (let index = 0; index < 5; index += 1) {
    await t.page.reload({ waitUntil: 'load' });
    await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
    const count = await t.page.evaluate(() => document.querySelectorAll('script[src*="rizo-event-layer.js"]').length);
    assert(count === 1, 'engine injected more than once', count);
  }
  noErrors(t.errors, 'reloads');
  await t.close();
});

/* ------------------------------------------------------------------ */
/* Reduced motion, accessibility, keyboard                             */
/* ------------------------------------------------------------------ */

test('Reduced motion: night, moon, still fog and countdown stay; bats never load', async () => {
  const t = await open('/?rizo_event=on', { ...DESKTOP, reducedMotion: 'reduce' });
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  await t.page.waitForTimeout(400);
  const result = await t.page.evaluate(() => ({
    night: document.documentElement.classList.contains('rizo-event--night'),
    moon: getComputedStyle(document.querySelector('.rizo-event-moon')).display,
    moonSet: window.RizoEventLayer.stats().moonSet,
    fog: getComputedStyle(document.querySelector('.rizo-event-fog')).display,
    fogMoving: window.RizoEventLayer.stats().fogMoving,
    flock: getComputedStyle(document.querySelector('.rizo-event-flock')).display,
    countdown: document.querySelector('[data-rizo-event-countdown]').dataset.ready,
    modules: window.RizoEventLayer.stats().modules
  }));
  assert(!t.requests.some((url) => /rizo-event-flock|event-halloween\.js/.test(url)), 'flock scripts loaded under reduced motion');
  assert(result.night && result.moon !== 'none' && result.fog !== 'none' && result.countdown === 'true', 'static atmosphere missing', result);
  assert(result.moonSet === 0 && result.fogMoving === false && result.flock === 'none' && !result.modules.includes('flock'), 'motion still running', result);
  await t.close();
  const minimal = await open('/?rizo_event=on&set.event_reduced_motion=minimal', { ...DESKTOP, reducedMotion: 'reduce' });
  await waitFor(minimal.page, () => window.RizoEventLayer?.state.running === true);
  const m = await minimal.page.evaluate(() => ({ hero: getComputedStyle(document.querySelector('.rizo-event-moon')).display === 'none' && getComputedStyle(document.querySelector('.rizo-event-fog')).display === 'none' ? 'none' : 'shown', countdown: getComputedStyle(document.querySelector('.rizo-event-countdown')).display, night: document.documentElement.classList.contains('rizo-event--night') }));
  assert(m.hero === 'none' && m.countdown !== 'none' && m.night, '"minimal" should keep only night + countdown', m);
  await minimal.close();
});

test('Reduced motion switched on mid-visit stops bats; switched off brings them back', async () => {
  const t = await open('/?rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100');
  await waitForBats(t.page, 1);
  await t.page.emulateMedia({ reducedMotion: 'reduce' });
  await waitFor(t.page, () => { const s = window.RizoEventLayer.stats(); return s.reduced && s.flockActive === 0 && !s.loopRunning; }, null, 5000).catch(() => {});
  let s = await stats(t.page);
  assert(s.flockActive === 0 && !s.flockIdleScheduled && !s.loopRunning, 'bats kept flying after reduced motion', s);
  await t.page.emulateMedia({ reducedMotion: 'no-preference' });
  await waitFor(t.page, () => window.RizoEventLayer.stats().flockIdleScheduled, null, 5000).catch(() => {});
  s = await stats(t.page);
  assert(s.flockIdleScheduled, 'bats did not resume', s);
  await t.close();
});

test('Decorative layers stay out of the accessibility tree; countdown is a labelled timer', async () => {
  const t = await open('/?rizo_event=on');
  await waitFor(t.page, () => document.querySelector('[data-rizo-event-countdown]')?.dataset.ready === 'true');
  await waitForBats(t.page, 1);
  const result = await t.page.evaluate(() => {
    const hiddenOk = [...document.querySelectorAll('.rizo-event-stage, .rizo-event-flyer, .rizo-roost, .sky')].every((node) => node.closest('[aria-hidden="true"]'));
    const focusable = document.querySelectorAll('.sky a, .sky button, .sky [tabindex], .rizo-event-stage a, .rizo-event-stage button, .rizo-event-stage [tabindex]').length;
    const timer = document.querySelector('.rizo-event-countdown [role="timer"]');
    const live = document.querySelector('.rizo-event-countdown [aria-live]:not([aria-live="off"])');
    return { hiddenOk, focusable, labelled: Boolean(timer?.getAttribute('aria-labelledby')), digitsHidden: timer?.querySelector('.rizo-event-countdown-units')?.getAttribute('aria-hidden') === 'true', live: Boolean(live) };
  });
  assert(result.hiddenOk && result.focusable === 0 && result.labelled && result.digitsHidden && !result.live, 'accessibility contract broken', result);
  const aria = await t.page.locator('.rizo-event-countdown').ariaSnapshot();
  assert(/timer "Halloween in"/.test(aria) && /Halloween begins/.test(aria) && !/\b\d{2}\b.*\b\d{2}\b.*\b\d{2}\b/.test(aria.replace(/2026|12:00/g, '')), 'unexpected countdown accessibility snapshot', aria);
  note(`Countdown ARIA: ${aria.replace(/\n\s*/g, ' / ')}`);
  await t.close();
});

test('Keyboard focus order is identical with the event on and off', async () => {
  const order = async (url) => {
    const t = await open(url);
    await t.page.waitForTimeout(500);
    const seen = [];
    for (let index = 0; index < 18; index += 1) {
      await t.page.keyboard.press('Tab');
      seen.push(await t.page.evaluate(() => { const el = document.activeElement; return `${el.tagName}.${(el.className || '').toString().split(' ')[0]}:${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)}`; }));
    }
    await t.close();
    return seen;
  };
  const off = await order('/?set.event_layer=off');
  const on = await order('/?rizo_event=on');
  assert(JSON.stringify(off) === JSON.stringify(on), 'focus order changed', { off, on });
});

/* ------------------------------------------------------------------ */
/* Storefront flows with the event live                                */
/* ------------------------------------------------------------------ */

test('Quick add (variant + single-variant), cart drawer, cart page and checkout work with bats flying', async () => {
  for (const [options, label] of [[DESKTOP, 'desktop'], [PHONE, 'phone']]) {
    const t = await open('/?rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100', options);
    await waitForFlock(t.page);
    await waitForBats(t.page, 1);
    const tap = (locator) => press(t.page, locator, options.hasTouch);
    // Variant product: quick add dialog → choose L → add.
    await tap(t.page.locator('[data-product-card][data-product-title="Night Signal Hoodie"] [data-quick-add-open]'));
    await waitFor(t.page, () => !document.querySelector('[data-overlay="quick-add"]').hidden && document.querySelectorAll('[data-quick-option]').length > 0);
    const soldOut = await t.page.locator('[data-quick-option][data-value="M"]').isDisabled();
    await tap(t.page.locator('[data-quick-option][data-value="L"]'));
    await tap(t.page.locator('[data-quick-add-submit]'));
    await waitFor(t.page, () => !document.getElementById('RizoCart').hidden && document.querySelectorAll('[data-cart-lines] [data-cart-change]').length > 0);
    assert(soldOut, 'sold-out size M should be disabled in quick add');
    assert(await t.page.locator('[data-cart-count]').first().innerText() === '1', `${label}: cart count after quick add`);
    await t.page.keyboard.press('Escape');
    await waitFor(t.page, () => document.getElementById('RizoCart').hidden);
    // Single-variant product: direct add.
    await tap(t.page.locator('[data-product-card][data-product-title="Flame Cap"] .card-form button[type="submit"]'));
    await waitFor(t.page, () => !document.getElementById('RizoCart').hidden && document.querySelector('[data-cart-count]').textContent.trim() === '2');
    // Cart page: increase quantity, then checkout.
    await t.page.goto(`${BASE}/cart`);
    const lines = await t.page.locator('.cart-page [name="updates[]"], .cart-page input[type="number"]').count();
    assert(lines >= 2, `${label}: cart page should list both lines`, lines);
    await tap(t.page.locator('.cart-page button[name="checkout"]'));
    await t.page.waitForSelector('[data-mock-checkout]');
    noErrors(t.errors, `${label} commerce flow`);
    await t.close();
  }
});

test('Product page: variant picker, sold-out state, add to cart and sticky bar with the event live', async () => {
  const t = await open('/products/night-signal-hoodie?rizo_event=on', PHONE);
  await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
  // IntersectionObserver publishes the initial quiet-zone result after mount.
  await waitFor(t.page, () => window.RizoEventLayer.state.quiet);
  const quiet = await t.page.evaluate(() => window.RizoEventLayer.state.quiet);
  const soldOut = await t.page.locator('[data-option-button][data-value="M"]').evaluate((node) => node.disabled || node.getAttribute('aria-disabled') === 'true' || node.classList.contains('is-unavailable'));
  await press(t.page, t.page.locator('[data-option-button][data-value="XL"]'), true);
  await press(t.page, t.page.locator('[data-product-submit]'), true);
  await waitFor(t.page, () => !document.getElementById('RizoCart').hidden && document.querySelector('[data-cart-count]').textContent.trim() === '1');
  await t.page.keyboard.press('Escape');
  await t.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await t.page.waitForTimeout(600);
  const sticky = await t.page.evaluate(() => { const bar = document.querySelector('[data-sticky-atc]'); const fog = document.querySelector('.rizo-event-stage--front'); return { visible: !bar.hidden, barZ: Number(getComputedStyle(bar).zIndex), fogZ: fog ? Number(getComputedStyle(fog).zIndex) : 0 }; });
  assert(soldOut, 'sold-out size should be marked unavailable');
  assert(quiet, 'product page should be a quiet zone for effects');
  assert(!sticky.visible || sticky.barZ > sticky.fogZ, 'sticky add-to-cart must sit above the page fog', sticky);
  noErrors(t.errors, 'product page');
  await t.close();
});

test('Menu, search and newsletter form work with the event live', async () => {
  const t = await open('/?rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100', PHONE);
  await waitForBats(t.page, 1);
  await press(t.page, t.page.locator('.hdr-menu'), true);
  await waitFor(t.page, () => !document.getElementById('RizoMenu').hidden && document.activeElement?.closest('#RizoMenu'));
  await t.page.keyboard.press('Escape');
  await waitFor(t.page, () => document.getElementById('RizoMenu').hidden);
  assert(await t.page.evaluate(() => document.activeElement?.classList.contains('hdr-menu')), 'focus did not return to the menu button');
  await press(t.page, t.page.locator('.dock [data-overlay-open="search"]'), true);
  await waitFor(t.page, () => !document.getElementById('RizoSearch').hidden);
  await t.page.keyboard.press('Escape');
  await waitFor(t.page, () => document.getElementById('RizoSearch').hidden);
  const form = t.page.locator('.signup-form').first();
  await form.locator('input[type="email"]').fill('signal@example.com');
  const [request] = await Promise.all([t.page.waitForRequest((req) => req.method() === 'POST' && /\/contact/.test(req.url())), press(t.page, form.locator('button[type="submit"]'), true)]);
  assert(Boolean(request), 'newsletter form did not submit');
  noErrors(t.errors.filter((error) => !/404/.test(error)), 'menu/search/form');
  await t.close();
});

test('Every page type loads without errors with the event live', async () => {
  for (const path of ['/', '/collections/all', '/products/rizo-camo-tee', '/products/412-crewneck', '/cart', '/pages/world', '/pages/about', '/pages/circle', '/pages/contact', '/pages/faq', '/collections', '/search', '/search?q=hoodie', '/nope']) {
    for (const options of [DESKTOP, PHONE]) {
      const t = await open(`${path}${path.includes('?') ? '&' : '?'}rizo_event=on`, options);
      await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
      await t.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      await t.page.waitForTimeout(250);
      noErrors(t.errors.filter((error) => !/status of 404/.test(error)), `${path}`);
      await t.close();
    }
  }
});

test('Event layer adds no horizontal overflow at 320, 375, 390, 430, landscape, tablet and desktop widths', async () => {
  // Measured against the device width (not innerWidth, which grows with the
  // layout viewport on phones) and compared with the same page event-off.
  const sizes = [[320, 568, true], [375, 667, true], [390, 844, true], [430, 932, true], [844, 390, true], [768, 1024, true], [1024, 768, false], [1440, 900, false]];
  const preexisting = new Set();
  for (const [width, height, touch] of sizes) {
    for (const path of ['/', '/products/night-signal-hoodie', '/collections/all', '/cart']) {
      const widest = async (query) => {
        const t = await open(`${path}?${query}`, { viewport: { width, height }, isMobile: touch, hasTouch: touch });
        if (!query.includes('event_layer=off')) await waitFor(t.page, () => window.RizoEventLayer?.state.running === true);
        let worst = 0;
        for (const fraction of [0, .25, .5, .75, 1]) {
          await t.page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), fraction);
          await t.page.waitForTimeout(120);
          worst = Math.max(worst, await t.page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth)));
        }
        await t.close();
        return worst - width;
      };
      const off = await widest('set.event_layer=off');
      const on = await widest('rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100');
      if (off > 0) preexisting.add(`${path} at ${width}px: +${off}px`);
      assert(on <= Math.max(0, off), `event layer widened ${path} at ${width}x${height}`, { off, on });
    }
  }
  if (preexisting.size) note(`Pre-existing overflow (same with the event Off, not caused by the event layer): ${[...preexisting].join('; ')}`);
});

/* ------------------------------------------------------------------ */
/* Performance sample                                                  */
/* ------------------------------------------------------------------ */

test('Performance sample: frame pacing (event Off vs On) while the page scrolls; event asset weight', async () => {
  // Headless Chromium here composites on the CPU (no GPU), which inflates the
  // cost of any large animated layer. Compare Off and On in the same setup;
  // treat absolute numbers as a relative signal, not device performance.
  const sample = (page) => page.evaluate(() => new Promise((resolve) => {
    const gaps = [];
    let last = performance.now();
    const start = last;
    const tick = (now) => {
      gaps.push(now - last);
      last = now;
      if (now - start < 4000) requestAnimationFrame(tick);
      else {
        gaps.sort((a, b) => a - b);
        resolve({ fps: +(gaps.length / 4).toFixed(1), p50: +gaps[Math.floor(gaps.length * .5)].toFixed(1), p95: +gaps[Math.floor(gaps.length * .95)].toFixed(1) });
      }
    };
    requestAnimationFrame(tick);
    let y = 0;
    const scroller = setInterval(() => { y += 60; window.scrollTo(0, y); if (y > 3000) clearInterval(scroller); }, 16);
  }));
  for (const [options, label] of [[DESKTOP, 'desktop 1440x900'], [PHONE, 'phone 390x844@3x']]) {
    const off = await open('/?set.event_layer=off', options);
    await off.page.waitForTimeout(600);
    const offResult = await sample(off.page);
    await off.close();
    const t = await open('/?rizo_event=on&set.event_flock_density=100&set.event_flock_activity=100', options);
    await waitForBats(t.page, 1, 15000).catch(() => {});
    const onResult = await sample(t.page);
    const s = await stats(t.page);
    const weights = await t.page.evaluate(() => {
      const seen = new Map();
      performance.getEntriesByType('resource').filter((entry) => /rizo-event|event-halloween/.test(entry.name)).forEach((entry) => seen.set(entry.name.split('/').pop().split('?')[0], entry.encodedBodySize || entry.transferSize));
      return [...seen];
    });
    const total = weights.reduce((sum, [, size]) => sum + size, 0);
    note(`${label} (CPU-composited headless): Off ${offResult.fps} fps (p95 ${offResult.p95}ms) vs On ${onResult.fps} fps (p95 ${onResult.p95}ms), peak bats ${s.flockPeak}, fog canvases ${(s.fogCanvasPixels / 1e6).toFixed(2)} MP. Event assets ${(total / 1024).toFixed(1)} KB uncompressed: ${weights.map(([name, size]) => `${name} ${(size / 1024).toFixed(1)}`).join(', ')}`);
    await t.close();
  }
});

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const server = spawn(process.execPath, [path.join(HERE, '../preview/server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (chunk) => { if (String(chunk).includes('Rizo preview')) resolve(); });
  server.on('exit', (code) => reject(new Error(`preview server exited ${code}`)));
  setTimeout(() => reject(new Error('preview server did not start')), 10000);
});

browser = await chromium.launch();
const results = [];
for (const { name, fn } of tests) {
  if (FILTER && !FILTER.test(name)) continue;
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
    const detail = error.message.split('\n').filter((line, index) => index === 0 || /not stable|intercepts|not visible|not enabled|waiting for|retrying/.test(line)).slice(0, 6);
    console.log(`FAIL  ${name}\n      ${detail.join('\n      ')}`);
  }
}
await browser.close();
server.kill();

console.log('\nNotes');
notes.forEach((text) => console.log(`  - ${text}`));
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
