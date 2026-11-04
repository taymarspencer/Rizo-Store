import fs from 'node:fs';
import { API_VERSION, FIELDS, inspect, ensureDefinitions, buildPlan, applySandboxPlan } from './contract.mjs';

const args = process.argv.slice(2);
const mode = args[0] || 'definitions';
const option = (name) => args[args.indexOf(name) + 1];
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const output = (value) => {
  const text = JSON.stringify(value, null, 2) + '\n';
  if (args.includes('--out')) fs.writeFileSync(option('--out'), text, { mode: 0o600 });
  else process.stdout.write(text);
};

if (args.includes('--help')) {
  console.log(`RIZO OPS safe setup (Admin API ${API_VERSION})
SHOPIFY_SHOP=<canonical>.myshopify.com SHOPIFY_ADMIN_TOKEN=<server-side-token>
  node ops/setup.mjs inspect [--out snapshot.json]
  node ops/setup.mjs definitions                         # read-only plan
  node ops/setup.mjs definitions --apply --expect-shop <Shop GID>
  node ops/setup.mjs plan --values values.json --out plan.json
  node ops/setup.mjs apply --plan plan.json --sandbox --expect-shop <Shop GID>
Values apply is sandbox-only and rejects the real Rizo shop. SHOP values are storewide.
Definitions are merchant-owned, storefront API access NONE, with no values created.
Never commit token, snapshot, or value-plan files. No inventory or theme writes exist.`);
  process.exit(0);
}

try {
  if (!['inspect', 'definitions', 'plan', 'apply'].includes(mode)) throw new Error('Unknown mode; use --help');
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop || '') || !token) throw new Error('Set SHOPIFY_SHOP and SHOPIFY_ADMIN_TOKEN; use --help for offline usage');
  const client = async (query, variables = {}) => {
    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Shopify HTTP ${response.status}; no automatic mutation retry`);
    const served = response.headers.get('x-shopify-api-version');
    if (served !== API_VERSION) throw new Error(`Expected API ${API_VERSION}, received ${served || 'no version header'}`);
    const result = await response.json();
    if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
    return result.data;
  };
  const snapshot = await inspect(client);
  if (snapshot.shop.myshopifyDomain !== shop) throw new Error('Canonical shop domain mismatch');
  if (args.includes('--apply') || mode === 'apply') {
    if (!args.includes('--expect-shop') || option('--expect-shop') !== snapshot.shop.id) throw new Error('An exact --expect-shop GID is required for writes');
  }
  if (mode === 'inspect') output(snapshot);
  if (mode === 'definitions') output(await ensureDefinitions(client, snapshot, { apply: args.includes('--apply') }));
  if (mode === 'plan') {
    if (!args.includes('--values')) throw new Error('Provide --values values.json');
    output(buildPlan(snapshot, readJSON(option('--values'))));
  }
  if (mode === 'apply') {
    if (!args.includes('--sandbox') || !args.includes('--plan')) throw new Error('Provide --sandbox --plan plan.json');
    output(await applySandboxPlan(client, readJSON(option('--plan')), option('--expect-shop')));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
