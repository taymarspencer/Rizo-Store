/*
  RIZO — art layers at runtime (pieces from snippets/rizo-art.liquid).

  Everything visual already works without this file: pieces are placed by
  CSS, float and sway are CSS animations. This adds what CSS can't do:

    depth    drifts with scroll. Behind the content it lags (farther away),
             in front it leads (closer). Written on the shared frame.
    shy      eases away from a mouse pointer, or from a finger that lands
             near it, then drifts back.
    settle   drops into place the first time it comes into view.
    wobble   rocks when touched or hovered; spin turns when tapped or clicked.

  Rules it keeps:
    - pieces never take a click or focus; touches are hit-tested from one
      passive listener, so a tap on a link under a piece still follows it
    - one requestAnimationFrame for the whole theme (window.RizoFrame), and
      only while something is actually moving
    - off-screen pieces are not measured, animated or painted to
    - reduced motion: nothing moves; Calm motion halves every movement;
      low-power devices skip depth and shy
    - theme editor: re-scans on section load, forgets on unload, and a
      selected piece holds still so it can be placed exactly

  Custom interactions: every piece has id="Art-<block id>" and, when named
  in the editor, data-art="<name>". Listen for `rizo:art` on document
  ({ detail: { piece, kind } }, kind = 'touch' | 'enter' | 'appear').
*/
(() => {
  'use strict';

  // Placement is pure CSS; without these APIs the art simply holds still.
  if (window.RizoArt || !('IntersectionObserver' in window)) return;
  const doc = document;
  const root = doc.documentElement;
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const phoneQuery = window.matchMedia('(max-width: 749px)');
  const frame = (fn) => (window.RizoFrame ? window.RizoFrame.request(fn) : window.requestAnimationFrame(fn));
  const reduced = () => reducedQuery.matches;
  const lowPower = () => root.dataset.lowPower === 'true';
  const calm = () => (root.dataset.motion === 'calm' ? .5 : 1);
  const JS_MOTION = ['depth', 'shy', 'settle', 'wobble', 'spin'];

  const pieces = new Map();   // element → record
  let scheduled = null;
  let pointer = null;         // { x, y, time, touch }

  const layerFront = (piece) => {
    const layer = piece.dataset.layer;
    if (layer === 'front') return true;
    if (layer === 'back-front') return phoneQuery.matches;
    if (layer === 'front-back') return !phoneQuery.matches;
    return false;
  };

  const emit = (piece, kind) => doc.dispatchEvent(new CustomEvent('rizo:art', { detail: { piece, kind, name: piece.dataset.art || null } }));

  /* Where a piece's centre sits in the document, measured without its
     movement (movement lives on the child). Re-measured on resize, when it
     comes near the screen and after the page's images have loaded. */
  const measure = (record) => {
    const rect = record.piece.getBoundingClientRect();
    record.center = rect.top + window.scrollY + rect.height / 2;
    record.radius = Math.max(90, Math.max(rect.width, rect.height) * .7);
  };

  /* ---------------------------------------------------------------- */
  /* Frame: one pass moves every visible depth/shy piece               */
  /* ---------------------------------------------------------------- */

  const request = () => { if (!scheduled) scheduled = frame(tick); };
  const tick = () => {
    scheduled = null;
    if (reduced() || doc.hidden) return;
    const vh = window.innerHeight;
    const mid = window.scrollY + vh / 2;
    const now = performance.now();
    let moving = false;
    pieces.forEach((record) => {
      if (!record.visible || record.selected) return;
      const k = record.strength * calm();
      let tx = 0;
      let ty = 0;
      if (record.motion === 'depth') {
        const factor = (layerFront(record.piece) ? .22 : -.28) * k;
        ty = (record.center - mid) * factor;
        ty = Math.max(-vh * .45, Math.min(vh * .45, ty));
      } else if (record.motion === 'shy') {
        const fingerDown = pointer && pointer.touch && now - pointer.time < 900;
        if (fingerDown) moving = true; // keep going so it drifts back after
        if (pointer && (!pointer.touch || fingerDown)) {
          const rect = record.piece.getBoundingClientRect();
          const dx = rect.left + rect.width / 2 - pointer.x;
          const dy = rect.top + rect.height / 2 - pointer.y;
          const distance = Math.hypot(dx, dy) || 1;
          const reach = record.radius * 1.6;
          if (distance < reach) {
            const push = (1 - distance / reach) * 70 * k;
            tx = (dx / distance) * push;
            ty = (dy / distance) * push;
          }
        }
        // Ease toward the target: quick away, slow back.
        const ease = Math.hypot(tx, ty) > Math.hypot(record.x, record.y) ? .22 : .06;
        tx = record.x + (tx - record.x) * ease;
        ty = record.y + (ty - record.y) * ease;
        if (Math.abs(tx - record.x) > .05 || Math.abs(ty - record.y) > .05) moving = true;
      }
      if (Math.abs(tx - record.x) < .01 && Math.abs(ty - record.y) < .01) return;
      record.x = tx;
      record.y = ty;
      record.move.style.translate = `${tx.toFixed(1)}px ${ty.toFixed(1)}px`;
    });
    if (moving) request();
  };

  /* ---------------------------------------------------------------- */
  /* Touch and hover: hit-tested, never intercepted                     */
  /* ---------------------------------------------------------------- */

  const hit = (record, x, y, slack) => {
    const rect = record.piece.getBoundingClientRect();
    return x >= rect.left - slack && x <= rect.right + slack && y >= rect.top - slack && y <= rect.bottom + slack;
  };

  const react = (record, kind) => {
    const { move, motion } = record;
    if (reduced() || record.selected || !move.animate || record.busy) return;
    const k = Math.max(.2, record.strength) * calm();
    let keyframes;
    let options;
    if (motion === 'wobble') {
      keyframes = [{ rotate: '0deg' }, { rotate: `${14 * k}deg` }, { rotate: `${-10 * k}deg` }, { rotate: `${6 * k}deg` }, { rotate: `${-3 * k}deg` }, { rotate: '0deg' }];
      options = { duration: 950, easing: 'ease-out' };
    } else if (motion === 'spin') {
      keyframes = [{ rotate: '0deg' }, { rotate: `${Math.round(360 * Math.max(1, Math.round(k * 2)))}deg` }];
      options = { duration: 1100 + 500 * k, easing: 'cubic-bezier(.55, 0, .2, 1)' };
    } else return;
    record.busy = true;
    const animation = move.animate(keyframes, options);
    animation.onfinish = animation.oncancel = () => { record.busy = false; };
    emit(record.piece, kind);
  };

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const touch = event.pointerType !== 'mouse';
    pointer = { x: event.clientX, y: event.clientY, time: performance.now(), touch };
    let shy = false;
    pieces.forEach((record) => {
      if (!record.visible) return;
      if (record.motion === 'shy') shy = true;
      else if ((record.motion === 'wobble' || record.motion === 'spin') && hit(record, event.clientX, event.clientY, touch ? 16 : 0)) react(record, 'touch');
    });
    if (shy) request();
  };

  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse') return; // fingers are handled on touch-down
    pointer = { x: event.clientX, y: event.clientY, time: performance.now(), touch: false };
    let shy = false;
    pieces.forEach((record) => {
      if (!record.visible) return;
      if (record.motion === 'shy') shy = true;
      else if (record.motion === 'wobble') { // a spin waits for a click or tap
        const inside = hit(record, event.clientX, event.clientY, 0);
        if (inside && !record.inside) react(record, 'enter');
        record.inside = inside;
      }
    });
    if (shy) request();
  };

  const onPointerLeave = () => { pointer = null; request(); };
  const onScroll = () => { if (depthVisible) request(); };

  /* ---------------------------------------------------------------- */
  /* Visibility                                                         */
  /* ---------------------------------------------------------------- */

  let depthVisible = 0;
  const countDepth = () => {
    depthVisible = 0;
    pieces.forEach((record) => { if (record.visible && record.motion === 'depth') depthVisible += 1; });
  };

  const near = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const record = pieces.get(entry.target);
      if (!record) return;
      record.visible = entry.isIntersecting;
      entry.target.classList.toggle('is-off', !entry.isIntersecting);
      if (entry.isIntersecting) measure(record);
    });
    countDepth();
    request();
  }, { rootMargin: '160px 0px' });

  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      seen.unobserve(entry.target);
      emit(entry.target, 'appear');
    });
  }, { threshold: .2 });

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                          */
  /* ---------------------------------------------------------------- */

  const add = (piece) => {
    if (pieces.has(piece)) return;
    const move = piece.querySelector('.art-move');
    if (!move) return;
    let motion = piece.dataset.motion || 'none';
    if ((motion === 'depth' || motion === 'shy') && lowPower()) motion = 'none';
    const strength = Number.parseFloat(piece.style.getPropertyValue('--k'));
    const record = { piece, move, motion, strength: Number.isFinite(strength) ? strength : .5, visible: false, x: 0, y: 0, center: 0, radius: 90 };
    pieces.set(piece, record);
    near.observe(piece);
    if (motion === 'settle') seen.observe(piece);
  };

  const remove = (piece) => {
    near.unobserve(piece);
    seen.unobserve(piece);
    pieces.delete(piece);
  };

  let bound = false;
  const bind = () => {
    const needed = [...pieces.values()].some((record) => JS_MOTION.includes(record.motion));
    if (needed === bound) return;
    bound = needed;
    const method = needed ? 'addEventListener' : 'removeEventListener';
    doc[method]('pointerdown', onPointerDown, { passive: true, capture: true });
    doc[method]('pointermove', onPointerMove, { passive: true });
    doc.documentElement[method]('pointerleave', onPointerLeave, { passive: true });
    window[method]('scroll', onScroll, { passive: true });
  };

  const mount = (container = doc) => {
    container.querySelectorAll('.art-piece').forEach(add);
    bind();
  };
  const unmount = (container) => {
    pieces.forEach((record, piece) => { if (!piece.isConnected || container.contains(piece)) remove(piece); });
    countDepth();
    bind();
  };

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { pieces.forEach((record) => { if (record.visible) measure(record); }); request(); }, 120);
  };

  const onReducedChange = () => {
    pieces.forEach((record) => { record.x = 0; record.y = 0; record.move.style.translate = ''; });
    request();
  };

  /* Theme editor: a selected piece holds still at its real position. */
  const select = (event, selected) => {
    const piece = event.target.closest?.('.art-piece');
    const record = piece && pieces.get(piece);
    if (!record) return;
    record.selected = selected;
    piece.classList.toggle('is-selected', selected);
    if (selected) { record.x = 0; record.y = 0; record.move.style.translate = ''; piece.classList.add('is-in'); }
    else request();
  };

  const start = () => {
    mount(doc);
    root.classList.add('rizo-art-ready');
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('load', onResize, { once: true });
    phoneQuery.addEventListener?.('change', onResize);
    reducedQuery.addEventListener?.('change', onReducedChange);
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) request(); });
    doc.addEventListener('shopify:section:load', (event) => mount(event.target));
    doc.addEventListener('shopify:section:unload', (event) => unmount(event.target));
    doc.addEventListener('shopify:block:select', (event) => select(event, true));
    doc.addEventListener('shopify:block:deselect', (event) => select(event, false));
  };

  window.RizoArt = {
    mount,
    unmount,
    stats: () => ({
      pieces: pieces.size,
      visible: [...pieces.values()].filter((record) => record.visible).length,
      moving: [...pieces.values()].filter((record) => record.x || record.y).length,
      listening: bound
    })
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
