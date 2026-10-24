import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(await fs.readFile(path.join(here, 'skeleton-snapshot.json'), 'utf8'));
await fs.mkdir(path.join(here, 'catalog-images'), { recursive: true });
for (const [index, photo] of snapshot.images.entries()) {
  const target = path.join(here, 'catalog-images', `skeleton-${index}.png`);
  try { await fs.access(target); continue; } catch {}
  const response = await fetch(`${photo.url}&width=1200`);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Photo ${index}: ${response.status}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}
console.log('Approved Skeleton photographs ready for local preview. No store changes.');
