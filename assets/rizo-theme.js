(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const $ = (selector, context = doc) => context.querySelector(selector);
  const $$ = (selector, context = doc) => Array.from(context.querySelectorAll(selector));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowPower = Boolean(
    connection?.saveData ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  );

  if (lowPower) root.dataset.lowPower = 'true';

  const shopRoot = window.Shopify?.routes?.root || '/';
  const shopRoute = (path) => `${shopRoot}${path}`.replace(/([^:]\/)\/+/, '$1');
  const currency = window.Shopify?.currency?.active || 'USD';
  const locale = root.lang || 'en-US';

  const money = (cents) => {
    const value = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
    } catch (_) {
      return `$${value.toFixed(2)}`;
    }
  };

  let toastTimer = 0;
  const toast = (message) => {
    const element = $('#RizoToast');
    if (!element || !message) return;
    element.textContent = message;
    element.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove('show'), 2600);
  };

  const updateLiveRegion = (selector, message) => {
    const region = $(selector);
    if (!region || !message) return;
    region.textContent = '';
    window.requestAnimationFrame(() => { region.textContent = message; });
  };
  const announce = (message) => updateLiveRegion('[data-rizo-live-region]', message);
  const announceError = (message) => updateLiveRegion('[data-rizo-alert-region]', message);

  let activeOverlay = null;

  /* Header measurement and lightweight scroll state */
  const measureHeader = () => {
    const header = $('[data-header-stack]');
    if (header) {
      const height = `${Math.ceil(header.getBoundingClientRect().height)}px`;
      root.style.setProperty('--header-stack-height', height);
      doc.body?.style.setProperty('--header-stack-height', height);
    }
    const dock = $('.mobile-dock');
    const dockVisible = dock && window.getComputedStyle(dock).display !== 'none';
    const dockHeight = dockVisible ? Math.ceil(dock.getBoundingClientRect().height) : 0;
    const dockSpace = dockVisible ? Math.ceil(window.innerHeight - dock.getBoundingClientRect().top) : 0;
    root.style.setProperty('--mobile-dock-height', `${dockHeight}px`);
    root.style.setProperty('--mobile-dock-space', `${dockSpace}px`);
  };

  let scrollTicking = false;
  const updateScrollState = () => {
    scrollTicking = false;
    const header = $('[data-header-stack]');
    if (header) {
      const shouldCompact = window.scrollY > 18;
      const changed = header.classList.contains('is-scrolled') !== shouldCompact;
      header.classList.toggle('is-scrolled', shouldCompact);
      if (changed) {
        measureHeader();
        window.setTimeout(measureHeader, reducedMotion ? 0 : 280);
      }
    }

    const parallax = $('[data-parallax]');
    if (parallax && !reducedMotion && root.dataset.motion !== 'calm' && !lowPower) {
      const y = Math.min(window.scrollY * .045, 42);
      parallax.style.setProperty('--parallax-y', `${y}px`);
    }
  };

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateScrollState);
  }, { passive: true });

  window.addEventListener('resize', measureHeader, { passive: true });
  window.visualViewport?.addEventListener('resize', measureHeader, { passive: true });
  window.addEventListener('load', measureHeader, { passive: true });
  window.addEventListener('pageshow', () => {
    doc.body.classList.remove('is-overlay-open', 'is-filter-open');
    $$('[data-overlay]').forEach((overlay) => {
      window.clearTimeout(overlay._closeTimer);
      overlay.classList.remove('is-open');
      overlay.hidden = true;
      setOverlayExpanded(overlay.dataset.overlay, false);
    });
    $$('[data-filter-form].is-open').forEach((filters) => {
      filters.classList.remove('is-open');
      filters.removeAttribute('role');
      filters.removeAttribute('aria-modal');
      filters.removeAttribute('aria-label');
    });
    $$('[data-filter-toggle][aria-expanded="true"]').forEach((toggle) => toggle.setAttribute('aria-expanded', 'false'));
    $$('.collection-filter-backdrop').forEach((backdrop) => { backdrop.hidden = true; });
    activeOverlay = null;
    window.requestAnimationFrame(measureHeader);
  }, { passive: true });

  /* Accessible overlay manager */

  const focusableElements = (container) => $$([
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(','), container).filter((element) => !element.hidden && element.offsetParent !== null && !element.matches('.overlay-backdrop'));

  const setOverlayExpanded = (name, expanded) => {
    if (!name) return;
    $$(`[data-overlay-open="${CSS.escape(name)}"]`).forEach((control) => {
      control.setAttribute('aria-expanded', String(expanded));
    });
  };

  const closeOverlay = (overlay = activeOverlay, restoreFocus = true, immediate = false) => {
    if (!overlay) return;
    window.clearTimeout(overlay._closeTimer);
    overlay.classList.remove('is-open');
    setOverlayExpanded(overlay.dataset.overlay, false);
    const returnFocus = overlay._returnFocus instanceof HTMLElement ? overlay._returnFocus : null;
    const finish = () => {
      overlay.hidden = true;
      if (activeOverlay === overlay) activeOverlay = null;
      if (!activeOverlay) doc.body.classList.remove('is-overlay-open');
      if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
    if (immediate || reducedMotion) {
      finish();
      return;
    }
    overlay._closeTimer = window.setTimeout(() => {
      finish();
    }, 360);
  };

  const openOverlay = (name, trigger = doc.activeElement) => {
    const overlay = document.querySelector(`[data-overlay="${CSS.escape(name)}"]`);
    if (!overlay) return;
    let returnFocus = trigger instanceof HTMLElement ? trigger : doc.activeElement;
    if (activeOverlay && activeOverlay !== overlay) {
      if (trigger instanceof HTMLElement && activeOverlay.contains(trigger) && activeOverlay._returnFocus instanceof HTMLElement) {
        returnFocus = activeOverlay._returnFocus;
      }
      closeOverlay(activeOverlay, false, true);
    }
    window.clearTimeout(overlay._closeTimer);

    overlay._returnFocus = returnFocus;
    setOverlayExpanded(name, true);
    activeOverlay = overlay;
    overlay.hidden = false;
    doc.body.classList.add('is-overlay-open');

    window.requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      const target = $('[data-overlay-focus]', overlay) || focusableElements(overlay)[0];
      window.setTimeout(() => target?.focus({ preventScroll: true }), reducedMotion ? 0 : 100);
    });

    if (name === 'cart') { renderCart(); emitRizoEvent('cart_drawer_opened', {}); }
  };

  doc.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-overlay-open]');
    if (opener) {
      event.preventDefault();
      openOverlay(opener.dataset.overlayOpen, opener);
      return;
    }

    const closer = event.target.closest('[data-overlay-close]');
    if (closer) {
      event.preventDefault();
      closeOverlay(closer.closest('[data-overlay]'));
      return;
    }

    const installOpener = event.target.closest('[data-install-open]');
    if (installOpener) {
      event.preventDefault();
      openOverlay('install', installOpener);
    }
  });

  doc.addEventListener('keydown', (event) => {
    if (!activeOverlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlay();
      return;
    }

    if (event.key !== 'Tab') return;
    const items = focusableElements(activeOverlay);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  doc.addEventListener('focusin', (event) => {
    if (!activeOverlay || activeOverlay.contains(event.target)) return;
    const target = $('[data-overlay-focus]', activeOverlay) || focusableElements(activeOverlay)[0];
    target?.focus({ preventScroll: true });
  });

  /* Optional sound: user-initiated, tiny Web Audio cues, never autoplayed */
  let audioContext = null;
  let soundOn = false;

  const tone = (frequency = 420, duration = .055) => {
    if (!soundOn) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.018, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  };

  doc.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-sound-toggle]');
    if (toggle) {
      soundOn = !soundOn;
      $$('[data-sound-toggle]').forEach((button) => {
        button.setAttribute('aria-pressed', String(soundOn));
        button.setAttribute('aria-label', soundOn ? 'Turn Rizo sounds off' : 'Turn Rizo sounds on');
      });
      if (soundOn) tone(540, .1);
      toast(soundOn ? 'Rizo sounds on' : 'Rizo sounds off');
      return;
    }

    if (!soundOn) return;
    const interactive = event.target.closest('a, button, summary');
    if (interactive) tone(interactive.matches('.button-hot, .product-submit') ? 610 : 350);
  });

  /* Cart drawer and progressive AJAX add */
  let cartRequestId = 0;
  let currentCartCount = Number($('[data-cart-count]')?.textContent || 0);

  const fetchCart = async () => {
    const response = await fetch(shopRoute('cart.js'), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Cart unavailable');
    return response.json();
  };

  const syncCartCount = (count) => {
    $$('[data-cart-count]').forEach((element) => {
      element.textContent = count;
    });
    $$('[data-overlay-open="cart"]').forEach((control) => {
      control.setAttribute('aria-label', `Open cart with ${count} items`);
    });
    if (count !== currentCartCount) {
      currentCartCount = count;
      updateLiveRegion('[data-cart-count-live]', `Cart now has ${count} ${count === 1 ? 'item' : 'items'}.`);
    }
  };

  const createIconButton = (label, symbol, className = '') => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.textContent = symbol;
    return button;
  };

  const renderCartLine = (item) => {
    const line = doc.createElement('article');
    line.className = 'drawer-line';

    const imageLink = doc.createElement('a');
    imageLink.href = item.url || '#';
    if (item.image) {
      const image = doc.createElement('img');
      image.src = item.image;
      image.alt = '';
      image.width = 164;
      image.height = 205;
      image.loading = 'lazy';
      imageLink.append(image);
    }

    const copy = doc.createElement('div');
    copy.className = 'drawer-line-copy';
    const titleLink = doc.createElement('a');
    titleLink.href = item.url || '#';
    const title = doc.createElement('strong');
    title.textContent = item.product_title || item.title || 'Rizo piece';
    titleLink.append(title);
    copy.append(titleLink);

    if (item.variant_title) {
      const variant = doc.createElement('small');
      variant.textContent = item.variant_title;
      copy.append(variant);
    }

    const price = doc.createElement('span');
    price.textContent = money(item.final_line_price);
    copy.append(price);

    const quantity = doc.createElement('div');
    quantity.className = 'drawer-quantity';
    const minus = createIconButton(`Decrease ${item.product_title} quantity`, '−');
    minus.dataset.cartChange = item.key;
    minus.dataset.quantity = Math.max(0, item.quantity - 1);
    const amount = doc.createElement('span');
    amount.textContent = item.quantity;
    const plus = createIconButton(`Increase ${item.product_title} quantity`, '+');
    plus.dataset.cartChange = item.key;
    plus.dataset.quantity = item.quantity + 1;
    quantity.append(minus, amount, plus);
    copy.append(quantity);

    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'drawer-line-remove';
    remove.textContent = 'Remove';
    remove.dataset.cartChange = item.key;
    remove.dataset.quantity = '0';

    line.append(imageLink, copy, remove);
    return line;
  };

  const updateCartChrome = (cart) => {
    const shell = $('[data-cart-shell]');
    if (!shell) return;
    shell.classList.toggle('is-empty', cart.item_count === 0);
    const headingCount = $('[data-cart-count-heading]', shell);
    if (headingCount) headingCount.textContent = cart.item_count ? `(${cart.item_count})` : '';
    const signal = $('[data-cart-signal-copy]', shell);
    if (signal) signal.textContent = cart.item_count
      ? `${cart.item_count} ${cart.item_count === 1 ? 'piece is' : 'pieces are'} in your world. Check size and quantity before checkout.`
      : 'The bag is quiet. The live pieces are one tap away.';

    const threshold = Number(shell.dataset.freeShippingThreshold || 0);
    const progress = $('[data-shipping-progress]', shell);
    if (!progress || threshold <= 0 || cart.item_count === 0) {
      if (progress) progress.hidden = true;
      return;
    }

    progress.hidden = false;
    const remaining = Math.max(0, threshold - cart.total_price);
    const percent = Math.max(0, Math.min(100, Math.round((cart.total_price / threshold) * 100)));
    const copy = $('[data-shipping-copy]', progress);
    const percentLabel = $('[data-shipping-percent]', progress);
    const bar = $('[data-shipping-bar]', progress);
    if (copy) copy.textContent = remaining > 0 ? `${money(remaining)} away from free shipping` : 'Free shipping unlocked';
    if (percentLabel) percentLabel.textContent = `${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
  };

  const renderCart = async () => {
    const lines = $('[data-cart-lines]');
    if (!lines) return;
    const requestId = ++cartRequestId;
    lines.setAttribute('aria-busy', 'true');

    try {
      const cart = await fetchCart();
      if (requestId !== cartRequestId) return;
      syncCartCount(cart.item_count);
      updateCartChrome(cart);
      const total = $('[data-cart-total]');
      if (total) total.textContent = money(cart.total_price);
      lines.replaceChildren();

      if (!cart.items.length) {
        const empty = doc.createElement('div');
        empty.className = 'drawer-empty';
        const heading = doc.createElement('h3');
        heading.textContent = 'The bag is quiet.';
        const message = doc.createElement('p');
        message.textContent = 'The current signal is still live. Start with the pieces available now.';
        const link = doc.createElement('a');
        link.className = 'button button-hot button-full';
        link.href = shopRoute('collections/all');
        link.textContent = 'Enter the shop';
        empty.append(heading, message, link);
        lines.append(empty);
        return cart;
      }

      cart.items.forEach((item) => lines.append(renderCartLine(item)));
      return cart;
    } catch (_) {
      const error = doc.createElement('div');
      error.className = 'drawer-empty';
      const heading = doc.createElement('h3');
      heading.textContent = 'The cart signal dropped.';
      const copy = doc.createElement('p');
      copy.textContent = 'Open the full cart to continue without losing your items.';
      error.append(heading, copy);
      lines.replaceChildren(error);
      return null;
    } finally {
      lines.setAttribute('aria-busy', 'false');
    }
  };

  const changeCart = async (key, quantity, button) => {
    if (!key) return;
    if (button) button.disabled = true;
    try {
      const response = await fetch(shopRoute('cart/change.js'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: key, quantity: Number(quantity) })
      });
      if (!response.ok) throw new Error('Cart update failed');
      await renderCart();
    } catch (_) {
      toast('Your cart could not update. Try again.');
      announceError('Your cart could not update. Try again.');
      if (button) button.disabled = false;
    }
  };

  doc.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-change]');
    if (!button) return;
    changeCart(button.dataset.cartChange, button.dataset.quantity, button);
  });

  doc.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-ajax-product-form]');
    if (!form || !window.fetch || event.defaultPrevented) return;
    event.preventDefault();

    const button = $('button[type="submit"]', form);
    const label = button ? $('[data-product-submit-label]', button) : null;
    const original = label?.textContent || button?.textContent || '';
    const originalHTML = button?.innerHTML || '';
    const formError = $('[data-quick-add-error], [data-variant-error]', form);
    if (formError) { formError.hidden = true; formError.textContent = ''; }
    if (button) button.disabled = true;
    if (label) label.textContent = 'Opening portal…';
    else if (button) button.textContent = 'Opening portal…';

    try {
      const response = await fetch(shopRoute('cart/add.js'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        body: new FormData(form)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.description || 'That piece could not be added.');
      }

      const addedItem = await response.json().catch(() => ({}));
      emitRizoEvent('add_to_cart', {
        product_id: addedItem.product_id || '',
        variant_id: addedItem.variant_id || addedItem.id || '',
        quantity: addedItem.quantity || Number(new FormData(form).get('quantity') || 1),
        source: form.closest('[data-quick-add-form]') ? 'quick_add' : 'product_form'
      });
      doc.body.classList.remove('rizo-celebrating');
      void doc.body.offsetWidth;
      doc.body.classList.add('rizo-celebrating');
      window.setTimeout(() => doc.body.classList.remove('rizo-celebrating'), 900);
      openOverlay('cart', button || form);
      toast(addedItem.product_title ? `${addedItem.product_title} entered your cart` : 'Added to your cart');
    } catch (error) {
      const message = error.message || 'That piece could not be added. Try again.';
      if (formError) {
        formError.textContent = message;
        formError.hidden = false;
      }
      toast(message);
      announceError(message);
    } finally {
      if (button) button.disabled = false;
      if (label) label.textContent = original;
      else if (button) button.innerHTML = originalHTML || original;
    }
  });

  doc.addEventListener('click', (event) => {
    const stepper = event.target.closest('[data-quantity-step]');
    if (!stepper) return;
    const control = stepper.closest('.quantity-control');
    const input = $('input[type="number"]', control);
    if (!input) return;
    const min = Number(input.min || 1);
    const max = input.max ? Number(input.max) : Infinity;
    const next = Math.max(min, Math.min(max, Number(input.value || min) + Number(stepper.dataset.quantityStep || 0)));
    input.value = next;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* Countdown, paused when no longer useful */
  const initCountdowns = (container = doc) => {
    $$('[data-countdown-root]:not([data-initialized])', container).forEach((countdown) => {
      countdown.dataset.initialized = 'true';
      if (!countdown.dataset.countdown) return;
      const target = Date.parse(countdown.dataset.countdown);
      if (Number.isNaN(target)) return;
      const display = $('[data-countdown-display]', countdown);
      const live = $('[data-countdown-live]', countdown);
      const fields = [
        $('[data-days]', countdown),
        $('[data-hours]', countdown),
        $('[data-minutes]', countdown),
        $('[data-seconds]', countdown)
      ];
      let timer = 0;

      const update = () => {
        let remaining = Math.max(0, target - Date.now());
        if (remaining <= 0) {
          if (display) display.hidden = true;
          if (live) live.hidden = false;
          window.clearInterval(timer);
          timer = 0;
          return;
        }

        const values = [
          Math.floor(remaining / 86400000),
          Math.floor((remaining % 86400000) / 3600000),
          Math.floor((remaining % 3600000) / 60000),
          Math.floor((remaining % 60000) / 1000)
        ];
        fields.forEach((field, index) => {
          if (field) field.textContent = String(values[index]).padStart(2, '0');
        });
      };

      const start = () => {
        if (timer || doc.hidden) return;
        update();
        timer = window.setInterval(update, 1000);
        countdown._countdownTimer = timer;
      };
      const stop = () => {
        window.clearInterval(timer);
        timer = 0;
        countdown._countdownTimer = 0;
      };
      const handleVisibility = () => doc.hidden ? stop() : start();
      countdown._countdownVisibilityHandler = handleVisibility;
      doc.addEventListener('visibilitychange', handleVisibility);
      start();
    });
  };

  /* Hero character and capability-scaled heat field */
  const makeFlameSprite = (size = 128) => {
    const canvas = doc.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,240,120,.9)');
    gradient.addColorStop(.24, 'rgba(255,137,45,.72)');
    gradient.addColorStop(.6, 'rgba(255,62,15,.28)');
    gradient.addColorStop(1, 'rgba(255,40,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return canvas;
  };

  const initHero = (container = doc) => {
    $$('[data-rizo-hero]:not([data-initialized])', container).forEach((hero) => {
      hero.dataset.initialized = 'true';
      const character = $('[data-rizo-character]', hero);
      let taps = 0;
      let reactionTimer = 0;
      let shiftTimer = 0;

      character?.addEventListener('click', () => {
        taps += 1;
        const tilt = taps % 2 ? '-5deg' : '5deg';
        character.style.setProperty('--rizo-tilt', tilt);
        character.classList.remove('is-reacting');
        void character.offsetWidth;
        character.classList.add('is-reacting');
        window.clearTimeout(reactionTimer);
        reactionTimer = window.setTimeout(() => character.classList.remove('is-reacting'), 700);
        tone(480 + (taps % 4) * 45, .07);

        if (character.dataset.cycle === 'true' && taps % 3 === 0) {
          const image = $('img', character);
          const states = ['classic', 'ember', 'shadow'];
          const nextState = states[(Math.floor(taps / 3)) % states.length];
          const nextSource = character.dataset[nextState];
          if (image && nextSource) {
            character.classList.add('is-shifting');
            window.clearTimeout(shiftTimer);
            shiftTimer = window.setTimeout(() => {
              image.src = nextSource;
              image.removeAttribute('srcset');
              character.classList.remove('is-shifting');
              toast(`Rizo shifted: ${nextState}`);
            }, 190);
          }
        }
      });

      const canvas = $('canvas', hero);
      const intensity = Math.max(0, Math.min(1, Number(hero.dataset.intensity || 60) / 100));
      if (!canvas || intensity === 0 || reducedMotion || lowPower || root.dataset.motion === 'calm') return;

      const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
      if (!context) return;
      const sprite = makeFlameSprite();
      const particles = [];
      const expressive = root.dataset.motion === 'expressive';
      const maxParticles = Math.round((expressive ? 150 : 105) * (.55 + intensity * .45));
      let width = 0;
      let height = 0;
      let dpr = 1;
      let animationFrame = 0;
      let visible = false;
      let inViewport = false;
      let pageVisible = !doc.hidden;
      let lastTime = 0;
      let spawnCarry = 0;
      let wind = 0;
      let lastScroll = window.scrollY;

      const resize = () => {
        const bounds = hero.getBoundingClientRect();
        width = Math.max(1, bounds.width);
        height = Math.max(1, bounds.height);
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      const spawn = (x = Math.random() * width, y = height + 20) => {
        if (particles.length >= maxParticles) return;
        particles.push({
          x,
          y,
          vx: (Math.random() - .5) * .36 + wind * .1,
          vy: -(.85 + Math.random() * 1.5),
          size: 36 + Math.random() * 72,
          life: .55 + Math.random() * .45,
          decay: .0048 + Math.random() * .004,
          wobble: Math.random() * Math.PI * 2
        });
      };

      const coolArea = (x, y, radius = 130) => {
        const radiusSquared = radius * radius;
        particles.forEach((particle) => {
          const dx = particle.x - x;
          const dy = particle.y - y;
          if ((dx * dx) + (dy * dy) < radiusSquared) particle.life *= .18;
        });
      };

      const frame = (time) => {
        if (!visible) return;
        const delta = Math.min(2, Math.max(.35, (time - (lastTime || time)) / 16.667));
        lastTime = time;
        context.clearRect(0, 0, width, height);

        spawnCarry += (.42 + intensity * .78) * delta;
        while (spawnCarry >= 1) {
          spawn();
          spawnCarry -= 1;
        }

        for (let index = particles.length - 1; index >= 0; index -= 1) {
          const particle = particles[index];
          particle.wobble += .028 * delta;
          particle.x += (particle.vx + Math.sin(particle.wobble) * .12 + wind * .03) * delta;
          particle.y += particle.vy * delta;
          particle.life -= particle.decay * delta;
          particle.size *= Math.pow(.997, delta);

          if (particle.life <= 0 || particle.y < -particle.size) {
            particles.splice(index, 1);
            continue;
          }

          context.globalAlpha = Math.max(0, Math.min(.72, particle.life * .72));
          context.drawImage(sprite, particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        }

        context.globalAlpha = 1;
        wind *= .94;
        animationFrame = window.requestAnimationFrame(frame);
      };

      const start = () => {
        if (visible || !inViewport || !pageVisible) return;
        visible = true;
        lastTime = 0;
        animationFrame = window.requestAnimationFrame(frame);
      };

      const stop = () => {
        visible = false;
        window.cancelAnimationFrame(animationFrame);
      };

      const syncAnimation = () => inViewport && pageVisible ? start() : stop();

      hero.addEventListener('pointerdown', (event) => {
        const bounds = hero.getBoundingClientRect();
        coolArea(event.clientX - bounds.left, event.clientY - bounds.top, 150);
      }, { passive: true });

      hero.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'mouse' && event.buttons === 0) return;
        const bounds = hero.getBoundingClientRect();
        coolArea(event.clientX - bounds.left, event.clientY - bounds.top, 110);
      }, { passive: true });

      const handleScroll = () => {
        const current = window.scrollY;
        wind = Math.max(-2.2, Math.min(2.2, (current - lastScroll) * .045));
        lastScroll = current;
      };
      hero._rizoHeroScrollHandler = handleScroll;
      window.addEventListener('scroll', handleScroll, { passive: true });

      if ('ResizeObserver' in window) {
        hero._rizoHeroResizeObserver = new ResizeObserver(resize);
        hero._rizoHeroResizeObserver.observe(hero);
      } else {
        hero._rizoHeroResizeHandler = resize;
        window.addEventListener('resize', resize, { passive: true });
      }
      resize();

      const handleVisibility = () => {
        pageVisible = !doc.hidden;
        syncAnimation();
      };
      hero._rizoHeroVisibilityHandler = handleVisibility;
      doc.addEventListener('visibilitychange', handleVisibility);

      if ('IntersectionObserver' in window) {
        hero._rizoHeroObserver = new IntersectionObserver(([entry]) => {
          inViewport = entry.isIntersecting;
          syncAnimation();
        }, { rootMargin: '100px' });
        hero._rizoHeroObserver.observe(hero);
      } else {
        inViewport = true;
        syncAnimation();
      }
    });
  };

  /* Small, pointer-only card depth */
  const initTilt = (container = doc) => {
    if (!finePointer || reducedMotion || lowPower || root.dataset.motion === 'calm') return;
    $$('[data-tilt]:not([data-initialized])', container).forEach((card) => {
      card.dataset.initialized = 'true';
      card.addEventListener('pointermove', (event) => {
        const bounds = card.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - .5;
        const y = (event.clientY - bounds.top) / bounds.height - .5;
        card.style.setProperty('--tilt-x', `${(-y * 3.2).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(x * 3.2).toFixed(2)}deg`);
      }, { passive: true });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    });
  };

  /* Collection controls */
  doc.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-filter-toggle]');
    if (toggle) {
      const filters = $(`#${CSS.escape(toggle.getAttribute('aria-controls'))}`);
      const open = !filters?.classList.contains('is-open');
      filters?.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      return;
    }

    const lostRizo = event.target.closest('[data-lost-rizo]');
    if (lostRizo) {
      lostRizo.classList.toggle('is-awake');
      toast(lostRizo.classList.contains('is-awake') ? 'Archive fragment recovered.' : 'Signal tucked back into the archive.');
    }
  });

  doc.addEventListener('change', (event) => {
    const sort = event.target.closest('[data-sort-select]');
    if (!sort) return;
    const url = new URL(window.location.href);
    url.searchParams.set('sort_by', sort.value);
    window.location.assign(url.toString());
  });

  /* Install prompt: native where supported, honest instructions elsewhere */
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const button = $('[data-install-action]');
    if (button) button.textContent = 'Install Rizo';
  });

  const configureInstallGuide = () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const iosSteps = $('[data-ios-steps]');
    const browserSteps = $('[data-browser-steps]');
    if (iosSteps) iosSteps.hidden = !ios;
    if (browserSteps) browserSteps.hidden = ios;
  };

  doc.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-install-action]');
    if (!action) return;
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
    }
    closeOverlay(action.closest('[data-overlay]'));
  });



  const initSignalGuides = (container = doc) => {
    $$('[data-signal-guide]', container).forEach((guide) => {
      if (guide.dataset.initialized === 'true') return;
      guide.dataset.initialized = 'true';

      const buttons = $$('[data-signal-choice]', guide);
      const output = $('[data-signal-guide-output]', guide);
      const kicker = $('.signal-guide-kicker', guide);
      const title = $('h4', output);
      const body = $('p:last-of-type', output);
      const link = $('[data-signal-guide-link]', guide);
      const copy = $('[data-signal-guide-copy]', guide);
      let activeShare = '';

      const activate = (button) => {
        buttons.forEach((item) => item.classList.toggle('is-active', item === button));
        const nextKicker = button.dataset.guideKicker || 'RIZO SIGNAL';
        const nextTitle = button.dataset.guideTitle || 'Choose a direction.';
        const nextText = button.dataset.guideText || 'The world is waiting.';
        const nextLink = button.dataset.guideLink || '';
        const nextLinkLabel = button.dataset.guideLinkLabel || 'OPEN THIS PATH';
        activeShare = button.dataset.guideShare || `${nextKicker} / ${nextTitle}`;
        if (kicker) kicker.textContent = nextKicker;
        if (title) title.textContent = nextTitle;
        if (body) body.textContent = nextText;
        if (link) {
          if (nextLink) {
            link.hidden = false;
            link.href = nextLink;
            link.textContent = nextLinkLabel;
          } else {
            link.hidden = true;
          }
        }
      };

      buttons.forEach((button) => button.addEventListener('click', () => activate(button)));

      copy?.addEventListener('click', async () => {
        const message = activeShare || title?.textContent || 'RIZO SIGNAL';
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(message);
          toast('Signal copied.');
        } catch (error) {
          toast('Copy not available on this device.');
        }
      });

      if (buttons[0]) activate(buttons[0]);
    });
  };



  const initWorldReactive = (container = doc) => {
    if (!finePointer || reducedMotion || lowPower || root.dataset.motion === 'calm') return;
    $$('[data-world-reactive]:not([data-world-reactive-ready])', container).forEach((scene) => {
      scene.dataset.worldReactiveReady = 'true';
      const controller = new AbortController();
      scene._worldController = controller;
      let frame = 0;
      let nextX = 0;
      let nextY = 0;
      const paint = () => {
        frame = 0;
        scene.style.setProperty('--world-x', nextX.toFixed(3));
        scene.style.setProperty('--world-y', nextY.toFixed(3));
        scene.style.setProperty('--world-x-s', `${(nextX * 12).toFixed(2)}px`);
        scene.style.setProperty('--world-y-s', `${(nextY * 12).toFixed(2)}px`);
        scene.style.setProperty('--world-x-s-neg', `${(-nextX * 12).toFixed(2)}px`);
        scene.style.setProperty('--world-y-s-neg', `${(-nextY * 12).toFixed(2)}px`);
        scene.style.setProperty('--world-x-m', `${(nextX * 24).toFixed(2)}px`);
        scene.style.setProperty('--world-y-m', `${(nextY * 24).toFixed(2)}px`);
        scene.style.setProperty('--world-x-m-neg', `${(-nextX * 24).toFixed(2)}px`);
        scene.style.setProperty('--world-y-m-neg', `${(-nextY * 24).toFixed(2)}px`);
        scene.style.setProperty('--world-x-l', `${(nextX * 40).toFixed(2)}px`);
        scene.style.setProperty('--world-y-l', `${(nextY * 40).toFixed(2)}px`);
        scene.style.setProperty('--world-x-l-neg', `${(-nextX * 40).toFixed(2)}px`);
        scene.style.setProperty('--world-y-l-neg', `${(-nextY * 40).toFixed(2)}px`);
      };
      const queue = (event) => {
        const bounds = scene.getBoundingClientRect();
        nextX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) - .5;
        nextY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) - .5;
        if (!frame) frame = window.requestAnimationFrame(paint);
      };
      const reset = () => {
        nextX = 0;
        nextY = 0;
        if (!frame) frame = window.requestAnimationFrame(paint);
      };
      scene.addEventListener('pointermove', queue, { passive: true, signal: controller.signal });
      scene.addEventListener('pointerleave', reset, { passive: true, signal: controller.signal });
    });
  };

  const initWorldGates = (container = doc) => {
    $$('[data-world-gate]:not([data-world-gate-ready])', container).forEach((gate) => {
      gate.dataset.worldGateReady = 'true';
      const controller = new AbortController();
      gate._worldGateController = controller;
      $('[data-world-enter]', gate)?.addEventListener('click', () => {
        try { window.sessionStorage.setItem('rizoWorldEntered', 'true'); } catch (_) {}
        emitRizoEvent('world_entered', { source: 'world_gate' });
      }, { signal: controller.signal });
    });
  };

  const initWorldMaps = (container = doc) => {
    $$('[data-world-map]:not([data-world-map-ready])', container).forEach((map) => {
      map.dataset.worldMapReady = 'true';
      const controller = new AbortController();
      map._worldMapController = controller;
      const nodes = $$('[data-world-node]', map);
      const art = $('[data-world-map-art]', map);
      const kicker = $('[data-world-map-kicker]', map);
      const title = $('[data-world-map-title]', map);
      const body = $('[data-world-map-text]', map);
      const link = $('[data-world-map-link]', map);
      const linkLabel = $('[data-world-map-link-label]', map);
      const live = $('[data-world-map-live]', map);
      const count = $('[data-world-passport-count]', map);
      const message = $('[data-world-passport-message]', map);
      const reward = $('[data-world-passport-reward]', map);
      const reset = $('[data-world-passport-reset]', map);
      const storageKey = 'rizoWorldPassportV1';
      let activeNode = nodes[0] || null;
      let visited = [];

      try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
        if (Array.isArray(stored)) visited = stored.filter((value) => typeof value === 'string');
      } catch (_) {
        visited = [];
      }

      const saveVisited = () => {
        try { window.localStorage.setItem(storageKey, JSON.stringify(visited)); } catch (_) {}
      };

      const renderPassport = () => {
        const validIds = nodes.map((node) => node.dataset.worldId).filter(Boolean);
        visited = visited.filter((id) => validIds.includes(id));
        $$('[data-world-stamp]', map).forEach((stamp) => {
          const recovered = visited.includes(stamp.dataset.worldStamp);
          stamp.classList.toggle('is-recovered', recovered);
          stamp.setAttribute('aria-label', `${stamp.title || stamp.dataset.worldStamp}: ${recovered ? 'recovered' : 'not recovered'}`);
        });
        if (count) count.textContent = `${visited.length} / ${nodes.length}`;
        const complete = visited.length === nodes.length && nodes.length > 0;
        if (message) {
          message.textContent = complete
            ? 'WORLD OPEN. YOUR PASSPORT REWARD IS READY.'
            : 'Recover each zone. Your progress stays on this device.';
        }
        if (reward) reward.hidden = !complete;
        map.classList.toggle('is-world-open', complete);
      };

      const markVisited = (id) => {
        if (!id || visited.includes(id)) return;
        visited.push(id);
        saveVisited();
        renderPassport();
        const recoveredNode = nodes.find((node) => node.dataset.worldId === id);
        announce(`${recoveredNode?.dataset.worldTitle || 'World zone'} recovered. ${visited.length} of ${nodes.length} zones recovered.`);
        emitRizoEvent('world_zone_recovered', { zone: id, recovered_count: visited.length });
      };

      const activate = (node, recover = false) => {
        if (!node) return;
        activeNode = node;
        nodes.forEach((candidate) => {
          const active = candidate === node;
          candidate.classList.toggle('is-active', active);
          candidate.setAttribute('aria-pressed', String(active));
        });
        if (kicker) kicker.textContent = node.dataset.worldKicker || 'WORLD ZONE';
        if (title) title.textContent = node.dataset.worldTitle || '';
        if (body) body.textContent = node.dataset.worldText || '';
        if (live) live.textContent = `${node.dataset.worldTitle || 'World zone'}. ${node.dataset.worldText || ''}`;
        if (art && node.dataset.worldArt) art.src = node.dataset.worldArt;
        if (link) {
          const destination = node.dataset.worldLink || '';
          link.hidden = !destination;
          if (destination) link.href = destination;
          if (linkLabel) linkLabel.textContent = node.dataset.worldLinkLabel || 'ENTER ZONE';
        }
        map.dataset.activeZone = node.dataset.worldId || '';
        if (recover) markVisited(node.dataset.worldId);
      };

      nodes.forEach((node) => node.addEventListener('click', () => activate(node, true), { signal: controller.signal }));
      link?.addEventListener('click', () => markVisited(activeNode?.dataset.worldId), { signal: controller.signal });
      reset?.addEventListener('click', () => {
        visited = [];
        saveVisited();
        renderPassport();
        toast('World passport reset.');
        announce('World passport reset. No zones are currently recovered.');
      }, { signal: controller.signal });

      renderPassport();
      activate(nodes[0], false);
    });
  };

  const initSignalForges = (container = doc) => {
    $$('[data-signal-forge]:not([data-signal-forge-ready])', container).forEach((forge) => {
      forge.dataset.signalForgeReady = 'true';
      const controller = new AbortController();
      forge._signalForgeController = controller;
      const intentButtons = $$('[data-forge-intent]', forge);
      const energyButtons = $$('[data-forge-energy]', forge);
      const code = $('[data-forge-code]', forge);
      const outputArt = $('.signal-forge-output img', forge);
      const primary = $('[data-forge-primary]', forge);
      const secondary = $('[data-forge-secondary]', forge);
      const copy = $('[data-forge-copy]', forge);
      const share = $('[data-forge-share]', forge);
      const intentCodes = { pressure: 'P', idea: 'I', city: 'C', future: 'F' };
      const energyCodes = { quiet: 'Q', loud: 'L', raw: 'R', unfinished: 'U' };
      let activeIntent = intentButtons[0] || null;
      let activeEnergy = energyButtons[0] || null;

      const currentSignal = () => {
        const signalCode = `RZ-${intentCodes[activeIntent?.dataset.forgeIntent] || 'X'}${energyCodes[activeEnergy?.dataset.forgeEnergy] || 'X'}-412`;
        const firstLine = activeIntent?.dataset.forgeLine || 'MAKE SOMETHING REAL';
        const secondLine = activeEnergy?.dataset.forgeLine || 'START BEFORE YOU FEEL READY.';
        return { signalCode, firstLine, secondLine, text: `${signalCode}\n${firstLine}\n${secondLine}\nRIZO WORLD / PITTSBURGH` };
      };

      const syncUrl = () => {
        const url = new URL(window.location.href);
        url.searchParams.set('rizo_intent', activeIntent?.dataset.forgeIntent || 'pressure');
        url.searchParams.set('rizo_energy', activeEnergy?.dataset.forgeEnergy || 'quiet');
        url.hash = 'RizoSignalForge';
        window.history.replaceState({}, '', url);
        return url;
      };

      const render = (updateUrl = true) => {
        intentButtons.forEach((button) => {
          const active = button === activeIntent;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        energyButtons.forEach((button) => {
          const active = button === activeEnergy;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        const signal = currentSignal();
        if (code) code.textContent = signal.signalCode;
        if (outputArt && activeIntent?.dataset.forgeArt) outputArt.src = activeIntent.dataset.forgeArt;
        if (primary) primary.textContent = signal.firstLine;
        if (secondary) secondary.textContent = signal.secondLine;
        forge.dataset.intent = activeIntent?.dataset.forgeIntent || '';
        forge.dataset.energy = activeEnergy?.dataset.forgeEnergy || '';
        if (updateUrl) syncUrl();
      };

      intentButtons.forEach((button) => button.addEventListener('click', () => {
        activeIntent = button;
        render();
        emitRizoEvent('signal_forged', { intent: button.dataset.forgeIntent, energy: activeEnergy?.dataset.forgeEnergy || '' });
      }, { signal: controller.signal }));

      energyButtons.forEach((button) => button.addEventListener('click', () => {
        activeEnergy = button;
        render();
        emitRizoEvent('signal_forged', { intent: activeIntent?.dataset.forgeIntent || '', energy: button.dataset.forgeEnergy });
      }, { signal: controller.signal }));

      copy?.addEventListener('click', async () => {
        const signal = currentSignal();
        const url = syncUrl();
        try {
          await navigator.clipboard.writeText(`${signal.text}\n${url}`);
          toast('Rizo signal copied.');
        } catch (_) {
          toast('Copy is not available on this device.');
        }
      }, { signal: controller.signal });

      share?.addEventListener('click', async () => {
        const signal = currentSignal();
        const url = syncUrl();
        if (navigator.share) {
          try {
            await navigator.share({ title: 'Rizo Signal', text: signal.text, url: url.toString() });
            emitRizoEvent('signal_shared', { code: signal.signalCode });
            return;
          } catch (error) {
            if (error?.name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(`${signal.text}\n${url}`);
          toast('Share link copied.');
        } catch (_) {
          toast('Sharing is not available on this device.');
        }
      }, { signal: controller.signal });

      const params = new URL(window.location.href).searchParams;
      const requestedIntent = params.get('rizo_intent');
      const requestedEnergy = params.get('rizo_energy');
      activeIntent = intentButtons.find((button) => button.dataset.forgeIntent === requestedIntent) || activeIntent;
      activeEnergy = energyButtons.find((button) => button.dataset.forgeEnergy === requestedEnergy) || activeEnergy;
      render(false);
    });
  };

  /* Theme editor can reload sections without a full page refresh */
  const initAll = (container = doc) => {
    measureHeader();
    updateScrollState();
    initCountdowns(container);
    initHero(container);
    initTilt(container);
    configureInstallGuide();
    initSignalGuides(container);
    initWorldReactive(container);
    initWorldGates(container);
    initWorldMaps(container);
    initSignalForges(container);
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => initAll());
  else initAll();

  doc.addEventListener('shopify:section:load', (event) => initAll(event.target));


  /* v0.3 analytics-ready event layer */
  const emitRizoEvent = (name, detail = {}) => {
    const payload = { event: `rizo_${name}`, ...detail };
    doc.dispatchEvent(new CustomEvent(`rizo:${name}`, { detail: payload }));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
  };

  doc.addEventListener('click', (event) => {
    const tracked = event.target.closest('[data-analytics]');
    if (tracked) {
      const card = tracked.closest('[data-product-card]');
      emitRizoEvent(tracked.dataset.analytics, {
        label: tracked.textContent.trim(),
        url: tracked.href || '',
        product_id: card?.dataset.productId || '',
        product_title: card?.dataset.productTitle || ''
      });
    }
    const rizo = event.target.closest('[data-rizo-interaction]');
    if (rizo) emitRizoEvent('rizo_interaction', { interaction: rizo.dataset.rizoInteraction });
  });

  /* Accessible, grouped variant-aware quick add */
  doc.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-quick-add-open]');
    if (!trigger) return;
    const dialog = $('[data-overlay="quick-add"]');
    const options = $('[data-quick-add-options]', dialog);
    const form = $('[data-quick-add-form]', dialog);
    const submit = $('[data-quick-add-submit]', dialog);
    const title = $('[data-quick-add-title]', dialog);
    const error = $('[data-quick-add-error]', dialog);
    const summary = $('[data-quick-add-summary]', dialog);
    const media = $('[data-quick-add-media]', dialog);
    const price = $('[data-quick-add-price]', dialog);
    const link = $('[data-quick-add-link]', dialog);
    const status = $('[data-quick-add-status]', dialog);
    if (!dialog || !options || !form || !submit) return;

    trigger.disabled = true;
    emitRizoEvent('quick_add_opened', { product_handle: trigger.dataset.quickAddOpen });
    try {
      const response = await fetch(trigger.dataset.productUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Options unavailable');
      const product = await response.json();
      title.textContent = product.title;
      if (price) price.textContent = money(product.price);
      if (link) link.href = product.url || trigger.dataset.productUrl.replace(/\.js(?:\?.*)?$/, '');
      if (status) status.textContent = product.available ? 'AVAILABLE ONLINE' : 'SOLD OUT';
      if (media) {
        media.replaceChildren();
        const imageUrl = typeof product.featured_image === 'string' ? product.featured_image : product.featured_image?.url;
        if (imageUrl) {
          const image = doc.createElement('img');
          image.src = imageUrl;
          image.alt = product.title || '';
          image.width = 220;
          image.height = 275;
          media.append(image);
        }
      }

      options.replaceChildren();
      form.querySelector('input[name="id"]')?.remove();
      const hidden = doc.createElement('input');
      hidden.type = 'hidden'; hidden.name = 'id'; hidden.value = '';
      form.prepend(hidden);
      submit.disabled = true;
      submit.textContent = 'CHOOSE OPTIONS';
      if (error) error.hidden = true;

      const optionDefinitions = (product.options || []).map((option, index) => {
        if (typeof option === 'string') {
          return { name: option, position: index + 1, values: [...new Set(product.variants.map((variant) => variant.options[index]))] };
        }
        return { name: option.name || `Option ${index + 1}`, position: option.position || index + 1, values: option.values || [...new Set(product.variants.map((variant) => variant.options[index]))] };
      });
      if (!optionDefinitions.length) {
        optionDefinitions.push({ name: 'Option', position: 1, values: [...new Set(product.variants.map((variant) => variant.options[0] || variant.title))] });
      }

      const selected = new Array(optionDefinitions.length).fill('');
      const groupElements = [];
      const sync = () => {
        groupElements.forEach((group, position) => {
          $$('[data-quick-option]', group).forEach((button) => {
            const possible = product.variants.some((variant) => variant.available && variant.options[position] === button.dataset.value && variant.options.every((value, index) => {
              if (index >= position) return true;
              return !selected[index] || selected[index] === value;
            }));
            button.disabled = !possible;
            button.setAttribute('aria-disabled', String(!possible));
          });
        });

        const complete = selected.every(Boolean);
        const variant = complete ? product.variants.find((candidate) => candidate.options.every((value, index) => value === selected[index])) : null;
        if (!complete) {
          hidden.value = '';
          submit.disabled = true;
          const missing = optionDefinitions[selected.findIndex((value) => !value)]?.name || 'options';
          submit.textContent = `CHOOSE ${missing.toUpperCase()}`;
          if (summary) summary.textContent = `Choose ${missing.toLowerCase()} to continue.`;
          return;
        }
        if (!variant || !variant.available) {
          hidden.value = '';
          submit.disabled = true;
          submit.textContent = 'COMBINATION UNAVAILABLE';
          if (summary) summary.textContent = 'Change one option to find an available combination.';
          return;
        }
        hidden.value = variant.id;
        submit.disabled = false;
        submit.textContent = 'ADD TO RIZO BAG';
        if (price) price.textContent = money(variant.price);
        if (summary) summary.textContent = `${selected.join(' / ')} · available`;
      };

      optionDefinitions.forEach((definition, position) => {
        const fieldset = doc.createElement('fieldset');
        fieldset.className = 'quick-option-group';
        const legend = doc.createElement('legend');
        const name = doc.createElement('span');
        name.textContent = definition.name;
        const choice = doc.createElement('b');
        choice.textContent = definition.values.length === 1 ? definition.values[0] : `Choose ${definition.name.toLowerCase()}`;
        legend.append(name, choice);
        const values = doc.createElement('div');
        values.className = 'quick-option-values';
        definition.values.forEach((value) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'quick-add-option';
          button.dataset.quickOption = String(position);
          button.dataset.value = value;
          button.textContent = value;
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => {
            if (button.disabled) return;
            selected[position] = value;
            $$('[data-quick-option]', fieldset).forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
            choice.textContent = value;
            if (!product.variants.some((variant) => variant.available && variant.options.every((optionValue, index) => !selected[index] || selected[index] === optionValue))) {
              groupElements.forEach((otherGroup, otherPosition) => {
                if (otherPosition <= position) return;
                selected[otherPosition] = '';
                $$('[data-quick-option]', otherGroup).forEach((candidate) => candidate.setAttribute('aria-pressed', 'false'));
                const otherChoice = $('legend b', otherGroup);
                if (otherChoice) otherChoice.textContent = `Choose ${optionDefinitions[otherPosition].name.toLowerCase()}`;
              });
            }
            sync();
          });
          values.append(button);
        });
        fieldset.append(legend, values);
        options.append(fieldset);
        groupElements.push(fieldset);
        if (definition.values.length === 1) {
          selected[position] = definition.values[0];
          const only = $('[data-quick-option]', fieldset);
          only?.setAttribute('aria-pressed', 'true');
        }
      });

      sync();
      openOverlay('quick-add', trigger);
    } catch (_) {
      toast('Options could not load. Open the product to continue.');
      announceError('Options could not load. Open the product to continue.');
    } finally {
      trigger.disabled = false;
    }
  });

  /* Release module expires into a live state instead of displaying zeroes */
  const initReleaseModules = (container = doc) => {
    $$('[data-release-module]:not([data-v03-release])', container).forEach((module) => {
      module.dataset.v03Release = 'true';
      if (module.dataset.mode !== 'countdown' || !module.dataset.date) return;
      const target = Date.parse(module.dataset.date);
      if (!Number.isFinite(target)) return;
      const update = () => {
        const remaining = target - Date.now();
        if (remaining <= 0) {
          const countdown = $('[data-countdown]', module); if (countdown) countdown.remove();
          const heading = $('[data-release-heading]', module); if (heading) heading.textContent = module.dataset.expiredHeading || 'THE DROP IS LIVE.';
          const copy = $('[data-release-copy]', module); if (copy) copy.textContent = module.dataset.expiredCopy || '';
          if (module.dataset.releaseAnnounced !== 'true') {
            module.dataset.releaseAnnounced = 'true';
            announce(module.dataset.expiredHeading || 'The drop is live.');
          }
          window.clearInterval(module._releaseTimer); module._releaseTimer = 0; return;
        }
        const values = { days: Math.floor(remaining/86400000), hours: Math.floor(remaining/3600000)%24, minutes: Math.floor(remaining/60000)%60, seconds: Math.floor(remaining/1000)%60 };
        Object.entries(values).forEach(([key,value]) => { const el=$(`[data-${key}]`,module); if(el) el.textContent=String(value).padStart(2,'0'); });
      };
      const start = () => {
        if (module._releaseTimer || doc.hidden) return;
        update();
        if ($('[data-countdown]', module)) module._releaseTimer = window.setInterval(update, 1000);
      };
      const stop = () => { window.clearInterval(module._releaseTimer); module._releaseTimer = 0; };
      const handleVisibility = () => doc.hidden ? stop() : start();
      module._releaseVisibilityHandler = handleVisibility;
      doc.addEventListener('visibilitychange', handleVisibility);
      start();
    });
  };

  /* Sticky mobile purchase action */
  const initStickyAtc = (container = doc) => {
    const form = $('[data-product-form]', container); const sticky = $('[data-sticky-atc]');
    if (!form || !sticky || sticky.dataset.initialized) return; sticky.dataset.initialized='true';
    const action = $('[data-sticky-submit]', sticky);
    if ('IntersectionObserver' in window) {
      sticky._stickyObserver = new IntersectionObserver(([entry]) => { sticky.hidden = entry.isIntersecting; }, { threshold: 0 });
      sticky._stickyObserver.observe(form);
    }
    else sticky.hidden = false;
    action?.addEventListener('click', () => { const selected=$('[data-variant-input]',form); if(selected && !selected.value){ $('[data-option-picker]',form)?.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'}); $('[data-option-button]:not([disabled])',form)?.focus(); announce('Choose every required product option.'); return; } form.requestSubmit(); });
  };

  const initV03 = (container = doc) => { initReleaseModules(container); initStickyAtc(container); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => initV03()); else initV03();
  doc.addEventListener('shopify:section:load', (event) => initV03(event.target));

  /* v0.4 intuitive commerce and Rizo-world controllers */
  const parseJSONScript = (selector, container) => {
    const script = $(selector, container);
    if (!script) return null;
    try { return JSON.parse(script.textContent); } catch (_) { return null; }
  };

  const initOptionPickers = (container = doc) => {
    $$('[data-product-root]:not([data-v04-options])', container).forEach((productRoot) => {
      productRoot.dataset.v04Options = 'true';
      const picker = $('[data-option-picker]', productRoot);
      if (!picker) return;
      const variants = parseJSONScript('[data-product-variants]', picker);
      if (!Array.isArray(variants) || !variants.length) return;
      const stockRecords = parseJSONScript('[data-product-stock]', picker) || [];
      const stockById = new Map(stockRecords.map((record) => [Number(record.id), record]));
      const lowStockThreshold = Math.max(1, Number(picker.dataset.lowStockThreshold || 5));

      const groups = $$('[data-option-group]', picker);
      const input = $('[data-variant-input]', productRoot);
      if (input) input.disabled = false;
      const submit = $('[data-product-submit]', productRoot);
      const submitLabel = $('[data-product-submit-label]', submit || productRoot);
      const error = $('[data-variant-error]', productRoot);
      const summary = $('[data-selection-summary]', productRoot);
      const price = $('[data-product-price] > span', productRoot);
      const compare = $('[data-product-compare]', productRoot);
      const availability = $('[data-product-availability]', productRoot);
      const stickyVariant = $('[data-sticky-variant]');
      const stickyPrice = $('[data-sticky-price]');
      const stickyAction = $('[data-sticky-submit]');
      const selected = new Array(groups.length).fill('');

      const setPressed = (position, value, auto = false) => {
        selected[position] = value || '';
        const group = groups[position];
        if (!group) return;
        $$('[data-option-button]', group).forEach((button) => {
          const pressed = button.dataset.value === value;
          button.setAttribute('aria-pressed', String(pressed));
          if (!auto && pressed) button.removeAttribute('data-auto-selected');
        });
        const label = $('[data-option-selection]', group);
        if (label) label.textContent = value || `Choose ${String(group.dataset.optionName || 'option').toLowerCase()}`;
      };

      groups.forEach((group, index) => {
        const auto = $('[data-option-button][data-auto-selected="true"]', group);
        if (auto) setPressed(index, auto.dataset.value, true);
      });

      const requestedId = Number(productRoot.dataset.selectedVariant || new URL(window.location.href).searchParams.get('variant') || 0);
      const requestedVariant = requestedId ? variants.find((variant) => Number(variant.id) === requestedId) : null;
      if (requestedVariant) requestedVariant.options.forEach((value, index) => setPressed(index, value, true));

      const matchesPartial = (variant, overridePosition = -1, overrideValue = '') => variant.options.every((optionValue, index) => {
        const desired = index === overridePosition ? overrideValue : selected[index];
        return !desired || optionValue === desired;
      });

      const mediaIdForVariant = (variant) => variant?.featured_media?.id || variant?.featured_image?.id || '';

      const syncAvailability = () => {
        groups.forEach((group, position) => {
          $$('[data-option-button]', group).forEach((button) => {
            const possible = variants.some((variant) => variant.available && variant.options[position] === button.dataset.value && variant.options.every((optionValue, index) => {
              if (index >= position) return true;
              return !selected[index] || selected[index] === optionValue;
            }));
            button.disabled = !possible;
            button.setAttribute('aria-disabled', String(!possible));
            button.classList.toggle('is-unavailable', !possible);
          });
        });
      };

      const resolveSelection = ({ emit = false, source = 'product' } = {}) => {
        syncAvailability();
        const complete = selected.every(Boolean);
        const variant = complete ? variants.find((candidate) => candidate.options.every((value, index) => value === selected[index])) : null;
        const missingGroup = groups.find((_, index) => !selected[index]);

        if (!complete) {
          if (input) input.value = '';
          if (submit) { submit.disabled = true; submit.setAttribute('aria-disabled', 'true'); }
          const missingName = missingGroup?.dataset.optionName || 'options';
          if (submitLabel) submitLabel.textContent = `Choose ${missingName.toLowerCase()}`;
          if (summary) summary.textContent = `Choose ${missingName.toLowerCase()} to continue.`;
          if (stickyVariant) stickyVariant.textContent = `Choose ${missingName.toLowerCase()}`;
          if (stickyAction) stickyAction.textContent = 'CHOOSE';
          if (error) error.hidden = true;
          return;
        }

        if (!variant) {
          if (input) input.value = '';
          if (submit) { submit.disabled = true; submit.setAttribute('aria-disabled', 'true'); }
          if (submitLabel) submitLabel.textContent = 'Combination unavailable';
          if (summary) summary.textContent = 'That combination does not exist. Change one option.';
          if (availability) availability.textContent = 'Unavailable combination';
          if (error) { error.hidden = false; error.textContent = 'That combination is not available. Change one option.'; }
          return;
        }

        if (input) input.value = variant.id;
        if (price) price.textContent = money(variant.price);
        if (compare) {
          const comparePrice = Number(variant.compare_at_price || 0);
          compare.hidden = comparePrice <= Number(variant.price);
          compare.textContent = compare.hidden ? '' : money(comparePrice);
        }
        const stockRecord = stockById.get(Number(variant.id));
        const lowStock = Boolean(
          variant.available &&
          stockRecord?.tracked &&
          stockRecord?.policy === 'deny' &&
          Number(stockRecord.quantity) > 0 &&
          Number(stockRecord.quantity) <= lowStockThreshold
        );
        const stockMessage = lowStock
          ? `low stock · ${stockRecord.quantity} left`
          : (variant.available ? 'in stock online' : 'sold out');
        if (stickyPrice) stickyPrice.textContent = money(variant.price);
        if (stickyVariant) stickyVariant.textContent = selected.join(' / ');
        if (summary) summary.textContent = `${selected.join(' / ')} · ${stockMessage}`;
        if (availability) availability.textContent = lowStock ? `Low stock · ${stockRecord.quantity} left` : (variant.available ? 'In stock online' : 'Sold out');
        if (error) error.hidden = true;
        if (submit) { submit.disabled = !variant.available; submit.setAttribute('aria-disabled', String(!variant.available)); }
        if (submitLabel) submitLabel.textContent = variant.available ? 'Add to cart' : 'Sold out';
        if (stickyAction) stickyAction.textContent = variant.available ? 'ADD' : 'SOLD OUT';

        const mediaId = mediaIdForVariant(variant);
        if (mediaId) {
          const media = $(`[data-media-id="${CSS.escape(String(mediaId))}"]`, productRoot);
          media?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
        }

        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url.toString());
        if (emit) emitRizoEvent('variant_selected', { variant_id: variant.id, variant_title: selected.join(' / '), source });
      };

      picker.addEventListener('click', (event) => {
        const button = event.target.closest('[data-option-button]');
        if (!button || button.disabled) return;
        const group = button.closest('[data-option-group]');
        const position = groups.indexOf(group);
        if (position < 0) return;
        setPressed(position, button.dataset.value);

        if (!variants.some((variant) => variant.available && matchesPartial(variant))) {
          groups.forEach((otherGroup, otherPosition) => {
            if (otherPosition === position || !selected[otherPosition]) return;
            selected[otherPosition] = '';
            $$('[data-option-button]', otherGroup).forEach((candidate) => candidate.setAttribute('aria-pressed', 'false'));
            const label = $('[data-option-selection]', otherGroup);
            if (label) label.textContent = `Choose ${String(otherGroup.dataset.optionName || 'option').toLowerCase()}`;
          });
        }

        resolveSelection({ emit: true });
      });

      const form = $('[data-product-form]', productRoot);
      form?.addEventListener('submit', (event) => {
        if (!input?.value) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (error) { error.hidden = false; error.textContent = 'Choose every required option before adding this piece.'; }
          picker.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
          const firstMissing = groups.find((_, index) => !selected[index]);
          $('[data-option-button]:not([disabled])', firstMissing || picker)?.focus();
          announce('Choose every required product option.');
        }
      }, true);

      resolveSelection();
    });
  };

  const initProductMedia = (container = doc) => {
    $$('[data-media-gallery]:not([data-v04-media])', container).forEach((gallery) => {
      gallery.dataset.v04Media = 'true';
      const track = $('[data-media-track]', gallery);
      const mediaItems = $$('[data-media-id]', gallery);
      const thumbs = $$('[data-media-thumb]', gallery);
      if (!track || !mediaItems.length) return;

      const activate = (id) => thumbs.forEach((thumb) => thumb.setAttribute('aria-pressed', String(thumb.dataset.mediaThumb === String(id))));
      thumbs.forEach((thumb) => thumb.addEventListener('click', () => {
        const target = $(`[data-media-id="${CSS.escape(thumb.dataset.mediaThumb)}"]`, gallery);
        target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
        activate(thumb.dataset.mediaThumb);
      }));

      if ('IntersectionObserver' in window && mediaItems.length > 1) {
        const observer = new IntersectionObserver((entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) activate(visible.target.dataset.mediaId);
        }, { root: track, threshold: [.55, .75] });
        mediaItems.forEach((item) => observer.observe(item));
        gallery._mediaObserver = observer;
      }
    });
  };

  doc.addEventListener('click', (event) => {
    const zoom = event.target.closest('[data-media-zoom]');
    if (zoom) {
      const viewer = $('[data-media-viewer-image]');
      if (viewer) { viewer.src = zoom.dataset.mediaZoom; viewer.alt = zoom.dataset.mediaAlt || ''; }
      openOverlay('product-media', zoom);
      return;
    }
    const sizeGuide = event.target.closest('[data-size-guide-open]');
    if (sizeGuide) {
      emitRizoEvent('size_guide_opened', { product_id: $('[data-product-root]')?.dataset.productId || '' });
      openOverlay('size-guide', sizeGuide);
    }
  });

  const initRecommendations = (container = doc) => {
    $$('product-recommendations[data-recommendations-url]:not([data-loaded])', container).forEach(async (element) => {
      element.dataset.loaded = 'true';
      try {
        const response = await fetch(element.dataset.recommendationsUrl, { credentials: 'same-origin' });
        if (!response.ok) return;
        const html = await response.text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const replacement = $('product-recommendations', parsed);
        if (replacement?.innerHTML.trim()) {
          element.innerHTML = replacement.innerHTML;
          initV04(element);
        }
      } catch (_) { /* Recommendations are optional. */ }
    });
  };

  const initRecentlyViewed = (container = doc) => {
    $$('[data-recently-viewed]:not([data-initialized])', container).forEach((section) => {
      section.dataset.initialized = 'true';
      const currentScript = $('[data-current-product]', section);
      let current;
      try { current = JSON.parse(currentScript?.textContent || '{}'); } catch (_) { return; }
      if (!current?.id) return;
      const key = 'rizo-recently-viewed-v1';
      let trail = [];
      try { trail = JSON.parse(window.localStorage.getItem(key) || '[]'); } catch (_) { trail = []; }
      const previous = trail.filter((item) => String(item.id) !== String(current.id)).slice(0, 4);
      const next = [current, ...trail.filter((item) => String(item.id) !== String(current.id))].slice(0, 8);
      try { window.localStorage.setItem(key, JSON.stringify(next)); } catch (_) { /* storage can be blocked */ }
      if (!previous.length) return;

      const target = $('[data-recent-trail]', section);
      if (!target) return;
      previous.forEach((item, index) => {
        const article = doc.createElement('article');
        article.className = 'recent-trail-card';
        const link = doc.createElement('a');
        link.href = item.url || '#';
        if (item.image) {
          const image = doc.createElement('img');
          image.src = item.image;
          image.alt = item.title || '';
          image.loading = 'lazy';
          image.width = 480;
          image.height = 600;
          link.append(image);
        }
        const copy = doc.createElement('span');
        const small = doc.createElement('small');
        small.textContent = `TRAIL ${String(index + 1).padStart(2, '0')}`;
        const strong = doc.createElement('strong');
        strong.textContent = item.title || 'Rizo piece';
        const priceLabel = doc.createElement('b');
        priceLabel.textContent = item.price || '';
        copy.append(small, strong, priceLabel);
        link.append(copy);
        article.append(link);
        target.append(article);
      });
      section.hidden = false;
    });
  };

  const predictiveItem = (item, type) => {
    const link = doc.createElement('a');
    link.className = `predictive-item predictive-item--${type}`;
    link.href = item.url || '#';
    link.setAttribute('role', 'option');
    link.tabIndex = -1;
    if (type === 'product' && item.featured_image?.url) {
      const image = doc.createElement('img');
      const separator = item.featured_image.url.includes('?') ? '&' : '?';
      image.src = `${item.featured_image.url}${separator}width=180`;
      image.alt = item.featured_image.alt || item.title || '';
      image.width = 72;
      image.height = 90;
      image.loading = 'lazy';
      link.append(image);
    }
    const copy = doc.createElement('span');
    const label = doc.createElement('small');
    label.textContent = type.toUpperCase();
    const title = doc.createElement('strong');
    title.textContent = item.title || '';
    copy.append(label, title);
    if (type === 'product' && item.price) {
      const priceLabel = doc.createElement('b');
      const rawPrice = String(item.price);
      priceLabel.textContent = rawPrice.includes('.') ? new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(rawPrice)) : money(Number(rawPrice));
      copy.append(priceLabel);
    }
    link.append(copy);
    return link;
  };

  const initPredictiveSearch = (container = doc) => {
    $$('[data-predictive-search]:not([data-initialized])', container).forEach((search) => {
      search.dataset.initialized = 'true';
      const input = $('[data-predictive-input]', search);
      const results = $('[data-predictive-results]', search);
      const status = $('[data-predictive-status]', search);
      const shortcuts = $('[data-search-shortcuts]', search);
      const endpoint = search.dataset.predictiveUrl;
      if (!input || !results || !endpoint) return;
      let timer = 0;
      let controller = null;

      const clear = () => {
        controller?.abort();
        results.replaceChildren();
        results.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        if (shortcuts) shortcuts.hidden = false;
        if (status) status.textContent = '';
      };

      const run = async () => {
        const query = input.value.trim();
        if (query.length < 2) { clear(); return; }
        controller?.abort();
        controller = new AbortController();
        search._predictiveController = controller;
        if (status) status.textContent = 'Searching the Rizo world…';
        try {
          const jsonEndpoint = endpoint.endsWith('.json') ? endpoint : `${endpoint}.json`;
          const url = new URL(jsonEndpoint, window.location.origin);
          url.searchParams.set('q', query);
          url.searchParams.set('resources[type]', 'product,collection,page,article');
          url.searchParams.set('resources[limit]', '6');
          url.searchParams.set('resources[options][unavailable_products]', 'last');
          const response = await fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('Search unavailable');
          const payload = await response.json();
          const grouped = payload?.resources?.results || {};
          const items = [
            ...(grouped.products || []).map((item) => [item, 'product']),
            ...(grouped.collections || []).map((item) => [item, 'collection']),
            ...(grouped.pages || []).map((item) => [item, 'page']),
            ...(grouped.articles || []).map((item) => [item, 'article'])
          ];
          results.replaceChildren();
          items.forEach(([item, type]) => results.append(predictiveItem(item, type)));
          if (!items.length) {
            const empty = doc.createElement('p');
            empty.className = 'predictive-empty';
            empty.textContent = 'Nothing surfaced yet. Press Search to try the full archive.';
            results.append(empty);
          }
          results.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          if (shortcuts) shortcuts.hidden = true;
          if (status) status.textContent = `${items.length} suggestions found.`;
        } catch (error) {
          if (error.name !== 'AbortError' && status) status.textContent = 'Live suggestions are unavailable. Press Search to continue.';
        }
      };

      input.addEventListener('input', () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(run, 180);
      });
      input.addEventListener('keydown', (event) => {
        const options = $$('[role="option"]', results);
        if (!options.length || results.hidden) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); options[0].focus(); }
        if (event.key === 'Escape') clear();
      });
      results.addEventListener('keydown', (event) => {
        const options = $$('[role="option"]', results);
        const index = options.indexOf(doc.activeElement);
        if (event.key === 'ArrowDown') { event.preventDefault(); (options[index + 1] || options[0])?.focus(); }
        if (event.key === 'ArrowUp') { event.preventDefault(); (index <= 0 ? input : options[index - 1])?.focus(); }
        if (event.key === 'Escape') { event.preventDefault(); input.focus(); clear(); }
      });
    });
  };

  doc.addEventListener('click', (event) => {
    const close = event.target.closest('[data-filter-close]');
    if (close) {
      const root = close.closest('[data-collection-root]') || doc;
      const filters = $('[data-filter-form]', root);
      const toggle = $('[data-filter-toggle]', root);
      const backdrop = $('.collection-filter-backdrop', root);
      filters?.classList.remove('is-open');
      filters?.removeAttribute('role');
      filters?.removeAttribute('aria-modal');
      filters?.removeAttribute('aria-label');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      if (backdrop) backdrop.hidden = true;
      doc.body.classList.remove('is-filter-open');
      const returnFocus = filters?._filterReturnFocus;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      return;
    }
    const toggle = event.target.closest('[data-filter-toggle]');
    if (toggle) {
      const root = toggle.closest('[data-collection-root]') || doc;
      const filters = $(`#${CSS.escape(toggle.getAttribute('aria-controls'))}`, root);
      const backdrop = $('.collection-filter-backdrop', root);
      const open = filters?.classList.contains('is-open');
      if (backdrop) backdrop.hidden = !open;
      doc.body.classList.toggle('is-filter-open', Boolean(open));
      if (open) {
        filters._filterReturnFocus = toggle;
        filters.setAttribute('role', 'dialog');
        filters.setAttribute('aria-modal', 'true');
        filters.setAttribute('aria-label', 'Filter products');
        window.setTimeout(() => $('[data-filter-close]', filters)?.focus(), reducedMotion ? 0 : 120);
      }
    }
  });

  doc.addEventListener('focusin', (event) => {
    const filters = $('.collection-filters.is-open');
    if (!filters || activeOverlay || filters.contains(event.target)) return;
    ($('[data-filter-close]', filters) || focusableElements(filters)[0])?.focus({ preventScroll: true });
  });

  doc.addEventListener('keydown', (event) => {
    const filters = $('.collection-filters.is-open');
    if (!filters || activeOverlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      $('[data-filter-close]', filters)?.click();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableElements(filters);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const initProductImpressions = (container = doc) => {
    const cards = $$('[data-product-card]:not([data-impression-bound])', container);
    if (!cards.length) return;
    if (!('IntersectionObserver' in window)) {
      cards.forEach((card) => {
        card.dataset.impressionBound = 'true';
        emitRizoEvent('product_impression', { product_id: card.dataset.productId || '', product_title: card.dataset.productTitle || '', url: card.dataset.productUrl || '' });
      });
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < .45) return;
        const card = entry.target;
        emitRizoEvent('product_impression', { product_id: card.dataset.productId || '', product_title: card.dataset.productTitle || '', url: card.dataset.productUrl || '' });
        observer.unobserve(card);
        card.dataset.impressionSeen = 'true';
      });
    }, { threshold: [.45] });
    cards.forEach((card) => { card.dataset.impressionBound = 'true'; observer.observe(card); });
    container._impressionObserver = observer;
  };

  const initRizoGuidance = (container = doc) => {
    $$('[data-rizo-interaction]:not([data-v04-guidance])', container).forEach((rizo) => {
      rizo.dataset.v04Guidance = 'true';
      rizo.addEventListener('click', () => {
        const speech = $('.rizo-speech', rizo);
        if (speech) speech.classList.toggle('is-visible');
      });
    });
  };


  /* v0.5 original-signal date/time layer. Archive mode preserves the
     02/22/2023 + 2:22 PM motif; live mode uses the merchant timezone. */
  const initSignalClocks = (container = doc) => {
    $$('[data-rizo-clock]:not([data-clock-initialized])', container).forEach((clock) => {
      clock.dataset.clockInitialized = 'true';
      if (clock.dataset.clockMode !== 'live') return;
      const dateNode = $('[data-rizo-clock-date]', clock);
      const timeNode = $('[data-rizo-clock-time]', clock);
      const timeZone = clock.dataset.timeZone || 'America/New_York';
      const update = () => {
        const now = new Date();
        try {
          if (dateNode) {
            dateNode.textContent = new Intl.DateTimeFormat(locale, {
              timeZone,
              month: '2-digit',
              day: '2-digit',
              year: 'numeric'
            }).format(now);
            dateNode.dateTime = now.toISOString().slice(0, 10);
          }
          if (timeNode) {
            timeNode.textContent = new Intl.DateTimeFormat(locale, {
              timeZone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }).format(now);
          }
        } catch (_) {
          if (dateNode) dateNode.textContent = now.toLocaleDateString();
          if (timeNode) timeNode.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
      };
      const start = () => {
        if (clock._rizoClockTimer || doc.hidden) return;
        update();
        clock._rizoClockTimer = window.setInterval(update, 30000);
      };
      const stop = () => { window.clearInterval(clock._rizoClockTimer); clock._rizoClockTimer = 0; };
      const handleVisibility = () => doc.hidden ? stop() : start();
      clock._rizoClockVisibilityHandler = handleVisibility;
      doc.addEventListener('visibilitychange', handleVisibility);
      start();
    });
  };

  const initFormFeedback = (container = doc) => {
    const feedback = $('[data-form-feedback]', container);
    if (!feedback || feedback.dataset.feedbackFocused === 'true') return;
    feedback.dataset.feedbackFocused = 'true';
    window.requestAnimationFrame(() => feedback.focus({ preventScroll: false }));
  };

  const initV05 = (container = doc) => {
    initFormFeedback(container);
    initOptionPickers(container);
    initProductMedia(container);
    initRecommendations(container);
    initRecentlyViewed(container);
    initPredictiveSearch(container);
    initProductImpressions(container);
    initRizoGuidance(container);
    initSignalClocks(container);
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => initV05());
  else initV05();
  doc.addEventListener('shopify:section:load', (event) => initV05(event.target));


  doc.addEventListener('shopify:section:unload', (event) => {
    $$('[data-countdown-root]', event.target).forEach((countdown) => {
      window.clearInterval(countdown._countdownTimer);
      if (countdown._countdownVisibilityHandler) doc.removeEventListener('visibilitychange', countdown._countdownVisibilityHandler);
    });
    $$('[data-rizo-hero]', event.target).forEach((hero) => {
      hero._rizoHeroObserver?.disconnect?.();
      hero._rizoHeroResizeObserver?.disconnect?.();
      if (hero._rizoHeroResizeHandler) window.removeEventListener('resize', hero._rizoHeroResizeHandler);
      if (hero._rizoHeroScrollHandler) window.removeEventListener('scroll', hero._rizoHeroScrollHandler);
      if (hero._rizoHeroVisibilityHandler) doc.removeEventListener('visibilitychange', hero._rizoHeroVisibilityHandler);
    });
    $$('[data-media-gallery]', event.target).forEach((gallery) => gallery._mediaObserver?.disconnect());
    event.target._impressionObserver?.disconnect?.();
    $$('[data-predictive-search]', event.target).forEach((search) => search._predictiveController?.abort?.());
    $$('[data-release-module]', event.target).forEach((module) => {
      window.clearInterval(module._releaseTimer);
      if (module._releaseVisibilityHandler) doc.removeEventListener('visibilitychange', module._releaseVisibilityHandler);
    });
    $$('[data-sticky-atc]', event.target).forEach((sticky) => sticky._stickyObserver?.disconnect?.());
    $$('[data-rizo-clock]', event.target).forEach((clock) => {
      window.clearInterval(clock._rizoClockTimer);
      if (clock._rizoClockVisibilityHandler) doc.removeEventListener('visibilitychange', clock._rizoClockVisibilityHandler);
    });
    $$('[data-world-reactive]', event.target).forEach((scene) => scene._worldController?.abort?.());
    $$('[data-world-gate]', event.target).forEach((gate) => gate._worldGateController?.abort?.());
    $$('[data-world-map]', event.target).forEach((map) => map._worldMapController?.abort?.());
    $$('[data-signal-forge]', event.target).forEach((forge) => forge._signalForgeController?.abort?.());
  });

})();
