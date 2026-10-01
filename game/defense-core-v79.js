(function initRizoDefenseCore(root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) Object.defineProperty(root, "RizoDefenseCore", { value: Object.freeze(core), configurable: true });
})(typeof globalThis !== "undefined" ? globalThis : this, function createRizoDefenseCore() {
  "use strict";

  const VERSION = 10;
  const STATE_SAVE_VERSION = 1;
  const CHECKPOINT_SALTS = Object.freeze({
    2: "RIZO-DEFENSE-V64-EMBER-GATE",
    3: "RIZO-DEFENSE-V66-HARDENED-GATE",
    4: "RIZO-DEFENSE-V67-PACKET-CLOCK",
    5: "RIZO-DEFENSE-V68-ECONOMY-FLOW",
    6: "RIZO-DEFENSE-V79-GATE-FLAME",
    7: "RIZO-DEFENSE-V80-STRATEGY-FEEL",
    8: "RIZO-DEFENSE-V87-FIRST-TEN",
    9: "RIZO-DEFENSE-WORKER-J-CONTINUATION-GUARD",
    10: "RIZO-DEFENSE-MASTER-SUPPORT-CONTINUATION"
  });
  const STATE_SAVE_SALT = "RIZO-LIFE-V66-VERIFIED-TIMELINE";

  const LIMITS = Object.freeze({
    MAX_SUPPORTED_WAVE: 9999,
    MAX_RUN_CASH: 2_000_000,
    MAX_TOWER_LEVEL: 4,
    MAX_DEFENSE_TOWERS: 10,
    MAX_REASONABLE_KILLS: 1_000_000,
    MAX_REASONABLE_DAMAGE: 1_000_000_000_000,
    MAX_REASONABLE_BOSSES: 2_000,
    MAX_REASONABLE_PERFECT_WAVES: 9999,
    MAX_PLANNED_ENEMIES: 46,
    MAX_CHILD_BUFFER: 48,
    MAX_CHECKPOINT_ENEMIES: 24,
    MAX_CHECKPOINT_PROJECTILES: 32,
    MAX_QUEUE_ENTRIES: 64,
    MAX_WALLET_EMBERS: 50_000_000,
    MAX_WALLET_SHARDS: 5_000_000,
    MAX_INVENTORY_STACK: 100_000,
    MAX_COLLECTION_COUNT: 100_000,
    MAX_PLAYER_XP: 1_000_000_000,
    MAX_META_COUNTER: 100_000_000,
    MAX_MASTERY_WAVES: 50_000,
    MAX_MASTERY_RUNS: 10_000,
    MAX_SEASON_XP: 100_000_000,
    MAX_SEASON_LEVEL: 100_000
  });

  const PHASES = Object.freeze({
    PLANNING: "planning",
    COUNTDOWN: "countdown",
    COMBAT: "combat",
    PACKET_BREAK: "packet-break",
    WAVE_COMPLETE: "wave-complete",
    PAUSED: "paused",
    RUN_COMPLETE: "run-complete"
  });

  const PHASE_TRANSITIONS = Object.freeze({
    [PHASES.PLANNING]: Object.freeze([PHASES.COUNTDOWN]),
    [PHASES.COUNTDOWN]: Object.freeze([PHASES.COMBAT, PHASES.PAUSED]),
    [PHASES.COMBAT]: Object.freeze([PHASES.PACKET_BREAK, PHASES.WAVE_COMPLETE, PHASES.PAUSED]),
    [PHASES.PACKET_BREAK]: Object.freeze([PHASES.COMBAT, PHASES.WAVE_COMPLETE, PHASES.PAUSED]),
    [PHASES.WAVE_COMPLETE]: Object.freeze([PHASES.COUNTDOWN, PHASES.PLANNING]),
    [PHASES.PAUSED]: Object.freeze([PHASES.COUNTDOWN, PHASES.COMBAT, PHASES.PACKET_BREAK]),
    [PHASES.RUN_COMPLETE]: Object.freeze([])
  });

  const BUDGETS = Object.freeze({
    normal: Object.freeze({
      maxActiveEnemies: 14,
      maxVisibleProjectiles: 26,
      maxImpactEffects: 8,
      maxTowers: 8,
      maxTowersHard: 10,
      targetRefreshMs: 120,
      uiRefreshMs: 120,
      incomeFlushMs: 150,
      childReleaseMs: 72
    }),
    low: Object.freeze({
      // Gameplay density is device-invariant in v76. Low-power mode reduces
      // presentation work, not the authored formation or prewarmed enemy capacity.
      maxActiveEnemies: 14,
      maxVisibleProjectiles: 16,
      maxImpactEffects: 5,
      maxTowers: 8,
      maxTowersHard: 10,
      targetRefreshMs: 160,
      uiRefreshMs: 180,
      incomeFlushMs: 180,
      childReleaseMs: 96
    })
  });

  // v76 keeps combat math deterministic at 30 Hz and lets presentation float
  // independently. This is deliberately conservative for iOS/PWA thermal and
  // Low Power Mode behavior: presentation may fall to 30 fps without changing
  // movement, cooldowns, rewards, or wave timing.
  const SIMULATION = Object.freeze({
    stepHz: 30,
    stepSeconds: 1 / 30,
    maxCatchUpSteps: 4,
    presentationHz: 60,
    lowPresentationHz: 30,
    visualProjectileHz: 10,
    fastVisualProjectileHz: 8,
    lowVisualProjectileHz: 6
  });

  const UPGRADE_COSTS = Object.freeze([110, 180, 320, 640]);
  const ECONOMY = Object.freeze({
    baseStartingCash: 220,
    planningRefundRate: 0.70,
    placementUndoSeconds: 5,
    worldOpeningDiscount: 0.80,
    deployBaseCost: 145,
    deployGrowth: 1.36,
    deployLateGrowth: 1.62,
    deployGrowthPivot: 2,
    duplicateSurcharge: 45,
    goldenIncomeCap: 0.22,
    goldenActiveDuplicateDecay: 0.12,
    goldenFactoryCap: 0.36,
    lateRunSoftCapThreshold: 1600,
    lateRunSoftCapSlope: 0.35
  });

  // Universal Defense structures intentionally use their own price curves. They
  // occupy real field slots, so greed has a spatial/defensive opportunity cost
  // instead of being a free background stat. Beacon effects never stack; the
  // strongest field covering a unit wins, which keeps support powerful without
  // producing one solved pile-of-beacons build.
  const STRUCTURES = Object.freeze({
    factory: Object.freeze({
      id: "defense-structure-factory",
      name: "CLOTHING FACTORY",
      deployBaseCost: 160,
      deployGrowth: 1.30,
      duplicateFlat: 25,
      upgradeCosts: Object.freeze([140, 260, 520, 980]),
      payouts: Object.freeze([12, 25, 49, 94, 170]),
      wavePayoutGrowth: Object.freeze([0.25, 0.45, 0.8, 1.4, 2.3]),
      intervals: Object.freeze([7.2, 6.4, 5.5, 4.5, 3.4]),
      // Depth pass: upgraded lines build clean-run momentum. From PRINT LINE
      // onward they periodically turn that momentum into a branded DROP. A
      // mixed Beacon field can shorten the DROP cycle; Private Sun + an
      // awakened Golden inside that same field amplify the event rather than
      // adding another passive currency or button.
      momentumSteps: Object.freeze([0, 0.025, 0.035, 0.045, 0.055]),
      momentumCaps: Object.freeze([0, 0.08, 0.14, 0.22, 0.30]),
      dropEvery: Object.freeze([0, 0, 4, 4, 3]),
      dropMultipliers: Object.freeze([1, 1, 1.50, 1.80, 2.25]),
      brandLoopDropReduction: 1,
      privateSunDropMultiplier: 1.20,
      goldenLicenseDropMultiplier: 1.35
    }),
    beacon: Object.freeze({
      id: "defense-structure-beacon",
      name: "BEACON",
      deployBaseCost: 175,
      deployGrowth: 1.32,
      duplicateFlat: 25,
      upgradeCosts: Object.freeze([125, 245, 485, 950]),
      radii: Object.freeze([0.18, 0.205, 0.235, 0.27, 0.32]),
      rateMultipliers: Object.freeze([1.14, 1.20, 1.28, 1.38, 1.55]),
      damageMultipliers: Object.freeze([1.00, 1.05, 1.10, 1.18, 1.30]),
      factoryCadenceMultipliers: Object.freeze([1.00, 0.96, 0.91, 0.82, 0.70])
    })
  });

  function clampNumber(value, min, max, fallback = min) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function clampInteger(value, min, max, fallback = min) {
    return Math.floor(clampNumber(value, min, max, fallback));
  }

  function isKnownId(value, registry) {
    if (typeof value !== "string" || !value) return false;
    if (registry instanceof Set || registry instanceof Map) return registry.has(value);
    if (Array.isArray(registry)) return registry.includes(value);
    return Boolean(registry && Object.prototype.hasOwnProperty.call(registry, value));
  }

  function normalizePhase(value, fallback = PHASES.PLANNING) {
    const aliases = {
      setup: PHASES.PLANNING,
      between: PHASES.PLANNING,
      wave: PHASES.COMBAT,
      paused: PHASES.PAUSED
    };
    const normalized = aliases[value] || value;
    return Object.values(PHASES).includes(normalized) ? normalized : fallback;
  }

  function isCombatPhase(phase) {
    return [PHASES.COUNTDOWN, PHASES.COMBAT, PHASES.PACKET_BREAK, PHASES.PAUSED].includes(normalizePhase(phase));
  }

  function canTransitionPhase(from, to) {
    const current = normalizePhase(from);
    const next = normalizePhase(to);
    return current === next || Boolean(PHASE_TRANSITIONS[current]?.includes(next));
  }

  function phaseAllows(phase, action) {
    const normalized = normalizePhase(phase);
    const table = {
      [PHASES.PLANNING]: new Set(["place", "move", "sell", "upgrade", "target", "start", "bank", "open-overlay"]),
      [PHASES.COUNTDOWN]: new Set(["place", "pause", "target", "upgrade", "bank", "open-overlay"]),
      [PHASES.COMBAT]: new Set(["place", "pause", "ability", "target", "upgrade", "bank", "open-overlay"]),
      [PHASES.PACKET_BREAK]: new Set(["place", "pause", "ability", "target", "upgrade", "bank", "open-overlay"]),
      [PHASES.WAVE_COMPLETE]: new Set(["place", "move", "sell", "upgrade", "target", "start", "bank", "open-overlay"]),
      [PHASES.PAUSED]: new Set(["resume", "target", "upgrade", "bank", "open-overlay"]),
      [PHASES.RUN_COMPLETE]: new Set([])
    };
    return table[normalized]?.has(action) || false;
  }

  function performanceTier(isLow) {
    return isLow ? BUDGETS.low : BUDGETS.normal;
  }

  function visualBudget({ low = false, speed = 1 } = {}) {
    const budget = performanceTier(low);
    const fast = Number(speed) === 2;
    return {
      maxVisibleProjectiles: fast ? Math.max(10, Math.floor(budget.maxVisibleProjectiles * 0.62)) : budget.maxVisibleProjectiles,
      maxImpactEffects: fast ? Math.max(3, Math.floor(budget.maxImpactEffects * 0.62)) : budget.maxImpactEffects,
      weatherParticleScale: fast ? (low ? 0.24 : 0.46) : (low ? 0.42 : 1),
      projectileEmissionHz: low ? SIMULATION.lowVisualProjectileHz : fast ? SIMULATION.fastVisualProjectileHz : SIMULATION.visualProjectileHz,
      presentationFps: low ? SIMULATION.lowPresentationHz : SIMULATION.presentationHz
    };
  }

  function childReservationCount(queue, clock, windowSeconds = 0.18, maximum = 3) {
    if (!Array.isArray(queue) || !queue.length) return 0;
    const now = clampNumber(clock, 0, 1e9, 0);
    const horizon = now + clampNumber(windowSeconds, 0, 2, 0.18);
    let count = 0;
    for (const item of queue) {
      if (clampNumber(item?.releaseAt, 0, 1e9, 1e9) <= horizon) count += 1;
      if (count >= maximum) return maximum;
    }
    return count;
  }

  function densityCap({ low = false, speed = 1, bossActive = false } = {}) {
    // v76 treats entity scheduling as gameplay, not a quality setting. Low-power
    // mode and 2× may reduce *presentation* work, but they must not secretly
    // thin a wave or change its pressure. Keep one authored gameplay ceiling
    // across devices/speeds; the low budget is reserved for target/UI/visual work.
    void low; void speed;
    return bossActive ? Math.min(10, BUDGETS.normal.maxActiveEnemies) : BUDGETS.normal.maxActiveEnemies;
  }

  function upgradeCost(currentUpgradeLevel, modifier = 1) {
    const index = clampInteger(currentUpgradeLevel, 0, UPGRADE_COSTS.length - 1, 0);
    return Math.max(0, Math.round(UPGRADE_COSTS[index] * clampNumber(modifier, 0.5, 2, 1) / 5) * 5);
  }

  function calculateTowerInvestment(baseCost, upgradeLevel, modifier = 1) {
    const level = clampInteger(upgradeLevel, 0, LIMITS.MAX_TOWER_LEVEL, 0);
    const modifiers = Array.isArray(modifier) ? modifier : null;
    let spent = clampInteger(baseCost, 0, LIMITS.MAX_RUN_CASH, 0);
    for (let index = 0; index < level; index += 1) spent += upgradeCost(index, modifiers ? (modifiers[index] ?? 1) : modifier);
    return spent;
  }

  function deploymentCost({ paidTowerCount = 0, copyCount = 0, activeFirst = false } = {}) {
    const paid = clampInteger(paidTowerCount, 0, LIMITS.MAX_DEFENSE_TOWERS, 0);
    const copies = clampInteger(copyCount, 0, LIMITS.MAX_DEFENSE_TOWERS, 0);
    if (activeFirst && copies === 0) return 0;
    const earlyPaid = Math.min(paid, ECONOMY.deployGrowthPivot);
    const latePaid = Math.max(0, paid - ECONOMY.deployGrowthPivot);
    const raw = ECONOMY.deployBaseCost * Math.pow(ECONOMY.deployGrowth, earlyPaid) * Math.pow(ECONOMY.deployLateGrowth, latePaid) + copies * ECONOMY.duplicateSurcharge;
    return Math.min(LIMITS.MAX_RUN_CASH, Math.max(0, Math.round(raw / 10) * 10));
  }

  function structureDefinition(type) {
    return typeof type === "string" ? STRUCTURES[type] || null : null;
  }

  function structureDeploymentCost(type, copyCount = 0) {
    const def = structureDefinition(type);
    if (!def) return LIMITS.MAX_RUN_CASH;
    const copies = clampInteger(copyCount, 0, LIMITS.MAX_DEFENSE_TOWERS, 0);
    const raw = def.deployBaseCost * Math.pow(def.deployGrowth, copies) + copies * def.duplicateFlat;
    return Math.min(LIMITS.MAX_RUN_CASH, Math.max(0, Math.round(raw / 5) * 5));
  }

  function structureUpgradeCost(type, currentUpgradeLevel = 0) {
    const def = structureDefinition(type);
    if (!def) return LIMITS.MAX_RUN_CASH;
    const index = clampInteger(currentUpgradeLevel, 0, def.upgradeCosts.length - 1, 0);
    return Math.max(0, clampInteger(def.upgradeCosts[index], 0, LIMITS.MAX_RUN_CASH, 0));
  }

  function calculateStructureInvestment(type, baseCost, upgradeLevel = 0) {
    const level = clampInteger(upgradeLevel, 0, LIMITS.MAX_TOWER_LEVEL, 0);
    let spent = clampInteger(baseCost, 0, LIMITS.MAX_RUN_CASH, 0);
    for (let index = 0; index < level; index += 1) spent += structureUpgradeCost(type, index);
    return Math.min(LIMITS.MAX_RUN_CASH, spent);
  }

  function beaconSupport(upgradeLevel = 0) {
    const def = STRUCTURES.beacon;
    const level = clampInteger(upgradeLevel, 0, LIMITS.MAX_TOWER_LEVEL, 0);
    return Object.freeze({
      level,
      radius: def.radii[level],
      rateMultiplier: def.rateMultipliers[level],
      damageMultiplier: def.damageMultipliers[level],
      factoryCadenceMultiplier: def.factoryCadenceMultipliers[level]
    });
  }

  function goldenFactoryMultiplier(count = 0) {
    const total = clampInteger(count, 0, LIMITS.MAX_DEFENSE_TOWERS, 0);
    return 1 + Math.min(ECONOMY.goldenFactoryCap, total * 0.12);
  }

  function factoryEconomy({ upgradeLevel = 0, wave = 0, goldenTowerCount = 0, beaconUpgradeLevel = -1, cleanCycles = 0, brandLoop = false, privateSun = false, goldenLicensed = false } = {}) {
    const def = STRUCTURES.factory;
    const level = clampInteger(upgradeLevel, 0, LIMITS.MAX_TOWER_LEVEL, 0);
    const safeWave = clampInteger(wave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0);
    const streak = clampInteger(cleanCycles, 0, 9999, 0);
    const goldenMultiplier = goldenFactoryMultiplier(goldenTowerCount);
    const support = beaconUpgradeLevel >= 0 ? beaconSupport(beaconUpgradeLevel) : null;
    const cadenceMultiplier = support ? support.factoryCadenceMultiplier : 1;
    const interval = Math.max(1.2, def.intervals[level] * cadenceMultiplier);
    const basePayout = def.payouts[level] + Math.min(safeWave, 90) * def.wavePayoutGrowth[level];
    const momentumMultiplier = 1 + Math.min(def.momentumCaps[level], streak * def.momentumSteps[level]);
    const baseDropEvery = def.dropEvery[level];
    const dropEvery = baseDropEvery > 0 ? Math.max(2, baseDropEvery - (brandLoop ? def.brandLoopDropReduction : 0)) : 0;
    const nextCycle = streak + 1;
    const isDrop = dropEvery > 0 && nextCycle % dropEvery === 0;
    const privateSunMultiplier = isDrop && privateSun ? def.privateSunDropMultiplier : 1;
    const licenseMultiplier = isDrop && goldenLicensed ? def.goldenLicenseDropMultiplier : 1;
    const dropMultiplier = isDrop ? def.dropMultipliers[level] * privateSunMultiplier * licenseMultiplier : 1;
    const payout = Math.max(1, Math.round(basePayout * goldenMultiplier * momentumMultiplier * dropMultiplier));
    return Object.freeze({ level, payout, interval, goldenMultiplier, cadenceMultiplier, momentumMultiplier, cleanCycles: streak, nextCycle, dropEvery, isDrop, dropMultiplier, brandLoop: Boolean(brandLoop), privateSun: Boolean(privateSun), goldenLicensed: Boolean(goldenLicensed) });
  }

  function goldenBonus(count) {
    const total = clampInteger(count, 0, LIMITS.MAX_DEFENSE_TOWERS, 0);
    if (total <= 0) return 1;
    return 1 + Math.min(ECONOMY.goldenIncomeCap, 0.10 + Math.max(0, total - 1) * 0.03);
  }

  function goldenActivePayout({ clearedWave = 0, upgradeLevel = 0, goldenTowerCount = 1 } = {}) {
    const wave = clampInteger(clearedWave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0);
    const upgrade = clampInteger(upgradeLevel, 0, LIMITS.MAX_TOWER_LEVEL, 0);
    const count = Math.max(1, clampInteger(goldenTowerCount, 1, LIMITS.MAX_DEFENSE_TOWERS, 1));
    const base = 40 + Math.min(wave, 40) * 4 + upgrade * 16;
    const duplicateScale = Math.max(0.52, 1 - Math.max(0, count - 1) * ECONOMY.goldenActiveDuplicateDecay);
    return Math.max(0, Math.round(base * duplicateScale));
  }

  function recommendedTowerCount(wave) {
    return clampInteger(2 + Math.floor(clampInteger(wave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0) / 8), 2, 8, 2);
  }

  function calculateWaveBonus({ clearedWave, heartsLostThisWave = 0, towersPlaced = 0 } = {}) {
    const wave = clampInteger(clearedWave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0);
    // Wave-clear income ramps strongly through the learning curve, then tapers.
    // Late waves already contain richer enemy mixes, so a forever-linear clear
    // bonus only turns planning money into an irrelevant scoreboard number.
    const baseWaveBonus = 24 + Math.min(wave, 20) * 4 + Math.max(0, Math.min(wave, 50) - 20);
    const heartBonus = clampInteger(heartsLostThisWave, 0, 999, 0) === 0 ? 10 : 0;
    const efficiencyBonus = clampInteger(towersPlaced, 0, LIMITS.MAX_DEFENSE_TOWERS, 0) <= recommendedTowerCount(wave) ? 8 : 0;
    return Math.max(0, Math.round(baseWaveBonus + heartBonus + efficiencyBonus));
  }

  function softCap(value, threshold = 1600, slope = 0.35) {
    const amount = Math.max(0, Number(value) || 0);
    if (amount <= threshold) return amount;
    return threshold + (amount - threshold) * slope;
  }

  function calculateRunEmbers({ clearedWave = 0, kills = 0, bossesDefeated = 0, perfectWaveCount = 0 } = {}) {
    const wave = clampInteger(clearedWave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0);
    const safeKills = clampInteger(kills, 0, LIMITS.MAX_REASONABLE_KILLS, 0);
    const bosses = clampInteger(bossesDefeated, 0, LIMITS.MAX_REASONABLE_BOSSES, 0);
    const perfect = clampInteger(perfectWaveCount, 0, Math.min(wave, LIMITS.MAX_REASONABLE_PERFECT_WAVES), 0);
    const raw = wave * 8 + safeKills * 1.1 + bosses * 25 + perfect * 3;
    return Math.max(0, Math.floor(softCap(raw, ECONOMY.lateRunSoftCapThreshold, ECONOMY.lateRunSoftCapSlope)));
  }

  function calculateEnemyReward(baseReward, wave, { rewardScale = 1 } = {}) {
    const base = clampNumber(baseReward, 0, LIMITS.MAX_RUN_CASH, 0);
    const safeWave = clampInteger(wave, 1, LIMITS.MAX_SUPPORTED_WAVE, 1);
    const scale = clampNumber(rewardScale, 0.05, 2, 1);
    // Preserve the original early-game growth exactly through Wave 10. After
    // that, normalize the per-pop bounty against the size of a normal wave.
    // Difficulty can keep rising through HP, enemy mix and mechanics without
    // the larger packet count also creating runaway cash inflation.
    const earlyGrowth = 1 + Math.min(safeWave, 10) * 0.045;
    const referenceCount = plannedEnemyCount(10);
    const expectedCount = plannedEnemyCount(safeWave);
    const packNormalization = safeWave <= 10 ? 1 : Math.sqrt(referenceCount / Math.max(referenceCount, expectedCount));
    return Math.max(0, Math.round(base * earlyGrowth * packNormalization * scale));
  }

  function plannedEnemyCount(wave, modifier = "normal") {
    const safeWave = clampInteger(wave, 1, LIMITS.MAX_SUPPORTED_WAVE, 1);
    // v76 stops using top-level count as the primary difficulty dial. The curve
    // rises quickly enough to teach density, then intentionally flattens while
    // HP, traits, compositions, bosses and child pressure carry later difficulty.
    let count;
    if (safeWave <= 5) count = 8 + Math.floor((safeWave - 1) * 1.0);
    else if (safeWave <= 15) count = 12 + Math.floor((safeWave - 5) * 0.62);
    else if (safeWave <= 30) count = 18 + Math.floor((safeWave - 15) * 0.34);
    else count = 23 + Math.floor(Math.min(70, safeWave - 30) * 0.08);
    count = Math.min(30, count, LIMITS.MAX_PLANNED_ENEMIES);
    if (modifier === "boss") count = Math.min(14, Math.max(8, Math.floor(count * 0.48))) + 1;
    if (modifier === "rush") count = Math.min(34, count + 4);
    if (modifier === "swarm") count = Math.min(33, count + 3);
    if (modifier === "wall") count = Math.max(7, Math.floor(count * 0.72));
    if (modifier === "recovery") count = Math.max(7, Math.floor(count * 0.72));
    return count;
  }

  function packetPacingForWave(wave, { boss = false, rush = false, wall = false } = {}) {
    const safeWave = clampInteger(wave, 1, LIMITS.MAX_SUPPORTED_WAVE, 1);
    // v78 finishes the rhythm pass instead of merely shaving speed. Ordinary
    // formations now read as phrases: arrival -> pressure -> breath -> answer.
    // Rushes are still fast, but they are short authored spikes surrounded by air.
    if (boss) return { minSize: 4, maxSize: 7, gapMin: 0.58, gapMax: 0.78, breakMin: 1.90, breakMax: 2.60 };
    if (rush) return { minSize: 7, maxSize: safeWave < 25 ? 11 : 13, gapMin: 0.14, gapMax: 0.19, breakMin: 1.60, breakMax: 2.10 };
    if (wall) return { minSize: 4, maxSize: 7, gapMin: 0.42, gapMax: 0.60, breakMin: 1.80, breakMax: 2.40 };
    if (safeWave <= 5) return { minSize: 4, maxSize: 8, gapMin: 0.58, gapMax: 0.78, breakMin: 1.85, breakMax: 2.55 };
    if (safeWave <= 15) return { minSize: 6, maxSize: 10, gapMin: 0.38, gapMax: 0.54, breakMin: 1.55, breakMax: 2.25 };
    return { minSize: 7, maxSize: 12, gapMin: 0.27, gapMax: 0.40, breakMin: 1.35, breakMax: 2.05 };
  }

  function splitIntoPackets(enemies, wave, { boss = false, rush = false, wall = false } = {}) {
    const list = Array.isArray(enemies) ? enemies.slice(0, LIMITS.MAX_PLANNED_ENEMIES + 1) : [];
    const packets = [];
    let cursor = 0;
    const pacing = packetPacingForWave(wave, { boss, rush, wall });
    while (cursor < list.length) {
      const remaining = list.length - cursor;
      const span = Math.max(1, pacing.maxSize - pacing.minSize + 1);
      const authoredSize = pacing.minSize + ((packets.length * 2 + wave) % span);
      const size = Math.min(remaining, authoredSize);
      const packetEnemies = list.slice(cursor, cursor + size);
      const hasBoss = packetEnemies.some(entry => typeof entry === "object" && entry?.type === "boss");
      const t = ((packets.length + wave) % 5) / 4;
      const spawnGap = hasBoss ? 0.82 : clampNumber(pacing.gapMin + (pacing.gapMax - pacing.gapMin) * t, pacing.gapMin, pacing.gapMax, pacing.gapMin);
      const breakAfter = cursor + size >= list.length ? 0 : hasBoss ? 1.80 : clampNumber(pacing.breakMin + (pacing.breakMax - pacing.breakMin) * (1 - t), pacing.breakMin, pacing.breakMax, pacing.breakMin);
      packets.push({ enemies: packetEnemies, spawnGap, breakAfter });
      cursor += size;
    }
    if (boss && packets.length) {
      // Bosses own the last beat. Escorts resolve, the field breathes, then the
      // apex silhouette enters by itself so difficulty is legible rather than noisy.
      const finalPacket = packets[packets.length - 1];
      const bossIndex = finalPacket.enemies.findIndex(entry => typeof entry === "object" && entry?.type === "boss");
      if (bossIndex >= 0 && finalPacket.enemies.length > 1) {
        const [bossEntry] = finalPacket.enemies.splice(bossIndex, 1);
        finalPacket.breakAfter = Math.max(2.05, finalPacket.breakAfter || 0);
        packets.push({ enemies: [bossEntry], spawnGap: 1.10, breakAfter: 0 });
      } else if (bossIndex === 0 && packets.length > 1) {
        packets[packets.length - 2].breakAfter = Math.max(2.05, packets[packets.length - 2].breakAfter || 0);
      }
    }
    return packets;
  }

  // The opening is a score, not a seeded mix. Every packet has a job.
  // Keep entries in the existing checkpoint grammar; old in-flight packets
  // restore exactly as saved and new waves use this score.
  function openingWavePlan(wave, bossIds) {
    const p = (enemies, spawnGap, breakAfter = 1.8) => ({ enemies, spawnGap, breakAfter });
    const score = [
      ["KNOCK KNOCK", "Own a bend. One Rizo can hit the road twice.", [p(["puff","puff","puff"],.95,2.2),p(["puff","puff","puff"],.72,0)]],
      ["WRONG SPEED", "Blue Zips overtake the reds. FRONT catches the runner.", [p(["puff","puff","fleet"],.85,2.1),p(["puff","fleet","puff","fleet"],.65,0)]],
      ["PLUS ONE. PLUS TWO.", "Pink Bubbles pop into two children. Chain hits clean up.", [p(["split","puff","puff"],.85,2.2),p(["puff","split","puff","fleet"],.65,0)]],
      ["TIN CAN PARADE", "Iron distracts the front line. Heavy hits crack it; Zips slip past.", [p(["shell","puff","fleet"],.9,1.8),p(["shell","puff","fleet","puff","fleet"],.6,0)]],
      ["THEY BROUGHT FRIENDS", "Three Zip bursts. Spread coverage or freeze the rush.", [p(["fleet","fleet","fleet","fleet"],.28,2.4),p(["fleet","fleet","fleet","fleet"],.24,2.4),p(["fleet","fleet","fleet","fleet"],.2,0)]],
      ["DO NOT POP HERE", "Crack Bubbles early. Their children need road left to die on.", [p(["shell","split","split"],.9,2.3),p(["puff","puff","fleet"],.72,2.1),p(["shell","split","fleet"],.65,0)]],
      ["TOO HOT TO HOLD", "Fireproof escorts punish all-Ember fields. Chill makes them brittle.", [p(["fire","puff","fleet"],.85,2),p(["shell","fire","fleet","fleet"],.6,2.2),p(["split","fire","fleet"],.7,0)]],
      ["YELLOW MEANS RUN", "Storms wind up, then surge. Save control for the charge.", [p(["storm","puff","puff"],.85,2.2),p(["shell","storm","fleet"],.72,2.2),p(["split","storm","fleet","fleet"],.5,0)]],
      ["ONE LAST QUIET NIGHT", "The dress rehearsal: armor, children, then a late rush.", [p(["shell","fire","puff","split"],.8,2.4),p(["split","shell","puff","split"],.65,2.4),p(["storm","fleet","fleet","storm"],.38,0)]],
      ["THE WARDEN", "He walks with the crowd. TOUGHEST breaks him; FRONT catches his cover.", [p(["shell","fleet","fleet"],.7,2.4),p([{type:"boss",bossId:bossIds[0]||"crown",intensity:0},"puff","split","fire"],.95,2.4),p(["shell","split","fleet"],.8,2.4),p(["storm","fleet","fleet"],.4,0)]]
    ];
    const [title,copy,packets] = score[wave-1];
    return { wave, modifier:wave===10?"boss":wave===5?"rush":"authored", packets,
      plannedEnemyCount:flattenPackets(packets).length,
      estimatedDuration:packets.reduce((sum,p)=>sum+(p.enemies.length-1)*p.spawnGap+p.breakAfter,0),
      announcement:{title,copy} };
  }

  function authoredSecondChapterPlan(wave, bossIds) {
    const p = (enemies, spawnGap, breakAfter = 1.8) => ({ enemies, spawnGap, breakAfter });
    const boss = (bossId, intensity = 0) => ({ type: "boss", bossId, intensity });
    const vortex = bossIds[1] || "vortex", mirror = bossIds[2] || "mirror";
    const score = {
      11:["AFTER THE CROWN","A recovery lap. Rebuild before the trail starts combining rules again.","recovery",[p(["puff","puff","fleet","puff"],.72,2.25),p(["puff","fleet","puff","puff","fleet"],.62,0)]],
      12:["CROSS TRAFFIC","Iron holds your shots while Zips steal road. FRONT and TOUGHEST now want different jobs.","crossfire",[p(["shell","puff","fleet","fleet"],.62,2.1),p(["fleet","shell","puff","fleet","shell"],.54,0)]],
      13:["POPULATION PROBLEM","Bubble children arrive behind armor. Kill the parents early or inherit a second wave.","swarm",[p(["split","shell","split"],.72,2.2),p(["fleet","split","puff","split"],.48,2.0),p(["shell","split","fleet"],.58,0)]],
      14:["BAD TEMPERATURES","Heat and cold share the trail. One elemental answer is no longer enough.","hazard",[p(["fire","frost","puff"],.72,2.15),p(["shell","fire","fleet","frost"],.55,2.15),p(["fire","split","frost"],.62,0)]],
      15:["FIVE SECOND MISTAKE","The rush is short enough to look harmless. It is not.","rush",[p(["fleet","fleet","storm","fleet","fleet"],.18,2.3),p(["fleet","storm","fleet","fleet","storm"],.16,2.2),p(["fleet","fleet","fleet","fleet"],.14,0)]],
      16:["LIGHTS OUT","Shade Balloons expose fields that depended on unawakened sight.","veil",[p(["shade","puff","shade","fleet"],.62,2.1),p(["shell","shade","split","shade"],.56,2.15),p(["fleet","shade","fire"],.50,0)]],
      17:["KILL THE SIGNAL","Relay Balloons make the pack faster and tougher while they are nearby. Pick the support target first.","support",[p(["relay","puff","fleet","puff"],.56,2.2),p(["shell","fleet","relay","fleet"],.48,2.15),p(["split","relay","puff"],.58,0)]],
      18:["THEY FIX EACH OTHER","Menders repair wounded neighbors. Burst them or separate the formation with control.","support",[p(["mender","shell","puff"],.68,2.25),p(["split","mender","fleet","shell"],.54,2.2),p(["mender","fire","puff"],.60,0)]],
      19:["NO SINGLE ANSWER","Support, armor, speed, children. This is the first real build check.","exam",[p(["relay","shell","fleet","split"],.52,2.3),p(["mender","fire","storm","puff"],.50,2.3),p(["frost","split","relay","fleet"],.46,0)]],
      20:["THE MAW","It does not need to reach the Gate to hurt you. Break its range-collapse pulse.","boss",[p(["relay","shell","fleet","storm"],.52,2.35),p(["mender","frost","fleet","shell"],.58,2.4),p([boss(vortex,0)],1.05,0)]],
      21:["THE FIELD BREATHES","A deliberate valley after the Maw. Move money into the weakness it just exposed.","recovery",[p(["puff","fleet","puff","puff"],.70,2.3),p(["split","puff","fleet","puff"],.62,0)]],
      22:["HALF HERE","Phase Balloons only fully exist some of the time. Reveal or CONTROL turns them honest.","veil",[p(["ghost","puff","fleet"],.66,2.2),p(["ghost","shell","shade","puff"],.58,2.2),p(["split","ghost","fleet"],.52,0)]],
      23:["ESCORT DUTY","Relay support hides behind camouflage. FRONT is not always the target that matters most.","support",[p(["shade","relay","fleet","shade"],.52,2.2),p(["shell","relay","ghost","fleet"],.50,2.2),p(["mender","shade","split"],.58,0)]],
      24:["HEAVY METAL","Lead plating laughs at weak repetition. Shred first, then spend your damage.","wall",[p(["lead","puff","fleet"],.76,2.3),p(["shell","lead","mender"],.68,2.35),p(["lead","storm","fleet"],.60,0)]],
      25:["NESTING SEASON","Parents, children, and support arrive in pulses instead of one screen-filling blob.","swarm",[p(["split","split","relay","split"],.35,2.35),p(["fleet","split","mender","split","fleet"],.30,2.4),p(["split","storm","split","relay"],.32,0)]],
      26:["REPAIR THE WALL","A Mender behind Ceramic turns time into enemy health. Reach the support balloon.","support",[p(["brick","mender","puff"],.72,2.4),p(["shell","brick","mender","fleet"],.64,2.35),p(["brick","relay","fleet"],.58,0)]],
      27:["WEATHERPROOF","The map's own hazard now joins a mixed formation. Build for the world, not a spreadsheet.","hazard",[p(["storm","fire","frost","fleet"],.55,2.25),p(["relay","storm","shell","fire"],.50,2.3),p(["frost","mender","split"],.58,0)]],
      28:["DEAD SIGNAL","Phase threats inside a Relay pack force detection and priority damage at the same time.","veil-support",[p(["ghost","relay","ghost","fleet"],.52,2.3),p(["shade","mender","ghost","shell"],.54,2.3),p(["relay","ghost","storm"],.48,0)]],
      29:["THE DRESS REHEARSAL","Everything learned since the Warden arrives in three readable acts.","exam",[p(["lead","relay","fleet","split"],.52,2.4),p(["mender","brick","ghost","shade"],.58,2.45),p(["storm","fire","frost","fleet","fleet"],.34,0)]],
      30:["THE MIRROR","The split is inevitable. Your question is whether both halves still cross real coverage.","boss",[p(["ghost","relay","shell","split"],.54,2.4),p(["mender","lead","fleet","shade"],.60,2.45),p([boss(mirror,0)],1.05,0)]]
    };
    const row = score[wave];
    if (!row) return null;
    const [title, copy, modifier, packets] = row;
    return {
      wave,
      modifier,
      packets,
      plannedEnemyCount: flattenPackets(packets).length,
      estimatedDuration: packets.reduce((sum, packet) => sum + Math.max(0, packet.enemies.length - 1) * packet.spawnGap + packet.breakAfter, 0),
      announcement: { title, copy },
      chapter: "pressure-school"
    };
  }

  function buildEndlessAct(pattern, size) {
    const source = Array.isArray(pattern) && pattern.length ? pattern : ["puff"];
    return Array.from({ length: Math.max(1, size) }, (_, index) => source[index % source.length]);
  }

  function endlessFormationPackets(archetype, count, hazard, pressureWave) {
    const mastery = Math.min(4, Math.max(0, Math.floor((pressureWave - 31) / 30)));
    const veteran = mastery >= 2, deep = mastery >= 3;
    const acts = {
      "support-convoy": [
        ["fleet","puff","relay","puff","fleet"],
        veteran ? ["shell","mender","relay","shell","brick"] : ["shell","mender","shell","relay"],
        deep ? ["lead","relay","mender","fleet","brick"] : ["brick","mender","relay","fleet"]
      ],
      blackout: [
        ["shade","fleet","ghost","shade","relay"],
        veteran ? ["ghost","shade","relay","ghost","shell"] : ["shade","ghost","puff","relay"],
        deep ? ["mender","ghost","shade","relay","fleet"] : ["ghost","shade","fleet","relay"]
      ],
      stampede: [
        ["fleet","fleet","fleet","storm"],
        veteran ? ["fleet","relay","fleet","fleet","storm"] : ["fleet","fleet","relay","fleet"],
        deep ? ["storm","fleet","relay","fleet","fleet"] : ["fleet","storm","fleet","fleet"]
      ],
      siege: [
        ["shell","brick","shell","mender"],
        veteran ? ["lead","brick","mender","shell","brick"] : ["brick","shell","mender","brick"],
        deep ? ["relay","lead","brick","mender","brick"] : ["lead","brick","mender","shell"]
      ],
      "hazard-lock": [
        [hazard,"fire","frost","relay"],
        veteran ? [hazard,"relay",hazard,"shell","mender"] : [hazard,"relay","frost","fire"],
        deep ? ["lead",hazard,"mender","relay",hazard] : [hazard,"mender","relay","fire"]
      ],
      fracture: [
        ["split","fleet","split","ghost"],
        veteran ? ["ghost","mender","split","ghost","fleet"] : ["split","mender","fleet","ghost"],
        deep ? ["relay","ghost","split","mender","ghost"] : ["mender","split","ghost","fleet"]
      ],
      triage: [
        ["puff","fire","mender","lead"],
        veteran ? ["lead","mender","relay","fire","puff"] : ["mender","fire","puff","relay"],
        deep ? ["brick","mender","relay",hazard,"lead"] : ["lead","mender","relay","puff"]
      ],
      crossfire: [
        ["fleet","split","shell","relay"],
        veteran ? ["ghost","fleet","shell","split","relay"] : ["ghost","fleet","split","shell"],
        deep ? ["mender","lead","ghost","relay","fleet"] : ["relay","ghost","shell","fleet"]
      ],
      gauntlet: [
        ["fleet","split","storm","relay"],
        ["shell","lead","brick","mender"],
        ["ghost","shade","split",hazard],
        deep ? ["relay","mender","lead",hazard,"fleet"] : ["relay","mender","fleet",hazard]
      ]
    }[archetype] || [["puff","fleet"],["shell","split"],[hazard,"relay"]];
    const packetCount = acts.length;
    const base = Math.floor(count / packetCount), remainder = count % packetCount;
    const rush = archetype === "stampede", wall = archetype === "siege";
    return acts.map((pattern, index) => {
      const size = base + (index >= packetCount - remainder ? 1 : 0);
      const enemies = buildEndlessAct(pattern, size);
      const spawnGap = rush ? Math.max(.13, .24 - mastery * .012 + index * .012) : wall ? Math.min(.78, .62 + index * .045) : Math.max(.28, .52 - mastery * .018 + index * .018);
      const breakAfter = index === packetCount - 1 ? 0 : rush ? 2.05 + index * .18 : 2.20 + index * .12;
      return { enemies, spawnGap, breakAfter };
    });
  }

  function endlessWavePlan({ wave, effective, weather, bossIds }) {
    const safeWave = wave;
    const pressureWave = Math.max(safeWave, effective || safeWave);
    const cycle = Math.max(0, pressureWave - 31);
    const decade = Math.floor(pressureWave / 10);
    const bossOrdinal = Math.max(0, Math.floor(safeWave / 10) - 1);
    const remixTier = Math.min(12, Math.floor(bossOrdinal / Math.max(1, bossIds.length)));
    const hazard = weather === "blizzard" ? "frost" : weather === "storm" ? "storm" : weather === "ash" ? "fire" : weather === "eclipse" ? "shade" : cycle % 3 === 0 ? "storm" : cycle % 3 === 1 ? "fire" : "frost";
    const bossProfiles = {
      crown:["lead","relay","shell","mender","fleet"],
      vortex:["storm","fleet","relay","mender","frost"],
      mirror:["ghost","split","relay","shade","mender"],
      apex:["fleet","storm","relay","lead","mender","brick"]
    };

    if (safeWave % 10 === 0) {
      const bossId = bossIds[bossOrdinal % bossIds.length] || bossIds[0] || "crown";
      const count = Math.max(8, plannedEnemyCount(safeWave, "boss") - 1);
      const profile = bossProfiles[bossId] || bossProfiles.crown;
      const escorts = Array.from({length:count}, (_, index) => profile[(index + decade) % profile.length]);
      if (remixTier >= 1) escorts[Math.max(0, escorts.length - 2)] = "brick";
      if (remixTier >= 2) escorts[Math.max(0, escorts.length - 4)] = hazard;
      escorts.push({type:"boss",bossId,intensity:remixTier});
      const packets = splitIntoPackets(escorts, safeWave, {boss:true});
      return {wave:safeWave,modifier:"boss-remix",plannedEnemyCount:escorts.length,packets,estimatedDuration:packets.reduce((sum,p)=>sum+Math.max(0,p.enemies.length-1)*p.spawnGap+p.breakAfter,0),announcement:{title:`BOSS REMIX • TIER ${remixTier+1}`,copy:`${bossId.toUpperCase()} returns with a formation built around its mechanic. The escorts are part of the boss fight.`},chapter:"endless",pressureTags:["boss-remix",hazard,remixTier>=1?"support":"escort"]};
    }

    if (safeWave % 10 === 1) {
      const count = plannedEnemyCount(safeWave, "recovery");
      const recoveryProfiles = [
        {id:"aftershock",title:"AFTERSHOCK",copy:"A real recovery wave. Fix the board before Endless asks a different question.",acts:[["puff","puff","split","puff"],["fleet","puff","puff","split"]]},
        {id:"open-road",title:"OPEN ROAD",copy:"Fragile traffic, a little faster. Recover without falling asleep at the wheel.",acts:[["puff","fleet","puff"],["fleet","puff","split","puff"]]},
        {id:"patch-window",title:"PATCH WINDOW",copy:"One light armor note, otherwise breathing room. Repair the plan before the next formation.",acts:[["puff","shell","puff"],["split","puff","shell","puff"]]}
      ];
      const recovery = recoveryProfiles[decade % recoveryProfiles.length];
      const firstCount = Math.ceil(count * .48), secondCount = Math.max(0,count-firstCount);
      const packets = [
        {enemies:buildEndlessAct(recovery.acts[0],firstCount),spawnGap:.34,breakAfter:2.25},
        {enemies:buildEndlessAct(recovery.acts[1],secondCount),spawnGap:.32,breakAfter:0}
      ].filter(packet=>packet.enemies.length);
      const enemies = flattenPackets(packets);
      return {wave:safeWave,modifier:"recovery",recoveryStyle:recovery.id,plannedEnemyCount:enemies.length,packets,estimatedDuration:packets.reduce((sum,p)=>sum+Math.max(0,p.enemies.length-1)*p.spawnGap+p.breakAfter,0),announcement:{title:recovery.title,copy:recovery.copy},chapter:"endless",formationTier:0,pressureTags:["recovery",recovery.id]};
    }

    const archetypes = ["support-convoy","blackout","stampede","siege","hazard-lock","fracture","triage","crossfire"];
    let archetype = archetypes[(cycle + decade) % archetypes.length];
    if (safeWave % 25 === 0) archetype = "gauntlet";
    const count = plannedEnemyCount(safeWave, archetype === "stampede" ? "rush" : archetype === "siege" ? "wall" : "normal");
    const packets = endlessFormationPackets(archetype, count, hazard, pressureWave);
    const enemies = flattenPackets(packets);
    const formationTier = Math.min(5, 1 + Math.max(0, Math.floor((pressureWave - 31) / 30)));
    const titles={"support-convoy":"PROTECT THE SUPPORT","blackout":"BLACKOUT PACK","stampede":"STAMPEDE","siege":"MOVING WALL","hazard-lock":"WEATHER LOCK","fracture":"FRACTURE TRAIN","triage":"TRIAGE LINE","crossfire":"CROSSFIRE","gauntlet":"ENDLESS GAUNTLET"};
    const copies={"support-convoy":"Relays amplify the pack while Menders erase sloppy chip damage. Reach the support line.","blackout":"Hidden and phased threats travel under a Relay signal. Detection without target priority is not enough.","stampede":"Fast bodies arrive in separated bursts. Spend control on the surge, not the empty road.","siege":"Heavy armor advances around Menders. Shred, focus, then move to the next wall.","hazard-lock":`${hazard.toUpperCase()} pressure stacks with support. The world hazard and the formation are now one problem.`,"fracture":"Split bodies and phase bodies make cleanup matter as much as the first hit.","triage":"Menders sit inside mixed armor. A balanced field can win; a solved single-target script cannot.","crossfire":"Fast, armored, hidden and split threats take turns owning the front.","gauntlet":"A milestone remix: every major enemy language appears without exceeding the field density budget."};
    return {wave:safeWave,modifier:archetype,plannedEnemyCount:enemies.length,packets,estimatedDuration:packets.reduce((sum,p)=>sum+Math.max(0,p.enemies.length-1)*p.spawnGap+p.breakAfter,0),announcement:{title:titles[archetype],copy:copies[archetype]},chapter:"endless",formationTier,pressureTags:[archetype,hazard,`formation-tier-${formationTier}`,pressureWave>=60?"elite-heavy":"mixed"]};
  }

  function createWavePlan({ wave, specialBias = 0, weather = "clear", bossIds = ["crown", "vortex", "mirror", "apex"] } = {}) {
    const safeWave = clampInteger(wave, 1, LIMITS.MAX_SUPPORTED_WAVE, 1);
    if (safeWave <= 10) return openingWavePlan(safeWave, bossIds);
    if (safeWave <= 30) return authoredSecondChapterPlan(safeWave, bossIds);
    const effective = safeWave + clampInteger(specialBias, 0, 20, 0);
    return endlessWavePlan({wave:safeWave,effective,weather,bossIds});
  }

  function flattenPackets(packets) {
    return (Array.isArray(packets) ? packets : []).flatMap(packet => Array.isArray(packet?.enemies) ? packet.enemies : []);
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      const output = {};
      for (const key of Object.keys(value).sort()) output[key] = stableValue(value[key]);
      return output;
    }
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  }

  function fnv1a(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function queueSignatureEntry(entry) {
    if (typeof entry === "string") return entry.slice(0, 40);
    if (!entry || typeof entry !== "object") return null;
    return stableValue({
      type: typeof entry.type === "string" ? entry.type.slice(0, 40) : "",
      bossId: typeof entry.bossId === "string" ? entry.bossId.slice(0, 40) : "",
      intensity: clampInteger(entry.intensity, 0, 99, 0)
    });
  }

  function checkpointSignaturePayload(checkpoint, signatureVersion = VERSION) {
    const source = checkpoint && typeof checkpoint === "object" ? checkpoint : {};
    const base = {
      version: signatureVersion,
      keeperId: source.keeperId || "",
      mapId: source.mapId || "",
      currentWave: clampInteger(source.currentWave ?? source.wave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
      clearedWave: clampInteger(source.clearedWave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
      lives: clampInteger(source.lives, 0, 999, 0),
      cash: clampInteger(source.cash, 0, LIMITS.MAX_RUN_CASH, 0),
      kills: clampInteger(source.kills, 0, LIMITS.MAX_REASONABLE_KILLS, 0),
      totalDamage: Math.round(clampNumber(source.totalDamage, 0, LIMITS.MAX_REASONABLE_DAMAGE, 0)),
      towerCount: Array.isArray(source.towers) ? source.towers.length : 0,
      bossCount: Array.isArray(source.bossesBeaten) ? source.bossesBeaten.length : 0,
      perfectWaveCount: clampInteger(source.perfectWaveCount, 0, LIMITS.MAX_REASONABLE_PERFECT_WAVES, 0),
      savedAt: clampInteger(source.savedAt, 0, Number.MAX_SAFE_INTEGER, 0)
    };
    if (signatureVersion < 3) return stableValue(base);
    const modern = {
      ...base,
      phase: typeof source.phase === "string" ? source.phase.slice(0, 30) : "",
      resumePhase: typeof source.resumePhase === "string" ? source.resumePhase.slice(0, 30) : "",
      speed: clampNumber(source.speed, 0.5, 2, 1),
      clock: Math.round(clampNumber(source.clock, 0, 1e9, 0) * 1000) / 1000,
      bossesDefeated: clampInteger(source.bossesDefeated, 0, LIMITS.MAX_REASONABLE_BOSSES, 0),
      waveTotal: clampInteger(source.waveTotal, 0, LIMITS.MAX_QUEUE_ENTRIES + LIMITS.MAX_CHILD_BUFFER, 0),
      waveResolved: clampInteger(source.waveResolved, 0, LIMITS.MAX_REASONABLE_KILLS, 0),
      towers: (Array.isArray(source.towers) ? source.towers : []).slice(0, LIMITS.MAX_DEFENSE_TOWERS).map(tower => {
        const signedTower = {
          id: typeof tower?.id === "string" ? tower.id.slice(0, 80) : "",
          petId: typeof tower?.petId === "string" ? tower.petId.slice(0, 80) : "",
          source: tower?.source === "house" ? "house" : "active",
          x: Math.round(clampNumber(tower?.x, 0, 1, 0.5) * 10000) / 10000,
          y: Math.round(clampNumber(tower?.y, 0, 1, 0.5) * 10000) / 10000,
          upgrade: clampInteger(tower?.upgrade, 0, LIMITS.MAX_TOWER_LEVEL, 0),
          kills: clampInteger(tower?.kills, 0, LIMITS.MAX_REASONABLE_KILLS, 0),
          damage: Math.round(clampNumber(tower?.damage, 0, LIMITS.MAX_REASONABLE_DAMAGE, 0)),
          doctrine: typeof tower?.doctrine === "string" ? tower.doctrine.slice(0, 20) : ""
        };
        if (signatureVersion >= 5) signedTower.openingPerkApplied = Boolean(tower?.openingPerkApplied);
        if (signatureVersion >= 7) signedTower.superForm = ["power", "control"].includes(tower?.superForm) ? tower.superForm : "";
        return stableValue(signedTower);
      }),
      enemies: (Array.isArray(source.enemies) ? source.enemies : []).slice(0, LIMITS.MAX_CHECKPOINT_ENEMIES).map(enemy => stableValue({
        id: typeof enemy?.id === "string" ? enemy.id.slice(0, 80) : "",
        type: typeof enemy?.type === "string" ? enemy.type.slice(0, 40) : "",
        bossId: typeof enemy?.bossId === "string" ? enemy.bossId.slice(0, 40) : "",
        progress: Math.round(clampNumber(enemy?.progress, 0, 1, 0) * 10000) / 10000,
        hpRatio: Math.round(clampNumber(enemy?.hpRatio, 0, 1, 1) * 10000) / 10000,
        armorBroken: Boolean(enemy?.armorBroken),
        armorShredded: Boolean(enemy?.armorShredded)
      })),
      spawnQueue: (Array.isArray(source.spawnQueue) ? source.spawnQueue : []).slice(0, LIMITS.MAX_QUEUE_ENTRIES).map(queueSignatureEntry),
      childSpawnQueue: (Array.isArray(source.childSpawnQueue) ? source.childSpawnQueue : []).slice(0, LIMITS.MAX_CHILD_BUFFER).map(item => stableValue({
        entry: queueSignatureEntry(item?.entry || item?.type),
        progress: Math.round(clampNumber(item?.progress, 0, 1, 0) * 10000) / 10000,
        releaseAt: Math.round(clampNumber(item?.releaseAt, 0, 1e9, 0) * 1000) / 1000
      }))
    };
    if (signatureVersion >= 5) modern.worldPerkUsed = Boolean(source.worldPerkUsed);
    if (signatureVersion >= 6) {
      modern.gateFlameReadyAt = Math.round(clampNumber(source.gateFlameReadyAt, 0, 1e9, 0) * 1000) / 1000;
      modern.gateFlameUntil = Math.round(clampNumber(source.gateFlameUntil, 0, 1e9, 0) * 1000) / 1000;
      modern.gateFlameProgress = Math.round(clampNumber(source.gateFlameProgress, 0, 1, .86) * 10000) / 10000;
      modern.gateFlameNextTick = Math.round(clampNumber(source.gateFlameNextTick, 0, 1e9, 0) * 1000) / 1000;
      modern.gateFlameTicks = clampInteger(source.gateFlameTicks, 0, 1000, 0);
    }
    if(signatureVersion>=8){
      // Sign the full combat continuation; old salts/payloads remain untouched.
      modern.continuation=stableValue({
        wavePackets:source.wavePackets||[],packetIndex:source.packetIndex||0,packetEnemyIndex:source.packetEnemyIndex||0,
        nextSpawnAt:source.nextSpawnAt||0,packetBreakUntil:source.packetBreakUntil||0,
        projectiles:source.projectiles||[],armor:(source.enemies||[]).map(e=>e.armor??null)
      });
    }
    if(signatureVersion>=9){
      // v9 closes the remaining combat-continuation holes without changing the
      // v8 payload, so existing v8 checkpoints remain verifiable/migratable.
      modern.tacticalContinuation=stableValue({
        contract:source.contract&&typeof source.contract==="object"?source.contract:null,
        towers:(Array.isArray(source.towers)?source.towers:[]).slice(0,LIMITS.MAX_DEFENSE_TOWERS).map(tower=>({
          id:typeof tower?.id==="string"?tower.id.slice(0,80):"",
          cooldown:Math.round(clampNumber(tower?.cooldown,0,60,0)*1000)/1000,
          abilityReadyAt:Math.round(clampNumber(tower?.abilityReadyAt,0,1e9,0)*1000)/1000,
          overclockUntil:Math.round(clampNumber(tower?.overclockUntil,0,1e9,0)*1000)/1000,
          rangeDebuffUntil:Math.round(clampNumber(tower?.rangeDebuffUntil,0,1e9,0)*1000)/1000,
          targetMode:typeof tower?.targetMode==="string"?tower.targetMode.slice(0,20):"",
          shots:clampInteger(tower?.shots,0,LIMITS.MAX_REASONABLE_KILLS*20,0),
          placedAt:Math.round(clampNumber(tower?.placedAt,0,1e9,0)*1000)/1000
        })),
        enemies:(Array.isArray(source.enemies)?source.enemies:[]).slice(0,LIMITS.MAX_CHECKPOINT_ENEMIES).map(enemy=>({
          id:typeof enemy?.id==="string"?enemy.id.slice(0,80):"",
          bossIntensity:clampInteger(enemy?.bossIntensity,0,99,0),bossChild:Boolean(enemy?.bossChild),
          armor:Math.round(clampNumber(enemy?.armor,0,.95,0)*10000)/10000,
          phaseOffset:Math.round(clampNumber(enemy?.phaseOffset,-100,100,0)*1000)/1000,
          revealUntil:Math.round(clampNumber(enemy?.revealUntil,0,1e9,0)*1000)/1000,
          phaseSuppressedUntil:Math.round(clampNumber(enemy?.phaseSuppressedUntil,0,1e9,0)*1000)/1000,
          revealCredited:Boolean(enemy?.revealCredited),phaseLockCredited:Boolean(enemy?.phaseLockCredited),
          slow:Math.round(clampNumber(enemy?.slow,0,.95,0)*10000)/10000,slowUntil:Math.round(clampNumber(enemy?.slowUntil,0,1e9,0)*1000)/1000,
          burn:Math.round(clampNumber(enemy?.burn,0,1e6,0)*1000)/1000,burnUntil:Math.round(clampNumber(enemy?.burnUntil,0,1e9,0)*1000)/1000,burnSourceId:typeof enemy?.burnSourceId==="string"?enemy.burnSourceId.slice(0,80):"",
          poison:Math.round(clampNumber(enemy?.poison,0,1e6,0)*1000)/1000,poisonUntil:Math.round(clampNumber(enemy?.poisonUntil,0,1e9,0)*1000)/1000,poisonSourceId:typeof enemy?.poisonSourceId==="string"?enemy.poisonSourceId.slice(0,80):"",
          rootUntil:Math.round(clampNumber(enemy?.rootUntil,0,1e9,0)*1000)/1000,phaseTriggered:Boolean(enemy?.phaseTriggered),
          nextBossPulse:Math.round(clampNumber(enemy?.nextBossPulse,0,1e9,0)*1000)/1000,telegraphKind:typeof enemy?.telegraphKind==="string"?enemy.telegraphKind.slice(0,40):"",
          telegraphStartedAt:Math.round(clampNumber(enemy?.telegraphStartedAt,0,1e9,0)*1000)/1000,telegraphUntil:Math.round(clampNumber(enemy?.telegraphUntil,0,1e9,0)*1000)/1000,
          telegraphDisruption:Math.round(clampNumber(enemy?.telegraphDisruption,0,1,0)*10000)/10000,apexSurgeUntil:Math.round(clampNumber(enemy?.apexSurgeUntil,0,1e9,0)*1000)/1000,bossMechanicLocked:Boolean(enemy?.bossMechanicLocked)
        })),
        rallyUntil:Math.round(clampNumber(source.rallyUntil,0,1e9,0)*1000)/1000,prismUntil:Math.round(clampNumber(source.prismUntil,0,1e9,0)*1000)/1000,
        whiteoutUntil:Math.round(clampNumber(source.whiteoutUntil,0,1e9,0)*1000)/1000,stormWeatherUntil:Math.round(clampNumber(source.stormWeatherUntil,0,1e9,0)*1000)/1000,
        eclipseUntil:Math.round(clampNumber(source.eclipseUntil,0,1e9,0)*1000)/1000,ashUntil:Math.round(clampNumber(source.ashUntil,0,1e9,0)*1000)/1000,
        moonRevealUntil:Math.round(clampNumber(source.moonRevealUntil,0,1e9,0)*1000)/1000,nextWeatherAt:Math.round(clampNumber(source.nextWeatherAt,0,1e9,0)*1000)/1000,
        bossesBeaten:(Array.isArray(source.bossesBeaten)?source.bossesBeaten:[]).slice(0,LIMITS.MAX_REASONABLE_BOSSES),
        waveHeartLossStart:clampInteger(source.waveHeartLossStart,0,9999,0),enemyStats:source.enemyStats&&typeof source.enemyStats==="object"?source.enemyStats:{}
      });
    }
    if(signatureVersion>=10){
      // v10 signs the support/boss-phase continuation that the enemy layer persists
      // (Relay signal staggering, Mender triage cadence, bounded boss second acts).
      // These change combat outcomes on restore, so leaving them unsigned would let a
      // tampered save freeze a convoy or hand a boss an arbitrary phase. Added as its
      // own block so the v9 payload is byte-identical and v2-v9 stay verifiable.
      modern.supportContinuation=stableValue({
        enemies:(Array.isArray(source.enemies)?source.enemies:[]).slice(0,LIMITS.MAX_CHECKPOINT_ENEMIES).map(enemy=>({
          id:typeof enemy?.id==="string"?enemy.id.slice(0,80):"",
          supportCycle:clampInteger(enemy?.supportCycle,-1e6,1e6,0),
          signalStaggerUntil:Math.round(clampNumber(enemy?.signalStaggerUntil,0,1e9,0)*1000)/1000,
          bossPhase:clampInteger(enemy?.bossPhase,0,99,0)
        }))
      });
    }
    return stableValue(modern);
  }

  function createSaveSignature(checkpoint, signatureVersion = VERSION) {
    const version = clampInteger(signatureVersion, 2, VERSION, VERSION);
    const salt = CHECKPOINT_SALTS[version];
    if (!salt) return "";
    return `v${version}.${fnv1a(`${salt}|${JSON.stringify(checkpointSignaturePayload(checkpoint, version))}`)}`;
  }

  function verifySaveSignature(checkpoint) {
    if (!checkpoint || typeof checkpoint !== "object" || typeof checkpoint.signature !== "string") return false;
    const match = /^v(\d+)\./.exec(checkpoint.signature);
    const version = match ? Number(match[1]) : 0;
    return Boolean(CHECKPOINT_SALTS[version]) && checkpoint.signature === createSaveSignature(checkpoint, version);
  }

  function stateSignaturePayload(state, savedAt, schemaVersion = STATE_SAVE_VERSION) {
    const source = state && typeof state === "object" ? state : {};
    const scores = source.scores && typeof source.scores === "object" ? source.scores : {};
    const pet = source.pet && typeof source.pet === "object" ? source.pet : {};
    const farm = source.farm && typeof source.farm === "object" ? source.farm : {};
    const inventory = source.inventory && typeof source.inventory === "object" ? source.inventory : {};
    const collection = source.collection && typeof source.collection === "object" && !Array.isArray(source.collection) ? source.collection : {};
    const defenseMaps = scores.defenseMaps && typeof scores.defenseMaps === "object" && !Array.isArray(scores.defenseMaps) ? scores.defenseMaps : {};
    const defenseMastery = scores.defenseMastery && typeof scores.defenseMastery === "object" && !Array.isArray(scores.defenseMastery) ? scores.defenseMastery : {};
    return stableValue({
      schemaVersion,
      stateVersion: clampInteger(source.version, 0, 10_000, 0),
      savedAt: clampInteger(savedAt, 0, Number.MAX_SAFE_INTEGER, 0),
      player: {
        keeperId: typeof source.player?.keeperId === "string" ? source.player.keeperId.slice(0, 80) : "",
        streak: clampInteger(source.player?.streak, 0, LIMITS.MAX_META_COUNTER, 0),
        totalSessions: clampInteger(source.player?.totalSessions, 0, LIMITS.MAX_META_COUNTER, 0)
      },
      wallet: {
        embers: clampInteger(source.wallet?.embers, 0, LIMITS.MAX_WALLET_EMBERS, 0),
        shards: clampInteger(source.wallet?.shards, 0, LIMITS.MAX_WALLET_SHARDS, 0)
      },
      pet: {
        id: typeof pet.id === "string" ? pet.id.slice(0, 80) : "",
        number: clampInteger(pet.number, 0, LIMITS.MAX_META_COUNTER, 0),
        name: typeof pet.name === "string" ? pet.name.slice(0, 20) : "",
        stage: typeof pet.stage === "string" ? pet.stage.slice(0, 30) : "",
        variant: typeof (pet.variant || pet.hiddenVariant) === "string" ? (pet.variant || pet.hiddenVariant).slice(0, 30) : "",
        form: typeof pet.form === "string" ? pet.form.slice(0, 30) : "",
        xp: Math.round(clampNumber(pet.xp, 0, LIMITS.MAX_PLAYER_XP, 0)),
        bond: Math.round(clampNumber(pet.bond, 0, 100, 0) * 100) / 100,
        skills: stableValue(pet.skills || {}),
        genes: stableValue(pet.genes || {})
      },
      inventory: {
        accessories: (Array.isArray(inventory.accessories) ? inventory.accessories : []).slice(0, 200),
        rooms: (Array.isArray(inventory.rooms) ? inventory.rooms : []).slice(0, 200),
        phoenix: clampInteger(inventory.phoenix, 0, LIMITS.MAX_INVENTORY_STACK, 0),
        growth: clampInteger(inventory.growth, 0, LIMITS.MAX_INVENTORY_STACK, 0),
        care: clampInteger(inventory.care, 0, LIMITS.MAX_INVENTORY_STACK, 0)
      },
      achievements: (Array.isArray(source.achievements) ? source.achievements : []).slice(0, 500),
      daily: {
        date: typeof source.daily?.date === "string" ? source.daily.date.slice(0, 20) : "",
        type: typeof source.daily?.type === "string" ? source.daily.type.slice(0, 30) : "",
        progress: clampNumber(source.daily?.progress, 0, LIMITS.MAX_META_COUNTER, 0),
        claimed: Boolean(source.daily?.claimed),
        giftClaimed: Boolean(source.daily?.giftClaimed)
      },
      season: {
        xp: clampNumber(source.season?.xp, 0, LIMITS.MAX_SEASON_XP, 0),
        level: clampInteger(source.season?.level, 1, LIMITS.MAX_SEASON_LEVEL, 1)
      },
      expedition: stableValue(source.expedition || {}),
      treasures: stableValue(source.treasures || {}),
      collection: Object.fromEntries(Object.entries(collection).slice(0, 200).map(([id, count]) => [id.slice(0, 40), clampInteger(count, 0, LIMITS.MAX_COLLECTION_COUNT, 0)])),
      arcade: Object.fromEntries(["power", "spark", "forage", "rush", "walk", "rhythm", "memory", "glide", "breaker", "maze"].map(id => [id, clampNumber(scores[id], 0, LIMITS.MAX_REASONABLE_DAMAGE, 0)])),
      defense: {
        best: clampInteger(scores.defense, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
        maps: Object.fromEntries(Object.entries(defenseMaps).slice(0, 20).map(([id, wave]) => [id.slice(0, 40), clampInteger(wave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0)])),
        milestones: (Array.isArray(scores.defenseMilestones) ? scores.defenseMilestones : []).slice(0, 20),
        perfectMaps: (Array.isArray(scores.defensePerfectMaps) ? scores.defensePerfectMaps : []).slice(0, 20),
        contracts: (Array.isArray(scores.defenseContracts) ? scores.defenseContracts : []).slice(0, 60).map(contract => ({
          id: typeof contract?.id === "string" ? contract.id.slice(0, 80) : "",
          date: typeof contract?.date === "string" ? contract.date.slice(0, 20) : "",
          mapId: typeof contract?.mapId === "string" ? contract.mapId.slice(0, 40) : "",
          targetWave: clampInteger(contract?.targetWave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
          bestWave: clampInteger(contract?.bestWave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
          completed: Boolean(contract?.completed),
          perfect: Boolean(contract?.perfect)
        })),
        history: (Array.isArray(scores.defenseHistory) ? scores.defenseHistory : []).slice(0, 12).map(run => ({
          id: typeof run?.id === "string" ? run.id.slice(0, 80) : "",
          mapId: typeof run?.mapId === "string" ? run.mapId.slice(0, 40) : "",
          clearedWave: clampInteger(run?.clearedWave ?? run?.wave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
          reachedWave: clampInteger(run?.reachedWave ?? run?.currentWave ?? run?.wave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
          kills: clampInteger(run?.kills, 0, LIMITS.MAX_REASONABLE_KILLS, 0),
          bosses: clampInteger(run?.bosses, 0, LIMITS.MAX_REASONABLE_BOSSES, 0),
          perfectWaveCount: clampInteger(run?.perfectWaveCount, 0, LIMITS.MAX_REASONABLE_PERFECT_WAVES, 0)
        })),
        mastery: Object.fromEntries(Object.entries(defenseMastery).slice(0, 100).map(([id, row]) => [id.slice(0, 80), {
          runs: clampInteger(row?.runs, 0, LIMITS.MAX_MASTERY_RUNS, 0),
          waves: clampInteger(row?.waves, 0, LIMITS.MAX_MASTERY_WAVES, 0),
          bestWave: clampInteger(row?.bestWave, 0, LIMITS.MAX_SUPPORTED_WAVE, 0),
          pops: clampInteger(row?.pops, 0, LIMITS.MAX_REASONABLE_KILLS, 0),
          damage: Math.round(clampNumber(row?.damage, 0, LIMITS.MAX_REASONABLE_DAMAGE, 0))
        }]))
      },
      farm: {
        activeRoom: clampInteger(farm.activeRoom, 0, 100, 0),
        unlockedRooms: (Array.isArray(farm.unlockedRooms) ? farm.unlockedRooms : []).slice(0, 100),
        totalAdoptions: clampInteger(farm.totalAdoptions, 0, LIMITS.MAX_META_COUNTER, 0),
        totalReleased: clampInteger(farm.totalReleased, 0, LIMITS.MAX_META_COUNTER, 0),
        materials: clampInteger(farm.materials, 0, LIMITS.MAX_INVENTORY_STACK, 0),
        roster: (Array.isArray(farm.roster) ? farm.roster : []).slice(0, 100).map(row => ({
          id: typeof row?.id === "string" ? row.id.slice(0, 80) : "",
          number: clampInteger(row?.number, 0, LIMITS.MAX_META_COUNTER, 0),
          stage: typeof row?.stage === "string" ? row.stage.slice(0, 30) : "",
          variant: typeof (row?.variant || row?.hiddenVariant) === "string" ? (row.variant || row.hiddenVariant).slice(0, 30) : "",
          xp: Math.round(clampNumber(row?.xp, 0, LIMITS.MAX_PLAYER_XP, 0)),
          skills: stableValue(row?.skills || {})
        }))
      },
      meta: {
        totalGames: clampInteger(source.meta?.totalGames, 0, LIMITS.MAX_META_COUNTER, 0),
        totalHatched: clampInteger(source.meta?.totalHatched, 0, LIMITS.MAX_META_COUNTER, 0),
        totalTaps: clampInteger(source.meta?.totalTaps, 0, LIMITS.MAX_META_COUNTER, 0),
        totalCareActions: clampInteger(source.meta?.totalCareActions, 0, LIMITS.MAX_META_COUNTER, 0),
        totalWalks: clampInteger(source.meta?.totalWalks, 0, LIMITS.MAX_META_COUNTER, 0),
        deaths: clampInteger(source.meta?.deaths, 0, LIMITS.MAX_META_COUNTER, 0),
        recoveries: clampInteger(source.meta?.recoveries, 0, LIMITS.MAX_META_COUNTER, 0),
        capsules: clampInteger(source.meta?.capsules, 0, LIMITS.MAX_META_COUNTER, 0),
        rebirths: clampInteger(source.meta?.rebirths, 0, LIMITS.MAX_META_COUNTER, 0),
        bondEggs: clampInteger(source.meta?.bondEggs, 0, LIMITS.MAX_META_COUNTER, 0),
        pity: clampInteger(source.meta?.pity, 0, LIMITS.MAX_META_COUNTER, 0),
        shadowFinds: clampInteger(source.meta?.shadowFinds, 0, LIMITS.MAX_META_COUNTER, 0)
      },
      loreUnlocked: (Array.isArray(source.loreUnlocked) ? source.loreUnlocked : []).slice(0, 200)
    });
  }

  function createStateSignature(state, savedAt, schemaVersion = STATE_SAVE_VERSION) {
    const version = clampInteger(schemaVersion, 1, STATE_SAVE_VERSION, STATE_SAVE_VERSION);
    return `s${version}.${fnv1a(`${STATE_SAVE_SALT}|${JSON.stringify(stateSignaturePayload(state, savedAt, version))}`)}`;
  }

  function verifyStateSignature(envelope) {
    if (!envelope || typeof envelope !== "object" || typeof envelope.signature !== "string") return false;
    const version = clampInteger(envelope.saveVersion, 1, STATE_SAVE_VERSION, 0);
    if (!version || !envelope.state || typeof envelope.state !== "object") return false;
    return envelope.signature === createStateSignature(envelope.state, envelope.savedAt, version);
  }

  return {
    VERSION,
    STATE_SAVE_VERSION,
    LIMITS,
    PHASES,
    PHASE_TRANSITIONS,
    BUDGETS,
    SIMULATION,
    UPGRADE_COSTS,
    ECONOMY,
    STRUCTURES,
    clampNumber,
    clampInteger,
    isKnownId,
    normalizePhase,
    isCombatPhase,
    canTransitionPhase,
    phaseAllows,
    performanceTier,
    visualBudget,
    childReservationCount,
    densityCap,
    upgradeCost,
    calculateTowerInvestment,
    deploymentCost,
    structureDefinition,
    structureDeploymentCost,
    structureUpgradeCost,
    calculateStructureInvestment,
    beaconSupport,
    goldenFactoryMultiplier,
    factoryEconomy,
    goldenBonus,
    goldenActivePayout,
    recommendedTowerCount,
    calculateWaveBonus,
    calculateRunEmbers,
    calculateEnemyReward,
    plannedEnemyCount,
    packetPacingForWave,
    splitIntoPackets,
    createWavePlan,
    flattenPackets,
    createSaveSignature,
    verifySaveSignature,
    createStateSignature,
    verifyStateSignature
  };
});
