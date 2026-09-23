/*
  RIZO EVENT LAYER — ambient flock module

  A bounded pool of decorative flyers (Halloween: bats). This file owns
  everything that is not specific to one event:
    - hard limits per device tier, scaled by the "Bat count" setting
    - a reusable DOM pool (created lazily, never more than the tier limit)
    - idle / scroll / tap scheduling with quiet periods and cooldowns
    - bounds checks and recycling, transform-only rendering
    - pausing under drawers, on hidden tabs, and for reduced motion

  How flyers move is delegated to a behaviour registered by the active
  preset, e.g. assets/event-halloween.js:

    RizoEventLayer.defineBehavior('bats', {
      idle(env) → [spec…]            a flight crossing the screen
      wake(env, velocity, count) → [spec…]   flyers stirred by fast scrolling
      startle(env, tap) → [spec…]    flyers flushed out by a tap in open space
      init(flyer, spec)              copy the spec's motion state onto the flyer
      step(flyer, dt, env)           advance x, y, rotation, scale
      scroll(flyer, velocity, dt, env)   loose response to scrolling
      scatter(flyer, tap, env)       react to a nearby tap
    });

  The layer is pointer-events: none. Taps are observed passively in the
  capture phase and never prevented, so every click reaches the page.
*/
(() => {
  'use strict';

  const layer = window.RizoEventLayer;
  if (!layer || !layer.config.features.flock) return;

  const LIMITS = { desktop: 16, mobile: 8, lite: 5 };
  const SIZES = { desktop: 46, mobile: 34, lite: 34 };
  const SCATTER_RADIUS = { desktop: 240, mobile: 170, lite: 170 };
  const MARGIN = 120;

  layer.define('flock', (api) => {
    const { config, state, loop, input, random, on } = api;
    const settings = config.flock || {};
    const host = document.querySelector('[data-rizo-event-flock]');
    const sprites = (Array.isArray(settings.sprites) ? settings.sprites : []).filter((sprite) => sprite && sprite.src);
    if (!host || !sprites.length) return {};

    const pool = [];
    const pending = [];
    const cleanups = [];
    const counters = { spawned: 0, recycled: 0, scattered: 0, peak: 0 };
    let behavior = api.behaviors.get(settings.behavior) || null;
    let active = 0;
    let idleTimer = 0;
    // Cooldown clocks start "long ago" so the first fling or tap after load counts.
    let lastWake = -Infinity;
    let lastStir = -Infinity;
    let lastStartle = -Infinity;
    let destroyed = false;

    const env = {
      width: state.viewport.width,
      height: state.viewport.height,
      tier: state.tier,
      size: SIZES[state.tier] || 40,
      scatterRadius: SCATTER_RADIUS[state.tier] || 200,
      quiet: state.quiet,
      heroVisible: state.heroVisible,
      motion: state.motionScale,
      random
    };
    const syncEnv = () => {
      env.width = state.viewport.width;
      env.height = state.viewport.height;
      env.tier = state.tier;
      env.size = SIZES[state.tier] || 40;
      env.scatterRadius = SCATTER_RADIUS[state.tier] || 200;
      env.quiet = state.quiet;
      env.heroVisible = state.heroVisible;
      env.motion = state.motionScale;
    };

    const density = () => Math.max(0, Math.min(1, Number(settings.density) || 0));
    const limit = () => {
      const base = LIMITS[state.tier] || LIMITS.mobile;
      const degrade = state.degrade >= 2 ? .5 : 1;
      return density() > 0 ? Math.max(1, Math.round(base * density() * degrade)) : 0;
    };
    const paused = () => destroyed || state.reduced || state.overlayOpen || state.motionScale <= 0 || !behavior;

    /* Pool ---------------------------------------------------------------- */

    const createFlyer = () => {
      const sprite = sprites[pool.length % sprites.length];
      const element = document.createElement('span');
      element.className = 'rizo-event-flyer';
      element.setAttribute('aria-hidden', 'true');
      const width = SIZES[state.tier] || 40;
      element.style.setProperty('--rizo-flyer-w', `${width}px`);
      element.style.setProperty('--rizo-flyer-h', `${Math.round(width / (Number(sprite.ratio) || 2))}px`);
      const addSprite = (src, extra) => {
        let node;
        if (sprite.mode === 'mask') {
          node = document.createElement('span');
          node.style.setProperty('--rizo-flyer-mask', `url("${src}")`);
          node.className = `rizo-event-flyer-sprite rizo-event-flyer-sprite--mask${extra}`;
        } else {
          node = document.createElement('img');
          node.src = src;
          node.alt = '';
          node.decoding = 'async';
          node.draggable = false;
          node.className = `rizo-event-flyer-sprite${extra}`;
        }
        element.append(node);
      };
      addSprite(sprite.src, '');
      if (sprite.pose2) {
        addSprite(sprite.pose2, ' rizo-event-flyer-sprite--b');
        element.classList.add('rizo-event-flyer--poses');
      }
      host.append(element);
      const flyer = { element, sprite, active: false, x: 0, y: 0, vx: 0, vy: 0, rotation: 0, scale: 1, depth: 1, age: 0, maxAge: 16, entered: false, motion: null, rendered: '' };
      pool.push(flyer);
      return flyer;
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
      flyer.element.classList.remove('is-active');
      active -= 1;
      counters.recycled += 1;
    };

    const render = (flyer) => {
      const transform = `translate3d(${flyer.x.toFixed(1)}px, ${flyer.y.toFixed(1)}px, 0) rotate(${flyer.rotation.toFixed(1)}deg) scale(${flyer.scale.toFixed(3)})`;
      if (transform !== flyer.rendered) {
        flyer.element.style.transform = transform;
        flyer.rendered = transform;
      }
    };

    const activate = (flyer, spec) => {
      flyer.active = true;
      flyer.x = spec.x;
      flyer.y = spec.y;
      flyer.vx = 0;
      flyer.vy = 0;
      flyer.rotation = 0;
      flyer.depth = spec.depth || 1;
      flyer.scale = spec.scale ?? flyer.depth;
      flyer.age = 0;
      flyer.maxAge = spec.maxAge || 16;
      flyer.entered = false;
      behavior.init(flyer, spec, env);
      const element = flyer.element;
      element.style.setProperty('--rizo-flyer-depth', (.55 + .45 * Math.min(1, flyer.depth)).toFixed(2));
      element.style.setProperty('--rizo-flyer-flap', `${(spec.flap || .22).toFixed(3)}s`);
      element.style.setProperty('--rizo-flyer-flap-delay', `${(-random() * .4).toFixed(3)}s`);
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

    const scheduleIdle = (first) => {
      window.clearTimeout(idleTimer);
      idleTimer = 0;
      if (paused() || activity() <= 0) return;
      // Quiet periods: roughly 6–22s apart depending on "Idle activity", with jitter.
      const gap = first ? 1400 + random() * 1600 : (22000 - 16000 * activity()) * (.7 + random() * .7);
      idleTimer = window.setTimeout(() => {
        idleTimer = 0;
        if (!document.hidden && !paused() && !(state.quiet && random() < .6)) {
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
      if (speed > 1100 && now - lastWake > 2600) {
        lastWake = now;
        syncEnv();
        spawn(behavior.wake(env, velocity));
      } else if (speed > 420 && now - lastStir > 5200 && now - lastWake > 1500) {
        lastStir = now;
        if (random() < .45) { syncEnv(); spawn(behavior.wake(env, velocity, 1)); }
      }
    };

    const onTap = (tap) => {
      if (!settings.tap || paused() || tap.overlay) return;
      if (tap.kind === 'down') {
        let scattered = 0;
        for (const flyer of pool) if (flyer.active && behavior.scatter(flyer, tap, env)) scattered += 1;
        if (scattered) { counters.scattered += scattered; loop.add(task); }
        return;
      }
      // A deliberate tap in open space flushes a bat or two out of hiding.
      // Never around links, buttons, fields or product cards.
      if (tap.kind === 'click' && !tap.interactive && tap.time - lastStartle > 900) {
        lastStartle = tap.time;
        syncEnv();
        spawn(behavior.startle(env, tap));
      }
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
      // Warm the image cache with one flyer per sprite; the rest are made on demand.
      while (pool.length < Math.min(sprites.length, LIMITS[state.tier] || LIMITS.mobile)) createFlyer();
      cleanups.push(
        input.onScroll(onScroll),
        input.onTap(onTap),
        on('resize', syncEnv),
        on('hero', syncEnv),
        on('quiet', syncEnv),
        on('tier', syncEnv),
        on('degrade', () => {
          syncEnv();
          for (const flyer of pool) if (active > limit() && flyer.active) release(flyer);
        }),
        on('motion', resume),
        // Under an open drawer/menu the layer fades out and flight freezes (no frames run).
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
        flockElements: host.childElementCount,
        flockSpawned: counters.spawned,
        flockRecycled: counters.recycled,
        flockScattered: counters.scattered,
        flockPeak: counters.peak,
        flockIdleScheduled: idleTimer !== 0
      })
    };
  });
})();
