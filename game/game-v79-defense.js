

(() => {
  "use strict";
  const RIZO_RUNTIME_BUILD = "v87-first-ten-visual-nuance";
  window.__RIZO_RUNTIME_BUILD__ = RIZO_RUNTIME_BUILD;

  /*
    RIZO LIFE CORE GAME
    ===================
    This file owns game state, save migration, pet simulation, rendering, arcade
    loops, collection/capsule logic, expeditions, sound, and event binding.

    Launch/install/ads are intentionally outside this file:
      - rizo-config.js       owner-editable IDs and switches
      - install-manager.js   PWA onboarding
      - monetization.js      AdSense/H5 adapter

    SAVE COMPATIBILITY RULE: never rename SAVE_KEY or delete migration logic
    without providing a migration. Players' pets live in localStorage.
  */

  const SAVE_KEY = "rizo-life-overhaul-v2";
  const LEGACY_KEY = "rizo-life-save-v1";
  const DefenseCore = globalThis.RizoDefenseCore;
  if (!DefenseCore) throw new Error("RizoDefenseCore failed to load before the game core.");
  const { PHASES: DEFENSE_PHASES, BUDGETS: DEFENSE_BUDGETS, LIMITS: DEFENSE_LIMITS } = DefenseCore;
  const SAVE_BACKUP_KEY = `${SAVE_KEY}:verified-backup-v1`;
  const SAVE_VALIDATION_WARNING_KEY = `${SAVE_KEY}:save-validation-warning`;
  const SAVE_ENVELOPE_VERSION = DefenseCore.STATE_SAVE_VERSION;
  const DEFENSE_CHECKPOINT_KEY = `${SAVE_KEY}:defense-checkpoint-v68`;
  const DEFENSE_LEGACY_CHECKPOINT_KEYS = [`${SAVE_KEY}:defense-checkpoint-v67`, `${SAVE_KEY}:defense-checkpoint-v66`, `${SAVE_KEY}:defense-checkpoint-v64`, `${SAVE_KEY}:defense-checkpoint-v42`];
  const DEFENSE_VALIDATION_WARNING_KEY = `${SAVE_KEY}:defense-validation-warning`;
  const DEFENSE_CHECKPOINT_VERSION = DefenseCore.VERSION;
  const DEFENSE_CHECKPOINT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const BASE_DEFENSE_STARTING_CASH = DefenseCore.ECONOMY.baseStartingCash;
  const VERSION = 19;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const now = () => Date.now();
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
  const escapeHTML = value => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const formatNumber = value => Math.floor(value || 0).toLocaleString();
  const storeUrl = () => window.RIZO_CONFIG?.brand?.storeUrl || "https://rizo.store";
  let lastOverlayFocus = null;

  function syncUILock() {
    const locked = el?.bottomSheet?.classList.contains("show") || el?.modalOverlay?.classList.contains("show") || (el?.miniGameOverlay && !el.miniGameOverlay.hidden);
    document.documentElement.classList.toggle("ui-locked", Boolean(locked));
    document.body.classList.toggle("ui-locked", Boolean(locked));
  }

  function isUILocked() {
    return document.documentElement.classList.contains("ui-locked") ||
      Boolean(el?.bottomSheet?.classList.contains("show")) ||
      Boolean(el?.modalOverlay?.classList.contains("show")) ||
      Boolean(el?.miniGameOverlay && !el.miniGameOverlay.hidden);
  }

  function runtimeViewportSnapshot() {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1));
    const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1));
    const top = Math.max(0, Math.round(viewport?.offsetTop || 0));
    const left = Math.max(0, Math.round(viewport?.offsetLeft || 0));
    const scale = Math.max(.1, Number(viewport?.scale) || 1);
    return { width, height, top, left, scale };
  }

  function syncRuntimeViewport() {
    const view = runtimeViewportSnapshot(), root = document.documentElement;
    root.style.setProperty("--rizo-vw", `${view.width}px`);
    root.style.setProperty("--rizo-vh", `${view.height}px`);
    root.style.setProperty("--rizo-vv-top", `${view.top}px`);
    root.style.setProperty("--rizo-vv-left", `${view.left}px`);
    root.style.setProperty("--rizo-vv-scale", String(view.scale));
    root.dataset.rizoOrientation = view.width > view.height ? "landscape" : "portrait";
    if (mini?.active) mini.lastFrame = performance.now();
    return view;
  }

  function scheduleRuntimeViewportSync(reason = "viewport") {
    if (runtimeViewportFrame) cancelAnimationFrame(runtimeViewportFrame);
    runtimeViewportFrame = requestAnimationFrame(() => {
      runtimeViewportFrame = null;
      syncRuntimeViewport();
      scheduleDefenseTowerGeometrySync();
    });
    clearTimeout(runtimeViewportTimer);
    runtimeViewportTimer = setTimeout(() => {
      runtimeViewportTimer = null;
      syncRuntimeViewport();
      scheduleDefenseTowerGeometrySync();
    }, reason === "orientation" ? 280 : 120);
  }

  function lockDefenseViewport() {
    if (!defenseViewportScroll) defenseViewportScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
    const root = document.documentElement;
    root.style.setProperty("--rizo-lock-scroll-x", `${-(defenseViewportScroll.x || 0)}px`);
    root.style.setProperty("--rizo-lock-scroll-y", `${-(defenseViewportScroll.y || 0)}px`);
    root.classList.add("defense-viewport-lock");
    document.body.classList.add("defense-viewport-lock");
    syncRuntimeViewport();
  }

  function unlockDefenseViewport() {
    const saved = defenseViewportScroll;
    defenseViewportScroll = null;
    document.documentElement.classList.remove("defense-viewport-lock");
    document.body.classList.remove("defense-viewport-lock");
    document.documentElement.style.removeProperty("--rizo-lock-scroll-x");
    document.documentElement.style.removeProperty("--rizo-lock-scroll-y");
    if (saved) requestAnimationFrame(() => window.scrollTo(saved.x || 0, saved.y || 0));
  }

  function releaseStatus() {
    return {
      build: window.__RIZO_BUILD__ || "unknown",
      updateReady: releaseUpdateReady,
      hasController: Boolean(navigator.serviceWorker?.controller),
      viewportScroll: defenseViewportScroll ? { ...defenseViewportScroll } : null,
      suspendedAt: runtimeSuspendedAt || 0,
      suspendReason: runtimeSuspendReason || ""
    };
  }

  const CONFIG = {
    ads: {
      enabled: false,
      provider: "none",
      placements: ["home-feed", "arcade-between-games", "shop-footer", "death-revive", "capsule-bonus", "expedition-double"]
    },
    cloud: {
      enabled: false,
      provider: "none"
    }
  };

  /*
    FUTURE MONETIZATION BRIDGE
    ---------------------------------
    A web ad network or native wrapper can replace these methods without changing game logic.
    Example native flow: Capacitor + AdMob calls window.RizoAds.setProvider(nativeAdapter).
  */
  const AdBridge = {
    provider: null,
    setProvider(provider) {
      this.provider = provider;
      CONFIG.ads.enabled = Boolean(provider);
      refreshAdSlots();
    },
    async showRewarded(placement) {
      if (!CONFIG.ads.enabled || !this.provider?.showRewarded) return false;
      try { return Boolean(await this.provider.showRewarded(placement)); }
      catch (error) { console.warn("Rizo rewarded ad failed", error); return false; }
    },
    async showInterstitial(placement) {
      if (!CONFIG.ads.enabled || !this.provider?.showInterstitial) return false;
      try { return Boolean(await this.provider.showInterstitial(placement)); }
      catch (error) { console.warn("Rizo interstitial failed", error); return false; }
    },
    mountBanner(placement, element) {
      if (!CONFIG.ads.enabled || !this.provider?.mountBanner) return false;
      try { this.provider.mountBanner(placement, element); return true; }
      catch (error) { console.warn("Rizo banner failed", error); return false; }
    }
  };
  window.RizoAds = AdBridge;
  window.dispatchEvent(new CustomEvent("rizo:adbridge-ready"));

  const CloudBridge = {
    provider: null,
    setProvider(provider) {
      this.provider = provider;
      CONFIG.cloud.enabled = Boolean(provider);
    },
    async signIn() {
      if (!this.provider?.signIn) return false;
      return this.provider.signIn();
    },
    async sync(payload) {
      if (!this.provider?.sync) return false;
      return this.provider.sync(payload);
    }
  };
  window.RizoCloud = CloudBridge;

  // ===== CONTENT DATABASE: collectible Rizos, food, cosmetics, lore =====
  const VARIANTS = [
    { id: "classic", name: "CLASSIC BLUE", rarity: "COMMON", weight: 39, color: "#16c8ff", sprite: "./assets/rizo-classic.png", source: "CAPSULE" },
    { id: "ember", name: "EMBER RED", rarity: "UNCOMMON", weight: 17, color: "#ff4f3d", sprite: "./assets/rizo-ember.png", source: "CAPSULE" },
    { id: "toxic", name: "TOXIC LIME", rarity: "RARE", weight: 10, color: "#8dff45", sprite: "./assets/rizo-toxic.png", source: "CAPSULE" },
    { id: "violet", name: "VOID VIOLET", rarity: "RARE", weight: 7.5, color: "#a46cff", sprite: "./assets/rizo-violet.png", source: "CAPSULE" },
    { id: "moss", name: "MOSS RIZO", rarity: "RARE", weight: 4.5, color: "#48c46f", sprite: "./assets/rizo-moss.png", source: "FOREST + CAPSULE" },
    { id: "bubblegum", name: "BUBBLEGUM", rarity: "EPIC", weight: 5.5, color: "#ff64c8", sprite: "./assets/rizo-bubblegum.png", source: "CAPSULE" },
    { id: "frost", name: "FROSTBITE", rarity: "EPIC", weight: 4.5, color: "#b7f4ff", sprite: "./assets/rizo-frost.png", source: "CAPSULE" },
    { id: "glitch", name: "GLITCH RIZO", rarity: "MYTHIC", weight: 3.2, color: "#33ffe0", sprite: "./assets/rizo-glitch.png", source: "CAPSULE" },
    { id: "obsidian", name: "OBSIDIAN", rarity: "MYTHIC", weight: 2.1, color: "#26304b", sprite: "./assets/rizo-obsidian.png", source: "CAPSULE" },
    { id: "aurora", name: "AURORA RIZO", rarity: "MYTHIC", weight: 1.5, color: "#7df4ff", sprite: "./assets/rizo-aurora.png", source: "PRISM CAPSULE", prismOnly: true },
    { id: "golden", name: "GOLDEN RIZO", rarity: "LEGENDARY", weight: 1.25, color: "#ffd54a", sprite: "./assets/rizo-golden.png", source: "CAPSULE" },
    { id: "diamond", name: "DIAMOND RIZO", rarity: "SECRET", weight: .4, color: "#dffbff", sprite: "./assets/rizo-diamond.png", source: "CAPSULE" },
    { id: "retro", name: "RETRO RIZO", rarity: "SECRET", weight: .35, color: "#18c8ff", sprite: "./assets/rizo-retro.png", source: "ARCADE SIGNAL", pixel: true, capsule: false },
    { id: "shadow", name: "SHADOW RIZO", rarity: "FOREST SECRET", weight: 0, color: "#7954ff", sprite: "./assets/rizo-shadow.png", source: "DEEP FOREST", capsule: false }
  ];

  const STAGES = [
    // Internal IDs remain untouched for save compatibility. Visible names are
    // ages: the same Rizo grows from a tiny baby into the canonical mature body.
    { id: "spark", name: "BABY", minXP: 0, minStats: 0, minBond: 0, nextXP: 120, scale: .38 },
    { id: "kid", name: "LITTLE", minXP: 120, minStats: 20, minBond: 10, nextXP: 400, scale: .54 },
    { id: "teen", name: "GROWING", minXP: 400, minStats: 70, minBond: 25, nextXP: 1000, scale: .71 },
    { id: "beast", name: "YOUNG", minXP: 1000, minStats: 160, minBond: 50, nextXP: 2400, scale: .86 },
    { id: "legend", name: "MATURE", minXP: 2400, minStats: 300, minBond: 80, nextXP: Infinity, scale: 1 }
  ];

  // ===== AGE + VARIANT VISUAL CALIBRATION =====
  // Stage IDs stay stable, but no stage swaps Rizo for a replacement creature.
  // Every age uses the canonical variant sprite and changes presence through
  // measured non-uniform proportions, offsets, face/accessory scale, and anchors.
  const AGE_VISUALS = {
    // Every life stage now preserves the canonical Rizo silhouette exactly.
    // Age is communicated by uniform actor scale, not by stretching the PNG.
    spark: {
      bodyX:1, bodyY:1, offsetY:0, faceScale:1, wearableScale:1, wearableRotate:0,
      shadow:{scale:.58,x:0,y:8,opacity:.72},
      anchors:{head:{x:0,y:0,scale:1},face:{x:0,y:0,scale:1},upper:{x:0,y:0,scale:1},center:{x:0,y:0,scale:1},lower:{x:0,y:0,scale:1},left:{x:0,y:0,scale:1},right:{x:0,y:0,scale:1},back:{x:0,y:0,scale:1},ground:{x:0,y:0,scale:1},effects:{x:0,y:0,scale:1}}
    },
    kid: {
      bodyX:1, bodyY:1, offsetY:0, faceScale:1, wearableScale:1, wearableRotate:0,
      shadow:{scale:.70,x:0,y:6,opacity:.78},
      anchors:{head:{x:0,y:0,scale:1},face:{x:0,y:0,scale:1},upper:{x:0,y:0,scale:1},center:{x:0,y:0,scale:1},lower:{x:0,y:0,scale:1},left:{x:0,y:0,scale:1},right:{x:0,y:0,scale:1},back:{x:0,y:0,scale:1},ground:{x:0,y:0,scale:1},effects:{x:0,y:0,scale:1}}
    },
    teen: {
      bodyX:1, bodyY:1, offsetY:0, faceScale:1, wearableScale:1, wearableRotate:0,
      shadow:{scale:.82,x:0,y:4,opacity:.84},
      anchors:{head:{x:0,y:0,scale:1},face:{x:0,y:0,scale:1},upper:{x:0,y:0,scale:1},center:{x:0,y:0,scale:1},lower:{x:0,y:0,scale:1},left:{x:0,y:0,scale:1},right:{x:0,y:0,scale:1},back:{x:0,y:0,scale:1},ground:{x:0,y:0,scale:1},effects:{x:0,y:0,scale:1}}
    },
    beast: {
      bodyX:1, bodyY:1, offsetY:0, faceScale:1, wearableScale:1, wearableRotate:0,
      shadow:{scale:.92,x:0,y:2,opacity:.91},
      anchors:{head:{x:0,y:0,scale:1},face:{x:0,y:0,scale:1},upper:{x:0,y:0,scale:1},center:{x:0,y:0,scale:1},lower:{x:0,y:0,scale:1},left:{x:0,y:0,scale:1},right:{x:0,y:0,scale:1},back:{x:0,y:0,scale:1},ground:{x:0,y:0,scale:1},effects:{x:0,y:0,scale:1}}
    },
    legend: {
      bodyX:1, bodyY:1, offsetY:0, faceScale:1, wearableScale:1, wearableRotate:0,
      shadow:{scale:1,x:0,y:0,opacity:1},
      anchors:{head:{x:0,y:0,scale:1},face:{x:0,y:0,scale:1},upper:{x:0,y:0,scale:1},center:{x:0,y:0,scale:1},lower:{x:0,y:0,scale:1},left:{x:0,y:0,scale:1},right:{x:0,y:0,scale:1},back:{x:0,y:0,scale:1},ground:{x:0,y:0,scale:1},effects:{x:0,y:0,scale:1}}
    }
  };

  // All fourteen variants are explicitly calibrated rather than assumed equal.
  // The current normalized art is already close, so corrections remain small and
  // data-driven. These values are the only variant-specific geometry layer.
  const VARIANT_VISUAL_CALIBRATION = {
    classic:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:0,anchors:{}},
    ember:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:.2,anchors:{head:{x:0,y:.2}}},
    toxic:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:-.2,anchors:{right:{x:-.3}}},
    violet:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:.15,anchors:{face:{y:.2}}},
    moss:{spriteX:0,spriteY:0,spriteScale:.995,wearableScale:1.01,wearableRotate:-.25,anchors:{head:{y:.5},back:{x:-.4}}},
    bubblegum:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:.2,anchors:{left:{x:.3}}},
    frost:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:-.1,anchors:{face:{y:.2}}},
    glitch:{spriteX:0,spriteY:0,spriteScale:.99,wearableScale:.99,wearableRotate:.35,animation:"glitch",anchors:{face:{y:.4,scale:.99},head:{y:.3}}},
    obsidian:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:-.15,glow:"obsidian",anchors:{back:{x:-.3}}},
    aurora:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:.1,glow:"aurora",anchors:{head:{x:.2}}},
    golden:{spriteX:0,spriteY:0,spriteScale:1.005,wearableScale:1.01,wearableRotate:.1,glow:"golden",anchors:{head:{y:-.2},center:{y:.2}}},
    diamond:{spriteX:0,spriteY:0,spriteScale:1,wearableScale:1,wearableRotate:0,glow:"diamond",anchors:{face:{y:.2}}},
    retro:{spriteX:0,spriteY:.35,spriteScale:.985,wearableScale:.98,wearableRotate:0,animation:"pixel",anchors:{head:{y:.8,scale:.98},face:{y:.6,scale:.98},center:{y:.7,scale:.98},back:{y:.5,scale:.98}}},
    shadow:{spriteX:0,spriteY:.45,spriteScale:.99,wearableScale:.99,wearableRotate:-.15,glow:"shadow",anchors:{head:{y:.7,scale:.99},face:{y:.7,scale:.98},center:{y:.8,scale:.99},back:{y:.6,scale:.99}}}
  };

  const ACCESSORY_ANCHOR_GROUPS = {
    none:"effects",
    beanie:"head", flower:"right", horns:"head", halo:"head", crown:"head",
    cap:"head", bow:"head", antenna:"head", leafcrown:"head", starclip:"right", bucket:"head",
    shades:"face", eyepatch:"face", goggles:"face", visor:"face", mask:"face", earmuffs:"upper",
    headphones:"upper", bandana:"lower", chain:"lower", scarf:"lower",
    wings:"back", cape:"back", backpack:"back"
  };

  const WEARABLE_DEFS = Object.freeze(Object.fromEntries(Object.entries(ACCESSORY_ANCHOR_GROUPS).map(([id,anchor]) => [id,{anchor}])));

  // Compatibility alias for diagnostics and older QA pages. Every stage now
  // intentionally resolves to the canonical variant sprite.
  const RIZO_FORMS = Object.fromEntries(VARIANTS.map(variant => [variant.id,
    Object.fromEntries(STAGES.map(stage => [stage.id,{variantId:variant.id,evolutionStage:stage.id,asset:variant.sprite,fallbackAsset:VARIANTS[0].sprite,...AGE_VISUALS[stage.id]}]))
  ]));
  window.RIZO_FORMS = RIZO_FORMS;

  const SKILLS = [
    { id: "speed", name: "SPEED", icon: "➤", color: "#16c8ff", games: "Rizo Rush + Skybound" },
    { id: "power", name: "POWER", icon: "◆", color: "#ff5c6c", games: "Power Tap + Ember Breaker" },
    { id: "instinct", name: "INSTINCT", icon: "☾", color: "#a46cff", games: "Spark Catch + Forage + Breaker" },
    { id: "stamina", name: "STAMINA", icon: "∞", color: "#9eff75", games: "Rain Walk + Skybound" },
    { id: "luck", name: "LUCK", icon: "✦", color: "#ffd45a", games: "Treasures + rare care" }
  ];

  const EVOLUTION_FORMS = {
    balanced: { name: "TRUE PATH", copy: "Balanced care keeps every instinct in conversation.", className: "form-balanced" },
    speed: { name: "DASH PATH", copy: "Movement, races and restless play awakened a speed affinity.", className: "form-speed" },
    power: { name: "IRON PATH", copy: "Training, bold food and stubborn confidence awakened a power affinity.", className: "form-power" },
    instinct: { name: "MOON PATH", copy: "Curiosity, sparks and strange discoveries awakened an instinct affinity.", className: "form-instinct" },
    stamina: { name: "ROOT PATH", copy: "Walks, sleep and steady care awakened a stamina affinity.", className: "form-stamina" },
    luck: { name: "FORTUNE PATH", copy: "Treasure and impossible timing awakened a luck affinity.", className: "form-luck" },
    pixel: { name: "PIXEL PATH", copy: "Old forest hardware awakened a hidden arcade affinity.", className: "form-pixel" },
    eclipse: { name: "ECLIPSE PATH", copy: "Difficult choices awakened a hidden shadow affinity.", className: "form-eclipse" },
    royal: { name: "ROYAL PATH", copy: "Golden lineage, luck and loyalty awakened a royal affinity.", className: "form-royal" },
    prism: { name: "PRISM PATH", copy: "Exceptional bond awakened a prismatic affinity.", className: "form-prism" }
  };

  const FOODS = [
    { id: "crumbs", icon: "🍞", name: "POCKET CRUMBS", description: "Free-ish. Linty. Better than nothing.", cost: 0, cooldown: 300000, hunger: 9, mood: -1, hygiene: -2, xp: 1 },
    { id: "bites", icon: "🍗", name: "RIZO BITES", description: "+22 full • dependable mystery protein.", cost: 6, hunger: 22, mood: 2, hygiene: -2, xp: 4 },
    { id: "cereal", icon: "🥣", name: "EMBER CEREAL", description: "+16 full • +5 happy • stays crunchy in fire.", cost: 10, hunger: 16, mood: 5, xp: 5 },
    { id: "moonfruit", icon: "🍓", name: "MOON FRUIT", description: "+18 full • +10 happy • glows for no reason.", cost: 15, hunger: 18, mood: 10, hygiene: -1, xp: 7 },
    { id: "pixelpizza", icon: "🍕", name: "PIXEL PIZZA", description: "+28 full • +7 happy • somehow only four pixels.", cost: 19, hunger: 28, mood: 7, hygiene: -4, xp: 8 },
    { id: "wings", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-wings.png" alt="">', name: "FOREST WINGS", description: "+34 full • +8 happy • -7 clean.", cost: 22, hunger: 34, mood: 8, hygiene: -7, xp: 10 },
    { id: "ghostmallow", icon: "☁️", name: "GHOST MALLOW", description: "+13 full • +18 happy • may whisper.", cost: 26, hunger: 13, mood: 18, xp: 11 },
    { id: "soup", icon: "🥣", name: "EMERGENCY SOUP", description: "+25 health • +16 full • tastes responsible.", cost: 30, hunger: 16, health: 25, mood: 3, xp: 5 },
    { id: "diamond", icon: "💎", name: "DIAMOND DONUT", description: "+30 full • +20 happy • offensively shiny.", cost: 55, hunger: 30, mood: 20, health: 8, xp: 18 },
    { id: "feast", icon: "🍱", name: "LEGEND FEAST", description: "+55 full • +20 happy • +15 health.", cost: 90, hunger: 55, mood: 20, health: 15, hygiene: -8, xp: 28 },
    { id: "meds", icon: "💊", name: "SUSPICIOUS MEDICINE", description: "Cures sickness and restores 18 health.", cost: 28, health: 18, cure: true, xp: 3 },
    { id: "calm", icon: "🫧", name: "CALMING FIZZ", description: "Cures tap sickness and restores +15 happy.", cost: 24, mood: 15, cure: true, calm: true, xp: 3 }
  ];

  const FOOD_TRAITS = {
    crumbs: { alignment: 0, skill: "stamina", amount: .15 },
    bites: { alignment: 0, skill: "power", amount: .35 },
    cereal: { alignment: 1, skill: "stamina", amount: .4 },
    moonfruit: { alignment: 3, skill: "instinct", amount: .7 },
    pixelpizza: { alignment: -1, skill: "speed", amount: .65 },
    wings: { alignment: -4, skill: "power", amount: .9 },
    ghostmallow: { alignment: 2, skill: "instinct", amount: .8 },
    soup: { alignment: 2, skill: "stamina", amount: .55 },
    diamond: { alignment: 1, skill: "luck", amount: 1.2 },
    feast: { alignment: 0, skill: "power", amount: 1.0 },
    meds: { alignment: 2, skill: "stamina", amount: .25 },
    calm: { alignment: 3, skill: "instinct", amount: .3 }
  };

  const ACCESSORIES = [
    { id: "none", icon: "○", name: "NO WEARABLE", description: "Rizo exactly as raised.", cost: 0, rarity: "common" },
    { id: "bandana", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-bandana.png" alt="">', name: "RED BANDANA", description: "Tiny outlaw energy.", cost: 80, rarity: "common" },
    { id: "beanie", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-beanie.png" alt="">', name: "RIZO BEANIE", description: "Official head insulation.", cost: 105, rarity: "common" },
    { id: "shades", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-shades.png" alt="">', name: "BLOCK SHADES", description: "Every bad choice now looks intentional.", cost: 120, rarity: "common" },
    { id: "flower", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-flower.png" alt="">', name: "MOON FLOWER", description: "Cute enough to lower defenses.", cost: 145, rarity: "common" },
    { id: "eyepatch", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-eyepatch.png" alt="">', name: "FOREST EYEPATCH", description: "No injury. Just lore.", cost: 165, rarity: "rare" },
    { id: "headphones", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-headphones.png" alt="">', name: "BASS HEADPHONES", description: "Only plays unreleased Rizo music.", cost: 195, rarity: "rare" },
    { id: "chain", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-chain.png" alt="">', name: "RIZO CHAIN", description: "Financial literacy left the chat.", cost: 220, rarity: "rare" },
    { id: "scarf", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-scarf.png" alt="">', name: "RAIN SCARF", description: "For dramatic forest departures.", cost: 245, rarity: "rare" },
    { id: "horns", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-horns.png" alt="">', name: "LITTLE HORNS", description: "Not evil. Merely difficult.", cost: 275, rarity: "epic" },
    { id: "halo", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-halo.png" alt="">', name: "FAKE HALO", description: "The word fake is important.", cost: 320, rarity: "epic" },
    { id: "wings", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-wings.png" alt="">', name: "NIGHT WINGS", description: "Maximum silhouette. Zero aerodynamics.", cost: 390, rarity: "epic" },
    { id: "crown", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-crown.png" alt="">', name: "TINY CROWN", description: "No kingdom. Maximum authority.", cost: 480, rarity: "legendary" },
    { id: "cap", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-cap.png" alt="">', name: "RIZO SNAPBACK", description: "The brim points toward poor decisions.", cost: 135, rarity: "common" },
    { id: "bow", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-bow.png" alt="">', name: "BIG BOW", description: "Cute enough to weaponize.", cost: 155, rarity: "rare" },
    { id: "goggles", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-goggles.png" alt="">', name: "FOREST GOGGLES", description: "For research conducted at unsafe speeds.", cost: 205, rarity: "rare" },
    { id: "antenna", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-antenna.png" alt="">', name: "SIGNAL ANTENNA", description: "Receives stations that have not launched yet.", cost: 235, rarity: "rare" },
    { id: "leafcrown", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-leafcrown.png" alt="">', name: "LEAF CROWN", description: "The forest elected him. Nobody voted.", cost: 265, rarity: "epic" },
    { id: "visor", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-visor.png" alt="">', name: "CYAN VISOR", description: "Retro future. Present-day attitude.", cost: 295, rarity: "epic" },
    { id: "cape", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-cape.png" alt="">', name: "TINY CAPE", description: "Heroism sold separately.", cost: 340, rarity: "epic" },
    { id: "backpack", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-backpack.png" alt="">', name: "WALK PACK", description: "Carries snacks, lore, and one suspicious rock.", cost: 360, rarity: "epic" },
    { id: "starclip", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-starclip.png" alt="">', name: "STAR CLIP", description: "A small reward for being objectively adorable.", cost: 410, rarity: "legendary" },
    { id: "mask", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-mask.png" alt="">', name: "NIGHT MASK", description: "Secret identity: still Rizo.", cost: 445, rarity: "legendary" },
    { id: "earmuffs", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-earmuffs.png" alt="">', name: "FROST MUFFS", description: "Warm ears. Cold stare.", cost: 520, rarity: "legendary" },
    { id: "bucket", icon: '<img class="wearable-item-icon" src="./assets/wearables/thumb-bucket.png" alt="">', name: "RAIN BUCKET HAT", description: "Built for weather and accidental fame.", cost: 575, rarity: "legendary" }
  ];

  const ROOMS = [
    { id: "rain", icon: "☂", name: "RAIN DEN", description: "The room that remembers where you met.", cost: 0, className: "theme-rain" },
    { id: "forest", icon: "🌲", name: "ROOT HOUSE", description: "Soft moss, old secrets, no security deposit.", cost: 140, className: "theme-forest" },
    { id: "midnight", icon: "☾", name: "MIDNIGHT DEN", description: "Moonlight, quiet, suspiciously good sleep.", cost: 190, className: "theme-midnight" },
    { id: "arcade", icon: "▦", name: "PIXEL ARCADE", description: "Every surface hums in sixteen bits.", cost: 280, className: "theme-arcade" },
    { id: "neon", icon: "✦", name: "NEON CAVE", description: "Cute creature. Very serious nightclub.", cost: 360, className: "theme-neon" },
    { id: "cloud", icon: "☁", name: "CLOUD LOFT", description: "Impossible rent. Excellent natural light.", cost: 460, className: "theme-cloud" },
    { id: "golden", icon: "◆", name: "GOLD ROOM", description: "For owners who lost the plot profitably.", cost: 700, className: "theme-golden" },
    { id: "void", icon: "●", name: "VOID CHAMBER", description: "The furniture may be looking back.", cost: 950, className: "theme-void" },
    { id: "sunset", icon: "◐", name: "SUNSET ROOF", description: "Golden hour that never clocks out.", cost: 540, className: "theme-sunset" },
    { id: "snow", icon: "❄", name: "FROST CABIN", description: "Cold outside. Maximum blanket energy inside.", cost: 620, className: "theme-snow" },
    { id: "space", icon: "✧", name: "ORBIT DEN", description: "Rent is cheap when gravity is optional.", cost: 820, className: "theme-space" },
    { id: "studio", icon: "♫", name: "RIZO STUDIO", description: "Tiny speakers. Unreasonably serious sessions.", cost: 880, className: "theme-studio" }
  ];

  const BOOSTS = [
    { id: "phoenix", icon: "🧵", name: "PHOENIX THREAD", description: "Automatically offers one emergency revival.", cost: 800, stackable: true },
    { id: "growth", icon: "⚗", name: "GROWTH JUICE", description: "+80 XP. Probably not approved by anyone.", cost: 70, stackable: true },
    { id: "care", icon: "♥", name: "CARE PACKAGE", description: "+30 to every need and +15 health.", cost: 240, stackable: true },
    { id: "ad-snack", icon: "▶", name: "SPONSOR SNACK", description: "Reserved rewarded-ad care boost for a future build.", cost: null, futureAd: true }
  ];

  const ACHIEVEMENTS = [
    { id: "origin", icon: "☂", name: "TOOK IT HOME", description: "Rescue the egg from the forest.", reward: 25, test: s => s.introSeen },
    { id: "hatched", icon: "🥚", name: "IT LIVES", description: "Hatch your first Rizo.", reward: 30, test: s => s.meta.totalHatched >= 1 },
    { id: "tap100", icon: "☝", name: "CERTIFIED CLICKER", description: "Tap a Rizo 100 times.", reward: 40, test: s => s.meta.totalTaps >= 100 },
    { id: "tap1000", icon: "⚡", name: "TOUCH GRASS LATER", description: "Tap Rizo 1,000 times.", reward: 160, test: s => s.meta.totalTaps >= 1000 },
    { id: "bond50", icon: "♥", name: "ACTUALLY FRIENDS", description: "Reach 50 bond.", reward: 55, test: s => s.pet?.bond >= 50 },
    { id: "strong", icon: "💪", name: "BUILT DIFFERENT", description: "Reach 50 strength.", reward: 60, test: s => Math.max(s.pet?.strength || 0, s.pet?.skills?.power || 0) >= 50 },
    { id: "collector5", icon: "◇", name: "RIZO RESEARCHER", description: "Discover five Rizo colors.", reward: 100, test: s => Object.keys(s.collection || {}).filter(k => s.collection[k] > 0).length >= 5 },
    { id: "capsule10", icon: "◉", name: "CAPSULE PROBLEM", description: "Open ten Forest Capsules.", reward: 120, test: s => s.meta.capsules >= 10 },
    { id: "golden", icon: "✦", name: "ONE PERCENT PROBLEM", description: "Discover a Golden Rizo.", reward: 250, test: s => Boolean(s.collection.golden) },
    { id: "diamond", icon: "💎", name: "IMPOSSIBLE LITTLE GUY", description: "Discover a Diamond Rizo.", reward: 500, test: s => Boolean(s.collection.diamond) },
    { id: "legend", icon: "♛", name: "RAISED DIFFERENT", description: "Raise a Rizo to Mature.", reward: 150, test: s => s.pet?.stage === "legend" },
    { id: "week", icon: "7", name: "SHOWED UP", description: "Reach a 7-day care streak.", reward: 100, test: s => s.player.streak >= 7 },
    { id: "heat10", icon: "🔥", name: "SEASONED KEEPER", description: "Reach Heat Level 10.", reward: 180, test: s => s.season?.level >= 10 },
    { id: "walk10", icon: "☂", name: "REGULAR ROUTE", description: "Take Rizo on ten Rain Walks.", reward: 110, test: s => (s.meta?.totalWalks || 0) >= 10 },
    { id: "treasure5", icon: "🧺", name: "POCKET MUSEUM", description: "Discover five different walk treasures.", reward: 150, test: s => Object.values(s.treasures || {}).filter(Boolean).length >= 5 },
    { id: "retro", icon: "▦", name: "OLD HARDWARE", description: "Discover Retro Rizo through the Arcade Signal.", reward: 350, test: s => Boolean(s.collection.retro) },
    { id: "shadow", icon: "●", name: "SOMETHING FOLLOWED", description: "Find Shadow Rizo in the Deep Forest.", reward: 500, test: s => Boolean(s.collection.shadow) },
    { id: "rebirth", icon: "↻", name: "THE FLAME REMEMBERS", description: "Raise one Rizo into a Legacy Egg.", reward: 250, test: s => (s.meta?.rebirths || 0) >= 1 },
    { id: "bondegg", icon: "♡", name: "TWO GARDENS, ONE SPARK", description: "Create a Bond Egg from two Keeper lineages.", reward: 325, test: s => (s.meta?.bondEggs || 0) >= 1 },
    { id: "gen3", icon: "III", name: "REAL LINEAGE", description: "Reach Generation 3.", reward: 500, test: s => (s.pet?.generation || 1) >= 3 },
    { id: "hiddenform", icon: "?", name: "HIDDEN PATH", description: "Awaken a hidden Rizo path.", reward: 300, test: s => ["pixel","eclipse","royal","prism"].includes(s.pet?.form) }
  ];

  const ORIGIN_STEPS = [
    { speaker: "YOU", text: "It was raining hard enough to erase the trail behind you." },
    { speaker: "...", text: "Then something tiny cried from underneath the roots." },
    { speaker: "YOU", text: "That is either an egg or the saddest rock I have ever seen." },
    { speaker: "...", text: "The shell was warm. The little sound inside was not." },
    { speaker: "THE FOREST", text: "You could leave it here. Technically." }
  ];

  const TALK_LINES = [
    "I HAVE NO IDEA WHAT I’M DOING.",
    "YOUR SCREEN TIME IS CRAZY.",
    "I WAS BORN FOR THE DROP.",
    "TAP WITH INTENTION.",
    "WE COULD BE MAKING MONEY RIGHT NOW.",
    "I AM LITERALLY FIRE.",
    "DO NOT PUT ME IN A GROUP CHAT.",
    "THIS ROOM NEEDS BETTER MERCH.",
    "I SAW WHAT YOU BOUGHT. INTERESTING.",
    "I’M NOT A PHASE. YOU’RE A PHASE.",
    "CAN WE GO OUTSIDE OR ARE WE DECOR NOW?",
    "I WOULD LIKE A SNACK AND POSSIBLY EQUITY."
  ];

  const DEATH_INSULTS = [
    "BRO. THE GAME GAVE YOU FOUR GIANT CARE BUTTONS.",
    "YOU KILLED A FLAME. THAT TAKES TALENT.",
    "THE EGG DESERVED A BETTER ZIP CODE.",
    "YOUR NEXT RIZO HAS ALREADY REQUESTED ANOTHER OWNER.",
    "NEGLECTED BY SOMEONE WHO TAPS THEIR PHONE ALL DAY. WILD.",
    "YOU HAD ONE JOB AND SOMEHOW CLOCKED OUT.",
    "THIS IS WHY DIGITAL PETS HAVE TRUST ISSUES."
  ];

  const PERSONALITIES = ["CHAOTIC GOOD","TINY CEO","SOFT MENACE","FOREST GREMLIN","DRAMA FLAME","QUIET GENIUS","SNACK SCHOLAR","CERTIFIED HATER","LOYAL WEIRDO","MAIN CHARACTER"];
  const PERSONALITY_TRAITS = {
    "CHAOTIC GOOD":{skill:"speed",mood:.12}, "TINY CEO":{skill:"power",mood:.04},
    "SOFT MENACE":{skill:"luck",mood:.10}, "FOREST GREMLIN":{skill:"instinct",mood:.08},
    "DRAMA FLAME":{skill:"instinct",mood:.14}, "QUIET GENIUS":{skill:"instinct",mood:.03},
    "SNACK SCHOLAR":{skill:"stamina",mood:.10}, "CERTIFIED HATER":{skill:"power",mood:.02},
    "LOYAL WEIRDO":{skill:"stamina",mood:.07}, "MAIN CHARACTER":{skill:"luck",mood:.13}
  };
  const MUTATIONS = [
    { id: "normal", weight: 92, name: "NORMAL SPARK" },
    { id: "starborn", weight: 4.5, name: "STARBORN" },
    { id: "stormmarked", weight: 3, name: "STORM-MARKED" },
    { id: "hollow", weight: .5, name: "HOLLOW FLAME" }
  ];
  const LORE_FRAGMENTS = [
    { id:"signal", title:"THE RIZO SIGNAL", text:"Every Rizo hears a low blue signal beneath heavy rain. Nobody knows who keeps transmitting it." },
    { id:"first", title:"THE FIRST FLAME", text:"The first Rizo was not born. It appeared in the smoke above an unfinished shirt and refused to leave." },
    { id:"eggs", title:"WHY EGGS CRY", text:"An unclaimed egg remembers every footstep that passed without stopping." },
    { id:"gold", title:"GOLDEN FEVER", text:"Golden Rizos collect shiny objects, compliments, and deeply irresponsible financial habits." },
    { id:"diamond", title:"THE DIAMOND MYTH", text:"A Diamond Rizo forms only when a storm reflects through a perfectly cared-for flame. Or so the forest claims." },
    { id:"void", title:"THE VOID DEN", text:"The Void Chamber was found already furnished. Nobody ordered the furniture." },
    { id:"glitch", title:"ERROR: RIZO", text:"Glitch Rizos occasionally remember choices the player has not made yet." },
    { id:"keeper", title:"THE KEEPERS", text:"A Keeper is anyone strange enough to carry a crying egg home instead of minding their business." },
    { id:"threads", title:"PHOENIX THREAD", text:"A black spool marked R can stitch one flame back into the world. It never works twice the same way." },
    { id:"apparel", title:"THE OUTSIDE BRAND", text:"Somewhere beyond the glass, humans wear the same marks the Rizos dream about." },
    { id:"obsidian", title:"OBSIDIAN SILENCE", text:"Obsidian Rizos do not cast shadows. Their shadows cast them." },
    { id:"forest", title:"THE DEEP WOODS", text:"Past the thirtieth tree, rain falls upward and every abandoned egg has a name." },
    { id:"retro", title:"THE OLD CARTRIDGE", text:"Retro Rizo was first seen inside a game cartridge with no label, no console, and a save file dated tomorrow." },
    { id:"shadow", title:"THE SHADOW FOLLOWER", text:"A Shadow Rizo cannot be bought or rolled. It chooses a Keeper after watching them in the Deep Forest." },
    { id:"rebirth", title:"LEGACY EGGS", text:"A loved flame does not end. It folds its strongest habits into a new shell and asks to be raised differently." },
    { id:"bond-eggs", title:"THE FRIENDSHIP SPARK", text:"When two mature Rizos trust their Keepers, their gardens can preserve a shared spark. The next Legacy Egg inherits bounded potential from both lineages without replacing either pet." }
  ];


  // Walk-only treasures create a second collection loop beyond color variants.
  const WALK_TREASURES = [
    { id:"blue-button", icon:"●", name:"BLUE BUTTON", rarity:"COMMON", weight:28 },
    { id:"smooth-rock", icon:"◆", name:"SUSPICIOUSLY SMOOTH ROCK", rarity:"COMMON", weight:24 },
    { id:"lost-tag", icon:"⌑", name:"LOST RIZO TAG", rarity:"UNCOMMON", weight:16 },
    { id:"moon-leaf", icon:"☾", name:"MOON LEAF", rarity:"UNCOMMON", weight:12 },
    { id:"tiny-key", icon:"⚿", name:"TINY KEY", rarity:"RARE", weight:8 },
    { id:"storm-bottle", icon:"ϟ", name:"BOTTLED STORM", rarity:"RARE", weight:5 },
    { id:"gold-thread", icon:"⌁", name:"GOLD THREAD", rarity:"EPIC", weight:3 },
    { id:"diamond-seed", icon:"◇", name:"DIAMOND SEED", rarity:"SECRET", weight:1 }
  ];

  // Short optional scenes keep long sessions surprising without blocking care.
  // Misfortune entries share the same trigger/resolution path, but carry a
  // deliberately tiny selection weight and never award the normal event Heat.
  const WORLD_EVENTS = [
    { id:"window-letter", icon:"✉", kicker:"A RANDOM KNOCK", title:"A LETTER HIT THE WINDOW", text:"It is addressed to Rizo in handwriting that looks exactly like rain.", choices:[
      { id:"open", label:"OPEN IT", result:"Inside: a tiny coupon, a wet leaf, and R 35.", effect:{embers:35,bond:4,mood:4,alignment:-1,skill:"luck",gain:.45}, memory:"Rizo received mail from a sender listed only as THE FOREST." },
      { id:"save", label:"SAVE IT FOR LORE", result:"The ink rearranged itself into a Forest Archive signal.", effect:{lore:1,bond:3,alignment:2,skill:"instinct",gain:.8}, memory:"You archived a letter that refused to keep the same words." }
    ]},
    { id:"sock-case", icon:"▰", kicker:"DEN MYSTERY", title:"THE SOCK IS MISSING", text:"Rizo is standing near an empty drawer and acting aggressively innocent.", choices:[
      { id:"investigate", label:"INVESTIGATE", result:"The sock was behind the toy box. Rizo found R 22 inside it.", effect:{embers:22,bond:5,alignment:1,skill:"instinct",gain:.55}, memory:"Solved the Case of the Extremely Obvious Sock." },
      { id:"approve", label:"ACCEPT THE LORE", result:"Rizo has claimed the sock as a cape. Happiness wins over evidence.", effect:{mood:12,hype:8,alignment:-2,skill:"luck",gain:.4}, memory:"Allowed Rizo to turn stolen laundry into fashion history." }
    ]},
    { id:"tiny-concert", icon:"♫", kicker:"UNANNOUNCED EVENT", title:"RIZO STARTED A CONCERT", text:"There is no audience, no permit, and somehow a full light show.", choices:[
      { id:"dance", label:"DANCE TOO", result:"The den shook. The bond grew. The neighbors probably noticed.", effect:{mood:15,bond:7,hype:12,alignment:1,skill:"speed",gain:.75}, memory:"Headlined a two-creature concert in the den." },
      { id:"tip", label:"TIP THE ARTIST", result:"Rizo immediately reinvested R 15 into snacks. Business-minded.", effect:{embers:-15,mood:20,bond:9,alignment:3,skill:"luck",gain:.6}, memory:"Paid Rizo for an unreleased six-second song." }
    ]},
    { id:"glowing-puddle", icon:"✦", kicker:"FOREST SIGNAL", title:"A PUDDLE IS GLOWING", text:"It is indoors. This raises several questions and answers none of them.", choices:[
      { id:"touch", label:"TOUCH IT", result:"The puddle popped into Prism Shards. Normal puddle behavior.", effect:{shards:18,mood:5,alignment:-3,skill:"luck",gain:1.1}, memory:"Touched the glowing puddle despite every available warning sign." },
      { id:"guard", label:"LET RIZO GUARD IT", result:"Rizo watched it until it became a snack-shaped reflection.", effect:{bond:10,energy:-4,alignment:2,skill:"stamina",gain:.8}, memory:"Trusted Rizo with a supernatural puddle. Nothing exploded." }
    ]},
    { id:"hide-event", icon:"?", kicker:"WHERE IS RIZO", title:"THE DEN IS TOO QUIET", text:"A tiny flame tail is visibly sticking out from behind the toy box.", choices:[
      { id:"find", label:"FOUND YOU", result:"Rizo celebrated like the hiding place was flawless.", effect:{mood:14,bond:8,embers:12,alignment:-1,skill:"speed",gain:.5}, memory:"Won hide-and-seek by noticing the glowing tail." },
      { id:"pretend", label:"KEEP LOOKING", result:"Rizo lasted twelve more seconds before laughing.", effect:{mood:18,bond:10,alignment:3,skill:"instinct",gain:.5}, memory:"Protected Rizo's confidence during a historically bad hiding attempt." }
    ]},
    { id:"shadow-watch", icon:"◐", scene:"shadow", kicker:"THE FOREST LOOKED BACK", title:"SOMETHING IS OUTSIDE", text:"A black flame shape is standing beyond the rainy glass. It copies Rizo one second late.", choices:[
      { id:"wave", label:"LET RIZO WAVE", result:"The shape returned the wave, then became part of the rain.", effect:{bond:10,mood:8,alignment:4,skill:"instinct",gain:1.2,lore:1}, memory:"Rizo greeted a Shadow signal without fear." },
      { id:"follow", label:"GO TO THE WINDOW", result:"Violet tracks appeared on the sill. They point toward the Deep Forest.", effect:{shards:12,alignment:-3,skill:"luck",gain:1.4,lore:1}, memory:"You followed the Shadow signal to a window that was still locked." }
    ]},
    { id:"roof-leak", icon:"☂", kind:"misfortune", weight:.16, scene:"forest", kicker:"BAD WEATHER FOUND A WAY IN", title:"THE ROOF STARTED LEAKING", text:"Cold water is landing directly on Rizo's bed. The landlord is apparently a cloud.", choices:[
      { id:"patch", label:"PATCH IT NOW", result:"The leak stopped, but the emergency patch ate R 48 and the whole night.", effect:{embers:-48,energy:-12,mood:-6,alignment:2}, memory:"Spent the night patching a roof leak before the den became a pond." },
      { id:"move", label:"MOVE THE BED", result:"The bed survived. Rizo slept in the draft and woke up sick.", effect:{energy:-18,mood:-10,hygiene:-7,health:-8,sick:true,alignment:-1}, memory:"Moved Rizo away from a leak, but the cold draft followed." }
    ]},
    { id:"spoiled-stash", icon:"☠", kind:"misfortune", weight:.16, kicker:"PANTRY DISASTER", title:"THE SNACK STASH TURNED", text:"Everything smells wrong. Rizo is staring at it like bad judgment is a food group.", choices:[
      { id:"trash", label:"THROW IT ALL OUT", result:"The bad food is gone. So are R 32 and most of tonight's dinner.", effect:{embers:-32,hunger:-16,mood:-7,alignment:2}, memory:"Threw away the spoiled snack stash before Rizo could make it worse." },
      { id:"taste", label:"LET RIZO CHECK ONE", result:"One bite answered every question. Rizo is now violently unimpressed and sick.", effect:{health:-16,hunger:-8,mood:-13,hygiene:-10,sick:true,alignment:-4}, memory:"Let Rizo test suspicious food and immediately regretted the experiment." }
    ]},
    { id:"broken-window", icon:"ϟ", kind:"misfortune", weight:.14, scene:"shadow", kicker:"THE NIGHT HIT BACK", title:"A BRANCH BROKE THE WINDOW", text:"Rain is coming through the glass and the room temperature is making threats.", choices:[
      { id:"repair", label:"EMERGENCY REPAIR", result:"The window is sealed with boards, tape, and R 65 worth of humility.", effect:{embers:-65,energy:-14,mood:-8,hygiene:-5,alignment:1}, memory:"Repaired a broken window in the middle of a storm." },
      { id:"blanket", label:"BUILD A BLANKET FORT", result:"The fort held until morning. Rizo did not. The cold forced a recovery rest.", effect:{energy:-24,mood:-16,health:-18,recovery:"storm shock",alignment:3}, memory:"Waited out a broken window inside a blanket fort while Rizo recovered." }
    ]},
    { id:"lost-pouch", icon:"◇", kind:"misfortune", weight:.18, kicker:"FOREST PICKPOCKET", title:"THE EMBER POUCH IS GONE", text:"There is a clean little bite mark on the strap and zero witnesses willing to talk.", choices:[
      { id:"search", label:"SEARCH THE TRAIL", result:"You found the strap, three muddy footprints, and none of the R 54 inside.", effect:{embers:-54,energy:-16,mood:-8,hygiene:-8,alignment:-2}, memory:"Followed the trail of a stolen Ember pouch and recovered only the strap." },
      { id:"accept", label:"CUT THE LOSS", result:"The pouch stayed gone. Rizo took it personally for the rest of the day.", effect:{embers:-38,mood:-18,bond:-5,hype:-10,alignment:1}, memory:"Accepted that a forest thief escaped with the Ember pouch." }
    ]},
  ];

  const EXPEDITIONS = {
    puddle:{ name:"PUDDLE RUN", minutes:2, energy:4, min:18, max:42, heat:12, loreChance:.12, capsuleChance:.05 },
    trail:{ name:"RAIN TRAIL", minutes:10, energy:9, min:55, max:110, heat:35, loreChance:.28, capsuleChance:.14 },
    deep:{ name:"DEEP WOODS", minutes:30, energy:16, min:130, max:260, heat:85, loreChance:.58, capsuleChance:.32 }
  };

  // ===== RIZO HOUSE: passive storage rooms for extra Rizos =====
  // Internal save data still lives under state.farm for compatibility with v9 and older saves.
  const HOUSE_ROOM_CAPACITY = 3;
  const HOUSE_ADOPTION_COST = 2500;
  const HOUSE_UNLOCK_LEVEL = 4;
  const HOUSE_UNLOCK_XP = 16 * Math.pow(HOUSE_UNLOCK_LEVEL - 1, 2);
  const HOUSE_ROOMS = [
    { id:0, name:"THE SPARE ROOM", short:"ROOM 1", cost:0, className:"house-room-spare", icon:"⌂", copy:"The first three extra Rizos live close enough to hear the Den." },
    { id:1, name:"THE LOFT", short:"ROOM 2", cost:6000, className:"house-room-loft", icon:"△", copy:"Higher ceilings, neon rain, and enough space for three more personalities." },
    { id:2, name:"THE ROOFTOP", short:"ROOM 3", cost:15000, className:"house-room-rooftop", icon:"☾", copy:"A private skyline where the older Rizos stay up too late." },
    { id:3, name:"THE PENTHOUSE", short:"ROOM 4", cost:35000, className:"house-room-penthouse", icon:"✦", copy:"Endgame housing. The furniture is expensive and nobody respects it." }
  ];
  const HOUSE_MAX_TOTAL = HOUSE_ROOMS.length * HOUSE_ROOM_CAPACITY;
  const FARM_ROSTER_MAX = HOUSE_MAX_TOTAL; // legacy internal name retained for imported saves and old helper calls.
  const HOUSE_SLOT_POSITIONS = [
    { x:20, y:66, pose:"resident-left" },
    { x:50, y:57, pose:"resident-center" },
    { x:80, y:67, pose:"resident-right" }
  ];


  const el = {
    originScreen: $("#originScreen"), rainLayer: $("#rainLayer"), foundEgg: $("#foundEgg"), storySpeaker: $("#storySpeaker"), storyText: $("#storyText"), storyChoices: $("#storyChoices"), storyNext: $("#storyNext"), skipOrigin: $("#skipOrigin"),
    gameShell: $("#gameShell"), keeperShort: $("#keeperShort"), streakCount: $("#streakCount"), coinCount: $("#coinCount"), dailyGiftButton: $("#dailyGiftButton"), brandButton: $("#brandButton"),
    tutorialBanner: $("#tutorialBanner"), tutorialStepBadge: $("#tutorialStepBadge"), tutorialText: $("#tutorialText"), tutorialClose: $("#tutorialClose"),
    habitatScene: $("#habitatScene"), gardenVisitor: $("#gardenVisitor"), visitorSprite: $("#visitorSprite"), visitorAccessory: $("#visitorAccessory"), visitorName: $("#visitorName"), weatherFx: $("#weatherFx"), denCareTrace: $("#denCareTrace"), moodChip: $("#moodChip"), sceneMenuButton: $("#sceneMenuButton"), thoughtBubble: $("#thoughtBubble"), petTapTarget: $("#petTapTarget"), eggActor: $("#eggActor"), petActor: $("#petActor"), petSprite: $("#petSprite"), faceFx: $("#faceFx"), statusFx: $("#statusFx"), accessoryLayer: $("#accessoryLayer"), tapCombo: $("#tapCombo"), petName: $("#petName"), petDescriptor: $("#petDescriptor"), petLevel: $("#petLevel"), growthTitle: $("#growthTitle"), growthText: $("#growthText"), growthBar: $("#growthBar"), needGrid: $("#needGrid"), careName: $("#careName"), sleepActionText: $("#sleepActionText"),
    hungerText: $("#hungerText"), moodText: $("#moodText"), energyText: $("#energyText"), hygieneText: $("#hygieneText"), hungerBar: $("#hungerBar"), moodBar: $("#moodBar"), energyBar: $("#energyBar"), hygieneBar: $("#hygieneBar"),
    questTitle: $("#questTitle"), questBar: $("#questBar"), questText: $("#questText"), questClaim: $("#questClaim"), memoryTitle: $("#memoryTitle"), memoryText: $("#memoryText"), journalJump: $("#journalJump"), moreCareButton: $("#moreCareButton"),
    miniPause: $("#miniPause"), miniPausePanel: $("#miniPausePanel"), bestPower: $("#bestPower"), bestSpark: $("#bestSpark"), bestForage: $("#bestForage"), bestRush: $("#bestRush"), bestWalk: $("#bestWalk"), bestRhythm: $("#bestRhythm"), bestMemory: $("#bestMemory"), bestGlide: $("#bestGlide"), bestBreaker: $("#bestBreaker"), bestMaze: $("#bestMaze"), bestDefense: $("#bestDefense"), expeditionStatus: $("#expeditionStatus"), expeditionOptions: $("#expeditionOptions"), expeditionClaim: $("#expeditionClaim"),
    closetActor: $("#closetActor"), closetSprite: $("#closetSprite"), closetAccessory: $("#closetAccessory"), closetName: $("#closetName"), closetVariant: $("#closetVariant"), shopList: $("#shopList"),
    profileActor: $("#profileActor"), profileSprite: $("#profileSprite"), profileAccessory: $("#profileAccessory"), profileRarity: $("#profileRarity"), profileName: $("#profileName"), profileBio: $("#profileBio"), renameButton: $("#renameButton"), journalContent: $("#journalContent"),
    farmContent: $("#farmContent"),
    sheetBackdrop: $("#sheetBackdrop"), bottomSheet: $("#bottomSheet"), sheetKicker: $("#sheetKicker"), sheetTitle: $("#sheetTitle"), sheetBody: $("#sheetBody"), sheetClose: $("#sheetClose"),
    modalOverlay: $("#modalOverlay"), miniGameOverlay: $("#miniGameOverlay"), miniKicker: $("#miniKicker"), miniTitle: $("#miniTitle"), miniTimer: $("#miniTimer"), miniScore: $("#miniScore"), miniArena: $("#miniArena"), miniTarget: $("#miniTarget"), miniHint: $("#miniHint"), miniQuit: $("#miniQuit"),
    toastStack: $("#toastStack"), importSaveInput: $("#importSaveInput"), sensoryFlash: $("#sensoryFlash"), seasonLevel: $("#seasonLevel"), seasonBar: $("#seasonBar"), seasonText: $("#seasonText"), seasonReward: $("#seasonReward"), keeperRank: $("#keeperRank")
  };

  let state;
  let currentView = "home";
  let shopTab = "wear";
  let journalTab = "stats";
  let activeHouseRoom = 0;
  let originIndex = 0;
  let storyTimer = null;
  let speechTimer = null;
  let comboTimer = null;
  let lastTapAt = 0;
  let combo = 0;
  let tapHistory = [];
  let refuseUntil = 0;
  let overloadCooldownUntil = 0;
  let saveTimer = null;
  let mini = { active: false, mode: null, score: 0, hits: 0, endAt: 0, timer: null, mover: null, currentGood: true, frame: null, intervals: [], entities: [] };
  let defenseResizeFrame = null;
  let runtimeViewportFrame = null;
  let runtimeViewportTimer = null;
  let runtimeSuspendedAt = 0;
  let runtimeSuspendReason = "";
  let defenseViewportScroll = null;
  let releaseUpdateReady = false;
  let defenseRendererOverride = null;
  let releaseRegistration = null;
  let lastOfflineSummary = null;
  let activePetBehavior = null;
  let petBehaviorTimer = null;
  let worldEventOpen = false;
  let activeMusicOverride = null;
  let pendingEvolution = null;
  let musicUnlocked = false;
  let musicTimer = null;
  let musicStep = 0;
  let musicScene = "";
  let musicGainNode = null;
  let musicStopTimer = null;
  let musicTransitionToken = 0;
  let cutsceneToken = 0;
  let feedDrag = null;
  let feedClickBlockedUntil = 0;
  const MUSIC_MASTER_GAIN = .78;
  const SFX_MASTER_GAIN = 1.75;

  function uid(prefix = "RZ") {
    const random = crypto?.getRandomValues ? [...crypto.getRandomValues(new Uint8Array(6))].map(v => v.toString(16).padStart(2, "0")).join("") : Math.random().toString(16).slice(2, 14);
    return `${prefix}-${random.toUpperCase()}`;
  }

  function weightedPick(items) {
    let roll = Math.random() * items.reduce((sum, item) => sum + item.weight, 0);
    for (const item of items) { roll -= item.weight; if (roll <= 0) return item; }
    return items[0];
  }

  function rollVariant(lucky = false, commonOnly = false, pity = 0) {
    const capsulePool = VARIANTS.filter(v => v.capsule !== false && (!v.prismOnly || lucky));
    if (commonOnly) return VARIANTS[0];
    if (pity >= 49) return weightedPick(capsulePool.filter(v => ["obsidian","aurora","golden","diamond","retro"].includes(v.id)).map(v => ({...v, weight: v.id === "diamond" ? 1 : v.id === "retro" ? .8 : v.id === "golden" ? 4 : 6})));
    const luckyWeights = {classic:16,ember:16,toxic:14,violet:11,moss:9,bubblegum:9,frost:8,glitch:6,obsidian:4,aurora:3.2,golden:2.8,diamond:1.2,retro:1};
    const pool = capsulePool.map(v => ({...v, weight: lucky || pity >= 24 ? (luckyWeights[v.id] || v.weight) : v.weight}));
    return weightedPick(pool);
  }

  function rollMutation() { return weightedPick(MUTATIONS); }

  function createGenes(parent = null, partner = null) {
    const genes = {};
    for (const skill of SKILLS) {
      const aGene = Number(parent?.genes?.[skill.id]) || 100;
      const bGene = Number(partner?.genes?.[skill.id]) || aGene;
      const aPerformance = Number(parent?.skills?.[skill.id]) || 0;
      const bPerformance = Number(partner?.skills?.[skill.id]) || 0;
      const blended = partner ? aGene * .56 + bGene * .44 : aGene;
      const trainingBoost = parent ? Math.min(24, Math.floor((aPerformance + bPerformance * .45) * .10) + 4) : 0;
      genes[skill.id] = clamp(Math.round(blended + trainingBoost + (Math.random() * 14 - 7)), 82, 170);
    }
    const aGrowth = Number(parent?.genes?.growth) || 100;
    const bGrowth = Number(partner?.genes?.growth) || aGrowth;
    genes.growth = clamp(Math.round((partner ? aGrowth * .58 + bGrowth * .42 : aGrowth) + (parent ? 3 : 0) + (Math.random() * 10 - 5)), 85, 140);
    return genes;
  }

  function createPet({ lucky = false, shame = false, pity = state?.meta?.pity || 0, number = state?.meta?.nextPetNumber || 1 } = {}) {
    const rolled = rollVariant(lucky, shame, pity);
    const mutation = rollMutation();
    number = Math.max(1, Math.floor(Number(number) || 1));
    return {
      id: uid("PET"),
      number,
      name: `RIZO ${String(number).padStart(2, "0")}`,
      stage: "egg",
      hiddenVariant: rolled.id,
      variant: null,
      createdAt: now(),
      bornAt: null,
      lastTick: now(),
      lifespanDays: 42 + Math.floor(Math.random() * 25),
      hatch: 0,
      xp: 0,
      level: 0,
      bond: 0,
      strength: 0,
      skills: { speed: 0, power: 0, instinct: 0, stamina: 0, luck: 0 },
      genes: createGenes(),
      alignment: 0,
      careProfile: { kind: 0, wild: 0, balanced: 0, foods: {}, games: {} },
      form: "balanced",
      formHistory: [],
      generation: 1,
      lineageTrait: null,
      lastTrainedSkill: "stamina",
      resting: false,
      elder: false,
      hype: 0,
      taps: 0,
      personality: PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)],
      mutation: mutation.id,
      overstimulation: 0,
      health: 100,
      hunger: 92,
      mood: 88,
      energy: 92,
      hygiene: 90,
      sleeping: false,
      sick: false,
      lifeMemory: { lastGreetingDate:"", lastSeenAt:now(), recentWins:0, recentCare:0, moodMomentum:0, secretStage:0, filthSeen:false, bathIncidentRemembered:false, favoriteFoodRemembered:false, washUntil:0, washFromHygiene:100, lastBathAt:0, lastFoodAt:0, lastFoodId:"", arcadeAfterglowUntil:0, lastArcadeMode:"", lifeBehaviorUntil:0 },
      alive: true,
      deathReason: null,
      accessory: "none",
      room: "rain",
      shame,
      graceUntil: null,
      lastFreeSnack: 0
    };
  }

  function createDaily() {
    const key = dateKey();
    const choices = [
      { type: "tap", title: "TAP YOUR RIZO 25 TIMES", target: 25, reward: 30 },
      { type: "feed", title: "SERVE 2 QUESTIONABLE MEALS", target: 2, reward: 35 },
      { type: "play", title: "FINISH 1 ARCADE RUN", target: 1, reward: 40 },
      { type: "clean", title: "CLEAN YOUR RIZO ONCE", target: 1, reward: 30 },
      { type: "train", title: "FINISH 1 POWER TAP RUN", target: 1, reward: 45 },
      { type: "walk", title: "TAKE RIZO ON 1 RAIN WALK", target: 1, reward: 45 }
    ];
    const seed = [...key].reduce((sum, c) => sum + c.charCodeAt(0), 0);
    const chosen = choices[seed % choices.length];
    return { date: key, ...chosen, progress: 0, claimed: false, giftClaimed: false };
  }

  function normalizeDailyState(rawDaily) {
    const canonical = createDaily();
    if (!rawDaily || typeof rawDaily !== "object" || rawDaily.date !== canonical.date) return canonical;
    const parsedProgress = Number(rawDaily.progress);
    return {
      ...canonical,
      progress: clamp(Number.isFinite(parsedProgress) ? parsedProgress : 0, 0, canonical.target),
      claimed: Boolean(rawDaily.claimed),
      giftClaimed: Boolean(rawDaily.giftClaimed)
    };
  }

  function normalizeExpeditionState(rawExpedition) {
    const empty = { active: false, ready: false, type: null, endAt: 0, result: null };
    if (!rawExpedition || typeof rawExpedition !== "object" || !rawExpedition.active) return empty;
    const type = typeof rawExpedition.type === "string" && EXPEDITIONS[rawExpedition.type] ? rawExpedition.type : null;
    if (!type) return empty;
    const data = EXPEDITIONS[type], current = now(), parsedEndAt = Number(rawExpedition.endAt);
    const endAt = Number.isFinite(parsedEndAt) && parsedEndAt > 0
      ? Math.min(parsedEndAt, current + data.minutes * 60000)
      : current;
    const rawResult = rawExpedition.result && typeof rawExpedition.result === "object" ? rawExpedition.result : {};
    const parsedEmbers = Number(rawResult.embers);
    return {
      active: true,
      ready: Boolean(rawExpedition.ready) || current >= endAt,
      type,
      endAt,
      result: {
        embers: clamp(Number.isFinite(parsedEmbers) ? Math.floor(parsedEmbers) : data.min, data.min, data.max),
        heat: data.heat,
        capsule: Boolean(rawResult.capsule),
        lore: Boolean(rawResult.lore)
      }
    };
  }

  // ===== SAVE MODEL AND MIGRATION =====
  function defaultState() {
    const base = {
      version: VERSION,
      introSeen: false,
      player: {
        keeperId: uid("KEEPER"),
        createdAt: now(),
        lastActive: now(),
        lastSessionAt: now(),
        totalSessions: 1,
        streak: 1,
        lastVisitDate: dateKey(),
        tutorialStep: 0,
        tutorialDismissed: false,
        keeperGuideSeen: false,
        defenseSchool: { dismissed: false, completed: [], replay: false }
      },
      wallet: { embers: 100, shards: 0 },
      pet: null,
      inventory: {
        accessories: ["none"],
        rooms: ["rain"],
        phoenix: 0,
        growth: 0,
        care: 0
      },
      collection: {},
      memories: [],
      graveyard: [],
      legacy: [],
      achievements: [],
      daily: createDaily(),
      scores: { power: 0, spark: 0, forage: 0, rush: 0, walk: 0, rhythm: 0, memory: 0, glide: 0, breaker: 0, maze: 0, defense: 0, defenseMilestones: [], defenseMaps: {}, defensePerfectMaps: [], defenseHistory: [], defenseMastery: {}, defenseContracts: [] },
      treasures: {},
      worldEvents: { lastAt: now(), count: 0, seen: [], lastBadLuckAt: 0, badLuckCount: 0 },
      garden: { toyUses: {}, favoriteToy: null, lastToyAt: 0, nextEggVariant: null, bondSeed: null, lastPairKeeper: null },
      farm: defaultFarmState(),
      social: { visitors: [], currentVisitor: null, lastVisitRewardDate: null, pairings: [] },
      season: { xp: 0, level: 1 },
      expedition: { active: false, ready: false, type: null, endAt: 0, result: null },
      loreUnlocked: ["keeper"],
      settings: { sound: true, soundVolume: .85, music: true, musicVolume: .85, haptics: true, reducedMotion: false, defenseFx: "auto", defenseUiScale: "standard", defenseSignatures: true, defenseAutoStart: false, defenseWaveIntel: "simple", defenseRosterIds: [], defenseRosterConfigured: false, adPreview: false },
      musicHistory: { emberBag: [], emberLast: null },
      meta: { totalHatched: 0, totalTaps: 0, totalCareActions: 0, totalGames: 0, totalWalks: 0, deaths: 0, recoveries: 0, rebirths: 0, bondEggs: 0, nextPetNumber: 1, capsules: 0, pity: 0, refusals: 0, overloads: 0, retroSignal: 0, shadowFinds: 0, unlockScenes: [], backupPrompts: [], lastBackupAt: 0 }
    };
    base.pet = createPet({ pity: 0, number: 1 });
    base.meta.nextPetNumber = base.pet.number + 1;
    return base;
  }

  function normalizeState(raw) {
    // Imported/legacy saves are untrusted input. Normalize every collection and
    // clamp simulation numbers so one malformed field cannot break the whole UI.
    raw = raw && typeof raw === "object" ? raw : {};
    const fresh = defaultState();
    const sourceInventory = raw.inventory && typeof raw.inventory === "object" ? raw.inventory : {};
    const merged = {
      ...fresh,
      ...raw,
      player: { ...fresh.player, ...(raw.player && typeof raw.player === "object" ? raw.player : {}) },
      wallet: { ...fresh.wallet, ...(raw.wallet && typeof raw.wallet === "object" ? raw.wallet : {}) },
      inventory: { ...fresh.inventory, ...sourceInventory },
      scores: { ...fresh.scores, ...(raw.scores && typeof raw.scores === "object" ? raw.scores : {}) },
      treasures: raw.treasures && typeof raw.treasures === "object" && !Array.isArray(raw.treasures) ? raw.treasures : {},
      worldEvents: { ...fresh.worldEvents, ...(raw.worldEvents && typeof raw.worldEvents === "object" ? raw.worldEvents : {}) },
      season: { ...fresh.season, ...(raw.season && typeof raw.season === "object" ? raw.season : {}) },
      expedition: normalizeExpeditionState(raw.expedition),
      settings: { ...fresh.settings, ...(raw.settings && typeof raw.settings === "object" ? raw.settings : {}) },
      musicHistory: { ...fresh.musicHistory, ...(raw.musicHistory && typeof raw.musicHistory === "object" ? raw.musicHistory : {}) },
      meta: { ...fresh.meta, ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}) },
      collection: raw.collection && typeof raw.collection === "object" && !Array.isArray(raw.collection) ? raw.collection : {},
      memories: Array.isArray(raw.memories) ? raw.memories.slice(0, 60) : [],
      graveyard: Array.isArray(raw.graveyard) ? raw.graveyard.slice(0, 60) : [],
      legacy: Array.isArray(raw.legacy) ? raw.legacy.slice(0, 40) : [],
      garden: { ...fresh.garden, ...(raw.garden && typeof raw.garden === "object" ? raw.garden : {}) },
      social: { ...fresh.social, ...(raw.social && typeof raw.social === "object" ? raw.social : {}) },
      farm: (() => {
        const freshHouse = defaultFarmState();
        const rawFarm = raw.farm && typeof raw.farm === "object" ? raw.farm : {};
        const rawRoster = Array.isArray(rawFarm.roster) ? rawFarm.roster : [];
        const roster = rawRoster
          .filter(item => item && typeof item === "object" && typeof item.id === "string" && VARIANTS.some(variant => variant.id === item.variant))
          .slice(0, HOUSE_MAX_TOTAL)
          .map((item, index) => {
            const housePet = {
              ...fresh.pet,
              ...item,
              skills: { ...(fresh.pet.skills || {}), ...(item.skills && typeof item.skills === "object" ? item.skills : {}) },
              genes: { ...(fresh.pet.genes || {}), ...(item.genes && typeof item.genes === "object" ? item.genes : {}) },
              careProfile: {
                ...(fresh.pet.careProfile || {}),
                ...(item.careProfile && typeof item.careProfile === "object" ? item.careProfile : {}),
                foods: { ...(fresh.pet.careProfile?.foods || {}), ...(item.careProfile?.foods && typeof item.careProfile.foods === "object" ? item.careProfile.foods : {}) },
                games: { ...(fresh.pet.careProfile?.games || {}), ...(item.careProfile?.games && typeof item.careProfile.games === "object" ? item.careProfile.games : {}) }
              }
            };
            housePet.number = Math.max(1, Math.floor(Number(housePet.number) || index + 2));
            housePet.name = typeof housePet.name === "string" && housePet.name.trim()
              ? housePet.name.trim().replace(/[<>\u0000-\u001F\u007F]/g, "").slice(0, 14).toUpperCase()
              : `RIZO ${String(housePet.number).padStart(2, "0")}`;
            housePet.id = String(housePet.id).slice(0, 80);
            housePet.stage = STAGES.some(stage => stage.id === housePet.stage) ? housePet.stage : "kid";
            housePet.hiddenVariant = VARIANTS.some(variant => variant.id === housePet.hiddenVariant) ? housePet.hiddenVariant : housePet.variant;
            housePet.accessory = ACCESSORIES.some(entry => entry.id === housePet.accessory) ? housePet.accessory : "none";
            housePet.room = ROOMS.some(entry => entry.id === housePet.room) ? housePet.room : "rain";
            housePet.form = EVOLUTION_FORMS[housePet.form] ? housePet.form : "balanced";
            housePet.personality = PERSONALITIES.includes(housePet.personality) ? housePet.personality : "LOYAL WEIRDO";
            housePet.mutation = MUTATIONS.some(entry => entry.id === housePet.mutation) ? housePet.mutation : "normal";
            for (const key of ["hatch", "xp", "level", "bond", "strength", "hype", "taps", "overstimulation", "health", "hunger", "mood", "energy", "hygiene", "lastFreeSnack", "lastTick", "createdAt"]) {
              const value = housePet[key];
              const parsed = value === null || value === "" ? NaN : Number(value);
              housePet[key] = Number.isFinite(parsed) ? parsed : (Number(fresh.pet[key]) || 0);
            }
            for (const key of ["hatch", "bond", "strength", "overstimulation", "health", "hunger", "mood", "energy", "hygiene"]) housePet[key] = clamp(housePet[key]);
            housePet.xp = DefenseCore.clampNumber(housePet.xp, 0, DEFENSE_LIMITS.MAX_PLAYER_XP, 0);
            housePet.hype = DefenseCore.clampNumber(housePet.hype, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0);
            housePet.taps = DefenseCore.clampInteger(housePet.taps, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0);
            const houseStageSeed = { egg: 0, spark: 2, kid: 7, teen: 15, beast: 28, legend: 45 }[housePet.stage] || 0;
            for (const skill of SKILLS) {
              housePet.genes[skill.id] = clamp(Number(housePet.genes[skill.id]) || 100, 82, 170);
              const rawHouseSkill = housePet.skills[skill.id], parsedHouseSkill = rawHouseSkill === null || rawHouseSkill === "" ? NaN : Number(rawHouseSkill);
              housePet.skills[skill.id] = clamp(Number.isFinite(parsedHouseSkill) ? parsedHouseSkill : (skill.id === "power" ? Math.max(houseStageSeed, housePet.strength || 0) : houseStageSeed), 0, housePet.genes[skill.id]);
            }
            housePet.alive = housePet.alive !== false;
            housePet.sleeping = Boolean(housePet.sleeping);
            housePet.sick = Boolean(housePet.sick);
            housePet.resting = Boolean(housePet.resting);
            housePet.lastTick = housePet.lastTick > 0 ? housePet.lastTick : now();
            housePet.createdAt = housePet.createdAt > 0 ? housePet.createdAt : now();
            housePet.homeRoom = Number.isInteger(Number(item.homeRoom)) ? clamp(Math.floor(Number(item.homeRoom)), 0, HOUSE_ROOMS.length - 1) : Math.floor(index / HOUSE_ROOM_CAPACITY);
            return housePet;
          });
        const requiredRooms = Math.max(1, Math.ceil(roster.length / HOUSE_ROOM_CAPACITY));
        const rawUnlocked = Array.isArray(rawFarm.unlockedRooms) ? rawFarm.unlockedRooms.map(Number).filter(Number.isInteger) : [0];
        const unlockedRooms = [...new Set([0, ...rawUnlocked, ...Array.from({length:requiredRooms},(_,i)=>i)])]
          .filter(id => HOUSE_ROOMS.some(room => room.id === id))
          .sort((a,b)=>a-b);
        roster.forEach((pet,index) => {
          if (!unlockedRooms.includes(pet.homeRoom)) pet.homeRoom = Math.floor(index / HOUSE_ROOM_CAPACITY);
          const residentsBefore = roster.slice(0,index).filter(other => other.homeRoom === pet.homeRoom).length;
          if (residentsBefore >= HOUSE_ROOM_CAPACITY) {
            const openRoom = unlockedRooms.find(roomId => roster.slice(0,index).filter(other => other.homeRoom === roomId).length < HOUSE_ROOM_CAPACITY);
            pet.homeRoom = openRoom ?? 0;
          }
        });
        const requestedRoom = Math.floor(Number(rawFarm.activeRoom));
        const activeRoom = unlockedRooms.includes(requestedRoom) ? requestedRoom : unlockedRooms[0];
        return {
          roster,
          unlockedRooms,
          activeRoom,
          totalAdoptions: DefenseCore.clampInteger(rawFarm.totalAdoptions, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0),
          totalReleased: DefenseCore.clampInteger(rawFarm.totalReleased, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0),
          lastAdoptionAt: DefenseCore.clampNumber(rawFarm.lastAdoptionAt, 0, Number.MAX_SAFE_INTEGER, 0),
          featureUnlocked: Boolean(rawFarm.featureUnlocked) || roster.length > 0 || unlockedRooms.length > 1,
          unlockSeen: Boolean(rawFarm.unlockSeen) || roster.length > 0 || unlockedRooms.length > 1,
          // Retained only so imported Farm saves never lose historical counters.
          plots: Array.isArray(rawFarm.plots) ? rawFarm.plots : [],
          materials: DefenseCore.clampInteger(rawFarm.materials, 0, DEFENSE_LIMITS.MAX_INVENTORY_STACK, 0),
          totalHarvests: DefenseCore.clampInteger(rawFarm.totalHarvests, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0),
          totalCatches: DefenseCore.clampInteger(rawFarm.totalCatches, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0),
          lastEncounterAt: Math.max(0, Number(rawFarm.lastEncounterAt) || 0)
        };
      })(),
      achievements: Array.isArray(raw.achievements) ? [...new Set(raw.achievements.filter(value => typeof value === "string" && ACHIEVEMENTS.some(item => item.id === value)))] : [],
      loreUnlocked: Array.isArray(raw.loreUnlocked) ? [...new Set(raw.loreUnlocked.filter(value => typeof value === "string"))] : ["keeper"],
      daily: normalizeDailyState(raw.daily),
      pet: { ...fresh.pet, ...(raw.pet && typeof raw.pet === "object" ? raw.pet : {}) }
    };

    const hadDefenseSchool = Boolean(raw.player && typeof raw.player === "object" && Object.prototype.hasOwnProperty.call(raw.player, "defenseSchool"));
    const experiencedDefense = Math.max(0, Number(merged.scores?.defense) || 0) > 0 || (merged.scores?.defenseHistory || []).length > 0 || (merged.scores?.defenseMilestones || []).length > 0;
    merged.player.defenseSchool = normalizeDefenseSchool(merged.player.defenseSchool, { experienced: experiencedDefense && !hadDefenseSchool });
    merged.version = VERSION;
    const validEmberTrackIds = new Set(typeof EMBER_BEAT_TRACKS === "undefined" ? [] : EMBER_BEAT_TRACKS.map(track => track.id));
    merged.musicHistory.emberBag = Array.isArray(merged.musicHistory.emberBag) ? [...new Set(merged.musicHistory.emberBag.filter(id => validEmberTrackIds.has(id)))].slice(0, 6) : [];
    merged.musicHistory.emberLast = validEmberTrackIds.has(merged.musicHistory.emberLast) ? merged.musicHistory.emberLast : null;
    merged.settings.sound = merged.settings.sound !== false;
    merged.settings.music = merged.settings.music !== false;
    merged.settings.haptics = merged.settings.haptics !== false;
    merged.settings.reducedMotion = Boolean(merged.settings.reducedMotion);
    merged.settings.defenseFx = ["auto", "full", "low"].includes(merged.settings.defenseFx) ? merged.settings.defenseFx : "auto";
    merged.settings.defenseUiScale = ["compact", "standard", "large"].includes(merged.settings.defenseUiScale) ? merged.settings.defenseUiScale : "standard";
    merged.settings.defenseSignatures = merged.settings.defenseSignatures !== false;
    merged.settings.defenseAutoStart = Boolean(merged.settings.defenseAutoStart);
    merged.settings.defenseWaveIntel = ["off", "simple", "full"].includes(merged.settings.defenseWaveIntel) ? merged.settings.defenseWaveIntel : "simple";
    merged.settings.defenseRosterIds = Array.isArray(merged.settings.defenseRosterIds) ? [...new Set(merged.settings.defenseRosterIds.filter(id => typeof id === "string" && id.length <= 80))].slice(0, 3) : [];
    merged.settings.defenseRosterConfigured = Boolean(merged.settings.defenseRosterConfigured);
    merged.settings.adPreview = Boolean(merged.settings.adPreview);
    merged.settings.soundVolume = clamp(Number(merged.settings.soundVolume ?? .85), 0, 1);
    merged.settings.musicVolume = clamp(Number(merged.settings.musicVolume ?? .85), 0, 1);
    merged.player.keeperId = typeof merged.player.keeperId === "string" && merged.player.keeperId ? merged.player.keeperId.slice(0, 80) : uid("KEEPER");
    merged.player.tutorialStep = clamp(Number(merged.player.tutorialStep) || 0, 0, 5);
    merged.player.tutorialDismissed = Boolean(merged.player.tutorialDismissed);
    merged.player.keeperGuideSeen = Boolean(merged.player.keeperGuideSeen);
    merged.wallet.embers = DefenseCore.clampInteger(merged.wallet.embers, 0, DEFENSE_LIMITS.MAX_WALLET_EMBERS, 0);
    merged.wallet.shards = DefenseCore.clampInteger(merged.wallet.shards, 0, DEFENSE_LIMITS.MAX_WALLET_SHARDS, 0);
    merged.collection = Object.fromEntries(Object.entries(merged.collection)
      .filter(([id]) => VARIANTS.some(item => item.id === id))
      .map(([id,count]) => [id, DefenseCore.clampInteger(count, 0, DEFENSE_LIMITS.MAX_COLLECTION_COUNT, 0)]));
    merged.inventory.accessories = Array.isArray(sourceInventory.accessories) ? [...new Set(["none", ...sourceInventory.accessories.filter(id => ACCESSORIES.some(item => item.id === id))])] : ["none"];
    merged.inventory.rooms = Array.isArray(sourceInventory.rooms) ? [...new Set(["rain", ...sourceInventory.rooms.filter(id => ROOMS.some(item => item.id === id))])] : ["rain"];
    for (const key of ["phoenix", "growth", "care"]) merged.inventory[key] = DefenseCore.clampInteger(merged.inventory[key], 0, DEFENSE_LIMITS.MAX_INVENTORY_STACK, 0);
    for (const key of ["power", "spark", "forage", "rush", "walk", "rhythm", "memory", "glide", "breaker", "maze"]) merged.scores[key] = DefenseCore.clampNumber(merged.scores[key], 0, DEFENSE_LIMITS.MAX_REASONABLE_DAMAGE, 0);
    merged.scores.defense = DefenseCore.clampInteger(merged.scores.defense, 0, DEFENSE_LIMITS.MAX_SUPPORTED_WAVE, 0);
    merged.scores.defenseMilestones = Array.isArray(merged.scores.defenseMilestones) ? [...new Set(merged.scores.defenseMilestones.map(Number).filter(value => [10,25,50,100].includes(value)))].sort((a,b)=>a-b) : [];
    merged.scores.defenseMaps = merged.scores.defenseMaps && typeof merged.scores.defenseMaps === "object" && !Array.isArray(merged.scores.defenseMaps)
      ? Object.fromEntries(Object.entries(merged.scores.defenseMaps).filter(([id]) => ["grove","ember","moon","storm","blizzard","eclipse"].includes(id)).map(([id,value]) => [id,DefenseCore.clampInteger(value,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0)]))
      : {};
    merged.scores.defensePerfectMaps = Array.isArray(merged.scores.defensePerfectMaps)
      ? [...new Set(merged.scores.defensePerfectMaps.filter(id => ["grove","ember","moon","storm","blizzard","eclipse"].includes(id)))]
      : [];
    merged.scores.defenseHistory = Array.isArray(merged.scores.defenseHistory)
      ? merged.scores.defenseHistory.filter(item => item && typeof item === "object" && ["grove","ember","moon","storm","blizzard","eclipse"].includes(item.mapId)).slice(0, 12).map((item,index) => {
          const clearedWave = DefenseCore.clampInteger(item.clearedWave ?? item.wave, 0, DEFENSE_LIMITS.MAX_SUPPORTED_WAVE, 0);
          const reachedWave = Math.max(clearedWave, DefenseCore.clampInteger(item.reachedWave ?? item.currentWave ?? item.wave, 0, DEFENSE_LIMITS.MAX_SUPPORTED_WAVE, clearedWave));
          const perfectWaveCount = Math.min(clearedWave, DefenseCore.clampInteger(item.perfectWaveCount ?? (item.perfect ? clearedWave : 0), 0, DEFENSE_LIMITS.MAX_REASONABLE_PERFECT_WAVES, 0));
          return {
            id: typeof item.id === "string" && item.id ? item.id.slice(0,80) : `legacy-run-${index}`,
            at: Math.max(0, Number(item.at) || 0),
            mapId: item.mapId,
            wave: clearedWave,
            clearedWave,
            reachedWave,
            kills: DefenseCore.clampInteger(item.kills, 0, DEFENSE_LIMITS.MAX_REASONABLE_KILLS, 0),
            heartLoss: DefenseCore.clampInteger(item.heartLoss, 0, 9999, 0),
            leaks: DefenseCore.clampInteger(item.leaks, 0, DEFENSE_LIMITS.MAX_REASONABLE_KILLS, 0),
            bosses: DefenseCore.clampInteger(item.bosses, 0, DEFENSE_LIMITS.MAX_REASONABLE_BOSSES, 0),
            perfect: clearedWave > 0 && perfectWaveCount === clearedWave,
            perfectWaveCount,
            ended: item.ended === "gate" ? "gate" : "banked",
            mvpPetId: typeof item.mvpPetId === "string" ? item.mvpPetId.slice(0,80) : "",
            mvpName: typeof item.mvpName === "string" ? item.mvpName.replace(/[<>\u0000-\u001F\u007F]/g, "").slice(0,14).toUpperCase() : "RIZO",
            mvpVariant: VARIANTS.some(variant => variant.id === item.mvpVariant) ? item.mvpVariant : "classic",
            mvpDamage: DefenseCore.clampNumber(item.mvpDamage, 0, DEFENSE_LIMITS.MAX_REASONABLE_DAMAGE, 0),
            powerPaths: DefenseCore.clampInteger(item.powerPaths, 0, DEFENSE_LIMITS.MAX_DEFENSE_TOWERS, 0),
            controlPaths: DefenseCore.clampInteger(item.controlPaths, 0, DEFENSE_LIMITS.MAX_DEFENSE_TOWERS, 0),
            contractId: typeof item.contractId === "string" ? item.contractId.slice(0,120) : "",
            contractDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.contractDate||"")) ? String(item.contractDate).slice(0,10) : "",
            contractComplete: clearedWave >= DEFENSE_CONTRACT_TARGET && Boolean(item.contractComplete)
          };
        })
      : [];
    merged.scores.defenseMastery = merged.scores.defenseMastery && typeof merged.scores.defenseMastery === "object" && !Array.isArray(merged.scores.defenseMastery)
      ? Object.fromEntries(Object.entries(merged.scores.defenseMastery).filter(([id,value]) => typeof id === "string" && id && value && typeof value === "object").slice(0,80).map(([id,value]) => {
          const runs = DefenseCore.clampInteger(value.runs, 0, DEFENSE_LIMITS.MAX_MASTERY_RUNS, 0);
          const waves = Math.min(DEFENSE_LIMITS.MAX_MASTERY_WAVES, DefenseCore.clampInteger(value.waves, 0, DEFENSE_LIMITS.MAX_MASTERY_WAVES, 0), runs * DEFENSE_LIMITS.MAX_SUPPORTED_WAVE);
          return [id.slice(0,80), {
            petId: id.slice(0,80),
            name: typeof value.name === "string" ? value.name.replace(/[<>\u0000-\u001F\u007F]/g, "").slice(0,14).toUpperCase() : "RIZO",
            variant: VARIANTS.some(variant => variant.id === value.variant) ? value.variant : "classic",
            runs,
            waves,
            bestWave: Math.min(waves, DefenseCore.clampInteger(value.bestWave, 0, DEFENSE_LIMITS.MAX_SUPPORTED_WAVE, 0)),
            pops: Math.min(DefenseCore.clampInteger(value.pops, 0, DEFENSE_LIMITS.MAX_REASONABLE_KILLS, 0), waves * 256),
            damage: DefenseCore.clampNumber(value.damage, 0, DEFENSE_LIMITS.MAX_REASONABLE_DAMAGE, 0),
            bosses: DefenseCore.clampInteger(value.bosses, 0, DEFENSE_LIMITS.MAX_REASONABLE_BOSSES, 0),
            powerPaths: DefenseCore.clampInteger(value.powerPaths, 0, DEFENSE_LIMITS.MAX_REASONABLE_KILLS, 0),
            controlPaths: DefenseCore.clampInteger(value.controlPaths, 0, DEFENSE_LIMITS.MAX_REASONABLE_KILLS, 0),
            lastAt: Math.max(0, Number(value.lastAt) || 0)
          }];
        }).filter(([,value]) => value.waves > 0))
      : {};
    const validDefenseContractRules = new Set(["unique","lean","no-sell","silent","power-only","control-only"]);
    merged.scores.defenseContracts = Array.isArray(merged.scores.defenseContracts)
      ? merged.scores.defenseContracts.filter(item => item && typeof item === "object" && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) && ["grove","ember","moon","storm","blizzard","eclipse"].includes(item.mapId)).slice(0,35).map((item,index) => ({
          id: typeof item.id === "string" && item.id ? item.id.slice(0,120) : `legacy-contract-${index}`,
          date: String(item.date).slice(0,10),
          mapId: item.mapId,
          title: typeof item.title === "string" && item.title ? item.title.slice(0,80) : "DAILY TRAIL CONTRACT",
          rules: Array.isArray(item.rules) ? [...new Set(item.rules.filter(rule => validDefenseContractRules.has(rule)))].slice(0,3) : [],
          targetWave: 10,
          bestWave: DefenseCore.clampInteger(item.bestWave, 0, DEFENSE_LIMITS.MAX_SUPPORTED_WAVE, 0),
          completed: DefenseCore.clampInteger(item.bestWave, 0, DEFENSE_LIMITS.MAX_SUPPORTED_WAVE, 0) >= DEFENSE_CONTRACT_TARGET,
          perfect: DefenseCore.clampInteger(item.bestWave, 0, DEFENSE_LIMITS.MAX_SUPPORTED_WAVE, 0) >= DEFENSE_CONTRACT_TARGET && Boolean(item.perfect),
          firstAt: Math.max(0, Number(item.firstAt) || 0),
          lastAt: Math.max(0, Number(item.lastAt) || 0)
        })).filter(item => item.rules.length === 3)
      : [];
    merged.meta.unlockScenes = Array.isArray(merged.meta.unlockScenes) ? [...new Set(merged.meta.unlockScenes.filter(value => typeof value === "string"))] : [];
    merged.meta.backupPrompts = Array.isArray(merged.meta.backupPrompts) ? [...new Set(merged.meta.backupPrompts.filter(value => typeof value === "string"))] : [];
    merged.meta.lastBackupAt = Math.max(0, Number(merged.meta.lastBackupAt) || 0);
    merged.season.xp = DefenseCore.clampNumber(merged.season.xp, 0, DEFENSE_LIMITS.MAX_SEASON_XP, 0);
    merged.season.level = DefenseCore.clampInteger(merged.season.level, 1, DEFENSE_LIMITS.MAX_SEASON_LEVEL, 1);
    merged.worldEvents.lastAt = Math.max(0, Number(merged.worldEvents.lastAt) || now());
    merged.worldEvents.count = Math.max(0, Math.floor(Number(merged.worldEvents.count) || 0));
    merged.worldEvents.lastBadLuckAt = Math.max(0, Number(merged.worldEvents.lastBadLuckAt) || 0);
    merged.worldEvents.badLuckCount = Math.max(0, Math.floor(Number(merged.worldEvents.badLuckCount) || 0));
    merged.worldEvents.seen = Array.isArray(merged.worldEvents.seen) ? [...new Set(merged.worldEvents.seen.filter(id => WORLD_EVENTS.some(event => event.id === id)))] : [];
    merged.treasures = Object.fromEntries(Object.entries(merged.treasures).filter(([id]) => WALK_TREASURES.some(item => item.id === id)).map(([id,count]) => [id,Math.max(0,Math.floor(Number(count)||0))]));
    merged.meta.nextPetNumber = Math.max(1, Math.floor(Number(merged.meta.nextPetNumber) || 1));
    merged.garden.toyUses = merged.garden.toyUses && typeof merged.garden.toyUses === "object" ? merged.garden.toyUses : {};
    merged.garden.nextEggVariant = VARIANTS.some(item => item.id === merged.garden.nextEggVariant) && merged.collection[merged.garden.nextEggVariant] ? merged.garden.nextEggVariant : null;
    const normalizeVisitor = visitor => {
      if (!visitor || typeof visitor !== "object") return null;
      const variant = VARIANTS.find(item => item.id === visitor.variant) || VARIANTS[0];
      const genes = {}, skills = {};
      for (const skill of SKILLS) {
        genes[skill.id] = clamp(Number(visitor.genes?.[skill.id]) || 100, 82, 170);
        skills[skill.id] = clamp(Number(visitor.skills?.[skill.id]) || 0, 0, genes[skill.id]);
      }
      genes.growth = clamp(Number(visitor.genes?.growth) || 100, 85, 140);
      return {
        keeper:String(visitor.keeper || "UNKNOWN").slice(0,80),
        name:String(visitor.name || "GUEST RIZO").replace(/[<>\u0000-\u001F\u007F]/g,"").slice(0,14).toUpperCase() || "GUEST RIZO",
        variant:variant.id, variantName:variant.name,
        stage:STAGES.some(item=>item.id===visitor.stage)?visitor.stage:"kid",
        form:EVOLUTION_FORMS[visitor.form]?visitor.form:"balanced", accessory:ACCESSORIES.some(item=>item.id===visitor.accessory)?visitor.accessory:"none",
        generation:clamp(Number(visitor.generation)||1,1,999),
        personality:PERSONALITIES.includes(visitor.personality)?visitor.personality:"LOYAL WEIRDO",
        mutation:MUTATIONS.some(item=>item.id===visitor.mutation)?visitor.mutation:"normal",
        alignment:clamp(Number(visitor.alignment)||0,-100,100), bond:clamp(Number(visitor.bond)||0),
        genes, skills,
        at:Math.max(0,Number(visitor.at)||now()), expiresAt:Math.max(0,Number(visitor.expiresAt)||0)
      };
    };
    merged.social.visitors = Array.isArray(merged.social.visitors) ? merged.social.visitors.map(normalizeVisitor).filter(Boolean).slice(0,20) : [];
    merged.social.currentVisitor = normalizeVisitor(merged.social.currentVisitor);
    merged.social.pairings = Array.isArray(merged.social.pairings) ? merged.social.pairings.filter(item=>item&&typeof item==="object").slice(0,30) : [];
    if (!merged.social.currentVisitor || merged.social.currentVisitor.expiresAt <= now()) merged.social.currentVisitor = null;
    const seed = merged.garden.bondSeed;
    if (seed && typeof seed === "object" && seed.keeper) {
      const seedVariant = VARIANTS.find(item=>item.id===seed.variant) || VARIANTS[0];
      const seedGenes = {}, seedSkills = {};
      for (const skill of SKILLS) {
        seedGenes[skill.id] = clamp(Number(seed.genes?.[skill.id]) || 100, 82, 170);
        seedSkills[skill.id] = clamp(Number(seed.skills?.[skill.id]) || 0, 0, seedGenes[skill.id]);
      }
      seedGenes.growth = clamp(Number(seed.genes?.growth) || 100, 85, 140);
      merged.garden.bondSeed = {keeper:String(seed.keeper).slice(0,80),name:String(seed.name||"GUEST RIZO").replace(/[<>\u0000-\u001F\u007F]/g,"").slice(0,14).toUpperCase()||"GUEST RIZO",variant:seedVariant.id,variantName:seedVariant.name,personality:PERSONALITIES.includes(seed.personality)?seed.personality:"LOYAL WEIRDO",mutation:MUTATIONS.some(item=>item.id===seed.mutation)?seed.mutation:"normal",alignment:clamp(Number(seed.alignment)||0,-100,100),genes:seedGenes,skills:seedSkills,generation:clamp(Number(seed.generation)||1,1,999),at:Math.max(0,Number(seed.at)||now())};
    } else merged.garden.bondSeed = null;

    const pet = merged.pet;
    const numberFields = ["hatch", "xp", "level", "bond", "strength", "hype", "taps", "overstimulation", "health", "hunger", "mood", "energy", "hygiene", "lastFreeSnack", "lastTick", "createdAt"];
    for (const key of numberFields) {
      const value = pet[key];
      const parsed = value === null || value === "" ? NaN : Number(value);
      pet[key] = Number.isFinite(parsed) ? parsed : (Number(fresh.pet[key]) || 0);
    }
    for (const key of ["hatch", "bond", "strength", "overstimulation", "health", "hunger", "mood", "energy", "hygiene"]) pet[key] = clamp(pet[key]);
    pet.xp = DefenseCore.clampNumber(pet.xp, 0, DEFENSE_LIMITS.MAX_PLAYER_XP, 0);
    pet.hype = DefenseCore.clampNumber(pet.hype, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0);
    pet.taps = DefenseCore.clampInteger(pet.taps, 0, DEFENSE_LIMITS.MAX_META_COUNTER, 0);
    pet.number = Math.max(1, Math.floor(Number(pet.number) || Math.max(1, merged.meta.nextPetNumber - 1)));
    const highestHouseNumber = merged.farm.roster.reduce((highest, resident) => Math.max(highest, Math.floor(Number(resident.number) || 0)), 0);
    merged.meta.nextPetNumber = Math.max(merged.meta.nextPetNumber, pet.number + 1, highestHouseNumber + 1);
    pet.lastTick = pet.lastTick > 0 ? pet.lastTick : now();
    pet.createdAt = pet.createdAt > 0 ? pet.createdAt : now();
    if (!(pet.bornAt > 0) && pet.stage !== "egg") pet.bornAt = pet.createdAt;
    pet.name = typeof pet.name === "string" && pet.name.trim() ? pet.name.trim().replace(/[<>\u0000-\u001F\u007F]/g, "").slice(0, 14).toUpperCase() : `RIZO ${String(pet.number || 1).padStart(2, "0")}`;
    if (!pet.name) pet.name = `RIZO ${String(pet.number || 1).padStart(2, "0")}`;
    pet.hiddenVariant = VARIANTS.some(item => item.id === pet.hiddenVariant) ? pet.hiddenVariant : "classic";
    pet.variant = pet.variant && VARIANTS.some(item => item.id === pet.variant) ? pet.variant : null;
    pet.stage = ["egg", ...STAGES.map(item => item.id)].includes(pet.stage) ? pet.stage : "egg";
    pet.room = ROOMS.some(item => item.id === pet.room) && merged.inventory.rooms.includes(pet.room) ? pet.room : "rain";
    pet.accessory = ACCESSORIES.some(item => item.id === pet.accessory) && merged.inventory.accessories.includes(pet.accessory) ? pet.accessory : "none";
    if (!PERSONALITIES.includes(pet.personality)) pet.personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    if (!MUTATIONS.some(item => item.id === pet.mutation)) pet.mutation = "normal";
    const stageSeed = { egg: 0, spark: 2, kid: 7, teen: 15, beast: 28, legend: 45 }[pet.stage] || 0;
    pet.skills = pet.skills && typeof pet.skills === "object" ? pet.skills : {};
    pet.genes = pet.genes && typeof pet.genes === "object" ? pet.genes : createGenes();
    for (const skill of SKILLS) {
      pet.genes[skill.id] = clamp(Number(pet.genes[skill.id]) || 100, 82, 170);
      const rawSkill = pet.skills[skill.id], parsedSkill = rawSkill === null || rawSkill === "" ? NaN : Number(rawSkill);
      pet.skills[skill.id] = clamp(Number.isFinite(parsedSkill) ? parsedSkill : (skill.id === "power" ? Math.max(stageSeed, pet.strength || 0) : stageSeed), 0, pet.genes[skill.id]);
    }
    pet.strength = clamp(Math.max(pet.strength || 0, pet.skills.power || 0));
    pet.genes.growth = clamp(Number(pet.genes.growth) || 100, 85, 140);
    pet.alignment = clamp(Number(pet.alignment) || 0, -100, 100);
    pet.careProfile = pet.careProfile && typeof pet.careProfile === "object" ? pet.careProfile : { kind: 0, wild: 0, balanced: 0, foods: {}, games: {} };
    pet.careProfile.foods = pet.careProfile.foods && typeof pet.careProfile.foods === "object" ? pet.careProfile.foods : {};
    pet.careProfile.games = pet.careProfile.games && typeof pet.careProfile.games === "object" ? pet.careProfile.games : {};
    pet.lifeMemory = pet.lifeMemory && typeof pet.lifeMemory === "object" && !Array.isArray(pet.lifeMemory) ? { ...fresh.pet.lifeMemory, ...pet.lifeMemory } : { ...fresh.pet.lifeMemory };
    for (const key of ["lastSeenAt", "washUntil", "lastBathAt", "lastFoodAt", "arcadeAfterglowUntil", "lifeBehaviorUntil"]) pet.lifeMemory[key] = Math.max(0, Number(pet.lifeMemory[key]) || 0);
    for (const key of ["recentWins", "recentCare", "moodMomentum", "secretStage"]) pet.lifeMemory[key] = Math.max(0, Math.floor(Number(pet.lifeMemory[key]) || 0));
    for (const key of ["filthSeen", "bathIncidentRemembered", "favoriteFoodRemembered"]) pet.lifeMemory[key] = Boolean(pet.lifeMemory[key]);
    pet.lifeMemory.washFromHygiene = clamp(Number(pet.lifeMemory.washFromHygiene) || 100);
    pet.lifeMemory.lastFoodId = FOODS.some(item => item.id === pet.lifeMemory.lastFoodId) ? pet.lifeMemory.lastFoodId : "";
    pet.lifeMemory.lastArcadeMode = ["power","spark","forage","rush","walk","rhythm","memory","glide","breaker","maze","defense"].includes(pet.lifeMemory.lastArcadeMode) ? pet.lifeMemory.lastArcadeMode : "";
    pet.lifeMemory.lastGreetingDate = /^\d{4}-\d{2}-\d{2}$/.test(String(pet.lifeMemory.lastGreetingDate || "")) ? String(pet.lifeMemory.lastGreetingDate) : "";
    pet.form = EVOLUTION_FORMS[pet.form] ? pet.form : determineEvolutionForm(pet, merged);
    pet.formHistory = Array.isArray(pet.formHistory) ? pet.formHistory.slice(-10) : [];
    pet.generation = Math.max(1, Math.floor(Number(pet.generation) || 1));
    pet.lastTrainedSkill = SKILLS.some(skill => skill.id === pet.lastTrainedSkill) ? pet.lastTrainedSkill : "stamina";
    pet.resting = Boolean(pet.resting);
    pet.elder = Boolean(pet.elder);
    if (pet.alive === false) {
      pet.alive = true;
      pet.resting = true;
      pet.health = Math.max(1, pet.health);
      merged.meta.recoveries = (merged.meta.recoveries || 0) + 1;
    } else pet.alive = true;
    pet.sleeping = Boolean(pet.sleeping); pet.sick = Boolean(pet.sick);
    if (!merged.loreUnlocked.includes("keeper")) merged.loreUnlocked.unshift("keeper");
    return merged;
  }

  // Validation and preview paths never commit normalized data implicitly. Keeping
  // this detached wrapper makes that contract explicit even if migrations grow.
  function normalizeStateDetached(raw){const current=state;try{return normalizeState(raw);}finally{state=current;}}
  function recordSaveValidationWarning(kind,details={}){try{localStorage.setItem(SAVE_VALIDATION_WARNING_KEY,JSON.stringify({at:now(),kind:String(kind||"sanitized").slice(0,60),details}));}catch(error){}}
  function buildStateEnvelope(source=state,savedAt=now()){
    const envelope={app:"RIZO LIFE",saveVersion:SAVE_ENVELOPE_VERSION,stateVersion:VERSION,savedAt,state:source};
    envelope.signature=DefenseCore.createStateSignature(source,savedAt,SAVE_ENVELOPE_VERSION);return envelope;
  }
  function hardenUnverifiedState(source){
    const normalized=normalizeStateDetached(source),fresh=defaultState();
    // A current signed save that fails verification is not allowed to use its own
    // records, counters, or history to justify currency or competitive progress.
    // Preserve the sanitized pet timeline and known cosmetics for recovery, but
    // reset reward-bearing state to canonical defaults. A verified mirror backup
    // is attempted before this fallback is ever used.
    normalized.wallet={...fresh.wallet};
    normalized.scores={...fresh.scores,defenseMilestones:[],defenseMaps:{},defensePerfectMaps:[],defenseHistory:[],defenseMastery:{},defenseContracts:[]};
    normalized.achievements=[];
    normalized.daily=createDaily();
    normalized.season={...fresh.season};
    normalized.expedition=normalizeExpeditionState(null);
    normalized.treasures={};
    normalized.inventory.phoenix=0;normalized.inventory.growth=0;normalized.inventory.care=0;
    normalized.farm.materials=0;normalized.farm.totalAdoptions=0;normalized.farm.totalReleased=0;
    for(const key of["totalGames","totalHatched","totalTaps","totalCareActions","totalWalks","deaths","recoveries","rebirths","bondEggs","capsules","pity","refusals","overloads","retroSignal","shadowFinds"])normalized.meta[key]=0;
    const actualPets=[normalized.pet,...(normalized.farm?.roster||[])].filter(Boolean),collection={};
    for(const pet of actualPets){const id=VARIANTS.some(variant=>variant.id===(pet.variant||pet.hiddenVariant))?(pet.variant||pet.hiddenVariant):"classic";collection[id]=(collection[id]||0)+1;}
    normalized.collection=collection;
    normalized.meta.totalHatched=Math.max(0,actualPets.length-1);
    normalized.meta.nextPetNumber=Math.max(2,...actualPets.map(pet=>DefenseCore.clampInteger(pet.number,1,DEFENSE_LIMITS.MAX_META_COUNTER,1)+1));
    return normalized;
  }
  function decodeStatePayload(parsed,{allowLegacy=true}={}){
    const payload=parsed&&typeof parsed==="object"?parsed:null;if(!payload)return{state:defaultState(),status:"invalid"};
    if(payload.saveVersion&&payload.state&&typeof payload.state==="object"){
      const valid=DefenseCore.verifyStateSignature(payload);return{state:valid?normalizeStateDetached(payload.state):hardenUnverifiedState(payload.state),status:valid?"verified":"sanitized",signatureValid:valid};
    }
    const source=payload.state&&typeof payload.state==="object"?payload.state:payload,sourceVersion=Number(source.version)||0;
    if(allowLegacy&&sourceVersion<VERSION)return{state:normalizeStateDetached(source),status:"migrated",signatureValid:false};
    return{state:hardenUnverifiedState(source),status:"sanitized",signatureValid:false};
  }
  function decodeStateText(rawText,options={}){try{return decodeStatePayload(JSON.parse(rawText),options);}catch(error){return{state:defaultState(),status:"invalid",error};}}

  function loadState() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) state = defaultState();
      else {
        const primary=decodeStateText(saved);
        if(primary.status==="verified"||primary.status==="migrated")state=primary.state;
        else{
          const backupText=localStorage.getItem(SAVE_BACKUP_KEY),backup=backupText?decodeStateText(backupText,{allowLegacy:false}):null;
          if(backup?.status==="verified"){state=backup.state;recordSaveValidationWarning("primary-signature-recovered",{primaryStatus:primary.status});}
          else{state=primary.state;recordSaveValidationWarning("primary-save-sanitized",{primaryStatus:primary.status,backupStatus:backup?.status||"missing"});}
        }
      }
    } catch (error) {
      console.warn("Rizo save could not load", error);
      recordSaveValidationWarning("save-load-failed",{message:String(error?.message||error)});
      state = defaultState();
    }
    activeHouseRoom = state.farm?.activeRoom || 0;
    updateSessionAndStreak();
    resetDailyIfNeeded();
    lastOfflineSummary = processElapsedTime(true);
    processExpedition();
    saveState(true);
  }

  function saveState(immediate = false) {
    state.player.lastActive = now();
    const write = () => {
      try {const serialized=JSON.stringify(buildStateEnvelope(state));localStorage.setItem(SAVE_KEY,serialized);localStorage.setItem(SAVE_BACKUP_KEY,serialized);}
      catch (error) { console.warn("Rizo save could not write", error); }
      saveTimer = null;
    };
    if (immediate) {
      clearTimeout(saveTimer);
      write();
    } else if (!saveTimer) {
      saveTimer = setTimeout(write, 250);
    }
  }

  function updateSessionAndStreak() {
    const current = now();
    const inactiveFor = current - (state.player.lastActive || current);
    if (inactiveFor > 30 * 60 * 1000) {
      state.player.totalSessions = (state.player.totalSessions || 0) + 1;
      state.player.lastSessionAt = current;
    }
    const today = dateKey();
    if (state.player.lastVisitDate !== today) {
      const previous = new Date(`${state.player.lastVisitDate}T12:00:00`);
      const currentDay = new Date(`${today}T12:00:00`);
      const days = Math.round((currentDay - previous) / 86400000);
      state.player.streak = days === 1 ? (state.player.streak || 0) + 1 : 1;
      state.player.lastVisitDate = today;
    }
  }

  function resetDailyIfNeeded() {
    if (!state.daily || state.daily.date !== dateKey()) state.daily = createDaily();
  }

  // ===== REAL-TIME PET SIMULATION / OFFLINE PROGRESS =====
  function processElapsedTime(boot = false) {
    const pet = state.pet;
    const current = now();
    const elapsedMs = Math.max(0, current - (pet.lastTick || current));
    const minutes = Math.min(elapsedMs / 60000, 72 * 60);
    pet.lastTick = current;
    if (!pet.alive || pet.stage === "egg" || minutes <= 0) return null;

    const before = { hunger: pet.hunger, mood: pet.mood, energy: pet.energy, hygiene: pet.hygiene, health: pet.health };
    const inGrace = pet.graceUntil && current < pet.graceUntil;
    const multiplier = inGrace ? .35 : 1;

    if (pet.sleeping) {
      pet.energy = clamp(pet.energy + minutes * .08);
      pet.hunger = clamp(pet.hunger - minutes * .013 * multiplier);
      pet.hygiene = clamp(pet.hygiene - minutes * .006 * multiplier);
      pet.mood = clamp(pet.mood - minutes * .002 * multiplier);
    } else {
      pet.hunger = clamp(pet.hunger - minutes * .020 * multiplier);
      pet.energy = clamp(pet.energy - minutes * .015 * multiplier);
      pet.hygiene = clamp(pet.hygiene - minutes * .012 * multiplier);
      pet.mood = clamp(pet.mood - minutes * .010 * multiplier);
    }

    const critical = [pet.hunger, pet.energy, pet.hygiene, pet.mood].filter(value => value < 12).length;
    if (critical > 0) pet.health = clamp(pet.health - minutes * .024 * critical * multiplier);
    else if (pet.hunger > 55 && pet.energy > 45 && pet.hygiene > 45 && !pet.sick) pet.health = clamp(pet.health + minutes * .004);
    if (pet.sick) pet.health = clamp(pet.health - minutes * .015 * multiplier);
    if (!pet.sick && pet.hygiene < 22 && Math.random() < Math.min(.5, minutes / 2000)) pet.sick = true;
    if (before.hygiene >= 18 && pet.hygiene < 18) {
      const memory = lifeMemory();
      if (!memory.filthSeen) {
        memory.filthSeen = true;
        addMemory("SMELL INCIDENT", "Rizo got gross enough to become a room problem.", "✦");
      }
    }

    let idleGrowth = 0;
    if (!pet.resting && pet.health > 20 && pet.hunger > 25 && pet.mood > 25) {
      const hours = minutes / 60;
      const nature = PERSONALITY_TRAITS[pet.personality] || {skill:"stamina",mood:0};
      idleGrowth = Math.min(10, hours * .22 * ((pet.genes?.growth || 100) / 100));
      if (idleGrowth > 0) {
        gainSkill(pet.sleeping ? "stamina" : (pet.lastTrainedSkill || nature.skill || "stamina"), idleGrowth, { silent: true });
        pet.xp += idleGrowth * 1.5;
        pet.bond = clamp(pet.bond + Math.min(3, hours * .08));
        pet.mood = clamp(pet.mood + Math.min(2, hours * (nature.mood || 0)));
      }
    }

    const ageDays = pet.bornAt > 0 ? (current - pet.bornAt) / 86400000 : 0;
    if (ageDays >= pet.lifespanDays && !pet.elder) enterElderState(true);
    else if (pet.health <= 0) enterRecoveryState("neglect", true);
    updateStage();

    if (boot && minutes >= 10) {
      return {
        minutes,
        hunger: Math.max(0, before.hunger - pet.hunger),
        mood: Math.max(0, before.mood - pet.mood),
        energy: before.energy - pet.energy,
        hygiene: Math.max(0, before.hygiene - pet.hygiene),
        health: Math.max(0, before.health - pet.health),
        idleGrowth
      };
    }
    return null;
  }

  function mutate(callback, { render = true, save = true } = {}) {
    processElapsedTime();
    callback(state.pet, state);
    updateStage();
    if (state.pet.alive && state.pet.health <= 0) enterRecoveryState("neglect", true);
    checkAchievements();
    if (save) saveState();
    if (render) renderAll();
  }

  function skillTotal(pet = state.pet) {
    return SKILLS.reduce((sum, skill) => sum + (Number(pet.skills?.[skill.id]) || 0), 0);
  }

  function dominantSkill(pet = state.pet) {
    const ordered = [...SKILLS].sort((a, b) => (pet.skills?.[b.id] || 0) - (pet.skills?.[a.id] || 0));
    if (!ordered.length || (pet.skills?.[ordered[0].id] || 0) - (pet.skills?.[ordered[1]?.id] || 0) < 4) return "balanced";
    return ordered[0].id;
  }

  function dominantGene(pet = state.pet) {
    return [...SKILLS].sort((a, b) => (pet.genes?.[b.id] || 0) - (pet.genes?.[a.id] || 0))[0]?.id || "balanced";
  }

  function alignmentInfo(pet = state.pet) {
    const value = Number(pet.alignment) || 0;
    if (value >= 28) return { id: "light", name: "KIND", icon: "☀", color: "#fff39a" };
    if (value <= -28) return { id: "shadow", name: "WILD", icon: "☾", color: "#9a75ff" };
    return { id: "neutral", name: "BALANCED", icon: "◐", color: "#16c8ff" };
  }

  function displayFormInfo(pet = state.pet) {
    const base = EVOLUTION_FORMS[pet.form] || EVOLUTION_FORMS.balanced;
    if (["pixel","eclipse","royal","prism"].includes(pet.form)) return base;
    const alignment = alignmentInfo(pet).id;
    const names = {
      light: { balanced:"DAYBREAK FLAME", speed:"SKY FLAME", power:"GUARDIAN FLAME", instinct:"STAR FLAME", stamina:"GROVE FLAME", luck:"HALO FLAME" },
      shadow: { balanced:"DUSK FLAME", speed:"PHANTOM FLAME", power:"RAGE FLAME", instinct:"WITCH FLAME", stamina:"THORN FLAME", luck:"HEX FLAME" }
    };
    const name = names[alignment]?.[pet.form] || base.name;
    const alignmentCopy = alignment === "light"
      ? " Kind care brightened this path."
      : alignment === "shadow" ? " Wild choices deepened this path." : " Balanced choices kept this path centered.";
    return { ...base, name, copy: `${base.copy}${alignmentCopy}` };
  }

  function determineEvolutionForm(pet = state.pet, context = state) {
    const dominant = dominantSkill(pet);
    const align = alignmentInfo(pet);
    const variantId = pet.variant || pet.hiddenVariant;
    if ((variantId === "retro" || (context?.meta?.retroSignal || 0) >= 100) && (context?.meta?.totalGames || 0) >= 20 && Math.abs(pet.alignment || 0) < 35) return "pixel";
    if ((variantId === "shadow" || ((pet.alignment || 0) <= -70 && (pet.careProfile?.wild || 0) >= 18)) && pet.stage !== "spark") return "eclipse";
    if (variantId === "golden" && dominant === "luck" && pet.bond >= 55) return "royal";
    if (variantId === "diamond" && pet.bond >= 80) return "prism";
    return dominant === "balanced" ? "balanced" : dominant;
  }

  function evolutionRequirements(stage) {
    if (!stage) return { progress: 0, missing: "HATCH FIRST" };
    const index = STAGES.indexOf(stage);
    const next = STAGES[index + 1];
    if (!next) return { progress: 100, missing: state.pet.elder ? "LEGACY EGG READY" : "FULLY GROWN" };
    const xpProgress = clamp(state.pet.xp / next.minXP * 100);
    const statsProgress = clamp(skillTotal() / next.minStats * 100);
    const bondProgress = clamp(state.pet.bond / next.minBond * 100);
    const progress = Math.min(xpProgress, statsProgress, bondProgress);
    const missing = [];
    if (state.pet.xp < next.minXP) missing.push(`${Math.ceil(next.minXP - state.pet.xp)} XP`);
    if (skillTotal() < next.minStats) missing.push(`${Math.ceil(next.minStats - skillTotal())} TRAINING`);
    if (state.pet.bond < next.minBond) missing.push(`${Math.ceil(next.minBond - state.pet.bond)} BOND`);
    return { progress, missing: missing.slice(0, 2).join(" + ") || "READY", next };
  }

  function shiftAlignment(amount, reason = "care") {
    const pet = state.pet;
    pet.alignment = clamp((pet.alignment || 0) + amount, -100, 100);
    pet.careProfile ||= { kind: 0, wild: 0, balanced: 0, foods: {}, games: {} };
    if (amount > 0) pet.careProfile.kind = (pet.careProfile.kind || 0) + Math.abs(amount);
    else if (amount < 0) pet.careProfile.wild = (pet.careProfile.wild || 0) + Math.abs(amount);
    else pet.careProfile.balanced = (pet.careProfile.balanced || 0) + 1;
    pet.lastCareReason = reason;
  }

  function gainSkill(skillId, amount, { silent = false } = {}) {
    const pet = state.pet;
    if (!pet.skills || !pet.genes || !SKILLS.some(skill => skill.id === skillId)) return 0;
    const before = pet.skills[skillId] || 0;
    const cap = pet.genes[skillId] || 100;
    pet.skills[skillId] = clamp(before + amount, 0, cap);
    if (skillId === "power") pet.strength = clamp(Math.max(pet.strength || 0, pet.skills.power));
    pet.lastTrainedSkill = skillId;
    const gained = pet.skills[skillId] - before;
    if (!silent && gained > .2) toast(`+${gained.toFixed(gained >= 1 ? 1 : 2)} ${skillId.toUpperCase()}`);
    return gained;
  }

  function evaluateForm(announce = false) {
    const pet = state.pet;
    if (pet.stage === "egg") return;
    const nextForm = determineEvolutionForm(pet);
    if (nextForm !== pet.form) {
      const old = pet.form;
      pet.form = nextForm;
      pet.formHistory ||= [];
      pet.formHistory.push({ from: old, to: nextForm, at: now(), stage: pet.stage });
      if (announce) {
        const info = EVOLUTION_FORMS[nextForm];
        addMemory("FORM SHIFT", `${pet.name} became a ${info.name} because of how you raised it.`, "✦");
        toast(`FORM SHIFT: ${info.name}`);
        say(`I FEEL DIFFERENT. LIKE... ${info.name}.`, 3400);
        celebrate();
      }
    }
  }

  function currentVariant() {
    const id = state.pet.variant || state.pet.hiddenVariant || "classic";
    return VARIANTS.find(item => item.id === id) || VARIANTS[0];
  }

  function currentStage() {
    if (state.pet.stage === "egg") return null;
    const currentRank = Math.max(0, STAGES.findIndex(stage => stage.id === state.pet.stage));
    let best = STAGES[currentRank] || STAGES[0];
    for (const stage of STAGES) {
      if (state.pet.xp >= stage.minXP && skillTotal() >= stage.minStats && state.pet.bond >= stage.minBond) best = stage;
    }
    return best;
  }

  // ===== CENTRAL PET RENDERER =====
  // Single source of truth for "what does this Rizo look like right now".
  // Every scene that shows the player's actual pet (garden, closet, minigames,
  // walk, evolution, previews) must read from getPetVisualState() instead of
  // re-deriving variant/stage/accessory/mutation classes locally. This is
  // what keeps a hat/variant/stage consistent everywhere instead of a scene
  // quietly falling back to a default sprite. See DEVELOPER-NOTES.md.
  const RARE_VARIANT_CLASS_IDS = ["ember", "toxic", "violet", "moss", "bubblegum", "frost", "glitch", "obsidian", "aurora", "golden", "diamond", "shadow", "retro"];
  const FAILED_RIZO_ASSETS = new Set();

  function mergeAnchorCorrections(...sources) {
    const names = ["head","face","upper","center","lower","left","right","back","ground","effects"];
    const output = {};
    names.forEach(name => {
      output[name] = { x:0, y:0, scale:1 };
      sources.forEach(source => {
        const next = source?.[name];
        if (!next) return;
        output[name] = {
          x: (output[name].x || 0) + (Number(next.x) || 0),
          y: (output[name].y || 0) + (Number(next.y) || 0),
          scale: (output[name].scale || 1) * (Number(next.scale) || 1)
        };
      });
    });
    return output;
  }

  function resolveRizoVisual({ variant, evolutionStage, formId = "balanced", context = "default" } = {}) {
    const variantRecord = typeof variant === "string"
      ? (VARIANTS.find(item => item.id === variant) || VARIANTS[0])
      : (variant || VARIANTS[0]);
    const stageId = AGE_VISUALS[evolutionStage] ? evolutionStage : "kid";
    const age = AGE_VISUALS[stageId];
    const variantCalibration = VARIANT_VISUAL_CALIBRATION[variantRecord.id] || VARIANT_VISUAL_CALIBRATION.classic;
    const contextCorrection = {
      card:{imageScale:.985,offsetX:0,offsetY:0,wearableScale:.98},
      thumbnail:{imageScale:.96,offsetX:0,offsetY:0,wearableScale:.96},
      walk:{imageScale:1,offsetX:0,offsetY:0,wearableScale:1},
      arcade:{imageScale:1,offsetX:0,offsetY:0,wearableScale:1},
      cutscene:{imageScale:1.02,offsetX:0,offsetY:-.3,wearableScale:1.01},
      den:{imageScale:1,offsetX:0,offsetY:0,wearableScale:1},
      closet:{imageScale:1,offsetX:0,offsetY:0,wearableScale:1}
    }[context] || {imageScale:1,offsetX:0,offsetY:0,wearableScale:1};

    const candidates = [...new Set([variantRecord.sprite, VARIANTS[0].sprite].filter(Boolean))];
    const usableCandidates = candidates.filter(path => !FAILED_RIZO_ASSETS.has(path));
    const asset = usableCandidates[0] || VARIANTS[0].sprite;
    const fallbackChain = usableCandidates.filter(path => path !== asset);
    const anchors = mergeAnchorCorrections(age.anchors, variantCalibration.anchors);

    return {
      asset,
      sprite: asset,
      fallbackAsset: fallbackChain[0] || VARIANTS[0].sprite,
      fallbackChain,
      variantId: variantRecord.id,
      evolutionStage: stageId,
      ageStage: stageId,
      formId,
      context,
      alphaBounds: [46,52,463,622],
      baseline: 622,
      imageScale: (Number(variantCalibration.spriteScale) || 1) * (Number(contextCorrection.imageScale) || 1),
      bodyX: Number(age.bodyX) || 1,
      bodyY: Number(age.bodyY) || 1,
      faceScale: Number(age.faceScale) || 1,
      offsetX: (Number(variantCalibration.spriteX) || 0) + (Number(contextCorrection.offsetX) || 0),
      offsetY: (Number(age.offsetY) || 0) + (Number(variantCalibration.spriteY) || 0) + (Number(contextCorrection.offsetY) || 0),
      wearableScale: (Number(age.wearableScale) || 1) * (Number(variantCalibration.wearableScale) || 1) * (Number(contextCorrection.wearableScale) || 1),
      wearableRotate: (Number(age.wearableRotate) || 0) + (Number(variantCalibration.wearableRotate) || 0),
      shadow: {
        scale: Number(age.shadow?.scale) || 1,
        x: Number(age.shadow?.x) || 0,
        y: Number(age.shadow?.y) || 0,
        opacity: Number.isFinite(Number(age.shadow?.opacity)) ? Number(age.shadow.opacity) : 1
      },
      anchors,
      glow: variantCalibration.glow || null,
      animation: variantCalibration.animation || null
    };
  }

  function resolvePetSprite(variant, stageId, formId, context = "default") {
    return resolveRizoVisual({ variant, evolutionStage: stageId, formId, context }).asset;
  }

  function grimeLevelForHygiene(hygiene) {
    const value = clamp(Number(hygiene) || 0);
    if (value < 18) return "filthy";
    if (value < 35) return "dirty";
    if (value < 60) return "light";
    return "clean";
  }

  function careVisualState(source) {
    const memory = source?.lifeMemory;
    const washing = source === state.pet && Number(memory?.washUntil) > now();
    const justRinsed = source === state.pet && !washing && now() - (Number(memory?.lastBathAt) || 0) < 7000;
    return {
      washing,
      grime: washing ? grimeLevelForHygiene(memory?.washFromHygiene) : justRinsed ? "clean" : grimeLevelForHygiene(source?.hygiene)
    };
  }

  function getPetVisualState(pet = state.pet, overrides = {}) {
    const source = pet || state.pet;
    const stageId = overrides.stageId || source.stage;
    const isEgg = stageId === "egg";
    const variantId = overrides.variantId || source.variant || source.hiddenVariant || "classic";
    const variant = VARIANTS.find(item => item.id === variantId) || VARIANTS[0];
    const stageData = isEgg ? null : (STAGES.find(item => item.id === stageId) || STAGES[0]);
    const formId = overrides.form || source.form || "balanced";
    const form = EVOLUTION_FORMS[formId] || EVOLUTION_FORMS.balanced;
    const align = alignmentInfo(source);
    const context = overrides.context || "default";
    const careVisual = careVisualState(source);
    const arcadeAfterglow = source === state.pet && context === "den" && Number(source.lifeMemory?.arcadeAfterglowUntil) > now();
    const resolved = resolveRizoVisual({ variant, evolutionStage: isEgg ? "kid" : stageId, formId, context });
    return {
      isEgg,
      variant,
      sprite: resolved.asset,
      resolved,
      stageId,
      stageData,
      scale: Number(overrides.scale) || stageData?.scale || 1,
      formId,
      form,
      align,
      context,
      accessory: overrides.accessory ?? source.accessory ?? "none",
      mutation: overrides.mutation || source.mutation || "normal",
      sleeping: overrides.sleeping ?? Boolean(source.sleeping),
      sick: overrides.sick ?? Boolean(source.sick),
      resting: overrides.resting ?? Boolean(source.resting),
      low: overrides.low ?? (!isEgg && Math.min(source.hunger, source.mood, source.energy, source.hygiene) < 18),
      grime: overrides.grime ?? careVisual.grime,
      washing: overrides.washing ?? careVisual.washing,
      behavior: overrides.behavior ?? (source === state.pet ? activePetBehavior || (arcadeAfterglow ? "afterglow" : "") : ""),
      name: overrides.name || source.name
    };
  }

  // Builds the class list for whatever element is acting as "the pet" —
  // used identically by the garden actor, minigame arenas, and previews.
  function petActorClassNames(visual, baseClass) {
    const classes = [baseClass, `stage-${visual.stageId}`, visual.form.className, `align-${visual.align.id}`, `mutation-${visual.mutation}`];
    if (visual.sleeping) classes.push("sleeping");
    if (visual.sick) classes.push("sick");
    if (visual.low) classes.push("sad");
    if (visual.resting) classes.push("resting");
    if (visual.grime !== "clean") classes.push(`grime-${visual.grime}`);
    if (visual.washing) classes.push("care-washing");
    if (visual.behavior) classes.push(`behavior-${visual.behavior}`);
    RARE_VARIANT_CLASS_IDS.forEach(id => { if (visual.variant.id === id) classes.push(id); });
    return classes.filter(Boolean).join(" ");
  }

  const ACCESSORY_RARITY_COLORS = { common: "#9eff75", rare: "#16c8ff", epic: "#ff68bd", legendary: "#ffd45a" };

  function accessoryRarity(id) {
    return (ACCESSORIES.find(item => item.id === id) || {}).rarity || "common";
  }

  function accessoryAnchorGroup(id) {
    return WEARABLE_DEFS[id]?.anchor || "center";
  }

  function accessoryClassName(visual) {
    const rarity = accessoryRarity(visual.accessory);
    const anchor = accessoryAnchorGroup(visual.accessory);
    const clothIds = new Set(["bandana","scarf","bow","cape","beanie","cap"]);
    const metalIds = new Set(["chain","crown","halo","horns","belt"]);
    const glassIds = new Set(["shades","goggles","visor"]);
    const leatherIds = new Set(["backpack","belt","eyepatch"]);
    const material = clothIds.has(visual.accessory) ? "cloth" : metalIds.has(visual.accessory) ? "metal" : glassIds.has(visual.accessory) ? "glass" : leatherIds.has(visual.accessory) ? "leather" : "soft";
    return `accessory-layer wearable wearable-${visual.accessory} ${visual.accessory} anchor-${anchor} material-${material} ${visual.accessory !== "none" ? `rarity-${rarity}` : ""}`.trim();
  }

  function wearableLayerMarkup() {
    return '<span aria-hidden="true" class="wearable-back"></span><span aria-hidden="true" class="wearable-body"></span><span aria-hidden="true" class="wearable-front"></span>';
  }

  function wearableMarkup(visual, id = null) {
    const idAttribute = id ? ` id="${escapeHTML(id)}"` : "";
    return `<span${idAttribute} class="${accessoryClassName(visual)}">${wearableLayerMarkup()}</span>`;
  }

  function renderWearableToNode(node, visual) {
    if (!node) return;
    node.className = accessoryClassName(visual);
    if (!node.querySelector(".wearable-body")) node.innerHTML = wearableLayerMarkup();
  }

  function visualVariableEntries(visual) {
    const resolved = visual.resolved || resolveRizoVisual({ variant:visual.variant, evolutionStage:visual.stageId, formId:visual.formId, context:visual.context });
    const entries = {
      "--rizo-image-scale": resolved.imageScale,
      "--rizo-scale-x": resolved.imageScale * resolved.bodyX,
      "--rizo-scale-y": resolved.imageScale * resolved.bodyY,
      "--age-body-x": resolved.bodyX,
      "--age-body-y": resolved.bodyY,
      "--age-face-scale": resolved.faceScale,
      "--wearable-scale": resolved.wearableScale,
      "--wearable-rotate": `${resolved.wearableRotate}deg`,
      "--rizo-offset-x": `${resolved.offsetX}%`,
      "--rizo-offset-y": `${resolved.offsetY}%`,
      "--rizo-shadow-scale": resolved.shadow.scale,
      "--rizo-shadow-x": `${resolved.shadow.x}%`,
      "--rizo-shadow-y": `${resolved.shadow.y}%`,
      "--rizo-shadow-opacity": resolved.shadow.opacity,
      "--rizo-baseline": resolved.baseline
    };
    Object.entries(resolved.anchors || {}).forEach(([name, anchor]) => {
      entries[`--anchor-${name}-x`] = `${anchor.x || 0}%`;
      entries[`--anchor-${name}-y`] = `${anchor.y || 0}%`;
      entries[`--anchor-${name}-scale`] = anchor.scale || 1;
    });
    return entries;
  }

  function applyVisualVariables(actor, visual) {
    if (!actor) return;
    actor.style.setProperty("--pet-color", visual.variant.color);
    actor.style.setProperty("--pet-sprite", `url("${visual.sprite}")`);
    actor.style.setProperty("--life-scale", String(visual.scale));
    Object.entries(visualVariableEntries(visual)).forEach(([name, value]) => actor.style.setProperty(name, String(value)));
    actor.dataset.rizoVariant = visual.variant.id;
    actor.dataset.rizoStage = visual.stageId;
    actor.dataset.rizoContext = visual.context || "default";
  }

  function visualStyleAttribute(visual) {
    const variables = {
      "--mini-life-scale": visual.scale,
      "--pet-color": visual.variant.color,
      "--mini-pet-color": visual.variant.color,
      "--pet-sprite": `url('${visual.sprite}')`,
      ...visualVariableEntries(visual)
    };
    return Object.entries(variables).map(([name, value]) => `${name}:${value}`).join(";");
  }

  function setRizoImageFallbacks(image, visual) {
    if (!image) return;
    const chain = (visual.resolved?.fallbackChain || []).filter(path => path && path !== visual.sprite);
    image.dataset.rizoFallbacks = chain.join("|");
    image.dataset.rizoFallbackUsed = "";
  }

  document.addEventListener("error", event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.rizoFallbacks) return;
    const failed = image.getAttribute("src");
    if (failed) FAILED_RIZO_ASSETS.add(failed);
    const queue = image.dataset.rizoFallbacks.split("|").filter(path => path && !FAILED_RIZO_ASSETS.has(path));
    const next = queue.shift();
    image.dataset.rizoFallbacks = queue.join("|");
    if (!next || image.dataset.rizoFallbackUsed === next) return;
    image.dataset.rizoFallbackUsed = next;
    image.src = next;
  }, true);

  async function preloadResolvedRizoVisual(visual) {
    const candidates = [...new Set([visual.sprite, ...(visual.resolved?.fallbackChain || [])].filter(Boolean))];
    for (const source of candidates) {
      const loaded = await new Promise(resolve => {
        const image = new Image();
        const timer = setTimeout(() => resolve(false), 1800);
        image.onload = () => { clearTimeout(timer); resolve(true); };
        image.onerror = () => { clearTimeout(timer); FAILED_RIZO_ASSETS.add(source); resolve(false); };
        image.src = source;
      });
      if (loaded) return source;
    }
    return VARIANTS[0].sprite;
  }

  function inferPetVisualContext(extraClass = "") {
    if (/walk-rizo/.test(extraClass)) return "walk";
    if (/shop-preview|profile-pet|rename-pet/.test(extraClass)) return "card";
    if (/cutscene|evolution-pet|event-pet|arrival-|rare-reaction|capsule-reaction/.test(extraClass)) return "cutscene";
    if (/power-rizo|spark-rizo|forage-rizo|rush-rizo|rhythm-rizo|memory-rizo|glide-rizo|breaker-rizo|maze-rizo|defense-rizo/.test(extraClass)) return "arcade";
    return "default";
  }

  // Applies the visual state onto persistent DOM nodes (garden, closet).
  // Persistent nodes are reused rather than recreated so CSS transitions
  // (sleep, hurt, celebrate) keep animating smoothly between renders.
  function ensurePetGrimeLayer(actor) {
    const shell = actor?.querySelector(":scope > .rizo-motion-shell");
    if (!shell || shell.querySelector(":scope > .rizo-grime")) return;
    const grime = document.createElement("span");
    grime.className = "rizo-grime";
    grime.setAttribute("aria-hidden", "true");
    shell.insertBefore(grime, shell.querySelector(":scope > .accessory-layer") || null);
  }

  function applyPetVisualToNodes(visual, { sprite, accessory, actor } = {}) {
    if (sprite) {
      sprite.src = visual.sprite;
      sprite.alt = `${visual.name} the ${visual.variant.name} Rizo`;
      setRizoImageFallbacks(sprite, visual);
    }
    if (accessory) renderWearableToNode(accessory, visual);
    if (actor) {
      ensurePetGrimeLayer(actor);
      actor.className = petActorClassNames(visual, actor.dataset.baseClass || "pet-actor");
      applyVisualVariables(actor, visual);
    }
  }

  // Builds a standalone HTML fragment for scenes that rebuild DOM each render.
  function petMarkup({ extraClass = "", pet = state.pet, overrides = {}, id = null, label = null, context = null } = {}) {
    const resolvedContext = context || overrides.context || inferPetVisualContext(extraClass);
    const visual = getPetVisualState(pet, { ...overrides, context:resolvedContext });
    const classes = `${petActorClassNames(visual, "mini-pet")} ${extraClass}`.trim();
    const idAttribute = id ? ` id="${escapeHTML(id)}"` : "";
    const alt = label || `${visual.name} the ${visual.variant.name} Rizo`;
    const fallbacks = (visual.resolved?.fallbackChain || []).filter(path => path && path !== visual.sprite).join("|");
    return `<div${idAttribute} class="${classes}" data-rizo-variant="${visual.variant.id}" data-rizo-stage="${visual.stageId}" data-rizo-context="${resolvedContext}" style="${visualStyleAttribute(visual)}"><span class="mini-pet-shadow"></span><span aria-hidden="true" class="evolution-echo"></span><span aria-hidden="true" class="evolution-rune"></span><span class="rizo-motion-shell" aria-hidden="true"><img src="${visual.sprite}" data-rizo-fallbacks="${escapeHTML(fallbacks)}" alt="${escapeHTML(alt)}"><span aria-hidden="true" class="rizo-grime"></span>${wearableMarkup(visual)}</span></div>`;
  }

  function flushPendingEvolution() {
    if (!pendingEvolution || mini.active || isUILocked()) return false;
    const evolution = pendingEvolution;
    pendingEvolution = null;
    showEvolutionCutscene(evolution.stage, evolution.form);
    return true;
  }

  function queueEvolutionCutscene(stage, form) {
    pendingEvolution = { stage, form };
    setTimeout(() => flushPendingEvolution(), 80);
  }

  async function showEvolutionCutscene(stage, form) {
    const visual = getPetVisualState(state.pet, { stageId:stage.id, form:state.pet.form, context:"cutscene" });
    // The same canonical Rizo sprite is preloaded before the age reveal so
    // the cutscene never flashes a missing asset on mobile.
    await preloadResolvedRizoVisual(visual);
    playPetCutscene({scene:"evolution",kicker:"YOU RAISED THIS RIZO",title:`${state.pet.name} GREW INTO ${stage.name}`,symbol:"✦",duration:1250,className:"evolution-cutscene",after:()=>{
      showModal(`<div class="modal-card evolution-result"><small>GROWTH MILESTONE</small><div class="evolution-stage">${petMarkup({extraClass:"evolution-pet",id:"evolutionPet",context:"cutscene"})}<i></i></div><h2>${escapeHTML(stage.name)} • ${escapeHTML(form.name)}</h2><p>The same Rizo grew older. Your care also strengthened the ${escapeHTML(form.name)}. +R 35</p><div class="modal-buttons"><button class="primary" data-close-modal>SAME RIZO. NEW AGE.</button></div></div>`);
      sfx("legendary"); celebrate();
    }});
  }

  function updateStage() {
    const pet = state.pet;
    if (!pet.alive || pet.stage === "egg") return;
    const next = currentStage();
    const currentIndex = STAGES.findIndex(stage => stage.id === pet.stage);
    const nextIndex = STAGES.findIndex(stage => stage.id === next?.id);
    if (next && nextIndex > currentIndex) {
      pet.stage = next.id;
      evaluateForm(false);
      pet.health = clamp(pet.health + 20);
      pet.mood = clamp(pet.mood + 18);
      pet.energy = clamp(pet.energy + 12);
      state.wallet.embers += 35;
      const form = displayFormInfo(pet);
      addMemory("GREW UP", `${pet.name} reached the ${next.name} age. Your care strengthened the ${form.name}.`, "✦");
      toast(`GROWTH: ${next.name} • ${form.name} • +R 35`);
      say(`I'M ${next.name} NOW. STILL ME.`, 3600);
      queueEvolutionCutscene(next, form);
      sfx("level");
      earnHeat(45,false);
      unlockRandomLore(.65);
    } else {
      evaluateForm(false);
    }
  }

  function petAgeText() {
    const pet = state.pet;
    if (!pet.bornAt) return "UNHATCHED";
    const minutes = Math.floor((now() - pet.bornAt) / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    return days ? `${days}D ${hours}H` : `${hours}H ${mins}M`;
  }

  function levelForXP(xp) {
    return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 16)) + 1);
  }

  function houseIsUnlocked() {
    return Boolean(state?.farm?.featureUnlocked || state?.farm?.roster?.length || (state?.farm?.unlockedRooms?.length || 0) > 1);
  }

  function houseUnlockRequirementsMet() {
    if (!state?.pet || state.pet.stage === "egg" || !state.pet.alive) return false;
    const learnedBasics = state.player.tutorialStep >= 5 || state.player.tutorialDismissed;
    return learnedBasics && levelForXP(state.pet.xp) >= HOUSE_UNLOCK_LEVEL;
  }

  function checkHouseUnlock() {
    if (houseIsUnlocked() || !houseUnlockRequirementsMet()) return false;
    state.farm.featureUnlocked = true;
    state.farm.unlockSeen = false;
    addMemory("RIZO HOUSE UNLOCKED", `${state.pet.name} reached Level ${HOUSE_UNLOCK_LEVEL}. The spare room is finally open.`, "⌂");
    saveState(true);
    return true;
  }

  function hasSeenUnlockScene(id) {
    return Array.isArray(state?.meta?.unlockScenes) && state.meta.unlockScenes.includes(id);
  }

  function rememberUnlockScene(id) {
    if (!id) return;
    if (!Array.isArray(state.meta.unlockScenes)) state.meta.unlockScenes = [];
    if (!state.meta.unlockScenes.includes(id)) state.meta.unlockScenes.push(id);
  }

  function keeperPathSteps() {
    const discovered = Object.values(state.collection || {}).filter(value => Number(value) > 0).length;
    const basicsDone = state.player.tutorialStep >= 5 || state.player.tutorialDismissed;
    const clearedArcade = (state.meta.totalGames || 0) > 0 || ["power","spark","forage","rush","walk","rhythm","memory","glide","breaker","maze","defense"].some(key => Number(state.scores?.[key]) > 0);
    const defenseBest = Math.max(Number(state.scores?.defense || 0), ...(Array.isArray(state.scores?.defenseMilestones) ? state.scores.defenseMilestones : [0]));
    const currentLevel = levelForXP(state.pet?.xp || 0);
    return [
      { id:"hatch", title:"HATCH YOUR FIRST RIZO", done:(state.meta.totalHatched || 0) > 0 || state.pet.stage !== "egg", status:(state.meta.totalHatched || 0) > 0 || state.pet.stage !== "egg" ? "DONE" : `${Math.floor(state.pet.hatch || 0)}%`, hint:"Tap the egg until the little weirdo comes out." },
      { id:"basics", title:"FINISH KEEPER BASICS", done:basicsDone, status:basicsDone ? "DONE" : `${Math.min(5, (state.player.tutorialStep || 0) + 1)}/5`, hint:"Feed, play, clean, sleep, and open the Journal once." },
      { id:"arcade", title:"CLEAR AN ARCADE RUN", done:clearedArcade, status:clearedArcade ? "DONE" : `${state.meta.totalGames || 0}/1`, hint:"Any finished game counts toward your Keeper path." },
      { id:"house", title:`UNLOCK RIZO HOUSE`, done:houseIsUnlocked(), status:houseIsUnlocked() ? "DONE" : `LV ${currentLevel}/${HOUSE_UNLOCK_LEVEL}`, hint:"Raise your main Rizo and finish the basics to open the spare room." },
      { id:"adopt", title:"ADOPT A SECOND RIZO", done:(state.farm?.roster?.length || 0) > 0, status:(state.farm?.roster?.length || 0) > 0 ? "DONE" : `${state.farm?.roster?.length || 0}/1`, hint:"Once the House opens, buy or discover another resident." },
      { id:"defense", title:"SURVIVE TO DEFENSE WAVE 10", done:defenseBest >= 10, status:defenseBest >= 10 ? "DONE" : `WAVE ${defenseBest}/10`, hint:"Your first milestone proves the roster system is really alive." },
      { id:"mature", title:"RAISE A MATURE RIZO", done:state.pet.stage === "legend", status:state.pet.stage === "legend" ? "DONE" : (currentStage()?.name || "BABY"), hint:"A full life stage makes the whole loop click into place." },
      { id:"legacy", title:"CREATE A LEGACY EGG", done:(state.meta.rebirths || 0) > 0, status:(state.meta.rebirths || 0) > 0 ? `GEN ${state.pet.generation || 2}` : `${Math.floor(skillTotal(state.pet))}/300`, hint:"Rebirth is the long-game payoff for care, bond, and training." },
      { id:"discover", title:"DISCOVER 5 VARIANTS", done:discovered >= 5, status:discovered >= 5 ? "DONE" : `${discovered}/5`, hint:"Collection progress makes the world feel larger than one room." }
    ];
  }

  function keeperPathProgress() {
    const steps = keeperPathSteps();
    const doneCount = steps.filter(step => step.done).length;
    const next = steps.find(step => !step.done) || steps[steps.length - 1];
    return { steps, doneCount, total: steps.length, next, percent: clamp(doneCount / steps.length * 100) };
  }

  function keeperTrophies() {
    const trophies = [];
    if ((state.meta.totalHatched || 0) > 0) trophies.push({ id:"spark", icon:"✦", color:"#16c8ff", name:"FIRST SPARK", copy:"Your first hatch is part of the room now." });
    if (houseIsUnlocked()) trophies.push({ id:"house", icon:"⌂", color:"#9eff75", name:"HOUSE KEY", copy:"The spare room finally opened." });
    if ((state.scores.defenseMilestones || []).includes(10)) trophies.push({ id:"gate", icon:"◉", color:"#ff5c6c", name:"GATE BADGE", copy:"Wave 10 survived in Rizo Defense." });
    if (state.pet.stage === "legend" || hasSeenUnlockScene("legacy-ready") || (state.meta.rebirths || 0) > 0) trophies.push({ id:"mature", icon:"♛", color:"#ffd45a", name:"MATURE MARK", copy:"You raised a Rizo all the way to Mature." });
    if ((state.meta.rebirths || 0) > 0) trophies.push({ id:"legacy", icon:"↻", color:"#ff68bd", name:"LEGACY RELIC", copy:"This timeline already created a Legacy Egg." });
    return trophies;
  }

  function keeperPathCompactMarkup() {
    const path = keeperPathProgress();
    const next = path.next;
    const headline = path.doneCount >= path.total ? "KEEPER PATH COMPLETE" : next.title;
    const subline = path.doneCount >= path.total ? "Open Journal → Stats to review the full path and trophy room." : next.hint;
    const progressText = `${path.doneCount}/${path.total} MILESTONES`;
    return `<button class="keeper-path-preview" data-open-keeper-path type="button"><span>KEEPER PATH • ${progressText}</span><b>${escapeHTML(headline)}</b><small>${escapeHTML(subline)}</small><i><u style="width:${path.percent}%"></u></i></button>`;
  }

  function keeperPathJournalMarkup() {
    const path = keeperPathProgress();
    return `<section class="stat-board keeper-path-board" id="keeperPathBoard"><div class="keeper-path-head"><div><small>LONG-TERM STRUCTURE</small><h3>KEEPER PATH</h3><p>The game keeps opening up as you prove you understand one Rizo, then a house, then lineage.</p></div><span>${path.doneCount}/${path.total}</span></div><div class="keeper-path-track"><i style="width:${path.percent}%"></i></div><div class="keeper-path-steps">${path.steps.map((step, index) => `<article class="path-step ${step.done ? "done" : ""}"><strong>${String(index + 1).padStart(2, "0")}</strong><div><b>${escapeHTML(step.title)}</b><small>${escapeHTML(step.hint)}</small></div><em>${escapeHTML(step.status)}</em></article>`).join("")}</div></section>`;
  }

  function keeperTrophyJournalMarkup() {
    const trophies = keeperTrophies();
    return `<section class="stat-board trophy-room-board"><div class="trophy-room-head"><div><small>VISIBLE SAVE HISTORY</small><h3>TROPHY ROOM</h3><p>Every trophy also appears on the Den shelf so progress changes the world around Rizo.</p></div><span>${trophies.length}/5</span></div><div class="trophy-chip-row">${trophies.length ? trophies.map((trophy,index) => `<span class="trophy-chip trophy-${trophy.id}" style="--trophy-color:${trophy.color};--trophy-delay:${index * .11}s" title="${escapeHTML(trophy.copy)}"><i>${trophy.icon}</i><b>${escapeHTML(trophy.name)}</b><small>${escapeHTML(trophy.copy)}</small></span>`).join("") : `<small>NO TROPHIES YET. RAISE RIZO A LITTLE LONGER.</small>`}</div></section>`;
  }

  const DEFENSE_INTRO_SCENE_ID = "defense-origin-v37";
  let pendingDefenseMapChoice = "auto";

  function defenseResolvedMapId(choice = "auto") {
    const unlocked = defenseUnlockedMaps();
    const fallback = (unlocked[unlocked.length - 1] || DEFENSE_MAPS.grove).id;
    return choice !== "auto" && unlocked.some(map => map.id === choice) ? choice : fallback;
  }

  const DEFENSE_LOBBY_ICONS=Object.freeze({grove:"🌲",ember:"🔥",moon:"🌙",storm:"⚡",blizzard:"❄️",eclipse:"🌑"});
  const DEFENSE_ROSTER_WING_SLOTS=3;
  const DEFENSE_GUEST_CREW=Object.freeze([
    Object.freeze({variant:"violet",name:"SHORT CIRCUIT",role:"CHAIN"}),
    Object.freeze({variant:"frost",name:"COLD SHOULDER",role:"CONTROL"}),
    Object.freeze({variant:"obsidian",name:"DEAD WEIGHT",role:"ARMOR"})
  ]);
  const DEFENSE_ROSTER_IDENTITY=Object.freeze({
    classic:{tags:["BALANCED","RALLY"]},ember:{tags:["BURN","PRESSURE"]},toxic:{tags:["POISON","ATTRITION"]},violet:{tags:["CHAIN","PACKS"]},
    moss:{tags:["ROOT","HOLD"]},bubblegum:{tags:["PUSH","RESET"]},frost:{tags:["SLOW","FIRE COUNTER"]},glitch:{tags:["BURST","REVEAL"]},
    obsidian:{tags:["ARMOR","SPLASH"]},aurora:{tags:["AURA","REVEAL"]},golden:{tags:["PROFIT","STALL"]},diamond:{tags:["PIERCE","ARMOR"]},
    shadow:{tags:["CRIT","EXECUTE"]},retro:{tags:["RAPID","REWIND"]}
  });
  function defenseRosterIdentity(pet){const variant=pet?.variant||pet?.hiddenVariant||"classic";return DEFENSE_ROSTER_IDENTITY[variant]||DEFENSE_ROSTER_IDENTITY.classic;}
  function defenseRosterTrainingEdge(pet){
    const skills=pet?.skills||{},entries=[["POWER-TRAINED",Number(skills.power)||0],["QUICK-TRAINED",Number(skills.speed)||0],["SHARP-EYE",Number(skills.instinct)||0],["STURDY CORE",Number(skills.stamina)||0]].sort((a,b)=>b[1]-a[1]);
    return entries[0][1]>=5?entries[0][0]:"FRESH HAND";
  }
  function defenseMasteryLean(record){
    const power=Math.max(0,Number(record?.powerPaths)||0),control=Math.max(0,Number(record?.controlPaths)||0),total=power+control;
    if(total<2)return"NO PATH HABIT";if(power>=control*1.5)return"POWER-LEANING";if(control>=power*1.5)return"CONTROL-LEANING";return"SPLIT-PATH";
  }
  function defenseRosterTrailFit(pet,mapId){
    const perk=typeof DEFENSE_WORLD_OPENING_PERKS!=="undefined"?DEFENSE_WORLD_OPENING_PERKS[mapId]:null,variant=pet?.variant||pet?.hiddenVariant||"classic";
    return Boolean(perk?.variants?.includes(variant));
  }
  function defenseRosterRead(rows,mapId){
    const selected=(rows||[]).filter(row=>row?.pet),captain=selected.find(row=>row.source==="active")||selected[0]||null,crew=selected.filter(row=>row.source!=="active"),toolTags=[];
    for(const row of crew)for(const tag of defenseRosterIdentity(row.pet).tags)if(!toolTags.includes(tag))toolTags.push(tag);
    const fits=selected.filter(row=>defenseRosterTrailFit(row.pet,mapId)),captainVariant=captain?.pet?.variant||captain?.pet?.hiddenVariant||"classic",powerActive=(typeof DEFENSE_ABILITIES!=="undefined"?(DEFENSE_ABILITIES[captainVariant]||DEFENSE_ABILITIES.classic)?.active:null)||"FIELD POWER",controlActive=(typeof DEFENSE_CONTROL_ABILITIES!=="undefined"?(DEFENSE_CONTROL_ABILITIES[captainVariant]||DEFENSE_CONTROL_ABILITIES.classic)?.active:null),captainPower=controlActive&&controlActive!==powerActive?`${powerActive} / ${controlActive}`:powerActive,opening=typeof DEFENSE_WORLD_OPENING_PERKS!=="undefined"?DEFENSE_WORLD_OPENING_PERKS[mapId]:null;
    return{captainPower,tools:toolTags.slice(0,5),fits,openingLabel:opening?.label||"BALANCED OPENING",hasOpeningDeal:Boolean(opening?.variants?.length)};
  }
  function defenseRosterReadMarkup(rows,mapId){
    const read=defenseRosterRead(rows,mapId),fitNames=read.fits.map(row=>row.pet.name),tools=read.tools.length?read.tools.join(" • "):"CAPTAIN-ONLY",fitRoster=fitNames.length?`${fitNames.slice(0,2).join(" + ")}${fitNames.length>2?` +${fitNames.length-2}`:""}`:"NO MATCH",fitCopy=read.hasOpeningDeal?`${read.openingLabel} • ${fitRoster}`:`${read.openingLabel} • ANY CREW`;
    return`<div class="defense-roster-read" data-defense-roster-read><span><small>CAPTAIN FIELD POWER</small><b>${escapeHTML(read.captainPower)}</b></span><span><small>CREW TOOLS</small><b>${escapeHTML(tools)}</b></span><span class="${read.hasOpeningDeal&&fitNames.length?"ready":"quiet"}"><small>TRAIL OPENING</small><b>${escapeHTML(fitCopy)}</b></span></div>`;
  }
  function defenseOwnedRosterEntries(){
    const rows=[{pet:state.pet,source:"active",rosterIndex:-1}];
    for(const [rosterIndex,pet] of (state.farm?.roster||[]).entries())rows.push({pet,source:"house",rosterIndex});
    return rows.filter(row=>row.pet?.alive!==false&&row.pet?.stage!=="egg");
  }
  function defenseGuestRosterEntry(variant){
    const guest=DEFENSE_GUEST_CREW.find(item=>item.variant===variant);if(!guest)return null;
    const pet={...state.pet,id:`defense-crew-${guest.variant}`,name:guest.name,variant:guest.variant,hiddenVariant:guest.variant,stage:"kid",alive:true,defenseGuest:true,accessory:null,skills:{power:0,speed:0,instinct:0,stamina:0,luck:0}};
    return{pet,source:"guest",rosterIndex:-1};
  }
  function defenseFullRosterRegistry(){
    const rows=defenseOwnedRosterEntries();
    for(const guest of DEFENSE_GUEST_CREW){const row=defenseGuestRosterEntry(guest.variant);if(row)rows.push(row);}
    return new Map(rows.map(row=>[row.pet.id,row]));
  }
  // Restoration registry: every id that can legally stand on the field, including
  // universal tools/structures that are deliberately absent from the crew roster.
  function defenseRestorableRegistry(){
    const registry=defenseFullRosterRegistry();
    for(const row of defenseUniversalRows())registry.set(row.pet.id,row);
    return registry;
  }
  function defenseGuestAccessAllowed(){return defenseOwnedRosterEntries().filter(row=>row.source==="house").length<2;}
  function defenseDefaultWingIds(){
    const house=defenseOwnedRosterEntries().filter(row=>row.source==="house").slice(0,DEFENSE_ROSTER_WING_SLOTS).map(row=>row.pet.id);
    if(defenseGuestAccessAllowed()&&house.length<DEFENSE_ROSTER_WING_SLOTS)house.push("defense-crew-violet");
    return house.slice(0,DEFENSE_ROSTER_WING_SLOTS);
  }
  function defenseConfiguredWingIds(){
    const registry=defenseFullRosterRegistry(),houseIds=new Set(defenseOwnedRosterEntries().filter(row=>row.source==="house").map(row=>row.pet.id)),guestAllowed=defenseGuestAccessAllowed();
    const raw=Array.isArray(state.settings?.defenseRosterIds)?state.settings.defenseRosterIds:[];let guestCount=0;
    const ids=[];
    for(const id of raw){const row=registry.get(id);if(!row||ids.includes(id)||id===state.pet?.id)continue;if(row.source!=="house"&&row.source!=="guest")continue;if(row.source==="house"&&!houseIds.has(id))continue;if(row.source==="guest"){if(!guestAllowed||guestCount>=1)continue;guestCount+=1;}ids.push(id);if(ids.length>=DEFENSE_ROSTER_WING_SLOTS)break;}
    return ids.length||state.settings?.defenseRosterConfigured?ids:defenseDefaultWingIds();
  }
  function defenseConfiguredRoster(){
    const registry=defenseFullRosterRegistry(),captain=defenseOwnedRosterEntries().find(row=>row.source==="active")||null,rows=[];
    if(captain)rows.push(captain);
    for(const id of defenseConfiguredWingIds()){const row=registry.get(id);if(row)rows.push(row);}
    return rows;
  }
  function defenseSetConfiguredWingIds(ids,{persist=true}={}){
    state.settings.defenseRosterIds=[...new Set((ids||[]).filter(id=>typeof id==="string"))].slice(0,DEFENSE_ROSTER_WING_SLOTS);
    state.settings.defenseRosterConfigured=true;
    if(persist)saveState(true);
    return defenseConfiguredWingIds();
  }
  function toggleDefenseRosterPick(id){
    const registry=defenseFullRosterRegistry(),row=registry.get(id);if(!row||row.source==="active")return false;if(row.source!=="house"&&row.source!=="guest")return false;
    if(readDefenseCheckpoint())return false;
    let ids=[...defenseConfiguredWingIds()],index=ids.indexOf(id);
    if(index>=0)ids.splice(index,1);else{
      if(row.source==="guest"){if(!defenseGuestAccessAllowed())return false;ids=ids.filter(existing=>registry.get(existing)?.source!=="guest");}
      if(ids.length>=DEFENSE_ROSTER_WING_SLOTS)return false;
      ids.push(id);
    }
    defenseSetConfiguredWingIds(ids);return true;
  }
  function defenseRosterLobbyMarkup(checkpoint=null,mapId=defenseResolvedMapId(pendingDefenseMapChoice)){
    const configured=defenseConfiguredRoster(),selected=new Set(configured.map(row=>row.pet.id)),captain=configured.find(row=>row.source==="active"),house=defenseOwnedRosterEntries().filter(row=>row.source==="house"),locked=Boolean(checkpoint),guestAllowed=defenseGuestAccessAllowed(),wingCount=Math.max(0,configured.length-(captain?1:0));
    const card=(row,{captainCard=false,selectable=true}={})=>{
      const variant=VARIANTS.find(item=>item.id===(row.pet.variant||row.pet.hiddenVariant))||VARIANTS[0],stats=defenseTowerStats(row.pet),mastery=state.scores?.defenseMastery?.[row.pet.id],title=mastery?defenseMasteryTitle(mastery):row.source==="guest"?"TRIAL ONLY":"UNTESTED",lean=row.source==="guest"?"NO PERMANENT RECORD":defenseMasteryLean(mastery),training=row.source==="guest"?"":defenseRosterTrainingEdge(row.pet),detail=training&&training!=="FRESH HAND"?`${title} • ${training}`:title,isSelected=selected.has(row.pet.id),trailFit=defenseRosterTrailFit(row.pet,mapId),tag=captainCard?"CAPTAIN":row.source==="guest"?"LOANER":"OWNED",action=isSelected&&!captainCard?"REMOVE":isSelected?"LOCKED":"ADD",identity=defenseRosterIdentity(row.pet);
      return`<button type="button" class="defense-roster-build-card ${captainCard?"captain":""} ${row.source==="guest"?"guest":"owned"} ${isSelected?"selected":""} ${trailFit?"trail-fit":""}" ${selectable&&!captainCard&&!locked?`data-defense-roster-pick="${escapeHTML(row.pet.id)}"`:"disabled"} style="--roster-color:${variant.color}" aria-pressed="${isSelected}" title="${escapeHTML(row.pet.name)} • ${identity.tags.join(" • ")}${trailFit?" • OPENING DEAL MATCH":""}">${petMarkup({pet:row.pet,extraClass:"defense-roster-build-pet",context:"thumbnail",label:row.pet.name})}<span><small>${tag} • ${escapeHTML(stats.profile.label)}</small><b>${escapeHTML(row.pet.name)}</b><em>${escapeHTML(detail)}</em><u>${identity.tags.map(item=>`<i>${escapeHTML(item)}</i>`).join("")}${trailFit?`<i class="trail">TRAIL FIT</i>`:""}</u>${mastery&&row.source!=="guest"&&lean!=="NO PATH HABIT"?`<strong>${escapeHTML(lean)}</strong>`:""}</span><i>${action}</i></button>`;
    };
    const selectedCards=configured.map(row=>card(row,{captainCard:row.source==="active",selectable:row.source!=="active"})).join("");
    const empty=Array.from({length:Math.max(0,DEFENSE_ROSTER_WING_SLOTS-wingCount)},()=>`<span class="defense-roster-empty"><b>+</b><small>OPEN CREW SLOT</small></span>`).join("");
    const ownedPool=house.length?house.map(row=>card(row)).join(""):`<p class="defense-roster-empty-copy">Raise or discover another Rizo and it can join this crew.</p>`;
    const guests=guestAllowed?DEFENSE_GUEST_CREW.map(item=>card(defenseGuestRosterEntry(item.variant))).join(""):"";
    const guestCopy=guestAllowed?`<div class="defense-roster-pool-head"><span><small>TRIAL LOANER</small><b>ONE TEMPORARY TRIAL SLOT</b></span><em>NO MVP • NO MASTERY</em></div><div class="defense-roster-pool guest-pool">${guests}</div>`:`<p class="defense-roster-graduated">TRAIL LOANERS RETIRED • YOUR HOUSE NOW SUPPLIES THE CREW.</p>`;
    return`<section class="defense-roster-builder ${locked?"locked":""}"><div class="defense-roster-builder-head"><span><small>DEFENSE CREW</small><b>${escapeHTML(state.pet?.name||"RIZO")} LEADS EVERY RUN</b></span><em>${wingCount}/${DEFENSE_ROSTER_WING_SLOTS} CREW SLOTS</em></div>${locked?`<p class="defense-roster-lock-note">A run is checkpointed. Resume or discard it before changing this crew.</p>`:""}${defenseRosterReadMarkup(configured,mapId)}<div class="defense-roster-selected">${selectedCards}${empty}</div><div class="defense-roster-pool-head"><span><small>YOUR HOUSE • BUILD FOR THIS TRAIL</small><b>DIFFERENT RIZOS, DIFFERENT ANSWERS</b></span><em>${house.length} AVAILABLE</em></div><div class="defense-roster-pool">${ownedPool}</div>${guestCopy}</section>`;
  }
  function defenseWorldLobbyMarkup(choice = pendingDefenseMapChoice) {
    const best=Math.max(0,Math.floor(Number(state.scores?.defense)||0),0),unlocked=defenseUnlockedMaps(),resolvedId=defenseResolvedMapId(choice),resolved=DEFENSE_MAPS[resolvedId]||DEFENSE_MAPS.grove,perMap=state.scores?.defenseMaps||{},checkpoint=readDefenseCheckpoint(),resolvedBest=Math.max(0,Math.floor(Number(perMap[resolvedId])||0));
    const worlds=DEFENSE_MAP_ORDER.map(id=>{const map=DEFENSE_MAPS[id],locked=best<map.unlockWave,selected=resolvedId===id,mapBest=Math.max(0,Math.floor(Number(perMap[id])||0)),status=locked?`${map.unlockWave}`:mapBest?`${mapBest}`:"NEW";return`<button type="button" class="defense-world-pick ${selected?"selected":""} ${locked?"locked":""}" ${locked?"disabled":`data-defense-lobby-map="${id}"`} style="--map-accent:${defenseMapAccent(id)}" aria-label="${locked?`World ${map.level} locked until Wave ${map.unlockWave}`:`Choose World ${map.level}, ${escapeHTML(map.name)}`}" aria-pressed="${selected&&!locked?"true":"false"}"><small>${map.level}</small><b>${DEFENSE_LOBBY_ICONS[id]||map.icon}</b><span>${locked?"🔒 ":""}${status}</span></button>`;}).join("");
    const resume=checkpoint?`<button class="defense-lobby-resume-simple" type="button" data-resume-defense-run><span>▶</span><div><small>CONTINUE RUN</small><b>${escapeHTML((DEFENSE_MAPS[checkpoint.mapId]||DEFENSE_MAPS.grove).name)} • WAVE ${checkpoint.currentWave||checkpoint.clearedWave+1}</b></div><i>›</i></button>`:"";
    return`<div class="modal-card defense-world-lobby defense-world-lobby-simple rizo-defense-lobby v79-simple"><div class="defense-lobby-brand v79"><img src="./assets/rizo-full-mark.png" alt=""/><div><small>RIZO DEFENSE</small><b>CHOOSE A TRAIL</b></div><em>${unlocked.length}/${DEFENSE_MAP_ORDER.length} OPEN</em></div>${resume}<section class="defense-world-hero" style="--map-accent:${defenseMapAccent(resolvedId)}"><div class="defense-world-hero-map"><strong>${DEFENSE_LOBBY_ICONS[resolvedId]||resolved.icon}</strong>${defenseMiniRouteMarkup(resolved)}<i>WORLD ${resolved.level}</i></div><div class="defense-world-hero-copy"><small>${escapeHTML(resolved.routeType)} TRAIL</small><h2>${escapeHTML(resolved.name)}</h2><p>${escapeHTML(resolved.strategy)}</p><div><span>♥ ${resolved.lives}</span><span>🪙 ${BASE_DEFENSE_STARTING_CASH}</span><span>${resolvedBest?`BEST ${resolvedBest}`:"NEW TRAIL"}</span></div></div></section><div class="defense-world-picks" aria-label="Choose Defense world">${worlds}</div>${defenseRosterLobbyMarkup(checkpoint,resolvedId)}<p class="defense-lobby-one-line">Captain deploys free. Bring the crew that answers this trail.</p><div class="modal-buttons defense-lobby-actions v79"><button type="button" data-close-modal>BACK</button><button type="button" data-defense-lobby-more>MORE</button><button class="primary" type="button" data-enter-defense-world="${escapeHTML(resolvedId)}">PLAY ${escapeHTML(resolved.name).toUpperCase()}</button></div></div>`;
  }

  function showDefenseWorldExtras(){
    const contract=ensureDailyDefenseContract(),school=defenseSchoolState(),done=school.completed.length;
    showModal(`<div class="modal-card defense-world-extras"><small>RIZO DEFENSE</small><h2>MORE</h2><p>The stuff you do not need in your face to start playing.</p><div class="defense-extra-grid"><button type="button" data-defense-records><b>🏆 RECORDS</b><small>Best waves and medals.</small></button><button type="button" data-defense-field-guide="rizos"><b>❓ GUIDE</b><small>Rizos and balloon types.</small></button><button type="button" data-defense-school-open><b>🎓 TRAIL SCHOOL</b><small>${done}/6 lessons.</small></button><button type="button" data-enter-defense-contract="${escapeHTML(contract.id)}"><b>✦ DAILY CHALLENGE</b><small>${escapeHTML(contract.title)}</small></button></div><div class="modal-buttons"><button class="primary" type="button" data-defense-records-back>BACK TO WORLDS</button></div></div>`);
  }
  function showDefenseWorldLobby(choice = pendingDefenseMapChoice) {
    pendingDefenseMapChoice = choice;
    showModal(defenseWorldLobbyMarkup(choice));
    activeMusicOverride = "mini-defense";
    startMusicForScene("mini-defense", true);
  }

  function showDefenseOriginIntro(force = false) {
    if (!force && hasSeenUnlockScene(DEFENSE_INTRO_SCENE_ID)) {
      showDefenseWorldLobby("auto");
      return;
    }
    activeMusicOverride = "shadow";
    playPetCutscene({scene:"shadow",kicker:"THE FOREST SENT A WARNING",title:"THE EMBER GATE IS UNDER ATTACK.",symbol:"◉",duration:1750,className:"feature-unlock-cutscene defense-origin-cutscene defense-origin-v37",after:()=>{
      showModal(`<div class="modal-card defense-origin-reveal unlock-reveal defense-origin-v37-reveal"><small>RIZO DEFENSE • ORIGIN MOVIE</small><div class="defense-origin-stage"><div class="defense-origin-siren"></div><div class="defense-origin-path"></div><div class="defense-origin-gate"><i></i><b>EMBER<br>GATE</b></div><div class="defense-origin-balloon balloon-one"><i></i></div><div class="defense-origin-balloon balloon-two"><i></i></div><div class="defense-origin-balloon balloon-three"><i></i></div>${petMarkup({extraClass:"defense-origin-rizo",context:"cutscene"})}<div class="defense-origin-caption"><b>THE GATE CALLED YOUR HOUSE.</b><span>Every Rizo you raise can stand beside the trail.</span></div></div><h2>THE BALLOONS FOUND RIZO.</h2><p class="big-line">YOUR PETS ARE THE DEFENSE.</p><p>Choose a world, tap a Rizo, tap open grass, and survive long enough to unlock stranger maps, weather, bosses, and abilities.</p><div class="modal-buttons"><button data-close-modal>BACK OUT</button><button class="primary" data-defense-intro-continue>OPEN WORLD ROUTE</button></div></div>`);
      sfx("legendary");
      haptic([18,26,18,42]);
    }});
  }

  function maybeAnnounceHouseUnlock() {
    if (!houseIsUnlocked() || state.farm.unlockSeen || isUILocked() || mini.active) return;
    state.farm.unlockSeen = true;
    rememberUnlockScene("house-unlock");
    saveState(true);
    playPetCutscene({scene:"event",kicker:"NEW FEATURE UNLOCKED",title:"THE SPARE ROOM WOKE UP.",symbol:"⌂",duration:1480,className:"feature-unlock-cutscene unlock-house",after:()=>{
      showModal(`<div class="modal-card house-unlock-modal unlock-reveal"><small>NEW FEATURE UNLOCKED</small><div class="house-unlock-door"><i></i><b>⌂</b></div><h2>THE SPARE ROOM IS OPEN.</h2><p class="big-line">YOU LEARNED HOW TO RAISE ONE RIZO. NOW THE HOUSE CAN GROW.</p><p>Adopt expensive new Rizos, keep three in each room, watch them live together, and swap any resident into the main Den.</p><div class="modal-buttons"><button data-close-modal>NOT YET</button><button class="primary" data-open-house>ENTER RIZO HOUSE</button></div></div>`);
      sfx("level");
      celebrate();
    }});
  }

  function maybeAnnounceLegacyReady() {
    if (!canRebirth() || hasSeenUnlockScene("legacy-ready") || isUILocked() || mini.active) return;
    rememberUnlockScene("legacy-ready");
    saveState(true);
    playPetCutscene({scene:"evolution",kicker:"LONG GAME PAYOFF",title:`${state.pet.name} CAN BECOME A LEGACY EGG.`,symbol:"↻",duration:1560,className:"feature-unlock-cutscene unlock-legacy",after:()=>{
      showModal(`<div class="modal-card unlock-reveal legacy-ready-modal"><small>NEW SYSTEM READY</small><div class="modal-art">↻</div><h2>LEGACY IS AVAILABLE.</h2><p class="big-line">THIS RIZO CAN BECOME AN ANCESTOR NOW.</p><p>You hit Mature, 80 Bond, and 300 total training. Rebirth keeps your collection, rooms, and currency while the next egg inherits stronger genetic caps.</p><div class="modal-buttons"><button data-close-modal>LATER</button><button class="primary" data-rebirth-info>VIEW LEGACY PATH</button></div></div>`);
      sfx("legendary");
      celebrate();
    }});
  }

  function nextBackupPromptId() {
    if ((state.player.streak || 0) >= 7 && !(state.meta.backupPrompts || []).includes("week-1")) return "week-1";
    if (houseIsUnlocked() && !(state.meta.backupPrompts || []).includes("house-1")) return "house-1";
    if (state.pet.stage === "legend" && !(state.meta.backupPrompts || []).includes("mature-1")) return "mature-1";
    if ((state.meta.rebirths || 0) > 0 && !(state.meta.backupPrompts || []).includes("rebirth-1")) return "rebirth-1";
    return null;
  }

  function maybePromptBackup() {
    const id = nextBackupPromptId();
    if (!id || isUILocked() || mini.active) return;
    if (!Array.isArray(state.meta.backupPrompts)) state.meta.backupPrompts = [];
    state.meta.backupPrompts.push(id);
    saveState(true);
    const lines = {
      "week-1": "You kept this save alive for a week. That is long enough for it to matter.",
      "house-1": "The House is open now. Your timeline officially has more than one moving part.",
      "mature-1": "A Mature Rizo is a real milestone. This is the point where a backup stops being optional.",
      "rebirth-1": "You created lineage. Export a copy so this family tree never disappears."
    };
    showModal(`<div class="modal-card backup-reminder-modal"><small>BACKUP REMINDER</small><div class="modal-art">⤓</div><h2>EXPORT THIS TIMELINE.</h2><p class="big-line">${escapeHTML(lines[id] || "This save is becoming important.")}</p><p>Progress is stored on this device. Export a JSON backup before switching phones or clearing browser data.</p><div class="modal-buttons"><button data-close-modal>LATER</button><button class="primary" data-export-save>BACKUP NOW</button></div></div>`);
  }

  function moodInfo() {
    const pet = state.pet;
    if (pet.stage === "egg") return { label: pet.hatch > 70 ? "RESTLESS" : "CURIOUS", color: "#16c8ff" };
    if (!pet.alive) return { label: "GONE", color: "#8b93a0" };
    if (pet.sleeping) return { label: "DREAMING", color: "#6c8cff" };
    if (pet.sick) return { label: "SICK", color: "#9eff75" };
    if (pet.hunger < 18) return { label: "STARVING", color: "#ff5c6c" };
    if (pet.energy < 18) return { label: "EXHAUSTED", color: "#6c8cff" };
    if (pet.hygiene < 18) return { label: "STINKY", color: "#ffd45a" };
    if (pet.mood < 18) return { label: "DRAMATIC", color: "#ff68bd" };
    if (Math.max(pet.strength || 0, pet.skills?.power || 0) > 65) return { label: "JACKED", color: "#ff5c6c" };
    if (pet.bond > 70) return { label: "OBSESSED", color: "#ff68bd" };
    if (pet.mood > 78) return { label: "THRIVING", color: "#9eff75" };
    return { label: "CHILLING", color: "#16c8ff" };
  }

  function descriptorText() {
    const pet = state.pet;
    if (pet.stage === "egg") return pet.shame ? "FREE EGG • IT KNOWS" : "WARM • DEFINITELY WEIRD";
    const variant = currentVariant();
    const form = displayFormInfo(pet);
    return `GEN ${pet.generation || 1} • ${form.name} • ${Math.floor(pet.bond)} BOND`;
  }

  function needColor(value) {
    if (value < 20) return "#ff5c6c";
    if (value < 45) return "#ffd45a";
    return "#9eff75";
  }

  // ===== UI RENDER PIPELINE =====
  function renderSharedUI() {
    document.body.classList.toggle("reduce-motion", reducedMotionActive());
    document.body.classList.toggle("defense-signatures-off", !state.settings.defenseSignatures);
    document.body.classList.toggle("defense-ui-compact", state.settings.defenseUiScale === "compact");
    document.body.classList.toggle("defense-ui-large", state.settings.defenseUiScale === "large");
    document.body.dataset.defenseFx = state.settings.defenseFx;
    el.keeperShort.textContent = state.player.keeperId.slice(-4);
    el.streakCount.textContent = state.player.streak;
    el.coinCount.textContent = formatNumber(state.wallet.embers);
    const houseNav = document.querySelector('[data-nav="farm"]');
    if (houseNav) {
      const locked = !houseIsUnlocked();
      houseNav.classList.toggle("feature-locked", locked);
      houseNav.dataset.lockLabel = locked ? `LV ${HOUSE_UNLOCK_LEVEL}` : "";
      houseNav.setAttribute("aria-label", locked ? `Rizo House. Unlocks at Rizo level ${HOUSE_UNLOCK_LEVEL}.` : "Rizo House");
    }
  }

  function renderCurrentView() {
    if (currentView === "home") {
      renderHome();
      renderSeason();
    } else if (currentView === "arcade") {
      renderArcade();
      renderExpedition();
    } else if (currentView === "closet") {
      renderCloset();
    } else if (currentView === "journal") {
      renderJournal();
    } else if (currentView === "farm") {
      renderFarm();
    }
  }

  function renderAll() {
    resetDailyIfNeeded();
    checkHouseUnlock();
    renderSharedUI();
    renderCurrentView();
    renderTutorial();
    refreshAdSlots();
    if (mini?.active && mini.mode === "defense") scheduleDefenseTowerGeometrySync();
    setTimeout(maybeAnnounceHouseUnlock, 0);
    setTimeout(maybeAnnounceLegacyReady, 80);
    setTimeout(maybePromptBackup, 160);
  }

  function renderHome() {
    const pet = state.pet;
    const variant = currentVariant();
    const isEgg = pet.stage === "egg";
    const mood = moodInfo();

    el.habitatScene.className = `habitat-scene ${ROOMS.find(room => room.id === pet.room)?.className || "theme-rain"}`;
    el.moodChip.querySelector("i").style.background = mood.color;
    el.moodChip.querySelector("span").textContent = mood.label;
    applyLivingMood();
    el.petName.textContent = isEgg ? "MYSTERY EGG" : pet.name;
    el.petDescriptor.textContent = descriptorText();
    el.petLevel.textContent = isEgg ? "0" : levelForXP(pet.xp);
    el.careName.textContent = isEgg ? "THE EGG" : pet.name;
    el.sleepActionText.textContent = pet.sleeping ? "WAKE" : "SLEEP";

    el.eggActor.hidden = !isEgg;
    el.petActor.hidden = isEgg;
    el.eggActor.classList.toggle("cracking", pet.hatch >= 70);
    if (isEgg) {
      el.eggActor.style.setProperty("--egg-color", variant.color);
      el.growthTitle.textContent = "HATCHING";
      el.growthText.textContent = `${Math.floor(pet.hatch)}%`;
      el.growthBar.style.width = `${pet.hatch}%`;
    } else {
      const stage = currentStage();
      const visual = getPetVisualState(pet, { context:"den" });
      applyPetVisualToNodes(visual, { sprite: el.petSprite, accessory: el.accessoryLayer, actor: el.petActor });
      el.faceFx.className = `face-fx ${pet.mood < 15 ? "tears" : ""}`;
      el.statusFx.className = `status-fx ${pet.sleeping ? "zzz" : ""}`;
      const evolution = evolutionRequirements(stage);
      el.growthTitle.textContent = stage.nextXP === Infinity ? (pet.elder ? "LEGACY READY" : "FULLY GROWN") : `GROWING TO ${evolution.next?.name || "MATURE"}`;
      el.growthText.textContent = stage.nextXP === Infinity ? (pet.elder ? "REBIRTH AVAILABLE" : displayFormInfo(pet).name) : evolution.missing;
      el.growthBar.style.width = `${evolution.progress}%`;
    }
    renderDenCareTrace(isEgg);

    const needs = ["hunger", "mood", "energy", "hygiene"];
    for (const need of needs) {
      el[`${need}Text`].textContent = Math.floor(pet[need]);
      el[`${need}Bar`].style.width = `${clamp(pet[need])}%`;
      el[`${need}Bar`].style.background = needColor(pet[need]);
    }
    const hygieneLabel = el.hygieneText?.parentElement?.querySelector("small");
    if (hygieneLabel) hygieneLabel.textContent = pet.hygiene < 18 ? "FILTHY" : pet.hygiene < 35 ? "DIRTY" : pet.hygiene < 60 ? "MESSY" : "CLEAN";
    el.needGrid.style.opacity = isEgg ? ".34" : "1";
    $$("[data-need]").forEach(button => {
      const need = button.dataset.need;
      button.disabled = isEgg || !pet.alive || (pet.sleeping && need !== "energy");
      const labels = { hunger: "Open food menu", mood: "Open play menu", energy: pet.sleeping ? "Wake Rizo" : "Rest and recharge", hygiene: "Clean Rizo" };
      button.setAttribute("aria-label", `${labels[need]}. Current ${need}: ${Math.floor(pet[need])}`);
      button.title = labels[need];
    });
    const lowestNeed = pet.sleeping ? "energy" : needs.reduce((lowest, need) => pet[need] < pet[lowest] ? need : lowest, needs[0]);
    const suggestedAction = { hunger: "feed", mood: "play", energy: "sleep", hygiene: "clean" }[lowestNeed];
    $$("[data-action]").forEach(button => {
      const action = button.dataset.action;
      button.disabled = isEgg || !pet.alive || (pet.sleeping && !["sleep"].includes(action));
      const recommended = !button.disabled && action === suggestedAction;
      button.classList.toggle("recommended", recommended);
      if (recommended) button.setAttribute("aria-label", `${action}. Recommended because ${lowestNeed} is currently lowest.`);
      else button.removeAttribute("aria-label");
    });

    el.dailyGiftButton.setAttribute("aria-label", state.daily.giftClaimed ? "Daily gift already claimed" : `Claim day ${state.player.streak} daily gift`);
    el.dailyGiftButton.title = state.daily.giftClaimed ? "Daily gift claimed" : "Claim daily gift";
    el.questTitle.textContent = state.daily.title;
    el.questText.textContent = `${Math.min(state.daily.progress, state.daily.target)} / ${state.daily.target}`;
    el.questBar.style.width = `${clamp(state.daily.progress / state.daily.target * 100)}%`;
    const questReady = !state.daily.claimed && state.daily.progress >= state.daily.target;
    const questRemaining = Math.max(0, state.daily.target - state.daily.progress);
    el.questClaim.disabled = false;
    el.questClaim.classList.toggle("locked", !questReady && !state.daily.claimed);
    el.questClaim.classList.toggle("claimed", state.daily.claimed);
    el.questClaim.textContent = state.daily.claimed ? "DONE" : questReady ? `CLAIM R ${state.daily.reward}` : `R ${state.daily.reward}`;
    el.questClaim.title = state.daily.claimed ? "Daily mission already claimed" : questReady ? "Claim your daily reward" : `${questRemaining} more to unlock`;
    el.questClaim.setAttribute("aria-label", el.questClaim.title);
    el.dailyGiftButton.style.opacity = state.daily.giftClaimed ? ".52" : "1";

    renderGardenVisitor();
    renderGardenGrowth();
    renderHabitatShelf();
    const latest = state.memories[0];
    el.memoryTitle.textContent = latest?.title || "THE EGG IN THE RAIN";
    el.memoryText.textContent = latest?.text || "You found something impossible under a tree and decided that was somehow your problem now.";
  }

  function renderDenCareTrace(isEgg = false) {
    const trace = el.denCareTrace;
    if (!trace) return;
    const memory = lifeMemory();
    const current = now();
    let copy = "";
    if (!isEgg && current - (Number(memory.lastBathAt) || 0) < 15 * 60 * 1000) copy = "BATH WATER / DO NOT DRINK";
    else if (!isEgg && current - (Number(memory.lastFoodAt) || 0) < 3 * 60 * 1000) copy = "CRUMBS / EVIDENCE";
    else if (!isEgg && Number(memory.arcadeAfterglowUntil) > current) copy = "ARCADE RECEIPT / NO REFUNDS";
    trace.hidden = !copy;
    trace.textContent = copy;
  }

  function renderGardenVisitor() {
    if (!el.gardenVisitor) return;
    const visitor = state.social?.currentVisitor;
    const active = visitor && Number(visitor.expiresAt) > now();
    el.gardenVisitor.hidden = !active;
    if (!active) return;
    const visual = getPetVisualState(visitor, { sleeping: false, sick: false, resting: false, low: false, behavior: "", context:"den" });
    el.gardenVisitor.dataset.baseClass = "garden-visitor";
    applyPetVisualToNodes(visual, { sprite: el.visitorSprite, accessory: el.visitorAccessory, actor: el.gardenVisitor });
    el.visitorSprite.alt = `${visitor.name || "Guest Rizo"}, visiting Rizo`;
    el.visitorName.textContent = `${visitor.name || "GUEST RIZO"} • VISITING`;
    el.gardenVisitor.style.setProperty("--visitor-color", visual.variant.color);
  }

  function renderHabitatShelf() {
    const shelf = el.habitatScene?.querySelector(".habitat-shelf");
    if (!shelf) return;
    let row = shelf.querySelector(".shelf-trophies");
    if (!row) {
      row = document.createElement("div");
      row.className = "shelf-trophies";
      shelf.appendChild(row);
    }
    const trophies = keeperTrophies();
    const signature = trophies.map(trophy => trophy.id).join("|");
    const previousCount = Number(row.dataset.count || 0);
    shelf.classList.toggle("has-trophies", trophies.length > 0);
    if (row.dataset.signature === signature) return;
    row.dataset.signature = signature;
    row.dataset.count = String(trophies.length);
    row.innerHTML = trophies.map((trophy,index) => `<span class="shelf-trophy trophy-${trophy.id} ${index === trophies.length - 1 ? "newest" : ""}" style="--trophy-color:${trophy.color};--trophy-delay:${index * .13}s" title="${escapeHTML(trophy.name)}"><i>${trophy.icon}</i><u></u></span>`).join("");
    if (trophies.length > previousCount) {
      row.classList.remove("trophy-award");
      void row.offsetWidth;
      row.classList.add("trophy-award");
      setTimeout(() => row.classList.remove("trophy-award"), 1500);
    }
  }

  function renderGardenGrowth() {
    const host = $("#gardenGrowth");
    if (!host) return;
    const pet = state.pet;
    if (pet.stage === "egg") {
      host.innerHTML = `<button class="growth-overview egg" data-open-growth type="button"><span>GENETICS SEALED</span><b>HATCH TO REVEAL POTENTIAL</b><small>The shell already contains bounded traits.</small></button>${keeperPathCompactMarkup()}`;
      return;
    }
    const align = alignmentInfo(pet);
    const form = displayFormInfo(pet);
    const top = [...SKILLS].sort((a,b)=>(pet.skills[b.id]||0)-(pet.skills[a.id]||0))[0];
    host.innerHTML = `<button class="growth-overview" data-open-growth type="button" style="--align:${align.color}"><span>${align.icon} ${align.name} • GEN ${pet.generation || 1}</span><b>${form.name}</b><small>${top.icon} ${top.name} ${Math.floor(pet.skills[top.id]||0)} / ${Math.floor(pet.genes[top.id]||100)} • TAP FOR GENETICS</small></button>
      <div class="skill-mini-row">${SKILLS.map(skill=>`<i title="${skill.name}"><u style="height:${clamp((pet.skills[skill.id]||0)/(pet.genes[skill.id]||100)*100)}%;background:${skill.color}"></u><b>${skill.icon}</b></i>`).join("")}</div>${keeperPathCompactMarkup()}`;
  }

  function renderArcade() {
    // Personal bests and their labels both come from ARCADE_GAMES, so the board
    // can never show an engineering id where a product name belongs. Defense
    // reports a wave, not a point total, and is marked as such.
    for(const mode of ARCADE_MODES){
      const cell=$(`[data-arcade-best="${mode}"]`);
      if(!cell)continue;
      const value=cell.querySelector("b"),label=cell.querySelector("span");
      if(value)value.textContent=arcadeBestValue(mode);
      if(label)label.textContent=ARCADE_GAMES[mode].best==="wave"?`${ARCADE_GAMES[mode].name} • WAVE`:ARCADE_GAMES[mode].name;
      cell.classList.toggle("score-cell-wave",ARCADE_GAMES[mode].best==="wave");
    }
    // The decision is made on the shelf, so put the decision information there:
    // what you have already done, what it costs, and how long it takes.
    for(const mode of ARCADE_MODES){
      const meta=$(`[data-arcade-meta="${mode}"]`);
      if(!meta)continue;
      const game=ARCADE_GAMES[mode],affordable=(state.pet?.energy??0)>=game.energy;
      meta.innerHTML=`<span class="meta-best"><small>${arcadeBestLabel(mode)}</small><b>${arcadeBestValue(mode)}</b></span>`
        +`<span class="meta-energy${affordable?"":" short"}"><small>ENERGY</small><b>${game.energy}</b></span>`
        +`<span class="meta-length"><small>RUN</small><b>${arcadeRunLength(mode)}</b></span>`;
    }
    const defenseCard = $(".defense-card");
    if (defenseCard) {
      let badge = defenseCard.querySelector(".defense-milestone-badge");
      const milestones = Array.isArray(state.scores.defenseMilestones) ? state.scores.defenseMilestones : [];
      const bestMilestone = milestones[milestones.length - 1] || 0;
      if (bestMilestone) {
        if (!badge) { badge = document.createElement("i"); badge.className = "defense-milestone-badge"; defenseCard.appendChild(badge); }
        badge.textContent = `W${bestMilestone}`;
        badge.title = `Defense milestone: wave ${bestMilestone}`;
      } else badge?.remove();
    }
    $$('[data-minigame]').forEach(button => {
      const mode = button.dataset.minigame;
      const need = miniEnergyNeeded(mode);
      const blocked = state.pet.stage === "egg" || state.pet.resting || state.pet.sleeping || state.pet.energy < need;
      const base = ({power:"PUNCH",spark:"CHASE",forage:"FORAGE",rush:"RUN",walk:"WALK",rhythm:"PLAY",memory:"REMEMBER",glide:"FLY",breaker:"BREAK",maze:"RUN",defense:"DEFEND"})[mode] || "PLAY";
      button.classList.toggle("game-blocked", blocked);
      button.textContent = state.pet.stage === "egg" ? "HATCH FIRST" : state.pet.resting ? "RECOVERING" : state.pet.sleeping ? "WAKE RIZO" : state.pet.energy < need ? `NEED ${need} ENERGY` : base;
      button.title = blocked ? "Tap for the exact reason this run cannot start yet." : `Start ${mode}.`;
    });
  }

  function renderCloset() {
    const pet = state.pet;
    const variant = currentVariant();
    const isEgg = pet.stage === "egg";
    if (isEgg) {
      el.closetActor.className = "pet-actor preview-actor stage-spark";
      el.closetActor.style.setProperty("--pet-color", VARIANTS[0].color);
      el.closetActor.style.setProperty("--pet-sprite", `url("${VARIANTS[0].sprite}")`);
      el.closetSprite.src = "./assets/rizo-classic.png";
      el.closetSprite.style.filter = "brightness(0) opacity(.24)";
      renderWearableToNode(el.closetAccessory, getPetVisualState(pet, { accessory:"none", context:"closet" }));
    } else {
      const visual = getPetVisualState(pet, { context:"closet" });
      el.closetSprite.style.filter = "";
      applyPetVisualToNodes(visual, { sprite: el.closetSprite, accessory: el.closetAccessory, actor: el.closetActor });
    }
    el.closetName.textContent = isEgg ? "MYSTERY EGG" : pet.name;
    el.closetVariant.textContent = isEgg ? "HATCH TO REVEAL" : variant.name;
    renderShopList();
  }

  function renderShopList() {
    if (!el.shopList) return;
    if (shopTab === "wear") {
      el.shopList.innerHTML = ACCESSORIES.map(item => {
        const owned = state.inventory.accessories.includes(item.id);
        const equipped = state.pet.accessory === item.id;
        const shortOnEmbers = !owned && state.wallet.embers < item.cost;
        const rarityTag = item.id !== "none" ? `<span class="rarity-tag rarity-tag-${item.rarity}">${item.rarity.toUpperCase()}</span>` : "";
        const preview = state.pet.stage === "egg" ? `<div class="shop-item-icon">${item.icon}</div>` : `<div class="shop-pet-preview">${petMarkup({extraClass:"shop-preview-pet",overrides:{accessory:item.id},id:null,label:`${state.pet.name} wearing ${item.name}`})}</div>`;
        return `<article class="shop-item rarity-card-${item.rarity}">${preview}<div><h3>${item.name} ${rarityTag}</h3><p>${item.description}</p></div><button class="${owned ? "owned" : ""} ${shortOnEmbers ? "short-on-embers" : ""}" data-buy-accessory="${item.id}" ${equipped ? "disabled" : ""} title="${shortOnEmbers ? "Not enough Embers yet" : equipped ? "Currently equipped" : owned ? "Equip " + item.name : "Buy " + item.name}">${equipped ? "EQUIPPED" : owned ? "EQUIP" : `R ${item.cost}`}</button></article>`;
      }).join("");
    } else if (shopTab === "rooms") {
      el.shopList.innerHTML = ROOMS.map(item => {
        const owned = state.inventory.rooms.includes(item.id);
        const equipped = state.pet.room === item.id;
        const shortOnEmbers = !owned && state.wallet.embers < item.cost;
        return `<article class="shop-item room-shop-card"><div class="room-swatch ${item.className}"><span>${item.icon}</span><i></i></div><div><h3>${item.name}</h3><p>${item.description}</p></div><button class="${owned ? "owned" : ""} ${shortOnEmbers ? "short-on-embers" : ""}" data-buy-room="${item.id}" ${equipped ? "disabled" : ""} title="${shortOnEmbers ? "Not enough Embers yet" : equipped ? "Current room" : owned ? "Use " + item.name : "Buy " + item.name}">${equipped ? "ACTIVE" : owned ? "USE" : `R ${item.cost}`}</button></article>`;
      }).join("");
    } else {
      el.shopList.innerHTML = BOOSTS.filter(item => !item.futureAd || CONFIG.ads.enabled).map(item => {
        if (item.futureAd) {
          return `<article class="shop-item"><div class="shop-item-icon">${item.icon}</div><div><h3>${item.name}</h3><p>${item.description}</p></div><button data-ad-reward="care">WATCH</button></article>`;
        }
        const quantity = state.inventory[item.id] || 0;
        const shortOnEmbers = state.wallet.embers < item.cost;
        return `<article class="shop-item"><div class="shop-item-icon">${item.icon}</div><div><h3>${item.name}</h3><p>${item.description} • OWNED ${quantity}</p></div><button class="${shortOnEmbers ? "short-on-embers" : ""}" data-buy-boost="${item.id}" title="${shortOnEmbers ? "Not enough Embers yet" : "Buy " + item.name}">R ${item.cost}</button></article>`;
      }).join("");
    }
  }

  function renderJournal() {
    const pet = state.pet;
    const variant = currentVariant();
    if (pet.stage === "egg") {
      el.profileActor.className = "mini-pet profile-pet stage-spark";
      el.profileSprite.src = VARIANTS[0].sprite;
      el.profileSprite.style.filter = "brightness(0) opacity(.3)";
      renderWearableToNode(el.profileAccessory, getPetVisualState(pet, { accessory:"none", context:"card" }));
    } else {
      el.profileSprite.style.filter = "";
      applyPetVisualToNodes(getPetVisualState(pet, { context:"card" }), { sprite: el.profileSprite, accessory: el.profileAccessory, actor: el.profileActor });
    }
    el.profileRarity.textContent = pet.stage === "egg" ? "MYSTERY" : `${variant.rarity} • ${pet.stage.toUpperCase()}`;
    el.profileName.textContent = pet.stage === "egg" ? "MYSTERY EGG" : pet.name;
    const formInfo = displayFormInfo(pet);
    el.profileBio.textContent = pet.stage === "egg" ? "Found in the rain. Future unclear." : `Gen ${pet.generation || 1} • ${petAgeText()} • ${formInfo.name} • ${pet.personality || "MYSTERY"} • ${Math.floor(pet.bond)} bond`;

    if (journalTab === "stats") renderJournalStats();
    if (journalTab === "collection") renderJournalCollection();
    if (journalTab === "memories") renderJournalMemories();
    if (journalTab === "settings") renderJournalSettings();
  }

  function renderJournalStats() {
    const pet = state.pet;
    const unlocked = ACHIEVEMENTS.filter(item => state.achievements.includes(item.id)).length;
    const align = alignmentInfo(pet);
    const form = displayFormInfo(pet);
    const stage = currentStage();
    const evolution = evolutionRequirements(stage);
    el.journalContent.innerHTML = `<div class="journal-panel">
      <section class="stat-board evolution-board"><div class="evolution-head"><div><small>RAISED, NOT RANDOM</small><h3>${form.name}</h3><p>${form.copy}</p></div><span style="--align:${align.color}">${align.icon} ${align.name}</span></div><div class="alignment-track"><i style="left:${clamp((pet.alignment+100)/2)}%"></i></div><div class="evolution-copy">${stage?.nextXP === Infinity ? (pet.elder ? "LEGACY EGG IS READY." : "MAX STAGE. KEEP BUILDING BOND FOR REBIRTH.") : `NEXT: ${evolution.next?.name} • ${evolution.missing}`}</div></section>
      <section class="stat-board"><h3>APTITUDES + GENETIC CAPS</h3><p class="board-note">Games train specific stats. The right number is this Rizo's inherited cap.</p><div class="aptitude-list">${SKILLS.map(skill=>aptitudeHTML(skill, pet)).join("")}</div></section>
      <section class="stat-board"><h3>CURRENT RIZO</h3><div class="stat-list">
        <div class="stat-tile"><b>${pet.stage === "egg" ? 0 : levelForXP(pet.xp)}</b><span>LEVEL</span></div>
        <div class="stat-tile"><b>${pet.generation || 1}</b><span>GENERATION</span></div>
        <div class="stat-tile"><b>${Math.floor(pet.bond)}</b><span>BOND</span></div>
        <div class="stat-tile"><b>${Math.floor(skillTotal(pet))}</b><span>TRAINING</span></div>
      </div><div class="pet-vitals">
        ${vitalHTML("HEALTH", pet.health)}${vitalHTML("FULL", pet.hunger)}${vitalHTML("HAPPY", pet.mood)}${vitalHTML("ENERGY", pet.energy)}${vitalHTML("CLEAN", pet.hygiene)}
      </div></section>
      ${keeperPathJournalMarkup()}
      ${keeperTrophyJournalMarkup()}
      <section class="stat-board"><h3>KEEPER RECORD</h3><div class="stat-list">
        <div class="stat-tile"><b>${formatNumber(state.meta.totalTaps)}</b><span>TAPS</span></div>
        <div class="stat-tile"><b>${state.meta.totalHatched}</b><span>HATCHED</span></div>
        <div class="stat-tile"><b>${state.meta.rebirths || 0}</b><span>REBIRTHS</span></div>
        <div class="stat-tile"><b>${state.meta.bondEggs || 0}</b><span>BOND EGGS</span></div>
        <div class="stat-tile"><b>${state.meta.recoveries || 0}</b><span>RECOVERIES</span></div>
        <div class="stat-tile"><b>${state.player.streak}</b><span>DAY STREAK</span></div><div class="stat-tile"><b>${state.season.level}</b><span>HEAT LEVEL</span></div><div class="stat-tile"><b>${formatNumber(state.wallet.shards)}</b><span>SHARDS</span></div><div class="stat-tile"><b>${state.meta.capsules}</b><span>CAPSULES</span></div>
        <div class="stat-tile"><b>${state.meta.totalWalks || 0}</b><span>WALKS</span></div><div class="stat-tile"><b>${Object.values(state.treasures || {}).filter(Boolean).length}/${WALK_TREASURES.length}</b><span>TREASURES</span></div>
        <div class="stat-tile"><b>${unlocked}/${ACHIEVEMENTS.length}</b><span>BADGES</span></div>
      </div></section>
      <section class="stat-board"><h3>BADGES</h3><div class="badge-list">${ACHIEVEMENTS.map(item => `<article class="badge-card ${state.achievements.includes(item.id) ? "unlocked" : ""}"><div class="badge-icon">${item.icon}</div><div><h3>${item.name}</h3><p>${item.description} • R ${item.reward}</p></div></article>`).join("")}</div></section>
    </div>`;
  }

  function aptitudeHTML(skill, pet = state.pet) {
    const value = pet.skills?.[skill.id] || 0;
    const cap = pet.genes?.[skill.id] || 100;
    return `<div class="aptitude-row"><span style="color:${skill.color}">${skill.icon}</span><div><b>${skill.name}</b><small>${skill.games}</small><i><u style="width:${clamp(value/cap*100)}%;background:${skill.color}"></u></i></div><strong>${Math.floor(value)}<em>/${Math.floor(cap)}</em></strong></div>`;
  }

  function vitalHTML(label, value) {
    return `<div class="vital-row"><span>${label}</span><i><u style="width:${clamp(value)}%;background:${needColor(value)}"></u></i><b>${Math.floor(value)}</b></div>`;
  }

  function renderJournalCollection() {
    const pity = Math.min(50, state.meta.pity || 0);
    const discovered = Object.keys(state.collection || {}).filter(key => state.collection[key] > 0).length;
    const capsulePanel = houseIsUnlocked()
      ? `<section class="capsule-machine"><small>RIZO ADOPTION NETWORK</small><h2>A NEW RIZO IS A REAL COMMITMENT.</h2><p>Every paid capsule creates a living Rizo and places it into the first open House room. Rooms only hold three. No space means no purchase.</p><div class="capsule-wallet"><span>EMBERS <b>R ${formatNumber(state.wallet.embers)}</b></span><span>PRISM SHARDS <b>◇ ${formatNumber(state.wallet.shards)}</b></span><span>HOUSE <b>${state.farm.roster.length}/${state.farm.unlockedRooms.length * HOUSE_ROOM_CAPACITY}</b></span></div><div class="capsule-actions"><button data-capsule="standard">MYSTERY RIZO<br>R ${HOUSE_ADOPTION_COST}</button><button data-capsule="prism">PRISM RIZO<br>R 6000</button></div><div class="pity-track"><i style="width:${pity / 50 * 100}%"></i></div><div class="sheet-note">EVERY PURCHASE ADDS A REAL HOUSE RESIDENT • SECRET PITY ${pity}/50 • PRISM HAS STRONGER ODDS</div></section>`
      : `<section class="capsule-machine house-network-locked"><small>RIZO ADOPTION NETWORK</small><h2>THE NETWORK IS STILL LOCKED.</h2><p>Raise your first Rizo to Level ${HOUSE_UNLOCK_LEVEL} and finish the Keeper Basics. The House and paid adoption system open together.</p><div class="house-lock-progress"><i style="width:${clamp(state.pet.xp / HOUSE_UNLOCK_XP * 100)}%"></i></div><div class="sheet-note">CURRENT LEVEL ${levelForXP(state.pet.xp)} / ${HOUSE_UNLOCK_LEVEL} • ${state.player.tutorialStep >= 5 || state.player.tutorialDismissed ? "KEEPER BASICS COMPLETE" : "FINISH KEEPER BASICS"}</div></section>`;
    el.journalContent.innerHTML = `<div class="journal-panel">
      ${capsulePanel}
      <div class="collection-grid">${VARIANTS.map(item => {
        const count = state.collection[item.id] || 0;
        const tier = rarityTier(item.rarity);
        const cls = tier === "SECRET" ? "secret" : tier === "LEGENDARY" ? "legendary" : "";
        const selected = state.garden.nextEggVariant === item.id;
        return `<article class="collection-card variant-${item.id} ${count ? "" : "locked"} ${cls} ${selected ? "resonating" : ""}"><span class="rarity-pill ${tier.toLowerCase()}">${item.rarity}</span><img src="${item.sprite}" alt=""><strong>${count ? item.name : "???"}</strong><span>${count ? `DISCOVERED ${count}×` : item.source || "NOT DISCOVERED"}</span>${count ? `<button class="resonance-button" data-resonance="${item.id}" type="button">${selected ? "NEXT EGG SELECTED" : "RESONATE NEXT EGG"}</button>` : ""}</article>`;
      }).join("")}</div><div class="sheet-note">CAPSULE ODDS ARE WEIGHTED • RETRO IS ARCADE-LINKED • SHADOW CAN ONLY CHOOSE YOU IN THE DEEP FOREST<br><br>DISCOVERED RIZOS CAN RESONATE WITH YOUR NEXT LEGACY EGG, MAKING COLLECTIONS PART OF YOUR LINEAGE.</div>
      <div class="sheet-section-title">WALK TREASURES • ${Object.values(state.treasures).filter(Boolean).length}/${WALK_TREASURES.length}</div>
      <div class="treasure-grid">${WALK_TREASURES.map(item => { const count=state.treasures[item.id]||0; return `<article class="treasure-card ${count?"":"locked"}"><b>${count?item.icon:"?"}</b><strong>${count?item.name:"UNKNOWN FIND"}</strong><span>${count?`${item.rarity} • ${count}×`:"FIND IT ON A WALK"}</span></article>`; }).join("")}</div>
      </div>`;
  }

  function renderJournalMemories() {
    const memories = state.memories.length ? state.memories : [{ icon: "☂", title: "THE EGG IN THE RAIN", text: "You found something impossible and took it home.", at: state.player.createdAt }];
    el.journalContent.innerHTML = `<div class="journal-panel"><div class="memory-list">${memories.map(item => `<article class="memory-card"><div class="memory-icon">${item.icon || "✦"}</div><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.text)}</p><time>${new Date(item.at).toLocaleString()}</time></div></article>`).join("")}</div><div class="sheet-section-title">FOREST ARCHIVE • ${state.loreUnlocked.length}/${LORE_FRAGMENTS.length}</div><div class="lore-archive">${LORE_FRAGMENTS.map((item,index)=>{const open=state.loreUnlocked.includes(item.id);return `<article class="lore-fragment ${open?"":"locked"}"><small>FRAGMENT ${String(index+1).padStart(2,"0")}</small><h3>${open?item.title:"LOCKED SIGNAL"}</h3><p>${open?item.text:"Find this fragment through capsules, growth, and expeditions."}</p></article>`}).join("")}</div></div>`;
  }

  function renderJournalSettings() {
    el.journalContent.innerHTML = `<div class="journal-panel">
      <section class="settings-board"><h3>GAME SETTINGS</h3>
        ${toggleRow("SOUND EFFECTS", "Tiny bleeps, reactions, and arcade feedback.", "sound", state.settings.sound)}
        ${volumeRow("SFX VOLUME", "Adjust reaction and Arcade feedback volume.", "soundVolume", state.settings.soundVolume)}
        ${toggleRow("MUSIC", "Procedural chiptune themes that change by room and game.", "music", state.settings.music)}
        ${volumeRow("MUSIC VOLUME", "Adjust Den, House, Arcade, and Ember Beat music.", "musicVolume", state.settings.musicVolume)}
        ${toggleRow("HAPTICS", "Phone vibrations where supported.", "haptics", state.settings.haptics)}
        ${toggleRow("REDUCED MOTION", "Cuts most animation.", "reducedMotion", state.settings.reducedMotion)}
        ${toggleRow("FIELD SIGNATURES", "Shows mastery-earned tower marks, trails, impact sigils, and restrained attack tones. Cosmetic only.", "defenseSignatures", state.settings.defenseSignatures)}
        ${toggleRow("AUTO WAVES", "Off by default. When enabled, a cleared field waits about 2.8 seconds before the next wave; opening a planning interaction resets the countdown.", "defenseAutoStart", state.settings.defenseAutoStart)}
        ${choiceRow("DEFENSE EFFECTS", "AUTO protects frame pacing. FULL preserves decoration until emergency load. LOW always minimizes particles.", "defenseFx", state.settings.defenseFx, [["auto","AUTO"],["full","FULL"],["low","LOW"]])}
        ${choiceRow("BATTLEFIELD UI", "Changes Defense HUD and control size without changing the playfield or hit logic.", "defenseUiScale", state.settings.defenseUiScale, [["compact","COMPACT"],["standard","STANDARD"],["large","LARGE"]])}
        ${choiceRow("WAVE INTEL", "SIMPLE gives only a useful warning. FULL shows counts. OFF keeps the battlefield clean.", "defenseWaveIntel", state.settings.defenseWaveIntel, [["off","OFF"],["simple","SIMPLE"],["full","FULL"]])}
      </section>
      <section class="settings-board"><h3>HOW TO KEEP RIZO ALIVE</h3><div class="sheet-note">Replay the care guide whenever the need meters or growth systems stop making sense.</div><button class="wide-button" data-open-care-guide>OPEN KEEPER GUIDE</button></section>
      <section class="settings-board"><h3>THIS DEVICE IS YOUR LOGIN</h3><p class="keeper-code">${state.player.keeperId}</p><div class="sheet-note">Progress lives in this browser. Copy a complete Keeper Code before switching phones or clearing website data.</div><div class="settings-actions"><button data-copy-keeper>COPY ID</button><button data-copy-recovery>COPY KEEPER CODE</button><button data-open-recovery>PASTE KEEPER CODE</button>${CONFIG.cloud.enabled ? '<button data-cloud-sync>SYNC NOW</button>' : '<button data-export-save>DOWNLOAD JSON</button>'}</div></section>
      <section class="settings-board"><h3>RIZO APPAREL</h3><div class="sheet-note">Rizo Life is made by Rizo Apparel. The game is free; the clothes are extremely real.</div><a class="wide-button" style="display:block;text-align:center;text-decoration:none" href="${escapeHTML(storeUrl())}" target="_blank" rel="noopener">SHOP RIZO.STORE ↗</a></section>
      <section class="settings-board"><h3>INSTALL + UPDATES</h3><div class="sheet-note">${window.RizoInstall?.isStandalone?.() ? "Installed app mode is active." : "Install Rizo.game for fullscreen play and faster return visits."}<br><br><b>BUILD ${escapeHTML(RIZO_RUNTIME_BUILD)}</b> • ${releaseUpdateReady?"A newer build is waiting.":"Refresh Latest checks the network and replaces stale app caches."}${mini?.active&&mini.mode==="defense"?" Your active Defense run will checkpoint first.":""}</div><div class="settings-actions"><button data-show-install>INSTALL HELP</button><button class="update-refresh-button" data-refresh-latest>${releaseUpdateReady?"UPDATE NOW":"REFRESH LATEST"}</button><button data-ad-reward="care" ${CONFIG.ads.enabled ? "" : "disabled"}>${CONFIG.ads.enabled ? "REWARDED CARE" : "ADS NOT READY"}</button></div><div class="rizo-legal-links"><a href="./about.html">ABOUT</a><a href="./privacy.html">PRIVACY</a><a href="./terms.html">TERMS</a><a href="./support.html">SUPPORT</a></div></section>
      <section class="settings-board"><h3>SAVE TOOLS</h3><div class="settings-actions"><button data-export-save>EXPORT SAVE</button><button data-import-save>IMPORT SAVE</button><button data-replay-origin>REPLAY ORIGIN</button><button data-copy-summary>COPY STATS</button></div><button class="wide-button danger" data-reset-save>DELETE THE ENTIRE TIMELINE</button></section>
    </div>`;
  }

  function toggleRow(title, copy, key, checked) {
    return `<label class="setting-row"><span>${title}<small>${copy}</small></span><input class="toggle" type="checkbox" data-setting="${key}" ${checked ? "checked" : ""}></label>`;
  }

  function volumeRow(title, copy, key, value) {
    const percent = Math.round(clamp(Number(value ?? .85), 0, 1) * 100);
    return `<label class="setting-row volume-setting"><span>${title}<small>${copy}</small></span><span class="volume-control"><input aria-label="${title}" type="range" min="0" max="100" step="5" value="${percent}" data-volume-setting="${key}"><b data-volume-value="${key}">${percent}%</b></span></label>`;
  }

  function choiceRow(title, copy, key, value, choices) {
    return `<div class="setting-row setting-choice-row"><span>${title}<small>${copy}</small></span><span class="setting-choice-control" role="group" aria-label="${escapeHTML(title)}">${choices.map(([id,label])=>`<button type="button" data-setting-choice="${escapeHTML(key)}:${escapeHTML(id)}" class="${value===id?"active":""}" aria-pressed="${value===id}">${escapeHTML(label)}</button>`).join("")}</span></div>`;
  }

  function renderTutorial() {
    const step = state.player.tutorialStep;
    document.querySelectorAll(".tutorial-focus").forEach(node => node.classList.remove("tutorial-focus"));
    if (state.player.tutorialDismissed || step >= 5 || !state.introSeen) {
      el.tutorialBanner.hidden = true;
      return;
    }
    const instructions = [
      "Tap the egg until it hatches. The four need meters stay protected during its first twelve hours.",
      "Name your Rizo. After that, the Keeper Guide explains what happens when needs are ignored.",
      "Tap FEED, then drag a snack onto Rizo. Full, energy, clean, and happy keep falling while you are away.",
      "Finish one Arcade game. Games build XP and bond, but exhausted or sick Rizos cannot play.",
      "Open the Journal to see health, growth, memories, and save tools. Rizo House unlocks at Level 4."
    ];
    const targets = [el.petTapTarget, null, document.querySelector('[data-action="feed"]'), document.querySelector('[data-nav="arcade"]'), document.querySelector('[data-nav="journal"]')];
    targets[step]?.classList.add("tutorial-focus");
    el.tutorialBanner.hidden = false;
    el.tutorialStepBadge.textContent = String(step + 1).padStart(2, "0");
    el.tutorialText.textContent = instructions[step];
  }

  function refreshAdSlots() {
    $$("[data-ad-slot]").forEach(slot => {
      const placement = slot.dataset.adSlot;
      slot.hidden = !CONFIG.ads.enabled;
      if (CONFIG.ads.enabled) AdBridge.mountBanner(placement, slot);
    });
  }

  function clearToasts() {
    el.toastStack.replaceChildren();
  }

  function changeView(view) {
    clearToasts();
    currentView = view;
    $$(".view").forEach(section => section.classList.toggle("active", section.dataset.view === view));
    $$("[data-nav]").forEach(button => { const active = button.dataset.nav === view; button.classList.toggle("active", active); button.setAttribute("aria-current", active ? "page" : "false"); });
    window.scrollTo({ top: 0, behavior: state.settings.reducedMotion ? "auto" : "smooth" });
    renderSharedUI();
    renderCurrentView();
    refreshAdSlots();
    syncMusic();
    if (view === "home") schedulePetBehavior(3500);
    if (view === "journal" && state.player.tutorialStep === 4) {
      state.player.tutorialStep = 5;
      addMemory("TUTORIAL COMPLETE", "You learned the basics. Rizo is now legally your problem.", "✓");
      toast("TUTORIAL COMPLETE • +R 25");
      state.wallet.embers += 25;
      saveState();
      renderAll();
    }
  }

  function openSheet(kicker, title, html) {
    cancelFoodDrag();
    document.body.classList.remove("feed-mode");
    el.bottomSheet.classList.remove("feed-sheet");
    el.petTapTarget?.classList.remove("feed-target-ready", "feed-drop-over");
    clearToasts();
    lastOverlayFocus = document.activeElement;
    el.sheetKicker.textContent = kicker;
    el.sheetTitle.textContent = title;
    el.sheetBody.innerHTML = html;
    el.sheetBackdrop.classList.add("show");
    el.bottomSheet.classList.add("show");
    el.bottomSheet.inert = false;
    el.bottomSheet.setAttribute("aria-hidden", "false");
    syncUILock();
    requestAnimationFrame(() => el.sheetClose.focus({ preventScroll: true }));
  }

  function closeSheet() {
    cancelFoodDrag();
    document.body.classList.remove("feed-mode");
    el.bottomSheet.classList.remove("feed-sheet");
    el.petTapTarget?.classList.remove("feed-target-ready", "feed-drop-over");
    el.sheetBackdrop.classList.remove("show");
    el.bottomSheet.classList.remove("show");
    el.bottomSheet.inert = true;
    el.bottomSheet.setAttribute("aria-hidden", "true");
    syncUILock();
    if (lastOverlayFocus?.isConnected) lastOverlayFocus.focus({ preventScroll: true });
  }

  function openNeedAction(need) {
    const pet = state.pet;
    if (pet.stage === "egg") { toast("HATCH THE EGG FIRST"); return; }
    if (!pet.alive) return;
    if (need === "hunger") { openFoodSheet(); return; }
    if (need === "mood") { openPlaySheet(); return; }
    if (need === "hygiene") { cleanPet(); return; }
    if (need === "energy") {
      if (pet.sleeping) { toggleSleep(); return; }
      openSheet("CARE DECK", "REST & RECHARGE", `
        <article class="sheet-card"><div class="sheet-card-icon">☾</div><div><h3>GO TO SLEEP</h3><p>Energy recovers while Rizo sleeps, even after you close the game.</p></div><button data-more-action="sleep">SLEEP</button></article>
        <article class="sheet-card"><div class="sheet-card-icon">♥</div><div><h3>USE CARE PACKAGE</h3><p>Owned: ${state.inventory.care || 0}. Instantly restores energy and every other need.</p></div><button data-use-boost="care" ${(state.inventory.care || 0) < 1 ? "disabled" : ""}>USE</button></article>`);
    }
  }

  function openFoodSheet() {
    if (!canCare()) return;
    if (currentView !== "home") changeView("home");
    // Physical feeding needs both the tray and Rizo on screen at once. The care
    // deck sits below the Den, so return to the scene before opening the tray.
    window.scrollTo({ top: 0, behavior: "auto" });
    const pet = state.pet;
    const cards = FOODS.map(food => {
      const cooldownLeft = food.cooldown ? Math.max(0, food.cooldown - (now() - (pet.lastFreeSnack || 0))) : 0;
      const coolingDown = cooldownLeft > 0;
      const shortOnEmbers = state.wallet.embers < food.cost;
      const label = cooldownLeft > 0 ? `${Math.ceil(cooldownLeft / 60000)}M` : food.cost ? `R ${food.cost}` : "FREE";
      return `<button type="button" class="feed-drag-card ${shortOnEmbers ? "short-on-embers" : ""}" data-food-drag="${food.id}" ${coolingDown ? "disabled" : ""} aria-label="Drag ${escapeHTML(food.name)} onto Rizo or tap to feed"><span class="feed-drag-icon">${food.icon}</span><span><b>${escapeHTML(food.name)}</b><small>${escapeHTML(food.description)}</small></span><em>${label}</em></button>`;
    }).join("");
    openSheet("PHYSICAL CARE", "DRAG FOOD TO RIZO", `<div class="feed-instruction"><b>HOLD + DRAG</b><span>Drop a snack directly on ${escapeHTML(pet.name)}. Tapping a snack still works.</span></div><div class="feed-drag-tray">${cards}</div>`);
    document.body.classList.add("feed-mode");
    el.bottomSheet.classList.add("feed-sheet");
    el.petTapTarget.classList.add("feed-target-ready");
  }

  function pointInsideRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function cancelFoodDrag() {
    if (!feedDrag) return;
    feedDrag.ghost?.remove();
    feedDrag.source?.classList.remove("drag-source");
    el.petTapTarget?.classList.remove("feed-drop-over");
    document.body.classList.remove("feed-dragging");
    feedDrag = null;
  }

  function beginFoodDrag(event) {
    const source = event.target.closest("[data-food-drag]");
    if (!source || source.disabled || !document.body.classList.contains("feed-mode")) return;
    event.preventDefault();
    const icon = source.querySelector(".feed-drag-icon");
    const ghost = document.createElement("div");
    ghost.className = "feed-drag-ghost";
    ghost.innerHTML = icon?.innerHTML || "🍗";
    document.body.appendChild(ghost);
    source.classList.add("drag-source");
    source.setPointerCapture?.(event.pointerId);
    feedDrag = { pointerId:event.pointerId, foodId:source.dataset.foodDrag, source, ghost, startX:event.clientX, startY:event.clientY, moved:false };
    document.body.classList.add("feed-dragging");
    moveFoodDrag(event);
    haptic(8);
  }

  function moveFoodDrag(event) {
    if (!feedDrag || event.pointerId !== feedDrag.pointerId) return;
    const dx = event.clientX - feedDrag.startX;
    const dy = event.clientY - feedDrag.startY;
    if (Math.hypot(dx, dy) > 7) feedDrag.moved = true;
    feedDrag.ghost.style.left = `${event.clientX}px`;
    feedDrag.ghost.style.top = `${event.clientY}px`;
    const over = pointInsideRect(event.clientX, event.clientY, el.petTapTarget.getBoundingClientRect());
    el.petTapTarget.classList.toggle("feed-drop-over", over);
  }

  function endFoodDrag(event, cancelled = false) {
    if (!feedDrag || event.pointerId !== feedDrag.pointerId) return;
    const drag = feedDrag;
    const over = !cancelled && pointInsideRect(event.clientX, event.clientY, el.petTapTarget.getBoundingClientRect());
    const tap = !cancelled && !drag.moved;
    feedClickBlockedUntil = now() + 450;
    cancelFoodDrag();
    if (over || tap) {
      const used = useFood(drag.foodId);
      if (used && over) animatePet("happy-jump", 520);
    } else {
      toast("DROP THE FOOD ON RIZO");
      sfx("no");
      haptic(12);
    }
  }

  function openPlaySheet() {
    openSheet("QUICK QUEUE", "PICK A CABINET", `
      <article class="sheet-card"><div class="sheet-card-icon">♥</div><div><h3>HEAD PAT</h3><p>Quick affection. +7 happy and +2 bond.</p></div><button data-head-pat>PAT</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">×</div><div><h3>POWER TAPE</h3><p>Coach calls the strike. Match JAB, BODY, or HOOK to the timing window, hold through feints, and earn Overdrive.</p></div><button data-sheet-game="power">TRAIN</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">★</div><div><h3>SPARK STASH</h3><p>Build an unbanked spark stash, choose when to cash it, and lose the risky pile if a Shadow catches your greed.</p></div><button data-sheet-game="spark">CHASE</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">⌁</div><div><h3>FOREST LUNCH</h3><p>Pack Rizo's exact lunch ticket lane by lane. Every second plate triggers a frantic Picnic Panic decision burst.</p></div><button data-sheet-game="forage">FORAGE</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">↗</div><div><h3>RIZO COURIER</h3><p>Run the rooftops, grab a parcel, then survive two clean clears to actually deliver it before you crash.</p></div><button data-sheet-game="rush">RUN</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">☂</div><div><h3>RIZO WALK</h3><p>Explore branching forest routes, weather, strange finds, and permanent treasures.</p></div><button data-sheet-game="walk">WALK</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">♫</div><div><h3>EMBER BEAT</h3><p>Match four lanes, chase Perfect timing, and unlock harder songs while Rizo builds Speed.</p></div><button data-sheet-game="rhythm">PLAY</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">▦</div><div><h3>LOST SIGNAL</h3><p>Memorize a pirate transmission while the signal mutates: reverse, opposite, rotate, then stacked corruption rules.</p></div><button data-sheet-game="memory">REMEMBER</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">⌁</div><div><h3>SKYBOUND</h3><p>Ride shifting wind and deliberately thread gate centers to charge Thermal Bursts that change the flight physics.</p></div><button data-sheet-game="glide">FLY</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">✦</div><div><h3>EMBER FORGE</h3><p>Break authored Rizo-mark walls, protect your angle, and hunt CORE blocks that collapse nearby forge pieces.</p></div><button data-sheet-game="breaker">BREAK</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">⌗</div><div><h3>RIZO RUNAWAY</h3><p>Route through the maze, bait three Shadow behaviors, then reverse the hunt with Prism Seeds.</p></div><button data-sheet-game="maze">RUN</button></article>`);
  }

  function openMoreCareSheet() {
    const pet = state.pet;
    openSheet("CARE DECK", "MORE THINGS TO DO", `
      <article class="sheet-card"><div class="sheet-card-icon">?</div><div><h3>KEEPER GUIDE</h3><p>Needs, consequences, growth, and the Level 4 House unlock.</p></div><button data-open-care-guide>OPEN</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">☁</div><div><h3>TALK</h3><p>Ask a flame creature for life advice.</p></div><button data-more-action="talk">TALK</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">💊</div><div><h3>MEDICINE</h3><p>${pet.sick ? "Rizo is sick. Medicine costs R 28." : "Rizo is not currently sick."}</p></div><button data-food="meds" ${!pet.sick || state.wallet.embers < 28 ? "disabled" : ""}>R 28</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">♥</div><div><h3>USE CARE PACKAGE</h3><p>Owned: ${state.inventory.care || 0}. Restores every need.</p></div><button data-use-boost="care" ${(state.inventory.care || 0) < 1 ? "disabled" : ""}>USE</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">⚗</div><div><h3>USE GROWTH JUICE</h3><p>Owned: ${state.inventory.growth || 0}. Adds 80 XP.</p></div><button data-use-boost="growth" ${(state.inventory.growth || 0) < 1 ? "disabled" : ""}>USE</button></article>`);
  }

  function openQuickSheet() {
    const pet = state.pet;
    openSheet("QUICK MENU", pet.stage === "egg" ? "MYSTERY EGG" : pet.name, `
      <article class="sheet-card"><div class="sheet-card-icon">✎</div><div><h3>RENAME</h3><p>Names are permanent until you change them again.</p></div><button data-open-rename ${pet.stage === "egg" ? "disabled" : ""}>EDIT</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">▤</div><div><h3>OPEN JOURNAL</h3><p>Stats, memories, collection, and save tools.</p></div><button data-open-journal>OPEN</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">↗</div><div><h3>SHARE RIZO</h3><p>Copy or share your current Rizo stats.</p></div><button data-share-rizo>SHARE</button></article>`);
  }

  function openKeeperSheet() {
    openSheet("KEEPER PROFILE", `KEEPER ${state.player.keeperId.slice(-4)}`, `
      <div class="sheet-note">This permanent ID is stored on this device. It is the hook a future account system can connect to without changing your pet save format.</div>
      <article class="sheet-card"><div class="sheet-card-icon">☂</div><div><h3>${state.player.streak} DAY STREAK</h3><p>${state.player.totalSessions} sessions since ${new Date(state.player.createdAt).toLocaleDateString()}.</p></div><button data-copy-keeper>COPY ID</button></article>
      <article class="sheet-card"><div class="sheet-card-icon">▤</div><div><h3>KEEPER JOURNAL</h3><p>Open your full record and save tools.</p></div><button data-open-journal>OPEN</button></article><article class="sheet-card"><div class="sheet-card-icon brand-sheet-icon"><img src="./assets/rizo-full-mark.png" alt=""></div><div><h3>RIZO APPAREL</h3><p>Shop real clothes from the brand behind the game.</p></div><a class="sheet-action-link" href="${escapeHTML(storeUrl())}" target="_blank" rel="noopener">SHOP ↗</a></article>`);
  }

  function showModal(html) {
    clearToasts();
    lastOverlayFocus = document.activeElement;
    el.modalOverlay.innerHTML = html;
    el.modalOverlay.classList.add("show");
    el.modalOverlay.setAttribute("aria-hidden", "false");
    syncUILock();
    requestAnimationFrame(() => el.modalOverlay.querySelector("button,input")?.focus({ preventScroll: true }));
  }

  function closeModal() {
    if (worldEventOpen) {
      worldEventOpen = false;
      state.worldEvents.lastAt = now();
      saveState();
    }
    if (activeMusicOverride && !mini.active) {
      activeMusicOverride = null;
      syncMusic(true);
    }
    el.modalOverlay.classList.remove("show");
    el.modalOverlay.setAttribute("aria-hidden", "true");
    syncUILock();
    if (lastOverlayFocus?.isConnected) lastOverlayFocus.focus({ preventScroll: true });
    setTimeout(() => {
      if (!el.modalOverlay.classList.contains("show")) {
        el.modalOverlay.innerHTML = "";
        flushPendingEvolution();
      }
    }, 220);
  }

  function showNameModal(force = false) {
    if (state.pet.stage === "egg") return;
    showModal(`<div class="modal-card rename-card"><div class="rename-pet-stage">${petMarkup({extraClass:"rename-pet",id:"renamePet"})}</div><h2>NAME YOUR RIZO</h2><p>The forest did not include paperwork.</p><div class="input-row"><input id="modalNameInput" maxlength="14" value="${escapeHTML(state.pet.name)}" autocomplete="off"><button data-save-name>SAVE</button></div>${force ? "" : '<button class="wide-button" data-close-modal>NOT NOW</button>'}</div>`);
    setTimeout(() => $("#modalNameInput")?.focus(), 80);
  }

  function showKeeperBasics(markSeen = true) {
    if (markSeen) {
      state.player.keeperGuideSeen = true;
      saveState(true);
    }
    showModal(`<div class="modal-card keeper-guide-modal"><small>KEEPER BASICS</small><h2>RIZO KEEPS LIVING WHEN YOU LEAVE.</h2><p>Needs fall in real time, even with the app closed. The first twelve hours are forgiving. After that, neglect has consequences.</p><div class="keeper-guide-grid"><article><span>🍗</span><b>FULL</b><p>Feed Rizo. Below 12, health starts falling.</p></article><article><span>⚡</span><b>ENERGY</b><p>Sleep restores energy. Exhausted Rizos cannot play.</p></article><article><span>✦</span><b>CLEAN</b><p>Below 22 clean can cause sickness. Sickness drains health.</p></article><article><span>♥</span><b>HAPPY</b><p>Play and interact. Low needs stop passive growth.</p></article></div><div class="keeper-warning"><b>HEALTH AT ZERO</b><span>Rizo enters recovery. You do not lose the pet, but recovery takes time and care.</span></div><div class="modal-buttons"><button data-close-modal>LET ME LOOK AROUND</button><button class="primary" data-start-feeding>FEED RIZO NOW</button></div></div>`);
  }

  function showOfflineSummary(summary) {
    if (!summary || !state.pet.alive || state.pet.stage === "egg") return;
    const time = summary.minutes >= 60 ? `${(summary.minutes / 60).toFixed(summary.minutes >= 600 ? 0 : 1)} HOURS` : `${Math.floor(summary.minutes)} MINUTES`;
    showModal(`<div class="modal-card"><div class="modal-art">☾</div><h2>WELCOME BACK</h2><p class="big-line">${escapeHTML(state.pet.name)} survived ${time} without supervision.</p><p>Full -${Math.floor(summary.hunger)} • Happy -${Math.floor(summary.mood)} • Clean -${Math.floor(summary.hygiene)}${summary.health > 0 ? ` • Health -${Math.floor(summary.health)}` : ""}${summary.idleGrowth > .1 ? ` • +${summary.idleGrowth.toFixed(1)} ${escapeHTML(state.pet.lastTrainedSkill || "stamina")} growth` : ""}</p><div class="modal-buttons"><button class="primary" data-close-modal>CHECK ON RIZO</button></div></div>`);
  }

  function showDailyGift() {
    if (state.daily.giftClaimed) {
      toast(`DAY ${state.player.streak} GIFT ALREADY CLAIMED`);
      return;
    }
    const reward = 35 + Math.min(65, state.player.streak * 5);
    mutate((pet, whole) => {
      whole.daily.giftClaimed = true;
      whole.wallet.embers += reward;
      pet.mood = clamp(pet.mood + 8);
    });
    addMemory("DAILY GIFT", `Day ${state.player.streak}: the app rewarded basic consistency with R ${reward}.`, "✦");
    showModal(`<div class="modal-card"><div class="modal-art">✦</div><h2>DAY ${state.player.streak}</h2><p class="big-line">YOU SHOWED UP. RIZO NOTICED.</p><p>Daily gift: R ${reward} and +8 happy.</p><div class="modal-buttons"><button class="primary" data-close-modal>TAKE IT</button></div></div>`);
    celebrate();
  }

  function claimQuest() {
    if (state.daily.claimed) { toast("DAILY MISCHIEF ALREADY CLAIMED"); return; }
    if (state.daily.progress < state.daily.target) {
      const remaining = state.daily.target - state.daily.progress;
      toast(`${remaining} MORE TO UNLOCK TODAY'S REWARD`);
      return;
    }
    mutate((pet, whole) => {
      whole.daily.claimed = true;
      whole.wallet.embers += whole.daily.reward;
      pet.xp += 12;
      pet.mood = clamp(pet.mood + 7);
    });
    toast(`DAILY COMPLETE • +R ${state.daily.reward}`);
    addMemory("DAILY MISCHIEF", `Completed: ${state.daily.title}.`, "!");
    celebrate();
  }

  function progressQuest(type, amount = 1) {
    if (state.daily.type !== type || state.daily.claimed) return;
    state.daily.progress = Math.min(state.daily.target, state.daily.progress + amount);
    if (state.daily.progress >= state.daily.target) toast("DAILY MISCHIEF READY TO CLAIM");
  }

  function useFood(id) {
    const food = FOODS.find(item => item.id === id);
    if (!food || state.pet.stage === "egg" || !state.pet.alive) return false;
    if (!canCare()) return false;
    const cooldownLeft = food.cooldown ? Math.max(0, food.cooldown - (now() - (state.pet.lastFreeSnack || 0))) : 0;
    if (cooldownLeft > 0) { toast("THE CRUMBS ARE STILL REGENERATING"); return false; }
    if (state.wallet.embers < food.cost) { toast("YOUR WALLET SAID NO"); return false; }
    const wasSick = Boolean(state.pet.sick);
    const previousServings = Number(state.pet.careProfile?.foods?.[food.id]) || 0;
    mutate((pet, whole) => {
      whole.wallet.embers -= food.cost;
      pet.hunger = clamp(pet.hunger + (food.hunger || 0));
      pet.mood = clamp(pet.mood + (food.mood || 0));
      pet.hygiene = clamp(pet.hygiene + (food.hygiene || 0));
      pet.health = clamp(pet.health + (food.health || 0));
      pet.xp += food.xp || 0;
      pet.bond = clamp(pet.bond + 1.2);
      const trait = FOOD_TRAITS[food.id] || { alignment: 0 };
      shiftAlignment(trait.alignment || 0, `food:${food.id}`);
      if (trait.skill) gainSkill(trait.skill, trait.amount || .2, { silent: true });
      pet.careProfile.foods[food.id] = (pet.careProfile.foods[food.id] || 0) + 1;
      const memory = lifeMemory();
      memory.lastFoodAt = now();
      memory.lastFoodId = food.id;
      const favoriteFood = Object.entries(pet.careProfile.foods).sort((a,b) => b[1] - a[1])[0]?.[0];
      if (pet.careProfile.foods[food.id] === 3 && favoriteFood === food.id && !memory.favoriteFoodRemembered) {
        memory.favoriteFoodRemembered = true;
        addMemory("THAT FOOD AGAIN", `${pet.name} smelled ${food.name} before you opened it.`, "●");
      }
      if (food.cure) pet.sick = false;
      if (food.calm) pet.overstimulation = 0;
      if (food.cooldown) pet.lastFreeSnack = now();
      whole.meta.totalCareActions += 1;
      earnHeat(5,false);
      progressQuest("feed");
    });
    closeSheet();
    const favoriteRepeat = previousServings >= 2 && state.pet.careProfile.foods[food.id] >= previousServings + 1;
    if (wasSick && food.cure) setLifeBehavior("recover", 1500);
    else if (favoriteRepeat) setLifeBehavior("snack-happy", 950);
    say(wasSick && food.cure ? "I AM BACK. DO NOT MAKE THIS A THING." : food.id === "crumbs" ? "I CAN TASTE THE POCKET." : food.id === "wings" ? "HOT. WORTH IT." : food.id === "meds" ? "I CAN HEAR COLORS NOW." : "FINALLY.");
    effect("hearts");
    sfx("eat");
    sensoryBurst("♥", currentVariant().color, 9);
    haptic(20);
    advanceTutorial("feed");
    return true;
  }

  const CLEAN_REWARD_COOLDOWN = 5 * 60 * 1000;
  const CLEAN_REWARD_MIN_RESTORE = 5;
  const CLEAN_ACTION_MIN_RESTORE = 2;

  function cleanPet() {
    if (!canCare()) return;
    if (100 - state.pet.hygiene < CLEAN_ACTION_MIN_RESTORE) { toast("RIZO IS ALREADY CLEAN"); return; }
    const hygieneBefore = state.pet.hygiene;
    const wasFilthy = hygieneBefore < 18;
    const washUntil = now() + 900;
    const cooldownReady = now() - (Number(state.pet.lastCleanRewardAt) || 0) >= CLEAN_REWARD_COOLDOWN;
    mutate((pet, whole) => {
      const restored = Math.min(40, 100 - pet.hygiene);
      pet.hygiene = clamp(pet.hygiene + 40);
      pet.energy = clamp(pet.energy - 3);
      if (cooldownReady && restored >= CLEAN_REWARD_MIN_RESTORE) {
        pet.mood = clamp(pet.mood + 4);
        pet.xp += 6;
        pet.bond = clamp(pet.bond + 1.5);
        shiftAlignment(2, "clean");
        gainSkill("stamina", .35, { silent: true });
        whole.meta.totalCareActions += 1;
        earnHeat(5, false);
        pet.lastCleanRewardAt = now();
      } else {
        pet.mood = clamp(pet.mood + 1);
      }
      if (pet.hygiene > 70 && Math.random() < .55) pet.sick = false;
      const memory = lifeMemory();
      memory.washFromHygiene = hygieneBefore;
      memory.washUntil = washUntil;
      memory.lastBathAt = now();
      if (wasFilthy && !memory.bathIncidentRemembered) {
        memory.filthSeen = true;
        memory.bathIncidentRemembered = true;
        addMemory("BATH INCIDENT", "The towel is not white anymore.", "✦");
      }
      progressQuest("clean");
    });
    effect("sparkles");
    setLifeBehavior("scrub", 900, "YOU MISSED A SPOT. GOOD.");
    setTimeout(() => {
      const memory = lifeMemory();
      if (memory.washUntil !== washUntil || now() < washUntil) return;
      memory.washUntil = 0;
      memory.washFromHygiene = state.pet.hygiene;
      saveState();
      setLifeBehavior("shake", 720, wasFilthy ? "THE ROOM CAN BREATHE AGAIN." : "");
      if (currentView === "home") renderHome();
      setTimeout(() => {
        const latest = lifeMemory();
        if (currentView === "home" && now() - (Number(latest.lastBathAt) || 0) >= 7000) renderHome();
      }, 6200);
    }, 920);
    sfx("clean");
    sensoryBurst("✦", "#ffffff", 12);
    haptic([18, 35, 18]);
  }

  function headPat() {
    if (!canCare()) return;
    mutate((pet, whole) => {
      pet.mood = clamp(pet.mood + 7);
      pet.bond = clamp(pet.bond + 2);
      pet.xp += 2;
      shiftAlignment(3, "head-pat");
      gainSkill("luck", .2, { silent: true });
      whole.meta.totalCareActions += 1;
      earnHeat(3,false);
    });
    closeSheet();
    effect("hearts");
    say("OKAY. ONE MORE.");
  }

  function toggleSleep() {
    const pet = state.pet;
    if (pet.stage === "egg" || !pet.alive) return;
    mutate(p => {
      p.sleeping = !p.sleeping;
      if (p.sleeping) { p.mood = clamp(p.mood + 2); shiftAlignment(1, "rest"); gainSkill("stamina", .25, { silent: true }); }
    });
    if (state.pet.sleeping) say("DO NOT LET THE APP DIE WHILE I'M OUT.");
    else setLifeBehavior("wake-grump", 1200, "I WAS DREAMING ABOUT INVENTORY.");
    sfx(state.pet.sleeping ? "sleep" : "wake");
  }

  function talkToPet() {
    if (!canCare()) return;
    const pet = state.pet;
    let line;
    if (pet.sick) line = "I FEEL LIKE A LOW-BUDGET SEQUEL.";
    else if (pet.hunger < 20) line = "I AM STARVING IN 4K.";
    else if (pet.energy < 20) line = "MY LAST TWO BRAIN CELLS CLOCKED OUT.";
    else if (pet.hygiene < 20) line = "THE SMELL IS PART OF THE BRAND NOW.";
    else if (pet.mood < 20) line = "I'M NOT MAD. I'M DEVELOPING LORE.";
    else line = TALK_LINES[Math.floor(Math.random() * TALK_LINES.length)];
    mutate(p => { p.mood = clamp(p.mood + 3); p.bond = clamp(p.bond + .8); p.xp += 1; shiftAlignment(1, "talk"); gainSkill("instinct", .15, { silent: true }); });
    closeSheet();
    say(line, 3400);
    sfx("talk");
  }

  function canCare() {
    const pet = state.pet;
    if (pet.stage === "egg") { toast("HATCH THE EGG FIRST"); return false; }
    if (!pet.alive) return false;
    if (pet.resting) { showRecoveryModal(); return false; }
    if (pet.sleeping) { toast("RIZO IS ASLEEP • WAKE THEM IN THE DEN"); sfx("no"); return false; }
    return true;
  }

  function tapPet(event) {
    const pet = state.pet;
    if (!pet.alive) return;
    if (pet.stage === "egg") {
      mutate(p => {
        p.hatch = clamp(p.hatch + 11);
        p.energy = 100;
        earnHeat(2, false);
        if (p.hatch >= 100) hatchPet();
      });
      floatText(event, "+WARM");
      sfx("egg");
      sensoryBurst("•", currentVariant().color, 5, event);
      haptic(12);
      return;
    }
    if (pet.sleeping) { say("I AM LITERALLY ASLEEP."); sfx("no"); return; }

    const time = now();
    tapHistory = tapHistory.filter(t => time - t < 2400);
    tapHistory.push(time);
    const ultraFast = tapHistory.filter(t => time - t < 700).length;
    const sustained = tapHistory.length;

    if (time < refuseUntil) {
      animatePet("head-no", 620);
      sfx("no");
      return;
    }

    if (ultraFast >= 9 && Math.random() < .34) {
      refuseUntil = time + 1050;
      state.meta.refusals += 1;
      pet.mood = clamp(pet.mood - 1.5);
      shiftAlignment(-1, "ignored-boundary");
      animatePet("head-no", 650);
      const lines = ["NOPE.","TOO MUCH FINGER.","PERSONAL SPACE, KEEPER.","I SAID TAP. NOT JACKHAMMER.","ABSOLUTELY NOT."];
      say(lines[Math.floor(Math.random()*lines.length)], 1700);
      sfx("no"); haptic([20,30,20]); saveState(); renderAll();
      return;
    }

    if (sustained >= 19 && time > overloadCooldownUntil && Math.random() < .24) {
      overloadCooldownUntil = time + 20000;
      state.meta.overloads += 1;
      mutate(p => {
        p.sick = true;
        p.overstimulation = (p.overstimulation || 0) + 1;
        p.health = clamp(p.health - 5);
        p.mood = clamp(p.mood - 9);
        p.energy = clamp(p.energy - 8);
        shiftAlignment(-4, "overstimulated");
      });
      animatePet("tap-sick-queasy", 1650);
      effect("queasy");
      document.querySelector(".habitat-card")?.classList.add("screen-shake");
      setTimeout(()=>document.querySelector(".habitat-card")?.classList.remove("screen-shake"),420);
      say("BLURGH—YOU TAPPED THE FLAME OUT OF ME.", 3000);
      toast("RIZO GOT TAP-SICK • USE MEDICINE OR CALMING FIZZ");
      sfx("sick"); haptic([45,35,45]);
      sensoryBurst("⌁", "#d8ff78", 10, event);
      setTimeout(() => sensoryBurst("×", "#9eff75", 8, event), 160);
      return;
    }

    combo = time - lastTapAt < 620 ? Math.min(99, combo + 1) : 1;
    lastTapAt = time;
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { combo = 0; el.tapCombo.classList.remove("show"); }, 900);
    const multiplier = 1 + Math.floor(combo / 12);
    const jackpot = Math.random() < Math.min(.035, .006 + combo / 4000);
    const gain = jackpot ? multiplier * 12 : multiplier;
    mutate((p, whole) => {
      p.taps += 1;
      p.hype += gain;
      p.xp += .35 * multiplier;
      p.bond = clamp(p.bond + .08 * multiplier);
      p.mood = clamp(p.mood + .13 * multiplier);
      p.energy = clamp(p.energy - .025);
      whole.wallet.embers += gain;
      whole.meta.totalTaps += 1;
      progressQuest("tap");
      earnHeat(jackpot ? 5 : 1, false);
    });
    animatePet(jackpot ? "happy-jump" : "boing", jackpot ? 520 : 240);
    el.tapCombo.textContent = jackpot ? `JACKPOT x${combo}` : `x${combo} HYPE`;
    el.tapCombo.classList.toggle("show", combo > 1 || jackpot);
    floatText(event, jackpot ? `JACKPOT +R ${gain}` : `+R ${gain}`);
    sfx(jackpot ? "jackpot" : "tap", combo);
    sensoryBurst(jackpot ? "✦" : "+", jackpot ? "#ffd54a" : currentVariant().color, jackpot ? 18 : 3, event);
    haptic(jackpot ? [20,25,45] : 7);
    if (combo === 20) say("OKAY OKAY I GET IT.");
    else if (combo === 40) say("THIS IS BECOMING A LABOR ISSUE.");
    else if (state.meta.totalTaps % 75 === 0) say(TALK_LINES[Math.floor(Math.random() * TALK_LINES.length)]);
  }

  function hatchPet() {
    const pet = state.pet;
    if (pet.stage !== "egg") return;
    pet.stage = "spark";
    pet.variant = pet.hiddenVariant;
    pet.bornAt = now();
    pet.lastTick = now();
    pet.graceUntil = now() + 12 * 60 * 60 * 1000;
    pet.xp = 5;
    pet.bond = 5;
    pet.form = determineEvolutionForm(pet);
    state.meta.totalHatched += 1;
    state.collection[pet.variant] = (state.collection[pet.variant] || 0) + 1;
    state.meta.pity = ["golden","diamond","obsidian"].includes(pet.variant) ? 0 : (state.meta.pity || 0) + 1;
    unlockRandomLore(currentVariant().rarity === "SECRET" ? 1 : .35);
    earnHeat(currentVariant().rarity === "SECRET" ? 120 : currentVariant().rarity === "LEGENDARY" ? 70 : 30, false);
    const variant = currentVariant();
    if (variant.id === "golden") state.wallet.embers += 250;
    addMemory("HATCHED", `${pet.name} hatched as Generation ${pet.generation || 1} ${variant.name}. Its genes already favor ${dominantGene(pet).toUpperCase()}.`, "🥚");
    toast(`${variant.rarity}: ${variant.name}`);
    say(pet.shame ? "I KNOW THIS WAS THE FREE EGG." : `I'M ${variant.name}. TRY NOT TO RUIN THIS.`, 4200);
    state.player.tutorialStep = Math.max(state.player.tutorialStep, 1);
    celebrate();
    sfx(variant.rarity === "SECRET" ? "secret" : variant.rarity === "LEGENDARY" ? "legendary" : "hatch");
    sensoryBurst("✦", variant.color, variant.rarity === "SECRET" ? 35 : 20);
    haptic([45, 50, 85]);
    saveState(true);
    setTimeout(() => showNameModal(true), 1500);
  }

  function renamePet(name) {
    const clean = name.trim().replace(/[<>]/g, "").slice(0, 14).toUpperCase();
    if (!clean) { toast("RIZO NEEDS AT LEAST ONE LETTER"); return false; }
    const old = state.pet.name;
    state.pet.name = clean;
    if (old !== clean) addMemory("NEW NAME", `${old} became ${clean}. The paperwork was devastating.`, "✎");
    const shouldShowGuide = state.player.tutorialStep === 1 && !state.player.keeperGuideSeen;
    if (state.player.tutorialStep === 1) state.player.tutorialStep = 2;
    if (shouldShowGuide) state.player.keeperGuideSeen = true;
    saveState();
    renderAll();
    toast("NAME SAVED");
    if (shouldShowGuide) setTimeout(() => showKeeperBasics(false), 360);
    return true;
  }

  function buyAccessory(id) {
    const item = ACCESSORIES.find(entry => entry.id === id);
    if (!item) return;
    const owned = state.inventory.accessories.includes(id);
    const isNewUnlock = !owned;
    if (!owned) {
      if (state.wallet.embers < item.cost) { toast("YOUR WALLET SAID NO"); return; }
      state.wallet.embers -= item.cost;
      state.inventory.accessories.push(id);
      toast(`${item.name} UNLOCKED`);
    }
    state.pet.accessory = id;
    saveState();
    renderAll();
    playAccessoryReveal(item, isNewUnlock);
    accessoryMaterialSound(id);
    el.habitatScene?.classList.add("camera-reward"); setTimeout(()=>el.habitatScene?.classList.remove("camera-reward"),800);
  }

  // Rarer gear gets a bigger, longer, more colorful reveal so unlocking a
  // legendary item actually feels different from equipping a common one.
  function playAccessoryReveal(item, isNewUnlock) {
    if (item.id === "none") { effect("sparkles"); return; }
    const rarityBurst = { common: 8, rare: 14, epic: 20, legendary: 32 };
    const rarityHaptic = { common: 10, rare: [10, 15], epic: [10, 15, 20], legendary: [12, 18, 12, 24] };
    const color = ACCESSORY_RARITY_COLORS[item.rarity] || "#16c8ff";
    const count = (rarityBurst[item.rarity] || 8) * (isNewUnlock ? 1.4 : 1);
    sensoryBurst(item.rarity === "legendary" ? "★" : "✦", color, Math.round(count));
    haptic(rarityHaptic[item.rarity] || 10);
    sfx(item.rarity === "legendary" ? "reward" : "hit", isNewUnlock ? 12 : 4);
    if (el.accessoryLayer) {
      el.accessoryLayer.classList.remove("accessory-reveal");
      void el.accessoryLayer.offsetWidth;
      el.accessoryLayer.classList.add("accessory-reveal");
      setTimeout(() => el.accessoryLayer?.classList.remove("accessory-reveal"), 900);
    }
    effect("sparkles");
  }

  function buyRoom(id) {
    const item = ROOMS.find(entry => entry.id === id);
    if (!item) return;
    const owned = state.inventory.rooms.includes(id);
    if (!owned) {
      if (state.wallet.embers < item.cost) { toast("YOUR WALLET SAID NO"); return; }
      state.wallet.embers -= item.cost;
      state.inventory.rooms.push(id);
      toast(`${item.name} UNLOCKED`);
    }
    state.pet.room = id;
    saveState();
    renderAll();
  }

  function buyBoost(id) {
    const item = BOOSTS.find(entry => entry.id === id && !entry.futureAd);
    if (!item || state.wallet.embers < item.cost) { toast("NOT ENOUGH EMBERS"); return; }
    state.wallet.embers -= item.cost;
    state.inventory[id] = (state.inventory[id] || 0) + 1;
    saveState();
    renderAll();
    toast(`${item.name} ADDED`);
  }

  function useBoost(id) {
    if ((state.inventory[id] || 0) < 1 || state.pet.stage === "egg") return;
    mutate((pet, whole) => {
      whole.inventory[id] -= 1;
      if (id === "care") {
        pet.health = clamp(pet.health + 15);
        pet.hunger = clamp(pet.hunger + 30);
        pet.mood = clamp(pet.mood + 30);
        pet.energy = clamp(pet.energy + 30);
        pet.hygiene = clamp(pet.hygiene + 30);
        pet.sick = false;
      }
      if (id === "growth") pet.xp += 80;
    });
    closeSheet();
    effect("sparkles");
    say(id === "care" ? "I FEEL EXPENSIVELY CARED FOR." : "I CAN FEEL MY LORE EXPANDING.");
  }

  async function useAdReward(kind) {
    const completed = await AdBridge.showRewarded(kind === "revive" ? "death-revive" : "care-boost");
    if (!completed) {
      toast(CONFIG.ads.enabled ? "AD DID NOT COMPLETE" : "ADS ARE NOT CONNECTED YET");
      return;
    }
    if (kind === "care") {
      mutate(pet => {
        pet.health = clamp(pet.health + 15);
        pet.hunger = clamp(pet.hunger + 25);
        pet.mood = clamp(pet.mood + 25);
        pet.energy = clamp(pet.energy + 25);
        pet.hygiene = clamp(pet.hygiene + 25);
      });
      toast("SPONSOR CARE PACKAGE DELIVERED");
    }
    if (kind === "revive") revivePet("ad");
  }


  function gardenCodePayload() {
    const pet = state.pet;
    return {
      v: 2,
      keeper: state.player.keeperId,
      pet: {
        name: pet.stage === "egg" ? "MYSTERY EGG" : pet.name,
        variant: pet.variant || pet.hiddenVariant || "classic",
        stage: pet.stage === "egg" ? "spark" : pet.stage,
        form: pet.form || "balanced",
        generation: pet.generation || 1,
        personality: pet.personality || "LOYAL WEIRDO",
        mutation: pet.mutation || "normal",
        alignment: pet.alignment || 0,
        bond: pet.bond || 0,
        genes: Object.fromEntries(SKILLS.map(skill => [skill.id, Math.round(pet.genes?.[skill.id] || 100)]).concat([["growth", Math.round(pet.genes?.growth || 100)]])),
        skills: Object.fromEntries(SKILLS.map(skill => [skill.id, Math.round(pet.skills?.[skill.id] || 0)]))
      }
    };
  }

  function encodeGardenCode(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }

  function decodeGardenCode(code) {
    const cleaned = String(code || "").trim().replace(/-/g,"+").replace(/_/g,"/");
    const padded = cleaned + "=".repeat((4 - cleaned.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function copyGardenCode() {
    if (state.pet.stage === "egg") { toast("HATCH YOUR RIZO BEFORE SHARING A GARDEN"); return; }
    const code = encodeGardenCode(gardenCodePayload());
    try { await navigator.clipboard.writeText(code); toast("GARDEN CODE COPIED"); }
    catch (error) { showModal(`<div class="modal-card"><div class="modal-art">⌁</div><h2>YOUR GARDEN CODE</h2><p>Copy this and send it to another Keeper.</p><textarea class="visit-code-output" readonly>${escapeHTML(code)}</textarea><div class="modal-buttons"><button data-close-modal class="primary">DONE</button></div></div>`); }
  }

  function openVisitSheet() {
    openSheet("KEEPER NETWORK", "VISIT A GARDEN", `<section class="visit-sheet"><div class="visit-art">⌁</div><p>Paste a Garden Code from another player. Their Rizo appears in your Den for ten minutes and leaves a small friendship reward once per day.</p><textarea id="visitCodeInput" maxlength="1600" placeholder="PASTE GARDEN CODE"></textarea><button class="wide-button" data-confirm-visit type="button">OPEN THE GARDEN GATE</button><div class="sheet-note">Codes contain only a pet snapshot and anonymous Keeper ID. They cannot overwrite your save.</div></section>`);
  }

  function showVisitorArrival(visitor) {
    const variant=VARIANTS.find(item=>item.id===visitor.variant)||VARIANTS[0];
    activeMusicOverride="visitor";
    startMusicForScene("visitor",true);
    showModal(`<div class="modal-card visitor-arrival"><small>GARDEN SIGNAL CONNECTED</small><div class="visitor-arrival-stage">${petMarkup({extraClass:"arrival-host",id:"arrivalHost"})}${petMarkup({pet:visitor,overrides:{sleeping:false,sick:false,resting:false,low:false,behavior:""},extraClass:"arrival-visitor",id:"arrivalVisitor",label:`${visitor.name} the visiting Rizo`})}<i>♡</i></div><h2>${escapeHTML(visitor.name)} ARRIVED</h2><p>${escapeHTML(visitor.variantName)} • GEN ${visitor.generation}. Visitors stay for ten minutes and never overwrite your pet.</p><div class="modal-buttons"><button class="primary" data-close-modal>WELCOME THEM</button></div></div>`);
    duckMusic(1000,.15); sfx("spark");
  }

  function acceptGardenVisit(rawCode) {
    try {
      const data = decodeGardenCode(rawCode);
      if (![1,2].includes(data?.v) || !data.keeper || !data.pet || !VARIANTS.some(item => item.id === data.pet.variant)) throw new Error("bad code");
      if (data.keeper === state.player.keeperId) { toast("THAT IS YOUR OWN GARDEN CODE"); return; }
      const safeName = String(data.pet.name || "GUEST RIZO").replace(/[<>\u0000-\u001F\u007F]/g,"").slice(0,14).toUpperCase() || "GUEST RIZO";
      const safeStage = STAGES.some(item => item.id === data.pet.stage) ? data.pet.stage : "kid";
      const variant = VARIANTS.find(item => item.id === data.pet.variant) || VARIANTS[0];
      const visitorGenes = {}, visitorSkills = {};
      for (const skill of SKILLS) {
        visitorGenes[skill.id] = clamp(Number(data.pet.genes?.[skill.id]) || 100, 82, 170);
        visitorSkills[skill.id] = clamp(Number(data.pet.skills?.[skill.id]) || 0, 0, visitorGenes[skill.id]);
      }
      visitorGenes.growth = clamp(Number(data.pet.genes?.growth) || 100, 85, 140);
      const visitor = { keeper:String(data.keeper).slice(0,80), name:safeName, variant:variant.id, variantName:variant.name, stage:safeStage, form:EVOLUTION_FORMS[data.pet.form]?data.pet.form:"balanced", accessory:ACCESSORIES.some(item=>item.id===data.pet.accessory)?data.pet.accessory:"none", generation:clamp(Number(data.pet.generation)||1,1,999), personality:PERSONALITIES.includes(data.pet.personality)?data.pet.personality:"LOYAL WEIRDO", mutation:MUTATIONS.some(item=>item.id===data.pet.mutation)?data.pet.mutation:"normal", alignment:clamp(Number(data.pet.alignment)||0,-100,100), bond:clamp(Number(data.pet.bond)||0), genes:visitorGenes, skills:visitorSkills, at:now(), expiresAt:now()+10*60000 };
      state.social.currentVisitor = visitor;
      state.social.visitors = [visitor, ...state.social.visitors.filter(item => item.keeper !== visitor.keeper)].slice(0,20);
      const today = dateKey();
      if (state.social.lastVisitRewardDate !== today) {
        state.social.lastVisitRewardDate = today;
        state.wallet.embers += 35;
        state.pet.bond = clamp(state.pet.bond + 3);
        gainSkill("luck", .8, {silent:true});
        addMemory("GARDEN VISITOR", `${visitor.name} visited from another Keeper's garden.`, "⌁");
        toast("FIRST VISIT TODAY • +R 35 • +BOND");
      } else toast(`${visitor.name} IS VISITING`);
      saveState(true); closeSheet(); changeView("home"); renderAll(); say("WAIT. WHO INVITED THEM?",3000); showVisitorArrival(visitor);
    } catch (error) { toast("THAT GARDEN CODE COULD NOT OPEN"); }
  }

  function activeGardenVisitor() {
    const visitor = state.social?.currentVisitor;
    return visitor && Number(visitor.expiresAt) > now() ? visitor : null;
  }

  function canSaveBondSeed() {
    const visitor = activeGardenVisitor();
    const stageIndex = STAGES.findIndex(item => item.id === state.pet.stage);
    if (!visitor) return {ok:false,reason:"INVITE A VISITOR FIRST"};
    if (state.pet.stage === "egg" || stageIndex < 2) return {ok:false,reason:"YOUR RIZO MUST REACH TEEN"};
    if (state.pet.bond < 30) return {ok:false,reason:`${Math.ceil(30-state.pet.bond)} MORE BOND NEEDED`};
    if (state.garden.lastPairKeeper === visitor.keeper) return {ok:false,reason:"THIS VISITOR ALREADY LEFT A SPARK"};
    return {ok:true,visitor};
  }

  function saveBondSeed() {
    const result = canSaveBondSeed();
    if (!result.ok) { toast(result.reason); return; }
    const visitor = result.visitor;
    state.garden.bondSeed = {keeper:visitor.keeper,name:visitor.name,variant:visitor.variant,variantName:visitor.variantName,personality:visitor.personality,mutation:visitor.mutation,alignment:visitor.alignment,genes:{...visitor.genes},skills:{...visitor.skills},generation:visitor.generation,at:now()};
    state.garden.lastPairKeeper = visitor.keeper;
    state.social.pairings = [{keeper:visitor.keeper,name:visitor.name,variant:visitor.variant,at:now()},...(state.social.pairings||[]).filter(item=>item.keeper!==visitor.keeper)].slice(0,30);
    state.pet.bond = clamp(state.pet.bond + 4);
    state.pet.mood = clamp(state.pet.mood + 8);
    addMemory("FRIENDSHIP SPARK", `${state.pet.name} and ${visitor.name} left a genetic spark for the next Legacy Egg.`, "♡");
    saveState(true); renderAll(); toast("BOND EGG DNA SAVED"); say("THAT FELT WEIRDLY IMPORTANT.",3200); sfx("secret"); effect("hearts");
  }

  function clearBondSeed() {
    if (!state.garden.bondSeed) { toast("NO BOND EGG DNA IS STORED"); return; }
    state.garden.bondSeed = null;
    saveState(true); renderAll(); toast("BOND EGG DNA CLEARED");
  }

  function setNextEggResonance(id) {
    if (!VARIANTS.some(item => item.id === id) || !state.collection[id]) { toast("DISCOVER THAT RIZO FIRST"); return; }
    state.garden.nextEggVariant = state.garden.nextEggVariant === id ? null : id;
    saveState(true); renderJournalCollection();
    toast(state.garden.nextEggVariant ? `${VARIANTS.find(item=>item.id===id).name} WILL SHAPE THE NEXT LEGACY EGG` : "EGG RESONANCE CLEARED");
  }

  function careInfluenceSummary(pet = state.pet) {
    const topFood = Object.entries(pet.careProfile?.foods || {}).sort((a,b)=>b[1]-a[1])[0];
    const topGame = Object.entries(pet.careProfile?.games || {}).sort((a,b)=>b[1]-a[1])[0];
    return {
      foodName:FOODS.find(item=>item.id===topFood?.[0])?.name || "NO FAVORITE FOOD YET",
      gameName:({power:"POWER TAPE",spark:"SPARK STASH",forage:"FOREST LUNCH",rush:"RIZO COURIER",walk:"RAIN WALK",rhythm:"EMBER BEAT",memory:"LOST SIGNAL",glide:"SKYBOUND",breaker:"EMBER FORGE",maze:"RIZO RUNAWAY",defense:"RIZO DEFENSE"})[topGame?.[0]] || "NO FAVORITE GAME YET",
      favoriteToy:(state.garden.favoriteToy || "NONE").toUpperCase()
    };
  }

  function openGrowthSheet() {
    const pet = state.pet;
    if (pet.stage === "egg") { toast("HATCH TO REVEAL GENETICS"); return; }
    const align = alignmentInfo(pet);
    const form = displayFormInfo(pet);
    const influence = careInfluenceSummary(pet);
    const seed = state.garden.bondSeed;
    openSheet("RAISING PATH", "AGE + AFFINITY", `<section class="growth-sheet"><div class="growth-sheet-hero"><span style="--align:${align.color}">${align.icon}</span><div><small>${align.name} ALIGNMENT • GENERATION ${pet.generation || 1}</small><h3>${form.name}</h3><p>${form.copy}</p></div></div><div class="aptitude-list">${SKILLS.map(skill=>aptitudeHTML(skill,pet)).join("")}</div><div class="raising-influences"><span><b>FAVORITE FOOD</b>${escapeHTML(influence.foodName)}</span><span><b>FAVORITE GAME</b>${escapeHTML(influence.gameName)}</span><span><b>FAVORITE TOY</b>${escapeHTML(influence.favoriteToy)}</span><span><b>PERSONALITY</b>${escapeHTML(pet.personality)}</span></div><div class="sheet-note">CARE SHAPES THE RESULT. Power Tap raises Power. Rizo Rush raises Speed. Spark Catch and Forage raise Instinct. Walks and rest raise Stamina. Treasure raises Luck.</div>${seed?`<div class="bond-seed-mini"><b>♡ BOND EGG STORED</b><span>${escapeHTML(seed.name)} • ${escapeHTML(seed.variantName || seed.variant)}</span><small>The next Legacy Egg blends both families' bounded genetic caps.</small></div>`:""}<button class="wide-button" data-rebirth-info>${canRebirth()?"CREATE LEGACY EGG":"VIEW REBIRTH PATH"}</button></section>`);
  }

  function useGardenToy(id) {
    if (!canCare()) return;
    const cooldown = 12000;
    if (now() - (state.garden.lastToyAt || 0) < cooldown) { toast("RIZO IS STILL PLAYING"); return; }
    const toys = {
      ball: { skill:"speed", gain:1.1, mood:7, energy:-4, align:0, behavior:"ball", line:"I CALL NEXT GOAL." },
      stump: { skill:"power", gain:1.0, mood:3, energy:-6, align:-1, behavior:"stretch", line:"THIS STUMP KNOWS WHAT IT DID." },
      puddle: { skill:"stamina", gain:.8, mood:6, energy:-3, hygiene:-8, align:1, behavior:"zoomies", line:"I REGRET NOTHING." },
      bush: { skill:"instinct", gain:.9, mood:5, hunger:5, align:2, behavior:"window", line:"THE BUSH HAD LORE." }
    };
    const toy = toys[id]; if (!toy) return;
    mutate((pet, whole)=>{
      gainSkill(toy.skill,toy.gain,{silent:true});
      pet.mood=clamp(pet.mood+(toy.mood||0)); pet.energy=clamp(pet.energy+(toy.energy||0)); pet.hygiene=clamp(pet.hygiene+(toy.hygiene||0)); pet.hunger=clamp(pet.hunger+(toy.hunger||0)); pet.xp+=4; pet.bond=clamp(pet.bond+1.2); shiftAlignment(toy.align||0,`toy:${id}`);
      whole.garden.lastToyAt=now(); whole.garden.toyUses[id]=(whole.garden.toyUses[id]||0)+1; whole.garden.favoriteToy=Object.entries(whole.garden.toyUses).sort((a,b)=>b[1]-a[1])[0]?.[0]||id;
    });
    activePetBehavior=toy.behavior; renderHome(); setTimeout(()=>{activePetBehavior=null;if(currentView==="home")renderHome();},1800);
    say(toy.line,2200); sfx(id==="puddle"?"sick":"spark"); sensoryBurst(id==="puddle"?"💧":"✦",currentVariant().color,8);
  }

  // ===== AUTONOMOUS PET LIFE + RANDOM STORY EVENTS =====
  function schedulePetBehavior(delay = 8000 + Math.random() * 15000) {
    clearTimeout(petBehaviorTimer);
    petBehaviorTimer = setTimeout(triggerPetBehavior, delay);
  }

  function triggerPetBehavior() {
    const blocked = document.hidden || currentView !== "home" || isUILocked() || !state?.introSeen || !state.pet?.alive || state.pet.stage === "egg" || state.pet.sleeping;
    if (blocked) { schedulePetBehavior(6000); return; }
    const personalityPools = {
      "CHAOTIC GOOD":["zoomies","ball","dance","wander-right"], "TINY CEO":["window","stretch","wander-left"], "SOFT MENACE":["hide","ball","window"], "FOREST GREMLIN":["hide","zoomies","wander-left"], "DRAMA FLAME":["dance","window","hide"], "QUIET GENIUS":["window","stretch","wander-right"], "SNACK SCHOLAR":["ball","wander-left","stretch"], "CERTIFIED HATER":["hide","window","stretch"], "LOYAL WEIRDO":["wander-left","wander-right","ball"], "MAIN CHARACTER":["dance","zoomies","window"]
    };
    const behaviors = personalityPools[state.pet.personality] || ["wander-left","wander-right","hide","window","ball","dance","zoomies","stretch"];
    const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];
    activePetBehavior = behavior;
    renderHome();
    const lines = {
      hide: ["YOU CANNOT SEE ME.","I HAVE LEFT THE ESTABLISHMENT."],
      window: ["THE RAIN IS SAYING SOMETHING.","OUTSIDE LOOKS EXPENSIVE."],
      ball: ["THIS BALL STARTED IT.","I AM TRAINING VERY SERIOUSLY."],
      dance: ["THIS SONG IS UNRELEASED.","DO NOT RECORD THIS."],
      zoomies: ["I HAVE TOO MUCH FIRE.","EMERGENCY SPEED."],
      stretch: ["PREPARING TO DO ALMOST NOTHING."]
    };
    if (lines[behavior] && Math.random() < .72) {
      const pool = lines[behavior]; say(pool[Math.floor(Math.random() * pool.length)], 2200);
    }
    if (behavior === "dance") sfx("dance");
    if (behavior === "zoomies") sfx("rush", 6);
    const duration = behavior === "hide" ? 4300 : behavior === "zoomies" ? 2600 : 3400;
    setTimeout(() => {
      if (activePetBehavior === behavior) {
        activePetBehavior = null;
        if (currentView === "home") renderHome();
      }
      schedulePetBehavior();
    }, duration);
  }


  // ===== v22 LIVING WORLD / MOOD MEMORY =====
  let lifeIdleTimer = null;
  let lifeWowTimer = null;
  let lastLifeInputAt = now();
  let gazeFrame = 0;

  function lifeMemory() {
    const pet = state.pet;
    pet.lifeMemory ||= { lastGreetingDate:"", lastSeenAt:now(), recentWins:0, recentCare:0, moodMomentum:0, secretStage:0, filthSeen:false, bathIncidentRemembered:false, favoriteFoodRemembered:false, washUntil:0, washFromHygiene:100, lastBathAt:0, lastFoodAt:0, lastFoodId:"", arcadeAfterglowUntil:0, lastArcadeMode:"", lifeBehaviorUntil:0 };
    return pet.lifeMemory;
  }

  function livingMood() {
    const pet = state.pet, memory = lifeMemory();
    const hour = new Date().getHours();
    const awayHours = Math.max(0, (now() - (state.player.lastSessionAt || memory.lastSeenAt || now())) / 36e5);
    if (pet.sleeping || hour < 6) return {label:"SLEEPY",color:"#7f8cff",behavior:"doze"};
    if (pet.sick) return {label:"UNDER WEATHER",color:"#9eff75",behavior:"sneeze"};
    if (awayHours > 48) return {label:"MISSED YOU",color:"#ff68bd",behavior:"wave"};
    if ((memory.recentWins || 0) >= 3 || pet.hype > 70) return {label:"PROUD",color:"#ffd45a",behavior:"proud"};
    if (pet.mood < 25) return {label:"MOODY",color:"#ff5c6c",behavior:"annoyed"};
    if (pet.energy < 28) return {label:"TIRED",color:"#6c8cff",behavior:"yawn"};
    if (hour >= 18) return {label:"COZY",color:"#a46cff",behavior:"look-left"};
    if (pet.bond > 70) return {label:"ATTACHED",color:"#ff68bd",behavior:"wave"};
    return {label:"CURIOUS",color:"#16c8ff",behavior:Math.random()>.5?"look-left":"look-right"};
  }

  function applyLivingMood() {
    if (!state?.pet || state.pet.stage === "egg") return;
    const mood = livingMood();
    if (el.moodChip) {
      el.moodChip.querySelector("i").style.background = mood.color;
      el.moodChip.querySelector("span").textContent = mood.label;
      el.moodChip.classList.add("life-active");
    }
    const hour = new Date().getHours();
    document.body.classList.toggle("life-night", hour >= 20 || hour < 6);
    document.body.classList.toggle("life-dawn", hour >= 6 && hour < 9);
  }

  function setLifeBehavior(behavior, duration = 1800, line = "") {
    if (!state?.pet?.alive || state.pet.stage === "egg" || state.pet.sleeping || currentView !== "home" || isUILocked()) return;
    const memory = lifeMemory();
    memory.lifeBehaviorUntil = now() + duration;
    activePetBehavior = behavior;
    renderHome();
    if (line) say(line, Math.min(duration + 500, 3200));
    setTimeout(() => {
      if (activePetBehavior === behavior && memory.lifeBehaviorUntil <= now()) { activePetBehavior = null; if (currentView === "home") renderHome(); }
    }, duration);
  }

  function spawnLifeMoment(forceBrand = false) {
    if (document.hidden || currentView !== "home" || isUILocked() || state.settings.reducedMotion) return;
    const scene = el.habitatScene;
    if (!scene) return;
    const moment = document.createElement("i");
    const icons = ["✦","·","☾","❋","⌁"];
    moment.className = `life-particle${forceBrand || Math.random() < .18 ? " brand" : ""}`;
    if (!moment.classList.contains("brand")) moment.textContent = icons[Math.floor(Math.random()*icons.length)];
    moment.style.left = `${10 + Math.random()*80}%`;
    moment.style.top = `${30 + Math.random()*48}%`;
    moment.style.setProperty("--life-dx",`${-35+Math.random()*70}px`);
    moment.style.setProperty("--life-dy",`${-35-Math.random()*55}px`);
    moment.style.setProperty("--life-rot",`${-30+Math.random()*60}deg`);
    moment.style.setProperty("--life-duration",`${3.4+Math.random()*2.8}s`);
    scene.appendChild(moment);
    setTimeout(()=>moment.remove(),7000);
  }

  function scheduleLifeWow(delay = 18000 + Math.random()*18000) {
    clearTimeout(lifeWowTimer);
    lifeWowTimer = setTimeout(() => { spawnLifeMoment(); scheduleLifeWow(); }, delay);
  }

  function scheduleIdleLife() {
    clearTimeout(lifeIdleTimer);
    const delay = 28000 + Math.random()*22000;
    lifeIdleTimer = setTimeout(() => {
      if (now()-lastLifeInputAt > 26000 && currentView === "home" && !document.hidden) {
        const mood = livingMood();
        const choices = state.pet.hunger < 30 ? ["food-stare", mood.behavior, "look-left", "yawn"] : [mood.behavior,"yawn","look-left","look-right","sneeze"];
        const behavior = choices[Math.floor(Math.random()*choices.length)];
        const lines = {yawn:"I WASN'T FALLING ASLEEP. I WAS THINKING SLOWLY.",sneeze:"THE AIR ATTACKED ME.",wave:"OH. YOU'RE STILL HERE.",annoyed:"PERSONAL SPACE IS A REAL INVENTION.","food-stare":"I CAN SEE THE FOOD AREA FROM HERE."};
        setLifeBehavior(behavior, behavior === "yawn" ? 2100 : 1500, Math.random()<.38 ? lines[behavior]||"" : "");
      }
      scheduleIdleLife();
    }, delay);
  }

  function greetForSession() {
    if (!state?.introSeen || state.pet.stage === "egg" || !state.pet.alive) return;
    const memory = lifeMemory(), today = dateKey();
    if (memory.lastGreetingDate === today) return;
    memory.lastGreetingDate = today;
    const away = Math.max(0,(now()-(state.player.lastSessionAt||now()))/36e5);
    const hour = new Date().getHours();
    const line = away > 48 ? "YOU TOOK FOREVER. I SAVED YOUR SPOT." : hour < 10 ? "YOU'RE UP. I PRETENDED NOT TO WAIT." : hour >= 20 ? "NIGHT SHIFT. LET'S MAKE BAD DECISIONS QUIETLY." : "THERE YOU ARE.";
    setTimeout(()=>setLifeBehavior(away>48?"wave":"proud",1800,line),900);
    saveState();
  }

  function trackRizoAttention(event) {
    lastLifeInputAt = now();
    if (!el.petActor || currentView !== "home" || state.settings.reducedMotion) return;
    cancelAnimationFrame(gazeFrame);
    gazeFrame = requestAnimationFrame(() => {
      const rect = el.petActor.getBoundingClientRect();
      const x = Math.max(-3,Math.min(3,((event.clientX-(rect.left+rect.width/2))/rect.width)*7));
      const y = Math.max(-2,Math.min(2,((event.clientY-(rect.top+rect.height/2))/rect.height)*5));
      el.petActor.style.setProperty("--gaze-x",`${x.toFixed(2)}px`);
      el.petActor.style.setProperty("--gaze-y",`${y.toFixed(2)}px`);
    });
  }

  function livingSecretReaction() {
    const taps = state.meta.totalTaps || 0, memory = lifeMemory();
    const stage = taps >= 100 ? 3 : taps >= 60 ? 2 : taps >= 20 ? 1 : 0;
    if (stage <= (memory.secretStage||0)) return;
    memory.secretStage = stage;
    if (stage === 1) setLifeBehavior("annoyed",1800,"OKAY. YOU HAVE CONFIRMED I AM REAL.");
    if (stage === 2) { setLifeBehavior("dizzy",2200,"THE ROOM HAS TOO MANY DIRECTIONS."); spawnLifeMoment(true); }
    if (stage === 3) { setLifeBehavior("hide",2800,"I HAVE FILED A FORMAL COMPLAINT."); sensoryBurst("✦",currentVariant().color,14); }
    saveState();
  }

  function accessoryMaterialSound(id) {
    const cloth=["bandana","scarf","bow","cape","beanie","cap"], metal=["chain","crown","halo","horns","belt"], glass=["shades","goggles","visor"];
    if (metal.includes(id)) { tone(780,.05,"sine",.02); tone(1180,.08,"sine",.012,.035); }
    else if (glass.includes(id)) { tone(1050,.045,"triangle",.018); }
    else if (cloth.includes(id)) { noise(.07,.014); }
    else { tone(280,.05,"triangle",.015); }
  }

  function maybeTriggerWorldEvent(force = false) {
    if (!state?.introSeen || worldEventOpen || document.hidden || currentView !== "home" || isUILocked() || mini.active || !state.pet.alive || state.pet.stage === "egg") return;
    const eventState = state.worldEvents ||= { lastAt: now(), count: 0, seen: [], lastBadLuckAt: 0, badLuckCount: 0 };
    const minimumGap = eventState.count === 0 ? 90000 : 300000;
    if (!force && now() - eventState.lastAt < minimumGap) return;
    if (!force && Math.random() > .36) return;
    const badLuckCoolingDown = !force && now() - (eventState.lastBadLuckAt || 0) < 45 * 60 * 1000;
    const weightedPool = WORLD_EVENTS
      .filter(event => !(badLuckCoolingDown && event.kind === "misfortune"))
      .map(event => ({
        event,
        weight: (event.weight || 1) * (eventState.seen.includes(event.id) ? .72 : 1.18)
      }));
    showWorldEvent(weightedPick(weightedPool)?.event);
  }

  function eventModalMarkup(event) {
    const eventKind = event.kind === "misfortune" ? "misfortune-event" : "";
    return `<div class="modal-card world-event-card ${eventKind} scene-${escapeHTML(event.scene || "event")}"><small>${escapeHTML(event.kicker)}</small><div class="event-stage premium-event-stage">${petMarkup({extraClass:"event-pet",id:"eventPet"})}<div class="event-icon">${event.icon}</div><div class="event-scenery"></div></div><h2>${escapeHTML(event.title)}</h2><p class="big-line">${escapeHTML(event.text)}</p><div class="event-choices">${event.choices.map(choice => `<button data-world-event="${event.id}" data-event-choice="${choice.id}">${escapeHTML(choice.label)}</button>`).join("")}</div></div>`;
  }

  function playPetCutscene({scene="event",kicker="FOREST MOMENT",title="RIZO NOTICED SOMETHING",symbol="✦",duration=900,after=null,className=""}={}) {
    const token=++cutsceneToken;
    activeMusicOverride=scene;
    startMusicForScene(scene,true);
    showModal(`<div class="modal-card pet-cutscene ${className} scene-${scene}"><div class="cutscene-cinema-bars" aria-hidden="true"></div><small>${escapeHTML(kicker)}</small><div class="cutscene-stage"><div class="cutscene-feature-fx" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="cutscene-symbol">${symbol}</div>${petMarkup({extraClass:"cutscene-pet",id:"cutscenePet"})}<div class="cutscene-floor"></div></div><h2>${escapeHTML(title)}</h2></div>`);
    duckMusic(duration+240,.12);
    sfx(scene==="shadow"?"secret":scene==="evolution"?"level":"event");
    setTimeout(()=>{ if(token===cutsceneToken && el.modalOverlay.classList.contains("show") && typeof after==="function") after(); }, state.settings.reducedMotion?80:duration);
  }

  function showWorldEvent(event) {
    if (!event) return;
    worldEventOpen = true;
    const scene=event.scene || (event.id==="glowing-puddle"?"forest":"event");
    playPetCutscene({scene,kicker:event.kicker,title:event.title,symbol:event.icon,duration:820,className:`event-${event.id} ${event.kind === "misfortune" ? "misfortune-cutscene" : ""}`,after:()=>showModal(eventModalMarkup(event))});
  }

  function resolveWorldEvent(eventId, choiceId) {
    const event = WORLD_EVENTS.find(item => item.id === eventId);
    const choice = event?.choices.find(item => item.id === choiceId);
    if (!event || !choice) return;
    const isMisfortune = event.kind === "misfortune";
    let loreTitle = null;
    let recoveryReason = null;
    mutate((pet, whole) => {
      const effect = choice.effect || {};
      whole.wallet.embers = Math.max(0, whole.wallet.embers + (effect.embers || 0));
      whole.wallet.shards = Math.max(0, whole.wallet.shards + (effect.shards || 0));
      pet.bond = clamp(pet.bond + (effect.bond || 0));
      pet.mood = clamp(pet.mood + (effect.mood || 0));
      pet.energy = clamp(pet.energy + (effect.energy || 0));
      pet.health = clamp(pet.health + (effect.health || 0));
      pet.hunger = clamp(pet.hunger + (effect.hunger || 0));
      pet.hygiene = clamp(pet.hygiene + (effect.hygiene || 0));
      pet.hype = Math.max(0, pet.hype + (effect.hype || 0));
      if (effect.sick === true) pet.sick = true;
      if (effect.sick === false) pet.sick = false;
      if (effect.recovery) recoveryReason = effect.recovery;
      if (effect.alignment) shiftAlignment(effect.alignment, `event:${event.id}`);
      if (effect.skill) gainSkill(effect.skill, effect.gain || .5, { silent: true });
      if (effect.lore) loreTitle = unlockRandomLore(1)?.title || null;
      whole.worldEvents.lastAt = now();
      whole.worldEvents.count += 1;
      if (isMisfortune) {
        whole.worldEvents.lastBadLuckAt = now();
        whole.worldEvents.badLuckCount = (whole.worldEvents.badLuckCount || 0) + 1;
      }
      if (!whole.worldEvents.seen.includes(event.id)) whole.worldEvents.seen.push(event.id);
      addMemory(event.title, choice.memory, event.icon);
      if (!isMisfortune) earnHeat(12, false);
    });
    if (recoveryReason) enterRecoveryState(recoveryReason, true);
    worldEventOpen = false;
    activeMusicOverride = null;
    closeModal();
    syncMusic(true);
    sfx(isMisfortune ? "sick" : "reward");
    if (isMisfortune) {
      haptic([35,45,35]);
      sensoryBurst("×", "#ff6b78", 12);
    } else sensoryBurst(event.icon, currentVariant().color, 14);
    const shaped = choice.effect?.skill ? `<div class="event-reward">${choice.effect.skill.toUpperCase()} +${choice.effect.gain || .5} • ${choice.effect.alignment > 0 ? "KIND" : choice.effect.alignment < 0 ? "WILD" : "BALANCED"} CHOICE</div>` : "";
    const consequence = isMisfortune
      ? `<div class="event-loss">BAD LUCK • ${recoveryReason ? "RECOVERY REST STARTED" : choice.effect?.sick ? "RIZO IS SICK" : "LOSSES SAVED"}</div>`
      : "";
    const followup = isMisfortune
      ? "This did not turn into a reward. The cost remains in the save until you care for Rizo and rebuild."
      : "Your choices quietly shape Rizo's stats, alignment, memories, and future form.";
    showModal(`<div class="modal-card ${isMisfortune ? "misfortune-result" : ""}"><div class="modal-art">${event.icon}</div><h2>${escapeHTML(choice.result)}</h2>${consequence}${loreTitle ? `<div class="event-reward">LORE FOUND: ${escapeHTML(loreTitle)}</div>` : ""}${shaped}<p>${followup}</p><div class="modal-buttons"><button class="primary" data-close-modal>BACK TO ${escapeHTML(state.pet.name)}</button></div></div>`);
  }

  // ===== REPEATABLE GAMEPLAY LOOPS =====
  // Each game uses a different control language and places the player's actual
  // Rizo inside the scene. This avoids the old "same moving circle" feeling.
  // Thin wrapper kept so every existing minigame callsite (power/spark/
  // forage/rush/walk) needs zero changes. Now reads from the same visual
  // state as the garden and closet, so accessory/stage/variant/mutation
  // never drift between scenes.
  function miniPetMarkup(extraClass = "") {
    return petMarkup({ extraClass, id: "miniPet", context: extraClass === "walk-rizo" ? "walk" : "arcade" });
  }

  const WALK_BIOMES = {
    rain:{ id:"rain", name:"RAIN TRAIL", className:"biome-rain", sky:"#526c78", rareBias:0, objects:["leaf","ember","flower","puddle","friend","strange"] },
    moss:{ id:"moss", name:"MOSS HOLLOW", className:"biome-moss", sky:"#426f59", rareBias:.08, objects:["leaf","flower","friend","mushroom","strange","seed"] },
    moon:{ id:"moon", name:"MOON GROVE", className:"biome-moon", sky:"#30375f", rareBias:.12, objects:["moonleaf","ember","friend","strange","puddle","star"] },
    storm:{ id:"storm", name:"STORM RIDGE", className:"biome-storm", sky:"#354258", rareBias:.18, objects:["ember","storm","puddle","strange","friend","thread"] }
  };

  const WALK_WEATHER = {
    drizzle:{ id:"drizzle", label:"DRIZZLE", className:"weather-drizzle", findBias:"puddle" },
    clear:{ id:"clear", label:"CLEAR AIR", className:"weather-clear", findBias:"flower" },
    mist:{ id:"mist", label:"LOW MIST", className:"weather-mist", findBias:"strange" },
    storm:{ id:"storm", label:"STORM", className:"weather-storm", findBias:"storm" }
  };

  function chooseWalkBiome() {
    const hour = new Date().getHours();
    const room = state.pet.room;
    if (room === "forest" || state.pet.variant === "moss") return WALK_BIOMES.moss;
    if (room === "void" || hour < 6 || hour > 20) return WALK_BIOMES.moon;
    if (state.pet.mutation === "stormmarked" || Math.random() < .16) return WALK_BIOMES.storm;
    return WALK_BIOMES.rain;
  }

  function chooseWalkWeather(biome) {
    if (biome.id === "storm") return WALK_WEATHER.storm;
    if (biome.id === "moon") return Math.random() < .55 ? WALK_WEATHER.mist : WALK_WEATHER.clear;
    const roll = Math.random();
    return roll < .48 ? WALK_WEATHER.drizzle : roll < .73 ? WALK_WEATHER.clear : WALK_WEATHER.mist;
  }

  const EMBER_BEAT_TRACKS = [
    {id:"moss-after-dark",title:"MOSS AFTER DARK",bpm:96,difficulty:"CHILL",stars:1,travel:1.85,steps:16,wave:"sine",swing:.04,lead:[62,null,null,65,69,null,67,null,60,null,64,null,67,null,65,null],bass:[38,null,38,null,43,null,null,43,36,null,36,null,41,null,null,41],drums:[1,0,0,.35,1,0,.2,0,1,0,0,.4,1,0,.2,.55],laneShift:1,chart:[[0,0],[3,1],[4,2],[6,1],[8,3],[11,2],[12,1],[15,0]]},
    {id:"puddle-bounce",title:"PUDDLE BOUNCE",bpm:118,difficulty:"EASY",stars:2,travel:1.72,steps:16,wave:"triangle",swing:.08,lead:[69,null,73,null,76,73,null,71,69,null,66,null,71,73,null,76],bass:[45,null,null,45,50,null,null,50,43,null,null,43,47,null,null,47],drums:[1,0,.25,.6,1,0,.25,.6,1,0,.25,.6,1,0,.4,.75],laneShift:2,chart:[[0,0],[3,1],[4,2],[7,3],[8,2],[11,1],[12,0],[14,2],[15,3]]},
    {id:"frostline",title:"FROSTLINE",bpm:122,difficulty:"NORMAL",stars:2,travel:1.62,steps:16,wave:"sine",swing:.02,lead:[72,null,76,null,79,76,74,null,71,null,74,null,78,76,72,null],bass:[36,null,43,null,40,null,47,null,36,null,43,null,41,null,48,null],drums:[1,0,.35,0,1,.2,.55,0,1,0,.35,.2,1,0,.65,.2],laneShift:1,chart:[[0,0],[2,1],[4,2],[6,3],[7,2],[8,1],[10,0],[12,1],[14,2],[15,3]]},
    {id:"spark-circuit",title:"SPARK CIRCUIT",bpm:152,difficulty:"NORMAL",stars:3,travel:1.5,steps:16,wave:"square",swing:0,lead:[76,null,79,83,81,null,79,86,83,null,81,79,76,79,83,null],bass:[40,null,40,null,45,null,47,null,40,null,43,null,47,null,45,null],drums:[1,0,.45,0,1,0,.65,0,1,0,.45,0,1,0,.7,0],laneShift:1,chart:[[0,0],[2,1],[4,2],[6,3],[7,2],[8,1],[10,0],[12,1],[14,2],[15,3]]},
    {id:"iron-heart",title:"IRON HEART",bpm:126,difficulty:"NORMAL",stars:3,travel:1.54,steps:16,wave:"sawtooth",swing:0,lead:[64,null,64,67,71,null,69,67,62,null,62,66,69,null,67,66],bass:[28,null,35,null,28,null,38,null,31,null,38,null,31,null,40,null],drums:[1,0,.5,0,1,0,.8,0,1,0,.5,0,1,.25,.85,0],laneShift:3,chart:[[0,0],[2,0],[4,1],[6,2],[8,3],[10,3],[12,2],[13,1],[14,0]]},
    {id:"bubblegum-alarm",title:"BUBBLEGUM ALARM",bpm:134,difficulty:"HARD",stars:4,travel:1.42,steps:16,wave:"triangle",swing:.02,lead:[81,83,86,null,83,81,79,null,88,86,83,null,81,83,79,null],bass:[45,null,52,null,47,null,54,null,45,null,52,null,50,null,57,null],drums:[1,.2,.35,.2,1,.2,.6,.2,1,.2,.35,.2,1,.2,.7,.35],laneShift:1,chart:[[0,0],[1,1],[3,2],[4,3],[5,2],[6,1],[8,0],[9,2],[10,3],[12,1],[13,0],[14,2],[15,3]]},
    {id:"aurora-afterparty",title:"AURORA AFTERPARTY",bpm:138,difficulty:"HARD",stars:4,travel:1.38,steps:16,wave:"sine",swing:.06,lead:[79,83,null,86,88,null,86,83,81,84,null,88,91,null,88,84],bass:[43,null,50,null,47,null,54,null,45,null,52,null,48,null,55,null],drums:[1,.15,.45,.15,1,0,.65,.25,1,.15,.45,.2,1,.2,.75,.3],laneShift:2,chart:[[0,0],[1,1],[2,2],[4,3],[6,1],[7,0],[8,2],[9,3],[11,1],[12,0],[13,2],[14,3],[15,1]]},
    {id:"golden-hour",title:"GOLDEN HOUR",bpm:144,difficulty:"HARD",stars:4,travel:1.36,steps:16,wave:"triangle",swing:0,lead:[76,79,83,null,86,83,79,null,88,86,83,79,81,null,84,88],bass:[40,null,47,null,45,null,52,null,43,null,50,null,47,null,54,null],drums:[1,.2,.5,.15,1,.15,.65,.2,1,.2,.55,.15,1,.25,.8,.3],laneShift:3,chart:[[0,0],[1,2],[2,1],[4,3],[5,2],[6,0],[8,1],[9,3],[10,2],[11,0],[12,3],[14,1],[15,2]]},
    {id:"glitch-garden",title:"GLITCH GARDEN",bpm:142,difficulty:"EXPERT",stars:5,travel:1.26,steps:16,wave:"square",swing:.11,lead:[72,null,79,75,null,82,77,null,84,80,null,75,79,null,86,74],bass:[36,null,43,36,null,47,40,null,38,null,45,38,null,48,41,null],drums:[1,.15,0,.65,1,0,.35,.2,1,.15,0,.75,1,.2,.5,.25],laneShift:1,chart:[[0,0],[1,2],[2,1],[3,3],[4,0],[5,1],[7,2],[8,3],[9,1],[10,0],[11,2],[12,3],[13,0],[14,2],[15,1]]},
    {id:"shadow-signal",title:"SHADOW SIGNAL",bpm:158,difficulty:"EXPERT",stars:5,travel:1.2,steps:16,wave:"sawtooth",swing:.04,lead:[67,70,74,77,74,70,79,75,68,72,75,80,77,73,82,79],bass:[31,null,38,null,34,null,41,null,29,null,36,null,33,null,40,null],drums:[1,.2,.55,.2,1,.25,.75,.2,1,.2,.55,.25,1,.3,.85,.35],laneShift:3,chart:[[0,0],[1,1],[2,3],[3,2],[4,0],[5,2],[6,1],[7,3],[8,2],[9,0],[10,3],[11,1],[12,0],[13,3],[14,2],[15,1]]}
  ];
  const EMBER_TRACK_BY_ID = Object.fromEntries(EMBER_BEAT_TRACKS.map(track=>[track.id,track]));

  function shuffleIds(ids) {
    const copy=[...ids];
    for(let i=copy.length-1;i>0;i-=1){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
    return copy;
  }

  function chooseEmberBeatTrack() {
    const history=state.musicHistory ||= {emberBag:[],emberLast:null};
    const best=Math.max(0,Number(state.scores?.rhythm)||0);
    // Difficulty opens naturally instead of randomly throwing a brand-new
    // keeper into an Expert chart. A clean early run unlocks Hard; sustained
    // mastery unlocks the two Expert songs.
    const maxStars=best>=90?5:best>=35?4:3;
    const eligible=EMBER_BEAT_TRACKS.filter(track=>(track.stars||1)<=maxStars);
    let bag=Array.isArray(history.emberBag)?history.emberBag.filter(id=>eligible.some(track=>track.id===id)):[];
    if(!bag.length){
      bag=shuffleIds(eligible.map(track=>track.id));
      if(bag.length>1 && bag[0]===history.emberLast){[bag[0],bag[1]]=[bag[1],bag[0]];}
    }
    let id=bag.shift();
    if(id===history.emberLast && bag.length){bag.push(id);id=bag.shift();}
    history.emberBag=bag;
    history.emberLast=id;
    saveState(true);
    return EMBER_TRACK_BY_ID[id] || eligible[0] || EMBER_BEAT_TRACKS[0];
  }

  function rhythmStepSeconds(track){return 60/track.bpm/2;}
  function rhythmStepTime(track,step){
    const base=rhythmStepSeconds(track);
    return step*base + ((step%2===1)?base*(track.swing||0):0);
  }
  function buildRhythmChart(track,durationSeconds=27){
    const events=[]; const phrase=track.steps||16; let phraseIndex=0;
    const notes=Array.isArray(track.chart)?track.chart:[];
    while(true){
      let added=false;
      for(const raw of notes){
        const step=Array.isArray(raw)?Number(raw[0]):Number(raw?.step ?? raw);
        const baseLane=Array.isArray(raw)?Number(raw[1]??step%4):Number(raw?.lane ?? step%4);
        if(!Number.isFinite(step))continue;
        const absoluteStep=phraseIndex*phrase+step;
        const time=rhythmStepTime(track,absoluteStep);
        if(time>durationSeconds-1.05)return events;
        const lane=((baseLane+phraseIndex*(track.laneShift||0))%4+4)%4;
        events.push({id:`${track.id}-${absoluteStep}-${lane}`,step:absoluteStep,hitTime:time,lane,icon:["▲","■","●","◆"][lane]});added=true;
      }
      if(!added)return events; phraseIndex+=1;
    }
  }

  // ===== SHARED ARCADE LAYER =====
  // One authoritative record per arcade mode. The cabinet card, the minigame
  // shell header, the personal-best grid, the results modal art and the run
  // rules all read from here, so a mode can never be called EMBER FORGE on the
  // shelf and "BREAKER" on the score board. Internal mode ids stay internal.
  const ARCADE_GAMES = Object.freeze({
    power:{name:"POWER TAPE", kicker:"COACH TAPE 03", art:"🥊", duration:24, energy:15, unit:"PTS", best:"points", family:"training",
      hint:"The coach calls JAB, BODY, or HOOK. Hit the right strike on the moving window—and do nothing when the bag feints."},
    spark:{name:"SPARK STASH", kicker:"DON'T GET GREEDY", art:"★", duration:24, energy:10, unit:"PTS", best:"points", family:"spark",
      hint:"Catch clean signals to build an unbanked stash. BANK it before a miss or Shadow signal wipes the risky part."},
    forage:{name:"FOREST LUNCH", kicker:"PICKY LITTLE MENACE", art:"🍓", duration:28, energy:11, unit:"PTS", best:"points", family:"forest",
      hint:"Pick the requested food before its row reaches PACK HERE. Tap a lane or use ← →. Prisms pay +7 but do not pack the ticket."},
    rush:{name:"RIZO COURIER", kicker:"ROOFTOP DELIVERY", art:"🔥", duration:30, energy:15, unit:"PTS", best:"points", family:"street",
      hint:"Grab ◆, clear two rooftops, then LAND at the numbered door. Tap / Space to jump; tap again in the air for height and bonus stamps."},
    walk:{name:"RAIN WALK", kicker:"LIVING FOREST", art:"☂", duration:40, energy:8, unit:"PTS", best:"points", family:"forest",
      hint:"Tap finds to fill your pockets; tap hazards to hop them. Your route leads to its own encounter. Keyboard: Space inspects, 1 / 2 chooses."},
    rhythm:{name:"EMBER BEAT", kicker:"FOUR-LANE RHYTHM", art:"♫", duration:27, energy:12, unit:"PTS", best:"points", family:"stage",
      hint:"Tap the matching lane when its note reaches the bright hit line. Timing and lane both matter."},
    memory:{name:"LOST SIGNAL", kicker:"CORRUPTED BROADCAST", art:"▦", duration:44, energy:7, unit:"PTS", best:"points", family:"signal",
      hint:"Memorize the transmission, then obey the corruption rule. Later rounds stack reverse, opposite, and rotation logic."},
    glide:{name:"SKYBOUND", kicker:"CENTER-LINE FLIGHT", art:"☁", duration:36, energy:10, unit:"PTS", best:"points", family:"air",
      hint:"Tap or press Space to flap through shifting wind. Thread gate centers to charge a Thermal Burst that bends the physics in your favor."},
    breaker:{name:"EMBER FORGE", kicker:"FORGE THE MARK", art:"✦", duration:46, energy:11, unit:"PTS", best:"points", family:"forge",
      hint:"Drag Rizo under the ember orb — the paddle tracks your thumb. Read authored wall patterns and crack CORE blocks to collapse nearby bricks."},
    maze:{name:"RIZO RUNAWAY", kicker:"MAZE-CHASE INSTINCT", art:"⌗", duration:54, energy:10, unit:"PTS", best:"points", family:"chase",
      hint:"Swipe or use the arrows. Eat the Ember trail. Prism Seeds flip the hunt so Rizo can tag the Shadows."},
    defense:{name:"RIZO DEFENSE", kicker:"ENDLESS ROSTER STRATEGY", art:"🎈", duration:0, energy:8, unit:"POPS", best:"wave", family:"defense",
      hint:"Your strongest unlocked world is chosen automatically. Drag a Rizo—or tap one, then tap grass—to defend the illustrated trail."}
  });
  const ARCADE_MODES = Object.freeze(Object.keys(ARCADE_GAMES));
  // Legacy alias. Existing call sites and QA hooks keep reading duration/energy
  // from here; the values are now derived rather than duplicated.
  const ARCADE_MODE_RULES = Object.freeze(Object.fromEntries(ARCADE_MODES.map(mode=>[mode,{duration:ARCADE_GAMES[mode].duration,energy:ARCADE_GAMES[mode].energy}])));
  function arcadeGame(mode){ return ARCADE_GAMES[mode] || null; }
  function arcadeName(mode){ return ARCADE_GAMES[mode]?.name || String(mode||"ARCADE").toUpperCase(); }
  function arcadeArt(mode){ return ARCADE_GAMES[mode]?.art || "★"; }
  function arcadeRunLength(mode){
    const seconds=ARCADE_GAMES[mode]?.duration||0;
    return seconds>0?`${seconds}s`:"ENDLESS";
  }
  function arcadeBestLabel(mode){ return ARCADE_GAMES[mode]?.best==="wave"?"BEST WAVE":"BEST"; }
  function arcadeBestValue(mode){
    const raw=Math.max(0,Math.floor(Number(state?.scores?.[mode])||0));
    return ARCADE_GAMES[mode]?.best==="wave"?(raw?`W${raw}`:"—"):formatNumber(raw);
  }
  function miniDuration(mode) { return (ARCADE_MODE_RULES[mode]?.duration ?? 15) * 1000; }
  function miniEnergyNeeded(mode) { return ARCADE_MODE_RULES[mode]?.energy ?? 12; }

  // ===== SHARED ARCADE FREEZE =====
  // One credit-back clock for every interruption an arcade run can survive: an
  // ad break, the app being backgrounded, and the player's own pause menu. Runs
  // are timestamp-based (mini.endAt), so any frozen interval has to be handed
  // back or a phone call silently ends the run. Sources stack: a notification
  // during an ad must not thaw the run early.
  function arcadeFrozen(){ return Boolean(mini?.pauseSources && Object.keys(mini.pauseSources).length); }

  // Deadlines the arcade stores as absolute now() stamps: buffs, invulnerability
  // windows, spawn/wind timers, coach calls. Frozen time has to be handed back to
  // every one of them or a pause silently burns a Thermal Burst or an i-frame.
  // Discovery is by naming convention so a future mini.somethingUntil is covered
  // automatically; anything that is not a wall-clock run deadline is listed here.
  const ARCADE_CLOCK_EXEMPT = Object.freeze(new Set([
    "endAt",            // credited explicitly (Infinity for Defense)
    "pauseAt",          // walk fork's own pause stamp, credited explicitly
    "freezeAt",         // the freeze bookkeeping itself
    "rhythmAudioStartAt" // AudioContext time, not now(); rescheduled on thaw
  ]));
  function arcadeDeadlineKeys(){
    return Object.keys(mini || {}).filter(key => /(?:Until|At)$/.test(key) && !ARCADE_CLOCK_EXEMPT.has(key));
  }
  function creditArcadeDeadlines(frozenFor, frozenAt){
    if(!mini || !(frozenFor > 0)) return 0;
    let credited = 0;
    for(const key of arcadeDeadlineKeys()){
      const value = mini[key];
      if(typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
      // A deadline that had already expired when the freeze began stays expired;
      // only one still pending gets the frozen interval back.
      if(value <= frozenAt) continue;
      mini[key] = value + frozenFor;
      credited += 1;
    }
    return credited;
  }
  function arcadeFreeze(source="menu"){
    if(!mini?.active) return false;
    mini.pauseSources ||= {};
    if(mini.pauseSources[source]) return false;
    const first=!arcadeFrozen();
    mini.pauseSources[source]=true;
    arcadeHoldJobs(source);
    if(!first) return true;
    mini.freezeAt=now();
    mini.pausedByAd=true;
    if(mini.mode==="rhythm"){ mini.rhythmPauseClock=rhythmClockNow(); stopRhythmVoices(); }
    return true;
  }
  function arcadeThaw(source="menu"){
    if(!mini?.active) return false;
    mini.pauseSources ||= {};
    if(!mini.pauseSources[source]) return false;
    delete mini.pauseSources[source];
    arcadeReleaseJobs(source);
    if(arcadeFrozen()) return false;
    const frozenAt=mini.freezeAt||now();
    const frozenFor=Math.max(0, now()-frozenAt);
    if(Number.isFinite(mini.endAt)) mini.endAt+=frozenFor;
    creditArcadeDeadlines(frozenFor, frozenAt);
    // The walk fork pauses on its own timestamp; keep it aligned so a fork left
    // open across a background does not double-credit or lose the pause.
    if(mini.pausedByFork && mini.pauseAt) mini.pauseAt+=frozenFor;
    if(mini.mode==="rhythm"){
      mini.rhythmStartClock+=Math.max(0, rhythmClockNow()-(mini.rhythmPauseClock||rhythmClockNow()));
      scheduleRhythmAudio(Math.max(0, rhythmClockNow()-mini.rhythmStartClock));
    }
    mini.pausedByAd=false;
    mini.freezeAt=0;
    mini.lastFrame=performance.now();
    return true;
  }

  function startMiniGame(mode, options = {}) {
    if (!canCare()) return;
    if (!ARCADE_MODES.includes(mode)) return;
    const energyNeeded = miniEnergyNeeded(mode);
    if (state.pet.energy < energyNeeded) { toast(`NEED ${energyNeeded} ENERGY • RIZO HAS ${Math.floor(state.pet.energy)}`); sfx("no"); return; }
    clearToasts();
    closeSheet();
    mini = {
      active: true, mode, score: 0, hits: 0, playerInputs: 0, endAt: mode === "defense" ? Infinity : now() + miniDuration(mode), timer: null,
      mover: null, currentGood: true, frame: null, intervals: [], entities: [], pausedByAd: false,
      pauseAt: 0, lastFrame: performance.now(), lane: 1, needle: .06, needleDir: 1,
      // Shared arcade state: one lives model, one freeze model, one end reason.
      lives: 3, maxLives: 3, endReason: "", pauseSources: {}, freezeAt: 0, paused: false,
      jobs: new Map(), jobHolds: {},
      needleSpeed: .72, jumpY: 0, jumpV: 0, invulnerableUntil: 0,
      distanceCarry: 0, treasureRolls: 0, combo: 1,
      pausedByFork: false, walkForkShown: false, walkPath: null, walkDecisionIndex: 0,
      walkDistance: 0, walkRisk: 0, walkLuck: 0, walkChoices: [], walkNotes: [], walkEncounter: null, walkEnding: "", walkFindCount: 0,
      rhythmStreak: 0, rhythmMaxStreak: 0, rhythmMisses: 0, rhythmBlankTaps: 0,
      rhythmJudgements: { perfect:0, great:0, good:0, miss:0 }, rhythmTrack: null, rhythmChart: [], rhythmChartIndex: 0,
      rhythmStartClock: 0, rhythmLeadIn: 3.7, rhythmReady: false, rhythmTravel: 1.6, rhythmVoices: [], rhythmGain: null,
      memoryRound: 0, memorySequence: [], memoryInput: 0, memoryShowing: false, memoryMode: "forward", memoryBestRound: 0,
      memoryShift: 0, memoryRuleDepth: 1,
      powerStreak: 0, powerBestStreak: 0, powerZone: .5, powerZoneTarget: .5, powerHeat: 0, powerGuardAt: 0, powerGuardUntil: 0, powerGuardReads: 0, powerTapLockUntil: 0, powerEngaged: false,
      powerCall: "jab", powerCallAt: 0, powerCallsRead: 0, powerWrongCalls: 0,
      sparkStreak: 0, sparkBestStreak: 0, sparkType: "normal", sparkExpiresAt: 0, sparkAvoided: 0, sparkFeverUntil: 0, sparkFrenzies: 0,
      sparkStash: 0, sparkBanked: 0, sparkBanks: 0, sparkLost: 0, sparkAutoBanked: false,
      forageOrder: [], forageOrderIndex: 0, forageStreak: 0, forageBestStreak: 0,
      forageRows: 0, forageNextAt: 0, forageFeedbackUntil: 0, forageMistakes: 0, forageContract: "picky", forageOrdersDone: 0, forageRestraint: 0, forageRushUntil: 0,
      rushAirJumps: 0, rushStreak: 0, rushBestStreak: 0, rushClears: 0,
      rushRoute: 0, rushRoad: 0, rushTips: 0, rushLandingUntil: 0, rushParcel: false, rushParcelClears: 0, rushDeliveries: 0, rushPackagesLost: 0,
      glideY: .5, glideV: 0, glideSpawnAt: 0, glideStreak: 0, glideBestStreak: 0, glideClears: 0, glideInvulnerableUntil: 0, glideWind: 0, glideWindAt: 0, glideGateCount: 0,
      glideDraft: 0, glideThermals: 0, glideThermalUntil: 0,
      breakerX: .5, breakerGrab: null, breakerBricks: 0, breakerBall: null, breakerLevel: 1, breakerStreak: 0, breakerBestStreak: 0, breakerBoostUntil: 0, breakerPierceUntil: 0, breakerResetAt: 0, breakerBoardPending: false, breakerMoves: 0,
      breakerCores: 0, breakerCoresBroken: 0, breakerPatternName: "",
      mazeLevel: 1, mazeCombo: 0, mazeBestCombo: 0, mazePellets: 0, mazeHunts: 0, mazeHunterTags: 0, mazeGrid: [], mazePlayer: null, mazeHunters: [], mazeMoveCarry: 0, mazeHunterCarry: 0, mazeHuntUntil: 0, mazeInvulnerableUntil: 0, mazeHunterWakeAt: 0, mazeInputs: 0, mazePointerStart: null,
      mazeTurnHistory: [], mazeFavoriteDir: "",
      defense: null, defenseDrag: null, defenseMapChoice: options?.mapId || "auto",
      defenseResume: options?.resumeCheckpoint || null,
      defenseContract: options?.defenseContract || null
    };
    if (mode === "rhythm") {
      mini.rhythmTrack = chooseEmberBeatTrack();
      mini.rhythmTravel = mini.rhythmTrack.travel || 1.6;
      mini.rhythmChart = buildRhythmChart(mini.rhythmTrack, miniDuration("rhythm") / 1000);
      // The preparation countdown is free time, not part of the scored song.
      mini.endAt += mini.rhythmLeadIn * 1000;
    }
    if (mode === "walk") {
      mini.walkBiome = chooseWalkBiome();
      mini.walkWeather = chooseWalkWeather(mini.walkBiome);
    }
    const details = ARCADE_GAMES[mode];
    el.miniKicker.textContent = details.kicker;
    el.miniTitle.textContent = details.name;
    el.miniHint.textContent = details.hint;
    el.miniTimer.textContent = mode === "defense" ? "ENDLESS" : (miniDuration(mode) / 1000).toFixed(1);
    el.miniScore.textContent = `0 ${details.unit}`;
    closeArcadePause(true);
    if (el.miniPause) el.miniPause.hidden = false;
    lastOverlayFocus = document.activeElement;
    el.miniGameOverlay.hidden = false;
    el.miniGameOverlay.classList.toggle("defense-active", mode === "defense");
    document.documentElement.classList.toggle("defense-performance-session", mode === "defense");
    if (mode === "defense") lockDefenseViewport();
    else unlockDefenseViewport();
    syncUILock();
    renderMiniScene(mode);
    mini.lastFrame = performance.now();
    mini.frame = requestAnimationFrame(updateMiniFrame);
    mini.timer = setInterval(updateMiniClock, 50);
    startMusicForScene(`mini-${mode}`, true);
    haptic(25);
    requestAnimationFrame(() => el.miniArena.focus({ preventScroll: true }));
  }

  function renderMiniScene(mode) {
    el.miniArena.classList.toggle("defense-host", mode === "defense");
    if (mode === "power") {
      el.miniArena.innerHTML = `<div class="mini-world power-world power-dx">
        <div class="training-floor"></div>${miniPetMarkup("power-rizo")}
        <div id="trainingBag" class="training-bag"><i></i><b class="face-mark-stage"><img src="./assets/rizo-full-mark.png" alt=""></b><span id="bagCracks" class="bag-cracks"></span></div>
        <div class="power-hud" data-mini-readout><span>STREAK <b id="powerStreak">0</b></span><span>OVERDRIVE <b id="powerHeat">0%</b></span></div>
        <div class="power-coach"><small>COACH CALL</small><b id="powerCall">JAB</b></div>
        <div class="power-techniques" aria-label="Strike type"><button type="button" data-power-tech="jab">JAB</button><button type="button" data-power-tech="body">BODY</button><button type="button" data-power-tech="hook">HOOK</button></div>
        <div class="timing-console"><div class="timing-track"><i id="timingPerfectZone" class="timing-perfect"></i><b id="timingNeedle"></b></div><strong id="timingCallout">READ THE CALL</strong></div>
      </div>`;
      updatePowerZoneVisual();
    }
    if (mode === "spark") {
      el.miniArena.innerHTML = `<div class="mini-world spark-world spark-dx"><div class="spark-sky"></div>${miniPetMarkup("spark-rizo")}<button id="miniTarget" class="spark-orb" type="button" aria-label="Catch spark">★</button><div class="spark-trail" id="sparkTrail"></div><div class="spark-hud" data-mini-readout><span>STASH <b id="sparkStash">0</b></span><span class="spark-chain">CHAIN <b id="sparkStreak">0</b><em id="sparkRisk">x1</em></span><span>BANKED <b id="sparkBanked">0</b></span></div><button class="spark-bank" id="sparkBank" type="button" data-spark-bank><b>BANK STASH</b><small id="sparkPayout">NOTHING TO BANK</small></button><div id="sparkRule" class="spark-rule">CATCH • THEN DECIDE WHEN TO BANK</div></div>`;
      el.miniTarget = $("#miniTarget");
      moveSparkTarget();
    }
    if (mode === "forage") {
      mini.forageOrder = buildForageOrder();
      el.miniArena.innerHTML = `<div class="mini-world forage-world forage-dx"><div class="forage-lanes"><i></i><i></i></div><div id="forageDrops" class="forage-drops"></div>${miniPetMarkup("forage-rizo")}<div id="forageOrder" class="forage-order"></div><div id="forageTicketState" class="forage-ticket-state">PACK THE TICKET</div><div class="forage-chain">LUNCH CHAIN <b id="forageStreak">0</b></div><div class="forage-catch-line"><span>PACK HERE</span></div><div class="lane-labels"><span>← LEFT</span><span>MIDDLE</span><span>RIGHT →</span></div></div>`;
      setForageLane(1); updateForageOrderHUD();
      mini.intervals.push(queueMiniInterval(() => { if (mini.active) spawnForageItem(); }, 120));
      spawnForageItem();
    }
    if (mode === "rush") {
      el.miniArena.innerHTML = `<div class="mini-world rush-world rush-dx"><div class="rush-clouds"></div><div class="rush-hills"></div><div class="rush-ground"></div><div id="rushEntities"></div>${miniPetMarkup("rush-rizo")}<div id="rushHearts" class="rush-hearts" data-mini-readout>♥ ♥ ♥</div><div class="rush-streak" data-mini-readout>CLEAN <b id="rushStreak">0</b></div><div class="rush-delivery" id="rushDelivery" data-mini-readout>FIND ◆ • KEEP THE PACKAGE SAFE</div><div class="rush-callout" id="rushCallout">PICK UP ◆ • JUMP THE ROOFTOPS</div><div class="rush-route" id="rushRoute" data-mini-readout></div><span class="rush-parcel-tag" aria-hidden="true">◆</span><div class="rush-receipt" id="rushReceipt" data-mini-readout></div></div>`;
      renderLives("rushHearts");
      mini.intervals.push(queueMiniInterval(() => { if (mini.active) spawnRushEntity(); }, 180));
      spawnRushEntity(true);
    }
    if (mode === "walk") {
      const biome = mini.walkBiome || WALK_BIOMES.rain;
      const weather = mini.walkWeather || WALK_WEATHER.drizzle;
      el.miniArena.innerHTML = `<div class="mini-world walk-world ${biome.className} ${weather.className}" data-walk-biome="${biome.id}">
        <div class="walk-sky"></div><div class="walk-weather"></div>
        <div class="walk-layer walk-far" data-walk-speed=".18"></div>
        <div class="walk-layer walk-mid" data-walk-speed=".43"></div>
        <div class="walk-layer walk-near" data-walk-speed=".82"></div>
        <div class="walk-path"></div><div id="walkFinds"></div>${miniPetMarkup("walk-rizo")}
        <div class="walk-distance"><i id="walkDistanceBar"></i></div><div id="walkNotes" class="walk-notes" data-mini-readout><b>POCKET FINDS</b><span>◇ ◇ ◇</span><small>3 DIFFERENT FINDS → A STRANGER ENDING</small></div>
        <div id="walkCaption" class="walk-caption"><b>${escapeHTML(biome.name)} • ${escapeHTML(weather.label)}</b><span>${escapeHTML(walkIntroLine())}</span></div>
      </div>`;
      // The walk fork is a deliberate design pause with its own clock credit, so
      // it still suppresses spawns separately from the shared hold.
      mini.intervals.push(queueMiniInterval(() => { if (mini.active && !mini.pausedByFork) spawnWalkFind(); }, 1450));
      spawnWalkFind();
      setWalkCaption(mini.walkBiome.name, "TAP A FIND TO INSPECT IT. TAP LOGS AND PUDDLES TO HOP OVER.");
    }
    if (mode === "rhythm") {
      const track=mini.rhythmTrack || EMBER_BEAT_TRACKS[0];
      const stars="★".repeat(track.stars||1)+"☆".repeat(Math.max(0,5-(track.stars||1)));
      el.miniArena.innerHTML = `<div class="mini-world rhythm-world" data-track="${escapeHTML(track.id)}"><div class="rhythm-lights"></div><div class="rhythm-stage"><img class="rhythm-face-mark" src="./assets/rizo-full-mark.png" alt=""></div>${miniPetMarkup("rhythm-rizo")}<div class="rhythm-board" id="rhythmBoard"><div class="rhythm-lane-columns" aria-hidden="true">${[0,1,2,3].map(lane=>`<i class="rhythm-column lane-${lane}"></i>`).join("")}</div><div class="rhythm-hit-line" aria-hidden="true"></div><div id="rhythmNotes"></div></div><div class="rhythm-status"><span id="rhythmCombo">COMBO <b>0</b></span><span id="rhythmAccuracy">ACCURACY <b>100%</b></span></div><div class="rhythm-pads" aria-label="Ember Beat lanes">${[0,1,2,3].map(lane=>`<button type="button" class="rhythm-pad lane-${lane}" data-rhythm-lane="${lane}" aria-label="Lane ${lane+1}">${["▲","■","●","◆"][lane]}</button>`).join("")}</div><div class="rhythm-track-intro"><small>NOW PLAYING • ${escapeHTML(track.difficulty||"NORMAL")}</small><b>${escapeHTML(track.title)}</b><span>${track.bpm} BPM • ${stars}</span></div><div id="rhythmCallout" class="rhythm-callout">GET READY</div><div id="rhythmCountdown" class="rhythm-countdown"><b>3</b><span>FIND YOUR LANES</span></div></div>`;
      startRhythmPerformance();
    }
    if (mode === "maze") {
      el.miniArena.innerHTML = `<div class="mini-world maze-world"><div class="maze-hud" data-mini-readout><span id="mazeLives">♥ ♥ ♥</span><span>MAZE <b id="mazeLevel">1</b></span><span>CHAIN <b id="mazeCombo">0</b></span></div><div id="mazeBoard" class="maze-board"></div><div id="mazeCallout" class="maze-callout">EAT THE EMBER TRAIL</div><div class="maze-controls" aria-label="Runaway directions"><button type="button" data-maze-dir="up" aria-label="Move up">▲</button><button type="button" data-maze-dir="left" aria-label="Move left">◀</button><button type="button" data-maze-dir="down" aria-label="Move down">▼</button><button type="button" data-maze-dir="right" aria-label="Move right">▶</button></div></div>`;
      buildMazeLevel(true); renderLives("mazeLives");
    }
    if (mode === "defense") {
      if (!mini.defenseResume || !restoreDefenseCheckpoint(mini.defenseResume)) {
        initializeDefenseRun(mini.defenseMapChoice, mini.defenseContract);
        renderDefenseWorld();
      }
    }
    if (mode === "memory") {
      el.miniArena.innerHTML = `<div class="mini-world memory-world memory-dx lost-signal"><div class="memory-stars"></div>${miniPetMarkup("memory-rizo")}<div class="memory-top" data-mini-readout><span id="memoryRule">CLEAN SIGNAL</span><span id="memoryHearts">♥ ♥ ♥</span></div><div class="memory-frequency">96.3 <i>RIZO PIRATE RADIO</i></div><div class="memory-board" id="memoryBoard">${[0,1,2,3].map(index=>`<button type="button" class="memory-rune rune-${index}" data-memory-rune="${index}" aria-label="Signal rune ${index+1}">${["☾","✦","◆","∞"][index]}</button>`).join("")}</div><div id="memoryCallout" class="memory-callout">LISTEN FOR THE CORRUPTION</div></div>`;
      renderLives("memoryHearts"); queueMiniTimeout(startMemoryRound, 500);
    }
    if (mode === "glide") {
      mini.glideY = Math.max(90, el.miniArena.clientHeight * .48);
      mini.glideSpawnAt = now() + 900;
      mini.glideWindAt = now() + 5200;
      el.miniArena.innerHTML = `<div class="mini-world glide-world"><div class="glide-clouds"></div><div id="glideGates"></div>${miniPetMarkup("glide-rizo")}<div class="glide-hud" data-mini-readout><span id="glideHearts">♥ ♥ ♥</span><span>THREAD <b id="glideStreak">0</b></span><span>DRAFT <b id="glideDraft">0/3</b></span></div><div id="glideWind" class="glide-wind" data-mini-readout>CALM AIR</div><div id="glideThermal" class="glide-thermal" data-mini-readout>CENTER 3 GATES → THERMAL</div><div class="glide-floor"></div></div>`;
      renderLives("glideHearts"); updateGlidePet();
    }
    if (mode === "breaker") {
      el.miniArena.innerHTML = `<div class="mini-world breaker-world"><div id="breakerBlocks" class="breaker-blocks"></div><div id="breakerBall" class="breaker-ball">✦</div>${miniPetMarkup("breaker-rizo")}<div class="breaker-hud" data-mini-readout><span id="breakerHearts">♥ ♥ ♥</span><span>FORGE <b id="breakerLevel">1</b></span><span>RALLY <b id="breakerStreak">0</b></span><span>CORE <b id="breakerCoreCount">0</b></span></div><div id="breakerPattern" class="breaker-pattern">LOADING MARK…</div><div id="breakerCallout" class="breaker-callout">BREAK THE CORE • COLLAPSE THE WALL</div></div>`;
      renderLives("breakerHearts"); setBreakerPaddle(.5); buildBreakerBoard(); resetBreakerBall(true);
    }
  }

  // Flavors the walk's opening line by the pet's rolled personality so the
  // same activity reads differently across pets instead of one generic line.
  const WALK_INTRO_LINES = {
    "CHAOTIC GOOD": "IS ALREADY RUNNING AHEAD.",
    "TINY CEO": "IS SUPERVISING THE TRAIL.",
    "SOFT MENACE": "IS WALKING SUSPICIOUSLY CALMLY.",
    "FOREST GREMLIN": "IS SNIFFING EVERYTHING.",
    "DRAMA FLAME": "IS NARRATING THIS WALK OUT LOUD.",
    "QUIET GENIUS": "IS QUIETLY MAPPING THE TRAIL.",
    "SNACK SCHOLAR": "IS ALREADY LOOKING FOR SNACKS.",
    "CERTIFIED HATER": "IS WALKING. RELUCTANTLY.",
    "LOYAL WEIRDO": "KEEPS CHECKING YOU'RE STILL THERE.",
    "MAIN CHARACTER": "IS WALKING LIKE THIS IS A MONTAGE."
  };
  function walkIntroLine() {
    return `${state.pet.name} ${WALK_INTRO_LINES[state.pet.personality] || "IS SNIFFING EVERYTHING."}`;
  }

  // Mid-walk fork: pauses spawning + the clock (mirrors the ad-pause pattern
  // below) and lets the player choose a safer or riskier back half of the
  // walk. This is the "branching interaction" the walk was missing.
  function setWalkCaption(title, text = "") {
    const caption = $("#walkCaption");
    if (!caption) return;
    caption.innerHTML = `<b>${escapeHTML(title)}</b>${text ? `<span>${escapeHTML(text)}</span>` : ""}`;
  }

  function walkDecisionConfig(index) {
    if (index === 0) return {
      title:"THE TRAIL SPLITS",
      choices:[
        {id:"safe", title:"STAY NEAR THE LANTERNS", copy:"Steady finds • calmer weather", risk:0, luck:1, biome:null},
        {id:"deep", title:"FOLLOW THE RUSTLING", copy:"Harder trail • rare encounters", risk:2, luck:0, biome:"moss"}
      ]
    };
    if (mini.walkPath === "deep" || mini.walkRisk >= 2) return {
      title:"SOMETHING MOVED AHEAD",
      choices:[
        {id:"stream", title:"CROSS THE BLACK STREAM", copy:"Stamina test • storm treasures", risk:2, luck:1, biome:"storm"},
        {id:"ruins", title:"ENTER THE ROOT RUINS", copy:"Instinct test • Shadow chance", risk:3, luck:2, biome:"moon"}
      ]
    };
    return {
      title:"RIZO STOPS TO LISTEN",
      choices:[
        {id:"meadow", title:"TAKE THE FLOWER FIELD", copy:"Bond and common treasures", risk:0, luck:2, biome:"moss"},
        {id:"lantern", title:"FOLLOW THE OLD LANTERN", copy:"Luck and strange signals", risk:1, luck:3, biome:"moon"}
      ]
    };
  }

  // Walk decisions pause the clock so reading never costs the player time.
  // Two forks occur per walk and can change the biome, weather and discovery pool.
  function maybeShowWalkFork() {
    if (mini.mode !== "walk" || !mini.active || mini.pausedByFork) return;
    if(mini.walkDecisionIndex>=2){maybeShowWalkEncounter();return;}
    const elapsed = 1 - Math.max(0, mini.endAt - now()) / miniDuration("walk");
    const threshold = mini.walkDecisionIndex === 0 ? .29 : .66;
    if (elapsed < threshold) return;
    const decision = walkDecisionConfig(mini.walkDecisionIndex);
    mini.pausedByFork = true;
    mini.pauseAt = now();
    setWalkCaption(decision.title, "Choose the kind of story this walk becomes.");
    const host = $("#walkFinds");
    if (!host) return;
    const fork = document.createElement("div");
    fork.className = "walk-fork";
    fork.innerHTML = decision.choices.map(choice => `<button type="button" class="walk-fork-btn" data-walk-fork="${choice.id}"><b>${escapeHTML(choice.title)}</b><span>${escapeHTML(choice.copy)}</span></button>`).join("");
    host.appendChild(fork);
    haptic(12);
  }

  function chooseWalkFork(path) {
    if (!mini.active || mini.mode !== "walk" || !mini.pausedByFork) return;
    const decision = walkDecisionConfig(mini.walkDecisionIndex);
    const choice = decision.choices.find(item => item.id === path);
    if (!choice) return;
    mini.walkChoices.push(choice.id);
    mini.walkPath = mini.walkDecisionIndex === 0 ? choice.id : `${mini.walkPath || "trail"}-${choice.id}`;
    mini.walkRisk += choice.risk || 0;
    mini.walkLuck += choice.luck || 0;
    mini.pausedByFork = false;
    mini.endAt += Math.max(0, now() - (mini.pauseAt || now()));
    mini.walkDecisionIndex += 1;
    $(".walk-fork")?.remove();
    mini.entities.filter(item=>item.kind==="walk").forEach(item=>item.node.remove());
    mini.entities=mini.entities.filter(item=>item.kind!=="walk");
    if (choice.biome && WALK_BIOMES[choice.biome]) {
      mini.walkBiome = WALK_BIOMES[choice.biome];
      if (choice.biome === "storm") mini.walkWeather = WALK_WEATHER.storm;
      else if (choice.biome === "moon") mini.walkWeather = WALK_WEATHER.mist;
      applyWalkWorldTheme();
    }
    const response = {
      safe:`${state.pet.name} KEEPS ONE EYE ON THE LANTERNS.`,
      deep:`${state.pet.name} PUSHES INTO THE DEEP BRUSH.`,
      stream:`${state.pet.name} SPLASHES ACROSS WITHOUT ASKING.`,
      ruins:`${state.pet.name} HEARS SOMETHING INSIDE THE ROOTS.`,
      meadow:`${state.pet.name} STOPS TO SMELL EVERY FLOWER.`,
      lantern:`THE LANTERN FLICKERS WHEN ${state.pet.name} GETS CLOSE.`
    }[choice.id] || `${state.pet.name} CHOOSES THE STRANGE WAY.`;
    setWalkCaption(mini.walkBiome.name, response);
    mini.score += choice.risk ? 2 : 1;
    mini.treasureRolls += choice.luck || 0;
    sfx(choice.risk >= 2 ? "event" : "spark");
    haptic(choice.risk >= 2 ? [10,16,10] : 8);
    spawnWalkFind();
  }

  const WALK_ENCOUNTERS={
    meadow:{icon:"🌼",title:"THE FLOWERS ARE FOLLOWING YOU",copy:"Rizo stops. Every flower stops a second later.",safe:"LEAVE ONE A SNACK",bold:"INVITE THEM HOME",ending:"THE GARDEN WALKED YOU HOME",quiet:"ONE FLOWER WAVES GOODBYE"},
    lantern:{icon:"☾",title:"THE LANTERN KNOWS YOUR NAME",copy:"It flashes once for every thing you put in your pocket.",safe:"SIT BESIDE THE LIGHT",bold:"ANSWER THE SIGNAL",ending:"SOMETHING ANSWERS BACK",quiet:"YOU KEEP ITS LITTLE SECRET"},
    stream:{icon:"ϟ",title:"A STAR UNDER THE WATER",copy:"The storm goes quiet. Something bright is caught between the stones.",safe:"MARK THE SPOT",bold:"REACH INTO THE STREAM",ending:"YOU BROUGHT THE STORM HOME",quiet:"THE STAR CAN WAIT UNTIL TOMORROW"},
    ruins:{icon:"◇",title:"YOUR SHADOW TAKES ONE MORE STEP",copy:"Rizo has stopped walking. The other set of footsteps has not.",safe:"BACK AWAY TOGETHER",bold:"SHOW IT YOUR POCKET FINDS",ending:"YOUR SHADOW SAYS THANK YOU",quiet:"TWO SETS OF FOOTSTEPS GO HOME"}
  };
  function maybeShowWalkEncounter(){
    if(mini.walkEncounter||mini.walkEnding||mini.pausedByFork)return;
    if(1-Math.max(0,mini.endAt-now())/miniDuration("walk")<.80)return;
    const id=mini.walkChoices[1]||"meadow",story=WALK_ENCOUNTERS[id]||WALK_ENCOUNTERS.meadow;
    mini.walkEncounter=id;mini.pausedByFork=true;mini.pauseAt=now();
    const ready=mini.walkNotes.length>=3;
    const card=document.createElement("div");card.className="walk-fork walk-encounter";
    card.innerHTML=`<div class="walk-encounter-intro"><i>${story.icon}</i><b>${story.title}</b><p>${story.copy}</p></div><button type="button" class="walk-fork-btn" data-walk-ending="quiet"><b>${story.safe}</b><span>A quiet ending • +6</span></button><button type="button" class="walk-fork-btn" data-walk-ending="bold"><b>${story.bold}</b><span>${ready?"Your 3 different finds fit the story • +18":"Needs 3 different finds. You have "+mini.walkNotes.length+" • risk losing 3 points"}</span></button>`;
    $("#walkFinds")?.appendChild(card);setWalkCaption("RIZO STOPS", "Take your time. The trail can wait.");sfx("event");haptic([8,16,8]);
  }
  function chooseWalkEnding(choice){
    if(!mini.active||mini.mode!=="walk"||!mini.pausedByFork||!mini.walkEncounter||mini.walkEnding)return;
    if(!["quiet","bold"].includes(choice))return;
    const story=WALK_ENCOUNTERS[mini.walkEncounter]||WALK_ENCOUNTERS.meadow;
    const success=choice==="bold"&&mini.walkNotes.length>=3;
    const gain=choice==="quiet"?6:success?18:-3;
    mini.walkEnding=success?story.ending:choice==="quiet"?story.quiet:"RIZO DECIDES YOU HAVE BEEN WEIRD ENOUGH";
    mini.score=Math.max(0,mini.score+gain);mini.hits+=1;
    if(success)mini.treasureRolls+=2;
    mini.endAt+=Math.max(0,now()-mini.pauseAt);mini.pausedByFork=false;
    $(".walk-encounter")?.remove();
    mini.entities.filter(item=>item.kind==="walk").forEach(item=>item.node.remove());mini.entities=mini.entities.filter(item=>item.kind!=="walk");
    $(".walk-world")?.classList.add("walk-homecoming");
    const notes=$("#walkNotes");if(notes)notes.innerHTML=`<b>${success?"A STRANGE LITTLE SOUVENIR":"A STORY TO TAKE HOME"}</b><span>${story.icon}</span><small>${escapeHTML(mini.walkEnding)}</small>`;
    setWalkCaption(mini.walkEnding,gain>0?`+${gain} • ${state.pet.name} WALKS A LITTLE CLOSER ON THE WAY BACK.`:"YOU LET IT GO. IT LETS YOU GO.");
    walkReaction(success?"awe":"celebrate");sfx(success?"reward":gain<0?"no":"spark");haptic(success?[8,16,24]:8);
  }
  function rememberWalkFind(data){
    if(["hazard","obstacle"].includes(data.type)||mini.walkNotes.some(note=>note.label===data.label)||mini.walkNotes.length>=3)return;
    mini.walkNotes.push({label:data.label,icon:data.icon});
    const host=$("#walkNotes");
    if(host)host.innerHTML=`<b>POCKET FINDS ${mini.walkNotes.length}/3</b><span>${mini.walkNotes.map(note=>`<i title="${escapeHTML(note.label)}">${note.icon}</i>`).join("")}${"<i>◇</i>".repeat(3-mini.walkNotes.length)}</span><small>${mini.walkNotes.length===3?"SOMETHING ON THIS TRAIL WILL RECOGNIZE THESE":"KEEP AN EYE OUT FOR SOMETHING DIFFERENT"}</small>`;
    if(mini.walkNotes.length===3){$(".walk-world")?.classList.add("notes-ready");sfx("perfect");}
  }

  function applyWalkWorldTheme() {
    const world = $(".walk-world");
    if (!world) return;
    world.className = `mini-world walk-world ${mini.walkBiome.className} ${mini.walkWeather.className}`;
    world.dataset.walkBiome = mini.walkBiome.id;
  }

  function updateMiniClock() {
    if (!mini.active || mini.pausedByAd) return;
    // Defense owns a throttled HUD pipeline inside updateDefenseGame(). Calling the
    // full renderer from this 50ms timer used to rebuild panels/ability cards twenty
    // times per second and became one of the largest sources of dense-wave jank.
    if (mini.mode === "defense") return;
    if (mini.mode === "rhythm" && !mini.rhythmReady) { el.miniTimer.textContent = "READY"; el.miniScore.textContent = "0 PTS"; return; }
    if (mini.mode === "walk" && !mini.pausedByFork) maybeShowWalkFork();
    if (mini.pausedByFork) return;
    const remaining = Math.max(0, mini.endAt - now());
    el.miniTimer.textContent = (remaining / 1000).toFixed(1);
    el.miniScore.textContent = `${Math.max(0, Math.floor(mini.score))} PTS`;
    if (remaining <= 0) finishMiniGame();
  }

  function updateMiniFrame(timestamp) {
    if (!mini.active) return;
    const rawFrame=Math.max(0,timestamp-mini.lastFrame),frameDiscontinuity=!Number.isFinite(rawFrame)||rawFrame>250,dt=frameDiscontinuity?0:Math.min(.04,rawFrame/1000),defenseFrameDt=frameDiscontinuity?0:Math.min(.12,rawFrame/1000);
    if(frameDiscontinuity&&mini.mode==="defense"&&mini.defense){mini.defense.frameDiscontinuities=(mini.defense.frameDiscontinuities||0)+1;mini.defense.lastDiscontinuityMs=Number.isFinite(rawFrame)?rawFrame:0;}
    if(mini.mode==="defense"&&mini.defense&&!frameDiscontinuity)defenseRecordFramePerformance(rawFrame);
    if(frameDiscontinuity&&mini.mode==="defense"&&mini.defense){mini.defense.simAccumulator=0;mini.defense.presentationAccumulator=0;}
    mini.lastFrame = timestamp;
    if (!mini.pausedByAd) {
      if (mini.mode === "power") updatePowerGame(dt);
      if (mini.mode === "spark") updateSparkGame(dt);
      if (mini.mode === "forage") updateForageGame(dt);
      if (mini.mode === "rush") updateRushGame(dt);
      if (mini.mode === "walk" && !mini.pausedByFork) updateWalkGame(dt);
      if (mini.mode === "rhythm") updateRhythmGame(dt);
      if (mini.mode === "glide") updateGlideGame(dt);
      if (mini.mode === "breaker") updateBreakerGame(dt);
      if (mini.mode === "maze") updateMazeGame(dt);
      if (mini.mode === "defense") updateDefenseGame(defenseFrameDt * (mini.defense?.speed || 1), defenseFrameDt);
    }
    mini.frame = requestAnimationFrame(updateMiniFrame);
  }

  function updatePowerZoneVisual() {
    const zone = $("#timingPerfectZone");
    if (zone) zone.style.left = `${mini.powerZone * 100}%`;
  }

  const POWER_CALLS=["jab","body","hook"];
  function nextPowerCall(force=false){
    const previous=mini.powerCall;let next=previous;
    while(next===previous&&POWER_CALLS.length>1)next=POWER_CALLS[Math.floor(Math.random()*POWER_CALLS.length)];
    mini.powerCall=next;mini.powerCallAt=now()+1900+Math.random()*900;
    const call=$("#powerCall");if(call)call.textContent=next.toUpperCase();
    $$("[data-power-tech]").forEach(btn=>btn.classList.toggle("called",btn.dataset.powerTech===next));
    if(force){const label=$("#timingCallout");if(label)label.textContent=`COACH: ${next.toUpperCase()}`;}
  }

  function updatePowerGame(dt) {
    const t=now(), bag=$("#trainingBag"), callout=$("#timingCallout");
    if(!mini.powerCallAt)nextPowerCall(true);
    if(t>=mini.powerCallAt&&!mini.powerGuardUntil)nextPowerCall();
    if(!mini.powerGuardAt)mini.powerGuardAt=t+3400+Math.random()*1800;
    if(!mini.powerGuardUntil && t>=mini.powerGuardAt){mini.powerGuardUntil=t+620;mini.powerGuardAt=t+3500+Math.random()*2200;bag?.classList.add("guard");if(callout){callout.textContent="BAG FEINT • HOLD";callout.dataset.grade="guard";}sfx("no");}
    if(mini.powerGuardUntil && t>=mini.powerGuardUntil){mini.powerGuardUntil=0;bag?.classList.remove("guard");if(mini.powerEngaged){mini.powerGuardReads+=1;mini.powerHeat=clamp(mini.powerHeat+8,0,100);mini.score+=2;if(callout){callout.textContent="GOOD READ +2";callout.dataset.grade="read";}const heat=$("#powerHeat");if(heat)heat.textContent=`${Math.round(mini.powerHeat)}%`;}else if(callout){callout.textContent="MAKE A READ • THEN FEINTS COUNT";callout.dataset.grade="idle";}}
    mini.powerZone += (mini.powerZoneTarget - mini.powerZone) * Math.min(1, dt * 5.5);
    mini.needle += mini.needleDir * mini.needleSpeed * dt;
    if (mini.needle >= 1) { mini.needle = 1; mini.needleDir = -1; }
    if (mini.needle <= 0) { mini.needle = 0; mini.needleDir = 1; }
    const needle = $("#timingNeedle");
    if (needle) needle.style.left = `${mini.needle * 100}%`;
    updatePowerZoneVisual();
  }

  function powerTap(technique=mini.powerCall) {
    const t=now();
    if(t<(mini.powerTapLockUntil||0))return;
    mini.powerTapLockUntil=t+175;
    mini.powerEngaged=true;
    if(mini.powerGuardUntil>t){
      mini.powerGuardUntil=0;mini.powerStreak=0;mini.powerHeat=clamp(mini.powerHeat-22,0,100);mini.score=Math.max(0,mini.score-3);$("#trainingBag")?.classList.remove("guard");const callout=$("#timingCallout");if(callout){callout.textContent="COUNTERED -3";callout.dataset.grade="0";}const streak=$("#powerStreak"),heat=$("#powerHeat");if(streak)streak.textContent="0";if(heat)heat.textContent=`${Math.round(mini.powerHeat)}%`;$("#miniPet")?.classList.add("forage-hit");queueMiniTimeout(()=>$("#miniPet")?.classList.remove("forage-hit"),280);sfx("hit");haptic([18,24,18]);return;
    }
    if(technique!==mini.powerCall){
      mini.powerWrongCalls+=1;mini.powerStreak=0;mini.powerHeat=clamp(mini.powerHeat-12,0,100);mini.score=Math.max(0,mini.score-2);
      const callout=$("#timingCallout");if(callout){callout.textContent=`WRONG SHOT • COACH SAID ${mini.powerCall.toUpperCase()}`;callout.dataset.grade="wrong";}
      const streak=$("#powerStreak"),heat=$("#powerHeat");if(streak)streak.textContent="0";if(heat)heat.textContent=`${Math.round(mini.powerHeat)}%`;
      arcadeSfx("fail");haptic([12,18,12]);nextPowerCall();return;
    }
    mini.powerCallsRead+=1;
    const distance = Math.abs(mini.needle - mini.powerZone);
    const base = distance <= .05 ? 5 : distance <= .12 ? 3 : distance <= .22 ? 1 : 0;
    if (base >= 3) mini.powerStreak += 1; else if (!base) mini.powerStreak = 0; else mini.powerStreak = Math.max(0, mini.powerStreak - 1);
    mini.powerBestStreak = Math.max(mini.powerBestStreak, mini.powerStreak);
    const mult = Math.min(3, 1 + Math.floor(mini.powerStreak / 4));
    const points = base * mult;
    mini.score += points; if(base) mini.hits += 1;
    mini.powerHeat = clamp(mini.powerHeat + (base === 5 ? 18 : base === 3 ? 9 : base ? 3 : -14), 0, 100);
    mini.needleSpeed = Math.min(1.52, mini.needleSpeed + (base >= 3 ? .025 : .012));
    if (base === 5 || (base && mini.hits % 4 === 0)) {
      const edge = .18 + Math.random() * .64;
      mini.powerZoneTarget = edge;
    }
    if(base>=3)nextPowerCall();
    if (mini.powerHeat >= 100) {
      mini.powerHeat = 35;
      mini.score += 10;
      mini.powerZoneTarget = .5;
      sensoryBurst("OVERDRIVE +10", "#ffd54a", 18); sfx("reward"); haptic([14,18,26]);
    }
    const label = base === 5 ? `PERFECT x${mult} +${points}` : base === 3 ? `GREAT x${mult} +${points}` : base === 1 ? `GLANCE +${points}` : "WHIFF • STREAK LOST";
    const pet = $("#miniPet"), bag = $("#trainingBag"), callout = $("#timingCallout");
    pet?.classList.remove("mini-punch"); bag?.classList.remove("bag-hit"); void pet?.offsetWidth; pet?.classList.add("mini-punch");
    if (base) bag?.classList.add("bag-hit");
    if (callout) { callout.textContent = label; callout.dataset.grade = String(base); }
    const streak = $("#powerStreak"), heat = $("#powerHeat"), cracks = $("#bagCracks");
    if (streak) streak.textContent = String(mini.powerStreak);
    if (heat) heat.textContent = `${Math.round(mini.powerHeat)}%`;
    if (cracks) cracks.dataset.crack = String(Math.min(4, Math.floor(mini.hits / 6)));
    if (base === 5) { sfx("perfect"); sensoryBurst(mini.powerStreak >= 4 ? `x${mult}` : "PERFECT", "#16c8ff", 10); haptic([12,20,22]); }
    else if (base) sfx("hit", base * 3); else { arcadeSfx("fail"); haptic(18); }
  }

  function moveSparkTarget(forceType = null) {
    const target = $("#miniTarget");
    if (!target) return;
    const rect = el.miniArena.getBoundingClientRect(), size = 64, t=now(), frenzy=t<mini.sparkFeverUntil;
    const x = 14 + Math.random() * Math.max(1, rect.width - size - 28);
    const y = 36 + Math.random() * Math.max(1, rect.height - size - 170);
    const roll = Math.random();
    mini.sparkType = forceType || (frenzy ? (roll>.68?"gold":"normal") : (mini.hits > 3 && roll < .16 ? "shadow" : roll > .88 ? "gold" : "normal"));
    target.className = `spark-orb ${mini.sparkType}`;
    target.textContent = mini.sparkType === "shadow" ? "✕" : mini.sparkType === "gold" ? "◆" : "★";
    target.setAttribute("aria-label", mini.sparkType === "shadow" ? "Decoy spark - do not tap" : mini.sparkType === "gold" ? "Golden spark" : "Catch spark");
    target.style.left = `${x}px`; target.style.top = `${y}px`;
    mini.sparkX = x; mini.sparkY = y;
    mini.sparkExpiresAt = t + (frenzy ? (mini.sparkType === "gold" ? 560 : 470) : mini.sparkType === "shadow" ? 720 : mini.sparkType === "gold" ? 900 : Math.max(620, 1040 - mini.hits * 9));
    const rule=$("#sparkRule"); if(rule) rule.textContent=frenzy ? "SPARK RUSH • DON'T MISS" : mini.sparkType === "shadow" ? "DECOY • DON'T TAP" : mini.sparkType === "gold" ? "GOLD SIGNAL • GO" : "CATCH THE LIGHT";
  }

  function sparkRiskMultiplier(){ return Math.min(4, 1 + Math.floor(Math.max(0,mini.sparkStreak||0) / 5)); }
  function sparkBankMultiplier(){ return Math.min(3, 1 + Math.floor(Math.max(0,mini.sparkStreak||0) / 4)); }
  function updateSparkBankHUD(){
    const stash=$("#sparkStash"),banked=$("#sparkBanked"),bank=$("#sparkBank"),streak=$("#sparkStreak"),risk=$("#sparkRisk"),payout=$("#sparkPayout");
    const held=Math.max(0,Math.floor(mini.sparkStash||0)),chain=Math.max(0,mini.sparkStreak||0),bankMult=sparkBankMultiplier();
    if(stash)stash.textContent=String(held);
    if(banked)banked.textContent=String(Math.max(0,Math.floor(mini.sparkBanked||0)));
    if(streak)streak.textContent=String(chain);
    if(risk){
      risk.textContent=`x${sparkRiskMultiplier()}`;
      risk.classList.toggle("hot",chain>=10);
      risk.classList.toggle("warm",chain>=5&&chain<10);
    }
    if(payout)payout.textContent=held?`BANK +${held*bankMult}`:"NOTHING TO BANK";
    const hud=$(".spark-hud");
    if(hud)hud.classList.toggle("at-risk",held>=6);
    if(bank){
      bank.disabled=held<=0;
      bank.dataset.mult=String(bankMult);
      const label=bank.querySelector("b");
      if(label)label.textContent=bankMult>1?`BANK x${bankMult}`:"BANK STASH";
    }
    // Six clean reads in a row arms Spark Rush. Show the fuse, not just the fire.
    const rule=$("#sparkRule");
    if(rule&&now()>=(mini.sparkFeverUntil||0)){
      const toRush=chain?6-(chain%6):6;
      rule.textContent=chain>=1?`RUSH IN ${toRush===6?6:toRush} • RISK x${sparkRiskMultiplier()}`:"CATCH • THEN DECIDE WHEN TO BANK";
    }
  }

  function bankSparkStash(auto=false){const held=Math.max(0,Math.floor(mini.sparkStash||0));if(!held)return false;const mult=auto?1:sparkBankMultiplier();const gain=held*mult;mini.score+=gain;mini.sparkBanked+=gain;mini.sparkStash=0;mini.sparkBanks+=1;if(auto)mini.sparkAutoBanked=true;const trail=$("#sparkTrail");if(trail){trail.textContent=`${auto?"AUTO ":""}BANK x${mult} • +${gain}`;trail.classList.remove("pop");void trail.offsetWidth;trail.classList.add("pop");}updateSparkBankHUD();sfx("reward");haptic([8,12,8]);return true;}
  function spillSparkStash(reason="SIGNAL LOST"){const lost=Math.max(0,Math.floor(mini.sparkStash||0));if(lost){mini.sparkLost+=lost;mini.sparkStash=0;}mini.sparkStreak=0;updateSparkBankHUD();const trail=$("#sparkTrail");if(trail){trail.textContent=`${reason}${lost?` • -${lost} STASH`:""}`;trail.classList.remove("pop");void trail.offsetWidth;trail.classList.add("pop");}}

  function startSparkFrenzy(){
    mini.sparkFeverUntil=now()+2700;mini.sparkFrenzies+=1;$(".spark-world")?.classList.add("frenzy");
    const trail=$("#sparkTrail");if(trail){trail.textContent="SPARK RUSH • x2";trail.classList.remove("pop");void trail.offsetWidth;trail.classList.add("pop");}
    sensoryBurst("SPARK RUSH","#ffd54a",12);sfx("reward");haptic([8,8,12]);
  }

  function updateSparkGame() {
    const t=now();
    if(mini.sparkFeverUntil && t>=mini.sparkFeverUntil){mini.sparkFeverUntil=0;$(".spark-world")?.classList.remove("frenzy");const rule=$("#sparkRule");if(rule)rule.textContent="CATCH THE LIGHT";}
    if (!mini.sparkExpiresAt || t < mini.sparkExpiresAt) return;
    if (mini.sparkType === "shadow") {
      mini.sparkAvoided += 1; mini.sparkStreak += 1; mini.sparkBestStreak = Math.max(mini.sparkBestStreak, mini.sparkStreak); mini.sparkStash += 1;updateSparkBankHUD();
      const trail=$("#sparkTrail"); if(trail){trail.textContent="GOOD READ +1";trail.classList.remove("pop");void trail.offsetWidth;trail.classList.add("pop");}
      sfx("perfect");
    } else {
      spillSparkStash("TOO SLOW");arcadeSfx("fail");if(mini.sparkFeverUntil){mini.sparkFeverUntil=0;$(".spark-world")?.classList.remove("frenzy");}
    }
    updateSparkBankHUD();
    moveSparkTarget();
  }

  function catchSpark() {
    const pet = $("#miniPet"), target = $("#miniTarget"), trail = $("#sparkTrail");
    if (!target || !pet) return;
    if (mini.sparkType === "shadow") {
      mini.score = Math.max(0, mini.score - 2); spillSparkStash("SHADOW STOLE IT");
      if (trail) { trail.textContent = mini.sparkLost ? "SHADOW STOLE THE STASH" : "DECOY -2"; trail.classList.remove("pop"); void trail.offsetWidth; trail.classList.add("pop"); }
      pet.classList.add("forage-hit"); queueMiniTimeout(()=>pet.classList.remove("forage-hit"),300); arcadeSfx("fail"); haptic([16,20,16]);
      updateSparkBankHUD(); moveSparkTarget(); return;
    }
    const wasFrenzy=now()<mini.sparkFeverUntil;mini.hits += 1; mini.sparkStreak += 1; mini.sparkBestStreak = Math.max(mini.sparkBestStreak, mini.sparkStreak);
    const mult = sparkRiskMultiplier();
    const gain = (mini.sparkType === "gold" ? 5 : 1) * (wasFrenzy?2:1); mini.sparkStash += gain;updateSparkBankHUD();
    pet.style.left = `${mini.sparkX + 6}px`; pet.style.top = `${mini.sparkY + 28}px`; pet.classList.add("spark-dash"); queueMiniTimeout(()=>pet.classList.remove("spark-dash"),180);
    if (trail) { trail.textContent = mini.sparkType === "gold" ? `GOLD${wasFrenzy?" RUSH":""} • STASH +${gain}` : wasFrenzy?`RUSH ${mini.sparkStreak} • STASH +${gain}`:mini.sparkStreak > 1 ? `CHAIN ${mini.sparkStreak} • RISK x${mult}` : "STASH +1"; trail.classList.remove("pop"); void trail.offsetWidth; trail.classList.add("pop"); }
    updateSparkBankHUD();
    if(!wasFrenzy && mini.sparkStreak>0 && mini.sparkStreak%6===0)startSparkFrenzy();
    sfx(mini.sparkType === "gold" ? "reward" : "spark", mini.hits); haptic(mini.sparkType === "gold" ? [8,10,14] : 8); moveSparkTarget();
  }

  const FORAGE_FOODS = [
    {id:"berry",icon:"🍓",name:"BERRY"},{id:"meat",icon:"🍗",name:"SNACK"},{id:"fruit",icon:"🍎",name:"FRUIT"}
  ];
  function buildForageOrder(){
    const length=clamp(3+Math.floor((mini?.forageOrdersDone||0)/2),3,5),order=[];
    while(order.length<length){const choices=FORAGE_FOODS.filter(food=>food.id!==order.at(-1));order.push((choices[Math.floor(Math.random()*choices.length)]||FORAGE_FOODS[0]).id);}
    return order;
  }
  function updateForageOrderHUD(){
    const host=$("#forageOrder"); if(!host)return;
    host.innerHTML=`<small>RIZO WANTS</small>${mini.forageOrder.map((id,index)=>{const food=FORAGE_FOODS.find(item=>item.id===id);return `<span class="${index===mini.forageOrderIndex?"active":index<mini.forageOrderIndex?"done":""}">${food?.icon||"?"}</span>`;}).join("")}`;
  }
  function advanceForageOrder(){
    mini.forageOrderIndex+=1;
    if(mini.forageOrderIndex>=mini.forageOrder.length){
      mini.forageOrdersDone+=1;mini.score+=10+Math.min(8,mini.forageOrdersDone*2);mini.treasureRolls+=1;
      if(mini.forageOrdersDone%2===0){mini.forageRushUntil=now()+3600;sensoryBurst("PICNIC PANIC • PICK FAST","#ffd76a",16);arcadeSfx("win");}
      else sensoryBurst(`LUNCH ${mini.forageOrdersDone} PACKED`,`#9eff75`,12);
      mini.forageOrder=buildForageOrder();mini.forageOrderIndex=0;
    }
    updateForageOrderHUD();
  }

  function setForageLane(lane) {
    mini.lane = clamp(Math.round(lane), 0, 2);
    const pet = $("#miniPet");
    if (pet) pet.style.left = `${[16.7,50,83.3][mini.lane]}%`;
  }

  // One readable decision row at a time. Food is chosen for the current ticket,
  // never for a ticket that will be stale by the time the row reaches Rizo.
  function createForageDrop(lane,{kind="wanted",wanted=null}={}) {
    const host=$("#forageDrops"); if(!host)return;
    const wantedId=wanted||mini.forageOrder[mini.forageOrderIndex];
    const bad=kind==="bad",rare=kind==="rare";
    const foods=FORAGE_FOODS.filter(food=>kind==="wrong"?food.id!==wantedId:food.id===wantedId);
    const food=foods[Math.floor(Math.random()*foods.length)]||FORAGE_FOODS[0];
    const node=document.createElement("div");
    node.className=`forage-drop ${bad?"bad":"good"} ${rare?"rare":""}`;
    node.textContent=bad?"🍄":rare?"💎":food.icon;
    node.style.left=`${[16.7,50,83.3][lane]}%`;
    node.setAttribute("aria-label",bad?"Mushroom: spoils the chain":rare?"Prism: bonus, no ticket progress":food.name);
    host.appendChild(node);
    const panic=now()<mini.forageRushUntil;
    const travel=panic?1.05:Math.max(1.28,1.85-mini.forageOrdersDone*.09);
    const y=112,catchY=Math.max(166,el.miniArena.clientHeight-115);
    mini.entities.push({kind:"forage",node,lane,good:!bad,rare,foodId:bad||rare?null:food.id,y,speed:(catchY-y)/travel,caught:false});
    node.style.transform=`translate(-50%,${y}px)`;
  }

  function spawnForageItem() {
    if(now()<mini.forageNextAt||mini.entities.some(item=>item.kind==="forage"&&!item.caught))return;
    const wanted=mini.forageOrder[mini.forageOrderIndex];
    const lane=mini.forageRows===0?2:Math.floor(Math.random()*3);
    mini.forageRows+=1;
    createForageDrop(lane,{kind:"wanted",wanted});
    createForageDrop((lane+1)%3,{kind:"wrong",wanted});
    // A prism is a visible detour: points now, but the lunch still needs its food.
    createForageDrop((lane+2)%3,{kind:mini.forageRows%4===0?"rare":"bad",wanted});
  }

  function forageFeedback(copy,good=true){
    const ticket=$("#forageTicketState");
    if(ticket){ticket.textContent=copy;ticket.dataset.result=good?"good":"bad";}
    mini.forageFeedbackUntil=now()+700;
  }

  function updateForageGame(dt) {
    const height=el.miniArena.clientHeight,panic=now()<mini.forageRushUntil,world=$(".forage-world");
    world?.classList.toggle("picnic-panic",panic);
    const ticket=$("#forageTicketState");
    if(ticket&&now()>=mini.forageFeedbackUntil){
      ticket.textContent=panic?"PICNIC PANIC • KEEP PACKING":`LUNCH ${mini.forageOrdersDone+1} • ${mini.forageOrderIndex}/${mini.forageOrder.length} PACKED`;
      ticket.dataset.result="";
    }
    const row=mini.entities.filter(item=>item.kind==="forage"&&!item.caught);
    const catchY=Math.max(166,height-115);
    for(const item of row){item.y+=item.speed*dt;item.node.style.transform=`translate(-50%,${item.y}px)`;}
    if(!row.length||row[0].y<catchY)return;
    const picked=row.find(item=>item.lane===mini.lane);
    if(picked){
      const wanted=mini.forageOrder[mini.forageOrderIndex];
      if(picked.rare){
        mini.score+=7;mini.hits+=1;mini.treasureRolls+=1;
        forageFeedback("PRISM +7 • STILL NEED THE FOOD");sfx("reward");
      }else if(picked.good&&picked.foodId===wanted){
        mini.hits+=1;mini.forageStreak+=1;mini.forageBestStreak=Math.max(mini.forageBestStreak,mini.forageStreak);
        const gain=3*Math.min(3,1+Math.floor(mini.forageStreak/4));mini.score+=gain;
        const completes=mini.forageOrderIndex===mini.forageOrder.length-1;
        advanceForageOrder();
        forageFeedback(completes?`LUNCH ${mini.forageOrdersDone} PACKED!`:`THAT'S THE ONE! +${gain}`);
        sfx(completes?"reward":"eat");haptic(completes?[8,10,16]:8);
      }else{
        mini.score=Math.max(0,mini.score-(picked.good?1:4));mini.forageStreak=0;mini.forageMistakes+=1;
        forageFeedback(picked.good?"WRONG FOOD • SAME REQUEST":"MUSHROOM?! RIZO SENT IT BACK",false);
        arcadeSfx("fail");haptic([12,16,12]);
      }
      const pet=$("#miniPet"),good=picked.rare||picked.good&&picked.foodId===wanted;
      pet?.classList.add(good?"forage-catch":"forage-hit");
      queueMiniTimeout(()=>pet?.classList.remove("forage-catch","forage-hit"),280);
      const streak=$("#forageStreak");if(streak)streak.textContent=String(mini.forageStreak);
    }
    for(const item of row){
      item.caught=true;item.node.classList.add(item===picked?"caught":"passed");
      queueMiniTimeout(()=>item.node.remove(),180);
    }
    mini.entities=mini.entities.filter(item=>!row.includes(item));
    mini.forageNextAt=now()+(panic?170:320);
  }

  // A route is a guaranteed pickup, two authored clears, then a physical door.
  // All objects share a speed so their jump spacing cannot collapse mid-route.
  function spawnRushEntity(first=false) {
    const host=$("#rushEntities");if(!host)return;
    if(!first&&mini.entities.some(item=>item.kind==="rush"&&item.type==="depot"))return;
    mini.rushRoute+=1;
    const width=el.miniArena.clientWidth,route=mini.rushRoute;
    const speed=210+Math.min(48,(route-1)*12),start=first?width*.80:width+45;
    const pattern=route%3===1?["stump","stump"]:route%3===2?["stump","tall"]:["tall","stump"];
    const add=(type,x,requiredJump=0)=>{
      const node=document.createElement("div");node.className=`rush-entity ${type}`;
      node.innerHTML=type==="prism"?"◆":type==="flame"?"✦":type==="depot"?`<small>DELIVER</small><b>${String(route).padStart(2,"0")}</b>`:type==="tall"?"<small>↑↑</small>":"<small>↑</small>";
      node.style.transform=`translateX(${x}px)`;
      if(type==="flame"||type==="prism")node.style.bottom=`${48+requiredJump+10}px`;
      host.appendChild(node);
      mini.entities.push({kind:"rush",node,type,x,speed,handled:false,requiredJump,nearMissScored:false,minClearance:Infinity});
    };
    add("prism",start,0);
    add(pattern[0],start+240);
    add("flame",start+240,pattern[0]==="tall"?164:126);
    add(pattern[1],start+570);
    add("flame",start+570,pattern[1]==="tall"?164:126);
    add("depot",start+900);
    const hud=$("#rushRoute");if(hud)hud.textContent=`ROUTE ${String(route).padStart(2,"0")} • ${["BACKSTREET","HIGH RISE","LAST BLOCK"][(route-1)%3]}`;
    $(".rush-world")?.setAttribute("data-route",String((route-1)%3));
    rushDeliveryHUD();
  }

  function rushDeliveryHUD(){
    $(".rush-world")?.classList.toggle("has-parcel",mini.rushParcel);
    const delivery=$("#rushDelivery");
    if(delivery)delivery.textContent=mini.rushParcel?`◆ ON BOARD  •  ${"✓".repeat(mini.rushParcelClears)}${"○".repeat(Math.max(0,2-mini.rushParcelClears))}  →  DOOR` : "FIND ◆ • KEEP THE PACKAGE SAFE";
  }
  function rushCallout(copy){const node=$("#rushCallout");if(node)node.textContent=copy;}
  function rushJump() {
    if(mini.lives<=0)return;
    if(mini.jumpY<=3){mini.jumpV=515;mini.rushAirJumps=0;sfx("jump");haptic(9);return;}
    if(mini.rushAirJumps<1){mini.jumpV=Math.max(395,mini.jumpV+245);mini.rushAirJumps+=1;$("#miniPet")?.classList.add("rush-double");queueMiniTimeout(()=>$("#miniPet")?.classList.remove("rush-double"),220);sfx("spark");haptic([6,8]);}
  }

  function updateRushGame(dt) {
    if(mini.lives<=0)return;
    const width=el.miniArena.clientWidth,wasAir=mini.jumpY>0;
    mini.jumpV-=1125*dt;mini.jumpY=Math.max(0,mini.jumpY+mini.jumpV*dt);
    const pet=$("#miniPet"),world=$(".rush-world");
    if(mini.jumpY<=0){
      mini.jumpY=0;mini.jumpV=0;mini.rushAirJumps=0;
      if(wasAir){mini.rushLandingUntil=now()+130;pet?.classList.add("rush-land");queueMiniTimeout(()=>pet?.classList.remove("rush-land"),130);}
    }
    if(pet)pet.style.setProperty("--jump-y",`${mini.jumpY}px`);
    const tag=$(".rush-parcel-tag");if(tag)tag.style.bottom=`${74+mini.jumpY}px`;
    mini.rushRoad+=dt*(210+Math.min(48,(mini.rushRoute-1)*12));
    world?.style.setProperty("--road",`${-mini.rushRoad}px`);
    mini.distanceCarry+=dt*2;if(mini.distanceCarry>=1){const earned=Math.floor(mini.distanceCarry);mini.score+=earned;mini.distanceCarry-=earned;}
    const petX=width*.22;
    for(const entity of [...mini.entities]){
      if(entity.kind!=="rush")continue;
      const previous=entity.x;entity.x-=entity.speed*dt;entity.node.style.transform=`translateX(${entity.x}px)`;
      const crosses=entity.x<petX+36&&previous>petX-36;
      if(!entity.handled&&crosses){
        if(entity.type==="prism"||entity.type==="flame"){
          if(Math.abs(mini.jumpY-entity.requiredJump)<(entity.type==="prism"?44:36)){
            entity.handled=true;entity.node.classList.add("collected");mini.hits+=1;
            if(entity.type==="prism"){
              mini.rushParcel=true;mini.rushParcelClears=0;mini.rushTips=0;rushDeliveryHUD();
              rushCallout("PACKAGE ON BOARD • TWO CLEARS, THEN LAND AT THE DOOR");sfx("reward");haptic([6,10,6]);
            }else{mini.rushTips+=3;mini.score+=3;rushCallout("AIR MAIL +3 • ONE MORE JUMP IF YOU NEED IT");sfx("spark");}
          }
        }else if(entity.type==="depot"){
          if(mini.rushParcel&&mini.rushParcelClears>=2&&mini.jumpY<44){
            entity.handled=true;mini.rushDeliveries+=1;mini.rushParcel=false;
            const gain=14+mini.rushDeliveries*3+mini.rushTips;mini.score+=gain;
            const receipt=$("#rushReceipt");if(receipt){receipt.textContent=`SIGNED. SEALED. +${gain}`;receipt.classList.add("show");queueMiniTimeout(()=>receipt.classList.remove("show"),1250);}
            entity.node.classList.add("delivered");rushDeliveryHUD();rushCallout(`DELIVERY ${mini.rushDeliveries} • RIZO DOES NOT RING TWICE.`);arcadeSfx("win");haptic([8,14,22]);
          }
        }else{
          const needed=entity.type==="tall"?94:56;
          entity.minClearance=Math.min(entity.minClearance,mini.jumpY-needed);
          if(mini.jumpY<needed){
            // Contact is never a clean clear, even during the shared i-frames.
            entity.handled=true;
            if(now()>mini.invulnerableUntil){
              loseArcadeLife();mini.rushStreak=0;
              if(mini.rushParcel){mini.rushParcel=false;mini.rushParcelClears=0;mini.rushPackagesLost+=1;}
              mini.invulnerableUntil=now()+950;renderLives("rushHearts");rushDeliveryHUD();
              const streak=$("#rushStreak");if(streak)streak.textContent="0";
              rushCallout(mini.lives?"PACKAGE DOWN • NEXT PICKUP IS YOUR COMEBACK":"RIZO HAS CLOCKED OUT.");
              pet?.classList.add("rush-hurt");queueMiniTimeout(()=>pet?.classList.remove("rush-hurt"),500);arcadeSfx("fail");haptic([18,25,18]);
              if(mini.lives<=0)mini.endAt=Math.min(mini.endAt,now()+350);
            }
          }
        }
      }
      if(!entity.handled&&["stump","tall"].includes(entity.type)&&entity.x<petX-36){
        entity.handled=true;mini.rushClears+=1;mini.rushStreak+=1;mini.rushBestStreak=Math.max(mini.rushBestStreak,mini.rushStreak);
        const close=entity.minClearance>=0&&entity.minClearance<22;mini.score+=close?5:3;
        if(mini.rushParcel)mini.rushParcelClears=Math.min(2,mini.rushParcelClears+1);
        const streak=$("#rushStreak");if(streak)streak.textContent=String(mini.rushStreak);rushDeliveryHUD();
        rushCallout(close?"SHOE SCUFF +5 • BARELY MADE IT":mini.rushParcelClears>=2?"DOOR AHEAD • LAND TO DELIVER":"CLEAN • KEEP IT IN ONE PIECE");sfx("perfect");
      }
      if(entity.type==="depot"&&!entity.handled&&entity.x<petX-45){
        entity.handled=true;if(mini.rushParcel){mini.rushPackagesLost+=1;mini.rushParcel=false;mini.rushParcelClears=0;rushDeliveryHUD();rushCallout("MISSED THE DOOR • LAND BEFORE THE NEXT ONE");sfx("no");}
      }
      if(entity.x<-90){entity.node.remove();mini.entities=mini.entities.filter(item=>item!==entity);}
    }
  }

  const WALK_OBJECTS = {
    leaf:{icon:"🍂",label:"CRUNCHY LEAF",points:1,type:"good",reaction:"inspect"},
    ember:{icon:"✦",label:"LOST EMBER",points:3,type:"good",reaction:"celebrate"},
    flower:{icon:"🌼",label:"MOON FLOWER",points:2,type:"good",reaction:"inspect"},
    strange:{icon:"?",label:"STRANGE SIGNAL",points:6,type:"rare",reaction:"awe"},
    puddle:{icon:"💧",label:"DEEP PUDDLE",points:-2,type:"hazard",reaction:"splash"},
    friend:{icon:"🐛",label:"TINY FRIEND",points:3,type:"good",reaction:"inspect"},
    mushroom:{icon:"🍄",label:"MOSS MUSHROOM",points:2,type:"good",reaction:"sniff"},
    seed:{icon:"◇",label:"FOREST SEED",points:5,type:"rare",reaction:"awe"},
    moonleaf:{icon:"☾",label:"MOON LEAF",points:4,type:"good",reaction:"awe"},
    star:{icon:"★",label:"FALLEN STAR",points:7,type:"rare",reaction:"celebrate"},
    storm:{icon:"ϟ",label:"STORM SHARD",points:7,type:"rare",reaction:"shock"},
    thread:{icon:"⌁",label:"GOLD THREAD",points:8,type:"rare",reaction:"awe"},
    log:{icon:"▰",label:"FALLEN LOG",points:2,type:"obstacle",reaction:"jump"}
  };

  function walkObjectPool() {
    const biome = mini.walkBiome || WALK_BIOMES.rain;
    const ids = [...biome.objects, "log"];
    const rareChance = .08 + (biome.rareBias || 0) + mini.walkRisk * .035 + mini.walkLuck * .025;
    let pool = ids.map(id => WALK_OBJECTS[id]).filter(Boolean);
    if (Math.random() < rareChance) {
      const rare = pool.filter(item => item.type === "rare");
      if (rare.length) return rare;
    }
    pool = pool.filter(item => item.type !== "rare" || Math.random() < .12);
    if (mini.walkWeather?.findBias && Math.random() < .22 && WALK_OBJECTS[mini.walkWeather.findBias]) return [WALK_OBJECTS[mini.walkWeather.findBias]];
    return pool;
  }

  function spawnWalkFind() {
    const host=$("#walkFinds"); if(!host||mini.walkEnding||mini.pausedByFork)return;
    if(mini.entities.filter(item=>item.kind==="walk"&&!item.handled).length>=3)return;
    const pool=walkObjectPool();
    const opening=[WALK_OBJECTS.leaf,WALK_OBJECTS.friend,WALK_OBJECTS.ember];
    const data=mini.walkFindCount<3?opening[mini.walkFindCount]:pool[Math.floor(Math.random()*pool.length)]||WALK_OBJECTS.leaf;
    const first=mini.walkFindCount===0;mini.walkFindCount+=1;
    const node=document.createElement("button");
    node.type="button"; node.className=`walk-find ${data.type} reaction-${data.reaction}`; node.dataset.walkFind=data.label; node.textContent=data.icon; node.setAttribute("aria-label",`Interact with ${data.label}`);
    host.appendChild(node);
    const lane = Math.random() < .25 ? "high" : "ground";
    node.dataset.lane = lane;
    mini.entities.push({kind:"walk",node,data,x:first?el.miniArena.clientWidth*.62:el.miniArena.clientWidth+20,speed:70+Math.random()*12+mini.walkRisk*4,handled:false,lane});
  }

  function walkReaction(reaction, negative = false) {
    const pet=$("#miniPet");
    if (!pet) return;
    const classes=["walk-inspect","walk-splash","walk-jump","walk-awe","walk-shock","walk-sniff","walk-celebrate"];
    pet.classList.remove(...classes);
    const map={inspect:"walk-inspect",splash:"walk-splash",jump:"walk-jump",awe:"walk-awe",shock:"walk-shock",sniff:"walk-sniff",celebrate:"walk-celebrate"};
    void pet.offsetWidth;
    pet.classList.add(map[reaction] || (negative ? "walk-splash" : "walk-inspect"));
    queueMiniTimeout(()=>pet?.classList.remove(...classes),560);
  }

  function collectWalkObject(node) {
    const entity=mini.entities.find(item=>item.kind==="walk"&&item.node===node);
    if(!entity||entity.handled)return;
    entity.handled=true;
    const points = entity.data.type === "obstacle" ? 3 : entity.data.type === "hazard" ? 2 : entity.data.points;
    rememberWalkFind(entity.data);
    mini.score=Math.max(0,mini.score+points);
    mini.hits += points > 0 ? 1 : 0;
    if(entity.data.type==="rare") mini.treasureRolls+=2;
    if(entity.data.type==="obstacle") mini.treasureRolls += .25;
    const copy=entity.data.type==="hazard"?`${state.pet.name} HOPS THE PUDDLE. DRY SOCKS. +2`:entity.data.type==="obstacle"?`${state.pet.name} CLEARED THE LOG. +3`:`${entity.data.label} • ${points>0?"+":""}${points}`;
    setWalkCaption(mini.walkBiome.name,copy);
    walkReaction(entity.data.type==="hazard"?"jump":entity.data.reaction,points<0);
    sfx(points<0?"sick":entity.data.type==="rare"?"reward":entity.data.type==="obstacle"?"jump":"spark");
    haptic(points<0?[18,18,18]:entity.data.type==="rare"?[8,10,14]:8);
    entity.node.classList.add("collected");
    queueMiniTimeout(()=>entity.node.remove(),220);
  }

  function updateWalkGame(dt) {
    mini.walkDistance += dt * (56 + mini.walkRisk * 3);
    const world=$(".walk-world");
    if(world) world.style.setProperty("--walk-distance",String(mini.walkDistance));
    $$(".walk-layer",world || el.miniArena).forEach(layer=>{
      const speed=Number(layer.dataset.walkSpeed)||.3;
      layer.style.backgroundPositionX=`${-mini.walkDistance*speed}px`;
    });
    const progress=clamp(1-Math.max(0,mini.endAt-now())/miniDuration("walk"),0,1);
    const bar=$("#walkDistanceBar"); if(bar)bar.style.width=`${progress*100}%`;
    const petX=el.miniArena.clientWidth*.19;
    for(const entity of [...mini.entities]){
      if(entity.kind!=="walk")continue;
      entity.x-=entity.speed*dt;
      const y=entity.lane==="high"?"132px":"74px";
      entity.node.style.left=`${entity.x}px`;
      entity.node.style.bottom=y;
      if(!entity.handled && entity.x < petX+20 && entity.x > petX-34 && ["hazard","obstacle"].includes(entity.data.type)){
        entity.handled=true;
        if(entity.data.type==="hazard"){
          mini.score=Math.max(0,mini.score-2); walkReaction("splash",true); sfx("sick"); setWalkCaption(mini.walkBiome.name,`${state.pet.name} FOUND THE DEEPEST PART OF THE PUDDLE.`);
        } else {
          mini.score=Math.max(0,mini.score-1); walkReaction("shock",true); sfx("no"); setWalkCaption(mini.walkBiome.name,`${state.pet.name} BUMPED THE LOG. THE LOG WON.`);
        }
        entity.node.classList.add("collected"); queueMiniTimeout(()=>entity.node.remove(),220);
      }
      if(entity.x < -90 || entity.handled){
        if(entity.x < -90) entity.node.remove();
        mini.entities=mini.entities.filter(item=>item!==entity);
      }
    }
  }

  // ===== PAUSE-AWARE ARCADE SCHEDULER =====
  // Every delayed gameplay callback in the arcade runs through here. Native
  // setTimeout keeps counting while a run is frozen, which meant a Lost Signal
  // sequence, a Rhythm countdown or a delayed round transition would advance
  // behind the pause panel and land out of sync on resume. Jobs now bank their
  // remaining delay when the run is held and re-arm with exactly that much left,
  // so a stacked ad + background + menu hold costs the sequence nothing.
  let arcadeJobSeq = 0;
  function arcadeJobs(){ return (mini.jobs ||= new Map()); }
  function arcadeJobsHeld(){ return Boolean(mini?.jobHolds && Object.keys(mini.jobHolds).length); }

  function armArcadeJob(job){
    job.armedAt = performance.now();
    job.timer = setTimeout(() => {
      job.timer = null;
      if(!mini?.active){ mini?.jobs?.delete(job.id); return; }
      // Re-arm a repeating job before running it, so a callback that schedules
      // more work or ends the run behaves the same as it did under setInterval.
      if(job.repeat){ job.remaining = job.period; armArcadeJob(job); }
      else arcadeJobs().delete(job.id);
      job.callback();
    }, Math.max(0, job.remaining));
  }

  function queueMiniTimeout(callback, delay) {
    const job = { id: ++arcadeJobSeq, callback, remaining: Math.max(0, Number(delay) || 0), period: 0, repeat: false, timer: null, armedAt: 0 };
    arcadeJobs().set(job.id, job);
    if(!arcadeJobsHeld()) armArcadeJob(job);
    return job.id;
  }

  function queueMiniInterval(callback, period) {
    const every = Math.max(16, Number(period) || 16);
    const job = { id: ++arcadeJobSeq, callback, remaining: every, period: every, repeat: true, timer: null, armedAt: 0 };
    arcadeJobs().set(job.id, job);
    if(!arcadeJobsHeld()) armArcadeJob(job);
    return job.id;
  }

  function clearArcadeJobs(){
    for(const job of mini?.jobs?.values() || []) if(job.timer != null) clearTimeout(job.timer);
    mini?.jobs?.clear?.();
    if(mini) mini.jobHolds = {};
  }

  // Holds stack by reason exactly like the run clock does, so a notification
  // arriving mid-ad cannot release the queue early.
  function arcadeHoldJobs(reason="menu"){
    if(!mini?.active) return false;
    mini.jobHolds ||= {};
    if(mini.jobHolds[reason]) return false;
    const first = !arcadeJobsHeld();
    mini.jobHolds[reason] = true;
    if(!first) return true;
    const at = performance.now();
    for(const job of arcadeJobs().values()){
      if(job.timer == null) continue;
      clearTimeout(job.timer);
      job.timer = null;
      job.remaining = Math.max(0, job.remaining - (at - job.armedAt));
    }
    return true;
  }

  function arcadeReleaseJobs(reason="menu"){
    if(!mini?.active) return false;
    mini.jobHolds ||= {};
    if(!mini.jobHolds[reason]) return false;
    delete mini.jobHolds[reason];
    if(arcadeJobsHeld()) return false;
    for(const job of arcadeJobs().values()) if(job.timer == null) armArcadeJob(job);
    return true;
  }

  function rhythmClockNow() {
    // Gameplay must never depend on AudioContext.currentTime. Mobile Safari can
    // leave an AudioContext suspended or resume it late, which previously froze
    // or delayed notes even when Low Power Mode was off. performance.now() stays
    // monotonic and drives visual timing; Web Audio is now sound-only.
    return performance.now()/1000;
  }

  function stopRhythmVoices() {
    for(const voice of mini.rhythmVoices||[]){try{voice.stop?.();}catch(error){} try{voice.disconnect?.();}catch(error){}}
    mini.rhythmVoices=[];
    try{mini.rhythmGain?.disconnect?.();}catch(error){}
    mini.rhythmGain=null;
  }

  function scheduleRhythmTone(ctx,gainNode,note,when,duration,type,volume=.035){
    if(!state.settings.music||note==null||when<ctx.currentTime-.03)return;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(midiFrequency(note),Math.max(ctx.currentTime,when));
    gain.gain.setValueAtTime(.001,Math.max(ctx.currentTime,when));
    gain.gain.linearRampToValueAtTime(volume,Math.max(ctx.currentTime,when)+.008);
    gain.gain.exponentialRampToValueAtTime(.001,Math.max(ctx.currentTime,when)+duration);
    osc.connect(gain).connect(gainNode);osc.start(Math.max(ctx.currentTime,when));osc.stop(Math.max(ctx.currentTime,when)+duration+.03);
    mini.rhythmVoices.push(osc);
  }

  function scheduleRhythmNoise(ctx,gainNode,when,volume=.012){
    if(!state.settings.music||when<ctx.currentTime-.03)return;
    const size=Math.max(1,Math.floor(ctx.sampleRate*.045)),buffer=ctx.createBuffer(1,size,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<size;i+=1)data[i]=(Math.random()*2-1)*(1-i/size);
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;
    gain.gain.setValueAtTime(volume,Math.max(ctx.currentTime,when));gain.gain.exponentialRampToValueAtTime(.001,Math.max(ctx.currentTime,when)+.05);
    source.connect(gain).connect(gainNode);source.start(Math.max(ctx.currentTime,when));mini.rhythmVoices.push(source);
  }

  function scheduleRhythmAudio(fromElapsed=0){
    stopRhythmVoices();
    if(!state.settings.music||!mini.active||mini.mode!=="rhythm")return;
    const ctx=ensureAudio();if(!ctx)return;
    const track=mini.rhythmTrack; const gain=ctx.createGain();gain.gain.value=currentRhythmGain();gain.connect(ctx.destination);mini.rhythmGain=gain;
    const stepSeconds=rhythmStepSeconds(track), total=miniDuration("rhythm")/1000;
    // Re-anchor sound to the audio clock whenever audio starts/resumes. The
    // visual chart remains on performance.now(), so a suspended audio context
    // can no longer freeze gameplay.
    const startAt=ctx.currentTime-fromElapsed+.045;
    mini.rhythmAudioStartAt=startAt;
    const maxStep=Math.ceil(total/stepSeconds)+2;
    for(let step=0;step<maxStep;step+=1){
      const t=rhythmStepTime(track,step); if(t<fromElapsed-.08)continue;if(t>total)break;
      const when=startAt+t, index=step%(track.steps||16);
      scheduleRhythmTone(ctx,gain,track.lead[index%track.lead.length],when,Math.min(.2,stepSeconds*.72),track.wave,.028);
      scheduleRhythmTone(ctx,gain,track.bass[index%track.bass.length],when,Math.min(.32,stepSeconds*1.2),"triangle",.022);
      const drum=track.drums[index%track.drums.length]||0;
      if(drum)scheduleRhythmNoise(ctx,gain,when,.008+.012*drum);
    }
  }

  function startRhythmPerformance() {
    ensureAudio();
    mini.rhythmReady=false;
    mini.rhythmStartClock=rhythmClockNow()+mini.rhythmLeadIn;
    mini.rhythmAudioStartAt=(ensureAudio()?.currentTime ?? 0)+mini.rhythmLeadIn;
    mini.rhythmChartIndex=0;mini.entities=[];
    scheduleRhythmAudio(-mini.rhythmLeadIn);
    const countdown=$("#rhythmCountdown"),number=countdown?.querySelector("b"),caption=countdown?.querySelector("span");
    [[0,"3","FIND YOUR LANES"],[1000,"2","LEFT • MIDDLE • MIDDLE • RIGHT"],[2000,"1","WAIT FOR THE HIT LINE"],[3000,"GO","FIRST NOTE INCOMING"]].forEach(([delay,value,copy])=>queueMiniTimeout(()=>{if(number){number.textContent=value;number.classList.remove("pulse");void number.offsetWidth;number.classList.add("pulse");}if(caption)caption.textContent=copy;sfx(value==="GO"?"reward":"spark");},delay));
    queueMiniTimeout(()=>{mini.rhythmReady=true;countdown?.classList.add("leave");const callout=$("#rhythmCallout");if(callout)callout.textContent="FIRST NOTE INCOMING";},3000);
    queueMiniTimeout(()=>countdown?.remove(),3300);
    queueMiniTimeout(()=>{$(".rhythm-track-intro")?.classList.add("leave");},2300);
  }

  function rhythmAccuracyPercent(){
    const j=mini.rhythmJudgements||{perfect:0,great:0,good:0,miss:0};
    const total=j.perfect+j.great+j.good+j.miss;
    if(!total)return 100;
    return Math.round(((j.perfect+j.great*.85+j.good*.65)/total)*100);
  }

  function updateRhythmHUD(){
    const combo=$("#rhythmCombo b");if(combo)combo.textContent=String(mini.rhythmStreak||0);
    const accuracy=$("#rhythmAccuracy b");if(accuracy)accuracy.textContent=`${rhythmAccuracyPercent()}%`;
  }

  function pulseRhythmPad(lane,className="pressed"){
    const pad=$(`[data-rhythm-lane="${lane}"]`);if(!pad)return;
    pad.classList.remove("pressed","perfect","wrong");void pad.offsetWidth;pad.classList.add(className);
    queueMiniTimeout(()=>pad?.classList.remove(className),140);
  }

  function spawnRhythmEvent(event) {
    const host=$("#rhythmNotes");if(!host||event.spawned)return;
    const node=document.createElement("i");node.className=`rhythm-note lane-${event.lane}`;node.textContent=event.icon;node.setAttribute("aria-hidden","true");host.appendChild(node);
    event.spawned=true;event.kind="rhythm";event.node=node;event.handled=false;mini.entities.push(event);
  }

  function updateRhythmGame() {
    const elapsed=rhythmClockNow()-mini.rhythmStartClock;
    // Notes may enter behind the countdown during the final travel window so
    // the first beat reaches the line naturally after GO instead of spawning
    // directly on the target with no reaction time.
    while(mini.rhythmChartIndex<mini.rhythmChart.length && mini.rhythmChart[mini.rhythmChartIndex].hitTime-elapsed<=mini.rhythmTravel){
      spawnRhythmEvent(mini.rhythmChart[mini.rhythmChartIndex]);mini.rhythmChartIndex+=1;
    }
    const board=$("#rhythmBoard");
    const boardHeight=Math.max(160,board?.clientHeight||260),spawnY=-48,gateY=boardHeight-54;
    for(const entity of [...mini.entities]){
      if(entity.kind!=="rhythm"||entity.handled)continue;
      const remaining=entity.hitTime-elapsed;
      const progress=1-remaining/mini.rhythmTravel;
      entity.y=spawnY+(gateY-spawnY)*progress;
      entity.node.style.top=`${entity.y}px`;
      if(elapsed-entity.hitTime>.205){
        entity.handled=true;mini.rhythmStreak=0;mini.rhythmMisses+=1;mini.rhythmJudgements.miss+=1;
        const callout=$("#rhythmCallout");if(callout)callout.textContent=`MISS • LANE ${entity.lane+1}`;
        pulseRhythmPad(entity.lane,"wrong");updateRhythmHUD();sfx("no");entity.node.classList.add("missed");queueMiniTimeout(()=>entity.node?.remove(),180);
      }
    }
    mini.entities=mini.entities.filter(entity=>!entity.handled||entity.node?.isConnected);
  }

  function rhythmTap(lane) {
    lane=clamp(Number(lane)||0,0,3);
    if(!mini.rhythmReady){const callout=$("#rhythmCallout");if(callout)callout.textContent="WAIT FOR GO";pulseRhythmPad(lane,"wrong");return;}
    pulseRhythmPad(lane,"pressed");
    const elapsed=rhythmClockNow()-mini.rhythmStartClock;
    const open=mini.entities.filter(item=>item.kind==="rhythm"&&!item.handled);
    const notes=open.filter(item=>item.lane===lane);
    const target=notes.sort((a,b)=>Math.abs(a.hitTime-elapsed)-Math.abs(b.hitTime-elapsed))[0];
    const nearestAny=[...open].sort((a,b)=>Math.abs(a.hitTime-elapsed)-Math.abs(b.hitTime-elapsed))[0];
    if(!target||Math.abs(target.hitTime-elapsed)>.205){
      mini.rhythmBlankTaps+=1;
      if(mini.rhythmStreak>0)mini.rhythmStreak=0;
      const callout=$("#rhythmCallout");
      if(nearestAny&&Math.abs(nearestAny.hitTime-elapsed)<=.23){
        if(callout)callout.textContent=`WRONG LANE • TRY ${nearestAny.lane+1}`;
      }else if(callout){
        const relation=nearestAny?(nearestAny.hitTime>elapsed?"TOO EARLY":"TOO LATE"):"NO NOTE THERE";
        callout.textContent=relation;
      }
      pulseRhythmPad(lane,"wrong");updateRhythmHUD();sfx("no");return;
    }
    const signed=target.hitTime-elapsed,delta=Math.abs(signed);
    const result=delta<=.055?{grade:"PERFECT",points:5,key:"perfect"}:delta<=.105?{grade:"GREAT",points:3,key:"great"}:{grade:"GOOD",points:1,key:"good"};
    target.handled=true;target.node?.classList.add("hit",result.key);queueMiniTimeout(()=>target.node?.remove(),150);
    mini.rhythmStreak+=1;mini.rhythmMaxStreak=Math.max(mini.rhythmMaxStreak,mini.rhythmStreak);mini.hits+=1;mini.rhythmJudgements[result.key]+=1;
    mini.score+=result.points+Math.floor(mini.rhythmStreak/8);
    const timing=delta<=.055?"":signed>0?" • EARLY":" • LATE";
    const callout=$("#rhythmCallout");if(callout)callout.textContent=`${result.grade}${timing} • ${mini.rhythmStreak} COMBO`;
    pulseRhythmPad(lane,result.key==="perfect"?"perfect":"pressed");updateRhythmHUD();
    $("#miniPet")?.classList.add("rhythm-hit");queueMiniTimeout(()=>$("#miniPet")?.classList.remove("rhythm-hit"),220);
    sfx(result.key==="perfect"?"perfect":"dance",mini.rhythmStreak);haptic(result.key==="perfect"?[8,12,8]:6);
  }

  function lightMemoryRune(index,on=true) { const rune=$(`[data-memory-rune="${index}"]`); if(rune)rune.classList.toggle("lit",on); }
  function memoryExpectedSequence(){let base=[...mini.memorySequence];if(mini.memoryMode.includes("reverse"))base.reverse();if(mini.memoryMode.includes("opposite"))base=base.map(value=>3-value);if(mini.memoryMode.includes("rotate")){const shift=mini.memoryShift||1;base=base.map(value=>(value+shift)%4);}return base;}
  function memoryRuleLabel(){return {forward:"CLEAN SIGNAL",reverse:"PLAY BACKWARD",opposite:"PLAY OPPOSITES","reverse-opposite":"BACKWARD + OPPOSITE",rotate:`ROTATE +${mini.memoryShift||1}`,"reverse-rotate":`BACKWARD + ROTATE`}[mini.memoryMode]||String(mini.memoryMode||"SIGNAL").toUpperCase();}
  function updateMemoryHUD(){const rule=$("#memoryRule");if(rule)rule.textContent=memoryRuleLabel();renderLives("memoryHearts");}

  function startMemoryRound() {
    if(!mini.active||mini.mode!=="memory")return;
    mini.memoryRound+=1;mini.memoryBestRound=Math.max(mini.memoryBestRound,mini.memoryRound);mini.memoryInput=0;mini.memoryShowing=true;mini.memoryShift=1+(mini.memoryRound%3);mini.memoryRuleDepth=mini.memoryRound>=7?2:1;
    if(mini.memoryRound>=9&&mini.memoryRound%3===0)mini.memoryMode="reverse-rotate";else if(mini.memoryRound>=7&&mini.memoryRound%2===1)mini.memoryMode="reverse-opposite";else if(mini.memoryRound>=5&&mini.memoryRound%5===0)mini.memoryMode="rotate";else if(mini.memoryRound>=4&&mini.memoryRound%4===0)mini.memoryMode="opposite";else if(mini.memoryRound>=3&&mini.memoryRound%3===0)mini.memoryMode="reverse";else mini.memoryMode="forward";
    mini.memorySequence.push(Math.floor(Math.random()*4));updateMemoryHUD();
    const callout=$("#memoryCallout"),speed=Math.max(250,520-mini.memoryRound*24);if(callout)callout.textContent=`ROUND ${mini.memoryRound} • LISTEN • ${memoryRuleLabel()}`;
    mini.memorySequence.forEach((value,index)=>{queueMiniTimeout(()=>{lightMemoryRune(value,true);sfx("spark",index);},index*speed);queueMiniTimeout(()=>lightMemoryRune(value,false),index*speed+Math.min(270,speed*.58));});
    queueMiniTimeout(()=>{mini.memoryShowing=false;if(callout)callout.textContent=`YOUR TURN • ${memoryRuleLabel()}`;},mini.memorySequence.length*speed+140);
  }

  function memoryTap(index) {
    if(!mini.active||mini.mode!=="memory"||mini.memoryShowing)return;
    lightMemoryRune(index,true);queueMiniTimeout(()=>lightMemoryRune(index,false),180);const expectedSequence=memoryExpectedSequence(),expected=expectedSequence[mini.memoryInput];
    if(index===expected){mini.memoryInput+=1;mini.score+=2+mini.memoryRound;sfx("spark",mini.memoryInput);haptic(6);$("#miniPet")?.classList.add("memory-nod");queueMiniTimeout(()=>$("#miniPet")?.classList.remove("memory-nod"),180);if(mini.memoryInput>=expectedSequence.length){mini.hits+=1;mini.score+=mini.memoryRound*(mini.memoryRuleDepth>1?6:mini.memoryMode==="forward"?2:4);mini.memoryShowing=true;const callout=$("#memoryCallout");if(callout)callout.textContent=`${memoryRuleLabel()} CLEAN • +${mini.memoryRound*(mini.memoryRuleDepth>1?6:4)}`;arcadeSfx("win");queueMiniTimeout(startMemoryRound,720);}}
    else {mini.score=Math.max(0,mini.score-3);loseArcadeLife();mini.memoryShowing=true;updateMemoryHUD();const callout=$("#memoryCallout");if(callout)callout.textContent=mini.lives>0?"WRONG RUNE • STUDY IT AGAIN":"MEMORY OVERLOADED";$("#miniPet")?.classList.add("memory-confused");queueMiniTimeout(()=>$("#miniPet")?.classList.remove("memory-confused"),420);arcadeSfx("fail");haptic([15,20,15]);if(mini.lives<=0){mini.endAt=Math.min(mini.endAt,now()+450);return;}queueMiniTimeout(()=>{mini.memoryInput=0;mini.memoryShowing=true;const speed=Math.max(250,430-mini.memoryRound*16);mini.memorySequence.forEach((value,i)=>{queueMiniTimeout(()=>lightMemoryRune(value,true),i*speed);queueMiniTimeout(()=>lightMemoryRune(value,false),i*speed+220);});queueMiniTimeout(()=>{mini.memoryShowing=false;if(callout)callout.textContent=`TRY • ${memoryRuleLabel()}`;},mini.memorySequence.length*speed+100);},520);}
  }

  function renderLives(id="miniLives"){
    const host=typeof id==="string"?$(`#${id}`):id;
    if(!host)return "";
    const max=Math.max(1,Math.floor(mini.maxLives||3)),lives=clamp(Math.floor(mini.lives||0),0,max);
    const markup=Array(max).fill(0).map((_,i)=>i<lives?"\u2665":"\u2661").join(" ");
    host.textContent=markup;
    host.classList.toggle("lives-critical",lives===1);
    host.classList.toggle("lives-empty",lives<=0);
    return markup;
  }
  function loseArcadeLife(amount=1){
    mini.lives=Math.max(0,(mini.lives||0)-Math.max(1,amount));
    if(mini.lives<=0)mini.endReason="death";
    return mini.lives;
  }

  function updateGlidePet(){const pet=$("#miniPet");if(!pet)return;pet.style.top=`${mini.glideY}px`;pet.style.setProperty("--glide-tilt",`${clamp(mini.glideV/18,-18,22)}deg`);}
  function glideFlap(){if(!mini.active||mini.mode!=="glide")return;mini.glideV=now()<mini.glideThermalUntil?-270:-315;sfx("jump");haptic(6);$("#miniPet")?.classList.add("glide-flap");queueMiniTimeout(()=>$("#miniPet")?.classList.remove("glide-flap"),140);}
  function spawnGlideGate(){const host=$("#glideGates");if(!host)return;const width=el.miniArena.clientWidth,height=el.miniArena.clientHeight,progress=1-Math.max(0,mini.endAt-now())/miniDuration("glide"),rare=Math.random()<.12,gapH=Math.max(104,148-progress*36-(rare?12:0)),margin=84,gapY=margin+gapH/2+Math.random()*Math.max(1,height-margin*2-gapH);const node=document.createElement("div");node.className=`glide-gate ${rare?"prism":""}`;node.innerHTML=`<i class="top"></i><i class="bottom"></i><b>${rare?"◆":""}</b>`;host.appendChild(node);const entity={kind:"glide",node,x:width+38,width:58,gapY,gapH,speed:128+progress*46+(rare?9:0),scored:false,rare};mini.entities.push(entity);mini.glideGateCount+=1;}
  function updateGlideGateNode(entity){const h=el.miniArena.clientHeight,topH=Math.max(0,entity.gapY-entity.gapH/2),bottomY=Math.min(h,entity.gapY+entity.gapH/2);entity.node.style.transform=`translateX(${entity.x}px)`;entity.node.style.setProperty("--gate-top",`${topH}px`);entity.node.style.setProperty("--gate-bottom",`${Math.max(0,h-bottomY)}px`);}
  function glideCrash(){if(now()<mini.glideInvulnerableUntil)return;loseArcadeLife();mini.glideStreak=0;mini.glideDraft=0;const draft=$("#glideDraft");if(draft)draft.textContent="0/3";mini.glideInvulnerableUntil=now()+1250;renderLives("glideHearts");const streak=$("#glideStreak");if(streak)streak.textContent="0";$("#miniPet")?.classList.add("glide-hurt");queueMiniTimeout(()=>$("#miniPet")?.classList.remove("glide-hurt"),520);arcadeSfx("fail");haptic([18,26,18]);mini.glideY=el.miniArena.clientHeight*.46;mini.glideV=-80;for(const entity of mini.entities.filter(e=>e.kind==="glide")){entity.node.remove();}mini.entities=mini.entities.filter(e=>e.kind!=="glide");mini.glideSpawnAt=now()+1050;if(mini.lives<=0)mini.endAt=Math.min(mini.endAt,now()+450);}
  function updateGlideGame(dt){const t=now(),height=el.miniArena.clientHeight,width=el.miniArena.clientWidth,thermal=t<mini.glideThermalUntil;if(mini.glideThermalUntil&&t>=mini.glideThermalUntil){mini.glideThermalUntil=0;$(".glide-world")?.classList.remove("thermal");const banner=$("#glideThermal");if(banner)banner.textContent="CENTER 3 GATES → THERMAL";}if(t>=mini.glideWindAt){mini.glideWind=[-72,-38,0,42,76][Math.floor(Math.random()*5)];mini.glideWindAt=t+5200+Math.random()*2200;const wind=$("#glideWind");if(wind)wind.textContent=mini.glideWind<-20?"UPDRAFT ↑":mini.glideWind>20?"DOWNDRAFT ↓":"CALM AIR";}mini.glideV+=((thermal?525:760)+(thermal?mini.glideWind*.35:mini.glideWind))*dt;mini.glideY+=mini.glideV*dt;updateGlidePet();if(t>=mini.glideSpawnAt){spawnGlideGate();mini.glideSpawnAt=t+1450;}const petX=width*.24,petR=22;for(const entity of [...mini.entities]){if(entity.kind!=="glide")continue;entity.x-=entity.speed*dt;updateGlideGateNode(entity);const overlapX=entity.x<petX+petR&&entity.x+entity.width>petX-petR,top=entity.gapY-entity.gapH/2,bottom=entity.gapY+entity.gapH/2;if(overlapX&&(mini.glideY-petR<top||mini.glideY+petR>bottom))glideCrash();if(!entity.scored&&entity.x+entity.width<petX){entity.scored=true;mini.glideClears+=1;mini.glideStreak+=1;mini.glideBestStreak=Math.max(mini.glideBestStreak,mini.glideStreak);const centered=Math.abs(mini.glideY-entity.gapY)<20,gain=((entity.rare?6:3)+(centered?2:0))*(thermal?2:1);mini.score+=gain;const streak=$("#glideStreak");if(streak)streak.textContent=String(mini.glideStreak);if(centered){mini.glideDraft+=entity.rare?2:1;if(mini.glideDraft>=3){mini.glideDraft=0;mini.glideThermalUntil=t+4200;mini.glideThermals+=1;$(".glide-world")?.classList.add("thermal");const banner=$("#glideThermal");if(banner)banner.textContent="THERMAL BURST • PHYSICS SOFTENED • x2";sensoryBurst("THERMAL BURST","#ffd45a",12);arcadeSfx("win");}else{sensoryBurst("CENTER THREAD","#9eff75",8);sfx("perfect");}const draft=$("#glideDraft");if(draft)draft.textContent=`${mini.glideDraft}/3`;}else sfx(entity.rare?"reward":"spark");}if(entity.x<-90){entity.node.remove();mini.entities=mini.entities.filter(item=>item!==entity);}}if((mini.glideY<28||mini.glideY>height-48)&&t>=mini.glideInvulnerableUntil)glideCrash();}

  function setBreakerPaddle(ratio){mini.breakerX=clamp(Number(ratio)||.5,.08,.92);mini.breakerMoves=(mini.breakerMoves||0)+1;const pet=$("#miniPet");if(pet)pet.style.left=`${mini.breakerX*100}%`;}
  const BREAKER_PATTERNS=[
    {name:"BROKEN X",rows:["1.1.1.1",".11111.","..1C1..",".11111."]},
    {name:"FIRE TEETH",rows:["E1.1.1E",".21112.","11C.C11",".11111."]},
    {name:"BRIDGE MARK",rows:["..111..",".1P1P1.","11.C.11","1111111"]},
    {name:"KEEPER EYE",rows:[".11111.","11...11","1..C..1","11...11",".11111."]}
  ];
  function buildBreakerBoard(){const host=$("#breakerBlocks");if(!host)return;host.innerHTML="";mini.entities=mini.entities.filter(e=>e.kind!=="breaker-block");const pattern=BREAKER_PATTERNS[(mini.breakerLevel-1)%BREAKER_PATTERNS.length],cols=7,rows=pattern.rows.length,pad=7,arenaW=Math.max(280,el.miniArena.clientWidth),blockW=(arenaW-28-pad*(cols-1))/cols,blockH=28;mini.breakerPatternName=pattern.name;mini.breakerCores=0;for(let row=0;row<rows;row+=1){for(let col=0;col<cols;col+=1){const token=pattern.rows[row]?.[col]||".";if(token===".")continue;const special=token==="P"?"prism":token==="E"?"ember":token==="C"?"core":null,hp=token==="2"?2:(mini.breakerLevel>=4&&token==="1"&&((row+col+mini.breakerLevel)%5===0)?2:1),node=document.createElement("i");node.className=`breaker-block ${hp>1?"armored":""} ${special||""}`;node.style.left=`${14+col*(blockW+pad)}px`;node.style.top=`${54+row*(blockH+7)}px`;node.style.width=`${blockW}px`;node.style.height=`${blockH}px`;node.textContent=special==="prism"?"◆":special==="ember"?"✦":special==="core"?"×":"";host.appendChild(node);if(special==="core")mini.breakerCores+=1;mini.entities.push({kind:"breaker-block",node,row,col,x:14+col*(blockW+pad),y:54+row*(blockH+7),w:blockW,h:blockH,hp,special});}}const level=$("#breakerLevel"),cores=$("#breakerCoreCount"),name=$("#breakerPattern");if(level)level.textContent=String(mini.breakerLevel);if(cores)cores.textContent=String(mini.breakerCores);if(name)name.textContent=pattern.name;}
  function breakerCollapseCore(core){const neighbors=mini.entities.filter(item=>item.kind==="breaker-block"&&item.node?.isConnected&&item!==core&&item.special!=="core"&&Math.abs((item.row??0)-(core.row??0))+Math.abs((item.col??0)-(core.col??0))<=2).slice(0,5);for(const item of neighbors){item.node.classList.add("break","core-collapse");mini.score+=2;queueMiniTimeout(()=>item.node.remove(),150);mini.entities=mini.entities.filter(entry=>entry!==item);}mini.breakerCoresBroken+=1;mini.breakerCores=Math.max(0,mini.breakerCores-1);const cores=$("#breakerCoreCount");if(cores)cores.textContent=String(mini.breakerCores);sensoryBurst("CORE COLLAPSE","#ff5c6c",14);sfx("reward");haptic([10,14,20]);}
  function resetBreakerBall(first=false){const width=el.miniArena.clientWidth,height=el.miniArena.clientHeight,angle=(Math.random()*.7-.35);mini.breakerBall={x:width*mini.breakerX,y:height-128,vx:190*Math.sin(angle),vy:-245*Math.cos(angle),r:9,live:false};mini.breakerResetAt=now()+(first?900:720);const ball=$("#breakerBall");if(ball){ball.style.left=`${mini.breakerBall.x}px`;ball.style.top=`${mini.breakerBall.y}px`;}}
  function breakerLoseBall(){if(now()<mini.breakerResetAt)return;loseArcadeLife();mini.breakerStreak=0;renderLives("breakerHearts");const streak=$("#breakerStreak");if(streak)streak.textContent="0";arcadeSfx("fail");haptic([14,18,14]);if(mini.lives<=0){mini.endAt=Math.min(mini.endAt,now()+450);return;}resetBreakerBall();}
  function updateBreakerGame(dt){const b=mini.breakerBall;if(!b)return;const width=el.miniArena.clientWidth,height=el.miniArena.clientHeight,t=now();if(!b.live){b.x=width*mini.breakerX;b.y=height-128;if(t>=mini.breakerResetAt)b.live=true;}else{const speedBoost=1+Math.min(.22,(mini.breakerLevel-1)*.035);b.x+=b.vx*dt*speedBoost;b.y+=b.vy*dt*speedBoost;if(b.x-b.r<0){b.x=b.r;b.vx=Math.abs(b.vx);}if(b.x+b.r>width){b.x=width-b.r;b.vx=-Math.abs(b.vx);}if(b.y-b.r<38){b.y=38+b.r;b.vy=Math.abs(b.vy);}const paddleX=width*mini.breakerX,paddleY=height-108,paddleHalf=t<mini.breakerBoostUntil?66:48;if(b.vy>0&&b.y+b.r>=paddleY&&b.y-b.r<=paddleY+28&&Math.abs(b.x-paddleX)<=paddleHalf){const offset=clamp((b.x-paddleX)/paddleHalf,-1,1);b.y=paddleY-b.r;b.vy=-Math.max(235,Math.abs(b.vy));b.vx=clamp(b.vx+offset*125,-300,300);mini.breakerStreak+=1;mini.breakerBestStreak=Math.max(mini.breakerBestStreak,mini.breakerStreak);const streak=$("#breakerStreak");if(streak)streak.textContent=String(mini.breakerStreak);sfx("hit");haptic(5);}for(const block of [...mini.entities]){if(block.kind!=="breaker-block"||!block.node.isConnected)continue;if(b.x+b.r<block.x||b.x-b.r>block.x+block.w||b.y+b.r<block.y||b.y-b.r>block.y+block.h)continue;if(t-(block.lastHitAt||0)<70)continue;block.lastHitAt=t;block.hp-=1;if(t>=mini.breakerPierceUntil)b.vy*=-1;mini.score+=block.hp<=0?(block.special?8:2):1;if(block.hp<=0){mini.breakerBricks=(mini.breakerBricks||0)+1;block.node.classList.add("break");queueMiniTimeout(()=>block.node.remove(),130);mini.entities=mini.entities.filter(item=>item!==block);if(block.special==="prism"){mini.breakerBoostUntil=t+5200;$(".breaker-world")?.classList.add("boost");queueMiniTimeout(()=>$(".breaker-world")?.classList.remove("boost"),5200);sensoryBurst("PRISM PADDLE","#bdf7ff",10);sfx("reward");}else if(block.special==="ember"){mini.breakerPierceUntil=t+4200;$(".breaker-world")?.classList.add("fireball");queueMiniTimeout(()=>$(".breaker-world")?.classList.remove("fireball"),4200);sensoryBurst("EMBER BALL • PIERCE","#ff9b4e",10);sfx("reward");}else if(block.special==="core"){breakerCollapseCore(block);}else sfx("spark");}else{block.node.classList.remove("armored");block.node.classList.add("cracked");sfx("hit");}break;}if(b.y-b.r>height+20)breakerLoseBall();}const ball=$("#breakerBall");if(ball){ball.style.left=`${b.x}px`;ball.style.top=`${b.y}px`;}const blocks=mini.entities.filter(e=>e.kind==="breaker-block"&&e.node.isConnected);if(!blocks.length&&!mini.breakerBoardPending){mini.breakerBoardPending=true;mini.breakerLevel+=1;mini.score+=12+mini.breakerLevel*2;sensoryBurst(`WALL ${mini.breakerLevel}`,"#ffd54a",12);arcadeSfx("win");queueMiniTimeout(()=>{if(!mini.active||mini.mode!=="breaker")return;mini.breakerBoardPending=false;buildBreakerBoard();resetBreakerBall();},650);}}


  const RUNAWAY_MAZE = [
    "###############","#o.....#.....o#","#.###.#.#.###.#","#.....#.#.....#","###.#.....#.###","#...#.###.#...#","#.#...#.#...#.#","#.#.###.###.#.#","#.............#","#.#.###.###.#.#","#.#...#.#...#.#","#...#.###.#...#","###.#.....#.###","#.....#.#.....#","#.###.#.#.###.#","#o.....#.....o#","###############"
  ];
  const MAZE_DIRS={up:{dr:-1,dc:0},down:{dr:1,dc:0},left:{dr:0,dc:-1},right:{dr:0,dc:1}};
  const MAZE_REVERSE={up:"down",down:"up",left:"right",right:"left"};
  function mazeOpen(r,c){return Boolean(mini.mazeGrid?.[r]?.[c]&&mini.mazeGrid[r][c]!=="#");}
  function mazeCellKey(r,c){return `${r}-${c}`;}
  function mazeSetDirection(dir){if(!MAZE_DIRS[dir]||!mini.mazePlayer)return;mini.mazePlayer.nextDir=dir;mini.mazeInputs=(mini.mazeInputs||0)+1;mini.mazeTurnHistory.push(dir);if(mini.mazeTurnHistory.length>12)mini.mazeTurnHistory.shift();const counts={};for(const item of mini.mazeTurnHistory)counts[item]=(counts[item]||0)+1;mini.mazeFavoriteDir=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||"";}
  function mazeStepPoint(actor,dir){const d=MAZE_DIRS[dir];return d?{r:actor.r+d.dr,c:actor.c+d.dc}:null;}
  function mazeCanMove(actor,dir){const p=mazeStepPoint(actor,dir);return Boolean(p&&mazeOpen(p.r,p.c));}
  function mazeActorStyle(node,r,c){if(!node)return;const rows=mini.mazeGrid.length,cols=mini.mazeGrid[0]?.length||15;node.style.left=`${((c+.5)/cols)*100}%`;node.style.top=`${((r+.5)/rows)*100}%`;}
  function buildMazeLevel(first=false){
    mini.mazeGrid=RUNAWAY_MAZE.map(row=>row.split(""));mini.mazeMoveCarry=0;mini.mazeHunterCarry=0;mini.mazeHuntUntil=0;mini.mazeCombo=0;
    const board=$("#mazeBoard");if(!board)return;board.innerHTML="";board.style.setProperty("--maze-cols",String(mini.mazeGrid[0].length));board.style.setProperty("--maze-rows",String(mini.mazeGrid.length));
    mini.mazePellets=0;
    mini.mazeGrid.forEach((row,r)=>row.forEach((cell,c)=>{const tile=document.createElement("i");tile.className=cell==="#"?"maze-wall":"maze-floor";tile.dataset.mazeCell=mazeCellKey(r,c);if(cell!=="#"){if(cell==="o"){tile.classList.add("power");tile.innerHTML="<b>◆</b>";}else{tile.classList.add("pellet");tile.innerHTML="<b>•</b>";}mini.mazePellets+=1;}board.appendChild(tile);}));
    const player=document.createElement("div");player.id="mazeRizo";player.className="maze-rizo";player.innerHTML=miniPetMarkup("maze-rizo-inner");board.appendChild(player);
    mini.mazePlayer={r:8,c:7,dir:"down",nextDir:"down",node:player};mazeActorStyle(player,8,7);mini.mazeHunterWakeAt=now()+(first?1150:700);
    const starts=[{r:8,c:1,kind:"chase"},{r:8,c:13,kind:"ambush"},{r:3,c:7,kind:"wander"}];
    mini.mazeHunters=starts.map((spot,index)=>{const node=document.createElement("div");node.className=`maze-hunter hunter-${index}`;node.innerHTML="<i></i><b>×</b>";board.appendChild(node);const hunter={...spot,spawnR:spot.r,spawnC:spot.c,dir:index===0?"right":index===1?"left":"down",node,index};mazeActorStyle(node,spot.r,spot.c);return hunter;});
    // Do not award the starting tile for free.
    const startTile=board.querySelector(`[data-maze-cell="${mazeCellKey(8,7)}"]`);if(startTile?.classList.contains("pellet")){startTile.classList.remove("pellet");startTile.innerHTML="";mini.mazeGrid[8][7]=" ";mini.mazePellets-=1;}
    const level=$("#mazeLevel"),combo=$("#mazeCombo"),lives=$("#mazeLives"),callout=$("#mazeCallout");if(level)level.textContent=String(mini.mazeLevel);if(combo)combo.textContent="0";renderLives(lives);if(callout)callout.textContent=first?"MOVE FIRST • SHADOWS ARE WAKING":"NEW MAZE • SHADOWS WAKE FASTER";
  }
  function mazeCollect(){
    const p=mini.mazePlayer,cell=mini.mazeGrid[p.r][p.c];if(cell!=="."&&cell!=="o")return;
    const tile=$("#mazeBoard")?.querySelector(`[data-maze-cell="${mazeCellKey(p.r,p.c)}"]`);mini.mazeGrid[p.r][p.c]=" ";mini.mazePellets=Math.max(0,mini.mazePellets-1);tile?.classList.remove("pellet","power");if(tile)tile.innerHTML="";
    if(cell==="o"){mini.score+=6;mini.mazeHunts+=1;mini.mazeCombo=0;mini.mazeHuntUntil=now()+5400;$(".maze-world")?.classList.add("hunt");const callout=$("#mazeCallout");if(callout)callout.textContent="PRISM HUNT • CHASE THEM";sensoryBurst("HUNT MODE","#bdf7ff",12);sfx("reward");haptic([7,10,7]);}
    else{mini.score+=1;sfx("spark",mini.mazePellets%8);}
    if(mini.mazePellets<=0){mini.score+=25*mini.mazeLevel;mini.lives=Math.min(mini.maxLives||3,(mini.lives||0)+1);renderLives("mazeLives");mini.mazeLevel+=1;sensoryBurst(`MAZE ${mini.mazeLevel}`,"#ffd45a",14);arcadeSfx("win");queueMiniTimeout(()=>{if(mini.active&&mini.mode==="maze")buildMazeLevel(false);},520);}
  }
  function mazeHunterTarget(hunter){
    const p=mini.mazePlayer;if(hunter.kind==="ambush"){const predicted=mini.mazeLevel>=2&&mini.mazeFavoriteDir?mini.mazeFavoriteDir:p.dir;const d=MAZE_DIRS[predicted]||MAZE_DIRS.left;return{r:p.r+d.dr*3,c:p.c+d.dc*3};}
    if(hunter.kind==="wander"&&Math.random()<.48)return{r:1+Math.floor(Math.random()*15),c:1+Math.floor(Math.random()*13)};
    return{r:p.r,c:p.c};
  }
  function mazeChooseHunterDir(hunter){
    let dirs=Object.keys(MAZE_DIRS).filter(dir=>mazeCanMove(hunter,dir));if(dirs.length>1)dirs=dirs.filter(dir=>dir!==MAZE_REVERSE[hunter.dir]);if(!dirs.length)dirs=Object.keys(MAZE_DIRS).filter(dir=>mazeCanMove(hunter,dir));if(!dirs.length)return hunter.dir;
    const target=mazeHunterTarget(hunter),hunting=now()<mini.mazeHuntUntil;
    dirs.sort((a,b)=>{const pa=mazeStepPoint(hunter,a),pb=mazeStepPoint(hunter,b),da=Math.abs(pa.r-target.r)+Math.abs(pa.c-target.c),db=Math.abs(pb.r-target.r)+Math.abs(pb.c-target.c);return hunting?db-da:da-db;});
    if(Math.random()<(.24-(mini.mazeLevel-1)*.02))return dirs[Math.floor(Math.random()*dirs.length)];return dirs[0];
  }
  function mazeResetAfterHit(){const p=mini.mazePlayer;p.r=8;p.c=7;p.dir="down";p.nextDir="down";mazeActorStyle(p.node,p.r,p.c);mini.mazeHunters.forEach(h=>{h.r=h.spawnR;h.c=h.spawnC;h.dir=h.index===0?"right":h.index===1?"left":"down";mazeActorStyle(h.node,h.r,h.c);});}
  function mazeCollision(){
    const p=mini.mazePlayer,t=now();for(const h of mini.mazeHunters){if(h.r!==p.r||h.c!==p.c)continue;if(t<mini.mazeHuntUntil){mini.mazeCombo+=1;mini.mazeBestCombo=Math.max(mini.mazeBestCombo,mini.mazeCombo);mini.mazeHunterTags+=1;const gain=10*Math.min(5,mini.mazeCombo);mini.score+=gain;h.r=h.spawnR;h.c=h.spawnC;mazeActorStyle(h.node,h.r,h.c);const combo=$("#mazeCombo"),callout=$("#mazeCallout");if(combo)combo.textContent=String(mini.mazeCombo);if(callout)callout.textContent=`SHADOW TAG x${mini.mazeCombo} • +${gain}`;sfx("perfect");haptic([8,10,12]);continue;}if(t<mini.mazeInvulnerableUntil)continue;loseArcadeLife();mini.mazeCombo=0;mini.mazeInvulnerableUntil=t+1500;const combo=$("#mazeCombo"),callout=$("#mazeCallout");renderLives("mazeLives");if(combo)combo.textContent="0";if(callout)callout.textContent=mini.lives>0?"CAUGHT • ROUTE RESET":"THE SHADOWS GOT RIZO";$("#mazeRizo")?.classList.add("hurt");queueMiniTimeout(()=>$("#mazeRizo")?.classList.remove("hurt"),520);arcadeSfx("fail");haptic([20,24,20]);if(mini.lives<=0){mini.endAt=Math.min(mini.endAt,t+450);return;}mazeResetAfterHit();}
  }
  function mazeMovePlayer(){const p=mini.mazePlayer;if(!p)return;if(mazeCanMove(p,p.nextDir))p.dir=p.nextDir;if(!mazeCanMove(p,p.dir))return;const next=mazeStepPoint(p,p.dir);p.r=next.r;p.c=next.c;mazeActorStyle(p.node,p.r,p.c);p.node.dataset.dir=p.dir;mazeCollect();mazeCollision();}
  function mazeMoveHunters(){for(const h of mini.mazeHunters){h.dir=mazeChooseHunterDir(h);if(mazeCanMove(h,h.dir)){const next=mazeStepPoint(h,h.dir);h.r=next.r;h.c=next.c;mazeActorStyle(h.node,h.r,h.c);}mazeCollision();}}
  function updateMazeGame(dt){if(!mini.mazePlayer)return;const t=now();if(mini.mazeHuntUntil&&t>=mini.mazeHuntUntil){mini.mazeHuntUntil=0;mini.mazeCombo=0;$(".maze-world")?.classList.remove("hunt");const combo=$("#mazeCombo"),callout=$("#mazeCallout");if(combo)combo.textContent="0";if(callout)callout.textContent="SHADOWS ARE HUNTING AGAIN";}
    mini.mazeMoveCarry+=dt;const playerStep=Math.max(.092,.132-(mini.mazeLevel-1)*.004),hunterStep=Math.max(.105,.168-(mini.mazeLevel-1)*.008);
    while(mini.mazeMoveCarry>=playerStep){mini.mazeMoveCarry-=playerStep;mazeMovePlayer();}
    if(t>=mini.mazeHunterWakeAt){mini.mazeHunterCarry+=dt;while(mini.mazeHunterCarry>=hunterStep){mini.mazeHunterCarry-=hunterStep;mazeMoveHunters();}}
  }

  function handleMiniInput(event) {
    if (!mini.active || mini.pausedByAd) return;
    // Informational HUD is not the play surface. Reading your heart count or
    // the wind readout must never flap, jump, or move the paddle.
    if (mini.mode !== "defense" && event.target.closest?.("[data-mini-readout]")) return;
    if (mini.mode === "walk") {
      const ending=event.target.closest("[data-walk-ending]");
      if(ending){chooseWalkEnding(ending.dataset.walkEnding);return;}
      const forkBtn = event.target.closest(".walk-fork-btn");
      if (forkBtn) { chooseWalkFork(forkBtn.dataset.walkFork); return; }
    }
    if (mini.pausedByFork) return;
    if (mini.mode === "defense") { handleDefensePointerDown(event); return; }
    mini.playerInputs=(mini.playerInputs||0)+1;
    if (mini.mode === "power") { const tech=event.target.closest("[data-power-tech]")?.dataset.powerTech;if(tech)powerTap(tech);return; }
    if (mini.mode === "spark") {
      if(event.target.closest("[data-spark-bank]")){bankSparkStash(false);return;}
      if (event.target.closest(".spark-orb")) catchSpark();
      return;
    }
    if (mini.mode === "forage") {
      const rect=el.miniArena.getBoundingClientRect();
      const ratio=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1);
      setForageLane(Math.min(2,Math.floor(ratio*3)));
      return;
    }
    if (mini.mode === "rush") { rushJump(); return; }
    if (mini.mode === "rhythm") {
      const laneButton=event.target.closest("[data-rhythm-lane]");
      if(laneButton){rhythmTap(Number(laneButton.dataset.rhythmLane));return;}
      const board=$("#rhythmBoard");const rect=(board||el.miniArena).getBoundingClientRect();
      const ratio=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,.9999);
      rhythmTap(Math.floor(ratio*4));return;
    }
    if (mini.mode === "memory") {
      const rune = event.target.closest("[data-memory-rune]");
      if (rune) memoryTap(Number(rune.dataset.memoryRune));
      return;
    }
    if (mini.mode === "maze") { const dir=event.target.closest("[data-maze-dir]")?.dataset.mazeDir;if(dir){mazeSetDirection(dir);return;}mini.mazePointerStart={x:event.clientX,y:event.clientY};return; }
    if (mini.mode === "glide") { glideFlap(); return; }
    if (mini.mode === "breaker") {
      const rect=el.miniArena.getBoundingClientRect();
      const ratio=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1);
      if(Math.abs(ratio-mini.breakerX)>.22)setBreakerPaddle(ratio);
      mini.breakerGrab={x:event.clientX,base:mini.breakerX,width:Math.max(1,rect.width)};
      return;
    }
    if (mini.mode === "walk") {
      const find=event.target.closest(".walk-find");
      if(find) collectWalkObject(find);
    }
  }

  function handleMiniMove(event) {
    if (!mini.active || mini.pausedByAd) return;
    if (mini.mode === "defense") { moveDefenseDrag(event); return; }
    if(mini.mode==="maze"){if(!mini.mazePointerStart)return;const dx=event.clientX-mini.mazePointerStart.x,dy=event.clientY-mini.mazePointerStart.y;if(Math.hypot(dx,dy)>=22){mazeSetDirection(Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up"));mini.mazePointerStart={x:event.clientX,y:event.clientY};}return;}
    if (!["forage","breaker"].includes(mini.mode)) return;
    if (event.buttons === 0 && event.pointerType === "mouse") return;
    const rect=el.miniArena.getBoundingClientRect();
    if(mini.mode==="breaker"){
      const grab=mini.breakerGrab;
      if(grab) setBreakerPaddle(grab.base + (event.clientX-grab.x)/(grab.width||Math.max(1,rect.width)));
      else setBreakerPaddle(clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1));
      return;
    }
    const ratio=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1);
    setForageLane(Math.min(2,Math.floor(ratio*3)));
  }

  // ===== RIZO DEFENSE: automatic worlds, bosses and drag/tap placement =====
  // Defense remains one Arcade mode and one pet renderer. Every deployed unit,
  // roster card and drag ghost is still generated by petMarkup().
  function defenseCurvePoint(p0,p1,p2,p3,t){
    const t2=t*t,t3=t2*t;
    return{
      x:.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      y:.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
    };
  }
  function defenseBuildCurvedPath(anchors,detail=10){
    const source=(anchors||[]).map(point=>({x:Number(point.x)||0,y:Number(point.y)||0}));
    if(source.length<2)return source;
    const path=[];
    for(let i=0;i<source.length-1;i+=1){
      const p1=source[i],p2=source[i+1],p0=i>0?source[i-1]:{x:p1.x-(p2.x-p1.x),y:p1.y-(p2.y-p1.y)},p3=i+2<source.length?source[i+2]:{x:p2.x+(p2.x-p1.x),y:p2.y+(p2.y-p1.y)};
      for(let step=0;step<detail;step+=1){
        const point=defenseCurvePoint(p0,p1,p2,p3,step/detail);
        path.push({x:clamp(point.x,-.08,1.08),y:clamp(point.y,.055,.945)});
      }
    }
    path.push({...source[source.length-1]});
    return path;
  }
  function defensePrepareMap(map){
    map.route=(map.route||map.path||[]).map(point=>({...point}));
    map.path=defenseBuildCurvedPath(map.route,Math.max(16,map.curveDetail||16));
    map.pathMetrics=defensePathMetrics(map.path);
    return map;
  }
  const DEFENSE_MAPS = Object.fromEntries(Object.entries({
    grove:{id:"grove",level:1,name:"PINE BEND",icon:"♣",entrance:"WESTERN PINE LINE",lore:"The first trail the Ember Gate ever learned to defend winds around the old keeper grove.",lesson:"Own the long center bend, then cover the late return toward the gate.",strategy:"LONG BEND • DOUBLE COVERAGE",routeType:"BEND",unlockWave:0,className:"map-grove",lives:20,hp:1,speed:1,specialBias:0,weather:"clear",weatherCopy:"Calm air. Learn the trail.",curveDetail:11,blockedZones:[{x:.48,y:.49,r:.056,kind:"pine"}],landmarks:[{x:.48,y:.49,kind:"pine-grove",label:"OLD GROVE"},{x:.76,y:.43,kind:"keeper-stone",label:"KEEPER STONE"}],buildPockets:[{x:.41,y:.65},{x:.76,y:.44}],mechanic:{kind:"keeper",icon:"✦",label:"KEEPER STONE",copy:"Build in the stone ring for +12% reach."},mechanicZones:[{x:.76,y:.43,r:.145,kind:"keeper"}],route:[{x:-.06,y:.21},{x:.12,y:.19},{x:.27,y:.31},{x:.29,y:.50},{x:.18,y:.67},{x:.36,y:.79},{x:.58,y:.74},{x:.68,y:.57},{x:.61,y:.39},{x:.70,y:.22},{x:.87,y:.28},{x:.90,y:.51},{x:.80,y:.70},{x:1.06,y:.74}]},
    ember:{id:"ember",level:2,name:"EMBER SWITCHBACK",icon:"◆",entrance:"LOW ASH CUT",lore:"Old fire roads fold through crater country in three deliberate hairpins.",lesson:"Build beside the hairpins where one Rizo can touch the trail more than once.",strategy:"HAIRPINS • REPEATED HITS",routeType:"SWITCHBACK",unlockWave:25,className:"map-ember",lives:20,hp:1.06,speed:1.05,specialBias:3,weather:"ash",weatherCopy:"Ash hides the edges of the road.",curveDetail:12,blockedZones:[{x:.42,y:.46,r:.07,kind:"crater"},{x:.74,y:.30,r:.043,kind:"vent"}],landmarks:[{x:.42,y:.46,kind:"lava-crater",label:"ASH HEART"},{x:.74,y:.30,kind:"ember-vent",label:"FIRE VENT"}],buildPockets:[{x:.29,y:.27},{x:.64,y:.64}],mechanic:{kind:"vent",icon:"♨",label:"FIRE DRAFT",copy:"Outer draft: +16% speed, -4% reach. Hot core: +28% speed, -12% reach."},mechanicZones:[{x:.74,y:.30,r:.19,core:.74,kind:"vent"}],route:[{x:-.06,y:.72},{x:.15,y:.72},{x:.29,y:.61},{x:.24,y:.44},{x:.12,y:.29},{x:.25,y:.15},{x:.49,y:.17},{x:.62,y:.30},{x:.60,y:.51},{x:.47,y:.67},{x:.66,y:.78},{x:.86,y:.65},{x:.87,y:.42},{x:1.06,y:.26}]},
    moon:{id:"moon",level:3,name:"MOON LOOP",icon:"☾",entrance:"NORTH MOON ARC",lore:"A silver route curls almost completely around a moonstone basin before escaping east.",lesson:"Use the crescent loop for repeated coverage and Moonlight reveals.",strategy:"NEAR LOOP • LONG EXPOSURE",routeType:"LOOP",unlockWave:50,className:"map-moon",lives:18,hp:1.13,speed:1.01,specialBias:6,weather:"moon",weatherCopy:"Long shadows make camo balloons harder to read.",curveDetail:12,blockedZones:[{x:.59,y:.47,r:.068,kind:"moonstone"}],landmarks:[{x:.59,y:.47,kind:"moon-basin",label:"SILVER BASIN"},{x:.25,y:.47,kind:"moon-arch",label:"MOON ARCH"}],buildPockets:[{x:.39,y:.35},{x:.73,y:.48}],mechanic:{kind:"basin",icon:"☾",label:"SILVER BASIN",copy:"Basin grants veil sight and +8% reach. Moonlight also feeds +18% attack speed."},mechanicZones:[{x:.59,y:.47,r:.185,kind:"basin"}],route:[{x:-.06,y:.25},{x:.15,y:.13},{x:.38,y:.18},{x:.50,y:.34},{x:.43,y:.51},{x:.30,y:.64},{x:.43,y:.79},{x:.67,y:.75},{x:.82,y:.61},{x:.87,y:.43},{x:.77,y:.28},{x:.82,y:.13},{x:1.06,y:.20}]},
    storm:{id:"storm",level:4,name:"STORM CIRCUIT",icon:"ϟ",entrance:"CHARGED WEST RUN",lore:"A broken weather circuit creates long straights between charged turns and control pockets.",lesson:"Spread CONTROL coverage across both straights so surge balloons cannot escape one cluster.",strategy:"LONG STRAIGHTS • SPLIT COVERAGE",routeType:"CIRCUIT",unlockWave:75,className:"map-storm",lives:17,hp:1.21,speed:1.08,specialBias:10,weather:"storm",weatherCopy:"Lightning surges briefly accelerate every balloon.",curveDetail:11,blockedZones:[{x:.49,y:.32,r:.052,kind:"pylon"},{x:.87,y:.31,r:.05,kind:"pylon"}],landmarks:[{x:.49,y:.32,kind:"storm-pylon",label:"WEST PYLON"},{x:.87,y:.31,kind:"storm-pylon",label:"EAST PYLON"},{x:.60,y:.68,kind:"storm-coil",label:"SURGE COIL"}],buildPockets:[{x:.25,y:.48},{x:.81,y:.55}],mechanic:{kind:"pylon",icon:"ϟ",label:"LIVE PYLONS",copy:"One pylon: +8% speed. Occupy both to close the circuit: +16%, or +34% in a surge.",link:true},mechanicZones:[{x:.49,y:.32,r:.17,kind:"pylon"},{x:.87,y:.31,r:.17,kind:"pylon"}],route:[{x:-.06,y:.56},{x:.12,y:.72},{x:.33,y:.69},{x:.42,y:.52},{x:.37,y:.34},{x:.26,y:.22},{x:.42,y:.12},{x:.67,y:.17},{x:.76,y:.36},{x:.69,y:.54},{x:.59,y:.67},{x:.77,y:.78},{x:.95,y:.63},{x:1.06,y:.44}]},
    blizzard:{id:"blizzard",level:5,name:"WHITEOUT PASS",icon:"❄",entrance:"SOUTH ICE SHELF",lore:"A wide mountain pass sweeps around frozen shelves before climbing toward the gate.",lesson:"Stagger wide-range Rizos across the upper and lower shelves instead of stacking one bend.",strategy:"WIDE PASS • STAGGERED RANGE",routeType:"PASS",unlockWave:100,className:"map-blizzard",lives:16,hp:1.30,speed:1.04,specialBias:14,weather:"blizzard",weatherCopy:"Whiteouts shrink most Rizo attack ranges for a few seconds.",curveDetail:11,blockedZones:[{x:.11,y:.48,r:.06,kind:"ice"},{x:.68,y:.54,r:.064,kind:"ice"}],landmarks:[{x:.11,y:.48,kind:"ice-shelf",label:"LOW SHELF"},{x:.68,y:.54,kind:"ice-shelf",label:"HIGH SHELF"},{x:.48,y:.12,kind:"snow-peak",label:"NORTH PEAK"}],buildPockets:[{x:.35,y:.61},{x:.73,y:.33}],mechanic:{kind:"shelter",icon:"❄",label:"ICE SHELTER",copy:"Shelter ignores Whiteout and adds +4% reach. During Whiteout it opens to +14% reach."},mechanicZones:[{x:.35,y:.61,r:.15,kind:"shelter"},{x:.68,y:.54,r:.18,kind:"shelter"}],route:[{x:-.06,y:.75},{x:.14,y:.67},{x:.23,y:.49},{x:.16,y:.29},{x:.28,y:.13},{x:.49,y:.20},{x:.56,y:.38},{x:.47,y:.55},{x:.56,y:.72},{x:.78,y:.76},{x:.91,y:.61},{x:.84,y:.42},{x:.89,y:.21},{x:1.06,y:.18}]},
    eclipse:{id:"eclipse",level:6,name:"ECLIPSE RIDGE",icon:"◉",entrance:"DARK RIDGE MOUTH",lore:"The oldest route coils through three shadow monuments before breaking toward the final gate.",lesson:"Cover the inner coil and the late ridge separately while preserving veil sight and armor break.",strategy:"INNER COIL • LATE RIDGE",routeType:"RIDGE",unlockWave:150,className:"map-eclipse",lives:15,hp:1.42,speed:1.10,specialBias:19,weather:"eclipse",weatherCopy:"The eclipse periodically turns every balloon camouflaged.",curveDetail:12,blockedZones:[{x:.42,y:.29,r:.06,kind:"obelisk"},{x:.72,y:.72,r:.06,kind:"obelisk"},{x:.82,y:.42,r:.05,kind:"obelisk"}],landmarks:[{x:.42,y:.29,kind:"eclipse-obelisk",label:"FIRST SHADOW"},{x:.72,y:.72,kind:"eclipse-obelisk",label:"SECOND SHADOW"},{x:.82,y:.42,kind:"eclipse-rift",label:"RIFT MOUTH"}],buildPockets:[{x:.45,y:.48},{x:.84,y:.82}],mechanic:{kind:"seal",icon:"◉",label:"SHADOW SEALS",copy:"One seal grants veil sight +6% reach. Occupy both to resonate them at +14% reach.",link:true},mechanicZones:[{x:.45,y:.48,r:.145,kind:"seal"},{x:.82,y:.79,r:.15,kind:"seal"}],route:[{x:-.06,y:.20},{x:.16,y:.20},{x:.31,y:.33},{x:.29,y:.55},{x:.18,y:.71},{x:.39,y:.81},{x:.59,y:.71},{x:.65,y:.51},{x:.58,y:.33},{x:.68,y:.16},{x:.88,y:.22},{x:.94,y:.44},{x:.85,y:.65},{x:1.06,y:.72}]}
  }).map(([id,map])=>[id,defensePrepareMap(map)]));
  const DEFENSE_MAP_ORDER=["grove","ember","moon","storm","blizzard","eclipse"];
  const DEFENSE_SCHOOL_LESSONS=[
    {id:"route",step:1,title:"READ THE TRAIL",copy:"Trace the real entrance-to-gate route before building."},
    {id:"placement",step:2,title:"PLACE A RIZO",copy:"Drag a roster card—or tap it, then tap open grass."},
    {id:"targeting",step:3,title:"CHANGE TARGETING",copy:"After Wave 1, inspect a Rizo and change FIRST to another priority."},
    {id:"intel",step:4,title:"READ THREAT INTEL",copy:"Open THREATS when a special enemy enters the plan."},
    {id:"doctrine",step:5,title:"CHOOSE A PATH",copy:"At Level 3, commit one Rizo to POWER or CONTROL."},
    {id:"abilities",step:6,title:"CAST AN EFFECT",copy:"During a live wave, cast one ready activated effect."}
  ];
  let defenseFieldGuideTab="rizos";
  function normalizeDefenseSchool(raw,{experienced=false}={}){const ids=DEFENSE_SCHOOL_LESSONS.map(item=>item.id),input=raw&&typeof raw==="object"?raw:{},completed=[...new Set((Array.isArray(input.completed)?input.completed:[]).filter(id=>ids.includes(id)))];if(experienced&&!completed.length)return{dismissed:true,completed:[...ids],replay:false};return{dismissed:Boolean(input.dismissed),completed,replay:Boolean(input.replay)};}
  function defenseSchoolState(){state.player.defenseSchool=normalizeDefenseSchool(state.player.defenseSchool);return state.player.defenseSchool;}
  function defenseSchoolComplete(){return DEFENSE_SCHOOL_LESSONS.every(item=>defenseSchoolState().completed.includes(item.id));}
  function defenseSchoolNext(){const school=defenseSchoolState();return DEFENSE_SCHOOL_LESSONS.find(item=>!school.completed.includes(item.id))||null;}
  function completeDefenseSchoolLesson(id,{silent=false}={}){const school=defenseSchoolState(),lesson=DEFENSE_SCHOOL_LESSONS.find(item=>item.id===id);if(!lesson||school.completed.includes(id))return false;const required=DEFENSE_SCHOOL_LESSONS.slice(0,lesson.step-1);if(required.some(item=>!school.completed.includes(item.id)))return false;school.completed.push(id);school.dismissed=false;saveState(true);if(!silent){setDefenseMessage?.(`TRAIL SCHOOL • ${lesson.title}`,lesson.step===6?"COURSE COMPLETE. THE FIELD IS YOURS.":`LESSON ${lesson.step}/6 RECORDED.`);sfx?.("reward");haptic?.([8,14,8]);}updateDefenseSchoolCoach();return true;}
  function restartDefenseSchool(){state.player.defenseSchool={dismissed:false,completed:[],replay:true};if(mini.defense)mini.defense.schoolHiddenRun=false;saveState(true);updateDefenseSchoolCoach();}
  function defenseSchoolRelevant(lesson){const d=mini.defense;if(!d||!lesson)return false;if(lesson.id==="route")return d.towers.length===0;if(lesson.id==="placement")return true;if(lesson.id==="targeting")return d.towers.length>0&&d.wave>=1;if(lesson.id==="intel"){const counts=defenseIntelCounts();return [...counts.keys()].some(key=>!["puff","fleet"].includes(key));}if(lesson.id==="doctrine")return d.towers.some(tower=>tower.upgrade>=2&&!tower.doctrine);if(lesson.id==="abilities")return defenseIsActiveWave(d)&&d.towers.some(tower=>tower.upgrade>=2&&tower.doctrine&&defenseAbilityRemaining(tower)<=0);return false;}
  function defenseSchoolCoachMarkup(){const school=defenseSchoolState(),lesson=defenseSchoolNext();if(school.dismissed||defenseSchoolComplete()||mini.defense?.schoolHiddenRun||!defenseSchoolRelevant(lesson))return"";const action=lesson.id==="route"?'<button type="button" data-defense-trace-route>TRACE ROUTE</button>':lesson.id==="intel"?'<button type="button" data-defense-toggle-intel>OPEN THREATS</button>':"";return`<section class="defense-school-coach-card lesson-${lesson.id}"><span>${lesson.step}</span><div><small>TRAIL SCHOOL • ${lesson.step}/6</small><b>${escapeHTML(lesson.title)}</b><em>${escapeHTML(lesson.copy)}</em></div>${action}<button type="button" class="school-hide" data-defense-school-hide-run aria-label="Hide coaching for this run">×</button></section>`;}
  function updateDefenseSchoolCoach(){const host=$("#defenseSchoolCoach"),d=mini.defense;if(!host||!d)return;const markup=defenseSchoolCoachMarkup(),signature=markup;if(signature!==d.schoolCoachSignature){host.innerHTML=markup;d.schoolCoachSignature=signature;}host.hidden=!markup;}
  function defenseSchoolLobbyMarkup(){const school=defenseSchoolState(),done=school.completed.length,complete=defenseSchoolComplete();return`<section class="defense-school-lobby ${complete?"complete":""}"><span>${complete?"✓":"▤"}</span><div><small>OPTIONAL • REAL CONTROLS</small><b>TRAIL SCHOOL • ${done}/6</b><em>${complete?"Course complete. Replay it whenever you want.":school.dismissed?"Coaching is hidden. Your progress is preserved.":"Six short lessons appear only when their mechanic matters."}</em></div><button type="button" data-defense-school-open>${complete?"REPLAY":"OPEN"}</button></section>`;}
  function showDefenseTrailSchool(){const school=defenseSchoolState(),rows=DEFENSE_SCHOOL_LESSONS.map(item=>`<article class="trail-school-row ${school.completed.includes(item.id)?"done":""}"><i>${school.completed.includes(item.id)?"✓":item.step}</i><div><b>${escapeHTML(item.title)}</b><small>${escapeHTML(item.copy)}</small></div></article>`).join("");showModal(`<div class="modal-card trail-school-modal"><small>RIZO DEFENSE • OPTIONAL COURSE</small><h2>TRAIL SCHOOL</h2><p>Learn on the real battlefield. Nothing here changes prices, enemies, rewards, or your Rizo.</p><div class="trail-school-list">${rows}</div><div class="modal-buttons"><button type="button" data-defense-school-dismiss>${school.dismissed?"ENABLE COACHING":"HIDE COACHING"}</button><button type="button" data-defense-school-restart>RESTART COURSE</button><button class="primary" type="button" data-defense-records-back>BACK TO WORLD ROUTE</button></div></div>`);}
  function defenseTargetingGuide(variant){return["obsidian","diamond","shadow"].includes(variant)?"STRONG for durable threats; FIRST when the Gate is under pressure.":["frost","moss","bubblegum","retro"].includes(variant)?"FIRST to control runners before they escape.":variant==="golden"?"FIRST for steady pop income; CLOSE if protecting a dense bend.":"FIRST is reliable. Change to STRONG, LAST, or CLOSE when the map asks for it.";}
  function defenseFieldGuideMarkup(tab=defenseFieldGuideTab){defenseFieldGuideTab=["rizos","threats","worlds"].includes(tab)?tab:"rizos";const tabs=`<nav class="field-guide-tabs"><button type="button" data-field-guide-tab="rizos" class="${defenseFieldGuideTab==="rizos"?"active":""}">YOUR RIZOS</button><button type="button" data-field-guide-tab="threats" class="${defenseFieldGuideTab==="threats"?"active":""}">THREATS</button><button type="button" data-field-guide-tab="worlds" class="${defenseFieldGuideTab==="worlds"?"active":""}">WORLDS</button></nav>`;let body="";if(defenseFieldGuideTab==="rizos")body=defenseRoster().filter(row=>!defenseStructureType(row)).map(row=>{const pet=row.pet,variantId=pet.variant||pet.hiddenVariant||"classic",variant=VARIANTS.find(item=>item.id===variantId)||VARIANTS[0],ability=DEFENSE_ABILITIES[variantId]||DEFENSE_ABILITIES.classic,mastery=defenseMasteryForPet(pet.id)||{},unlock=defenseMasteryUnlockCopy(mastery);return`<article class="field-guide-rizo" style="--guide-color:${variant.color}"><span>${petMarkup({pet,extraClass:"field-guide-pet",context:"thumbnail",label:pet.name})}</span><div><small>${escapeHTML(variant.name)} • ${escapeHTML(defenseMasteryTitle(mastery))}</small><b>${escapeHTML(pet.name)}</b><p><strong>PASSIVE</strong>${escapeHTML(ability.passive)}</p><p><strong>ACTIVE</strong>${escapeHTML(ability.active)} — ${escapeHTML(ability.copy)}</p><p><strong>TARGETING</strong>${escapeHTML(defenseTargetingGuide(variantId))}</p><p><strong>POWER</strong>${escapeHTML(DEFENSE_DOCTRINES.power.copy)}</p><p><strong>CONTROL</strong>${escapeHTML(DEFENSE_DOCTRINES.control.copy)}</p><em>${escapeHTML(unlock.current)} • ${escapeHTML(unlock.next)}</em></div></article>`;}).join("")||"<p>Raise a Rizo beyond the egg stage to add it to the field guide.</p>";else if(defenseFieldGuideTab==="threats"){const normals=Object.entries(DEFENSE_ENEMIES).map(([key,data])=>`<article class="field-guide-threat" style="--guide-color:${data.color}"><span class="defense-guide-balloon balloon-${escapeHTML(key)}" aria-hidden="true"><i></i></span><div><small>${escapeHTML(data.trait||"THREAT")}</small><b>${escapeHTML(data.name)}</b><p>${escapeHTML(data.intel||"")}</p><em>COUNTER • ${escapeHTML(data.counter||"ANY RIZO")}</em></div></article>`).join("");const bosses=DEFENSE_BOSSES.map(data=>`<article class="field-guide-threat boss" style="--guide-color:${data.color}"><span class="defense-guide-balloon boss ${escapeHTML(data.className||"")}" aria-hidden="true"><i></i></span><div><small>BOSS • ${escapeHTML(data.trait||"")}</small><b>${escapeHTML(data.name)}</b><p>${escapeHTML(data.hint||"")}</p><em>COUNTER • ${escapeHTML(data.counter||"FOCUS FIRE")}</em></div></article>`).join("");body=normals+bosses;}else body=DEFENSE_MAP_ORDER.map(id=>{const map=DEFENSE_MAPS[id],open=defenseUnlockedMaps().some(item=>item.id===id),best=Math.max(0,Number(state.scores?.defenseMaps?.[id])||0);return`<article class="field-guide-world ${open?"":"locked"}" style="--guide-color:${defenseMapAccent(id)}"><span>${map.icon}</span><div><small>WORLD ${map.level} • ${open?`BEST CLEARED ${best}`:`UNLOCK • CLEAR ${map.unlockWave}`}</small><b>${escapeHTML(map.name)}</b><p><strong>${escapeHTML(map.routeType)}</strong>${escapeHTML(map.strategy)}</p><p>${escapeHTML(map.lore)}</p><em>TRAIL LESSON • ${escapeHTML(map.lesson)}</em><small class="field-guide-map-mechanic">${escapeHTML(map.mechanic?.icon||"✦")} MAP MECHANIC • ${escapeHTML(map.mechanic?.copy||"")}</small></div></article>`;}).join("");return`<div class="modal-card defense-field-guide"><small>KEEPER FIELD GUIDE • LIVE DEFINITIONS</small><div class="field-guide-head"><div><h2>KNOW YOUR FIELD.</h2><p>Roster, counters, and worlds are read directly from the same definitions used by Defense.</p></div><b>NO HIDDEN STATS</b></div>${tabs}<div class="field-guide-scroll">${body}</div><div class="modal-buttons"><button type="button" data-defense-records-back>WORLD ROUTE</button><button class="primary" type="button" data-close-modal>CLOSE GUIDE</button></div></div>`;}
  function showDefenseFieldGuide(tab=defenseFieldGuideTab){defenseFieldGuideTab=tab;if(mini.active&&mini.mode==="defense"&&defenseIsActiveWave(mini.defense)&&!mini.defense.paused){mini.defense.paused=true;mini.defense.autoPaused=false;setDefenseMessage("FIELD GUIDE • TRAIL PAUSED","Closing the guide will not silently resume the wave.");markDefenseUi();flushDefenseUi(true);}showModal(defenseFieldGuideMarkup(defenseFieldGuideTab));}
  function defenseControlLegendMarkup(){
    const rows=[
      {icon:"▶/Ⅱ",label:"MAIN BUTTON",copy:"Start the next wave, pause, or resume."},
      {icon:"1×",label:"SPEED",copy:"Cycles ½× • 1× • 2×. Base pace stays deliberate."},
      {icon:"?",label:"THREATS",copy:"Shows what is coming and which Rizos counter it."},
      {icon:"⚡",label:"POWERS",copy:"One button per power. The badge counts ready power groups."},
      {icon:"⛶",label:"FULLSCREEN",copy:"Uses a full-height landscape field when your device allows it."},
      {icon:"◌",label:"CYAN RING",copy:"A selected Rizo’s attack reach."},
      {icon:"LV3",label:"LEVEL TAG",copy:"The placed Rizo’s upgrade level. No tag means Level 1."},
      {icon:"#2",label:"COPY TAG",copy:"Which deployed copy of the same Rizo this is."},
      {icon:"× ◉ !",label:"THREAT STATE",copy:"Armor broken, revealed, or a boss action charging. Blank state badges are hidden."},
      {icon:"◎",label:"PLACEMENT FOOT",copy:"Green clears the trail and nearby Rizos. Cyan means the preview gently snapped to the closest legal edge."},
      {icon:"190",label:"ROSTER BADGE",copy:"Deployment cost, FREE, selected, or blocked."}
    ];
    const body=rows.map(row=>`<article class="defense-legend-row"><span>${escapeHTML(row.icon)}</span><div><b>${escapeHTML(row.label)}</b><em>${escapeHTML(row.copy)}</em></div></article>`).join("");
    return `<div class="modal-card defense-control-legend"><small>RIZO DEFENSE • FIELD LEGEND</small><h2>WHAT IS THAT?</h2><div class="defense-legend-list">${body}</div><div class="modal-buttons"><button class="primary" type="button" data-close-modal>GOT IT</button></div></div>`;
  }

  function showDefenseControlLegend(){showModal(defenseControlLegendMarkup());}
  function defenseMapPointAt(map,progress){return defensePointFromMetrics(map.pathMetrics||(map.pathMetrics=defensePathMetrics(map.path)),progress);}
  

  function defenseRouteMarkersMarkup(map){
    return[.12,.27,.42,.57,.72,.87].map((progress,index)=>{const point=defenseMapPointAt(map,progress),next=defenseMapPointAt(map,Math.min(.995,progress+.012)),angle=Math.atan2(next.y-point.y,next.x-point.x)*180/Math.PI;return`<i class="defense-route-marker" style="--route-x:${clamp(point.x,.03,.97)*100}%;--route-y:${clamp(point.y,.07,.93)*100}%;--route-angle:${angle}deg" data-route-marker="${index}" aria-hidden="true"><span></span></i>`;}).join("");
  }

  function traceDefenseRoute(){
    const d=mini.defense,scout=$("#defenseRouteScout"),world=$("#defenseWorld");if(!d||!scout)return false;completeDefenseSchoolLesson("route");scout.getAnimations?.().forEach(animation=>animation.cancel());
    world?.classList.add("route-tracing");
    const frames=Array.from({length:32},(_,index)=>{const point=defenseMapPointAt(d.map,index/31);return{left:`${clamp(point.x,.025,.975)*100}%`,top:`${clamp(point.y,.06,.94)*100}%`};});
    if(state.settings.reducedMotion){const end=frames.at(-1);Object.assign(scout.style,end);scout.classList.add("active");queueMiniTimeout(()=>scout.classList.remove("active"),900);}else scout.animate(frames,{duration:3600,easing:"linear",fill:"none"});
    queueMiniTimeout(()=>world?.classList.remove("route-tracing"),3900);
    setDefenseMessage(`${d.map.entrance} → EMBER GATE`,`${d.map.strategy} • ${d.map.lesson}`);return true;
  }

  // v78: the authored 1x experience is intentionally readable. Fast enemies still
  // feel fast because their relative identity is preserved; ordinary traffic gets air.
  const DEFENSE_GLOBAL_MOVEMENT_PACE = 0.94;
  const DEFENSE_ENEMIES = {
    puff:{name:"GLOOM BALLOON",className:"balloon-puff",hp:15,speed:.0472,reward:6,damage:1,color:"#ff5b68",icon:"○",trait:"BASIC DRIFTER",counter:"ANY RIZO",intel:"The baseline threat. Use it to judge whether your field has enough coverage."},
    fleet:{name:"ZIP BALLOON",className:"balloon-fleet",hp:11,speed:.0764,reward:8,damage:1,color:"#55dfff",icon:"»",trait:"FAST",counter:"FIRST • SLOW",intel:"Low health, high speed. FIRST targeting and trail control keep it away from the gate."},
    shell:{name:"IRON BALLOON",className:"balloon-shell",hp:42,speed:.035,reward:15,damage:2,color:"#9b7bd7",armor:.22,icon:"▰",trait:"ARMORED • CRACKS",counter:"POWER • DIAMOND",intel:"Its plate absorbs damage until half health, then visibly cracks and loses most armor."},
    split:{name:"BUBBLE BALLOON",className:"balloon-split",hp:27,speed:.044,reward:10,damage:1,color:"#ff83ce",icon:"◎",trait:"SPLITS ON POP",counter:"CHAIN • SPLASH",intel:"Popping it creates two real children that count toward the wave."},
    fire:{name:"FIRE BALLOON",className:"balloon-fire",hp:54,speed:.046,reward:18,damage:2,color:"#ff713f",fireproof:true,icon:"▲",trait:"FIREPROOF",counter:"FROST • TOXIC",intel:"Resists Ember attacks. Frost strikes hit it harder and control ignores its heat."},
    frost:{name:"FROST BALLOON",className:"balloon-frost",hp:62,speed:.039,reward:36,damage:2,color:"#a8f3ff",armor:.08,slowResist:.78,icon:"✦",trait:"SLOW RESIST",counter:"POWER • PUSH",intel:"Most slows barely move it. Heavy damage and Bubblegum knockback remain reliable."},
    storm:{name:"STORM BALLOON",className:"balloon-storm",hp:39,speed:.058,reward:18,damage:2,color:"#ffe66b",stormPulse:true,icon:"ϟ",trait:"SURGE BURSTS",counter:"CONTROL • FIRST",intel:"Its body telegraphs speed surges. Slow it before the charge reaches the gate."},
    ghost:{name:"PHASE BALLOON",className:"balloon-ghost",hp:47,speed:.051,reward:44,damage:2,color:"#c59cff",phasing:true,icon:"◇",trait:"PHASES",counter:"CONTROL • GLITCH",intel:"Takes reduced damage while translucent. CONTROL doctrine locks it into the physical trail."},
    shade:{name:"SHADE BALLOON",className:"balloon-shade",hp:34,speed:.05,reward:30,damage:2,color:"#3d3450",camo:true,icon:"",trait:"CAMOUFLAGED",counter:"AWAKEN • SHADOW",intel:"Base Rizos struggle to see it. Level 3 Rizos and Shadow, Aurora, or Glitch detect it."},
    brick:{name:"CERAMIC BALLOON",className:"balloon-brick",hp:165,speed:.030,reward:56,damage:4,color:"#c87845",armor:.10,icon:"",trait:"DENSE SHELL",counter:"POWER • ARMOR BREAK",intel:"One Ceramic carries the durability of a crowd. Crack its shell instead of adding more towers blindly."},
    lead:{name:"LEAD BALLOON",className:"balloon-lead",hp:132,speed:.027,reward:62,damage:4,color:"#77818d",armor:.46,slowResist:.28,icon:"",trait:"HEAVY ARMOR",counter:"POWER • SHRED",intel:"Lead plating shrugs off weak repeated hits. POWER doctrine and armor shred open it for the field."},
    relay:{name:"RELAY BALLOON",className:"balloon-relay",hp:78,speed:.043,reward:40,damage:2,color:"#5fe0b7",supportAura:true,icon:"⌁",trait:"BOOSTS THE PACK",counter:"FIRST • BURST",intel:"While a Relay is close, nearby threats move faster and gain temporary protection. Pop the Relay and its nearby convoy briefly loses the signal and stutters."},
    mender:{name:"MENDER BALLOON",className:"balloon-mender",hp:94,speed:.037,reward:48,damage:2,color:"#ff9fcf",healer:true,icon:"+",trait:"REPAIRS ALLIES",counter:"FOCUS • CONTROL",intel:"Periodically repairs a wounded nearby non-boss threat and can restore shredded plating before it fully breaks. A nearby Relay speeds its triage cycle."}
  };
  const DEFENSE_BOSSES=[
    {id:"crown",name:"THE WARDEN",className:"boss-crown",hp:430,speed:.025,reward:180,damage:7,color:"#171421",armor:.26,icon:"",trait:"CALLS HEAVY GUARDS",counter:"CONTROL • SPLASH",hint:"THE WARDEN CALLS HEAVY ESCORTS. BREAK THE SIGNAL OR CRACK THE FORMATION."},
    {id:"vortex",name:"THE MAW",className:"boss-vortex",hp:410,speed:.027,reward:180,damage:7,color:"#6f4ad7",armor:.12,icon:"",trait:"COLLAPSES RIZO RANGE",counter:"SPREAD • CONTROL",hint:"THE MAW COMPRESSES THE FIELD. INTERRUPT ITS PULSE OR FIGHT FROM MULTIPLE ANGLES."},
    {id:"mirror",name:"THE MIRROR",className:"boss-mirror",hp:400,speed:.028,reward:180,damage:7,color:"#bdefff",armor:.10,icon:"",trait:"MULTIPLIES AT HALF",counter:"BALANCED COVERAGE",hint:"THE MIRROR MULTIPLIES ITS REMAINING MASS. KEEP BOTH HALVES COVERED."},
    {id:"apex",name:"THE REDLINE",className:"boss-apex",hp:455,speed:.024,reward:190,damage:8,color:"#ff4c63",armor:.20,icon:"",trait:"BREAKS INTO SPEED SURGES",counter:"CONTROL • FIRST",hint:"THE REDLINE WINDS UP BEFORE A VIOLENT SURGE. CONTROL CAN CANCEL THE BURST."}
  ];
  const DEFENSE_MILESTONES=[10,25,50,100];
  const DEFENSE_TARGET_MODES=["first","strong","last","close"];
  const DEFENSE_TARGET_LABELS={first:"FRONT",strong:"TOUGHEST",last:"BACK",close:"NEAREST"};
  const DEFENSE_DOCTRINES={power:{id:"power",name:"POWER PATH",copy:"Harder hits, stronger abilities, and charged doctrine strikes."},control:{id:"control",name:"CONTROL PATH",copy:"More range, faster attacks, and pulse strikes that restrain the trail."}};
  const DEFENSE_BASIC_TOWER=Object.freeze({id:"defense-tool-basic",name:"BASIC DEFENSE RIZO",variant:"defense-basic",color:"#eee6d6",powerColor:"#ff9a56",controlColor:"#7fe2c4",deployBase:85,duplicateStep:20,upgradeCosts:Object.freeze([70,125,230,430]),doubleStitchEvery:4,powerStrikeEvery:4,powerApexEvery:3,controlStrikeEvery:5,controlApexEvery:4});
  const DEFENSE_BASIC_PET=Object.freeze({id:DEFENSE_BASIC_TOWER.id,name:DEFENSE_BASIC_TOWER.name,variant:DEFENSE_BASIC_TOWER.variant,hiddenVariant:DEFENSE_BASIC_TOWER.variant,stage:"kid",alive:true,defenseUniversal:true,defenseGuest:true,accessory:null,skills:Object.freeze({power:0,speed:0,instinct:0,stamina:0,luck:0})});
  function defenseUniversalDeployRows(){return[{pet:DEFENSE_BASIC_PET,source:"universal",rosterIndex:-1}];}
  function defenseIsUniversalPet(pet){return Boolean(pet?.defenseUniversal||pet?.id===DEFENSE_BASIC_TOWER.id);}
  function defenseIsUniversalTower(tower){return Boolean(tower&&defenseIsUniversalPet(tower.pet));}
  function defenseUniversalDeployCost(copyCount=0){return DEFENSE_BASIC_TOWER.deployBase+Math.max(0,Math.floor(Number(copyCount)||0))*DEFENSE_BASIC_TOWER.duplicateStep;}
  function defenseTowerDisplayColor(tower){if(defenseIsUniversalTower(tower)){if(tower.doctrine==="power")return DEFENSE_BASIC_TOWER.powerColor;if(tower.doctrine==="control")return DEFENSE_BASIC_TOWER.controlColor;return DEFENSE_BASIC_TOWER.color;}const variant=tower?.pet?.variant||tower?.pet?.hiddenVariant||"classic";return(VARIANTS.find(item=>item.id===variant)||VARIANTS[0]).color;}
  function defenseBasicVisualMarkup({upgrade=0,doctrine=null,extraClass="",label="Basic Defense Rizo"}={}){const level=clamp(Number(upgrade)||0,0,4),path=doctrine==="power"?"power":doctrine==="control"?"control":"neutral";return`<span class="defense-basic-rizo basic-evo-${level} basic-path-${path} ${escapeHTML(extraClass)}" role="img" aria-label="${escapeHTML(label)}"><i class="basic-body"></i><i class="basic-eye eye-a"></i><i class="basic-eye eye-b"></i><i class="basic-mouth"></i><i class="basic-stitch stitch-a"></i><i class="basic-stitch stitch-b"></i><i class="basic-rig rig-a"></i><i class="basic-rig rig-b"></i><i class="basic-core"></i><i class="basic-crown"></i></span>`;}
  function defenseDeployPortraitMarkup(row,extraClass="defense-roster-rizo",context="thumbnail"){return defenseIsUniversalPet(row?.pet)?defenseBasicVisualMarkup({upgrade:0,extraClass,label:row.pet.name}):petMarkup({pet:row.pet,extraClass,context,label:row.pet.name});}
  function defenseTowerPortraitMarkup(tower,extraClass="defense-rizo",context="arcade"){return defenseIsUniversalTower(tower)?defenseBasicVisualMarkup({upgrade:tower.upgrade,doctrine:tower.doctrine,extraClass,label:`${tower.pet.name}, ${defenseCombatStats(tower).label} defender`}):petMarkup({pet:tower.pet,extraClass,context,label:tower.pet.name});}
  const DEFENSE_THREAT_PRIORITY={"boss:crown":100,"boss:vortex":100,"boss:mirror":100,"boss:apex":100,lead:96,relay:95,mender:93,brick:92,ghost:90,shade:85,storm:80,frost:75,fire:70,shell:60,split:50,fleet:40,puff:30};
  const DEFENSE_STAGE_MULTIPLIER={spark:.78,kid:.9,teen:1,beast:1.12,legend:1.24};
  const DEFENSE_ABILITIES={
    classic:{passive:"Reliable front-line shots. Level 2 adds a heavy third shot.",active:"RALLY",copy:"All defenders attack faster for 6 seconds.",cooldown:24},
    ember:{passive:"Shots ignite balloons over time.",active:"FIRE RING",copy:"Burn every balloon near this Rizo.",cooldown:25},
    toxic:{passive:"Poison keeps hurting after impact.",active:"SPORE CLOUD",copy:"Poison every balloon currently on the trail.",cooldown:28},
    violet:{passive:"Every shot jumps through three nearby balloons, even on a killing hit.",active:"CHAIN SURGE",copy:"Lightning jumps through the front six balloons.",cooldown:23},
    moss:{passive:"Shots briefly root balloons in place.",active:"ROOT GARDEN",copy:"Hold nearby balloons still for several seconds.",cooldown:27},
    bubblegum:{passive:"Hits push balloons backward.",active:"BIG BOUNCE",copy:"Knock every nearby balloon far down the path.",cooldown:24},
    frost:{passive:"Chills threats and sets up heavy hits. Level 2 chills a small crowd.",active:"DEEP FREEZE",copy:"Freeze and heavily slow every balloon.",cooldown:29},
    glitch:{passive:"Random shots sometimes hit much harder.",active:"REWRITE",copy:"Fire eight unstable strikes at random targets.",cooldown:21},
    obsidian:{passive:"Heavy shells splash tightly packed targets. Level 2 strips armor.",active:"QUAKE",copy:"Crush every balloon around this Rizo.",cooldown:31},
    aurora:{passive:"Nearby defenders deal more damage.",active:"PRISM FIELD",copy:"Boost every defender for 8 seconds.",cooldown:30},
    golden:{passive:"Every pop creates extra match coins.",active:"PAYDAY",copy:"Create a large burst of match coins.",cooldown:34},
    diamond:{passive:"Shots pierce multiple balloons.",active:"SHARD LINE",copy:"Cut through the eight closest balloons.",cooldown:26},
    shadow:{passive:"Critical hits can deal huge damage.",active:"NIGHT CUT",copy:"Execute a wounded front balloon or heavily strike it.",cooldown:25},
    retro:{passive:"Attacks extremely quickly.",active:"OVERCLOCK",copy:"This Rizo attacks at double speed for 9 seconds.",cooldown:22}
  };


  const DEFENSE_CONTROL_ABILITIES=Object.freeze({
    classic:{active:"GUARD LINE",copy:"Lock the front of the trail and buy the whole field breathing room."},
    ember:{active:"CINDER WALL",copy:"Lay down a hot control zone that burns and slows the front pack."},
    toxic:{active:"SPORE SNARE",copy:"Poison and heavily slow the front formation."},
    violet:{active:"ARC NET",copy:"Chain a restraint through the leading threats."},
    moss:{active:"ROOT MAZE",copy:"Root a wide section of the trail for an extended hold."},
    bubblegum:{active:"REBOUND FIELD",copy:"Throw the front formation backward with almost no burst damage."},
    frost:{active:"ICE LOCK",copy:"Pin the front threats in place, including heavy balloons."},
    glitch:{active:"SIGNAL JAM",copy:"Reveal, phase-lock, and stall the leading formation."},
    obsidian:{active:"FAULT LOCK",copy:"Stun and shred armor instead of simply crushing everything."},
    aurora:{active:"PRISM LENS",copy:"Reveal the trail and extend control coverage across the field."},
    golden:{active:"TOLL GATE",copy:"Slow the front pack and skim gold while they remain trapped."},
    diamond:{active:"PRISM CAGE",copy:"Pin the toughest armored threats so POWER towers can finish them."},
    shadow:{active:"BLACKOUT",copy:"Blind the rush, reveal hidden threats, and drag the front backward."},
    retro:{active:"FRAME SKIP",copy:"Rewind the front formation a few frames down the trail."}
  });
  function defenseAbilityPresentation(tower){const base=defenseAbilityData(tower);if(tower?.doctrine!=="control")return base;const variant=tower.pet.variant||tower.pet.hiddenVariant||"classic",control=DEFENSE_CONTROL_ABILITIES[variant]||DEFENSE_CONTROL_ABILITIES.classic;return{...base,...control};}
  function defenseFieldLeader(d=mini.defense){return d?.towers?.find(t=>!t.superConsumed&&defenseIsCharacterTower(t)&&t.source==="active")||d?.towers?.find(t=>!t.superConsumed&&defenseIsCharacterTower(t))||null;}
  function activateDefenseFieldLeader(){const d=mini.defense,leader=defenseFieldLeader(d);if(!leader){setDefenseMessage("NO FIELD LEADER","The first Rizo you place owns the field power.");sfx("no");return false;}if(leader.upgrade<2||!leader.doctrine){showDefenseTowerPanel(leader);setDefenseMessage("FIELD POWER LOCKED",`${leader.pet.name} is the leader. Reach Level 3 and choose POWER or CONTROL.`);sfx("no");return false;}return activateDefenseAbility(leader.id);}

  const DEFENSE_CONTRACT_TARGET=10;
  const DEFENSE_CONTRACT_RULES={
    unique:{id:"unique",icon:"1",name:"NO COPIES",copy:"Each Rizo identity may enter the field once."},
    lean:{id:"lean",icon:"4",name:"LEAN FIELD",copy:"The contract closes the field after four defenders."},
    "no-sell":{id:"no-sell",icon:"×",name:"NO REFUNDS",copy:"Every placement is permanent for this run."},
    silent:{id:"silent",icon:"◇",name:"SEALED ACTIVES",copy:"Activated effects are disabled. Passive identity still matters."},
    "power-only":{id:"power-only",icon:"▲",name:"POWER OATH",copy:"Every Level 3 Rizo must choose POWER."},
    "control-only":{id:"control-only",icon:"⌁",name:"CONTROL OATH",copy:"Every Level 3 Rizo must choose CONTROL."}
  };
  const DEFENSE_CONTRACT_SETS=[
    {title:"THE FOUR-FLAME OATH",rules:["unique","lean","power-only"]},
    {title:"THE PATIENT GATE",rules:["unique","no-sell","control-only"]},
    {title:"THE SILENT HAMMER",rules:["lean","silent","power-only"]},
    {title:"THE QUIET NET",rules:["no-sell","silent","control-only"]},
    {title:"THE LAST PLACEMENT",rules:["unique","lean","no-sell"]},
    {title:"THE COLD COMMITMENT",rules:["lean","no-sell","control-only"]},
    {title:"THE SINGLE SIGNAL",rules:["unique","silent","power-only"]},
    {title:"THE CONTROL ROOM",rules:["lean","silent","control-only"]}
  ];
  const DEFENSE_BOSS_TELEGRAPHS={
    guards:{kind:"guards",title:"CROWN CALLING GUARDS",copy:"CONTROL HITS CAN BREAK THE CALL BEFORE TWO IRON GUARDS ARRIVE.",duration:1.55,interruptible:true},
    vortex:{kind:"vortex",title:"VORTEX CHARGING",copy:"SPREAD OUT OR LAND CONTROL HITS TO BREAK THE RANGE PULSE.",duration:1.25,interruptible:true},
    mirror:{kind:"mirror",title:"MIRROR FRACTURE",copy:"THE SPLIT CANNOT BE STOPPED. PREPARE COVERAGE ON BOTH SIDES.",duration:1.35,interruptible:false},
    apex:{kind:"apex",title:"APEX WINDING UP",copy:"CONTROL HITS CAN CANCEL THE COMING SPEED SURGE.",duration:1.1,interruptible:true}
  };

  const DEFENSE_PHASE_UI=Object.freeze({
    [DEFENSE_PHASES.PLANNING]:{label:"PLAN",detail:"BUILD WINDOW",tone:"info"},
    [DEFENSE_PHASES.COUNTDOWN]:{label:"INCOMING",detail:"PACKET APPROACH",tone:"money"},
    [DEFENSE_PHASES.COMBAT]:{label:"DEFEND",detail:"TRAIL LIVE",tone:"danger"},
    [DEFENSE_PHASES.PACKET_BREAK]:{label:"BREATHER",detail:"UPGRADE WINDOW",tone:"valid"},
    [DEFENSE_PHASES.WAVE_COMPLETE]:{label:"CLEARED",detail:"PLAN NEXT WAVE",tone:"valid"},
    [DEFENSE_PHASES.PAUSED]:{label:"PAUSED",detail:"SIMULATION FROZEN",tone:"paused"},
    [DEFENSE_PHASES.RUN_COMPLETE]:{label:"COMPLETE",detail:"RUN CLOSED",tone:"neutral"}
  });
  const DEFENSE_CINEMATIC_MOMENTS=Object.freeze({
    "wave-start":{icon:"≈",tone:"info",priority:2,duration:700},
    packet:{icon:"››",tone:"valid",priority:1,duration:460},
    boss:{icon:"!",tone:"boss",priority:7,duration:1500},
    danger:{icon:"♥",tone:"danger",priority:6,duration:900},
    upgrade:{icon:"↑",tone:"money",priority:3,duration:880},
    ability:{icon:"✦",tone:"info",priority:4,duration:1050},
    perfect:{icon:"★",tone:"perfect",priority:6,duration:1250},
    clear:{icon:"✓",tone:"valid",priority:4,duration:960},
    defeat:{icon:"×",tone:"danger",priority:10,duration:1650},
    bank:{icon:"◇",tone:"money",priority:10,duration:1300}
  });
  function defenseIsActiveWave(d=mini.defense){return Boolean(d&&DefenseCore.isCombatPhase(d.phase));}
  function defenseIsSimulating(d=mini.defense){return Boolean(d&&[DEFENSE_PHASES.COUNTDOWN,DEFENSE_PHASES.COMBAT,DEFENSE_PHASES.PACKET_BREAK].includes(d.phase));}
  function defensePhaseUi(d=mini.defense){
    const phase=DefenseCore.normalizePhase(d?.phase),base=DEFENSE_PHASE_UI[phase]||DEFENSE_PHASE_UI[DEFENSE_PHASES.PLANNING];
    if(!d)return base;
    if(phase===DEFENSE_PHASES.COUNTDOWN){const left=Math.max(0,(d.nextSpawnAt||d.clock)-(d.clock||0));return{...base,detail:`FIRST THREAT ${left.toFixed(1)}S`};}
    if(phase===DEFENSE_PHASES.PACKET_BREAK){const left=Math.max(0,(d.packetBreakUntil||d.clock)-(d.clock||0)),remaining=Math.max(0,(d.wavePackets?.length||0)-(d.packetIndex||0));return{...base,detail:`${left.toFixed(1)}S • ${remaining} ${remaining===1?"PACKET":"PACKETS"} LEFT`};}
    if(phase===DEFENSE_PHASES.COMBAT){const current=Math.min((d.packetIndex||0)+1,d.wavePackets?.length||1),total=Math.max(1,d.wavePackets?.length||1);return{...base,detail:`PACKET ${current}/${total}`};}
    if(phase===DEFENSE_PHASES.WAVE_COMPLETE){return{...base,detail:state.settings.defenseAutoStart?"UPGRADE • OR START NOW":"UPGRADE • START WHEN READY"};}
    return base;
  }
  function defensePlaybackSpeed(d=mini.defense){
    if(!d)return 1;
    return d.speed===2&&defenseRealNow(d)<(d.flowEaseUntilReal||0)?1:d.speed;
  }
  function defenseFlowOnPhaseChange(d,from,to){
    if(!d||from===to)return;
    d.flowDecisionBeat=(d.flowDecisionBeat||0)+1;
    d.flowPulseUntilReal=defenseRealNow(d)+(to===DEFENSE_PHASES.PACKET_BREAK?1.65:.9);
    d.flowChoiceKey="";
    d.flowLastAction="";
    d.flowActionQuietUntilReal=0;
    if(to===DEFENSE_PHASES.PACKET_BREAK&&d.speed===2)d.flowEaseUntilReal=defenseRealNow(d)+1.15;
    markDefenseUi();
  }
  function defenseSetPhase(d,phase,{resumePhase=null,force=false}={}){
    if(!d)return DEFENSE_PHASES.RUN_COMPLETE;
    const normalized=DefenseCore.normalizePhase(phase,DEFENSE_PHASES.PLANNING),current=DefenseCore.normalizePhase(d.phase,DEFENSE_PHASES.PLANNING);
    if(!force&&d.phase&&current!==normalized&&!DefenseCore.canTransitionPhase(current,normalized)){
      d.phaseTransitionRejects=(d.phaseTransitionRejects||0)+1;
      defenseRecordValidationWarning("phase-transition-rejected",{from:current,to:normalized});
      return false;
    }
    if(normalized===DEFENSE_PHASES.PAUSED){d.resumePhase=resumePhase&&resumePhase!==DEFENSE_PHASES.PAUSED?DefenseCore.normalizePhase(resumePhase,DEFENSE_PHASES.COMBAT):(current!==DEFENSE_PHASES.PAUSED?current:d.resumePhase||DEFENSE_PHASES.COMBAT);}
    d.phase=normalized;
    defenseFlowOnPhaseChange(d,current,normalized);
    return normalized;
  }
  function installDefenseStateContracts(d){
    if(!d)return d;
    Object.defineProperty(d,"wave",{configurable:true,enumerable:false,get(){return this.currentWave||0;},set(value){this.currentWave=DefenseCore.clampInteger(value,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0);}});
    Object.defineProperty(d,"paused",{configurable:true,enumerable:false,get(){return this.phase===DEFENSE_PHASES.PAUSED;},set(value){if(value){if(this.phase!==DEFENSE_PHASES.PAUSED)this.resumePhase=this.phase;this.phase=DEFENSE_PHASES.PAUSED;}else if(this.phase===DEFENSE_PHASES.PAUSED){this.phase=DefenseCore.normalizePhase(this.resumePhase,DEFENSE_PHASES.COMBAT);}}});
    return d;
  }
  function defensePerformanceBudget(d=mini.defense){return d?.performanceLow||d?.renderTier>=2?DEFENSE_BUDGETS.low:DEFENSE_BUDGETS.normal;}
  function defenseVisualBudget(d=mini.defense){
    const speed=d?.speed||1,hardLow=Boolean(d?.performanceLow||(d?.governorTier||0)>=2),tier=clamp(Math.floor(d?.renderTier||0),0,2);
    if(hardLow)return DefenseCore.visualBudget({low:true,speed});
    const full=DefenseCore.visualBudget({low:false,speed});
    // Dense fields can shed decorative/projectile pressure preemptively while
    // preserving 60 Hz motion whenever measured frame time says the device can
    // afford it. Only the measured governor is allowed to drop presentation to 30.
    if(tier>=2){const lean=DefenseCore.visualBudget({low:true,speed});return{...lean,presentationFps:DefenseCore.SIMULATION.presentationHz};}
    if(tier===1)return{...full,maxVisibleProjectiles:Math.max(10,Math.floor(full.maxVisibleProjectiles*.78)),maxImpactEffects:Math.max(3,Math.floor(full.maxImpactEffects*.75)),weatherParticleScale:Math.min(full.weatherParticleScale,.68),projectileEmissionHz:Math.max(6,full.projectileEmissionHz-2),presentationFps:DefenseCore.SIMULATION.presentationHz};
    return full;
  }
  function defenseRealNow(d=mini.defense){return Number(d?.realClock)||0;}
  function defenseUpgradeAllowed(d=mini.defense){return Boolean(d&&DefenseCore.phaseAllows(d.phase,"upgrade"));}
  function defensePlacementAllowed(d=mini.defense){return Boolean(d&&DefenseCore.phaseAllows(d.phase,"place"));}
  function defenseSellAllowed(d=mini.defense){return Boolean(d&&DefenseCore.phaseAllows(d.phase,"sell"));}
  function defenseRecordValidationWarning(kind,details={}){try{localStorage.setItem(DEFENSE_VALIDATION_WARNING_KEY,JSON.stringify({at:now(),kind:String(kind||"sanitized").slice(0,60),details}));}catch(error){} }

  function defenseHashString(value){let hash=2166136261;for(const char of String(value||"")){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}
  function defenseMapAccent(id){return id==="grove"?"#9eff75":id==="ember"?"#ff735f":id==="moon"?"#c59cff":id==="storm"?"#55dfff":id==="blizzard"?"#d9fbff":"#ff68bd";}
  function normalizeDefenseRunContract(raw){if(!raw||typeof raw!=="object")return null;const date=String(raw.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;const mapId=DEFENSE_MAPS[raw.mapId]?raw.mapId:null;if(!mapId)return null;const rules=Array.isArray(raw.rules)?[...new Set(raw.rules.filter(rule=>DEFENSE_CONTRACT_RULES[rule]))].slice(0,3):[];if(rules.length!==3||rules.includes("power-only")&&rules.includes("control-only"))return null;const bestWave=DefenseCore.clampInteger(raw.bestWave,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0),completed=bestWave>=DEFENSE_CONTRACT_TARGET,perfect=completed&&Boolean(raw.perfect);return{id:typeof raw.id==="string"&&raw.id?raw.id.slice(0,120):`contract-${date}-${mapId}`,date,mapId,title:typeof raw.title==="string"&&raw.title?raw.title.slice(0,80):"DAILY TRAIL CONTRACT",rules,targetWave:DEFENSE_CONTRACT_TARGET,bestWave,completed,perfect,firstAt:Math.max(0,Number(raw.firstAt)||0),lastAt:Math.max(0,Number(raw.lastAt)||0)};}
  function buildDailyDefenseContract(date=dateKey()){
    const seed=defenseHashString(`RIZO-TRAIL-${date}`),unlocked=defenseUnlockedMaps(),map=(unlocked[seed%Math.max(1,unlocked.length)]||DEFENSE_MAPS.grove),rosterCount=defenseRoster().filter(row=>!defenseStructureType(row)).length,eligible=rosterCount>=4?DEFENSE_CONTRACT_SETS:DEFENSE_CONTRACT_SETS.filter(set=>!set.rules.includes("unique")),set=eligible[Math.floor(seed/Math.max(1,unlocked.length))%eligible.length]||DEFENSE_CONTRACT_SETS[2];
    return normalizeDefenseRunContract({id:`daily-${date}-${map.id}-${set.rules.join("-")}`,date,mapId:map.id,title:set.title,rules:set.rules,targetWave:DEFENSE_CONTRACT_TARGET,bestWave:0,completed:false,perfect:false,firstAt:now(),lastAt:now()});
  }
  function ensureDailyDefenseContract(date=dateKey()){
    state.scores.defenseContracts||=[];let contract=normalizeDefenseRunContract(state.scores.defenseContracts.find(item=>item?.date===date));
    if(!contract){contract=buildDailyDefenseContract(date);state.scores.defenseContracts=[contract,...state.scores.defenseContracts.filter(item=>item?.date!==date)].slice(0,35);saveState(true);}return contract;
  }
  function defenseContractRule(id,d=mini.defense){return Boolean(d?.contract?.rules?.includes(id));}
  function defenseContractForcedDoctrine(d=mini.defense){return defenseContractRule("power-only",d)?"power":defenseContractRule("control-only",d)?"control":null;}
  function defenseContractStreak(records=state.scores?.defenseContracts||[]){const completed=new Set(records.filter(item=>item?.completed).map(item=>item.date)),today=new Date(),cursor=new Date(today.getFullYear(),today.getMonth(),today.getDate());if(!completed.has(dateKey(cursor)))cursor.setDate(cursor.getDate()-1);let streak=0;while(completed.has(dateKey(cursor))){streak+=1;cursor.setDate(cursor.getDate()-1);}return streak;}
  function defenseContractRuleMarkup(contract){return contract.rules.map(id=>{const rule=DEFENSE_CONTRACT_RULES[id];return`<span title="${escapeHTML(rule.copy)}"><i>${escapeHTML(rule.icon)}</i><b>${escapeHTML(rule.name)}</b></span>`;}).join("");}
  function defenseDailyContractLobbyMarkup(contract){const map=DEFENSE_MAPS[contract.mapId]||DEFENSE_MAPS.grove,streak=defenseContractStreak(),status=contract.completed?`SEALED • BEST CLEARED ${contract.bestWave}`:`CLEAR WAVE ${contract.targetWave}`,accent=defenseMapAccent(map.id);return`<section class="defense-contract-card ${contract.completed?"completed":""}" style="--contract-accent:${accent}"><div class="defense-contract-head"><span>${contract.completed?"✓":map.icon}</span><div><small>LOCAL DAILY CONTRACT • ${escapeHTML(contract.date)}</small><h3>${escapeHTML(contract.title)}</h3><p>${escapeHTML(map.name)} • ${escapeHTML(status)} • ${streak} DAY STREAK</p></div></div><div class="defense-contract-rules">${defenseContractRuleMarkup(contract)}</div><button type="button" data-enter-defense-contract="${escapeHTML(contract.id)}">${contract.completed?"RUN AGAIN":"ACCEPT CONTRACT"}</button></section>`;}
  function recordDefenseContractProgress(d,final=false){
    const contract=normalizeDefenseRunContract(d?.contract);if(!contract)return{record:null,justCompleted:false};
    state.scores.defenseContracts||=[];
    const priorIndex=state.scores.defenseContracts.findIndex(item=>item?.id===contract.id||item?.date===contract.date),prior=normalizeDefenseRunContract(priorIndex>=0?state.scores.defenseContracts[priorIndex]:contract)||contract;
    const clearedWave=DefenseCore.clampInteger(d?.clearedWave,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0),bestWave=Math.max(prior.bestWave||0,clearedWave),completed=bestWave>=contract.targetWave;
    const perfect=Boolean(prior.perfect||(completed&&DefenseCore.clampInteger(d?.perfectWaveCount,0,clearedWave,0)>=contract.targetWave));
    const record={...prior,...contract,bestWave,completed,perfect,lastAt:now(),firstAt:prior.firstAt||now()},justCompleted=!prior.completed&&completed;
    const rest=state.scores.defenseContracts.filter((item,index)=>index!==priorIndex&&item?.date!==record.date);state.scores.defenseContracts=[record,...rest].slice(0,35);d.contract={...record};if(final||justCompleted||bestWave!==prior.bestWave)saveState(true);return{record,justCompleted};
  }


  function defenseMasteryTitle(record={}){
    const waves=Math.max(0,Number(record.waves)||0);
    if(waves>=400)return"TRAIL LEGEND";
    if(waves>=150)return"WORLD GUARD";
    if(waves>=50)return"GATEKEEPER";
    if(waves>=10)return"FIELD TESTED";
    return"UNTESTED";
  }
  function defenseMasteryTier(record={}){const waves=Math.max(0,Number(record.waves)||0);return waves>=400?4:waves>=150?3:waves>=50?2:waves>=10?1:0;}
  function defenseMasteryForPet(petId){return petId&&state.scores?.defenseMastery?.[petId]||null;}
  function defenseMasteryTierForPet(petId){return defenseMasteryTier(defenseMasteryForPet(petId)||{});}
  function defenseMasterySignatureName(record={}){const variant=VARIANTS.find(item=>item.id===record.variant)||VARIANTS[0],tier=defenseMasteryTier(record);if(tier>=4)return`${variant.name} LEGEND SIGNAL`;if(tier>=3)return`${variant.name} IMPACT SIGIL`;if(tier>=2)return`${variant.name} TRAIL`;if(tier>=1)return`${variant.name} FIELD MARK`;return"NO FIELD SIGNATURE";}
  function defenseMasteryUnlockCopy(record={}){const tier=defenseMasteryTier(record),next=["FIELD MARK AT 10 WAVES","TRAIL AT 50 WAVES","IMPACT SIGIL AT 150 WAVES","LEGEND AURA AT 400 WAVES","ALL FIELD SIGNATURES EARNED"][tier];return{tier,next,current:defenseMasterySignatureName(record)};}
  const DEFENSE_FEEL_PITCH=Object.freeze({classic:0,ember:-5,toxic:-3,violet:7,moss:-7,bubblegum:5,frost:9,glitch:1,obsidian:-12,aurora:12,golden:4,diamond:11,shadow:-10,retro:2});
  function defenseSignatureTone(tower,tier=defenseMasteryTierForPet(tower?.petId),doctrineStrike=null){
    const d=mini.defense;
    if(!tower||!state.settings.sound||!d)return;
    const time=defenseNow(),important=Boolean(doctrineStrike),globalWait=important?.05:(d.lowFx?.14:.06),towerWait=important?.075:(d.lowFx?.24:.10);
    if(time-(d.lastSignatureToneAt||0)<globalWait||time-(tower.lastSignatureToneAt||0)<towerWait)return;
    d.lastSignatureToneAt=time;tower.lastSignatureToneAt=time;
    const variant=tower.pet.variant||tower.pet.hiddenVariant||"classic",accent=(tower.shots||0)%3===0;
    const profiles={
      classic:[[205,.026,"triangle",0,18],[307,.018,"sine",.012,-8]],
      ember:[[142,.04,"sawtooth",0,-48],[92,.022,"square",.014,34]],
      toxic:[[178,.026,"square",0,-26],[121,.034,"sine",.012,-38]],
      violet:[[228,.042,"sine",0,58],[342,.025,"triangle",.016,22]],
      moss:[[126,.038,"triangle",0,-20],[168,.025,"sine",.018,-8]],
      bubblegum:[[252,.046,"sine",0,72],[378,.022,"sine",.014,-44]],
      frost:[[238,.034,"triangle",0,94],[476,.018,"sine",.012,-96]],
      glitch:[[166,.016,"square",0,118],[247,.014,"square",.018,-132]],
      obsidian:[[104,.052,"sawtooth",0,-62],[78,.028,"triangle",.016,-22]],
      aurora:[[264,.052,"sine",0,102],[396,.038,"sine",.018,48]],
      golden:[[210,.034,"triangle",0,68],[420,.022,"sine",.014,-18]],
      diamond:[[282,.025,"triangle",0,136],[564,.018,"sine",.012,-160]],
      shadow:[[96,.052,"sine",0,-78],[144,.03,"triangle",.018,-42]],
      retro:[[188,.014,"square",0,142],[94,.014,"square",.018,0]]
    };
    const notes=profiles[variant]||profiles.classic,gain=tier>=4?.0092:tier>=2?.0066:.0044,first=notes[0];tone(first[0],first[1],first[2],gain,first[3],first[4]);
    if((accent||tier>=3&&tower.shots%4===0)&&!d.lowFx){const second=notes[1];tone(second[0],second[1],second[2],gain*(tier>=3?.72:.62),second[3],second[4]);}
    if(tier>=4&&!d.lowFx&&tower.shots%8===0)tone(first[0]*2,.035,"sine",gain*.34,.018,variant==="glitch"?-90:90);
    if(important){const power=doctrineStrike==="power",root=Math.max(70,first[0]*(power?.62:1.28));tone(root,power?.075:.06,power?"sawtooth":"sine",gain*1.32,.008,power?-32:110);if(tower.superForm&&!d.lowFx)tone(root*(power?1.5:1.75),.09,"triangle",gain*.72,.055,power?80:150);}
  }

  function defenseAbilitySignature(tower){
    if(!tower||!state.settings.sound)return false;const variant=tower.pet.variant||tower.pet.hiddenVariant||"classic",doctrine=tower.doctrine||"power",superForm=Boolean(tower.superForm),shift=DEFENSE_FEEL_PITCH[variant]||0;
    const roots={classic:196,ember:130,toxic:154,violet:247,moss:116,bubblegum:262,frost:294,glitch:185,obsidian:98,aurora:330,golden:220,diamond:311,shadow:92,retro:208},waves={classic:"triangle",ember:"sawtooth",toxic:"square",violet:"sine",moss:"triangle",bubblegum:"sine",frost:"triangle",glitch:"square",obsidian:"sawtooth",aurora:"sine",golden:"triangle",diamond:"triangle",shadow:"sine",retro:"square"},root=roots[variant]||196,wave=waves[variant]||"triangle",power=doctrine==="power",gain=superForm?.032:.025;
    tone(root,.08,wave,gain,0,power?-18:54);tone(root*(power?1.5:1.75),.14,power?"triangle":"sine",gain*.9,.065,power?120:190);
    if(["ember","obsidian","retro","glitch"].includes(variant))noise(superForm?.11:.075,superForm?.012:.008,.025);
    if(["frost","aurora","diamond","violet"].includes(variant))tone(root*2,.08,"sine",gain*.42,.13,shift*6);
    if(superForm)tone(root*(power?2:2.25),.22,"sine",gain*.72,.18,power?210:290);
    return true;
  }

  function defenseBossCue(moment="arrival",bossId="crown"){
    if(!state.settings.sound)return false;const profiles={crown:{root:82,wave:"sawtooth",interval:1.5},vortex:{root:110,wave:"sine",interval:1.33},mirror:{root:147,wave:"triangle",interval:2},apex:{root:98,wave:"square",interval:2}},profile=profiles[bossId]||profiles.crown,root=profile.root,wave=profile.wave;
    if(moment==="arrival"){tone(root,.2,wave,.028,0,bossId==="apex"?120:-18);tone(root*profile.interval,.24,"triangle",.023,.13,bossId==="vortex"?-80:80);if(bossId==="mirror")tone(root*.75,.18,"sine",.017,.075,160);noise(.12,.011,.05);}
    else if(moment==="phase"){tone(root*1.25,.11,wave,.022,0,bossId==="vortex"?-95:95);tone(root*profile.interval*1.15,.13,"triangle",.018,.075,bossId==="mirror"?-160:125);}
    else if(moment==="resolve"){tone(root*.82,.08,"square",.02,0,bossId==="apex"?240:-55);noise(.07,.009,.02);}
    else if(moment==="break"){tone(root*1.5,.055,"square",.022,0,190);tone(root*2.25,.08,"triangle",.022,.045,260);noise(.05,.009,.018);}
    else if(moment==="down"){tone(root,.14,wave,.027,0,-52);noise(.14,.014,.025);[1.5,2,2.5].forEach((m,i)=>tone(root*m,.16,"sine",.024,.12+i*.065,180));}
    return true;
  }

  function defenseRecordFramePerformance(rawFrame){
    const d=mini.defense;if(!d||!Number.isFinite(rawFrame)||rawFrame<=0||rawFrame>250)return;const sample=clamp(rawFrame,8,90),seconds=sample/1000;
    d.frameMs=d.frameMs*.94+sample*.06;d.frameSamples ||= [];d.frameSamples.push(sample);if(d.frameSamples.length>120)d.frameSamples.shift();d.frameSampleClock=(d.frameSampleClock||0)+seconds;
    d.frameStress=clamp((d.frameStress||0)+(sample>38?2.4:sample>28?.9:sample>21?.18:-.28),0,120);d.slowFrameStreak=sample>34?Math.min(16,(d.slowFrameStreak||0)+2):sample>24?Math.min(16,(d.slowFrameStreak||0)+1):Math.max(0,(d.slowFrameStreak||0)-1);
    if(d.frameSampleClock<.5)return;const windowSeconds=d.frameSampleClock;d.frameSampleClock=0;const sorted=[...d.frameSamples].sort((a,b)=>a-b),pick=q=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];d.frameP95=pick(.95);d.frameP99=pick(.99);
    const severe=d.frameP95>31||d.slowFrameStreak>=8||d.simBacklogEvents>(d.lastGovernorBacklogEvents||0),pressure=d.frameP95>19||d.slowFrameStreak>=4||d.frameStress>10;d.lastGovernorBacklogEvents=d.simBacklogEvents||0;
    if(severe){d.governorPressureSeconds=(d.governorPressureSeconds||0)+windowSeconds*2;d.governorStableSeconds=0;}else if(pressure){d.governorPressureSeconds=(d.governorPressureSeconds||0)+windowSeconds;d.governorStableSeconds=0;}else{d.governorPressureSeconds=Math.max(0,(d.governorPressureSeconds||0)-windowSeconds*.5);const stableThreshold=(d.governorTier||0)>=2?26:15.5;if(d.frameP95<stableThreshold)d.governorStableSeconds=(d.governorStableSeconds||0)+windowSeconds;else d.governorStableSeconds=0;}
    if((d.governorTier||0)===0&&d.governorPressureSeconds>=2){d.governorTier=1;d.governorPressureSeconds=0;d.governorStableSeconds=0;}
    if((d.governorTier||0)===1&&(severe||d.governorPressureSeconds>=3.5)){d.governorTier=2;d.governorPressureSeconds=0;d.governorStableSeconds=0;}
    if((d.governorTier||0)===2&&d.governorStableSeconds>=15){d.governorTier=1;d.governorStableSeconds=0;d.frameStress=Math.min(d.frameStress,4);}
    else if((d.governorTier||0)===1&&d.governorStableSeconds>=12){d.governorTier=0;d.governorStableSeconds=0;d.frameStress=Math.min(d.frameStress,2);}
    d.performanceLow=(d.governorTier||0)>=2;
  }
  function defenseRenderTier(d=mini.defense){
    if(!d)return 0;const count=d.enemies?.length||0,speed=d.speed||1,mode=state.settings.defenseFx||"auto",governor=clamp(Math.floor(d.governorTier||0),0,2);
    if(state.settings.reducedMotion||mode==="low")return 2;
    if(mode==="full")return Math.max(governor,count>13||(speed===2&&count>11)?1:0);
    const densityTier=count>=13||(speed===2&&count>=11)?2:count>=9||(speed===2&&count>=8)?1:0;
    return Math.max(governor,densityTier);
  }

  function defenseApplyRenderTier(d,tier=defenseRenderTier(d)){
    if(!d)return 0;
    tier=clamp(Math.floor(tier),0,2);
    const changed=d.renderTier!==tier;if(changed){d.renderTier=tier;d.renderTierChanges=(d.renderTierChanges||0)+1;markDefenseUi();}
    d.lowFx=tier>0;d.potatoFx=tier>1;
    if(changed||d.appliedRenderTier!==tier||d.appliedVisualSpeed!==d.speed){const world=$("#defenseWorld"),visual=defenseVisualBudget(d);if(world){world.classList.toggle("low-fx",tier>0);world.classList.toggle("fx-full",tier===0);world.classList.toggle("fx-lean",tier===1);world.classList.toggle("fx-potato",tier===2);world.classList.toggle("speed-visual-budget",d.speed===2);world.dataset.renderTier=String(tier);world.style.setProperty("--defense-weather-density",String(visual.weatherParticleScale));}d.appliedRenderTier=tier;d.appliedVisualSpeed=d.speed;}
    return tier;
  }
  function defenseFxLowMode(d=mini.defense){return defenseRenderTier(d)>0;}

  function defenseMasteryPips(record={}){const tier=defenseMasteryTier(record);return`<span class="defense-mastery-pips" aria-label="Mastery tier ${tier} of 4">${[1,2,3,4].map(level=>`<i class="${tier>=level?"earned":""}">${level}</i>`).join("")}</span>`;}
  function defenseMedalTier(wave){wave=Math.max(0,Math.floor(Number(wave)||0));return wave>=50?3:wave>=25?2:wave>=10?1:0;}
  function defenseMedalName(tier){return["NO MEDAL","BRONZE GATE","SILVER GATE","GOLD GATE"][clamp(Math.floor(Number(tier)||0),0,3)];}
  function defenseMedalMarkup(mapId,wave=0){const tier=defenseMedalTier(wave),perfect=(state.scores?.defensePerfectMaps||[]).includes(mapId);return`<span class="defense-map-medals" aria-label="${escapeHTML(defenseMedalName(tier))}${perfect?" and Gate Perfect":""}"><i class="${tier>=1?"earned":""}">●</i><i class="${tier>=2?"earned":""}">●</i><i class="${tier>=3?"earned":""}">●</i><b class="${perfect?"earned":""}">✦</b></span>`;}
  function defenseCheckpointAgeCopy(savedAt){const age=Math.max(0,now()-(Number(savedAt)||0)),minutes=Math.floor(age/60000);if(minutes<1)return"JUST NOW";if(minutes<60)return`${minutes}M AGO`;const hours=Math.floor(minutes/60);if(hours<24)return`${hours}H AGO`;return`${Math.floor(hours/24)}D AGO`;}
  function defenseQueueEntry(entry){
    if(typeof entry==="string"&&DEFENSE_ENEMIES[entry])return entry;
    if(!entry||typeof entry!=="object")return null;
    if(entry.type==="boss"&&DEFENSE_BOSSES.some(boss=>boss.id===entry.bossId))return{type:"boss",bossId:entry.bossId,intensity:DefenseCore.clampInteger(entry.intensity,0,99,0)};
    if(DEFENSE_ENEMIES[entry.type])return entry.type;
    return null;
  }
  function normalizeDefensePacket(raw){
    if(!raw||typeof raw!=="object")return null;
    const enemies=(Array.isArray(raw.enemies)?raw.enemies:[]).map(defenseQueueEntry).filter(Boolean).slice(0,12);
    if(!enemies.length)return null;
    return{enemies,spawnGap:DefenseCore.clampNumber(raw.spawnGap,.07,1.2,.34),breakAfter:DefenseCore.clampNumber(raw.breakAfter,0,2.4,1.2)};
  }
  function normalizeDefenseChildSpawn(raw){
    if(!raw||typeof raw!=="object")return null;
    const entry=defenseQueueEntry(raw.entry||raw.type);if(!entry)return null;
    return{entry,progress:DefenseCore.clampNumber(raw.progress,0,.995,0),releaseAt:DefenseCore.clampNumber(raw.releaseAt,0,1e9,0),options:{bossChild:Boolean(raw.options?.bossChild),hpRatio:DefenseCore.clampNumber(raw.options?.hpRatio,.01,1,1),rewardScale:DefenseCore.clampNumber(raw.options?.rewardScale,.05,1,1)}};
  }
  function normalizeDefenseEnemyStats(raw){
    const cleanCounts=value=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([key])=>DEFENSE_ENEMIES[key]||key.startsWith("boss:")).map(([key,count])=>[key,DefenseCore.clampInteger(count,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS,0)])):{};
    const counters=raw?.counters&&typeof raw.counters==="object"?raw.counters:{};
    return{spawned:cleanCounts(raw?.spawned),popped:cleanCounts(raw?.popped),leaked:cleanCounts(raw?.leaked),heartLoss:DefenseCore.clampInteger(raw?.heartLoss,0,9999,0),counters:{armorBreaks:DefenseCore.clampInteger(counters.armorBreaks,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS,0),armorShreds:DefenseCore.clampInteger(counters.armorShreds,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS,0),reveals:DefenseCore.clampInteger(counters.reveals,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS,0),phaseLocks:DefenseCore.clampInteger(counters.phaseLocks,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS,0),bossInterrupts:DefenseCore.clampInteger(counters.bossInterrupts,0,DEFENSE_LIMITS.MAX_REASONABLE_BOSSES,0)}};
  }
  // Canonicalization must recognise every legally placeable id, characters and
  // universal Defense-only tools/structures alike, or a signed checkpoint would
  // silently drop a paid deployment on restore.
  function defenseCheckpointRosterRegistry(){return new Map([...defenseRestorableRegistry()].map(([id,row])=>[id,{source:row.source,rosterIndex:row.rosterIndex,pet:row.pet}]));}
  function defenseCanonicalTowerSnapshots(rows,mapId,{trusted=true,legacyOpeningPerkInference=false}={}){
    const source=Array.isArray(rows)?rows:[],ids=new Set(),copies=new Map(),roster=defenseCheckpointRosterRegistry();let paid=0,openingPerkClaimed=false;
    return source.slice(0,DEFENSE_LIMITS.MAX_DEFENSE_TOWERS).map((tower,index)=>{
      if(!tower||typeof tower!=="object"||typeof tower.petId!=="string"||!tower.petId)return null;
      const petId=tower.petId.slice(0,80),owner=roster.get(petId);if(!owner)return null;
      let id=typeof tower.id==="string"&&tower.id?tower.id.slice(0,80):`tower-${index+1}`;if(ids.has(id))id=`tower-${index+1}`;ids.add(id);
      const sourceType=owner.source,copyIndex=copies.get(petId)||0,structureType=defenseStructureType(owner.pet);
      const cost=structureType?DefenseCore.structureDeploymentCost(structureType,copyIndex):defenseIsUniversalPet(owner.pet)?defenseUniversalDeployCost(copyIndex):DefenseCore.deploymentCost({paidTowerCount:paid,copyCount:copyIndex,activeFirst:sourceType==="active"});
      if(cost>0)paid+=1;copies.set(petId,copyIndex+1);
      const upgrade=trusted?DefenseCore.clampInteger(tower.upgrade,0,DEFENSE_LIMITS.MAX_TOWER_LEVEL,0):0,explicitPerk=Boolean(tower.openingPerkApplied),inferredLegacyPerk=legacyOpeningPerkInference&&!openingPerkClaimed&&upgrade>0,perkEligible=!structureType&&trusted&&!defenseIsUniversalPet(owner.pet)&&!openingPerkClaimed&&upgrade>0&&(explicitPerk||inferredLegacyPerk)&&defenseWorldPerkMatchesTower(mapId,{pet:owner.pet}),openingPerkApplied=Boolean(perkEligible);
      const spent=structureType?DefenseCore.calculateStructureInvestment(structureType,cost,upgrade):defenseIsUniversalPet(owner.pet)?cost+DEFENSE_BASIC_TOWER.upgradeCosts.slice(0,upgrade).reduce((sum,value)=>sum+value,0):DefenseCore.calculateTowerInvestment(cost,upgrade,openingPerkApplied?[DefenseCore.ECONOMY.worldOpeningDiscount,1,1,1]:1);if(openingPerkApplied)openingPerkClaimed=true;
      return{id,petId,source:sourceType,rosterIndex:owner.rosterIndex,copyNumber:copyIndex+1,x:DefenseCore.clampNumber(tower.x,0,1,.5),y:DefenseCore.clampNumber(tower.y,0,1,.5),upgrade,cost,spent,openingPerkApplied,placedAtReal:Number.NEGATIVE_INFINITY,cooldown:trusted?DefenseCore.clampNumber(tower.cooldown,0,60,0):0,kills:trusted?DefenseCore.clampInteger(tower.kills,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS,0):0,damage:trusted?DefenseCore.clampNumber(tower.damage,0,DEFENSE_LIMITS.MAX_REASONABLE_DAMAGE,0):0,abilityReadyAt:trusted?DefenseCore.clampNumber(tower.abilityReadyAt,0,1e9,0):0,overclockUntil:trusted?DefenseCore.clampNumber(tower.overclockUntil,0,1e9,0):0,rangeDebuffUntil:trusted?DefenseCore.clampNumber(tower.rangeDebuffUntil,0,1e9,0):0,targetMode:DEFENSE_TARGET_MODES.includes(tower.targetMode)?tower.targetMode:"first",doctrine:structureType?null:(trusted&&DEFENSE_DOCTRINES[tower.doctrine]?tower.doctrine:null),shots:trusted?DefenseCore.clampInteger(tower.shots,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS*20,0):0,placedAt:trusted?DefenseCore.clampNumber(tower.placedAt,0,1e9,0):0,superForm:structureType?null:(trusted&&["power","control"].includes(tower.superForm)?tower.superForm:null),structureType,targetId:null,retargetAt:0,retargetAtReal:0};
    }).filter(Boolean);
  }

  function defenseHealthScale(wave){const w=Math.max(1,Number(wave)||1);return 1+Math.min(29,w-1)*.115+Math.max(0,w-30)*.038+Math.max(0,w-80)*.012;}
  function defenseDurabilityScale(wave,{boss=false}={}){const w=Math.max(1,Number(wave)||1),late=1+Math.max(0,w-40)*.004;if(!boss)return late;const remix=Math.min(.22,Math.floor(Math.max(0,w-10)/40)*.07);return late*(w<=10?.88:1.28+remix);}
  function defenseCanonicalEnemySnapshot(raw,currentWave,map,index=0,preciseArmor=false,currentClock=0){
    if(!raw||typeof raw!=="object")return null;
    const boss=DEFENSE_BOSSES.find(item=>item.id===raw.bossId)||null,type=boss?"boss":DEFENSE_ENEMIES[raw.type]?raw.type:null;if(!type)return null;
    const base=boss||DEFENSE_ENEMIES[type],intensity=DefenseCore.clampInteger(raw.bossIntensity,0,99,0),bossChild=Boolean(raw.bossChild),scale=defenseHealthScale(currentWave)*(map.hp||1)*(boss?1+Math.min(12,intensity)*.10:1)*defenseDurabilityScale(currentWave,{boss:Boolean(boss)}),canonicalMax=Math.max(.01,base.hp*scale*(bossChild?.5:1)),legacyRatio=Number(raw.maxHp)>0?Number(raw.hp)/Number(raw.maxHp):1,hpRatio=DefenseCore.clampNumber(raw.hpRatio,0.001,1,DefenseCore.clampNumber(legacyRatio,.001,1,1)),maxHp=canonicalMax,hp=Math.max(.01,maxHp*hpRatio),baseArmor=DefenseCore.clampNumber(base.armor||0,0,.95,0),armorBroken=Boolean(raw.armorBroken),armorShredded=Boolean(raw.armorShredded),armor=preciseArmor?DefenseCore.clampNumber(raw.armor,0,baseArmor,baseArmor):armorBroken?Math.min(baseArmor,.06):armorShredded?Math.max(0,baseArmor-.08):baseArmor;
    return{id:typeof raw.id==="string"&&raw.id?raw.id.slice(0,80):`enemy-${index+1}`,type,bossId:boss?.id||null,bossIntensity:intensity,bossChild,progress:DefenseCore.clampNumber(raw.progress,0,.999,0),hp,maxHp,speed:base.speed*(1+Math.min(.22,currentWave*.006))*(map.speed||1),reward:DefenseCore.calculateEnemyReward(base.reward,currentWave,{rewardScale:bossChild?.5:1}),damage:base.damage,baseArmor,armor,armorBroken,armorShredded,fireproof:Boolean(base.fireproof),slowResist:base.slowResist||0,stormPulse:Boolean(base.stormPulse),supportAura:Boolean(base.supportAura),healer:Boolean(base.healer),supportCycle:Number.isFinite(Number(raw.supportCycle))?DefenseCore.clampInteger(raw.supportCycle,0,1_000_000_000,0):Math.floor((DefenseCore.clampNumber(currentClock,0,1e9,0)+DefenseCore.clampNumber(raw.phaseOffset,-100,100,0))/3.6),phasing:Boolean(base.phasing),camo:Boolean(base.camo),phaseOffset:DefenseCore.clampNumber(raw.phaseOffset,-100,100,0),phaseActive:false,revealUntil:DefenseCore.clampNumber(raw.revealUntil,0,1e9,0),phaseSuppressedUntil:DefenseCore.clampNumber(raw.phaseSuppressedUntil,0,1e9,0),revealCredited:Boolean(raw.revealCredited),phaseLockCredited:Boolean(raw.phaseLockCredited),slow:DefenseCore.clampNumber(raw.slow,0,.95,0),slowUntil:DefenseCore.clampNumber(raw.slowUntil,0,1e9,0),burn:DefenseCore.clampNumber(raw.burn,0,1e6,0),burnUntil:DefenseCore.clampNumber(raw.burnUntil,0,1e9,0),burnSourceId:typeof raw.burnSourceId==="string"?raw.burnSourceId.slice(0,80):null,poison:DefenseCore.clampNumber(raw.poison,0,1e6,0),poisonUntil:DefenseCore.clampNumber(raw.poisonUntil,0,1e9,0),poisonSourceId:typeof raw.poisonSourceId==="string"?raw.poisonSourceId.slice(0,80):null,rootUntil:DefenseCore.clampNumber(raw.rootUntil,0,1e9,0),phaseTriggered:Boolean(raw.phaseTriggered),bossPhase:DefenseCore.clampInteger(raw.bossPhase,0,12,0),signalStaggerUntil:DefenseCore.clampNumber(raw.signalStaggerUntil,0,1e9,0),nextBossPulse:DefenseCore.clampNumber(raw.nextBossPulse,0,1e9,0),telegraphKind:DEFENSE_BOSS_TELEGRAPHS[raw.telegraphKind]?raw.telegraphKind:null,telegraphStartedAt:DefenseCore.clampNumber(raw.telegraphStartedAt,0,1e9,0),telegraphUntil:DefenseCore.clampNumber(raw.telegraphUntil,0,1e9,0),telegraphDisruption:DefenseCore.clampNumber(raw.telegraphDisruption,0,1,0),apexSurgeUntil:DefenseCore.clampNumber(raw.apexSurgeUntil,0,1e9,0),bossMechanicLocked:Boolean(raw.bossMechanicLocked)};
  }
  function normalizeDefenseCheckpoint(raw){
    if(!raw||typeof raw!=="object")return null;
    const version=Number(raw.checkpointVersion)||1;if(![1,2,3,4,5,6,7,8,9,DEFENSE_CHECKPOINT_VERSION].includes(version))return null;
    const savedAt=DefenseCore.clampNumber(raw.savedAt,0,Number.MAX_SAFE_INTEGER,0);if(!savedAt||now()-savedAt>DEFENSE_CHECKPOINT_MAX_AGE)return null;
    if(typeof raw.keeperId!=="string"||raw.keeperId!==state.player?.keeperId)return null;
    const mapId=typeof raw.mapId==="string"&&DEFENSE_MAPS[raw.mapId]?raw.mapId:null;if(!mapId)return null;const map=DEFENSE_MAPS[mapId];
    const signatureValid=version>=2&&DefenseCore.verifySaveSignature(raw),legacyUnsigned=version===1,trusted=signatureValid||legacyUnsigned;
    const oldWave=DefenseCore.clampInteger(raw.wave,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0),rawPhase=DefenseCore.normalizePhase(raw.phase,DEFENSE_PHASES.PLANNING),legacyActive=legacyUnsigned&&raw.phase==="wave";
    let currentWave=DefenseCore.clampInteger(raw.currentWave??oldWave,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0),clearedWave=Math.min(currentWave,DefenseCore.clampInteger(raw.clearedWave??(legacyActive?Math.max(0,oldWave-1):oldWave),0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0));
    if(!trusted){const verifiedMapBest=DefenseCore.clampInteger(state.scores?.defenseMaps?.[mapId],0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0);clearedWave=Math.min(clearedWave,verifiedMapBest);currentWave=clearedWave;defenseRecordValidationWarning("checkpoint-signature",{mapId,requestedCurrentWave:raw.currentWave??raw.wave,requestedClearedWave:raw.clearedWave,restoredClearedWave:clearedWave});}
    if(trusted&&currentWave>clearedWave+1){defenseRecordValidationWarning("checkpoint-wave-gap",{mapId,requestedCurrentWave:currentWave,clearedWave});currentWave=Math.min(DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,clearedWave+1);}
    const towers=defenseCanonicalTowerSnapshots(raw.towers,mapId,{trusted,legacyOpeningPerkInference:trusted&&version===4});if(!towers.length)return null;
    const enemyIds=new Set(),enemies=trusted?(Array.isArray(raw.enemies)?raw.enemies:[]).slice(0,DEFENSE_LIMITS.MAX_CHECKPOINT_ENEMIES).map((enemy,index)=>{const snapshot=defenseCanonicalEnemySnapshot(enemy,currentWave,map,index,version>=8,raw.clock);if(!snapshot)return null;let id=snapshot.id;if(enemyIds.has(id)){let suffix=0;do{id=`enemy-${index+1}${suffix?`-${suffix}`:""}`;suffix+=1;}while(enemyIds.has(id));snapshot.id=id;}enemyIds.add(id);return snapshot;}).filter(Boolean):[];
    let spawnQueue=trusted?(Array.isArray(raw.spawnQueue)?raw.spawnQueue:[]).map(defenseQueueEntry).filter(Boolean).slice(0,DEFENSE_LIMITS.MAX_QUEUE_ENTRIES):[],wavePackets=trusted?(Array.isArray(raw.wavePackets)?raw.wavePackets:[]).map(normalizeDefensePacket).filter(Boolean).slice(0,12):[];
    let packetIndex=trusted?DefenseCore.clampInteger(raw.packetIndex,0,wavePackets.length,0):0,packetEnemyIndex=trusted&&packetIndex<wavePackets.length?DefenseCore.clampInteger(raw.packetEnemyIndex,0,wavePackets[packetIndex].enemies.length,0):0;
    if(trusted&&wavePackets.length){const packetRemaining=[];for(let i=packetIndex;i<wavePackets.length;i++){const start=i===packetIndex?packetEnemyIndex:0;for(let j=start;j<wavePackets[i].enemies.length;j++)packetRemaining.push(wavePackets[i].enemies[j]);}const sameQueue=packetRemaining.length===spawnQueue.length&&packetRemaining.every((entry,index)=>JSON.stringify(entry)===JSON.stringify(spawnQueue[index]));if(!sameQueue){const conservative=spawnQueue.length>=packetRemaining.length?spawnQueue:packetRemaining;spawnQueue=conservative.slice(0,DEFENSE_LIMITS.MAX_QUEUE_ENTRIES).map(entry=>typeof entry==="string"?entry:{...entry});wavePackets=spawnQueue.length?[{enemies:[...spawnQueue],spawnGap:.34,breakAfter:0}]:[];packetIndex=0;packetEnemyIndex=0;defenseRecordValidationWarning("checkpoint-scheduler",{mapId,spawnQueue:spawnQueue.length,packetRemaining:packetRemaining.length});}}else if(trusted&&spawnQueue.length&&!wavePackets.length){wavePackets=[{enemies:[...spawnQueue],spawnGap:.34,breakAfter:0}];packetIndex=0;packetEnemyIndex=0;}
    const currentWavePlan=trusted?(Array.isArray(raw.currentWavePlan)?raw.currentWavePlan:spawnQueue).map(defenseQueueEntry).filter(Boolean).slice(0,DEFENSE_LIMITS.MAX_QUEUE_ENTRIES):[],childSpawnQueue=trusted?(Array.isArray(raw.childSpawnQueue)?raw.childSpawnQueue:[]).map(normalizeDefenseChildSpawn).filter(Boolean).slice(0,DEFENSE_LIMITS.MAX_CHILD_BUFFER):[],announcement=trusted&&raw.waveAnnouncement&&typeof raw.waveAnnouncement==="object"?{title:String(raw.waveAnnouncement.title||"").slice(0,100),copy:String(raw.waveAnnouncement.copy||"").slice(0,240)}:null;
    const maxWaveEntities=DEFENSE_LIMITS.MAX_QUEUE_ENTRIES+DEFENSE_LIMITS.MAX_CHILD_BUFFER,outstandingWaveEntities=Math.min(maxWaveEntities,spawnQueue.length+childSpawnQueue.length+enemies.length),rawWaveTotal=trusted?DefenseCore.clampInteger(raw.waveTotal,0,maxWaveEntities,0):0,rawWaveResolved=trusted?DefenseCore.clampInteger(raw.waveResolved,0,maxWaveEntities,0):0;let waveResolved=Math.min(rawWaveResolved,rawWaveTotal,Math.max(0,maxWaveEntities-outstandingWaveEntities)),waveTotal=Math.max(rawWaveTotal,waveResolved+outstandingWaveEntities);
    let phase=trusted?(DefenseCore.isCombatPhase(rawPhase)?DEFENSE_PHASES.PAUSED:rawPhase===DEFENSE_PHASES.WAVE_COMPLETE?DEFENSE_PHASES.WAVE_COMPLETE:DEFENSE_PHASES.PLANNING):(clearedWave>0?DEFENSE_PHASES.WAVE_COMPLETE:DEFENSE_PHASES.PLANNING),resumePhase=trusted&&DefenseCore.isCombatPhase(rawPhase)?(rawPhase===DEFENSE_PHASES.PAUSED?[DEFENSE_PHASES.COUNTDOWN,DEFENSE_PHASES.COMBAT,DEFENSE_PHASES.PACKET_BREAK].includes(raw.resumePhase)?raw.resumePhase:DEFENSE_PHASES.COMBAT:rawPhase):DEFENSE_PHASES.COMBAT;
    const unfinishedAccounting=outstandingWaveEntities>0||waveResolved<waveTotal;
    if(trusted&&currentWave>clearedWave&&!unfinishedAccounting){defenseRecordValidationWarning("checkpoint-empty-unfinished",{mapId,currentWave,clearedWave});currentWave=clearedWave;phase=clearedWave>0?DEFENSE_PHASES.WAVE_COMPLETE:DEFENSE_PHASES.PLANNING;}
    else if(trusted&&currentWave>clearedWave&&!DefenseCore.isCombatPhase(rawPhase)){phase=DEFENSE_PHASES.PAUSED;resumePhase=enemies.length||packetIndex||packetEnemyIndex?DEFENSE_PHASES.COMBAT:DEFENSE_PHASES.COUNTDOWN;defenseRecordValidationWarning("checkpoint-phase",{mapId,requestedPhase:rawPhase,currentWave,clearedWave,repairedPhase:phase});}
    else if(trusted&&currentWave<=clearedWave&&DefenseCore.isCombatPhase(rawPhase)){spawnQueue=[];wavePackets=[];packetIndex=0;packetEnemyIndex=0;childSpawnQueue.length=0;currentWavePlan.length=0;enemies.length=0;waveTotal=0;waveResolved=0;phase=clearedWave>0?DEFENSE_PHASES.WAVE_COMPLETE:DEFENSE_PHASES.PLANNING;resumePhase=DEFENSE_PHASES.COMBAT;defenseRecordValidationWarning("checkpoint-stale-combat",{mapId,currentWave,clearedWave,requestedPhase:rawPhase});}
    const status=signatureValid?(version===DEFENSE_CHECKPOINT_VERSION?"verified":"migrated"):legacyUnsigned?"migrated":"sanitized";
    return{checkpointVersion:DEFENSE_CHECKPOINT_VERSION,savedAt,keeperId:raw.keeperId,mapId,contract:trusted?normalizeDefenseRunContract(raw.contract):null,currentWave,clearedWave,lives:DefenseCore.clampInteger(raw.lives,1,map.lives,map.lives),cash:trusted?DefenseCore.clampNumber(raw.cash,0,DEFENSE_LIMITS.MAX_RUN_CASH,BASE_DEFENSE_STARTING_CASH):Math.min(BASE_DEFENSE_STARTING_CASH,DefenseCore.clampNumber(raw.cash,0,BASE_DEFENSE_STARTING_CASH,BASE_DEFENSE_STARTING_CASH)),phase,resumePhase,speed:trusted&&[.5,1,2].includes(Number(raw.speed))?Number(raw.speed):1,clock:trusted?DefenseCore.clampNumber(raw.clock,0,1e9,0):0,towers,enemies,projectiles:trusted&&version>=8?(Array.isArray(raw.projectiles)?raw.projectiles:[]).slice(0,DEFENSE_LIMITS.MAX_CHECKPOINT_PROJECTILES).filter(shot=>towers.some(t=>t.id===shot.towerId)&&enemies.some(e=>e.id===shot.targetId)).map(shot=>({towerId:shot.towerId,targetId:shot.targetId,x:DefenseCore.clampNumber(shot.x,0,1,.5),y:DefenseCore.clampNumber(shot.y,0,1,.5),life:DefenseCore.clampNumber(shot.life,0,.7,0),damage:DefenseCore.clampNumber(shot.damage,0,1e7,0),speed:DefenseCore.clampNumber(shot.speed,.1,4,1.8),doctrineStrike:["power","control"].includes(shot.doctrineStrike)?shot.doctrineStrike:null,doubleStitch:Boolean(shot.doubleStitch)})):[],spawnQueue,wavePackets,packetIndex,packetEnemyIndex,nextSpawnAt:trusted?DefenseCore.clampNumber(raw.nextSpawnAt,0,1e9,0):0,packetBreakUntil:trusted?DefenseCore.clampNumber(raw.packetBreakUntil,0,1e9,0):0,childSpawnQueue,nextId:trusted?DefenseCore.clampInteger(raw.nextId,1,Number.MAX_SAFE_INTEGER,1):towers.length+1,kills:trusted?DefenseCore.clampInteger(raw.kills,0,DEFENSE_LIMITS.MAX_REASONABLE_KILLS,0):0,totalDamage:trusted?DefenseCore.clampNumber(raw.totalDamage,0,DEFENSE_LIMITS.MAX_REASONABLE_DAMAGE,0):0,usedPetIds:[...new Set(towers.map(tower=>tower.petId))],lastWaveBonus:trusted?DefenseCore.clampInteger(raw.lastWaveBonus,0,DEFENSE_LIMITS.MAX_RUN_CASH,0):0,rallyUntil:trusted?DefenseCore.clampNumber(raw.rallyUntil,0,1e9,0):0,prismUntil:trusted?DefenseCore.clampNumber(raw.prismUntil,0,1e9,0):0,whiteoutUntil:trusted?DefenseCore.clampNumber(raw.whiteoutUntil,0,1e9,0):0,stormWeatherUntil:trusted?DefenseCore.clampNumber(raw.stormWeatherUntil,0,1e9,0):0,eclipseUntil:trusted?DefenseCore.clampNumber(raw.eclipseUntil,0,1e9,0):0,ashUntil:trusted?DefenseCore.clampNumber(raw.ashUntil,0,1e9,0):0,moonRevealUntil:trusted?DefenseCore.clampNumber(raw.moonRevealUntil,0,1e9,0):0,nextWeatherAt:trusted?DefenseCore.clampNumber(raw.nextWeatherAt,0,1e9,7):7,camoHintSeen:trusted&&Boolean(raw.camoHintSeen),waveAnnouncement:announcement,currentWavePlan,bossesBeaten:trusted&&Array.isArray(raw.bossesBeaten)?raw.bossesBeaten.filter(id=>DEFENSE_BOSSES.some(boss=>boss.id===id)).slice(0,DEFENSE_LIMITS.MAX_REASONABLE_BOSSES):[],bossesDefeated:trusted?DefenseCore.clampInteger(raw.bossesDefeated??raw.bossesBeaten?.length,0,DEFENSE_LIMITS.MAX_REASONABLE_BOSSES,0):0,perfectWaveCount:trusted?Math.min(clearedWave,DefenseCore.clampInteger(raw.perfectWaveCount,0,DEFENSE_LIMITS.MAX_REASONABLE_PERFECT_WAVES,0)):0,waveHeartLossStart:trusted?DefenseCore.clampInteger(raw.waveHeartLossStart,0,9999,0):0,waveTotal,waveResolved,enemyStats:trusted?normalizeDefenseEnemyStats(raw.enemyStats):normalizeDefenseEnemyStats(null),worldPerkUsed:towers.some(tower=>tower.openingPerkApplied),gateFlameArmed:false,gateFlameReadyAt:trusted?DefenseCore.clampNumber(raw.gateFlameReadyAt,0,1e9,0):0,gateFlameUntil:trusted?DefenseCore.clampNumber(raw.gateFlameUntil,0,1e9,0):0,gateFlameProgress:trusted?DefenseCore.clampNumber(raw.gateFlameProgress,0,1,.86):.86,gateFlameNextTick:trusted?DefenseCore.clampNumber(raw.gateFlameNextTick,0,1e9,0):0,gateFlameTicks:trusted?DefenseCore.clampInteger(raw.gateFlameTicks,0,1000,0):0,reason:typeof raw.reason==="string"?raw.reason.slice(0,40):"auto",validationStatus:status};
  }
  function readDefenseCheckpoint(){
    try{
      let sourceKey=DEFENSE_CHECKPOINT_KEY,rawText=localStorage.getItem(sourceKey);
      if(!rawText){for(const key of DEFENSE_LEGACY_CHECKPOINT_KEYS){rawText=localStorage.getItem(key);if(rawText){sourceKey=key;break;}}}
      if(!rawText)return null;
      const checkpoint=normalizeDefenseCheckpoint(JSON.parse(rawText));
      if(!checkpoint){localStorage.removeItem(sourceKey);return null;}
      checkpoint.sourceKey=sourceKey;return checkpoint;
    }catch(error){defenseRecordValidationWarning("checkpoint-parse",{message:String(error?.message||error)});return null;}
  }
  function buildDefenseCheckpoint(d,reason="auto"){
    flushDefenseIncome(d,"checkpoint");
    const savedAt=now(),checkpoint={checkpointVersion:DEFENSE_CHECKPOINT_VERSION,savedAt,keeperId:state.player.keeperId,mapId:d.mapId,contract:d.contract?{...d.contract}:null,currentWave:d.currentWave,clearedWave:d.clearedWave,lives:d.lives,cash:d.cash,phase:d.phase,resumePhase:d.resumePhase||DEFENSE_PHASES.COMBAT,speed:d.speed,clock:d.clock,towers:d.towers.map(tower=>({id:tower.id,petId:tower.petId,source:tower.source,rosterIndex:tower.rosterIndex,copyNumber:tower.copyNumber,x:tower.x,y:tower.y,upgrade:tower.upgrade,cooldown:tower.cooldown,kills:tower.kills,damage:tower.damage,abilityReadyAt:tower.abilityReadyAt,overclockUntil:tower.overclockUntil,rangeDebuffUntil:tower.rangeDebuffUntil,targetMode:tower.targetMode,doctrine:tower.doctrine,shots:tower.shots,placedAt:tower.placedAt||0,openingPerkApplied:Boolean(tower.openingPerkApplied),superForm:tower.superForm||null})),enemies:d.enemies.filter(enemy=>!enemy.dead).slice(0,DEFENSE_LIMITS.MAX_CHECKPOINT_ENEMIES).map(enemy=>({id:enemy.id,type:enemy.type,bossId:enemy.bossId,bossIntensity:enemy.bossIntensity,bossChild:enemy.bossChild,progress:enemy.progress,hpRatio:enemy.hp/Math.max(.01,enemy.maxHp),armor:enemy.armor,armorBroken:enemy.armorBroken,armorShredded:enemy.armorShredded,phaseOffset:enemy.phaseOffset,supportCycle:enemy.supportCycle,revealUntil:enemy.revealUntil,phaseSuppressedUntil:enemy.phaseSuppressedUntil,revealCredited:enemy.revealCredited,phaseLockCredited:enemy.phaseLockCredited,slow:enemy.slow,slowUntil:enemy.slowUntil,burn:enemy.burn,burnUntil:enemy.burnUntil,burnSourceId:enemy.burnSource?.id||null,poison:enemy.poison,poisonUntil:enemy.poisonUntil,poisonSourceId:enemy.poisonSource?.id||null,rootUntil:enemy.rootUntil,phaseTriggered:enemy.phaseTriggered,bossPhase:enemy.bossPhase||0,signalStaggerUntil:enemy.signalStaggerUntil||0,nextBossPulse:enemy.nextBossPulse,telegraphKind:enemy.telegraphKind||null,telegraphStartedAt:enemy.telegraphStartedAt||0,telegraphUntil:enemy.telegraphUntil||0,telegraphDisruption:enemy.telegraphDisruption||0,apexSurgeUntil:enemy.apexSurgeUntil||0,bossMechanicLocked:Boolean(enemy.bossMechanicLocked)})),projectiles:d.projectiles.filter(shot=>shot.target&&!shot.target.dead&&shot.target.hp>0).slice(0,DEFENSE_LIMITS.MAX_CHECKPOINT_PROJECTILES).map(shot=>({towerId:shot.tower.id,targetId:shot.target.id,x:shot.x,y:shot.y,life:shot.life,speed:shot.speed,damage:shot.damage,doctrineStrike:shot.doctrineStrike||null,doubleStitch:Boolean(shot.doubleStitch)})),spawnQueue:d.spawnQueue.map(entry=>typeof entry==="string"?entry:{...entry}),wavePackets:(d.wavePackets||[]).map(packet=>({enemies:packet.enemies.map(entry=>typeof entry==="string"?entry:{...entry}),spawnGap:packet.spawnGap,breakAfter:packet.breakAfter})),packetIndex:d.packetIndex||0,packetEnemyIndex:d.packetEnemyIndex||0,nextSpawnAt:d.nextSpawnAt||0,packetBreakUntil:d.packetBreakUntil||0,childSpawnQueue:(d.childSpawnQueue||[]).map(item=>({entry:typeof item.entry==="string"?item.entry:{...item.entry},progress:item.progress,releaseAt:item.releaseAt,options:{bossChild:Boolean(item.options?.bossChild),hpRatio:item.options?.hpRatio??1,rewardScale:item.options?.rewardScale??1}})),nextId:d.nextId,kills:d.kills,totalDamage:d.totalDamage,usedPetIds:[...(d.usedPetIds||[])],lastWaveBonus:d.lastWaveBonus,rallyUntil:d.rallyUntil,prismUntil:d.prismUntil,whiteoutUntil:d.whiteoutUntil,stormWeatherUntil:d.stormWeatherUntil,eclipseUntil:d.eclipseUntil,ashUntil:d.ashUntil,moonRevealUntil:d.moonRevealUntil,nextWeatherAt:d.nextWeatherAt,camoHintSeen:d.camoHintSeen,waveAnnouncement:d.waveAnnouncement?{...d.waveAnnouncement}:null,currentWavePlan:d.currentWavePlan.map(entry=>typeof entry==="string"?entry:{...entry}),bossesBeaten:[...(d.bossesBeaten||[])],bossesDefeated:d.bossesDefeated||0,perfectWaveCount:d.perfectWaveCount||0,waveHeartLossStart:d.waveHeartLossStart||0,waveTotal:d.waveTotal,waveResolved:d.waveResolved,enemyStats:JSON.parse(JSON.stringify(d.enemyStats||{})),worldPerkUsed:Boolean(d.worldPerkUsed),gateFlameReadyAt:d.gateFlameReadyAt||0,gateFlameUntil:d.gateFlameUntil||0,gateFlameProgress:d.gateFlameProgress||.86,gateFlameNextTick:d.gateFlameNextTick||0,gateFlameTicks:d.gateFlameTicks||0,reason};
    checkpoint.signature=DefenseCore.createSaveSignature(checkpoint);return checkpoint;
  }
  function clearDefenseCheckpoint(){try{localStorage.removeItem(DEFENSE_CHECKPOINT_KEY);for(const key of DEFENSE_LEGACY_CHECKPOINT_KEYS)localStorage.removeItem(key);}catch(error){} }
  function writeDefenseCheckpoint(force=false,reason="auto"){
    const d=mini.active&&mini.mode==="defense"?mini.defense:null;if(!d||!d.towers.length){clearDefenseCheckpoint();return false;}
    if(!force&&now()-(d.lastCheckpointAt||0)<1000){d.checkpointDirty=true;return false;}
    try{const checkpoint=buildDefenseCheckpoint(d,reason);localStorage.setItem(DEFENSE_CHECKPOINT_KEY,JSON.stringify(checkpoint));for(const key of DEFENSE_LEGACY_CHECKPOINT_KEYS)localStorage.removeItem(key);d.lastCheckpointAt=checkpoint.savedAt;d.checkpointDirty=false;d.checkpointWrites=(d.checkpointWrites||0)+1;return true;}catch(error){defenseRecordValidationWarning("checkpoint-write",{message:String(error?.message||error)});return false;}
  }
  function maybeWriteDefenseCheckpoint(dt){const d=mini.defense;if(!d)return;d.checkpointClock=(d.checkpointClock||0)+Math.max(0,dt);if(d.checkpointClock>=1){d.checkpointClock=0;if(d.checkpointDirty)writeDefenseCheckpoint(false,"combat");}}
  function renderRestoredDefenseProjectile(){return false;}
  function restoreDefenseCheckpoint(raw){
    const checkpoint=normalizeDefenseCheckpoint(raw);if(!checkpoint)return false;initializeDefenseRun(checkpoint.mapId,checkpoint.contract,{allowLockedMap:checkpoint.validationStatus!=="sanitized"});const d=mini.defense,placedIds=[...new Set([state.pet?.id,...checkpoint.towers.map(tower=>tower.petId)].filter(Boolean))].filter(id=>!DEFENSE_UNIVERSAL_PET_IDS.has(id)),fillIds=defenseConfiguredWingIds().filter(id=>!placedIds.includes(id)).slice(0,Math.max(0,1+DEFENSE_ROSTER_WING_SLOTS-placedIds.length)),runRosterIds=[...placedIds,...fillIds];d.runRosterIds=runRosterIds;const roster=defenseRestorableRegistry();
    Object.assign(d,{runRosterIds,currentWave:checkpoint.currentWave,clearedWave:checkpoint.clearedWave,lives:checkpoint.lives,cash:checkpoint.cash,phase:checkpoint.phase,resumePhase:checkpoint.resumePhase,speed:checkpoint.speed,clock:checkpoint.clock,spawnQueue:checkpoint.spawnQueue.map(entry=>typeof entry==="string"?entry:{...entry}),wavePackets:checkpoint.wavePackets.map(packet=>({enemies:packet.enemies.map(entry=>typeof entry==="string"?entry:{...entry}),spawnGap:packet.spawnGap,breakAfter:packet.breakAfter})),packetIndex:checkpoint.packetIndex,packetEnemyIndex:checkpoint.packetEnemyIndex,nextSpawnAt:checkpoint.nextSpawnAt,packetBreakUntil:checkpoint.packetBreakUntil,childSpawnQueue:checkpoint.childSpawnQueue.map(item=>({...item,options:{...item.options}})),nextId:checkpoint.nextId,kills:checkpoint.kills,totalDamage:checkpoint.totalDamage,usedPetIds:new Set(checkpoint.usedPetIds),lastWaveBonus:checkpoint.lastWaveBonus,rallyUntil:checkpoint.rallyUntil,prismUntil:checkpoint.prismUntil,whiteoutUntil:checkpoint.whiteoutUntil,stormWeatherUntil:checkpoint.stormWeatherUntil,eclipseUntil:checkpoint.eclipseUntil,ashUntil:checkpoint.ashUntil,moonRevealUntil:checkpoint.moonRevealUntil,nextWeatherAt:checkpoint.nextWeatherAt,camoHintSeen:checkpoint.camoHintSeen,waveAnnouncement:checkpoint.waveAnnouncement,currentWavePlan:checkpoint.currentWavePlan.map(entry=>typeof entry==="string"?entry:{...entry}),bossesBeaten:[...checkpoint.bossesBeaten],bossesDefeated:checkpoint.bossesDefeated,perfectWaveCount:checkpoint.perfectWaveCount,waveHeartLossStart:checkpoint.waveHeartLossStart,waveTotal:checkpoint.waveTotal,waveResolved:checkpoint.waveResolved,enemyStats:normalizeDefenseEnemyStats(checkpoint.enemyStats),worldPerkUsed:checkpoint.worldPerkUsed,gateFlameArmed:false,gateFlameReadyAt:checkpoint.gateFlameReadyAt,gateFlameUntil:checkpoint.gateFlameUntil,gateFlameProgress:checkpoint.gateFlameProgress,gateFlameNextTick:checkpoint.gateFlameNextTick,gateFlameTicks:checkpoint.gateFlameTicks,checkpointDirty:false,checkpointClock:0,pendingIncome:0,pendingIncomeEvents:0,pendingIncomeSources:{},realClock:0,nextIncomeFlushAtReal:0,nextChildReleaseAtReal:0,childSpawnSequence:0,targetSnapshot:[],targetSnapshotAtReal:0,targetSnapshotBuilds:0,childSpawnsReleased:0,lastIncomeBatch:null,flowDecisionBeat:0,flowPulseUntilReal:0,flowEaseUntilReal:0,flowChoiceKey:"",flowLastAction:"",flowActionQuietUntilReal:0,flowAutoHeldWave:-1});
    d.towers=checkpoint.towers.map(snapshot=>{const row=roster.get(snapshot.petId);if(!row)return null;const structureType=defenseStructureType(row);return{...snapshot,pet:row.pet,source:row.source,rosterIndex:row.rosterIndex,structureType,node:null,targetId:null,retargetAt:0,retargetAtReal:0,nextProductionAt:0,totalProduced:0,factoryCleanCycles:0,factoryLivesSnapshot:d.lives,factoryLastInterval:0};}).filter(Boolean);if(!d.towers.length){clearDefenseCheckpoint();return false;}for(const tower of d.towers)if(defenseStructureType(tower)==="factory"){const econ=defenseFactoryEconomy(tower,d);tower.nextProductionAt=d.clock+econ.interval;tower.factoryLastInterval=econ.interval;}d.usedPetIds=new Set([...d.usedPetIds,...d.towers.map(tower=>tower.petId)]);d.enemies=[];d.projectiles=[];mini.entities=[];renderDefenseWorld();const towerMap=new Map();for(const tower of d.towers){renderDefenseTower(tower);towerMap.set(tower.id,tower);}const enemyMap=new Map();for(const snapshot of checkpoint.enemies){const descriptor=snapshot.bossId?{type:"boss",bossId:snapshot.bossId,intensity:snapshot.bossIntensity}:snapshot.type,enemy=spawnDefenseEnemy(descriptor,{progress:snapshot.progress,hpOverride:snapshot.hp,maxHpOverride:snapshot.maxHp,bossChild:snapshot.bossChild,skipAnalytics:true,rewardScale:snapshot.bossChild?.5:1});const node=enemy.node;Object.assign(enemy,snapshot,{node,burnSource:null,poisonSource:null});if(node){node.dataset.enemyId=enemy.id;const data=snapshot.bossId?DEFENSE_BOSSES.find(item=>item.id===snapshot.bossId):DEFENSE_ENEMIES[snapshot.type];node.className=`defense-enemy ${snapshot.bossId?`balloon-boss ${data?.className||"boss-crown"}`:data?.className||"balloon-puff"}`;node.style.setProperty("--balloon-color",data?.color||"#ff5b68");const trait=node.querySelector(".balloon-trait");if(trait)trait.textContent=data?.icon||"○";}enemyMap.set(enemy.id,enemy);}for(const snapshot of checkpoint.enemies){const enemy=enemyMap.get(snapshot.id);if(!enemy)continue;enemy.burnSource=towerMap.get(snapshot.burnSourceId)||null;enemy.poisonSource=towerMap.get(snapshot.poisonSourceId)||null;updateDefenseEnemyNode(enemy,true);}for(const saved of checkpoint.projectiles){const tower=towerMap.get(saved.towerId),target=enemyMap.get(saved.targetId);if(!tower||!target)continue;const stats=defenseCombatStats(tower);d.projectiles.push({...saved,id:`shot-${d.nextId++}`,tower,target,prevX:saved.x,prevY:saved.y,kind:stats.projectile,masteryTier:defenseMasteryTierForPet(tower.petId),node:null,renderVisible:defenseUsesCanvas(d),renderColor:(VARIANTS.find(v=>v.id===stats.variant)||VARIANTS[0]).color});}
    const newestEnemy=d.enemies.filter(enemy=>!enemy.dead).sort((a,b)=>a.progress-b.progress)[0]||null;d.lastSpawnedEnemyId=newestEnemy?.id||null;d.spawnWaitReason=newestEnemy?"restored-distance":"restored-timer";d.peakAlive=Math.max(d.peakAlive||0,d.enemies.length);d.waveTotal=Math.max(d.waveTotal,d.waveResolved+d.spawnQueue.length+d.childSpawnQueue.length+d.enemies.length);d.nextId=Math.max(d.nextId,checkpoint.nextId);mini.score=d.clearedWave;mini.hits=d.kills;updateDefenseRoster();markDefenseUi();flushDefenseUi(true);const unfinished=d.currentWave>d.clearedWave;setDefenseMessage(unfinished?`RUN RESTORED • WAVE ${d.currentWave} PAUSED`:`RUN RESTORED • ${d.clearedWave} CLEARED`,unfinished?`Permanent progress remains at Wave ${d.clearedWave}. Tap ▶ when ready.`:"Your field and match coins are waiting. Start the next wave when ready.");writeDefenseCheckpoint(true,checkpoint.validationStatus==="migrated"?"migrated":"restored");return true;
  }
  function defenseCheckpointLobbyMarkup(checkpoint){if(!checkpoint)return"";const map=DEFENSE_MAPS[checkpoint.mapId]||DEFENSE_MAPS.grove,threats=checkpoint.spawnQueue.length+checkpoint.childSpawnQueue.length+checkpoint.enemies.length,unfinished=checkpoint.currentWave>checkpoint.clearedWave,phase=unfinished?`${threats} THREATS PAUSED • CLEARED ${checkpoint.clearedWave}`:checkpoint.clearedWave?`PLANNING WAVE ${checkpoint.clearedWave+1}`:"SETUP",contract=normalizeDefenseRunContract(checkpoint.contract);return`<section class="defense-resume-card ${contract?"contract-run":""}"><div><small>${contract?"TRAIL CONTRACT CHECKPOINT":"RUN CHECKPOINT"} • ${escapeHTML(defenseCheckpointAgeCopy(checkpoint.savedAt))}</small><h3>${map.icon} ${escapeHTML(map.name)} • ${unfinished?`REACHED ${checkpoint.currentWave}`:`CLEARED ${checkpoint.clearedWave}`}</h3><p>${escapeHTML(phase)} • ♥ ${checkpoint.lives} • ${checkpoint.towers.length} RIZOS • ${Math.floor(checkpoint.cash)} COINS${contract?` • ${escapeHTML(contract.title)}`:""}</p></div><span><button type="button" data-discard-defense-run>DISCARD</button><button class="primary" type="button" data-resume-defense-run>RESUME RUN</button></span></section>`;}

  function defenseRecordsMarkup(){
    const history=state.scores?.defenseHistory||[],mastery=Object.values(state.scores?.defenseMastery||{}).sort((a,b)=>(b.waves||0)-(a.waves||0)||(b.damage||0)-(a.damage||0)).slice(0,8),contracts=(state.scores?.defenseContracts||[]).map(normalizeDefenseRunContract).filter(Boolean),today=ensureDailyDefenseContract(),streak=defenseContractStreak(contracts),perMap=state.scores?.defenseMaps||{},perfectMaps=state.scores?.defensePerfectMaps||[],totalBosses=history.reduce((sum,run)=>sum+(run.bosses||0),0);
    const maps=DEFENSE_MAP_ORDER.map(id=>{const map=DEFENSE_MAPS[id],best=Math.max(0,Math.floor(Number(perMap[id])||0)),tier=defenseMedalTier(best),perfect=perfectMaps.includes(id);return`<article class="defense-record-map" style="--map-accent:${defenseMapAccent(id)}"><span>${map.icon}</span><div><small>WORLD ${map.level} • BEST CLEARED ${best}</small><b>${escapeHTML(map.name)}</b><em>${escapeHTML(defenseMedalName(tier))}${perfect?" • GATE PERFECT":""}</em></div>${defenseMedalMarkup(id,best)}</article>`;}).join("");
    const contractRows=contracts.filter(item=>item.completed).slice(0,8).map(item=>{const map=DEFENSE_MAPS[item.mapId]||DEFENSE_MAPS.grove;return`<article class="defense-contract-record"><span>${item.perfect?"✦":"✓"}</span><div><small>${escapeHTML(item.date)} • ${escapeHTML(map.name)}</small><b>${escapeHTML(item.title)}</b><em>${item.rules.map(id=>escapeHTML(DEFENSE_CONTRACT_RULES[id].name)).join(" • ")}</em></div><button type="button" data-replay-defense-contract="${escapeHTML(item.id)}">REPLAY</button></article>`;}).join("")||`<p class="defense-record-empty">SEAL TODAY’S CONTRACT AT WAVE ${DEFENSE_CONTRACT_TARGET} TO BEGIN THE ARCHIVE.</p>`;
    const masteryRows=mastery.length?mastery.map((record,index)=>{const variant=VARIANTS.find(item=>item.id===record.variant)||VARIANTS[0],unlock=defenseMasteryUnlockCopy(record);return`<article class="defense-mastery-row mastery-tier-${unlock.tier}" style="--mastery-color:${variant.color}"><i>${index+1}</i><span><small>${escapeHTML(defenseMasteryTitle(record))} • ${record.runs} RUNS</small><b>${escapeHTML(record.name||"RIZO")}</b><em>${record.waves} WAVES • ${record.pops} POPS • ${Math.round(record.damage)} DMG</em><strong>${escapeHTML(unlock.current)}</strong><u>${escapeHTML(unlock.next)}</u>${defenseMasteryPips(record)}</span></article>`;}).join(""):`<p class="defense-record-empty">DEPLOY A RIZO AND BANK A REAL RUN TO START FIELD MASTERY.</p>`;
    const runRows=history.length?history.slice(0,8).map(run=>{const map=DEFENSE_MAPS[run.mapId]||DEFENSE_MAPS.grove;return`<article class="defense-history-row"><span>${run.contractComplete?"◇":run.perfect?"✦":run.ended==="gate"?"♥":"◉"}</span><div><small>${escapeHTML(map.name)} • ${new Date(run.at||0).toLocaleDateString()}${run.contractComplete?" • CONTRACT":""}</small><b>CLEARED ${run.clearedWave??run.wave}${(run.reachedWave??run.wave)>(run.clearedWave??run.wave)?` • REACHED ${run.reachedWave}`:""} • ${run.kills} POPS</b><em>${run.heartLoss} HEARTS LOST • MVP ${escapeHTML(run.mvpName||"RIZO")}</em></div></article>`;}).join(""):`<p class="defense-record-empty">NO BANKED DEFENSE RUNS YET.</p>`;
    return`<div class="modal-card defense-records-modal"><small>RIZO DEFENSE • PERMANENT RECORDS</small><div class="defense-records-head"><div><h2>THE GATE REMEMBERS.</h2><p>Medals, contracts, run history, and field mastery record what happened. Mastery unlocks presentation only—never hidden permanent damage.</p></div><b>${history.length} RUNS<br>${totalBosses} BOSSES</b></div><section class="defense-records-section defense-signature-guide"><h3>FIELD SIGNATURES</h3><p>10 WAVES • FIELD MARK<br>50 WAVES • VARIANT TRAIL<br>150 WAVES • IMPACT SIGIL<br>400 WAVES • LEGEND AURA</p><em>${state.settings.defenseSignatures?"SIGNATURES ACTIVE":"SIGNATURES HIDDEN IN SETTINGS"} • COSMETIC ONLY</em></section><section class="defense-records-section defense-contract-archive"><h3>TRAIL CONTRACTS • ${streak} DAY STREAK</h3><p class="defense-contract-today">TODAY • ${escapeHTML(today.title)} • ${today.completed?"SEALED":`BEST ${today.bestWave}/${today.targetWave}`}</p><div class="defense-contract-records">${contractRows}</div></section><section class="defense-records-section"><h3>WORLD MEDALS</h3><div class="defense-record-map-list">${maps}</div></section><section class="defense-records-section"><h3>RIZO FIELD MASTERY</h3><div class="defense-mastery-list">${masteryRows}</div></section><section class="defense-records-section"><h3>RECENT RUNS</h3><div class="defense-history-list">${runRows}</div></section><div class="modal-buttons"><button type="button" data-defense-field-guide="rizos">FIELD GUIDE</button><button type="button" data-defense-records-back>BACK TO WORLD ROUTE</button><button class="primary" type="button" data-close-modal>BACK TO ARCADE</button></div></div>`;
  }
  function showDefenseRecords(){showModal(defenseRecordsMarkup());activeMusicOverride="mini-defense";startMusicForScene("mini-defense",true);}
  function recordDefenseRun(snapshot){
    const clearedWave=DefenseCore.clampInteger(snapshot?.clearedWave,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0),reachedWave=Math.max(clearedWave,DefenseCore.clampInteger(snapshot?.currentWave??snapshot?.wave,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0));if(!clearedWave&&!reachedWave)return null;
    const contractProgress=recordDefenseContractProgress(snapshot,true),contract=contractProgress.record,stats=snapshot.enemyStats||{},heartLoss=Math.max(0,Math.floor(Number(stats.heartLoss)||0)),leaks=Object.values(stats.leaked||{}).reduce((sum,value)=>sum+(Number(value)||0),0),bosses=[...new Set(snapshot.bossesBeaten||[])],perfectWaveCount=DefenseCore.clampInteger(snapshot?.perfectWaveCount,0,clearedWave,0),perfect=clearedWave>0&&perfectWaveCount===clearedWave,petTotals=new Map();
    for(const tower of snapshot.towers||[]){const current=petTotals.get(tower.petId)||{petId:tower.petId,name:tower.pet?.name||"RIZO",variant:tower.pet?.variant||tower.pet?.hiddenVariant||"classic",kills:0,damage:0,powerPaths:0,controlPaths:0};current.kills+=Math.max(0,Number(tower.kills)||0);current.damage+=Math.max(0,Number(tower.damage)||0);if(tower.doctrine==="power")current.powerPaths+=1;if(tower.doctrine==="control")current.controlPaths+=1;petTotals.set(tower.petId,current);}
    const leaders=[...petTotals.values()].sort((a,b)=>b.damage-a.damage||b.kills-a.kills),persistentLeaders=leaders.filter(row=>!row.petId.startsWith("defense-crew-")&&!row.petId.startsWith("defense-structure-")&&row.petId!==DEFENSE_BASIC_TOWER.id),top=persistentLeaders[0]||{petId:state.pet.id||"",name:state.pet.name,variant:state.pet.variant||"classic",damage:0};state.scores.defenseMastery||={};
    // Defense crew are tactical loaners: combat contribution is real, permanent MVP/mastery is not.
    if(clearedWave>0)for(const row of persistentLeaders){const prior=state.scores.defenseMastery[row.petId]||{petId:row.petId,name:row.name,variant:row.variant,runs:0,waves:0,bestWave:0,pops:0,damage:0,bosses:0,powerPaths:0,controlPaths:0,lastAt:0};state.scores.defenseMastery[row.petId]={...prior,name:row.name,variant:row.variant,runs:(prior.runs||0)+1,waves:(prior.waves||0)+clearedWave,bestWave:Math.max(prior.bestWave||0,clearedWave),pops:(prior.pops||0)+Math.floor(row.kills),damage:(prior.damage||0)+Math.round(row.damage),bosses:(prior.bosses||0)+(row.petId===top.petId?bosses.length:0),powerPaths:(prior.powerPaths||0)+row.powerPaths,controlPaths:(prior.controlPaths||0)+row.controlPaths,lastAt:now()};}
    const record={id:uid("DEFENSE-RUN"),at:now(),mapId:snapshot.mapId,wave:clearedWave,clearedWave,reachedWave,kills:Math.max(0,Math.floor(Number(snapshot.kills)||0)),heartLoss,leaks:Math.max(0,Math.floor(leaks)),bosses:bosses.length,perfect,perfectWaveCount,ended:snapshot.ended==="gate"?"gate":"banked",mvpPetId:top.petId,mvpName:top.name,mvpVariant:top.variant,mvpDamage:Math.round(top.damage),powerPaths:leaders.reduce((sum,row)=>sum+row.powerPaths,0),controlPaths:leaders.reduce((sum,row)=>sum+row.controlPaths,0),contractId:contract?.id||"",contractDate:contract?.date||"",contractComplete:Boolean(contract?.completed)};
    state.scores.defenseHistory=[record,...(state.scores.defenseHistory||[])].slice(0,12);if(perfect&&clearedWave>=10){state.scores.defensePerfectMaps||=[];if(!state.scores.defensePerfectMaps.includes(snapshot.mapId))state.scores.defensePerfectMaps.push(snapshot.mapId);}return record;
  }

  function defenseNow(){return Number(mini.defense?.clock)||0;}
  const DEFENSE_STRUCTURE_META=Object.freeze({
    factory:Object.freeze({id:"defense-structure-factory",name:"CLOTHING FACTORY",role:"ECONOMY",accent:"#ff7a45"}),
    beacon:Object.freeze({id:"defense-structure-beacon",name:"BEACON",role:"SUPPORT",accent:"#ffe16a"})
  });
  // Universal (Defense-only) deployables. Kept as one ordered list so the bench,
  // pricing, checkpoint restore and reward-exclusion paths all agree on what is a
  // tool rather than a collected Rizo.
  const DEFENSE_UNIVERSAL_STRUCTURE_TYPES=Object.freeze(["factory","beacon"]);
  const DEFENSE_UNIVERSAL_PET_IDS=new Set([DEFENSE_BASIC_TOWER.id,...DEFENSE_UNIVERSAL_STRUCTURE_TYPES.map(type=>DEFENSE_STRUCTURE_META[type].id)]);
  function defenseStructureType(subject){return subject?.structureType||subject?.pet?.defenseStructure||subject?.defenseStructure||null;}
  function defenseStructurePet(type){const meta=DEFENSE_STRUCTURE_META[type]||DEFENSE_STRUCTURE_META.factory;return{id:meta.id,name:meta.name,variant:"classic",hiddenVariant:"classic",stage:"kid",alive:true,defenseGuest:true,defenseStructure:type,accessory:null,skills:{power:0,speed:0,instinct:0,stamina:0,luck:0}};}
  function defenseAwakenedGoldenCount(d=mini.defense){return d?.towers?.filter(tower=>!defenseStructureType(tower)&&(tower.pet.variant||tower.pet.hiddenVariant)==="golden"&&tower.upgrade>=2).length||0;}
  function defenseBeaconNetwork(beacon,d=mini.defense){
    if(!beacon||!d||defenseStructureType(beacon)!=="beacon")return null;const support=DefenseCore.beaconSupport(beacon.upgrade);let combat=0,factories=0,golden=0;
    for(const other of d.towers){if(other===beacon||defenseStructureType(other)==="beacon")continue;if(Math.hypot(beacon.x-other.x,beacon.y-other.y)>support.radius)continue;const type=defenseStructureType(other);if(type==="factory")factories+=1;else{combat+=1;if((other.pet.variant||other.pet.hiddenVariant)==="golden"&&other.upgrade>=2)golden+=1;}}
    const brandLoop=beacon.upgrade>=2&&combat>0&&factories>0,privateSun=brandLoop&&beacon.upgrade>=4;return{combat,factories,golden,brandLoop,privateSun};
  }
  function defenseBeaconInfluence(tower,d=mini.defense){
    if(!tower||!d||defenseStructureType(tower)==="beacon")return null;let best=null;
    for(const beacon of d.towers){if(defenseStructureType(beacon)!=="beacon")continue;const support=DefenseCore.beaconSupport(beacon.upgrade),distance=Math.hypot(beacon.x-tower.x,beacon.y-tower.y);if(distance>support.radius)continue;const network=defenseBeaconNetwork(beacon,d),score=support.rateMultiplier+support.damageMultiplier+support.radius+(network?.brandLoop?.01:0)+(network?.privateSun?.02:0);if(!best||score>best.score)best={...support,score,beacon,network};}
    return best;
  }
  function defenseFactoryEconomy(tower,d=mini.defense){const influence=defenseBeaconInfluence(tower,d),goldens=defenseAwakenedGoldenCount(d),network=influence?.network;return DefenseCore.factoryEconomy({upgradeLevel:tower?.upgrade||0,wave:d?.currentWave||d?.clearedWave||0,goldenTowerCount:goldens,beaconUpgradeLevel:influence?.beacon?.upgrade??-1,cleanCycles:tower?.factoryCleanCycles||0,brandLoop:Boolean(network?.brandLoop),privateSun:Boolean(network?.privateSun),goldenLicensed:Boolean(network?.golden)});}
  function defenseStructureUpgradeName(tower){const type=defenseStructureType(tower),level=clamp(tower?.upgrade||0,0,4),names={factory:["FOLD TABLE","TWO-PERSON SHOP","PRINT LINE","NIGHT SHIFT","RIZO INDUSTRIAL"],beacon:["WORK LIGHT","SIGNAL LAMP","HALO ARRAY","DAYBREAK CORE","PRIVATE SUN"]};return(names[type]||names.factory)[level];}
  function defenseStructureRoleCopy(type){return type==="factory"?"Prints shirts into Defense coins during live waves. Upgraded lines build momentum while the Gate stays clean; leaks break the streak.":"Nearby Rizos attack faster. From HALO ARRAY onward, covering both a Rizo and Factory lights a BRAND LOOP that accelerates Factory drops.";}
  function defenseRoster(){
    const configured=defenseConfiguredRoster(),runIds=mini?.active&&mini.mode==="defense"&&Array.isArray(mini.defense?.runRosterIds)?mini.defense.runRosterIds:null;
    if(!runIds)return configured;
    const registry=defenseFullRosterRegistry(),rows=[],captain=registry.get(state.pet?.id);
    if(captain)rows.push(captain);
    for(const id of runIds){if(id===state.pet?.id)continue;const row=registry.get(id);if(row&&!rows.some(item=>item.pet.id===id))rows.push(row);}
    return rows.length?rows:configured;
  }
  // --- INTEGRATION GLUE: bench composition -------------------------------------
  // Worker C owns `defenseRoster()` as the Rizo *character* crew (Captain + wings).
  // Workers B and D contribute universal Defense-only tools/structures that must
  // share the bench, placement, pricing and checkpoint paths without pretending to
  // be collected Rizos. `defenseDeployRows()` is the single composed bench source;
  // character semantics (mastery, MVP, Field Leader, Field Guide) keep reading
  // `defenseRoster()` so universal tools can never steal collection rewards.
  function defenseUniversalStructureRows(){
    return DEFENSE_UNIVERSAL_STRUCTURE_TYPES.map(type=>({pet:defenseStructurePet(type),source:"structure",rosterIndex:-1,structureType:type}));
  }
  // One ordered universal layer: Worker D's Basic Defense Rizo (the cheap legible
  // combat starter) then Worker B's economy/support structures.
  function defenseUniversalRows(){return [...defenseUniversalDeployRows(),...defenseUniversalStructureRows()];}
  // Bench order is "protagonist, universal kit, discovered crew". The Captain
  // always leads, and the complete universal kit always sits in the first bench
  // frame so a player who owns only their starter Rizo still has a whole tower
  // defense game without hunting through a scrolled bench. Discovered wings
  // follow: they are a deliberate pre-run choice, not an onboarding dependency.
  function defenseDeployRows(){
    const crew=defenseRoster(),captain=crew.filter(row=>row.source==="active"),wings=crew.filter(row=>row.source!=="active");
    return [...captain,...defenseUniversalRows(),...wings];
  }
  function defenseDeployRegistry(){return new Map(defenseDeployRows().map(row=>[row.pet.id,row]));}
  function defenseIsUniversalRow(row){return Boolean(row)&&(row.source==="structure"||row.source==="universal");}
  // Character = a collected/loaned Rizo. Never a universal Defense-only tool
  // (Worker D) and never a universal structure (Worker B). Field Leader, field
  // powers, Super Rizo ascension and permanent identity are character-only.
  function defenseIsCharacterTower(tower){return Boolean(tower)&&!defenseStructureType(tower)&&!defenseIsUniversalTower(tower);}
  function defenseUnlockedMaps(){const best=Number(state.scores?.defense)||0;return DEFENSE_MAP_ORDER.map(id=>DEFENSE_MAPS[id]).filter(map=>best>=map.unlockWave);}
  function chooseDefenseMapId(){const unlocked=defenseUnlockedMaps();return (unlocked[unlocked.length-1]||DEFENSE_MAPS.grove).id;}
  function defensePathMetrics(path){const segments=[];let total=0;for(let i=1;i<path.length;i+=1){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y);segments.push({a,b,length,start:total});total+=length;}return{segments,total};}
  function defensePointFromMetrics(metrics,progress){const distance=clamp(progress,0,1)*metrics.total,segments=metrics.segments;let low=0,high=segments.length-1,index=high;while(low<=high){const middle=(low+high)>>1,segment=segments[middle];if(distance>segment.start+segment.length)low=middle+1;else{index=middle;high=middle-1;}}const segment=segments[index],t=clamp((distance-segment.start)/Math.max(.0001,segment.length),0,1);return{x:segment.a.x+(segment.b.x-segment.a.x)*t,y:segment.a.y+(segment.b.y-segment.a.y)*t};}
  function defensePointAt(progress){return defensePointFromMetrics(mini.defense.pathMetrics,progress);}
  function defenseMapPolyline(map){return map.path.map(point=>`${Math.round(point.x*1000)},${Math.round(point.y*1000)}`).join(" ");}
  function defenseMapSvgPath(map){return map.path.map((point,index)=>`${index?"L":"M"}${Math.round(point.x*1000)} ${Math.round(point.y*1000)}`).join(" ");}
  function defenseMiniRouteMarkup(map){const d=defenseMapSvgPath(map);return`<svg class="defense-mini-route" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;}
  function defenseLandmarkMarkup(map){return(map.landmarks||[]).map((item,index)=>`<i class="defense-landmark landmark-${escapeHTML(item.kind||"stone")}" style="--landmark-x:${item.x*100}%;--landmark-y:${item.y*100}%" data-landmark="${index}" aria-hidden="true"><span>${escapeHTML(item.label||"")}</span></i>`).join("");}
  function defenseBuildPocketMarkup(map){return(map.buildPockets||[]).map((item,index)=>`<i class="defense-build-pocket build-pocket-${escapeHTML(map.id)}" style="--pocket-x:${item.x*100}%;--pocket-y:${item.y*100}%" data-build-pocket="${index}" aria-hidden="true"></i>`).join("");}
  function defenseMapMechanicMarkup(map){
    const mechanic=map.mechanic||{},zones=map.mechanicZones||[];
    const link=mechanic.link&&zones.length>1?(()=>{const a=zones[0],b=zones[1],dx=(b.x-a.x)*100,dy=(b.y-a.y)*100,length=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;return `<i class="defense-map-bond-link link-${escapeHTML(mechanic.kind||"field")}" style="--link-x:${a.x*100}%;--link-y:${a.y*100}%;--link-length:${length}%;--link-angle:${angle}deg" aria-hidden="true"><u></u></i>`;})():"";
    return link+zones.map((zone,index)=>{
      const radius=Math.max(.02,Number(zone.r)||.12),edgeClass=[zone.x<.2?"mechanic-edge-left":"",zone.x>.8?"mechanic-edge-right":"",zone.y+radius>=.69?"mechanic-edge-bottom":""].filter(Boolean).join(" "),core=Number(zone.core)||0;
      return `<i class="defense-map-mechanic mechanic-${escapeHTML(zone.kind||mechanic.kind||"field")} ${core?"mechanic-has-core":""} ${edgeClass}" style="--mechanic-x:${zone.x*100}%;--mechanic-y:${zone.y*100}%;--mechanic-size:${Math.max(18,radius*200)}%;--mechanic-core:${Math.round(core*100)}%" data-map-mechanic="${index}" aria-hidden="true"><b>${escapeHTML(mechanic.icon||"✦")}</b><span><strong>${escapeHTML(mechanic.label||"FIELD BOND")}</strong><em>${escapeHTML(mechanic.copy||"")}</em></span></i>`;
    }).join("");
  }
  function defenseMapZoneMatch(map,x,y){
    if(!map||!Number.isFinite(x)||!Number.isFinite(y))return null;let chosen=null,score=Infinity,index=-1;
    (map.mechanicZones||[]).forEach((zone,zoneIndex)=>{const r=Math.max(.02,Number(zone.r)||.12),distance=Math.hypot(x-zone.x,y-zone.y),ratio=distance/r;if(ratio<=1&&ratio<score){chosen=zone;score=ratio;index=zoneIndex;}});
    return chosen?{zone:chosen,index,ratio:score}:null;
  }
  function defenseMapOccupiedZones(d=mini.defense,extraMatch=null){
    const occupied=new Set(),map=d?.map;if(!map)return occupied;
    for(const tower of d.towers||[]){const match=defenseMapZoneMatch(map,tower.x,tower.y);if(match)occupied.add(match.index);}
    if(extraMatch)occupied.add(extraMatch.index);
    return occupied;
  }
  function syncDefenseMapBondStateClasses(d=mini.defense){const world=$("#defenseWorld");if(!world||!d?.map)return false;const occupied=defenseMapOccupiedZones(d),linked=(d.map.mechanicZones||[]).length>1&&occupied.has(0)&&occupied.has(1);world.classList.toggle("map-circuit-linked",d.mapId==="storm"&&linked);world.classList.toggle("map-seal-resonance",d.mapId==="eclipse"&&linked);return linked;}
  function defenseMapBondForTower(tower,d=mini.defense,{preview=false}={}){
    const map=d?.map;if(!tower||!map)return null;const match=defenseMapZoneMatch(map,tower.x,tower.y);if(!match)return null;
    const {zone:chosen,index:zoneIndex,ratio}=match,occupied=defenseMapOccupiedZones(d,preview?match:null),now=defenseNow();
    const base={kind:chosen.kind||map.mechanic?.kind||"field",label:map.mechanic?.label||"FIELD BOND",copy:map.mechanic?.copy||"",preview:map.mechanic?.label||"FIELD BOND",damage:1,rate:1,range:1,camoSight:false,whiteoutProof:false,zoneIndex,ratio,tier:"bonded",state:""};
    if(map.id==="grove"){base.range=1.12;base.preview="KEEPER STONE • +12% REACH";}
    else if(map.id==="ember"){
      const hotCore=ratio<=Math.max(.2,Number(chosen.core)||.72);base.tier=hotCore?"core":"draft";base.label=hotCore?"FIRE DRAFT • HOT CORE":"FIRE DRAFT • OUTER";base.rate=hotCore?1.28:1.16;base.range=hotCore?.88:.96;base.copy=hotCore?"Hot core: +28% attack speed, -12% reach. Fastest position, tightest coverage.":"Outer draft: +16% attack speed, -4% reach. Safer coverage, less heat.";base.preview=hotCore?"HOT CORE • +28% SPEED / -12% REACH":"FIRE DRAFT • +16% SPEED / -4% REACH";
    }else if(map.id==="moon"){
      const moonlit=d.moonRevealUntil>now;base.range=1.08;base.rate=moonlit?1.18:1;base.camoSight=true;base.state=moonlit?"moonlit":"";base.label=moonlit?"SILVER BASIN • MOONLIT":"SILVER BASIN";base.copy=moonlit?"Moonlight is feeding the basin: veil sight, +8% reach, +18% attack speed.":"The basin keeps veil sight and +8% reach. Moonlight will wake its attack-speed window.";base.preview=moonlit?"MOONLIT BASIN • +18% SPEED / +8% REACH":"SILVER BASIN • VEIL SIGHT +8% REACH";
    }else if(map.id==="storm"){
      const circuit=(map.mechanicZones||[]).length>1&&occupied.has(0)&&occupied.has(1),surge=d.stormWeatherUntil>now;base.rate=surge?(circuit?1.34:1.28):(circuit?1.16:1.08);base.state=circuit?"circuit":"";base.label=circuit?"LIVE PYLONS • CIRCUIT":"LIVE PYLONS";base.copy=circuit?(surge?"Circuit closed during the surge: both pylon positions run at +34% attack speed.":"Circuit closed: split coverage across both pylons raises bonded towers to +16% attack speed."):(surge?"This pylon is surging at +28% attack speed. Occupy the other pylon to close the circuit.":"This pylon grants +8% attack speed. Occupy the other pylon to close the circuit.");base.preview=surge?(circuit?"CIRCUIT SURGE • +34% SPEED":"SURGE PYLON • +28% SPEED"):(circuit?"CIRCUIT CLOSED • +16% SPEED":"LIVE PYLON • +8% SPEED");
    }else if(map.id==="blizzard"){
      const whiteout=d.whiteoutUntil>now;base.range=whiteout?1.14:1.04;base.whiteoutProof=true;base.state=whiteout?"whiteout":"";base.label=whiteout?"ICE SHELTER • WHITEOUT OPEN":"ICE SHELTER";base.copy=whiteout?"The shelter turns Whiteout into an opening: no range loss and +14% reach.":"Sheltered towers ignore Whiteout range loss and hold +4% reach between storms.";base.preview=whiteout?"SHELTER OPEN • +14% REACH":"ICE SHELTER • WHITEOUT-PROOF";
    }else if(map.id==="eclipse"){
      const resonance=(map.mechanicZones||[]).length>1&&occupied.has(0)&&occupied.has(1);base.range=resonance?1.14:1.06;base.camoSight=true;base.state=resonance?"resonance":"";base.label=resonance?"SHADOW SEALS • RESONANCE":"SHADOW SEALS";base.copy=resonance?"Both seals are occupied: veil sight holds and bonded towers resonate at +14% reach.":"One seal holds veil sight and +6% reach. Occupy the other seal to resonate both positions.";base.preview=resonance?"SEALS RESONATE • +14% REACH":"SHADOW SEAL • VEIL SIGHT +6% REACH";
    }
    return base;
  }
  function defenseWorldFeatureMarkup(map){
    const features={
      grove:[["root","terrain-root terrain-root-a"],["root","terrain-root terrain-root-b"],["vine","terrain-vine"]],
      ember:[["vent","terrain-vent terrain-vent-a"],["vent","terrain-vent terrain-vent-b"],["crack","terrain-lava-crack"]],
      moon:[["orbit","terrain-orbit"],["crater","terrain-crater terrain-crater-a"],["crater","terrain-crater terrain-crater-b"]],
      storm:[["puddle","terrain-charge-puddle terrain-charge-puddle-a"],["puddle","terrain-charge-puddle terrain-charge-puddle-b"],["wind","terrain-wind-lane"]],
      blizzard:[["bank","terrain-snowbank terrain-snowbank-a"],["bank","terrain-snowbank terrain-snowbank-b"],["crack","terrain-ice-crack"]],
      eclipse:[["lane","terrain-shadow-lane"],["reveal","terrain-reveal-zone terrain-reveal-zone-a"],["reveal","terrain-reveal-zone terrain-reveal-zone-b"]]
    }[map.id]||[];
    return features.map(([kind,className],index)=>`<i class="defense-world-feature ${className}" data-world-feature="${escapeHTML(kind)}" data-feature-index="${index}" aria-hidden="true"></i>`).join("");
  }

  function defenseGatePoint(map){
    const end=map?.path?.[map.path.length-1]||{x:.88,y:.62};
    return{x:clamp(end.x,.055,.955),y:clamp(end.y,.1,.88)};
  }
  function defenseObstacleMarkup(map){return(map.blockedZones||[]).map((zone,index)=>`<i class="defense-obstacle obstacle-${escapeHTML(zone.kind||"rock")}" style="--obstacle-x:${zone.x*100}%;--obstacle-y:${zone.y*100}%;--obstacle-size:${Math.max(26,zone.r*520)}px" data-obstacle="${index}"></i>`).join("");}

  function queueDefenseIncome(amount,source="pop"){
    const d=mini.defense;if(!d)return 0;const safe=DefenseCore.clampNumber(amount,0,DEFENSE_LIMITS.MAX_RUN_CASH,0),wasEmpty=!(d.pendingIncome>0);d.pendingIncome=DefenseCore.clampNumber((d.pendingIncome||0)+safe,0,DEFENSE_LIMITS.MAX_RUN_CASH,0);d.pendingIncomeEvents=(d.pendingIncomeEvents||0)+1;d.pendingIncomeSources||(d.pendingIncomeSources={});d.pendingIncomeSources[source]=(d.pendingIncomeSources[source]||0)+safe;if(wasEmpty)d.nextIncomeFlushAtReal=defenseRealNow(d)+defensePerformanceBudget(d).incomeFlushMs/1000;d.lastIncomeSource=source;return safe;
  }
  function flushDefenseIncome(d=mini.defense,reason="timer"){
    if(!d)return 0;const pending=Math.max(0,Math.floor(Number(d.pendingIncome)||0));if(!pending)return 0;const events=Math.max(1,Math.floor(Number(d.pendingIncomeEvents)||1)),sources={...(d.pendingIncomeSources||{})};d.pendingIncome=0;d.pendingIncomeEvents=0;d.pendingIncomeSources={};d.cash=DefenseCore.clampNumber((d.cash||0)+pending,0,DEFENSE_LIMITS.MAX_RUN_CASH,0);d.nextIncomeFlushAtReal=defenseRealNow(d)+defensePerformanceBudget(d).incomeFlushMs/1000;d.cashWriteCount=(d.cashWriteCount||0)+1;d.lastIncomeFlushReason=reason;d.lastIncomeBatch={amount:pending,events,sources,atReal:defenseRealNow(d)};markDefenseUi({roster:true});return pending;
  }
  function defenseGoldenBonus(){const d=mini.defense;if(!d)return 1;return DefenseCore.goldenBonus(d.towers.filter(tower=>(tower.pet.variant||tower.pet.hiddenVariant)==="golden"&&tower.upgrade>=2).length);}
  const DEFENSE_WORLD_OPENING_PERKS=Object.freeze({
    grove:{label:"BALANCED OPENING",variants:[]},
    ember:{label:"FIRST DAMAGE UPGRADE • 20% OFF",variants:["ember","obsidian","shadow","diamond"]},
    moon:{label:"FIRST DETECTOR UPGRADE • 20% OFF",variants:["shadow","aurora","glitch"]},
    storm:{label:"FIRST CONTROL UPGRADE • 20% OFF",variants:["moss","frost","bubblegum","violet"]},
    blizzard:{label:"FIRST WIDE-RANGE UPGRADE • 20% OFF",variants:["aurora","diamond","violet","frost"]},
    eclipse:{label:"FIRST SUPPORT / REVEAL UPGRADE • 20% OFF",variants:["aurora","golden","glitch","shadow"]}
  });
  function defenseWorldPerkMatchesTower(mapId,tower){const perk=DEFENSE_WORLD_OPENING_PERKS[mapId],variant=tower?.pet?.variant||tower?.pet?.hiddenVariant||"classic";return Boolean(perk?.variants?.includes(variant));}
  function defenseWorldPerkLabel(d=mini.defense){return DEFENSE_WORLD_OPENING_PERKS[d?.mapId]?.label||"BALANCED OPENING";}
  function defenseUpgradeModifier(tower,d=mini.defense){if(defenseStructureType(tower)||defenseIsUniversalTower(tower)||!d||d.worldPerkUsed||tower?.upgrade!==0||!defenseWorldPerkMatchesTower(d.mapId,tower))return 1;return DefenseCore.ECONOMY.worldOpeningDiscount;}
  function defenseUpgradeCost(tower,d=mini.defense){const structureType=defenseStructureType(tower);if(defenseIsUniversalTower(tower))return DEFENSE_BASIC_TOWER.upgradeCosts[clamp(tower?.upgrade||0,0,DEFENSE_BASIC_TOWER.upgradeCosts.length-1)];return structureType?DefenseCore.structureUpgradeCost(structureType,tower?.upgrade||0):DefenseCore.upgradeCost(tower?.upgrade||0,defenseUpgradeModifier(tower,d));}
  function defenseCanUndoPlacement(tower,d=mini.defense){return Boolean(d&&tower&&defenseSellAllowed(d)&&Number.isFinite(tower.placedAtReal)&&defenseRealNow(d)-tower.placedAtReal<=DefenseCore.ECONOMY.placementUndoSeconds);}
  function defenseSellRefund(tower,d=mini.defense){if(!tower)return 0;return Math.floor((tower.spent||0)*(defenseCanUndoPlacement(tower,d)?1:DefenseCore.ECONOMY.planningRefundRate));}

  function defenseDeployCost(row){const d=mini.defense,copies=d.towers.filter(tower=>tower.petId===row.pet.id).length,structureType=defenseStructureType(row),paid=d.towers.filter(tower=>tower.cost>0).length;if(defenseIsUniversalPet(row.pet))return defenseUniversalDeployCost(copies);return structureType?DefenseCore.structureDeploymentCost(structureType,copies):DefenseCore.deploymentCost({paidTowerCount:paid,copyCount:copies,activeFirst:row.source==="active"});}
  function defenseTowerStats(pet,upgrade=0){
    if(pet?.defenseStructure==="factory")return{variant:"classic",profile:{label:"ECONOMY"},damage:0,rate:0,range:.11,crit:0,projectile:"none",label:"ECONOMY"};
    if(pet?.defenseStructure==="beacon"){const support=DefenseCore.beaconSupport(upgrade);return{variant:"classic",profile:{label:"SUPPORT"},damage:0,rate:support.rateMultiplier,range:support.radius,crit:0,projectile:"none",label:"SUPPORT"};}    if(defenseIsUniversalPet(pet)){const level=clamp(Math.floor(Number(upgrade)||0),0,4),levels=[{damage:5.4,rate:1.24,range:.198},{damage:6.3,rate:1.29,range:.205},{damage:7.25,rate:1.34,range:.215},{damage:8.15,rate:1.39,range:.222},{damage:9.25,rate:1.44,range:.23}],base=levels[level];return{variant:DEFENSE_BASIC_TOWER.variant,profile:{damage:1,rate:1,range:1,projectile:"needle",label:"STRAIGHT SHOT"},damage:base.damage,rate:base.rate,range:base.range,crit:0,projectile:"needle",label:"STRAIGHT SHOT"};}
    const stage=DEFENSE_STAGE_MULTIPLIER[pet.stage]||1,power=Number(pet.skills?.power)||0,speed=Number(pet.skills?.speed)||0,instinct=Number(pet.skills?.instinct)||0,stamina=Number(pet.skills?.stamina)||0,variant=pet.variant||pet.hiddenVariant||"classic";
    const profile={classic:{damage:1,rate:1,range:1,projectile:"spark",label:"BALANCED"},ember:{damage:1.03,rate:.96,range:1,projectile:"ember",label:"BURN"},toxic:{damage:.88,rate:1,range:1.04,projectile:"toxic",label:"POISON"},violet:{damage:.82,rate:.88,range:1.04,projectile:"void",label:"CHAIN 3"},moss:{damage:.78,rate:.91,range:1.08,projectile:"moss",label:"ROOT"},bubblegum:{damage:.85,rate:.9,range:.98,projectile:"bubble",label:"KNOCKBACK"},frost:{damage:.62,rate:.90,range:1.15,projectile:"frost",label:"SLOW / SETUP"},glitch:{damage:1.02,rate:1.13,range:1,projectile:"glitch",label:"RANDOM"},obsidian:{damage:2.65,rate:.54,range:.92,projectile:"stone",label:"ARMOR CRACKER"},aurora:{damage:.78,rate:.9,range:1.18,projectile:"aurora",label:"AURA"},golden:{damage:.9,rate:.92,range:1,projectile:"gold",label:"PROFIT"},diamond:{damage:1.2,rate:.76,range:1.15,projectile:"diamond",label:"PIERCE"},shadow:{damage:1.08,rate:.92,range:1.04,projectile:"shadow",label:"CRITICAL"},retro:{damage:.72,rate:1.48,range:.95,projectile:"retro",label:"RAPID"}}[variant]||{damage:1,rate:1,range:1,projectile:"spark",label:"BALANCED"};
    const up=1+upgrade*.34;return{variant,profile,damage:(6.8+power*.052+stamina*.012)*stage*profile.damage*up,rate:(1.08+speed*.009)*profile.rate*(1+upgrade*.12),range:(.215+instinct*.00078)*profile.range*(1+upgrade*.085),crit:.06+instinct*.0014,projectile:profile.projectile,label:profile.label};
  }
  function defenseCombatStats(tower){
    const stats=defenseTowerStats(tower.pet,tower.upgrade),time=defenseNow(),d=mini.defense;if(defenseStructureType(tower))return stats;
    if(defenseIsUniversalTower(tower)){if(tower.doctrine==="power"){stats.damage*=1.32;stats.rate*=.96;stats.range*=.98;stats.projectile="rivet";stats.label=tower.upgrade>=4?"RIVET CANNON":"BOLT BREAKER";if(tower.upgrade>=3)stats.damage*=1.18;if(tower.upgrade>=4){stats.damage*=1.22;stats.range*=1.05;}}else if(tower.doctrine==="control"){stats.damage*=.90;stats.rate*=1.24;stats.range*=1.19;stats.projectile="pin";stats.label=tower.upgrade>=4?"THREADSTORM":"PIN CONTROL";if(tower.upgrade>=3){stats.rate*=1.10;stats.range*=1.06;}if(tower.upgrade>=4){stats.rate*=1.12;stats.range*=1.08;}}}else{if(tower.doctrine==="power"){stats.damage*=1.24;stats.rate*=1.06;stats.range*=.97;}else if(tower.doctrine==="control"){stats.damage*=.86;stats.rate*=1.18;stats.range*=1.24;}if(tower.superForm==="power"){stats.damage*=2.75;stats.rate*=1.18;stats.range*=1.06;}else if(tower.superForm==="control"){stats.damage*=1.18;stats.rate*=1.72;stats.range*=1.48;}}if(d.rallyUntil>time)stats.rate*=1.34;if(d.prismUntil>time){stats.damage*=1.28;stats.rate*=1.15;stats.range*=1.08;}if(tower.overclockUntil>time)stats.rate*=2;if(tower.rangeDebuffUntil>time)stats.range*=.75;const mapBond=defenseMapBondForTower(tower,d);if(mapBond){stats.damage*=mapBond.damage;stats.rate*=mapBond.rate;stats.range*=mapBond.range;}if(d.whiteoutUntil>time&&!['frost','aurora'].includes(stats.variant)&&!mapBond?.whiteoutProof)stats.range*=.82;const beacon=defenseBeaconInfluence(tower,d);if(beacon){stats.damage*=beacon.damageMultiplier;stats.rate*=beacon.rateMultiplier;}return stats;
  }
  function defenseAbilityData(tower){if(defenseIsUniversalTower(tower))return{passive:"Cheap straight shots. POWER becomes an armor-breaking rivet driver; CONTROL becomes a fast pinning rig.",active:"NO FIELD POWER",copy:"Universal Defense tools do not consume the Field Leader slot.",cooldown:999};return DEFENSE_ABILITIES[tower.pet.variant||tower.pet.hiddenVariant||"classic"]||DEFENSE_ABILITIES.classic;}
  function defenseAbilityCooldown(tower){const data=defenseAbilityData(tower),stamina=Number(tower.pet.skills?.stamina)||0;return Math.max(data.cooldown*.48,data.cooldown*(1-tower.upgrade*.085-stamina*.0015));}
  function defenseAbilityRemaining(tower){return Math.max(0,(tower.abilityReadyAt||0)-defenseNow());}
  function defenseTowerTier(tower){return tower.upgrade>=4?"apex":tower.upgrade>=2?"awakened":tower.upgrade>=1?"charged":"base";}
  function defenseUpgradeMove(tower){if(defenseIsUniversalTower(tower)){if(tower.upgrade===0)return"Every fourth shot double-stitches into a second nearby threat";if(tower.upgrade===1)return"Unlock POWER rivets or CONTROL pins";if(!tower.doctrine)return"Choose POWER armor breaks or CONTROL lane pins";if(tower.doctrine==="power")return tower.upgrade>=3?"Rivet Crown charges faster, hunts armor, and tears into restrained threats":"Every rivet starts shaving armor; charged shots burst through clusters";return tower.upgrade>=3?"Threadstorm weaves three threats; opened armor locks and rewinds deeper":"Charged pins thread into one fresh nearby threat";}const v=tower.pet.variant||tower.pet.hiddenVariant||"classic";if(tower.upgrade===0)return{classic:"Every third shot hits 65% harder",violet:"Chain reaches a fourth target",frost:"Chill splashes into nearby threats",obsidian:"Every impact strips armor"}[v]||"Stronger hits and wider reach";if(tower.upgrade===1)return"Choose POWER impacts or CONTROL pulses + field power";return tower.doctrine==="control"?"Stronger control and wider coverage":"Harder charged strikes";}
  function defenseUpgradeName(tower){
    if(defenseStructureType(tower))return defenseStructureUpgradeName(tower);
    const names={classic:["STEADY SPARK","BRIGHT GUARD","RALLY HEART","GATEKEEPER","FIRST FLAME"],ember:["CINDER","HOT BLOOD","FIRE RING","INFERNO","PHOENIX CORE"],toxic:["SPORE","VENOM","PLAGUE BLOOM","CORROSION","TOXIC CROWN"],violet:["PULSE","ARC LINK","CHAIN SURGE","VOID CURRENT","PURPLE STORM"],moss:["ROOT","THICKET","ROOT GARDEN","OLD GROWTH","FOREST HEART"],bubblegum:["BOUNCE","PRESSURE","BIG BOUNCE","WAVE BREAK","PINK IMPACT"],frost:["CHILL","ICE VEIN","DEEP FREEZE","WHITE CROWN","ABSOLUTE ZERO"],glitch:["STATIC","SIGNAL SPLIT","REWRITE","SYSTEM BREAK","GLITCH GOD"],obsidian:["STONE","FAULT LINE","QUAKE","BLACK MOUNTAIN","WORLD WEIGHT"],aurora:["HALO","PRISM","PRISM FIELD","SKY CHOIR","AURORA THRONE"],golden:["LUCK","DIVIDEND","PAYDAY","GOLD RUSH","KING'S RANSOM"],diamond:["SHARD","CUT LINE","SHARD LINE","REFRACTION","DIAMOND RAIN"],shadow:["DUSK","BLACK EDGE","NIGHT CUT","ECLIPSE BLADE","LAST SHADOW"],retro:["TICK","TURBO","OVERCLOCK","HYPER SIGNAL","ARCADE GOD"]};
    if(defenseIsUniversalTower(tower)){const level=clamp(tower.upgrade,0,4);if(level===0)return"BLANK FRAME";if(level===1)return"STITCHER";if(level===2)return"FIELD KIT";if(tower.doctrine==="power")return level===3?"BOLT DRIVER":"RIVET CROWN";if(tower.doctrine==="control")return level===3?"PIN WHEEL":"THREADSTORM";return"FIELD KIT";}const variant=tower.pet.variant||tower.pet.hiddenVariant||"classic";return(names[variant]||names.classic)[clamp(tower.upgrade,0,4)];
  }

  function initializeDefenseRun(mapChoice = "auto", contract = null, {allowLockedMap=false} = {}){
    const normalizedContract=normalizeDefenseRunContract(contract),requestedMap=typeof mapChoice==="string"&&DEFENSE_MAPS[mapChoice]?mapChoice:null,mapId=normalizedContract?.mapId||(allowLockedMap&&requestedMap?requestedMap:defenseResolvedMapId(mapChoice)),map=DEFENSE_MAPS[mapId]||DEFENSE_MAPS.grove,budget=defensePerformanceBudget({performanceLow:false,renderTier:0}),runRosterIds=defenseConfiguredRoster().map(row=>row.pet.id);
    mini.defense=installDefenseStateContracts({mapId,map,contract:normalizedContract,runRosterIds,pathMetrics:map.pathMetrics||defensePathMetrics(map.path),currentWave:0,clearedWave:0,lives:map.lives,cash:BASE_DEFENSE_STARTING_CASH,phase:DEFENSE_PHASES.PLANNING,resumePhase:DEFENSE_PHASES.COMBAT,speed:1,clock:0,realClock:0,towers:[],enemies:[],projectiles:[],effects:[],spawnQueue:[],wavePackets:[],packetIndex:0,packetEnemyIndex:0,nextSpawnAt:0,packetBreakUntil:0,childSpawnQueue:[],nextChildReleaseAtReal:0,childSpawnSequence:0,nextId:1,kills:0,totalDamage:0,usedPetIds:new Set(),selectedTowerId:null,lastWaveBonus:0,nextWaveReadyAtReal:0,autoStartAtReal:0,maxTowers:normalizedContract?.rules.includes("lean")?4:DEFENSE_LIMITS.MAX_DEFENSE_TOWERS,rallyUntil:0,prismUntil:0,whiteoutUntil:0,stormWeatherUntil:0,eclipseUntil:0,ashUntil:0,moonRevealUntil:0,nextWeatherAt:7,goldenCoinCarry:0,camoHintSeen:false,pendingPlacement:null,waveAnnouncement:null,currentWavePlan:[],bossesBeaten:[],bossesDefeated:0,perfectWaveCount:0,waveHeartLossStart:0,topTowerId:null,abilityTrayOpen:false,abilityGroupOpen:null,intelOpen:false,intelPausedByOpen:false,benchOpen:true,fieldMenuOpen:false,contextSurface:null,contextReturnFocus:null,enemyNodePool:[],projectileNodePool:[],impactNodePool:[],rendererMode:"dom",canvasRenderer:null,canvasFrames:0,canvasFallbacks:0,enemyVisualClock:0,enemyStateVisualClock:0,projectileVisualClock:0,renderWidth:0,renderHeight:0,mapIntroPlayed:false,lowFx:false,potatoFx:false,renderTier:0,renderTierChanges:0,performanceLow:false,performanceRecovery:0,frameMs:16.7,frameP95:16.7,frameP99:16.7,frameStress:0,slowFrameStreak:0,frameSamples:[],frameSampleClock:0,governorTier:0,governorPressureSeconds:0,governorStableSeconds:0,fixedSimulation:true,simAccumulator:0,presentationAccumulator:0,simStepSamples:[],simStepP95:0,simStepWorst:0,simBacklogEvents:0,maxCatchUpObserved:0,lastSimSteps:0,presentationFrames:0,coalescedVisualShots:0,coalescedLogicalShots:0,maxLogicalProjectilesObserved:0,droppedCosmetics:0,enemyNodesCreated:0,enemyNodesAcquired:0,projectileNodesCreated:0,projectileNodesAcquired:0,impactNodesCreated:0,impactNodesAcquired:0,enemyPositionWrites:0,enemyClassWrites:0,enemyHealthWrites:0,enemyStateWrites:0,projectilePositionWrites:0,autoPaused:false,wavePreview:[],uiClock:0,uiDirty:true,rosterDirty:false,lastPopSfxAt:-99,lastFeelHapticAtReal:-99,lastSelectionSfxAtReal:-99,lastSpawnedEnemyId:null,spawnWaitReason:"idle",peakAlive:0,schoolCoachSignature:"",wavePreviewSignature:"",abilityTraySignature:"",intelTraySignature:"",waveTotal:0,waveResolved:0,hudRenderCount:0,rosterRenderCount:0,trayRenderCount:0,intelRenderCount:0,checkpointDirty:false,checkpointClock:0,lastCheckpointAt:0,checkpointWrites:0,hintFlags:{},pendingIncome:0,pendingIncomeEvents:0,pendingIncomeSources:{},nextIncomeFlushAtReal:0,cashWriteCount:0,targetScans:0,targetSnapshotBuilds:0,targetSnapshot:[],targetSnapshotAtReal:0,childSpawnsReleased:0,lastIncomeBatch:null,maxActiveEnemiesObserved:0,maxProjectileNodesObserved:0,maxEffectNodesObserved:0,worldPerkUsed:false,cinematicMomentId:0,cinematicMomentCount:0,cinematicMomentKind:null,cinematicMomentPriority:0,cinematicMomentUntilReal:0,lastGateMomentAtReal:-99,gateFlameArmed:false,gateFlameReadyAt:0,gateFlameUntil:0,gateFlameProgress:.86,gateFlameNextTick:0,gateFlameTicks:0,lastHudLives:null,lastHudCash:null,flowDecisionBeat:0,flowPulseUntilReal:0,flowEaseUntilReal:0,flowChoiceKey:"",flowLastAction:"",flowActionQuietUntilReal:0,flowAutoHeldWave:-1,ending:false,endingReason:null,enemyStats:{spawned:{},popped:{},leaked:{},heartLoss:0,counters:{armorBreaks:0,armorShreds:0,reveals:0,phaseLocks:0,bossInterrupts:0}}});
    mini.score=0;mini.hits=0;mini.entities=[];
  }
  function defenseRosterMarkup(){
    const d=mini.defense;
    return defenseDeployRows().map(row=>{
      const copies=d.towers.filter(tower=>tower.petId===row.pet.id).length,cost=defenseDeployCost(row),structureType=defenseStructureType(row);
      const universal=defenseIsUniversalPet(row.pet),uniqueBlocked=defenseContractRule("unique",d)&&copies>0,placementLocked=!defensePlacementAllowed(d),disabled=placementLocked||d.towers.length>=d.maxTowers||d.cash<cost||uniqueBlocked,selected=d.pendingPlacement?.row?.pet?.id===row.pet.id;
      if(structureType){
        const meta=DEFENSE_STRUCTURE_META[structureType],instruction=placementLocked?"RESUME TO BUILD":selected?"TAP MAP OR DRAG":uniqueBlocked?"ONE PER CONTRACT":d.towers.length>=d.maxTowers?`FIELD FULL • ${d.maxTowers}`:`${cost} COINS`,benchInstruction=placementLocked?"PAUSED":selected?"TAP / DRAG":uniqueBlocked?"ONE PER RUN":d.towers.length>=d.maxTowers?"FIELD FULL":d.cash<cost?"NEED CASH":meta.role,badge=placementLocked?"Ⅱ":selected?"✓":uniqueBlocked?"✕":String(cost);
        return `<button type="button" class="defense-roster-pet defense-roster-pet-simple defense-roster-structure structure-${structureType} ${copies?"placed":""} ${selected?"placement-selected":""}" data-defense-roster-id="${meta.id}" ${disabled?"disabled":""} aria-pressed="${selected}" title="${escapeHTML(meta.name)} • ${escapeHTML(instruction)}" aria-label="${escapeHTML(meta.name)}, ${escapeHTML(instruction)}" style="--roster-color:${meta.accent}"><span class="defense-roster-frame" aria-hidden="true"></span><span class="defense-structure-thumb structure-art-${structureType}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="defense-roster-info"><b>${escapeHTML(meta.name)}</b><small>${escapeHTML(benchInstruction)}</small></span>${copies?`<u class="defense-roster-copies">×${copies}</u>`:""}<i class="defense-roster-badge">${escapeHTML(badge)}</i></button>`;
      }
      const variant=universal?{color:DEFENSE_BASIC_TOWER.color}:(VARIANTS.find(item=>item.id===(row.pet.variant||row.pet.hiddenVariant))||VARIANTS[0]),mastery=universal?null:state.scores?.defenseMastery?.[row.pet.id],masteryTitle=mastery?defenseMasteryTitle(mastery):"UNTESTED",instruction=placementLocked?"RESUME TO BUILD":selected?"TAP MAP OR DRAG":uniqueBlocked?"ONE PER CONTRACT":row.source==="active"&&!copies?"CAPTAIN • FREE DEPLOY":d.towers.length>=d.maxTowers?`FIELD FULL • ${d.maxTowers}`:`${cost} COINS`,role=universal?"COMBAT":defenseTowerStats(row.pet).profile.label,rosterTag=universal?"BASIC":row.source==="active"?"CAPTAIN":row.source==="guest"?"LOANER":"OWNED",benchInstruction=placementLocked?"PAUSED":selected?"TAP / DRAG":uniqueBlocked?"ONE PER RUN":d.towers.length>=d.maxTowers?"FIELD FULL":d.cash<cost?"NEED CASH":role,badge=placementLocked?"Ⅱ":selected?"✓":uniqueBlocked?"✕":row.source==="active"&&!copies?"FREE":String(cost);
      return `<button type="button" class="defense-roster-pet defense-roster-pet-simple roster-${row.source} ${universal?"defense-roster-universal":""} ${copies?"placed":""} ${selected?"placement-selected":""}" data-defense-roster-id="${escapeHTML(row.pet.id)}" ${disabled?"disabled":""} aria-pressed="${selected}" title="${escapeHTML(row.pet.name)} • ${escapeHTML(instruction)}" aria-label="${escapeHTML(row.pet.name)}, ${escapeHTML(instruction)}" style="--roster-color:${variant.color}"><span class="defense-roster-frame" aria-hidden="true"></span>${defenseDeployPortraitMarkup(row)}<span class="defense-roster-info"><em class="defense-roster-tag">${rosterTag}</em><b>${escapeHTML(row.pet.name)}</b><small>${escapeHTML(benchInstruction)}</small></span>${universal?`<em class="defense-roster-kind">UNIVERSAL TOOL</em>`:masteryTitle!=="UNTESTED"?`<em class="defense-roster-mastery">${escapeHTML(masteryTitle)}</em>`:""}${copies?`<u class="defense-roster-copies">×${copies}</u>`:""}<i class="defense-roster-badge">${escapeHTML(badge)}</i></button>`;
    }).join("");
  }


  function defenseMapIntroSeenKey(mapId){return `rizo-defense-map-seen:${String(mapId||"unknown")}`;}
  function closeDefenseMapIntro(){
    const d=mini.defense,intro=$("#defenseMapIntro");
    if(d){
      try{localStorage.setItem(defenseMapIntroSeenKey(d.mapId),"1");}catch(error){}
      if(!d.towers.length&&!d.pendingPlacement&&defensePlacementAllowed(d)){
        const active=defenseRoster().find(row=>row.source==="active")||defenseRoster()[0];
        if(active){const cost=defenseDeployCost(active);if(d.cash>=cost){setDefensePlacementMode(active,cost);setDefenseMessage(`YOUR RIZO • ${active.pet.name}`,cost?`Tap open grass to deploy for ${cost} coins.`:"Tap open grass. Your main Rizo deploys free.");}}
      }
    }
    if(!intro)return;
    intro.classList.add("leaving");
    queueMiniTimeout(()=>intro.remove(),360);
  }
  function playDefenseMapIntro(){
    const d=mini.defense,intro=$("#defenseMapIntro");
    if(!d||!intro||d.mapIntroPlayed||d.wave>0||d.towers.length){
      if(d)d.mapIntroPlayed=true;intro?.remove();return false;
    }
    d.mapIntroPlayed=true;
    let seen=false;try{seen=localStorage.getItem(defenseMapIntroSeenKey(d.mapId))==="1";}catch(error){}
    if(seen){intro.classList.add("returning");requestAnimationFrame(()=>intro.classList.add("playing"));queueMiniTimeout(closeDefenseMapIntro,state.settings.reducedMotion?120:520);return true;}
    requestAnimationFrame(()=>intro.classList.add("playing"));
    queueMiniTimeout(closeDefenseMapIntro,state.settings.reducedMotion?200:900);
    return true;
  }

  function defenseShouldUseCanvas(){
    const requested=defenseRendererOverride||new URLSearchParams(location.search).get("renderer");
    if(requested==="dom")return false;
    if(requested==="canvas")return Boolean(globalThis.RizoDefenseCanvas?.create);
    const qa=IS_QA_BUILD||location.hostname==="localhost"||location.hostname==="127.0.0.1"||new URLSearchParams(location.search).get("qa")==="1";
    return !qa&&Boolean(globalThis.RizoDefenseCanvas?.create);
  }
  function defenseUsesCanvas(d=mini.defense){return Boolean(d?.rendererMode==="canvas"&&d.canvasRenderer?.enabled);}
  function setupDefenseCombatRenderer(){
    const d=mini.defense,canvas=$("#defenseCombatCanvas"),shell=$(".defense-shell");if(!d||!canvas)return false;
    d.canvasRenderer?.destroy?.();d.canvasRenderer=null;d.rendererMode="dom";shell?.classList.remove("canvas-combat");
    if(!defenseShouldUseCanvas())return false;
    try{const renderer=globalThis.RizoDefenseCanvas.create(canvas,{build:RIZO_RUNTIME_BUILD});if(!renderer?.enabled)throw new Error("2D canvas unavailable");d.canvasRenderer=renderer;d.rendererMode="canvas";shell?.classList.add("canvas-combat");renderer.resize(d.renderWidth||canvas.clientWidth||390,d.renderHeight||canvas.clientHeight||390,d.governorTier||0);return true;}catch(error){d.canvasFallbacks=(d.canvasFallbacks||0)+1;return false;}
  }

  function fallbackDefenseCanvasToDom(reason="renderer-fallback"){
    const d=mini.defense;if(!d)return false;
    d.canvasFallbacks=(d.canvasFallbacks||0)+1;d.rendererMode="dom";d.canvasRenderer?.destroy?.();d.canvasRenderer=null;$(".defense-shell")?.classList.remove("canvas-combat");
    for(const enemy of d.enemies||[]){
      if(enemy.dead||enemy.node)continue;
      const node=acquireDefenseEnemyNode();if(!node)continue;
      node.dataset.enemyId=enemy.id;node.style.setProperty("--balloon-color",enemy.renderColor||"#ff7d32");if(node._rizoTrait)node._rizoTrait.textContent=enemy.renderIcon||"○";enemy.node=node;enemy.visualSignature="";enemy.stateSignature="";enemy.lastRenderedHealth=-1;updateDefenseEnemyNode(enemy,true);
    }
    for(const shot of d.projectiles||[]){
      if(shot.node||!shot.renderVisible)continue;
      const node=acquireDefenseProjectileNode();if(!node)continue;
      const variant=shot.tower?.pet?.variant||shot.tower?.pet?.hiddenVariant||"classic",masteryTier=defenseMasteryTierForPet(shot.tower?.petId);
      node.className=`defense-shot shot-${shot.kind||"pulse"} signature-${variant} mastery-shot-${masteryTier} ${shot.doctrineStrike?`shot-doctrine-${shot.doctrineStrike}`:""}`;node.style.setProperty("--signature-color",shot.renderColor||defenseTowerDisplayColor(shot.tower));positionDefenseMovingNode(node,shot.x,shot.y);shot.node=node;shot.renderVisible=false;
    }
    d.poolsWarmed=false;warmDefensePools(d);console.warn?.("Rizo Defense canvas fell back to DOM",reason);return true;
  }

  function warmDefensePools(owner=mini.defense){
    if(!owner||owner!==mini.defense)return false;
    if(defenseUsesCanvas(owner)){owner.poolsWarmed=true;return true;}
    const budget=defensePerformanceBudget(owner),enemyTarget=budget.maxActiveEnemies,projectileTarget=budget.maxVisibleProjectiles,impactTarget=budget.maxImpactEffects;
    while(owner.enemyNodePool.length<enemyTarget){const node=createDefenseEnemyNode();node.hidden=true;owner.enemyNodePool.push(node);owner.enemyNodesCreated=(owner.enemyNodesCreated||0)+1;}
    while(owner.projectileNodePool.length<projectileTarget){const node=document.createElement("i");node.hidden=true;node.className="defense-shot";owner.projectileNodePool.push(node);owner.projectileNodesCreated=(owner.projectileNodesCreated||0)+1;}
    while(owner.impactNodePool.length<impactTarget){const node=document.createElement("i");node.hidden=true;node.className="defense-impact";owner.impactNodePool.push(node);owner.impactNodesCreated=(owner.impactNodesCreated||0)+1;}
    owner.poolsWarmed=true;return true;
  }
  function defenseUiIcon(name,extraClass=""){
    const paths={
      speed:'<path d="M4 7.5 8.5 12 4 16.5M11 7.5l4.5 4.5-4.5 4.5M18 7.5v9"/>',
      intel:'<path d="M2.8 12s3.4-5.2 9.2-5.2 9.2 5.2 9.2 5.2-3.4 5.2-9.2 5.2S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.8"/>',
      power:'<path d="m13.2 2.8-7 10h5.1l-.5 8.4 7-10h-5.1l.5-8.4Z"/>',
      bench:'<circle cx="7" cy="9" r="2.4"/><circle cx="17" cy="9" r="2.4"/><path d="M3.7 19c.3-3.1 1.5-5 3.3-5s3 1.9 3.3 5M13.7 19c.3-3.1 1.5-5 3.3-5s3 1.9 3.3 5"/>',
      menu:'<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="8" cy="6" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="10" cy="18" r="1"/>',
      play:'<path class="fill" d="m8 5 10 7-10 7V5Z"/>',
      pause:'<path class="fill" d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
      route:'<path d="M4 18c0-7 5-3 5-9 0-3 2-5 5-5 3.4 0 6 2.4 6 6 0 5-5 3-5 8"/><path d="m12 15 3 3 3-3"/>',
      fullscreen:'<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
      guide:'<path d="M4 5.5c2.6-.8 5.3-.3 8 1.5v12c-2.7-1.8-5.4-2.3-8-1.5v-12ZM20 5.5c-2.6-.8-5.3-.3-8 1.5v12c2.7-1.8 5.4-2.3 8-1.5v-12Z"/>',
      bank:'<path d="M4 4h11l4 4v12H4V4Z"/><path d="M8 4v6h7V4M8 20v-6h8v6"/><path d="m3 12 3-3M3 12l3 3"/>',
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      heart:'<path class="fill" d="M12 20.2 4.6 13C.8 9.3 3.4 3.5 8.2 4.1c1.7.2 3 1.2 3.8 2.5.8-1.3 2.1-2.3 3.8-2.5 4.8-.6 7.4 5.2 3.6 8.9L12 20.2Z"/>',
      coin:'<circle cx="12" cy="12" r="8.2"/><path d="M14.9 8.7c-.8-.8-1.8-1.2-3-1.2-1.6 0-2.8.8-2.8 2 0 3 6.1 1.3 6.1 4.7 0 1.4-1.3 2.4-3.2 2.4-1.4 0-2.7-.5-3.5-1.4M12 5.5v13"/>',
      wave:'<path d="M3 15c2.2-4 4.4-4 6.6 0s4.4 4 6.6 0S20.6 11 22 13.5"/><path d="M3 9c2.2-4 4.4-4 6.6 0s4.4 4 6.6 0S20.6 5 22 7.5"/>',
      target:'<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4"/>',
      upgrade:'<path d="m12 3 6 6h-4v7H10V9H6l6-6Z"/><path d="M5 20h14"/>',
      sell:'<path d="M4 7h16M8 7V4h8v3M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',
      check:'<path d="m5 12.5 4.2 4.2L19 7"/>',
      snap:'<path d="M6 8a6 6 0 1 1 0 8M6 8V4M6 8H2"/><circle cx="12" cy="12" r="2.2"/>',
      warning:'<path d="m12 3 9 17H3L12 3Z"/><path d="M12 8v5M12 17h.01"/>'
    };
    const body=paths[name]||paths.menu;
    return `<svg class="rizo-ui-icon ${escapeHTML(extraClass)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  function setDefenseWaveIcon(node,kind){if(node)node.innerHTML=defenseUiIcon(kind);}

  function renderDefenseWorld(){
    const d=mini.defense,map=d.map,roadPath=defenseMapSvgPath(map),entry=map.path[0]||{x:.03,y:.2},entryX=clamp(entry.x,.035,.965),entryY=clamp(entry.y,.08,.9),gatePoint=defenseGatePoint(map);
    const contract=d.contract,contractBadge=contract?`<div class="defense-contract-badge"><small>TRAIL CONTRACT</small><b>${escapeHTML(contract.title)}</b><span>${contract.rules.map(id=>escapeHTML(DEFENSE_CONTRACT_RULES[id].name)).join(" • ")}</span></div>`:"";
    el.miniArena.innerHTML=`<div class="defense-shell rizo-defense-ui" data-defense-map="${map.id}" style="--field-accent:${defenseMapAccent(map.id)}">
      <section class="defense-command-deck" aria-label="Defense command deck">
        <div class="defense-command-world"><span class="defense-command-mark"><img src="./assets/rizo-full-mark.png" alt=""/></span><div><small>${map.icon} WORLD ${map.level} • ${contract?"CONTRACT":"OPEN TRAIL"}</small><b>${escapeHTML(map.name)}</b><em>${escapeHTML(map.entrance)}</em></div></div>
        <div class="defense-hud" aria-label="Field status"><span class="defense-stat defense-stat-lives" id="defenseLivesArt"><i>${defenseUiIcon("heart")}</i><b id="defenseLives">${d.lives}</b><small>GATE</small></span><span class="defense-stat defense-stat-cash" id="defenseCashArt"><i>${defenseUiIcon("coin")}</i><span class="defense-stat-value"><b id="defenseCash">${d.cash}</b><em class="defense-cash-delta" id="defenseCashDelta" aria-hidden="true"></em></span><small>GOLD</small></span></div>
        <div class="defense-command-actions">
          <button type="button" class="defense-speed defense-action-circle" data-defense-speed aria-label="Change Defense speed"><i>${defenseUiIcon("speed")}</i><span class="defense-action-label"><strong id="defenseSpeedValue">1×</strong><em>SPEED</em></span></button>
          <button type="button" class="defense-intel-button defense-action-circle" id="defenseIntelButton" data-defense-toggle-intel aria-label="Open threat intel" aria-expanded="false"><i>${defenseUiIcon("intel")}</i><span class="defense-action-label">THREATS</span><b id="defenseIntelCount">0</b></button>
          <button type="button" class="defense-abilities-button defense-action-circle" id="defenseAbilitiesButton" data-defense-toggle-abilities aria-label="Open Rizo powers" aria-expanded="false"><i>${defenseUiIcon("power")}</i><span class="defense-action-label" id="defenseLeaderPowerLabel">POWERS</span><b id="defenseAbilityCount">—</b></button>
          <button type="button" class="defense-gate-flame-button defense-action-circle" id="defenseGateFlameButton" data-defense-gate-flame aria-label="Place Ember Pod"><i class="defense-flame-icon" aria-hidden="true">✹</i><span class="defense-action-label">POD</span><b id="defenseGateFlameState">WAVE ONLY</b></button>
          <button type="button" class="defense-bench-button defense-action-circle active" id="defenseBenchButton" data-defense-toggle-bench aria-label="Show or hide Rizo bench" aria-expanded="true"><i>${defenseUiIcon("bench")}</i><span class="defense-action-label">RIZOS</span><b id="defenseBenchCount">${defenseDeployRows().length}</b></button>
          <button type="button" class="defense-menu-button defense-action-circle" id="defenseMenuButton" data-defense-toggle-field-menu aria-label="Open field menu" aria-expanded="false"><i>${defenseUiIcon("menu")}</i><span class="defense-action-label">MENU</span></button>
        </div>
        ${contractBadge}
      </section>
      <div class="defense-school-coach" id="defenseSchoolCoach" hidden></div>
      <div class="defense-stage-frame">
        <button type="button" class="defense-wave-button" id="defenseWaveButton" data-defense-run-control disabled><i id="defenseWaveIcon">${defenseUiIcon("play")}</i><span id="defenseWaveLabel">PLACE FIRST</span></button>
        <div class="defense-moment" id="defenseMoment" role="status" aria-live="assertive" aria-atomic="true" hidden></div>
        <div class="defense-wave-banner" aria-label="Wave and defense phase"><i>${defenseUiIcon("wave")}</i><div class="defense-wave-count"><small>WAVE</small><b id="defenseWave">0</b><em>CLEARED <strong id="defenseClearedWave">0</strong></em></div><span class="defense-phase-indicator" id="defensePhaseIndicator" data-tone="info"><i aria-hidden="true"></i><span><small>PHASE</small><b id="defensePhaseLabel">PLAN</b><em id="defensePhaseDetail">BUILD WINDOW</em></span></span></div>
        <div class="defense-boss-bar defense-boss-overlay" id="defenseBossBar" hidden><span><small>BOSS</small><b id="defenseBossName">UNKNOWN</b></span><i><u id="defenseBossHealth"></u></i><em id="defenseBossPercent">100%</em></div>
        <div class="mini-world defense-world ${map.className} ${contract?"contract-active":""}" id="defenseWorld" data-defense-map="${map.id}" style="--gate-x:${gatePoint.x*100}%;--gate-y:${gatePoint.y*100}%">
          <div class="defense-sky"><i></i><i></i><i></i></div><div class="defense-hills"></div><div class="defense-trees"></div><div class="defense-map-props"><i></i><i></i><i></i></div><div class="defense-world-features">${defenseWorldFeatureMarkup(map)}</div><div class="defense-map-mechanics">${defenseMapMechanicMarkup(map)}</div><div class="defense-map-landmarks">${defenseLandmarkMarkup(map)}</div><div class="defense-build-pockets">${defenseBuildPocketMarkup(map)}</div><div class="defense-weather weather-${map.weather}"><i></i><i></i><i></i></div><div class="defense-obstacles">${defenseObstacleMarkup(map)}</div>
          <svg class="defense-road" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Curved balloon trail"><path class="defense-road-shadow" d="${roadPath}"/><path class="defense-road-border" d="${roadPath}"/><path class="defense-road-fill" d="${roadPath}"/><path class="defense-road-edge-light" d="${roadPath}"/><path class="defense-road-stitch" d="${roadPath}"/></svg><div class="defense-route-markers">${defenseRouteMarkersMarkup(map)}</div><div class="defense-route-scout" id="defenseRouteScout" style="left:${entryX*100}%;top:${entryY*100}%"><i></i></div><div class="defense-entrance" style="--entrance-x:${entryX*100}%;--entrance-y:${entryY*100}%" aria-label="Enemy entrance"><i aria-hidden="true"></i><span><b>ENTRY</b></span></div>
          <div class="defense-gate" aria-label="Ember Gate"><i aria-hidden="true"></i><b>GATE</b><span aria-hidden="true">♥</span></div>
          <div class="defense-gate-flame-live defense-ember-pod-live" id="defenseGateFlameLive" hidden aria-hidden="true"><i></i><i></i><i></i><span></span></div>
          <div class="defense-layer" id="defenseTowers"></div><canvas class="defense-combat-canvas" id="defenseCombatCanvas" aria-hidden="true"></canvas><div class="defense-layer" id="defenseEnemies"></div><div class="defense-layer defense-projectiles" id="defenseProjectiles"></div><div class="defense-layer defense-effects" id="defenseEffects"></div>
          <div class="defense-placement-preview" id="defensePlacementPreview" hidden aria-hidden="true"></div><div class="defense-placement-grid" aria-hidden="true"></div>
          <div class="defense-map-intro" id="defenseMapIntro" aria-label="Entering ${escapeHTML(map.name)}"><i class="defense-intro-vignette"></i><div class="defense-intro-copy"><small>WORLD ${map.level} • OPEN TRAIL</small><b>${escapeHTML(map.name)}</b><span>${escapeHTML(map.routeType)} • ${escapeHTML(map.entrance)} → EMBER GATE</span></div><div class="defense-intro-rizo"><i class="defense-intro-scout-line"></i>${petMarkup({pet:state.pet,extraClass:"defense-intro-pet",context:"arcade",label:state.pet.name})}<strong class="defense-intro-captain">CAPTAIN • ${escapeHTML(state.pet.name)}</strong><i class="defense-intro-look">!</i></div><div class="defense-intro-cta"><b>${escapeHTML(map.mechanic?.icon||"✦")} ${escapeHTML(map.mechanic?.label||"YOUR RIZO LEADS")}</b><span>${escapeHTML(map.mechanic?.copy||"CAPTAIN DEPLOYS FREE • CREW BACKS THEM UP")}</span></div><button type="button" data-defense-skip-map-intro>ENTER FIELD</button></div>
        </div>
      </div>
      <section class="defense-field-feed" aria-live="polite">
        <div class="defense-decision-rail" id="defenseDecisionRail" data-tone="plan"><span><small>YOUR CALL</small><b id="defenseDecisionTitle">PLACE YOUR RIZO</b><em id="defenseDecisionCopy">Tap open grass. Your main Rizo is armed.</em></span><div><button type="button" id="defenseDecisionPrimary" data-defense-flow-primary data-defense-flow-action="place-main">PLACE RIZO</button><button type="button" id="defenseDecisionSecondary" data-defense-flow-secondary data-defense-flow-action="bench">RIZOS</button></div></div>
        <div class="defense-message" id="defenseMessage"><b>DEFEND THE EMBER GATE</b><span>Tap a Rizo, then tap grass. Or drag one directly onto the field. The circle is its reach.</span></div>
        <div class="defense-live-status" id="defenseLiveStatus" hidden><small>WAVE STATUS</small><b id="defenseThreatsLeft">0 THREATS LEFT</b><i><u id="defenseWaveProgress"></u></i></div>

      </section>
      <button type="button" class="defense-context-scrim" data-defense-dismiss-context aria-label="Close open Defense panel" hidden></button><section class="defense-context-dock" aria-live="polite">
        <div class="defense-wave-preview" id="defenseWavePreview"></div>
        <div class="defense-tower-panel" id="defenseTowerPanel" hidden></div>
        <div class="defense-ability-tray" id="defenseAbilityTray" hidden></div>
        <div class="defense-intel-tray" id="defenseIntelTray" hidden></div>
        <div class="defense-field-menu rizo-field-sheet" id="defenseFieldMenu" hidden>
          <div class="defense-field-menu-head"><div class="defense-sheet-title"><span><img src="./assets/rizo-full-mark.png" alt=""/></span><div><small>FIELD MENU</small><b>${escapeHTML(map.name)}</b></div></div><button type="button" data-defense-toggle-field-menu aria-label="Close field menu">${defenseUiIcon("close")}</button></div>
          <div class="defense-field-menu-grid">
            <button type="button" data-defense-trace-route><i>${defenseUiIcon("route")}</i><span><b>TRACE TRAIL</b><small>Show the enemy route.</small></span></button>
            <button type="button" data-defense-toggle-legend><i>${defenseUiIcon("intel")}</i><span><b>FIELD LEGEND</b><small>Explain every symbol.</small></span></button>
            <button type="button" data-defense-toggle-fullscreen><i>${defenseUiIcon("fullscreen")}</i><span><b>FULLSCREEN</b><small>Use the largest field.</small></span></button>
            <button type="button" data-defense-field-guide="rizos"><i>${defenseUiIcon("guide")}</i><span><b>FIELD GUIDE</b><small>Rizos, threats, and worlds.</small></span></button>
            <button type="button" data-defense-auto-start><i>${defenseUiIcon("snap")}</i><span><b id="defenseAutoStartLabel">AUTO WAVES • ${state.settings.defenseAutoStart?"ON":"OFF"}</b><small id="defenseAutoStartCopy">${state.settings.defenseAutoStart?"2.8s planning countdown after clears.":"You decide when each wave begins."}</small></span></button>
            <button type="button" data-arcade-pause><i>${defenseUiIcon("speed")}</i><span><b>PAUSE RUN</b><small>Freeze the trail. Nothing advances until you resume.</small></span></button>
            <button type="button" class="danger" data-defense-bank-leave><i>${defenseUiIcon("bank")}</i><span><b>BANK & LEAVE</b><small>Cleared waves bank. The active wave is excluded.</small></span></button>
          </div>
        </div>
      </section>
      <section class="defense-deploy-dock" aria-label="Rizo deployment bench">
        <div class="defense-placement-coach" id="defensePlacementCoach" aria-live="polite">
          <span class="defense-placement-guide" id="defensePlacementGuide"><span>1</span><b>CHOOSE A RIZO</b></span>
          <span class="defense-deploy-hint" id="defenseDeployHint">Your active Rizo deploys free. Tap a card, then grass.</span>
        </div>
        <div class="defense-roster" id="defenseRoster">${defenseRosterMarkup()}</div>
        <button type="button" class="defense-cancel-placement" data-defense-cancel-placement hidden>CANCEL</button>
      </section>
    </div>`;
    el.miniQuit.textContent="BANK & LEAVE";
    el.miniHint.textContent=contract?`${contract.title} • Clear Wave ${contract.targetWave}. ${contract.rules.map(id=>DEFENSE_CONTRACT_RULES[id].name).join(" • ")}.`:`${map.name} • ${map.strategy}. Build from the bench and defend the Ember Gate.`;
    const renderedWorld=$("#defenseWorld");
    sizeDefenseSquareField();
    d.renderWidth=renderedWorld?.clientWidth||360;
    d.renderHeight=renderedWorld?.clientHeight||520;
    setupDefenseCombatRenderer();
    updateDefenseHud();
    updateDefenseSchoolCoach();
    playDefenseMapIntro();
    /* Pools grow through real use; eager allocation is intentionally avoided on low-memory phones. */
  }

  function defenseRosterSignature(){const d=mini.defense;if(!d)return"";return `${d.towers.length}/${d.maxTowers}|${defenseDeployRows().map(row=>{const copies=d.towers.filter(tower=>tower.petId===row.pet.id).length,cost=defenseDeployCost(row);return `${row.pet.id}:${copies}:${d.cash>=cost?1:0}:${cost}`;}).join("|")}`;}
  function defenseHudCounter(value){
    const amount=Math.max(0,Math.floor(Number(value)||0));
    if(amount>=1_000_000)return `${(amount/1_000_000).toFixed(amount>=10_000_000?0:1).replace(/\.0$/,"")}M`;
    if(amount>=10_000)return `${(amount/1_000).toFixed(amount>=100_000?0:1).replace(/\.0$/,"")}K`;
    return String(amount);
  }
  function updateDefenseRoster(force=true){const host=$("#defenseRoster"),d=mini.defense;if(!host||!d)return;const signature=defenseRosterSignature();if(!force&&signature===d.rosterSignature)return;host.innerHTML=defenseRosterMarkup();d.rosterSignature=signature;d.rosterRenderCount=(d.rosterRenderCount||0)+1;}
  function defenseFlowFieldRead(d=mini.defense,leader=defenseFieldLeader(d)){
    const live=(d?.enemies||[]).filter(enemy=>!enemy.dead&&enemy.hp>0),lead=live.reduce((best,enemy)=>Math.max(best,Number(enemy.progress)||0),0),boss=live.find(enemy=>enemy.bossId)||null,cap=Math.max(1,defenseDensityCap(d,d?.spawnQueue?.[0])),crowded=live.length>=Math.max(5,Math.ceil(cap*.62)),critical=lead>=.88,gatePressure=lead>=.7;
    let targetMode=null;if(boss)targetMode="strong";else if(gatePressure)targetMode="first";
    return{live,lead,boss,crowded,critical,gatePressure,targetMode,pressure:critical?"critical":boss?"boss":gatePressure?"gate":crowded?"crowd":"steady"};
  }
  function defenseFlowTargetCall(leader,read,{fallbackCycle=true}={}){
    const current=leader?.targetMode||"first",recommended=read?.targetMode;
    if(recommended&&recommended!==current)return{label:`AIM ${DEFENSE_TARGET_LABELS[recommended]}`,action:`target:${recommended}`,specific:true};
    const index=Math.max(0,DEFENSE_TARGET_MODES.indexOf(current)),next=DEFENSE_TARGET_MODES[(index+1)%DEFENSE_TARGET_MODES.length];
    return fallbackCycle?{label:`AIM → ${DEFENSE_TARGET_LABELS[next]}`,action:"target",specific:false}:{label:`AIM ${DEFENSE_TARGET_LABELS[current]}`,action:"target",specific:false};
  }
  function defenseFlowChoice(d=mini.defense){
    if(!d)return null;
    const leader=defenseFieldLeader(d),running=defenseIsActiveWave(d),paused=d.phase===DEFENSE_PHASES.PAUSED,nextWave=d.currentWave+1;
    if(!leader)return{tone:"plan",title:"PLACE YOUR RIZO",copy:d.pendingPlacement?"Tap open grass. The ring shows reach.":"Captain deploys free. Pick a bend.",primary:"PLACE RIZO",primaryAction:"place-main",secondary:"RIZOS",secondaryAction:"bench",beatKey:"opening-place"};
    const read=defenseFlowFieldRead(d,leader),target=defenseFlowTargetCall(leader,read),needsDoctrine=leader.upgrade>=2&&!leader.doctrine,cost=leader.upgrade<DEFENSE_LIMITS.MAX_TOWER_LEVEL?defenseUpgradeCost(leader,d):0,canUpgrade=!needsDoctrine&&leader.upgrade<DEFENSE_LIMITS.MAX_TOWER_LEVEL&&defenseUpgradeAllowed(d)&&d.cash>=cost,power=defenseAbilityPresentation(leader),powerReady=Boolean(leader.upgrade>=2&&leader.doctrine&&!defenseContractRule("silent",d)&&DefenseCore.phaseAllows(d.phase,"ability")&&defenseAbilityRemaining(leader)<=0),podReady=Boolean(running&&!paused&&(d.gateFlameUntil||0)<=defenseNow()&&(d.gateFlameReadyAt||0)<=defenseNow()),settling=!running&&d.towers.length&&defenseRealNow(d)<(d.nextWaveReadyAtReal||0),quiet=defenseRealNow(d)<(d.flowActionQuietUntilReal||0),last=d.flowLastAction||"";
    const targetAvailable=!quiet||last!=="target",upgradeAvailable=canUpgrade&&(!quiet||last!=="upgrade"),powerAvailable=powerReady&&(!quiet||last!=="power"),podAvailable=podReady&&(!quiet||last!=="pod"),pressure=read.critical||read.boss||read.gatePressure;
    if(paused)return{tone:"paused",title:"FIELD FROZEN",copy:"Aim and upgrades still work. Resume when your plan is set.",primary:"RESUME",primaryAction:"resume",secondary:target.label,secondaryAction:target.action,beatKey:`paused-${target.action}`};
    if(d.phase===DEFENSE_PHASES.PACKET_BREAK){
      const primary=needsDoctrine?{label:"CHOOSE PATH",action:"inspect"}:upgradeAvailable?{label:`LEVEL UP • ${cost}`,action:"upgrade"}:targetAvailable?target:{label:"RIZOS",action:"bench"};
      const secondary=primary.action!==target.action&&targetAvailable?target:{label:"RIZOS",action:"bench"};
      return{tone:"breather",title:"BREATHER • MAKE ONE CHANGE",copy:defensePlaybackSpeed(d)!==d.speed?"2× eased to 1×. Read the next packet, make one adjustment, then let it run.":"One clean adjustment is enough: level, retarget, or reinforce before pressure returns.",primary:primary.label,primaryAction:primary.action,secondary:secondary.label,secondaryAction:secondary.action,beatKey:`break-${primary.action}-${secondary.action}`};
    }
    if(settling){
      const primary=needsDoctrine?{label:"CHOOSE PATH",action:"inspect"}:upgradeAvailable?{label:`LEVEL UP • ${cost}`,action:"upgrade"}:targetAvailable?target:{label:"RIZOS",action:"bench"};
      return{tone:"breather",title:"FIELD SETTLING • PLAN NOW",copy:"The last pop is landing. Use the half-second for one real adjustment; START returns when the field is clear.",primary:primary.label,primaryAction:primary.action,secondary:"RIZOS",secondaryAction:"bench",beatKey:`settle-${primary.action}`};
    }
    const autoWaiting=!running&&d.phase===DEFENSE_PHASES.WAVE_COMPLETE&&state.settings.defenseAutoStart&&d.flowAutoHeldWave!==d.clearedWave&&d.autoStartAtReal>defenseRealNow(d);
    if(autoWaiting){const seconds=Math.max(0,d.autoStartAtReal-defenseRealNow(d));return{tone:"plan",title:`AUTO COMMIT • ${seconds.toFixed(1)}S`,copy:"Keep the run moving, send early, or hold this one boundary without disabling Auto Waves.",primary:"SEND NOW",primaryAction:"start",secondary:"HOLD FIELD",secondaryAction:"hold-auto",beatKey:"auto-boundary"};}
    if(!running){
      const held=state.settings.defenseAutoStart&&d.phase===DEFENSE_PHASES.WAVE_COMPLETE&&d.flowAutoHeldWave===d.clearedWave,title=held?`FIELD HELD • WAVE ${nextWave}`:`SPEND OR SEND? • WAVE ${nextWave}`;
      const copy=held?"Auto Waves stays on. This boundary is yours until you call the next wave.":needsDoctrine?`${leader.pet.name} has a fighting path ready. Choose it now or send the next wave.`:canUpgrade?`${leader.pet.name} can level now, or keep ${Math.floor(d.cash)} gold for another answer.`:"Build, aim, or call the next wave when the field looks right.";
      return{tone:"plan",title,copy,primary:`START WAVE ${nextWave}`,primaryAction:"start",secondary:needsDoctrine?"CHOOSE PATH":canUpgrade?`LEVEL • ${cost}`:"RIZOS",secondaryAction:needsDoctrine?"inspect":canUpgrade?"upgrade":"bench",beatKey:`plan-${held?"held":"manual"}-${needsDoctrine?"path":canUpgrade?"upgrade":"bench"}`};
    }
    if(needsDoctrine)return{tone:"combat",title:"FIGHTING PATH READY",copy:`${leader.pet.name} can commit to POWER or CONTROL. Pick when the field gives you room.`,primary:"CHOOSE PATH",primaryAction:"inspect",secondary:target.label,secondaryAction:target.action,beatKey:`doctrine-${target.action}`};
    if(pressure&&powerAvailable)return{tone:"power",title:read.boss?`${power.active} • BOSS WINDOW`:read.critical?"GATE LINE BREAKING":`${power.active} • PRESSURE WINDOW`,copy:read.boss?`${leader.pet.name}'s Field Power is ready while the boss owns the road.`:`Pressure reached the late trail. Commit ${power.active} now or change what ${leader.pet.name} is hunting.`,primary:`USE ${power.active}`,primaryAction:"power",secondary:target.label,secondaryAction:target.action,beatKey:`pressure-power-${read.pressure}-${target.action}`};
    if(pressure&&podAvailable)return{tone:"power",title:read.critical?"GATE LINE BREAKING":"EMBER POD WINDOW",copy:"The road is carrying real pressure. Commit the Pod here or retarget the Field Leader.",primary:"PLACE POD",primaryAction:"pod",secondary:target.label,secondaryAction:target.action,beatKey:`pressure-pod-${read.pressure}-${target.action}`};
    if(read.targetMode&&leader.targetMode!==read.targetMode&&targetAvailable)return{tone:"combat",title:read.boss?"BOSS READ • CHANGE THE HUNT":"GATE READ • CHANGE THE HUNT",copy:read.boss?"A boss is on the field. The rail can set the Field Leader directly to the toughest target.":"A threat crossed the late trail. Put the Field Leader back on the front instead of cycling blindly.",primary:target.label,primaryAction:target.action,secondary:powerReady?`${power.active} READY`:podReady?"POD READY":"RIZOS",secondaryAction:powerReady?"power":podReady?"pod":"bench",beatKey:`read-${read.pressure}-${target.action}`};
    if(upgradeAvailable)return{tone:"combat",title:"CASH WINDOW • INVEST OR HOLD",copy:`${cost} gold can become a level right now. Spend it mid-fight, or keep the reserve for the next answer.`,primary:`LEVEL UP • ${cost}`,primaryAction:"upgrade",secondary:powerReady?`${power.active} READY`:podReady?"POD READY":target.label,secondaryAction:powerReady?"power":podReady?"pod":target.action,beatKey:`cash-${powerReady?"power":podReady?"pod":target.action}`};
    if(powerReady)return{tone:"combat",title:`${power.active} BANKED`,copy:"The Field Power is ready, but the Gate is not under real pressure. Keep it banked or cash it in on your terms.",primary:targetAvailable?target.label:"RIZOS",primaryAction:targetAvailable?target.action:"bench",secondary:`USE ${power.active}`,secondaryAction:"power",beatKey:`banked-power-${target.action}`};
    if(podReady)return{tone:"combat",title:"EMBER POD BANKED",copy:"The Pod is ready. Keep watching the road, or place it before the next pressure spike.",primary:targetAvailable?target.label:"RIZOS",primaryAction:targetAvailable?target.action:"bench",secondary:"PLACE POD",secondaryAction:"pod",beatKey:`banked-pod-${target.action}`};
    if(quiet)return{tone:"combat",title:"CALL MADE • LET IT WORK",copy:"You changed the field. Give the formation a moment before making another adjustment.",primary:"RIZOS",primaryAction:"bench",secondary:"THREATS",secondaryAction:"intel",beatKey:`quiet-${last}`};
    return{tone:"combat",title:read.crowded?"ROAD IS FULL • WATCH THE BREAK":"FIELD IS WORKING",copy:read.crowded?"The road is busy, but not yet at the Gate. Read the next break instead of chasing every balloon.":"No forced tap. Retarget when the formation changes, reinforce when cash opens a window, and bank power for pressure.",primary:target.label,primaryAction:target.action,secondary:"RIZOS",secondaryAction:"bench",beatKey:`steady-${read.crowded?"crowd":"calm"}-${target.action}`};
  }
  function updateDefenseDecisionRail(){
    const d=mini.defense,host=$("#defenseDecisionRail"),title=$("#defenseDecisionTitle"),copy=$("#defenseDecisionCopy"),primary=$("#defenseDecisionPrimary"),secondary=$("#defenseDecisionSecondary");if(!d||!host||!primary||!secondary)return;
    const choice=defenseFlowChoice(d);if(!choice)return;const nowReal=defenseRealNow(d),choiceKey=choice.beatKey||`${choice.tone}|${choice.primaryAction}|${choice.secondaryAction}`,renderKey=`${choice.tone}|${choice.title}|${choice.copy}|${choice.primary}|${choice.primaryAction}|${choice.secondary}|${choice.secondaryAction}`;if(d.flowChoiceKey&&choiceKey!==d.flowChoiceKey&&nowReal>=(d.flowActionQuietUntilReal||0))d.flowPulseUntilReal=Math.max(d.flowPulseUntilReal||0,nowReal+.72);d.flowChoiceKey=choiceKey;host.dataset.tone=choice.tone||"plan";host.classList.toggle("pulse",nowReal<(d.flowPulseUntilReal||0));if(host.dataset.flowRenderKey!==renderKey){host.dataset.flowRenderKey=renderKey;if(title)title.textContent=choice.title;if(copy)copy.textContent=choice.copy;primary.textContent=choice.primary;primary.dataset.defenseFlowAction=choice.primaryAction;primary.disabled=false;secondary.textContent=choice.secondary;secondary.dataset.defenseFlowAction=choice.secondaryAction;secondary.disabled=false;}
  }
  function defenseRecordFlowAction(action,acted=true){
    const d=mini.defense;if(!d||!acted)return acted;const family=String(action||"").split(":")[0];if(!["start","resume","hold-auto","inspect","bench","intel"].includes(family)){d.flowLastAction=family;d.flowActionQuietUntilReal=defenseRealNow(d)+1.35;}d.flowDecisionBeat=(d.flowDecisionBeat||0)+1;d.flowChoiceKey="";d.uiDirty=true;flushDefenseUi(true);return acted;
  }
  function runDefenseFlowAction(action){
    const d=mini.defense;if(!d)return false;const leader=defenseFieldLeader(d);
    if(action==="place-main"){const row=defenseRoster().find(item=>item.source==="active")||defenseRoster()[0];if(!row)return false;if(d.pendingPlacement?.row?.pet?.id===row.pet.id){setDefenseMessage(`PLACE ${row.pet.name}`,"Tap open grass. Green means the full footprint is safe.");return true;}return selectDefenseRosterPet(row);}
    if(action==="bench"){toggleDefenseBench(true);return true;}
    if(action==="intel"){toggleDefenseIntel(true);return true;}
    if(action==="start")return startDefenseWave();
    if(action==="resume"){toggleDefensePause(false);return true;}
    if(action==="hold-auto"){d.flowAutoHeldWave=d.clearedWave;d.autoStartAtReal=0;d.flowChoiceKey="";d.uiDirty=true;flushDefenseUi(true);setDefenseMessage("FIELD HELD","Auto Waves stays on. This boundary waits for your call; the next clear returns to auto tempo.");sfx("ui");return true;}
    if(action.startsWith("target:")&&leader){const mode=action.split(":")[1];if(DEFENSE_TARGET_MODES.includes(mode)){leader.targetMode=mode;leader.targetId=null;leader.retargetAtReal=0;completeDefenseSchoolLesson("targeting");markDefenseUi();writeDefenseCheckpoint(true,"targeting");setDefenseMessage(`${leader.pet.name.toUpperCase()} • ${DEFENSE_TARGET_LABELS[mode]}`,mode==="strong"?"Field Leader is hunting the toughest threat.":mode==="first"?"Field Leader is back on the front balloon.":"Target priority changed.");sfx("ui");return defenseRecordFlowAction("target",true);}}
    if(action==="target"&&leader)return defenseRecordFlowAction("target",(cycleDefenseTarget(leader.id,{showPanel:false}),true));
    if(action==="upgrade"&&leader)return defenseRecordFlowAction("upgrade",upgradeDefenseTower(leader.id,{showPanel:false}));
    if(action==="inspect"&&leader){showDefenseTowerPanel(leader);return true;}
    if(action==="power"&&leader)return defenseRecordFlowAction("power",activateDefenseAbility(leader.id,{showPanel:false}));
    if(action==="pod")return defenseRecordFlowAction("pod",(toggleDefenseGateFlame(),true));
    return false;
  }
  function updateDefenseHud(){
    if(!mini.active||mini.mode!=="defense"||!mini.defense)return;
    const d=mini.defense;d.hudRenderCount=(d.hudRenderCount||0)+1;
    const phaseShell=$(".defense-shell");if(phaseShell){phaseShell.dataset.defensePhase=d.phase;phaseShell.dataset.currentWave=String(d.currentWave);phaseShell.dataset.clearedWave=String(d.clearedWave);phaseShell.dataset.fieldDensity=d.towers.length>=7?"crowded":d.towers.length>=4?"busy":"open";phaseShell.dataset.performanceTier=String(d.governorTier||0);}
    const wave=$("#defenseWave"),clearedWave=$("#defenseClearedWave"),phaseIndicator=$("#defensePhaseIndicator"),phaseLabel=$("#defensePhaseLabel"),phaseDetail=$("#defensePhaseDetail"),lives=$("#defenseLives"),cash=$("#defenseCash"),cashDelta=$("#defenseCashDelta"),speed=$("[data-defense-speed]"),speedValue=$("#defenseSpeedValue"),guide=$("#defensePlacementGuide"),deployHint=$("#defenseDeployHint"),cancel=$("[data-defense-cancel-placement]"),world=$("#defenseWorld"),shell=$(".defense-shell"),flameButton=$("#defenseGateFlameButton"),flameState=$("#defenseGateFlameState"),flameLive=$("#defenseGateFlameLive");
    if(wave)wave.textContent=d.currentWave;
    if(clearedWave)clearedWave.textContent=d.clearedWave;
    const phaseUi=defensePhaseUi(d),performanceNote=(d.governorTier||0)>=2?" • LOW FX":(d.governorTier||0)>=1?" • FX LEAN":"";if(phaseIndicator){phaseIndicator.hidden=false;phaseIndicator.dataset.tone=d.paused?"paused":phaseUi.tone;}if(phaseLabel)phaseLabel.textContent=d.paused?"PAUSED":phaseUi.label;if(phaseDetail)phaseDetail.textContent=d.paused?"TAP RESUME":`${phaseUi.detail}${performanceNote}`;
    if(lives){const prior=d.lastHudLives;lives.textContent=d.lives;if(prior!==null&&prior!==d.lives){const art=$("#defenseLivesArt");art?.classList.remove("hud-hit","hud-heal");void art?.offsetWidth;art?.classList.add(d.lives<prior?"hud-hit":"hud-heal");}d.lastHudLives=d.lives;}
    if(cash){const exact=Math.floor(d.cash),prior=d.lastHudCash;cash.textContent=defenseHudCounter(exact);cash.title=exact.toLocaleString();cash.closest(".defense-stat-cash")?.setAttribute("aria-label",`${exact.toLocaleString()} gold`);if(prior!==null&&prior!==exact){const art=$("#defenseCashArt"),delta=exact-prior;art?.classList.remove("hud-gain","hud-spend");void art?.offsetWidth;art?.classList.add(delta>0?"hud-gain":"hud-spend");if(cashDelta&&(delta<0||delta>=5)){cashDelta.textContent=`${delta>0?"+":"−"}${defenseHudCounter(Math.abs(delta))}`;cashDelta.classList.remove("show","gain","spend");void cashDelta.offsetWidth;cashDelta.classList.add("show",delta>0?"gain":"spend");}}d.lastHudCash=exact;}
    if(speedValue){const playback=defensePlaybackSpeed(d);speedValue.textContent=playback===.5?"½×":`${playback}×`;speedValue.title=playback!==d.speed?"2× resumes after this breather":"";}
    if(speed)speed.disabled=false;
    if(flameButton){const nowGame=defenseNow(),remaining=Math.max(0,(d.gateFlameReadyAt||0)-nowGame),active=(d.gateFlameUntil||0)>nowGame,ready=remaining<=0&&!active,canPlace=defenseIsActiveWave(d)&&!d.paused;flameButton.classList.toggle("armed",Boolean(d.gateFlameArmed));flameButton.classList.toggle("active",active);flameButton.classList.toggle("cooling",!active&&remaining>0);flameButton.disabled=!canPlace&&!active;flameButton.setAttribute("aria-pressed",String(Boolean(d.gateFlameArmed)));flameButton.setAttribute("aria-label",active?"Ember Pod active":!canPlace?"Ember Pod is available during a live wave":ready?"Place Ember Pod on the trail":`Ember Pod ready in ${Math.ceil(remaining)} seconds`);if(flameState)flameState.textContent=active?`${Math.max(1,Math.ceil(d.gateFlameUntil-nowGame))}S`:d.gateFlameArmed?"TAP ROAD":!canPlace?"WAVE ONLY":ready?"READY":`${Math.ceil(remaining)}S`;}
    if(flameLive){const active=(d.gateFlameUntil||0)>defenseNow();flameLive.hidden=!active;flameLive.style.left=`${defensePointAt(d.gateFlameProgress||0).x*100}%`;flameLive.style.top=`${defensePointAt(d.gateFlameProgress||0).y*100}%`;flameLive.classList.toggle("low-fx",(d.governorTier||0)>0);}
    const leaderButton=$("#defenseAbilitiesButton"),leaderCount=$("#defenseAbilityCount"),leaderLabel=$("#defenseLeaderPowerLabel");
    if(leaderButton){
      const sealed=defenseContractRule("silent",d),groups=defenseAbilityGroups(),casting=DefenseCore.phaseAllows(d.phase,"ability"),readyGroups=sealed?0:groups.filter(group=>casting&&group.ready.length>0).length,nextRemaining=Math.min(...groups.map(group=>group.nextRemaining).filter(Number.isFinite),Infinity),priorReady=Number.isFinite(d.lastReadyAbilityGroups)?d.lastReadyAbilityGroups:readyGroups,readyArrival=readyGroups>priorReady&&defenseIsActiveWave(d)&&!d.paused;
      leaderButton.disabled=false;leaderButton.classList.toggle("ready",readyGroups>0);leaderButton.classList.toggle("empty",groups.length===0);leaderButton.classList.toggle("sealed",sealed);leaderButton.setAttribute("aria-expanded",String(Boolean(d.abilityTrayOpen)));leaderButton.setAttribute("aria-label",sealed?"Open Rizo powers; activated effects are sealed by this contract":readyGroups?`Open Rizo powers, ${readyGroups} ready`:groups.length?`Open Rizo powers, next ready ${Number.isFinite(nextRemaining)?Math.ceil(nextRemaining):0} seconds`:"Open Rizo powers; level a Rizo to Level 3 and choose a path to unlock them");
      if(leaderLabel)leaderLabel.textContent="POWERS";if(leaderCount)leaderCount.textContent=sealed?"×":readyGroups?String(readyGroups):groups.length&&Number.isFinite(nextRemaining)?`${Math.ceil(nextRemaining)}s`:groups.length?"WAIT":"LV3";
      if(readyArrival){leaderButton.classList.remove("ready-arrival");void leaderButton.offsetWidth;leaderButton.classList.add("ready-arrival");queueMiniTimeout(()=>leaderButton?.classList.remove("ready-arrival"),760);}
      d.lastReadyAbilityGroups=readyGroups;
    }
    const autoLabel=$("#defenseAutoStartLabel"),autoCopy=$("#defenseAutoStartCopy");if(autoLabel)autoLabel.textContent=`AUTO WAVES • ${state.settings.defenseAutoStart?"ON":"OFF"}`;if(autoCopy)autoCopy.textContent=state.settings.defenseAutoStart?"2.8s planning countdown after clears.":"You decide when each wave begins.";
    world?.classList.toggle("defense-paused",d.paused);
    world?.style.setProperty("--wave-darkness",String(Math.min(.18,d.wave*.0075)));
    shell?.style.setProperty("--wave-darkness",String(Math.min(.18,d.wave*.0075)));
    world?.classList.toggle("hud-danger",d.lives<=Math.max(5,Math.ceil(d.map.lives*.35)));
    shell?.classList.toggle("has-placement",Boolean(d.pendingPlacement));
    shell?.classList.toggle("has-towers",d.towers.length>0);
    shell?.classList.toggle("wave-running",defenseIsActiveWave(d));
    syncDefenseOverlayState();
    el.miniTimer.textContent=`WORLD ${d.map.level}`;
    el.miniScore.textContent=`${d.kills} POPS`;
    const button=$("#defenseWaveButton");
    if(button){
      const hasTower=d.towers.length>0,running=defenseIsActiveWave(d),waveLabel=$("#defenseWaveLabel"),waveIcon=$("#defenseWaveIcon");
      button.classList.toggle("paused",running&&d.paused);
      button.classList.toggle("running",running&&!d.paused);
      if(!running){
        const settling=hasTower&&defenseRealNow(d)<(d.nextWaveReadyAtReal||0);button.disabled=!hasTower||settling;
        if(waveIcon)setDefenseWaveIcon(waveIcon,"play");
        const autoWaiting=hasTower&&!settling&&d.phase===DEFENSE_PHASES.WAVE_COMPLETE&&state.settings.defenseAutoStart&&d.autoStartAtReal>defenseRealNow(d),autoSeconds=autoWaiting?Math.max(0,d.autoStartAtReal-defenseRealNow(d)):0;
        if(waveLabel)waveLabel.textContent=!hasTower?"PLACE FIRST":settling?"FIELD CLEAR…":autoWaiting?`AUTO ${autoSeconds.toFixed(1)}S`:d.wave?`START WAVE ${d.wave+1}`:"START WAVE 1";
        button.setAttribute("aria-label",!hasTower?"Place a Rizo first":settling?"Field settling after wave clear":autoWaiting?`Next wave auto-starts in ${autoSeconds.toFixed(1)} seconds; tap to start now`:d.wave?`Start Wave ${d.wave+1}`:"Start Wave 1");
      }else{
        button.disabled=false;
        if(waveIcon)setDefenseWaveIcon(waveIcon,d.paused?"play":"pause");
        if(waveLabel)waveLabel.textContent=d.paused?"RESUME":"PAUSE";
        button.setAttribute("aria-label",d.paused?"Resume Defense":"Pause Defense");
      }
      if(d.ending||d.phase===DEFENSE_PHASES.RUN_COMPLETE){button.disabled=true;if(waveLabel)waveLabel.textContent=d.lives<=0?"GATE DOWN":"RUN BANKED";}
      button.hidden=false;
    }
    const coach=$("#defensePlacementCoach");
    if(coach)coach.hidden=Boolean(d.towers.length&&!d.pendingPlacement);
    if(guide){
      guide.hidden=Boolean(d.towers.length&&!d.pendingPlacement);
      const step=guide.querySelector("span"),title=guide.querySelector("b");
      if(step)step.textContent=d.pendingPlacement?"2":d.towers.length?"✓":"1";
      if(title)title.textContent=d.pendingPlacement?`PLACE ${d.pendingPlacement.row.pet.name}`:defenseIsActiveWave(d)?"FIELD IS LIVE":d.towers.length?"BUILD OR BEGIN":"CHOOSE A DEFENDER";
    }
    if(deployHint){
      const remaining=d.spawnQueue.length+d.enemies.filter(enemy=>!enemy.dead).length;
      deployHint.textContent=d.pendingPlacement?"Any open grass works. Cover two bends or guard the late exit.":defenseIsActiveWave(d)?`${remaining} ${remaining===1?"threat":"threats"} remain. Reinforcements, upgrades and targeting are live.`:d.towers.length?`Upgrade, target, or start Wave ${d.wave+1}.`:"Your active Rizo deploys free. Basic Defense Rizo is the cheap universal tool.";
    }
    if(cancel)cancel.hidden=!d.pendingPlacement;
    const benchCount=$("#defenseBenchCount");if(benchCount)benchCount.textContent=String(defenseDeployRows().length);
    updateDefenseAbilityPanel();
    updateDefenseAbilityTray();
    updateDefenseIntelTray();
    updateDefenseWavePreview();
    updateDefenseLiveStatus();
    updateDefenseDecisionRail();
    updateDefenseSchoolCoach();
    d.uiDirty=false;
  }

  function markDefenseUi({roster=false}={}){const d=mini.defense;if(!d)return;d.uiDirty=true;d.checkpointDirty=true;if(roster)d.rosterDirty=true;}
  function flushDefenseUi(force=false){const d=mini.defense;if(!d)return;if(d.rosterDirty){updateDefenseRoster(false);d.rosterDirty=false;}if(force||d.uiDirty||d.abilityTrayOpen||d.selectedTowerId)updateDefenseHud();else{updateDefenseLiveStatus();updateDefenseDecisionRail();}}

  function defenseAbilityId(tower){return tower?.pet?.variant||tower?.pet?.hiddenVariant||"classic";}
  function defenseReadyAbilities(){
    const d=mini.defense;if(!d)return[];
    return d.towers.filter(tower=>defenseIsCharacterTower(tower)&&tower.upgrade>=2&&tower.doctrine).map(tower=>({tower,abilityId:defenseAbilityId(tower),ability:defenseAbilityData(tower),remaining:Math.ceil(defenseAbilityRemaining(tower))}));
  }
  function defenseAbilityGroups(){
    const groups=new Map();
    for(const row of defenseReadyAbilities()){
      if(!groups.has(row.abilityId))groups.set(row.abilityId,{id:row.abilityId,ability:row.ability,instances:[]});
      groups.get(row.abilityId).instances.push(row);
    }
    return [...groups.values()].map(group=>{
      group.instances.sort((a,b)=>a.remaining-b.remaining||b.tower.upgrade-a.tower.upgrade||(a.tower.copyNumber||1)-(b.tower.copyNumber||1));
      group.ready=group.instances.filter(row=>row.remaining<=0);
      group.nextRemaining=Math.min(...group.instances.filter(row=>row.remaining>0).map(row=>row.remaining),Infinity);
      return group;
    });
  }
  function defenseTowerFieldLabel(tower){
    const vertical=tower.y<.34?"TOP":tower.y>.66?"BOTTOM":"MID",horizontal=tower.x<.34?"LEFT":tower.x>.66?"RIGHT":"CENTER";
    return `${vertical} ${horizontal}`;
  }
  function defenseAbilityGroupStatus(group,d){
    if(d.paused)return"RESUME TO CAST";
    if(!defenseIsActiveWave(d))return"START A WAVE";
    if(group.ready.length===1)return group.instances.length===1?"READY":"1 READY";
    if(group.ready.length>1)return`${group.ready.length} READY • PICK ONE`;
    return Number.isFinite(group.nextRemaining)?`${group.nextRemaining}s COOLDOWN`:"COOLDOWN";
  }
  function defenseAbilityStackMarkup(group){
    const shown=group.instances.slice(0,3).map(({tower})=>`<i>${petMarkup({pet:tower.pet,extraClass:"defense-ability-rizo",context:"thumbnail",label:tower.pet.name})}</i>`).join("");
    return `<span class="defense-ability-stack">${shown}${group.instances.length>3?`<u>+${group.instances.length-3}</u>`:""}</span>`;
  }
  function defenseAbilityChargeMarkup(group){
    const next=group.instances.find(row=>row.remaining>0),cooldown=next?Math.max(1,defenseAbilityCooldown(next.tower)):1,charge=next?clamp(1-next.remaining/cooldown,0,1):1,shown=group.instances.slice(0,6),pips=shown.map(row=>`<i class="${row.remaining<=0?"charged":"charging"}"></i>`).join("");
    return `<span class="defense-ability-charge" style="--ability-charge:${Math.round(charge*100)}%" aria-hidden="true"><span class="defense-ability-charge-pips">${pips}${group.instances.length>shown.length?`<u>+${group.instances.length-shown.length}</u>`:""}</span><span class="defense-ability-charge-rail"><i></i></span></span>`;
  }
  function defenseAbilityPickerMarkup(group,d){
    return `<div class="defense-ability-picker" role="group" aria-label="Choose which ${escapeHTML(group.ability.active)} to cast">${group.instances.map(({tower,remaining})=>{const ready=remaining<=0&&DefenseCore.phaseAllows(d.phase,"ability");return`<button type="button" class="${ready?"ready":"cooling"}" data-defense-cast="${tower.id}" ${ready?"":"disabled"}><span>${defenseTowerFieldLabel(tower)}</span><b>LV ${tower.upgrade+1}${tower.copyNumber>1?` • COPY ${tower.copyNumber}`:""}</b><em>${ready?"CAST":remaining?`${remaining}s`:d.paused?"PAUSED":"WAIT"}</em></button>`;}).join("")}</div>`;
  }
  function activateDefenseAbilityGroup(abilityId){
    const d=mini.defense;if(!d)return false;const group=defenseAbilityGroups().find(item=>item.id===abilityId),ready=group?.ready.filter(row=>DefenseCore.phaseAllows(d.phase,"ability"))||[];
    if(!group||!ready.length)return false;
    if(ready.length===1){d.abilityGroupOpen=null;return activateDefenseAbility(ready[0].tower.id,{keepAbilityTray:true});}
    d.abilityGroupOpen=d.abilityGroupOpen===abilityId?null:abilityId;markDefenseUi();flushDefenseUi(true);return true;
  }
  function updateDefenseAbilityTray(){
    const d=mini.defense,button=$("#defenseAbilitiesButton"),count=$("#defenseAbilityCount"),tray=$("#defenseAbilityTray");if(!d||!button||!tray)return;
    const sealed=defenseContractRule("silent",d),groups=defenseAbilityGroups(),casting=DefenseCore.phaseAllows(d.phase,"ability"),readyGroups=sealed?0:groups.filter(group=>casting&&group.ready.length>0).length,nextRemaining=Math.min(...groups.map(group=>group.nextRemaining).filter(Number.isFinite),Infinity),scroll=tray.scrollTop;
    if(d.abilityGroupOpen&&!groups.some(group=>group.id===d.abilityGroupOpen&&casting&&group.ready.length>1))d.abilityGroupOpen=null;
    if(count)count.textContent=sealed?"×":readyGroups?String(readyGroups):groups.length&&Number.isFinite(nextRemaining)?`${Math.ceil(nextRemaining)}s`:groups.length?"WAIT":"LV3";
    button.classList.toggle("ready",readyGroups>0);button.classList.toggle("empty",groups.length===0);button.classList.toggle("paused",d.paused);button.classList.toggle("sealed",sealed);button.setAttribute("aria-expanded",String(Boolean(d.abilityTrayOpen)));
    tray.hidden=!d.abilityTrayOpen;
    if(!d.abilityTrayOpen){d.abilityTraySignature="";d.abilityGroupOpen=null;return;}
    const cards=groups.map(group=>{const expanded=d.abilityGroupOpen===group.id,canCast=casting&&group.ready.length>0,subline=group.instances.length===1?`${group.instances[0].tower.pet.name} • LV ${group.instances[0].tower.upgrade+1}`:`${group.instances.length} RIZOS • ${group.ready.length} CHARGED`,action=group.ready.length>1?(expanded?"−":"+"):"›";return`<article class="defense-ability-group ${canCast?"ready":""} ${expanded?"expanded":""}" data-ability-group="${escapeHTML(group.id)}"><button type="button" class="defense-ability-card" data-defense-cast-group="${escapeHTML(group.id)}" aria-expanded="${expanded}" ${canCast?"":"disabled"}>${defenseAbilityStackMarkup(group)}<span class="defense-ability-copy"><small>${escapeHTML(subline)}</small><b>${escapeHTML(group.ability.active)}</b><em>${escapeHTML(defenseAbilityGroupStatus(group,d))}</em></span>${defenseAbilityChargeMarkup(group)}<i class="defense-ability-action" aria-hidden="true">${action}</i></button>${expanded?defenseAbilityPickerMarkup(group,d):""}</article>`;}).join("");
    const markup=sealed?`<div class="defense-ability-tray-head"><div class="defense-sheet-title"><span>${defenseUiIcon("power")}</span><div><small>TRAIL CONTRACT</small><b>ACTIVATED EFFECTS SEALED</b></div></div><button type="button" data-defense-toggle-abilities>${defenseUiIcon("close")}</button></div><div class="defense-ability-list"><p>Every Rizo keeps its passive identity. Manual abilities are unavailable for this run.</p></div>`:`<div class="defense-ability-tray-head"><div class="defense-sheet-title"><span>${defenseUiIcon("power")}</span><div><small>GROUPED POWERS</small><b>${d.paused?"PAUSED • RESUME TO CAST":`${readyGroups} READY • ${groups.length} ${groups.length===1?"POWER":"POWERS"}`}</b></div></div><button type="button" data-defense-toggle-abilities>${defenseUiIcon("close")}</button></div><div class="defense-ability-list">${groups.length?cards:`<p>Reach Level 3 and choose a path to unlock activated effects.</p>`}</div>`,signature=`${sealed}|${d.paused}|${d.phase}|${d.abilityGroupOpen||""}|${groups.map(group=>`${group.id}[${group.instances.map(row=>`${row.tower.id}:${row.tower.upgrade}:${row.tower.doctrine}:${row.tower.targetMode}:${row.remaining}`).join(",")}]`).join("|")}`;
    if(signature!==d.abilityTraySignature){d.trayRenderCount=(d.trayRenderCount||0)+1;tray.innerHTML=markup;d.abilityTraySignature=signature;tray.scrollTop=scroll;}
  }
  const DEFENSE_CONTEXT_SELECTORS=Object.freeze({menu:"#defenseFieldMenu",abilities:"#defenseAbilityTray",intel:"#defenseIntelTray",tower:"#defenseTowerPanel"});
  function defenseContextSurface(d=mini.defense){if(!d)return null;if(d.fieldMenuOpen)return"menu";if(d.abilityTrayOpen)return"abilities";if(d.intelOpen)return"intel";if(d.selectedTowerId)return"tower";return null;}
  function defenseContextElement(name){return name?$(DEFENSE_CONTEXT_SELECTORS[name]||""):null;}
  function defenseSetBackgroundInert(active){
    const shell=$(".defense-shell");if(!shell)return;for(const selector of[".defense-command-deck",".defense-stage-frame",".defense-field-feed",".defense-deploy-dock",".defense-school-coach"]){const node=shell.querySelector(selector);if(!node)continue;node.inert=Boolean(active);if(active)node.setAttribute("aria-hidden","true");else node.removeAttribute("aria-hidden");}
  }
  function defenseFocusContext(name){const host=defenseContextElement(name);if(!host||host.hidden)return;const target=host.querySelector('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');(target||host).focus?.({preventScroll:true});}
  function defenseClearTowerSelection(){const panel=$("#defenseTowerPanel");if(panel)panel.hidden=true;if(mini.defense)mini.defense.selectedTowerId=null;mini.defense?.towers.forEach(t=>{t.node?.classList.remove("selected");t.node?.setAttribute("aria-pressed","false");});}
  function defenseCloseContextSurfaces(except="",{sync=false}={}){
    const d=mini.defense;if(!d)return;for(const name of["menu","abilities","intel","tower"]){if(name===except)continue;if(name==="menu")d.fieldMenuOpen=false;else if(name==="abilities"){d.abilityTrayOpen=false;d.abilityGroupOpen=null;}else if(name==="intel"){d.intelOpen=false;d.intelPausedByOpen=false;}else defenseClearTowerSelection();}if(sync)syncDefenseOverlayState();
  }
  function defenseDismissContextSurface({restoreFocus=true}={}){
    const d=mini.defense;if(!d)return false;const active=defenseContextSurface(d);if(!active)return false;defenseCloseContextSurfaces("",{sync:false});syncDefenseOverlayState({restoreFocus});markDefenseUi();flushDefenseUi(true);return true;
  }
  function syncDefenseOverlayState({restoreFocus=true}={}){
    const d=mini.defense,shell=$(".defense-shell"),bench=$("#defenseBenchButton"),menuButton=$("#defenseMenuButton"),menu=$("#defenseFieldMenu"),scrim=$(".defense-context-scrim");if(!d)return;
    // Last-open wins. If legacy booleans somehow disagree, normalize immediately.
    let active=defenseContextSurface(d),openCount=[d.fieldMenuOpen,d.abilityTrayOpen,d.intelOpen,Boolean(d.selectedTowerId)].filter(Boolean).length;
    if(openCount>1&&active){defenseCloseContextSurfaces(active,{sync:false});active=defenseContextSurface(d);}
    const prior=d.contextSurface||null;
    if(active&&prior!==active&&!d.contextReturnFocus?.isConnected)d.contextReturnFocus=document.activeElement;
    d.contextSurface=active;
    shell?.classList.toggle("bench-open",Boolean(d.benchOpen));shell?.classList.toggle("bench-collapsed",!d.benchOpen);shell?.classList.toggle("field-menu-open",Boolean(d.fieldMenuOpen));shell?.classList.toggle("context-open",Boolean(active));if(shell)shell.dataset.contextSurface=active||"none";
    if(bench){bench.classList.toggle("active",Boolean(d.benchOpen));bench.setAttribute("aria-expanded",String(Boolean(d.benchOpen)));}
    if(menuButton){menuButton.classList.toggle("active",Boolean(d.fieldMenuOpen));menuButton.setAttribute("aria-expanded",String(Boolean(d.fieldMenuOpen)));}
    if(menu)menu.hidden=!d.fieldMenuOpen;if(scrim)scrim.hidden=!active;defenseSetBackgroundInert(Boolean(active));
    if(active&&prior!==active)requestAnimationFrame(()=>defenseFocusContext(active));
    if(!active&&prior&&restoreFocus){const target=d.contextReturnFocus;d.contextReturnFocus=null;if(target?.isConnected)requestAnimationFrame(()=>target.focus?.({preventScroll:true}));}
  }
  function defenseHandleContextKeydown(event){
    const d=mini.defense,active=defenseContextSurface(d);if(!d||!active)return false;
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();defenseDismissContextSurface();return true;}
    if(event.key!=="Tab")return false;const host=defenseContextElement(active);if(!host)return false;const focusable=[...host.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hidden&&getComputedStyle(node).display!=="none");if(!focusable.length){event.preventDefault();host.focus?.();return true;}const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();return true;}if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();return true;}return false;
  }
  function toggleDefenseBench(force){
    const d=mini.defense;if(!d)return;d.benchOpen=typeof force==="boolean"?force:!d.benchOpen;if(d.pendingPlacement)d.benchOpen=true;syncDefenseOverlayState();markDefenseUi();flushDefenseUi(true);scheduleDefenseTowerGeometrySync();
  }
  function toggleDefenseFieldMenu(force){const d=mini.defense;if(!d)return;const opening=typeof force==="boolean"?force:!d.fieldMenuOpen;if(opening){clearDefensePlacementMode();defenseCloseContextSurfaces("menu",{sync:false});}d.fieldMenuOpen=opening;syncDefenseOverlayState();markDefenseUi();flushDefenseUi(true);}
  function toggleDefenseAbilityTray(force){const d=mini.defense;if(!d)return;const opening=typeof force==="boolean"?force:!d.abilityTrayOpen;if(opening){clearDefensePlacementMode();defenseCloseContextSurfaces("abilities",{sync:false});}d.abilityTrayOpen=opening;if(!opening)d.abilityGroupOpen=null;syncDefenseOverlayState();markDefenseUi();flushDefenseUi(true);}
  function toggleDefenseIntel(force){
    const d=mini.defense;if(!d)return;const opening=typeof force==="boolean"?force:!d.intelOpen;
    if(opening){
      clearDefensePlacementMode();defenseCloseContextSurfaces("intel",{sync:false});d.intelOpen=true;completeDefenseSchoolLesson("intel");
      // Threat intel is a deliberate thinking surface. If combat is moving, pause it rather than
      // making the player read while balloons keep leaking. Closing it never surprise-resumes.
      if(defenseIsSimulating(d)){defenseSetPhase(d,DEFENSE_PHASES.PAUSED,{resumePhase:d.phase});d.intelPausedByOpen=true;d.autoPaused=false;setDefenseMessage("THREATS PAUSED","Read the cards. Close them when you're ready.");}
    }else{
      d.intelOpen=false;if(d.intelPausedByOpen){d.intelPausedByOpen=false;setDefenseMessage("THREATS CLOSED","The trail stays paused until you press play.");}
    }
    syncDefenseOverlayState();markDefenseUi();flushDefenseUi(true);
  }

  function defenseEnemyKey(entry){if(!entry)return"puff";if(typeof entry==="string")return entry;return entry.bossId?`boss:${entry.bossId}`:(entry.type||"puff");}
  function defenseEnemyData(key){if(String(key).startsWith("boss:")){const boss=DEFENSE_BOSSES.find(item=>item.id===String(key).slice(5))||DEFENSE_BOSSES[0];return{...boss,key,name:boss.name,icon:boss.icon||"!",trait:boss.trait||"BOSS",counter:boss.counter||"FOCUS FIRE",intel:boss.hint};}const enemy=DEFENSE_ENEMIES[key]||DEFENSE_ENEMIES.puff;return{...enemy,key,name:enemy.name,icon:enemy.icon||"○",trait:enemy.trait||"THREAT",counter:enemy.counter||"ANY RIZO",intel:enemy.intel||"Read the trail and adjust your field."};}
  function defenseRecordEnemyStat(bucket,key,amount=1){const stats=mini.defense?.enemyStats;if(!stats||!stats[bucket])return;const id=String(key||"puff");stats[bucket][id]=(Number(stats[bucket][id])||0)+amount;}
  function defenseCountsFromEntries(entries){const counts=new Map();for(const entry of entries||[]){const key=defenseEnemyKey(entry);counts.set(key,(counts.get(key)||0)+1);}return counts;}
  function defenseIntelCounts(){const d=mini.defense;if(!d)return new Map();if(defenseIsActiveWave(d)){const counts=defenseCountsFromEntries(d.spawnQueue);for(const enemy of d.enemies){if(enemy.dead)continue;const key=enemy.bossId?`boss:${enemy.bossId}`:enemy.type;counts.set(key,(counts.get(key)||0)+1);}return counts;}return defenseWavePreviewData(d.wave+1).counts;}
  function defenseCounterReadiness(counts){const towers=mini.defense?.towers||[],keys=[...counts.keys()],needs={speed:keys.some(key=>["fleet","storm","boss:apex"].includes(key)),armor:keys.some(key=>["shell","frost","brick","lead","boss:crown"].includes(key)),veil:keys.some(key=>["shade","ghost"].includes(key)),swarm:keys.some(key=>key==="split"),support:keys.some(key=>["relay","mender"].includes(key))};const ready={speed:towers.some(t=>t.doctrine==="control"||["frost","moss","bubblegum","retro"].includes(t.pet.variant||t.pet.hiddenVariant)),armor:towers.some(t=>t.doctrine==="power"||["diamond","obsidian","glitch"].includes(t.pet.variant||t.pet.hiddenVariant)),veil:towers.some(t=>t.upgrade>=2||["shadow","aurora","glitch"].includes(t.pet.variant||t.pet.hiddenVariant)),swarm:towers.some(t=>["violet","diamond","obsidian","moss"].includes(t.pet.variant||t.pet.hiddenVariant)||t.doctrine==="power"),support:towers.some(t=>t.targetMode==="strong"||t.doctrine==="control"||["shadow","diamond","obsidian","violet"].includes(t.pet.variant||t.pet.hiddenVariant))};return{needs,ready,missing:Object.keys(needs).filter(key=>needs[key]&&!ready[key])};}
  function defenseMapIntel(){const d=mini.defense;if(!d)return{title:"NO WORLD",copy:""};const weather=d.map.weather;return weather==="ash"?{title:"ASH VEIL",copy:"Ash periodically camouflages the trail. Awakened and detector Rizos keep sight."}:weather==="moon"?{title:"MOONLIGHT WINDOW",copy:"Moonlight periodically exposes camo and phase threats for every Rizo."}:weather==="storm"?{title:"LIGHTNING SURGE",copy:"Every threat accelerates during the storm pulse. Keep FIRST and CONTROL coverage."}:weather==="blizzard"?{title:"WHITEOUT",copy:"Most Rizo ranges shrink. Frost and Aurora hold steady."}:weather==="eclipse"?{title:"ECLIPSE VEIL",copy:"The eclipse periodically camouflages every threat."}:{title:"CLEAR TRAIL",copy:"No world hazard. Learn the enemy identities and build clean coverage."};}
  function updateDefenseIntelTray(){
    const d=mini.defense,button=$("#defenseIntelButton"),count=$("#defenseIntelCount"),tray=$("#defenseIntelTray");if(!d||!button||!tray)return;const counts=defenseIntelCounts(),ordered=[...counts.entries()].sort((a,b)=>(DEFENSE_THREAT_PRIORITY[b[0]]||0)-(DEFENSE_THREAT_PRIORITY[a[0]]||0));if(count)count.textContent=String(ordered.length);button.classList.toggle("warning",ordered.some(([key])=>!["puff","fleet"].includes(key)));button.setAttribute("aria-expanded",String(Boolean(d.intelOpen)));tray.hidden=!d.intelOpen;if(!d.intelOpen){d.intelTraySignature="";return;}
    const cards=ordered.map(([key,total])=>{const data=defenseEnemyData(key);return`<article class="defense-intel-card v79" data-intel-type="${escapeHTML(key)}"><span style="--intel-color:${escapeHTML(data.color||"#ff5b68")}">${escapeHTML(data.icon)}</span><div><small>${total}× • ${escapeHTML(data.trait||"THREAT")}</small><b>${escapeHTML(data.name.replace(" BALLOON",""))}</b><em>USE ${escapeHTML(String(data.counter||"ANY RIZO").split(" • ").slice(0,2).join(" / "))}</em></div></article>`;}).join("");
    const markup=`<div class="defense-intel-head"><div class="defense-sheet-title"><span>${defenseUiIcon("intel")}</span><div><small>WHAT'S COMING</small><b>${defenseIsActiveWave(d)?"ON THE TRAIL":`WAVE ${d.wave+1}`}</b></div></div><button type="button" class="defense-sheet-close-inline" data-defense-toggle-intel aria-label="Close threats">${defenseUiIcon("close")}</button></div><div class="defense-intel-list">${cards||`<p>Nothing strange yet.</p>`}</div><button type="button" class="defense-intel-more" data-defense-field-guide="threats">FULL GUIDE</button>`;
    const signature=`${d.mapId}|${d.phase}|${[...counts.entries()].map(([key,total])=>`${key}:${total}`).join("|")}`;if(signature!==d.intelTraySignature){d.intelRenderCount=(d.intelRenderCount||0)+1;tray.innerHTML=markup;d.intelTraySignature=signature;}
  }


  function defenseWavePreviewData(wave){
    const previous=mini.defense.waveAnnouncement,plan=defenseWavePlan(wave),announcement=mini.defense.waveAnnouncement;mini.defense.waveAnnouncement=previous;const counts=new Map();
    for(const entry of DefenseCore.flattenPackets(plan.packets)){const key=typeof entry==="string"?entry:(entry.bossId?`boss:${entry.bossId}`:entry.type);counts.set(key,(counts.get(key)||0)+1);}return{plan,counts,announcement};
  }
  function updateDefenseWavePreview(){
    const d=mini.defense,host=$("#defenseWavePreview");if(!d||!host)return;const mode=state.settings.defenseWaveIntel||"simple";if(defenseIsActiveWave(d)||mode==="off"){host.hidden=true;host.style.pointerEvents="none";return;}
    const next=d.wave+1,{plan,counts}=defenseWavePreviewData(next),ordered=[...counts.entries()].sort((a,b)=>(DEFENSE_THREAT_PRIORITY[b[0]]||0)-(DEFENSE_THREAT_PRIORITY[a[0]]||0));
    host.style.pointerEvents="none";host.hidden=false;let markup;
    if(mode==="full"){const shown=ordered.slice(0,3),chips=shown.map(([type,count])=>{const data=defenseEnemyData(type),label=type.startsWith("boss:")?"BOSS":String(data.trait||data.name).replace("BALLOON","").split(" ").slice(0,2).join(" ");return`<i data-preview-type="${escapeHTML(type)}"><span class="defense-threat-mini ${escapeHTML(data.className||"")}"></span><b>${count}×</b>${escapeHTML(label)}</i>`;}).join(""),total=DefenseCore.flattenPackets(plan.packets).length;markup=`<small>NEXT • WAVE ${next}</small><b>${total} THREATS</b><span>${chips}</span>`;}
    else{const top=ordered[0]?.[0],data=top?defenseEnemyData(top):null,boss=ordered.some(([key])=>key.startsWith("boss:")),heavy=ordered.some(([key])=>["brick","lead","shell"].includes(key)),fast=ordered.some(([key])=>["fleet","storm"].includes(key)),hidden=ordered.some(([key])=>["shade","ghost"].includes(key)),support=ordered.some(([key])=>["relay","mender"].includes(key)),hint=boss?"BOSS INCOMING":support?"SUPPORT PACK":heavy?"HEAVY ARMOR":hidden?"HIDDEN THREATS":fast?"FAST PRESSURE":plan.modifier&&plan.modifier!=="normal"?String(plan.modifier).toUpperCase()+" WAVE":"READ THE ROAD";markup=`<small>NEXT • WAVE ${next}</small><b>${escapeHTML(plan.announcement?.title||hint)}</b><em>${escapeHTML(plan.announcement?.copy||(data?.counter||"BUILD CLEAN"))}</em>`;}
    const signature=`${mode}|${next}|${markup}`;if(signature!==d.wavePreviewSignature){host.innerHTML=markup;d.wavePreviewSignature=signature;}
  }
  function updateDefenseLiveStatus(){
    const d=mini.defense,host=$("#defenseLiveStatus"),left=$("#defenseThreatsLeft"),bar=$("#defenseWaveProgress"),bossHost=$("#defenseBossBar"),bossName=$("#defenseBossName"),bossHealth=$("#defenseBossHealth"),bossPercent=$("#defenseBossPercent"),world=$("#defenseWorld");if(!d||!host||!world)return;
    const live=defenseIsActiveWave(d),active=d.enemies.filter(enemy=>!enemy.dead),remaining=d.spawnQueue.length+d.childSpawnQueue.length+active.length,total=Math.max(1,d.waveTotal||remaining+d.waveResolved),progress=clamp((d.waveResolved/total)*100),lead=active.reduce((best,enemy)=>Math.max(best,enemy.progress||0),0),boss=active.filter(enemy=>enemy.bossId).sort((a,b)=>b.progress-a.progress)[0]||null;
    host.hidden=!live;if(left)left.textContent=`${remaining} ${remaining===1?"THREAT":"THREATS"} LEFT`;if(bar)bar.style.width=`${progress}%`;
    world.classList.toggle("gate-alert",live&&lead>=.7);world.classList.toggle("gate-critical",live&&lead>=.88);defenseApplyRenderTier(d,d.renderTier);world.classList.toggle("boss-active",Boolean(boss));
    if(bossHost){bossHost.hidden=!boss;if(boss){const data=DEFENSE_BOSSES.find(item=>item.id===boss.bossId);if(bossName)bossName.textContent=data?.name||"BOSS";const pct=clamp(boss.hp/Math.max(1,boss.maxHp)*100);if(bossHealth)bossHealth.style.width=`${pct}%`;if(bossPercent){if(boss.telegraphKind){const tele=DEFENSE_BOSS_TELEGRAPHS[boss.telegraphKind],breakPct=Math.round((boss.telegraphDisruption||0)*100);bossPercent.textContent=tele?.interruptible?`BREAK ${breakPct}%`:"UNSTOPPABLE";}else bossPercent.textContent=`${Math.ceil(pct)}%`;}}}
  }
  async function toggleDefenseFullscreen(){
    const el=$(".defense-shell")||document.documentElement;
    try{
      if(!document.fullscreenElement&&!document.webkitFullscreenElement){
        const request=el.requestFullscreen||el.webkitRequestFullscreen;
        if(!request){setDefenseMessage("FULLSCREEN UNAVAILABLE","Your browser doesn't support fullscreen here — try rotating manually for a wider map.");return;}
        await request.call(el);
        try{await screen.orientation?.lock?.("landscape");}catch(orientationError){/* not all browsers allow locking outside a PWA */}
        scheduleDefenseTowerGeometrySync();
        queueMiniTimeout(scheduleDefenseTowerGeometrySync,180);
      }else{
        (document.exitFullscreen||document.webkitExitFullscreen)?.call(document);
        try{screen.orientation?.unlock?.();}catch(orientationError){}
        scheduleDefenseTowerGeometrySync();
        queueMiniTimeout(scheduleDefenseTowerGeometrySync,180);
      }
    }catch(error){setDefenseMessage("FULLSCREEN UNAVAILABLE","Your browser blocked fullscreen here — try rotating manually for a wider map.");}
  }
  function toggleDefensePause(force){const d=mini.defense;if(!d||!defenseIsActiveWave(d))return;const shouldPause=typeof force==="boolean"?force:d.phase!==DEFENSE_PHASES.PAUSED;if(shouldPause){cancelDefenseTransientInput("pause");defenseSetPhase(d,DEFENSE_PHASES.PAUSED,{resumePhase:d.phase});}else defenseSetPhase(d,d.resumePhase||DEFENSE_PHASES.COMBAT);d.autoPaused=false;markDefenseUi();flushDefenseUi(true);writeDefenseCheckpoint(true,"pause");setDefenseMessage(shouldPause?"PAUSED":"PLAYING",shouldPause?"The simulation is frozen. Combat actions remain locked.":"The packet scheduler is moving again.");sfx("ui");}
  function pauseDefenseForInterruption(){const d=mini.defense;if(!mini.active||mini.mode!=="defense"||!d||!defenseIsSimulating(d))return false;cancelDefenseTransientInput("interruption");defenseSetPhase(d,DEFENSE_PHASES.PAUSED,{resumePhase:d.phase});d.autoPaused=true;markDefenseUi();return true;}
  function surfaceDefenseInterruptionPause(){const d=mini.defense;if(!mini.active||mini.mode!=="defense"||!d?.autoPaused)return false;d.autoPaused=false;flushDefenseUi(true);setDefenseMessage("AUTO-PAUSED • WELCOME BACK","The trail stayed frozen while RIZO.GAME was away. Tap ▶ when you are ready.");return true;}

  function cycleDefenseSpeed(){const d=mini.defense;if(!d)return;d.flowEaseUntilReal=0;const values=[.5,1,2],index=values.indexOf(d.speed);d.speed=values[(index+1)%values.length];defenseApplyRenderTier(d);markDefenseUi();updateDefenseHud();writeDefenseCheckpoint(true,"speed");setDefenseMessage(`${d.speed===.5?"SLOW MOTION":d.speed===2?"FAST FORWARD":"NORMAL SPEED"}`,d.speed===2?"Fast-forward stays readable: packet boundaries briefly ease to 1× unless you change speed yourself.":"Simulation speed changes. Music stays readable.");sfx("ui");}
  const DEFENSE_TRAIL_HALF_WIDTH=.033;
  const DEFENSE_PLACEMENT_SNAP_PX=9;
  function defensePlacementGeometry(){
    const world=$("#defenseWorld"),rect=world?.getBoundingClientRect(),width=Math.max(280,rect?.width||390),height=Math.max(280,rect?.height||390),short=Math.min(width,height);
    const footprintPx=clamp(short*.079,24,31),safetyPx=clamp(short*.0065,2,3),visualHalfPx=clamp(short*.096,30,39),visualTopPx=clamp(short*.13,40,52),visualBottomPx=clamp(short*.071,22,29);
    return{rect,width,height,short,footprintPx,safetyPx,footprint:footprintPx/short,pathHalf:DEFENSE_TRAIL_HALF_WIDTH,pathClearance:DEFENSE_TRAIL_HALF_WIDTH+(footprintPx+safetyPx)/short,towerGap:(footprintPx*2+safetyPx*2)/short,obstaclePad:(footprintPx+safetyPx)/short,bounds:{left:(visualHalfPx+2)/width,right:1-(visualHalfPx+2)/width,top:(visualTopPx+2)/height,bottom:1-(visualBottomPx+2)/height},snap:DEFENSE_PLACEMENT_SNAP_PX/short};
  }
  function defensePlacementBounds(){return defensePlacementGeometry().bounds;}
  function defenseArenaPoint(event,{lift=false,strict=true}={}){
    const world=$("#defenseWorld");if(!world)return null;const rect=world.getBoundingClientRect(),landscape=matchMedia("(max-height:650px) and (orientation:landscape)").matches,touch=event.pointerType==="touch"||event.pointerType==="pen",liftPx=lift&&touch?clamp(Math.min(rect.width,rect.height)*.135,42,56):0,clientX=event.clientX-(landscape?liftPx:0),clientY=event.clientY-(landscape?0:liftPx),rawX=(clientX-rect.left)/Math.max(1,rect.width),rawY=(clientY-rect.top)/Math.max(1,rect.height),margin=DEFENSE_PLACEMENT_SNAP_PX/Math.max(1,Math.min(rect.width,rect.height));
    if(strict&&(rawX< -margin||rawX>1+margin||rawY< -margin||rawY>1+margin))return null;
    return{x:clamp(rawX,0,1),y:clamp(rawY,0,1),rawX,rawY,rect,clientX,clientY,liftPx};
  }
  function nearestDefensePathPoint(x,y){let best={distance:Infinity,x:0,y:0,segment:null,t:0,progress:0};const metrics=mini.defense.pathMetrics;for(const segment of metrics.segments){const{a,b}=segment,dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,t=len2?clamp(((x-a.x)*dx+(y-a.y)*dy)/len2,0,1):0,px=a.x+dx*t,py=a.y+dy*t,distance=Math.hypot(x-px,y-py),progress=metrics.total?clamp((segment.start+t*segment.length)/metrics.total,0,1):0;if(distance<best.distance)best={distance,x:px,y:py,segment,t,progress};}return best;}
  function distanceToDefensePath(x,y){return nearestDefensePathPoint(x,y).distance;}
  function defenseObstacleAt(x,y,geometry=defensePlacementGeometry()){let best=null;for(const zone of mini.defense.map.blockedZones||[]){const distance=Math.hypot(x-zone.x,y-zone.y),required=zone.r+geometry.obstaclePad;if(distance<required&&(!best||distance-required<best.distance-best.required))best={zone,distance,required};}return best;}
  function pointInDefenseObstacle(x,y){return Boolean(defenseObstacleAt(x,y));}
  function defensePlacementIntersectsOverlay(){return false;}
  function defensePlacementEvaluation(x,y,ignoreTower=null){
    const geometry=defensePlacementGeometry(),bounds=geometry.bounds;
    if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return{valid:false,code:"edge",reason:"KEEP THE WHOLE RIZO ON THE FIELD",geometry};
    const path=nearestDefensePathPoint(x,y);if(path.distance<geometry.pathClearance)return{valid:false,code:"trail",reason:"FOOTPRINT TOUCHES THE TRAIL",geometry,path,distance:path.distance,required:geometry.pathClearance};
    const obstacle=defenseObstacleAt(x,y,geometry);if(obstacle)return{valid:false,code:"obstacle",reason:"A MAP PROP BLOCKS THIS FOOTPRINT",geometry,obstacle,distance:obstacle.distance,required:obstacle.required};
    let nearestTower=null;for(const tower of mini.defense.towers){if(tower.id===ignoreTower)continue;const distance=Math.hypot(tower.x-x,tower.y-y);if(distance<geometry.towerGap&&(!nearestTower||distance<nearestTower.distance))nearestTower={tower,distance};}
    if(nearestTower)return{valid:false,code:"tower",reason:"TOO CLOSE TO ANOTHER RIZO",geometry,nearestTower,distance:nearestTower.distance,required:geometry.towerGap};
    return{valid:true,code:"open",reason:"OPEN GRASS",geometry,path,distance:path.distance,required:geometry.pathClearance,clearance:path.distance-geometry.pathClearance};
  }
  function defensePlacementPushCandidate(x,y,evaluation){
    const g=evaluation.geometry||defensePlacementGeometry(),candidates=[];
    if(evaluation.code==="edge")candidates.push({x:clamp(x,g.bounds.left,g.bounds.right),y:clamp(y,g.bounds.top,g.bounds.bottom)});
    if(evaluation.code==="trail"&&evaluation.path){const p=evaluation.path,dx=x-p.x,dy=y-p.y,length=Math.hypot(dx,dy),segment=p.segment||{a:{x:0,y:0},b:{x:1,y:0}},sx=segment.b.x-segment.a.x,sy=segment.b.y-segment.a.y,required=g.pathClearance+.002;if(length>.0001)candidates.push({x:p.x+dx/length*required,y:p.y+dy/length*required});else{const sl=Math.max(.0001,Math.hypot(sx,sy)),nx=-sy/sl,ny=sx/sl;candidates.push({x:p.x+nx*required,y:p.y+ny*required},{x:p.x-nx*required,y:p.y-ny*required});}}
    if(evaluation.code==="obstacle"&&evaluation.obstacle){const{zone,required}=evaluation.obstacle,dx=x-zone.x,dy=y-zone.y,length=Math.hypot(dx,dy)||1;candidates.push({x:zone.x+dx/length*(required+.002),y:zone.y+dy/length*(required+.002)});}
    if(evaluation.code==="tower"&&evaluation.nearestTower){const{tower}=evaluation.nearestTower,dx=x-tower.x,dy=y-tower.y,length=Math.hypot(dx,dy)||1;candidates.push({x:tower.x+dx/length*(g.towerGap+.002),y:tower.y+dy/length*(g.towerGap+.002)});}
    return candidates;
  }
  function resolveDefensePlacement(x,y,ignoreTower=null,{snapPx=DEFENSE_PLACEMENT_SNAP_PX}={}){
    const direct=defensePlacementEvaluation(x,y,ignoreTower);if(direct.valid)return{point:{x,y},evaluation:direct,snapped:false,raw:{x,y},snapDistance:0};
    const geometry=direct.geometry,maxDistance=Math.max(0,Number(snapPx)||0)/geometry.short,candidates=defensePlacementPushCandidate(x,y,direct),steps=4,angles=24;
    for(let ring=1;ring<=steps;ring+=1){const radius=maxDistance*ring/steps;for(let i=0;i<angles;i+=1){const angle=Math.PI*2*i/angles;candidates.push({x:x+Math.cos(angle)*radius,y:y+Math.sin(angle)*radius});}}
    let best=null;for(const candidate of candidates){const point={x:clamp(candidate.x,0,1),y:clamp(candidate.y,0,1)},distance=Math.hypot(point.x-x,point.y-y);if(distance>maxDistance+.0001)continue;const evaluation=defensePlacementEvaluation(point.x,point.y,ignoreTower);if(!evaluation.valid)continue;const score=distance+Math.max(0,.003-(evaluation.clearance||0))*.2;if(!best||score<best.score)best={point,evaluation,snapped:distance>.0005,raw:{x,y},snapDistance:distance,score};}
    return best||{point:{x,y},evaluation:direct,snapped:false,raw:{x,y},snapDistance:0};
  }
  function isValidDefensePlacement(x,y,ignoreTower=null){return defensePlacementEvaluation(x,y,ignoreTower).valid;}
  function defensePlacementReasonCopy(evaluation){return evaluation?.reason||"THAT SPOT IS BLOCKED";}
  function defensePlacementRangeForRow(row){const type=defenseStructureType(row);return type==="beacon"?DefenseCore.beaconSupport(0).radius:type==="factory"?.11:defenseTowerStats(row.pet,0).range;}
  function ensureDefensePlacementPreview(row){const preview=$("#defensePlacementPreview");if(!preview||!row)return preview;const signature=row.pet.id;if(preview.dataset.petId!==signature){preview.dataset.petId=signature;preview.innerHTML=`<span class="defense-placement-range"></span><span class="defense-placement-foot"></span><b class="defense-placement-label">OPEN GRASS</b>`;}const g=defensePlacementGeometry();preview.style.setProperty("--placement-range",`${Math.max(64,defensePlacementRangeForRow(row)*2*g.width)}px`);preview.style.setProperty("--placement-footprint",`${g.footprintPx*2}px`);return preview;}
  function defenseCoverage(x,y,range){let count=0;for(let i=0;i<80;i++){const p=defensePointAt((i+.5)/80);if(Math.hypot(p.x-x,p.y-y)<=range)count++;}return count/80;}
  function updateDefensePlacementPreview(result,row,{show=true}={}){const preview=ensureDefensePlacementPreview(row);if(!preview)return;preview.hidden=!show;if(!show)return;const point=result?.point||result?.raw;if(!point)return;const valid=Boolean(result?.evaluation?.valid),mapBond=valid?defenseMapBondForTower({x:point.x,y:point.y},mini.defense,{preview:true}):null,baseRange=defensePlacementRangeForRow(row),previewRange=baseRange*(mapBond?.range||1),geometry=result?.evaluation?.geometry||defensePlacementGeometry();preview.style.left=`${point.x*100}%`;preview.style.top=`${point.y*100}%`;preview.style.setProperty("--placement-range",`${Math.max(64,previewRange*2*geometry.width)}px`);preview.classList.toggle("valid",valid);preview.classList.toggle("invalid",!valid);preview.classList.toggle("snapped",Boolean(result?.snapped));preview.classList.toggle("map-bond-preview",Boolean(mapBond));preview.dataset.reason=result?.evaluation?.code||"blocked";preview.dataset.mapBond=mapBond?.kind||"";preview.dataset.mapBondTier=mapBond?.tier||"";const label=preview.querySelector(".defense-placement-label"),type=defenseStructureType(row);if(label){if(!valid)label.textContent=defensePlacementReasonCopy(result?.evaluation);else if(type==="factory"){const econ=DefenseCore.factoryEconomy({upgradeLevel:0,wave:mini.defense?.currentWave||0,goldenTowerCount:defenseAwakenedGoldenCount()});label.textContent=`PRINTS +${econ.payout} / ${econ.interval.toFixed(1)}S LIVE`; }else if(type==="beacon"){const support=DefenseCore.beaconSupport(0);label.textContent=`FIELD • +${Math.round((support.rateMultiplier-1)*100)}% SPEED`; }else label.textContent=mapBond?.preview||`${Math.round(defenseCoverage(point.x,point.y,previewRange)*100)}% OF TRAIL IN REACH`;}}
  function hideDefensePlacementPreview(){const preview=$("#defensePlacementPreview");if(preview){preview.hidden=true;preview.classList.remove("valid","invalid","snapped");}}
  function cancelDefenseTransientInput(reason="system-cancel") {
    const d=mini.defense;let cancelled=false;if(d?.gateFlameArmed){d.gateFlameArmed=false;$(".defense-shell")?.classList.remove("gate-flame-aiming");markDefenseUi();cancelled=true;}
    const drag = mini?.defenseDrag;
    if (!drag){if(d&&cancelled)d.lastInputCancelReason=reason;return cancelled;}
    try { drag.source?.releasePointerCapture?.(drag.pointerId); } catch (error) {}
    drag.ghost?.remove();
    drag.source?.classList.remove("drag-source");
    $("#defenseWorld")?.classList.remove("placement-valid", "placement-invalid");
    hideDefensePlacementPreview();
    mini.defenseDrag = null;
    if (d) d.lastInputCancelReason = reason;
    return true;
  }
  function defenseBenchAxis(){return matchMedia("(max-height:650px) and (orientation:landscape)").matches?"vertical":"horizontal";}
  function defenseDragIntent(dx,dy){const axis=defenseBenchAxis(),ax=Math.abs(dx),ay=Math.abs(dy);if(axis==="horizontal"){if(ax>9&&ax>ay*1.12)return"scroll";if(ay>8&&ay>=ax*.72)return dy<0?"deploy":"wait";}else{if(ay>9&&ay>ax*1.12)return"scroll";if(ax>8&&ax>=ay*.72)return dx<0?"deploy":"wait";}return"wait";}

  function setDefensePlacementMode(row,cost){
    const d=mini.defense;d.pendingPlacement={row,cost};d.benchOpen=true;d.fieldMenuOpen=false;
    $("#defenseWorld")?.classList.add("placement-mode");syncDefenseMapMechanicEdges();hideDefensePlacementPreview();updateDefenseRoster();updateDefenseHud();
    setDefenseMessage(`PLACE ${row.pet.name}`,defenseStructureType(row)==="factory"?"Factory takes a field slot and cannot attack. Survive long enough and the shirts pay you back.":defenseStructureType(row)==="beacon"?"Its visible field accelerates nearby Rizos and later powers their hits. Position the circle, not the trail.":"Drag toward the field or tap exact grass. Green means the full footprint clears the trail.");haptic(8);
  }

  function clearDefensePlacementMode(){
    if(!mini.defense)return;mini.defense.pendingPlacement=null;hideDefensePlacementPreview();$("#defenseWorld")?.classList.remove("placement-mode","placement-valid","placement-invalid");updateDefenseRoster();updateDefenseHud();
  }

  function selectDefenseRosterPet(row){
    if(!row||!mini.defense)return false;
    const d=mini.defense;if(!defensePlacementAllowed(d)){setDefenseMessage("FIELD PAUSED","Resume before placing reinforcements.");sfx("no");return false;}
    if(d.pendingPlacement?.row?.pet?.id===row.pet.id){clearDefensePlacementMode();setDefenseMessage("PLACEMENT CANCELLED","Tap another Rizo when you are ready.");return false;}
    if(d.towers.length>=d.maxTowers){toast("THE FIELD IS FULL");sfx("no");return false;}
    if(defenseContractRule("unique",d)&&d.towers.some(tower=>tower.petId===row.pet.id)){setDefenseMessage("CONTRACT • NO COPIES",`${row.pet.name} already stands on this field.`);sfx("no");return false;}
    const cost=defenseDeployCost(row);
    if(d.cash<cost){toast(`NEED ${cost} DEFENSE COINS`);sfx("no");return false;}
    closeDefenseTowerPanel();
    setDefensePlacementMode(row,cost);
    return true;
  }
  function beginDefenseDrag(event,row){
    const d=mini.defense;if(!d||!row)return;if(!defensePlacementAllowed(d)){setDefenseMessage("FIELD PAUSED","Resume before placing reinforcements. Upgrades and powers stay available.");return;}if(d.towers.length>=d.maxTowers){toast("THE FIELD IS FULL");return;}if(defenseContractRule("unique",d)&&d.towers.some(tower=>tower.petId===row.pet.id)){setDefenseMessage("CONTRACT • NO COPIES",`${row.pet.name} already stands on this field.`);return;}const cost=defenseDeployCost(row);if(d.cash<cost){toast(`NEED ${cost} DEFENSE COINS`);return;}
    const source=event.target.closest("[data-defense-roster-id]"),roster=source?.closest(".defense-roster");
    if(event.cancelable)event.preventDefault();
    try{source?.setPointerCapture?.(event.pointerId);}catch(error){}
    mini.defenseDrag={pointerId:event.pointerId,pointerType:event.pointerType||"touch",row,cost,ghost:null,source,roster,scrollStartX:roster?.scrollLeft||0,scrollStartY:roster?.scrollTop||0,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,active:false,scrolling:false,moved:false,result:null};if(event.pointerType==="mouse"){activateDefenseDrag(mini.defenseDrag,event);moveDefenseDrag(event);}haptic(6);
  }

  function activateDefenseDrag(drag,event){
    if(!drag||drag.active)return;drag.active=true;drag.moved=true;const ghost=document.createElement("div");ghost.className="defense-drag-ghost";ghost.innerHTML=`${petMarkup({pet:drag.row.pet,extraClass:"defense-drag-rizo",context:"thumbnail",label:drag.row.pet.name})}<i class="defense-drag-foot"></i><b class="defense-drag-reason">MOVE TO OPEN GRASS</b>`;document.body.appendChild(ghost);drag.ghost=ghost;drag.source?.classList.add("drag-source");try{drag.source?.setPointerCapture?.(event.pointerId);}catch(error){}$("#defenseWorld")?.classList.add("placement-mode");ensureDefensePlacementPreview(drag.row);
  }
  function moveDefenseDrag(event){
    const drag=mini.defenseDrag;if(!drag||event.pointerId!==drag.pointerId)return;drag.lastX=event.clientX;drag.lastY=event.clientY;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY,distance=Math.hypot(dx,dy);
    if(event.cancelable)event.preventDefault();
    if(drag.scrolling){const axis=defenseBenchAxis();if(drag.roster){if(axis==="horizontal")drag.roster.scrollLeft=drag.scrollStartX-dx;else drag.roster.scrollTop=drag.scrollStartY-dy;}return;}
    if(!drag.active){if(distance<=6)return;const intent=defenseDragIntent(dx,dy);if(intent==="scroll"){drag.scrolling=true;if(drag.roster){const axis=defenseBenchAxis();if(axis==="horizontal")drag.roster.scrollLeft=drag.scrollStartX-dx;else drag.roster.scrollTop=drag.scrollStartY-dy;}return;}if(intent!=="deploy"){if(distance<18)return;activateDefenseDrag(drag,event);}else activateDefenseDrag(drag,event);}
    const raw=defenseArenaPoint(event,{lift:true,strict:true}),world=$("#defenseWorld");if(!raw){drag.result=null;drag.ghost.style.left=`${event.clientX}px`;drag.ghost.style.top=`${event.clientY}px`;drag.ghost.classList.remove("valid","snapped");drag.ghost.classList.add("invalid");const reason=drag.ghost.querySelector(".defense-drag-reason");if(reason)reason.textContent="MOVE INTO THE FIELD";hideDefensePlacementPreview();world?.classList.remove("placement-valid");world?.classList.add("placement-invalid");return;}
    const result=resolveDefensePlacement(raw.x,raw.y,null,{snapPx:DEFENSE_PLACEMENT_SNAP_PX});drag.result=result;const point=result.point,screenX=raw.rect.left+point.x*raw.rect.width,screenY=raw.rect.top+point.y*raw.rect.height,g=result.evaluation.geometry;drag.ghost.style.left=`${screenX}px`;drag.ghost.style.top=`${screenY}px`;drag.ghost.style.setProperty("--placement-range",`${Math.max(64,defensePlacementRangeForRow(drag.row)*2*g.width)}px`);drag.ghost.style.setProperty("--placement-footprint",`${g.footprintPx*2}px`);drag.ghost.classList.toggle("valid",Boolean(result.evaluation.valid));drag.ghost.classList.toggle("invalid",!result.evaluation.valid);drag.ghost.classList.toggle("snapped",Boolean(result.snapped));const reason=drag.ghost.querySelector(".defense-drag-reason");if(reason)reason.textContent=result.evaluation.valid?(result.snapped?"EDGE SNAP":"DROP TO PLACE"):defensePlacementReasonCopy(result.evaluation);updateDefensePlacementPreview(result,drag.row);world?.classList.toggle("placement-valid",Boolean(result.evaluation.valid));world?.classList.toggle("placement-invalid",!result.evaluation.valid);
  }

  function endDefenseDrag(event,cancelled=false){
    const drag=mini.defenseDrag;if(!drag||event.pointerId!==drag.pointerId)return;const tap=!cancelled&&!drag.active&&!drag.scrolling&&Math.hypot((event.clientX??drag.lastX)-drag.startX,(event.clientY??drag.lastY)-drag.startY)<=8,result=drag.result,valid=!cancelled&&drag.active&&result?.evaluation?.valid;drag.ghost?.remove();drag.source?.classList.remove("drag-source");try{if(drag.source?.hasPointerCapture?.(drag.pointerId))drag.source.releasePointerCapture(drag.pointerId);}catch(error){}$("#defenseWorld")?.classList.remove("placement-valid","placement-invalid");hideDefensePlacementPreview();mini.defenseDrag=null;if(drag.scrolling)return;if(valid)placeDefenseTower(drag.row,result.point.x,result.point.y,drag.cost);else if(tap)setDefensePlacementMode(drag.row,drag.cost);else if(!cancelled&&drag.active){setDefensePlacementMode(drag.row,drag.cost);setDefenseMessage("KEEP PLACEMENT ACTIVE",defensePlacementReasonCopy(result?.evaluation));sfx("no");haptic([10,14,10]);}
  }

  function placeDefenseTower(row,x,y,cost){
    const d=mini.defense;if(!defensePlacementAllowed(d)){setDefenseMessage("FIELD PAUSED","Resume before placing reinforcements.");sfx("no");return false;}if(d.towers.length>=d.maxTowers||!isValidDefensePlacement(x,y)||d.cash<cost||defenseContractRule("unique",d)&&d.towers.some(tower=>tower.petId===row.pet.id))return false;
    const structureType=defenseStructureType(row);d.cash-=cost;d.cashWriteCount=(d.cashWriteCount||0)+1;const copies=d.towers.filter(t=>t.petId===row.pet.id).length+1,tower={id:`tower-${d.nextId++}`,petId:row.pet.id,pet:row.pet,source:row.source,rosterIndex:row.rosterIndex,structureType,copyNumber:copies,x,y,upgrade:0,cost,spent:cost,cooldown:0,kills:0,damage:0,abilityReadyAt:0,overclockUntil:0,rangeDebuffUntil:0,targetMode:["obsidian","diamond"].includes(row.pet.variant)?"strong":"first",doctrine:null,shots:0,placedAt:d.clock,placedAtReal:defenseRealNow(d),openingPerkApplied:false,targetId:null,retargetAt:0,retargetAtReal:0,totalProduced:0,nextProductionAt:0,factoryCleanCycles:0,factoryLivesSnapshot:d.lives,factoryLastInterval:0};if(structureType==="factory"){const econ=defenseFactoryEconomy(tower,d);tower.nextProductionAt=d.clock+econ.interval;tower.factoryLastInterval=econ.interval;}d.towers.push(tower);d.usedPetIds.add(row.pet.id);completeDefenseSchoolLesson("route",{silent:true});completeDefenseSchoolLesson("placement");clearDefensePlacementMode();refreshDefenseMapBondVisuals();refreshDefenseSupportVisuals(d);defenseFeelPulseTower(tower,"deployed",420);updateDefenseRoster();updateDefenseHud();
    if(structureType==="factory")setDefenseMessage(`FACTORY ${copies} OPEN`,"No bullets. Shirts become coins only while a wave is live. Greed has to survive first.");else if(structureType==="beacon")setDefenseMessage(`BEACON ${copies} LIT`,`Rizos inside the light attack ${Math.round((DefenseCore.beaconSupport(0).rateMultiplier-1)*100)}% faster. The circle shows exactly who benefits.`);else setDefenseMessage(defenseIsUniversalPet(row.pet)?`${row.pet.name} IS READY.`:`${row.pet.name} COPY ${copies} IS READY.`,defenseIsUniversalPet(row.pet)?"A universal field tool. Tap it to level up, aim, or choose an upgrade path.":`Tap it any time to level up, aim, or use its power.`);
    markDefenseUi({roster:true});writeDefenseCheckpoint(true,"placement");sfx(structureType?"coin":"defense-deploy");defenseHaptic("deploy");return true;
  }

  function applyDefenseTowerGeometry(tower,node=tower?.node){
    const world=$("#defenseWorld");
    if(!tower||!node||!world)return false;
    const stats=defenseCombatStats(tower),structureType=defenseStructureType(tower),fieldRange=structureType==="beacon"?DefenseCore.beaconSupport(tower.upgrade).radius:stats.range,worldWidth=world.clientWidth||360,worldHeight=world.clientHeight||520;
    node.style.left=`${tower.x*100}%`;
    node.style.top=`${tower.y*100}%`;
    node.style.setProperty("--tower-range",`${fieldRange*200}%`);
    node.style.setProperty("--tower-range-width",`${Math.max(64,fieldRange*2*worldWidth)}px`);
    node.style.setProperty("--tower-range-height",`${Math.max(64,fieldRange*2*worldHeight)}px`);
    return true;
  }
  function sizeDefenseSquareField(){const shell=$(".defense-shell"),world=$("#defenseWorld");if(!shell||!world)return false;world.style.removeProperty("width");world.style.removeProperty("height");const width=shell.clientWidth,height=shell.clientHeight,mode=width>height?"landscape":height<650?"short-portrait":width>=768?"tablet":"portrait";shell.dataset.viewportMode=mode;return true;}

  function syncDefenseTowerGeometry(){
    const d=mini?.active&&mini.mode==="defense"?mini.defense:null;
    if(!d)return false;
    sizeDefenseSquareField();
    const world=$("#defenseWorld");
    d.renderWidth=world?.clientWidth||d.renderWidth||360;
    d.renderHeight=world?.clientHeight||d.renderHeight||520;
    const unitScale=clamp(d.renderWidth/390,.86,1.16);
    world?.style.setProperty("--def-unit-scale",unitScale.toFixed(3));
    d.canvasRenderer?.resize?.(d.renderWidth,d.renderHeight,d.governorTier||0);
    d.towers.forEach(tower=>applyDefenseTowerGeometry(tower));
    return true;
  }
  function scheduleDefenseTowerGeometrySync(){
    if(!mini?.active||mini.mode!=="defense"||!mini.defense)return;
    if(defenseResizeFrame)cancelAnimationFrame(defenseResizeFrame);
    defenseResizeFrame=requestAnimationFrame(()=>{defenseResizeFrame=null;syncDefenseTowerGeometry();});
  }
  function renderDefenseStructureTower(tower){
    const host=$("#defenseTowers"),type=defenseStructureType(tower),meta=DEFENSE_STRUCTURE_META[type];if(!host||!meta)return false;const node=document.createElement("button"),tier=defenseTowerTier(tower),support=type==="beacon"?DefenseCore.beaconSupport(tower.upgrade):null,econ=type==="factory"?defenseFactoryEconomy(tower):null;node.type="button";node.className=`defense-tower defense-structure defense-structure-${type} defense-tier-${tier} defense-upgrade-${tower.upgrade} ${tower.upgrade>=4?"structure-maxed":""}`;node.dataset.defenseTower=tower.id;node.dataset.structureType=type;node.setAttribute("aria-pressed","false");node.setAttribute("aria-label",type==="factory"?`Clothing Factory level ${tower.upgrade+1}. Produces ${econ.payout} coins every ${econ.interval.toFixed(1)} live-combat seconds. Tap for economy upgrades.`:`Beacon level ${tower.upgrade+1}. Buffs Rizos inside its field by ${Math.round((support.rateMultiplier-1)*100)} percent attack speed and ${Math.round((support.damageMultiplier-1)*100)} percent damage. Tap for support upgrades.`);node.style.setProperty("--tower-color",meta.accent);node.innerHTML=`<span class="defense-structure-field" aria-hidden="true"></span><span class="defense-range" aria-hidden="true"></span><span class="defense-structure-art structure-art-${type}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="defense-structure-name">${type==="factory"?"RIZO":"BEACON"}</span><i class="defense-level" title="Level ${tower.upgrade+1}">LV${tower.upgrade+1}</i>${tower.copyNumber>1?`<i class="defense-copy" title="Deployed copy ${tower.copyNumber}">#${tower.copyNumber}</i>`:""}`;host.appendChild(node);tower.node=node;applyDefenseTowerGeometry(tower,node);return true;
  }
  function defenseFeelIdleClass(variant="classic"){
    if(["ember","obsidian","diamond"].includes(variant))return "feel-idle-braced";
    if(["violet","aurora","frost","shadow"].includes(variant))return "feel-idle-hover";
    if(["glitch","retro","bubblegum"].includes(variant))return "feel-idle-twitch";
    return "feel-idle-breathe";
  }
  function defenseFeelPulseTower(tower,kind="selected",duration=260){
    if(!tower?.node)return false;const cls=`feel-${kind}`;tower.node.classList.remove(cls);void tower.node.offsetWidth;tower.node.classList.add(cls);queueMiniTimeout(()=>tower.node?.classList.remove(cls),duration);return true;
  }
  const DEFENSE_BOSS_FEEL_CLASSES=Object.freeze({crown:"feel-boss-crown",vortex:"feel-boss-vortex",mirror:"feel-boss-mirror",apex:"feel-boss-apex"});
  function defenseBossStagePulse(moment,bossId,duration=820){
    const stage=$(".defense-stage-frame"),momentClass=`feel-boss-${moment}`,identityClass=DEFENSE_BOSS_FEEL_CLASSES[bossId]||"";if(!stage)return false;
    const token=(Number(stage._rizoBossFeelToken)||0)+1;stage._rizoBossFeelToken=token;stage.classList.remove("feel-boss-arrival","feel-boss-phase","feel-boss-defeat",...Object.values(DEFENSE_BOSS_FEEL_CLASSES));void stage.offsetWidth;stage.classList.add(momentClass);if(identityClass)stage.classList.add(identityClass);
    queueMiniTimeout(()=>{if(stage._rizoBossFeelToken!==token)return;stage.classList.remove(momentClass);if(identityClass)stage.classList.remove(identityClass);},duration);return true;
  }
  function renderDefenseTower(tower){
    if(defenseStructureType(tower))return renderDefenseStructureTower(tower);
    const host=$("#defenseTowers");
    if(!host)return;
    const node=document.createElement("button"),stats=defenseCombatStats(tower),tier=defenseTowerTier(tower),universal=defenseIsUniversalTower(tower),variant=universal?{color:defenseTowerDisplayColor(tower),sprite:null}:(VARIANTS.find(item=>item.id===stats.variant)||VARIANTS[0]),mastery=universal?null:defenseMasteryForPet(tower.petId),masteryTier=universal?0:defenseMasteryTier(mastery||{}),mapBond=defenseMapBondForTower(tower);
    node.type="button";
    node.className=`defense-tower defense-variant-${stats.variant} ${universal?"defense-universal-tower":""} defense-tier-${tier} defense-upgrade-${tower.upgrade} defense-mastery-${masteryTier} ${tower.source==="active"?"defense-captain-tower":""} ${defenseFeelIdleClass(stats.variant)} ${tower.superForm?`defense-super-${tower.superForm}`:""} ${tower.doctrine?`defense-doctrine-${tower.doctrine}`:""} ${mapBond?`defense-map-bond map-bond-${mapBond.kind} map-bond-zone-${mapBond.zoneIndex} map-bond-tier-${mapBond.tier}${mapBond.state?` map-bond-state-${mapBond.state}`:""}`:""} ${tower.y<.35?"defense-range-label-low":tower.y>.65?"defense-range-label-high":""}`;
    node.dataset.defenseTower=tower.id;
    node.dataset.masteryTier=String(masteryTier);
    node.setAttribute("aria-pressed","false");
    node.setAttribute("aria-label",`${tower.pet.name}, Level ${tower.upgrade+1}${tower.superForm?` SUPER ${tower.superForm.toUpperCase()}`:""} ${stats.label} defender. Power ${Math.round(stats.damage)}, Speed ${stats.rate.toFixed(1)}, Reach ${Math.round(stats.range*100)}.${mapBond?` Map bond: ${mapBond.label}.`:""} Tap for tower actions.`);
    node.style.setProperty("--tower-color",variant.color);
    if(variant.sprite)node.style.setProperty("--tower-silhouette",`url("${variant.sprite}")`);
    node.innerHTML=`<span class="defense-aura" aria-hidden="true"><i></i></span><span class="defense-range" aria-hidden="true"></span><span class="defense-power-mark" aria-hidden="true"><i></i><i></i><i></i></span>${defenseTowerPortraitMarkup(tower)}${tower.source==="active"?`<i class="defense-captain-mark" title="Captain • owns the field power while deployed">CAPTAIN</i>`:""}${tower.upgrade?`<i class="defense-level" title="Level ${tower.upgrade+1}">LV${tower.upgrade+1}</i>`:""}${tower.copyNumber>1?`<i class="defense-copy" title="Deployed copy ${tower.copyNumber}">#${tower.copyNumber}</i>`:""}${mapBond?`<span class="defense-map-bond-badge" aria-hidden="true">${escapeHTML(mini.defense.map.mechanic?.icon||"✦")}</span>`:""}<i class="defense-ability-pip" aria-hidden="true">${tower.doctrine==="control"?"⌁":"✦"}</i>`;
    host.appendChild(node);
    tower.node=node;
    const abilityUnlocked=Boolean(tower.upgrade>=2&&tower.doctrine&&!defenseContractRule("silent",mini.defense)),abilityRemaining=abilityUnlocked?defenseAbilityRemaining(tower):Infinity,abilityCharged=Boolean(abilityUnlocked&&abilityRemaining<=0),abilityCooldown=Math.max(.001,defenseAbilityCooldown(tower)*(tower.superForm?.7:1)),abilityCharge=abilityUnlocked?clamp(1-abilityRemaining/abilityCooldown,0,1):0,abilityChargeStep=Math.round(abilityCharge*12)/12;
    node.classList.toggle("ability-ready",abilityCharged);node.classList.toggle("ability-charging",abilityUnlocked&&!abilityCharged);node.style.setProperty("--ability-charge",`${Math.round(abilityChargeStep*100)}%`);
    tower.abilityChargedVisual=abilityCharged;tower.abilityChargingVisual=abilityUnlocked&&!abilityCharged;tower.abilityChargeVisual=abilityChargeStep;
    applyDefenseTowerGeometry(tower,node);syncDefenseMapBondStateClasses();
  }

  function refreshDefenseTower(tower){const selected=mini.defense.selectedTowerId===tower.id;tower.node?.remove();renderDefenseTower(tower);if(selected){tower.node?.classList.add("selected");tower.node?.setAttribute("aria-pressed","true");}}
  function refreshDefenseMapBondVisuals(){const d=mini.defense;if(!d)return false;for(const tower of d.towers)refreshDefenseTower(tower);return true;}
  // Map-bond hint labels are placed by a normalized-y heuristic at render time. On
  // short phone viewports the longest bond copy wraps far enough to leave the
  // battlefield, so once the labels are actually visible we measure them and flip
  // the ones that would overflow. Runs only on placement/route-trace transitions
  // and resize, never inside the simulation loop.
  function syncDefenseMapMechanicEdges(){
    const world=$("#defenseWorld");if(!world)return false;
    const nodes=world.querySelectorAll(".defense-map-mechanic");if(!nodes.length)return false;
    const bounds=world.getBoundingClientRect();if(!bounds.height)return false;
    for(const node of nodes){
      const label=node.querySelector("span");if(!label)continue;
      node.classList.remove("mechanic-edge-bottom","mechanic-edge-left","mechanic-edge-right");
      label.style.removeProperty("--mechanic-hint-shift");
      let rect=label.getBoundingClientRect();
      if(!rect.height)continue;
      // Vertical: keep the hint below its ring unless above genuinely has more room.
      if(rect.bottom>bounds.bottom-1){
        const ring=node.getBoundingClientRect();
        if(ring.top-bounds.top>bounds.bottom-ring.bottom)node.classList.add("mechanic-edge-bottom");
      }
      // Horizontal: clamp to the battlefield rather than to the ring. Anchoring a
      // wide hint to one side of a small ring only trades a left overhang for a
      // right one, so shift the hint by the measured overflow instead.
      rect=label.getBoundingClientRect();
      let shift=0;
      if(rect.left<bounds.left+2)shift=(bounds.left+2)-rect.left;
      else if(rect.right>bounds.right-2)shift=(bounds.right-2)-rect.right;
      if(shift)label.style.setProperty("--mechanic-hint-shift",`${Math.round(shift)}px`);
    }
    return true;
  }
  function defensePanelStatsMarkup(stats){
    return `<span class="defense-stat-chip"><small>POWER</small><b>${Math.round(stats.damage)}</b></span><span class="defense-stat-chip"><small>SPEED</small><b>${stats.rate.toFixed(1)}</b></span><span class="defense-stat-chip"><small>REACH</small><b>${Math.round(stats.range*100)}</b></span>`;
  }
  function defenseEvolutionRailMarkup(tower){
    const level=clamp((tower?.upgrade||0)+1,1,5),doctrine=tower?.doctrine||"",pathName=doctrine?`${doctrine.toUpperCase()} PATH`:level>=3?"PATH OPEN":"PATH AT LV 3",stageName=defenseUpgradeName(tower);
    const nodes=[1,2,3,4,5].map(step=>{const done=step<=level,current=step===level,glyph=step===3?(doctrine==="power"?"◆":doctrine==="control"?"⌁":"◇"):step===5?"★":String(step);return `<i class="${done?"done":""} ${current?"current":""} ${step===3?"path-node":""} ${step===5?"max-node":""}">${glyph}</i>`;}).join("");
    return `<div class="defense-evolution-rail ${doctrine?`doctrine-${doctrine}`:"doctrine-open"}" aria-label="${escapeHTML(tower.pet.name)} evolution, level ${level} of 5, ${escapeHTML(pathName)}"><span class="defense-evolution-copy"><small>EVOLUTION • ${escapeHTML(pathName)}</small><b>${escapeHTML(stageName)}</b></span><span class="defense-evolution-track" aria-hidden="true">${nodes}</span></div>`;
  }

  function defenseSuperCandidates(tower,d=mini.defense){return d?.towers?.filter(other=>other.petId===tower?.petId&&!other.superForm)||[];}
  function defenseCanAscend(tower,d=mini.defense){const copies=defenseSuperCandidates(tower,d);return Boolean(tower&&defenseIsCharacterTower(tower)&&tower.upgrade>=4&&tower.doctrine&&copies.length>=10);}
  function ascendDefenseTower(id){const d=mini.defense,tower=d?.towers.find(t=>t.id===id);if(!defenseCanAscend(tower,d)){setDefenseMessage("SUPER RIZO NOT READY","Deploy 10 copies of the same Rizo and max the one you want to keep.");sfx("no");return false;}const copies=defenseSuperCandidates(tower,d),sacrifices=copies.filter(t=>t!==tower).slice(0,9);for(const other of sacrifices){other.node?.remove();d.towers=d.towers.filter(t=>t!==other);}tower.superForm=tower.doctrine;tower.abilityReadyAt=Math.min(tower.abilityReadyAt||0,defenseNow()+4);refreshDefenseMapBondVisuals();refreshDefenseSupportVisuals(d);markDefenseUi({roster:true});updateDefenseRoster();showDefenseTowerPanel(tower);showDefenseCinematicMoment("perfect",{kicker:"TEN BECOME ONE",title:`SUPER ${tower.doctrine.toUpperCase()} ${tower.pet.name}`,copy:"THE FIELD JUST CHANGED.",duration:2200,priority:9,icon:"✦"});setDefenseMessage("SUPER RIZO AWAKENED",tower.doctrine==="power"?"Massive damage. Same field, much bigger consequences.":"Massive reach, speed, and trail control.");writeDefenseCheckpoint(true,"super-rizo");defenseFeelPulseTower(tower,"upgraded",1100);duckMusic(1200,.055);sfx("defense-apex");defenseHaptic("apex");return true;}
  function showDefenseStructurePanel(tower){
    const panel=$("#defenseTowerPanel"),d=mini.defense,type=defenseStructureType(tower),meta=DEFENSE_STRUCTURE_META[type];if(!panel||!d||!type)return false;
    clearDefensePlacementMode();defenseCloseContextSurfaces("tower",{sync:false});d.selectedTowerId=tower.id;d.towers.forEach(item=>{const selected=item.id===tower.id;item.node?.classList.toggle("selected",selected);item.node?.setAttribute("aria-pressed",String(selected));});
    const upgradeCost=defenseUpgradeCost(tower,d),need=Math.max(0,upgradeCost-Math.floor(d.cash)),noSell=defenseContractRule("no-sell",d),sellLocked=!defenseSellAllowed(d),sell=defenseSellRefund(tower,d),nextName=tower.upgrade>=4?"MAXED OUT":defenseStructureUpgradeName({...tower,upgrade:tower.upgrade+1});let current,next,detail,synergy="";
    if(type==="factory"){
      current=defenseFactoryEconomy(tower,d);next=tower.upgrade<4?DefenseCore.factoryEconomy({upgradeLevel:tower.upgrade+1,wave:d.currentWave||d.clearedWave,goldenTowerCount:defenseAwakenedGoldenCount(d),beaconUpgradeLevel:defenseBeaconInfluence(tower,d)?.beacon?.upgrade??-1,cleanCycles:tower.factoryCleanCycles||0,brandLoop:Boolean(defenseBeaconInfluence(tower,d)?.network?.brandLoop),privateSun:Boolean(defenseBeaconInfluence(tower,d)?.network?.privateSun),goldenLicensed:Boolean(defenseBeaconInfluence(tower,d)?.network?.golden)}):current;
      const goldenPct=Math.round((current.goldenMultiplier-1)*100),beaconPct=Math.round((1-current.cadenceMultiplier)*100),momentumPct=Math.round((current.momentumMultiplier-1)*100),dropLabel=current.isDrop?(current.goldenLicensed?"GOLDEN DROP NEXT":current.privateSun?"SUN DROP NEXT":"RIZO DROP NEXT"):"NEXT PRINT";
      detail=`${dropLabel} • +${current.payout} GOLD • ${current.interval.toFixed(1)}S`;
      const parts=[`CLEAN STREAK ${current.cleanCycles}`,momentumPct?`MOMENTUM +${momentumPct}%`:"MOMENTUM BUILDING"];
      if(current.dropEvery)parts.push(`DROP EVERY ${current.dropEvery}`);if(current.brandLoop)parts.push("BRAND LOOP");if(current.goldenLicensed)parts.push("GOLDEN LICENSE");if(goldenPct)parts.push(`GOLDEN +${goldenPct}%`);if(beaconPct)parts.push(`LINE +${beaconPct}% SPEED`);parts.push(`${Math.round(tower.totalProduced||0)} PRINTED`);synergy=parts.join(" • ");
    }else{
      current=DefenseCore.beaconSupport(tower.upgrade);next=tower.upgrade<4?DefenseCore.beaconSupport(tower.upgrade+1):current;const network=defenseBeaconNetwork(tower,d)||{combat:0,factories:0,golden:0,brandLoop:false,privateSun:false};
      detail=`+${Math.round((current.rateMultiplier-1)*100)}% SPEED • +${Math.round((current.damageMultiplier-1)*100)}% IMPACT • ${Math.round(current.radius*100)}% FIELD`;
      if(tower.upgrade>=2)synergy=network.brandLoop?`${network.privateSun?"PRIVATE SUN LOOP":"BRAND LOOP LIVE"} • ${network.combat} RIZO • ${network.factories} FACTORY${network.factories===1?"":"IES"}${network.golden?` • ${network.golden} GOLDEN LICENSE`:""}`:`LINK A RIZO + FACTORY IN THIS FIELD • ${network.combat} RIZO • ${network.factories} FACTORY`;
      else synergy=`FACTORIES IN FIELD CYCLE ${Math.round((1-current.factoryCadenceMultiplier)*100)}% FASTER • STRONGEST BEACON ONLY`;
    }
    const nextCopy=tower.upgrade>=4?"THE END STATE":type==="factory"?`NEXT • +${next.payout} / ${next.interval.toFixed(1)}S${next.dropEvery?` • DROP ${next.dropEvery}`:""}`:`NEXT • +${Math.round((next.rateMultiplier-1)*100)}% SPEED • +${Math.round((next.damageMultiplier-1)*100)}% IMPACT`,upgradeText=tower.upgrade>=4?"MAXED OUT":need?`NEED ${need} MORE`:`UPGRADE • ${upgradeCost}`;
    panel.style.setProperty("--panel-accent",meta.accent);panel.hidden=false;panel.classList.add("rizo-field-sheet","v79-tower-shop","v80-tower-shop","defense-structure-panel");panel.innerHTML=`<button type="button" class="defense-sheet-close" data-defense-close-panel aria-label="Close structure controls">${defenseUiIcon("close")}</button><div class="defense-panel-hero v80 defense-structure-panel-hero"><span class="defense-panel-portrait"><span class="defense-structure-thumb structure-art-${type}" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span><div class="defense-panel-copy"><small>${meta.role} • UNIVERSAL STRUCTURE</small><b>${meta.name} <u>LV ${tower.upgrade+1}</u></b><em>${escapeHTML(defenseStructureUpgradeName(tower))}</em></div><div class="defense-panel-wallet"><small>GOLD</small><b>${defenseHudCounter(d.cash)} 🪙</b></div></div><div class="defense-structure-readout"><b>${escapeHTML(detail)}</b><span>${escapeHTML(synergy)}</span></div><button type="button" class="defense-upgrade-big ${need?"cant-afford":""}" data-defense-upgrade="${tower.id}" ${tower.upgrade>=4?"disabled":""}><span>${defenseUiIcon("upgrade")}</span><div><small>${escapeHTML(nextCopy)}</small><b>${escapeHTML(upgradeText)}</b></div></button><div class="defense-panel-simple-actions v80"><button type="button" class="target structure-info" disabled><i>${type==="factory"?"$":"☀"}</i><span><small>${meta.role}</small><b>${type==="factory"?"NO ATTACK":"AREA SUPPORT"}</b></span></button><button type="button" class="sell" data-defense-sell="${tower.id}" ${noSell||sellLocked?"disabled":""}><i>${defenseUiIcon("sell")}</i><span><small>${noSell?"LOCKED":sellLocked?"AFTER WAVE":"SELL"}</small><b>${noSell?"NO REFUNDS":sellLocked?"70% BACK":`${sell} 🪙`}</b></span></button></div><p class="defense-ability-one-line"><b>HOW IT WORKS</b> ${escapeHTML(defenseStructureRoleCopy(type))}</p>`;syncDefenseOverlayState();return true;
  }
  function upgradeDefenseStructure(tower){
    const d=mini.defense,type=defenseStructureType(tower);if(!d||!type||tower.upgrade>=DEFENSE_LIMITS.MAX_TOWER_LEVEL)return false;if(!defenseUpgradeAllowed(d)){setDefenseMessage("UPGRADE UNAVAILABLE","This structure cannot level up right now.");sfx("no");return false;}const cost=DefenseCore.structureUpgradeCost(type,tower.upgrade);if(d.cash<cost){const need=Math.max(1,cost-Math.floor(d.cash));setDefenseMessage(`NEED ${need} MORE COINS`,`${tower.pet.name} needs ${cost} to evolve.`);sfx("no");haptic([8,18,8]);return false;}
    d.cash-=cost;d.cashWriteCount=(d.cashWriteCount||0)+1;tower.spent+=cost;tower.upgrade+=1;if(type==="factory"){const econ=defenseFactoryEconomy(tower,d);tower.nextProductionAt=Math.min(tower.nextProductionAt||Infinity,defenseNow()+econ.interval);tower.factoryLastInterval=econ.interval;}syncDefenseTowerGeometry();const title=defenseStructureUpgradeName(tower),econ=type==="factory"?defenseFactoryEconomy(tower,d):null,support=type==="beacon"?DefenseCore.beaconSupport(tower.upgrade):null;
    let message=type==="factory"?`Production is now +${econ.payout} every ${econ.interval.toFixed(1)} live seconds.`:`Field now gives +${Math.round((support.rateMultiplier-1)*100)}% speed and +${Math.round((support.damageMultiplier-1)*100)}% impact.`,movie=tower.upgrade>=4?(type==="factory"?"THE LITTLE SHOP BECAME A DROP MACHINE.":"YOU BUILT A PRIVATE SUN."):"THE FIELD CHANGED.";
    if(type==="factory"&&tower.upgrade===1){message="Clean prints now build production momentum. A leak breaks the streak.";movie="THE SHOP LEARNS TO KEEP A RUN HOT.";}else if(type==="factory"&&tower.upgrade===2){message="RIZO DROPS ONLINE. Keep the Gate clean and every fourth print becomes a larger drop.";movie="PRINTS CAN BECOME DROPS NOW.";}else if(type==="beacon"&&tower.upgrade===2){message="BRAND LOOP ONLINE. Cover a Rizo and Factory in this field to accelerate Factory drops.";movie="MIX THE CREW WITH PRODUCTION.";}else if(type==="beacon"&&tower.upgrade===4){message="PRIVATE SUN ONLINE. A live Brand Loop now supercharges Factory drops; awakened Golden Rizos can license them.";movie="THE SUPPORT LIGHT BECAME INFRASTRUCTURE.";}
    setDefenseMessage(`${tower.pet.name} • ${title}`,message);showDefenseCinematicMoment(tower.upgrade>=4?"perfect":"upgrade",{kicker:type==="factory"?"PRODUCTION EVOLVED":"SUPPORT EVOLVED",title,copy:movie,duration:tower.upgrade>=4?1900:1150,priority:tower.upgrade>=4?8:3,icon:type==="factory"?"R":"☀"});showDefenseStructurePanel(tower);defenseCommitUpgrade(tower,{reason:"structure-upgrade"});return true;
  }

  function showDefenseTowerPanel(tower){
    if(defenseStructureType(tower))return showDefenseStructurePanel(tower);
    const panel=$("#defenseTowerPanel");if(!panel)return;panel.classList.remove("defense-structure-panel");if(mini.defense){clearDefensePlacementMode();defenseCloseContextSurfaces("tower",{sync:false});}
    const d=mini.defense,wasSelected=d.selectedTowerId===tower.id;d.selectedTowerId=tower.id;d.towers.forEach(item=>{const selected=item.id===tower.id;item.node?.classList.toggle("selected",selected);item.node?.setAttribute("aria-pressed",String(selected));});if(!wasSelected){defenseFeelPulseTower(tower,"selected",280);const real=defenseRealNow(d);if(real-(d.lastSelectionSfxAtReal||-99)>.08){d.lastSelectionSfxAtReal=real;sfx("defense-select");defenseHaptic("select");}}
    const universal=defenseIsUniversalTower(tower),variantId=tower.pet.variant||tower.pet.hiddenVariant||"classic",variantData=universal?{name:"UNIVERSAL DEFENSE TOOL",color:defenseTowerDisplayColor(tower)}:(VARIANTS.find(item=>item.id===variantId)||VARIANTS[0]),mapBond=defenseMapBondForTower(tower,d),stats=defenseCombatStats(tower),nextStats=tower.upgrade<4?defenseCombatStats({...tower,upgrade:tower.upgrade+1}):stats,upgradeCost=defenseUpgradeCost(tower,d),target=DEFENSE_TARGET_LABELS[tower.targetMode||"first"],needsDoctrine=tower.upgrade>=2&&!tower.doctrine,forced=defenseContractForcedDoctrine(d),noSell=defenseContractRule("no-sell",d),sell=defenseSellRefund(tower,d),sellLocked=!defenseSellAllowed(d),leader=defenseFieldLeader(d),isLeader=!universal&&leader?.id===tower.id,power=defenseAbilityPresentation(tower),remaining=Math.ceil(defenseAbilityRemaining(tower));
    const damageGain=Math.max(0,Math.round((nextStats.damage/Math.max(.01,stats.damage)-1)*100)),rangeGain=Math.max(0,Math.round((nextStats.range/Math.max(.01,stats.range)-1)*100)),rateGain=Math.max(0,Math.round((nextStats.rate/Math.max(.01,stats.rate)-1)*100)),needCoins=Math.max(0,upgradeCost-Math.floor(d.cash));
    panel.style.setProperty("--panel-accent",variantData.color||"#ff784f");panel.hidden=false;panel.classList.add("rizo-field-sheet","v79-tower-shop","v80-tower-shop");panel.classList.toggle("universal-tool-panel",universal);
    const openingDeal=!universal&&defenseUpgradeModifier(tower,d)<1,nextCopy=tower.upgrade>=4?"MAX LEVEL":`${openingDeal?"OPENING DEAL • ":""}${defenseUpgradeMove(tower)}`,pathCopy=universal?{power:["◆","POWER","Rivets hit harder, crack armor, and burst through clustered threats."],control:["⌁","CONTROL","Pins attack faster, reach farther, slow, root, and rewind runners."]}: {power:["◆","POWER","Damage, armor breaks, boss pressure."],control:["⌁","CONTROL","Reach, slows, roots, rewinds, interrupts."]},pathPicker=needsDoctrine?`<div class="defense-path-choice"><small>CHOOSE HOW ${escapeHTML(tower.pet.name).toUpperCase()} FIGHTS</small><div><button type="button" data-defense-doctrine="${tower.id}:power" ${forced&&forced!=="power"?"disabled":""}><i>${pathCopy.power[0]}</i><b>${pathCopy.power[1]}</b><span>${pathCopy.power[2]}</span></button><button type="button" data-defense-doctrine="${tower.id}:control" ${forced&&forced!=="control"?"disabled":""}><i>${pathCopy.control[0]}</i><b>${pathCopy.control[1]}</b><span>${pathCopy.control[2]}</span></button></div></div>`:"",upgradeText=tower.upgrade>=4?"MAXED OUT":needsDoctrine?"CHOOSE A PATH FIRST":needCoins?`NEED ${needCoins} MORE`:`LEVEL UP • ${upgradeCost}`;
    const leaderCopy=universal?`UNIVERSAL TOOL • ${tower.doctrine?tower.doctrine.toUpperCase()+" PATH":"NO FIELD POWER"}`:isLeader?(tower.upgrade<2?"FIELD LEADER • POWER UNLOCKS AT LV 3":!tower.doctrine?"FIELD LEADER • CHOOSE A PATH":remaining?`FIELD LEADER • ${power.active} ${remaining}s`:`FIELD LEADER • ${power.active}`):`FIELD SUPPORT • ${tower.doctrine?`${tower.doctrine.toUpperCase()} PATH`:"NO PATH YET"}`,superReady=defenseCanAscend(tower,d),superMarkup=universal?"":tower.superForm?`<div class="defense-super-status"><small>SUPER RIZO</small><b>${escapeHTML(tower.superForm.toUpperCase())} FORM</b><span>${tower.superForm==="power"?"2.75× impact core":"Massive reach + control tempo"}</span></div>`:superReady?`<button type="button" class="defense-super-button" data-defense-super="${tower.id}"><small>SACRIFICE 9 MATCHING COPIES</small><b>ASCEND TO SUPER ${escapeHTML(tower.doctrine.toUpperCase())}</b></button>`:"";
    const portrait=defenseTowerPortraitMarkup(tower,"defense-panel-rizo","thumbnail"),roleLine=universal?`<b>ROLE</b> ${escapeHTML(defenseAbilityData(tower).passive)}`:`<b>${isLeader?"FIELD POWER":"ROLE"}</b> ${escapeHTML(defenseAbilityData(tower).passive+" "+(isLeader?power.copy:""))}`;
    panel.innerHTML=`<button type="button" class="defense-sheet-close" data-defense-close-panel aria-label="Close defender controls">${defenseUiIcon("close")}</button><div class="defense-panel-hero v80"><span class="defense-panel-portrait">${portrait}</span><div class="defense-panel-copy"><small>${escapeHTML(variantData.name)} • ${escapeHTML(stats.label)}</small><b>${escapeHTML(tower.pet.name)} <u>LV ${tower.upgrade+1}</u></b><em>${escapeHTML(leaderCopy)}</em></div><div class="defense-panel-wallet"><small>GOLD</small><b>${defenseHudCounter(d.cash)} 🪙</b></div></div>${defenseEvolutionRailMarkup(tower)}${pathPicker}<button type="button" class="defense-upgrade-big ${needCoins?"cant-afford":""}" data-defense-upgrade="${tower.id}" ${tower.upgrade>=4||needsDoctrine?"disabled":""}><span>${defenseUiIcon("upgrade")}</span><div><small>${escapeHTML(nextCopy)}</small><b>${escapeHTML(upgradeText)}</b>${tower.upgrade<4&&!needsDoctrine?`<em class="defense-upgrade-deltas"><u>+${damageGain}% DMG</u><u>+${rateGain}% SPD</u><u>+${rangeGain}% RNG</u></em>`:""}</div></button>${superMarkup}<div class="defense-panel-simple-actions v80"><button type="button" class="target" data-defense-target="${tower.id}"><i>${defenseUiIcon("target")}</i><span><small>TARGET</small><b>${target}</b></span></button><button type="button" class="sell" data-defense-sell="${tower.id}" ${noSell||sellLocked?"disabled":""} aria-label="Sell ${escapeHTML(tower.pet.name)}"><i>${defenseUiIcon("sell")}</i><span><small>${noSell?"LOCKED":sellLocked?"AFTER WAVE":"SELL"}</small><b>${noSell?"NO REFUNDS":sellLocked?"70% BACK":`${sell} 🪙`}</b></span></button></div><p class="defense-ability-one-line">${roleLine}</p>${mapBond?`<p class="defense-map-bond-copy"><b>${escapeHTML(mini.defense.map.mechanic?.icon||"✦")} MAP BOND • ${escapeHTML(mapBond.label)}</b><span>${escapeHTML(mapBond.copy)}</span></p>`:""}`;syncDefenseOverlayState();
  }

  function updateDefenseAbilityPanel(){const d=mini.defense;if(!d?.selectedTowerId)return;const tower=d.towers.find(item=>item.id===d.selectedTowerId),upgrade=$("[data-defense-upgrade]");if(!tower)return;if(defenseStructureType(tower)){if(upgrade&&tower.upgrade<4){const cost=defenseUpgradeCost(tower,d),need=Math.max(0,cost-Math.floor(d.cash));upgrade.classList.toggle("cant-afford",need>0);const b=upgrade.querySelector("b");if(b)b.textContent=need?`NEED ${need} MORE`:`UPGRADE • ${cost}`;}return;}if(upgrade&&tower.upgrade<4&&!(tower.upgrade>=2&&!tower.doctrine)){const cost=defenseUpgradeCost(tower,d),need=Math.max(0,cost-Math.floor(d.cash));upgrade.classList.toggle("cant-afford",need>0);const b=upgrade.querySelector("b");if(b)b.textContent=need?`NEED ${need} MORE`:`LEVEL UP • ${cost}`;}tower.node?.classList.toggle("range-weakened",tower.rangeDebuffUntil>defenseNow());}
  function closeDefenseTowerPanel(){defenseClearTowerSelection();syncDefenseOverlayState();}
  function upgradeDefenseTower(id,{showPanel=true}={}){
    const d=mini.defense,tower=d?.towers.find(t=>t.id===id);if(!tower||tower.upgrade>=DEFENSE_LIMITS.MAX_TOWER_LEVEL)return;if(defenseStructureType(tower))return upgradeDefenseStructure(tower);if(!defenseUpgradeAllowed(d)){setDefenseMessage("UPGRADE UNAVAILABLE","This Rizo cannot level up right now.");sfx("no");return false;}if(tower.upgrade>=2&&!tower.doctrine){showDefenseTowerPanel(tower);setDefenseMessage("CHOOSE A PATH FIRST","POWER and CONTROL change the rest of this Rizo's run.");sfx("no");return false;}
    const before=defenseCombatStats(tower),modifier=defenseUpgradeModifier(tower,d),cost=defenseUpgradeCost(tower,d);if(d.cash<cost){const need=Math.max(1,cost-Math.floor(d.cash));$(".defense-stat-cash")?.classList.remove("money-nope");void $(".defense-stat-cash")?.offsetWidth;$(".defense-stat-cash")?.classList.add("money-nope");setDefenseMessage(`NEED ${need} MORE COINS`,`${tower.pet.name} needs ${cost} to level up.`);sfx("no");haptic([8,18,8]);return false;}d.cash-=cost;d.cashWriteCount=(d.cashWriteCount||0)+1;tower.spent+=cost;tower.upgrade+=1;if(modifier<1){d.worldPerkUsed=true;tower.openingPerkApplied=true;}tower.targetId=null;tower.retargetAt=0;tower.retargetAtReal=0;refreshDefenseTower(tower);const after=defenseCombatStats(tower),universal=defenseIsUniversalTower(tower),variant=universal?null:(VARIANTS.find(item=>item.id===(tower.pet.variant||tower.pet.hiddenVariant||"classic"))||VARIANTS[0]),upgradeColor=defenseTowerDisplayColor(tower),damageGain=Math.round((after.damage/Math.max(.01,before.damage)-1)*100),rateGain=Math.round((after.rate/Math.max(.01,before.rate)-1)*100),rangeGain=Math.round((after.range/Math.max(.01,before.range)-1)*100);    const world=$("#defenseWorld"),fx=document.createElement("div");world?.classList.remove("defense-upgrade-hit");void world?.offsetWidth;world?.classList.add("defense-upgrade-hit");fx.className=`defense-upgrade-burst tier-${defenseTowerTier(tower)} ${universal?"universal-basic-upgrade":""} ${tower.y<.34?"labels-below":tower.y>.66?"labels-above":"labels-center"}`;fx.style.left=`${tower.x*100}%`;fx.style.top=`${tower.y*100}%`;fx.style.setProperty("--upgrade-color",upgradeColor);if(variant?.sprite)fx.style.setProperty("--upgrade-silhouette",`url("${variant.sprite}")`);fx.innerHTML=`<i class="defense-upgrade-silhouette"></i><i></i><i></i><i></i><i></i><b>${escapeHTML(defenseUpgradeName(tower))}</b><span>+${damageGain}% DMG • +${rateGain}% SPEED • +${rangeGain}% RANGE</span>`;$("#defenseEffects")?.appendChild(fx);queueMiniTimeout(()=>{fx.remove();world?.classList.remove("defense-upgrade-hit");},1450);
    setDefenseMessage(`${tower.pet.name} GOT STRONGER`,tower.upgrade===2?"A NEW FIGHTING PATH IS READY.":`LEVEL ${tower.upgrade+1} • ${defenseUpgradeName(tower)}`);showDefenseCinematicMoment("upgrade",{title:defenseUpgradeName(tower),copy:tower.upgrade===2?"DOCTRINE UNLOCKED • CHOOSE POWER OR CONTROL":`LEVEL ${tower.upgrade+1} • ${damageGain}% DAMAGE`});if(showPanel||tower.upgrade===2&&!tower.doctrine)showDefenseTowerPanel(tower);defenseCommitUpgrade(tower,{reason:"upgrade"});return true;
  }
  function cycleDefenseTarget(id,{showPanel=true}={}){const tower=mini.defense?.towers.find(item=>item.id===id);if(!tower)return;const current=DEFENSE_TARGET_MODES.indexOf(tower.targetMode||"first");tower.targetMode=DEFENSE_TARGET_MODES[(current+1)%DEFENSE_TARGET_MODES.length];tower.targetId=null;tower.retargetAt=0;tower.retargetAtReal=0;completeDefenseSchoolLesson("targeting");markDefenseUi();if(showPanel)showDefenseTowerPanel(tower);else flushDefenseUi(true);writeDefenseCheckpoint(true,"target");setDefenseMessage(`${tower.pet.name} TARGETS ${DEFENSE_TARGET_LABELS[tower.targetMode]}`,tower.targetMode==="strong"?"Prioritizes the toughest balloon in range.":tower.targetMode==="last"?"Cleans up balloons furthest from the gate.":tower.targetMode==="close"?"Protects the space nearest this Rizo.":"Guards the balloon closest to the Ember Gate.");sfx("ui");}
  function chooseDefenseDoctrine(id,doctrine){const d=mini.defense,tower=d?.towers.find(item=>item.id===id),forced=defenseContractForcedDoctrine(d);if(!tower||tower.upgrade<2||tower.doctrine||!DEFENSE_DOCTRINES[doctrine])return false;if(forced&&doctrine!==forced){setDefenseMessage(`${forced.toUpperCase()} OATH`,`This Trail Contract rejects the ${doctrine.toUpperCase()} path.`);sfx("no");return false;}tower.doctrine=doctrine;if(defenseIsUniversalTower(tower))tower.targetMode=doctrine==="power"?"strong":"first";completeDefenseSchoolLesson("doctrine");refreshDefenseTower(tower);showDefenseTowerPanel(tower);markDefenseUi({roster:true});flushDefenseUi(true);const data=DEFENSE_DOCTRINES[doctrine],universal=defenseIsUniversalTower(tower);writeDefenseCheckpoint(true,"doctrine");if(universal){setDefenseMessage(`${tower.pet.name} BUILT ${doctrine.toUpperCase()}`,doctrine==="power"?"Rivets now crack armor and burst through packed threats.":"Pins now slow, reveal, and hold fast runners in the lane.");showDefenseCinematicMoment("upgrade",{title:doctrine==="power"?"RIVET DRIVER":"PIN RIG",copy:`UNIVERSAL TOOL • ${data.name}`});spawnDefenseImpact(tower.x,tower.y,doctrine==="power"?"power":"control",0,tower);}else{setDefenseMessage(`${tower.pet.name} CHOSE ${data.name}`,doctrine==="power"?"Every fifth shot cracks the formation.":"Every fifth shot restrains and reveals the trail.");showDefenseCinematicMoment("ability",{title:`${defenseAbilityData(tower).active} ONLINE`,copy:`${tower.pet.name} • ${data.name}`});spawnDefenseAbilityFx(tower,doctrine==="power"?"ember":"aurora");}defenseFeelPulseTower(tower,"upgraded",760);duckMusic(680,.11);sfx("defense-upgrade");defenseHaptic("upgrade");return true;}

  function requestSellDefenseTower(id){const d=mini.defense,tower=d?.towers.find(t=>t.id===id),panel=$("#defenseTowerPanel");if(!tower||!panel)return false;if(!defenseSellAllowed(d)||defenseContractRule("no-sell",d))return sellDefenseTower(id);const refund=defenseSellRefund(tower,d);panel.insertAdjacentHTML("beforeend",`<div class="defense-sell-confirm" role="alertdialog" aria-label="Confirm sale"><b>SELL ${escapeHTML(tower.pet.name).toUpperCase()}?</b><span>You get ${refund} 🪙 back. This Rizo leaves the field.</span><div><button type="button" data-defense-cancel-sell>KEEP RIZO</button><button type="button" class="danger" data-defense-confirm-sell="${tower.id}">YES, SELL</button></div></div>`);panel.querySelector("[data-defense-confirm-sell]")?.focus?.();return true;}
  function sellDefenseTower(id){const d=mini.defense,tower=d?.towers.find(t=>t.id===id);if(!tower)return false;if(defenseContractRule("no-sell",d)){setDefenseMessage("CONTRACT • NO REFUNDS","This placement is permanent until the run ends.");sfx("no");return false;}if(!defenseSellAllowed(d)){setDefenseMessage("SELLING LOCKED IN COMBAT","Bank the run or wait for planning. Combat selling cannot erase mistakes.");sfx("no");return false;}const undo=defenseCanUndoPlacement(tower,d),refund=defenseSellRefund(tower,d);d.cash=DefenseCore.clampNumber(d.cash+refund,0,DEFENSE_LIMITS.MAX_RUN_CASH,d.cash);d.cashWriteCount=(d.cashWriteCount||0)+1;tower.node?.remove();d.towers=d.towers.filter(t=>t!==tower);refreshDefenseMapBondVisuals();refreshDefenseSupportVisuals(d);closeDefenseTowerPanel();markDefenseUi({roster:true});updateDefenseRoster();updateDefenseHud();if(d.towers.length)writeDefenseCheckpoint(true,"sell");else clearDefenseCheckpoint();setDefenseMessage(undo?`PLACEMENT UNDONE • +${refund}`:`${defenseStructureType(tower)?"STRUCTURE":"RIZO"} SOLD • +${refund}`,undo?"Full refund within the five-second planning undo window.":"Planning refunds return 70% of total investment.");sfx(undo?"defense-deploy":"defense-sell");defenseHaptic(undo?"deploy":"sell");return true;}
  const DEFENSE_WAVE_FLAVOR=Object.freeze({
    grove:["Easy now. Watch where the first ones drift.","Good. Now cover the bend.","A few faster ones are testing the trail.","Do not chase every balloon. Build the field.","The forest is starting to push back.","They found another way through. Stay calm.","Your Rizos know the trail now.","This one asks for coverage, not panic.","Save a few coins. Something big is coming.","The trees went quiet. Boss incoming."],
    ember:["Heat makes everything look faster. Read the road.","Keep one eye on the Gate.","The hot trail rewards hard hits.","Do not let the fire rush your decisions.","They are testing the inside bend.","Your flame is holding. Make it stronger.","A tougher shell is entering the heat.","Leave room for one more answer.","The volcano is rumbling. Save something.","Big shadow in the smoke. Boss incoming."],
    moon:["Moonlight hides more than it shows.","Watch the silhouettes, not the sparkle.","Fast shapes are slipping through the dark.","Sight matters now. Build with intention.","Something is learning to disappear.","The moon gives you a second to read it.","Keep coverage on both halves of the trail.","If it fades, your awakened Rizos still know.","The whole trail feels watched.","Do not blink. Boss incoming."],
    storm:["The wind is quiet for now.","Fast balloons love a straight mistake.","Control the trail before the storm does.","A good slow is worth more than another panic buy.","Lightning is changing the rhythm.","Hold the bend. Let them come to you.","The next surge will punish weak coverage.","Your field should feel like a net now.","Save a power. The clouds are charging.","Thunder stopped. Boss incoming."],
    blizzard:["Cold makes distance hard to judge. Trust the ring.","Keep your Rizos close enough to help each other.","Frozen balloons do not care about weak slows.","Power and coverage beat pretty placement.","The trail is disappearing under snow.","Do not spend just because you can.","A heavy wave is moving through the whiteout.","Your strongest Rizo should have a job.","One more calm breath before the storm.","The snow split open. Boss incoming."],
    eclipse:["The light is leaving. Build for what you cannot see.","A clean field beats a crowded one.","Hidden threats are testing your weakest angle.","Do not let the darkness make you rush.","Your upgraded Rizos can read deeper into the trail.","Now the world starts mixing its tricks.","Keep one answer ready instead of spending everything.","The Gate is still bright. Protect that advantage.","Everything went still. Save your powers.","Something enormous moved in the dark. Boss incoming."]
  });
  function defenseWaveFlavor(mapId,wave,{cleared=false,perfect=false}={}){const lines=DEFENSE_WAVE_FLAVOR[mapId]||DEFENSE_WAVE_FLAVOR.grove,index=Math.max(0,Math.floor(wave)-1);if(index<lines.length)return lines[index];if(wave%10===0)return"That is not a normal balloon. Hold the Gate.";if(cleared&&perfect)return["Not one got through.","Clean field. Keep that flame alive.","That was surgical.","The Gate did not even flinch."][wave%4];if(cleared)return["Good hold. The next wave changes the question.","You bought yourself a breath. Use it.","Still alive. Spend with a plan.","The trail is learning your defense."][wave%4];return["Read the road.","Watch the front balloon.","Let the field do its job.","Save something for the surprise."][wave%4];}

  function defenseBossForWave(wave){const ordinal=Math.max(0,Math.floor(wave/10)-1),base=DEFENSE_BOSSES[ordinal%DEFENSE_BOSSES.length],intensity=Math.floor(ordinal/DEFENSE_BOSSES.length);return{...base,intensity};}
  function defenseWavePlan(wave){
    const d=mini.defense,plan=DefenseCore.createWavePlan({wave,specialBias:d.map.specialBias||0,weather:d.map.weather,bossIds:DEFENSE_BOSSES.map(item=>item.id)});d.waveAnnouncement=plan.announcement;
    const bossEntry=DefenseCore.flattenPackets(plan.packets).find(entry=>typeof entry==="object"&&entry?.type==="boss");if(bossEntry){const boss=DEFENSE_BOSSES.find(item=>item.id===bossEntry.bossId)||defenseBossForWave(wave),tier=Math.max(0,Number(bossEntry.intensity)||0);d.waveAnnouncement={title:plan.modifier==="boss-remix"?`${boss.name} • BOSS REMIX ${tier+1}`:`${boss.name} • BOSS WAVE`,copy:plan.announcement?.copy||boss.hint};}
    return plan;
  }
  function startDefenseWave(){
    const d=mini.defense;if(defenseIsActiveWave(d)||!d.towers.length||!DefenseCore.phaseAllows(d.phase,"start")||d.clearedWave>=DEFENSE_LIMITS.MAX_SUPPORTED_WAVE)return false;if(defenseRealNow(d)<(d.nextWaveReadyAtReal||0)){setDefenseMessage("FIELD SETTLING","Give the last pop half a second to land. Then the next formation is yours to call.");return false;}
    d.autoStartAtReal=0;flushDefenseIncome(d,"wave-start");completeDefenseSchoolLesson("route",{silent:true});d.intelOpen=false;d.intelPausedByOpen=false;clearDefensePlacementMode();closeDefenseTowerPanel();d.currentWave=DefenseCore.clampInteger(d.currentWave+1,1,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,1);defenseSetPhase(d,DEFENSE_PHASES.COUNTDOWN);const plan=defenseWavePlan(d.currentWave);d.wavePackets=plan.packets.map(packet=>({enemies:packet.enemies.map(entry=>typeof entry==="string"?entry:{...entry}),spawnGap:packet.spawnGap,breakAfter:packet.breakAfter}));d.packetIndex=0;d.packetEnemyIndex=0;d.spawnQueue=DefenseCore.flattenPackets(d.wavePackets).map(entry=>typeof entry==="string"?entry:{...entry});d.currentWavePlan=d.spawnQueue.map(entry=>typeof entry==="string"?entry:{...entry});d.childSpawnQueue=[];d.nextChildReleaseAtReal=defenseRealNow(d);d.childSpawnSequence=0;d.targetSnapshot=[];d.targetSnapshotAtReal=0;d.waveTotal=d.spawnQueue.length;d.waveResolved=0;d.nextSpawnAt=d.clock+(d.currentWave===1?.55:.8);d.packetBreakUntil=0;d.lastSpawnedEnemyId=null;d.spawnWaitReason="countdown";d.peakAlive=0;d.waveHeartLossStart=d.enemyStats.heartLoss;d.nextWeatherAt=Math.min(d.nextWeatherAt,d.clock+5.5);
    const announcement=d.waveAnnouncement,world=$("#defenseWorld"),bossWave=Boolean(announcement?.title?.includes("BOSS"));world?.classList.remove("wave-cue");void world?.offsetWidth;world?.classList.add("wave-cue");queueMiniTimeout(()=>world?.classList.remove("wave-cue"),1050);hideDefenseMessage();showDefenseCinematicMoment(bossWave?"boss":"wave-start",{title:bossWave?(announcement?.title||"BOSS INCOMING"):`WAVE ${d.currentWave} • ${announcement?.title||"HOLD THE GATE"}`,copy:bossWave?(announcement?.copy||"HOLD THE GATE"):(announcement?.copy||defenseWaveFlavor(d.mapId,d.currentWave)),duration:bossWave?1750:820});markDefenseUi();flushDefenseUi(true);writeDefenseCheckpoint(true,"wave-start");sfx("event");return true;
  }

  function defenseEnemyCamoActive(enemy,time=defenseNow()){const d=mini.defense;if(!d||!enemy)return false;return Boolean((enemy.camo||d.eclipseUntil>time||d.ashUntil>time)&&d.moonRevealUntil<=time&&enemy.revealUntil<=time);}
  function revealDefenseEnemy(enemy,duration=2.5,tower=null){if(!enemy||enemy.dead)return false;const d=mini.defense,time=defenseNow(),wasCamo=defenseEnemyCamoActive(enemy,time),wasPhase=Boolean(enemy.phasing&&enemy.phaseSuppressedUntil<=time&&d.moonRevealUntil<=time);enemy.revealUntil=Math.max(enemy.revealUntil||0,time+duration);if(enemy.phasing)enemy.phaseSuppressedUntil=Math.max(enemy.phaseSuppressedUntil||0,time+duration);if(wasCamo&&!enemy.revealCredited){enemy.revealCredited=true;d.enemyStats.counters.reveals+=1;}if(wasPhase&&!enemy.phaseLockCredited){enemy.phaseLockCredited=true;d.enemyStats.counters.phaseLocks+=1;}if(wasCamo||wasPhase){spawnDefenseImpact(enemy.x||0,enemy.y||0,"reveal");updateDefenseEnemyNode(enemy);}return wasCamo||wasPhase;}
  function shredDefenseArmor(enemy,amount=.04,tower=null){if(!enemy||enemy.dead||enemy.armor<=0)return false;const before=enemy.armor;enemy.armor=Math.max(0,enemy.armor-Math.max(0,amount));if(before-enemy.armor>.005){mini.defense.enemyStats.counters.armorShreds+=1;enemy.armorShredded=true;spawnDefenseImpact(enemy.x||0,enemy.y||0,"armor");updateDefenseEnemyNode(enemy);return true;}return false;}
  function applyDefenseEnemyThresholds(enemy,tower=null){if(!enemy||enemy.dead||enemy.hp<=0)return;const ratio=enemy.hp/enemy.maxHp,breakable=enemy.type==="shell"||enemy.type==="brick";if(breakable&&!enemy.armorBroken&&ratio<=.5){enemy.armorBroken=true;enemy.armor=Math.min(enemy.armor,enemy.type==="brick"?.02:.06);mini.defense.enemyStats.counters.armorBreaks+=1;spawnDefenseImpact(enemy.x||0,enemy.y||0,"armor");updateDefenseEnemyNode(enemy);if(!mini.defense.hintFlags.armorBreak){mini.defense.hintFlags.armorBreak=true;setDefenseMessage(enemy.type==="brick"?"CERAMIC SHELL CRACKED":"IRON PLATE BROKEN",enemy.type==="brick"?"The heavy shell finally gave. Finish the exposed balloon.":"Below half health, Iron Balloons lose most of their armor. Finish the exposed core.");}}}

  function createDefenseEnemyNode(){
    const node=document.createElement("div");
    node.className="defense-enemy";
    node.innerHTML=`<span class="balloon-body"><i class="balloon-shine"></i><b class="balloon-face"><u></u><u></u><em>×××</em></b></span><span class="balloon-knot"></span><span class="balloon-string"></span><span class="balloon-trait" aria-hidden="true"></span><span class="balloon-state" aria-hidden="true"></span><span class="balloon-health"><i></i></span>`;
    node._rizoTrait=node.querySelector(".balloon-trait");
    node._rizoState=node.querySelector(".balloon-state");
    return node;
  }
  function acquireDefenseProjectileNode(){
    const d=mini.defense,host=$("#defenseProjectiles");if(!d||!host)return null;let node=d.projectileNodePool.pop();if(!node){node=document.createElement("i");d.projectileNodesCreated=(d.projectileNodesCreated||0)+1;}node.hidden=false;node.removeAttribute("style");node._rizoMoveX=NaN;node._rizoMoveY=NaN;node.className="defense-shot";host.appendChild(node);d.projectileNodesAcquired=(d.projectileNodesAcquired||0)+1;return node;
  }
  function releaseDefenseProjectileNode(shot){
    const d=mini.defense,node=shot?.node;if(!d||!node)return;node.remove();node.hidden=true;node.className="defense-shot";node.removeAttribute("style");node._rizoMoveX=NaN;node._rizoMoveY=NaN;shot.node=null;if(d.projectileNodePool.length<96)d.projectileNodePool.push(node);
  }

  function acquireDefenseEnemyNode(){
    const d=mini.defense;let node=d.enemyNodePool.pop();if(!node){node=createDefenseEnemyNode();d.enemyNodesCreated=(d.enemyNodesCreated||0)+1;}
    node.hidden=false;node.removeAttribute("style");node.className="defense-enemy";node.dataset.enemyId="";
    if(!node._rizoTrait)node._rizoTrait=node.querySelector(".balloon-trait");
    if(!node._rizoState)node._rizoState=node.querySelector(".balloon-state");
    if(node._rizoState){node._rizoState.textContent="";node._rizoState.hidden=true;}
    $("#defenseEnemies")?.appendChild(node);d.enemyNodesAcquired=(d.enemyNodesAcquired||0)+1;return node;
  }

  function releaseDefenseEnemyNode(enemy){
    const d=mini.defense,node=enemy?.node;if(!node)return;
    node.remove();node.hidden=true;node.className="defense-enemy";node.dataset.enemyId="";node.removeAttribute("style");
    if(node._rizoState){node._rizoState.textContent="";node._rizoState.hidden=true;}
    enemy.node=null;enemy.visualSignature="";enemy.stateSignature="";enemy.lastRenderedHealth=-1;enemy.lastRenderX=NaN;enemy.lastRenderY=NaN;
    if(d&&d.enemyNodePool.length<64)d.enemyNodePool.push(node);
  }

  function queueDefenseChildSpawn(entry,{progress=0,delay=0,options={}}={}){
    const d=mini.defense,clean=defenseQueueEntry(entry);if(!d||!clean)return false;if(d.childSpawnQueue.length>=DEFENSE_LIMITS.MAX_CHILD_BUFFER){defenseRecordValidationWarning("child-buffer-cap",{wave:d.currentWave});return false;}const item={entry:clean,progress:clamp(progress,0,.995),releaseAt:d.clock+Math.max(.04,delay),sequence:(d.childSpawnSequence=(d.childSpawnSequence||0)+1),options:{...options}},index=d.childSpawnQueue.findIndex(queued=>queued.releaseAt>item.releaseAt||(queued.releaseAt===item.releaseAt&&(queued.sequence||0)>item.sequence));if(index<0)d.childSpawnQueue.push(item);else d.childSpawnQueue.splice(index,0,item);return true;
  }
  function releaseDefenseChildSpawn(d){if(!d?.childSpawnQueue?.length)return false;const child=d.childSpawnQueue[0];if(child.releaseAt>d.clock||!defenseDensityAllowsSpawn(d,child.entry,true))return false;d.childSpawnQueue.shift();spawnDefenseEnemy(child.entry,{progress:child.progress,...child.options});d.nextChildReleaseAtReal=defenseRealNow(d);d.childSpawnsReleased=(d.childSpawnsReleased||0)+1;return true;}

  function spawnDefenseEnemy(entry,options={}){
    const descriptor=typeof entry==="string"?{type:entry}:entry||{type:"puff"},type=descriptor.type||"puff",d=mini.defense,boss=type==="boss"?DEFENSE_BOSSES.find(item=>item.id===(descriptor.bossId||"crown"))||DEFENSE_BOSSES[0]:null,base=boss||DEFENSE_ENEMIES[type]||DEFENSE_ENEMIES.puff,scale=defenseHealthScale(d.currentWave||d.wave)*(d.map.hp||1)*(boss?1+Math.min(12,descriptor.intensity||0)*.10:1)*defenseDurabilityScale(d.currentWave||d.wave,{boss:Boolean(boss)}),hp=Number(options.hpOverride)||base.hp*scale;
    const point=defensePointAt(Number.isFinite(options.progress)?options.progress:0),baseVisualClass=boss?`balloon-boss ${boss.className}`:base.className;
    const enemy={id:`enemy-${d.nextId++}`,type,bossId:boss?.id||null,bossIntensity:descriptor.intensity||0,bossChild:Boolean(options.bossChild),progress:Number.isFinite(options.progress)?options.progress:0,x:point.x,y:point.y,prevX:point.x,prevY:point.y,hp,maxHp:Number(options.maxHpOverride)||hp,speed:base.speed*(1+Math.min(.22,d.wave*.006))*(d.map.speed||1),reward:DefenseCore.calculateEnemyReward(base.reward,d.currentWave,{rewardScale:options.rewardScale??1}),damage:base.damage,baseArmor:base.armor||0,armor:base.armor||0,armorBroken:false,armorShredded:false,fireproof:Boolean(base.fireproof),slowResist:base.slowResist||0,stormPulse:Boolean(base.stormPulse),stormCharging:false,supportAura:Boolean(base.supportAura),healer:Boolean(base.healer),supportCycle:Math.floor((d.clock+((d.nextId%11)*.37))/3.6),relayBoosted:false,supportFlashUntil:0,phasing:Boolean(base.phasing),camo:Boolean(base.camo),phaseOffset:(d.nextId%11)*.37,phaseActive:false,revealUntil:0,phaseSuppressedUntil:0,revealCredited:false,phaseLockCredited:false,slow:0,slowUntil:0,burn:0,burnUntil:0,burnSource:null,poison:0,poisonUntil:0,poisonSource:null,rootUntil:0,hitFlash:0,phaseTriggered:false,bossPhase:0,signalStaggerUntil:0,nextBossPulse:d.clock+4,telegraphKind:null,telegraphStartedAt:0,telegraphUntil:0,telegraphDisruption:0,apexSurgeUntil:0,bossMechanicLocked:false,baseVisualClass,renderColor:base.color,renderIcon:base.icon||"○",renderName:base.name||type,renderSkin:"clean",renderCamo:false,renderRevealed:false,renderStateSymbol:"",visualSignature:"",stateSignature:"",lastRenderedHealth:-1,lastRenderX:NaN,lastRenderY:NaN,node:null};enemy.feelEnterUntil=boss&&!options.bossChild?defenseNow()+.9:0;
    const node=defenseUsesCanvas(d)?null:acquireDefenseEnemyNode();if(node){node.className=`defense-enemy ${baseVisualClass}`;node.dataset.enemyId=enemy.id;node.style.setProperty("--balloon-color",base.color);if(node._rizoTrait)node._rizoTrait.textContent=base.icon||"○";enemy.node=node;}d.enemies.push(enemy);d.peakAlive=Math.max(d.peakAlive||0,d.enemies.length);mini.entities.push(enemy);if(!options.skipAnalytics)defenseRecordEnemyStat("spawned",boss?`boss:${boss.id}`:type);updateDefenseEnemyNode(enemy,true);if(boss&&!options.bossChild){enemy.node?.classList.add("boss-entering");queueMiniTimeout(()=>enemy.node?.classList.remove("boss-entering"),900);defenseBossStagePulse("arrival",boss.id,920);showDefenseCinematicMoment("boss",{title:boss.name,copy:boss.trait,kicker:`WAVE ${d.currentWave} • BOSS ENTRANCE`});duckMusic(1150,.07);defenseBossCue("arrival",boss.id);defenseHaptic("bossWarn");}if(enemy.camo&&!d.camoHintSeen){d.camoHintSeen=true;setDefenseMessage("SHADE BALLOON", "BASE RIZOS ONLY DEAL 25% DAMAGE. AWAKEN OR USE SHADOW, AURORA, OR GLITCH.");}return enemy;
  }

  function defenseEnemySkin(enemy,time){
    if(enemy.burnUntil>time)return"burn";
    if(enemy.poisonUntil>time)return"poison";
    if(enemy.rootUntil>time)return"root";
    if(enemy.slowUntil>time)return"frost";
    if(enemy.armorBroken)return"cracked";
    if(enemy.armorShredded)return"shredded";
    return"clean";
  }
  function positionDefenseEnemyNode(enemy,force=false,renderX=enemy?.x,renderY=enemy?.y){
    const d=mini.defense,node=enemy?.node;if(!d||!node)return false;
    const width=Math.max(1,d.renderWidth||$("#defenseWorld")?.clientWidth||360),height=Math.max(1,d.renderHeight||$("#defenseWorld")?.clientHeight||360),px=Math.round((Number(renderX)||0)*width*10)/10,py=Math.round((Number(renderY)||0)*height*10)/10;
    if(!force&&px===enemy.lastRenderX&&py===enemy.lastRenderY)return false;
    node.style.transform=`translate3d(${px}px,${py}px,0)`;enemy.lastRenderX=px;enemy.lastRenderY=py;d.enemyPositionWrites=(d.enemyPositionWrites||0)+1;return true;
  }
  function positionDefenseMovingNode(node,x,y){
    const d=mini.defense;if(!node||!d)return false;
    const width=Math.max(1,d.renderWidth||$("#defenseWorld")?.clientWidth||360),height=Math.max(1,d.renderHeight||$("#defenseWorld")?.clientHeight||360),px=Math.round((Number(x)||0)*width*10)/10,py=Math.round((Number(y)||0)*height*10)/10;
    if(px===node._rizoMoveX&&py===node._rizoMoveY)return false;
    node.style.transform=`translate3d(${px}px,${py}px,0)`;node._rizoMoveX=px;node._rizoMoveY=py;return true;
  }
  function updateDefenseEnemyNode(enemy,force=false){
    const time=defenseNow(),d=mini.defense;if(!enemy||!d)return false;
    if(!Number.isFinite(enemy.x)||!Number.isFinite(enemy.y)){const point=defensePointAt(enemy.progress);enemy.x=point.x;enemy.y=point.y;}
    const phaseSuppressed=enemy.phaseSuppressedUntil>time||d.moonRevealUntil>time,camo=defenseEnemyCamoActive(enemy,time),stormCharging=Boolean(enemy.stormPulse&&((time+enemy.phaseOffset)%4.8)<1.15),ashCloaked=Boolean(d.ashUntil>time&&enemy.revealUntil<=time&&d.moonRevealUntil<=time),revealed=!camo&&(enemy.camo||enemy.revealUntil>time||d.moonRevealUntil>time),skin=defenseEnemySkin(enemy,time),health=Math.round(clamp(enemy.hp/Math.max(.001,enemy.maxHp)*100)),damaged=health<99,relayBoosted=Boolean(enemy.relayBoosted),signalStaggered=(enemy.signalStaggerUntil||0)>time,menderFlashing=(enemy.supportFlashUntil||0)>time;
    const symbol=enemy.armorBroken?"×":phaseSuppressed&&enemy.phasing?"⌁":revealed?"◉":enemy.telegraphKind||stormCharging?"!":signalStaggered?"∿":relayBoosted?"⌁":menderFlashing?"+":"",stateSignature=`${symbol}|${symbol?0:1}`;
    enemy.stormCharging=stormCharging;enemy.renderSkin=skin;enemy.renderCamo=camo;enemy.renderRevealed=revealed;enemy.renderStateSymbol=symbol;/* Phase damage state belongs to the fixed simulation, never the renderer. */
    if(!enemy.node){enemy.visualSignature="canvas";enemy.stateSignature=stateSignature;enemy.lastRenderedHealth=health;return true;}
    const burnActive=enemy.burnUntil>time,poisonActive=enemy.poisonUntil>time,frostActive=enemy.slowUntil>time,rootActive=enemy.rootUntil>time;
    const classes=["defense-enemy",enemy.baseVisualClass,`skin-${skin}`,burnActive?"is-burn":"",poisonActive?"is-poison":"",frostActive?"is-frost":"",rootActive?"is-root":"",damaged?"damaged":"",enemy.hitFlash>0?"hit":"",enemy.phaseActive?"phased":"",phaseSuppressed&&enemy.phasing?"phase-suppressed":"",camo?"camouflaged":"",revealed?"revealed":"",ashCloaked?"ash-cloaked":"",stormCharging?"storm-charging":"",enemy.telegraphKind?"boss-telegraph":"",enemy.telegraphKind?`telegraph-${enemy.telegraphKind}`:"",enemy.telegraphKind?"feel-boss-windup":"",enemy.feelEnterUntil>time?"boss-entering":"",enemy.armorBroken?"armor-broken":"",enemy.armorShredded&&!enemy.armorBroken?"armor-shredded":"",relayBoosted?"relay-supported":"",signalStaggered?"signal-staggered":"",menderFlashing?"mender-flashing":""].filter(Boolean).join(" ");
    if(force||classes!==enemy.visualSignature){enemy.node.className=classes;enemy.visualSignature=classes;d.enemyClassWrites=(d.enemyClassWrites||0)+1;}
    if(force||health!==enemy.lastRenderedHealth){enemy.node.style.setProperty("--enemy-health",`${health}%`);enemy.lastRenderedHealth=health;d.enemyHealthWrites=(d.enemyHealthWrites||0)+1;}
    if(force||enemy.lastTelegraphBreak!==enemy.telegraphDisruption){enemy.node.style.setProperty("--telegraph-break",`${Math.round(clamp((enemy.telegraphDisruption||0)*100))}%`);enemy.lastTelegraphBreak=enemy.telegraphDisruption;}
    if(enemy.hitFlash>0&&Number.isFinite(enemy.hitFromX)&&Number.isFinite(enemy.hitFromY)){const hitDx=enemy.x-enemy.hitFromX,hitDy=enemy.y-enemy.hitFromY,hitLen=Math.hypot(hitDx,hitDy)||1,nx=Math.round(hitDx/hitLen*100)/100,ny=Math.round(hitDy/hitLen*100)/100,hitSignature=`${nx}|${ny}`;if(force||hitSignature!==enemy.feelHitSignature){enemy.node.style.setProperty("--feel-hit-x",`${(nx*2.1).toFixed(2)}px`);enemy.node.style.setProperty("--feel-hit-y",`${(ny*2.1).toFixed(2)}px`);enemy.feelHitSignature=hitSignature;}}
    if(force||stateSignature!==enemy.stateSignature){const stateNode=enemy.node._rizoState;if(stateNode){stateNode.textContent=symbol;stateNode.hidden=!symbol;}enemy.stateSignature=stateSignature;d.enemyStateWrites=(d.enemyStateWrites||0)+1;}
    if(!d.fixedSimulation||force)positionDefenseEnemyNode(enemy,force);return true;
  }

  function defenseAuroraBuff(tower){return 1+mini.defense.towers.filter(other=>other!==tower&&(other.pet.variant||other.pet.hiddenVariant)==="aurora"&&Math.hypot(other.x-tower.x,other.y-tower.y)<.25).length*.16;}
  function defenseEnemyThreat(enemy){const key=enemy.bossId?`boss:${enemy.bossId}`:enemy.type,identity=(DEFENSE_THREAT_PRIORITY[key]||30)/100,support=(enemy.type==="relay"||enemy.type==="mender")?1.35:1;return (enemy.maxHp||enemy.hp||1)*(1+(enemy.armor||0))*(1+Math.max(0,(enemy.damage||1)-1)*.22)*(1+identity*.16)*(enemy.bossId?2:1)*support;}
  // Camouflage and phasing reduce damage through dealDefenseDamage; they do not make an
  // already acquired target disappear. This predicate exists only for cached-target validity.
  function canDefenseTowerSee(tower,enemy){return Boolean(tower&&enemy&&!enemy.dead&&enemy.hp>0);}
  function defenseTargetSnapshot(d=mini.defense,force=false){// Cache deadlines use game time despite their legacy property names.
    const realTime=defenseNow(),budget=DEFENSE_BUDGETS.normal;if(force||!Array.isArray(d.targetSnapshot)||realTime>=(d.targetSnapshotAtReal||0)){d.targetSnapshot=d.enemies.filter(enemy=>!enemy.dead&&enemy.hp>0);d.targetSnapshotAtReal=realTime+budget.targetRefreshMs/1000;d.targetSnapshotBuilds=(d.targetSnapshotBuilds||0)+1;}return d.targetSnapshot;}
  function pickDefenseTarget(tower,stats,candidates=defenseTargetSnapshot()){
    const mode=tower.targetMode||"first",rangeSq=stats.range*stats.range;let best=null,bestDistance=Infinity,bestThreat=-Infinity;
    for(const enemy of candidates){
      if(enemy.hp<=0)continue;const dx=enemy.x-tower.x,dy=enemy.y-tower.y,distanceSq=dx*dx+dy*dy;if(distanceSq>rangeSq)continue;
      if(!best){best=enemy;bestDistance=distanceSq;if(mode==="strong")bestThreat=defenseEnemyThreat(enemy);continue;}
      if(mode==="strong"){
        const threat=defenseEnemyThreat(enemy);if(threat>bestThreat||(threat===bestThreat&&(enemy.hp>best.hp||(enemy.hp===best.hp&&enemy.progress>best.progress)))){best=enemy;bestThreat=threat;bestDistance=distanceSq;}
      }else if(mode==="last"){
        if(enemy.progress<best.progress){best=enemy;bestDistance=distanceSq;}
      }else if(mode==="close"){
        if(distanceSq<bestDistance){best=enemy;bestDistance=distanceSq;}
      }else if(enemy.progress>best.progress){best=enemy;bestDistance=distanceSq;}
    }
    return best;
  }
  function defenseProgressTargetsNear(target,radius,limit){
    const radiusSq=radius*radius,picks=[];
    for(const enemy of mini.defense.enemies){
      if(enemy===target||enemy.hp<=0)continue;const dx=enemy.x-target.x,dy=enemy.y-target.y;if(dx*dx+dy*dy>=radiusSq)continue;
      let slot=picks.length;for(let index=0;index<picks.length;index+=1){if(enemy.progress>picks[index].progress){slot=index;break;}}
      picks.splice(slot,0,enemy);if(picks.length>limit)picks.pop();
    }
    return picks;
  }
  function defenseBasicRestrained(enemy,time=defenseNow()){return Boolean(enemy&&((enemy.rootUntil||0)>time||((enemy.slowUntil||0)>time&&(enemy.slow||0)>=.25)));}
  function defenseBasicOpened(enemy){return Boolean(enemy&&(enemy.armorBroken||enemy.armorShredded||(enemy.baseArmor||0)>0&&(enemy.armor||0)<Math.max(0,(enemy.baseArmor||0)-.02)));}
  function defenseBasicRivetTargets(target,radius=.14,limit=2){return defenseProgressTargetsNear(target,radius,12).sort((a,b)=>((b.armor||0)*120+defenseEnemyThreat(b))-((a.armor||0)*120+defenseEnemyThreat(a))).slice(0,limit);}
  function defenseBasicThreadTargets(target,radius=.13,limit=2){const time=defenseNow();return defenseProgressTargetsNear(target,radius,12).sort((a,b)=>{const aFresh=defenseBasicRestrained(a,time)?0:1,bFresh=defenseBasicRestrained(b,time)?0:1;return bFresh-aFresh||b.progress-a.progress;}).slice(0,limit);}
  function defenseBasicLinkFlash(from,to,kind="stitch"){
    const d=mini.defense;if(!d||!from||!to||d.effects.length>=defenseVisualBudget(d).maxImpactEffects)return;const color=kind==="power"?DEFENSE_BASIC_TOWER.powerColor:kind==="control"?DEFENSE_BASIC_TOWER.controlColor:DEFENSE_BASIC_TOWER.color;d.maxEffectNodesObserved=Math.max(d.maxEffectNodesObserved||0,d.effects.length+1);
    if(defenseUsesCanvas(d)){d.effects.push({kind:"chain",x:from.x,y:from.y,toX:to.x,toY:to.y,color,startedAt:d.clock,expiresAt:d.clock+.18});return;}
    const node=acquireDefenseImpactNode();if(!node)return;const dx=(to.x-from.x)*(d.renderWidth||390),dy=(to.y-from.y)*(d.renderHeight||390);node.className=`defense-chain-link worker-d-link worker-d-link-${kind}`;node.style.left=`${from.x*100}%`;node.style.top=`${from.y*100}%`;node.style.width=`${Math.hypot(dx,dy)}px`;node.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;node.style.setProperty("--worker-d-link",color);const effect={node,expiresAt:d.clock+.18};d.effects.push(effect);
  }
  function animateDefenseTower(tower,kind="attack"){
    if(!tower.node)return;
    const variant=tower.pet.variant||tower.pet.hiddenVariant||"classic",apex=tower.upgrade>=4,classes=[kind==="ability"?"ability-cast":kind==="doctrine"?"doctrine-strike":"firing",`${kind}-${variant}`];if(apex&&kind==="ability")classes.push("apex-cast");tower.node.classList.add(...classes);
    const attackDurations={classic:210,"defense-basic":tower.doctrine==="power"?245:tower.doctrine==="control"?165:195,ember:230,toxic:220,violet:240,moss:235,bubblegum:240,frost:220,glitch:180,obsidian:255,aurora:250,golden:235,diamond:220,shadow:230,retro:180};
    const duration=kind==="ability"?(apex?900:680):kind==="doctrine"?320:(attackDurations[variant]||220);
    tower.node.style.setProperty("--attack-life",`${duration}ms`);
    queueMiniTimeout(()=>tower.node?.classList.remove(...classes),duration);
  }

  const DEFENSE_ABILITY_REACTIONS=Object.freeze({ember:"heat",toxic:"spore",violet:"storm",moss:"roots",bubblegum:"bounce",frost:"freeze",glitch:"glitch",obsidian:"quake",aurora:"prism",golden:"payday",diamond:"shards",shadow:"blackout",retro:"rewind",classic:"rally"});
  function spawnDefenseAbilityFx(tower,kind){
    const d=mini.defense,host=$("#defenseEffects"),world=$("#defenseWorld");if(!d||!tower||!host)return false;
    const apex=tower.upgrade>=4,doctrine=tower.doctrine||"power",reaction=DEFENSE_ABILITY_REACTIONS[kind]||"rally",node=document.createElement("span");
    node.className=`defense-ability-fx ability-fx-${kind} ability-${doctrine} ${apex?"apex-fx":""}`;node.style.left=`${tower.x*100}%`;node.style.top=`${tower.y*100}%`;node.innerHTML='<i class="ability-core"></i><i class="ability-detail detail-a"></i><i class="ability-detail detail-b"></i><i class="ability-detail detail-c"></i><i class="ability-apex-mark"></i>';
    host.appendChild(node);world?.classList.add(`ability-react-${reaction}`,`ability-react-${doctrine}`);if(apex)world?.classList.add("ability-react-apex");
    const cleanup=()=>{if(!node.isConnected)return;node.remove();if(!host.querySelector(`.ability-fx-${kind}`))world?.classList.remove(`ability-react-${reaction}`);if(!host.querySelector(`.ability-${doctrine}`))world?.classList.remove(`ability-react-${doctrine}`);if(!host.querySelector(".apex-fx"))world?.classList.remove("ability-react-apex");};
    node.addEventListener("animationend",event=>{if(event.target===node&&event.animationName==="workerE-ability-event")cleanup();});
    if(defenseReducedMotion()){const reducedCleanup=()=>{if(!node.isConnected)return;if(mini.defense===d&&d.paused){queueMiniTimeout(reducedCleanup,120);return;}cleanup();};queueMiniTimeout(reducedCleanup,apex?620:480);}return true;
  }
  function defenseVisibleProjectileCount(d=mini.defense){let count=0;for(const shot of d?.projectiles||[])if(shot.node||shot.renderVisible)count+=1;return count;}
  function fireDefenseTower(tower,target,stats){
    // Presentation vectors only; do not alter projectile origin or target selection.
    if(tower.node){const field=mini.defense,dx=(target.x-tower.x)*(field.renderWidth||390),dy=(target.y-tower.y)*(field.renderHeight||500),length=Math.hypot(dx,dy)||1,nx=dx/length,ny=dy/length,investment=tower.superForm?1.46:tower.upgrade>=4?1.30:tower.upgrade>=3?1.20:tower.upgrade>=2?1.12:tower.upgrade>=1?1.06:1;tower.node.style.setProperty("--kick-x",`${-nx*5*investment}px`);tower.node.style.setProperty("--kick-y",`${-ny*5*investment}px`);tower.node.style.setProperty("--soft-kick-x",`${-nx*2.5*investment}px`);tower.node.style.setProperty("--soft-kick-y",`${-ny*2.5*investment}px`);tower.node.style.setProperty("--heavy-kick-x",`${-nx*6.25*investment}px`);tower.node.style.setProperty("--heavy-kick-y",`${-ny*6.25*investment}px`);tower.node.style.setProperty("--lunge-x",`${nx*4*investment}px`);tower.node.style.setProperty("--lunge-y",`${ny*4*investment}px`);tower.node.style.setProperty("--heavy-lunge-x",`${nx*4.8*investment}px`);tower.node.style.setProperty("--heavy-lunge-y",`${ny*4.8*investment}px`);tower.node.style.setProperty("--aim-angle",`${Math.atan2(dy,dx)*180/Math.PI}deg`);}
    const d=mini.defense,variant=stats.variant,shotNumber=(tower.shots||0)+1,universal=defenseIsUniversalTower(tower),masteryTier=universal?0:defenseMasteryTierForPet(tower.petId);let damage=stats.damage*defenseAuroraBuff(tower),doctrineStrike=null,doubleStitch=false;
    if(universal){doubleStitch=tower.upgrade>=1&&shotNumber%DEFENSE_BASIC_TOWER.doubleStitchEvery===0;if(doubleStitch)damage*=1.42;if(tower.doctrine==="power"&&tower.upgrade>=2&&shotNumber%(tower.upgrade>=4?DEFENSE_BASIC_TOWER.powerApexEvery:DEFENSE_BASIC_TOWER.powerStrikeEvery)===0){damage*=tower.upgrade>=4?2.2:1.75;doctrineStrike="power";}else if(tower.doctrine==="control"&&tower.upgrade>=2&&shotNumber%(tower.upgrade>=4?DEFENSE_BASIC_TOWER.controlApexEvery:DEFENSE_BASIC_TOWER.controlStrikeEvery)===0)doctrineStrike="control";}else{if(variant==="classic"&&tower.upgrade>=1&&shotNumber%3===0)damage*=1.65;if(variant==="shadow"&&Math.random()<stats.crit+.18)damage*=2.25;if(variant==="glitch"&&Math.random()<.28)damage*=1.75;if(tower.doctrine==="power"&&tower.upgrade>=2&&shotNumber%(tower.upgrade>=4?4:5)===0){damage*=tower.upgrade>=4?2.1:1.7;doctrineStrike="power";}else if(tower.doctrine==="control"&&tower.upgrade>=2&&shotNumber%(tower.upgrade>=4?4:5)===0)doctrineStrike="control";}
    const projectile={id:`shot-${d.nextId++}`,tower,target,x:tower.x,y:tower.y,prevX:tower.x,prevY:tower.y,life:0,speed:universal?(doctrineStrike?2.25:1.95):(doctrineStrike?2.05:1.8),damage,kind:stats.projectile,doctrineStrike,doubleStitch,masteryTier,node:null,renderVisible:false,renderColor:defenseTowerDisplayColor(tower)},budget=defenseVisualBudget(d),real=defenseRealNow(d),visibleCount=defenseVisibleProjectileCount(d),visualInterval=1/Math.max(1,budget.projectileEmissionHz||10),visualReady=real>=(tower.nextVisualProjectileAtReal||0),visualAllowed=visualReady&&visibleCount<budget.maxVisibleProjectiles;
    tower.shots=shotNumber;
    // Logical projectiles are independent from presentation. A rapid-fire Rizo can
    // remain mathematically exact while only a representative subset gets a DOM
    // tracer. This is the largest v76 projectile-pressure reduction.
    if(d.projectiles.length>=160){d.coalescedLogicalShots=(d.coalescedLogicalShots||0)+1;applyDefenseHit(projectile);if(real>=(tower.nextAttackAnimAtReal||0)){animateDefenseTower(tower,doctrineStrike?"doctrine":"attack");tower.nextAttackAnimAtReal=real+visualInterval;}return;}
    if(visualAllowed){if(defenseUsesCanvas(d)){projectile.renderVisible=true;tower.nextVisualProjectileAtReal=real+visualInterval;}else{const node=acquireDefenseProjectileNode();if(node){node.className=`defense-shot shot-${stats.projectile} signature-${variant} mastery-shot-${masteryTier} ${doubleStitch?"shot-double-stitch":""} ${doctrineStrike?`shot-doctrine-${doctrineStrike}`:""}`;node.style.setProperty("--signature-color",projectile.renderColor);node.style.setProperty("--shot-angle",`${Math.atan2(target.y-tower.y,target.x-tower.x)}rad`);positionDefenseMovingNode(node,tower.x,tower.y);projectile.node=node;tower.nextVisualProjectileAtReal=real+visualInterval;}}}else d.coalescedVisualShots=(d.coalescedVisualShots||0)+1;
    d.projectiles.push(projectile);d.maxLogicalProjectilesObserved=Math.max(d.maxLogicalProjectilesObserved||0,d.projectiles.length);d.maxProjectileNodesObserved=Math.max(d.maxProjectileNodesObserved||0,defenseVisibleProjectileCount(d));
    if(projectile.node||projectile.renderVisible||doctrineStrike||real>=(tower.nextAttackAnimAtReal||0)){animateDefenseTower(tower,doctrineStrike?"doctrine":"attack");spawnDefenseMuzzleFx(tower,target);tower.nextAttackAnimAtReal=real+visualInterval;}
    if(projectile.node||projectile.renderVisible||doctrineStrike)defenseSignatureTone(tower,masteryTier,doctrineStrike);
  }
  function defenseRelaySupport(enemy,d=mini.defense){if(!enemy||enemy.dead||enemy.type==="relay")return 0;for(const support of d?.enemies||[]){if(support.dead||support.type!=="relay"||support.hp<=0)continue;if(Math.abs((support.progress||0)-(enemy.progress||0))<=.105)return 1;}return 0;}
  function collapseDefenseRelay(enemy,time=defenseNow()){const d=mini.defense;if(!d||!enemy)return 0;let affected=0;for(const other of d.enemies){if(other===enemy||other.dead||other.bossId||other.type==="relay"||Math.abs((other.progress||0)-(enemy.progress||0))>.12)continue;other.signalStaggerUntil=Math.max(other.signalStaggerUntil||0,time+1.05);other.relayBoosted=Boolean(defenseRelaySupport(other,d));affected+=1;updateDefenseEnemyNode(other);}if(affected&&!d.lowFx)spawnDefenseImpact(enemy.x,enemy.y,"control",0,null,{color:"#5fe0b7",enemyType:"relay",popWeight:1.1});return affected;}
  function pulseDefenseMender(enemy,time){if(!enemy?.healer||enemy.dead)return false;const relayLinked=Boolean(defenseRelaySupport(enemy)),interval=relayLinked?3.0:3.6,cycle=Math.floor((time+(enemy.phaseOffset||0))/interval);if(cycle===enemy.supportCycle)return false;enemy.supportCycle=cycle;const candidates=(mini.defense?.enemies||[]).filter(other=>other!==enemy&&!other.dead&&!other.bossId&&other.hp>0&&Math.abs((other.progress||0)-(enemy.progress||0))<=.13).map(other=>({other,armorNeed:Boolean(other.baseArmor>0&&!other.armorBroken&&other.armorShredded&&other.armor<other.baseArmor-.01),healthRatio:other.hp/other.maxHp})).filter(row=>row.armorNeed||row.healthRatio<.985).sort((a,b)=>Number(b.armorNeed)-Number(a.armorNeed)||a.healthRatio-b.healthRatio||b.other.progress-a.other.progress),row=candidates[0];if(!row)return false;const target=row.other,heal=Math.min(target.maxHp-target.hp,target.maxHp*(relayLinked?.085:.075)+Math.max(0,(mini.defense.currentWave||1)-30)*.03);let repaired=false;if(row.armorNeed){target.armor=Math.min(target.baseArmor,target.armor+Math.max(.025,target.baseArmor*.24));if(target.armor>=target.baseArmor-.012){target.armor=target.baseArmor;target.armorShredded=false;}repaired=true;}if(heal>0)target.hp+=heal;if(!repaired&&heal<=0)return false;target.hitFlash=.06;enemy.supportFlashUntil=time+.42;spawnDefenseImpact(target.x,target.y,"aurora",0,null,{color:repaired?"#ffd0e8":"#ff9fcf",enemyType:"mender",popWeight:.8});updateDefenseEnemyNode(enemy);updateDefenseEnemyNode(target);markDefenseUi();return true;}
  function dealDefenseDamage(enemy,raw,tower,kind="classic",ignoreArmor=false){if(!enemy||enemy.dead||enemy.hp<=0)return 0;const d=mini.defense,phase=enemy.phaseActive?.34:1,variant=tower?(tower.pet.variant||tower.pet.hiddenVariant||"classic"):null,camoActive=defenseEnemyCamoActive(enemy),mapSight=Boolean(tower&&defenseMapBondForTower(tower,d)?.camoSight),camoMultiplier=camoActive&&tower&&!mapSight&&!['shadow','aurora','glitch'].includes(variant)&&tower.upgrade<2?.25:1,penetration=tower?(variant==="diamond"?.65:variant==="obsidian"?.35:tower.doctrine==="power"?.28:0):0,relayGuard=defenseRelaySupport(enemy,d),effectiveArmor=ignoreArmor?0:Math.min(.72,Math.max(0,(enemy.armor||0)*(1-penetration))+(relayGuard?.10:0)),calculated=Math.max(0,raw*(1-effectiveArmor)*phase*camoMultiplier),dealt=Math.min(enemy.hp,calculated);enemy.hp-=dealt;enemy.hitFlash=.12;if(tower){enemy.hitFromX=tower.x;enemy.hitFromY=tower.y;tower.damage+=dealt;d.totalDamage+=dealt;}markDefenseUi();if(enemy.hp<=0)popDefenseEnemy(enemy,tower);else{applyDefenseEnemyThresholds(enemy,tower);spawnDefenseImpact(enemy.x,enemy.y,kind,0,tower);}return dealt;}
  function dealDefenseDot(enemy,raw,tower,kind){if(!enemy||enemy.dead||enemy.hp<=0||raw<=0)return 0;const dealt=Math.min(enemy.hp,raw);enemy.hp-=dealt;enemy.hitFlash=.08;if(tower&&mini.defense.towers.includes(tower)){tower.damage+=dealt;mini.defense.totalDamage+=dealt;}markDefenseUi();if(enemy.hp<=0)popDefenseEnemy(enemy,tower&&mini.defense.towers.includes(tower)?tower:null);return dealt;}
  function applyDefenseHit(projectile){
    const {target,tower}=projectile;if(!target||target.dead||target.hp<=0)return;
    const variant=tower.pet.variant||tower.pet.hiddenVariant||"classic",time=defenseNow();
    let raw=projectile.damage;
    if(defenseIsUniversalTower(tower)){
      const level=tower.upgrade,restrainedBefore=defenseBasicRestrained(target,time),openedBefore=defenseBasicOpened(target);if(projectile.doctrineStrike==="power"&&restrainedBefore)raw*=level>=4?1.32:1.18;
      const dealt=dealDefenseDamage(target,raw,tower,projectile.doctrineStrike||"defense-basic");
      if(projectile.doubleStitch){const mate=defenseProgressTargetsNear(target,.09,1)[0];if(mate){defenseBasicLinkFlash(target,mate,"stitch");dealDefenseDamage(mate,raw*.48,tower,"defense-basic");spawnDefenseImpact(mate.x,mate.y,"defense-basic",1,tower);}}
      if(projectile.doctrineStrike==="power"){
        shredDefenseArmor(target,level>=4?.13:.07,tower);const splash=level>=4?defenseBasicRivetTargets(target,.15,2):defenseProgressTargetsNear(target,.09,2);splash.forEach(enemy=>{defenseBasicLinkFlash(target,enemy,"power");shredDefenseArmor(enemy,level>=4?.06:.03,tower);dealDefenseDamage(enemy,raw*(level>=4?.58:.32),tower,"power");spawnDefenseImpact(enemy.x,enemy.y,"power",0,tower);});
      }else if(projectile.doctrineStrike==="control"){
        const combo=openedBefore,strength=level>=4?.54:.40,rootBonus=combo?.42:0,rewindBonus=combo?.012:0;target.slow=Math.max(target.slow,strength*(1-(target.slowResist||0)));target.slowUntil=Math.max(target.slowUntil,time+(level>=4?2.5:1.8));revealDefenseEnemy(target,level>=4?4.2:2.8,tower);if(level>=3)target.rootUntil=Math.max(target.rootUntil,time+(level>=4?.95:.62)+rootBonus);if(level>=4&&!target.bossId)target.progress=Math.max(0,target.progress-(.024+rewindBonus));
        if(level>=3){const threaded=defenseBasicThreadTargets(target,level>=4?.15:.11,level>=4?3:1);threaded.forEach((enemy,index)=>{defenseBasicLinkFlash(index?threaded[index-1]:target,enemy,"control");enemy.slow=Math.max(enemy.slow,(level>=4?.30:.22)*(1-(enemy.slowResist||0)));enemy.slowUntil=Math.max(enemy.slowUntil,time+(level>=4?1.7:1.15));enemy.rootUntil=Math.max(enemy.rootUntil,time+(level>=4?.42:.24)+(defenseBasicOpened(enemy)?.18:0));if(level>=4&&!enemy.bossId)enemy.progress=Math.max(0,enemy.progress-.010);spawnDefenseImpact(enemy.x,enemy.y,"control",index,tower);});}
        spawnDefenseImpact(target.x,target.y,"control",0,tower);
      }else if(level>=3&&tower.doctrine==="power")shredDefenseArmor(target,.032,tower);
      if(dealt>0&&target.bossId&&tower.doctrine==="control")disruptDefenseBossTelegraph(target,tower,level>=4?.34:.22);return;
    }
    if(variant==="ember"&&target.fireproof)raw*=.68;
    if(variant==="frost"&&target.fireproof)raw*=1.22;
    // Chill sets up the heavy hitter. It is consumed, so two Cold Shoulders
    // cannot turn a Warden into a permanently frozen damage multiplier.
    if(variant==="obsidian"&&target.slowUntil>time&&target.slow>=.3){raw*=1.35;target.slowUntil=time;spawnDefenseImpact(target.x,target.y,"frost",0,tower);}
    if(variant==="obsidian"&&tower.upgrade>=1)shredDefenseArmor(target,.08,tower);
    const dealt=dealDefenseDamage(target,raw,tower,projectile.doctrineStrike||variant);
    if(dealt>0&&target.bossId&&tower.doctrine==="control")disruptDefenseBossTelegraph(target,tower,.3+tower.upgrade*.06);
    // Area attacks carry their own energy. Killing a 1-HP front target must
    // not erase the chain/splash, or scale the rest of the hit down to 1 HP.
    if(variant==="violet"){
      const hit=new Set([target]);let origin=target,energy=raw*.72;
      for(let hop=0;hop<(tower.upgrade>=1?3:2);hop++){
        const next=mini.defense.enemies.filter(e=>!e.dead&&!hit.has(e)&&Math.hypot(e.x-origin.x,e.y-origin.y)<.17).sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y))[0];
        if(!next)break;hit.add(next);defenseChainFlash(origin,next,tower);dealDefenseDamage(next,energy,tower,"violet");origin=next;energy*=.8;
      }
    }else if(variant==="diamond"||variant==="obsidian"){
      const radius=variant==="diamond"?.13:.075,scale=variant==="diamond"?.58:.42;
      defenseProgressTargetsNear(target,radius,2).forEach(e=>dealDefenseDamage(e,raw*scale,tower,variant));
    }
    if(variant==="frost"&&tower.upgrade>=1){
      defenseProgressTargetsNear(target,.10,3).forEach(e=>{e.slow=Math.max(e.slow,.32*(1-(e.slowResist||0)));e.slowUntil=Math.max(e.slowUntil,time+1.8);spawnDefenseImpact(e.x,e.y,"frost",0,tower);});
    }
    if(projectile.doctrineStrike==="power"){
      defenseProgressTargetsNear(target,.105,tower.upgrade>=4?3:2).forEach(e=>{shredDefenseArmor(e,.035,tower);dealDefenseDamage(e,raw*.28,tower,"power");});
    }
    if(target.dead)return;
    if(variant==="ember"&&!target.fireproof){const burn=raw*.16;if(burn>=target.burn){target.burn=burn;target.burnSource=tower;}target.burnUntil=time+3.2*(tower.doctrine==="control"?1.28:1);}
    if(variant==="toxic"){const poison=raw*.12;if(poison>=target.poison){target.poison=poison;target.poisonSource=tower;}target.poisonUntil=time+5*(tower.doctrine==="control"?1.28:1);}
    if(variant==="frost"){target.slow=Math.max(target.slow,.42*(1-(target.slowResist||0)));target.slowUntil=time+2.6*(tower.doctrine==="control"?1.28:1);}
    if(variant==="moss")target.rootUntil=Math.max(target.rootUntil,time+(.55+tower.upgrade*.12)*(tower.doctrine==="control"?1.28:1));
    if(variant==="bubblegum")target.progress=Math.max(0,target.progress-(.026+tower.upgrade*.006)*(tower.doctrine==="control"?1.28:1));
    if(variant==="glitch"&&(target.phasing||defenseEnemyCamoActive(target,time))&&Math.random()<.38)revealDefenseEnemy(target,1.4,tower);
    if(projectile.doctrineStrike==="power")shredDefenseArmor(target,tower.upgrade>=4?.07:.045,tower);
    if(projectile.doctrineStrike==="control"){
      target.slow=Math.max(target.slow,(tower.upgrade>=4?.45:.34)*(1-(target.slowResist||0)));
      target.slowUntil=Math.max(target.slowUntil,time+(tower.upgrade>=4?1.8:1.35));
      revealDefenseEnemy(target,tower.upgrade>=4?3.6:2.6,tower);
      if(tower.upgrade>=4&&!target.bossId)target.progress=Math.max(0,target.progress-.018);
      spawnDefenseImpact(target.x,target.y,"control",0,tower);
    }
  }
  function defenseChainFlash(from,to,tower){
    const d=mini.defense;if(d.effects.length>=defenseVisualBudget(d).maxImpactEffects)return;
    d.maxEffectNodesObserved=Math.max(d.maxEffectNodesObserved||0,d.effects.length+1);
    if(defenseUsesCanvas(d)){d.effects.push({kind:"chain",x:from.x,y:from.y,toX:to.x,toY:to.y,color:"#ca9aff",startedAt:d.clock,expiresAt:d.clock+.16});return;}
    const node=acquireDefenseImpactNode();if(!node)return;
    const dx=(to.x-from.x)*(d.renderWidth||390),dy=(to.y-from.y)*(d.renderHeight||390);
    node.className="defense-chain-link";node.style.left=`${from.x*100}%`;node.style.top=`${from.y*100}%`;node.style.width=`${Math.hypot(dx,dy)}px`;node.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;
    const effect={node,expiresAt:d.clock+.16};d.effects.push(effect);
  }
  function acquireDefenseImpactNode(){
    const d=mini.defense,host=$("#defenseEffects");if(!d||!host)return null;let node=d.impactNodePool.pop();if(!node){node=document.createElement("i");d.impactNodesCreated=(d.impactNodesCreated||0)+1;}node.hidden=false;node.removeAttribute("style");node.className="defense-impact";host.appendChild(node);d.impactNodesAcquired=(d.impactNodesAcquired||0)+1;return node;
  }
  function releaseDefenseImpactNode(node,owner=mini.defense){if(!node)return;node.remove();node.hidden=true;node.className="defense-impact";node.removeAttribute("style");if(owner&&owner===mini.defense&&owner.impactNodePool.length<36)owner.impactNodePool.push(node);}
  function spawnDefenseImpact(x,y,kind="classic",index=0,tower=null,options={}){const d=mini.defense;if(!d)return;const budget=defenseVisualBudget(d),host=$("#defenseEffects");if(!host||d.effects.length>=budget.maxImpactEffects){d.droppedCosmetics=(d.droppedCosmetics||0)+1;return;}const major=["boss","crown","vortex","mirror","apex","gate"].includes(kind),muzzle=kind==="muzzle",resonance=["flashover","bloom","crystal","shatter"].includes(kind),duration=major?.46:(kind==="pop"||kind==="bubble")?.36:resonance?.34:muzzle?.14:.20,safeX=clamp(Number(x)||0,.022,.978),safeY=clamp(Number(y)||0,.022,.978),variant=tower?(tower.pet.variant||tower.pet.hiddenVariant||"classic"):String(options.variant||"classic"),color=String(options.color|| (tower?defenseTowerDisplayColor(tower):"#fff2cf")),angle=Number(options.angle)||0,enemyType=String(options.enemyType||""),impulseX=clamp(Number(options.impulseX)||0,-1,1),impulseY=clamp(Number(options.impulseY)||0,-1,1),routeX=clamp(Number(options.routeX)||0,-1,1),routeY=clamp(Number(options.routeY)||0,-1,1),popWeight=clamp(Number(options.popWeight)||1,.75,1.45);if(defenseUsesCanvas(d)){const effect={node:null,x:safeX,y:safeY,kind,index,color,variant,angle,enemyType,major,impulseX,impulseY,routeX,routeY,popWeight,startedAt:defenseNow(),expiresAt:defenseNow()+duration};d.effects.push(effect);d.maxEffectNodesObserved=Math.max(d.maxEffectNodesObserved||0,d.effects.length);queueMiniTimeout(()=>removeDefenseRuntimeItem(d.effects,effect),Math.ceil(duration*1000)+30);return;}const node=acquireDefenseImpactNode();if(!node)return;node.className=`defense-impact impact-${kind} impact-variant-${variant}${enemyType?` impact-enemy-${enemyType}`:""}`;node.style.left=`${safeX*100}%`;node.style.top=`${safeY*100}%`;node.style.setProperty("--impact-index",index);node.style.setProperty("--impact-life",`${duration}s`);node.style.setProperty("--impact-color",color);node.style.setProperty("--impact-angle",`${angle}rad`);node.style.setProperty("--impact-bias-x",`${impulseX}`);node.style.setProperty("--impact-bias-y",`${impulseY}`);host.appendChild(node);const effect={node,x:safeX,y:safeY,kind,index,color,variant,angle,enemyType,major,impulseX,impulseY,routeX,routeY,popWeight,startedAt:defenseNow(),expiresAt:defenseNow()+duration};d.effects.push(effect);d.maxEffectNodesObserved=Math.max(d.maxEffectNodesObserved||0,d.effects.length);queueMiniTimeout(()=>{if(d.effects.includes(effect)){removeDefenseRuntimeItem(d.effects,effect);releaseDefenseImpactNode(effect.node);}},Math.ceil(duration*1000)+20);}
  function spawnDefenseMuzzleFx(tower,target){if(!tower||!target)return;const d=mini.defense;if(!d||d.lowFx)return;const budget=defenseVisualBudget(d);if(d.effects.length>=Math.max(1,budget.maxImpactEffects-1))return;const dx=(target.x-tower.x)*(d.renderWidth||390),dy=(target.y-tower.y)*(d.renderHeight||500);spawnDefenseImpact(tower.x,tower.y,"muzzle",0,tower,{angle:Math.atan2(dy,dx)});}


  function removeDefenseRuntimeItem(list,item){const index=list.indexOf(item);if(index>=0)list.splice(index,1);}
  function removeDefenseEnemy(enemy){enemy.dead=true;releaseDefenseEnemyNode(enemy);removeDefenseRuntimeItem(mini.defense.enemies,enemy);removeDefenseRuntimeItem(mini.entities,enemy);}
  function popDefenseEnemy(enemy,tower=null){if(enemy.dead)return;enemy.dead=true;const d=mini.defense,key=enemy.bossId?`boss:${enemy.bossId}`:enemy.type;queueDefenseIncome(Math.round(enemy.reward*defenseGoldenBonus()),enemy.bossId?"boss":"pop");d.kills+=1;d.waveResolved+=1;defenseRecordEnemyStat("popped",key);mini.hits+=1;markDefenseUi({roster:true});mini.score=Math.max(mini.score,d.clearedWave);if(tower)tower.kills+=1;const routeDx=(enemy.x-(Number.isFinite(enemy.prevX)?enemy.prevX:enemy.x)),routeDy=(enemy.y-(Number.isFinite(enemy.prevY)?enemy.prevY:enemy.y)),routeLen=Math.hypot(routeDx,routeDy)||1,routeX=routeDx/routeLen,routeY=routeDy/routeLen;const hitDx=tower?(enemy.x-tower.x):routeX,hitDy=tower?(enemy.y-tower.y):routeY,hitLen=Math.hypot(hitDx,hitDy)||1,impulseX=hitDx/hitLen,impulseY=hitDy/hitLen,weight=enemy.bossId?1.45:(enemy.type==="lead"||enemy.type==="brick")?1.28:(enemy.type==="shell"||enemy.type==="fire")?1.14:enemy.type==="fleet"?.9:1,popAngle=Math.atan2(impulseY,impulseX),popKind=enemy.bossId?"heavy":(enemy.type==="fleet"?"fleet":enemy.type==="split"?"split":enemy.type==="fire"?"fire":enemy.type==="shell"?"shell":enemy.type==="ghost"?"ghost":(enemy.type==="lead"||enemy.type==="brick")?"heavy":"base");if(enemy.node){enemy.node.classList.add("popped",`pop-${popKind}`);enemy.node.style.setProperty("--pop-angle",`${popAngle}rad`);enemy.node.style.setProperty("--pop-bias-x",`${impulseX.toFixed(3)}`);enemy.node.style.setProperty("--pop-bias-y",`${impulseY.toFixed(3)}`);enemy.node.style.setProperty("--pop-weight",`${weight.toFixed(3)}`);}if(!d.lowFx||enemy.bossId){spawnDefenseImpact(enemy.x,enemy.y,enemy.bossId?enemy.bossId:enemy.type==="split"?"bubble":"pop",0,tower,{color:enemy.renderColor||"#ff657c",enemyType:enemy.type,angle:popAngle,impulseX,impulseY,routeX,routeY,popWeight:weight});}
  if(enemy.type==="relay")collapseDefenseRelay(enemy,defenseNow());queueMiniTimeout(()=>releaseDefenseEnemyNode(enemy),enemy.bossId?280:185);removeDefenseRuntimeItem(d.enemies,enemy);removeDefenseRuntimeItem(mini.entities,enemy);if(enemy.type==="split"){d.waveTotal+=2;queueDefenseChildSpawn("puff",{progress:enemy.progress,delay:.08});queueDefenseChildSpawn("fleet",{progress:Math.max(0,enemy.progress-.018),delay:.16});}if(enemy.bossId){d.bossesBeaten.push(enemy.bossId);d.bossesDefeated=(d.bossesDefeated||0)+1;defenseBossStagePulse("defeat",enemy.bossId,760);showDefenseCinematicMoment("clear",{title:d.currentWave>30?`REMIX ${Math.max(1,(enemy.bossIntensity||0)+1)} BROKEN`:"BOSS POPPED",copy:(DEFENSE_BOSSES.find(item=>item.id===enemy.bossId)?.name||"BOSS")+" IS OFF THE TRAIL",priority:7,duration:1100});duckMusic(980,.07);defenseBossCue("down",enemy.bossId);defenseHaptic("bossDown");}else if(defenseRealNow(d)-d.lastPopSfxAt>.075){d.lastPopSfxAt=defenseRealNow(d);if(popKind==="heavy")sfx("defense-pop-heavy",weight);else if(popKind==="split")sfx("defense-pop-split");else sfx("defense-pop",weight);}}
  function triggerCrownGuards(enemy){const tier=Math.max(0,enemy.bossIntensity||0),lastStand=(enemy.bossPhase||0)>=1;enemy.phaseTriggered=true;enemy.bossPhase=lastStand?2:1;const guards=lastStand?["brick","relay","mender"]:tier>=2?["lead","relay","shell","mender"]:tier>=1?["lead","relay","shell"]:["shell","shell"];mini.defense.waveTotal+=guards.length;guards.forEach((type,index)=>queueDefenseChildSpawn(type,{progress:clamp(enemy.progress+(index-(guards.length-1)/2)*.018,0,.98),delay:.08+index*.10}));markDefenseUi();setDefenseMessage(lastStand?"THE WARDEN'S LAST GUARD":tier?"THE WARDEN CHANGED THE GUARD":"THE WARDEN CALLED GUARDS",lastStand?"Its final formation is smaller but self-supporting. Break the Relay before the Mender rebuilds the wall.":tier?"The returning Warden brought support into the escort. Break the signal, then crack the wall.":"Two armored escorts are joining the trail.");spawnDefenseImpact(enemy.x,enemy.y,"boss");}
  function triggerVortexPulse(enemy){const d=mini.defense,time=defenseNow(),tier=Math.max(0,enemy.bossIntensity||0),radius=.32+Math.min(.10,tier*.025),duration=2.5+Math.min(1.4,tier*.28);enemy.bossPhase=(enemy.bossPhase||0)+1;enemy.nextBossPulse=time+Math.max(2.8,4-tier*.12);for(const tower of d.towers){if(Math.hypot(tower.x-enemy.x,tower.y-enemy.y)<radius){tower.rangeDebuffUntil=Math.max(tower.rangeDebuffUntil,time+duration);tower.node?.classList.add("range-weakened");}}if(tier>=4&&enemy.bossPhase<=6&&enemy.bossPhase%2===0){const type=enemy.bossPhase%4===0?"mender":"relay";d.waveTotal+=1;queueDefenseChildSpawn(type,{progress:clamp(enemy.progress-.025,0,.98),delay:.14});}const ring=document.createElement("i");ring.className="defense-vortex-pulse";ring.style.left=`${enemy.x*100}%`;ring.style.top=`${enemy.y*100}%`;$("#defenseEffects")?.appendChild(ring);queueMiniTimeout(()=>ring.remove(),850);setDefenseMessage(tier>=4&&enemy.bossPhase%2===0?"THE MAW PULLED SOMETHING THROUGH":tier?"THE MAW LEARNED YOUR RANGE":"THE MAW DISTORTS THE FIELD",tier>=4&&enemy.bossPhase%2===0?"The collapse now drags support into its wake. The pulse and the escort are one problem.":tier?`RANGE COLLAPSE ${duration.toFixed(1)}S • THE REMIX PULSE REACHES FARTHER.`:"NEARBY RIZO RANGE IS WEAKENED FOR 2.5 SECONDS.");}
  function splitMirrorBoss(enemy){enemy.phaseTriggered=true;const remaining=Math.max(1,enemy.hp),progress=enemy.progress,intensity=enemy.bossIntensity,tier=Math.max(0,intensity||0),parts=tier>=3?3:2,share=1/parts,echoes=tier>=5?["ghost","shade"]:[];removeDefenseEnemy(enemy);mini.defense.waveTotal+=parts-1+echoes.length;for(let index=0;index<parts;index+=1){const offset=(index-(parts-1)/2)*.024;queueDefenseChildSpawn({type:"boss",bossId:"mirror",intensity},{progress:clamp(progress+offset,0,.98),delay:.08+index*.12,options:{bossChild:true,hpOverride:remaining*share,maxHpOverride:remaining*share,rewardScale:share}});}echoes.forEach((type,index)=>queueDefenseChildSpawn(type,{progress:clamp(progress-.018-index*.012,0,.98),delay:.20+index*.14}));setDefenseMessage(echoes.length?"MIRROR FRACTURED WITH ECHOES":parts===3?"MIRROR FRACTURED THREE WAYS":"MIRROR SPLIT",echoes.length?"Late remixes hide real phase threats inside the reflections. Clean up the echoes before they steal the road.":parts===3?"The Endless remix divides its remaining mass across three sequential reflections.":"The two children are released sequentially so the visual node budget remains stable.");}
  function beginDefenseBossTelegraph(enemy,kind){const data=DEFENSE_BOSS_TELEGRAPHS[kind];if(!enemy?.bossId||enemy.dead||!data||enemy.telegraphKind)return false;const time=defenseNow();enemy.telegraphKind=kind;enemy.telegraphStartedAt=time;enemy.telegraphUntil=time+data.duration;enemy.telegraphDisruption=0;updateDefenseEnemyNode(enemy);setDefenseMessage(data.title,data.copy);enemy.node?.classList.add("feel-boss-windup");defenseBossStagePulse("phase",enemy.bossId,Math.min(900,Math.max(420,data.duration*420)));defenseBossCue("phase",enemy.bossId);defenseHaptic("bossWarn");return true;}
  function clearDefenseBossTelegraph(enemy,interrupted=false){if(!enemy?.telegraphKind)return false;const kind=enemy.telegraphKind,time=defenseNow();enemy.telegraphKind=null;enemy.telegraphStartedAt=0;enemy.telegraphUntil=0;enemy.telegraphDisruption=0;if(interrupted){if(kind==="guards"||kind==="mirror")enemy.phaseTriggered=true;if(kind==="vortex")enemy.nextBossPulse=time+4;if(kind==="apex")enemy.nextBossPulse=time+4.5;enemy.bossMechanicLocked=true;mini.defense.enemyStats.counters.bossInterrupts=(mini.defense.enemyStats.counters.bossInterrupts||0)+1;setDefenseMessage("BOSS SIGNAL BROKEN","CONTROL doctrine cancelled the mechanic before it resolved.");spawnDefenseImpact(enemy.x,enemy.y,"control");enemy.node?.classList.remove("feel-boss-windup");duckMusic(460,.1);defenseBossCue("break",enemy.bossId);defenseHaptic("bossBreak");}updateDefenseEnemyNode(enemy);markDefenseUi();return true;}
  function disruptDefenseBossTelegraph(enemy,tower,amount=.35){const data=DEFENSE_BOSS_TELEGRAPHS[enemy?.telegraphKind];if(!data?.interruptible||tower?.doctrine!=="control"||enemy.dead)return false;enemy.telegraphDisruption=clamp((enemy.telegraphDisruption||0)+Math.max(.05,Number(amount)||0),0,1);if(enemy.telegraphDisruption>=1)return clearDefenseBossTelegraph(enemy,true);updateDefenseEnemyNode(enemy);markDefenseUi();return true;}
  function resolveDefenseBossTelegraph(enemy){const kind=enemy?.telegraphKind;if(!kind)return false;enemy.telegraphKind=null;enemy.telegraphStartedAt=0;enemy.telegraphUntil=0;enemy.telegraphDisruption=0;enemy.node?.classList.remove("feel-boss-windup");if(kind==="guards")triggerCrownGuards(enemy);else if(kind==="mirror")splitMirrorBoss(enemy);else if(kind==="vortex")triggerVortexPulse(enemy);else if(kind==="apex"){const time=defenseNow(),tier=Math.max(0,enemy.bossIntensity||0),duration=1.4+Math.min(.9,tier*.18);enemy.bossPhase=(enemy.bossPhase||0)+1;enemy.apexSurgeUntil=time+duration;enemy.nextBossPulse=time+Math.max(3.2,4.5-tier*.12);if(tier>=1&&enemy.bossPhase<=4){const escorts=tier>=4&&enemy.bossPhase%2===0?["fleet","lead","mender"]:tier>=3?["storm","fleet","relay"]:["fleet","storm"];mini.defense.waveTotal+=escorts.length;escorts.forEach((type,index)=>queueDefenseChildSpawn(type,{progress:clamp(enemy.progress-.02-index*.012,0,.98),delay:.10+index*.10}));}setDefenseMessage(tier>=4&&enemy.bossPhase%2===0?"REDLINE SWITCHED LANES":tier?"REDLINE REMIX SURGE":"REDLINE SURGE",tier>=4&&enemy.bossPhase%2===0?"The next burst trades pure speed for a protected repair escort. Re-target instead of repeating the last answer.":tier?"The burst drags a fast escort into the same decision window. Hold CONTROL for the whole event.":"THE WIND-UP COMPLETED. HOLD THE FRONT UNTIL THE BURST ENDS.");spawnDefenseImpact(enemy.x,enemy.y,"boss");}defenseBossCue("resolve",enemy.bossId);markDefenseUi();return true;}
  function handleDefenseBossMechanics(enemy){if(!enemy.bossId||enemy.dead)return;const time=defenseNow(),ratio=enemy.hp/enemy.maxHp;if(enemy.telegraphKind){if(time>=enemy.telegraphUntil)resolveDefenseBossTelegraph(enemy);return;}if(enemy.bossId==="crown"&&!enemy.phaseTriggered&&ratio<=(enemy.bossIntensity? .62:.5))beginDefenseBossTelegraph(enemy,"guards");else if(enemy.bossId==="crown"&&enemy.bossIntensity>=4&&(enemy.bossPhase||0)===1&&!enemy.bossMechanicLocked&&ratio<=.28)beginDefenseBossTelegraph(enemy,"guards");else if(enemy.bossId==="mirror"&&!enemy.bossChild&&!enemy.phaseTriggered&&ratio<=(enemy.bossIntensity? .60:.5))beginDefenseBossTelegraph(enemy,"mirror");else if(enemy.bossId==="vortex"&&time>=enemy.nextBossPulse)beginDefenseBossTelegraph(enemy,"vortex");else if(enemy.bossId==="apex"&&time>=enemy.nextBossPulse)beginDefenseBossTelegraph(enemy,"apex");}
  function applyDefenseControlActive(tower,variant,stats,time,near,front){const d=mini.defense,targets=(near.length?near:front.slice(0,10)).filter(e=>e.hp>0),root=(enemy,seconds)=>enemy.rootUntil=Math.max(enemy.rootUntil||0,time+seconds),slow=(enemy,amount,seconds)=>{enemy.slow=Math.max(enemy.slow||0,amount*(1-(enemy.slowResist||0)));enemy.slowUntil=Math.max(enemy.slowUntil||0,time+seconds);};if(variant==="classic")front.slice(0,7).forEach(e=>{root(e,1.6);slow(e,.42,4);});else if(variant==="ember")front.slice(0,8).forEach(e=>{slow(e,.48,5);if(!e.fireproof){e.burn=Math.max(e.burn||0,stats.damage*.16);e.burnSource=tower;e.burnUntil=Math.max(e.burnUntil||0,time+5);}});else if(variant==="toxic")front.slice(0,10).forEach(e=>{slow(e,.55,6);e.poison=Math.max(e.poison||0,stats.damage*.18);e.poisonSource=tower;e.poisonUntil=Math.max(e.poisonUntil||0,time+7);});else if(variant==="violet")front.slice(0,8).forEach((e,i)=>{root(e,1.2+i*.08);revealDefenseEnemy(e,4,tower);});else if(variant==="moss")targets.slice(0,12).forEach(e=>root(e,4.4));else if(variant==="bubblegum")front.slice(0,10).forEach(e=>{e.progress=Math.max(0,e.progress-.20);slow(e,.25,3);});else if(variant==="frost")front.slice(0,10).forEach(e=>{root(e,2.4);slow(e,.75,6);});else if(variant==="glitch")front.slice(0,12).forEach(e=>{revealDefenseEnemy(e,6,tower);root(e,1.4);});else if(variant==="obsidian")front.slice(0,8).forEach(e=>{root(e,1.8);shredDefenseArmor(e,.12,tower);});else if(variant==="aurora"){d.prismUntil=Math.max(d.prismUntil,time+7);front.slice(0,12).forEach(e=>revealDefenseEnemy(e,7,tower));}else if(variant==="golden"){front.slice(0,9).forEach(e=>slow(e,.52,5));queueDefenseIncome(Math.max(12,Math.round((d.clearedWave+1)*2.2)),"golden-control");}else if(variant==="diamond")front.sort((a,b)=>defenseEnemyThreat(b)-defenseEnemyThreat(a)).slice(0,6).forEach(e=>{root(e,3);shredDefenseArmor(e,.10,tower);});else if(variant==="shadow")front.slice(0,8).forEach(e=>{e.progress=Math.max(0,e.progress-.08);revealDefenseEnemy(e,5,tower);slow(e,.42,5);});else if(variant==="retro")front.slice(0,10).forEach(e=>{e.progress=Math.max(0,e.progress-.15);});targets.slice(0,10).forEach(e=>spawnDefenseImpact(e.x,e.y,variant,0,tower));}
  function activateDefenseAbility(id,{keepAbilityTray=false,showPanel=true}={}){
    const d=mini.defense,tower=d.towers.find(item=>item.id===id);if(defenseContractRule("silent",d)){setDefenseMessage("CONTRACT • SEALED ACTIVES","Passive identity still works, but activated effects are disabled.");sfx("no");return false;}if(!tower||tower.upgrade<2||!tower.doctrine||!defenseIsActiveWave(d)||d.paused||defenseAbilityRemaining(tower)>0)return false;const variant=tower.pet.variant||tower.pet.hiddenVariant||"classic",stats=defenseCombatStats(tower),time=defenseNow(),power=tower.doctrine==="power"?1.28:1,control=tower.doctrine==="control"?1.28:1,near=d.enemies.filter(enemy=>enemy.hp>0&&Math.hypot(enemy.x-tower.x,enemy.y-tower.y)<Math.max(.28,stats.range*1.75)),front=[...d.enemies].filter(enemy=>enemy.hp>0).sort((a,b)=>b.progress-a.progress),apex=tower.upgrade>=4,preStatus=apex?{burn:new Set(front.filter(enemy=>enemy.burnUntil>time).map(enemy=>enemy.id)),poison:new Set(front.filter(enemy=>enemy.poisonUntil>time).map(enemy=>enemy.id)),controlled:new Set(front.filter(enemy=>enemy.slowUntil>time||enemy.rootUntil>time).map(enemy=>enemy.id))}:null;tower.abilityReadyAt=time+defenseAbilityCooldown(tower)*(tower.superForm?.7:1);animateDefenseTower(tower,"ability");spawnDefenseAbilityFx(tower,variant);
    if(tower.doctrine==="control")applyDefenseControlActive(tower,variant,stats,time,near,front);else if(variant==="classic")d.rallyUntil=time+6;else if(variant==="ember")near.forEach(enemy=>{const flashover=apex&&preStatus.burn.has(enemy.id),dealt=dealDefenseDamage(enemy,stats.damage*(flashover?2.72:2.1)*power,tower,"ember");if(flashover)spawnDefenseImpact(enemy.x,enemy.y,"flashover",0,tower);if(!enemy.fireproof&&!enemy.dead){const burn=dealt*.28;if(burn>=enemy.burn){enemy.burn=burn;enemy.burnSource=tower;}enemy.burnUntil=time+5;}});else if(variant==="toxic")front.forEach(enemy=>{const bloom=apex&&preStatus.poison.has(enemy.id),poison=stats.damage*.34*power;if(poison>=enemy.poison){enemy.poison=poison;enemy.poisonSource=tower;}enemy.poisonUntil=time+7*control;if(bloom&&!enemy.dead){dealDefenseDot(enemy,Math.max(poison*.75,enemy.poison*.9),tower,"toxic");spawnDefenseImpact(enemy.x,enemy.y,"bloom",0,tower);}else spawnDefenseImpact(enemy.x,enemy.y,"toxic",0,tower);});else if(variant==="violet"){let origin={x:tower.x,y:tower.y};front.slice(0,6).forEach((enemy,index)=>{defenseChainFlash(origin,enemy,tower);dealDefenseDamage(enemy,stats.damage*(2.15-index*.12)*power,tower,"violet");origin=enemy;});}else if(variant==="moss")near.forEach(enemy=>{enemy.rootUntil=Math.max(enemy.rootUntil,time+(3.2+tower.upgrade*.25)*control);spawnDefenseImpact(enemy.x,enemy.y,"moss",0,tower);});else if(variant==="bubblegum")near.forEach(enemy=>{enemy.progress=Math.max(0,enemy.progress-(.12+tower.upgrade*.018)*control);dealDefenseDamage(enemy,stats.damage*.9*power,tower,"bubblegum");spawnDefenseImpact(enemy.x,enemy.y,"bubblegum",0,tower);});else if(variant==="frost")front.forEach(enemy=>{const crystal=apex&&preStatus.controlled.has(enemy.id);enemy.rootUntil=Math.max(enemy.rootUntil,time+(crystal?2.35:1.2)*control);enemy.slow=Math.max(enemy.slow,.72*(1-(enemy.slowResist||0)));enemy.slowUntil=time+5*control;spawnDefenseImpact(enemy.x,enemy.y,crystal?"crystal":"frost",0,tower);});else if(variant==="glitch"){for(let i=0;i<8;i+=1){const enemy=front[Math.floor(Math.random()*front.length)];if(enemy)dealDefenseDamage(enemy,stats.damage*(1.25+Math.random()*1.4)*power,tower,"glitch");}}else if(variant==="obsidian")near.forEach(enemy=>{const shatter=apex&&preStatus.controlled.has(enemy.id);dealDefenseDamage(enemy,stats.damage*4.2*(shatter?1.35:1)*power,tower,"obsidian");if(shatter){enemy.slowUntil=time;enemy.rootUntil=time;spawnDefenseImpact(enemy.x,enemy.y,"shatter",0,tower);}});else if(variant==="aurora")d.prismUntil=time+8*control;else if(variant==="golden"){const goldenCount=d.towers.filter(item=>!defenseStructureType(item)&&(item.pet.variant||item.pet.hiddenVariant)==="golden").length,factoryCount=d.towers.filter(item=>defenseStructureType(item)==="factory").length,baseGain=DefenseCore.goldenActivePayout({clearedWave:d.clearedWave,upgradeLevel:tower.upgrade,goldenTowerCount:goldenCount}),gain=Math.round(baseGain*(1+Math.min(.6,factoryCount*.12)));queueDefenseIncome(gain,"golden-active");setDefenseMessage(`PAYDAY • +${gain}`,factoryCount?`${factoryCount} Factory${factoryCount===1?"":"s"} turned Payday into a brand-wide drop.`:goldenCount>1?"Golden duplicates split the market. More gold still helps, but with diminishing returns.":"Golden Rizo made the balloons fund their own defeat.");}else if(variant==="diamond")front.slice(0,8).forEach(enemy=>dealDefenseDamage(enemy,stats.damage*2.8*power,tower,"diamond"));else if(variant==="shadow"){const enemy=front[0];if(enemy)dealDefenseDamage(enemy,enemy.hp/enemy.maxHp<.4?enemy.hp+1:stats.damage*4.8*power,tower,"shadow",true);}else if(variant==="retro")tower.overclockUntil=time+9*control;
    const doctrineTargets=(near.length?near:front.slice(0,6)).filter(enemy=>enemy.hp>0);
    if(tower.doctrine==="power")doctrineTargets.slice(0,tower.upgrade>=4?8:5).forEach(enemy=>shredDefenseArmor(enemy,tower.upgrade>=4?.08:.05,tower));
    else if(tower.doctrine==="control")doctrineTargets.slice(0,tower.upgrade>=4?10:6).forEach(enemy=>revealDefenseEnemy(enemy,tower.upgrade>=4?5:3.5,tower));
    tower.node?.classList.remove("ability-ready");tower.node?.classList.add("ability-charging");tower.node?.style.setProperty("--ability-charge","0%");tower.abilityChargedVisual=false;tower.abilityChargingVisual=true;tower.abilityChargeVisual=0;
    const abilityWorld=$("#defenseWorld");if((d.rallyUntil||0)>time){abilityWorld?.classList.add("rally-active");d.rallyVisualActive=true;}if((d.prismUntil||0)>time){abilityWorld?.classList.add("prism-active");d.prismVisualActive=true;}if((tower.overclockUntil||0)>time){tower.node?.classList.add("overclock-active");tower.overclockVisualActive=true;}
    const presentation=defenseAbilityPresentation(tower);showDefenseCinematicMoment("ability",{kicker:`${tower.doctrine.toUpperCase()} • ${tower.pet.name}`,title:presentation.active,copy:tower.upgrade>=4?"APEX CAST":"FIELD POWER",duration:d.lowFx?520:760,priority:4,icon:tower.doctrine==="control"?"⌁":"✦"});
    markDefenseUi();
    if(keepAbilityTray){d.abilityTrayOpen=true;closeDefenseTowerPanel();updateDefenseHud();}
    else{updateDefenseHud();if(showPanel)showDefenseTowerPanel(tower);}
    completeDefenseSchoolLesson("abilities");writeDefenseCheckpoint(true,"ability");duckMusic(tower.superForm?720:560,tower.superForm?.075:.105);defenseAbilitySignature(tower);defenseHaptic("ability");return true;
  }
  function updateDefenseProjectiles(dt){
    const d=mini.defense;
    for(let index=d.projectiles.length-1;index>=0;index-=1){
      const shot=d.projectiles[index];
      if(!shot.target||shot.target.dead||shot.target.hp<=0){releaseDefenseProjectileNode(shot);d.projectiles.splice(index,1);continue;}
      shot.prevX=Number.isFinite(shot.x)?shot.x:shot.tower?.x||0;shot.prevY=Number.isFinite(shot.y)?shot.y:shot.tower?.y||0;
      shot.life+=dt;const tx=shot.target.x,ty=shot.target.y,dx=tx-shot.x,dy=ty-shot.y,dist=Math.hypot(dx,dy),step=Math.min(dist,shot.speed*dt);
      if(dist>.0001){shot.x+=dx/dist*step;shot.y+=dy/dist*step;}
      if(!d.fixedSimulation&&shot.node&&positionDefenseMovingNode(shot.node,shot.x,shot.y))d.projectilePositionWrites=(d.projectilePositionWrites||0)+1;
      if(dist<=shot.speed*dt+.018||shot.life>.7){applyDefenseHit(shot);releaseDefenseProjectileNode(shot);d.projectiles.splice(index,1);}
    }
  }


  function showDefenseBeaconPulse(beacon,{golden=false}={}){const node=beacon?.node;if(!node)return;node.classList.remove("brand-pulse","golden-brand-pulse");void node.offsetWidth;node.classList.add(golden?"golden-brand-pulse":"brand-pulse");queueMiniTimeout(()=>node.classList.remove("brand-pulse","golden-brand-pulse"),850);}
  function showDefenseFactoryPayout(tower,gain,econ){const d=mini.defense,node=tower.node;if(!d||!node)return;node.classList.remove("factory-produced","factory-drop","factory-golden-drop");void node.offsetWidth;node.classList.add("factory-produced");if(econ?.isDrop)node.classList.add("factory-drop");if(econ?.isDrop&&econ?.goldenLicensed)node.classList.add("factory-golden-drop");const fx=document.createElement("span");fx.className=`defense-factory-payout ${econ?.isDrop?"drop":""} ${econ?.goldenLicensed?"golden":""}`;const label=econ?.isDrop?(econ.goldenLicensed?"GOLDEN DROP":econ.privateSun?"SUN DROP":"RIZO DROP"):"";fx.innerHTML=`<i aria-hidden="true"></i>${label?`<em>${label}</em>`:""}<b>+${gain}</b>`;node.appendChild(fx);queueMiniTimeout(()=>{fx.remove();node.classList.remove("factory-produced","factory-drop","factory-golden-drop");},900);if(econ?.isDrop&&defenseBeaconInfluence(tower,d)?.network?.privateSun)showDefenseBeaconPulse(defenseBeaconInfluence(tower,d)?.beacon,{golden:Boolean(econ.goldenLicensed)});if(defenseRealNow(d)-(d.lastFactorySfxAt||-99)>.9){d.lastFactorySfxAt=defenseRealNow(d);sfx(econ?.isDrop?"reward":"coin");}}
  function updateDefenseFactory(tower,d,time){
    if(!Number.isFinite(tower.factoryLivesSnapshot))tower.factoryLivesSnapshot=d.lives;if(d.lives<tower.factoryLivesSnapshot){tower.factoryCleanCycles=0;tower.node?.classList.add("factory-streak-broken");queueMiniTimeout(()=>tower.node?.classList.remove("factory-streak-broken"),700);}tower.factoryLivesSnapshot=d.lives;
    let econ=defenseFactoryEconomy(tower,d);if(!(tower.nextProductionAt>0))tower.nextProductionAt=time+econ.interval;if(!(tower.factoryLastInterval>0))tower.factoryLastInterval=econ.interval;else if(Math.abs(tower.factoryLastInterval-econ.interval)>.001&&tower.nextProductionAt>time){const progress=clamp(1-(tower.nextProductionAt-time)/Math.max(.1,tower.factoryLastInterval),0,1);tower.nextProductionAt=time+(1-progress)*econ.interval;tower.factoryLastInterval=econ.interval;}else tower.factoryLastInterval=econ.interval;let bursts=0;
    while(time+1e-9>=tower.nextProductionAt&&bursts<3){econ=defenseFactoryEconomy(tower,d);const gain=econ.payout;queueDefenseIncome(gain,"factory");tower.totalProduced=(tower.totalProduced||0)+gain;tower.factoryCleanCycles=(tower.factoryCleanCycles||0)+1;tower.nextProductionAt+=econ.interval;bursts+=1;showDefenseFactoryPayout(tower,gain,econ);}
    econ=defenseFactoryEconomy(tower,d);const beacon=defenseBeaconInfluence(tower,d);tower.beaconSourceId=beacon?.beacon?.id||"";tower.node?.classList.toggle("beacon-buffed",Boolean(beacon));tower.node?.classList.toggle("brand-loop",Boolean(beacon?.network?.brandLoop));tower.node?.classList.toggle("golden-license",Boolean(beacon?.network?.golden));tower.node?.classList.toggle("drop-ready",Boolean(econ.isDrop));if(tower.node){tower.node.style.setProperty("--factory-progress",String(clamp(1-Math.max(0,tower.nextProductionAt-time)/Math.max(.1,econ.interval),0,1)));tower.node.style.setProperty("--factory-momentum",String(clamp((econ.momentumMultiplier-1)/.30,0,1)));tower.node.dataset.production=String(Math.round(tower.totalProduced||0));tower.node.dataset.cleanStreak=String(tower.factoryCleanCycles||0);}
  }
  // --- INTEGRATION GLUE: one upgrade completion pipeline -------------------------
  // Five specialists react to an upgrade: Worker D changes the tower's visual state,
  // Worker G's map bonds may re-derive, Worker B's Beacon/Factory network changes,
  // Worker I owns motion/audio/haptic punctuation, Worker H owns the UI reads, and
  // Worker J requires the checkpoint to be rewritten. Worker B's structure upgrade
  // path grew its own shorter sequence, so evolving a Factory to RIZO INDUSTRIAL or a
  // Beacon to PRIVATE SUN silently skipped the authored upgrade motion, the authored
  // SFX family, the music duck and the support refresh. Both paths now finish here.
  function defenseCommitUpgrade(tower,{reason="upgrade",apex=null}={}){
    const d=mini.defense;if(!d||!tower)return false;
    const isApex=apex===null?tower.upgrade>=4:Boolean(apex);
    refreshDefenseTower(tower);
    refreshDefenseMapBondVisuals();
    refreshDefenseSupportVisuals(d);
    tower.node?.classList.add("just-upgraded");
    defenseFeelPulseTower(tower,"upgraded",isApex?950:700);
    markDefenseUi({roster:true});updateDefenseRoster();updateDefenseHud();
    writeDefenseCheckpoint(true,reason);
    duckMusic(isApex?1000:720,isApex?.08:.14);
    sfx(isApex?"defense-apex":"defense-upgrade");
    defenseHaptic(isApex?"apex":"upgrade");
    return true;
  }

  // --- INTEGRATION GLUE: support presentation outside the simulation loop --------
  // Beacon support classes used to be applied only from updateDefenseTowers(), i.e.
  // only while the simulation was running. Placing or upgrading a Beacon during the
  // planning phase therefore changed the mechanic with no visible response until the
  // next wave started, which breaks the "place a Beacon, watch nearby Rizos speed up"
  // cause/effect the design depends on. This is the one place that derives the
  // presentation, so the loop and every out-of-loop refresh cannot drift apart.
  function defenseSyncDefenderSupportVisual(tower,d=mini.defense){
    const beacon=defenseBeaconInfluence(tower,d),beaconId=beacon?.beacon?.id||"";
    const goldenLicensed=(tower.pet.variant||tower.pet.hiddenVariant)==="golden"&&tower.upgrade>=2&&Boolean(beacon?.network?.brandLoop)&&Boolean(beacon?.network?.factories);
    tower.beaconSourceId=beaconId;
    // Apply unconditionally rather than only on change: renderDefenseTower() rebuilds
    // className from scratch (on upgrade, doctrine, ascension, restore), so a
    // change-gated toggle silently dropped the support halo until the covering Beacon
    // happened to change again.
    tower.node?.classList.toggle("beacon-buffed",Boolean(beacon));
    tower.node?.classList.toggle("golden-license",goldenLicensed);
    return beacon;
  }
  // Re-derive every support/network read from current placement. Presentation only:
  // it never advances a production timer, grants cash, or touches simulation clocks,
  // so it is safe to call while paused or in planning.
  function refreshDefenseSupportVisuals(d=mini.defense){
    if(!d?.towers)return false;
    for(const tower of d.towers){
      const type=defenseStructureType(tower);
      if(type==="beacon")updateDefenseBeacon(tower,d);
      else if(type==="factory"){const beacon=defenseBeaconInfluence(tower,d);tower.beaconSourceId=beacon?.beacon?.id||"";tower.node?.classList.toggle("beacon-buffed",Boolean(beacon));tower.node?.classList.toggle("brand-loop",Boolean(beacon?.network?.brandLoop));tower.node?.classList.toggle("private-sun-network",Boolean(beacon?.network?.privateSun));}
      else defenseSyncDefenderSupportVisual(tower,d);
    }
    return true;
  }
  function updateDefenseBeacon(tower,d){const network=defenseBeaconNetwork(tower,d);tower._brandNetwork=network;tower.node?.classList.toggle("brand-loop",Boolean(network?.brandLoop));tower.node?.classList.toggle("private-sun-network",Boolean(network?.privateSun));tower.node?.classList.toggle("golden-license",Boolean(network?.golden));if(tower.node){tower.node.dataset.combatLinks=String(network?.combat||0);tower.node.dataset.factoryLinks=String(network?.factories||0);}}
  function updateDefenseTowers(dt){
    const d=mini.defense,time=defenseNow(),realTime=time,budget=DEFENSE_BUDGETS.normal,world=$("#defenseWorld"),abilitiesSealed=defenseContractRule("silent",d);let goldenAwakened=0;
    const rallyActive=(d.rallyUntil||0)>time,prismActive=(d.prismUntil||0)>time;
    if(rallyActive!==d.rallyVisualActive){world?.classList.toggle("rally-active",rallyActive);d.rallyVisualActive=rallyActive;}
    if(prismActive!==d.prismVisualActive){world?.classList.toggle("prism-active",prismActive);d.prismVisualActive=prismActive;}
    for(const tower of d.towers){const structureType=defenseStructureType(tower);if(structureType){if(structureType==="factory")updateDefenseFactory(tower,d,time);else if(structureType==="beacon")updateDefenseBeacon(tower,d);continue;}const weakened=tower.rangeDebuffUntil>time;if(weakened!==tower.rangeWeakenedActive){tower.node?.classList.toggle("range-weakened",weakened);tower.rangeWeakenedActive=weakened;}const overclockActive=(tower.overclockUntil||0)>time;if(overclockActive!==tower.overclockVisualActive){tower.node?.classList.toggle("overclock-active",overclockActive);tower.overclockVisualActive=overclockActive;}const abilityUnlocked=Boolean(tower.upgrade>=2&&tower.doctrine&&!abilitiesSealed),abilityRemaining=abilityUnlocked?defenseAbilityRemaining(tower):Infinity,abilityCharged=Boolean(abilityUnlocked&&abilityRemaining<=0),abilityCharging=Boolean(abilityUnlocked&&!abilityCharged),abilityCooldown=Math.max(.001,defenseAbilityCooldown(tower)*(tower.superForm?.7:1)),abilityCharge=abilityUnlocked?clamp(1-abilityRemaining/abilityCooldown,0,1):0,abilityChargeStep=Math.round(abilityCharge*12)/12;if(abilityCharged!==tower.abilityChargedVisual){tower.node?.classList.toggle("ability-ready",abilityCharged);tower.abilityChargedVisual=abilityCharged;}if(abilityCharging!==tower.abilityChargingVisual){tower.node?.classList.toggle("ability-charging",abilityCharging);tower.abilityChargingVisual=abilityCharging;}if(abilityChargeStep!==tower.abilityChargeVisual){tower.node?.style.setProperty("--ability-charge",`${Math.round(abilityChargeStep*100)}%`);tower.abilityChargeVisual=abilityChargeStep;}if((tower.pet.variant||tower.pet.hiddenVariant)==="golden"&&tower.upgrade>=2)goldenAwakened+=1;const beacon=defenseSyncDefenderSupportVisual(tower,d);tower.cooldown=Math.max(0,tower.cooldown-dt);const hadCachedTarget=Boolean(tower.targetId);let target=tower.targetRef;if(!target||target.id!==tower.targetId||target.dead||target.hp<=0)target=null;const lostCachedTarget=hadCachedTarget&&!target,retargetExpired=realTime>=(tower.retargetAtReal||0);let stats=null;if(lostCachedTarget||retargetExpired){stats=defenseCombatStats(tower);const targetValid=Boolean(target&&Math.hypot(target.x-tower.x,target.y-tower.y)<=stats.range&&canDefenseTowerSee(tower,target)),lostTarget=hadCachedTarget&&!targetValid;if(!targetValid)target=null;d.targetScans=(d.targetScans||0)+1;target=pickDefenseTarget(tower,stats,defenseTargetSnapshot(d,lostTarget));tower.targetRef=target||null;tower.targetId=target?.id||null;tower.retargetAtReal=realTime+budget.targetRefreshMs/1000;}if(tower.cooldown>0||!target)continue;stats||=(defenseCombatStats(tower));if(!canDefenseTowerSee(tower,target)||Math.hypot(target.x-tower.x,target.y-tower.y)>stats.range){tower.targetId=null;tower.targetRef=null;tower.retargetAtReal=0;continue;}tower.cooldown=1/Math.max(.2,stats.rate);fireDefenseTower(tower,target,stats);}
    if(goldenAwakened){const factoryCount=d.towers.filter(item=>defenseStructureType(item)==="factory").length;d.goldenCoinCarry+=dt*Math.min(2,goldenAwakened)*.75*(1+Math.min(.8,factoryCount*.2));const payout=Math.floor(d.goldenCoinCarry);if(payout>0){d.goldenCoinCarry-=payout;queueDefenseIncome(payout,"golden-passive");}}
  }

  const DEFENSE_GATE_FLAME_DURATION=12;
  const DEFENSE_GATE_FLAME_COOLDOWN=38;
  function toggleDefenseGateFlame(){
    const d=mini.defense;if(!d)return false;const time=defenseNow(),active=(d.gateFlameUntil||0)>time,remaining=Math.max(0,(d.gateFlameReadyAt||0)-time);
    if(active){setDefenseMessage("EMBER POD ACTIVE","The pod is already bursting across that stretch of trail.");sfx("no");return false;}
    if(!defenseIsActiveWave(d)||d.paused){setDefenseMessage("START THE WAVE FIRST","Ember Pod is a live-field defense. Start a wave, then plant it on the road.");sfx("no");return false;}
    if(remaining>0){setDefenseMessage(`EMBER POD RECHARGING • ${Math.ceil(remaining)}S`,"Hold the trail until the pod rebuilds pressure.");sfx("no");return false;}
    d.gateFlameArmed=!d.gateFlameArmed;clearDefensePlacementMode();closeDefenseTowerPanel();$(".defense-shell")?.classList.toggle("gate-flame-aiming",d.gateFlameArmed);setDefenseMessage(d.gateFlameArmed?"PLANT EMBER POD":"POD CANCELLED",d.gateFlameArmed?"Tap the road. The pod bursts outward every half-second for 12 seconds.":"Your strategy stays untouched.");markDefenseUi();flushDefenseUi(true);sfx("ui");haptic([6]);return true;
  }
  function placeDefenseGateFlame(event){
    const d=mini.defense;if(!d?.gateFlameArmed)return false;if(!defenseIsActiveWave(d)||d.paused){d.gateFlameArmed=false;$(".defense-shell")?.classList.remove("gate-flame-aiming");setDefenseMessage("POD CANCELLED","Resume the wave before placing a live-field defense.");markDefenseUi();return false;}const point=defenseArenaPoint(event,{strict:true});if(!point)return false;const nearest=nearestDefensePathPoint(point.x,point.y),world=$("#defenseWorld"),short=Math.max(1,Math.min(world?.clientWidth||390,world?.clientHeight||390)),maxDistance=Math.max(.045,26/short);
    if(nearest.distance>maxDistance){setDefenseMessage("PUT IT ON THE ROAD","Ember Pod locks onto the trail, not open grass.");haptic([10,16,10]);return true;}
    const time=defenseNow();d.gateFlameArmed=false;d.gateFlameProgress=nearest.progress;d.gateFlameUntil=time+DEFENSE_GATE_FLAME_DURATION;d.gateFlameReadyAt=time+DEFENSE_GATE_FLAME_COOLDOWN;d.gateFlameNextTick=time;d.gateFlameTicks=0;$(".defense-shell")?.classList.remove("gate-flame-aiming");setDefenseMessage("EMBER POD ONLINE","Radial bursts punish anything crossing this section of trail.");showDefenseCinematicMoment("power",{kicker:"FIELD DEFENSE",title:"EMBER POD",copy:"RADIAL BURST • 12 SECONDS",duration:1200,priority:2,icon:"✹"});markDefenseUi();flushDefenseUi(true);writeDefenseCheckpoint(true,"ember-pod");sfx("legendary");haptic([10,20,10]);return true;
  }
  function updateDefenseGateFlame(){
    const d=mini.defense;if(!d)return;const time=defenseNow();if((d.gateFlameUntil||0)<=time)return;if(time+1e-9<(d.gateFlameNextTick||0))return;d.gateFlameNextTick=time+.5;d.gateFlameTicks=(d.gateFlameTicks||0)+1;const center=d.gateFlameProgress||0,raw=2.0+Math.min(5.2,(d.currentWave||1)*.075),radius=.065;for(const enemy of d.enemies){if(enemy.dead||enemy.hp<=0)continue;if(Math.abs((enemy.progress||0)-center)>radius)continue;const damage=raw*(enemy.fireproof?.35:1);dealDefenseDamage(enemy,damage,null,"ember");if(!enemy.dead){enemy.slow=Math.max(enemy.slow||0,.18*(1-(enemy.slowResist||0)));enemy.slowUntil=Math.max(enemy.slowUntil||0,time+.7);if(!enemy.fireproof){enemy.burn=Math.max(enemy.burn||0,.55);enemy.burnUntil=Math.max(enemy.burnUntil||0,time+1.4);}}spawnDefenseImpact(enemy.x,enemy.y,"ember");}markDefenseUi();
  }

  function updateDefenseWeather(){const d=mini.defense,time=defenseNow();if(!defenseIsActiveWave(d)||time<d.nextWeatherAt)return;const weather=d.map.weather;d.nextWeatherAt=time+(weather==="ash"?12:weather==="moon"?12:weather==="storm"?11:weather==="blizzard"?10:weather==="eclipse"?9:999);if(weather==="ash"){d.ashUntil=time+3.2;setDefenseMessage("ASH VEIL", "THE TRAIL IS CAMOUFLAGED FOR 3 SECONDS. AWAKENED AND DETECTOR RIZOS KEEP SIGHT.");$("#defenseWorld")?.classList.add("weather-active");}else if(weather==="moon"){d.moonRevealUntil=time+3.5;for(const enemy of d.enemies)if(enemy.hp>0)revealDefenseEnemy(enemy,3.5);setDefenseMessage("MOONLIGHT WINDOW", "CAMOUFLAGE AND PHASING ARE EXPOSED FOR 3 SECONDS. PRESS THE ADVANTAGE.");$("#defenseWorld")?.classList.add("weather-active");}else if(weather==="storm"){d.stormWeatherUntil=time+3.4;setDefenseMessage("LIGHTNING SURGE", "EVERY BALLOON MOVES 32% FASTER FOR 3 SECONDS.");$("#defenseWorld")?.classList.add("weather-active");}else if(weather==="blizzard"){d.whiteoutUntil=time+4;setDefenseMessage("❄ WHITEOUT • RANGE -18%", "Most range rings shrink now. Frost and Aurora resist the whiteout.");$("#defenseWorld")?.classList.add("weather-active","whiteout-live");syncDefenseTowerGeometry();queueMiniTimeout(()=>{$("#defenseWorld")?.classList.remove("whiteout-live");syncDefenseTowerGeometry();},4100);}else if(weather==="eclipse"){d.eclipseUntil=time+4;setDefenseMessage("ECLIPSE VEIL", "EVERY BALLOON IS CAMOUFLAGED FOR 4 SECONDS.");$("#defenseWorld")?.classList.add("weather-active");}queueMiniTimeout(()=>$("#defenseWorld")?.classList.remove("weather-active"),4200);}
  function updateDefenseEnemies(dt){
    const d=mini.defense,time=defenseNow(),tier=d.renderTier||defenseApplyRenderTier(d);
    d.enemyStateVisualClock=(d.enemyStateVisualClock||0)+dt/Math.max(.5,d.speed||1);
    const stateInterval=tier===2?.20:tier===1?.14:.10,stateStep=d.enemyStateVisualClock>=stateInterval;if(stateStep)d.enemyStateVisualClock%=stateInterval;
    for(let index=d.enemies.length-1;index>=0;index-=1){
      const enemy=d.enemies[index];if(enemy.dead)continue;
      enemy.prevX=Number.isFinite(enemy.x)?enemy.x:0;enemy.prevY=Number.isFinite(enemy.y)?enemy.y:0;
      enemy.hitFlash=Math.max(0,enemy.hitFlash-dt);
      const phaseSuppressed=enemy.phaseSuppressedUntil>time||d.moonRevealUntil>time;if(enemy.phasing)enemy.phaseActive=!phaseSuppressed&&Math.sin(time*2.35+enemy.phaseOffset)>.32;
      if(enemy.burnUntil>time)dealDefenseDot(enemy,enemy.burn*dt,enemy.burnSource,"ember");if(enemy.dead)continue;
      if(enemy.poisonUntil>time)dealDefenseDot(enemy,enemy.poison*dt,enemy.poisonSource,"toxic");if(enemy.dead)continue;
      if(enemy.healer)pulseDefenseMender(enemy,time);
      handleDefenseBossMechanics(enemy);if(enemy.dead)continue;
      enemy.stormCharging=Boolean(enemy.stormPulse&&((time+enemy.phaseOffset)%4.8)<1.15);
      const rooted=enemy.rootUntil>time,slow=enemy.slowUntil>time?1-enemy.slow:1,signalPulse=(enemy.signalStaggerUntil||0)>time?.72:1,previousRelayBoosted=Boolean(enemy.relayBoosted);enemy.relayBoosted=Boolean(defenseRelaySupport(enemy,d));const relayChanged=previousRelayBoosted!==enemy.relayBoosted,relayPulse=enemy.relayBoosted?1.22:1,stormPulse=enemy.stormPulse?(((time+enemy.phaseOffset)%4.8)<1.15?.65:((time+enemy.phaseOffset)%4.8)<2.2?1.85:1):1,apexPulse=enemy.bossId==="apex"?(enemy.apexSurgeUntil>time?1.9:.82):1,mapPulse=d.stormWeatherUntil>time?1.32:1;
      if(!rooted)enemy.progress+=enemy.speed*DEFENSE_GLOBAL_MOVEMENT_PACE*slow*signalPulse*relayPulse*stormPulse*apexPulse*mapPulse*dt;
      const point=defensePointAt(Math.min(enemy.progress,.999));enemy.x=point.x;enemy.y=point.y;
      if(enemy.progress>=1){enemy.dead=true;const key=enemy.bossId?`boss:${enemy.bossId}`:enemy.type,loss=Math.min(d.lives,enemy.damage);releaseDefenseEnemyNode(enemy);d.enemies.splice(index,1);removeDefenseRuntimeItem(mini.entities,enemy);d.waveResolved+=1;d.lives=Math.max(0,d.lives-enemy.damage);defenseRecordEnemyStat("leaked",key);d.enemyStats.heartLoss+=loss;markDefenseUi();const end=defenseGatePoint(d.map);spawnDefenseImpact(end.x,end.y,"gate");showDefenseGateDamageMoment(loss);sfx("defense-gate-hit");defenseHaptic("gate");if(d.lives<=0){finishDefenseRunWithMoment("gate");return;}}
      else{if(!d.fixedSimulation)positionDefenseEnemyNode(enemy);if(stateStep||enemy.telegraphKind||relayChanged)updateDefenseEnemyNode(enemy);}
    }
  }


  function reducedMotionActive(){
    try{return Boolean(state?.settings?.reducedMotion||matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);}catch(error){return Boolean(state?.settings?.reducedMotion);}
  }
  function defenseReducedMotion(){ return reducedMotionActive(); }
  function showDefenseCinematicMoment(kind,options={}){
    const d=mini.defense,host=$("#defenseMoment"),shell=$(".defense-shell"),stage=$(".defense-stage-frame");if(!d||!host)return false;
    const base=DEFENSE_CINEMATIC_MOMENTS[kind]||DEFENSE_CINEMATIC_MOMENTS.clear,real=defenseRealNow(d),priority=Number.isFinite(Number(options.priority))?Number(options.priority):base.priority;
    if(d.cinematicMomentUntilReal>real&&priority<(d.cinematicMomentPriority||0))return false;
    const reduced=defenseReducedMotion(),duration=Math.max(120,Number(options.duration)||base.duration),effectiveDuration=reduced?Math.min(260,duration):duration,id=(d.cinematicMomentId||0)+1;
    d.cinematicMomentId=id;d.cinematicMomentCount=(d.cinematicMomentCount||0)+1;d.cinematicMomentKind=kind;d.cinematicMomentPriority=priority;d.cinematicMomentUntilReal=real+effectiveDuration/1000;
    const title=String(options.title||kind.replace(/-/g," ")).toUpperCase(),copy=String(options.copy||"");
    host.hidden=false;host.className=`defense-moment moment-${kind} tone-${options.tone||base.tone}${reduced?" reduced":""}`;host.style.setProperty("--moment-duration",`${effectiveDuration}ms`);host.innerHTML=`<div class="defense-moment-card"><i aria-hidden="true">${escapeHTML(options.icon||base.icon)}</i><span><small>${escapeHTML(options.kicker||"RIZO DEFENSE")}</small><b>${escapeHTML(title)}</b>${copy?`<em>${escapeHTML(copy)}</em>`:""}</span>${options.dismissible?`<button type="button" class="defense-moment-dismiss" data-defense-dismiss-moment aria-label="Dismiss reward">×</button>`:""}</div>`;host.classList.toggle("dismissible",Boolean(options.dismissible));
    if(shell){shell.dataset.cinematicMoment=kind;shell.classList.toggle("cinematic-danger",kind==="danger"||kind==="defeat");shell.classList.toggle("cinematic-boss",kind==="boss");}
    if(stage){stage.classList.remove("moment-pulse","moment-heavy");void stage.offsetWidth;stage.classList.add("moment-pulse");if(priority>=7)stage.classList.add("moment-heavy");}
    queueMiniTimeout(()=>{if(!mini.defense||mini.defense.cinematicMomentId!==id)return;host.hidden=true;host.className="defense-moment";host.textContent="";host.removeAttribute("style");if(shell){delete shell.dataset.cinematicMoment;shell.classList.remove("cinematic-danger","cinematic-boss");}stage?.classList.remove("moment-pulse","moment-heavy");d.cinematicMomentKind=null;d.cinematicMomentPriority=0;d.cinematicMomentUntilReal=defenseRealNow(d);},effectiveDuration+40);
    return true;
  }
  function showDefenseGateDamageMoment(loss=1){
    const d=mini.defense;if(!d)return false;const real=defenseRealNow(d),critical=d.lives<=Math.max(5,Math.ceil(d.map.lives*.35));if(real-(d.lastGateMomentAtReal||-99)<.28&&!critical)return false;d.lastGateMomentAtReal=real;return showDefenseCinematicMoment("danger",{title:critical?`GATE CRITICAL • ${d.lives} HEART${d.lives===1?"":"S"}`:`GATE HIT • -${Math.max(1,loss)}`,copy:critical?"THE EMBER GATE IS ONE BAD LEAK FROM TROUBLE.":"A threat reached the end of the trail."});
  }
  function finishDefenseRunWithMoment(reason="banked"){
    const d=mini.defense;if(!mini.active||mini.mode!=="defense"||!d||d.ending)return false;flushDefenseIncome(d,reason==="gate"?"defeat":"bank");d.ending=true;d.endingReason=reason;cancelDefenseTransientInput(`run-${reason}`);clearDefensePlacementMode();defenseSetPhase(d,DEFENSE_PHASES.RUN_COMPLETE,{force:true});
    if(reason==="gate"){setDefenseMessage("EMBER GATE DOWN",`Cleared Wave ${d.clearedWave}. Reached Wave ${d.currentWave}.`);showDefenseCinematicMoment("defeat",{title:"GATE DOWN",copy:`CLEARED ${d.clearedWave} • REACHED ${d.currentWave}`});sfx("no");haptic([26,42,26,70]);}
    else{setDefenseMessage("RUN BANKED",d.currentWave>d.clearedWave?`Cleared ${d.clearedWave}. Wave ${d.currentWave} was active and is not credited.`:`Cleared ${d.clearedWave}. Progress is secured.`);showDefenseCinematicMoment("bank",{title:"RUN BANKED",copy:d.currentWave>d.clearedWave?`CLEARED ${d.clearedWave} • WAVE ${d.currentWave} EXCLUDED`:`CLEARED ${d.clearedWave} • PROGRESS SECURED`});sfx("reward");haptic([10,18,10,28]);}
    markDefenseUi();flushDefenseUi(true);const delay=defenseReducedMotion()?90:(reason==="gate"?920:680);queueMiniTimeout(()=>{if(mini.active&&mini.mode==="defense"&&mini.defense?.ending)finishMiniGame(false,reason);},delay);return true;
  }
  function hideDefenseMessage(){const host=$("#defenseMessage");if(host)host.hidden=true;}
  function setDefenseMessage(title,text=""){const host=$("#defenseMessage");if(!host)return;host.hidden=false;host.innerHTML=`<b>${escapeHTML(title)}</b>${text?`<span>${escapeHTML(text)}</span>`:""}`;host.classList.remove("flash","milestone");void host.offsetWidth;host.classList.add("flash");}
  function isWaveFullyResolved(d=mini.defense){return Boolean(d&&d.waveResolved>=d.waveTotal&&d.packetIndex>=d.wavePackets.length&&d.spawnQueue.length===0&&d.childSpawnQueue.length===0&&!d.enemies.some(enemy=>!enemy.dead));}
  function retireDefenseWaveResidue(d=mini.defense){if(!d)return;for(const shot of d.projectiles||[])releaseDefenseProjectileNode(shot);d.projectiles=[];d.effects=(d.effects||[]).filter(effect=>effect?.major&&Number(effect.expiresAt)>defenseNow());}
  function completeDefenseWave(){const d=mini.defense;if(!d||d.ending||d.lives<=0||d.currentWave<=d.clearedWave||!defenseIsSimulating(d)||!isWaveFullyResolved(d))return false;retireDefenseWaveResidue(d);d.gateFlameArmed=false;d.gateFlameUntil=Math.min(d.gateFlameUntil||0,d.clock);$(".defense-shell")?.classList.remove("gate-flame-aiming");flushDefenseIncome(d,"wave-complete");d.clearedWave=Math.max(d.clearedWave,d.currentWave);const heartsLost=Math.max(0,d.enemyStats.heartLoss-(d.waveHeartLossStart||0));if(heartsLost===0)d.perfectWaveCount=Math.min(d.clearedWave,(d.perfectWaveCount||0)+1);const bonus=DefenseCore.calculateWaveBonus({clearedWave:d.clearedWave,heartsLostThisWave:heartsLost,towersPlaced:d.towers.length});d.cash=DefenseCore.clampNumber(d.cash+bonus,0,DEFENSE_LIMITS.MAX_RUN_CASH,d.cash);d.cashWriteCount=(d.cashWriteCount||0)+1;d.lastWaveBonus=bonus;defenseSetPhase(d,DEFENSE_PHASES.WAVE_COMPLETE);d.nextWaveReadyAtReal=defenseRealNow(d)+.72;d.autoStartAtReal=state.settings.defenseAutoStart?defenseRealNow(d)+2.8:0;const contractProgress=recordDefenseContractProgress(d),unlocked=DEFENSE_MILESTONES.find(value=>value===d.clearedWave&&!state.scores.defenseMilestones.includes(value));if(unlocked){state.scores.defenseMilestones.push(unlocked);state.scores.defenseMilestones.sort((a,b)=>a-b);saveState();}if(contractProgress.justCompleted){setDefenseMessage("CONTRACT SEALED • WAVE 10","The Gate recorded ten completed waves. Started waves never count.");$("#defenseMessage")?.classList.add("milestone");haptic([18,28,18,40]);sfx("legendary");}else if(unlocked){setDefenseMessage(`MILESTONE • WAVE ${unlocked}`,unlocked===100?"THE GATE NOW KNOWS YOUR NAME.":"A completed-wave badge was recorded.");$("#defenseMessage")?.classList.add("milestone");haptic([18,30,18,45]);sfx("legendary");}else{setDefenseMessage(`+${bonus} COINS • WAVE ${d.clearedWave} CLEAR`,defenseWaveFlavor(d.mapId,d.clearedWave,{cleared:true,perfect:heartsLost===0}));duckMusic(520,.14);sfx("defense-wave-clear");defenseHaptic(heartsLost===0?"perfect":"clear");}renderDefensePresentation(1,true);const milestoneMoment=Boolean(contractProgress.justCompleted||unlocked||d.clearedWave===10),perfectMoment=heartsLost===0,momentTone=milestoneMoment?"milestone":perfectMoment?"perfect":"money",momentTitle=d.clearedWave===10?"THE GATE HELD.":unlocked?`WAVE ${unlocked} MARKED`:perfectMoment?"PERFECT CLEAR":`+${bonus} GOLD`,momentCopy=d.clearedWave===10?`+${bonus} GOLD • CHAPTER ONE CLEAR. SOMETHING ELSE HEARD THAT.`:contractProgress.justCompleted?`+${bonus} GOLD • CONTRACT SEALED`:unlocked?`+${bonus} GOLD • THE TRAIL REMEMBERS THIS ONE`:perfectMoment?`+${bonus} GOLD • NOTHING TOUCHED THE GATE`:defenseWaveFlavor(d.mapId,d.clearedWave,{cleared:true});showDefenseCinematicMoment("money",{kicker:`WAVE ${d.clearedWave} CLEAR`,title:momentTitle,copy:momentCopy,duration:milestoneMoment?2300:perfectMoment?2100:1900,priority:milestoneMoment?7:perfectMoment?6:5,tone:momentTone,icon:milestoneMoment?"✦":perfectMoment?"★":"🪙",dismissible:true});updateDefenseRoster();markDefenseUi();flushDefenseUi(true);writeDefenseCheckpoint(true,"wave-clear");return true;}
  function defenseDensityCap(d=mini.defense,nextEntry=null){if(!d)return 0;return DefenseCore.densityCap({low:false,speed:d.speed,bossActive:d.enemies.some(enemy=>enemy.bossId)||(typeof nextEntry==="object"&&nextEntry?.type==="boss")});}
  function defenseDensityAllowsSpawn(d,nextEntry,child=false){if(!d)return false;const cap=defenseDensityCap(d,nextEntry),reserved=child?0:DefenseCore.childReservationCount(d.childSpawnQueue,d.clock,.2,3),active=d.enemies.length;return active+reserved<cap;}
  function updateDefenseRealTime(realDt){
    const d=mini.defense;if(!d)return;const safeRealDt=Math.max(0,Number(realDt)||0);
    d.realClock=(d.realClock||0)+safeRealDt;d.uiClock=(d.uiClock||0)+safeRealDt;maybeWriteDefenseCheckpoint(safeRealDt);defenseApplyRenderTier(d);
    if(d.pendingIncome&&defenseRealNow(d)>=(d.nextIncomeFlushAtReal||0))flushDefenseIncome(d,"timer");
    if((d.flowEaseUntilReal||0)>0&&defenseRealNow(d)>=(d.flowEaseUntilReal||0)){d.flowEaseUntilReal=0;markDefenseUi();}
    if(d.phase===DEFENSE_PHASES.WAVE_COMPLETE&&state.settings.defenseAutoStart&&d.towers.length){
      const planningBusy=Boolean(d.pendingPlacement||defenseContextSurface(d)),held=d.flowAutoHeldWave===d.clearedWave;
      if(held)d.autoStartAtReal=0;
      else if(planningBusy)d.autoStartAtReal=defenseRealNow(d)+2.8;
      else if(!(d.autoStartAtReal>0))d.autoStartAtReal=defenseRealNow(d)+2.8;
      else if(defenseRealNow(d)>=d.autoStartAtReal)startDefenseWave();
    }else if(!state.settings.defenseAutoStart)d.autoStartAtReal=0;
    if(d.uiClock>=defensePerformanceBudget(d).uiRefreshMs/1000){d.uiClock=0;flushDefenseUi();}
  }

  function stepDefenseSimulation(dt){
    const d=mini.defense;if(!d||d.phase===DEFENSE_PHASES.PAUSED||!defenseIsSimulating(d))return false;
    d.clock+=dt;
    for(let i=d.effects.length-1;i>=0;i--){const effect=d.effects[i];if(effect.expiresAt<=d.clock){if(effect.node)releaseDefenseImpactNode(effect.node);d.effects.splice(i,1);}}
    if(d.phase===DEFENSE_PHASES.COUNTDOWN&&d.clock>=d.nextSpawnAt)defenseSetPhase(d,DEFENSE_PHASES.COMBAT);
    if(d.phase===DEFENSE_PHASES.PACKET_BREAK&&d.clock>=d.packetBreakUntil){defenseSetPhase(d,DEFENSE_PHASES.COMBAT);}
    updateDefenseWeather();releaseDefenseChildSpawn(d);
    if(d.phase===DEFENSE_PHASES.COMBAT&&d.packetIndex<d.wavePackets.length){
      const packet=d.wavePackets[d.packetIndex],entry=packet?.enemies?.[d.packetEnemyIndex];
      if(entry!==undefined&&d.clock>=d.nextSpawnAt&&defenseDensityAllowsSpawn(d,entry)){const enemy=spawnDefenseEnemy(entry);enemy.spawnDescriptor=typeof entry==="string"?entry:{...entry};d.lastSpawnedEnemyId=enemy.id;d.packetEnemyIndex+=1;d.spawnQueue.shift();d.nextSpawnAt=d.clock+DefenseCore.clampNumber(packet.spawnGap,.07,1.0,.34);d.spawnWaitReason="timer";markDefenseUi();}
      else if(entry!==undefined)d.spawnWaitReason=defenseDensityAllowsSpawn(d,entry)?"timer":"density";
      if(d.packetEnemyIndex>=packet.enemies.length){d.packetIndex+=1;d.packetEnemyIndex=0;if(d.packetIndex<d.wavePackets.length){d.packetBreakUntil=d.clock+DefenseCore.clampNumber(packet.breakAfter,.8,2.4,1.2);defenseSetPhase(d,DEFENSE_PHASES.PACKET_BREAK);}}
    }
    updateDefenseEnemies(dt);if(!mini.active||d.ending||d.lives<=0)return false;updateDefenseGateFlame();d.peakAlive=Math.max(d.peakAlive||0,d.enemies.length);d.maxActiveEnemiesObserved=Math.max(d.maxActiveEnemiesObserved||0,d.enemies.length);updateDefenseTowers(dt);updateDefenseProjectiles(dt);if(isWaveFullyResolved(d))completeDefenseWave();return true;
  }

  function renderDefensePresentation(alpha=1,force=false){
    const d=mini.defense;if(!d)return false;const blend=clamp(Number(alpha)||0,0,1);
    if(d.rendererMode==="canvas"){
      if(!d.canvasRenderer?.enabled)fallbackDefenseCanvasToDom("renderer-disabled");
      else{const rendered=d.canvasRenderer.render({enemies:d.enemies,projectiles:d.projectiles,effects:d.effects,alpha:blend,gameTime:defenseNow(),tier:d.governorTier||0,width:d.renderWidth,height:d.renderHeight});if(rendered){d.canvasFrames=(d.canvasFrames||0)+1;d.presentationFrames=(d.presentationFrames||0)+1;return true;}fallbackDefenseCanvasToDom("render-returned-false");}
    }
    for(const enemy of d.enemies){if(enemy.dead||!enemy.node)continue;const x=Number.isFinite(enemy.prevX)?enemy.prevX+(enemy.x-enemy.prevX)*blend:enemy.x,y=Number.isFinite(enemy.prevY)?enemy.prevY+(enemy.y-enemy.prevY)*blend:enemy.y;positionDefenseEnemyNode(enemy,force,x,y);}
    for(const shot of d.projectiles){if(!shot.node)continue;const x=Number.isFinite(shot.prevX)?shot.prevX+(shot.x-shot.prevX)*blend:shot.x,y=Number.isFinite(shot.prevY)?shot.prevY+(shot.y-shot.prevY)*blend:shot.y;if(positionDefenseMovingNode(shot.node,x,y))d.projectilePositionWrites=(d.projectilePositionWrites||0)+1;}
    d.presentationFrames=(d.presentationFrames||0)+1;return true;
  }

  function advanceDefenseFixedFrame(realDt,{forceRender=false}={}){
    const d=mini.defense;if(!d)return false;const safeRealDt=Math.max(0,Number(realDt)||0),step=DefenseCore.SIMULATION?.stepSeconds||1/30,maxSteps=DefenseCore.SIMULATION?.maxCatchUpSteps||4;
    updateDefenseRealTime(safeRealDt);d.fixedSimulation=true;
    if(d.phase===DEFENSE_PHASES.PAUSED||!defenseIsSimulating(d)){d.simAccumulator=0;d.presentationAccumulator=(d.presentationAccumulator||0)+safeRealDt;if(forceRender)renderDefensePresentation(1,true);return true;}
    d.simAccumulator=(d.simAccumulator||0)+safeRealDt*Math.max(.5,defensePlaybackSpeed(d)||1);let steps=0;
    while(d.simAccumulator+1e-9>=step&&steps<maxSteps&&mini.active){const began=performance.now();stepDefenseSimulation(step);const elapsed=Math.max(0,performance.now()-began);d.simStepSamples ||= [];d.simStepSamples.push(elapsed);if(d.simStepSamples.length>120)d.simStepSamples.shift();d.simStepWorst=Math.max(d.simStepWorst||0,elapsed);d.simAccumulator-=step;steps+=1;}
    d.lastSimSteps=steps;d.maxCatchUpObserved=Math.max(d.maxCatchUpObserved||0,steps);
    if(d.simAccumulator>=step){d.simBacklogEvents=(d.simBacklogEvents||0)+1;d.performanceLow=true;d.governorTier=2;d.simAccumulator=Math.min(d.simAccumulator,step*.99);}
    if(d.simStepSamples?.length){const sorted=[...d.simStepSamples].sort((a,b)=>a-b),pick=q=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];d.simStepP95=pick(.95);}
    d.presentationAccumulator=(d.presentationAccumulator||0)+safeRealDt;const presentationFps=defenseVisualBudget(d).presentationFps||60,interval=1/presentationFps,shouldRender=forceRender||d.presentationAccumulator+1e-6>=interval;
    if(shouldRender){d.presentationAccumulator%=interval;renderDefensePresentation(step>0?d.simAccumulator/step:1,forceRender);}
    return true;
  }

  // Compatibility entry point used by the QA harness and older call sites. The
  // supplied game-time dt is intentionally ignored: v76 derives game time from
  // real time + the selected speed and advances only fixed 1/30 s simulation steps.
  function updateDefenseGame(dt,realDt=dt/Math.max(.5,mini.defense?.speed||1)){return advanceDefenseFixedFrame(realDt);}


  function handleDefensePointerDown(event){
    if(event.target.closest("[data-defense-dismiss-moment]")){const host=$("#defenseMoment");if(host){host.hidden=true;host.textContent="";}return;}
    if(event.target.closest("[data-defense-dismiss-context]")){defenseDismissContextSurface();return;}
    if(event.target.closest("#defenseMapIntro")){closeDefenseMapIntro();return;}
    if(event.target.closest("[data-defense-trace-route]")){toggleDefenseFieldMenu(false);traceDefenseRoute();return;}
    if(event.target.closest("[data-defense-school-hide-run]")){if(mini.defense){mini.defense.schoolHiddenRun=true;updateDefenseSchoolCoach();}return;}
    if(event.target.closest("[data-defense-field-guide]")){toggleDefenseFieldMenu(false);showDefenseFieldGuide(event.target.closest("[data-defense-field-guide]").dataset.defenseFieldGuide||"rizos");return;}
    const speed=event.target.closest("[data-defense-speed]");
    if(speed){cycleDefenseSpeed();return;}
    if(event.target.closest("[data-defense-toggle-abilities]")){toggleDefenseAbilityTray();return;}
    if(event.target.closest("[data-defense-gate-flame]")){toggleDefenseGateFlame();return;}
    if(event.target.closest("[data-defense-toggle-intel]")){toggleDefenseIntel();return;}
    if(event.target.closest("[data-defense-toggle-bench]")){toggleDefenseBench();return;}
    if(event.target.closest("[data-defense-toggle-field-menu]")){toggleDefenseFieldMenu();return;}
    if(event.target.closest("[data-defense-auto-start]")){state.settings.defenseAutoStart=!state.settings.defenseAutoStart;saveState(true);if(mini.defense){mini.defense.flowAutoHeldWave=-1;mini.defense.autoStartAtReal=state.settings.defenseAutoStart&&mini.defense.phase===DEFENSE_PHASES.WAVE_COMPLETE?defenseRealNow(mini.defense)+2.8:0;markDefenseUi();flushDefenseUi(true);}setDefenseMessage(state.settings.defenseAutoStart?"AUTO WAVES ON":"AUTO WAVES OFF",state.settings.defenseAutoStart?"The next cleared field gets a 2.8-second planning countdown. You can HOLD FIELD for one boundary without disabling the setting.":"Wave boundaries are yours again. Start each formation when you are ready.");sfx("ui");return;}
    if(event.target.closest("[data-arcade-pause]")){toggleDefenseFieldMenu(false);openArcadePause();return;}
    if(event.target.closest("[data-defense-bank-leave]")){writeDefenseCheckpoint(true,"field-menu-leave");finishDefenseRunWithMoment("banked");return;}
    if(event.target.closest("[data-defense-toggle-legend]")){toggleDefenseFieldMenu(false);showDefenseControlLegend();return;}
    if(event.target.closest("[data-defense-toggle-fullscreen]")){toggleDefenseFieldMenu(false);toggleDefenseFullscreen();return;}
    const cast=event.target.closest("[data-defense-cast]")?.dataset.defenseCast;
    if(cast){activateDefenseAbility(cast,{keepAbilityTray:true});updateDefenseAbilityTray();return;}
    const castGroup=event.target.closest("[data-defense-cast-group]")?.dataset.defenseCastGroup;
    if(castGroup){activateDefenseAbilityGroup(castGroup);return;}
    const flowAction=event.target.closest("[data-defense-flow-action]")?.dataset.defenseFlowAction;
    if(flowAction){runDefenseFlowAction(flowAction);return;}
    const cancel=event.target.closest("[data-defense-cancel-placement]");
    if(cancel){clearDefensePlacementMode();setDefenseMessage("PLACEMENT CANCELLED","Tap a Rizo below whenever you are ready.");return;}
    const runControl=event.target.closest("[data-defense-run-control]");
    if(runControl){if(defenseIsActiveWave(mini.defense))toggleDefensePause();else startDefenseWave();return;}
    const close=event.target.closest("[data-defense-close-panel]");
    if(close){closeDefenseTowerPanel();return;}
    const doctrineRaw=event.target.closest("[data-defense-doctrine]")?.dataset.defenseDoctrine;
    if(doctrineRaw){const [id,doctrine]=doctrineRaw.split(":");chooseDefenseDoctrine(id,doctrine);return;}
    const targetId=event.target.closest("[data-defense-target]")?.dataset.defenseTarget;
    if(targetId){cycleDefenseTarget(targetId);return;}
    const upgrade=event.target.closest("[data-defense-upgrade]")?.dataset.defenseUpgrade;
    if(upgrade){upgradeDefenseTower(upgrade);return;}
    const ability=event.target.closest("[data-defense-ability]")?.dataset.defenseAbility;
    if(ability){activateDefenseAbility(ability);return;}
    const superId=event.target.closest("[data-defense-super]")?.dataset.defenseSuper;if(superId){ascendDefenseTower(superId);return;}
    const confirmSell=event.target.closest("[data-defense-confirm-sell]")?.dataset.defenseConfirmSell;if(confirmSell){sellDefenseTower(confirmSell);return;}
    if(event.target.closest("[data-defense-cancel-sell]")){const tower=mini.defense?.towers.find(item=>item.id===mini.defense?.selectedTowerId);if(tower)showDefenseTowerPanel(tower);return;}
    const sell=event.target.closest("[data-defense-sell]")?.dataset.defenseSell;
    if(sell){requestSellDefenseTower(sell);return;}
    const towerId=event.target.closest("[data-defense-tower]")?.dataset.defenseTower;
    if(towerId){event.preventDefault?.();event.stopPropagation?.();const tower=mini.defense.towers.find(item=>item.id===towerId);if(tower){tower.node?.classList.remove("tap-pop");void tower.node?.offsetWidth;tower.node?.classList.add("tap-pop");showDefenseTowerPanel(tower);haptic([5]);}return;}
    const rosterButton=event.target.closest("[data-defense-roster-id]");
    const petId=rosterButton?.dataset.defenseRosterId;
    if(petId){
      const row=defenseDeployRegistry().get(petId),d=mini.defense;
      if(!row)return;
      if(d.towers.length>=d.maxTowers){toast("THE FIELD IS FULL");return;}
      if(defenseContractRule("unique",d)&&d.towers.some(tower=>tower.petId===row.pet.id)){setDefenseMessage("CONTRACT • NO COPIES",`${row.pet.name} already stands on this field.`);return;}
      const cost=defenseDeployCost(row);
      if(d.cash<cost){toast(`NEED ${cost} DEFENSE COINS`);return;}
      beginDefenseDrag(event,row);return;
    }
    if(event.target.closest("#defenseWorld")){
      const d=mini.defense;
      if(d.gateFlameArmed){placeDefenseGateFlame(event);return;}
      if(d.pendingPlacement){
        const raw=defenseArenaPoint(event,{strict:true}),result=raw?resolveDefensePlacement(raw.x,raw.y,null,{snapPx:DEFENSE_PLACEMENT_SNAP_PX}):null;
        if(result?.evaluation?.valid)placeDefenseTower(d.pendingPlacement.row,result.point.x,result.point.y,d.pendingPlacement.cost);
        else{if(result)updateDefensePlacementPreview(result,d.pendingPlacement.row);setDefenseMessage("THAT SPOT IS BLOCKED",defensePlacementReasonCopy(result?.evaluation));sfx("no");haptic([12,18,12]);queueMiniTimeout(hideDefensePlacementPreview,700);}
        return;
      }
      closeDefenseTowerPanel();
      if(d.towers.length)setDefenseMessage("FIELD READY","Tap a deployed Rizo to inspect it, or choose another from the bench.");
      else setDefenseMessage("SELECT A RIZO FIRST","Tap a roster card below. No dragging is required.");
    }
  }

  function rewardDefenseRun(){const d=mini.defense,clearedWave=DefenseCore.clampInteger(d?.clearedWave,0,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,0);if(!d||clearedWave<=0)return{embers:0,trained:0};const embers=DefenseCore.calculateRunEmbers({clearedWave,kills:d.kills,bossesDefeated:d.bossesDefeated??new Set(d.bossesBeaten||[]).size,perfectWaveCount:d.perfectWaveCount}),killsByPet=new Map();let trained=0;for(const tower of d.towers)killsByPet.set(tower.petId,(killsByPet.get(tower.petId)||0)+(tower.kills||0));const rosterById=new Map(defenseRoster().map(row=>[row.pet.id,row.pet])),usedIds=new Set(d.usedPetIds?.length?d.usedPetIds:d.towers.map(tower=>tower.petId));for(const petId of usedIds){const pet=rosterById.get(petId);if(!pet||pet.defenseGuest)continue;const towerKills=killsByPet.get(petId)||0;pet.skills||={speed:0,power:0,instinct:0,stamina:0,luck:0};pet.genes||=createGenes();const amount=Math.min(8,.25+clearedWave*.12+towerKills*.035);for(const key of["power","instinct","stamina"]){const before=Number(pet.skills[key])||0;pet.skills[key]=clamp(before+amount*(key==="power"?1:.55),0,Number(pet.genes[key])||100);}pet.xp=(Number(pet.xp)||0)+Math.min(90,clearedWave*2.2+towerKills*.5);pet.bond=clamp((Number(pet.bond)||0)+Math.min(8,clearedWave*.18));pet.careProfile||={kind:0,wild:0,balanced:0,foods:{},games:{}};pet.careProfile.games||={};pet.careProfile.games.defense=(pet.careProfile.games.defense||0)+1;trained+=1;}state.wallet.embers+=embers;state.pet.energy=clamp(state.pet.energy-8);state.pet.hunger=clamp(state.pet.hunger-3);state.pet.mood=clamp(state.pet.mood+Math.min(18,clearedWave*.6));state.meta.totalGames+=1;earnHeat(Math.min(80,10+clearedWave*3),false);progressQuest("play");saveState();return{embers,trained};}


  function cleanupMiniRuntime() {
    mini.defense?.canvasRenderer?.destroy?.();if(mini.defense){mini.defense.canvasRenderer=null;mini.defense.rendererMode="dom";}
    if (mini.defenseDrag?.ghost) mini.defenseDrag.ghost.remove(); hideDefensePlacementPreview();
    mini.defenseDrag = null;
    el.miniQuit.textContent = "QUIT RUN";
    el.miniArena.classList.remove("defense-host");
    el.miniGameOverlay.classList.remove("defense-active");
    document.documentElement.classList.remove("defense-performance-session");
    unlockDefenseViewport();
    clearInterval(mini.timer);
    clearArcadeJobs();
    if (mini.frame) cancelAnimationFrame(mini.frame);
    if (defenseResizeFrame) { cancelAnimationFrame(defenseResizeFrame); defenseResizeFrame = null; }
    stopRhythmVoices();
    for (const entity of mini.entities || []) entity.node?.remove?.();
    mini.intervals = []; mini.entities = [];
  }

  function unlockWalkTreasure(force = false) {
    const roll = force || Math.random() < .62;
    if (!roll) return null;
    const treasure=weightedPick(WALK_TREASURES);
    state.treasures[treasure.id]=(state.treasures[treasure.id]||0)+1;
    addMemory("WALK TREASURE", `${state.pet.name} found ${treasure.name}.`, treasure.icon);
    return treasure;
  }

  function unlockVariantDiscovery(id, source = "THE FOREST") {
    const variant = VARIANTS.find(item => item.id === id);
    if (!variant || state.collection[id]) return null;
    state.collection[id] = 1;
    state.wallet.shards += variant.rarity.includes("SECRET") ? 30 : 12;
    addMemory("RARE RIZO FOUND", `${variant.name} appeared through ${source}. It is now recorded in your collection.`, "? ");
    toast(`${variant.rarity}: ${variant.name}`);
    sfx(variant.rarity.includes("SECRET") ? "secret" : "legendary");
    celebrate();
    return variant;
  }

  function maybeUnlockSpecialRizo(mode, score, walkPath = null) {
    if (["rush","rhythm","glide","breaker"].includes(mode) && !state.collection.retro && (state.meta.retroSignal || 0) >= 100 && score >= 20) return unlockVariantDiscovery("retro", "AN ARCADE SIGNAL");
    // Choosing to follow the rustling (the risky fork) roughly doubles the
    // odds of the two rarest walk-only discoveries — the payoff for risk.
    const deepBonus = mini.walkRisk >= 4 || String(walkPath).includes("ruins") ? 3 : mini.walkRisk >= 2 || String(walkPath).startsWith("deep") ? 2 : 1;
    if (mode === "walk" && !state.collection.shadow && score >= 15 && Math.random() < .035 * deepBonus) {
      state.meta.shadowFinds = (state.meta.shadowFinds || 0) + 1;
      return unlockVariantDiscovery("shadow", walkPath === "deep" ? "THE RUSTLING PATH" : "A PATH THAT WAS NOT THERE BEFORE");
    }
    if (mode === "walk" && !state.collection.moss && score >= 10 && Math.random() < .12 * deepBonus) return unlockVariantDiscovery("moss", "THE RAIN TRAIL");
    return null;
  }

  // ===== SHARED ARCADE PAUSE / QUIT =====
  // One pause experience for the whole arcade instead of eleven. Defense and
  // Ember Beat keep their specialised timing: Defense pauses through its own
  // interruption path, and Rhythm's audio clock is credited by arcadeThaw().
  function arcadeCanPause(){ return Boolean(mini?.active && !mini.pausedByFork); }
  function arcadePauseLabel(){ return mini?.mode==="defense" ? "HOLD THE LINE" : "RUN PAUSED"; }
  function openArcadePause(){
    if(!arcadeCanPause() || mini.paused) return false;
    mini.paused=true;
    if(mini.mode==="defense"){
      const d=mini.defense;
      if(d && !d.paused){ d.paused=true; d.autoPaused=false; mini.defensePauseHeld=true; setDefenseMessage("RUN PAUSED","Nothing advances while this panel is open."); markDefenseUi(); flushDefenseUi(true); }
      arcadeHoldJobs("menu");
    } else arcadeFreeze("menu");
    renderArcadePausePanel();
    if(el.miniPausePanel) el.miniPausePanel.hidden=false;
    el.miniGameOverlay.classList.add("arcade-paused");
    if(el.miniPause){ el.miniPause.setAttribute("aria-expanded","true"); el.miniPause.textContent="RESUME"; }
    duckMusic(600,.05);
    sfx("ui");
    el.miniPausePanel?.querySelector("[data-arcade-resume]")?.focus({preventScroll:true});
    return true;
  }
  function closeArcadePause(silent=false){
    const wasPaused=Boolean(mini?.paused);
    if(mini) mini.paused=false;
    if(el.miniPausePanel) el.miniPausePanel.hidden=true;
    el.miniGameOverlay?.classList.remove("arcade-paused");
    if(el.miniPause){ el.miniPause.setAttribute("aria-expanded","false"); el.miniPause.textContent="PAUSE"; }
    if(!wasPaused) return false;
    if(mini?.active){
      if(mini.mode==="defense"){
        if(mini.defensePauseHeld && mini.defense){ mini.defense.paused=false; mini.defensePauseHeld=false; setDefenseMessage("BACK ON THE TRAIL","The wave continues where it stopped."); markDefenseUi(); flushDefenseUi(true); }
        arcadeReleaseJobs("menu");
      } else arcadeThaw("menu");
    }
    if(!silent) sfx("ui");
    return true;
  }
  function toggleArcadePause(){ return mini?.paused ? closeArcadePause() : openArcadePause(); }
  function renderArcadePausePanel(){
    const host=el.miniPausePanel;
    if(!host || !mini?.active) return;
    const mode=mini.mode,defense=mode==="defense";
    const score=Math.max(0,Math.floor(mini.score||0));
    const remaining=Number.isFinite(mini.endAt)?Math.max(0,(mini.endAt-now())/1000):0;
    const wave=defense?Math.max(0,Number(mini.defense?.clearedWave)||0):0;
    const stat=defense
      ? `<span><small>CLEARED</small><b>WAVE ${wave}</b></span><span><small>GATE</small><b>${Math.max(0,Number(mini.defense?.lives)||0)} ♥</b></span>`
      : `<span><small>THIS RUN</small><b>${formatNumber(score)}</b></span><span><small>TIME LEFT</small><b>${remaining.toFixed(1)}s</b></span>`;
    host.innerHTML=`<div class="arcade-pause-card">
      <small>${escapeHTML(arcadeName(mode))}</small>
      <h3>${arcadePauseLabel()}</h3>
      <div class="arcade-pause-stats">${stat}</div>
      <p>${defense?"Cleared waves are already banked. Nothing on the trail moves until you resume.":"The clock is frozen. Nothing spawns, nothing drains."}</p>
      <div class="arcade-pause-actions">
        <button type="button" class="primary" data-arcade-resume>RESUME</button>
        ${defense?"":`<button type="button" data-arcade-restart>RESTART</button>`}
        <button type="button" class="danger" data-arcade-quit>${defense?"BANK &amp; LEAVE":"END RUN"}</button>
      </div>
    </div>`;
  }
  function restartArcadeRun(){
    if(!mini?.active) return false;
    const mode=mini.mode;
    if(mode==="defense") return false;
    const score=Math.max(0,Math.floor(mini.score||0));
    // Restarting throws the run away, so a run worth keeping asks first.
    if(score>0 && arcadeRunQualified(mode,score) && !mini.restartConfirmed){
      mini.restartConfirmed=true;
      renderArcadePausePanel();
      const actions=el.miniPausePanel?.querySelector(".arcade-pause-actions");
      if(actions) actions.innerHTML=`<button type="button" class="danger" data-arcade-restart>DISCARD ${formatNumber(score)} • RESTART</button><button type="button" class="primary" data-arcade-resume>KEEP PLAYING</button>`;
      return false;
    }
    closeArcadePause(true);
    finishMiniGame(true,null,{discard:true});
    startMiniGame(mode);
    return true;
  }
  // A mis-tap used to destroy a personal best with zero friction. A run that
  // would actually count now confirms, and confirming banks it instead of
  // silently deleting it — the behaviour Defense already had.
  function requestArcadeQuit(source="button"){
    if(!mini?.active) return false;
    if(mini.mode==="defense"){ closeArcadePause(true); finishDefenseRunWithMoment("banked"); return true; }
    const mode=mini.mode,score=Math.max(0,Math.floor(mini.score||0));
    const meaningful=score>0 && arcadeRunQualified(mode,score);
    if(meaningful && !mini.quitConfirmed){
      mini.quitConfirmed=true;
      if(!mini.paused) openArcadePause();
      renderArcadePausePanel();
      const card=el.miniPausePanel?.querySelector(".arcade-pause-card");
      if(card){
        const copy=card.querySelector("p");
        if(copy) copy.textContent=`End the run here? ${formatNumber(score)} points bank exactly as they stand — the rest of the clock is forfeit.`;
        const actions=card.querySelector(".arcade-pause-actions");
        if(actions) actions.innerHTML=`<button type="button" class="danger" data-arcade-quit>BANK ${formatNumber(score)} • END RUN</button><button type="button" class="primary" data-arcade-resume>KEEP PLAYING</button>`;
      }
      sfx("no");
      return false;
    }
    closeArcadePause(true);
    finishMiniGame(true);
    return true;
  }

  function arcadeRunQualified(mode, score) {
    if(mode==="defense")return true;
    if(mode==="power")return Boolean(mini.powerEngaged && mini.hits>=2 && score>=2);
    if(mode==="spark")return Boolean(mini.hits>=2 && ((mini.sparkBanked||0)>0 || (mini.sparkStash||0)>=2));
    if(mode==="forage")return Boolean((mini.playerInputs||0)>=1 && mini.hits>=2);
    if(mode==="rush")return Boolean((mini.playerInputs||0)>=1 && ((mini.rushClears||0)>=2 || (mini.rushDeliveries||0)>=1));
    if(mode==="walk")return Boolean((mini.walkChoices||[]).length || ((mini.playerInputs||0)>=1 && mini.hits>=1));
    if(mode==="rhythm")return Boolean(mini.hits>=3);
    if(mode==="memory")return Boolean(mini.hits>=1);
    if(mode==="glide")return Boolean((mini.playerInputs||0)>=1 && (mini.glideClears||0)>=1);
    if(mode==="breaker")return Boolean((mini.breakerMoves||0)>=1 && score>=3);
    if(mode==="maze")return Boolean((mini.mazeInputs||0)>=1 && score>=5);
    return score>0;
  }

  // ===== SHARED ARCADE RESULTS =====
  // Every small game reports four stats drawn from play it already tracked.
  // Nothing here is invented to fill a slot: if a mode genuinely has only
  // three honest numbers, it ships three rather than padding.
  function arcadeResultStats(mode, snap){
    const lives=()=>({label:"HEARTS LEFT", value:`${snap.livesLeft}/${snap.maxLives}`});
    const table={
      power:[{label:"BEST STREAK",value:snap.powerBestStreak},{label:"COACH CALLS",value:snap.powerCallsRead},{label:"FEINTS READ",value:snap.powerGuardReads},{label:"WRONG SHOTS",value:snap.powerWrongCalls}],
      spark:[{label:"BANKS",value:snap.sparkBanks},{label:"BEST CHAIN",value:snap.sparkBestStreak},{label:"STASH LOST",value:snap.sparkLost},{label:"SPARK RUSHES",value:snap.sparkFrenzies}],
      forage:[{label:"LUNCH CHAIN",value:snap.forageBestStreak},{label:"TICKETS PACKED",value:snap.forageOrdersDone},{label:"PLATES TAKEN",value:snap.hits},{label:"PRISM ROLLS",value:snap.treasureRolls}],
      rush:[{label:"DELIVERIES",value:snap.rushDeliveries},{label:"CLEAN STREAK",value:snap.rushBestStreak},{label:"OBSTACLES",value:snap.rushClears},{label:"PACKAGES LOST",value:snap.rushPackagesLost}],
      walk:[{label:"DISTANCE",value:`${snap.walkDistance}m`},{label:"DISCOVERIES",value:snap.hits},{label:"TRAIL RISK",value:snap.walkRisk},{label:"LUCK READ",value:snap.walkLuck}],
      memory:[{label:"ROUND REACHED",value:snap.memoryRound},{label:"SIGNALS CLEAN",value:snap.hits},lives(),{label:"FINAL RULE",value:snap.memoryRuleLabel||"CLEAN SIGNAL"}],
      glide:[{label:"GATES CLEARED",value:snap.glideClears},{label:"THREAD STREAK",value:snap.glideBestStreak},{label:"THERMALS",value:snap.glideThermals},lives()],
      breaker:[{label:"FORGE REACHED",value:snap.breakerLevel},{label:"BRICKS BROKEN",value:snap.breakerBricks},{label:"CORES BROKEN",value:snap.breakerCoresBroken},{label:"BEST RALLY",value:snap.breakerBestStreak}],
      maze:[{label:"MAZE REACHED",value:snap.mazeLevel},{label:"BEST HUNT CHAIN",value:snap.mazeBestCombo},{label:"SHADOW TAGS",value:snap.mazeTags},{label:"PRISM HUNTS",value:snap.mazeHunts}]
    };
    return table[mode]||[];
  }
  function arcadeResultGrid(mode, snap){
    const stats=arcadeResultStats(mode, snap);
    if(!stats.length) return "";
    return `<div class="arcade-result-grid stat-${stats.length}">${stats.map(stat=>`<span>${escapeHTML(String(stat.label))}<b>${escapeHTML(String(stat.value))}</b></span>`).join("")}</div>`;
  }
  // Death, the clock running out, and walking away deliberately are three
  // different feelings and now read as three different screens.
  function arcadeResultVoice(mode, reason, score){
    const name=arcadeName(mode);
    if(reason==="death") return {
      headline:"RUN ENDED",
      line:score>=30?`${name} TOOK IT ALL THE WAY DOWN SWINGING.`:score>=10?"THAT LAST ONE GOT YOU.":"GONE ALREADY. BRUTAL.",
      art:"✖"
    };
    if(reason==="quit") return {
      headline:"RUN BANKED",
      line:score>=30?"WALKED AWAY RICH. RESPECT.":"CASHED OUT EARLY. NOTHING LOST.",
      art:"⏻"
    };
    if(mode==="walk"&&mini.walkEnding)return {headline:"HOME AGAIN",line:mini.walkEnding,art:"☾"};
    if(mode==="forage"&&mini.forageOrdersDone>0)return {headline:"LUNCH IS SERVED",line:`${mini.forageOrdersDone} LUNCHES PACKED. RIZO IS INSPECTING YOUR WORK.`,art:"🍓"};
    if(mode==="rush"&&mini.rushDeliveries>0)return {headline:"SHIFT COMPLETE",line:`${mini.rushDeliveries} PACKAGES SIGNED FOR. ${mini.rushPackagesLost?"WE DO NOT TALK ABOUT THE OTHERS.":"NOT A SINGLE COMPLAINT. YET."}`,art:"◆"};
    if(reason==="cleared") return { headline:"CLEARED", line:"THE WHOLE BOARD. CLEAN.", art:"✓" };
    return {
      headline:"TIME UP",
      line:score<5?"WE ARE NEVER POSTING THAT RUN.":score>35?"THAT LOOKED LIKE A REAL GAME TRAILER.":"OKAY. THAT WAS ACTUALLY CLEAN.",
      art:null
    };
  }

  // Why a run ended is now first-class. A player who died must not receive the
  // same screen as a player who outlasted the clock.
  const ARCADE_END_REASONS = Object.freeze({
    death:{label:"RUN ENDED", tone:"death"},
    timeup:{label:"TIME UP", tone:"timeup"},
    cleared:{label:"CLEARED", tone:"cleared"},
    quit:{label:"RUN BANKED", tone:"quit"}
  });
  const ARCADE_LIFE_MODES = Object.freeze(["rush","glide","breaker","maze","memory"]);
  function arcadeEndReason(mode, quit){
    if(quit) return "quit";
    if(mini.endReason && ARCADE_END_REASONS[mini.endReason]) return mini.endReason;
    if(ARCADE_LIFE_MODES.includes(mode) && (mini.lives||0) >= (mini.maxLives||3)) return "cleared";
    if(mode==="walk" && (mini.walkChoices||[]).length>=2) return "cleared";
    return "timeup";
  }
  function finishMiniGame(quit = false, defenseEndReason = null, options = {}) {
    if (!mini.active) return;
    const discard=Boolean(options?.discard);
    const completedMode=mini.mode;
    const endReason=arcadeEndReason(completedMode, quit);
    // Voluntarily ending a Spark run still banks the pile the player is holding.
    if(completedMode==="spark"&&!discard&&mini.sparkStash>0)bankSparkStash(true);
    const score=Math.max(0,Math.floor(mini.score));
    const treasureRolls=mini.treasureRolls||0;
    if(completedMode==="defense"&&mini.defense)flushDefenseIncome(mini.defense,"finish");
    const defenseSnapshot=completedMode==="defense"&&mini.defense?{currentWave:mini.defense.currentWave,clearedWave:mini.defense.clearedWave,wave:mini.defense.currentWave,ended:defenseEndReason==="gate"?"gate":"banked",lives:mini.defense.lives,kills:mini.defense.kills,cash:mini.defense.cash,totalDamage:mini.defense.totalDamage,towers:mini.defense.towers,usedPetIds:[...(mini.defense.usedPetIds||[])],bossesBeaten:[...(mini.defense.bossesBeaten||[])],bossesDefeated:mini.defense.bossesDefeated||0,perfectWaveCount:mini.defense.perfectWaveCount||0,enemyStats:JSON.parse(JSON.stringify(mini.defense.enemyStats||{})),contract:mini.defense.contract?{...mini.defense.contract}:null,mapId:mini.defense.mapId,map:mini.defense.map}:null;
    const rhythmSnapshot=completedMode==="rhythm"?{track:mini.rhythmTrack,maxStreak:mini.rhythmMaxStreak||0,accuracy:rhythmAccuracyPercent(),judgements:{...(mini.rhythmJudgements||{})},misses:mini.rhythmMisses||0,blankTaps:mini.rhythmBlankTaps||0}:null;
    const rhythmQuality=rhythmSnapshot?Math.max(5,Math.min(80,Math.round(rhythmSnapshot.accuracy*.45+Math.min(35,rhythmSnapshot.maxStreak*.7)))):score;
    const previousBest=Math.max(0,Number(state.scores?.[completedMode])||0);
    const qualifiedRun=arcadeRunQualified(completedMode,score);
    const livesLeft=Math.max(0,Math.floor(mini.lives||0));
    const arcadeSnapshot={endReason,livesLeft,maxLives:Math.max(1,Math.floor(mini.maxLives||3)),hits:Math.max(0,Math.floor(mini.hits||0)),walkDistance:Math.round(mini.walkDistance||0),walkRisk:mini.walkRisk||0,walkLuck:mini.walkLuck||0,walkChoices:[...(mini.walkChoices||[])],walkBiome:mini.walkBiome?.name||"",forageOrdersDone:mini.forageOrdersDone||0,rushPackagesLost:mini.rushPackagesLost||0,breakerBricks:mini.breakerBricks||0,memoryRuleLabel:completedMode==="memory"?memoryRuleLabel():"",treasureRolls,powerBestStreak:mini.powerBestStreak||0,powerCallsRead:mini.powerCallsRead||0,powerWrongCalls:mini.powerWrongCalls||0,sparkBestStreak:mini.sparkBestStreak||0,sparkAvoided:mini.sparkAvoided||0,sparkFrenzies:mini.sparkFrenzies||0,sparkBanks:mini.sparkBanks||0,sparkLost:mini.sparkLost||0,forageBestStreak:mini.forageBestStreak||0,rushBestStreak:mini.rushBestStreak||0,rushClears:mini.rushClears||0,rushDeliveries:mini.rushDeliveries||0,memoryRound:mini.memoryBestRound||mini.memoryRound||0,memoryLives:mini.memoryLives||0,memoryMode:mini.memoryMode||"forward",glideBestStreak:mini.glideBestStreak||0,glideGates:mini.glideGateCount||0,glideClears:mini.glideClears||0,glideThermals:mini.glideThermals||0,breakerBestStreak:mini.breakerBestStreak||0,breakerLevel:mini.breakerLevel||1,breakerCoresBroken:mini.breakerCoresBroken||0,powerGuardReads:mini.powerGuardReads||0,mazeLevel:mini.mazeLevel||1,mazeBestCombo:mini.mazeBestCombo||0,mazeTags:mini.mazeHunterTags||0,mazeHunts:mini.mazeHunts||0};
    mini.active=false;
    mini.paused=false;
    mini.pauseSources={};
    closeArcadePause(true);
    cleanupMiniRuntime();
    el.miniGameOverlay.hidden=true;
    el.miniArena.innerHTML="";
    syncUILock();
    activeMusicOverride=null;
    syncMusic(true);
    if(lastOverlayFocus?.isConnected) lastOverlayFocus.focus({preventScroll:true});
    if(discard) return;
    // Walking away from a run that never got going is a non-event. Only a run
    // the arcade would actually have credited earns a screen.
    if(quit && completedMode!=="defense" && !qualifiedRun) return;
    if(completedMode!=="defense"&&!qualifiedRun){
      const art=arcadeArt(completedMode);
      showModal(`<div class="modal-card arcade-result minigame-result-${completedMode} arcade-no-credit"><div class="modal-art">${art}</div><small class="arcade-result-mode">${escapeHTML(arcadeName(completedMode))}</small><h2>${score} POINTS</h2><p class="big-line">WARM-UP RUN. NO PERMANENT CREDIT.</p><p>Make at least one real play and complete part of the game's core challenge. No Energy, Embers, XP, Heat, or high-score credit was consumed or awarded.</p><div class="modal-buttons"><button class="primary" data-close-modal>BACK TO ARCADE</button><button data-replay-game="${completedMode}">TRY AGAIN</button></div></div>`);
      return;
    }
    if(completedMode==="defense") {
      clearDefenseCheckpoint();
      mini.defense={...defenseSnapshot,towers:defenseSnapshot?.towers||[]};
      const rewards=rewardDefenseRun();
      state.scores.defense=Math.max(state.scores.defense||0,defenseSnapshot?.clearedWave||0);
      state.scores.defenseMaps ||= {};
      const priorMapBest=defenseSnapshot?.mapId?Math.max(0,Math.floor(Number(state.scores.defenseMaps?.[defenseSnapshot.mapId])||0)):0;
      if(defenseSnapshot?.mapId)state.scores.defenseMaps[defenseSnapshot.mapId]=Math.max(priorMapBest,defenseSnapshot?.clearedWave||0);
      const runRecord=recordDefenseRun(defenseSnapshot);
      if((defenseSnapshot?.clearedWave||0)>0){const memory=lifeMemory();memory.arcadeAfterglowUntil=now()+16000;memory.lastArcadeMode="defense";}
      saveState();renderAll();
      const wave=defenseSnapshot?.clearedWave||0,reachedWave=defenseSnapshot?.currentWave||wave,kills=defenseSnapshot?.kills||0,lives=defenseSnapshot?.lives||0,bosses=[...new Set(defenseSnapshot?.bossesBeaten||[])],stats=defenseSnapshot?.enemyStats||{},heartLoss=Number(stats.heartLoss)||0,leaks=Object.values(stats.leaked||{}).reduce((sum,value)=>sum+(Number(value)||0),0),counters=stats.counters||{},leaders=[...(defenseSnapshot?.towers||[])].sort((a,b)=>(b.damage||0)-(a.damage||0)).slice(0,3),topTower=[...(defenseSnapshot?.towers||[])].filter(tower=>!String(tower.petId||"").startsWith("defense-crew-")&&!String(tower.petId||"").startsWith("defense-structure-")&&tower.petId!==DEFENSE_BASIC_TOWER.id).sort((a,b)=>(b.damage||0)-(a.damage||0))[0]||null,perfect=wave>0&&heartLoss===0,mapBest=Math.max(0,Math.floor(Number(state.scores.defenseMaps?.[defenseSnapshot?.mapId])||0)),medal=defenseMedalName(defenseMedalTier(mapBest)),mastery=runRecord?.mvpPetId?state.scores.defenseMastery?.[runRecord.mvpPetId]:null;
      const century=wave>=100,newBest=wave>priorMapBest;showModal(`<div class="modal-card arcade-result defense-result defense-run-recap ${century?"century-clear":""}"><div class="defense-result-hero"><div class="modal-art defense-result-balloon"><i></i></div><small>${escapeHTML(defenseSnapshot?.map?.name||"PINE BEND")} • RUN COMPLETE</small><h2>${century?"WAVE 100+":"WAVE "+wave}</h2>${newBest?`<div class="arcade-best-banner"><i aria-hidden="true">\u2605</i><div><small>NEW PERSONAL BEST</small><b>WAVE ${wave}</b><em>PREVIOUS WAVE ${priorMapBest}</em></div></div>`:""}<p class="big-line">${century?"THE GATE SURVIVED A CENTURY.":lives<=0?"THE GATE FINALLY FELL.":perfect?"PERFECT GATE. NOTHING GOT THROUGH.":"RUN BANKED."}</p></div><div class="defense-result-primary"><span>${defenseMedalMarkup(defenseSnapshot?.mapId,mapBest)}<b>${escapeHTML(medal)}</b></span><span><small>R EARNED</small><b>+${rewards.embers}</b></span><span><small>MVP</small><b>${escapeHTML(topTower?.pet?.name||runRecord?.mvpName||state.pet.name)}</b></span></div><div class="defense-result-grid v80"><span>POPS<b>${kills}</b></span><span>HEARTS LOST<b>${heartLoss}</b></span><span>BOSSES<b>${bosses.length}</b></span></div>${runRecord?.contractComplete?`<div class="defense-contract-seal"><span>◇</span><div><small>TRAIL CONTRACT SEALED</small><b>${escapeHTML(defenseSnapshot.contract?.title||"DAILY TRAIL CONTRACT")}</b></div></div>`:""}<details class="defense-result-details"><summary>RUN DETAILS</summary><div class="defense-counter-recap"><span>LEAKS <b>${leaks}</b></span><span>RIZOS TRAINED <b>${rewards.trained}</b></span><span>ARMOR BROKEN <b>${Number(counters.armorBreaks)||0}</b></span><span>ARMOR SHRED <b>${Number(counters.armorShreds)||0}</b></span><span>REVEALS <b>${Number(counters.reveals)||0}</b></span><span>PHASE LOCKS <b>${Number(counters.phaseLocks)||0}</b></span><span>BOSS BREAKS <b>${Number(counters.bossInterrupts)||0}</b></span><span>DAMAGE <b>${Math.round(topTower?.damage||runRecord?.mvpDamage||0)}</b></span></div></details><div class="modal-buttons"><button class="primary" data-close-modal>BACK TO ARCADE</button><button data-replay-game="defense">RUN IT BACK</button></div></div>`);
      advanceTutorial("play");if(wave>=10)celebrate();return;
    }
    state.scores[completedMode]=Math.max(state.scores[completedMode]||0,score);
    let foundTreasure=null;
    mutate((pet,whole)=>{
      whole.meta.totalGames+=1;
      pet.careProfile.games[completedMode]=(pet.careProfile.games[completedMode]||0)+1;
      earnHeat(10,false);
      progressQuest("play");
      if(completedMode==="power"){
        const gained=gainSkill("power",Math.max(.5,score*.18),{silent:true}); pet.strength=clamp(pet.strength+gained); pet.xp+=score*1.22; pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode)); pet.hunger=clamp(pet.hunger-6); whole.wallet.embers+=Math.max(5,score); shiftAlignment(-.5,"power-training"); progressQuest("train");
      }
      if(completedMode==="spark"){
        gainSkill("instinct",Math.max(.5,score*.16),{silent:true}); pet.bond=clamp(pet.bond+score*.5); pet.mood=clamp(pet.mood+score*.75); pet.xp+=score*.8; pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode)); whole.wallet.embers+=Math.max(4,score); shiftAlignment(1,"spark-play");
      }
      if(completedMode==="forage"){
        gainSkill("instinct",Math.max(.35,score*.09),{silent:true}); gainSkill("luck",Math.max(.2,score*.05),{silent:true}); pet.hunger=clamp(pet.hunger+score*1.1); pet.mood=clamp(pet.mood+score*.45); pet.xp+=score*.72; pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode)); whole.wallet.embers+=Math.max(4,score*2);
      }
      if(completedMode==="rush"){
        gainSkill("speed",Math.max(.6,score*.11),{silent:true}); pet.hype+=score; pet.mood=clamp(pet.mood+Math.min(25,score*.28)); pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode)); pet.xp+=score*.62; whole.wallet.embers+=Math.max(8,Math.floor(score*1.25)); state.meta.retroSignal=(state.meta.retroSignal||0)+Math.max(1,Math.floor(score/5)); earnHeat(Math.max(8,Math.floor(score/2)),false);
      }
      if(completedMode==="walk"){
        gainSkill("stamina",Math.max(.5,score*.13),{silent:true}); gainSkill("luck",Math.max(.15,score*.04),{silent:true}); pet.bond=clamp(pet.bond+Math.min(22,score*.7)); pet.mood=clamp(pet.mood+Math.min(24,score*.8)); pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode)); pet.hunger=clamp(pet.hunger-4); pet.xp+=score*.75; whole.wallet.embers+=Math.max(5,score*2); whole.meta.totalWalks=(whole.meta.totalWalks||0)+1; shiftAlignment(1,"walk");
        progressQuest("walk");
        if(treasureRolls>0||score>=12) foundTreasure=unlockWalkTreasure(treasureRolls>1);
      }
      if(completedMode==="rhythm"){
        // Four-lane charts contain far more notes than the old single-lane
        // version. Permanent rewards use bounded accuracy/combo quality so an
        // Expert song cannot inflate the economy simply by containing more notes.
        gainSkill("speed",Math.max(.5,rhythmQuality*.1),{silent:true}); pet.bond=clamp(pet.bond+Math.min(18,rhythmQuality*.32)); pet.mood=clamp(pet.mood+Math.min(24,rhythmQuality*.45)); pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode)); pet.xp+=rhythmQuality*.72; whole.wallet.embers+=Math.max(6,Math.floor(rhythmQuality*1.35)); state.meta.retroSignal=(state.meta.retroSignal||0)+Math.max(1,Math.floor(rhythmQuality/8)); shiftAlignment(1,"rhythm-play");
      }
      if(completedMode==="memory"){
        gainSkill("instinct",Math.max(.5,score*.09),{silent:true}); gainSkill("luck",Math.max(.2,score*.035),{silent:true}); pet.bond=clamp(pet.bond+Math.min(20,score*.36)); pet.mood=clamp(pet.mood+Math.min(18,score*.3)); pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode)); pet.xp+=score*.78; whole.wallet.embers+=Math.max(7,Math.floor(score*1.5)); shiftAlignment(2,"memory-play");
      }
      if(completedMode==="glide"){
        gainSkill("stamina",Math.max(.5,score*.08),{silent:true}); gainSkill("speed",Math.max(.35,score*.055),{silent:true}); pet.hype+=Math.min(18,score*.18);pet.mood=clamp(pet.mood+Math.min(20,score*.28));pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode));pet.xp+=score*.7;whole.wallet.embers+=Math.max(7,Math.floor(score*1.25));state.meta.retroSignal=(state.meta.retroSignal||0)+Math.max(1,Math.floor(score/10));shiftAlignment(1,"skybound-play");
      }
      if(completedMode==="breaker"){
        gainSkill("power",Math.max(.5,score*.065),{silent:true}); gainSkill("instinct",Math.max(.3,score*.04),{silent:true});pet.strength=clamp(pet.strength+Math.min(3,score*.02));pet.mood=clamp(pet.mood+Math.min(18,score*.2));pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode));pet.hunger=clamp(pet.hunger-4);pet.xp+=score*.66;whole.wallet.embers+=Math.max(8,Math.floor(score*1.18));shiftAlignment(-.25,"breaker-training");progressQuest("train");
      }
      if(completedMode==="maze"){
        gainSkill("instinct",Math.max(.55,score*.055),{silent:true});gainSkill("speed",Math.max(.4,score*.04),{silent:true});pet.bond=clamp(pet.bond+Math.min(18,score*.16));pet.mood=clamp(pet.mood+Math.min(22,score*.2));pet.energy=clamp(pet.energy-miniEnergyNeeded(completedMode));pet.xp+=score*.58;whole.wallet.embers+=Math.max(8,Math.floor(score*.9));state.meta.retroSignal=(state.meta.retroSignal||0)+Math.max(1,Math.floor(score/16));shiftAlignment(-.5,"runaway-play");
      }
    });
    if (score >= 8) {
      const memory = lifeMemory();
      memory.arcadeAfterglowUntil = now() + 16000;
      memory.lastArcadeMode = completedMode;
      saveState();
    }
    evaluateForm(true);
    const rareDiscovery = maybeUnlockSpecialRizo(completedMode, score, mini.walkPath);
    const trainedSkill = ({power:"power",spark:"instinct",forage:"instinct",rush:"speed",walk:"stamina",rhythm:"speed",memory:"instinct",glide:"stamina",breaker:"power",maze:"instinct",defense:"power"})[completedMode];
    const voice=arcadeResultVoice(completedMode,endReason,score);
    const art=voice.art||arcadeArt(completedMode);
    const trackTitle=completedMode==="rhythm"?(rhythmSnapshot?.track?.title||"EMBER BEAT"):null;
    const line=voice.line;
    const treasureCopy=foundTreasure?`<div class="event-reward">${foundTreasure.icon} FOUND: ${foundTreasure.name}</div>`:"";
    const rareCopy=rareDiscovery?`<div class="rare-discovery-stage ${rareDiscovery.id}">${petMarkup({extraClass:"rare-reaction-pet",id:"rareReactionPet"})}<div class="rare-found-pet"><img src="${rareDiscovery.sprite}" alt="${rareDiscovery.name}"></div><b>${rareDiscovery.name} DISCOVERED</b></div>`:"";
    if(rareDiscovery){activeMusicOverride=rareDiscovery.id==="shadow"?"shadow":rareDiscovery.id==="retro"?"retro":"forest";startMusicForScene(activeMusicOverride,true);duckMusic(1400,.08);}
    const skill=SKILLS.find(item=>item.id===trainedSkill);
    const rhythmBreakdown=rhythmSnapshot?`<div class="arcade-result-grid stat-4"><span>ACCURACY<b>${rhythmSnapshot.accuracy}%</b></span><span>MAX COMBO<b>${rhythmSnapshot.maxStreak}</b></span><span>PERFECT<b>${rhythmSnapshot.judgements.perfect||0}</b></span><span>MISSES<b>${rhythmSnapshot.judgements.miss||0}</b></span></div>`:"";
    const arcadeBreakdown=rhythmSnapshot?"":arcadeResultGrid(completedMode,arcadeSnapshot);
    // A personal record deserves more than a bare div.
    const newBest=score>previousBest?`<div class="arcade-best-banner"><i aria-hidden="true">★</i><div><small>NEW PERSONAL BEST</small><b>${formatNumber(score)}</b><em>PREVIOUS ${formatNumber(previousBest)}</em></div></div>`:"";
    if(score>previousBest&&qualifiedRun){sfx("jackpot");sensoryBurst("NEW BEST","#ffd45a",16);}
    showModal(`<div class="modal-card arcade-result arcade-end-${endReason} minigame-result-${completedMode} ${rareDiscovery?"rare-result":""}"><div class="modal-art">${art}</div><small class="arcade-result-mode">${escapeHTML(arcadeName(completedMode))} • ${escapeHTML(ARCADE_END_REASONS[endReason].label)}</small>${trackTitle?`<div class="result-track-title">${trackTitle} • ${rhythmSnapshot?.track?.difficulty||"NORMAL"}</div>`:""}${newBest}<h2>${score} POINTS</h2><p class="big-line">${line}</p>${rhythmBreakdown}${arcadeBreakdown}${treasureCopy}${rareCopy}<p>${skill?.name || "Growth"} rose permanently. The arcade is training your actual Rizo, not just filling a leaderboard.</p><div class="modal-buttons"><button class="primary" data-close-modal>BACK TO RIZO</button><button data-replay-game="${completedMode}">RUN IT BACK</button></div></div>`);
    advanceTutorial("play");
    if(score>20 && (endReason!=="death" || score>previousBest)) celebrate();
  }


  function keeperRank() {
    const level = state.season?.level || 1;
    if (level >= 50) return "FOREST ICON";
    if (level >= 30) return "DIAMOND KEEPER";
    if (level >= 20) return "LEGEND KEEPER";
    if (level >= 10) return "FIRE KEEPER";
    if (level >= 5) return "REAL KEEPER";
    return "ROOKIE KEEPER";
  }

  function earnHeat(amount = 1, announce = true) {
    state.season ||= {xp:0,level:1};
    const old = state.season.level || 1;
    state.season.xp = Math.max(0,(state.season.xp||0)+amount);
    const level = Math.floor(state.season.xp / 100) + 1;
    if (level > old) {
      for (let lv = old + 1; lv <= level; lv++) {
        const reward = 20 + lv * 5;
        state.wallet.embers += reward;
        if (lv % 5 === 0) state.wallet.shards += 25;
        addMemory("HEAT LEVEL UP", `Reached Heat Level ${lv}. The forest paid R ${reward}${lv%5===0?" and 25 Prism Shards":""}.`, "🔥");
      }
      state.season.level = level;
      toast(`HEAT LEVEL ${level} • REWARDS DELIVERED`);
      sfx("level"); celebrate(); sensoryBurst("🔥","#ffd54a",24);
    } else state.season.level = level;
    if (announce && amount >= 10) toast(`+${amount} HEAT`);
  }

  function renderSeason() {
    if (!el.seasonLevel) return;
    const level = state.season?.level || 1;
    const within = (state.season?.xp || 0) % 100;
    el.seasonLevel.textContent = `HEAT LEVEL ${String(level).padStart(2,"0")}`;
    el.seasonBar.style.width = `${within}%`;
    el.seasonText.textContent = `${within} / 100 HEAT`;
    el.seasonReward.textContent = level % 5 === 4 ? `NEXT: R ${20+(level+1)*5} + 25◇` : `NEXT: R ${20+(level+1)*5}`;
    el.keeperRank.textContent = keeperRank();
  }

  function unlockRandomLore(chance = 1) {
    if (Math.random() > chance) return null;
    const locked = LORE_FRAGMENTS.filter(item => !state.loreUnlocked.includes(item.id));
    if (!locked.length) return null;
    const item = locked[Math.floor(Math.random()*locked.length)];
    state.loreUnlocked.push(item.id);
    addMemory("LORE SIGNAL", `Unlocked: ${item.title}.`, "▤");
    toast(`LORE FOUND: ${item.title}`);
    return item;
  }

  // ===== COLLECTION, PITY, AND EXPEDITIONS =====
  function rarityTier(rarity = "COMMON") {
    if (rarity.includes("SECRET")) return "SECRET";
    if (rarity.includes("LEGENDARY")) return "LEGENDARY";
    if (rarity.includes("MYTHIC")) return "MYTHIC";
    if (rarity.includes("EPIC")) return "EPIC";
    if (rarity.includes("RARE")) return "RARE";
    if (rarity.includes("UNCOMMON")) return "UNCOMMON";
    return "COMMON";
  }

  function openCapsule(type = "standard", free = false) {
    if (!houseIsUnlocked()) { toast(`RIZO HOUSE UNLOCKS AT LEVEL ${HOUSE_UNLOCK_LEVEL}`); sfx("no"); return; }
    const cost = type === "prism" ? 6000 : HOUSE_ADOPTION_COST;
    if (!free && !houseHasSpace()) { toast("EVERY UNLOCKED ROOM IS FULL • BUY ANOTHER ROOM"); sfx("no"); if (currentView === "farm") renderFarm(); return; }
    if (!free && state.wallet.embers < cost) { toast(`NEED R ${cost} FOR A NEW RIZO`); sfx("no"); return; }
    if (!free) state.wallet.embers -= cost;
    const rolled = rollVariant(type === "prism", false, state.meta.pity || 0);
    const previous = state.collection[rolled.id] || 0;
    state.collection[rolled.id] = previous + 1;
    state.meta.capsules = (state.meta.capsules || 0) + 1;
    const tier = rarityTier(rolled.rarity);
    const jackpot = ["MYTHIC","LEGENDARY","SECRET"].includes(tier);
    state.meta.pity = jackpot ? 0 : (state.meta.pity || 0) + 1;
    const shards = previous ? ({COMMON:4,UNCOMMON:7,RARE:12,EPIC:18,MYTHIC:30,LEGENDARY:55,SECRET:100}[tier] || 5) : 0;
    state.wallet.shards += shards;
    earnHeat(({COMMON:8,UNCOMMON:10,RARE:16,EPIC:24,MYTHIC:38,LEGENDARY:70,SECRET:140}[tier] || 8), false);
    const lore = unlockRandomLore(tier === "SECRET" ? 1 : tier === "LEGENDARY" ? .8 : .24);
    const houseOutcome = sendCapsulePetToFarm(rolled, tier, { allowOverflow: free });
    const houseLine = houseOutcome.overflow
      ? ` Every unlocked room was full, so the free signal left ${houseOutcome.shardValue} Prism Shards instead.`
      : ` ${houseOutcome.pet.name} moved into ${HOUSE_ROOMS[houseOutcome.pet.homeRoom].name}.`;
    checkAchievements(); saveState(true); renderAll();
    const duplicateLine = previous ? `KNOWN COLOR • +${shards} PRISM SHARDS` : "NEW COLOR DISCOVERED";
    activeMusicOverride = rolled.id === "retro" ? "retro" : rolled.id === "shadow" ? "shadow" : "capsule";
    startMusicForScene(activeMusicOverride,true);
    showModal(`<div class="modal-card capsule-premium ${tier === "SECRET" ? "secret-reveal" : ""}"><div class="capsule-stage" style="--reveal-color:${rolled.color}">${petMarkup({extraClass:"capsule-reaction-pet",id:"capsuleReactionPet"})}<div class="rarity-reveal"><img src="${rolled.sprite}" alt="${rolled.name}"></div><i>✦</i></div><small style="color:${rolled.color};letter-spacing:.16em">${rolled.rarity} HOUSE SIGNAL</small><h2>${rolled.name}</h2><p class="big-line">${duplicateLine}</p><p>${lore ? `A lore fragment came with it: ${lore.title}.` : "The capsule dissolved into blue sparks."}${houseLine}</p><div class="modal-buttons"><button class="primary" data-close-modal>WELCOME HOME</button>${houseHasSpace() ? `<button data-capsule="${type}">ADOPT ANOTHER • R ${cost}</button>` : ""}</div></div>`);
    duckMusic(tier === "SECRET" ? 1500 : 950,tier === "SECRET"?.07:.12);
    sfx(tier === "SECRET" ? "secret" : tier === "LEGENDARY" ? "legendary" : tier === "MYTHIC" ? "mythic" : "capsule");
    sensoryBurst("✦",rolled.color,tier === "SECRET"?42:tier === "LEGENDARY"?30:18);
    if (["MYTHIC","LEGENDARY","SECRET"].includes(tier)) celebrate();
  }

  function startExpedition(type) {
    const data = EXPEDITIONS[type];
    if (!data || state.expedition.active) return;
    if (!canCare()) return;
    if (state.pet.energy < data.energy) { say("I NEED MORE ENERGY BEFORE I GO OUT."); sfx("no"); return; }
    state.pet.energy = clamp(state.pet.energy - data.energy);
    const embers = Math.floor(data.min + Math.random()*(data.max-data.min+1));
    const capsule = Math.random() < data.capsuleChance;
    const lore = Math.random() < data.loreChance;
    state.expedition = {active:true,ready:false,type,endAt:now()+data.minutes*60000,result:{embers,heat:data.heat,capsule,lore}};
    addMemory("EXPEDITION STARTED", `${state.pet.name} left for the ${data.name}.`, "🌲");
    saveState(true); renderAll(); say("I'LL BE BACK. PROBABLY."); sfx("depart");
  }

  function processExpedition() {
    if (state.expedition?.active && !state.expedition.ready && now() >= state.expedition.endAt) state.expedition.ready = true;
  }

  function renderExpedition() {
    if (!el.expeditionStatus) return;
    processExpedition();
    const ex = state.expedition;
    $$('[data-expedition]').forEach(button => button.disabled = Boolean(ex.active));
    if (!ex.active) { el.expeditionStatus.textContent = "SEND RIZO OUT FOR LOOT AND LORE."; el.expeditionClaim.hidden = true; return; }
    const data = EXPEDITIONS[ex.type];
    if (ex.ready) { el.expeditionStatus.textContent = `${data.name} COMPLETE. SOMETHING IS GLOWING.`; el.expeditionClaim.hidden = false; }
    else { const sec=Math.max(0,Math.ceil((ex.endAt-now())/1000)); const m=Math.floor(sec/60),s=sec%60; el.expeditionStatus.textContent=`${data.name} • ${m}:${String(s).padStart(2,"0")} REMAINING`; el.expeditionClaim.hidden=true; }
  }

  function claimExpedition() {
    processExpedition();
    const ex=state.expedition;if(!ex?.active||!ex.ready)return;
    const result=ex.result||{}; const data=EXPEDITIONS[ex.type];
    state.wallet.embers += result.embers || 0;
    earnHeat(result.heat || 0,false);
    let extra="";
    if(result.lore){const l=unlockRandomLore(1);if(l)extra+=` Lore: ${l.title}.`;}
    state.expedition={active:false,ready:false,type:null,endAt:0,result:null};
    if(result.capsule){state.wallet.embers+=125;extra+=" A free capsule token converted to R 125.";}
    let forestVariant=null;
    if(ex.type==="deep" && !state.collection.shadow && Math.random()<.09) forestVariant=unlockVariantDiscovery("shadow","THE DEEP WOODS");
    else if(!state.collection.moss && Math.random()<.18) forestVariant=unlockVariantDiscovery("moss","A FOREST EXPEDITION");
    if(forestVariant) extra+=` ${forestVariant.name} was discovered.`;
    state.pet.bond=clamp(state.pet.bond+4);state.pet.mood=clamp(state.pet.mood+8);
    addMemory("EXPEDITION RETURN", `${state.pet.name} returned from ${data.name} with R ${result.embers}.${extra}`, "🌲");
    saveState(true);renderAll();
    showModal(`<div class="modal-card"><div class="modal-art">🌲</div><h2>RIZO CAME BACK.</h2><p class="big-line">${data.name} LOOT SECURED.</p><p>R ${result.embers} • +${result.heat} Heat${extra}</p><div class="modal-buttons"><button class="primary" data-close-modal>TAKE THE LOOT</button></div></div>`);
    sfx("reward");celebrate();sensoryBurst("✦","#9eff75",24);
  }

  function animatePet(className, duration=600) {
    el.petActor.classList.remove(className); void el.petActor.offsetWidth; el.petActor.classList.add(className); setTimeout(()=>el.petActor.classList.remove(className),duration);
  }

  function sensoryBurst(symbol="✦", color="#16c8ff", count=10, event=null) {
    const rect=el.petActor.getBoundingClientRect();
    const x=event?.clientX || rect.left+rect.width/2, y=event?.clientY || rect.top+rect.height/2;
    if(el.sensoryFlash){el.sensoryFlash.style.setProperty("--x",`${x}px`);el.sensoryFlash.style.setProperty("--y",`${y}px`);el.sensoryFlash.classList.remove("pop");void el.sensoryFlash.offsetWidth;el.sensoryFlash.classList.add("pop");}
    for(let i=0;i<count;i++){const p=document.createElement("i");p.className="particle-pop";p.textContent=symbol;p.style.left=`${x}px`;p.style.top=`${y}px`;p.style.color=color;p.style.setProperty("--dx",`${Math.random()*150-75}px`);p.style.setProperty("--dy",`${-25-Math.random()*115}px`);p.style.setProperty("--rot",`${Math.random()*360-180}deg`);document.body.appendChild(p);setTimeout(()=>p.remove(),800);}
  }

  function enterRecoveryState(reason = "overwhelmed", silent = false) {
    const pet = state.pet;
    if (pet.resting || pet.stage === "egg") return;
    pet.resting = true;
    pet.sleeping = false;
    pet.health = 1;
    pet.energy = Math.max(5, pet.energy);
    state.meta.recoveries = (state.meta.recoveries || 0) + 1;
    addMemory("TOO MUCH", `${pet.name} became overwhelmed and hid under the blanket. Nothing permanent was lost.`, "☁");
    saveState(true);
    if (!silent || document.visibilityState === "visible") showRecoveryModal();
  }

  function showRecoveryModal() {
    const pet = state.pet;
    showModal(`<div class="modal-card recovery-card"><div class="modal-art">☁</div><h2>${escapeHTML(pet.name)} HID.</h2><p class="big-line">THE GARDEN IS A COMFORT GAME. YOU DID NOT LOSE YOUR PET.</p><p>Health reached zero, so Rizo went somewhere quiet. Comfort them to return with basic needs restored.</p><div class="modal-buttons"><button class="primary" data-comfort-pet>COMFORT RIZO</button></div></div>`);
  }

  function comfortPet() {
    const pet = state.pet;
    if (!pet.resting) return;
    pet.resting = false;
    pet.health = 45;
    pet.hunger = Math.max(40, pet.hunger);
    pet.mood = Math.max(45, pet.mood);
    pet.energy = Math.max(40, pet.energy);
    pet.hygiene = Math.max(40, pet.hygiene);
    pet.sick = false;
    pet.lastTick = now();
    shiftAlignment(5, "recovery");
    addMemory("CAME BACK", `${pet.name} returned after a quiet reset.`, "♥");
    saveState(true); closeModal(); renderAll(); say("OKAY. I NEEDED THAT.", 3200); effect("hearts");
  }

  function enterElderState(silent = false) {
    const pet = state.pet;
    if (pet.elder || pet.stage === "egg") return;
    pet.elder = true;
    pet.health = Math.max(35, pet.health);
    pet.lifespanDays += 9999;
    addMemory("ELDER FLAME", `${pet.name} reached the end of one life cycle and can now create a Legacy Egg.`, "↻");
    saveState(true);
    if (!silent || document.visibilityState === "visible") showRebirthInfo();
  }

  function canRebirth() {
    const pet = state.pet;
    return pet.stage === "legend" && pet.bond >= 80 && skillTotal(pet) >= 300 && pet.alive && !pet.resting;
  }

  function showRebirthInfo() {
    const pet = state.pet;
    const ready = canRebirth();
    const stageOk = pet.stage === "legend";
    const bondNeed = Math.max(0, 80 - pet.bond);
    const statNeed = Math.max(0, 300 - skillTotal(pet));
    const seed = state.garden.bondSeed;
    const inheritance = seed
      ? `<div class="bond-seed-mini"><b>♡ BOND EGG READY</b><span>${escapeHTML(pet.name)} + ${escapeHTML(seed.name)}</span><small>Both lineages will blend their genetic caps. One parent does not overwrite the other.</small></div>`
      : `<div class="sheet-note">Optional: invite another Keeper's mature Rizo and save a Friendship Spark in House. A normal Legacy Egg still works without one.</div>`;
    showModal(`<div class="modal-card legacy-modal"><div class="modal-art">↻</div><h2>${seed ? "BOND LEGACY EGG" : "LEGACY EGG"}</h2><p class="big-line">REBIRTH IS THE LONG GAME.</p><p>${ready ? `${escapeHTML(pet.name)} becomes an ancestor. The new egg inherits higher, randomized caps${seed ? ` blended with ${escapeHTML(seed.name)}` : " from this lineage"}. Collection, rooms, cosmetics and currency remain.` : `Requirements: ${stageOk ? "✓ Mature" : "Reach Mature"} • ${bondNeed <= 0 ? "✓ 80 Bond" : `${Math.ceil(bondNeed)} more Bond`} • ${statNeed <= 0 ? "✓ 300 Training" : `${Math.ceil(statNeed)} more Training`}.`}</p><div class="gene-preview">${SKILLS.map(skill=>`<span>${skill.icon} ${skill.name}<b>${Math.floor(pet.skills?.[skill.id]||0)}/${Math.floor(pet.genes?.[skill.id]||100)}</b></span>`).join("")}</div>${inheritance}<div class="modal-buttons">${ready ? `<button class="primary" data-confirm-rebirth>${seed ? "CREATE BOND EGG" : "CREATE LEGACY EGG"}</button>` : ""}<button data-close-modal>NOT YET</button></div></div>`);
  }

  function combinedDominantSkill(parent, partner) {
    if (!partner) return dominantSkill(parent);
    return [...SKILLS].sort((a,b)=>{
      const bScore=(Number(parent.skills?.[b.id])||0)+(Number(partner.skills?.[b.id])||0)*.7;
      const aScore=(Number(parent.skills?.[a.id])||0)+(Number(partner.skills?.[a.id])||0)*.7;
      return bScore-aScore;
    })[0]?.id || "balanced";
  }

  function chooseInheritedMutation(parent, partner) {
    const rare = [parent?.mutation, partner?.mutation].filter(id=>id && id!=="normal" && MUTATIONS.some(item=>item.id===id));
    if (rare.length && Math.random() < .32) return rare[Math.floor(Math.random()*rare.length)];
    if (partner && Math.random() < .045) return rollMutation().id;
    return Math.random() < .1 ? rollMutation().id : "normal";
  }

  function completeRebirth() {
    if (!canRebirth()) { showRebirthInfo(); return; }
    const old = state.pet;
    const seed = state.garden.bondSeed;
    const form = displayFormInfo(old);
    state.legacy.unshift({ id: old.id, name: old.name, variant: old.variant, form: old.form, formName: form.name, generation: old.generation || 1, skills: {...old.skills}, genes: {...old.genes}, personality: old.personality, partner: seed ? {keeper:seed.keeper,name:seed.name,variant:seed.variant,generation:seed.generation} : null, at: now() });
    state.legacy = state.legacy.slice(0,40);

    const next = createPet({ lucky: Math.max(old.generation || 1, seed?.generation || 1) >= 2 });
    next.generation = Math.max(old.generation || 1, seed?.generation || 1) + 1;
    next.genes = createGenes(old, seed || null);
    next.lineageTrait = combinedDominantSkill(old, seed || null);
    next.personality = seed && Math.random() < .34
      ? seed.personality
      : Math.random() < .55 ? old.personality : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    next.mutation = chooseInheritedMutation(old, seed || null);

    const resonance = state.garden.nextEggVariant && state.collection[state.garden.nextEggVariant] ? state.garden.nextEggVariant : null;
    const partnerVariant = seed && state.collection[seed.variant] ? seed.variant : null;
    if (resonance) next.hiddenVariant = resonance;
    else if (partnerVariant && Math.random() < .36) next.hiddenVariant = partnerVariant;
    else next.hiddenVariant = Math.random() < .62 ? (old.variant || old.hiddenVariant) : rollVariant(true,false,state.meta.pity||0).id;

    next.room = old.room;
    next.accessory = old.accessory;
    next.alignment = clamp((old.alignment || 0) * .16 + (seed?.alignment || 0) * .08, -22, 22);
    next.careProfile.inheritedFrom = seed ? [old.name, seed.name] : [old.name];

    state.pet = next;
    state.meta.rebirths = (state.meta.rebirths || 0) + 1;
    if (seed) state.meta.bondEggs = (state.meta.bondEggs || 0) + 1;
    state.meta.nextPetNumber += 1;
    state.wallet.shards += seed ? 50 : 35;
    if (resonance) state.garden.nextEggVariant = null;
    state.garden.bondSeed = null;
    unlockRandomLore(1);
    if (seed && !state.loreUnlocked.includes("bond-eggs")) state.loreUnlocked.push("bond-eggs");
    const sourceCopy = seed ? `two gardens: ${old.name} and ${seed.name}` : old.name;
    addMemory(seed ? "BOND EGG" : "LEGACY EGG", `Generation ${next.generation} formed from ${sourceCopy}. It inherited ${next.lineageTrait.toUpperCase()} potential${resonance ? ` and resonated with ${VARIANTS.find(item=>item.id===resonance)?.name || resonance}` : ""}.`, seed ? "♡" : "↻");
    saveState(true); closeModal(); changeView("home"); renderAll(); celebrate(); sfx("secret"); say(seed ? "I REMEMBER TWO GARDENS." : "I REMEMBER SOMETHING I HAVEN'T DONE YET.", 4200);
  }

  function killPet(reason, silent = false) {
    // Compatibility wrapper for older calls/saves. New Rizos recover or become elders instead of being permanently lost.
    if (reason === "old age") enterElderState(silent);
    else enterRecoveryState(reason, silent);
  }

  function showDeathModal() { showRecoveryModal(); }

  function revivePet() { comfortPet(); }

  function buyNewEgg(type) {
    const costs = { standard: 75, lucky: 250, prism: 500, shame: 0 };
    const cost = costs[type];
    if (state.wallet.embers < cost) { toast("YOU CANNOT FINANCE AN EGG"); return; }
    state.wallet.embers -= cost;
    state.pet = createPet({ lucky: type === "lucky" || type === "prism", shame: type === "shame" });
    if (type === "prism") state.pet.hiddenVariant = rollVariant(true,false,Math.max(30,state.meta.pity||0)).id;
    state.meta.nextPetNumber += 1;
    addMemory("A NEW EGG", type === "shame" ? "You accepted the free Shame Egg. The game remembers." : `You brought home a ${type === "prism" ? "Prism" : type === "lucky" ? "Lucky" : "Mystery"} Egg.`, "🥚");
    saveState(true);
    closeModal();
    changeView("home");
    renderAll();
    say(type === "shame" ? "THE GAME WILL REMEMBER THIS." : "A NEW PROBLEM HAS ARRIVED.", 3200);
  }

  function addMemory(title, text, icon = "✦") {
    state.memories.unshift({ title, text, icon, at: now() });
    state.memories = state.memories.slice(0, 60);
  }

  function checkAchievements() {
    let changed = false;
    for (const achievement of ACHIEVEMENTS) {
      if (!state.achievements.includes(achievement.id) && achievement.test(state)) {
        state.achievements.push(achievement.id);
        state.wallet.embers += achievement.reward;
        addMemory("BADGE UNLOCKED", `${achievement.name}: ${achievement.description}`, achievement.icon);
        toast(`BADGE: ${achievement.name} • +R ${achievement.reward}`);
        sfx("level");
        celebrate();
        changed = true;
      }
    }
    if (changed) saveState();
  }

  function advanceTutorial(action) {
    if (state.player.tutorialDismissed) return;
    const step = state.player.tutorialStep;
    if (step === 2 && action === "feed") state.player.tutorialStep = 3;
    if (step === 3 && action === "play") state.player.tutorialStep = 4;
    saveState();
    renderTutorial();
  }

  function say(text, duration = 2600) {
    clearTimeout(speechTimer);
    el.thoughtBubble.textContent = text;
    el.thoughtBubble.classList.add("show");
    speechTimer = setTimeout(() => el.thoughtBubble.classList.remove("show"), duration);
  }

  function effect(type) {
    if (state.pet.stage === "egg") return;
    el.statusFx.className = `status-fx ${type}`;
    setTimeout(() => { if (!state.pet.sleeping) el.statusFx.className = "status-fx"; }, 1600);
  }

  function toast(text) {
    while (el.toastStack.children.length >= 1) el.toastStack.firstElementChild?.remove();
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = text;
    el.toastStack.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  function floatText(event, text) {
    const node = document.createElement("span");
    node.className = "float-text";
    node.textContent = text;
    const rect = el.petTapTarget.getBoundingClientRect();
    node.style.left = `${event.clientX || rect.left + rect.width / 2}px`;
    node.style.top = `${event.clientY || rect.top + rect.height / 2}px`;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 850);
  }

  function celebrate() {
    el.habitatScene?.classList.add("camera-reward"); setTimeout(()=>el.habitatScene?.classList.remove("camera-reward"),800);
    const colors = VARIANTS.map(item => item.color);
    for (let index = 0; index < 30; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.top = "-18px";
      piece.style.background = colors[index % colors.length];
      piece.style.setProperty("--dx", `${Math.random() * 180 - 90}px`);
      piece.style.animationDelay = `${Math.random() * .35}s`;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 2300);
    }
  }

  let audioContext;
  function ensureAudio() { try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if(audioContext.state === "suspended") audioContext.resume(); return audioContext; } catch(error){ return null; } }
  function soundVolume(){ return state?.settings?.sound ? clamp(Number(state.settings.soundVolume ?? .85),0,1) : 0; }
  function musicVolume(){ return state?.settings?.music ? clamp(Number(state.settings.musicVolume ?? .85),0,1) : 0; }
  function currentMusicGain(){ return Math.max(.001, MUSIC_MASTER_GAIN * musicVolume()); }
  function currentRhythmGain(){ return Math.max(.001, .76 * musicVolume()); }
  function tone(freq=420,duration=.05,type="square",volume=.035,delay=0,slide=0){
    const level=soundVolume(); if(level<=0)return; const ctx=ensureAudio();if(!ctx)return;
    const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,ctx.currentTime+delay);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(35,freq+slide),ctx.currentTime+delay+duration);g.gain.setValueAtTime(Math.min(.16,volume*SFX_MASTER_GAIN*level),ctx.currentTime+delay);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+duration);o.connect(g).connect(ctx.destination);o.start(ctx.currentTime+delay);o.stop(ctx.currentTime+delay+duration+.01);
  }
  function noise(duration=.08,volume=.025,delay=0){const level=soundVolume();if(level<=0)return;const ctx=ensureAudio();if(!ctx)return;const len=Math.max(1,Math.floor(ctx.sampleRate*duration)),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;g.gain.setValueAtTime(Math.min(.16,volume*SFX_MASTER_GAIN*level),ctx.currentTime+delay);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+duration);src.connect(g).connect(ctx.destination);src.start(ctx.currentTime+delay);}
  function beep(frequency=420,duration=.05,type="square"){tone(frequency*(.97+Math.random()*.06),duration,type,.032);}
  function sfx(name,intensity=0){
    if(!state.settings.sound)return;
    if(["capsule","mythic","legendary","secret","hatch","level","reward"].includes(name)) duckMusic(name==="secret"?1500:950,name==="secret"?.07:.12);
    const v=.028;
    if(name==="tap"){const f=310+Math.min(360,intensity*7)+Math.random()*35;tone(f,.035,"square",v,0,45);}
    else if(name==="egg"){tone(220+Math.random()*50,.07,"sine",.035,0,90);tone(440,.04,"triangle",.018,.04);}
    else if(name==="no"){tone(240,.09,"square",.035,0,-70);tone(180,.12,"square",.03,.09,-45);}
    else if(name==="sick"){tone(250,.18,"sawtooth",.025,0,-150);noise(.14,.018,.03);tone(110,.22,"triangle",.025,.13,-40);}
    else if(name==="eat"){tone(520,.045,"square",.025);tone(640,.04,"triangle",.02,.055);noise(.035,.012,.02);}
    else if(name==="clean"){[0,1,2,3].forEach(i=>tone(620+i*110,.08,"sine",.02,i*.045,70));}
    else if(name==="sleep"){tone(360,.18,"sine",.025,0,-130);tone(220,.25,"sine",.018,.15,-80);}
    else if(name==="wake"){tone(310,.08,"triangle",.025);tone(510,.11,"triangle",.026,.07,120);}
    else if(name==="talk"){tone(330+Math.random()*70,.055,"square",.018);tone(410+Math.random()*100,.05,"square",.015,.06);}
    else if(name==="perfect"){[620,880,1180].forEach((f,i)=>tone(f,.09,"square",.03,i*.035,120));}
    else if(name==="spark"){tone(690+Math.random()*120,.045,"sine",.026,0,140);tone(980,.05,"triangle",.014,.035);}
    else if(name==="jump"){tone(280,.1,"square",.024,0,230);}
    else if(name==="dance"){[330,440,550,660].forEach((f,i)=>tone(f,.07,"square",.018,i*.065));}
    else if(name==="event"){tone(240,.2,"sine",.02,0,220);tone(620,.14,"triangle",.018,.16,-90);}
    else if(name==="hit"||name==="rush"){tone(410+Math.min(500,intensity*14),.035,"square",.028,0,80);}
    else if(name==="jackpot"){[520,660,820,1040].forEach((f,i)=>tone(f,.13,"square",.035,i*.055,100));noise(.12,.02,.08);}
    else if(name==="capsule"){tone(280,.13,"triangle",.025,0,350);tone(720,.16,"sine",.03,.11,180);}
    else if(name==="mythic"){[260,390,590,880].forEach((f,i)=>tone(f,.18,"triangle",.03,i*.08,120));}
    else if(name==="legendary"){[330,495,660,990].forEach((f,i)=>tone(f,.24,"sine",.035,i*.09,160));noise(.18,.018,.18);}
    else if(name==="secret"){[220,330,440,660,990,1320].forEach((f,i)=>tone(f,.32,"sine",.03,i*.07,220));noise(.28,.02,.2);}
    else if(name==="hatch"){[260,390,520,780].forEach((f,i)=>tone(f,.16,"triangle",.03,i*.06,100));}
    else if(name==="level"||name==="reward"){[440,554,659,880].forEach((f,i)=>tone(f,.12,"square",.026,i*.055,80));}
    else if(name==="depart"){tone(500,.12,"sine",.022,0,-180);tone(300,.2,"sine",.018,.1,-120);}
    else if(name==="ui"){tone(540,.026,"triangle",.016);tone(760,.02,"sine",.01,.022);}
    else if(name==="coin"){tone(880,.045,"square",.022,0,90);tone(1320,.07,"square",.018,.04);}
    // ===== DEFENSE FEEL FAMILIES =====
    // These are deliberately short and sparse. Signature attack tones still carry
    // character identity; these punctuate state changes and physical consequences.
    else if(name==="defense-deploy"){tone(196,.055,"triangle",.026,0,80);tone(294,.07,"sine",.018,.045,120);noise(.035,.009,.018);}
    else if(name==="defense-select"){tone(470,.026,"triangle",.012,0,42);}
    else if(name==="defense-upgrade"){tone(246,.09,"triangle",.026,0,160);tone(369,.12,"sine",.025,.07,210);tone(554,.16,"triangle",.022,.145,170);}
    else if(name==="defense-apex"){tone(164,.18,"sawtooth",.026,0,90);tone(328,.22,"triangle",.026,.1,260);tone(656,.28,"sine",.024,.21,360);noise(.18,.014,.11);}
    else if(name==="defense-pop"){tone(330+Math.min(130,intensity*24),.025,"triangle",.012,0,70);noise(.022,.006,0);}
    else if(name==="defense-pop-heavy"){tone(138,.052,"square",.02,0,-34);noise(.048,.014,.008);tone(92,.07,"triangle",.012,.025,-18);}
    else if(name==="defense-pop-split"){tone(292,.035,"sine",.014,0,90);tone(438,.045,"sine",.011,.024,120);}
    else if(name==="defense-wave-clear"){tone(392,.08,"triangle",.022);tone(523,.1,"triangle",.022,.055,70);tone(659,.13,"sine",.021,.12,90);}
    else if(name==="defense-gate-hit"){tone(116,.085,"square",.024,0,-48);noise(.075,.014,.015);}
    else if(name==="defense-sell"){tone(440,.055,"triangle",.018,0,-120);tone(294,.08,"sine",.016,.045,-80);}
    // ===== ARCADE SIGNATURES =====
    // Eleven games used to share two failure sounds. Each mode family now has a
    // recognisable win and loss so a dropped package cannot sound like a
    // corrupted broadcast.
    else if(name==="fail-air"){tone(520,.16,"sine",.03,0,-330);noise(.13,.016,.05);tone(180,.2,"triangle",.026,.12,-60);}
    else if(name==="fail-drop"){noise(.09,.026);tone(190,.16,"square",.032,.02,-70);tone(120,.14,"triangle",.022,.12,-40);}
    else if(name==="fail-chase"){tone(300,.1,"sawtooth",.03,0,-90);tone(226,.12,"sawtooth",.028,.09,-70);tone(168,.18,"sawtooth",.024,.19,-50);}
    else if(name==="fail-signal"){noise(.16,.024);tone(410,.09,"square",.026,0,-190);tone(300,.13,"square",.022,.1,240);}
    else if(name==="fail-forge"){tone(260,.07,"square",.034,0,-40);noise(.11,.02,.04);tone(140,.2,"triangle",.028,.08,-45);}
    else if(name==="fail-lunch"){tone(360,.08,"triangle",.028,0,-130);tone(240,.11,"sine",.022,.07,-90);}
    else if(name==="fail-spark"){noise(.1,.018);tone(600,.14,"sine",.026,0,-400);}
    else if(name==="fail-power"){tone(200,.1,"square",.034,0,-60);noise(.08,.022,.02);}
    else if(name==="win-air"){[660,880,1100].forEach((f,i)=>tone(f,.11,"sine",.026,i*.045,80));}
    else if(name==="win-forge"){tone(330,.06,"square",.03);[520,780].forEach((f,i)=>tone(f,.09,"triangle",.026,.05+i*.05,60));}
    else if(name==="win-chase"){[590,740,990].forEach((f,i)=>tone(f,.07,"square",.028,i*.04,120));}
    else if(name==="win-signal"){[440,660,880].forEach((f,i)=>tone(f,.1,"sine",.026,i*.05,60));noise(.05,.008,.14);}
    else if(name==="win-lunch"){tone(620,.055,"triangle",.026);tone(830,.07,"triangle",.024,.05);noise(.04,.01,.02);}
    else if(name==="win-drop"){[500,700,940,1180].forEach((f,i)=>tone(f,.08,"square",.026,i*.038,90));}
    else tone(420,.05,"square",.03);
  }

  // Per-mode audio identity without eleven bespoke sound banks: the family a
  // mode belongs to picks the signature, and anything unmapped keeps the old
  // generic tone rather than going silent.
  const ARCADE_SFX = Object.freeze({
    air:{win:"win-air", fail:"fail-air"},
    street:{win:"win-drop", fail:"fail-drop"},
    chase:{win:"win-chase", fail:"fail-chase"},
    signal:{win:"win-signal", fail:"fail-signal"},
    forge:{win:"win-forge", fail:"fail-forge"},
    forest:{win:"win-lunch", fail:"fail-lunch"},
    spark:{win:"reward", fail:"fail-spark"},
    training:{win:"perfect", fail:"fail-power"},
    stage:{win:"perfect", fail:"no"},
    defense:{win:"reward", fail:"no"}
  });
  function arcadeSfx(kind="fail", mode=mini?.mode, intensity=0){
    const family=ARCADE_GAMES[mode]?.family;
    sfx(ARCADE_SFX[family]?.[kind] || (kind==="win"?"reward":"no"), intensity);
  }

  function haptic(pattern = 15) {
    if (state.settings.haptics && navigator.vibrate) navigator.vibrate(pattern);
  }

  const DEFENSE_HAPTICS=Object.freeze({
    select:{pattern:6,wait:.09}, deploy:{pattern:[7,12,7],wait:.16}, upgrade:{pattern:[12,16,12],wait:.2}, apex:{pattern:[18,24,18,42,24],wait:.35},
    ability:{pattern:[9,16,9,22],wait:.18}, bossWarn:{pattern:[14,22,14,34],wait:.3}, bossBreak:{pattern:[10,14,10,20],wait:.2},
    bossDown:{pattern:[18,22,18,36,24],wait:.4}, gate:{pattern:[12,22,12],wait:.18}, clear:{pattern:[8,14,8],wait:.2}, perfect:{pattern:[10,16,10,24],wait:.22}, sell:{pattern:[7,10],wait:.12}
  });
  function defenseHaptic(kind="select"){
    const d=mini?.defense,profile=DEFENSE_HAPTICS[kind]||DEFENSE_HAPTICS.select;if(!d||!state.settings.haptics)return false;
    const real=defenseRealNow(d),last=Number(d.lastFeelHapticAtReal)||-99;if(real-last<profile.wait)return false;
    d.lastFeelHapticAtReal=real;haptic(profile.pattern);return true;
  }


  // ===== PROCEDURAL CHIPTUNE MUSIC =====
  // No audio files or licensing costs: each scene generates a tiny looping theme
  // with WebAudio after the first user gesture, which is required on iOS.
  const MUSIC_TRACKS = {
    origin:{tempo:560,lead:[64,null,67,null,71,null,67,null],bass:[40,null,null,null,43,null,null,null],wave:"sine"},
    home:{tempo:430,lead:[64,67,71,67,62,66,69,66],bass:[40,null,47,null,38,null,45,null],wave:"triangle"},
    sleep:{tempo:720,lead:[59,null,62,null,66,null,62,null],bass:[35,null,null,null,42,null,null,null],wave:"sine"},
    arcade:{tempo:250,lead:[64,67,71,76,71,67,69,73],bass:[40,null,40,null,45,null,47,null],wave:"square"},
    closet:{tempo:390,lead:[69,null,73,76,73,null,71,68],bass:[45,null,52,null,44,null,51,null],wave:"triangle"},
    journal:{tempo:610,lead:[60,null,64,null,67,null,71,null],bass:[36,null,null,null,43,null,null,null],wave:"sine"},
    event:{tempo:330,lead:[72,71,67,null,74,72,69,null],bass:[43,null,38,null,45,null,40,null],wave:"triangle"},
    forest:{tempo:480,lead:[67,null,69,72,null,69,65,null],bass:[43,null,null,50,null,null,45,null],wave:"triangle"},
    evolution:{tempo:190,lead:[52,59,64,71,76,79,83,88],bass:[28,null,35,null,40,null,47,null],wave:"sawtooth"},
    capsule:{tempo:245,lead:[60,64,67,72,76,79,84,88],bass:[36,null,43,null,40,null,47,null],wave:"triangle"},
    shadow:{tempo:520,lead:[55,null,58,54,null,61,57,null],bass:[31,null,null,38,null,null,30,null],wave:"sine"},
    retro:{tempo:145,lead:[64,67,71,76,79,76,71,67],bass:[40,40,47,47,45,45,52,52],wave:"square"},
    visitor:{tempo:300,lead:[67,71,74,79,76,74,71,69],bass:[43,null,50,null,45,null,52,null],wave:"triangle"},
    "mini-power":{tempo:205,lead:[52,55,59,64,59,55,62,59],bass:[28,null,35,null,31,null,38,null],wave:"square"},
    "mini-spark":{tempo:230,lead:[76,79,83,86,83,79,81,84],bass:[48,null,55,null,50,null,57,null],wave:"triangle"},
    "mini-forage":{tempo:285,lead:[64,66,67,71,67,66,62,64],bass:[40,null,43,null,38,null,45,null],wave:"square"},
    "mini-rush":{tempo:155,lead:[64,67,71,76,74,71,79,76],bass:[40,40,47,47,45,45,52,52],wave:"square"},
    "mini-defense":{tempo:330,lead:[40,null,43,47,50,null,47,43,38,null,43,47,52,null,48,45,36,null,40,43,47,null,50,47,43,null,45,48,52,50,47,null],bass:[24,null,31,null,27,null,34,null,22,null,29,null,25,null,32,null,20,null,27,null,23,null,30,null,19,null,26,null,31,null,34,null],wave:"triangle"},
    "mini-walk":{tempo:360,lead:[67,null,71,74,72,null,69,67],bass:[43,null,50,null,45,null,52,null],wave:"triangle"},
    "mini-memory":{tempo:520,lead:[60,null,64,null,67,71,null,67],bass:[36,null,null,43,null,null,40,null],wave:"sine"},
    // Skybound: open air, long lift, nothing underneath you.
    "mini-glide":{tempo:335,lead:[72,null,76,79,83,null,79,76,74,null,78,81,86,null,81,78],bass:[48,null,null,55,52,null,null,59,50,null,null,57,54,null,null,61],wave:"sine"},
    // Ember Forge: hammer rhythm, metal on metal, no melody wasted.
    "mini-breaker":{tempo:186,lead:[52,52,59,null,55,55,62,null,53,53,60,null,57,64,60,55],bass:[28,28,null,35,31,31,null,38,29,29,null,36,33,33,40,null],wave:"square"},
    // Rizo Runaway: the chase. Fast, minor, always one step behind you.
    "mini-maze":{tempo:132,lead:[62,65,69,65,62,68,65,62,60,63,67,63,60,66,63,60],bass:[38,38,45,45,43,43,50,50,36,36,43,43,41,41,48,48],wave:"square"}
  };

  function midiFrequency(note){ return 440 * Math.pow(2,(note-69)/12); }

  function musicTone(note,duration=.14,volume=.04,delay=0,type="triangle"){
    if(!state?.settings?.music || note == null)return;
    const ctx=ensureAudio(); if(!ctx)return;
    if(!musicGainNode){ musicGainNode=ctx.createGain(); musicGainNode.gain.value=currentMusicGain(); musicGainNode.connect(ctx.destination); }
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type; osc.frequency.value=midiFrequency(note);
    gain.gain.setValueAtTime(volume,ctx.currentTime+delay);
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+duration);
    osc.connect(gain).connect(musicGainNode); osc.start(ctx.currentTime+delay); osc.stop(ctx.currentTime+delay+duration+.02);
  }

  function musicBeat(){
    if(!musicUnlocked || !state?.settings?.music || document.hidden)return;
    const track=MUSIC_TRACKS[musicScene]||MUSIC_TRACKS.home;
    const i=musicStep%track.lead.length;
    const lead=track.lead[i], bass=track.bass[i%track.bass.length];
    if(musicScene==="mini-defense"){
      const d=mini?.defense,wave=Math.max(0,Number(d?.currentWave)||0),active=defenseIsSimulating(d),phase=d?.phase||DEFENSE_PHASES.PLANNING,leader=active?defenseFieldLeader(d):null,leaderVariant=leader?(leader.pet.variant||leader.pet.hiddenVariant||"classic"):"classic",leaderShift=DEFENSE_FEEL_PITCH[leaderVariant]||0;
      const boss=Boolean(active&&d?.enemies?.some(enemy=>enemy?.bossId&&!enemy.dead)),critical=Boolean(active&&d&&d.lives<=Math.max(5,Math.ceil((d.map?.lives||20)*.35)));
      const breakBeat=phase===DEFENSE_PHASES.PACKET_BREAK,late=wave>=20;
      // Planning breathes. Combat adds the lead. Packet breaks pull the lead back.
      // Bosses replace the groove instead of stacking on it, keeping the mix legible.
      if(boss){
        const bossPulse=[28,null,28,null,31,null,27,null][i%8];
        if(bossPulse!=null)musicTone(bossPulse,track.tempo/1000*2.35,.044,0,"sawtooth");
        if(i%4===2)musicTone(34,.16,.014,.02,"square");
        if(i%8===7)musicTone(40,.48,.018,.02,"triangle");
        if(critical&&i%4===3)musicTone(52,.055,.009,.01,"square");
        musicStep+=1;return;
      }
      if(bass!=null)musicTone(bass,track.tempo/1000*(active?1.75:2.25),active?.028:.018,0,active?"sawtooth":"triangle");
      if(lead!=null&&active&&!breakBeat)musicTone(lead,track.tempo/1000*.9,critical?.024:.02,.015,"triangle");
      if(i%4===0)musicTone(active?40:36,.18,active?.018:.011,0,"sine");
      if(active&&!breakBeat&&i%4===1)musicTone(late?47:43,.06,late?.009:.0065,0,"triangle");
      if(late&&active&&!breakBeat&&i%8===5)musicTone(55,.05,.0055,.015,"square");
      if(active&&!breakBeat&&leader?.doctrine&&i%8===3){const doctrineNote=(leader.doctrine==="power"?34:57)+leaderShift;musicTone(doctrineNote,leader.doctrine==="power"?.13:.09,leader.superForm?.012:.0085,.012,leader.doctrine==="power"?"sawtooth":"sine");}
      if(active&&!breakBeat&&leader?.superForm&&i%8===6)musicTone(leader.superForm==="power"?46+leaderShift:69+leaderShift,.14,.0095,.016,"triangle");
      if(critical&&i%4===3)musicTone(48,.045,.0075,.01,"square");
      if(i%8===7)musicTone(active?43:40,.32,active?.012:.008,.02,"triangle");
      musicStep+=1;return;
    }
    if(lead!=null) musicTone(lead,track.tempo/1000*.72,.026,0,track.wave);
    if(bass!=null) musicTone(bass,track.tempo/1000*1.45,.018,0,"triangle");
    if((musicScene==="arcade"||musicScene.startsWith("mini-"))&&i%2===0) musicTone(84, .025, .006, 0, "square");
    musicStep+=1;
  }

  function setMusicGain(value, seconds=.18) {
    const ctx=ensureAudio(); if(!ctx||!musicGainNode)return;
    const t=ctx.currentTime;
    musicGainNode.gain.cancelScheduledValues(t);
    musicGainNode.gain.setValueAtTime(Math.max(.001,musicGainNode.gain.value||.001),t);
    musicGainNode.gain.linearRampToValueAtTime(Math.max(.001,value),t+seconds);
  }

  function duckMusic(duration=800,level=.13) {
    if(!musicGainNode||!state?.settings?.music)return;
    setMusicGain(Math.min(currentMusicGain(),Math.max(.001,level*musicVolume())),.08);
    const token=musicTransitionToken;
    setTimeout(()=>{if(token===musicTransitionToken&&state?.settings?.music)setMusicGain(currentMusicGain(),.28);},duration);
  }

  function stopMusic(fadeMs=220){
    clearInterval(musicTimer); musicTimer=null;
    clearTimeout(musicStopTimer);
    if(musicGainNode)setMusicGain(.001,fadeMs/1000);
    musicStopTimer=setTimeout(()=>{musicScene="";},fadeMs+20);
  }

  function sceneMusicKey(){
    if(activeMusicOverride)return activeMusicOverride;
    if(mini?.active)return `mini-${mini.mode}`;
    if(el.originScreen && !el.originScreen.hidden)return "origin";
    if(currentView==="home"&&state?.pet?.sleeping)return "sleep";
    return currentView||"home";
  }

  function startMusicForScene(scene,force=false){
    if(scene==="mini-rhythm"){clearInterval(musicTimer);musicTimer=null;musicScene="mini-rhythm";return;}
    if(!musicUnlocked || !state?.settings?.music || document.hidden){ if(!state?.settings?.music) stopMusic(); return; }
    const key=MUSIC_TRACKS[scene]?scene:"home";
    if(!force&&musicScene===key&&musicTimer)return;
    const token=++musicTransitionToken;
    clearInterval(musicTimer); musicTimer=null; clearTimeout(musicStopTimer);
    if(musicGainNode)setMusicGain(.001,.12);
    const begin=()=>{
      if(token!==musicTransitionToken||!state?.settings?.music)return;
      musicScene=key; musicStep=0; musicBeat();
      musicTimer=setInterval(musicBeat,MUSIC_TRACKS[key].tempo);
      setMusicGain(currentMusicGain(),.28);
    };
    if(musicScene && !state.settings.reducedMotion)setTimeout(begin,130); else begin();
  }

  function syncMusic(force=false){ startMusicForScene(sceneMusicKey(),force); }

  function unlockMusic(){
    musicUnlocked=true;
    ensureAudio();
    syncMusic(true);
  }

  function buildRain() {
    el.rainLayer.innerHTML = "";
    for (let index = 0; index < 58; index += 1) {
      const drop = document.createElement("i");
      drop.className = "rain-drop";
      drop.style.left = `${Math.random() * 120 - 10}%`;
      drop.style.animationDuration = `${.55 + Math.random() * .55}s`;
      drop.style.animationDelay = `${-Math.random() * 2}s`;
      drop.style.opacity = String(.12 + Math.random() * .55);
      el.rainLayer.appendChild(drop);
    }
    for (let index = 0; index < 13; index += 1) {
      const dust = document.createElement("i");
      dust.className = "dust";
      dust.style.left = `${8 + Math.random() * 84}%`;
      dust.style.top = `${18 + Math.random() * 58}%`;
      dust.style.animationDelay = `${Math.random() * 4}s`;
      el.weatherFx.appendChild(dust);
    }
  }

  function typeStory(text) {
    clearInterval(storyTimer);
    el.storyText.textContent = "";
    let index = 0;
    storyTimer = setInterval(() => {
      el.storyText.textContent += text[index] || "";
      index += 1;
      if (index >= text.length) clearInterval(storyTimer);
    }, state.settings?.reducedMotion ? 1 : 24);
  }

  function renderOriginStep() {
    const step = ORIGIN_STEPS[originIndex];
    el.storySpeaker.textContent = step.speaker;
    typeStory(step.text);
    el.storyChoices.innerHTML = "";
    el.storyNext.hidden = originIndex === ORIGIN_STEPS.length - 1;
    if (originIndex === ORIGIN_STEPS.length - 1) {
      el.storyChoices.innerHTML = `<button class="story-choice" data-origin-choice="leave">WALK AWAY</button><button class="story-choice primary" data-origin-choice="take">PICK IT UP</button>`;
    }
  }

  function originChoice(choice) {
    if (choice === "leave") {
      el.storySpeaker.textContent = "YOU";
      typeStory("You made it six steps before the crying got quieter. Somehow that felt worse.");
      el.storyChoices.innerHTML = `<button class="story-choice primary" data-origin-choice="take" style="grid-column:1/-1">GO BACK AND TAKE IT</button>`;
      return;
    }
    completeOrigin();
  }

  function completeOrigin() {
    state.introSeen = true;
    if (!state.memories.some(item => item.title === "THE EGG IN THE RAIN")) addMemory("THE EGG IN THE RAIN", "You found a warm blue-spotted egg crying beneath the roots and took it home.", "☂");
    checkAchievements();
    saveState(true);
    el.originScreen.style.transition = "opacity .6s";
    el.originScreen.style.opacity = "0";
    setTimeout(() => {
      el.originScreen.hidden = true;
      el.rainLayer.hidden = true;
      el.gameShell.hidden = false;
      el.originScreen.style.opacity = "1";
      renderAll();
      say("...HELLO?", 2600);
      schedulePetBehavior(6000);
      requestPersistentStorage();
    }, 620);
  }

  function replayOrigin() {
    closeSheet();
    changeView("home");
    originIndex = 0;
    el.skipOrigin.hidden = false;
    el.originScreen.hidden = false;
    el.rainLayer.hidden = false;
    el.gameShell.hidden = true;
    renderOriginStep();
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch (error) { /* Persistence request is optional. */ }
  }

  async function shareRizo() {
    const pet = state.pet;
    const variant = currentVariant();
    const text = pet.stage === "egg"
      ? `I found a mystery egg in RIZO LIFE. It is ${Math.floor(pet.hatch)}% hatched.`
      : `${pet.name} is a Gen ${pet.generation || 1} ${pet.stage.toUpperCase()} ${variant.name}, raised into ${displayFormInfo(pet).name}, with ${Math.floor(pet.bond)} bond.`;
    try {
      if (navigator.share) await navigator.share({ title: "RIZO LIFE by Rizo Apparel", text: `${text} Play it, then shop the real brand at rizo.store.` });
      else { await navigator.clipboard.writeText(`${text} • RIZO LIFE by Rizo Apparel • rizo.store`); toast("RIZO STATS COPIED"); }
    } catch (error) { /* Sharing can be cancelled. */ }
  }

  function keeperRecoveryCode(){const savedAt=now(),envelope=buildStateEnvelope(state,savedAt);return encodeGardenCode({...envelope,v:VERSION,exportedAt:savedAt});}
  function readPreRecoveryBackup(){
    try{const raw=localStorage.getItem(`${SAVE_KEY}:pre-recovery`);if(!raw)return null;const decoded=decodeStateText(raw);return decoded.status==="invalid"?null:decoded.state;}catch(error){return null;}
  }
  function showKeeperRecoveryPreview(recovered,source="KEEPER CODE",schema="?"){
    const pet=recovered.pet,variant=VARIANTS.find(item=>item.id===(pet.variant||pet.hiddenVariant))||VARIANTS[0];
    window.__pendingKeeperRecovery=recovered;
    showModal(`<div class="modal-card keeper-recovery-preview"><small>VALID ${escapeHTML(source)} • SCHEMA ${escapeHTML(String(schema||"?"))}</small><div class="keeper-recovery-pet">${petMarkup({pet,extraClass:"recovery-rizo",context:"thumbnail",label:pet.name})}</div><h2>${escapeHTML(pet.name||"MYSTERY EGG")}</h2><p>${escapeHTML(variant.name)} • ${escapeHTML(String(pet.stage||"egg").toUpperCase())} • GEN ${Math.max(1,Number(pet.generation)||1)}<br>R ${Math.floor(recovered.wallet?.embers||0)} • ${Math.floor(recovered.wallet?.sparks||0)} SPARKS</p><p class="big-line">REPLACE THIS DEVICE'S CURRENT TIMELINE?</p><div class="modal-buttons"><button data-close-modal>CANCEL</button><button class="primary" data-apply-recovery>RESTORE KEEPER</button></div></div>`);
  }
  function openKeeperRecovery(){
    window.__pendingKeeperRecovery=null;
    const backup=readPreRecoveryBackup();
    showModal(`<div class="modal-card keeper-recovery-modal"><small>KEEPER RECOVERY</small><h2>PASTE YOUR KEEPER CODE.</h2><p>The code is fully validated before replacement. When you restore, this device writes a one-step backup of the timeline it is replacing.</p><textarea id="keeperRecoveryInput" class="visit-code-output" maxlength="250000" placeholder="PASTE COMPLETE KEEPER CODE"></textarea><div class="modal-buttons"><button data-close-modal>CANCEL</button><button data-paste-recovery>PASTE CLIPBOARD</button><button data-copy-recovery>COPY CURRENT CODE</button>${backup?'<button data-preview-pre-recovery>RESTORE PREVIOUS TIMELINE</button>':''}<button class="primary" data-preview-recovery>CHECK CODE</button></div></div>`);
  }
  async function pasteKeeperRecoveryCode(){const input=$("#keeperRecoveryInput");if(!input)return;try{const text=await navigator.clipboard.readText();if(!text.trim())throw new Error("empty");input.value=text.trim();input.focus();toast("KEEPER CODE PASTED");}catch(error){input.focus();toast("PRESS AND HOLD THE BOX, THEN TAP PASTE");}}
  async function copyKeeperRecoveryCode(){const code=keeperRecoveryCode();try{await navigator.clipboard.writeText(code);state.meta.lastBackupAt=now();saveState(true);toast("KEEPER RECOVERY CODE COPIED");}catch(error){const input=$("#keeperRecoveryInput");if(input){input.value=code;input.select();}toast("CODE READY TO COPY");}}
  function previewKeeperRecoveryCode(raw){
    try{const data=decodeGardenCode(raw);if(data?.app!=="RIZO LIFE"||!data.state)throw new Error("bad recovery");const decoded=decodeStatePayload(data);if(decoded.status==="invalid")throw new Error("bad recovery");if(decoded.status==="sanitized")recordSaveValidationWarning("keeper-code-sanitized",{});showKeeperRecoveryPreview(decoded.state,decoded.status==="verified"?"VERIFIED KEEPER SAVE":"SANITIZED KEEPER SAVE",data.v||"?");}catch(error){window.__pendingKeeperRecovery=null;toast("THAT KEEPER CODE IS INVALID OR INCOMPLETE");sfx("no");}
  }
  function previewPreRecoveryBackup(){const recovered=readPreRecoveryBackup();if(!recovered){toast("NO PREVIOUS TIMELINE IS STORED");sfx("no");return;}showKeeperRecoveryPreview(recovered,"DEVICE BACKUP",recovered.version||VERSION);}
  function applyKeeperRecovery(){const recovered=window.__pendingKeeperRecovery;if(!recovered)return;try{localStorage.setItem(`${SAVE_KEY}:pre-recovery`,JSON.stringify(buildStateEnvelope(state)));}catch(error){}clearDefenseCheckpoint();state=recovered;window.__pendingKeeperRecovery=null;saveState(true);closeModal();changeView("home");renderAll();toast("KEEPER TIMELINE RESTORED");sfx("legendary");celebrate();}

  function exportSave() {
    const savedAt=now(),payload = JSON.stringify({...buildStateEnvelope(state,savedAt),version:VERSION,exportedAt:savedAt}, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rizo-life-${state.player.keeperId.slice(-4).toLowerCase()}-${dateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.meta.lastBackupAt = now();
    saveState(true);
    toast("SAVE EXPORTED");
  }

  async function importSave(file) {
    try {
      if (!file || file.size > 2_000_000) throw new Error("Save file is too large");
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.state || parsed;
      if (!incoming.pet || !incoming.player) throw new Error("Not a Rizo save");
      const decoded=decodeStatePayload(parsed);
      if(decoded.status==="invalid")throw new Error("Invalid Rizo save");
      clearDefenseCheckpoint();
      state = decoded.state;
      if(decoded.status==="sanitized")recordSaveValidationWarning("import-sanitized",{});
      saveState(true);
      closeSheet();
      closeModal();
      renderAll();
      toast(decoded.status==="sanitized"?"SAVE IMPORTED • SANITIZED":"SAVE IMPORTED");
    } catch (error) {
      toast("THAT FILE IS NOT A VALID RIZO TIMELINE");
    } finally {
      el.importSaveInput.value = "";
    }
  }

  function copySummary() {
    const pet = state.pet;
    const variant = currentVariant();
    const summary = `RIZO LIFE
Keeper: ${state.player.keeperId}
Pet: ${pet.name}
Variant: ${pet.stage === "egg" ? "Mystery Egg" : variant.name}
Stage: ${pet.stage}
Generation: ${pet.generation || 1}
Form: ${displayFormInfo(pet).name}
Alignment: ${alignmentInfo(pet).name}
Level: ${pet.stage === "egg" ? 0 : levelForXP(pet.xp)}
Bond: ${Math.floor(pet.bond)}
Skills: ${SKILLS.map(skill=>`${skill.name} ${Math.floor(pet.skills?.[skill.id]||0)}/${Math.floor(pet.genes?.[skill.id]||100)}`).join(" • ")}
Taps: ${state.meta.totalTaps}
Walks: ${state.meta.totalWalks || 0}
Rebirths: ${state.meta.rebirths || 0}
Bond Eggs: ${state.meta.bondEggs || 0}
Lineage Trait: ${(pet.lineageTrait || "balanced").toUpperCase()}
Treasures: ${Object.values(state.treasures || {}).filter(Boolean).length}/${WALK_TREASURES.length}
Streak: ${state.player.streak}`;
    navigator.clipboard?.writeText(summary).then(() => toast("STATS COPIED")).catch(() => toast("COPY FAILED"));
  }

  function resetSave() {
    if (!confirm("Delete every Rizo, unlock, memory, and ember?")) return;
    if (!confirm("Really? This is the dramatic second confirmation.")) return;
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(DEFENSE_CHECKPOINT_KEY);
    localStorage.removeItem(`${SAVE_KEY}:pre-recovery`);
    location.reload();
  }

  // ===== RIZO HOUSE: passive rooms for extra Rizos =====
  // The state key and renderFarm() name stay intact so old saves and shared view routing remain compatible.
  function defaultFarmState() {
    return {
      roster: [],
      unlockedRooms: [0],
      activeRoom: 0,
      totalAdoptions: 0,
      totalReleased: 0,
      lastAdoptionAt: 0,
      featureUnlocked: false,
      unlockSeen: false,
      plots: [], materials: 0, totalHarvests: 0, totalCatches: 0, lastEncounterAt: 0
    };
  }

  function houseResidents(roomId = activeHouseRoom) {
    return state.farm.roster.filter(pet => Number(pet.homeRoom) === Number(roomId));
  }

  function houseCapacity() {
    return state.farm.unlockedRooms.length * HOUSE_ROOM_CAPACITY;
  }

  function firstOpenHouseRoom() {
    return state.farm.unlockedRooms.find(roomId => houseResidents(roomId).length < HOUSE_ROOM_CAPACITY) ?? null;
  }

  function houseHasSpace() {
    return firstOpenHouseRoom() !== null && state.farm.roster.length < HOUSE_MAX_TOTAL;
  }

  function createCapsulePet(rolled, tier) {
    const stageId = ["MYTHIC", "LEGENDARY", "SECRET"].includes(tier) ? "beast" : ["RARE", "EPIC"].includes(tier) ? "teen" : "kid";
    const stage = STAGES.find(item => item.id === stageId) || STAGES[1];
    const number = state.meta.nextPetNumber || 1;
    state.meta.nextPetNumber = number + 1;
    const skillFloor = Math.max(0, Math.round((stage.minStats / 5) * 0.7));
    const skills = {};
    for (const skill of SKILLS) skills[skill.id] = skillFloor + Math.floor(Math.random() * 4);
    return {
      id: uid("PET"), number,
      name: `${rolled.name.split(" ")[0]} ${String(number).padStart(2, "0")}`,
      stage: stage.id, hiddenVariant: rolled.id, variant: rolled.id,
      createdAt: now(), bornAt: now(), lastTick: now(),
      lifespanDays: 42 + Math.floor(Math.random() * 25),
      hatch: 100, xp: stage.minXP, level: 0, bond: stage.minBond,
      strength: 0, skills, genes: createGenes(), alignment: 0,
      careProfile: { kind: 0, wild: 0, balanced: 0, foods: {}, games: {} },
      form: "balanced", formHistory: [], generation: 1, lineageTrait: null, lastTrainedSkill: "stamina",
      resting: false, elder: false, hype: 0, taps: 0,
      personality: PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)],
      mutation: rollMutation().id, overstimulation: 0,
      health: 100, hunger: 80, mood: 78, energy: 85, hygiene: 82,
      sleeping: false, sick: false, alive: true, deathReason: null,
      accessory: "none", room: "rain", shame: false, graceUntil: null, lastFreeSnack: 0,
      fromCapsule: true, capsuleTier: tier, caughtAt: now(), homeRoom: 0
    };
  }

  function sendCapsulePetToFarm(rolled, tier, { allowOverflow = false } = {}) {
    const roomId = firstOpenHouseRoom();
    const pet = createCapsulePet(rolled, tier);
    if (roomId === null || state.farm.roster.length >= HOUSE_MAX_TOTAL) {
      const shardValue = { COMMON: 6, UNCOMMON: 10, RARE: 18, EPIC: 28, MYTHIC: 45, LEGENDARY: 80, SECRET: 150 }[tier] || 10;
      if (allowOverflow) {
        state.wallet.shards += shardValue;
        addMemory("HOUSE FULL", `${pet.name} arrived through a free signal, but every room was full. It left ${shardValue} Prism Shards.`, "⌂");
        return { overflow: true, shardValue };
      }
      return { overflow: true, shardValue: 0 };
    }
    pet.homeRoom = roomId;
    state.farm.roster.push(pet);
    state.farm.totalAdoptions = (state.farm.totalAdoptions || 0) + 1;
    state.farm.lastAdoptionAt = now();
    activeHouseRoom = roomId;
    state.farm.activeRoom = roomId;
    addMemory("NEW HOUSE RIZO", `${pet.name}, a ${rolled.name} Rizo, moved into ${HOUSE_ROOMS[roomId].name}.`, "⌂");
    return { overflow: false, pet };
  }

  function buyHouseRoom(roomId) {
    if (!houseIsUnlocked()) { toast(`RIZO HOUSE UNLOCKS AT LEVEL ${HOUSE_UNLOCK_LEVEL}`); sfx("no"); return; }
    const room = HOUSE_ROOMS.find(item => item.id === roomId);
    if (!room || state.farm.unlockedRooms.includes(roomId)) { selectHouseRoom(roomId); return; }
    const nextLocked = HOUSE_ROOMS.find(item => !state.farm.unlockedRooms.includes(item.id));
    if (!nextLocked || nextLocked.id !== roomId) { toast("UNLOCK ROOMS IN ORDER"); sfx("no"); return; }
    if (state.wallet.embers < room.cost) { toast(`NEED R ${room.cost} FOR ${room.name}`); sfx("no"); return; }
    state.wallet.embers -= room.cost;
    state.farm.unlockedRooms.push(roomId);
    state.farm.unlockedRooms.sort((a,b)=>a-b);
    activeHouseRoom = roomId;
    state.farm.activeRoom = roomId;
    addMemory("HOUSE EXPANDED", `Unlocked ${room.name} for R ${room.cost}.`, "⌂");
    saveState(true); renderFarm(); renderSharedUI();
    toast(`${room.name} UNLOCKED`); sfx("level"); celebrate();
  }

  function selectHouseRoom(roomId) {
    if (!state.farm.unlockedRooms.includes(roomId)) return;
    activeHouseRoom = roomId;
    state.farm.activeRoom = roomId;
    saveState(); renderFarm();
  }

  function moveHouseRoom(direction) {
    const ids = state.farm.unlockedRooms;
    const index = Math.max(0, ids.indexOf(activeHouseRoom));
    const next = ids[index + direction];
    if (next !== undefined) selectHouseRoom(next);
  }

  function swapFarmPet(rosterIndex) {
    const target = state.farm.roster[rosterIndex];
    if (!target) return;
    if (mini.active || worldEventOpen || el.bottomSheet?.classList.contains("show")) return;
    if (state.pet.stage === "egg") { toast("HATCH YOUR EGG BEFORE SWAPPING"); return; }
    if (!state.pet.alive) { toast("REVIVE YOUR CURRENT RIZO FIRST"); return; }
    const outgoing = state.pet;
    outgoing.homeRoom = target.homeRoom;
    state.farm.roster.splice(rosterIndex, 1, outgoing);
    state.pet = target;
    delete state.pet.homeRoom;
    processElapsedTime();
    if (state.pet.alive && state.pet.health <= 0) enterRecoveryState("neglect", true);
    updateStage(); checkAchievements();
    addMemory("HOUSE SWAP", `${outgoing.name} moved into ${HOUSE_ROOMS[outgoing.homeRoom].name}. ${target.name} is now the active Rizo.`, "⌂");
    closeModal(); saveState(true); renderAll();
    toast(`${target.name} IS NOW YOUR ACTIVE RIZO`); sfx("ui"); haptic(20);
  }

  function releaseFarmPet(rosterIndex) {
    const pet = state.farm.roster[rosterIndex];
    if (!pet) return;
    const variant = VARIANTS.find(item => item.id === pet.variant) || VARIANTS[0];
    showModal(`<div class="modal-card release-scene"><small>THE FRONT DOOR</small><h2>LET ${escapeHTML(pet.name)} GO?</h2><div class="capsule-stage" style="--reveal-color:${variant.color}"><div class="rarity-reveal"><img src="${variant.sprite}" alt="${escapeHTML(variant.name)}"></div></div><p class="release-line">${escapeHTML(pet.name)} stands by the door without making it dramatic.</p><p class="release-line">You make it dramatic enough for both of you.</p><p class="release-line">This isn't a delete. It's a life outside this house.</p><div class="modal-buttons"><button data-close-modal>KEEP THEM HOME</button><button class="primary" data-confirm-release="${rosterIndex}">SET THEM FREE</button></div></div>`);
    sfx("talk");
  }

  function confirmReleaseFarmPet(rosterIndex) {
    const pet = state.farm.roster[rosterIndex];
    if (!pet) return;
    state.farm.roster.splice(rosterIndex, 1);
    state.farm.totalReleased = (state.farm.totalReleased || 0) + 1;
    addMemory("SET FREE", `${pet.name} left ${HOUSE_ROOMS[pet.homeRoom]?.name || "the Rizo House"} and returned to the forest.`, "⌂");
    closeModal(); saveState(true); renderFarm(); renderSharedUI();
    toast(`${pet.name} IS FREE`); sensoryBurst("⌂", "#9eff75", 16); sfx("ui");
  }

  function houseThought(pet, slot, roomId) {
    const lines = [
      `${pet.name}: THIS ROOM HAS RULES?`,
      `${pet.name}: I CLAIMED THIS CORNER.`,
      `${pet.name}: THE DEN RIZO THINKS THEY'RE FAMOUS.`,
      `${pet.name}: WE SHOULD MOVE THE COUCH.`,
      `${pet.name}: I HEARD A CAPSULE OUTSIDE.`,
      `${pet.name}: ROOM ${roomId + 1} HAS LORE.`
    ];
    return lines[(slot + roomId * 2 + pet.number) % lines.length];
  }

  function houseResidentMarkup(pet, rosterIndex, slot, roomId) {
    const variant = VARIANTS.find(item => item.id === pet.variant) || VARIANTS[0];
    const pos = HOUSE_SLOT_POSITIONS[slot] || HOUSE_SLOT_POSITIONS[0];
    return `<button type="button" aria-label="View ${escapeHTML(pet.name)}" class="house-resident ${pos.pose}" data-house-pet-detail="${rosterIndex}" style="--resident-x:${pos.x}%;--resident-y:${pos.y}%;--resident-color:${variant.color};--resident-delay:${-(slot * 2.4 + roomId)}s"><span class="house-resident-life">${petMarkup({ pet, extraClass: "house-resident-pet", context: "card", label: `${pet.name}, resident of ${HOUSE_ROOMS[roomId].name}` })}<i class="house-resident-name">${escapeHTML(pet.name)}</i><span class="house-thought">${escapeHTML(houseThought(pet,slot,roomId))}</span></span></button>`;
  }

  function farmPetDetailModal(idx) {
    const pet = state.farm.roster[idx];
    if (!pet) return;
    const variant = VARIANTS.find(item => item.id === pet.variant) || VARIANTS[0];
    const stage = STAGES.find(item => item.id === pet.stage) || STAGES[0];
    const room = HOUSE_ROOMS[pet.homeRoom] || HOUSE_ROOMS[0];
    showModal(`<div class="modal-card farm-pet-detail"><small>${escapeHTML(room.name)} RESIDENT</small><h2>${escapeHTML(pet.name)}</h2><div class="capsule-stage" style="--reveal-color:${variant.color}">${petMarkup({pet,extraClass:"house-detail-pet",context:"cutscene",label:pet.name})}</div><p><span style="color:${variant.color}">${escapeHTML(variant.name)}</span> • ${stage.name} • BOND ${Math.floor(pet.bond)}</p><p class="house-detail-note">House Rizos live passively. Swap one into the Den when you want to care for or train it.</p><div class="modal-buttons"><button data-close-modal>NOT NOW</button><button data-release-farm-pet="${idx}">SET FREE</button><button class="primary" data-farm-swap="${idx}">MAKE ACTIVE</button></div></div>`);
    sfx("ui");
  }

  function houseRoomMood(count) {
    return ["QUIET", "SETTLING IN", "TALKING", "FULL CHAOS"][clamp(count, 0, 3)];
  }

  function renderLockedHouse() {
    const level = state.pet.stage === "egg" ? 0 : levelForXP(state.pet.xp);
    const basicsDone = state.player.tutorialStep >= 5 || state.player.tutorialDismissed;
    const progress = clamp(state.pet.xp / HOUSE_UNLOCK_XP * 100);
    el.farmContent.innerHTML = `<section class="house-lock-screen"><div class="house-lock-kicker">FUTURE FEATURE // LEVEL ${HOUSE_UNLOCK_LEVEL}</div><div class="house-locked-scene"><div class="house-lock-rain"></div><div class="house-lock-door"><i></i><b>⌂</b><span>ROOM 1</span></div><div class="house-lock-shadow shadow-one"></div><div class="house-lock-shadow shadow-two"></div></div><h1>RAISE ONE RIZO.<br>THEN OPEN THE HOUSE.</h1><p>The game starts with one relationship, not a collection menu. Once your active Rizo reaches Level ${HOUSE_UNLOCK_LEVEL}, the spare room opens and expensive new Rizos become available.</p><div class="house-unlock-checklist"><article class="${basicsDone ? "done" : ""}"><span>${basicsDone ? "✓" : "01"}</span><div><b>LEARN THE BASICS</b><small>Feed, play, and open the Journal.</small></div></article><article class="${level >= HOUSE_UNLOCK_LEVEL ? "done" : ""}"><span>${level >= HOUSE_UNLOCK_LEVEL ? "✓" : "02"}</span><div><b>REACH LEVEL ${HOUSE_UNLOCK_LEVEL}</b><small>Current Level ${level} • ${Math.floor(state.pet.xp)} / ${HOUSE_UNLOCK_XP} XP</small></div></article></div><div class="house-lock-progress"><i style="width:${progress}%"></i></div><button type="button" data-open-care-guide>OPEN KEEPER GUIDE</button></section>`;
  }

  function renderFarm() {
    if (!el.farmContent) return;
    if (!houseIsUnlocked()) { renderLockedHouse(); return; }
    const unlocked = state.farm.unlockedRooms;
    if (!unlocked.includes(activeHouseRoom)) activeHouseRoom = unlocked.includes(state.farm.activeRoom) ? state.farm.activeRoom : unlocked[0];
    state.farm.activeRoom = activeHouseRoom;
    const room = HOUSE_ROOMS[activeHouseRoom] || HOUSE_ROOMS[0];
    const residents = state.farm.roster.map((pet,index)=>({pet,index})).filter(item=>Number(item.pet.homeRoom)===activeHouseRoom);
    const roomIndex = unlocked.indexOf(activeHouseRoom);
    const prevDisabled = roomIndex <= 0;
    const nextDisabled = roomIndex >= unlocked.length - 1;
    const mood = houseRoomMood(residents.length);
    const residentScene = residents.length
      ? residents.map((item,slot)=>houseResidentMarkup(item.pet,item.index,slot,activeHouseRoom)).join("")
      : `<div class="house-empty"><div class="empty-rug"></div><b>THE ROOM IS WAITING.</b><span>Adopt a Rizo when earning R ${HOUSE_ADOPTION_COST} feels worth spending.</span></div>`;
    const roomButtons = HOUSE_ROOMS.map(item => {
      const open = unlocked.includes(item.id);
      const active = item.id === activeHouseRoom;
      return `<button type="button" class="house-room-chip ${open ? "unlocked" : "locked"} ${active ? "active" : ""}" ${open ? `data-house-room="${item.id}"` : `data-buy-house-room="${item.id}"`}><span>${item.icon}</span><b>${item.short}</b><small>${open ? `${houseResidents(item.id).length}/${HOUSE_ROOM_CAPACITY}` : `LOCKED • R ${item.cost}`}</small></button>`;
    }).join("");
    const nextLocked = HOUSE_ROOMS.find(item => !unlocked.includes(item.id));
    const canAffordAdoption = houseHasSpace() && state.wallet.embers >= HOUSE_ADOPTION_COST;
    const adoptClass = canAffordAdoption ? "" : 'class="short-on-embers"';
    const expandCard = nextLocked ? `<section class="house-expand-card"><div><small>NEXT ROOM</small><h3>${nextLocked.name}</h3><p>${nextLocked.copy}</p></div><button type="button" data-buy-house-room="${nextLocked.id}">UNLOCK • R ${nextLocked.cost}</button></section>` : `<section class="house-expand-card complete"><div><small>FULL PROPERTY</small><h3>EVERY ROOM IS YOURS.</h3><p>Twelve resident slots. That is already a concerning amount of Rizo.</p></div></section>`;
    const activePet = state.pet;
    const rebirthReady = canRebirth();
    const legacyCard = `<section class="stat-board legacy-board"><h3>LEGACY GARDEN</h3><p>${rebirthReady ? `${activePet.name} can become a Legacy Egg now. Cosmetics, collection and currency stay.` : `Reach Mature, 80 bond and 300 total training. Rebirth raises genetic caps and records this Rizo as an ancestor.`}</p><button class="wide-button ${rebirthReady ? "legacy-ready" : ""}" data-rebirth-info>${rebirthReady ? "CREATE LEGACY EGG" : "CHECK REBIRTH REQUIREMENTS"}</button><div class="legacy-list">${state.legacy.length ? state.legacy.slice(0,4).map(item=>`<span><b>${escapeHTML(item.name)}</b>${escapeHTML(item.formName || item.form || "TRUE FLAME")} • GEN ${item.generation || 1}</span>`).join("") : "<small>NO ANCESTORS YET.</small>"}</div></section>`;
    const visitCard = `<section class="stat-board social-board"><h3>GARDEN VISITS + BOND EGGS</h3><p>Swap Garden Codes with another Keeper. Visitors stay ten minutes. Mature friends can leave a Friendship Spark so the next Legacy Egg blends two bounded genetic lines.</p><div class="social-actions"><button data-copy-visit-code type="button">COPY MY GARDEN CODE</button><button data-open-visit type="button">VISIT WITH A CODE</button></div>${activeGardenVisitor()?`<div class="pairing-card"><span>VISITING NOW</span><b>${escapeHTML(activeGardenVisitor().name)} • ${escapeHTML(activeGardenVisitor().variantName)}</b><small>${escapeHTML(canSaveBondSeed().ok?"Teen+ and 30 Bond unlock a Friendship Spark.":canSaveBondSeed().reason)}</small><button data-pairing-spark type="button">${state.garden.bondSeed?"REPLACE BOND EGG DNA":"SAVE BOND EGG DNA"}</button></div>`:""}${state.garden.bondSeed?`<div class="bond-seed-card"><span>STORED FOR NEXT REBIRTH</span><b>♡ ${escapeHTML(state.garden.bondSeed.name)} + ${escapeHTML(activePet.name)}</b><small>GEN ${state.garden.bondSeed.generation} ${escapeHTML(state.garden.bondSeed.variantName || state.garden.bondSeed.variant)} genetics will be blended.</small><button data-clear-bond-seed type="button">CLEAR</button></div>`:""}<div class="visitor-history">${state.social.visitors.length ? state.social.visitors.slice(0,3).map(item=>`<span><b>${escapeHTML(item.name || "GUEST RIZO")}</b>${escapeHTML(item.variantName || "UNKNOWN")} • ${new Date(item.at).toLocaleDateString()}</span>`).join("") : "<small>NO VISITORS YET.</small>"}</div></section>`;
    el.farmContent.innerHTML = `<section class="house-section"><div class="house-den-shell"><div class="house-scene ${room.className}"><div class="house-sky"></div><div class="house-window"><i></i></div><div class="house-city"></div><div class="house-wall-mark"></div><div class="house-prop house-prop-left"></div><div class="house-prop house-prop-right"></div><div class="house-floor"></div><div class="house-room-light"></div><div class="house-ambient"></div><div class="house-scene-top"><div><small>RIZO HOUSE // ${room.short}</small><b>${room.name}</b></div><span><i></i>${mood}</span></div><button type="button" class="house-scene-arrow previous" data-house-prev ${prevDisabled ? "disabled" : ""} aria-label="Previous room">‹</button><button type="button" class="house-scene-arrow next" data-house-next ${nextDisabled ? "disabled" : ""} aria-label="Next room">›</button>${residentScene}<div class="house-scene-bottom"><div><strong>${residents.length}/${HOUSE_ROOM_CAPACITY} RIZOS</strong><span>${room.copy}</span></div><b>ROOM ${activeHouseRoom + 1}</b></div></div></div><div class="house-room-rail">${roomButtons}</div><p class="house-hint">This is Den part two: residents live here passively. Tap one to inspect it, swap it into the main Den, or set it free.</p><section class="house-property-actions"><section class="house-adoption-card"><div><small>ADOPT A REAL RIZO</small><h3>MYSTERY SIGNAL • R ${HOUSE_ADOPTION_COST}</h3><p>Expensive on purpose. A purchase creates a permanent resident and needs an open room slot.</p></div><button type="button" data-capsule="standard" ${adoptClass}>${houseHasSpace() ? `ADOPT • R ${HOUSE_ADOPTION_COST}` : "ROOMS FULL"}</button></section>${expandCard}</section><div class="house-stat-row"><span>RESIDENTS<b>${state.farm.roster.length}/${houseCapacity()}</b></span><span>ROOMS<b>${unlocked.length}/${HOUSE_ROOMS.length}</b></span><span>ACTIVE ROOM<b>${activeHouseRoom + 1}</b></span></div>${legacyCard}${visitCard}</section>`;
  }

  function handleDocumentClick(event) {
    // Pointer-up feeding closes the sheet before the browser emits its follow-up
    // click. Suppress that one ghost click so it cannot activate whatever button
    // was underneath the food tray (room nav, growth info, etc.). Keyboard clicks
    // still use the normal data-food-drag path because no pointer block is set.
    if (now() < feedClickBlockedUntil) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }

    if(event.target.closest("[data-update-later]")){document.getElementById("rizoUpdateBar")?.setAttribute("hidden","");return;}
    if(event.target.closest("[data-update-now], [data-refresh-latest]")){forceReleaseRefresh();return;}

    const nav = event.target.closest("[data-nav]")?.dataset.nav;
    if (nav) { changeView(nav); return; }

    const need = event.target.closest("[data-need]")?.dataset.need;
    if (need) { openNeedAction(need); return; }

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action) {
      if (action === "feed") openFoodSheet();
      if (action === "play") openPlaySheet();
      if (action === "clean") cleanPet();
      if (action === "sleep") toggleSleep();
      return;
    }

    const game = event.target.closest("[data-minigame]")?.dataset.minigame;
    if (game) { if (game === "defense") showDefenseOriginIntro(false); else startMiniGame(game); return; }
    if (event.target.closest("[data-defense-intro-continue]")) { rememberUnlockScene(DEFENSE_INTRO_SCENE_ID); saveState(true); showDefenseWorldLobby("auto"); return; }
    if (event.target.closest("[data-replay-defense-intro]")) { showDefenseOriginIntro(true); return; }
    if (event.target.closest("[data-defense-lobby-more]")) { showDefenseWorldExtras(); return; }
    if (event.target.closest("[data-defense-records]")) { showDefenseRecords(); return; }
    const guideButton=event.target.closest("[data-defense-field-guide]");
    if(guideButton){showDefenseFieldGuide(guideButton.dataset.defenseFieldGuide||"rizos");return;}
    const guideTab=event.target.closest("[data-field-guide-tab]")?.dataset.fieldGuideTab;
    if(guideTab){showDefenseFieldGuide(guideTab);return;}
    if(event.target.closest("[data-defense-school-open]")){showDefenseTrailSchool();return;}
    if(event.target.closest("[data-defense-school-restart]")){restartDefenseSchool();showDefenseTrailSchool();return;}
    if(event.target.closest("[data-defense-school-dismiss]")){const school=defenseSchoolState();school.dismissed=!school.dismissed;saveState(true);showDefenseTrailSchool();return;}
    if (event.target.closest("[data-defense-records-back]")) { showDefenseWorldLobby(pendingDefenseMapChoice); return; }
    const replayContractId=event.target.closest("[data-replay-defense-contract]")?.dataset.replayDefenseContract;
    if(replayContractId){const contract=normalizeDefenseRunContract((state.scores?.defenseContracts||[]).find(item=>item?.id===replayContractId));if(!contract){toast("CONTRACT RECORD NOT FOUND");return;}closeModal();setTimeout(()=>startMiniGame("defense",{mapId:contract.mapId,defenseContract:contract}),180);return;}
    if (event.target.closest("[data-discard-defense-run]")) { clearDefenseCheckpoint(); showDefenseWorldLobby(pendingDefenseMapChoice); toast("DEFENSE CHECKPOINT DISCARDED"); return; }
    if (event.target.closest("[data-resume-defense-run]")) {
      const checkpoint=readDefenseCheckpoint();
      if(!checkpoint){showDefenseWorldLobby(pendingDefenseMapChoice);toast("NO VALID DEFENSE CHECKPOINT");return;}
      closeModal();
      setTimeout(()=>startMiniGame("defense",{mapId:checkpoint.mapId,resumeCheckpoint:checkpoint}),180);
      return;
    }
    const rosterPick=event.target.closest("[data-defense-roster-pick]")?.dataset.defenseRosterPick;
    if(rosterPick){if(toggleDefenseRosterPick(rosterPick)){showDefenseWorldLobby(pendingDefenseMapChoice);sfx("ui");}else if(readDefenseCheckpoint())toast("RESUME OR DISCARD THE CHECKPOINT FIRST");else toast("CREW SLOTS ARE FULL");return;}
    const lobbyMap = event.target.closest("[data-defense-lobby-map]")?.dataset.defenseLobbyMap;
    if (lobbyMap) { showDefenseWorldLobby(lobbyMap); return; }
    const enterContract = event.target.closest("[data-enter-defense-contract]")?.dataset.enterDefenseContract;
    if (enterContract) {
      const contract=ensureDailyDefenseContract();
      if(contract.id!==enterContract){showDefenseWorldLobby(pendingDefenseMapChoice);toast("TODAY’S CONTRACT CHANGED");return;}
      closeModal();setTimeout(()=>startMiniGame("defense",{mapId:contract.mapId,defenseContract:contract}),180);return;
    }
    const enterDefense = event.target.closest("[data-enter-defense-world]")?.dataset.enterDefenseWorld;
    if (enterDefense !== undefined) { const mapId = defenseResolvedMapId(enterDefense || "auto"); closeModal(); setTimeout(() => startMiniGame("defense", {mapId}), 180); return; }

    const shop = event.target.closest("[data-shop-tab]")?.dataset.shopTab;
    if (shop) {
      shopTab = shop;
      $$("[data-shop-tab]").forEach(button => { const active = button.dataset.shopTab === shop; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
      renderShopList();
      return;
    }

    const journal = event.target.closest("[data-journal-tab]")?.dataset.journalTab;
    if (journal) {
      journalTab = journal;
      $$("[data-journal-tab]").forEach(button => { const active = button.dataset.journalTab === journal; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
      renderJournal();
      return;
    }

    const dragFood = event.target.closest("[data-food-drag]")?.dataset.foodDrag;
    if (dragFood) { if (now() >= feedClickBlockedUntil) useFood(dragFood); return; }
    const food = event.target.closest("[data-food]")?.dataset.food;
    if (food) { useFood(food); return; }
    const capsule = event.target.closest("[data-capsule]")?.dataset.capsule;
    if (capsule) { closeModal(); openCapsule(capsule); return; }
    const expedition = event.target.closest("[data-expedition]")?.dataset.expedition;
    if (expedition) { startExpedition(expedition); return; }
    if (event.target.closest("[data-expedition-claim]")) { claimExpedition(); return; }
    if (event.target.closest("[data-head-pat]")) { headPat(); return; }
    const sheetGame = event.target.closest("[data-sheet-game]")?.dataset.sheetGame;
    if (sheetGame) { startMiniGame(sheetGame); return; }
    const moreAction = event.target.closest("[data-more-action]")?.dataset.moreAction;
    if (moreAction === "talk") { talkToPet(); return; }
    if (moreAction === "sleep") { closeSheet(); toggleSleep(); return; }
    const boostUse = event.target.closest("[data-use-boost]")?.dataset.useBoost;
    if (boostUse) { useBoost(boostUse); return; }

    const accessory = event.target.closest("[data-buy-accessory]")?.dataset.buyAccessory;
    if (accessory) { buyAccessory(accessory); return; }
    const room = event.target.closest("[data-buy-room]")?.dataset.buyRoom;
    if (room) { buyRoom(room); return; }
    const boost = event.target.closest("[data-buy-boost]")?.dataset.buyBoost;
    if (boost) { buyBoost(boost); return; }
    if (event.target.closest("[data-show-install]")) {
      closeSheet();
      window.RizoInstall?.show?.();
      return;
    }
    const adReward = event.target.closest("[data-ad-reward]")?.dataset.adReward;
    if (adReward) { useAdReward(adReward); return; }

    if (event.target.closest("[data-open-rename]")) { closeSheet(); showNameModal(false); return; }
    if (event.target.closest("[data-open-journal]")) { closeSheet(); changeView("journal"); return; }
    if (event.target.closest("[data-share-rizo]")) { shareRizo(); return; }
    const eventButton = event.target.closest("[data-world-event][data-event-choice]");
    if (eventButton) { resolveWorldEvent(eventButton.dataset.worldEvent, eventButton.dataset.eventChoice); return; }
    const resonance = event.target.closest("[data-resonance]")?.dataset.resonance;
    if (resonance) { setNextEggResonance(resonance); return; }
    if (event.target.closest("[data-copy-visit-code]")) { copyGardenCode(); return; }
    if (event.target.closest("[data-open-visit]")) { openVisitSheet(); return; }
    if (event.target.closest("[data-confirm-visit]")) { acceptGardenVisit($("#visitCodeInput")?.value || ""); return; }
    if (event.target.closest("[data-pairing-spark]")) { saveBondSeed(); return; }
    if (event.target.closest("[data-clear-bond-seed]")) { clearBondSeed(); return; }
    if (event.target.closest("[data-visitor-interact]")) { say(`${state.social.currentVisitor?.name || "THE VISITOR"}: ${["YOUR GARDEN IS NICE.","DO YOU HAVE SNACKS?","I HEARD ABOUT THE RAIN.","OUR GENETICS ARE NONE OF YOUR BUSINESS."][Math.floor(Math.random()*4)]}`,2800); sfx("talk"); return; }
    const gardenToy = event.target.closest("[data-garden-toy]")?.dataset.gardenToy;
    if (gardenToy) { useGardenToy(gardenToy); return; }

    const houseRoom = event.target.closest("[data-house-room]")?.dataset.houseRoom;
    if (houseRoom !== undefined && houseRoom !== "") { selectHouseRoom(Number(houseRoom)); return; }
    const buyHouseRoomId = event.target.closest("[data-buy-house-room]")?.dataset.buyHouseRoom;
    if (buyHouseRoomId !== undefined && buyHouseRoomId !== "") { buyHouseRoom(Number(buyHouseRoomId)); return; }
    if (event.target.closest("[data-house-prev]")) { moveHouseRoom(-1); return; }
    if (event.target.closest("[data-house-next]")) { moveHouseRoom(1); return; }
    const swapIndex = event.target.closest("[data-farm-swap]")?.dataset.farmSwap;
    if (swapIndex !== undefined && swapIndex !== "") { swapFarmPet(Number(swapIndex)); return; }
    const detailIndex = event.target.closest("[data-house-pet-detail]")?.dataset.housePetDetail;
    if (detailIndex !== undefined && detailIndex !== "") { farmPetDetailModal(Number(detailIndex)); return; }
    const releaseIndex = event.target.closest("[data-release-farm-pet]")?.dataset.releaseFarmPet;
    if (releaseIndex !== undefined && releaseIndex !== "") { releaseFarmPet(Number(releaseIndex)); return; }
    const confirmReleaseIndex = event.target.closest("[data-confirm-release]")?.dataset.confirmRelease;
    if (confirmReleaseIndex !== undefined && confirmReleaseIndex !== "") { confirmReleaseFarmPet(Number(confirmReleaseIndex)); return; }
    if (event.target.closest("[data-open-growth]")) { openGrowthSheet(); return; }
    if (event.target.closest("[data-rebirth-info]")) { closeSheet(); showRebirthInfo(); return; }
    if (event.target.closest("[data-confirm-rebirth]")) { completeRebirth(); return; }
    if (event.target.closest("[data-comfort-pet]")) { comfortPet(); return; }
    if (event.target.closest("[data-open-keeper-path]")) { journalTab = "stats"; changeView("journal"); setTimeout(() => $("#keeperPathBoard")?.scrollIntoView({ behavior: state.settings.reducedMotion ? "auto" : "smooth", block: "start" }), 90); return; }
    if (event.target.closest("[data-open-care-guide]")) { closeSheet(); showKeeperBasics(); return; }
    if (event.target.closest("[data-start-feeding]")) { closeModal(); setTimeout(openFoodSheet, 240); return; }
    if (event.target.closest("[data-open-house]")) { closeModal(); setTimeout(() => changeView("farm"), 220); return; }
    if (event.target.closest("[data-close-modal]")) { closeModal(); return; }
    if (event.target.closest("[data-save-name]")) {
      const input = $("#modalNameInput");
      if (input && renamePet(input.value)) closeModal();
      return;
    }
    const replay = event.target.closest("[data-replay-game]")?.dataset.replayGame;
    if (replay) { closeModal(); if (replay === "defense") showDefenseWorldLobby("auto"); else startMiniGame(replay); return; }
    if (event.target.closest("[data-revive-thread]")) { revivePet("thread"); return; }
    const newEgg = event.target.closest("[data-new-egg]")?.dataset.newEgg;
    if (newEgg) { buyNewEgg(newEgg); return; }

    const originChoiceValue = event.target.closest("[data-origin-choice]")?.dataset.originChoice;
    if (originChoiceValue) { originChoice(originChoiceValue); return; }

    const settingChoice = event.target.closest("[data-setting-choice]")?.dataset.settingChoice;
    if (settingChoice) {
      const [key,value]=settingChoice.split(":");
      const allowed={defenseFx:["auto","full","low"],defenseUiScale:["compact","standard","large"],defenseWaveIntel:["off","simple","full"]};
      if(allowed[key]?.includes(value)){state.settings[key]=value;saveState(true);renderAll();toast(`${key==="defenseFx"?"DEFENSE EFFECTS":key==="defenseWaveIntel"?"WAVE INTEL":"BATTLEFIELD UI"} • ${value.toUpperCase()}`);}
      return;
    }

    const setting = event.target.closest("[data-setting]");
    if (setting) {
      state.settings[setting.dataset.setting] = setting.checked;
      saveState();
      if (setting.dataset.setting === "music") {
        if (mini?.active && mini.mode === "rhythm") {
          if (setting.checked) scheduleRhythmAudio(Math.max(0,rhythmClockNow()-mini.rhythmStartClock));
          else stopRhythmVoices();
        } else syncMusic(true);
      }
      renderAll();
      return;
    }
    if (event.target.closest("[data-open-recovery]")) { openKeeperRecovery(); return; }
    if (event.target.closest("[data-paste-recovery]")) { pasteKeeperRecoveryCode(); return; }
    if (event.target.closest("[data-copy-recovery]")) { copyKeeperRecoveryCode(); return; }
    if (event.target.closest("[data-preview-pre-recovery]")) { previewPreRecoveryBackup(); return; }
    if (event.target.closest("[data-preview-recovery]")) { previewKeeperRecoveryCode($("#keeperRecoveryInput")?.value||""); return; }
    if (event.target.closest("[data-apply-recovery]")) { applyKeeperRecovery(); return; }
    if (event.target.closest("[data-copy-keeper]")) {
      navigator.clipboard?.writeText(state.player.keeperId).then(() => toast("KEEPER ID COPIED")).catch(() => toast("COPY FAILED"));
      return;
    }
    if (event.target.closest("[data-cloud-sync]")) {
      toast(CONFIG.cloud.enabled ? "SYNC STARTED" : "CLOUD ADAPTER RESERVED FOR A FUTURE BUILD");
      return;
    }
    if (event.target.closest("[data-export-save]")) { exportSave(); return; }
    if (event.target.closest("[data-import-save]")) { el.importSaveInput.click(); return; }
    if (event.target.closest("[data-replay-origin]")) { replayOrigin(); return; }
    if (event.target.closest("[data-copy-summary]")) { copySummary(); return; }
    if (event.target.closest("[data-reset-save]")) { resetSave(); }
  }

  // ===== INPUT ROUTING AND APPLICATION BOOT =====
  function suspendRuntime(reason="hidden") {
    if (runtimeSuspendedAt) return false;
    runtimeSuspendedAt = now();
    runtimeSuspendReason = reason;
    cancelDefenseTransientInput(reason);
    if (state?.pet) lifeMemory().lastSeenAt = now();
    pauseDefenseForInterruption();
    writeDefenseCheckpoint(true, reason);
    saveState(true);
    if (mini?.active) mini.lastFrame = performance.now();
    // Defense keeps its own interruption/checkpoint path (above); every other
    // mode is timestamp-driven and needs the freeze.
    if (mini?.active && mini.mode !== "defense") arcadeFreeze("background");
    else if (mini?.active) arcadeHoldJobs("background");
    stopMusic();
    try { if (audioContext?.state === "running") audioContext.suspend(); } catch (error) {}
    return true;
  }

  function resumeRuntime(reason="visible") {
    const wasSuspended = runtimeSuspendedAt;
    runtimeSuspendedAt = 0;
    runtimeSuspendReason = "";
    if (mini?.active) mini.lastFrame = performance.now();
    scheduleRuntimeViewportSync("resume");
    if (!wasSuspended) return false;
    if(mini?.active && mini.mode!=="defense") arcadeThaw("background");
    else if(mini?.active) arcadeReleaseJobs("background");
    processElapsedTime(); renderAll(); surfaceDefenseInterruptionPause(); syncMusic(true); window.RizoBoot?.heartbeat?.(`runtime-${reason}`);
    schedulePetBehavior(4000); scheduleIdleLife(); scheduleLifeWow(9000); greetForSession();
    if (state.pet.resting) showRecoveryModal();
    return true;
  }

  function syncReleaseUpdateBar(){
    const bar=document.getElementById("rizoUpdateBar");if(!bar)return;bar.hidden=!releaseUpdateReady;
    const copy=bar.querySelector("[data-update-copy]");if(copy)copy.textContent=mini?.active&&mini.mode==="defense"?"New build ready • Update Now checkpoints this run first.":"New Rizo.game build ready.";
  }
  function announceReleaseUpdate(registration) {
    releaseUpdateReady = true;
    releaseRegistration = registration || releaseRegistration;
    syncReleaseUpdateBar();
    window.dispatchEvent(new CustomEvent("rizo:update-ready", { detail: releaseStatus() }));
    if (mini?.active && mini.mode === "defense") setDefenseMessage("UPDATE READY", "Tap UPDATE NOW when you want it. This run checkpoints automatically before refresh.");
    else toast("RIZO.GAME UPDATE READY • UPDATE NOW WHEN READY");
  }

  let releaseRefreshInFlight=false;
  async function forceReleaseRefresh(){
    if(releaseRefreshInFlight)return false;releaseRefreshInFlight=true;
    const bar=document.getElementById("rizoUpdateBar"),button=bar?.querySelector("[data-update-now]");bar?.classList.add("updating");if(button)button.textContent="CHECKING…";
    try{
      // Never destroy the only playable offline copy just because the user tapped refresh.
      // A cache-busting network probe must succeed before workers/caches are removed.
      const probe=new URL("./index.html",location.href);probe.searchParams.set("rizoNetworkProbe",String(Date.now()));
      const response=await fetch(probe.href,{cache:"no-store",headers:{"x-rizo-update-probe":"1"}});
      if(!response?.ok)throw new Error("latest build is not reachable");
      if(mini?.active&&mini.mode==="defense"){pauseDefenseForInterruption();writeDefenseCheckpoint(true,"force-update");}
      saveState(true);
      try{releaseRegistration?.waiting?.postMessage?.({type:"SKIP_WAITING"});}catch(error){}
      if("serviceWorker" in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(reg=>reg.unregister().catch(()=>false)));}
      if("caches" in window){const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith("rizo-game-")).map(name=>caches.delete(name)));}
      const url=new URL(location.href);url.searchParams.delete("rizoNetworkProbe");url.searchParams.set("rizoUpdate",String(Date.now()));
      location.replace(url.href);return true;
    }catch(error){
      releaseRefreshInFlight=false;bar?.classList.remove("updating");if(button)button.textContent="UPDATE NOW";
      toast("UPDATE NEEDS A CONNECTION • CURRENT GAME KEPT SAFE");return false;
    }
  }

  function registerRizoServiceWorker() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return Promise.resolve(null);
    return navigator.serviceWorker.register("./sw.js").then(registration => {
      releaseRegistration = registration;
      if (registration.waiting) announceReleaseUpdate(registration);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) announceReleaseUpdate(registration);
        });
      });
      registration.update().catch(() => {});
      return registration;
    }).catch(() => null);
  }

  function activateReleaseUpdate() { return forceReleaseRefresh(); }

  function bindEvents() {
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("pointerdown", unlockMusic, { once: true, passive: true });
    document.addEventListener("input", event => {
      const control=event.target.closest("[data-volume-setting]");
      if(!control)return;
      const key=control.dataset.volumeSetting;
      const value=clamp(Number(control.value)||0,0,100)/100;
      state.settings[key]=value;
      const label=document.querySelector(`[data-volume-value="${key}"]`);
      if(label)label.textContent=`${Math.round(value*100)}%`;
      if(key==="musicVolume"){
        if(mini?.active&&mini.mode==="rhythm"&&mini.rhythmGain){
          const ctx=ensureAudio();
          if(ctx){mini.rhythmGain.gain.cancelScheduledValues(ctx.currentTime);mini.rhythmGain.gain.setTargetAtTime(currentRhythmGain(),ctx.currentTime,.025);}
        } else if(musicGainNode)setMusicGain(currentMusicGain(),.06);
      } else if(key==="soundVolume"&&value>0){
        clearTimeout(control._rizoPreviewTimer);
        control._rizoPreviewTimer=setTimeout(()=>beep(540,.035,"square"),90);
      }
      clearTimeout(control._rizoSaveTimer);
      control._rizoSaveTimer=setTimeout(()=>saveState(),160);
    });
    document.addEventListener("change", event => {
      const control=event.target.closest("[data-volume-setting]");
      if(control)saveState();
    });
    document.addEventListener("pointerdown", event => { const button=event.target.closest("button,a"); if(button && !button.closest("#petTapTarget") && !button.closest("#miniArena")) sfx("ui"); }, {passive:true});
    el.storyNext.addEventListener("click", () => {
      if (originIndex < ORIGIN_STEPS.length - 1) { originIndex += 1; renderOriginStep(); }
    });
    el.foundEgg.addEventListener("click", () => {
      if (originIndex < 2) { originIndex = 2; renderOriginStep(); }
      else beep(330, .07);
    });
    el.skipOrigin.addEventListener("click", () => {
      el.originScreen.hidden = true;
      el.rainLayer.hidden = true;
      el.gameShell.hidden = false;
      renderAll();
    });
    el.petTapTarget.addEventListener("pointerdown", tapPet);
    document.addEventListener("pointermove", trackRizoAttention, { passive:true });
    document.addEventListener("pointerdown", () => { lastLifeInputAt = now(); scheduleIdleLife(); }, { passive:true });
    el.dailyGiftButton.addEventListener("click", showDailyGift);
    el.questClaim.addEventListener("click", claimQuest);
    el.moreCareButton.addEventListener("click", openMoreCareSheet);
    el.sceneMenuButton.addEventListener("click", openQuickSheet);
    el.brandButton.addEventListener("click", openKeeperSheet);
    el.journalJump.addEventListener("click", () => changeView("journal"));
    el.renameButton.addEventListener("click", () => showNameModal(false));
    el.sheetClose.addEventListener("click", closeSheet);
    el.sheetBackdrop.addEventListener("click", closeSheet);
    el.miniArena.addEventListener("pointerdown", event => {
      const defenseMode=mini?.active&&mini.mode==="defense";
      const blocksScroll=defenseMode&&Boolean(event.target.closest("#defenseWorld"));
      if(!defenseMode||blocksScroll)event.preventDefault();
      handleMiniInput(event);
    });
    el.miniArena.addEventListener("pointermove", handleMiniMove, { passive: true });
    document.addEventListener("pointermove", event => { if (mini?.active && mini.mode === "defense" && mini.defenseDrag) moveDefenseDrag(event); }, { passive: false });
    document.addEventListener("pointerdown", beginFoodDrag);
    document.addEventListener("pointermove", moveFoodDrag, { passive: true });
    document.addEventListener("pointerup", event => { endFoodDrag(event); if(mini?.active&&mini.mode==="defense")endDefenseDrag(event); if(mini?.active&&mini.mode==="maze")mini.mazePointerStart=null; if(mini?.active&&mini.mode==="breaker")mini.breakerGrab=null; });
    document.addEventListener("pointercancel", event => { if(mini?.active&&mini.mode==="defense")endDefenseDrag(event,true); if(mini?.active&&mini.mode==="maze")mini.mazePointerStart=null; if(mini?.active&&mini.mode==="breaker")mini.breakerGrab=null; });
    document.addEventListener("pointercancel", event => endFoodDrag(event, true));
    el.miniQuit.addEventListener("click", () => requestArcadeQuit("button"));
    el.miniPause?.addEventListener("click", () => toggleArcadePause());
    el.miniPausePanel?.addEventListener("click", event => {
      if(event.target.closest("[data-arcade-resume]")){ mini.quitConfirmed=false; mini.restartConfirmed=false; closeArcadePause(); return; }
      if(event.target.closest("[data-arcade-restart]")){ restartArcadeRun(); return; }
      if(event.target.closest("[data-arcade-quit]")){ requestArcadeQuit("panel"); return; }
    });
    el.tutorialClose.addEventListener("click", () => {
      state.player.tutorialDismissed = true;
      saveState();
      renderTutorial();
    });
    el.importSaveInput.addEventListener("change", () => {
      const file = el.importSaveInput.files?.[0];
      if (file) importSave(file);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target?.id === "modalNameInput") {
        event.preventDefault();
        if (renamePet(event.target.value)) closeModal();
        return;
      }
      if(mini?.active&&mini.mode==="defense"&&defenseHandleContextKeydown(event))return;
      if(mini?.active&&mini.mode==="maze"&&!mini.pausedByAd){const keyDir={arrowup:"up",w:"up",arrowdown:"down",s:"down",arrowleft:"left",a:"left",arrowright:"right",d:"right"}[String(event.key).toLowerCase()];if(keyDir){event.preventDefault();mazeSetDirection(keyDir);return;}}
      if(mini?.active&&mini.mode==="walk"&&!mini.pausedByAd){
        const key=String(event.key).toLowerCase();
        if(mini.pausedByFork&&["1","2"].includes(key)){
          event.preventDefault();mini.playerInputs+=1;
          if(mini.walkEncounter)chooseWalkEnding(key==="1"?"quiet":"bold");
          else chooseWalkFork(walkDecisionConfig(mini.walkDecisionIndex).choices[Number(key)-1].id);
          return;
        }
        if(!mini.pausedByFork&&(key===" "||key==="enter")){
          event.preventDefault();mini.playerInputs+=1;
          const find=mini.entities.filter(item=>item.kind==="walk"&&!item.handled&&item.x>=0&&item.x<el.miniArena.clientWidth-20).sort((a,b)=>a.x-b.x)[0];
          if(find)collectWalkObject(find.node);return;
        }
      }
      if(mini?.active&&mini.mode==="rhythm"&&!mini.pausedByAd){
        const keyLane={"1":0,"2":1,"3":2,"4":3,"d":0,"f":1,"j":2,"k":3}[String(event.key).toLowerCase()];
        if(keyLane!==undefined){event.preventDefault();mini.playerInputs=(mini.playerInputs||0)+1;rhythmTap(keyLane);return;}
      }
      if(mini?.active&&mini.mode==="power"&&!mini.pausedByAd){const tech={"1":"jab","2":"body","3":"hook","j":"jab","k":"body","l":"hook"}[String(event.key).toLowerCase()];if(tech){event.preventDefault();mini.playerInputs=(mini.playerInputs||0)+1;powerTap(tech);return;}}
      if(mini?.active&&mini.mode==="spark"&&!mini.pausedByAd&&String(event.key).toLowerCase()==="b"){event.preventDefault();mini.playerInputs=(mini.playerInputs||0)+1;bankSparkStash(false);return;}
      const typingTarget=Boolean(event.target?.closest?.("input, textarea, select, [contenteditable='true']"));
      if(mini?.active && !typingTarget && !event.metaKey && !event.ctrlKey && !event.altKey){
        const key=String(event.key);
        // P pauses any arcade run, including Defense.
        if(key.toLowerCase()==="p" && el.modalOverlay && !el.modalOverlay.classList.contains("show")){ event.preventDefault(); toggleArcadePause(); return; }
        if(!mini.pausedByAd && !mini.paused){
          if(mini.mode==="glide" && (key===" " || key==="Spacebar" || key==="ArrowUp" || key==="w" || key==="W")){ event.preventDefault(); mini.playerInputs=(mini.playerInputs||0)+1; glideFlap(); return; }
          if(mini.mode==="rush" && (key===" " || key==="Spacebar" || key==="ArrowUp" || key==="w" || key==="W")){ event.preventDefault(); mini.playerInputs=(mini.playerInputs||0)+1; rushJump(); return; }
          if(mini.mode==="breaker" && (key==="ArrowLeft" || key==="ArrowRight" || key.toLowerCase()==="a" || key.toLowerCase()==="d")){
            event.preventDefault(); mini.breakerGrab=null;
            setBreakerPaddle(mini.breakerX + ((key==="ArrowLeft"||key.toLowerCase()==="a")?-.075:.075)); return;
          }
          if(mini.mode==="forage" && (key==="ArrowLeft" || key==="ArrowRight" || key.toLowerCase()==="a" || key.toLowerCase()==="d")){
            event.preventDefault(); mini.playerInputs=(mini.playerInputs||0)+1;
            setForageLane((mini.lane||0) + ((key==="ArrowLeft"||key.toLowerCase()==="a")?-1:1)); return;
          }
          if(mini.mode==="memory"){
            const rune={"1":0,"2":1,"3":2,"4":3,"d":0,"f":1,"j":2,"k":3}[key.toLowerCase()];
            if(rune!==undefined){ event.preventDefault(); mini.playerInputs=(mini.playerInputs||0)+1; memoryTap(rune); return; }
          }
        }
      }
      if (event.key !== "Escape") return;
      // Escape used to silently destroy a personal best with zero friction.
      if (!el.miniGameOverlay.hidden) { if(mini?.paused) closeArcadePause(); else if(!openArcadePause()) requestArcadeQuit("escape"); }
      else if (el.modalOverlay.classList.contains("show")) closeModal();
      else if (el.bottomSheet.classList.contains("show")) closeSheet();
    });
    // A live OS reduced-motion change re-applies without a reload.
    try{ matchMedia("(prefers-reduced-motion: reduce)")?.addEventListener?.("change",()=>{ document.body.classList.toggle("reduce-motion", reducedMotionActive()); }); }catch(error){}
    document.addEventListener("visibilitychange", () => document.hidden ? suspendRuntime("background") : resumeRuntime("visible"));
    window.addEventListener("pagehide", () => suspendRuntime("pagehide"), { capture: true });
    window.addEventListener("pageshow", () => resumeRuntime("pageshow"), { capture: true });
    document.addEventListener("freeze", () => suspendRuntime("freeze"));
    document.addEventListener("resume", () => resumeRuntime("resume"));
    window.addEventListener("blur", () => cancelDefenseTransientInput("window-blur"), { passive: true });
    window.addEventListener("focus", () => scheduleRuntimeViewportSync("focus"), { passive: true });
    window.addEventListener("resize", () => scheduleRuntimeViewportSync("resize"), { passive: true });
    window.addEventListener("orientationchange", () => { cancelDefenseTransientInput("orientationchange"); scheduleRuntimeViewportSync("orientation"); }, { passive: true });
    window.visualViewport?.addEventListener("resize", () => scheduleRuntimeViewportSync("visual-resize"), { passive: true });
    window.visualViewport?.addEventListener("scroll", () => scheduleRuntimeViewportSync("visual-scroll"), { passive: true });
    document.addEventListener("fullscreenchange", () => scheduleRuntimeViewportSync("fullscreen"), { passive: true });
    document.addEventListener("webkitfullscreenchange", () => scheduleRuntimeViewportSync("fullscreen"), { passive: true });
    document.addEventListener("lostpointercapture", event => { if (mini?.active && mini.mode === "defense" && mini.defenseDrag?.pointerId === event.pointerId) cancelDefenseTransientInput("lost-capture"); });
    window.addEventListener("beforeunload", () => { suspendRuntime("unload"); writeDefenseCheckpoint(true,"unload"); saveState(true); });
  }

  function boot() {
    document.addEventListener("rizo:ad-start", () => { arcadeFreeze("ad"); stopMusic(); });
    document.addEventListener("rizo:ad-end", () => { arcadeThaw("ad"); syncMusic(true); });
    loadState();
    buildRain();
    bindEvents();
    scheduleIdleLife();
    scheduleLifeWow();
    if (state.introSeen) {
      el.originScreen.hidden = true;
      el.rainLayer.hidden = true;
      el.gameShell.hidden = false;
      renderAll();
      schedulePetBehavior(4500);
      greetForSession();
      if (state.pet.resting) setTimeout(showRecoveryModal, 250);
      else if (lastOfflineSummary) setTimeout(() => showOfflineSummary(lastOfflineSummary), 450);
      else if (state.pet.stage === "egg") setTimeout(() => say("TAP THE EGG. IT LIKES WARMTH.", 3200), 700);
    } else {
      el.originScreen.hidden = false;
      el.rainLayer.hidden = false;
      el.gameShell.hidden = true;
      el.skipOrigin.hidden = true;
      renderOriginStep();
    }
    setInterval(() => {
      if (!document.hidden) {
        processElapsedTime();
        processExpedition();
        saveState();
        // House residents are passive and their buttons must stay mounted while
        // the player watches or taps them. Rebuilding the room every five seconds
        // could detach a hitbox mid-tap, so only refresh shared chrome here.
        if (currentView === "farm") {
          renderSharedUI();
          renderTutorial();
          refreshAdSlots();
        } else renderAll();
      }
    }, 5000);
    setInterval(() => maybeTriggerWorldEvent(false), 30000);
    syncRuntimeViewport();
    registerRizoServiceWorker();
  }


  const IS_QA_BUILD=location.hostname==="localhost"||location.hostname==="127.0.0.1"||new URLSearchParams(location.search).get("qa")==="1";
  function createRizoRuntimeQA(){return Object.freeze({
    defaultState: () => JSON.parse(JSON.stringify(defaultState())),
    buildStateEnvelopeForQA: payload => buildStateEnvelope(payload||state,123456789),
    verifyStateEnvelopeForQA: envelope => DefenseCore.verifyStateSignature(envelope),
    decodeStatePayloadForQA: payload => {const decoded=decodeStatePayload(payload);return{status:decoded.status,state:decoded.state};},
    saveValidationWarningForQA: () => {try{return JSON.parse(localStorage.getItem(SAVE_VALIDATION_WARNING_KEY)||"null");}catch(error){return null;}},
    visualMatrixForQA: () => ({matrix:RIZO_FORMS,variants:VARIANTS,stages:STAGES,ages:AGE_VISUALS,calibration:VARIANT_VISUAL_CALIBRATION,wearables:WEARABLE_DEFS}),
    resolveRizoVisualForQA: options => resolveRizoVisual(options||{}),
    beatTracksForQA: () => ({tracks:EMBER_BEAT_TRACKS,chart:EMBER_BEAT_TRACKS.map(track=>({id:track.id,events:buildRhythmChart(track)})),stepSeconds:EMBER_BEAT_TRACKS.map(track=>({id:track.id,value:rhythmStepSeconds(track)}))}),
    normalizeState: payload => normalizeStateDetached(payload),
    loadForQA(payload = {}) {
      state = normalizeState(payload);
      activeHouseRoom = state.farm?.activeRoom || 0;
      state.introSeen = true;
      el.originScreen.hidden = true;
      el.rainLayer.hidden = true;
      el.gameShell.hidden = false;
      renderAll();
      return {version:state.version,stage:state.pet.stage,variant:state.pet.variant,accessory:state.pet.accessory};
    },
    snapshot: () => JSON.parse(JSON.stringify(state)),
    saveForQA: () => { saveState(true); return true; },
    showDefenseLobbyForQA: (choice="auto") => { showDefenseWorldLobby(choice); return {choice:pendingDefenseMapChoice,checkpoint:Boolean(readDefenseCheckpoint())}; },
    defenseWriteCheckpointForQA: (reason="qa") => writeDefenseCheckpoint(true,String(reason||"qa")),
    defenseReadCheckpointForQA: () => { const checkpoint=readDefenseCheckpoint(); return checkpoint?{checkpointVersion:checkpoint.checkpointVersion,savedAt:checkpoint.savedAt,keeperId:checkpoint.keeperId,mapId:checkpoint.mapId,contract:checkpoint.contract?{...checkpoint.contract}:null,currentWave:checkpoint.currentWave,clearedWave:checkpoint.clearedWave,reachedWave:checkpoint.currentWave,lives:checkpoint.lives,cash:checkpoint.cash,phase:checkpoint.phase,resumePhase:checkpoint.resumePhase,speed:checkpoint.speed,clock:checkpoint.clock,towers:checkpoint.towers.map(tower=>({...tower})),enemies:checkpoint.enemies.map(enemy=>({...enemy})),projectiles:checkpoint.projectiles.map(shot=>({...shot})),spawnQueue:checkpoint.spawnQueue.map(entry=>typeof entry==="string"?entry:{...entry}),wavePackets:checkpoint.wavePackets.map(packet=>({...packet,enemies:packet.enemies.map(entry=>typeof entry==="string"?entry:{...entry})})),childSpawnQueue:checkpoint.childSpawnQueue.map(item=>({...item,options:{...item.options}})),waveTotal:checkpoint.waveTotal,waveResolved:checkpoint.waveResolved,validationWarning:checkpoint.validationWarning||null,reason:checkpoint.reason}:null; },
    defenseClearCheckpointForQA: () => { clearDefenseCheckpoint(); return !readDefenseCheckpoint(); },
    defenseCheckpointKeyForQA: () => DEFENSE_CHECKPOINT_KEY,
    defenseRestoreCheckpointForQA: raw => restoreDefenseCheckpoint(raw),
    defenseNormalizeCheckpointForQA: raw => {const normalized=normalizeDefenseCheckpoint(raw);return normalized?JSON.parse(JSON.stringify(normalized)):null;},
    defenseSignCheckpointForQA: (raw,version=DEFENSE_CHECKPOINT_VERSION) => {const checkpoint=JSON.parse(JSON.stringify(raw||{})),safeVersion=DefenseCore.clampInteger(version,2,DEFENSE_CHECKPOINT_VERSION,DEFENSE_CHECKPOINT_VERSION);checkpoint.checkpointVersion=safeVersion;checkpoint.signature=DefenseCore.createSaveSignature(checkpoint,safeVersion);return checkpoint;},
    defenseBuildCheckpointForQA: (reason="qa") => mini.defense?JSON.parse(JSON.stringify(buildDefenseCheckpoint(mini.defense,String(reason||"qa")))):null,
    defenseCoreForQA: () => ({version:DefenseCore.VERSION,limits:{...DEFENSE_LIMITS},phases:{...DEFENSE_PHASES},budgets:JSON.parse(JSON.stringify(DEFENSE_BUDGETS)),simulation:{...DefenseCore.SIMULATION},economy:{...DefenseCore.ECONOMY},upgradeCosts:[...DefenseCore.UPGRADE_COSTS],goldenAtTwenty:DefenseCore.goldenBonus(20),goldenActiveOne:DefenseCore.goldenActivePayout({clearedWave:20,upgradeLevel:2,goldenTowerCount:1}),goldenActiveFive:DefenseCore.goldenActivePayout({clearedWave:20,upgradeLevel:2,goldenTowerCount:5}),deploySamples:[0,1,2,3].map(paidTowerCount=>DefenseCore.deploymentCost({paidTowerCount,copyCount:0,activeFirst:false})),densityNormal1x:DefenseCore.densityCap({low:false,speed:1}),densityNormal2x:DefenseCore.densityCap({low:false,speed:2}),densityLow1x:DefenseCore.densityCap({low:true,speed:1}),visualNormal1x:DefenseCore.visualBudget({low:false,speed:1}),visualNormal2x:DefenseCore.visualBudget({low:false,speed:2}),visualLow2x:DefenseCore.visualBudget({low:true,speed:2})}),
    defenseSetRunForQA: (values={}) => { const d=mini.defense;if(!d)return null;if(Number.isFinite(Number(values.wave)))d.wave=Math.max(0,Math.floor(Number(values.wave)));if(Number.isFinite(Number(values.lives)))d.lives=clamp(Math.floor(Number(values.lives)),0,d.map.lives);if(Number.isFinite(Number(values.cash)))d.cash=Math.max(0,Number(values.cash));if(values.phase)d.phase=DefenseCore.normalizePhase(values.phase,d.phase);if(Number.isFinite(Number(values.clock)))d.clock=Math.max(0,Number(values.clock));if(typeof values.paused==="boolean")d.paused=values.paused;markDefenseUi({roster:true});flushDefenseUi(true);return{currentWave:d.currentWave,clearedWave:d.clearedWave,wave:d.currentWave,lives:d.lives,cash:d.cash,phase:d.phase,clock:d.clock,paused:d.paused}; },
    defensePhaseForQA: () => {const d=mini.defense;if(!d)return null;const ui=defensePhaseUi(d);return{phase:d.phase,resumePhase:d.resumePhase||null,currentWave:d.currentWave,clearedWave:d.clearedWave,label:ui.label,detail:ui.detail,tone:ui.tone,domLabel:$("#defensePhaseLabel")?.textContent||"",domDetail:$("#defensePhaseDetail")?.textContent||"",domWave:$("#defenseWave")?.textContent||"",domCleared:$("#defenseClearedWave")?.textContent||"",transitionRejects:d.phaseTransitionRejects||0};},
    defenseAttemptPhaseForQA: requested => {const d=mini.defense;if(!d)return null;const before=d.phase,normalized=DefenseCore.normalizePhase(requested,before),accepted=defenseSetPhase(d,normalized),after=d.phase;flushDefenseUi(true);return{before,requested:normalized,accepted,after,rejects:d.phaseTransitionRejects||0};},
    defenseOverlayForQA: () => {const d=mini.defense;if(!d)return null;const surface=defenseContextSurface(d),host=surface?defenseContextElement(surface):null,active=document.activeElement;return{surface,fieldMenuOpen:Boolean(d.fieldMenuOpen),abilityTrayOpen:Boolean(d.abilityTrayOpen),intelOpen:Boolean(d.intelOpen),towerOpen:Boolean(d.selectedTowerId),scrimHidden:$(".defense-context-scrim")?.hidden??true,stageInert:Boolean($(".defense-stage-frame")?.inert),commandsInert:Boolean($(".defense-command-deck")?.inert),rosterInert:Boolean($(".defense-deploy-dock")?.inert),focusInside:Boolean(host&&active&&host.contains(active)),activeTag:active?.tagName||"",activeText:(active?.textContent||"").trim().slice(0,80)};},
    defenseSchoolForQA: () => JSON.parse(JSON.stringify(defenseSchoolState())),
    defenseSchoolRestartForQA: () => {restartDefenseSchool();return JSON.parse(JSON.stringify(defenseSchoolState()));},
    defenseSchoolCompleteForQA: id => {const ok=completeDefenseSchoolLesson(String(id||""),{silent:true});return{ok,school:JSON.parse(JSON.stringify(defenseSchoolState()))};},
    defenseSchoolCoachForQA: () => ({next:defenseSchoolNext()?.id||null,hidden:$("#defenseSchoolCoach")?.hidden??true,text:$("#defenseSchoolCoach")?.textContent||""}),
    defenseTraceRouteForQA: () => traceDefenseRoute(),
    defenseFieldGuideMarkupForQA: tab => defenseFieldGuideMarkup(tab||"rizos"),
    defenseShowFieldGuideForQA: tab => {showDefenseFieldGuide(tab||"rizos");const card=document.querySelector("#modalOverlay .defense-field-guide");return{shown:Boolean(card),text:card?.textContent||""};},
    defenseShowRecordsForQA: () => {showDefenseRecords();const card=document.querySelector("#modalOverlay .defense-records-modal");return{shown:Boolean(card),text:card?.textContent||""};},
    defenseShowLobbyForQA: mapId => {showDefenseWorldLobby(mapId||"grove");const card=document.querySelector("#modalOverlay .defense-world-lobby");return{shown:Boolean(card),text:card?.textContent||""};},
    defenseRosterConfigForQA: () => {const configured=defenseConfiguredRoster(),mapId=defenseResolvedMapId(pendingDefenseMapChoice),read=defenseRosterRead(configured,mapId);return{slots:DEFENSE_ROSTER_WING_SLOTS,guestAllowed:defenseGuestAccessAllowed(),configured:configured.map(row=>({id:row.pet.id,name:row.pet.name,source:row.source,variant:row.pet.variant||row.pet.hiddenVariant,tags:defenseRosterIdentity(row.pet).tags,training:defenseRosterTrainingEdge(row.pet),masteryLean:defenseMasteryLean(state.scores?.defenseMastery?.[row.pet.id]),trailFit:defenseRosterTrailFit(row.pet,mapId)})),owned:defenseOwnedRosterEntries().map(row=>({id:row.pet.id,source:row.source,variant:row.pet.variant||row.pet.hiddenVariant})),read:{mapId,captainPower:read.captainPower,tools:read.tools,fitIds:read.fits.map(row=>row.pet.id),openingLabel:read.openingLabel,hasOpeningDeal:read.hasOpeningDeal}};},
    defenseSetRosterForQA: ids => {if(readDefenseCheckpoint())clearDefenseCheckpoint();defenseSetConfiguredWingIds(Array.isArray(ids)?ids:[]);return defenseConfiguredRoster().map(row=>({id:row.pet.id,source:row.source}));},
    defenseShowTowerPanelForQA: () => {const tower=mini.defense?.towers[0];if(!tower)return false;showDefenseTowerPanel(tower);return{shown:!$("#defenseTowerPanel")?.hidden,text:$("#defenseTowerPanel")?.textContent||""};},
    showDefenseFieldGuideForQA: tab => {showDefenseFieldGuide(tab||"rizos");return true;},
    defenseMapMetaForQA: () => Object.fromEntries(DEFENSE_MAP_ORDER.map(id=>[id,{entrance:DEFENSE_MAPS[id].entrance,lore:DEFENSE_MAPS[id].lore,lesson:DEFENSE_MAPS[id].lesson}])),
    defenseRecordsForQA: () => JSON.parse(JSON.stringify({history:state.scores?.defenseHistory||[],mastery:state.scores?.defenseMastery||{},contracts:state.scores?.defenseContracts||[],perfectMaps:state.scores?.defensePerfectMaps||[],maps:state.scores?.defenseMaps||{}})),
    defenseSetMasteryForQA: (petId,waves=0) => {const row=defenseRoster().find(item=>item.pet.id===petId)||defenseRoster()[0];if(!row)return null;const prior=state.scores.defenseMastery?.[row.pet.id]||{};state.scores.defenseMastery||={};state.scores.defenseMastery[row.pet.id]={petId:row.pet.id,name:row.pet.name,variant:row.pet.variant||row.pet.hiddenVariant||"classic",runs:Math.max(1,Number(prior.runs)||1),waves:Math.max(0,Number(waves)||0),bestWave:Math.max(0,Number(prior.bestWave)||0),pops:Math.max(0,Number(prior.pops)||0),damage:Math.max(0,Number(prior.damage)||0),bosses:Math.max(0,Number(prior.bosses)||0),powerPaths:Math.max(0,Number(prior.powerPaths)||0),controlPaths:Math.max(0,Number(prior.controlPaths)||0),lastAt:now()};return{tier:defenseMasteryTier(state.scores.defenseMastery[row.pet.id]),title:defenseMasteryTitle(state.scores.defenseMastery[row.pet.id]),signature:defenseMasterySignatureName(state.scores.defenseMastery[row.pet.id])};},
    defenseSetPresentationForQA: (fx="auto",ui="standard",signatures=true) => {state.settings.defenseFx=["auto","full","low"].includes(fx)?fx:"auto";state.settings.defenseUiScale=["compact","standard","large"].includes(ui)?ui:"standard";state.settings.defenseSignatures=signatures!==false;renderSharedUI();return{fx:state.settings.defenseFx,ui:state.settings.defenseUiScale,signatures:state.settings.defenseSignatures,body:document.body.className};},
    defenseSetRendererForQA: mode => {defenseRendererOverride=["canvas","dom"].includes(String(mode))?String(mode):null;return defenseRendererOverride||"auto";},
    defenseDisableCanvasForQA: () => {const d=mini.defense;if(!d?.canvasRenderer)return false;d.canvasRenderer.enabled=false;renderDefensePresentation(1,true);return{rendererMode:d.rendererMode,enemyNodes:document.querySelectorAll(".defense-enemy").length,projectileNodes:document.querySelectorAll(".defense-shot").length,canvasFallbacks:d.canvasFallbacks||0};},
    defenseRecordsMarkupForQA: () => defenseRecordsMarkup(),
    showDefenseRecordsForQA: () => {showDefenseRecords();return true;},
    defenseDailyContractForQA: date => JSON.parse(JSON.stringify(ensureDailyDefenseContract(date||dateKey()))),
    defenseStartContractForQA: raw => {const contract=normalizeDefenseRunContract(raw)||ensureDailyDefenseContract();startMiniGame("defense",{mapId:contract.mapId,defenseContract:contract});return mini.defense?{id:mini.defense.contract?.id||null,mapId:mini.defense.mapId,rules:[...(mini.defense.contract?.rules||[])],maxTowers:mini.defense.maxTowers}:null;},
    defenseContractForQA: () => mini.defense?.contract?JSON.parse(JSON.stringify(mini.defense.contract)):null,
    defenseSellForQA: () => {const tower=mini.defense?.towers[0];return tower?sellDefenseTower(tower.id):false;},
    defenseSellLastForQA: () => {const tower=mini.defense?.towers.at(-1);return tower?sellDefenseTower(tower.id):false;},
    defenseBuyUpgradeForQA: id => {const tower=id?mini.defense?.towers.find(item=>item.id===id):mini.defense?.towers.at(-1);return tower?upgradeDefenseTower(tower.id):false;},
    defenseEconomyForQA: () => {const d=mini.defense,tower=d?.towers.at(-1);return d?{baseStartingCash:BASE_DEFENSE_STARTING_CASH,cash:d.cash,mapId:d.mapId,worldPerk:defenseWorldPerkLabel(d),worldPerkUsed:Boolean(d.worldPerkUsed),phase:d.phase,placementAllowed:defensePlacementAllowed(d),sellAllowed:defenseSellAllowed(d),upgradeAllowed:defenseUpgradeAllowed(d),goldenBonus:defenseGoldenBonus(),goldenFactoryMultiplier:DefenseCore.goldenFactoryMultiplier(defenseAwakenedGoldenCount(d)),tower:tower?{id:tower.id,structureType:defenseStructureType(tower),cost:tower.cost,spent:tower.spent,upgrade:tower.upgrade,openingPerkApplied:Boolean(tower.openingPerkApplied),canUndo:defenseCanUndoPlacement(tower,d),sellRefund:defenseSellRefund(tower,d),nextUpgradeCost:defenseUpgradeCost(tower,d)}:null}:null;},
    defenseStructuresForQA: () => {const d=mini.defense;return d?d.towers.filter(t=>defenseStructureType(t)).map(t=>({id:t.id,type:defenseStructureType(t),upgrade:t.upgrade,cost:t.cost,spent:t.spent,totalProduced:t.totalProduced||0,nextProductionAt:t.nextProductionAt||0,cleanCycles:t.factoryCleanCycles||0,factory:defenseStructureType(t)==="factory"?defenseFactoryEconomy(t,d):null,beacon:defenseStructureType(t)==="beacon"?{...DefenseCore.beaconSupport(t.upgrade),network:defenseBeaconNetwork(t,d)}:null})):[];},
    defenseCastForQA: () => {const tower=mini.defense?.towers[0],d=mini.defense;if(!tower||!d)return false;tower.upgrade=Math.max(2,tower.upgrade);tower.doctrine=tower.doctrine||defenseContractForcedDoctrine()||"power";tower.abilityReadyAt=0;defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});d.paused=false;return activateDefenseAbility(tower.id);},
    defenseAbilityGroupsForQA: () => defenseAbilityGroups().map(group=>({id:group.id,active:group.ability.active,total:group.instances.length,ready:group.ready.length,nextRemaining:Number.isFinite(group.nextRemaining)?group.nextRemaining:null,instances:group.instances.map(row=>({id:row.tower.id,remaining:row.remaining,level:row.tower.upgrade+1,copy:row.tower.copyNumber||1,field:defenseTowerFieldLabel(row.tower)}))})),
    defenseSetAbilityStateForQA: (id,values={}) => {const d=mini.defense,tower=d?.towers.find(item=>item.id===id);if(!tower)return false;tower.upgrade=Math.max(2,Math.floor(Number(values.upgrade??tower.upgrade)||2));tower.doctrine=DEFENSE_DOCTRINES[values.doctrine]?values.doctrine:(tower.doctrine||"power");const remaining=Math.max(0,Number(values.remaining)||0);tower.abilityReadyAt=defenseNow()+remaining;defenseSetPhase(d,DefenseCore.normalizePhase(values.phase,DEFENSE_PHASES.COMBAT),{force:true});d.paused=Boolean(values.paused);refreshDefenseTower(tower);markDefenseUi();flushDefenseUi(true);return{id:tower.id,abilityId:defenseAbilityId(tower),remaining:Math.ceil(defenseAbilityRemaining(tower)),doctrine:tower.doctrine,upgrade:tower.upgrade};},
    defenseFieldLeaderForQA: () => {const tower=defenseFieldLeader();return tower?{id:tower.id,petId:tower.petId,name:tower.pet?.name||"",doctrine:tower.doctrine||null,upgrade:tower.upgrade,superForm:tower.superForm||null}:null;},
    defenseAscendForQA: id => {const tower=mini.defense?.towers.find(item=>item.id===id)||mini.defense?.towers[0];if(!tower)return false;return ascendDefenseTower(tower.id);},
    defenseOpenAbilitiesForQA: force => {toggleDefenseAbilityTray(force!==false);return{open:Boolean(mini.defense?.abilityTrayOpen),groups:defenseAbilityGroups().length,badge:$("#defenseAbilityCount")?.textContent||"",text:$("#defenseAbilityTray")?.textContent||""};},
    defenseToggleBenchForQA: force => {toggleDefenseBench(force);return{open:Boolean(mini.defense?.benchOpen),shell:$(".defense-shell")?.className||""};},
    defenseToggleFieldMenuForQA: force => {toggleDefenseFieldMenu(force);return{open:Boolean(mini.defense?.fieldMenuOpen),hidden:$("#defenseFieldMenu")?.hidden??true,shell:$(".defense-shell")?.className||""};},
    defenseActivateAbilityGroupForQA: id => activateDefenseAbilityGroup(String(id||"")),
    defenseBossTelegraphForQA: (bossId="crown") => {const d=mini.defense;if(!d)return false;defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});const enemy=spawnDefenseEnemy({type:"boss",bossId,intensity:0},{progress:.42});if(bossId==="crown"||bossId==="mirror")enemy.hp=enemy.maxHp*.49;else enemy.nextBossPulse=d.clock;handleDefenseBossMechanics(enemy);return{enemyId:enemy.id,bossId:enemy.bossId,kind:enemy.telegraphKind,until:enemy.telegraphUntil,interruptible:Boolean(DEFENSE_BOSS_TELEGRAPHS[enemy.telegraphKind]?.interruptible)};},
    defenseInterruptBossForQA: (enemyId,doctrine="control",hits=4) => {const d=mini.defense,enemy=d?.enemies.find(item=>item.id===enemyId),tower=d?.towers[0];if(!enemy||!tower)return false;tower.doctrine=doctrine;for(let i=0;i<Math.max(1,Number(hits)||1)&&enemy.telegraphKind;i+=1)disruptDefenseBossTelegraph(enemy,tower,.34);return{kind:enemy.telegraphKind,disruption:enemy.telegraphDisruption||0,interrupts:d.enemyStats.counters.bossInterrupts||0,phaseTriggered:Boolean(enemy.phaseTriggered),nextBossPulse:enemy.nextBossPulse};},
    startMiniGame,
    finishMiniGame,
    chooseEmberBeatTrack,
    rhythmTapForQA: lane => rhythmTap(Number(lane)),
    rhythmTimingForQA: () => { const elapsed=mini.mode==="rhythm"?rhythmClockNow()-mini.rhythmStartClock:null; const open=mini.mode==="rhythm"?mini.rhythmChart.filter(note=>!note.handled).map(note=>({lane:note.lane,hitTime:note.hitTime,delta:note.hitTime-elapsed})).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)).slice(0,4):[]; return {ready:Boolean(mini.rhythmReady),elapsed,open}; },
    rhythmSnapshot: () => ({track:mini.rhythmTrack?.id||null,difficulty:mini.rhythmTrack?.difficulty||null,chart:mini.rhythmChart.map(note=>({hitTime:note.hitTime,lane:note.lane,handled:note.handled||false})),streak:mini.rhythmStreak,maxStreak:mini.rhythmMaxStreak,judgements:{...(mini.rhythmJudgements||{})},accuracy:mini.mode==="rhythm"?rhythmAccuracyPercent():null}),
    renderAll,
    setBehaviorForQA(behavior = "") { activePetBehavior = behavior; if(currentView === "home") renderHome(); return el.petActor.className; },
    markupForQA(context = "cutscene", accessory = state.pet.accessory) { return petMarkup({context,overrides:{accessory}}); },
    miniSnapshot: () => ({active:Boolean(mini?.active),mode:mini?.mode||null,track:mini?.rhythmTrack?.id||null,voices:(mini?.rhythmVoices||[]).length,intervals:(mini?.intervals||[]).length,timeouts:(mini?.timeouts||[]).length,entities:(mini?.entities||[]).length,defense:mini?.defense?{mapId:mini.defense.mapId,contract:mini.defense.contract?{...mini.defense.contract}:null,maxTowers:mini.defense.maxTowers,speed:mini.defense.speed,currentWave:mini.defense.currentWave,clearedWave:mini.defense.clearedWave,wave:mini.defense.currentWave,lives:mini.defense.lives,cash:mini.defense.cash,towers:(mini.defense.towers||[]).length,enemies:(mini.defense.enemies||[]).length,phase:mini.defense.phase}:null}),
    arcadeAuthoredForQA: () => ({
      rush:{route:mini?.rushRoute||0,parcel:Boolean(mini?.rushParcel),tips:mini?.rushTips||0,deliveries:mini?.rushDeliveries||0,lost:mini?.rushPackagesLost||0,clears:mini?.rushParcelClears||0,lives:mini?.lives||0,objects:(mini?.entities||[]).filter(e=>e.kind==="rush").map(e=>({type:e.type,x:e.x,handled:e.handled}))},
      forage:{rows:mini?.forageRows||0,mistakes:mini?.forageMistakes||0,nextIn:Math.max(0,(mini?.forageNextAt||0)-now()),drops:(mini?.entities||[]).filter(e=>e.kind==="forage").map(e=>({lane:e.lane,food:e.foodId,y:e.y,rare:e.rare,good:e.good}))},
      walk:{notes:[...(mini?.walkNotes||[])],choices:[...(mini?.walkChoices||[])],ending:mini?.walkEnding||"",encounter:mini?.walkEncounter||null,paused:Boolean(mini?.pausedByFork)}
    }),
    arcadeSnapshotForQA: () => ({active:Boolean(mini?.active),mode:mini?.mode||null,score:Number(mini?.score)||0,hits:Number(mini?.hits)||0,playerInputs:Number(mini?.playerInputs)||0,power:{streak:mini?.powerStreak||0,best:mini?.powerBestStreak||0,heat:mini?.powerHeat||0,guard:Boolean((mini?.powerGuardUntil||0)>now()),reads:mini?.powerGuardReads||0,call:mini?.powerCall||null,callsRead:mini?.powerCallsRead||0,wrongCalls:mini?.powerWrongCalls||0},spark:{type:mini?.sparkType||null,streak:mini?.sparkStreak||0,best:mini?.sparkBestStreak||0,avoided:mini?.sparkAvoided||0,frenzy:Boolean((mini?.sparkFeverUntil||0)>now()),frenzies:mini?.sparkFrenzies||0,stash:mini?.sparkStash||0,banked:mini?.sparkBanked||0,banks:mini?.sparkBanks||0,lost:mini?.sparkLost||0},forage:{lane:mini?.lane||0,streak:mini?.forageStreak||0,best:mini?.forageBestStreak||0,order:[...(mini?.forageOrder||[])],orderIndex:mini?.forageOrderIndex||0,ordersDone:mini?.forageOrdersDone||0,panic:Boolean((mini?.forageRushUntil||0)>now())},rush:{jumpY:mini?.jumpY||0,airJumps:mini?.rushAirJumps||0,streak:mini?.rushStreak||0,clears:mini?.rushClears||0,parcel:Boolean(mini?.rushParcel),parcelClears:mini?.rushParcelClears||0,deliveries:mini?.rushDeliveries||0},memory:{round:mini?.memoryRound||0,mode:mini?.memoryMode||null,lives:mini?.mode==="memory"?(mini?.lives||0):0,sequence:[...(mini?.memorySequence||[])],expected:mini?.mode==="memory"?memoryExpectedSequence():[]},glide:{y:mini?.glideY||0,v:mini?.glideV||0,wind:mini?.glideWind||0,hearts:mini?.mode==="glide"?(mini?.lives||0):0,streak:mini?.glideStreak||0,gates:mini?.glideGateCount||0,clears:mini?.glideClears||0,draft:mini?.glideDraft||0,thermals:mini?.glideThermals||0,thermal:Boolean((mini?.glideThermalUntil||0)>now())},breaker:{level:mini?.breakerLevel||0,hearts:mini?.mode==="breaker"?(mini?.lives||0):0,streak:mini?.breakerStreak||0,moves:mini?.breakerMoves||0,piercing:Boolean((mini?.breakerPierceUntil||0)>now()),cores:mini?.breakerCores||0,coresBroken:mini?.breakerCoresBroken||0,pattern:mini?.breakerPatternName||""},maze:{level:mini?.mazeLevel||0,lives:mini?.mode==="maze"?(mini?.lives||0):0,inputs:mini?.mazeInputs||0,pellets:mini?.mazePellets||0,combo:mini?.mazeCombo||0,bestCombo:mini?.mazeBestCombo||0,hunts:mini?.mazeHunts||0,tags:mini?.mazeHunterTags||0,hunting:Boolean((mini?.mazeHuntUntil||0)>now()),player:mini?.mazePlayer?{r:mini.mazePlayer.r,c:mini.mazePlayer.c,dir:mini.mazePlayer.dir,nextDir:mini.mazePlayer.nextDir}:null,favoriteDir:mini?.mazeFavoriteDir||null,hunters:(mini?.mazeHunters||[]).map(h=>({r:h.r,c:h.c,kind:h.kind}))}}),
    // Shared arcade-layer QA surface: interruption safety, pause state, end
    // reason and the canonical name table are all player-visible contracts.
    musicSceneForQA: () => ({scene:musicScene||null, requested:sceneMusicKey(), known:Boolean(MUSIC_TRACKS[sceneMusicKey()])}),
    arcadePauseForQA: () => openArcadePause(),
    arcadeResumeForQA: () => closeArcadePause(true),
    // A neutral probe job: proves remaining-delay banking without depending on
    // any one game's timing.
    arcadeProbeJobForQA: (delay=500) => {
      if(!mini?.active) return null;
      mini.qaProbe = {fired:false, count:0, id:null};
      mini.qaProbe.id = queueMiniTimeout(() => { mini.qaProbe.fired = true; mini.qaProbe.count += 1; }, delay);
      return mini.qaProbe.id;
    },
    arcadeProbeStateForQA: () => {
      const probe = mini?.qaProbe;
      const job = probe ? mini?.jobs?.get(probe.id) : null;
      return {fired:Boolean(probe?.fired), count:Number(probe?.count)||0,
              remaining: job ? Math.round(job.remaining) : -1, armed: Boolean(job?.timer)};
    },
    arcadeClearBreakerBoardForQA: () => {
      if(!mini?.active || mini.mode !== "breaker") return false;
      for(const item of mini.entities.filter(e => e.kind === "breaker-block")) item.node?.remove?.();
      mini.entities = mini.entities.filter(e => e.kind !== "breaker-block");
      return true;
    },
    arcadeGrantBuffsForQA: () => {
      if(!mini?.active) return false;
      const t = now();
      if(mini.mode === "breaker"){ mini.breakerBoostUntil = t + 5200; mini.breakerPierceUntil = t + 4200; }
      if(mini.mode === "glide"){ mini.glideThermalUntil = t + 4200; mini.glideInvulnerableUntil = t + 1250; }
      if(mini.mode === "maze"){ mini.mazeHuntUntil = t + 5000; mini.mazeInvulnerableUntil = t + 1500; }
      if(mini.mode === "spark"){ mini.sparkFeverUntil = t + 2700; }
      return true;
    },
    // A deadline that had already lapsed when the hold began must stay lapsed;
    // crediting it blindly would hand the player back a buff they had lost.
    arcadeExpiredDeadlineSurvivesForQA: () => {
      if(!mini?.active) return false;
      mini.glideInvulnerableUntil = now() - 400;
      const before = mini.glideInvulnerableUntil;
      arcadeFreeze("qa-expiry");
      arcadeThaw("qa-expiry");
      return mini.glideInvulnerableUntil === before && mini.glideInvulnerableUntil < now();
    },
    // Everything a held run could wrongly advance, in one comparable value.
    arcadeFingerprintForQA: () => {
      const round = value => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
      return JSON.stringify({
        score: round(mini?.score), hits: mini?.hits, lives: mini?.lives, endReason: mini?.endReason,
        entities: (mini?.entities || []).length,
        memory: {round: mini?.memoryRound, seq: (mini?.memorySequence || []).length, showing: mini?.memoryShowing, input: mini?.memoryInput},
        breaker: {level: mini?.breakerLevel, cores: mini?.breakerCores, bricks: mini?.breakerBricks, ball: round(mini?.breakerBall?.x)},
        glide: {y: round(mini?.glideY), v: round(mini?.glideV), gates: mini?.glideGateCount, clears: mini?.glideClears},
        maze: {level: mini?.mazeLevel, pellets: mini?.mazePellets, r: mini?.mazePlayer?.r, c: mini?.mazePlayer?.c},
        rush: {jumpY: round(mini?.jumpY), clears: mini?.rushClears},
        forage: {orders: mini?.forageOrdersDone, index: mini?.forageOrderIndex, streak: mini?.forageStreak},
        spark: {stash: mini?.sparkStash, banked: mini?.sparkBanked, streak: mini?.sparkStreak, type: mini?.sparkType},
        power: {call: mini?.powerCall, streak: mini?.powerStreak, heat: round(mini?.powerHeat), reads: mini?.powerCallsRead},
        walk: {distance: round(mini?.walkDistance), decision: mini?.walkDecisionIndex, finds: (mini?.walkChoices || []).length},
        rhythm: {ready: mini?.rhythmReady, index: mini?.rhythmChartIndex, streak: mini?.rhythmStreak, misses: mini?.rhythmMisses}
      });
    },
    arcadeJobsForQA: () => ({
      count: mini?.jobs?.size || 0,
      held: arcadeJobsHeld(),
      holds: Object.keys(mini?.jobHolds || {}).sort(),
      armed: [...(mini?.jobs?.values() || [])].filter(job => job.timer != null).length,
      pending: [...(mini?.jobs?.values() || [])].map(job => ({id: job.id, remaining: Math.round(job.remaining), repeat: Boolean(job.repeat)}))
    }),
    arcadeDeadlinesForQA: () => {
      const out = {};
      for(const key of arcadeDeadlineKeys()){
        const value = mini?.[key];
        if(typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = Math.round(value - now());
      }
      return out;
    },
    arcadeDeadlineKeysForQA: () => arcadeDeadlineKeys().sort(),
    arcadeAdvanceClockForQA: ms => {if(!mini?.active||!Number.isFinite(mini.endAt))return false;mini.endAt-=Math.max(0,Number(ms)||0);return true;},
    arcadeClockForQA: () => ({active:Boolean(mini?.active),mode:mini?.mode||null,endless:!Number.isFinite(mini?.endAt),
      remaining:Number.isFinite(mini?.endAt)?Math.max(0,mini.endAt-now()):Infinity,
      frozen:arcadeFrozen(),paused:Boolean(mini?.paused),sources:Object.keys(mini?.pauseSources||{}).sort(),
      jobsHeld:arcadeJobsHeld(),jobHolds:Object.keys(mini?.jobHolds||{}).sort()}),
    arcadeStateForQA: () => ({active:Boolean(mini?.active),mode:mini?.mode||null,score:Math.max(0,Math.floor(mini?.score||0)),
      lives:mini?.lives??null,maxLives:mini?.maxLives??null,endReason:mini?.endReason||"",paused:Boolean(mini?.paused),
      quitConfirmed:Boolean(mini?.quitConfirmed),rhythmReady:Boolean(mini?.rhythmReady)}),
    arcadeSetScoreForQA: value => {if(!mini?.active)return false;mini.score=Math.max(0,Number(value)||0);return true;},
    arcadeKillForQA: () => {if(!mini?.active)return false;mini.lives=0;mini.endReason="death";return true;},
    arcadeFreezeForQA: (source="background") => arcadeFreeze(source),
    arcadeThawForQA: (source="background") => arcadeThaw(source),
    suspendRuntimeForQA: (reason="background") => suspendRuntime(reason),
    resumeRuntimeForQA: (reason="visible") => resumeRuntime(reason),
    arcadeGamesForQA: () => JSON.parse(JSON.stringify(ARCADE_GAMES)),
    arcadeQualifyForQA: (mode=mini?.mode) => {if(!mini.active||mini.mode!==mode)return false;if(mode==="power"){mini.powerEngaged=true;mini.hits=Math.max(2,mini.hits||0);mini.score=Math.max(2,mini.score||0);}else if(mode==="spark"){mini.hits=Math.max(2,mini.hits||0);mini.sparkBanked=Math.max(2,mini.sparkBanked||0);mini.score=Math.max(2,mini.score||0);}else if(mode==="forage"){mini.playerInputs=Math.max(1,mini.playerInputs||0);mini.hits=Math.max(2,mini.hits||0);mini.score=Math.max(2,mini.score||0);}else if(mode==="rush"){mini.playerInputs=Math.max(1,mini.playerInputs||0);mini.rushClears=Math.max(2,mini.rushClears||0);mini.score=Math.max(2,mini.score||0);}else if(mode==="walk"){mini.playerInputs=Math.max(1,mini.playerInputs||0);mini.hits=Math.max(1,mini.hits||0);mini.score=Math.max(1,mini.score||0);}else if(mode==="rhythm"){mini.hits=Math.max(3,mini.hits||0);mini.score=Math.max(3,mini.score||0);}else if(mode==="memory"){mini.hits=Math.max(1,mini.hits||0);mini.score=Math.max(1,mini.score||0);}else if(mode==="glide"){mini.playerInputs=Math.max(1,mini.playerInputs||0);mini.glideClears=Math.max(1,mini.glideClears||0);mini.score=Math.max(3,mini.score||0);}else if(mode==="breaker"){mini.breakerMoves=Math.max(1,mini.breakerMoves||0);mini.score=Math.max(3,mini.score||0);}else if(mode==="maze"){mini.mazeInputs=Math.max(1,mini.mazeInputs||0);mini.score=Math.max(5,mini.score||0);}return arcadeRunQualified(mode,Math.max(0,Math.floor(mini.score||0)));},
    arcadePowerStrikeForQA: (tech=mini?.powerCall||"jab",needle=null) => {if(!mini.active||mini.mode!=="power")return null;mini.needle=needle===null?mini.powerZone:(Number.isFinite(Number(needle))?clamp(Number(needle),0,1):mini.needle);powerTap(String(tech||"jab"));return RizoRuntimeQA.arcadeSnapshotForQA().power},
    arcadeSparkCatchForQA: (type="normal",streak=null) => {if(!mini.active||mini.mode!=="spark")return null;if(streak!==null)mini.sparkStreak=Math.max(0,Math.floor(Number(streak)||0));moveSparkTarget(String(type||"normal"));catchSpark();return RizoRuntimeQA.arcadeSnapshotForQA().spark},
    arcadeSparkBankForQA: () => {if(!mini.active||mini.mode!=="spark")return null;bankSparkStash(false);return RizoRuntimeQA.arcadeSnapshotForQA().spark},
    arcadeForageCompleteOrderForQA: () => {if(!mini.active||mini.mode!=="forage")return null;mini.forageOrderIndex=Math.max(0,(mini.forageOrder||[]).length-1);advanceForageOrder();return RizoRuntimeQA.arcadeSnapshotForQA().forage},
    arcadeBreakerCollapseCoreForQA: () => {if(!mini.active||mini.mode!=="breaker")return null;const core=mini.entities.find(item=>item.kind==="breaker-block"&&item.special==="core"&&item.node?.isConnected);if(core){core.node.remove();mini.entities=mini.entities.filter(item=>item!==core);breakerCollapseCore(core);}return RizoRuntimeQA.arcadeSnapshotForQA().breaker},
    arcadeMemoryRoundForQA: round => {if(!mini.active||mini.mode!=="memory")return null;clearArcadeJobs();mini.memoryRound=Math.max(0,Math.floor(Number(round)||1)-1);mini.memorySequence=[];startMemoryRound();return RizoRuntimeQA.arcadeSnapshotForQA().memory;},
    arcadeMazeDirectionForQA: dir => {if(!mini.active||mini.mode!=="maze")return null;mazeSetDirection(String(dir||""));return RizoRuntimeQA.arcadeSnapshotForQA().maze;},
    defenseMapsForQA: () => ({best:Number(state.scores?.defense)||0,unlocked:defenseUnlockedMaps().map(map=>map.id),all:Object.values(DEFENSE_MAPS).map(map=>({id:map.id,unlockWave:map.unlockWave,level:map.level}))}),
    defenseRandomMapsForQA: (count=30) => Array.from({length:Math.max(1,Number(count)||1)},()=>chooseDefenseMapId()),
    defenseSetMapForQA: selection => { const map=DEFENSE_MAPS[selection]; if(!mini.defense||!map||mini.defense.towers.length||mini.defense.currentWave>0)return mini.defense?.mapId||null; mini.defense.mapId=map.id;mini.defense.map=map;mini.defense.pathMetrics=defensePathMetrics(map.path);mini.defense.lives=map.lives;mini.defense.cash=BASE_DEFENSE_STARTING_CASH;renderDefenseWorld();return map.id; },
    defenseSetPetVariantForQA: (variant,petId=null) => {const row=petId?defenseRoster().find(item=>item.pet.id===petId):defenseRoster()[0];if(!row||!VARIANTS.some(item=>item.id===variant))return false;row.pet.variant=String(variant);row.pet.hiddenVariant=null;markDefenseUi({roster:true});flushDefenseUi(true);return{petId:row.pet.id,variant:row.pet.variant};},
    defenseMapRoutesForQA: () => Object.fromEntries(DEFENSE_MAP_ORDER.map(id=>{const map=DEFENSE_MAPS[id],metrics=map.pathMetrics||defensePathMetrics(map.path);return[id,{name:map.name,routeType:map.routeType,strategy:map.strategy,anchors:map.route.map(point=>({...point})),points:map.path.map(point=>({...point})),length:metrics.total,segments:metrics.segments.length,blockedZones:(map.blockedZones||[]).map(zone=>({...zone})),landmarks:(map.landmarks||[]).map(item=>({...item})),buildPockets:(map.buildPockets||[]).map(item=>({...item})),mechanic:map.mechanic?{...map.mechanic}:null,mechanicZones:(map.mechanicZones||[]).map(item=>({...item}))}];})),
    defenseTowerCombatStatsForQA: (id=null) => {const d=mini.defense;if(!d)return[];return d.towers.filter(tower=>!id||tower.id===id).map(tower=>{const stats=defenseCombatStats(tower),bond=defenseMapBondForTower(tower,d);return{id:tower.id,mapId:d.mapId,mapBond:bond?{...bond}:null,damage:stats.damage,rate:stats.rate,range:stats.range,variant:stats.variant};});},
    defenseMapPointForQA: (mapId,progress) => {const map=DEFENSE_MAPS[mapId]||DEFENSE_MAPS.grove;return defenseMapPointAt(map,progress);},
    defenseMapSvgPathForQA: mapId => defenseMapSvgPath(DEFENSE_MAPS[mapId]||DEFENSE_MAPS.grove),
    defensePlacementGeometryForQA: () => {const g=defensePlacementGeometry();return{footprintPx:g.footprintPx,safetyPx:g.safetyPx,pathHalf:g.pathHalf,pathClearance:g.pathClearance,towerGap:g.towerGap,bounds:{...g.bounds},snap:g.snap,width:g.width,height:g.height};},
    defensePlacementEvaluationForQA: (x,y) => {const e=defensePlacementEvaluation(Number(x),Number(y));return{valid:e.valid,code:e.code,reason:e.reason,distance:e.distance??null,required:e.required??null,clearance:e.clearance??null};},
    defenseResolvePlacementForQA: (x,y,snapPx=DEFENSE_PLACEMENT_SNAP_PX) => {const r=resolveDefensePlacement(Number(x),Number(y),null,{snapPx:Number(snapPx)});return{point:{...r.point},raw:{...r.raw},valid:r.evaluation.valid,code:r.evaluation.code,reason:r.evaluation.reason,snapped:r.snapped,snapDistance:r.snapDistance,distance:r.evaluation.distance??null,required:r.evaluation.required??null};},
    defenseNearestPathForQA: (x,y) => {const p=nearestDefensePathPoint(Number(x),Number(y));return{x:p.x,y:p.y,distance:p.distance};},
    defenseDragStateForQA: () => mini.defenseDrag?{active:Boolean(mini.defenseDrag.active),scrolling:Boolean(mini.defenseDrag.scrolling),moved:Boolean(mini.defenseDrag.moved),result:mini.defenseDrag.result?{point:{...mini.defenseDrag.result.point},valid:mini.defenseDrag.result.evaluation.valid,snapped:mini.defenseDrag.result.snapped,code:mini.defenseDrag.result.evaluation.code}:null}:null,
    runtimeViewportForQA: () => runtimeViewportSnapshot(),
    syncRuntimeViewportForQA: () => syncRuntimeViewport(),
    suspendRuntimeForQA: reason => ({changed:suspendRuntime(reason||"qa-suspend"),suspendedAt:runtimeSuspendedAt,reason:runtimeSuspendReason}),
    resumeRuntimeForQA: reason => ({changed:resumeRuntime(reason||"qa-resume"),suspendedAt:runtimeSuspendedAt,reason:runtimeSuspendReason}),
    cancelDefenseInputForQA: reason => cancelDefenseTransientInput(reason||"qa-cancel"),
    releaseStatusForQA: () => releaseStatus(),
    activateReleaseUpdateForQA: () => activateReleaseUpdate(),
    injectReleaseUpdateForQA: () => {const messages=[];const waiting={postMessage:message=>messages.push(JSON.parse(JSON.stringify(message)))};const registration={waiting};announceReleaseUpdate(registration);return{messages,activate:()=>activateReleaseUpdate(),status:()=>releaseStatus()};},
    defensePlaceForQA: (petId,x=.2,y=.42) => { const row=defenseDeployRegistry().get(petId)||defenseRoster()[0]; if(!row)return false; placeDefenseTower(row,Number(x),Number(y),defenseDeployCost(row)); return mini.defense.towers.length; },
    defenseStartWaveForQA: () => { startDefenseWave(); return mini.defense?.wave||0; },
    defensePlanForQA: wave => { if(!mini.defense)return null; const prior=mini.defense.waveAnnouncement; const plan=defenseWavePlan(Math.max(1,Number(wave)||1)); const announcement=mini.defense.waveAnnouncement; mini.defense.waveAnnouncement=prior; return {wave:plan.wave,modifier:plan.modifier,total:plan.plannedEnemyCount,estimatedDuration:plan.estimatedDuration,formationTier:plan.formationTier||0,pressureTags:[...(plan.pressureTags||[])],packets:plan.packets.map(packet=>({spawnGap:packet.spawnGap,breakAfter:packet.breakAfter,enemies:packet.enemies.map(item=>typeof item==="string"?item:{...item})})),announcement}; },
    defenseSetWaveForQA: wave => { if(mini.defense)mini.defense.wave=Math.max(0,Number(wave)||0); return mini.defense?.wave||0; },
    defenseSpawnBossForQA: id => { if(!mini.defense)return false; const boss=DEFENSE_BOSSES.find(item=>item.id===id)||DEFENSE_BOSSES[0]; spawnDefenseEnemy({type:"boss",bossId:boss.id,intensity:0}); return mini.defense.enemies.at(-1)?.bossId||null; },
    defenseSetEnemyHealthForQA: ratio => { const enemy=mini.defense?.enemies.at(-1); if(!enemy)return false; enemy.hp=Math.max(1,enemy.maxHp*clamp(Number(ratio)||0,0,1)); return enemy.hp; },
    defenseSetEnemyHealthByIdForQA: (enemyId,ratio) => {const enemy=mini.defense?.enemies.find(item=>item.id===enemyId);if(!enemy)return false;enemy.hp=Math.max(1,enemy.maxHp*clamp(Number(ratio)||0,0,1));return enemy.hp;},
    defenseTickForQA: seconds => { if(!mini.defense)return false; const real=Math.max(0,Number(seconds)||0);updateDefenseGame(real*(mini.defense.speed||1),real); return defenseNow(); },
    defenseRecordFrameForQA: ms => {const d=mini.defense;if(!d)return null;defenseRecordFramePerformance(Number(ms)||16.7);defenseApplyRenderTier(d);return{frameP95:d.frameP95,frameP99:d.frameP99,governorTier:d.governorTier,renderTier:d.renderTier,performanceLow:Boolean(d.performanceLow),densityCap:defenseDensityCap(d,d.spawnQueue[0]),visualBudget:defenseVisualBudget(d)};},
    defenseRapidFireForQA: count => {const d=mini.defense,tower=d?.towers[0];if(!d||!tower)return null;let target=d.enemies.find(enemy=>!enemy.dead&&enemy.hp>0);if(!target){let nearest={progress:.2,distance:Infinity};for(let i=0;i<=200;i+=1){const progress=i/200,point=defensePointAt(progress),distance=Math.hypot(point.x-tower.x,point.y-tower.y);if(distance<nearest.distance)nearest={progress,distance};}target=spawnDefenseEnemy("shell",{progress:nearest.progress,hpOverride:1e9,maxHpOverride:1e9});}const stats=defenseCombatStats(tower),shots=clamp(Math.floor(Number(count)||24),1,120);for(let i=0;i<shots;i+=1)fireDefenseTower(tower,target,stats);return{requested:shots,logical:d.projectiles.length,visible:defenseVisibleProjectileCount(d),coalescedVisual:d.coalescedVisualShots||0,coalescedLogical:d.coalescedLogicalShots||0,budget:defenseVisualBudget(d)};},
    defenseTryCompleteWaveForQA: () => {const d=mini.defense;if(!d)return null;const completed=completeDefenseWave();return{completed,currentWave:d.currentWave,clearedWave:d.clearedWave,spawnQueue:d.spawnQueue.length,childSpawnQueue:d.childSpawnQueue.length,enemies:d.enemies.length,projectiles:d.projectiles.length};},
    defenseResidueResolutionForQA: () => {const d=mini.defense;if(!d)return null;d.currentWave=Math.max(1,d.currentWave||1);d.clearedWave=Math.min(d.clearedWave,d.currentWave-1);defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});d.spawnQueue=[];d.wavePackets=[];d.packetIndex=0;d.packetEnemyIndex=0;d.childSpawnQueue=[];for(const enemy of d.enemies)releaseDefenseEnemyNode(enemy);d.enemies=[];d.waveResolved=Math.max(d.waveResolved||0,d.waveTotal||0);d.projectiles.push({id:"qa-stale-shot",node:null,life:99});const before=d.projectiles.length,resolved=isWaveFullyResolved(d),completed=completeDefenseWave();return{before,resolved,completed,after:d.projectiles.length,phase:d.phase,clearedWave:d.clearedWave};},
    defenseGateFlameForQA: progress => {const d=mini.defense;if(!d)return null;defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});d.gateFlameArmed=false;d.gateFlameProgress=clamp(Number(progress)||.5,0,1);d.gateFlameUntil=d.clock+DEFENSE_GATE_FLAME_DURATION;d.gateFlameReadyAt=d.clock+DEFENSE_GATE_FLAME_COOLDOWN;d.gateFlameNextTick=d.clock;updateDefenseGateFlame();markDefenseUi();flushDefenseUi(true);return RizoRuntimeQA.defenseSnapshotForQA().gateFlame;},
    defenseQueueChildForQA: (type="fleet",delay=.08) => {const d=mini.defense;if(!d)return null;const queued=queueDefenseChildSpawn(String(type||"fleet"),{progress:.45,delay:Number(delay)||0});return{queued,childSpawnQueue:d.childSpawnQueue.length};},
    defensePendingIncomeForQA: amount => {const d=mini.defense;if(!d)return null;queueDefenseIncome(Number(amount)||0,"qa");return{cash:d.cash,pendingIncome:d.pendingIncome};},
    defenseSetLowPerformanceForQA: low => {const d=mini.defense;if(!d)return null;d.performanceLow=Boolean(low);defenseApplyRenderTier(d,d.performanceLow?2:0);return{performanceLow:d.performanceLow,renderTier:d.renderTier,densityCap:defenseDensityCap(d,d.spawnQueue[0]),budget:defensePerformanceBudget(d)};},
    defenseCompleteWaveForQA: wave => { const d=mini.defense;if(!d)return false;d.currentWave=DefenseCore.clampInteger(wave,1,DEFENSE_LIMITS.MAX_SUPPORTED_WAVE,1);d.clearedWave=Math.min(d.clearedWave,d.currentWave-1);defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});d.spawnQueue=[];d.wavePackets=[];d.packetIndex=0;d.packetEnemyIndex=0;d.childSpawnQueue=[];d.enemies.forEach(enemy=>releaseDefenseEnemyNode(enemy));d.enemies=[];d.projectiles.forEach(shot=>releaseDefenseProjectileNode(shot));d.projectiles=[];d.waveResolved=Math.max(d.waveResolved||0,d.waveTotal||0);const completed=completeDefenseWave();return{completed,currentWave:d.currentWave,clearedWave:d.clearedWave,milestones:[...(state.scores.defenseMilestones||[])]}; },
    defenseSetSpeedForQA: speed => { if(!mini.defense)return false; mini.defense.speed=[.5,1,2].includes(Number(speed))?Number(speed):1; defenseApplyRenderTier(mini.defense);updateDefenseHud(); return mini.defense.speed; },
    defenseSetEnemiesForQA: (progress=.35) => { if(!mini.defense)return 0; for(const enemy of mini.defense.enemies){enemy.progress=clamp(Number(progress)||0,0,.98);const point=defensePointAt(enemy.progress);enemy.x=point.x;enemy.y=point.y;enemy.prevX=point.x;enemy.prevY=point.y;updateDefenseEnemyNode(enemy,true);} return mini.defense.enemies.length; },
    defenseArrangeEnemiesForQA: () => { if(!mini.defense)return 0; mini.defense.enemies.forEach((enemy,index)=>{enemy.progress=clamp(.11+index*.095,0,.9);const point=defensePointAt(enemy.progress);enemy.x=point.x;enemy.y=point.y;enemy.prevX=point.x;enemy.prevY=point.y;updateDefenseEnemyNode(enemy,true);}); return mini.defense.enemies.length; },
    defensePlaceNextForQA: petId => { const row=defenseDeployRegistry().get(petId)||defenseRoster()[0]; if(!row)return false; for(let y=.14;y<=.74;y+=.08)for(let x=.11;x<=.89;x+=.08){if(isValidDefensePlacement(x,y)){placeDefenseTower(row,x,y,defenseDeployCost(row));return mini.defense.towers.length;}} return mini.defense.towers.length; },
    defenseAbilityForQA: id => { const tower=mini.defense?.towers.find(item=>item.id===id)||mini.defense?.towers[0]; if(!tower)return false; tower.upgrade=Math.max(tower.upgrade,2); tower.abilityReadyAt=0; refreshDefenseTower(tower); activateDefenseAbility(tower.id); return {id:tower.id,variant:tower.pet.variant||tower.pet.hiddenVariant,readyAt:tower.abilityReadyAt}; },
    defenseUpgradeForQA: level => { const tower=mini.defense?.towers[0]; if(!tower)return false; tower.upgrade=clamp(Math.floor(Number(level)||0)-1,0,4); refreshDefenseTower(tower); const aura=tower.node?.querySelector(".defense-aura"); return {upgrade:tower.upgrade,tier:defenseTowerTier(tower),className:tower.node?.className||"",silhouette:tower.node?.style.getPropertyValue("--tower-silhouette")||"",auraDisplay:aura?getComputedStyle(aura).display:null,auraMask:aura?getComputedStyle(aura).webkitMaskImage||getComputedStyle(aura).maskImage:null}; },
    defenseTargetForQA: mode => { const tower=mini.defense?.towers[0]; if(!tower||!DEFENSE_TARGET_MODES.includes(mode))return false;tower.targetMode=mode;tower.targetId=null;tower.retargetAtReal=0;return tower.targetMode; },
    defenseDoctrineForQA: doctrine => { const tower=mini.defense?.towers[0];if(!tower)return false;tower.upgrade=Math.max(2,tower.upgrade);tower.doctrine=null;const accepted=chooseDefenseDoctrine(tower.id,doctrine);return {accepted,doctrine:tower.doctrine,stats:defenseCombatStats(tower),className:tower.node?.className||""}; },
    defensePauseForQA: paused => { toggleDefensePause(Boolean(paused));return mini.defense?.paused||false; },
    defenseInterruptionForQA: () => { const paused=pauseDefenseForInterruption();return {paused,autoPaused:Boolean(mini.defense?.autoPaused),clock:defenseNow()}; },
    defenseResumeSurfaceForQA: () => { const surfaced=surfaceDefenseInterruptionPause();return {surfaced,paused:Boolean(mini.defense?.paused),autoPaused:Boolean(mini.defense?.autoPaused)}; },
    defenseSpawnForQA: (type="puff",progress=.25,hp=null,maxHp=null) => { if(!mini.defense)return false;const options={progress:clamp(Number(progress)||0,0,.98)};if(Number.isFinite(Number(hp)))options.hpOverride=Number(hp);if(Number.isFinite(Number(maxHp)))options.maxHpOverride=Number(maxHp);const enemy=spawnDefenseEnemy(type,options);return {id:enemy.id,type:enemy.type,hp:enemy.hp,maxHp:enemy.maxHp}; },
    defensePopEnemyForQA: enemyId => {const enemy=mini.defense?.enemies.find(item=>item.id===enemyId);if(!enemy)return false;popDefenseEnemy(enemy,null);return true;},
    defenseShredEnemyForQA: (enemyId,amount=.05) => {const enemy=mini.defense?.enemies.find(item=>item.id===enemyId);if(!enemy)return false;return shredDefenseArmor(enemy,Number(amount)||.05,null);},
    defensePulseMenderForQA: enemyId => {const enemy=mini.defense?.enemies.find(item=>item.id===enemyId);if(!enemy)return false;enemy.supportCycle=-999;return pulseDefenseMender(enemy,defenseNow());},
    defenseNearestProgressForQA: () => { const tower=mini.defense?.towers[0];if(!tower)return null;let best={progress:0,distance:Infinity};for(let i=0;i<=200;i+=1){const progress=i/200,point=defensePointAt(progress),distance=Math.hypot(point.x-tower.x,point.y-tower.y);if(distance<best.distance)best={progress,distance};}return best; },
    defenseStrongTargetForQA: () => { const tower=mini.defense?.towers[0];if(!tower)return null;const stats=defenseCombatStats(tower),enemy=pickDefenseTarget(tower,stats);return enemy?{id:enemy.id,type:enemy.type,hp:enemy.hp,maxHp:enemy.maxHp,threat:defenseEnemyThreat(enemy)}:null; },
    defenseDamageCreditForQA: (raw=50,hp=3) => { const d=mini.defense,tower=d?.towers[0];if(!d||!tower)return false;const enemy=spawnDefenseEnemy("puff",{progress:.2,hpOverride:Number(hp)||3,maxHpOverride:Number(hp)||3}),before={damage:tower.damage,kills:tower.kills};const dealt=dealDefenseDamage(enemy,Number(raw)||50,tower,"classic");return {dealt,before,after:{damage:tower.damage,kills:tower.kills},enemyDead:enemy.dead}; },
    defenseDoctrineShotForQA: (doctrine,options={}) => { const d=mini.defense,tower=d?.towers[0];if(!d||!tower||!DEFENSE_DOCTRINES[doctrine])return false;tower.upgrade=options.apex?4:3;tower.doctrine=doctrine;tower.shots=defenseIsUniversalTower(tower)?(doctrine==="control"?(tower.upgrade>=4?3:4):(tower.upgrade>=4?2:3)):4;refreshDefenseTower(tower);const nearest=(()=>{let best={progress:0,distance:Infinity};for(let i=0;i<=200;i+=1){const progress=i/200,point=defensePointAt(progress),distance=Math.hypot(point.x-tower.x,point.y-tower.y);if(distance<best.distance)best={progress,distance};}return best;})(),enemy=spawnDefenseEnemy(options.type||"shell",{progress:nearest.progress,hpOverride:options.hp||100,maxHpOverride:options.maxHp||options.hp||100});if(options.restrained){enemy.slow=.45;enemy.slowUntil=defenseNow()+10;}if(options.opened){enemy.armorShredded=true;enemy.armor=Math.max(0,(enemy.baseArmor||0)-.08);}const neighbors=[];for(let i=0;i<Math.max(0,Math.min(4,Number(options.neighbors)||0));i+=1){const neighborType=Array.isArray(options.neighborTypes)&&options.neighborTypes[i]?options.neighborTypes[i]:(options.neighborType||"shell"),near=spawnDefenseEnemy(neighborType,{progress:clamp(nearest.progress-(i+1)*.012,0,.98),hpOverride:100,maxHpOverride:100});neighbors.push(near.id);}fireDefenseTower(tower,enemy,defenseCombatStats(tower));const shot=d.projectiles.at(-1);return {doctrine:tower.doctrine,targetId:enemy.id,neighborIds:neighbors,shotClass:shot?.node?.className||"",strike:shot?.doctrineStrike||null,doubleStitch:Boolean(shot?.doubleStitch),shots:tower.shots,masteryTier:shot?.masteryTier||0,towerClass:tower.node?.className||""}; },
    defenseCrownGuardsForQA: () => { const d=mini.defense;if(!d)return false;defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});const enemy=spawnDefenseEnemy({type:"boss",bossId:"crown",intensity:0},{progress:.4});const before=d.waveTotal;enemy.hp=enemy.maxHp*.49;handleDefenseBossMechanics(enemy);d.clock=Math.max(d.clock,enemy.telegraphUntil+.01);handleDefenseBossMechanics(enemy);return {before,after:d.waveTotal,guards:d.enemies.filter(item=>item.type==="shell").length}; },
    defenseDotCreditForQA: kind => { const d=mini.defense,tower=d?.towers[0];if(!d||!tower)return false;const enemy=spawnDefenseEnemy("puff",{progress:.2,hpOverride:2,maxHpOverride:2});updateDefenseEnemyNode(enemy);if(kind==="burn"){enemy.burn=4;enemy.burnUntil=defenseNow()+2;enemy.burnSource=tower;}else{enemy.poison=4;enemy.poisonUntil=defenseNow()+2;enemy.poisonSource=tower;}const before={damage:tower.damage,kills:tower.kills};updateDefenseEnemies(1);return {before,after:{damage:tower.damage,kills:tower.kills},enemyDead:enemy.dead}; },
    defenseForceWaveForQA: wave => { const d=mini.defense;if(!d)return false;d.currentWave=Math.max(0,(Number(wave)||1)-1);d.clearedWave=Math.min(d.clearedWave,d.currentWave);d.nextWaveReadyAtReal=0;d.autoStartAtReal=0;defenseSetPhase(d,DEFENSE_PHASES.PLANNING,{force:true});startDefenseWave();return{currentWave:d.currentWave,clearedWave:d.clearedWave,total:d.waveTotal,announcement:d.waveAnnouncement}; },
    defenseSetCashForQA: cash => { if(mini.defense)mini.defense.cash=Math.max(0,Number(cash)||0); updateDefenseHud(); return mini.defense?.cash||0; },
    defenseToggleIntelForQA: force => {toggleDefenseIntel(typeof force==="boolean"?force:undefined);return{open:Boolean(mini.defense?.intelOpen),paused:Boolean(mini.defense?.paused),trayHidden:$("#defenseIntelTray")?.hidden??true};},
    defenseIntelForQA: () => {const counts=defenseIntelCounts(),readiness=defenseCounterReadiness(counts);return{open:Boolean(mini.defense?.intelOpen),types:Object.fromEntries(counts),missing:[...readiness.missing],text:$("#defenseIntelTray")?.textContent||"",renderCount:mini.defense?.intelRenderCount||0};},
    defenseEnemyStateForQA: id => {const enemy=id?mini.defense?.enemies.find(item=>item.id===id):mini.defense?.enemies.at(-1);return enemy?{id:enemy.id,type:enemy.type,bossId:enemy.bossId||null,hp:enemy.hp,maxHp:enemy.maxHp,reward:enemy.reward,armor:enemy.armor,baseArmor:enemy.baseArmor,armorBroken:Boolean(enemy.armorBroken),armorShredded:Boolean(enemy.armorShredded),camoActive:defenseEnemyCamoActive(enemy),phaseActive:Boolean(enemy.phaseActive),phaseSuppressedUntil:enemy.phaseSuppressedUntil,revealUntil:enemy.revealUntil,visualSignature:enemy.visualSignature||"",className:enemy.node?.className||"",transform:enemy.node?getComputedStyle(enemy.node).transform:"",size:enemy.node?{width:enemy.node.getBoundingClientRect().width,height:enemy.node.getBoundingClientRect().height}:null}:null;},
    defenseSetEnemyStatusForQA: (id,status={}) => {const enemy=mini.defense?.enemies.find(item=>item.id===id);if(!enemy)return false;const time=defenseNow();if(status.reset){enemy.burnUntil=0;enemy.poisonUntil=0;enemy.slowUntil=0;enemy.rootUntil=0;enemy.armorBroken=false;enemy.armorShredded=false;enemy.armor=enemy.baseArmor;enemy.revealUntil=0;enemy.phaseSuppressedUntil=0;}if(status.burn)enemy.burnUntil=time+Number(status.burn);if(status.poison)enemy.poisonUntil=time+Number(status.poison);if(status.slow)enemy.slowUntil=time+Number(status.slow);if(status.root)enemy.rootUntil=time+Number(status.root);if(status.armorBroken){enemy.armorBroken=true;enemy.armor=0;}if(status.armorShredded)enemy.armorShredded=true;if(status.reveal)enemy.revealUntil=time+Number(status.reveal);updateDefenseEnemyNode(enemy,true);return RizoRuntimeQA.defenseEnemyStateForQA(id);},
    defenseWarmPoolsForQA: () => {warmDefensePools();return RizoRuntimeQA.defenseSnapshotForQA().poolStats;},
    defenseRenderTierForQA: () => ({tier:defenseRenderTier(),applied:defenseApplyRenderTier(mini.defense),densityCap:defenseDensityCap(mini.defense,mini.defense?.spawnQueue?.[0])}),
    defenseLoadQueueForQA: (count=60,type="shell",wave=30,speed=2) => {const d=mini.defense;if(!d)return false;d.currentWave=Math.max(1,Math.floor(Number(wave)||30));d.clearedWave=Math.min(d.clearedWave,d.currentWave-1);d.speed=[.5,1,2].includes(Number(speed))?Number(speed):2;defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});const total=Math.min(DEFENSE_LIMITS.MAX_QUEUE_ENTRIES,Math.max(1,Math.floor(Number(count)||60)));d.wavePackets=[{enemies:Array.from({length:total},()=>String(type||"shell")),spawnGap:.5,breakAfter:0}];d.packetIndex=0;d.packetEnemyIndex=0;d.spawnQueue=DefenseCore.flattenPackets(d.wavePackets);d.currentWavePlan=[...d.spawnQueue];d.childSpawnQueue=[];d.nextChildReleaseAtReal=defenseRealNow(d);d.childSpawnSequence=0;d.targetSnapshot=[];d.targetSnapshotAtReal=0;d.waveTotal=d.spawnQueue.length;d.waveResolved=0;d.nextSpawnAt=d.clock;d.lastSpawnedEnemyId=null;d.peakAlive=d.enemies.length;return{count:d.spawnQueue.length,currentWave:d.currentWave,clearedWave:d.clearedWave,speed:d.speed,cap:defenseDensityCap(d,d.spawnQueue[0])};},
    defenseClearQueueForQA: () => {const d=mini.defense;if(!d)return false;d.spawnQueue=[];d.wavePackets=[];d.packetIndex=0;d.packetEnemyIndex=0;d.childSpawnQueue=[];d.currentWavePlan=[];d.lastSpawnedEnemyId=null;d.nextSpawnAt=Number.POSITIVE_INFINITY;return true;},
    defenseDamageEnemyForQA: (id,raw=10,variant=null,doctrine=null) => {const d=mini.defense,enemy=id?d?.enemies.find(item=>item.id===id):d?.enemies.at(-1),tower=d?.towers[0];if(!enemy||!tower)return false;const priorVariant=tower.pet.variant,priorHidden=tower.pet.hiddenVariant,priorDoctrine=tower.doctrine;if(variant)tower.pet.variant=variant;if(doctrine)tower.doctrine=doctrine;const dealt=dealDefenseDamage(enemy,Number(raw)||10,tower,variant||"classic");tower.pet.variant=priorVariant;tower.pet.hiddenVariant=priorHidden;tower.doctrine=priorDoctrine;return{dealt,state:{hp:enemy.hp,armor:enemy.armor,armorBroken:Boolean(enemy.armorBroken),className:enemy.node?.className||""}};},
    defenseApplyCounterForQA: (id,kind) => {const d=mini.defense,enemy=id?d?.enemies.find(item=>item.id===id):d?.enemies.at(-1),tower=d?.towers[0];if(!enemy||!tower)return false;if(kind==="power")shredDefenseArmor(enemy,.08,tower);else revealDefenseEnemy(enemy,4,tower);return{armor:enemy.armor,camoActive:defenseEnemyCamoActive(enemy),phaseSuppressedUntil:enemy.phaseSuppressedUntil,className:enemy.node?.className||""};},
    defenseForceWeatherForQA: weather => {const d=mini.defense;if(!d)return false;d.map={...d.map,weather:String(weather||d.map.weather)};defenseSetPhase(d,DEFENSE_PHASES.COMBAT,{force:true});d.nextWeatherAt=d.clock;updateDefenseWeather();d.enemies.forEach(updateDefenseEnemyNode);return{weather:d.map.weather,ashUntil:d.ashUntil,moonRevealUntil:d.moonRevealUntil,eclipseUntil:d.eclipseUntil,clock:d.clock};},
    defenseLeakForQA: (type="puff",damage=1) => {const d=mini.defense;if(!d)return false;const enemy=spawnDefenseEnemy(type,{progress:.999});enemy.damage=Math.max(1,Number(damage)||1);const before=d.lives;updateDefenseEnemies(1);return{before,after:d.lives,stats:JSON.parse(JSON.stringify(d.enemyStats))};},
    defenseAnalyticsForQA: () => mini.defense?JSON.parse(JSON.stringify(mini.defense.enemyStats)):null,
    defenseFinishForQA: () => {if(!mini.active||mini.mode!=="defense")return false;finishMiniGame(false);return Boolean(document.querySelector(".defense-run-recap"));},
    defenseSyncGeometryForQA: () => {const before=mini.defense?.towers.map(t=>({id:t.id,width:t.node?.style.getPropertyValue("--tower-range-width")||"",height:t.node?.style.getPropertyValue("--tower-range-height")||""}))||[];syncDefenseTowerGeometry();const after=mini.defense?.towers.map(t=>({id:t.id,width:t.node?.style.getPropertyValue("--tower-range-width")||"",height:t.node?.style.getPropertyValue("--tower-range-height")||""}))||[];return{before,after};},
    defenseCinematicForQA: () => {const d=mini.defense,host=$("#defenseMoment"),shell=$(".defense-shell"),stage=$(".defense-stage-frame");return d?{kind:d.cinematicMomentKind||null,count:d.cinematicMomentCount||0,priority:d.cinematicMomentPriority||0,untilReal:d.cinematicMomentUntilReal||0,hidden:host?.hidden??true,className:host?.className||"",text:(host?.textContent||"").replace(/\s+/g," ").trim(),shellMoment:shell?.dataset.cinematicMoment||null,stagePulse:Boolean(stage?.classList.contains("moment-pulse")),ending:Boolean(d.ending),endingReason:d.endingReason||null,reducedMotion:defenseReducedMotion()}:null;},
    defenseMomentForQA: (kind="clear",options={}) => showDefenseCinematicMoment(String(kind||"clear"),options||{}),
    defenseEndRunForQA: (reason="banked") => finishDefenseRunWithMoment(reason==="gate"?"gate":"banked"),
    defenseArtCohesionForQA: () => {const world=$("#defenseWorld"),style=world?getComputedStyle(world):null;return world?{mapId:mini.defense?.mapId||null,featureCount:world.querySelectorAll(".defense-world-feature").length,featureKinds:[...world.querySelectorAll(".defense-world-feature")].map(node=>node.dataset.worldFeature),buildPocketCount:world.querySelectorAll(".defense-build-pocket").length,unitScale:world.style.getPropertyValue("--def-unit-scale"),playOutline:style?.getPropertyValue("--play-outline").trim()||"",playHalo:style?.getPropertyValue("--play-halo").trim()||"",roadFill:style?.getPropertyValue("--road-fill").trim()||"",visibleLandmarkLabels:[...world.querySelectorAll(".defense-landmark span,.defense-entrance span,.defense-gate b")].filter(node=>getComputedStyle(node).display!=="none").length}:null;},
    defenseSnapshotForQA: () => mini.defense?{map:mini.defense.mapId,currentWave:mini.defense.currentWave,clearedWave:mini.defense.clearedWave,reachedWave:mini.defense.currentWave,contract:mini.defense.contract?{...mini.defense.contract}:null,maxTowers:mini.defense.maxTowers,wave:mini.defense.wave,lives:mini.defense.lives,cash:mini.defense.cash,worldPerkUsed:Boolean(mini.defense.worldPerkUsed),phase:mini.defense.phase,paused:Boolean(mini.defense.paused),autoPaused:Boolean(mini.defense.autoPaused),waveTotal:mini.defense.waveTotal,waveResolved:mini.defense.waveResolved,lowFx:Boolean(mini.defense.lowFx),performanceLow:Boolean(mini.defense.performanceLow),frameMs:Number(mini.defense.frameMs||0),frameP95:Number(mini.defense.frameP95||0),frameP99:Number(mini.defense.frameP99||0),frameStress:Number(mini.defense.frameStress||0),governorTier:mini.defense.governorTier||0,simStepP95:Number(mini.defense.simStepP95||0),simStepWorst:Number(mini.defense.simStepWorst||0),simBacklogEvents:mini.defense.simBacklogEvents||0,maxCatchUpObserved:mini.defense.maxCatchUpObserved||0,lastSimSteps:mini.defense.lastSimSteps||0,simAccumulator:Number(mini.defense.simAccumulator||0),presentationFrames:mini.defense.presentationFrames||0,rendererMode:mini.defense.rendererMode||"dom",canvasFrames:mini.defense.canvasFrames||0,canvasFallbacks:mini.defense.canvasFallbacks||0,canvasRenderer:mini.defense.canvasRenderer?.snapshot?.()||null,renderTier:mini.defense.renderTier||0,potatoFx:Boolean(mini.defense.potatoFx),renderTierChanges:mini.defense.renderTierChanges||0,densityCap:defenseDensityCap(mini.defense,mini.defense.spawnQueue[0]),poolStats:{enemy:mini.defense.enemyNodePool.length,projectile:mini.defense.projectileNodePool.length,impact:mini.defense.impactNodePool.length,enemyCreated:mini.defense.enemyNodesCreated||0,enemyAcquired:mini.defense.enemyNodesAcquired||0,projectileCreated:mini.defense.projectileNodesCreated||0,projectileAcquired:mini.defense.projectileNodesAcquired||0,impactCreated:mini.defense.impactNodesCreated||0,impactAcquired:mini.defense.impactNodesAcquired||0},visualWrites:{enemyPosition:mini.defense.enemyPositionWrites||0,enemyClass:mini.defense.enemyClassWrites||0,enemyHealth:mini.defense.enemyHealthWrites||0,enemyState:mini.defense.enemyStateWrites||0,projectilePosition:mini.defense.projectilePositionWrites||0},peakAlive:mini.defense.peakAlive||0,spawnWaitReason:mini.defense.spawnWaitReason||"",lastSpawnedEnemyId:mini.defense.lastSpawnedEnemyId||null,ashUntil:mini.defense.ashUntil,moonRevealUntil:mini.defense.moonRevealUntil,intelOpen:Boolean(mini.defense.intelOpen),enemyStats:JSON.parse(JSON.stringify(mini.defense.enemyStats||{})),hudRenderCount:mini.defense.hudRenderCount||0,rosterRenderCount:mini.defense.rosterRenderCount||0,trayRenderCount:mini.defense.trayRenderCount||0,intelRenderCount:mini.defense.intelRenderCount||0,checkpointWrites:mini.defense.checkpointWrites||0,pendingIncome:mini.defense.pendingIncome||0,pendingIncomeEvents:mini.defense.pendingIncomeEvents||0,lastIncomeBatch:mini.defense.lastIncomeBatch?JSON.parse(JSON.stringify(mini.defense.lastIncomeBatch)):null,cashWriteCount:mini.defense.cashWriteCount||0,targetScans:mini.defense.targetScans||0,targetSnapshotBuilds:mini.defense.targetSnapshotBuilds||0,realClock:defenseRealNow(mini.defense),simulationClock:mini.defense.clock||0,visualBudget:defenseVisualBudget(mini.defense),childSpawnsReleased:mini.defense.childSpawnsReleased||0,nextChildReleaseAtReal:mini.defense.nextChildReleaseAtReal||0,maxActiveEnemiesObserved:mini.defense.maxActiveEnemiesObserved||0,maxProjectileNodesObserved:mini.defense.maxProjectileNodesObserved||0,maxLogicalProjectilesObserved:mini.defense.maxLogicalProjectilesObserved||0,visibleProjectileCount:defenseVisibleProjectileCount(mini.defense),coalescedVisualShots:mini.defense.coalescedVisualShots||0,coalescedLogicalShots:mini.defense.coalescedLogicalShots||0,droppedCosmetics:mini.defense.droppedCosmetics||0,maxEffectNodesObserved:mini.defense.maxEffectNodesObserved||0,childSpawnQueue:mini.defense.childSpawnQueue.length,packetIndex:mini.defense.packetIndex,packetCount:mini.defense.wavePackets.length,lastInputCancelReason:mini.defense.lastInputCancelReason||null,frameDiscontinuities:mini.defense.frameDiscontinuities||0,cinematicMomentKind:mini.defense.cinematicMomentKind||null,cinematicMomentCount:mini.defense.cinematicMomentCount||0,gateFlame:{armed:Boolean(mini.defense.gateFlameArmed),readyAt:mini.defense.gateFlameReadyAt||0,until:mini.defense.gateFlameUntil||0,progress:mini.defense.gateFlameProgress||0,ticks:mini.defense.gateFlameTicks||0},ending:Boolean(mini.defense.ending),endingReason:mini.defense.endingReason||null,projectiles:mini.defense.projectiles.map(shot=>({id:shot.id,towerId:shot.tower?.id||null,targetId:shot.target?.id||null,x:shot.x,y:shot.y,life:shot.life,speed:shot.speed,damage:shot.damage,kind:shot.kind,doctrineStrike:shot.doctrineStrike||null,doubleStitch:Boolean(shot.doubleStitch)})),towers:mini.defense.towers.map(t=>({id:t.id,petId:t.petId,variant:t.pet.variant||t.pet.hiddenVariant,copy:t.copyNumber,x:t.x,y:t.y,upgrade:t.upgrade,cost:t.cost,spent:t.spent,openingPerkApplied:Boolean(t.openingPerkApplied),placedAtReal:t.placedAtReal,kills:t.kills,damage:t.damage,shots:t.shots,targetMode:t.targetMode,doctrine:t.doctrine,superForm:t.superForm||null,structureType:defenseStructureType(t),totalProduced:t.totalProduced||0,beaconBuffed:Boolean(t.beaconSourceId),readyAt:t.abilityReadyAt,nextUpgradeCost:defenseUpgradeCost(t,mini.defense),sellRefund:defenseSellRefund(t,mini.defense),canUndo:defenseCanUndoPlacement(t,mini.defense),mapBond:defenseMapBondForTower(t,mini.defense)?.label||null})),enemies:mini.defense.enemies.map(e=>({id:e.id,type:e.type,bossId:e.bossId||null,camo:Boolean(e.camo),camoActive:defenseEnemyCamoActive(e),hp:e.hp,maxHp:e.maxHp,armor:e.armor,baseArmor:e.baseArmor,armorBroken:Boolean(e.armorBroken),armorShredded:Boolean(e.armorShredded),progress:e.progress,phaseActive:Boolean(e.phaseActive),phaseSuppressedUntil:e.phaseSuppressedUntil,revealUntil:e.revealUntil,slow:e.slow,burn:e.burn,poison:e.poison,rootUntil:e.rootUntil,signalStaggerUntil:e.signalStaggerUntil||0,bossPhase:e.bossPhase||0,telegraphKind:e.telegraphKind||null,telegraphDisruption:e.telegraphDisruption||0,apexSurgeUntil:e.apexSurgeUntil||0,className:e.node?.className||""}))}:null,
    keeperCodeForQA: () => keeperRecoveryCode(),
    preRecoveryForQA: () => {const recovered=readPreRecoveryBackup();return recovered?{name:recovered.pet?.name||null,embers:recovered.wallet?.embers||0,version:recovered.version}:null;},
    rushSnapshotForQA: () => ({hits:mini.hits,jumpY:mini.jumpY,entities:mini.entities.filter(e=>e.kind==="rush").map(e=>({type:e.type,x:e.x,speed:e.speed,handled:e.handled}))}),
    setViewForQA(view = "home") { changeView(view); return currentView; },
    setHouseRoomForQA(roomId = 0) { selectHouseRoom(Number(roomId)); return activeHouseRoom; },
    houseSnapshot: () => ({featureUnlocked:houseIsUnlocked(),activeRoom:activeHouseRoom,unlocked:[...state.farm.unlockedRooms],capacity:houseCapacity(),residents:state.farm.roster.map(p=>({id:p.id,name:p.name,room:p.homeRoom}))}),
    houseRequirementsForQA: () => ({level:levelForXP(state.pet.xp),required:HOUSE_UNLOCK_LEVEL,tutorialDone:state.player.tutorialStep>=5||state.player.tutorialDismissed,unlocked:houseIsUnlocked()}),
    useFoodForQA: id => useFood(id),
    livingMoodForQA: () => livingMood(),
    triggerLifeBehaviorForQA: behavior => { setLifeBehavior(behavior,50); return behavior; },
    spawnLifeMomentForQA: () => { spawnLifeMoment(true); return el.habitatScene.querySelectorAll(".life-particle").length; }
  });}
  if(IS_QA_BUILD)window.RizoRuntimeQA=createRizoRuntimeQA();else{for(const key of["RizoRuntimeQA","RizoVisualQA","RizoBeatQA"]){try{delete window[key];}catch(error){}}}

  boot();
  window.RizoBoot?.ready?.(RIZO_RUNTIME_BUILD);
})();
