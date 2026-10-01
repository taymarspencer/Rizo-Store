"""Scripted playthroughs use real placement, prices, upgrades, powers and fixed-step combat.
Only automatic RAF is suspended for deterministic accelerated runs. No cash, HP, wave
completion, damage or reward overrides are used in these playthroughs. Isolated probes
below separately construct boundary conditions, explicitly identified in test names.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name,ok,detail=''):
    checks.append((name,bool(ok)));print(('PASS' if ok else 'FAIL'),name,detail,flush=True)

def html():
    text=build_inline_app(True,True).replace('mini.frame = requestAnimationFrame(updateMiniFrame);','mini.frame = 0;')
    text=text.replace('defenseRecordsForQA: () =>', 'defenseRecordRunForQA: raw => recordDefenseRun(raw),\n    defenseRecordsForQA: () =>')
    driver=(ROOT/'tests/defense-slice-driver.js').read_text()
    return text.replace('defenseSnapshotForQA: () =>',driver+'\n    defenseSnapshotForQA: () =>')

# Integrated roster contract (Worker C): the automatic three-loaner opening is
# retired. A varied field is now earned by owning Rizos and choosing a crew, so
# the mixed strategy explicitly brings a discovered Violet/Obsidian/Frost crew.
MIXED_CREW=['HOUSE-violet','HOUSE-obsidian','HOUSE-frost']
CREW_STATE='''()=>{const s=RizoRuntimeQA.defaultState();s.pet.stage="kid";s.pet.variant="classic";s.pet.hiddenVariant="classic";s.pet.energy=100;s.pet.hunger=100;s.pet.mood=100;s.pet.health=100;s.pet.resting=false;s.pet.sleeping=false;s.player.tutorialDismissed=true;s.player.defenseSchool={dismissed:true,completed:["route","placement","targeting","intel","doctrine","abilities"],replay:false};s.collection.classic=1;s.farm.roster=[];for(const v of ["violet","obsidian","frost"]){const r=JSON.parse(JSON.stringify(s.pet));r.id="HOUSE-"+v;r.name=v.toUpperCase();r.variant=v;r.hiddenVariant=v;r.stage="kid";r.alive=true;r.accessory=null;r.homeRoom=0;r.skills={power:0,speed:0,instinct:0,stamina:0,luck:0};s.farm.roster.push(r);}RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.defenseSetRosterForQA(["HOUSE-violet","HOUSE-obsidian","HOUSE-frost"]);return RizoRuntimeQA.defenseRosterConfigForQA().length;}'''

def setup(browser,style='mixed'):
    page=browser.new_page(viewport={'width':390,'height':844});page.set_content(html())
    if style=='mixed':
        page.evaluate(CREW_STATE)
    else:
        page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"})');page.wait_for_timeout(40)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    return page

reports={}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for style,speed,low in [('mixed',1,False),('mixed',2,False),('mixed',2,True),('classic',1,False),('idle',1,False)]:
        page=setup(b,style);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        result=page.evaluate('([style,speed,low])=>RizoRuntimeQA.defenseSliceDrive(style,speed,low)',[style,speed,low])
        key=f'{style}-{speed}x'+('-low' if low else '');reports[key]=result;rows=result['waves']
        check(key+' has no runtime errors',not errors,str(errors))
        check(key+' respects enemy and logical projectile budgets',result['peak']<=14 and result['projectiles']<=160,str({'peak':result['peak'],'shots':result['projectiles'],'stepP95ms':result['simStepP95']}))
        if style!='idle':
            check(key+' genuinely resolves waves 1–10',len(rows)==10 and all(r['clear']==r['wave'] and r['resolved']==r['total'] for r in rows),str([(r['wave'],r['lives'],r['seconds']) for r in rows]))
            check(key+' uses earned money without negative balances',all(r['cash']>=0 for r in rows))
            check(key+' boss and escorts share the field',rows[-1]['bossWithEscort'])
            check(key+' uses purchased field powers',sum(r['casts'] for r in rows)>0)
            if style=='mixed':check(key+' kills the Warden',rows[-1]['bosses']==1)
        else:check('inaction fails without crediting the fatal wave',rows[-1]['lives']==0 and rows[-1]['clear']<rows[-1]['wave'] and rows[-1]['wave']<=5)
        page.close()
    a=reports['mixed-1x']['waves'];b2=reports['mixed-2x']['waves'];low=reports['mixed-2x-low']['waves']
    check('1x and 2x have identical full-wave outcomes',a==b2)
    check('low-power presentation preserves identical full-wave outcomes',b2==low)
    check('crowd chain and heavy coverage outperform copies on this route',a[-1]['lives']>reports['classic-1x']['waves'][-1]['lives'])

    page=setup(b)
    # Pause inside the initial countdown; restore must resume that same phase.
    probe=page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceForQA(null,.41,.65);q.defenseStartWaveForQA();q.defenseTickForQA(.1);q.defensePauseForQA(true);const cp=q.defenseBuildCheckpointForQA('pause-test');for(let i=0;i<90;i++)q.defenseTickForQA(1/30);const frozen=q.defenseSnapshotForQA();const ok=q.defenseRestoreCheckpointForQA(cp);const restored=q.defenseBuildCheckpointForQA();q.defensePauseForQA(false);return {ok,cp,restored,frozenClock:frozen.simulationClock,phase:q.defensePhaseForQA()};}''')
    check('pause and restored countdown preserve clock and spawn deadline',probe['ok'] and probe['cp']['clock']==probe['frozenClock']==probe['restored']['clock'] and probe['cp']['nextSpawnAt']==probe['restored']['nextSpawnAt'] and probe['phase']['phase']=='countdown')
    check('unfinished countdown earns no completion',probe['phase']['clearedWave']==0)
    # Reach a genuine flight without overriding damage or cooldown.
    flight=page.evaluate('''()=>{const q=RizoRuntimeQA;let s;for(let i=0;i<400;i++){q.defenseTickForQA(1/30);s=q.defenseSnapshotForQA();if(s.projectiles.length)break;}const cp=q.defenseBuildCheckpointForQA('flight');q.defensePauseForQA(true);const ok=q.defenseRestoreCheckpointForQA(cp);const after=q.defenseBuildCheckpointForQA();return {ok,before:cp,after};}''')
    check('in-flight projectiles survive signed checkpoint restoration',flight['ok'] and len(flight['before']['projectiles'])>0 and flight['before']['projectiles']==flight['after']['projectiles'])
    tamper=page.evaluate('cp=>{cp.projectiles[0].damage+=999;return RizoRuntimeQA.defenseNormalizeCheckpointForQA(cp)}',flight['before'])
    check('tampering with saved projectile damage is rejected',tamper and tamper['validationStatus']=='sanitized' and len(tamper['projectiles'])==0)
    page.close()

    # A checkpoint emitted by the unmodified v86 runtime, not a recreated v87 fixture.
    page=setup(b);fixture=json.loads((ROOT/'tests/fixtures/v86-live-checkpoint.json').read_text())
    old=page.evaluate('''fixture=>{const q=RizoRuntimeQA,realNow=Date.now;Date.now=()=>fixture.checkpoint.savedAt+1000;try{q.loadForQA(fixture.state);q.startMiniGame('defense',{mapId:'grove'});const ok=q.defenseRestoreCheckpointForQA(fixture.checkpoint),s=q.defenseBuildCheckpointForQA();return {ok,s};}finally{Date.now=realNow;}}''',fixture)
    cp=fixture['checkpoint'];after=old['s']
    check('real v86 signed checkpoint migrates with cash, towers and wave credit intact',old['ok'] and cp['cash']==after['cash'] and cp['clearedWave']==after['clearedWave'] and cp['currentWave']==after['currentWave'] and len(cp['towers'])==len(after['towers']) and after['checkpointVersion']==page.evaluate('RizoRuntimeQA.defenseCoreForQA().version'))
    check('legacy pending packets keep their original composition',cp['wavePackets']==after['wavePackets'] and cp['spawnQueue']==after['spawnQueue'])
    page.close()

    # Guest crew are tactical loaners: even if a guest carries the fight, permanent
    # MVP and boss-mastery credit belong to an actually owned Rizo.
    page=setup(b); owned=page.evaluate('RizoRuntimeQA.snapshot().pet')
    record=page.evaluate('''owned=>RizoRuntimeQA.defenseRecordRunForQA({mapId:'grove',currentWave:10,clearedWave:10,kills:50,perfectWaveCount:10,bossesBeaten:['crown'],enemyStats:{heartLoss:0,leaked:{}},ended:'banked',towers:[{petId:owned.id,pet:owned,kills:2,damage:10,doctrine:'power'},{petId:'defense-crew-violet',pet:{id:'defense-crew-violet',name:'SHORT CIRCUIT',variant:'violet'},kills:48,damage:999,doctrine:'control'}]})''',owned)
    records=page.evaluate('RizoRuntimeQA.defenseRecordsForQA()')
    check('guest crew cannot become permanent run MVP',record['mvpPetId']==owned['id'] and not record['mvpPetId'].startswith('defense-crew-'),record)
    check('guest crew cannot steal boss mastery credit',records['mastery'].get(owned['id'],{}).get('bosses')==1 and 'defense-crew-violet' not in records['mastery'],records['mastery'])
    page.close();b.close()
(ROOT/'reports/first-ten-playthroughs.json').write_text(json.dumps(reports,indent=2))
print(f'\n{sum(ok for _,ok in checks)}/{len(checks)} first-ten checks passed')
raise SystemExit(0 if all(ok for _,ok in checks) else 1)
