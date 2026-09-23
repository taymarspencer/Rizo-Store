/*
  RIZO EVENT LAYER — ambient flock module

  A bounded pool of decorative flyers (Halloween: bats). This file owns
  everything that is not specific to one event:
    - hard limits per device tier, scaled by the "How many at once" setting
    - a reusable DOM pool (created lazily, never more than the tier limit)
    - two depths: "back" flyers live in the sky and disappear behind solid
      sections, "front" flyers cross over the page; a flyer can change depth
      mid-flight (a bat leaving the moon comes toward you)
    - sprite sheets: each flyer shows one frame of an N-frame strip and the
      wing beat steps through them (CSS, compositor only)
    - idle / scroll / tap / moon scheduling with quiet stretches, cooldowns
    - bounds checks and recycling, transform-only rendering
    - pausing under drawers, on hidden tabs, and for reduced motion

  How flyers move is delegated to a behaviour registered by the active
  preset, e.g. assets/event-halloween.js:

    RizoEventLayer.defineBehavior('bats', {
      idle(env) → [spec…]                   something crossing on its own
      wake(env, velocity, count) → [spec…]  stirred by fast scrolling
      startle(env, tap) → [spec…]           flushed out by a tap in open space
      moon(env, moon) → [spec…]             leaving from behind the moon
      init(flyer, spec)                     copy motion state onto the flyer
      step(flyer, dt, env)                  advance x, y, rotation, scale
      scroll(flyer, velocity, dt, env)      loose response to scrolling
      scatter(flyer, tap, env)              react to a nearby tap
    });

  Spec fields the flock reads: x, y, delay, depth, scale, flap (s per wing
  cycle), layer ('back' | 'front'), sprite (index), maxAge.

  The layers are pointer-events: none. Taps are observed passively in the
  capture phase and never prevented, so every click reaches the page.
*/
(() => {
  'use strict';

  const layer = window.RizoEventLayer;
  if (!layer || !layer.config.features.flock) return;

  const LIMITS = { desktop: 10, mobile: 6, lite: 4 };
  const SIZES = { desktop: 50, mobile: 38, lite: 36 };
  const SCATTER_RADIUS = { desktop: 240, mobile: 170, lite: 170 };
  const MARGIN = 160;

  layer.define('flock', (api) => {
    const { config, state, loop, input, random, on } = api;
    const settings = config.flock || {};
    const hosts = {
      back: document.querySelector('[data-rizo-event-flock="back"]'),
      front: document.querySelector('[data-rizo-event-flock="front"]')
    };
    if (!hosts.back && !hosts.front) return {};
    if (!hosts.back) hosts.back = hosts.front;
    if (!hosts.front) hosts.front = hosts.back;
    const sprites = (Array.isArray(settings.sprites) ? settings.sprites : []).filter((sprite) => sprite && sprite.src);
    if (!sprites.length) return {};

    const pool = [];
    const pending = [];
    const cleanups = [];
    const counters = { spawned: 0, recycled: 0, scattered: 0, peak: 0, fromMoon: 0 };
    let behavior = api.behaviors.get(settings.behavior) || null;
    let active = 0;
    let idleTimer = 0;
    let lastWake = -Infinity;
    let lastStir = -Infinity;
    let lastStartle = -Infinity;
    let destroyed = false;

    const env = {};
    const syncEnv = () => {
      Object.assign(env, {
        width: state.viewport.width,
        height: state.viewport.height,
        tier: state.tier,
        size: SIZES[state.tier] || 44,
        scatterRadius: SCATTER_RADIUS[state.tier] || 200,
        quiet: state.quiet,
        heroVisible: state.heroVisible,
        motion: state.motionScale,
        sprites: sprites.length,
        moon: api.module?.('moon')?.rect?.() || null,
        random
      });
    };
    syncEnv();

    const density = () => Math.max(0, Math.min(1, Number(settings.density) || 0));
    const limit = () => {
      const base = LIMITS[state.tier] || LIMITS.mobile;
      const degrade = state.degrade >= 2 ? .5 : 1;
      return density() > 0 ? Math.max(1, Math.round(base * density() * degrade)) : 0;
    };
    const paused = () => destroyed || state.reduced || state.overlayOpen || state.motionScale <= 0 || !behavior;

    /* Pool ---------------------------------------------------------------- */

    const createFlyer = () => {
      const element = document.createElement('span');
      element.className = 'rizo-event-flyer';
      element.setAttribute('aria-hidden', 'true');
      const sheet = document.createElement('span');
      sheet.className = 'rizo-event-flyer-sheet';
      element.append(sheet);
      hosts.back.append(element);
      const flyer = { element, sheet, host: 'back', sprite: -1, active: false, x: 0, y: 0, vx: 0, vy: 0, rotation: 0, scale: 1, depth: 1, age: 0, maxAge: 16, entered: false, motion: null, rendered: '' };
      pool.push(flyer);
      return flyer;
    };

    const dress = (flyer, index) => {
      const safe = ((index % sprites.length) + sprites.length) % sprites.length;
      if (flyer.sprite === safe) return;
      flyer.sprite = safe;
      const sprite = sprites[safe];
      const width = SIZES[state.tier] || 44;
      flyer.element.style.setProperty('--rizo-flyer-w', `${width}px`);
      flyer.element.style.setProperty('--rizo-flyer-h', `${Math.round(width / (Number(sprite.ratio) || 1.43))}px`);
      flyer.element.style.setProperty('--rizo-flyer-frames', String(Number(sprite.frames) || 4));
      flyer.sheet.style.setProperty('--rizo-flyer-sheet', `url("${sprite.src}")`);
    };

    const moveTo = (flyer, where) => {
      const target = hosts[where] || hosts.back;
      if (flyer.element.parentNode !== target) target.append(flyer.element);
      flyer.host = where;
    };

    const acquire = () => {
      if (active >= limit()) return null;
      const free = pool.filter((flyer) => !flyer.active);
      if (free.length) return free[Math.floor(random() * free.length)];
      if (pool.length < (LIMITS[state.tier] || LIMITS.mobile)) return createFlyer();
      return null;
    };

    const release = (flyer) => {
      if (!flyer.active) return;
      flyer.active = false;
      flyer.motion = null;
      flyer.element.classList.remove('is-active', 'is-gliding');
      active -= 1;
      counters.recycled += 1;
    };

    const render = (flyer) => {
      const transform = `translate3d(${flyer.x.toFixed(1)}px, ${flyer.y.toFixed(1)}px, 0) rotate(${flyer.rotation.toFixed(1)}deg) scale(${flyer.scale.toFixed(3)})`;
      if (transform !== flyer.rendered) {
        flyer.element.style.transform = transform;
        flyer.rendered = transform;
      }
      if (flyer.glide !== flyer.renderedGlide) {
        flyer.element.classList.toggle('is-gliding', Boolean(flyer.glide));
        flyer.renderedGlide = flyer.glide;
      }
      if (flyer.layer && flyer.layer !== flyer.host) moveTo(flyer, flyer.layer);
    };

    const activate = (flyer, spec) => {
      flyer.active = true;
      flyer.x = spec.x;
      flyer.y = spec.y;
      flyer.vx = 0;
      flyer.vy = 0;
      flyer.rotation = 0;
      flyer.glide = false;
      flyer.depth = spec.depth || 1;
      flyer.scale = spec.scale ?? flyer.depth;
      flyer.age = 0;
      flyer.maxAge = spec.maxAge || 18;
      flyer.entered = false;
      flyer.layer = spec.layer === 'front' ? 'front' : 'back';
      dress(flyer, spec.sprite ?? Math.floor(random() * sprites.length));
      moveTo(flyer, flyer.layer);
      behavior.init(flyer, spec, env);
      const element = flyer.element;
      element.style.setProperty('--rizo-flyer-flap', `${(spec.flap || .14).toFixed(3)}s`);
      element.style.setProperty('--rizo-flyer-flap-delay', `${(-random() * .3).toFixed(3)}s`);
      render(flyer);
      element.classList.add('is-active');
      active += 1;
      counters.spawned += 1;
      counters.peak = Math.max(counters.peak, active);
    };

    /* Frame --------------------------------------------------------------- */

    const task = (dt, now) => {
      if (state.overlayOpen) return;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (now < pending[index].at) continue;
        const [entry] = pending.splice(index, 1);
        const flyer = acquire();
        if (flyer) activate(flyer, entry.spec);
      }
      for (const flyer of pool) {
        if (!flyer.active) continue;
        behavior.step(flyer, dt, env);
        flyer.age += dt;
        const onScreen = flyer.x >= 0 && flyer.x <= env.width && flyer.y >= 0 && flyer.y <= env.height;
        if (onScreen) flyer.entered = true;
        const outside = flyer.x < -MARGIN || flyer.x > env.width + MARGIN || flyer.y < -MARGIN || flyer.y > env.height + MARGIN;
        if ((outside && (flyer.entered || flyer.age > 3)) || flyer.age > flyer.maxAge) {
          release(flyer);
          continue;
        }
        render(flyer);
      }
      if (!active && !pending.length) loop.remove(task);
    };

    const spawn = (specs) => {
      if (paused() || !Array.isArray(specs) || !specs.length) return 0;
      const room = Math.max(0, limit() - active - pending.length);
      const taken = specs.slice(0, room);
      const now = performance.now();
      taken.forEach((spec) => {
        if (spec.delay > 0) {
          pending.push({ at: now + spec.delay * 1000, spec });
        } else {
          const flyer = acquire();
          if (flyer) activate(flyer, spec);
        }
      });
      if (taken.length) loop.add(task);
      return taken.length;
    };

    /* Scheduling ---------------------------------------------------------- */

    const activity = () => Math.max(0, Math.min(1, Number(settings.activity) || 0));

    /* Long quiet stretches: roughly 20–75 s apart, much less often over
       products. The first one comes early so the world is seen to be alive. */
    const scheduleIdle = (first) => {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      if (paused() || activity() <= 0) return;
      const gap = first ? 3200 + random() * 3800 : (78000 - 56000 * activity()) * (.65 + random() * .7);
      idleTimer = window.setTimeout(() => {
        idleTimer = 0;
        if (!document.hidden && !paused() && !(state.quiet && random() < .75)) {
          syncEnv();
          spawn(behavior.idle(env));
        }
        scheduleIdle(false);
      }, gap);
    };

    const onScroll = (velocity, dt) => {
      if (!settings.scroll || paused()) return;
      if (active) for (const flyer of pool) if (flyer.active) behavior.scroll?.(flyer, velocity, dt, env);
      const speed = Math.abs(velocity);
      const now = performance.now();
      if (speed > 1400 && now - lastWake > 4000) {
        lastWake = now;
        syncEnv();
        spawn(behavior.wake(env, velocity));
      } else if (speed > 600 && now - lastStir > 9000 && now - lastWake > 2500) {
        lastStir = now;
        if (random() < .35) { syncEnv(); spawn(behavior.wake(env, velocity, 1)); }
      }
    };

    const onTap = (tap) => {
      if (!settings.tap || paused() || tap.overlay) return;
      if (tap.kind === 'down') {
        let scattered = 0;
        for (const flyer of pool) if (flyer.active && flyer.age > .25 && behavior.scatter(flyer, tap, env)) scattered += 1;
        if (scattered) { counters.scattered += scattered; loop.add(task); }
        return;
      }
      if (tap.kind === 'click' && !tap.interactive && tap.time - lastStartle > 1400 && tap.time - lastMoon > 900) {
        lastStartle = tap.time;
        syncEnv();
        spawn(behavior.startle(env, tap));
      }
    };

    let lastMoon = -Infinity;
    const onMoon = (moon) => {
      if (paused() || !behavior.moon) return;
      const now = performance.now();
      if (now - lastMoon < 1600) return;
      lastMoon = now;
      syncEnv();
      counters.fromMoon += spawn(behavior.moon(env, moon));
    };

    /* Lifecycle ----------------------------------------------------------- */

    const hush = () => {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      pending.length = 0;
      pool.forEach(release);
      loop.remove(task);
    };

    const resume = () => {
      if (paused()) { hush(); return; }
      syncEnv();
      if (!idleTimer) scheduleIdle(counters.spawned === 0);
    };

    const begin = () => {
      while (pool.length < Math.min(sprites.length, LIMITS[state.tier] || LIMITS.mobile)) dress(createFlyer(), pool.length);
      cleanups.push(
        input.onScroll(onScroll),
        input.onTap(onTap),
        on('moon-tap', onMoon),
        on('resize', syncEnv),
        on('hero', syncEnv),
        on('quiet', syncEnv),
        on('tier', syncEnv),
        on('degrade', () => {
          syncEnv();
          for (const flyer of pool) if (active > limit() && flyer.active) release(flyer);
        }),
        on('motion', resume),
        on('overlay', (open) => {
          if (open) { loop.remove(task); return; }
          if (active || pending.length) loop.add(task);
          resume();
        })
      );
      resume();
    };

    if (behavior) begin();
    else {
      const offBehavior = on('behavior', (name) => {
        if (name !== settings.behavior || behavior) return;
        behavior = api.behaviors.get(name);
        offBehavior();
        begin();
      });
      cleanups.push(offBehavior);
    }

    return {
      spawn: (specs) => { syncEnv(); return spawn(specs); },
      env: () => { syncEnv(); return env; },
      destroy() {
        destroyed = true;
        hush();
        cleanups.forEach((cleanup) => cleanup());
        pool.forEach((flyer) => flyer.element.remove());
        pool.length = 0;
      },
      stats: () => ({
        flockBehavior: behavior ? settings.behavior : `${settings.behavior} (waiting)`,
        flockLimit: limit(),
        flockActive: active,
        flockPending: pending.length,
        flockPool: pool.length,
        flockElements: (hosts.back.childElementCount + (hosts.front !== hosts.back ? hosts.front.childElementCount : 0)),
        flockSpawned: counters.spawned,
        flockRecycled: counters.recycled,
        flockScattered: counters.scattered,
        flockFromMoon: counters.fromMoon,
        flockPeak: counters.peak,
        flockIdleScheduled: Boolean(idleTimer),
        flockFront: pool.filter((flyer) => flyer.active && flyer.host === 'front').length
      })
    };
  });
})();
