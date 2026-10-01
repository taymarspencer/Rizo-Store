// Test-only access to production functions. No combat rules or rewards are replaced.
defenseSliceDrive: (style='mixed',speed=1,low=false) => {
 const d=mini.defense;d.speed=speed;if(low){d.performanceLow=true;defenseApplyRenderTier(d,2);}const result=[];
 const buy=(pet,x,y)=>{const rows=defenseDeployRows();const row=rows.find(r=>r.pet.id===pet)||rows[0];return placeDefenseTower(row,x,y,defenseDeployCost(row));};
 const up=(i,path)=>{const t=d.towers[i];if(!t)return;upgradeDefenseTower(t.id);if(t.upgrade>=2&&!t.doctrine)chooseDefenseDoctrine(t.id,path||'power');};
 buy(null,.41,.65);
 if(style==='mixed')buy('HOUSE-violet',.13,.44);
 if(style==='classic')buy(null,.76,.44);
 for(let w=1;w<=10;w++){
  if(style!=='idle'){
   if(w===2)up(0);
   if(w===3)up(1,'control');
   if(w>=4&&d.towers.length<3)buy(style==='mixed'?'HOUSE-obsidian':null,style==='mixed'?.76:.13,style==='mixed'?.44:.44);
   if(w>=5&&d.towers[0].upgrade<2&&d.cash>=defenseUpgradeCost(d.towers[0]))up(0,'power');
   if(w>=6&&d.towers[1]?.upgrade<2&&d.cash>=defenseUpgradeCost(d.towers[1]))up(1,'control');
   if(w>=7&&d.towers.length<4)buy(style==='mixed'?'HOUSE-frost':null,.48,.23);
   if(w===8)up(3,'power');
   if(w===9)up(2,'power');
   if(w===10){for(const i of [3,0,2,1,3,0]){const t=d.towers[i];if(t&&d.cash>=defenseUpgradeCost(t))up(i,i===3?'control':'power');}}
  }
  closeDefenseTowerPanel();for(let f=0;f<25;f++)advanceDefenseFixedFrame(1/30);
  const begin=d.clock,spent=d.towers.reduce((a,t)=>a+t.spent,0);if(!startDefenseWave())break;
  let maxFront=0,bossWithEscort=false,frames=0,casts=0;
  while(frames++<6000&&defenseIsSimulating(d)&&!d.ending){advanceDefenseFixedFrame(1/(30*speed));const leader=d.towers[0];if(style!=='idle'&&d.enemies.some(e=>e.progress>.38)&&leader.upgrade>=2&&leader.doctrine&&defenseAbilityRemaining(leader)<=0){if(activateDefenseAbility(leader.id))casts++;}maxFront=Math.max(maxFront,...d.enemies.map(e=>e.progress));if(d.enemies.some(e=>e.bossId)&&d.enemies.some(e=>!e.bossId))bossWithEscort=true;}
  result.push({casts,bosses:d.bossesDefeated,wave:w,clear:d.clearedWave,seconds:+(d.clock-begin).toFixed(2),lives:d.lives,cash:Math.floor(d.cash),spent,towers:d.towers.map(t=>({v:t.pet.variant,u:t.upgrade,k:t.kills})),peak:d.peakAlive,maxFront:+maxFront.toFixed(2),bossWithEscort,kills:d.kills,spawned:{...d.enemyStats.spawned},resolved:d.waveResolved,total:d.waveTotal});
  if(d.ending||d.lives<=0)break;
 }
 return {waves:result,cash:d.cash,peak:d.maxActiveEnemiesObserved,projectiles:d.maxLogicalProjectilesObserved,simStepP95:d.simStepP95,scans:d.targetScans,renderer:d.rendererMode};
},
