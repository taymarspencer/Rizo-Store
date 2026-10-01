'use strict';

const assert = require('node:assert/strict');
const core = require('../defense-core-v79.js');

const tests = [];
const test = (name, fn) => tests.push({name, fn});
const clone = value => JSON.parse(JSON.stringify(value));

function representativeCheckpoint() {
  return {
    checkpointVersion: core.VERSION,
    savedAt: 1_726_154_000_000,
    keeperId: 'keeper-qa',
    mapId: 'grove',
    contract: {id:'qa-contract', mapId:'grove', targetWave:10, bestWave:6, completed:false, perfect:false, rules:['steady']},
    currentWave: 7,
    clearedWave: 6,
    lives: 7,
    cash: 540,
    phase: core.PHASES.COMBAT,
    resumePhase: core.PHASES.COMBAT,
    speed: 2,
    clock: 42.125,
    towers: [{
      id:'tower-1', petId:'pet-main', source:'active', x:.31, y:.56, upgrade:3,
      cooldown:.24, kills:18, damage:1200, abilityReadyAt:54.4, overclockUntil:44.9,
      rangeDebuffUntil:46.1, targetMode:'strong', doctrine:'power', shots:44,
      placedAt:2.5, openingPerkApplied:false, superForm:null
    }],
    enemies: [{
      id:'enemy-1', type:'shell', bossId:null, bossIntensity:0, bossChild:false,
      progress:.44, hpRatio:.61, armor:.18, armorBroken:false, armorShredded:true,
      phaseOffset:.1, revealUntil:45, phaseSuppressedUntil:46, revealCredited:true,
      phaseLockCredited:false, supportCycle:3, signalStaggerUntil:0, bossPhase:0,
      slow:.2, slowUntil:44, burn:12, burnUntil:45,
      burnSourceId:'tower-1', poison:4, poisonUntil:46, poisonSourceId:'tower-1',
      rootUntil:43, phaseTriggered:false, nextBossPulse:0, telegraphKind:'',
      telegraphStartedAt:0, telegraphUntil:0, telegraphDisruption:0,
      apexSurgeUntil:0, bossMechanicLocked:false
    }],
    projectiles: [{towerId:'tower-1',targetId:'enemy-1',x:.35,y:.54,life:.22,damage:41,speed:1.8,doctrineStrike:'power'}],
    spawnQueue:['puff','fleet'],
    wavePackets:[{enemies:['puff','fleet'],spawnGap:.34,breakAfter:1.1}],
    packetIndex:0,
    packetEnemyIndex:1,
    nextSpawnAt:42.3,
    packetBreakUntil:0,
    childSpawnQueue:[],
    bossesBeaten:['crown'],
    bossesDefeated:1,
    perfectWaveCount:4,
    waveTotal:12,
    waveResolved:5,
    worldPerkUsed:false,
    gateFlameReadyAt:60,
    gateFlameUntil:0,
    gateFlameProgress:.86,
    gateFlameNextTick:0,
    gateFlameTicks:0,
    rallyUntil:44,
    prismUntil:0,
    whiteoutUntil:0,
    stormWeatherUntil:47,
    eclipseUntil:0,
    ashUntil:0,
    moonRevealUntil:0,
    nextWeatherAt:55,
    waveHeartLossStart:1,
    enemyStats:{spawned:{puff:4,shell:1},popped:{puff:3},leaked:{puff:1},heartLoss:1,counters:{armorBreaks:0,armorShreds:1,reveals:1,phaseLocks:0,bossInterrupts:0}}
  };
}

function signed(version) {
  const save = representativeCheckpoint();
  save.checkpointVersion = version;
  save.signature = core.createSaveSignature(save, version);
  return save;
}

test('checkpoint schema never regresses below the v9 continuation guard and keeps the projectile budget', () => {
  // Pinning an exact version made a legitimate forward bump look like a failure while
  // still being the point of the check, which is that a merge must never silently
  // revert below Worker J's continuation coverage. Assert the floor instead.
  assert.ok(core.VERSION >= 9, `checkpoint schema regressed to v${core.VERSION}`);
  assert.equal(core.LIMITS.MAX_CHECKPOINT_PROJECTILES, 32);
});

test('v10 signs the support/boss-phase continuation that v9 did not cover', () => {
  const legacy = signed(9);
  const current = signed(core.VERSION);
  assert.match(current.signature, new RegExp(`^v${core.VERSION}\\.`));
  assert.equal(core.verifySaveSignature(legacy), true);
  assert.equal(core.verifySaveSignature(current), true);
  for (const field of ['supportCycle', 'signalStaggerUntil', 'bossPhase']) {
    const tamperedLegacy = signed(9);
    tamperedLegacy.enemies[0][field] = 7;
    assert.equal(core.verifySaveSignature(tamperedLegacy), true, `v9 unexpectedly signed ${field}`);
    const tamperedCurrent = signed(core.VERSION);
    tamperedCurrent.enemies[0][field] = 7;
    assert.equal(core.verifySaveSignature(tamperedCurrent), false, `v${core.VERSION} must sign ${field}`);
  }
});

test('legacy v8 continuation signatures remain verifiable after v9 upgrade', () => {
  const save = signed(8);
  assert.match(save.signature, /^v8\./);
  assert.equal(core.verifySaveSignature(save), true);
});

test('v9 signs tactical tower continuation that v8 intentionally did not cover', () => {
  const legacy = signed(8);
  legacy.towers[0].abilityReadyAt += 15;
  assert.equal(core.verifySaveSignature(legacy), true, 'documents the legacy v8 gap needed for migration coverage');

  const current = signed(9);
  current.towers[0].abilityReadyAt += 15;
  assert.equal(core.verifySaveSignature(current), false);
});

test('v9 signs status, weather, contract and perfect-wave continuation state', () => {
  const mutations = [
    save => { save.enemies[0].burn += 1; },
    save => { save.enemies[0].rootUntil += 1; },
    save => { save.enemies[0].telegraphDisruption = .4; },
    save => { save.rallyUntil += 1; },
    save => { save.nextWeatherAt += 1; },
    save => { save.contract.bestWave += 1; },
    save => { save.waveHeartLossStart += 1; },
    save => { save.enemyStats.heartLoss += 1; }
  ];
  for (const mutate of mutations) {
    const save = signed(9);
    assert.equal(core.verifySaveSignature(save), true);
    mutate(save);
    assert.equal(core.verifySaveSignature(save), false);
  }
});

test('wave planning is deterministic at authored, boss and endless-range waves', () => {
  for (const wave of [1, 5, 10, 11, 20, 50, 100, 250]) {
    assert.deepEqual(core.createWavePlan({wave}), core.createWavePlan({wave}), `wave ${wave}`);
  }
});

test('gameplay density remains invariant while presentation budgets degrade safely', () => {
  const canonical = core.densityCap({low:false,speed:1,bossActive:false});
  assert.equal(core.densityCap({low:false,speed:2,bossActive:false}), canonical);
  assert.equal(core.densityCap({low:true,speed:1,bossActive:false}), canonical);
  assert.equal(core.densityCap({low:true,speed:2,bossActive:false}), canonical);
  const normal = core.visualBudget({low:false,speed:1});
  const lowFast = core.visualBudget({low:true,speed:2});
  assert.ok(lowFast.maxVisibleProjectiles <= normal.maxVisibleProjectiles);
  assert.ok(lowFast.maxImpactEffects <= normal.maxImpactEffects);
  assert.ok(lowFast.presentationFps <= normal.presentationFps);
});

test('whole-save signature protects Defense history and mastery progression', () => {
  const state = {
    version:18, player:{keeperId:'keeper-qa',streak:0,totalSessions:1}, wallet:{embers:10,shards:0},
    pet:{id:'pet-main',number:1,name:'RIZO',stage:'kid',variant:'classic',xp:10,bond:10,skills:{},genes:{}},
    inventory:{accessories:[],rooms:[],phoenix:0,growth:0,care:0}, collection:{classic:1}, achievements:[],
    daily:{date:'2026-09-12',type:'tap',progress:0,claimed:false,giftClaimed:false}, season:{xp:0,level:1},
    expedition:{}, treasures:{}, farm:{activeRoom:0,unlockedRooms:[0],totalAdoptions:0,totalReleased:0,materials:0,roster:[]},
    meta:{totalGames:0,totalHatched:1,totalTaps:0,totalCareActions:0,totalWalks:0,deaths:0,recoveries:0,capsules:0,rebirths:0,bondEggs:0,pity:0,shadowFinds:0}, loreUnlocked:[],
    scores:{defense:10,defenseMaps:{grove:10},defenseMilestones:[],defensePerfectMaps:[],defenseContracts:[],
      defenseHistory:[{id:'run-1',mapId:'grove',clearedWave:10,reachedWave:10,kills:40,bosses:1,perfectWaveCount:8}],
      defenseMastery:{'pet-main':{runs:1,waves:10,bestWave:10,pops:40,damage:5000}}}
  };
  const savedAt = 1_726_154_000_000;
  const envelope = {saveVersion:core.STATE_SAVE_VERSION,savedAt,state};
  envelope.signature = core.createStateSignature(state,savedAt,envelope.saveVersion);
  assert.equal(core.verifyStateSignature(envelope), true);
  const historyTamper = clone(envelope); historyTamper.state.scores.defenseHistory[0].clearedWave = 20;
  assert.equal(core.verifyStateSignature(historyTamper), false);
  const masteryTamper = clone(envelope); masteryTamper.state.scores.defenseMastery['pet-main'].waves = 999;
  assert.equal(core.verifyStateSignature(masteryTamper), false);
});

let failures = 0;
for (const {name, fn} of tests) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}\n${error.stack || error}`); }
}
console.log(`\n${tests.length - failures}/${tests.length} Worker J guard tests passed.`);
if (failures) process.exitCode = 1;
