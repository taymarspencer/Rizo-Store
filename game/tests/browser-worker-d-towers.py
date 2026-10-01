from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

ROOT=Path(__file__).resolve().parents[1]
INLINE_APP=build_inline_app(True)
results=[]
def record(name, passed, detail=''):
    results.append((name,bool(passed),detail))
    print(('PASS' if passed else 'FAIL'), name, detail)

def new_page(browser, viewport=(390,844)):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]})
    errors=[]
    page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
    page.on('console',lambda m: errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    page.set_content(INLINE_APP,wait_until='load',timeout=120000)
    page.add_style_tag(path=str(ROOT/'worker-d-towers.css'))
    page.wait_for_timeout(120)
    start_defense(page)
    return page,errors

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # POWER evolution: use real placement / upgrade UI so price gates and visual states are exercised together.
    page,errors=new_page(browser)
    roster=page.evaluate('''()=>{const n=document.querySelector('[data-defense-roster-id="defense-tool-basic"]');return n?{text:n.textContent.replace(/\\s+/g,' ').trim(),className:n.className,art:n.querySelector('.defense-basic-rizo')?.className||''}:null}''')
    record('universal tool is explicit in the Defense bench', roster and 'UNIVERSAL TOOL' in roster['text'] and 'defense-roster-universal' in roster['className'], str(roster))
    placed=page.evaluate('RizoRuntimeQA.defensePlaceNextForQA("defense-tool-basic");RizoRuntimeQA.defenseSnapshotForQA()')
    tower=placed['towers'][0]
    record('Basic Defense Rizo has its own cheap deployment economy', tower['petId']=='defense-tool-basic' and tower['cost']==85 and tower['spent']==85 and tower['nextUpgradeCost']==70 and placed['cash']==135, str(tower))
    # Silhouette growth is about the settled form. The feel layer plays an authored
    # deploy stretch (scale .72,1.18) and an upgrade squash (scale 1.14,.9), so a
    # geometry sample taken mid-animation inflates level 1 and deflates the max form.
    # Let the motion land before measuring either silhouette.
    page.wait_for_timeout(700)
    base_visual=page.evaluate('''()=>{const n=document.querySelector('.defense-universal-tower');const a=n?.querySelector('.defense-basic-rizo');const r=n?.getBoundingClientRect();return{tower:n?.className||'',art:a?.className||'',width:r?.width||0,height:r?.height||0,crown:getComputedStyle(a?.querySelector('.basic-crown')).opacity}}''')
    record('level 1 begins as a blank neutral frame', 'defense-upgrade-0' in base_visual['tower'] and 'basic-evo-0' in base_visual['art'] and 'basic-path-neutral' in base_visual['art'] and float(base_visual['crown'])==0, str(base_visual))

    page.evaluate('RizoRuntimeQA.defenseSetCashForQA(5000)')
    page.click('.defense-universal-tower')
    page.click('[data-defense-upgrade]')
    lv2=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('first investment changes behavior and uses the 70 coin Worker D price', lv2['towers'][0]['upgrade']==1 and lv2['towers'][0]['spent']==155 and lv2['towers'][0]['nextUpgradeCost']==125, str(lv2['towers'][0]))
    stitch=page.evaluate('''()=>{RizoRuntimeQA.defenseRapidFireForQA(4);return RizoRuntimeQA.defenseSnapshotForQA().projectiles.slice(-4).map(s=>({damage:s.damage,doubleStitch:s.doubleStitch}))}''')
    record('LV2 visibly authors a fourth-shot double stitch instead of only scaling stats', len(stitch)==4 and all(not stitch[i]['doubleStitch'] for i in range(3)) and stitch[3]['doubleStitch'] and stitch[3]['damage'] >= stitch[0]['damage']*1.4, str(stitch))
    page.click('[data-defense-upgrade]')
    lv3=page.evaluate('''()=>({snap:RizoRuntimeQA.defenseSnapshotForQA(),paths:[...document.querySelectorAll('[data-defense-doctrine]')].map(n=>n.textContent.replace(/\\s+/g,' ').trim())})''')
    record('level 3 forces an understandable POWER vs CONTROL branch choice', lv3['snap']['towers'][0]['upgrade']==2 and len(lv3['paths'])==2 and any('Rivets' in x for x in lv3['paths']) and any('Pins' in x for x in lv3['paths']), str(lv3['paths']))
    page.click('[data-defense-doctrine$=":power"]')
    power_branch=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('POWER path implies strongest-target armor duty', power_branch['towers'][0]['doctrine']=='power' and power_branch['towers'][0]['targetMode']=='strong', str(power_branch['towers'][0]))
    record('doctrine choice is permanent for the run instead of silently offering a respec', page.locator('[data-defense-doctrine]').count()==0, page.locator('#defenseTowerPanel').inner_text())
    page.click('[data-defense-upgrade]')
    page.click('[data-defense-upgrade]')
    page.wait_for_timeout(700)
    power_max=page.evaluate('''()=>{const s=RizoRuntimeQA.defenseSnapshotForQA(),n=document.querySelector('.defense-universal-tower'),a=n?.querySelector('.defense-basic-rizo'),r=n?.getBoundingClientRect();return{snap:s,tower:n?.className||'',art:a?.className||'',width:r?.width||0,height:r?.height||0,crown:getComputedStyle(a?.querySelector('.basic-crown')).opacity,aria:n?.getAttribute('aria-label')||''}}''')
    pt=power_max['snap']['towers'][0]
    record('POWER max investment reaches the authored Rivet Crown state', pt['upgrade']==4 and pt['spent']==940 and 'defense-doctrine-power' in power_max['tower'] and 'basic-evo-4' in power_max['art'] and 'basic-path-power' in power_max['art'] and float(power_max['crown'])==1 and 'RIVET CANNON' in power_max['aria'], str({'tower':pt,'class':power_max['tower'],'art':power_max['art'],'size':(power_max['width'],power_max['height']),'crown':power_max['crown'],'aria':power_max['aria']}))
    record('maxed universal tower has a materially larger silhouette than level 1', power_max['width'] >= base_visual['width']+15 and power_max['height'] >= base_visual['height']+15, f"base={base_visual['width']:.1f}x{base_visual['height']:.1f} max={power_max['width']:.1f}x{power_max['height']:.1f}")
    power_shot=page.evaluate('RizoRuntimeQA.defenseDoctrineShotForQA("power");RizoRuntimeQA.defenseSnapshotForQA()')
    record('POWER branch emits charged rivets', power_shot['projectiles'] and power_shot['projectiles'][-1]['kind']=='rivet' and power_shot['projectiles'][-1]['doctrineStrike']=='power', str(power_shot['projectiles'][-1] if power_shot['projectiles'] else None))
    record('POWER browser sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # CONTROL evolution + ownership boundaries.
    page,errors=new_page(browser)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA("defense-tool-basic");RizoRuntimeQA.defenseSetCashForQA(5000);RizoRuntimeQA.defenseUpgradeForQA(3)')
    control=page.evaluate('RizoRuntimeQA.defenseDoctrineForQA("control")')
    page.evaluate('RizoRuntimeQA.defenseUpgradeForQA(5)')
    control_max=page.evaluate('''()=>{const s=RizoRuntimeQA.defenseSnapshotForQA(),n=document.querySelector('.defense-universal-tower'),a=n?.querySelector('.defense-basic-rizo');return{snap:s,tower:n?.className||'',art:a?.className||'',crown:getComputedStyle(a?.querySelector('.basic-crown')).opacity,aria:n?.getAttribute('aria-label')||''}}''')
    record('CONTROL path defaults to front-lane control and ends as THREADSTORM', control['accepted'] and control_max['snap']['towers'][0]['targetMode']=='first' and 'defense-doctrine-control' in control_max['tower'] and 'basic-path-control' in control_max['art'] and float(control_max['crown'])==1 and 'THREADSTORM' in control_max['aria'], str({'tower':control_max['snap']['towers'][0],'class':control_max['tower'],'art':control_max['art'],'crown':control_max['crown'],'aria':control_max['aria']}))
    control_shot=page.evaluate('RizoRuntimeQA.defenseDoctrineShotForQA("control");RizoRuntimeQA.defenseSnapshotForQA()')
    record('CONTROL branch emits charged pins', control_shot['projectiles'] and control_shot['projectiles'][-1]['kind']=='pin' and control_shot['projectiles'][-1]['doctrineStrike']=='control', str(control_shot['projectiles'][-1] if control_shot['projectiles'] else None))
    boundary=page.evaluate('''()=>{const p=document.querySelector('#defenseTowerPanel');return{className:p?.className||'',superCount:p?.querySelectorAll('[data-defense-super]').length||0,abilityCount:p?.querySelectorAll('[data-defense-ability]').length||0}}''')
    record('universal tool exposes no character active or Super Rizo ascension', 'universal-tool-panel' in boundary['className'] and boundary['superCount']==0 and boundary['abilityCount']==0, str(boundary))
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    leader=page.evaluate('RizoRuntimeQA.defenseFieldLeaderForQA()')
    record('universal tool never steals Field Leader from an owned Rizo', leader and leader['petId']!='defense-tool-basic', str(leader))

    # The universal tool is deliberately not a collectible character: no permanent mastery/MVP identity.
    page.evaluate('RizoRuntimeQA.defenseCompleteWaveForQA(1);RizoRuntimeQA.defenseFinishForQA()')
    records=page.evaluate('RizoRuntimeQA.defenseRecordsForQA()')
    history=records['history'][0] if records['history'] else {}
    record('universal tool never creates fake Rizo mastery', 'defense-tool-basic' not in records['mastery'], str(records['mastery']))
    record('universal tool never becomes the permanent run MVP identity', history.get('mvpPetId')!='defense-tool-basic', str(history))
    record('CONTROL browser sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # Duplicate pricing is independent of the primary evolution sample.
    page,errors=new_page(browser)
    duplicate=page.evaluate('RizoRuntimeQA.defensePlaceNextForQA("defense-tool-basic");RizoRuntimeQA.defensePlaceNextForQA("defense-tool-basic");RizoRuntimeQA.defenseSnapshotForQA()')
    record('duplicate universal copies use the authored +20 deployment step', len(duplicate['towers'])==2 and duplicate['towers'][0]['cost']==85 and duplicate['towers'][1]['cost']==105 and duplicate['towers'][1]['spent']==105 and duplicate['cash']==30, str(duplicate['towers']))
    record('duplicate pricing sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # Real hit effects: verify the two paths do what their UI promises, not only that they emit different projectile art.
    for doctrine in ('power','control'):
        page,errors=new_page(browser)
        page.evaluate('RizoRuntimeQA.defensePlaceNextForQA("defense-tool-basic");RizoRuntimeQA.defenseClearQueueForQA();RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
        shot=page.evaluate(f'RizoRuntimeQA.defenseDoctrineShotForQA("{doctrine}")')
        page.evaluate('for(let i=0;i<24;i++)RizoRuntimeQA.defenseTickForQA(.01)')
        snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
        enemy=snap['enemies'][-1] if snap['enemies'] else {}
        if doctrine=='power':
            record('POWER charged rivet actually shreds armor on impact', shot['strike']=='power' and enemy.get('armorShredded') and enemy.get('armor',1)<enemy.get('baseArmor',0), str(enemy))
        else:
            record('CONTROL charged pin actually slows, roots, and reveals on impact', shot['strike']=='control' and enemy.get('slow',0)>0 and enemy.get('rootUntil',0)>snap['simulationClock'] and enemy.get('revealUntil',0)>snap['simulationClock'], str(enemy))
        record(f'{doctrine.upper()} impact sample has no runtime errors', not errors, '; '.join(errors[:4]))
        page.close()

    # DEPTH PASS: LV2 is a real forked shot, not merely a fourth-shot multiplier.
    page,errors=new_page(browser)
    fork=page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseUpgradeForQA(2);q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const p=q.defenseNearestProgressForQA().progress,a=q.defenseSpawnForQA("shell",p,1000,1000),b=q.defenseSpawnForQA("shell",Math.max(0,p-.012),1000,1000);q.defenseSetEnemyStatusForQA(a.id,{root:10});q.defenseSetEnemyStatusForQA(b.id,{root:10});q.defenseRapidFireForQA(4);const flagged=q.defenseSnapshotForQA().projectiles.slice(-4).map(s=>s.doubleStitch);for(let i=0;i<34;i++)q.defenseTickForQA(.01);const after=q.defenseSnapshotForQA(),mate=after.enemies.find(e=>e.id===b.id);return{flagged,mateHp:mate?.hp??1000,sim:after.simulationClock};}''')
    record('LV2 double stitch physically reaches a second nearby threat', fork['flagged']==[False,False,False,True] and fork['mateHp']<1000, str(fork))
    record('LV2 forked-shot depth sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # DEPTH PASS: LV4 is not a numeric hallway; POWER ordinary rivets gain armor work before the apex.
    lv4_power={}
    for level in (3,4):
        page,errors=new_page(browser)
        sample=page.evaluate('''(level)=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseUpgradeForQA(level);q.defenseDoctrineForQA("power");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const p=q.defenseNearestProgressForQA().progress,e=q.defenseSpawnForQA("shell",p,1000,1000);q.defenseSetEnemyStatusForQA(e.id,{root:10});q.defenseRapidFireForQA(1);for(let i=0;i<34;i++)q.defenseTickForQA(.01);const row=q.defenseSnapshotForQA().enemies.find(x=>x.id===e.id);return{armor:row?.armor,shredded:Boolean(row?.armorShredded)};}''',level)
        lv4_power[level]=sample
        record(f'POWER LV{level} ordinary-rivet depth sample has no runtime errors', not errors, '; '.join(errors[:4]))
        page.close()
    record('POWER LV4 gains persistent ordinary-rivet armor shaving before the max crown', not lv4_power[3]['shredded'] and lv4_power[4]['shredded'] and lv4_power[4]['armor']<lv4_power[3]['armor'], str(lv4_power))

    # DEPTH PASS: POWER is a payoff tower. Existing slow/root setup increases the charged rivet payoff.
    power_setup={}
    for restrained in (False,True):
        page,errors=new_page(browser)
        sample=page.evaluate('''(restrained)=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const shot=q.defenseDoctrineShotForQA("power",{restrained,hp:10000,maxHp:10000});for(let i=0;i<34;i++)q.defenseTickForQA(.01);const e=q.defenseSnapshotForQA().enemies.find(x=>x.id===shot.targetId);return{damage:10000-(e?.hp??10000),strike:shot.strike};}''',restrained)
        power_setup[restrained]=sample
        record(f'POWER setup-payoff {"restrained" if restrained else "plain"} sample has no runtime errors', not errors, '; '.join(errors[:4]))
        page.close()
    record('POWER charged rivets reward prior lane control with a stronger tear-open hit', power_setup[True]['strike']=='power' and power_setup[False]['strike']=='power' and power_setup[True]['damage']>power_setup[False]['damage']*1.10, str(power_setup))

    # DEPTH PASS: the crown does not splash blindly; it hunts armored side targets.
    page,errors=new_page(browser)
    crown=page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const shot=q.defenseDoctrineShotForQA("power",{apex:true,hp:10000,maxHp:10000,neighbors:3,neighborTypes:["puff","lead","brick"]});for(let i=0;i<34;i++)q.defenseTickForQA(.01);const s=q.defenseSnapshotForQA(),rows=shot.neighborIds.map(id=>s.enemies.find(e=>e.id===id));return{types:rows.map(e=>e?.type),shredded:rows.map(e=>Boolean(e?.armorShredded)),hp:rows.map(e=>e?.hp)};}''')
    record('RIVET CROWN prioritizes armored side targets instead of generic nearest splash', crown['types']==['puff','lead','brick'] and crown['shredded']==[False,True,True], str(crown))
    record('RIVET CROWN depth sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # DEPTH PASS: CONTROL threads through the lane and prefers threats that are not already restrained.
    page,errors=new_page(browser)
    thread=page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const shot=q.defenseDoctrineShotForQA("control",{neighbors:2,neighborTypes:["shell","fleet"]});q.defenseSetEnemyStatusForQA(shot.neighborIds[0],{root:10});for(let i=0;i<34;i++)q.defenseTickForQA(.01);const s=q.defenseSnapshotForQA(),rows=shot.neighborIds.map(id=>s.enemies.find(e=>e.id===id));return{slow:rows.map(e=>e?.slow||0),root:rows.map(e=>e?.rootUntil||0),sim:s.simulationClock};}''')
    record('CONTROL thread prefers a fresh threat instead of wasting its single LV4 lane pin', thread['slow'][0]==0 and thread['slow'][1]>0 and thread['root'][1]>thread['sim'], str(thread))
    record('CONTROL target-priority depth sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # DEPTH PASS: opened armor creates a cross-doctrine setup for the max CONTROL rewind/root.
    control_combo={}
    for opened in (False,True):
        page,errors=new_page(browser)
        sample=page.evaluate('''(opened)=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const shot=q.defenseDoctrineShotForQA("control",{apex:true,opened,hp:10000,maxHp:10000});for(let i=0;i<34;i++)q.defenseTickForQA(.01);const s=q.defenseSnapshotForQA(),e=s.enemies.find(x=>x.id===shot.targetId);return{progress:e?.progress??1,rootUntil:e?.rootUntil??0,sim:s.simulationClock};}''',opened)
        control_combo[opened]=sample
        record(f'CONTROL opened-armor {"combo" if opened else "plain"} sample has no runtime errors', not errors, '; '.join(errors[:4]))
        page.close()
    record('THREADSTORM rewards armor opened by POWER/armor breakers with a deeper lock and rewind', control_combo[True]['progress']<control_combo[False]['progress']-.008 and control_combo[True]['rootUntil']>control_combo[False]['rootUntil']+.35, str(control_combo))

    # DEPTH PASS: max CONTROL turns its charged stitch into a crowd-scale threadstorm.
    page,errors=new_page(browser)
    storm=page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const shot=q.defenseDoctrineShotForQA("control",{apex:true,neighbors:3,neighborTypes:["fleet","shell","lead"]});for(let i=0;i<34;i++)q.defenseTickForQA(.01);const s=q.defenseSnapshotForQA(),rows=shot.neighborIds.map(id=>s.enemies.find(e=>e.id===id));return{doubleStitch:shot.doubleStitch,controlled:rows.map(e=>({slow:e?.slow||0,root:e?.rootUntil||0})),sim:s.simulationClock};}''')
    record('THREADSTORM visibly graduates from one lane pin into a three-target stitched control web', storm['doubleStitch'] and len(storm['controlled'])==3 and all(e['slow']>0 and e['root']>storm['sim'] for e in storm['controlled']), str(storm))
    record('THREADSTORM crowd-depth sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # Same simulated time must produce the same Basic Defense Rizo combat at 1x and 2x.
    speed_rows={}
    for speed,steps in ((1,180),(2,90)):
        page,errors=new_page(browser)
        snap=page.evaluate('''([speed,steps])=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseUpgradeForQA(5);q.defenseDoctrineForQA("power");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});q.defenseSetSpeedForQA(speed);const p=q.defenseNearestProgressForQA().progress,e=q.defenseSpawnForQA("shell",p,1000000,1000000);q.defenseSetEnemyStatusForQA(e.id,{root:100});for(let i=0;i<steps;i++)q.defenseTickForQA(.01);return q.defenseSnapshotForQA();}''',[speed,steps])
        speed_rows[speed]={'shots':snap['towers'][0]['shots'],'damage':snap['towers'][0]['damage'],'hp':snap['enemies'][0]['hp'],'armor':snap['enemies'][0]['armor'],'sim':snap['simulationClock']}
        record(f'Worker D {speed}x combat sample has no runtime errors', not errors, '; '.join(errors[:4]))
        page.close()
    one,two=speed_rows[1],speed_rows[2]
    record('Worker D combat is deterministic for equal simulated time at 1x and 2x', one['shots']==two['shots'] and abs(one['damage']-two['damage'])<1e-6 and abs(one['hp']-two['hp'])<1e-6 and abs(one['armor']-two['armor'])<1e-9, str(speed_rows))

    # Pause must freeze Worker D projectiles/cooldowns/statuses, then resume cleanly.
    page,errors=new_page(browser)
    page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseUpgradeForQA(5);q.defenseDoctrineForQA("control");q.defenseClearQueueForQA();q.defenseSetRunForQA({phase:"combat"});const p=q.defenseNearestProgressForQA().progress,e=q.defenseSpawnForQA("shell",p,1000000,1000000);q.defenseSetEnemyStatusForQA(e.id,{root:100});for(let i=0;i<50;i++)q.defenseTickForQA(.01)}''')
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('RizoRuntimeQA.defensePauseForQA(true)')
    paused_start=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('for(let i=0;i<80;i++)RizoRuntimeQA.defenseTickForQA(.01)')
    frozen=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('RizoRuntimeQA.defensePauseForQA(false);for(let i=0;i<50;i++)RizoRuntimeQA.defenseTickForQA(.01)')
    resumed=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    def combat_key(s):
        e=s['enemies'][0] if s['enemies'] else {}
        t=s['towers'][0]
        return (round(s['simulationClock'],6),t['shots'],round(t['damage'],6),round(e.get('hp',0),6),round(e.get('progress',0),6),len(s['projectiles']))
    record('pause freezes Worker D simulation state once paused is active', frozen['phase']=='paused' and combat_key(paused_start)==combat_key(frozen), str({'before':combat_key(before),'paused_start':combat_key(paused_start),'frozen':combat_key(frozen)}))
    record('resume restarts Worker D combat without a stuck tower', resumed['phase']=='combat' and combat_key(resumed)!=combat_key(frozen) and resumed['towers'][0]['damage']>frozen['towers'][0]['damage'], str({'frozen':combat_key(frozen),'resumed':combat_key(resumed)}))
    record('pause/resume Worker D sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # Phone-first geometry: roster and action sheet stay reachable; short landscape max form adds no clipping beyond the baseline tower box.
    page,errors=new_page(browser,(320,568))
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA("defense-tool-basic");RizoRuntimeQA.defenseUpgradeForQA(5);RizoRuntimeQA.defenseDoctrineForQA("power")')
    geo=page.evaluate('''()=>{const take=s=>{const n=document.querySelector(s),r=n?.getBoundingClientRect();return r?{l:r.left,t:r.top,r:r.right,b:r.bottom}:null};return{w:innerWidth,h:innerHeight,roster:take('.defense-roster-universal'),panel:take('#defenseTowerPanel'),tower:take('.defense-universal-tower')}}''')
    record('320x568 portrait keeps Worker D roster and tower sheet inside the phone viewport', all(g and g['l']>=-1 and g['r']<=geo['w']+1 and g['t']>=-1 and g['b']<=geo['h']+1 for g in (geo['roster'],geo['panel'])), str(geo))
    record('320x568 Worker D sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    page,errors=new_page(browser,(844,390))
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA("defense-tool-basic");RizoRuntimeQA.defenseUpgradeForQA(5);RizoRuntimeQA.defenseDoctrineForQA("power");RizoRuntimeQA.defensePlaceNextForQA()')
    landscape=page.evaluate('''()=>{const u=document.querySelector('.defense-universal-tower')?.getBoundingClientRect(),g=[...document.querySelectorAll('.defense-tower')].find(n=>!n.classList.contains('defense-universal-tower'))?.getBoundingClientRect();return{universal:u?{t:u.top,b:u.bottom,h:u.height}:null,generic:g?{t:g.top,b:g.bottom,h:g.height}:null}}''')
    record('short landscape max evolution adds no top-edge clipping beyond the baseline tower silhouette', landscape['universal'] and landscape['generic'] and landscape['universal']['t']>=landscape['generic']['t']-.5, str(landscape))
    record('844x390 Worker D sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    # Checkpoint edge: synthetic universal pet, branch, investment, and in-flight projectile survive restore.
    # The probe runs inside a genuinely started wave: the integrated save contract
    # (Worker J) correctly strips live combat payloads from a checkpoint that claims
    # no unfinished wave, so an in-flight shot is only meaningful mid-wave.
    page,errors=new_page(browser)
    checkpoint=page.evaluate('''()=>{const q=RizoRuntimeQA;q.defensePlaceNextForQA("defense-tool-basic");q.defenseSetCashForQA(5000);q.defenseUpgradeForQA(5);q.defenseDoctrineForQA("power");q.defenseStartWaveForQA();for(let i=0;i<400;i++){q.defenseTickForQA(1/30);if(q.defenseSnapshotForQA().enemies.length)break;}q.defenseDoctrineShotForQA("power");q.defenseUpgradeForQA(5);const serialized=q.defenseBuildCheckpointForQA("worker-d-audit"),signed=q.defenseSignCheckpointForQA(serialized),ok=q.defenseRestoreCheckpointForQA(signed),after=q.defenseSnapshotForQA();return{ok,signed,after}}''')
    restored=checkpoint['after']['towers'][0]
    restored_shot=checkpoint['after']['projectiles'][0] if checkpoint['after']['projectiles'] else {}
    record('valid checkpoint restore preserves universal tower ownership, branch, investment, and projectile identity', checkpoint['ok'] and restored['petId']=='defense-tool-basic' and restored['upgrade']==4 and restored['doctrine']=='power' and restored['spent']==940 and restored_shot.get('kind')=='rivet' and restored_shot.get('doctrineStrike')=='power', str({'tower':restored,'shot':restored_shot}))
    record('checkpoint Worker D sample has no runtime errors', not errors, '; '.join(errors[:4]))
    page.close()

    browser.close()

failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} Worker D browser checks passed")
if failed:
    raise SystemExit(1)
