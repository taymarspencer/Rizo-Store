// Keeps the "Art" block identical in every section that hosts art layers.
//
// Shopify needs each section to declare its own block schema, so the same
// definition lives in many files. The source of truth is art-block.json;
// this script writes it into each section listed below.
//
//   node schema/sync-art.mjs           update the sections
//   node schema/sync-art.mjs --check   fail if any section is out of date
//
// To give another section art layers: add it to SECTIONS, run this, and
// render {% render 'rizo-art', section: section %} as the first child of
// its positioned element (see snippets/rizo-art.liquid).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.resolve(HERE, '../..');
export const SECTIONS = [
  'rizo-hero', 'rizo-page-head', 'rizo-story', 'rizo-gallery', 'rizo-artifacts', 'rizo-interlude',
  'rizo-text', 'rizo-products', 'rizo-signup', 'rizo-release', 'rizo-outside', 'rizo-footer',
  'main-product', 'main-collection', 'main-page', 'main-404'
];

const art = JSON.parse(fs.readFileSync(path.join(HERE, 'art-block.json'), 'utf8'));

/* House style: one setting per line, select options one per line. */
const inline = (value) => {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${inline(item)}`).join(', ')} }`;
  return JSON.stringify(value);
};
const printSetting = (setting, pad) => {
  if (!setting.options) return `${pad}${inline(setting)}`;
  const { options, ...rest } = setting;
  const head = inline(rest).slice(0, -2);
  return `${pad}${head}, "options": [\n${options.map((option) => `${pad}  ${inline(option)}`).join(',\n')}\n${pad}] }`;
};
const printBlock = (pad) => {
  const { settings, ...rest } = art;
  const lines = Object.entries(rest).map(([key, value]) => `${pad}  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  return `${pad}{\n${lines.join('\n')}\n${pad}  "settings": [\n${settings.map((setting) => printSetting(setting, `${pad}    `)).join(',\n')}\n${pad}  ]\n${pad}}`;
};

/* Index of the bracket that closes the one at `open`, skipping strings. */
const closing = (text, open) => {
  const pairs = { '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      for (i += 1; i < text.length && text[i] !== '"'; i += 1) if (text[i] === '\\') i += 1;
    } else if (pairs[char]) stack.push(pairs[char]);
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) throw new Error(`Unbalanced ${char} at ${i}`);
      if (!stack.length) return i;
    }
  }
  throw new Error('No closing bracket');
};

const SCHEMA = /(\{%-?\s*schema\s*-?%\})([\s\S]*?)(\{%-?\s*endschema\s*-?%\})/;

export const syncSchema = (schema) => {
  const block = printBlock('    ');
  const existing = schema.search(/\{\s*"type"\s*:\s*"art"/);
  if (existing >= 0) {
    const start = schema.lastIndexOf('\n', existing) + 1;
    return schema.slice(0, start) + block + schema.slice(closing(schema, existing) + 1);
  }
  const blocks = schema.search(/"blocks"\s*:\s*\[/);
  if (blocks >= 0) {
    const open = schema.indexOf('[', blocks);
    const end = closing(schema, open);
    const inner = schema.slice(open + 1, end).replace(/\s+$/, '');
    return `${schema.slice(0, open + 1)}${inner}${inner.trim() ? ',' : ''}\n${block}\n  ${schema.slice(end)}`;
  }
  const presets = schema.search(/"presets"\s*:/);
  if (presets >= 0) return `${schema.slice(0, presets)}"blocks": [\n${block}\n  ],\n  ${schema.slice(presets)}`;
  const settings = schema.search(/"settings"\s*:\s*\[/);
  const end = closing(schema, schema.indexOf('[', settings));
  return `${schema.slice(0, end + 1)},\n  "blocks": [\n${block}\n  ]${schema.slice(end + 1)}`;
};

const check = process.argv.includes('--check');
let stale = 0;
for (const name of SECTIONS) {
  const file = path.join(THEME, 'sections', `${name}.liquid`);
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(SCHEMA);
  if (!match) throw new Error(`${name}: no schema`);
  const next = source.replace(SCHEMA, (_, open, body, close) => `${open}${syncSchema(body)}${close}`);
  JSON.parse(next.match(SCHEMA)[2]); // must still be valid JSON
  if (next === source) continue;
  stale += 1;
  if (check) console.error(`Art block out of date in sections/${name}.liquid`);
  else { fs.writeFileSync(file, next); console.log(`updated sections/${name}.liquid`); }
}
if (check && stale) {
  console.error('Run: node schema/sync-art.mjs');
  process.exit(1);
}
if (check) console.log(`Art block in sync across ${SECTIONS.length} sections.`);
