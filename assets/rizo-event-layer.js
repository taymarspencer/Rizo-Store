/*
  RIZO EVENT LAYER — runtime engine

  Loaded by the boot script in snippets/rizo-event-head.liquid, and only while
  an event is live. When the Event layer is Off or outside its schedule this
  file is never requested.

  Owns the shared pieces every event uses:
    loop      one requestAnimationFrame loop; runs only while a task needs it
    input     passive scroll-velocity and tap observation (never blocks input)
    state     device tier, motion scale, reduced motion, hero/quiet/overlay flags
    modules   registry: countdown, moon, hero, quiet (here); flock (rizo-event-flock.js)
    behaviors registry for event-specific motion (e.g. assets/event-halloween.js)

  Modules are idempotent: they re-scan on shopify:section:load, dispose on
  shopify:section:unload, and never double-bind an element.

  Console / QA:  RizoEventLayer.stats()   RizoEventLayer.deactivate()
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

  /* Fog: the drift is a CSS animation; this module only swaps each strip's
     full-resolution background for a low-resolution canvas copy of the
     texture. Fog is soft, so ~1/3 resolution looks the same while the moving
     composited layer needs a fraction of the GPU memory (tens of MB → ~1 MB
     on a retina desktop). Redrawn only when a strip changes size. */
  define('fog', () => {
    const src = config.fog?.src;
    const strips = new Map();
    if (!src) return {};
    const SCALE = .35; // backing pixels per CSS pixel, independent of devicePixelRatio
    let image = null;

    const paint = (strip, record) => {
      const width = strip.offsetWidth;
      const height = strip.offsetHeight;
      if (!image || !width || !height) return; // dormant strips are display: none
      const w = Math.max(2, Math.round((width * SCALE) / 2) * 2);
      const h = Math.max(2, Math.round(height * SCALE));
      if (record.w === w && record.h === h) return;
      const { canvas } = record;
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      // Two tiles side by side: the CSS animation slides the strip by exactly one.
      context.drawImage(image, 0, 0, w / 2, h);
      context.drawImage(image, w / 2, 0, w / 2, h);
      record.w = w;
      record.h = h;
      strip.classList.add('has-canvas');
    };
    const paintAll = () => strips.forEach((record, strip) => {
      if (!strip.isConnected) strips.delete(strip);
      else paint(strip, record);
    });

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { image = img; paintAll(); };
    img.onerror = () => warn('fog texture failed to load; keeping the CSS background', src);
    img.src = src;

    const offResize = on('resize', paintAll);
    const offWake = on('hero-awake', paintAll);

    return {
      mount(container) {
        container.querySelectorAll('.rizo-event-fog-strip').forEach((strip) => {
          if (strips.has(strip)) return;
          const canvas = doc.createElement('canvas');
          canvas.setAttribute('aria-hidden', 'true');
          strip.append(canvas);
          const record = { canvas, w: 0, h: 0 };
          strips.set(strip, record);
          paint(strip, record);
        });
      },
      unmount(container) {
        strips.forEach((record, strip) => { if (!strip.isConnected || container.contains(strip)) strips.delete(strip); });
      },
      destroy() {
        offResize();
        offWake();
        strips.forEach((record, strip) => { record.canvas.remove(); strip.classList.remove('has-canvas'); });
        strips.clear();
      },
      stats: () => ({ fogStrips: strips.size, fogCanvasPixels: [...strips.values()].reduce((sum, record) => sum + record.w * record.h, 0) })
    };
  });

  /* Moon: scroll parallax only (drift is CSS; pointer parallax comes free
     from the world gate's --world-* variables). Measures on mount/resize,
     never inside the scroll path. */
  define('moon', () => {
    const moons = new Map();
    let offScroll = null;
    const enabled = () => config.moon?.motion && !state.reduced && state.motionScale > 0 && state.tier !== 'lite';

    const measure = () => {
      moons.forEach((record, moon) => {
        if (!moon.isConnected) { moons.delete(moon); return; }
        const rect = record.host.getBoundingClientRect();
        record.top = rect.top + window.scrollY;
        record.height = rect.height || 1;
      });
    };
    const apply = () => {
      const y = window.scrollY;
      moons.forEach((record, moon) => {
        const progress = clamp(y - record.top, 0, record.height);
        const offset = Math.round(progress * .3 * state.motionScale * 10) / 10;
        if (offset !== record.offset) {
          record.offset = offset;
          moon.style.setProperty('--rizo-event-moon-parallax', `${offset}px`);
        }
      });
    };
    const sync = () => {
      if (enabled() && moons.size) {
        if (!offScroll) offScroll = input.onScroll(apply);
        measure();
        apply();
      } else {
        offScroll?.();
        offScroll = null;
        moons.forEach((record, moon) => { moon.style.removeProperty('--rizo-event-moon-parallax'); record.offset = 0; });
      }
    };
    const offResize = on('resize', sync);
    const offMotion = on('motion', sync);

    return {
      mount(container) {
        container.querySelectorAll('[data-rizo-event-moon]:not([data-static])').forEach((moon) => {
          if (moons.has(moon)) return;
          moons.set(moon, { host: moon.closest('[data-rizo-event-hero]')?.parentElement || moon.parentElement, top: 0, height: 1, offset: 0 });
        });
        sync();
      },
      unmount(container) {
        moons.forEach((record, moon) => { if (!moon.isConnected || container.contains(moon)) moons.delete(moon); });
        sync();
      },
      destroy() { offScroll?.(); offResize(); offMotion(); moons.clear(); },
      stats: () => ({ moons: moons.size, moonParallax: Boolean(offScroll) })
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
