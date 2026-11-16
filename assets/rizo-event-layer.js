/*
  RIZO EVENT LAYER — runtime engine

  Loaded by the boot script in snippets/rizo-event-head.liquid, and only while
  an event is live. When the Event layer is Off or outside its schedule this
  file is never requested.

  Owns the shared pieces every event uses:
    loop        one frame task on the theme's shared frame (window.RizoFrame);
                runs only while a task needs it
    governor    steps weak devices down (lite, then still), never up
    input       passive scroll-velocity and tap observation (never blocks input)
    state       device tier, motion scale, reduced motion, hero/quiet/overlay
    atmosphere  reads data-fog / data-fog-bias from sections: how much fog
                collects where, measured on layout changes, not on scroll
    modules     hero, quiet, countdown, fog, moon (here); flock
                (rizo-event-flock.js); anything a preset defines
    behaviors   event-specific motion (e.g. assets/event-halloween.js)

  Modules are idempotent: they re-scan on shopify:section:load, dispose on
  shopify:section:unload, and never double-bind an element.

  Console / QA:  RizoEventLayer.stats()   RizoEventLayer.deactivate()
                 RizoEventLayer.moonPhase  RizoEventLayer.module('moon')
*/
(() => {
  'use strict';

  const boot = window.RizoEventBoot;
  if (!boot || !boot.active || window.RizoEventLayer) return;

  const VERSION = '1.3.0';
  const doc = document;
  const root = doc.documentElement;
  const config = boot.config;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallQuery = window.matchMedia('(max-width: 749px)');
  const coarseQuery = window.matchMedia('(pointer: coarse)');
  const warn = (...args) => console.warn('[Rizo event layer]', ...args);

  /* Randomness: varied per visit, reproducible with ?rizo_event_seed=123 */
  const createRandom = (seed) => {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };
  const seedParam = Number(new URLSearchParams(window.location.search).get('rizo_event_seed'));
  const random = createRandom(seedParam > 0 ? seedParam : (Date.now() ^ Math.floor(performance.now() * 1000)));

  /* ---------------------------------------------------------------------- */
  /* State                                                                   */
  /* ---------------------------------------------------------------------- */

  // data-low-power is decided once in layout/theme.liquid (Save-Data, ≤2 GB,
  // ≤2 cores) and shared with the art layers.
  const detectTier = () => {
    if (root.dataset.lowPower === 'true') return 'lite';
    return smallQuery.matches || coarseQuery.matches ? 'mobile' : 'desktop';
  };

  const motionScale = () => clamp(Number(config.motion?.intensity) || 0, 0, 1) * (root.dataset.motion === 'calm' ? .5 : 1);

  const state = {
    running: false,
    tier: detectTier(),
    degrade: 0,
    reduced: reducedQuery.matches,
    motionScale: motionScale(),
    heroVisible: false,
    quiet: false,
    overlayOpen: false,
    viewport: { width: window.innerWidth, height: window.innerHeight }
  };

  const setTierClass = () => {
    ['desktop', 'mobile', 'lite'].forEach((tier) => root.classList.toggle(`rizo-event--tier-${tier}`, tier === state.tier));
  };

  /* ---------------------------------------------------------------------- */
  /* Event bus                                                               */
  /* ---------------------------------------------------------------------- */

  const listeners = new Map();
  const on = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type)?.delete(fn);
  };
  const emit = (type, detail) => {
    listeners.get(type)?.forEach((fn) => {
      try { fn(detail); } catch (error) { console.error('[Rizo event layer]', error); }
    });
  };

  /* ---------------------------------------------------------------------- */
  /* Loop: one frame task, queued on the theme's shared frame              */
  /* ---------------------------------------------------------------------- */

  /* Sustained frames below ~24fps reduce detail. A steady 30fps is healthy.
     Fog keeps drifting at every tier; reduced motion remains still.
     Disable for testing with ?rizo_event_governor=off. */
  const governorEnabled = new URLSearchParams(window.location.search).get('rizo_event_governor') !== 'off';
  const governor = {
    average: 16.7,
    samples: 0,
    sample(ms) {
      if (!governorEnabled || ms > 250) return; // a tab switch or long task is not a frame-rate signal
      this.average += (ms - this.average) * .05;
      this.samples += 1;
      if (this.samples >= 90 && this.average > 42 && state.degrade < 2) this.step();
    },
    step() {
      state.degrade += 1;
      this.samples = 0;
      this.average = 16.7;
      state.tier = 'lite';
      setTierClass();
      root.classList.toggle('rizo-event--still', state.degrade >= 2);
      emit('degrade', state.degrade);
    }
  };

  const loop = (() => {
    const tasks = new Set();
    let frame = 0;
    let last = 0;
    let frames = 0;
    const tick = (now) => {
      frame = 0;
      const elapsed = last ? now - last : 16.7;
      const dt = Math.min(.05, elapsed / 1000);
      last = now;
      frames += 1;
      tasks.forEach((task) => {
        try { task(dt, now); } catch (error) { tasks.delete(task); console.error('[Rizo event layer]', error); }
      });
      governor.sample(elapsed);
      request();
    };
    // The theme's shared frame (layout/theme.liquid) when present, so the
    // event layer, art layers and header never run separate loops.
    const shared = window.RizoFrame;
    const request = () => {
      if (frame || !tasks.size || !state.running || doc.hidden) return;
      frame = shared ? shared.request(tick) : window.requestAnimationFrame(tick);
    };
    const halt = () => {
      if (frame) { if (shared) shared.cancel(frame); else window.cancelAnimationFrame(frame); }
      frame = 0;
      last = 0;
    };
    return {
      add(task) { tasks.add(task); request(); },
      remove(task) { tasks.delete(task); if (!tasks.size) halt(); },
      has: (task) => tasks.has(task),
      wake() { last = 0; request(); },
      halt,
      clear() { tasks.clear(); halt(); },
      get size() { return tasks.size; },
      get running() { return frame !== 0; },
      get frames() { return frames; }
    };
  })();

  /* ---------------------------------------------------------------------- */
  /* Input: observed, never intercepted                                       */
  /* ---------------------------------------------------------------------- */

  const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), [data-product-card], [contenteditable="true"]';

  const input = (() => {
    const scrollFns = new Set();
    const tapFns = new Set();
    let lastY = window.scrollY;
    let velocity = 0;
    let moved = false;
    let still = 0;

    // Scroll events only flag work; velocity is measured once per frame.
    const scrollTask = (dt) => {
      const y = window.scrollY;
      const instant = (y - lastY) / Math.max(dt, 1 / 240);
      lastY = y;
      velocity += (instant - velocity) * Math.min(1, dt * 14);
      if (!moved && Math.abs(instant) < 1) still += 1; else still = 0;
      moved = false;
      if (still > 6 && Math.abs(velocity) < 8) {
        velocity = 0;
        loop.remove(scrollTask);
      }
      scrollFns.forEach((fn) => fn(velocity, dt, y));
    };
    const onScroll = () => {
      moved = true;
      if (!loop.has(scrollTask)) still = 0;
      loop.add(scrollTask);
    };

    const describe = (event, kind) => {
      const target = event.target instanceof Element ? event.target : null;
      return {
        kind,
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType || 'mouse',
        interactive: Boolean(target?.closest(INTERACTIVE)),
        overlay: Boolean(target?.closest('[data-overlay], dialog')),
        time: performance.now()
      };
    };
    const onPointerDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const tap = describe(event, 'down');
      tapFns.forEach((fn) => fn(tap));
    };
    const onClick = (event) => {
      if (event.detail === 0) return; // keyboard activation has no position
      const tap = describe(event, 'click');
      tapFns.forEach((fn) => fn(tap));
    };

    const options = { passive: true, capture: true };
    return {
      bind() {
        window.addEventListener('scroll', onScroll, { passive: true });
        doc.addEventListener('pointerdown', onPointerDown, options);
        doc.addEventListener('click', onClick, options);
      },
      unbind() {
        window.removeEventListener('scroll', onScroll, { passive: true });
        doc.removeEventListener('pointerdown', onPointerDown, options);
        doc.removeEventListener('click', onClick, options);
        loop.remove(scrollTask);
      },
      onScroll(fn) { scrollFns.add(fn); return () => scrollFns.delete(fn); },
      onTap(fn) { tapFns.add(fn); return () => tapFns.delete(fn); },
      get velocity() { return velocity; }
    };
  })();

  /* ---------------------------------------------------------------------- */
  /* Module registry                                                         */
  /* ---------------------------------------------------------------------- */

  const factories = new Map();
  const modules = new Map();
  const behaviors = new Map();

  const startModule = (name) => {
    if (modules.has(name) || !factories.has(name)) return;
    try {
      const instance = factories.get(name)(api) || {};
      modules.set(name, instance);
      instance.mount?.(doc);
    } catch (error) {
      console.error(`[Rizo event layer] module "${name}" failed`, error);
    }
  };

  const define = (name, factory) => {
    factories.set(name, factory);
    if (state.running) startModule(name);
  };

  const defineBehavior = (name, behavior) => {
    behaviors.set(name, behavior);
    emit('behavior', name);
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = reject;
    doc.head.appendChild(script);
  });

  /* ---------------------------------------------------------------------- */
  /* Built-in modules                                                        */
  /* ---------------------------------------------------------------------- */

  /* Hero atmosphere: visibility drives html.rizo-event--hero-visible and
     dormancy (fog layers are dropped while a hero is far off-screen). */
  define('hero', () => {
    const hosts = new Map();
    const refresh = () => {
      let visible = false;
      hosts.forEach((entry, host) => {
        if (!host.isConnected) hosts.delete(host);
        else if (entry.ratio >= .2) visible = true;
      });
      if (visible !== state.heroVisible) {
        state.heroVisible = visible;
        root.classList.toggle('rizo-event--hero-visible', visible);
        emit('hero', visible);
      }
    };
    const ratioObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const record = hosts.get(entry.target);
        if (record) record.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      });
      refresh();
    }, { threshold: [0, .2, .5] });
    const nearObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const slot = hosts.get(entry.target)?.slot;
        if (!slot) return;
        slot.classList.toggle('is-dormant', !entry.isIntersecting);
        if (entry.isIntersecting) emit('hero-awake', slot);
      });
    }, { rootMargin: '240px 0px' });

    return {
      mount(container) {
        container.querySelectorAll('[data-rizo-event-hero]').forEach((slot) => {
          const host = slot.parentElement;
          if (!host || hosts.has(host)) return;
          hosts.set(host, { slot, ratio: 0 });
          ratioObserver.observe(host);
          nearObserver.observe(host);
        });
      },
      unmount(container) {
        hosts.forEach((entry, host) => {
          if (container.contains(host)) {
            ratioObserver.unobserve(host);
            nearObserver.unobserve(host);
            hosts.delete(host);
          }
        });
        refresh();
      },
      destroy() {
        ratioObserver.disconnect();
        nearObserver.disconnect();
        hosts.clear();
      },
      stats: () => ({ heroes: hosts.size })
    };
  });

  /* Quiet zones: product grids, product page, cart. Page fog thins and bats
     keep to the upper edge while one of these crosses the middle band. */
  define('quiet', () => {
    const watched = new Set();
    const inBand = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? inBand.add(entry.target) : inBand.delete(entry.target)));
      const quiet = inBand.size > 0;
      if (quiet !== state.quiet) {
        state.quiet = quiet;
        root.classList.toggle('rizo-event--quiet', quiet);
        emit('quiet', quiet);
      }
    }, { rootMargin: '-35% 0px -35% 0px' });
    return {
      mount(container) {
        let nodes = [];
        try { nodes = container.querySelectorAll(config.quietSelectors || '[data-rizo-event-quiet]'); } catch (error) { warn('invalid quietSelectors', error); }
        nodes.forEach((node) => {
          if (watched.has(node)) return;
          watched.add(node);
          observer.observe(node);
        });
      },
      unmount(container) {
        watched.forEach((node) => {
          if (!node.isConnected || container.contains(node)) {
            observer.unobserve(node);
            watched.delete(node);
            inBand.delete(node);
          }
        });
      },
      destroy() { observer.disconnect(); watched.clear(); inBand.clear(); },
      stats: () => ({ quietZones: watched.size })
    };
  });

  /* Countdown: absolute target (timezone-aware), ticks on second boundaries,
     writes only digits that changed, pauses with the tab, static SR text. */
  define('countdown', () => {
    const instances = new Map();
    const pad = (value) => String(value).padStart(2, '0');

    const create = (element) => {
      const zone = element.dataset.timezone || config.timezone || 'America/New_York';
      const target = boot.zonedTime(element.dataset.target, zone);
      if (!Number.isFinite(target)) {
        warn('countdown target is not a valid date:', element.dataset.target);
        element.hidden = true;
        return { destroy() {} };
      }
      const units = {};
      element.querySelectorAll('[data-unit]').forEach((node) => { units[node.dataset.unit] = node; });
      const showSeconds = Boolean(units.seconds);
      const summary = element.querySelector('[data-countdown-summary]');
      const expiredCopy = element.querySelector('[data-countdown-expired]');
      const expiredMode = element.dataset.expiredMode === 'hide' ? 'hide' : 'message';
      const previous = {};
      let timer = 0;
      let daysDigits = 0;

      if (summary) {
        try {
          const moment = new Intl.DateTimeFormat(root.lang || 'en-US', {
            timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
          }).format(new Date(target));
          summary.textContent = `${element.dataset.description || 'Countdown ends'} ${moment}.`;
        } catch (error) { /* keep the server-rendered sentence */ }
      }

      const setState = (next) => {
        if (element.dataset.state === next && element.dataset.ready) return;
        element.dataset.state = next;
        const expired = next === 'expired';
        if (expiredCopy) expiredCopy.hidden = !expired;
        element.hidden = expired && expiredMode === 'hide';
        root.classList.toggle('rizo-event--countdown-expired', expired);
        if (expired) {
          if (summary && expiredCopy) summary.textContent = expiredCopy.textContent.trim();
          doc.dispatchEvent(new CustomEvent('rizo-event:countdown-expired', { detail: { id: config.id, target } }));
        }
      };

      const render = () => {
        const remaining = target - Date.now();
        if (remaining <= 0) {
          setState('expired');
          element.dataset.ready = 'true';
          return false;
        }
        setState('running');
        const total = Math.floor(remaining / 1000);
        const values = {
          days: Math.floor(total / 86400),
          hours: Math.floor((total % 86400) / 3600),
          minutes: Math.floor((total % 3600) / 60),
          seconds: total % 60
        };
        const digits = Math.max(2, String(values.days).length);
        if (digits !== daysDigits) {
          daysDigits = digits;
          element.style.setProperty('--rizo-event-days-digits', digits);
        }
        Object.keys(units).forEach((key) => {
          const text = pad(values[key]);
          if (previous[key] !== text) {
            units[key].textContent = text;
            previous[key] = text;
          }
        });
        element.dataset.ready = 'true';
        return true;
      };

      const schedule = () => {
        window.clearTimeout(timer);
        timer = 0;
        if (doc.hidden || !element.isConnected) return;
        if (!render()) return;
        const step = showSeconds ? 1000 : 60000;
        const remaining = target - Date.now();
        const delay = (remaining % step) + 20; // land just after the displayed value changes
        timer = window.setTimeout(schedule, Math.max(50, delay));
      };

      const onVisibility = () => (doc.hidden ? (window.clearTimeout(timer), timer = 0) : schedule());
      doc.addEventListener('visibilitychange', onVisibility);
      schedule();

      return {
        destroy() {
          window.clearTimeout(timer);
          doc.removeEventListener('visibilitychange', onVisibility);
        },
        get ticking() { return timer !== 0; }
      };
    };

    return {
      mount(container) {
        container.querySelectorAll('[data-rizo-event-countdown]').forEach((element) => {
          if (instances.has(element)) return;
          instances.set(element, create(element));
        });
        instances.forEach((instance, element) => {
          if (!element.isConnected) { instance.destroy(); instances.delete(element); }
        });
      },
      unmount(container) {
        instances.forEach((instance, element) => {
          if (!element.isConnected || container.contains(element)) { instance.destroy(); instances.delete(element); }
        });
      },
      destroy() { instances.forEach((instance) => instance.destroy()); instances.clear(); },
      stats: () => ({ countdowns: instances.size, countdownTimers: [...instances.values()].filter((instance) => instance.ticking).length })
    };
  });

  /* ---------------------------------------------------------------------- */
  /* Sky helpers: Pittsburgh's clock and the real moon                        */
  /* ---------------------------------------------------------------------- */

  /* Hour (0–24, fractional) in the event's timezone, not the visitor's. */
  const localHour = (ms = Date.now()) => {
    try {
      const parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: config.timezone || 'America/New_York', hourCycle: 'h23', hour: 'numeric', minute: 'numeric' })
        .formatToParts(new Date(ms)).forEach((part) => { parts[part.type] = Number(part.value); });
      return (parts.hour % 24) + parts.minute / 60;
    } catch (error) { return new Date(ms).getHours(); }
  };

  /* Mean lunar phase from a known new moon (6 Jan 2000 18:14 UTC). Good to
     a few hours, which is all a sky needs. */
  const SYNODIC = 29.530588853;
  const moonPhase = (ms = Date.now()) => {
    const age = ((((ms - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYNODIC) + SYNODIC) % SYNODIC;
    const illumination = (1 - Math.cos((age / SYNODIC) * Math.PI * 2)) / 2;
    const waxing = age < SYNODIC / 2;
    const name = age < 1.85 || age > 27.7 ? 'new moon'
      : age < 6.4 ? 'waxing crescent' : age < 8.4 ? 'first quarter' : age < 13.8 ? 'waxing gibbous'
      : age < 15.8 ? 'full moon' : age < 21.1 ? 'waning gibbous' : age < 23.1 ? 'last quarter' : 'waning crescent';
    return { age, illumination, waxing, name };
  };

  /* Sections describe their own atmosphere: data-fog (0–1) and
     data-fog-bias (ground | even | ceiling). Anything without data-fog is
     clear, so commerce is clear by default. Measured on layout changes,
     never inside the scroll path. */
  const atmosphere = (() => {
    let bands = [];
    let clearBands = [];
    let protectedRects = [];
    let docHeight = 1;
    let dirty = true;
    let revision = 0;
    const measure = () => {
      dirty = false;
      revision += 1;
      const y = window.scrollY;
      bands = [...doc.querySelectorAll('[data-fog]')].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          node,
          top: rect.top + y,
          bottom: rect.bottom + y,
          fog: clamp(Number(node.dataset.fog) || 0, 0, 1),
          bias: node.dataset.fogBias || 'even',
          open: node.dataset.surface === 'open' || node.closest('[data-surface="open"]') === node
        };
      }).filter((band) => band.bottom > band.top);
      clearBands = [...doc.querySelectorAll(config.quietSelectors || '[data-rizo-event-quiet]')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top + y, bottom: rect.bottom + y };
      }).filter((band) => band.bottom > band.top);
      protectedRects = [...doc.querySelectorAll('[data-fog] :is(.hero-title > span, .hero-sub, .hero-actions, h2, .rte, .gallery-item, .rizo-event-countdown)')].filter(node => Number(node.closest('[data-fog]')?.dataset.fog) > 0).map(node => {
        const range = doc.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { x: rect.left, y: rect.top + y, width: rect.width, height: rect.height };
      }).filter(rect => rect.width > 20 && rect.height > 20);
      docHeight = Math.max(1, doc.documentElement.scrollHeight);
    };
    /* Density at a document y. Fog collects low in open sections ("ground")
       and spills a little over the edge of whatever solid surface is below. */
    const at = (docY) => {
      if (dirty) measure();
      let density = 0;
      for (const band of bands) {
        const pad = 70;
        if (docY < band.top - pad || docY > band.bottom + pad) continue;
        const height = band.bottom - band.top;
        const t = clamp((docY - band.top) / height, 0, 1);
        let shape = 1;
        if (band.bias === 'ground') shape = .22 + .78 * Math.pow(t, 1.35);
        else if (band.bias === 'ceiling') shape = 1 - .6 * t;
        let edge = 1;
        if (docY < band.top) edge = 1 - (band.top - docY) / pad;
        else if (docY > band.bottom) edge = band.bias === 'ground' ? 1 - (docY - band.bottom) / pad : 1 - (docY - band.bottom) / (pad * .5);
        density = Math.max(density, band.fog * shape * clamp(edge, 0, 1));
      }
      return density;
    };
    const invalidate = () => { dirty = true; };
    let resizeObserver = null;
    return {
      at,
      get revision() { if (dirty) measure(); return revision; },
      clearAt(docY) { if (dirty) measure(); return clearBands.some((band) => docY >= band.top && docY <= band.bottom); },
      protectedRects() { if (dirty) measure(); return protectedRects; },
      invalidate,
      get docHeight() { if (dirty) measure(); return docHeight; },
      bands: () => { if (dirty) measure(); return bands; },
      bind() {
        if ('ResizeObserver' in window) { resizeObserver = new ResizeObserver(invalidate); resizeObserver.observe(doc.body); }
        window.addEventListener('load', invalidate);
      },
      unbind() { resizeObserver?.disconnect(); window.removeEventListener('load', invalidate); }
    };
  })();

  /* ---------------------------------------------------------------------- */
  /* Fog                                                                      */
  /* ---------------------------------------------------------------------- */

  define('fog', () => {
    if (!config.features.fog) return {};
    if (state.reduced && config.motion?.reduced === 'minimal') return {};
    const hosts = [...doc.querySelectorAll('[data-rizo-event-fog]')];
    if (!hosts.length) return {};
    const style = getComputedStyle(root);
    const tone = (name, fallback) => (style.getPropertyValue(name).trim() || fallback).split(/[\s,]+/).map(Number);
    const colours = { front: tone('--rizo-event-fog-rgb', '176 188 200'), back: tone('--rizo-event-fog-back-rgb', '96 108 122') };
    const share = { back: Number(style.getPropertyValue('--rizo-event-fog-back')) || .7, front: Number(style.getPropertyValue('--rizo-event-fog-front')) || .55 };
    const intensity = clamp(Number(config.fog?.intensity ?? .6) / .6, 0, 1.7);
    if (!(intensity > 0)) return {};
    const speed = clamp(Number(config.fog?.speed ?? .4), 0, 1);
    const small = () => smallQuery.matches || coarseQuery.matches;
    const moving = () => !state.reduced && state.motionScale > 0;
    const seed = Math.floor(random() * 1e9);
    const pad = 96;
    let destroyed = false;
    let ready = false;
    let buildFrame = 0;
    let buildTimer = 0;
    let idleTimer = 0;
    let clockTimer = 0;
    let clearing = false;
    let scrolling = false;
    let touching = false;
    let paints = 0;
    let maskBuilds = 0;
    let lastWakeAt = 0;
    let lastScrollY = window.scrollY;
    let clockFactor = 1;
    let textures = null;

    const texture = (w, h, cellsX, cellsY, octaves, gain, lo, hi, seed, rgb) => {
      const rand = (() => { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; })();
      const grids = [];
      for (let o = 0; o < octaves; o += 1) {
        const gx = cellsX << o; const gy = cellsY << o;
        const grid = new Float32Array(gx * gy);
        for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
        grids.push({ gx, gy, grid });
      }
      const canvas = doc.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const context = canvas.getContext('2d');
      const image = context.createImageData(w, h);
      const data = image.data;
      const smooth = (t) => t * t * (3 - 2 * t);
      const values = new Float32Array(w * h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const nx = x / w;
          const ny = y / h;
          const wx = nx + .075 * Math.sin(ny * Math.PI * 2) + .025 * Math.sin((nx + ny) * Math.PI * 4);
          const wy = ny + .09 * Math.sin(nx * Math.PI * 2) + .035 * Math.cos(ny * Math.PI * 2);
          let value = 0; let amplitude = 1; let total = 0;
          for (const { gx, gy, grid } of grids) {
            const fx = ((wx % 1 + 1) % 1) * gx; const fy = ((wy % 1 + 1) % 1) * gy;
            const x0 = Math.floor(fx); const y0 = Math.floor(fy);
            const tx = smooth(fx - x0); const ty = smooth(fy - y0);
            const x1 = (x0 + 1) % gx; const y1 = (y0 + 1) % gy;
            const a = grid[y0 * gx + x0]; const b = grid[y0 * gx + x1];
            const c = grid[y1 * gx + x0]; const d = grid[y1 * gx + x1];
            value += amplitude * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
            total += amplitude; amplitude *= gain;
          }
          values[y * w + x] = value / total;
        }
      }
      for (let i = 0; i < values.length; i += 1) {
        const v = clamp((values[i] - lo) / (hi - lo), 0, 1);
        const alpha = v * v * (3 - 2 * v);
        data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = Math.round(alpha * 255);
      }
      context.putImageData(image, 0, 0);
      return canvas;
    };

    const layers = {
      back: [['billow', 1.65, .08, .78, .84], ['wisp', 2.1, .18, .5, .65], ['roll', 1.35, .12, .48, .45]],
      front: [['billow', 1.3, .38, .9, .48], ['wisp', 1.05, .62, .7, .28], ['roll', 1.65, .48, .8, .34]]
    };
    const stages = hosts.map(host => {
      const kind = host.dataset.rizoEventFog === 'front' ? 'front' : 'back';
      const mask = doc.createElement('canvas');
      host.classList.add('rizo-event-fog--compositor');
      const planes = layers[kind].slice(0, small() ? 2 : 3).map(([tex, tile, depth, weight, height], index) => {
        const canvas = doc.createElement('canvas');
        canvas.className = 'rizo-event-fog-plane';
        canvas.setAttribute('aria-hidden', 'true');
        const turn = index % 2 ? -1 : 1;
        const span = (kind === 'front' ? 44 : 30) * (index ? .8 : 1);
        canvas.style.setProperty('--fog-x-from', `${-span * turn}px`);
        canvas.style.setProperty('--fog-x-to', `${span * turn}px`);
        canvas.style.setProperty('--fog-y-from', `${index % 2 ? 7 : -7}px`);
        canvas.style.setProperty('--fog-y-to', `${index % 2 ? -7 : 7}px`);
        canvas.style.setProperty('--fog-delay', `${-16 - index * 19}s`);
        host.append(canvas);
        return { canvas, context: canvas.getContext('2d'), tex, tile, depth, weight, height, offset: random() * 1000, phase: random() * Math.PI * 2, index };
      });
      return { host, kind, mask, context: mask.getContext('2d'), planes, w: 0, h: 0, scale: 1, key: '' };
    });

    const makeTextures = () => {
      const w = small() ? 160 : 224;
      textures = {};
      ['back', 'front'].forEach(kind => {
        textures[kind] = {
          billow: texture(w, w / 2, 5, 3, 4, .52, .32, .69, seed, colours[kind]),
          wisp: texture(w, w / 2, 3, 5, 4, .5, .43, .72, seed + 7, colours[kind]),
          roll: texture(w, w / 2, 5, 3, 3, .48, .4, .69, seed + 19, colours[kind])
        };
      });
    };

    const updateClock = () => {
      if (!config.fog?.clock) { clockFactor = 1; return; }
      const h = localHour();
      const curve = [[0, 1.12], [4, 1.22], [6.5, 1.42], [9, 1.25], [11, .98], [14, .94], [17, .98], [19.5, 1.02], [22, 1.1], [24, 1.12]];
      for (let i = 1; i < curve.length; i += 1) {
        if (h <= curve[i][0]) {
          const [h0, v0] = curve[i - 1]; const [h1, v1] = curve[i];
          const t = (h - h0) / (h1 - h0);
          clockFactor = v0 + (v1 - v0) * (t * t * (3 - 2 * t));
          break;
        }
      }
    };

    const setMotion = () => {
      const paused = !moving() || doc.hidden || state.overlayOpen;
      const rate = (.45 + speed * .8) * Math.max(.1, state.motionScale);
      stages.forEach(stage => {
        stage.host.classList.toggle('rizo-event-fog--paused', paused || (stage.kind === 'front' && state.quiet));
        stage.planes.forEach(plane => {
          const duration = (stage.kind === 'front' ? 30 + plane.index * 12 : 48 + plane.index * 14) / rate;
          plane.canvas.style.setProperty('--fog-duration', `${duration.toFixed(2)}s`);
        });
      });
    };

    const paintStage = stage => {
      const { width, height } = state.viewport;
      const scale = .22;
      const w = Math.max(24, Math.ceil((width + pad * 2) * scale));
      const h = Math.max(24, Math.ceil((height + pad * 2) * scale));
      const scrollY = window.scrollY;
      const phoneScale = config.phone === 'lighter' && smallQuery.matches ? .94 : 1;
      const key = `${width}:${height}:${scrollY}:${atmosphere.revision}:${clockFactor}:${phoneScale}`;
      if (key === stage.key) return;
      stage.w = w; stage.h = h; stage.scale = scale;
      const { context, kind, mask } = stage;
      mask.width = w; mask.height = h;
      const gradient = context.createLinearGradient(0, 0, 0, h);
      const floor = kind === 'back' ? .1 : 0;
      const k = clamp(share[kind] * intensity * phoneScale * clockFactor, 0, kind === 'front' ? .78 : 1);
      for (let s = 0; s <= 64; s += 1) {
        const y = s / 64 * (height + pad * 2) - pad;
        const d = atmosphere.at(scrollY + y);
        const clear = kind === 'front' && [-24, 0, 24].some(offset => atmosphere.clearAt(scrollY + y + offset));
        const pool = kind === 'front' ? .72 + .28 * Math.pow(clamp(y / height, 0, 1), 1.4) : 1;
        const alpha = clear ? 0 : clamp((floor + (1 - floor) * d) * k * pool, 0, 1);
        gradient.addColorStop(s / 64, `rgba(0,0,0,${alpha.toFixed(3)})`);
      }
      context.fillStyle = gradient;
      context.fillRect(0, 0, w, h);
      if (kind === 'front') {
        context.globalCompositeOperation = 'destination-out';
        for (const rect of atmosphere.protectedRects()) {
          const top = (rect.y - scrollY + pad) * scale;
          if (top > h || top + rect.height * scale < 0) continue;
          const rx = (rect.width / 2 + 92) * scale;
          const ry = (rect.height / 2 + 64) * scale;
          context.save();
          context.translate((rect.x + rect.width / 2 + pad) * scale, top + rect.height * scale / 2);
          context.scale(rx, ry);
          const clear = context.createRadialGradient(0, 0, 0, 0, 0, 1);
          clear.addColorStop(0, 'rgba(0,0,0,.8)');
          clear.addColorStop(.65, 'rgba(0,0,0,.7)');
          clear.addColorStop(1, 'rgba(0,0,0,0)');
          context.fillStyle = clear;
          context.fillRect(-1, -1, 2, 2);
          context.restore();
        }
      }
      maskBuilds += 1;
      stage.planes.forEach(plane => {
        const { canvas, context: paint } = plane;
        canvas.width = w; canvas.height = h;
        canvas.style.left = `${-pad}px`;
        canvas.style.top = `${-pad}px`;
        canvas.style.width = `${width + pad * 2}px`;
        canvas.style.height = `${height + pad * 2}px`;
        const tex = textures[kind][plane.tex];
        const tileW = width * scale * plane.tile;
        const tileH = Math.max(height * scale * plane.height, tileW * .26);
        const x = ((plane.offset * scale) % tileW + tileW) % tileW;
        const y = ((scrollY * plane.depth * scale) % tileH + tileH) % tileH;
        const pattern = paint.createPattern(tex, 'repeat');
        pattern.setTransform(new DOMMatrix([tileW / tex.width, 0, 0, tileH / tex.height, -x + pad * scale, -y + pad * scale]));
        paint.globalAlpha = plane.weight * (.76 + .24 * Math.sin(plane.phase)) * .88;
        paint.fillStyle = pattern;
        paint.fillRect(0, 0, w, h);
        paint.globalAlpha = 1;
        paint.globalCompositeOperation = 'destination-in';
        paint.drawImage(mask, 0, 0);
        paint.globalCompositeOperation = 'source-over';
        paints += 1;
      });
      stage.key = key;
    };

    const build = () => {
      buildFrame = 0;
      if (destroyed || !ready || doc.hidden || state.overlayOpen) return;
      stages.forEach(paintStage);
      setMotion();
    };
    const scheduleBuild = () => {
      if (buildFrame || destroyed || !ready || doc.hidden) return;
      buildFrame = (window.RizoFrame || { request: window.requestAnimationFrame.bind(window) }).request(build);
    };
    const resetIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      if (touching || destroyed || doc.hidden) return;
      idleTimer = window.setTimeout(() => {
        idleTimer = 0;
        scheduleBuild();
        clearing = false;
        hosts.forEach(host => host.classList.remove('rizo-event-fog--clearing'));
      }, 2600);
    };
    const clearFog = () => {
      if (!moving() || state.overlayOpen || doc.hidden) return;
      clearing = true;
      hosts.forEach(host => host.classList.add('rizo-event-fog--clearing'));
      resetIdle();
    };
    const onPointerDown = event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target.closest?.('[data-overlay], dialog')) return;
      touching = event.pointerType !== 'mouse';
      lastWakeAt = performance.now();
      clearFog();
    };
    const release = () => { touching = false; if (clearing) resetIdle(); };
    const onScroll = () => {
      if (destroyed || doc.hidden) return;
      const y = window.scrollY;
      if (Math.abs(y - lastScrollY) < 1) return;
      lastScrollY = y;
      clearFog();
      if (moving()) {
        scrolling = true;
        hosts.forEach(host => host.classList.add('rizo-event-fog--scrolling'));
      }
      window.clearTimeout(buildTimer);
      buildTimer = window.setTimeout(() => {
        buildTimer = 0;
        scrolling = false;
        scheduleBuild();
        hosts.forEach(host => host.classList.remove('rizo-event-fog--scrolling'));
      }, 180);
    };
    const resetInteraction = () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(buildTimer);
      idleTimer = 0; buildTimer = 0;
      clearing = false; scrolling = false; touching = false;
      hosts.forEach(host => host.classList.remove('rizo-event-fog--clearing', 'rizo-event-fog--scrolling'));
    };
    const armClock = () => {
      window.clearTimeout(clockTimer);
      clockTimer = 0;
      if (destroyed || doc.hidden || !config.fog?.clock) return;
      clockTimer = window.setTimeout(() => { updateClock(); scheduleBuild(); armClock(); }, 300000);
    };
    let resizeObserver = null;
    const start = () => {
      if (destroyed) return;
      makeTextures();
      ready = true;
      updateClock();
      build();
      armClock();
      if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => { atmosphere.invalidate(); scheduleBuild(); });
        resizeObserver.observe(doc.body);
      }
      doc.fonts?.ready.then(() => { atmosphere.invalidate(); scheduleBuild(); });
    };
    const idleHandle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 900 }) : window.setTimeout(start, 60);
    const cleanups = [
      on('resize', scheduleBuild),
      on('quiet', () => { setMotion(); scheduleBuild(); }),
      on('motion', () => { resetInteraction(); setMotion(); scheduleBuild(); }),
      on('overlay', open => { resetInteraction(); setMotion(); if (!open) scheduleBuild(); }),
      on('visibility', visible => { resetInteraction(); setMotion(); armClock(); if (visible) { updateClock(); scheduleBuild(); } })
    ];
    const passive = { passive: true, capture: true };
    doc.addEventListener('pointerdown', onPointerDown, passive);
    doc.addEventListener('pointerup', release, passive);
    doc.addEventListener('pointercancel', release, passive);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('load', scheduleBuild);
    return {
      mount() { atmosphere.invalidate(); scheduleBuild(); },
      unmount() { atmosphere.invalidate(); scheduleBuild(); },
      destroy() {
        destroyed = true;
        resetInteraction();
        window.clearTimeout(clockTimer);
        if (window.cancelIdleCallback) window.cancelIdleCallback(idleHandle); else window.clearTimeout(idleHandle);
        if (buildFrame) (window.RizoFrame || { cancel: window.cancelAnimationFrame.bind(window) }).cancel(buildFrame);
        resizeObserver?.disconnect();
        cleanups.forEach(off => off());
        doc.removeEventListener('pointerdown', onPointerDown, { capture: true });
        doc.removeEventListener('pointerup', release, { capture: true });
        doc.removeEventListener('pointercancel', release, { capture: true });
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('load', scheduleBuild);
        stages.forEach(stage => {
          stage.planes.forEach(plane => plane.canvas.remove());
          stage.host.classList.remove('rizo-event-fog--compositor', 'rizo-event-fog--paused');
        });
      },
      stats: () => ({ fogRenderer: 'compositor', fogPaints: paints, fogMaskBuilds: maskBuilds, fogClearing: clearing, fogScrolling: scrolling, fogMoving: moving() && !doc.hidden && !state.overlayOpen, fogFrameTasks: 0, fogCanvases: stages.reduce((sum, stage) => sum + stage.planes.length, 0), fogCanvasPixels: stages.reduce((sum, stage) => sum + stage.w * stage.h * stage.planes.length, 0), fogClock: Number(clockFactor.toFixed(2)), fogLastWake: Math.round(lastWakeAt) })
    };
  });

  /* ---------------------------------------------------------------------- */
  /* Moon                                                                     */
  /* ---------------------------------------------------------------------- */

  /* The moon lives in the sky, not in a section, so it stays where it is
     while the page scrolls over it (distant things do) and it can follow
     the visitor from page to page (view-transition-name: rizo-moon).
       phase   tonight's real phase: the unlit part is drawn over the art,
               soft-edged, with earthshine left in it
       set     scrolling toward the footer lowers it into the ground fog
       drift   across a long visit it moves slowly across the sky, the way
               the real one does; the drift carries across pages
       touch   tapping it gives it weight, and whatever was behind it
               leaves (moon-tap, used by the bats)                        */
  define('moon', () => {
    const moon = doc.querySelector('[data-rizo-event-moon]');
    if (!moon) return {};
    const body = moon.querySelector('.rizo-event-moon-body');
    const phase = moonPhase();
    api.moonPhase = phase;
    const real = (config.moon?.phase || moon.dataset.phase) !== 'full';

    /* The unlit part as a mask: soft terminator, a little earthshine. The
       disc in the artwork is centred at 488 with radius 487 (of 1000). */
    if (real && body && phase.illumination < .985) {
      const cx = 488; const cy = 488; const r = 487; const n = 36;
      const s = phase.waxing ? -1 : 1;
      const limb = []; const edge = [];
      for (let i = 0; i <= n; i += 1) {
        const y = cy - r + (2 * r * i) / n;
        const w = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2));
        limb.push(`${(cx + s * (w + 60)).toFixed(0)} ${y.toFixed(0)}`);
        edge.unshift(`${(cx + s * (2 * phase.illumination - 1) * w).toFixed(0)} ${y.toFixed(0)}`);
      }
      const d = `M${cx + s * 60} ${cy - r - 60}L${limb.join('L')}L${cx + s * 60} ${cy + r + 60}L${edge.join('L')}Z`;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 1000'><defs><filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='15'/></filter><mask id='m'><rect width='1000' height='1000' fill='white'/><path d='${d}' transform='rotate(${phase.waxing ? -24 : 24} ${cx} ${cy})' fill='black' fill-opacity='.87' filter='url(%23b)'/></mask></defs><rect width='1000' height='1000' fill='white' mask='url(%23m)'/></svg>`;
      body.style.setProperty('--rizo-moon-mask', `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}")`);
    }
    const lit = real ? phase.illumination : 1;
    moon.style.setProperty('--rizo-moon-halo', (.04 + lit * .16).toFixed(3));
    moon.dataset.phaseName = phase.name;
    doc.querySelectorAll('[data-rizo-moon-phase]').forEach((node) => {
      if (!real) return;
      node.textContent = `Tonight’s moon: ${phase.name}, ${Math.round(phase.illumination * 100)}% lit.`;
      node.hidden = false;
    });

    const moves = () => config.moon?.motion !== false && !moon.hasAttribute('data-static') && !state.reduced && state.motionScale > 0;

    /* Set: 0 at the top, 1 at the bottom of a long page. */
    let lastSet = -1;
    const applySet = () => {
      if (!moves()) { if (lastSet !== 0) { moon.style.setProperty('--rizo-moon-set', '0'); lastSet = 0; } return; }
      const vh = state.viewport.height;
      const range = atmosphere.docHeight - vh;
      const p = range > vh * .8 ? clamp(window.scrollY / range, 0, 1) : 0;
      const set = Math.round(clamp((p - .12) / .88, 0, 1) ** 1.6 * 1000) / 1000;
      if (set !== lastSet) { lastSet = set; moon.style.setProperty('--rizo-moon-set', String(set)); }
    };

    /* Drift across the sky over a visit (about 6% of the width in 40 minutes). */
    let driftTimer = 0;
    const drift = () => {
      if (!moves()) { moon.style.removeProperty('--rizo-moon-dx'); moon.style.removeProperty('--rizo-moon-dy'); return; }
      let started = Date.now();
      try {
        started = Number(window.sessionStorage.getItem('rizoSkyStart')) || started;
        window.sessionStorage.setItem('rizoSkyStart', String(started));
      } catch (error) {}
      const minutes = Math.min(40, (Date.now() - started) / 60000);
      moon.style.setProperty('--rizo-moon-dx', (minutes / 40 * state.viewport.width * .06).toFixed(1));
      moon.style.setProperty('--rizo-moon-dy', (minutes / 40 * state.viewport.height * .03).toFixed(1));
      /* First placement is instant (the page may have just arrived by view
         transition); after that it glides between updates. */
      if (!moon.style.transition) window.requestAnimationFrame(() => { moon.style.transition = 'translate 30s linear'; });
    };
    const startDrift = () => {
      window.clearInterval(driftTimer);
      drift();
      if (moves()) driftTimer = window.setInterval(drift, 30000);
    };

    /* Touch. */
    let wobble = null;
    const onTap = (tap) => {
      if (tap.kind !== 'down' || tap.interactive || tap.overlay || state.overlayOpen) return;
      const rect = moon.getBoundingClientRect();
      const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2;
      if (Math.hypot(tap.x - cx, tap.y - cy) > rect.width * .47) return;
      if (!state.reduced && body?.animate && !wobble) {
        wobble = body.animate([
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-2.2deg) translateY(2px)', offset: .16 },
          { transform: 'rotate(1.1deg)', offset: .46 },
          { transform: 'rotate(-.35deg)', offset: .76 },
          { transform: 'rotate(0deg)' }
        ], { duration: 2100, easing: 'cubic-bezier(.3,.6,.3,1)' });
        wobble.onfinish = wobble.oncancel = () => { wobble = null; };
      }
      emit('moon-tap', { x: cx, y: cy, radius: rect.width / 2, tap });
    };

    const cleanups = [
      input.onScroll(applySet),
      on('resize', () => { atmosphere.invalidate(); applySet(); }),
      on('motion', () => { applySet(); startDrift(); }),
      input.onTap(onTap)
    ];
    applySet();
    startDrift();

    return {
      mount() { atmosphere.invalidate(); applySet(); },
      destroy() {
        cleanups.forEach((off) => off());
        window.clearInterval(driftTimer);
        wobble?.cancel();
        moon.style.removeProperty('--rizo-moon-set');
      },
      rect: () => moon.getBoundingClientRect(),
      stats: () => ({ moons: 1, moonPhase: phase.name, moonLit: Math.round(phase.illumination * 100), moonSet: lastSet })
    };
  });

  /* ---------------------------------------------------------------------- */
  /* Controller                                                              */
  /* ---------------------------------------------------------------------- */

  let resizeFrame = 0;
  let endTimer = 0;
  let overlayObserver = null;

  const updateTier = () => {
    if (state.degrade) return; // the frame-time governor already chose "lite"
    const tier = detectTier();
    if (tier !== state.tier) { state.tier = tier; setTierClass(); emit('tier', tier); }
  };
  const onResize = () => {
    if (resizeFrame) return;
    resizeFrame = (window.RizoFrame || { request: window.requestAnimationFrame.bind(window) }).request(() => {
      resizeFrame = 0;
      state.viewport = { width: window.innerWidth, height: window.innerHeight };
      updateTier();
      emit('resize', state.viewport);
    });
  };
  const onVisibility = () => {
    if (doc.hidden) loop.halt(); else loop.wake();
    emit('visibility', !doc.hidden);
  };
  const onReducedChange = () => {
    state.reduced = reducedQuery.matches;
    emit('motion', state);
    if (!state.reduced && config.features.flock && !boot.flockLoaded && config.motion.intensity > 0) {
      boot.flockLoaded = true;
      config.scripts.flock.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve()).catch((error) => warn('could not load flock', error));
    }
  };
  // A page restored from the back/forward cache had its end timer frozen.
  const onPageShow = (event) => {
    if (event.persisted && config.activation !== 'always' && boot.reason === 'schedule' && Date.now() >= boot.end) deactivate('schedule-end');
  };
  const onSectionLoad = (event) => modules.forEach((module) => module.mount?.(event.target));
  const onSectionUnload = (event) => modules.forEach((module) => module.unmount?.(event.target));

  const start = () => {
    if (state.running || !boot.active) return;
    state.running = true;
    setTierClass();
    input.bind();
    atmosphere.bind();
    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });
    doc.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    doc.addEventListener('shopify:section:load', onSectionLoad);
    doc.addEventListener('shopify:section:unload', onSectionUnload);
    reducedQuery.addEventListener?.('change', onReducedChange);
    smallQuery.addEventListener?.('change', updateTier);
    coarseQuery.addEventListener?.('change', updateTier);

    // Drawers/menus set body.is-overlay-open; ambient motion pauses under them.
    const syncOverlay = () => {
      const open = doc.body.classList.contains('is-overlay-open');
      if (open === state.overlayOpen) return;
      state.overlayOpen = open;
      root.classList.toggle('rizo-event--paused', open);
      emit('overlay', open);
    };
    overlayObserver = new MutationObserver(syncOverlay);
    overlayObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    syncOverlay();

    factories.forEach((_, name) => startModule(name));

    // End of the scheduled window reached while the page is open.
    const scheduled = config.activation !== 'always' && boot.reason === 'schedule';
    const remaining = boot.end - Date.now();
    if (scheduled && Number.isFinite(remaining) && remaining > 0 && remaining < 864e5) {
      endTimer = window.setTimeout(() => deactivate('schedule-end'), remaining);
    }

    root.classList.add('rizo-event--ready');
    emit('start', state);
    doc.dispatchEvent(new CustomEvent('rizo-event:start', { detail: { id: config.id, reason: boot.reason } }));

    // One short frame probe once the page has settled, so a weak device steps
    // down even if no bat has flown yet (CSS fog/moon drift is running).
    const probe = () => {
      let frames = 0;
      const task = () => { frames += 1; if (frames >= 100 || !state.running) loop.remove(task); };
      if (governorEnabled && state.running && !state.reduced) loop.add(task);
    };
    const settle = () => window.setTimeout(probe, 1500);
    if (doc.readyState === 'complete') settle(); else window.addEventListener('load', settle, { once: true });
  };

  const deactivate = (reason = 'manual') => {
    if (!state.running) return;
    root.classList.add('rizo-event--leaving');
    window.setTimeout(() => {
      state.running = false;
      window.clearTimeout(endTimer);
      modules.forEach((module) => module.destroy?.());
      modules.clear();
      loop.clear();
      input.unbind();
      atmosphere.unbind();
      overlayObserver?.disconnect();
      window.removeEventListener('resize', onResize, { passive: true });
      window.visualViewport?.removeEventListener('resize', onResize, { passive: true });
      doc.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      doc.removeEventListener('shopify:section:load', onSectionLoad);
      doc.removeEventListener('shopify:section:unload', onSectionUnload);
      reducedQuery.removeEventListener?.('change', onReducedChange);
      smallQuery.removeEventListener?.('change', updateTier);
      coarseQuery.removeEventListener?.('change', updateTier);
      [...root.classList].filter((name) => name.startsWith('rizo-event')).forEach((name) => root.classList.remove(name));
      if (config.themeClass) root.classList.remove(config.themeClass);
      root.removeAttribute('data-rizo-event');
      boot.active = false;
      boot.reason = reason;
      emit('end', reason);
      doc.dispatchEvent(new CustomEvent('rizo-event:end', { detail: { id: config.id, reason } }));
    }, reducedQuery.matches ? 0 : 820);
  };

  const api = window.RizoEventLayer = {
    version: VERSION,
    config,
    state,
    random,
    clamp,
    loop,
    input,
    on,
    emit,
    define,
    defineBehavior,
    behaviors,
    deactivate,
    atmosphere,
    moonPhase,
    localHour,
    module: (name) => modules.get(name),
    stats() {
      const out = {
        id: config.id,
        reason: boot.reason,
        running: state.running,
        tier: state.tier,
        degrade: state.degrade,
        reduced: state.reduced,
        motionScale: state.motionScale,
        heroVisible: state.heroVisible,
        quiet: state.quiet,
        overlayOpen: state.overlayOpen,
        loopTasks: loop.size,
        loopRunning: loop.running,
        frames: loop.frames,
        modules: [...modules.keys()]
      };
      modules.forEach((module) => Object.assign(out, module.stats?.()));
      return out;
    }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();


