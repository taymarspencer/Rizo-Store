const assert = require('assert');
const Core = require('../defense-core-v79.js');

const checks = [];
function test(name, fn){
  try { fn(); checks.push([name,true]); console.log('PASS',name); }
  catch (error){ checks.push([name,false]); console.error('FAIL',name,error.message); }
}

test('Factory deployment curve is explicit and increasingly expensive',()=>{
  const costs=[0,1,2,3].map(copy=>Core.structureDeploymentCost('factory',copy));
  assert.deepStrictEqual(costs,[160,235,320,425]);
  assert(costs.every((value,index)=>index===0||value>costs[index-1]));
});

test('Beacon deployment curve is separate from normal Rizo pricing',()=>{
  const costs=[0,1,2].map(copy=>Core.structureDeploymentCost('beacon',copy));
  assert.deepStrictEqual(costs,[175,255,355]);
  assert.notStrictEqual(costs[0],Core.deploymentCost({paidTowerCount:0,copyCount:0,activeFirst:false}));
});

test('Factory starts humble and max investment becomes an industrial drop engine',()=>{
  const opening=Core.factoryEconomy({upgradeLevel:0,wave:1});
  const industrial=Core.factoryEconomy({upgradeLevel:4,wave:90,goldenTowerCount:3,beaconUpgradeLevel:4,cleanCycles:1,brandLoop:true,privateSun:true,goldenLicensed:true});
  assert.strictEqual(opening.payout,12); assert.strictEqual(opening.interval,7.2); assert.strictEqual(opening.dropEvery,0);
  assert(Math.abs(industrial.goldenMultiplier-1.36)<1e-9);
  assert.strictEqual(industrial.cadenceMultiplier,.70);
  assert.strictEqual(industrial.dropEvery,2);
  assert.strictEqual(industrial.isDrop,true);
  assert(industrial.payout/industrial.interval > 250,'late Factory drop should be an obvious payoff event');
  assert(industrial.payout/industrial.interval > (opening.payout/opening.interval)*120);
});

test('Clean production builds momentum and PRINT LINE converts it into periodic RIZO DROPS',()=>{
  const early=Core.factoryEconomy({upgradeLevel:2,wave:10,cleanCycles:0});
  const preDrop=Core.factoryEconomy({upgradeLevel:2,wave:10,cleanCycles:2});
  const drop=Core.factoryEconomy({upgradeLevel:2,wave:10,cleanCycles:3});
  assert(early.momentumMultiplier===1 && preDrop.momentumMultiplier>1);
  assert.strictEqual(drop.isDrop,true);
  assert.strictEqual(drop.dropEvery,4);
  assert(drop.payout>preDrop.payout*1.4);
});

test('A mixed Beacon Brand Loop accelerates drops without affecting level-one readability',()=>{
  const simple=Core.factoryEconomy({upgradeLevel:0,wave:10,cleanCycles:5,brandLoop:true});
  const normal=Core.factoryEconomy({upgradeLevel:2,wave:10,cleanCycles:2});
  const linked=Core.factoryEconomy({upgradeLevel:2,wave:10,cleanCycles:2,brandLoop:true});
  assert.strictEqual(simple.dropEvery,0);
  assert.strictEqual(normal.dropEvery,4);
  assert.strictEqual(linked.dropEvery,3);
  assert.strictEqual(linked.isDrop,true);
});

test('Private Sun and Golden License amplify branded drops, not every ordinary print',()=>{
  const ordinary=Core.factoryEconomy({upgradeLevel:4,wave:40,cleanCycles:2,brandLoop:true,privateSun:true,goldenLicensed:true});
  const baseDrop=Core.factoryEconomy({upgradeLevel:4,wave:40,cleanCycles:1,brandLoop:true});
  const licensedDrop=Core.factoryEconomy({upgradeLevel:4,wave:40,cleanCycles:1,brandLoop:true,privateSun:true,goldenLicensed:true});
  assert.strictEqual(ordinary.isDrop,false);
  assert.strictEqual(ordinary.dropMultiplier,1);
  assert.strictEqual(baseDrop.isDrop,true);
  assert(licensedDrop.dropMultiplier>baseDrop.dropMultiplier);
  assert(licensedDrop.payout>baseDrop.payout);
});

test('Golden-to-Factory global synergy is capped rather than infinitely stackable',()=>{
  assert.strictEqual(Core.goldenFactoryMultiplier(0),1);
  assert.strictEqual(Core.goldenFactoryMultiplier(1),1.12);
  assert(Math.abs(Core.goldenFactoryMultiplier(3)-1.36)<1e-9);
  assert(Math.abs(Core.goldenFactoryMultiplier(10)-1.36)<1e-9);
});

test('Beacon progression culminates in a battlefield-defining support field',()=>{
  const first=Core.beaconSupport(0),sun=Core.beaconSupport(4);
  assert.deepStrictEqual(first,{level:0,radius:.18,rateMultiplier:1.14,damageMultiplier:1,factoryCadenceMultiplier:1});
  assert.deepStrictEqual(sun,{level:4,radius:.32,rateMultiplier:1.55,damageMultiplier:1.30,factoryCadenceMultiplier:.70});
  assert(sun.radius>first.radius && sun.rateMultiplier>first.rateMultiplier && sun.damageMultiplier>first.damageMultiplier);
});

test('Structure investment is derived from canonical costs for checkpoint safety',()=>{
  assert.strictEqual(Core.calculateStructureInvestment('factory',160,4),2060);
  assert.strictEqual(Core.calculateStructureInvestment('beacon',175,4),1980);
});

const passed=checks.filter(([,ok])=>ok).length;
console.log(`\n${passed}/${checks.length} Worker B economy tests passed.`);
if(passed!==checks.length) process.exit(1);
