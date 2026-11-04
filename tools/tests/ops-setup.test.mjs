import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, buildPlan, ensureDefinitions, applySandboxPlan, INSPECT } from '../ops/contract.mjs';

const snapshot = () => ({
  shop: { id: 'gid://shopify/Shop/123', myshopifyDomain: 'rizo-ops-test.myshopify.com', primaryDomain: { host: 'rizo-ops-test.myshopify.com' }, metafields: { nodes: [], pageInfo: { hasNextPage: false } } },
  metafieldDefinitions: { nodes: FIELDS.map((field) => ({ ...field, namespace: 'rizo_ops', ownerType: 'SHOP', type: { name: field.type } })), pageInfo: { hasNextPage: false } }
});

test('definition dry run cannot create values or definitions', async () => {
  const state = snapshot(); state.metafieldDefinitions.nodes = [];
  const plan = await ensureDefinitions(() => { throw new Error('Unexpected network mutation'); }, state);
  assert.equal(plan.dryRun, true); assert.equal(plan.missing.length, 7);
});

test('wrong definition types and existing unstructured values stop setup', async () => {
  const state = snapshot(); state.metafieldDefinitions.nodes[0].type.name = 'json';
  assert.throws(() => buildPlan(state, { theme_enabled: true }), /Definition mismatch/);
  state.metafieldDefinitions.nodes = [];
  state.shop.metafields.nodes.push({ key: 'hero_heading', value: 'Merchant copy' });
  await assert.rejects(ensureDefinitions(() => {}, state, { apply: true }), /Unstructured merchant value/);
});

test('plans require typed allowlisted values and explicit create-only CAS', () => {
  assert.throws(() => buildPlan(snapshot(), { inventory: 10 }), /Unknown control/);
  assert.throws(() => buildPlan(snapshot(), { theme_enabled: 'true' }), /boolean/);
  assert.throws(() => buildPlan(snapshot(), { featured_product: 'flame-cap' }), /Product GID/);
  assert.throws(() => buildPlan(snapshot(), { hero_heading: 'one\ntwo' }), /one line/);
  const plan = buildPlan(snapshot(), { hero_heading: 'RIZO', theme_enabled: false });
  assert.equal(plan.changes[0].compareDigest, null); assert.equal(plan.changes[1].value, 'false');
});

test('stale edits fail before a write and original compareDigest reaches Shopify', async () => {
  const state = snapshot(); state.shop.metafields.nodes = [{ key: 'hero_heading', type: 'single_line_text_field', value: 'Before', compareDigest: 'old' }];
  const plan = buildPlan(state, { hero_heading: 'After' });
  state.shop.metafields.nodes[0].compareDigest = 'new';
  await assert.rejects(applySandboxPlan(async (query) => { assert.equal(query, INSPECT); return state; }, plan, state.shop.id), /Stale plan/);
  state.shop.metafields.nodes[0].compareDigest = 'old';
  let writes = 0;
  const result = await applySandboxPlan(async (query, variables) => {
    if (query === INSPECT) return state;
    writes++; assert.equal(variables.metafields[0].compareDigest, 'old');
    state.shop.metafields.nodes = [{ ...variables.metafields[0], compareDigest: 'after' }];
    return { metafieldsSet: { userErrors: [] } };
  }, plan, state.shop.id);
  assert.equal(writes, 1); assert.deepEqual(result.changed, ['hero_heading']);
});

test('production Rizo rejects every sample value write, including a claimed sandbox', async () => {
  const state = snapshot(); state.shop.id = 'gid://shopify/Shop/27906474062';
  const plan = buildPlan(state, { theme_enabled: false });
  await assert.rejects(applySandboxPlan(async (query) => { assert.equal(query, INSPECT); return state; }, plan, state.shop.id), /production Rizo/);
});

test('concurrent API conflict and failed read-back are never reported as success', async () => {
  const state = snapshot(); const plan = buildPlan(state, { hero_heading: 'RIZO' });
  await assert.rejects(applySandboxPlan(async (query) => query === INSPECT ? state : { metafieldsSet: { userErrors: [{ code: 'INVALID_COMPARE_DIGEST', message: 'Conflict' }] } }, plan, state.shop.id), /Conflict/);
  await assert.rejects(applySandboxPlan(async (query) => query === INSPECT ? state : { metafieldsSet: { userErrors: [] } }, plan, state.shop.id), /Read-after-write/);
});
