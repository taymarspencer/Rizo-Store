"""Worker F depth/flatness acceptance: formation evolution, support payoff, boss second acts."""
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def check(name, ok, detail=''):
    checks.append(bool(ok)); print(('PASS' if ok else 'FAIL'), name, detail, flush=True)

def setup(page):
    page.set_content(build_inline_app(True, embed_assets=True), wait_until='domcontentloaded', timeout=120000)
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"});document.querySelector("#defenseMapIntro")?.remove()')

def flat(plan):
    return [e for packet in plan['packets'] for e in packet['enemies']]

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]; page.on('pageerror', lambda e: errors.append(str(e))); setup(page)

    # Same archetype should develop into a veteran formation instead of merely scaling stats.
    early=page.evaluate('RizoRuntimeQA.defensePlanForQA(36)')
    late=page.evaluate('RizoRuntimeQA.defensePlanForQA(123)')
    check('Endless archetypes develop formation tiers over a run', early['modifier']=='support-convoy' and late['modifier']=='support-convoy' and early['formationTier']==1 and late['formationTier']>=4, str({'early':early['formationTier'],'late':late['formationTier']}))
    early_last=early['packets'][-1]['enemies']; late_last=late['packets'][-1]['enemies']
    check('Veteran support convoy changes the strategic answer, not just HP', 'lead' not in early_last and 'lead' in late_last and 'relay' in late_last and 'mender' in late_last, str({'early':early_last,'late':late_last}))
    check('Endless acts remain readable and packet-bounded', all(len(packet['enemies'])<=12 and packet['breakAfter']>=0 for packet in late['packets']) and len(late['packets'])==3, str(late['packets']))
    recoveries=[page.evaluate(f'RizoRuntimeQA.defensePlanForQA({w})') for w in (31,41,51)]
    check('Recovery valleys rotate texture without becoming another pressure puzzle', len({tuple(r['pressureTags']) for r in recoveries})==3 and all(r['modifier']=='recovery' and r['formationTier']==0 and len(r['packets'])==2 for r in recoveries), str([r['pressureTags'] for r in recoveries]))

    # Relay death should create an obvious target-priority payoff.
    relay_probe=page.evaluate('''()=>{const q=RizoRuntimeQA;q.defenseSetRunForQA({phase:"combat",clock:0});const r=q.defenseSpawnForQA("relay",.30,1e9,1e9);const f=q.defenseSpawnForQA("fleet",.32,1e9,1e9);q.defenseTickForQA(1/30);const before=q.defenseSnapshotForQA();q.defensePopEnemyForQA(r.id);const after=q.defenseSnapshotForQA();const row=after.enemies.find(e=>e.id===f.id);return{clock:after.simulationClock,before:before.enemies.find(e=>e.id===f.id),after:row};}''')
    check('Popping Relay creates a brief convoy signal-collapse window', relay_probe['after']['signalStaggerUntil']>relay_probe['clock'] and 'signal-staggered' in relay_probe['after']['className'], str(relay_probe))

    # Mender should reverse partial armor investment but never resurrect fully broken armor.
    mend_probe=page.evaluate('''()=>{const q=RizoRuntimeQA;const m=q.defenseSpawnForQA("mender",.45,1e9,1e9);const lead=q.defenseSpawnForQA("lead",.47,1e9,1e9);q.defenseShredEnemyForQA(lead.id,.10);let s=q.defenseSnapshotForQA(), before=s.enemies.find(e=>e.id===lead.id);q.defensePulseMenderForQA(m.id);s=q.defenseSnapshotForQA();let after=s.enemies.find(e=>e.id===lead.id);return{before,after};}''')
    check('Mender now repairs shredded plating as a distinct support behavior', mend_probe['before']['armorShredded'] and mend_probe['after']['armor']>mend_probe['before']['armor'], str(mend_probe))

    # Checkpoint continuity for the new support state. This must run inside a wave that
    # is genuinely in progress: the integrated save contract strips live combat payloads
    # from a checkpoint that claims no unfinished wave, so a mid-wave signal-collapse
    # window is only representable while currentWave is ahead of clearedWave.
    # Fresh page: the probes above deliberately leave immortal 1e9-HP support enemies
    # on the field, and a checkpoint round trip is only meaningful on a clean run.
    save_page=browser.new_page(viewport={'width':390,'height':844}); setup(save_page)
    save_probe=save_page.evaluate('''()=>{const q=RizoRuntimeQA;
      q.defensePlaceNextForQA();
      q.defenseStartWaveForQA();q.defenseClearQueueForQA();
      q.defenseSetRunForQA({phase:"combat"});
      const r=q.defenseSpawnForQA("relay",.30,1e9,1e9),f=q.defenseSpawnForQA("fleet",.32,1e9,1e9);
      q.defenseTickForQA(1/30);q.defensePopEnemyForQA(r.id);
      const snap=q.defenseSnapshotForQA();
      const target=snap.enemies.find(e=>e.signalStaggerUntil>snap.simulationClock)||snap.enemies.find(e=>e.id===f.id);
      if(!target)return{ok:false,reason:"no target"};
      let cp=q.defenseBuildCheckpointForQA("depth-state");
      const saved=cp.enemies.find(e=>e.id===target.id)||null;
      cp=q.defenseSignCheckpointForQA(cp);
      const ok=q.defenseRestoreCheckpointForQA(cp);
      const restored=q.defenseBuildCheckpointForQA("depth-state-restored").enemies.find(e=>e.id===target.id)||null;
      return{ok,saved,restored};}''')
    check('New support timing/state survives signed checkpoint restore', save_probe.get('ok') and save_probe.get('saved') and save_probe.get('restored') and save_probe['saved'].get('signalStaggerUntil',0)>0 and save_probe['saved']['signalStaggerUntil']==save_probe['restored'].get('signalStaggerUntil',-1), str(save_probe))
    save_page.close()

    page.close()

    def boss_page(boss_id, intensity, hp_ratio, seconds):
        pg=browser.new_page(viewport={'width':390,'height':844}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); setup(pg)
        pg.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
        result=pg.evaluate('''([bossId,intensity,hpRatio,seconds])=>{const q=RizoRuntimeQA;q.defenseSetRunForQA({phase:"combat",clock:0});q.defenseSpawnBossForQA(bossId);let cp=q.defenseBuildCheckpointForQA("depth-boss");cp.currentWave=220;cp.clearedWave=219;cp.phase="combat";cp.resumePhase="combat";cp.waveTotal=1;cp.waveResolved=0;cp.spawnQueue=[];cp.wavePackets=[];cp.currentWavePlan=[];cp.childSpawnQueue=[];cp.enemies=cp.enemies.filter(e=>e.bossId===bossId);cp.enemies[0].bossIntensity=intensity;cp.enemies[0].hpRatio=hpRatio;cp.enemies[0].nextBossPulse=0;cp=q.defenseSignCheckpointForQA(cp);const ok=q.defenseRestoreCheckpointForQA(cp);q.defensePauseForQA(false);const boss=q.defenseSnapshotForQA().enemies.find(e=>e.bossId===bossId);for(let t=0;t<seconds;t+=1/30)q.defenseTickForQA(1/30);return{ok,bossId:boss?.id,snap:q.defenseSnapshotForQA(),cp:q.defenseBuildCheckpointForQA("depth-boss-after")};}''',[boss_id,intensity,hp_ratio,seconds])
        pg.close(); return result, errs

    # Keep both Warden phases in one page so checkpoint identity never crosses a generated keeper/pet context.
    pg=browser.new_page(viewport={'width':390,'height':844}); errs2=[]; pg.on('pageerror', lambda e: errs2.append(str(e))); setup(pg); pg.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    crown_second=pg.evaluate(r'''()=>{const q=RizoRuntimeQA;q.defenseSetRunForQA({phase:"combat",clock:0});q.defenseSpawnBossForQA("crown");let cp=q.defenseBuildCheckpointForQA("depth-crown");cp.currentWave=220;cp.clearedWave=219;cp.phase="combat";cp.resumePhase="combat";cp.waveTotal=1;cp.waveResolved=0;cp.spawnQueue=[];cp.wavePackets=[];cp.currentWavePlan=[];cp.childSpawnQueue=[];cp.enemies=cp.enemies.filter(e=>e.bossId==="crown");cp.enemies[0].bossIntensity=4;cp.enemies[0].hpRatio=.60;cp.enemies[0].nextBossPulse=0;cp=q.defenseSignCheckpointForQA(cp);q.defenseRestoreCheckpointForQA(cp);q.defensePauseForQA(false);for(let i=0;i<60;i++)q.defenseTickForQA(1/30);let s=q.defenseSnapshotForQA();let boss=s.enemies.find(e=>e.bossId==="crown");if(!boss)return{boss:null,types:s.enemies.map(e=>e.type),stage:"after-first"};q.defenseSetEnemyHealthByIdForQA(boss.id,.27);for(let i=0;i<60;i++)q.defenseTickForQA(1/30);s=q.defenseSnapshotForQA();return{boss:s.enemies.find(e=>e.bossId==="crown"),types:s.enemies.map(e=>e.bossId?`boss:${e.bossId}`:e.type)};}''')
    pg.close()
    check('High-tier Warden has a bounded late-fight second act', crown_second['boss'] and crown_second['boss']['bossPhase']>=2 and all(t in crown_second['types'] for t in ['brick','relay','mender']), str(crown_second))

    mirror,me=boss_page('mirror',5,.50,2.2)
    mirror_types=[e['bossId'] and f"boss:{e['bossId']}" or e['type'] for e in mirror['snap']['enemies']]
    check('Deep Mirror remix fractures with phase echoes', mirror_types.count('boss:mirror')==3 and 'ghost' in mirror_types and 'shade' in mirror_types, str(mirror_types))

    maw,mawe=boss_page('vortex',4,1,6.4)
    maw_types=[e['bossId'] and f"boss:{e['bossId']}" or e['type'] for e in maw['snap']['enemies']]
    maw_boss=next((e for e in maw['snap']['enemies'] if e.get('bossId')=='vortex'),None)
    check('Deep Maw alternates range pressure with bounded support pulls', maw_boss and maw_boss['bossPhase']>=2 and ('relay' in maw_types or 'mender' in maw_types), str({'phase':maw_boss and maw_boss['bossPhase'],'types':maw_types}))

    apex,ae=boss_page('apex',4,1,7.8)
    apex_types=[e['bossId'] and f"boss:{e['bossId']}" or e['type'] for e in apex['snap']['enemies']]
    apex_boss=next((e for e in apex['snap']['enemies'] if e.get('bossId')=='apex'),None)
    check('Deep Redline switches escort language between surges', apex_boss and apex_boss['bossPhase']>=2 and 'relay' in apex_types and 'lead' in apex_types and 'mender' in apex_types, str({'phase':apex_boss and apex_boss['bossPhase'],'types':apex_types}))
    check('Depth boss probes have no runtime errors', not(errs2+me+mawe+ae), str(errs2+me+mawe+ae))
    check('Depth pass browser path has no runtime errors', not errors, str(errors))
    browser.close()

print(f"\n{sum(checks)}/{len(checks)} Worker F depth checks passed")
raise SystemExit(0 if all(checks) else 1)
