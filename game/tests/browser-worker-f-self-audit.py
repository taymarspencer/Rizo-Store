"""Worker F deliberate acceptance audit: speed, pause/resume, late phone path, unrelated Defense launch."""
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def check(name, ok, detail=''):
    checks.append(bool(ok)); print(('PASS' if ok else 'FAIL'), name, detail, flush=True)

def setup(page, map_id='grove', renderer='canvas', unlock_all=False):
    page.set_content(build_inline_app(True, embed_assets=True), wait_until='domcontentloaded', timeout=120000)
    page.evaluate(f'RizoRuntimeQA.defenseSetRendererForQA("{renderer}")')
    state_setup = SETUP_STATE.replace('s.collection.classic=1;', 's.collection.classic=1;s.scores.defense=9999;') if unlock_all else SETUP_STATE
    page.evaluate(state_setup)
    page.evaluate(f'RizoRuntimeQA.startMiniGame("defense",{{mapId:"{map_id}"}});document.querySelector("#defenseMapIntro")?.remove()')

def support_probe(page, speed):
    setup(page)
    return page.evaluate('''(speed)=>{
      const q=RizoRuntimeQA;
      q.defenseSetRunForQA({phase:"combat",clock:0});
      q.defenseSetSpeedForQA(speed);
      const relay=q.defenseSpawnForQA("relay",.30,1e9,1e9);
      const puff=q.defenseSpawnForQA("puff",.32,1e9,1e9);
      const mender=q.defenseSpawnForQA("mender",.44,1e9,1e9);
      const shell=q.defenseSpawnForQA("shell",.46,10,100);
      const realSeconds=4/speed, step=1/60;
      for(let t=0;t<realSeconds-1e-9;t+=step) q.defenseTickForQA(Math.min(step,realSeconds-t));
      const s=q.defenseSnapshotForQA();
      const by=id=>s.enemies.find(e=>e.id===id);
      return {clock:s.simulationClock,puff:by(puff.id),shell:by(shell.id),relay:by(relay.id),mender:by(mender.id),errors:[]};
    }''', speed)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])

    # Worker F mechanics should be deterministic at the same simulation time at 1x and 2x.
    p1=browser.new_page(viewport={'width':390,'height':844}); err1=[]; p1.on('pageerror', lambda e: err1.append(str(e)))
    one=support_probe(p1,1); p1.close()
    p2=browser.new_page(viewport={'width':390,'height':844}); err2=[]; p2.on('pageerror', lambda e: err2.append(str(e)))
    two=support_probe(p2,2); p2.close()
    same=lambda a,b,tol=1e-6: a is not None and b is not None and abs(a-b)<=tol
    check('Worker F support mechanics match at equal simulation time in 1x and 2x',
          same(one['clock'],two['clock'],.04) and same(one['puff']['progress'],two['puff']['progress'],.001) and same(one['shell']['hp'],two['shell']['hp'],.001),
          str({'1x':{'clock':one['clock'],'puff':one['puff']['progress'],'shellHp':one['shell']['hp']},'2x':{'clock':two['clock'],'puff':two['puff']['progress'],'shellHp':two['shell']['hp']}}))
    check('Worker F 1x/2x support probe has no runtime errors', not err1 and not err2, str(err1+err2))

    # New support logic must freeze under pause and continue after resume.
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]; page.on('pageerror', lambda e: errors.append(str(e))); setup(page)
    paused=page.evaluate('''()=>{
      const q=RizoRuntimeQA;q.defenseSetRunForQA({phase:"combat",clock:0});
      const relay=q.defenseSpawnForQA("relay",.30,1e9,1e9);
      const puff=q.defenseSpawnForQA("puff",.32,1e9,1e9);
      const mender=q.defenseSpawnForQA("mender",.44,1e9,1e9);
      const shell=q.defenseSpawnForQA("shell",.46,10,100);
      for(let i=0;i<30;i++)q.defenseTickForQA(1/30);
      const before=q.defenseSnapshotForQA();
      q.defensePauseForQA(true);
      for(let i=0;i<180;i++)q.defenseTickForQA(1/30);
      const frozen=q.defenseSnapshotForQA();
      q.defensePauseForQA(false);
      for(let i=0;i<120;i++)q.defenseTickForQA(1/30);
      const after=q.defenseSnapshotForQA();
      const get=(s,id)=>s.enemies.find(e=>e.id===id);
      return {before:{clock:before.simulationClock,puff:get(before,puff.id),shell:get(before,shell.id)},frozen:{clock:frozen.simulationClock,puff:get(frozen,puff.id),shell:get(frozen,shell.id)},after:{clock:after.simulationClock,puff:get(after,puff.id),shell:get(after,shell.id)},phase:q.defensePhaseForQA()};
    }''')
    check('Pause freezes Relay movement and Mender healing',
          same(paused['before']['clock'],paused['frozen']['clock'],1e-9) and same(paused['before']['puff']['progress'],paused['frozen']['puff']['progress'],1e-9) and same(paused['before']['shell']['hp'],paused['frozen']['shell']['hp'],1e-9), str(paused))
    check('Resume continues Worker F support simulation',
          paused['after']['clock']>paused['frozen']['clock'] and paused['after']['puff']['progress']>paused['frozen']['puff']['progress'] and paused['after']['shell']['hp']>=paused['frozen']['shell']['hp'], str(paused['after']))
    check('Pause/resume support probe has no runtime errors', not errors, str(errors)); page.close()

    # Post-30 actual runtime path at a phone viewport, not only plan generation.
    phone=browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=3); phone_errors=[]; phone.on('pageerror', lambda e: phone_errors.append(str(e))); setup(phone)
    late=phone.evaluate('''()=>{
      const q=RizoRuntimeQA;q.defensePlaceNextForQA();q.defenseSetCashForQA(5000);const forced=q.defenseForceWaveForQA(40);
      for(let i=0;i<360;i++)q.defenseTickForQA(1/60);
      const s=q.defenseSnapshotForQA(), shell=document.querySelector('.defense-shell')?.getBoundingClientRect(), stage=document.querySelector('.defense-stage-frame')?.getBoundingClientRect();
      return {forced,s,shell: shell&&{x:shell.x,y:shell.y,right:shell.right,bottom:shell.bottom,w:shell.width,h:shell.height},stage:stage&&{x:stage.x,y:stage.y,right:stage.right,bottom:stage.bottom,w:stage.width,h:stage.height},inner:[innerWidth,innerHeight]};
    }''')
    shell=late['shell']; stage=late['stage']; w,h=late['inner']
    contained=lambda b: b and b['x']>=-1 and b['y']>=-1 and b['right']<=w+1 and b['bottom']<=h+1
    check('Wave 40 executes on a phone-sized canvas path', late['forced']['currentWave']==40 and late['s']['currentWave']==40 and late['s']['rendererMode']=='canvas' and (late['s']['packetCount']>0 or len(late['s']['enemies'])>0), str({'forced':late['forced'],'phase':late['s']['phase'],'enemies':len(late['s']['enemies']),'queuePackets':late['s']['packetCount'],'renderer':late['s']['rendererMode']}))
    check('Late-wave phone shell and battlefield remain inside viewport', contained(shell) and contained(stage), str({'shell':shell,'stage':stage,'viewport':late['inner']}))
    check('Late-wave phone runtime stays within active enemy density budget', late['s']['maxActiveEnemiesObserved']<=late['s']['densityCap'], str({'peak':late['s']['maxActiveEnemiesObserved'],'cap':late['s']['densityCap']}))
    check('Late-wave phone path has no runtime errors', not phone_errors, str(phone_errors)); phone.close()

    # Execute returning-boss mechanics at remix intensity, not only their generated wave descriptors.
    boss_results={}; boss_errors=[]
    for boss_id,intensity,hp_ratio in [('crown',2,.5),('mirror',3,.5),('apex',3,1),('vortex',3,1)]:
      pg=browser.new_page(viewport={'width':390,'height':844}); errs=[]; pg.on('pageerror', lambda e, errs=errs: errs.append(str(e))); setup(pg)
      pg.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
      result=pg.evaluate('''([bossId,intensity,hpRatio])=>{
        const q=RizoRuntimeQA;q.defenseSetRunForQA({phase:"combat",clock:0});q.defenseSpawnBossForQA(bossId);
        let cp=q.defenseBuildCheckpointForQA('boss-remix-audit');cp.currentWave=100;cp.clearedWave=99;cp.phase='combat';cp.resumePhase='combat';cp.waveTotal=1;cp.waveResolved=0;cp.spawnQueue=[];cp.wavePackets=[];cp.currentWavePlan=[];cp.childSpawnQueue=[];cp.enemies=cp.enemies.slice(-1);cp.enemies[0].bossIntensity=intensity;cp.enemies[0].hpRatio=hpRatio;cp.enemies[0].nextBossPulse=0;
        cp=q.defenseSignCheckpointForQA(cp);const ok=q.defenseRestoreCheckpointForQA(cp);q.defensePauseForQA(false);for(let i=0;i<75;i++)q.defenseTickForQA(1/30);
        const snap=q.defenseSnapshotForQA(), after=q.defenseBuildCheckpointForQA('boss-remix-after');
        return {ok,clock:snap.simulationClock,types:snap.enemies.map(e=>e.bossId?`boss:${e.bossId}`:e.type),enemies:after.enemies.map(e=>({bossId:e.bossId,intensity:e.bossIntensity,next:e.nextBossPulse,phaseTriggered:e.phaseTriggered,telegraph:e.telegraphKind}))};
      }''',[boss_id,intensity,hp_ratio])
      boss_results[boss_id]=result; boss_errors.extend(errs); pg.close()
    check('Warden remix actually adds support-aware guards', boss_results['crown']['ok'] and all(t in boss_results['crown']['types'] for t in ['lead','relay','shell','mender']), str(boss_results['crown']))
    check('Mirror high remix actually fractures three ways', boss_results['mirror']['types'].count('boss:mirror')==3, str(boss_results['mirror']))
    check('Redline high remix actually drags a surge escort', all(t in boss_results['apex']['types'] for t in ['boss:apex','storm','fleet','relay']), str(boss_results['apex']))
    vortex_enemy=next((e for e in boss_results['vortex']['enemies'] if e['bossId']=='vortex'), None)
    check('Maw high remix resolves and schedules its accelerated repeat pulse', vortex_enemy is not None and vortex_enemy['next']>boss_results['vortex']['clock'] and vortex_enemy['next']-boss_results['vortex']['clock']<3.0, str(boss_results['vortex']))
    check('Boss remix runtime probes have no page errors', not boss_errors, str(boss_errors))

    # Unrelated Defense launch sanity across every existing world.
    maps=['grove','ember','moon','storm','blizzard','eclipse']; map_results={}; map_errors=[]
    for map_id in maps:
      pg=browser.new_page(viewport={'width':390,'height':844}); errs=[]; pg.on('pageerror', lambda e, errs=errs: errs.append(str(e)))
      setup(pg,map_id,unlock_all=True)
      result=pg.evaluate('''()=>{const q=RizoRuntimeQA;const placed=q.defensePlaceNextForQA();const started=q.defenseStartWaveForQA();for(let i=0;i<45;i++)q.defenseTickForQA(1/30);const s=q.defenseSnapshotForQA();return{placed,started,map:s.map,currentWave:s.currentWave,phase:s.phase,towers:s.towers.length,renderer:s.rendererMode};}''')
      map_results[map_id]=result
      map_errors.extend(errs); pg.close()
    check('All unrelated existing Defense worlds still launch, place a Rizo, and start Wave 1', all(r['map']==m and r['placed']>=1 and r['started']==1 and r['currentWave']==1 and r['towers']>=1 for m,r in map_results.items()), str(map_results))
    check('Cross-map Defense launch sanity has no runtime errors', not map_errors, str(map_errors))

    browser.close()

print(f"\n{sum(checks)}/{len(checks)} Worker F self-audit checks passed")
raise SystemExit(0 if all(checks) else 1)
