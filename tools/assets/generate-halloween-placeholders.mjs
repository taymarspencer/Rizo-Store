// Generates the TEMPORARY Halloween event-layer placeholder assets.
//
// These exist only so the engine can be built and tested before final Rizo
// artwork arrives. Replace the files in assets/ with final art
// using the same file names (see docs/EVENT-LAYER.md → Assets).
//
//   node assets/generate-halloween-placeholders.mjs
//
// Writes:
//   event-halloween-moon.svg      plain moon disc (placeholder)
//   event-halloween-bat-1.svg     bat silhouette, wings up
//   event-halloween-bat-1-b.svg   bat silhouette, wings down (second flap pose)
//   event-halloween-bat-2.svg     narrower bat silhouette
//   event-halloween-fog.webp      soft fog, horizontally tileable, alpha (rendered in Chromium)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../assets');
const require = createRequire(import.meta.url);

const write = (name, content) => {
  fs.writeFileSync(path.join(OUT, name), content);
  console.log(`${name}  ${fs.statSync(path.join(OUT, name)).size} bytes`);
};

/* Moon: a flat, slightly warm disc with a soft terminator. Intentionally plain. */
write('event-halloween-moon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <!-- TEMPORARY PLACEHOLDER — replace with the final Rizo moon artwork (same file name, or use the Moon artwork theme setting). -->
  <defs>
    <radialGradient id="face" cx="42%" cy="38%" r="68%">
      <stop offset="0" stop-color="#f3eee2"/>
      <stop offset=".72" stop-color="#ddd6c6"/>
      <stop offset="1" stop-color="#b9b2a3"/>
    </radialGradient>
  </defs>
  <circle cx="200" cy="200" r="196" fill="url(#face)"/>
  <g fill="#a9a293" opacity=".22">
    <ellipse cx="150" cy="150" rx="46" ry="34"/>
    <ellipse cx="248" cy="232" rx="58" ry="40"/>
    <ellipse cx="170" cy="276" rx="28" ry="22"/>
  </g>
</svg>
`);

/* Bats: symmetric silhouettes built from a left half and mirrored, so the
   shapes stay tidy and easy to read at 24–60px. */
const batPath = (width, half) => {
  const mirror = [...half].reverse().map(([x, y]) => [width - x, y]);
  const points = [...half, ...mirror];
  return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
};
// Slate rather than pure black so a bat still reads against the night
// background, and goes dark against the moon and fog.
const batSvg = (width, height, half, note) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- TEMPORARY PLACEHOLDER — ${note}. -->
  <defs>
    <linearGradient id="bat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b4252"/>
      <stop offset="1" stop-color="#171a22"/>
    </linearGradient>
  </defs>
  <path d="${batPath(width, half)}" fill="url(#bat)"/>
</svg>
`;

// Left half, from the head centre-line out along the leading edge and back
// along the scalloped trailing edge to the tail. x ≤ width/2.
const wingsUp = [
  [110, 76], [104, 66], [100, 58], [90, 57], [80, 55], [70, 60], [62, 66], [56, 55], [46, 48], [34, 49], [24, 53],
  [20, 40], [12, 30], [4, 24], [22, 22], [44, 22], [66, 28], [84, 34], [97, 38], [100, 30], [103, 20], [106, 13], [108, 24]
];
const wingsDown = [
  [110, 76], [104, 68], [100, 60], [92, 64], [82, 70], [72, 78], [64, 86], [58, 78], [48, 76], [36, 80], [26, 86],
  [26, 72], [22, 60], [16, 50], [34, 44], [54, 40], [72, 38], [88, 38], [97, 38], [100, 30], [103, 20], [106, 13], [108, 24]
];
const narrow = [
  [100, 72], [95, 63], [91, 56], [82, 55], [72, 56], [64, 62], [58, 52], [48, 47], [36, 48], [26, 52],
  [20, 40], [12, 31], [4, 26], [24, 24], [46, 25], [66, 29], [82, 34], [88, 36], [91, 28], [94, 19], [97, 12], [98, 22]
];
write('event-halloween-bat-1.svg', batSvg(220, 100, wingsUp, 'bat silhouette, wings up'));
write('event-halloween-bat-1-b.svg', batSvg(220, 100, wingsDown, 'bat silhouette, wings down (second flap pose for bat-1)'));
write('event-halloween-bat-2.svg', batSvg(200, 100, narrow, 'narrower bat silhouette'));

/* Fog: periodic fBm value noise (wraps horizontally), rendered small and
   upscaled with smoothing for softness, alpha-faded top and bottom. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const dataUrl = await page.evaluate(() => {
  const W = 1280; const H = 224; const w = 320; const h = 56;
  let seed = 412;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const lattice = (cells) => Array.from({ length: cells * cells }, rand);
  const octaves = [4, 8, 16, 32].map((cells) => ({ cells, grid: lattice(cells) }));
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = ({ cells, grid }, u, v) => {
    const x = u * cells; const y = v * cells;
    const x0 = Math.floor(x); const y0 = Math.floor(y);
    const fx = smooth(x - x0); const fy = smooth(y - y0);
    const g = (i, j) => grid[((j % cells) + cells) % cells * cells + (((i % cells) + cells) % cells)];
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w; const v = (y / h) * 0.2;
      let n = 0; let amp = 0.55; let total = 0;
      for (const octave of octaves) { n += sample(octave, u, v) * amp; total += amp; amp *= 0.5; }
      n /= total;
      const ny = y / (h - 1);
      const envelope = Math.sin(Math.PI * Math.min(1, ny * 1.08)) ** 1.6 * (0.55 + 0.45 * ny);
      const density = Math.max(0, (n - 0.3) / 0.7) ** 1.25 * envelope;
      const i = (y * w + x) * 4;
      img.data[i] = 222; img.data[i + 1] = 230; img.data[i + 2] = 242;
      img.data[i + 3] = Math.round(Math.min(1, density * 1.9) * 255);
    }
  }
  sctx.putImageData(img, 0, 0);
  const big = document.createElement('canvas');
  big.width = W; big.height = H;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  // Draw three copies so smoothing at the seam samples the wrapped neighbour.
  for (const offset of [-W, 0, W]) bctx.drawImage(small, offset, 0, W, H);
  return big.toDataURL('image/webp', 0.55);
});
await browser.close();
write('event-halloween-fog.webp', Buffer.from(dataUrl.split(',')[1], 'base64'));
