/*
  HALLOWEEN 2026 — bats for the Rizo Event Layer

  The only file that knows how bats behave. The flock module
  (assets/rizo-event-flock.js) owns pooling, limits, timing, input and
  rendering; this file answers "where does a bat go next".

  Flight: bats hunt. They hold a loose route (enter → cross → leave) but
  fly it in short, fluttering legs with sudden swerves, the odd dive and a
  rare glide, each bat with its own speed and temper. Nothing loops.

  Kinds of appearance (idle), rarely and one at a time:
    hunt      a lone bat crossing, usually behind the page
    pair      one chasing another, the follower copying the leader's turns
    distant   a speck high up near the moon
    moon      one leaves from behind the moon and comes toward you
  Plus: fast scrolling stirs a few, a tap in open space flushes one out,
  and tapping the moon sends two or three out from behind it.

  Roost (halloween-roost): one bat hangs under an edge — the header, a
  solid section over open sky, or anything marked data-roost (the full
  stop of the homepage headline). Ambient → it notices the pointer →
  it drops and flies off when disturbed → later it's back somewhere else.
*/
(() => {
  'use strict';

  const layer = window.RizoEventLayer;
  if (!layer) return;

  const { clamp } = layer;
  const TAU = Math.PI * 2;

  const TUNING = {
    cruise: [170, 320],       // px/s, scaled by viewport width
    legs: [.22, .62],         // s between heading changes
    swerve: [.35, 1.05],      // rad, ordinary heading change
    sharp: .16,               // chance a change is a hard swerve
    dive: .1,                 // chance of a short dive
    glide: .06,               // chance of a short glide
    flutter: [.08, .2],       // sideways wobble (fraction of heading)
    flutterRate: [9, 15],     // rad/s
    turn: [3.2, 5.2],         // how quickly a bat corrects toward its route
    flap: [.1, .15],          // s per full wing cycle (4 frames)
    scatterForce: 760,
    scrollPush: .5,
    bank: 22                  // max lean in degrees
  };

  const between = ([min, max], r) => min + (max - min) * r;
  const pick = (weights, r) => {
    let total = 0;
    for (const [key, weight] of weights) { total += weight; if (r < total) return key; }
    return weights[weights.length - 1][0];
  };

  const exitPoint = (x, y, dx, dy, env) => {
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const tx = ux > 0 ? (env.width + 160 - x) / ux : ux < 0 ? (-160 - x) / ux : Infinity;
    const ty = uy > 0 ? (env.height + 160 - y) / uy : uy < 0 ? (-160 - y) / uy : Infinity;
    const t = Math.min(tx, ty);
    return { x: x + ux * t, y: y + uy * t };
  };

  /* One bat. The flock copies x/y/depth/scale/flap/layer/sprite; init()
     stores the rest on the flyer. */
  const bat = (env, start, route, options = {}) => {
    const r = env.random;
    const depth = options.depth ?? between([.6, 1.05], r());
    const cruise = clamp(env.width * .22, TUNING.cruise[0], TUNING.cruise[1]);
    return {
      x: start.x,
      y: start.y,
      delay: options.delay || 0,
      depth,
      scale: options.grow ? depth * .28 : depth,
      layer: options.layer || 'back',
      sprite: options.sprite ?? Math.floor(r() * (env.sprites || 1)),
      flap: between(TUNING.flap, r()) * (options.frantic ? .8 : 1) * (depth < .5 ? .85 : 1),
      maxAge: options.maxAge || 18,
      flight: {
        route,
        leg: 0,
        speed: cruise * (.55 + env.motion * .7) * (options.speed || 1) * (.8 + r() * .4) * (.7 + depth * .4),
        boost: options.boost || 1,
        turn: between(TUNING.turn, r()) * (options.frantic ? 1.6 : 1),
        arrive: 70,
        heading: 0,
        legIn: r() * .3,
        dive: 0,
        glideFor: 0,
        flutter: between(TUNING.flutter, r()),
        flutterRate: between(TUNING.flutterRate, r()),
        phase: r() * TAU,
        grow: Boolean(options.grow),
        growTo: options.growTo ?? depth,
        cross: options.cross || 0,   // seconds until it moves to the front layer
        depth,
        pair: options.pair || null,
        role: options.role || null,
        lag: options.lag || .32
      }
    };
  };

  const edgeStart = (env, y, fromLeft) => ({ x: fromLeft ? -90 : env.width + 90, y });

  const KINDS = {
    hunt(env) {
      const r = env.random;
      const band = env.quiet ? [.05, .2] : [.08, .55];
      const fromLeft = r() < .5;
      const y0 = env.height * between(band, r());
      const y1 = env.height * between(band, r());
      const start = edgeStart(env, y0, fromLeft);
      const mid = { x: env.width * between([.3, .7], r()), y: (y0 + y1) / 2 + env.height * (r() - .5) * .3 };
      const end = { x: fromLeft ? env.width + 140 : -140, y: y1 };
      const front = !env.quiet && r() < .28;
      return [bat(env, start, [mid, end], { layer: front ? 'front' : 'back', depth: front ? between([.95, 1.25], r()) : between([.55, .9], r()) })];
    },
    pair(env) {
      const r = env.random;
      const fromLeft = r() < .5;
      const y0 = env.height * between([.12, .45], r());
      const start = edgeStart(env, y0, fromLeft);
      const route = [
        { x: env.width * between([.25, .45], r()), y: y0 + env.height * (r() - .5) * .25 },
        { x: env.width * between([.55, .75], r()), y: y0 + env.height * (r() - .5) * .3 },
        { x: fromLeft ? env.width + 150 : -150, y: env.height * between([.05, .4], r()) }
      ];
      const pair = { trail: [] };
      const depth = between([.62, .92], r());
      return [
        bat(env, start, route, { depth, pair, role: 'lead', speed: 1.05 }),
        bat(env, { x: start.x + (fromLeft ? -50 : 50), y: start.y + 10 }, route, { depth: depth * .94, pair, role: 'follow', delay: .25, lag: between([.22, .42], r()), speed: 1.15 })
      ];
    },
    distant(env) {
      const r = env.random;
      const moon = env.moon && env.moon.bottom > 0 && env.moon.top < env.height ? env.moon : null;
      const fromLeft = r() < .5;
      const y = moon ? clamp(moon.top + moon.height * between([.1, .8], r()), 20, env.height * .5) : env.height * between([.06, .25], r());
      const start = edgeStart(env, y, fromLeft);
      const end = { x: fromLeft ? env.width + 120 : -120, y: y + env.height * (r() - .5) * .15 };
      return [bat(env, start, [end], { layer: 'back', depth: between([.3, .42], r()), speed: .55, maxAge: 30 })];
    },
    moon(env, count) {
      const r = env.random;
      const moon = env.moon;
      if (!moon || moon.bottom < 40 || moon.top > env.height - 40 || moon.right < 0 || moon.left > env.width) return KINDS.hunt(env);
      const cx = moon.left + moon.width / 2;
      const cy = moon.top + moon.height / 2;
      const n = count || 1;
      return Array.from({ length: n }, (_, index) => {
        const angle = -Math.PI / 2 + (r() - .5) * 2.4 + (index - (n - 1) / 2) * .5;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle) - .15;
        const origin = { x: cx + (r() - .5) * moon.width * .3, y: cy + (r() - .5) * moon.height * .3 };
        const toward = r() < .7;
        const route = [
          { x: origin.x + dx * moon.width * .55, y: origin.y + dy * moon.height * .45 },
          exitPoint(origin.x, origin.y, dx + (r() - .5) * .6, dy, env)
        ];
        return bat(env, origin, route, {
          layer: 'back', grow: true, growTo: toward ? between([1.05, 1.45], r()) : between([.6, .85], r()),
          depth: .9, cross: toward ? between([.45, .8], r()) : 0,
          speed: 1.15, delay: index * between([.08, .22], r()), frantic: true, maxAge: 10
        });
      });
    }
  };

  layer.defineBehavior('bats', {
    idle(env) {
      const r = env.random;
      const moonUp = env.moon && env.moon.bottom > 60 && env.moon.top < env.height * .8;
      const kind = env.quiet ? 'distant' : pick([['hunt', .45], ['pair', .2], ['distant', .2], ['moon', moonUp ? .15 : 0]], r() * (moonUp ? 1 : .85));
      return kind === 'moon' ? KINDS.moon(env, 1) : KINDS[kind](env);
    },

    /* Fast scrolling stirs a few: they climb when the page moves down and
       drop in from above when it moves up. */
    wake(env, velocity, count) {
      const r = env.random;
      const down = velocity > 0;
      const n = count || (env.quiet ? 1 : 2 + (r() < .3 ? 1 : 0));
      const fromLeft = r() < .5;
      return Array.from({ length: n }, (_, index) => {
        const start = { x: fromLeft ? -70 : env.width + 70, y: env.height * (down ? between([.45, .8], r()) : between([.04, .2], r())) };
        const via = { x: env.width * (fromLeft ? between([.3, .55], r()) : between([.45, .7], r())), y: env.height * (down ? between([.2, .45], r()) : between([.25, .5], r())) };
        const end = { x: fromLeft ? env.width + 140 : -140, y: down ? -140 : env.height * between([.15, .45], r()) };
        const speed = 1.2 + Math.min(.6, Math.abs(velocity) / 4000);
        return bat(env, start, [via, end], { speed, delay: index * between([.05, .18], r()), depth: between([.6, 1], r()), layer: index === 0 && !env.quiet && r() < .4 ? 'front' : 'back' });
      });
    },

    /* A tap in open space flushes one out of hiding, away and up. */
    startle(env, tap) {
      const r = env.random;
      const angle = -Math.PI / 2 + (r() - .5) * 1.8;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const origin = { x: tap.x + (r() - .5) * 18, y: tap.y + (r() - .5) * 12 };
      const route = [{ x: origin.x + dx * 170, y: origin.y + dy * 170 }, exitPoint(origin.x, origin.y, dx, dy, env)];
      return [bat(env, origin, route, { layer: 'front', speed: 1.6, boost: 1.5, grow: true, growTo: between([.95, 1.2], r()), frantic: true, maxAge: 8 })];
    },

    /* Tapping the moon: two or three leave from behind it. */
    moon(env) {
      return KINDS.moon(env, 2 + (env.random() < .35 ? 1 : 0));
    },

    init(flyer, spec) {
      flyer.motion = spec.flight;
      const target = spec.flight.route[0];
      const dx = target.x - flyer.x;
      const dy = target.y - flyer.y;
      const length = Math.hypot(dx, dy) || 1;
      flyer.vx = (dx / length) * spec.flight.speed;
      flyer.vy = (dy / length) * spec.flight.speed;
    },

    step(flyer, dt, env) {
      const m = flyer.motion;
      const r = env.random;

      /* Where it wants to go: the next waypoint, or for a follower, where
         its leader was a moment ago. */
      let target = m.route[m.leg];
      if (m.pair) {
        if (m.role === 'lead') {
          m.pair.trail.push({ x: flyer.x, y: flyer.y, t: flyer.age });
          if (m.pair.trail.length > 90) m.pair.trail.shift();
        } else if (m.pair.trail.length) {
          const want = flyer.age - m.lag;
          const point = m.pair.trail.find((p) => p.t >= want) || m.pair.trail[m.pair.trail.length - 1];
          if (point && want > 0) target = point;
        }
      }
      const dx = target.x - flyer.x;
      const dy = target.y - flyer.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < m.arrive && m.leg < m.route.length - 1 && target === m.route[m.leg]) m.leg += 1;

      /* Hunting: short legs, each with a new heading offset. */
      m.legIn -= dt;
      if (m.legIn <= 0) {
        m.legIn = between(TUNING.legs, r());
        const sharp = r() < TUNING.sharp;
        m.heading = (r() - .5) * 2 * (sharp ? 1.6 : between(TUNING.swerve, r()));
        if (sharp) m.boost = Math.max(m.boost, 1.35);
        if (r() < TUNING.dive) m.dive = .45;
        if (m.glideFor <= 0 && r() < TUNING.glide && flyer.scale > .5) m.glideFor = between([.18, .4], r());
      }
      m.heading *= Math.exp(-dt * 2.2);
      m.dive = Math.max(0, m.dive - dt);
      m.glideFor = Math.max(0, m.glideFor - dt);
      flyer.glide = m.glideFor > 0;

      const base = Math.atan2(dy, dx) + (m.role === 'follow' ? m.heading * .4 : m.heading);
      m.phase += dt * m.flutterRate;
      const flutter = Math.sin(m.phase) * m.flutter;
      const speed = m.speed * m.boost * (flyer.glide ? .92 : 1);
      const desiredX = Math.cos(base + flutter) * speed;
      const desiredY = Math.sin(base + flutter) * speed + (m.dive > 0 ? speed * .9 : 0) + (flyer.glide ? 25 : 0);
      const turn = Math.min(1, dt * m.turn * (m.role === 'follow' ? 1.5 : 1));
      flyer.vx += (desiredX - flyer.vx) * turn;
      flyer.vy += (desiredY - flyer.vy) * turn;
      flyer.x += flyer.vx * dt;
      flyer.y += flyer.vy * dt;
      m.boost = 1 + (m.boost - 1) * Math.exp(-dt * 1.4);

      if (m.grow) {
        flyer.scale = Math.min(m.growTo, flyer.scale + dt * Math.max(.6, m.growTo) * 1.6);
        if (flyer.scale >= m.growTo) m.grow = false;
      }
      if (m.cross && flyer.age >= m.cross) { flyer.layer = 'front'; m.cross = 0; }

      const reference = Math.max(speed, 1);
      flyer.rotation = clamp((flyer.vx / reference) * TUNING.bank * .6 + (flyer.vy / reference) * 10, -TUNING.bank, TUNING.bank);
    },

    /* Scrolling pushes bats with the page, nearer bats more (loose, not 1:1). */
    scroll(flyer, velocity, dt) {
      const m = flyer.motion;
      if (!m) return;
      flyer.vy -= clamp(velocity, -2600, 2600) * TUNING.scrollPush * m.depth * dt;
      m.boost = Math.max(m.boost, 1 + Math.min(.5, Math.abs(velocity) / 3200));
    },

    /* A nearby tap: burst away from the point, then leave. */
    scatter(flyer, tap, env) {
      const m = flyer.motion;
      if (!m) return false;
      const dx = flyer.x - tap.x;
      const dy = flyer.y - tap.y;
      const distance = Math.hypot(dx, dy);
      if (distance > env.scatterRadius) return false;
      const ux = distance ? dx / distance : 0;
      const uy = distance ? dy / distance : -1;
      const strength = .45 + (1 - distance / env.scatterRadius);
      flyer.vx += ux * TUNING.scatterForce * strength;
      flyer.vy += uy * TUNING.scatterForce * strength - 90;
      m.boost = 1.9;
      m.turn = Math.max(m.turn, 6);
      m.pair = null;
      m.route = [{ x: flyer.x + ux * 170, y: flyer.y + uy * 170 - 50 }, exitPoint(flyer.x, flyer.y, ux, uy - .3, env)];
      m.leg = 0;
      flyer.maxAge = Math.min(flyer.maxAge, flyer.age + 6);
      return true;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Roost                                                                */
  /* ------------------------------------------------------------------ */

  layer.define('halloween-roost', ({ state, config, input, on, random }) => {
    const sheet = config.flock?.roostSprite;
    if (!config.features.flock || !config.flock?.roost || !sheet) return {};
    const small = () => state.tier !== 'desktop';
    const enabled = () => !state.reduced && state.motionScale > 0 && state.degrade < 2 && !state.overlayOpen && !document.hidden;

    let bat = null;          // { node, host, spot, leaving }
    let timer = 0;
    let idleTimer = 0;
    let lastSpot = null;
    let lastPointer = 0;
    let visits = 0;

    /* Where a bat can hang: the underside of the header, the bottom edge of
       a solid section that has open sky below it, or anything marked
       data-roost. Only spots on screen, away from the pointer. */
    const spots = () => {
      const list = [];
      const vh = state.viewport.height;
      const vw = state.viewport.width;
      document.querySelectorAll('[data-roost]').forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.bottom > vh * .08 && rect.bottom < vh * .85 && rect.width) list.push({ key: node, host: node, x: node.dataset.roostX || '44%', y: node.dataset.roost === 'hang' ? '82%' : '100%', weight: 3, screenX: rect.left + rect.width / 2, screenY: rect.bottom });
      });
      const header = document.querySelector('.header-bar');
      /* Only under a solid header: a bat can't hang from a transparent edge. */
      if (header && vw > 749 && header.closest('.is-scrolled')) {
        const rect = header.getBoundingClientRect();
        const x = .52 + random() * .1;
        list.push({ key: header, host: header, x: `${(x * 100).toFixed(1)}%`, y: '100%', weight: 1, screenX: rect.left + rect.width * x, screenY: rect.bottom, fixed: true });
      }
      const sections = [...document.querySelectorAll('.s[data-surface]')];
      sections.forEach((node, index) => {
        if (node.dataset.surface === 'open' || node.hasAttribute('data-roost-skip') || node.hasAttribute('data-rizo-event-quiet')) return;
        const next = sections[index + 1];
        if (!next || next.dataset.surface !== 'open') return;
        const rect = node.getBoundingClientRect();
        if (rect.bottom < vh * .15 || rect.bottom > vh * .8) return;
        const x = (random() < .5 ? .14 + random() * .14 : .7 + random() * .16);
        list.push({ key: node, host: node, x: `${(x * 100).toFixed(1)}%`, y: '100%', weight: 2, screenX: rect.left + rect.width * x, screenY: rect.bottom });
      });
      return list;
    };

    const setFrame = (frame) => { if (bat) bat.node.dataset.frame = String(frame); };

    const leave = (why) => {
      if (!bat || bat.leaving) return;
      bat.leaving = true;
      window.clearTimeout(idleTimer);
      const { node } = bat;
      node.classList.add('is-flying');
      const side = random() < .5 ? -1 : 1;
      const animation = node.animate([
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${side * 6}px, 16px) rotate(${side * 30}deg)`, offset: .12 },
        { transform: `translate(${side * 60}px, -30px) rotate(${side * -10}deg)`, offset: .4 },
        { transform: `translate(${side * state.viewport.width * .5}px, ${-state.viewport.height * .55}px) rotate(${side * 8}deg) scale(1.2)` }
      ], { duration: 1300, easing: 'cubic-bezier(.3,.3,.3,1)', fill: 'forwards' });
      const done = () => { node.remove(); bat = null; schedule(why === 'moved' ? 9000 : 26000 + random() * 34000); };
      animation.onfinish = done;
      animation.oncancel = done;
    };

    const ambient = () => {
      window.clearTimeout(idleTimer);
      if (!bat || bat.leaving) return;
      idleTimer = window.setTimeout(() => {
        if (!bat || bat.leaving || !enabled()) return;
        const roll = random();
        if (roll < .45) { setFrame(1); window.setTimeout(() => setFrame(0), 900 + random() * 700); }
        else if (roll < .75) { setFrame(2); window.setTimeout(() => setFrame(0), 1400 + random() * 600); }
        else bat.node.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(1deg)' }, { transform: 'rotate(0deg)' }], { duration: 2600, easing: 'ease-in-out' });
        ambient();
      }, 5500 + random() * 9000);
    };

    const arrive = () => {
      if (bat || !enabled()) { schedule(12000); return; }
      const options = spots().filter((spot) => spot.key !== lastSpot);
      if (!options.length) { schedule(15000); return; }
      const total = options.reduce((sum, spot) => sum + spot.weight, 0);
      let roll = random() * total;
      const spot = options.find((candidate) => (roll -= candidate.weight) <= 0) || options[0];
      lastSpot = spot.key;

      const node = document.createElement('span');
      node.className = 'rizo-roost is-flying';
      node.setAttribute('aria-hidden', 'true');
      node.style.setProperty('--roost-x', spot.x);
      node.style.setProperty('--roost-y', spot.y);
      node.style.setProperty('--roost-w', `${small() ? 18 : 24}px`);
      node.style.setProperty('--rizo-roost-sheet', `url("${sheet}")`);
      node.innerHTML = '<span class="rizo-roost-frame"><span></span></span><span class="rizo-roost-flight"><span></span></span>';
      if (getComputedStyle(spot.host).position === 'static') spot.host.style.position = 'relative';
      spot.host.append(node);
      bat = { node, host: spot.host, spot, leaving: false, arrived: false };
      visits += 1;

      const side = spot.screenX > state.viewport.width / 2 ? 1 : -1;
      const fromX = side * (state.viewport.width * .45 + 80);
      const fromY = -Math.min(state.viewport.height * .5, spot.screenY + 60);
      const flight = node.animate([
        { transform: `translate(${fromX}px, ${fromY}px) rotate(${-side * 10}deg) scale(1.15)` },
        { transform: `translate(${fromX * .35}px, ${fromY * .2}px) rotate(${side * 12}deg)`, offset: .55 },
        { transform: `translate(${side * 14}px, 10px) rotate(${-side * 8}deg)`, offset: .86 },
        { transform: 'translate(0, 0) rotate(0deg)' }
      ], { duration: 1500 + random() * 500, easing: 'cubic-bezier(.25,.6,.35,1)' });
      flight.onfinish = () => {
        if (!bat || bat.node !== node || bat.leaving) return;
        node.classList.remove('is-flying');
        bat.arrived = true;
        node.animate([{ transform: 'scaleY(.82)' }, { transform: 'scaleY(1.06)' }, { transform: 'scaleY(1)' }], { duration: 420, easing: 'ease-out' });
        ambient();
      };
    };

    function schedule(delay) {
      window.clearTimeout(timer);
      timer = window.setTimeout(arrive, delay);
    }

    const near = (x, y) => {
      if (!bat || !bat.arrived || bat.leaving) return Infinity;
      const rect = bat.node.getBoundingClientRect();
      return Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
    };
    const onPointer = (event) => {
      if (event.pointerType !== 'mouse' || !bat) return;
      const now = performance.now();
      if (now - lastPointer < 90) return;
      lastPointer = now;
      const d = near(event.clientX, event.clientY);
      if (d < 70) leave('pointer');
      else if (d < 170) { if (bat.node.dataset.frame !== '1') setFrame(1); }
      else if (bat.node.dataset.frame === '1') setFrame(0);
    };
    const onScroll = (velocity) => {
      if (!bat || bat.leaving) return;
      if (Math.abs(velocity) > 1100 && bat.arrived) { leave('scroll'); return; }
      if (bat.spot.fixed && !bat.host.closest('.is-scrolled')) { leave('moved'); return; }
      if (!bat.spot.fixed) {
        const rect = bat.node.getBoundingClientRect();
        if (rect.bottom < -40 || rect.top > state.viewport.height + 40) { bat.node.remove(); bat = null; schedule(6000 + random() * 6000); }
      }
    };

    document.addEventListener('pointermove', onPointer, { passive: true });
    const cleanups = [
      input.onTap((tap) => { if (tap.kind === 'down' && near(tap.x, tap.y) < 120) leave('tap'); }),
      input.onScroll(onScroll),
      on('overlay', (open) => { if (open && bat) { bat.node.remove(); bat = null; } if (!open) schedule(9000); }),
      on('motion', () => { if (!enabled() && bat) { bat.node.remove(); bat = null; } schedule(8000); }),
      on('degrade', () => { if (!enabled() && bat) { bat.node.remove(); bat = null; } })
    ];
    schedule(7000 + random() * 7000);

    return {
      unmount(container) { if (bat && container.contains(bat.node)) { bat.node.remove(); bat = null; schedule(8000); } },
      destroy() {
        window.clearTimeout(timer);
        window.clearTimeout(idleTimer);
        document.removeEventListener('pointermove', onPointer);
        cleanups.forEach((off) => off());
        bat?.node.remove();
        bat = null;
      },
      stats: () => ({ roosting: Boolean(bat && bat.arrived), roostVisits: visits }),
      arriveNow: arrive
    };
  });
})();
