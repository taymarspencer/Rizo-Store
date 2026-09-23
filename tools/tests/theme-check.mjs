// Runs Shopify Theme Check (the same linter as `shopify theme check`) on
// the theme (repository root) and lists every offense. Exit code 1 on any
// offense: the 2026 rebuild cleared the three Rizo Portal v2.3 left behind.
//
//   node tests/theme-check.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeCheckRun } from '@shopify/theme-check-node';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.resolve(HERE, '../..');
const BASELINE = new Set([]);

const { offenses } = await themeCheckRun(THEME, undefined, () => {});
let fresh = 0;
for (const offense of offenses) {
  const file = decodeURIComponent(offense.uri.replace(/^file:\/\//, '')).replace(`${THEME}/`, '');
  const known = BASELINE.has(`${offense.check} ${file}`);
  if (!known) fresh += 1;
  const severity = ['ERROR', 'WARN', 'INFO'][offense.severity] || offense.severity;
  console.log(`${known ? 'baseline' : 'NEW     '} ${severity} ${offense.check} ${file}:${(offense.start?.line ?? 0) + 1} ${offense.message}`);
}
console.log(`\n${offenses.length} offense(s), ${fresh} new.`);
process.exit(fresh ? 1 : 0);
