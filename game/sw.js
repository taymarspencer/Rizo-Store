/* Offline shell for Rizo.game. Third-party ad requests are intentionally never cached. */
const CACHE_PREFIX = "rizo-game-";
const CACHE = "rizo-game-v87-first-ten-rtd-master-integrated";
const SHELL = [
  "./", "./index.html", "./launch-v79-defense-alive.css", "./rtd-defense-integration.css", "./worker-b-economy.css", "./worker-e-abilities-depth.css", "./worker-h-ui.css", "./v81-art.css", "./rtd-worker-i-feel.css", "./arcade-v75.css", "./arcade-v83.css", "./arcade-v84-depth.css", "./rizo-v85-handmade.css", "./arcade-v87-system.css", "./worker-d-towers.css", "./defense-core-v79.js", "./defense-canvas-v79.js", "./rizo-config.js", "./install-manager.js",
  "./monetization.js", "./game-v79-defense.js", "./manifest.webmanifest", "./about.html",
  "./privacy.html", "./terms.html", "./support.html", "./assets/icon-192.png",
  "./assets/defense-pine-bend.svg", "./assets/defense-ember-switchback.svg", "./assets/defense-moon-loop.svg", "./assets/defense-storm-circuit.svg", "./assets/defense-whiteout-pass.svg", "./assets/defense-eclipse-ridge.svg", "./assets/icon-512.png", "./assets/rizo-full-mark.png", "./assets/rizo-classic.png",
  "./assets/rizo-ember.png", "./assets/rizo-toxic.png", "./assets/rizo-violet.png",
  "./assets/rizo-bubblegum.png", "./assets/rizo-frost.png", "./assets/rizo-glitch.png",
  "./assets/rizo-obsidian.png", "./assets/rizo-golden.png", "./assets/rizo-diamond.png",
  "./assets/rizo-moss.png", "./assets/rizo-aurora.png", "./assets/rizo-retro.png",
  "./assets/rizo-shadow.png", "./ASSET-CREDITS.md",
  "./assets/wearables/antenna-back.svg", "./assets/wearables/antenna-front.svg",
  "./assets/wearables/backpack-back.svg", "./assets/wearables/backpack-body.svg", "./assets/wearables/backpack-front.svg",
  "./assets/wearables/bandana-back.svg", "./assets/wearables/bandana-body.svg", "./assets/wearables/bandana-front.svg",
  "./assets/wearables/beanie-body.svg", "./assets/wearables/beanie-front.svg", "./assets/wearables/bow-front.svg",
  "./assets/wearables/bucket-body.svg", "./assets/wearables/bucket-front.svg", "./assets/wearables/cap-body.svg",
  "./assets/wearables/cap-front.svg", "./assets/wearables/cape-back.svg", "./assets/wearables/cape-front.svg",
  "./assets/wearables/chain-front.svg", "./assets/wearables/crown-front.svg", "./assets/wearables/earmuffs-body.svg",
  "./assets/wearables/earmuffs-front.svg", "./assets/wearables/eyepatch-back.svg", "./assets/wearables/eyepatch-front.svg",
  "./assets/wearables/flower-back.svg", "./assets/wearables/flower-front.svg", "./assets/wearables/goggles-back.svg",
  "./assets/wearables/goggles-front.svg", "./assets/wearables/halo-back.svg", "./assets/wearables/headphones-body.svg",
  "./assets/wearables/headphones-front.svg", "./assets/wearables/horns-back.svg", "./assets/wearables/horns-front.svg",
  "./assets/wearables/leafcrown-back.svg", "./assets/wearables/leafcrown-front.svg", "./assets/wearables/mask-back.svg",
  "./assets/wearables/mask-front.svg", "./assets/wearables/scarf-back.svg", "./assets/wearables/scarf-body.svg",
  "./assets/wearables/scarf-front.svg", "./assets/wearables/shades-back.svg", "./assets/wearables/shades-front.svg",
  "./assets/wearables/starclip-back.svg", "./assets/wearables/starclip-front.svg",
  "./assets/wearables/thumb-antenna.png", "./assets/wearables/thumb-backpack.png", "./assets/wearables/thumb-bandana.png",
  "./assets/wearables/thumb-beanie.png", "./assets/wearables/thumb-bow.png", "./assets/wearables/thumb-bucket.png",
  "./assets/wearables/thumb-cap.png", "./assets/wearables/thumb-cape.png", "./assets/wearables/thumb-chain.png",
  "./assets/wearables/thumb-crown.png", "./assets/wearables/thumb-earmuffs.png", "./assets/wearables/thumb-eyepatch.png",
  "./assets/wearables/thumb-flower.png", "./assets/wearables/thumb-goggles.png", "./assets/wearables/thumb-halo.png",
  "./assets/wearables/thumb-headphones.png", "./assets/wearables/thumb-horns.png", "./assets/wearables/thumb-leafcrown.png",
  "./assets/wearables/thumb-mask.png", "./assets/wearables/thumb-scarf.png", "./assets/wearables/thumb-shades.png",
  "./assets/wearables/thumb-starclip.png", "./assets/wearables/thumb-visor.png", "./assets/wearables/thumb-wings.png",
  "./assets/wearables/visor-back.svg", "./assets/wearables/visor-front.svg", "./assets/wearables/wings-back.svg"
];
const REQUIRED_SHELL = [
  "./", "./index.html", "./launch-v79-defense-alive.css", "./rtd-defense-integration.css", "./worker-b-economy.css", "./worker-h-ui.css", "./v81-art.css", "./arcade-v75.css", "./arcade-v83.css", "./arcade-v84-depth.css", "./rizo-v85-handmade.css", "./arcade-v87-system.css", "./worker-d-towers.css",
  "./defense-core-v79.js", "./defense-canvas-v79.js", "./rizo-config.js", "./install-manager.js", "./monetization.js",
  "./game-v79-defense.js", "./manifest.webmanifest", "./assets/icon-192.png",
  "./assets/defense-pine-bend.svg", "./assets/icon-512.png", "./assets/rizo-classic.png"
];
const NETWORK_FIRST_PATHS = new Set(REQUIRED_SHELL.map(path => new URL(path, self.location.href).pathname));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Core boot files are atomic: if one is missing, this worker must not replace
    // the known-good worker. Optional art is best-effort so one cosmetic asset
    // can never block an application update.
    await cache.addAll(REQUIRED_SHELL);
    const required = new Set(REQUIRED_SHELL);
    await Promise.allSettled(SHELL.filter(path => !required.has(path)).map(path => cache.add(path)));
    // Once the complete required shell exists, converge immediately. iOS standalone
    // sessions can keep an old worker alive for a surprisingly long time otherwise.
    await self.skipWaiting();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

async function cacheIfUsable(request, response) {
  if (response && response.ok && (response.type === "basic" || response.type === "cors")) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigationResponse(request) {
  try { return await cacheIfUsable(request, await fetch(request, { cache: "no-store" })); }
  catch (error) { return (await caches.match(request)) || caches.match("./index.html"); }
}

async function networkFirst(request) {
  try { return await cacheIfUsable(request, await fetch(request, { cache: "no-store" })); }
  catch (error) { return (await caches.match(request)) || Response.error(); }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try { return await cacheIfUsable(request, await fetch(request)); }
  catch (error) { return Response.error(); }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") { event.respondWith(navigationResponse(event.request)); return; }
  // Runtime files are intentionally network-first even though their filenames are
  // release-versioned. This prevents a previous service worker from mixing a new
  // index.html with an old JS/CSS runtime during deployment. Cached copies remain
  // the offline fallback.
  if (NETWORK_FIRST_PATHS.has(url.pathname)) { event.respondWith(networkFirst(event.request)); return; }
  event.respondWith(cacheFirst(event.request));
});
