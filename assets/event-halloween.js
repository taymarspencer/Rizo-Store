/*
  HALLOWEEN 2026 — bat flight for the Rizo Event Layer flock

  The only file that knows how bats move. The generic flock module
  (assets/rizo-event-flock.js) owns pooling, limits, timing, input and
  rendering; this file answers "where does a bat go next".

  Flight model: each bat steers toward waypoints along a loose route
  (enter off-screen → cross → exit off-screen) with its own speed, turn rate,
  flutter and small random heading kicks, so a group reads as bats and not
  as a synchronised formation. Variation is bounded so it never turns into
  noise.

  Tuning: the numbers in TUNING below are the character of the flight.
*/
(() => {
  'use strict';

  const layer = window.RizoEventLayer;
  if (!layer) return;

  const { clamp } = layer;
  const TAU = Math.PI * 2;

  const TUNING = {
    speed: [150, 330],        // px/s base cruise, scaled by viewport width
    groupWeights: [.34, .32, .24, .1], // chance of 1, 2, 3, 4 bats per idle flight
    spacing: [26, 56],        // px between group members
    memberDelay: [.12, .45],  // s between group members entering
    flutter: [.16, .38],      // perpendicular wobble (fraction of heading)
    flutterRate: [6.5, 12],   // rad/s
    turn: [2.4, 4],           // how quickly a bat corrects toward its route
    jitter: [.45, .95],       // size of the occasional sharp heading kick
    flap: [.14, .26],         // s per wing beat (half cycle)
    depth: [.62, 1.12],       // scale / opacity / parallax
    scatterForce: 820,
    scrollPush: .55,
    bank: 14                  // max lean in degrees
  };

  const between = ([min, max], r) => min + (max - min) * r;

  const exitPoint = (x, y, dx, dy, env) => {
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const tx = ux > 0 ? (env.width + 140 - x) / ux : ux < 0 ? (-140 - x) / ux : Infinity;
    const ty = uy > 0 ? (env.height + 140 - y) / uy : uy < 0 ? (-140 - y) / uy : Infinity;
    const t = Math.min(tx, ty);
    return { x: x + ux * t, y: y + uy * t };
  };

  const groupSize = (r) => {
    let total = 0;
    for (let index = 0; index < TUNING.groupWeights.length; index += 1) {
      total += TUNING.groupWeights[index];
      if (r < total) return index + 1;
    }
    return 1;
  };

  /* One bat's flight spec. The flock copies x/y/depth/scale/flap; init()
     stores the rest on the flyer. */
  const bat = (env, start, route, index, options = {}) => {
    const r = env.random;
    const depth = between(TUNING.depth, r());
    const spread = index ? between(TUNING.spacing, r()) : 0;
    const offsetX = (r() - .5) * spread * 2;
    const offsetY = (r() - .5) * spread;
    const heading = Math.sign(route[route.length - 1].x - start.x) || 1;
    const cruise = clamp(env.width * .21, TUNING.speed[0], TUNING.speed[1]);
    return {
      x: start.x + offsetX - index * 20 * heading,
      y: start.y + offsetY,
      delay: options.delay ?? (index ? between(TUNING.memberDelay, r()) * index : 0),
      depth,
      scale: options.grow ? depth * .3 : depth,
      flap: between(TUNING.flap, r()) * (options.frantic ? .75 : 1),
      maxAge: options.maxAge || 16,
      flight: {
        route: route.map((point) => ({ x: point.x + offsetX * 1.4, y: point.y + offsetY * 1.4 })),
        leg: 0,
        speed: cruise * (.55 + env.motion * .75) * (options.speed || 1) * (.85 + r() * .3) * (.8 + depth * .3),
        boost: options.boost || 1,
        turn: between(TUNING.turn, r()) * (options.frantic ? 1.8 : 1),
        arrive: 64,
        flutter: between(TUNING.flutter, r()),
        flutterRate: between(TUNING.flutterRate, r()),
        phase: r() * TAU,
        jitter: between(TUNING.jitter, r()),
        jitterIn: r() * .5,
        kick: 0,
        bob: 8 + r() * 14,
        grow: Boolean(options.grow),
        depth
      }
    };
  };

  layer.defineBehavior('bats', {
    /* A quiet crossing: 1–4 bats, upper part of the screen, off-screen to off-screen. */
    idle(env) {
      const r = env.random;
      const band = env.quiet ? [.05, .22] : env.heroVisible ? [.08, .5] : [.07, .4];
      const leftToRight = r() < .5;
      const y0 = env.height * between(band, r());
      const y1 = env.height * between(band, r());
      const start = { x: leftToRight ? -70 : env.width + 70, y: y0 };
      const end = { x: leftToRight ? env.width + 110 : -110, y: y1 };
      const via = { x: env.width * (.3 + r() * .4), y: (y0 + y1) / 2 + env.height * (r() - .5) * .22 };
      const count = env.quiet ? 1 + (r() < .3 ? 1 : 0) : groupSize(r());
      return Array.from({ length: count }, (_, index) => bat(env, start, [via, end], index));
    },

    /* Fast scrolling stirs a small group; they climb when the page moves down
       and drop in from above when it moves up. */
    wake(env, velocity, count) {
      const r = env.random;
      const down = velocity > 0;
      const fromLeft = r() < .5;
      const start = { x: fromLeft ? -60 : env.width + 60, y: env.height * (down ? .5 + r() * .3 : .04 + r() * .18) };
      const via = { x: env.width * (fromLeft ? .35 + r() * .2 : .45 + r() * .2), y: env.height * (down ? .25 + r() * .2 : .3 + r() * .2) };
      const end = { x: fromLeft ? env.width + 120 : -120, y: down ? -120 : env.height * (.2 + r() * .3) };
      const n = count || (env.quiet ? 1 : 2 + (r() < .45 ? 1 : 0));
      const speed = 1.2 + Math.min(.6, Math.abs(velocity) / 4000);
      return Array.from({ length: n }, (_, index) => bat(env, start, [via, end], index, { speed, delay: index * between([.06, .2], r()) }));
    },

    /* A tap in open space flushes one or two bats out of hiding, away and up. */
    startle(env, tap) {
      const r = env.random;
      const n = 1 + (r() < .45 ? 1 : 0);
      return Array.from({ length: n }, (_, index) => {
        const angle = -Math.PI / 2 + (r() - .5) * 1.8 + (index ? (r() < .5 ? -.6 : .6) : 0);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const origin = { x: tap.x + (r() - .5) * 18, y: tap.y + (r() - .5) * 12 };
        const route = [{ x: origin.x + dx * 150, y: origin.y + dy * 150 }, exitPoint(origin.x, origin.y, dx, dy, env)];
        return bat(env, origin, route, 0, { speed: 1.6, boost: 1.5, grow: true, frantic: true, delay: index * .09, maxAge: 8 });
      });
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
      const target = m.route[m.leg];
      const dx = target.x - flyer.x;
      const dy = target.y - flyer.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < m.arrive && m.leg < m.route.length - 1) m.leg += 1;
      const ux = dx / distance;
      const uy = dy / distance;

      m.phase += dt * m.flutterRate;
      m.jitterIn -= dt;
      if (m.jitterIn <= 0) {
        m.jitterIn = .22 + env.random() * .55;
        m.kick = (env.random() - .5) * m.jitter;
      }
      m.kick *= Math.exp(-dt * 4);

      const sway = Math.sin(m.phase) * m.flutter + m.kick;
      const speed = m.speed * m.boost;
      const desiredX = (ux - uy * sway) * speed;
      const desiredY = (uy + ux * sway) * speed + Math.sin(m.phase * .5) * m.bob;
      const turn = Math.min(1, dt * m.turn);
      flyer.vx += (desiredX - flyer.vx) * turn;
      flyer.vy += (desiredY - flyer.vy) * turn;
      flyer.x += flyer.vx * dt;
      flyer.y += flyer.vy * dt;
      m.boost = 1 + (m.boost - 1) * Math.exp(-dt * 1.3);

      if (m.grow) {
        flyer.scale = Math.min(m.depth, flyer.scale + dt * m.depth * 3.2);
        if (flyer.scale >= m.depth) m.grow = false;
      }
      const reference = Math.max(speed, 1);
      flyer.rotation = clamp((flyer.vx / reference) * TUNING.bank + (flyer.vy / reference) * 6, -TUNING.bank - 6, TUNING.bank + 6);
    },

    /* Scrolling pushes bats with the page, nearer bats more (loose, not 1:1). */
    scroll(flyer, velocity, dt) {
      const m = flyer.motion;
      if (!m) return;
      flyer.vy -= clamp(velocity, -2600, 2600) * TUNING.scrollPush * m.depth * dt;
      m.boost = Math.max(m.boost, 1 + Math.min(.5, Math.abs(velocity) / 3200));
    },

    /* A nearby tap: burst away from the point, then leave the screen. */
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
      m.route = [{ x: flyer.x + ux * 170, y: flyer.y + uy * 170 - 50 }, exitPoint(flyer.x, flyer.y, ux, uy - .3, env)];
      m.leg = 0;
      flyer.maxAge = Math.min(flyer.maxAge, flyer.age + 6);
      return true;
    }
  });
})();
