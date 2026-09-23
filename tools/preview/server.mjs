// Rizo Portal — local preview harness.
//
// Renders the real theme files (layout, JSON templates, sections, snippets)
// with liquidjs plus a small set of Shopify filters/tags, and mocks the
// storefront endpoints the theme JS calls (cart.js, cart/add.js,
// cart/change.js, products/<handle>.js, Section Rendering API).
//
// It is an approximation of Shopify, built so the Event Layer (and the rest of
// the storefront UI) can be exercised in a real browser without a store.
// It is NOT part of the theme upload.
//
//   node preview/server.mjs            → http://localhost:9292
//
// Query helpers (any page):
//   ?set.<setting_id>=<value>   override a global theme setting for this request
//                               e.g. ?set.event_layer=off&set.event_fog_enabled=false
//   ?design_mode=1              render as the theme editor would (request.design_mode)
//   ?section_id=<id>            Section Rendering API: return one section's HTML
//   ?sections=<type>,<type>     render an ad-hoc page from section types (schema
//                               defaults), e.g. ?sections=rizo-live-hero,rizo-live-products

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Liquid, Tag } from 'liquidjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.resolve(process.env.THEME_DIR || path.join(HERE, '../..'));
const PORT = Number(process.env.PORT || 9292);

const read = (file) => fs.readFileSync(path.join(THEME, file), 'utf8');
const readJSON = (file) => JSON.parse(read(file));
const exists = (file) => fs.existsSync(path.join(THEME, file));

/* ------------------------------------------------------------------ */
/* Mock catalog                                                        */
/* ------------------------------------------------------------------ */

const image = (file, width, height, alt = '') => ({
  id: file,
  src: `/cdn/assets/${file}`,
  url: `/cdn/assets/${file}`,
  width,
  height,
  aspect_ratio: width / height,
  alt,
  toString() { return this.src; }
});

const PHOTOS = [
  image('rizo-founder-full-fit.webp', 900, 1200, 'Model wearing a black Rizo fit'),
  image('rizo-circle-night.webp', 1200, 900, 'Rizo circle at night'),
  image('rizo-circle-gym.webp', 1200, 900, 'Rizo circle in a gym'),
  image('rizo-community-table.webp', 1200, 900, 'Rizo event table'),
  image('rizo-412-underpass.webp', 1200, 900, 'Pittsburgh underpass'),
  image('rizo-circle-pink.webp', 900, 900, 'Rizo pink circle')
];

let variantSeq = 4100;
const makeProduct = (index, { title, handle, price, options = [], variants: variantSpec, available = true }) => {
  const id = 7300 + index;
  const optionsWithValues = options.map((option, position) => ({
    name: option.name,
    position: position + 1,
    values: option.values,
    selected_value: option.values[0]
  }));
  const combos = options.length
    ? options.reduce((acc, option) => acc.flatMap((prefix) => option.values.map((value) => [...prefix, value])), [[]])
    : [['Default Title']];
  const variants = combos.map((combo) => {
    const key = combo.join(' / ');
    const spec = (variantSpec && variantSpec[key]) || {};
    const variantAvailable = available && spec.available !== false;
    variantSeq += 1;
    return {
      id: variantSeq,
      title: key,
      options: combo,
      option1: combo[0] || null,
      option2: combo[1] || null,
      option3: combo[2] || null,
      available: variantAvailable,
      price,
      compare_at_price: null,
      inventory_management: 'shopify',
      inventory_policy: 'deny',
      inventory_quantity: variantAvailable ? (spec.qty ?? 12) : 0,
      url: `/products/${handle}?variant=${variantSeq}`,
      featured_image: null
    };
  });
  const images = [PHOTOS[index % PHOTOS.length], PHOTOS[(index + 1) % PHOTOS.length]];
  return {
    id,
    title,
    handle,
    url: `/products/${handle}`,
    price,
    price_min: price,
    price_max: price,
    price_varies: false,
    compare_at_price_max: 0,
    available: variants.some((variant) => variant.available),
    vendor: 'Rizo Apparel',
    tags: [],
    description: `<p>${title} — founder-made in Pittsburgh. Mock product for local preview.</p>`,
    featured_image: images[0],
    images,
    media: images.map((img, i) => ({ id: `${id}${i}`, media_type: 'image', alt: img.alt, preview_image: img, position: i + 1 })),
    options: options.map((option) => option.name),
    options_with_values: optionsWithValues,
    has_only_default_variant: !options.length,
    variants,
    selected_variant: null,
    selected_or_first_available_variant: variants.find((variant) => variant.available) || variants[0],
    first_available_variant: variants.find((variant) => variant.available) || variants[0],
    metafields: { custom: {} }
  };
};

const SIZES = { name: 'Size', values: ['S', 'M', 'L', 'XL'] };
let PRODUCTS = [
  makeProduct(0, { title: 'Night Signal Hoodie', handle: 'night-signal-hoodie', price: 6800, options: [SIZES], variants: { M: { available: false }, XL: { qty: 3 } } }),
  makeProduct(1, { title: 'Rizo Camo Tee', handle: 'rizo-camo-tee', price: 3400, options: [SIZES, { name: 'Color', values: ['Black', 'Bone'] }], variants: { 'S / Bone': { available: false } } }),
  makeProduct(2, { title: 'Flame Cap', handle: 'flame-cap', price: 2800 }),
  makeProduct(3, { title: '412 Crewneck', handle: '412-crewneck', price: 5600, options: [SIZES], available: false }),
  makeProduct(4, { title: 'Origin File Tee', handle: 'origin-file-tee', price: 3600, options: [SIZES] }),
  makeProduct(5, { title: 'Circle Longsleeve', handle: 'circle-longsleeve', price: 4200, options: [SIZES] })
];
// Opt-in visual fixture from the public Rizo catalog. Tests retain the mock
// catalog above. Shopify never reads this fixture or these local image paths.
if (process.env.RIZO_PREVIEW_CATALOG === 'snapshot') {
  const snapshot = JSON.parse(fs.readFileSync(path.join(HERE, 'catalog-snapshot.json'), 'utf8'));
  PRODUCTS = snapshot.products.map((source, index) => {
    const product = makeProduct(index, { title: source.title, handle: source.handle, price: Math.round(Number(source.variants[0].price) * 100), options: source.options.filter(option => option.name !== 'Title') });
    const images = source.images.map(photo => ({ ...image(photo.file, photo.width, photo.height, source.title), src: `/preview-catalog/${photo.file}`, url: `/preview-catalog/${photo.file}` }));
    const variants = source.variants.map(variant => ({ ...variant, price: Math.round(Number(variant.price) * 100), options: [variant.option1, variant.option2, variant.option3].filter(Boolean), inventory_management: null, inventory_quantity: null, inventory_policy: 'deny', url: `/products/${source.handle}?variant=${variant.id}`, featured_image: null }));
    return { ...product, id: source.id, description: source.body_html, images, featured_image: images[0], media: images.map((photo, i) => ({ id: `${source.id}${i}`, media_type: 'image', alt: photo.alt, preview_image: photo, position: i + 1 })), variants, available: variants.some(v => v.available), selected_or_first_available_variant: variants.find(v => v.available) || variants[0], first_available_variant: variants.find(v => v.available) || variants[0] };
  });
}
const productByHandle = (handle) => PRODUCTS.find((product) => product.handle === handle);
const variantById = (id) => {
  for (const product of PRODUCTS) {
    const variant = product.variants.find((item) => String(item.id) === String(id));
    if (variant) return { product, variant };
  }
  return null;
};

const COLLECTION_ALL = {
  id: 1,
  title: 'All pieces',
  handle: 'all',
  url: '/collections/all',
  description: '',
  featured_image: null,
  products: PRODUCTS,
  all_products_count: PRODUCTS.length,
  products_count: PRODUCTS.length,
  filters: [],
  sort_by: 'manual',
  default_sort_by: 'manual',
  sort_options: [
    { name: 'Featured', value: 'manual' },
    { name: 'Price, low to high', value: 'price-ascending' }
  ]
};

const MENU = {
  handle: 'main-menu',
  links: [
    { title: 'Shop', url: '/collections/all', current: false, child_active: false, links: [] },
    { title: 'World', url: '/pages/world', current: false, child_active: false, links: [] },
    { title: 'Origin', url: '/pages/about', current: false, child_active: false, links: [] },
    { title: 'Contact', url: '/pages/contact', current: false, child_active: false, links: [] }
  ]
};

/* ------------------------------------------------------------------ */
/* Mock cart (per browser, keyed by cookie)                             */
/* ------------------------------------------------------------------ */

const carts = new Map();
const cartFor = (sid) => {
  if (!carts.has(sid)) carts.set(sid, []);
  return carts.get(sid);
};
const cartJSON = (lines) => {
  const items = lines.map((line) => {
    const { product, variant } = variantById(line.variant_id);
    return {
      id: variant.id,
      key: `${variant.id}:mock`,
      variant_id: variant.id,
      product_id: product.id,
      title: product.has_only_default_variant ? product.title : `${product.title} - ${variant.title}`,
      product_title: product.title,
      variant_title: product.has_only_default_variant ? null : variant.title,
      quantity: line.quantity,
      price: variant.price,
      final_price: variant.price,
      line_price: variant.price * line.quantity,
      final_line_price: variant.price * line.quantity,
      url: variant.url,
      image: product.featured_image.src,
      handle: product.handle
    };
  });
  return {
    token: 'mock',
    note: null,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    total_price: items.reduce((sum, item) => sum + item.final_line_price, 0),
    currency: 'USD',
    items
  };
};
const cartLiquid = (lines) => {
  const json = cartJSON(lines);
  return {
    ...json,
    cart_level_discount_applications: [],
    items: json.items.map((item) => {
      const { product, variant } = variantById(item.variant_id);
      return {
        ...item,
        image: product.featured_image,
        product,
        variant,
        properties: {},
        line_level_discount_allocations: [],
        selling_plan_allocation: null,
        url_to_remove: `/cart/change?id=${item.key}&quantity=0`
      };
    })
  };
};

/* ------------------------------------------------------------------ */
/* Theme settings                                                       */
/* ------------------------------------------------------------------ */

const settingsSchema = () => readJSON('config/settings_schema.json');
const settingDefinitions = () => {
  const map = new Map();
  for (const group of settingsSchema()) for (const setting of group.settings || []) if (setting.id) map.set(setting.id, setting);
  return map;
};

const coerce = (definition, raw) => {
  if (raw === undefined || raw === null) return raw;
  switch (definition?.type) {
    case 'checkbox': return raw === true || raw === 'true' || raw === '1';
    case 'range':
    case 'number': return Number(raw);
    case 'image_picker': return raw ? image(String(raw), 800, 800, '') : null;
    case 'link_list': return MENU;
    case 'collection': return raw ? COLLECTION_ALL : null;
    case 'product': return raw ? productByHandle(raw) || null : null;
    case 'url': return typeof raw === 'string' ? raw.replace('shopify://collections/', '/collections/').replace('shopify://products/', '/products/') : raw;
    default: return raw;
  }
};

const globalSettings = (overrides) => {
  const definitions = settingDefinitions();
  const data = readJSON('config/settings_data.json');
  const current = typeof data.current === 'string' ? data.presets[data.current] : data.current;
  const values = {};
  for (const [id, definition] of definitions) values[id] = coerce(definition, definition.default);
  for (const [id, value] of Object.entries(current || {})) values[id] = coerce(definitions.get(id), value);
  for (const [id, value] of Object.entries(overrides)) values[id] = coerce(definitions.get(id), value);
  return values;
};

/* ------------------------------------------------------------------ */
/* Liquid engine                                                        */
/* ------------------------------------------------------------------ */

const engine = new Liquid({
  root: [path.join(THEME, 'snippets')],
  partials: [path.join(THEME, 'snippets')],
  extname: '.liquid',
  cache: false,
  strictFilters: false,
  strictVariables: false,
  ownPropertyOnly: false
});

const kwargs = (args) => {
  const out = {};
  const positional = [];
  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === 'string') out[arg[0]] = arg[1];
    else positional.push(arg);
  }
  return { out, positional };
};
const escapeAttr = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Shopify's image_url accepts images, media (via preview_image) and variants/products (via their image).
const imageSrc = (value) => (value && typeof value === 'object' ? value.src || value.url || imageSrc(value.preview_image || value.featured_image || value.image) : value) || '';

engine.registerFilter('asset_url', (file) => `/cdn/assets/${file}`);
engine.registerFilter('preload_tag', (url, ...pairs) => `<link rel="preload" href="${url}" ${pairs.map(([key, value]) => `${key}="${value}"`).join(' ')}>`);
engine.registerFilter('asset_img_url', (file) => `/cdn/assets/${file}`);
engine.registerFilter('file_url', (file) => `/cdn/files/${file}`);
engine.registerFilter('stylesheet_tag', (url) => `<link href="${url}" rel="stylesheet" type="text/css" media="all">`);
engine.registerFilter('script_tag', (url) => `<script src="${url}" type="text/javascript"></script>`);
engine.registerFilter('image_url', (value, ...args) => {
  const { out } = kwargs(args);
  const src = imageSrc(value);
  if (!src) return '';
  return out.width ? `${src}${src.includes('?') ? '&' : '?'}width=${out.width}` : src;
});
engine.registerFilter('img_url', (value) => imageSrc(value));
engine.registerFilter('image_tag', (src, ...args) => {
  const { out } = kwargs(args);
  const attrs = [`src="${escapeAttr(src)}"`];
  if (out.widths) {
    const base = String(src).split('?')[0];
    attrs.push(`srcset="${String(out.widths).split(',').map((w) => `${base}?width=${w.trim()} ${w.trim()}w`).join(', ')}"`);
  }
  for (const key of ['sizes', 'loading', 'fetchpriority', 'class', 'width', 'height', 'id']) if (out[key] !== undefined && out[key] !== null) attrs.push(`${key}="${escapeAttr(out[key])}"`);
  attrs.push(`alt="${escapeAttr(out.alt ?? '')}"`);
  return `<img ${attrs.join(' ')}>`;
});
engine.registerFilter('media_tag', (media) => (media?.preview_image ? `<img src="${imageSrc(media.preview_image)}" alt="${escapeAttr(media.alt)}" width="${media.preview_image.width}" height="${media.preview_image.height}">` : ''));
engine.registerFilter('video_tag', () => '');
engine.registerFilter('external_video_tag', () => '');
engine.registerFilter('metafield_tag', (value) => (value && typeof value === 'object' ? value.value ?? '' : value ?? ''));
engine.registerFilter('money', (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`);
engine.registerFilter('money_with_currency', (cents) => `$${(Number(cents || 0) / 100).toFixed(2)} USD`);
engine.registerFilter('money_without_currency', (cents) => (Number(cents || 0) / 100).toFixed(2));
const handleize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
engine.registerFilter('handle', handleize);
engine.registerFilter('handleize', handleize);
engine.registerFilter('default_errors', () => 'Please check the form and try again.');
engine.registerFilter('default_pagination', () => '');
engine.registerFilter('payment_terms', () => '');
engine.registerFilter('payment_button', () => '<div class="shopify-payment-button" data-mock-payment-button></div>');
engine.registerFilter('structured_data', () => '');
engine.registerFilter('within', (url) => url);
engine.registerFilter('link_to', (text, url) => `<a href="${url}">${text}</a>`);
engine.registerFilter('t', (key) => {
  try {
    const locale = readJSON('locales/en.default.json');
    return String(key).split('.').reduce((node, part) => node?.[part], locale) ?? key;
  } catch (_) { return key; }
});

// {% schema %} … {% endschema %}: metadata only.
engine.registerTag('schema', class extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    while (remainTokens.length) {
      const next = remainTokens.shift();
      if (next.name === 'endschema') return;
    }
    throw new Error('schema tag not closed');
  }
  render() { return ''; }
});

// Simple block tags that wrap their body.
const blockTag = (name, wrap) => class extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    this.args = token.args;
    this.tpls = [];
    let closed = false;
    const stream = parser.parseStream(remainTokens)
      .on(`tag:end${name}`, () => { closed = true; stream.stop(); })
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { if (!closed) throw new Error(`tag ${name} not closed`); });
    stream.start();
  }
  * render(ctx, emitter) {
    const inner = yield this.liquid.renderer.renderTemplates(this.tpls, ctx);
    emitter.write(wrap(inner, this, ctx));
  }
};
engine.registerTag('style', blockTag('style', (inner) => `<style data-shopify>${inner}</style>`));
engine.registerTag('javascript', blockTag('javascript', (inner) => `<script>${inner}</script>`));
engine.registerTag('stylesheet', blockTag('stylesheet', (inner) => `<style>${inner}</style>`));

// {% form 'type', object, key: value, data-x: '' %}
engine.registerTag('form', class extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    this.args = token.args;
    this.tpls = [];
    let closed = false;
    const stream = parser.parseStream(remainTokens)
      .on('tag:endform', () => { closed = true; stream.stop(); })
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { if (!closed) throw new Error('form tag not closed'); });
    stream.start();
  }
  * render(ctx, emitter) {
    const parts = this.args.split(',').map((part) => part.trim()).filter(Boolean);
    const type = String(yield this.liquid.evalValue(parts.shift(), ctx));
    const attrs = {};
    let object = null;
    for (const part of parts) {
      const match = part.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) attrs[match[1]] = yield this.liquid.evalValue(match[2], ctx);
      else object = yield this.liquid.evalValue(part, ctx);
    }
    const action = { product: '/cart/add', customer: '/contact#newsletter', contact: '/contact#contact_form' }[type] || '/';
    const attrText = Object.entries(attrs).map(([key, value]) => `${key}="${escapeAttr(value)}"`).join(' ');
    emitter.write(`<form method="post" action="${action}" accept-charset="UTF-8" ${attrText}${type === 'product' ? ' enctype="multipart/form-data"' : ''}><input type="hidden" name="form_type" value="${type}"><input type="hidden" name="utf8" value="✓">`);
    ctx.push({ form: { errors: null, posted_successfully: false, 'posted_successfully?': false, email: '', name: '', body: '' }, product: object || ctx.getSync(['product']) });
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    ctx.pop();
    emitter.write('</form>');
  }
});

// {% paginate collection.products by n %}
engine.registerTag('paginate', class extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    this.args = token.args;
    this.tpls = [];
    let closed = false;
    const stream = parser.parseStream(remainTokens)
      .on('tag:endpaginate', () => { closed = true; stream.stop(); })
      .on('template', (tpl) => this.tpls.push(tpl))
      .on('end', () => { if (!closed) throw new Error('paginate tag not closed'); });
    stream.start();
  }
  * render(ctx, emitter) {
    ctx.push({ paginate: { pages: 1, current_page: 1, current_offset: 0, items: PRODUCTS.length, parts: [], previous: null, next: null, page_size: 50 } });
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    ctx.pop();
  }
});

// {% sections 'group' %} and {% section 'name' %} are bound per request.
engine.registerTag('sections', class extends Tag {
  constructor(token, remainTokens, liquid) { super(token, remainTokens, liquid); this.arg = token.args.trim().replace(/^['"]|['"]$/g, ''); }
  * render(ctx, emitter) {
    const request = ctx.getSync(['__request']);
    emitter.write(yield request.renderGroup(this.arg));
  }
});
engine.registerTag('section', class extends Tag {
  constructor(token, remainTokens, liquid) { super(token, remainTokens, liquid); this.arg = token.args.trim().replace(/^['"]|['"]$/g, ''); }
  * render(ctx, emitter) {
    const request = ctx.getSync(['__request']);
    emitter.write(yield request.renderSection(this.arg, this.arg, {}));
  }
});

/* ------------------------------------------------------------------ */
/* Section rendering                                                    */
/* ------------------------------------------------------------------ */

const SCHEMA_RE = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
const sectionSchema = (type) => {
  const match = read(`sections/${type}.liquid`).match(SCHEMA_RE);
  return match ? JSON.parse(match[1]) : {};
};

const withDefaults = (definitions = [], values = {}) => {
  const out = {};
  for (const definition of definitions) if (definition.id) out[definition.id] = coerce(definition, definition.default ?? null);
  for (const [id, value] of Object.entries(values || {})) out[id] = coerce(definitions.find((definition) => definition.id === id), value);
  return out;
};

class RequestContext {
  constructor({ url, sid, pageType, template, globals }) {
    this.url = url;
    this.sid = sid;
    this.pageType = pageType;
    this.template = template;
    this.globals = globals;
  }

  async renderSection(id, type, data) {
    if (!exists(`sections/${type}.liquid`)) return `<!-- missing section ${type} -->`;
    const schema = sectionSchema(type);
    const blockOrder = data.block_order || Object.keys(data.blocks || {});
    const blocks = blockOrder.map((blockId) => {
      const block = data.blocks[blockId];
      const blockSchema = (schema.blocks || []).find((item) => item.type === block.type) || {};
      return { id: blockId, type: block.type, settings: withDefaults(blockSchema.settings, block.settings), shopify_attributes: `data-shopify-editor-block="${blockId}"` };
    });
    const values = { ...data.settings };
    for (const [key, value] of this.url.searchParams) {
      const prefix = `section.${type}.`;
      if (key.startsWith(prefix)) values[key.slice(prefix.length)] = value;
    }
    const section = { id, settings: withDefaults(schema.settings, values), blocks, index: 1 };
    const html = await engine.parseAndRender(read(`sections/${type}.liquid`), { section }, { globals: { ...this.globals, __request: this } });
    const tag = schema.tag || 'div';
    return `<${tag} id="shopify-section-${id}" class="shopify-section${schema.class ? ` ${schema.class}` : ''}">${html}</${tag}>`;
  }

  async renderGroup(name) {
    const group = readJSON(`sections/${name}.json`);
    const out = [];
    for (const id of group.order) out.push(await this.renderSection(`sections--mock__${id}`, group.sections[id].type, group.sections[id]));
    return out.join('\n');
  }

  async renderTemplateSections(onlyId) {
    const adHoc = this.url.searchParams.get('sections');
    const template = adHoc
      ? { sections: Object.fromEntries(adHoc.split(',').map((type, index) => [`adhoc-${index}`, { type: type.trim(), settings: type.trim() === 'rizo-live-products' ? { collection: 'all' } : {} }])), order: adHoc.split(',').map((_, index) => `adhoc-${index}`) }
      : readJSON(`templates/${this.template}.json`);
    const out = [];
    for (const id of template.order) {
      if (template.sections[id].disabled) continue;
      if (onlyId && id !== onlyId) continue;
      out.push(await this.renderSection(id, template.sections[id].type, template.sections[id]));
    }
    return out.join('\n');
  }
}

/* ------------------------------------------------------------------ */
/* Routing                                                              */
/* ------------------------------------------------------------------ */

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

const resolveRoute = (pathname) => {
  if (pathname === '/') return { pageType: 'index', template: 'index' };
  let match = pathname.match(/^\/products\/([^/.]+)$/);
  if (match && productByHandle(match[1])) return { pageType: 'product', template: 'product', product: productByHandle(match[1]) };
  match = pathname.match(/^\/collections\/([^/.]+)$/);
  if (match) return { pageType: 'collection', template: 'collection', collection: COLLECTION_ALL };
  if (pathname === '/collections') return { pageType: 'list-collections', template: 'list-collections' };
  if (pathname === '/cart') return { pageType: 'cart', template: 'cart' };
  if (pathname === '/search') return { pageType: 'search', template: 'search' };
  match = pathname.match(/^\/pages\/([^/.]+)$/);
  if (match) {
    const suffix = exists(`templates/page.${match[1]}.json`) ? match[1] : null;
    return { pageType: 'page', template: suffix ? `page.${suffix}` : 'page', page: { title: match[1], handle: match[1], content: '<p>Mock page content.</p>' } };
  }
  return { pageType: '404', template: '404', status: 404 };
};

const sessionId = (req, res) => {
  const cookie = /mockcart=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (cookie) return cookie[1];
  const sid = crypto.randomBytes(8).toString('hex');
  res.setHeader('Set-Cookie', `mockcart=${sid}; Path=/; SameSite=Lax`);
  return sid;
};

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});

const formFields = async (req, body) => {
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) return JSON.parse(body.toString() || '{}');
  const request = new Request('http://local/', { method: 'POST', headers: { 'content-type': type }, body });
  const data = await request.formData();
  return Object.fromEntries(data.entries());
};

const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const { pathname } = url;
    const sid = sessionId(req, res);
    const lines = cartFor(sid);

    if (pathname.startsWith('/preview-catalog/')) {
      const file = path.join(HERE, 'catalog-images', path.basename(pathname));
      if (!fs.existsSync(file)) return send(res, 404, 'Not found');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    }
    if (pathname.startsWith('/cdn/assets/')) {
      const file = path.join(THEME, 'assets', path.basename(pathname));
      if (!fs.existsSync(file)) return send(res, 404, 'missing asset', 'text/plain');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    }
    if (pathname === '/favicon.ico') return send(res, 204, '');

    if (pathname === '/cart.js') return send(res, 200, JSON.stringify(cartJSON(lines)), 'application/json');
    if (pathname === '/cart/add.js' || pathname === '/cart/add') {
      const fields = await formFields(req, await readBody(req));
      const found = variantById(fields.id);
      if (!found || !found.variant.available) return send(res, 422, JSON.stringify({ status: 422, description: 'That size is sold out.' }), 'application/json');
      const quantity = Number(fields.quantity || 1);
      const line = lines.find((item) => String(item.variant_id) === String(fields.id));
      if (line) line.quantity += quantity; else lines.push({ variant_id: found.variant.id, quantity });
      if (pathname === '/cart/add') return send(res, 302, '', 'text/plain', { Location: '/cart' });
      const item = cartJSON(lines).items.find((entry) => String(entry.variant_id) === String(fields.id));
      return send(res, 200, JSON.stringify(item), 'application/json');
    }
    if (pathname === '/cart/change.js') {
      const fields = await formFields(req, await readBody(req));
      const variantId = String(fields.id).split(':')[0];
      const index = lines.findIndex((item) => String(item.variant_id) === variantId);
      if (index >= 0) {
        if (Number(fields.quantity) <= 0) lines.splice(index, 1); else lines[index].quantity = Number(fields.quantity);
      }
      return send(res, 200, JSON.stringify(cartJSON(lines)), 'application/json');
    }
    if (pathname === '/cart/clear.js') { lines.length = 0; return send(res, 200, JSON.stringify(cartJSON(lines)), 'application/json'); }
    if (pathname === '/cart' && req.method === 'POST') return send(res, 200, '<!doctype html><title>Mock checkout</title><h1 data-mock-checkout>Mock checkout</h1>');
    let match = pathname.match(/^\/products\/([^/]+)\.js$/);
    if (match) {
      const product = productByHandle(match[1]);
      if (!product) return send(res, 404, '{}', 'application/json');
      return send(res, 200, JSON.stringify({ ...product, featured_image: product.featured_image.src, images: product.images.map((img) => img.src), media: undefined }), 'application/json');
    }
    if (pathname.startsWith('/search/suggest')) return send(res, 200, JSON.stringify({ resources: { results: { products: [], collections: [], pages: [], queries: [] } } }), 'application/json');
    if (pathname.startsWith('/recommendations/products')) return send(res, 200, '<div></div>');

    // Storefront pages
    const route = resolveRoute(pathname);
    const overrides = {};
    for (const [key, value] of url.searchParams) if (key.startsWith('set.')) overrides[key.slice(4)] = value;
    const designMode = url.searchParams.get('design_mode') === '1';
    const templateName = route.template;
    const [name, suffix] = templateName.split('.');
    const globals = {
      settings: globalSettings(overrides),
      shop: { name: 'Rizo Apparel', url: `http://localhost:${PORT}`, customer_accounts_enabled: false, refund_policy: { url: '/policies/refund-policy', title: 'Refund policy' } },
      routes: { root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add', cart_change_url: '/cart/change', account_url: '/account', collections_url: '/collections', all_products_collection_url: '/collections/all', search_url: '/search', predictive_search_url: '/search/suggest', product_recommendations_url: '/recommendations/products' },
      request: { design_mode: designMode, page_type: route.pageType, path: pathname, host: `localhost:${PORT}`, locale: { iso_code: 'en' } },
      template: { name, suffix: suffix || null, directory: null },
      cart: cartLiquid(lines),
      customer: null,
      product: route.product || null,
      collection: route.collection || null,
      collections: { all: COLLECTION_ALL },
      all_products: Object.fromEntries(PRODUCTS.map((product) => [product.handle, product])),
      linklists: { 'main-menu': MENU },
      page: route.page || null,
      search: { performed: false, results: [], results_count: 0, terms: '' },
      recommendations: { performed: false, products: [], products_count: 0 },
      canonical_url: `http://localhost:${PORT}${pathname}`,
      page_title: route.product?.title || route.page?.title || 'Rizo World',
      page_description: '',
      current_tags: null,
      current_page: 1
    };
    const request = new RequestContext({ url, sid, pageType: route.pageType, template: templateName, globals });

    const sectionId = url.searchParams.get('section_id');
    if (sectionId) return send(res, 200, await request.renderTemplateSections(sectionId));

    const contentForLayout = await request.renderTemplateSections();
    const contentForHeader = `<script>window.Shopify = { shop: 'rizo-mock.myshopify.com', routes: { root: '/' }, currency: { active: 'USD', rate: '1.0' }, designMode: ${designMode} };</script>`;
    // Shopify objects are global: visible inside {% render %} snippets too.
    const html = await engine.parseAndRender(read('layout/theme.liquid'), {
      content_for_header: contentForHeader,
      content_for_layout: contentForLayout
    }, { globals: { ...globals, __request: request } });
    return send(res, route.status || 200, html);
  } catch (error) {
    console.error(error);
    send(res, 500, `<pre>${escapeAttr(error.stack || error.message)}</pre>`);
  }
});

server.listen(PORT, () => console.log(`Rizo preview → http://localhost:${PORT}  (theme: ${THEME})`));
