/*
  RIZO — storefront behaviour.

  Commerce first: cart drawer and AJAX add, quick add, the variant picker,
  product media, collection filters, predictive search, recently viewed.
  Then the few small things that make the world answer back: the lens on
  the camo, the footer flame, a release clock. Seasonal atmosphere lives in
  the Event Layer (rizo-event-layer.js), not here.

  Every controller is idempotent and re-runs on shopify:section:load.
*/
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const $ = (selector, context = doc) => context.querySelector(selector);
  const $$ = (selector, context = doc) => Array.from(context.querySelectorAll(selector));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowPower = Boolean(
    connection?.saveData ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  );

  if (lowPower) root.dataset.lowPower = 'true';
  const calm = () => reducedMotion || root.dataset.motion === 'calm';

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
    if (header) root.style.setProperty('--header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`);
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
      if (changed) measureHeader();
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
      element.dataset.count = String(count);
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
    if (copy) copy.textContent = remaining > 0 ? `${money(remaining)} away from free shipping` : 'Free shipping';
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
        heading.textContent = 'Nothing in here yet.';
        const message = doc.createElement('p');
        message.textContent = 'Everything available is in the shop.';
        const link = doc.createElement('a');
        link.className = 'btn btn--solid';
        link.href = shopRoute('collections/all');
        link.textContent = 'Shop';
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
      heading.textContent = 'The cart didn’t load.';
      const copy = doc.createElement('p');
      copy.textContent = 'Open the cart page instead. Nothing was lost.';
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
    if (label) label.textContent = 'Adding…';
    else if (button) button.textContent = 'Adding…';

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
      announce(addedItem.product_title ? `${addedItem.product_title} added to cart.` : 'Added to cart.');
    } catch (error) {
      const message = error.message || 'That didn’t go into the cart. Try again.';
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

  });

  doc.addEventListener('change', (event) => {
    const sort = event.target.closest('[data-sort-select]');
    if (!sort) return;
    const url = new URL(window.location.href);
    url.searchParams.set('sort_by', sort.value);
    window.location.assign(url.toString());
  });

  /* Analytics: every tracked click and commerce step becomes a rizo:* DOM
     event (and a dataLayer push when one exists). */
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
      if (status) status.textContent = product.available ? 'In stock' : 'Sold out';
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
      submit.textContent = 'Choose';
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
          submit.textContent = `Choose ${missing.toLowerCase()}`;
          if (summary) summary.textContent = `Choose ${missing.toLowerCase()} to continue.`;
          return;
        }
        if (!variant || !variant.available) {
          hidden.value = '';
          submit.disabled = true;
          submit.textContent = 'Not available';
          if (summary) summary.textContent = 'That one’s gone. Try another option.';
          return;
        }
        hidden.value = variant.id;
        submit.disabled = false;
        submit.textContent = 'Add to cart';
        if (price) price.textContent = money(variant.price);
        if (summary) summary.textContent = `${selected.join(' / ')} · in stock`;
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
      toast('Sizes didn’t load. Open the product instead.');
      announceError('Sizes didn’t load. Open the product instead.');
    } finally {
      trigger.disabled = false;
    }
  });

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
    action?.addEventListener('click', () => { const selected=$('[data-variant-input]',form); if(selected && !selected.value){ $('[data-option-picker]',form)?.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'}); $('[data-option-button]:not([disabled])',form)?.focus(); announce('Choose a size first.'); return; } form.requestSubmit(); });
  };


  /* Product page, recommendations, recently viewed, predictive search */
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
          if (stickyAction) stickyAction.textContent = 'Choose';
          if (error) error.hidden = true;
          return;
        }

        if (!variant) {
          if (input) input.value = '';
          if (submit) { submit.disabled = true; submit.setAttribute('aria-disabled', 'true'); }
          if (submitLabel) submitLabel.textContent = 'Not available';
          if (summary) summary.textContent = 'That combination doesn’t exist.';
          if (availability) availability.textContent = 'Not available';
          if (error) { error.hidden = false; error.textContent = 'That combination doesn’t exist. Change one option.'; }
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
          : (variant.available ? 'in stock' : 'sold out');
        if (stickyPrice) stickyPrice.textContent = money(variant.price);
        if (stickyVariant) stickyVariant.textContent = selected.join(' / ');
        if (summary) summary.textContent = `${selected.join(' / ')} · ${stockMessage}`;
        if (availability) availability.textContent = lowStock ? `Low stock · ${stockRecord.quantity} left` : (variant.available ? 'In stock' : 'Sold out');
        if (error) error.hidden = true;
        if (submit) { submit.disabled = !variant.available; submit.setAttribute('aria-disabled', String(!variant.available)); }
        if (submitLabel) submitLabel.textContent = variant.available ? 'Add to cart' : 'Sold out';
        if (stickyAction) stickyAction.textContent = variant.available ? 'Add' : 'Sold out';

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
          if (error) { error.hidden = false; error.textContent = 'Choose every option first.'; }
          picker.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
          const firstMissing = groups.find((_, index) => !selected[index]);
          $('[data-option-button]:not([disabled])', firstMissing || picker)?.focus();
          announce('Choose every option first.');
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
          init(element);
        }
      } catch (_) { /* Recommendations are optional. */ }
    });
  };

  const initRecentlyViewed = (container = doc) => {
    $$('[data-recently-viewed]:not([data-initialized])', container).forEach((section) => {
      // Saved only on this device, so people can find their way back.
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
        const strong = doc.createElement('strong');
        strong.textContent = item.title || 'Rizo piece';
        const priceLabel = doc.createElement('b');
        priceLabel.textContent = item.price || '';
        copy.append(strong, priceLabel);
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
        if (status) status.textContent = 'Searching…';
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
            empty.textContent = 'Nothing yet. Press Search to look everywhere.';
            results.append(empty);
          }
          results.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          if (shortcuts) shortcuts.hidden = true;
          if (status) status.textContent = `${items.length} suggestions found.`;
        } catch (error) {
          if (error.name !== 'AbortError' && status) status.textContent = 'Suggestions aren’t loading. Press Search.';
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

  const initFormFeedback = (container = doc) => {
    const feedback = $('[data-form-feedback]', container);
    if (!feedback || feedback.dataset.feedbackFocused === 'true') return;
    feedback.dataset.feedbackFocused = 'true';
    window.requestAnimationFrame(() => feedback.focus({ preventScroll: false }));
  };

  /* Release clock (sections/rizo-release.liquid). A real date or nothing:
     at zero it swaps to the live line instead of sitting on 00. */
  const initReleases = (container = doc) => {
    $$('[data-release]:not([data-release-ready])', container).forEach((module) => {
      module.dataset.releaseReady = 'true';
      const target = Date.parse(module.dataset.date || '');
      if (!Number.isFinite(target)) return;
      const clock = $('[data-release-clock]', module);
      const fields = { days: $('[data-days]', module), hours: $('[data-hours]', module), minutes: $('[data-minutes]', module) };
      const update = () => {
        const remaining = target - Date.now();
        if (remaining <= 0) {
          clock?.remove();
          const heading = $('[data-release-heading]', module);
          if (heading && module.dataset.liveText) heading.textContent = module.dataset.liveText;
          window.clearInterval(module._releaseTimer);
          module._releaseTimer = 0;
          return;
        }
        const values = { days: Math.floor(remaining / 864e5), hours: Math.floor(remaining / 36e5) % 24, minutes: Math.floor(remaining / 6e4) % 60 };
        Object.entries(values).forEach(([key, value]) => { if (fields[key]) fields[key].textContent = String(value).padStart(2, '0'); });
      };
      const start = () => { if (module._releaseTimer || doc.hidden) return; update(); module._releaseTimer = window.setInterval(update, 15000); };
      const stop = () => { window.clearInterval(module._releaseTimer); module._releaseTimer = 0; };
      module._releaseVisibility = () => (doc.hidden ? stop() : start());
      doc.addEventListener('visibilitychange', module._releaseVisibility);
      start();
    });
  };

  /* A lens for looking closer (World → Camo): the pattern is full of faces
     you only find up close. Pointer or finger; no effect on scrolling. */
  const initLenses = (container = doc) => {
    $$('[data-lens]:not([data-lens-ready])', container).forEach((host) => {
      host.dataset.lensReady = 'true';
      const lens = $('.lens', host);
      const image = $('img', host);
      if (!lens || !image) return;
      const zoom = 2.6;
      let frame = 0;
      let point = null;
      const paint = () => {
        frame = 0;
        if (!point) return;
        const rect = host.getBoundingClientRect();
        const x = point.x - rect.left;
        const y = point.y - rect.top;
        lens.style.left = `${x}px`;
        lens.style.top = `${y}px`;
        lens.style.backgroundImage = `url("${image.currentSrc || image.src}")`;
        lens.style.backgroundSize = `${rect.width * zoom}px ${rect.height * zoom}px`;
        // The lens may sit above a finger (CSS), but it always shows what is under it.
        lens.style.backgroundPosition = `${-(x * zoom - lens.offsetWidth / 2)}px ${-(y * zoom - lens.offsetHeight / 2)}px`;
      };
      const move = (event) => {
        point = { x: event.clientX, y: event.clientY };
        host.classList.add('is-looking');
        if (!frame) frame = window.requestAnimationFrame(paint);
      };
      const leave = () => { point = null; host.classList.remove('is-looking'); };
      host.addEventListener('pointermove', move, { passive: true });
      host.addEventListener('pointerdown', move, { passive: true });
      host.addEventListener('pointerleave', leave, { passive: true });
      host.addEventListener('pointercancel', leave, { passive: true });
      host.addEventListener('pointerup', (event) => { if (event.pointerType !== 'mouse') leave(); }, { passive: true });
    });
  };

  /* The flame on the horizon in the footer. Touch it and it flares. */
  doc.addEventListener('click', (event) => {
    const flame = event.target.closest('.foot-sky');
    if (!flame) return;
    const mark = $('.foot-flame', flame);
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    if (Math.abs(event.clientX - (rect.left + rect.width / 2)) > 60 || Math.abs(event.clientY - (rect.top + rect.height / 2)) > 70) return;
    if (!calm() && mark.animate) {
      mark.animate([
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.18, 1.3)', filter: 'brightness(1.8)', offset: .18 },
        { transform: 'scale(.96, 1.04)', filter: 'brightness(1.2)', offset: .5 },
        { transform: 'scale(1)', filter: 'brightness(1)' }
      ], { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    emitRizoEvent('rizo_interaction', { interaction: 'flame' });
  });

  /* The drawing tucked behind the photo goes back the way it came. */
  doc.addEventListener('toggle', (event) => {
    const pocket = event.target;
    if (!(pocket instanceof HTMLDetailsElement) || !pocket.classList.contains('pocket') || pocket.open || calm()) return;
    pocket.classList.add('is-tucking');
    window.clearTimeout(pocket._tuck);
    pocket._tuck = window.setTimeout(() => pocket.classList.remove('is-tucking'), 800);
  }, true);

  /* Everything above, for the page and for any section the theme editor
     reloads. Controllers mark what they've bound, so this never doubles up. */
  const init = (container = doc) => {
    measureHeader();
    updateScrollState();
    initFormFeedback(container);
    initOptionPickers(container);
    initProductMedia(container);
    initRecommendations(container);
    initRecentlyViewed(container);
    initPredictiveSearch(container);
    initProductImpressions(container);
    initStickyAtc(container);
    initReleases(container);
    initLenses(container);
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => init());
  else init();
  doc.addEventListener('shopify:section:load', (event) => init(event.target));

  doc.addEventListener('shopify:section:unload', (event) => {
    $$('[data-media-gallery]', event.target).forEach((gallery) => gallery._mediaObserver?.disconnect());
    event.target._impressionObserver?.disconnect?.();
    $$('[data-predictive-search]', event.target).forEach((search) => search._predictiveController?.abort?.());
    $$('[data-sticky-atc]', event.target).forEach((sticky) => sticky._stickyObserver?.disconnect?.());
    $$('[data-release]', event.target).forEach((module) => {
      window.clearInterval(module._releaseTimer);
      if (module._releaseVisibility) doc.removeEventListener('visibilitychange', module._releaseVisibility);
    });
  });
})();
