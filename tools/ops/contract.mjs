export const API_VERSION = '2026-10';
export const NAMESPACE = 'rizo_ops';
export const FIELDS = [
  { key: 'theme_enabled', type: 'boolean', name: 'RIZO OPS theme enabled' },
  { key: 'hero_heading', type: 'single_line_text_field', name: 'RIZO OPS hero heading' },
  { key: 'hero_intro', type: 'multi_line_text_field', name: 'RIZO OPS hero introduction' },
  { key: 'hero_shop_label', type: 'single_line_text_field', name: 'RIZO OPS shop button label' },
  { key: 'announcement_text', type: 'single_line_text_field', name: 'RIZO OPS announcement' },
  { key: 'home_collection', type: 'collection_reference', name: 'RIZO OPS homepage collection' },
  { key: 'featured_product', type: 'product_reference', name: 'RIZO OPS featured product' }
];

export const INSPECT = `query OpsInspect {
  shop { id myshopifyDomain primaryDomain { host }
    metafields(first:100,namespace:"rizo_ops") {
      nodes { key type value compareDigest } pageInfo { hasNextPage endCursor }
    }
  }
  metafieldDefinitions(first:100,ownerType:SHOP,namespace:"rizo_ops") {
    nodes { id key namespace ownerType type { name } access { admin storefront } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export const CREATE_DEFINITION = `mutation OpsDefinition($definition:MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition:$definition) {
    createdDefinition { id key type { name } }
    userErrors { field message code }
  }
}`;

export const SET_VALUES = `mutation OpsSet($metafields:[MetafieldsSetInput!]!) {
  metafieldsSet(metafields:$metafields) {
    metafields { key type value compareDigest }
    userErrors { field message code }
  }
}`;

export function assertSnapshot(snapshot) {
  if (!snapshot.shop?.id || !snapshot.metafieldDefinitions) throw new Error('Incomplete Shopify snapshot');
  if (snapshot.shop.metafields.pageInfo.hasNextPage || snapshot.metafieldDefinitions.pageInfo.hasNextPage) {
    throw new Error('Namespace exceeds this setup tool limit; paginate before proceeding');
  }
  for (const definition of snapshot.metafieldDefinitions.nodes) {
    const field = FIELDS.find((item) => item.key === definition.key);
    if (field && (definition.type.name !== field.type || definition.ownerType !== 'SHOP' || definition.namespace !== NAMESPACE)) {
      throw new Error(`Definition mismatch: ${definition.key}; no automatic migration`);
    }
  }
  return snapshot;
}

export async function inspect(client) {
  return assertSnapshot(await client(INSPECT));
}

function errors(payload) {
  if (payload.userErrors?.length) {
    const error = new Error(JSON.stringify(payload.userErrors));
    error.code = 'SHOPIFY_USER_ERRORS';
    throw error;
  }
}

export async function ensureDefinitions(client, snapshot, { apply = false } = {}) {
  assertSnapshot(snapshot);
  const missing = FIELDS.filter((field) => !snapshot.metafieldDefinitions.nodes.some((item) => item.key === field.key));
  for (const field of missing) {
    if (snapshot.shop.metafields.nodes.some((item) => item.key === field.key)) {
      throw new Error(`Unstructured merchant value exists for ${field.key}; review before creating its definition`);
    }
  }
  if (!apply) return { dryRun: true, missing };
  for (const field of missing) {
    const result = await client(CREATE_DEFINITION, { definition: {
      ...field, namespace: NAMESPACE, ownerType: 'SHOP', access: { storefront: 'NONE' }
    } });
    errors(result.metafieldDefinitionCreate);
  }
  const verified = await inspect(client);
  for (const field of FIELDS) {
    if (!verified.metafieldDefinitions.nodes.some((item) => item.key === field.key)) throw new Error(`Definition verification failed: ${field.key}`);
  }
  return { created: missing.map((field) => field.key), verified };
}

export function buildPlan(snapshot, values) {
  assertSnapshot(snapshot);
  if (!values || Array.isArray(values) || typeof values !== 'object' || !Object.keys(values).length) throw new Error('Provide a nonempty values object');
  const changes = Object.entries(values).map(([key, value]) => {
    const field = FIELDS.find((item) => item.key === key);
    if (!field) throw new Error(`Unknown control: ${key}`);
    if (!snapshot.metafieldDefinitions.nodes.some((item) => item.key === key)) throw new Error(`Create definition first: ${key}`);
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${key} requires a boolean`);
    } else {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} requires a nonempty string; this tool does not delete overrides`);
      if (field.type === 'single_line_text_field' && /[\r\n]/.test(value)) throw new Error(`${key} must be one line`);
      const reference = { product_reference: 'Product', collection_reference: 'Collection' }[field.type];
      if (reference && !new RegExp(`^gid://shopify/${reference}/[0-9]+$`).test(value)) throw new Error(`${key} requires a ${reference} GID`);
    }
    const before = snapshot.shop.metafields.nodes.find((item) => item.key === key) || null;
    if (before && before.type !== field.type) throw new Error(`Value type mismatch: ${key}`);
    return {
      ownerId: snapshot.shop.id, namespace: NAMESPACE, key, type: field.type,
      value: typeof value === 'boolean' ? String(value) : value,
      compareDigest: before?.compareDigest ?? null, before
    };
  });
  return { apiVersion: API_VERSION, shopId: snapshot.shop.id, myshopifyDomain: snapshot.shop.myshopifyDomain, createdAt: new Date().toISOString(), changes };
}

export async function applySandboxPlan(client, plan, expectedShopId) {
  const current = await inspect(client);
  if (current.shop.id !== expectedShopId || current.shop.id !== plan.shopId || current.shop.myshopifyDomain !== plan.myshopifyDomain) throw new Error('Shop identity mismatch');
  if (current.shop.id === 'gid://shopify/Shop/27906474062' || current.shop.primaryDomain.host === 'rizo.store' || current.shop.myshopifyDomain === 'rizo-apperal.myshopify.com') {
    throw new Error('Value writes on the production Rizo shop are disabled in this sandbox setup tool');
  }
  if (plan.apiVersion !== API_VERSION) throw new Error('Plan API version mismatch');
  const rebuilt = buildPlan(current, Object.fromEntries(plan.changes.map((item) => [item.key, item.type === 'boolean' ? item.value === 'true' : item.value])));
  if (rebuilt.changes.length !== plan.changes.length) throw new Error('Duplicate controls in plan');
  for (const change of plan.changes) {
    if (!Object.hasOwn(change, 'compareDigest')) throw new Error(`Missing CAS precondition: ${change.key}`);
    const now = rebuilt.changes.find((item) => item.key === change.key);
    if (now.value !== change.value || now.type !== change.type || now.ownerId !== change.ownerId || now.namespace !== change.namespace) throw new Error(`Invalid plan entry: ${change.key}`);
    if (now.compareDigest !== change.compareDigest) throw new Error(`Stale plan: ${change.key}; re-read and review the change`);
  }
  const inputs = rebuilt.changes.map(({ before, ...item }) => item);
  const result = await client(SET_VALUES, { metafields: inputs });
  errors(result.metafieldsSet);
  const verified = await inspect(client);
  for (const input of inputs) {
    const value = verified.shop.metafields.nodes.find((item) => item.key === input.key);
    if (value?.value !== input.value || value?.type !== input.type) throw new Error(`Read-after-write verification failed: ${input.key}`);
  }
  return { changed: inputs.map((item) => item.key), verified, rollback: 'Set theme_enabled=false with a fresh compareDigest to restore theme settings' };
}
