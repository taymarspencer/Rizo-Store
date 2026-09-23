/*
  RIZO EVENT LAYER — runtime engine

  Loaded by the boot script in snippets/rizo-event-head.liquid, and only while
  an event is live. When the Event layer is Off or outside its schedule this
  file is never requested.

  Owns the shared pieces every event uses:
    loop        one requestAnimationFrame loop; runs only while a task needs it
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

  const VERSION = '1.0.0';
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

  const detectTier = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return 'lite';
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) return 'lite';
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return 'lite';
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
  /* Loop: the only requestAnimationFrame in the event layer                  */
  /* ---------------------------------------------------------------------- */

  /* Frame-time governor. Sustained frames slower than ~30fps step the layer
     down: level 1 → "lite" tier (one fog layer, fewer bats); level 2 → still
     atmosphere (fog and moon drift freeze, bats halve again). It only ever
     steps down. Disable for testing with ?rizo_event_governor=off. */
  const governorEnabled = new URLSearchParams(window.location.search).get('rizo_event_governor') !== 'off';
  const governor = {
    average: 16.7,
    samples: 0,
    sample(ms) {
      if (!governorEnabled || ms > 250) return; // a tab switch or long task is not a frame-rate signal
      this.average += (ms - this.average) * .05;
      this.samples += 1;
      if (this.samples >= 90 && this.average > 34 && state.degrade < 2) this.step();
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
    const request = () => {
      if (!frame && tasks.size && state.running && !doc.hidden) frame = window.requestAnimationFrame(tick);
    };
    const halt = () => {
      if (frame) window.cancelAnimationFrame(frame);
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
    let docHeight = 1;
    let dirty = true;
    const measure = () => {
      dirty = false;
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

  /* A fog field, not an overlay. Two low-resolution canvases (behind the
     page and in front of open sections) are painted from tileable noise
     generated once per visit. Each layer drifts at its own speed and moves
     with scroll at its own depth; density follows the sections on screen,
     so fog pools low over open sky, spills over the edges of solid ground
     and is gone over products. The pointer (or a finger) parts it; it
     closes again behind you. At about 1/5 resolution the browser's own
     smoothing is the blur. */
  define('fog', () => {
    if (!config.features.fog) return {};
    /* "Night sky and countdown only" for reduced motion: no fog at all. */
    if (state.reduced && config.motion?.reduced === 'minimal') return {};
    const hosts = [...doc.querySelectorAll('[data-rizo-event-fog]')];
    if (!hosts.length) return {};
    const style = getComputedStyle(root);
    const tone = (name, fallback) => (style.getPropertyValue(name).trim() || fallback).split(/[\s,]+/).map(Number);
    const colours = { front: tone('--rizo-event-fog-rgb', '176 188 200'), back: tone('--rizo-event-fog-back-rgb', '96 108 122') };
    const share = { back: Number(style.getPropertyValue('--rizo-event-fog-back')) || .7, front: Number(style.getPropertyValue('--rizo-event-fog-front')) || .55 };
    const intensity = clamp(Number(config.fog?.intensity ?? .6) / .6, 0, 1.7);
    const speed = clamp(Number(config.fog?.speed ?? .4), 0, 1);

    /* Tileable value-noise fBm → an RGBA canvas of fog. */
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
      let max = 0;
      const values = new Float32Array(w * h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          let value = 0; let amplitude = 1; let total = 0;
          for (const { gx, gy, grid } of grids) {
            const fx = (x / w) * gx; const fy = (y / h) * gy;
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
        max = Math.max(max, alpha);
        data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = Math.round(alpha * 255);
      }
      context.putImageData(image, 0, 0);
      return canvas;
    };

    const small = () => state.tier !== 'desktop';
    const seed = Math.floor(random() * 1e9);
    let textures = null;
    const makeTextures = () => {
      const w = small() ? 160 : 224;
      textures = {};
      ['back', 'front'].forEach((kind) => {
        textures[kind] = {
          billow: texture(w, w / 2, 4, 2, 5, .56, .36, .74, seed, colours[kind]),
          wisp: texture(w, w / 2, 3, 4, 4, .6, .46, .86, seed + 7, colours[kind])
        };
      });
      stages.forEach((stage) => { stage.patterns = {}; });
    };

    /* Layers per stage: [texture, tile width × viewport, drift px/s (CSS px), scroll depth, weight] */
    const LAYERS = {
      back: [['billow', 2.4, 9, .08, 1], ['wisp', 1.6, -15, .18, .8]],
      front: [['billow', 3.1, 16, .45, .9], ['wisp', 1.9, -26, .85, .6]]
    };

    const stages = hosts.map((host) => {
      const canvas = doc.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      host.append(canvas);
      const kind = host.dataset.rizoEventFog === 'front' ? 'front' : 'back';
      return { host, kind, canvas, context: canvas.getContext('2d'), patterns: {}, layers: LAYERS[kind].map(([tex, tile, drift, depth, weight]) => ({ tex, tile, drift, depth, weight, x: random() * 1000 })), w: 0, h: 0, scale: 1 };
    });

    const resize = () => {
      const width = state.viewport.width;
      const height = state.viewport.height;
      const scale = state.tier === 'lite' || state.degrade ? .16 : small() ? .24 : .2;
      stages.forEach((stage) => {
        const w = Math.max(24, Math.round(width * scale));
        const h = Math.max(24, Math.round(height * scale));
        if (w !== stage.w || h !== stage.h) { stage.canvas.width = w; stage.canvas.height = h; stage.w = w; stage.h = h; stage.scale = scale; }
      });
      atmosphere.invalidate();
    };

    /* Pittsburgh's clock: the rivers fog over around dawn; afternoons clear. */
    let clockFactor = 1;
    const updateClock = () => {
      if (!config.fog?.clock) { clockFactor = 1; return; }
      const h = localHour();
      const curve = [[0, 1.12], [4, 1.22], [6.5, 1.42], [9, 1.25], [11, .98], [14, .8], [17, .88], [19.5, 1.02], [22, 1.1], [24, 1.12]];
      for (let i = 1; i < curve.length; i += 1) {
        if (h <= curve[i][0]) {
          const [h0, v0] = curve[i - 1]; const [h1, v1] = curve[i];
          const t = (h - h0) / (h1 - h0);
          clockFactor = v0 + (v1 - v0) * (t * t * (3 - 2 * t));
          break;
        }
      }
    };
    updateClock();
    const clockTimer = window.setInterval(updateClock, 5 * 60 * 1000);

    /* The wake: recent pointer / finger positions, fading out. */
    const wake = [];
    let lastWakeAt = 0;
    const WAKE_LIFE = 1.9;
    const addWake = (x, y, strength = 1) => {
      const now = performance.now();
      const last = wake[wake.length - 1];
      if (last && Math.hypot(last.x - x, last.y - y) < 18 && now - last.t < 120) { last.t = now; return; }
      wake.push({ x, y, t: now, strength });
      if (wake.length > 26) wake.shift();
      lastWakeAt = now;
      loop.add(task);
    };
    const onPointer = (event) => {
      if (state.overlayOpen || state.reduced || state.motionScale <= 0) return;
      if (event.pointerType === 'mouse' || event.buttons || event.type === 'pointerdown') addWake(event.clientX, event.clientY, event.pointerType === 'mouse' ? .8 : 1.1);
    };

    let lastScroll = window.scrollY;
    let wind = 0;
    let frameSkip = 0;
    let dirtyStill = true;
    const moving = () => !state.reduced && state.motionScale > 0 && state.degrade < 2;

    const paint = (stage, dt, now) => {
      const { context, w, h, scale, kind } = stage;
      if (!w || !textures) return;
      const scrollY = window.scrollY;
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, w, h);
      const layerCount = state.tier === 'lite' || state.degrade ? 1 : stage.layers.length;
      for (let i = 0; i < layerCount; i += 1) {
        const layer = stage.layers[i];
        const tex = textures[kind][layer.tex];
        if (moving()) layer.x += (layer.drift * (.35 + speed * 1.3) * state.motionScale + wind * layer.depth * 40) * dt;
        const tileW = w * layer.tile;
        const tileH = tileW * (tex.height / tex.width);
        const ox = -(((layer.x * scale) % tileW) + tileW) % tileW;
        const oy = -((((scrollY * layer.depth) * scale) % tileH) + tileH) % tileH;
        /* A repeating pattern samples across tile edges, so no seams. */
        let pattern = stage.patterns[layer.tex];
        if (!pattern) pattern = stage.patterns[layer.tex] = context.createPattern(tex, 'repeat');
        pattern.setTransform(new DOMMatrix([tileW / tex.width, 0, 0, tileH / tex.height, ox, oy]));
        context.globalAlpha = layer.weight;
        context.fillStyle = pattern;
        context.fillRect(0, 0, w, h);
      }
      context.globalAlpha = 1;

      /* Density mask from the sections on screen. */
      const vh = state.viewport.height;
      const gradient = context.createLinearGradient(0, 0, 0, h);
      const floor = kind === 'back' ? .16 : 0;
      const steps = 24;
      const k = clamp(share[kind] * intensity * clockFactor, 0, 1);
      for (let s = 0; s <= steps; s += 1) {
        const y = (s / steps) * vh;
        const d = atmosphere.at(scrollY + y);
        const q = kind === 'front' && state.quiet ? .15 : 1;
        const a = clamp((floor + (1 - floor) * d) * k * q, 0, 1);
        gradient.addColorStop(s / steps, `rgba(0,0,0,${a.toFixed(3)})`);
      }
      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = gradient;
      context.fillRect(0, 0, w, h);

      /* Part the fog where the pointer has been. */
      if (wake.length) {
        context.globalCompositeOperation = 'destination-out';
        const radius = (small() ? 95 : 150) * scale;
        for (let i = wake.length - 1; i >= 0; i -= 1) {
          const point = wake[i];
          const age = (now - point.t) / 1000;
          if (age > WAKE_LIFE) { if (stage === stages[stages.length - 1]) wake.splice(i, 1); continue; }
          const life = 1 - age / WAKE_LIFE;
          const alpha = (kind === 'front' ? .8 : .45) * point.strength * life * life;
          const r = radius * (1 + (1 - life) * .6);
          const cx = point.x * scale; const cy = point.y * scale;
          const g = context.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          context.fillStyle = g;
          context.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
      }
      context.globalCompositeOperation = 'source-over';
    };

    let elapsed = 0;
    let paints = 0;
    function task(dt, now) {
      if (state.overlayOpen || !textures) return;
      const y = window.scrollY;
      const velocity = (y - lastScroll) / Math.max(dt, 1 / 240);
      lastScroll = y;
      wind += (clamp(velocity / 3000, -1, 1) - wind) * Math.min(1, dt * 3);
      /* Slow drifting fog does not need every frame. */
      elapsed += dt;
      frameSkip = (frameSkip + 1) % (state.tier === 'lite' || state.degrade ? 3 : 2);
      const scrolling = Math.abs(velocity) > 2;
      if (frameSkip && !scrolling && !wake.length) return;
      stages.forEach((stage) => paint(stage, elapsed, now));
      paints += stages.length;
      elapsed = 0;
      dirtyStill = false;
      if (!moving() && !wake.length && !scrolling) loop.remove(task);
    }

    const wakeLoop = () => { dirtyStill = true; loop.add(task); };
    const start = () => {
      if (!textures) makeTextures();
      resize();
      loop.add(task);
    };
    /* Noise takes a few ms: do it when the page is idle. */
    const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 60));
    idle(start, { timeout: 900 });

    const cleanups = [
      on('resize', () => { resize(); wakeLoop(); }),
      on('tier', () => { makeTextures(); resize(); wakeLoop(); }),
      on('degrade', () => { resize(); wakeLoop(); }),
      on('motion', wakeLoop),
      on('quiet', wakeLoop),
      on('overlay', (open) => { if (open) loop.remove(task); else wakeLoop(); }),
      input.onScroll(() => loop.add(task))
    ];
    doc.addEventListener('pointermove', onPointer, { passive: true, capture: true });
    doc.addEventListener('pointerdown', onPointer, { passive: true, capture: true });

    return {
      mount() { atmosphere.invalidate(); wakeLoop(); },
      unmount() { atmosphere.invalidate(); },
      destroy() {
        cleanups.forEach((off) => off());
        window.clearInterval(clockTimer);
        doc.removeEventListener('pointermove', onPointer, { capture: true });
        doc.removeEventListener('pointerdown', onPointer, { capture: true });
        loop.remove(task);
        stages.forEach((stage) => stage.canvas.remove());
      },
      stats: () => ({ fogPaints: paints, fogMoving: moving(), fogCanvases: stages.length, fogCanvasPixels: stages.reduce((sum, stage) => sum + stage.w * stage.h, 0), fogClock: Number(clockFactor.toFixed(2)), fogWake: wake.length, fogLastWake: Math.round(lastWakeAt) })
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
    resizeFrame = window.requestAnimationFrame(() => {
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
