from pathlib import Path
import json, sys, traceback
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

ROOT=Path(__file__).resolve().parents[1]
results=[]
def record(name, passed, detail=''):
    results.append({'name':name,'passed':bool(passed),'detail':detail})
    print(('PASS' if passed else 'FAIL'),name,detail)

def new_page(browser, qa=True, viewport=(390,844)):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]})
    errors=[]
    page.on('pageerror',lambda e:errors.append('pageerror '+str(e)))
    page.on('console',lambda m: errors.append('console '+m.type+' '+m.text) if m.type=='error' else None)
    page.set_content(build_inline_app(qa),wait_until='load',timeout=120000)
    page.wait_for_timeout(150)
    return page,errors

def visible_geometry(page):
    return page.evaluate('''()=>{const vp={w:innerWidth,h:innerHeight};const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)!==0&&r.width>0&&r.height>0};const shell=document.querySelector(".defense-shell"),field=document.querySelector("#defenseWorld");const controls=[...document.querySelectorAll(".mini-game-overlay.defense-active button")].filter(visible).map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute("aria-label")||e.textContent.trim().slice(0,50),left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}});const tiny=[...document.querySelectorAll(".mini-game-overlay.defense-active *")].filter(visible).map(e=>({tag:e.tagName,cls:e.className||"",text:(e.textContent||"").trim().slice(0,50),size:parseFloat(getComputedStyle(e).fontSize)})).filter(x=>x.text&&x.size<10.5);const sr=shell?.getBoundingClientRect(),fr=field?.getBoundingClientRect();return{vp,shell:sr?{left:sr.left,top:sr.top,right:sr.right,bottom:sr.bottom,width:sr.width,height:sr.height}:null,field:fr?{left:fr.left,top:fr.top,right:fr.right,bottom:fr.bottom,width:fr.width,height:fr.height}:null,controls,tiny};}''')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    # Production gate
    page,errors=new_page(browser,False)
    record('production QA API absent',page.evaluate('typeof window.RizoRuntimeQA')=='undefined',page.evaluate('typeof window.RizoRuntimeQA'))
    legacy_qa=page.evaluate('({visual:typeof window.RizoVisualQA,beat:typeof window.RizoBeatQA})')
    record('legacy QA namespaces are absent in production',legacy_qa['visual']=='undefined' and legacy_qa['beat']=='undefined',str(legacy_qa))
    record('production initial boot has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    # Core live state and progression
    page,errors=new_page(browser,True)
    snap=start_defense(page)
    record('defense initializes in planning',snap['phase']=='planning' and snap['currentWave']==0 and snap['clearedWave']==0,str(snap)[:180])
    placed=page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    started=page.evaluate('RizoRuntimeQA.defenseStartWaveForQA(); RizoRuntimeQA.defenseSnapshotForQA()')
    record('started wave is separate from cleared wave',placed==1 and started['currentWave']==1 and started['clearedWave']==0,f"placed={placed}, current={started['currentWave']}, cleared={started['clearedWave']}")
    unresolved=page.evaluate('RizoRuntimeQA.defenseTryCompleteWaveForQA()')
    record('wave cannot complete with packet queue pending',not unresolved['completed'] and unresolved['clearedWave']==0,str(unresolved))
    page.evaluate('RizoRuntimeQA.defenseClearQueueForQA(); RizoRuntimeQA.defenseQueueChildForQA("fleet",.5)')
    child_block=page.evaluate('RizoRuntimeQA.defenseTryCompleteWaveForQA()')
    record('wave cannot complete with child queue pending',not child_block['completed'] and child_block['childSpawnQueue']==1,str(child_block))
    page.evaluate('RizoRuntimeQA.defenseCompleteWaveForQA(1)')
    complete=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('clearedWave changes on verified completion path',complete['clearedWave']==1 and complete['currentWave']==1,str(complete)[:180])
    record('QA browser path has no runtime errors',not errors,'; '.join(errors[:5]))
    page.close()

    # Phase 6 explicit phase HUD and transition contract
    page,errors=new_page(browser,True)
    start_defense(page)
    phase0=page.evaluate('RizoRuntimeQA.defensePhaseForQA()')
    illegal=page.evaluate('RizoRuntimeQA.defenseAttemptPhaseForQA("combat")')
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseStartWaveForQA()')
    phase1=page.evaluate('RizoRuntimeQA.defensePhaseForQA()')
    page.evaluate('RizoRuntimeQA.defenseCompleteWaveForQA(1)')
    phase2=page.evaluate('RizoRuntimeQA.defensePhaseForQA()')
    record('phase HUD distinguishes cleared wave from active wave',phase0['label']=='PLAN' and phase0['domWave']=='0' and phase0['domCleared']=='0' and phase1['label']=='INCOMING' and phase1['currentWave']==1 and phase1['clearedWave']==0 and phase1['domWave']=='1' and phase1['domCleared']=='0' and phase2['label']=='CLEARED' and phase2['domCleared']=='1',str({'planning':phase0,'incoming':phase1,'cleared':phase2}))
    record('illegal phase jumps are rejected instead of creating contradictory state',illegal['before']=='planning' and illegal['requested']=='combat' and not illegal['accepted'] and illegal['after']=='planning' and illegal['rejects']>=1,str(illegal))
    record('phase 6 state-machine sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    # Phase 6 contextual overlay manager: one surface, inert background, focus return.
    page,errors=new_page(browser,True)
    start_defense(page)
    page.click('#defenseMenuButton')
    menu_state=page.evaluate('RizoRuntimeQA.defenseOverlayForQA()')
    page.evaluate('RizoRuntimeQA.defenseOpenAbilitiesForQA(true)')
    ability_state=page.evaluate('RizoRuntimeQA.defenseOverlayForQA()')
    page.keyboard.press('Escape')
    closed_state=page.evaluate('RizoRuntimeQA.defenseOverlayForQA()')
    record('context sheet makes battlefield controls truly inert',menu_state['surface']=='menu' and not menu_state['scrimHidden'] and menu_state['stageInert'] and menu_state['commandsInert'] and menu_state['rosterInert'] and menu_state['focusInside'],str(menu_state))
    record('opening a new context replaces rather than stacks the old surface',ability_state['surface']=='abilities' and not ability_state['fieldMenuOpen'] and ability_state['abilityTrayOpen'] and not ability_state['intelOpen'] and not ability_state['towerOpen'],str(ability_state))
    record('Escape closes the active context without quitting Defense',closed_state['surface'] is None and closed_state['scrimHidden'] and not closed_state['stageInert'] and page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()!=null'),str(closed_state))
    record('phase 6 overlay sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    # Banking active wave excludes it
    page,errors=new_page(browser,True)
    start_defense(page); page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseStartWaveForQA()')
    before=page.evaluate('RizoRuntimeQA.snapshot().wallet.embers')
    page.evaluate('RizoRuntimeQA.defenseFinishForQA()')
    after=page.evaluate('RizoRuntimeQA.snapshot()')
    records=page.evaluate('RizoRuntimeQA.defenseRecordsForQA()')
    record('banking unfinished first wave grants no wave reward',after['wallet']['embers']==before and after['scores']['defense']==0,f"embers {before}->{after['wallet']['embers']} best={after['scores']['defense']}")
    run=records['history'][0] if records['history'] else {}
    record('banking unfinished first wave stores analytics without completion credit',run.get('clearedWave',run.get('wave'))==0 and run.get('reachedWave')==1,f"history={records['history']}")
    record('zero-clear bank does not create permanent Rizo mastery',not records['mastery'],str(records['mastery']))
    record('bank outcome is explicit',run.get('ended')=='banked',str(run))
    page.close()

    # Banking after one clear, while next wave active
    page,errors=new_page(browser,True)
    start_defense(page); page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(1);RizoRuntimeQA.defenseForceWaveForQA(2);RizoRuntimeQA.defenseFinishForQA()')
    records=page.evaluate('RizoRuntimeQA.defenseRecordsForQA()')
    run=records['history'][0] if records['history'] else {}
    record('bank during wave 2 records cleared 1 and reached 2',run.get('clearedWave',run.get('wave'))==1 and run.get('reachedWave')==2,str(run))
    page.close()

    # Death during active wave
    page,errors=new_page(browser,True)
    start_defense(page); page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(1);RizoRuntimeQA.defenseForceWaveForQA(2);RizoRuntimeQA.defenseSetRunForQA({lives:1,phase:"combat"});RizoRuntimeQA.defenseLeakForQA("puff",5)')
    page.wait_for_timeout(1050)
    records=page.evaluate('RizoRuntimeQA.defenseRecordsForQA()')
    run=records['history'][0] if records['history'] else {}
    record('death excludes unfinished wave completion credit',run.get('clearedWave',run.get('wave'))==1 and run.get('reachedWave')==2,str(run))
    record('death outcome is explicit',run.get('ended')=='gate',str(run))
    page.close()

    # Whole-save progression migration keeps cleared/reached semantics conservative
    page,errors=new_page(browser,True)
    migrated=page.evaluate('''(()=>{const s=RizoRuntimeQA.defaultState();s.scores.defense=9999;s.scores.defenseMaps={grove:9999};s.scores.defenseHistory=[{id:"legacy",at:1,mapId:"grove",wave:7,clearedWave:6,reachedWave:7,kills:12,perfectWaveCount:5,ended:"gate"}];s.scores.defenseMastery={fake:{name:"FAKE",variant:"classic",runs:9,waves:0,bestWave:99,pops:100,damage:1000}};s.scores.defenseContracts=[{id:"fake-contract",date:"2026-07-31",mapId:"grove",title:"FAKE",rules:["unique","lean","power-only"],bestWave:0,completed:true,perfect:true}];return RizoRuntimeQA.normalizeState(s)})()''')
    run=migrated['scores']['defenseHistory'][0]
    record('save migration preserves cleared and reached wave separately',run['wave']==6 and run['clearedWave']==6 and run['reachedWave']==7,str(run))
    record('zero-wave imported mastery is removed',not migrated['scores']['defenseMastery'],str(migrated['scores']['defenseMastery']))
    contract=migrated['scores']['defenseContracts'][0]
    record('contract completion is derived from cleared progress',contract['bestWave']==0 and not contract['completed'] and not contract['perfect'],str(contract))
    record('permanent wave records are clamped to supported maximum',migrated['scores']['defense']==9999 and migrated['scores']['defenseMaps']['grove']==9999,str({'best':migrated['scores']['defense'],'map':migrated['scores']['defenseMaps']['grove']}))
    page.close()

    # Whole-save signatures, legacy migration, and unverified-state sanitation
    page,errors=new_page(browser,True)
    envelope=page.evaluate('''(()=>{const s=RizoRuntimeQA.defaultState();s.wallet.embers=321;s.achievements=["origin"];return RizoRuntimeQA.buildStateEnvelopeForQA(s)})()''')
    record('whole-save envelope signature verifies',page.evaluate('(e)=>RizoRuntimeQA.verifyStateEnvelopeForQA(e)',envelope),str({'saveVersion':envelope.get('saveVersion'),'signature':envelope.get('signature')}))
    tampered=json.loads(json.dumps(envelope));tampered['state']['wallet']['embers']=49_000_000;tampered['state']['scores']['defense']=250;tampered['state']['achievements']=[]
    record('whole-save signature detects progression edits',not page.evaluate('(e)=>RizoRuntimeQA.verifyStateEnvelopeForQA(e)',tampered),tampered['signature'])
    decoded=page.evaluate('(e)=>RizoRuntimeQA.decodeStatePayloadForQA(e)',tampered)
    record('invalid whole save is sanitized instead of blindly trusted',decoded['status']=='sanitized' and decoded['state']['wallet']['embers']==100 and decoded['state']['wallet']['shards']==0 and decoded['state']['scores']['defense']==0 and not decoded['state']['scores']['defenseHistory'],str({'status':decoded['status'],'wallet':decoded['state']['wallet'],'defense':decoded['state']['scores']['defense'],'history':decoded['state']['scores']['defenseHistory']}))
    legacy=page.evaluate('''(()=>{const s=RizoRuntimeQA.defaultState();s.version=17;s.wallet.embers=777;return RizoRuntimeQA.decodeStatePayloadForQA(s)})()''')
    record('phase 2 raw saves migrate without requiring a new signature',legacy['status']=='migrated' and legacy['state']['wallet']['embers']==777,str({'status':legacy['status'],'embers':legacy['state']['wallet']['embers']}))
    qa_surfaces=page.evaluate('''()=>({visual:RizoRuntimeQA.visualMatrixForQA().variants.length,beats:RizoRuntimeQA.beatTracksForQA().tracks.length,legacyVisual:typeof window.RizoVisualQA,legacyBeat:typeof window.RizoBeatQA})''')
    record('read-only QA data is consolidated under the gated namespace',qa_surfaces['visual']>0 and qa_surfaces['beats']>0 and qa_surfaces['legacyVisual']=='undefined' and qa_surfaces['legacyBeat']=='undefined',str(qa_surfaces))
    page.close()

    # Save sanitation and derived values
    page,errors=new_page(browser,True)
    start_defense(page); page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    normalized=page.evaluate('''(()=>{let c=RizoRuntimeQA.defenseBuildCheckpointForQA("corrupt-but-signed");c.currentWave=9999;c.clearedWave=9999;c.cash=999999999;c.kills=999999999;c.totalDamage=1e20;c.towers[0].upgrade=999;c.towers[0].spent=999999;c.towers[0].cost=999999;c.towers.push({...c.towers[0],id:"unknown-tower",petId:"not-a-real-pet"});c.enemies=[{id:"evil",type:"unknown",hp:999999,reward:999999}];c.spawnQueue=["unknown","puff"];c=RizoRuntimeQA.defenseSignCheckpointForQA(c);return RizoRuntimeQA.defenseNormalizeCheckpointForQA(c)})()''')
    tower=normalized['towers'][0]
    record('signed corrupted values are clamped',normalized['currentWave']==9999 and normalized['clearedWave']==9999 and normalized['cash']==2000000 and normalized['kills']==1000000 and normalized['totalDamage']==1000000000000,str({k:normalized[k] for k in ['currentWave','clearedWave','cash','kills','totalDamage','validationStatus']}))
    record('derived tower spending is recalculated',tower['upgrade']==4 and tower['spent']==1250 and tower['cost']==0,str(tower))
    record('unknown enemy, queue, and pet IDs are rejected',len(normalized['enemies'])==0 and normalized['spawnQueue']==['puff'] and len(normalized['towers'])==1,str({'enemies':normalized['enemies'],'spawnQueue':normalized['spawnQueue'],'towers':len(normalized['towers'])}))
    tampered=page.evaluate('''(()=>{const c=RizoRuntimeQA.defenseBuildCheckpointForQA("tamper");c.currentWave=200;c.clearedWave=199;c.cash=999999;c.kills=99999;c.totalDamage=999999999;c.towers[0].upgrade=4;c.spawnQueue=["puff"];return RizoRuntimeQA.defenseNormalizeCheckpointForQA(c)})()''')
    safe_tower=tampered['towers'][0]
    record('bad checkpoint signature fails closed to verified progress',tampered['validationStatus']=='sanitized' and tampered['currentWave']==0 and tampered['clearedWave']==0 and tampered['cash']==220 and tampered['kills']==0 and not tampered['spawnQueue'],str({k:tampered[k] for k in ['currentWave','clearedWave','cash','kills','totalDamage','validationStatus']}))
    record('bad checkpoint cannot preserve forged upgrades or reward counters',safe_tower['upgrade']==0 and safe_tower['spent']==0 and safe_tower['kills']==0 and safe_tower['damage']==0,str(safe_tower))
    page.close()

    # Phase 5 economy and flow contracts
    page,errors=new_page(browser,True)
    start_defense(page)
    map_cash={}
    for map_id in ("grove","ember","moon","storm","blizzard","eclipse"):
        page.evaluate(f'RizoRuntimeQA.defenseSetMapForQA("{map_id}")')
        map_cash[map_id]=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA().cash')
    record('all worlds start with consistent purchasing power',all(value==220 for value in map_cash.values()),str(map_cash))
    record('starting-cash sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    # Canonical kill rewards must survive map-economy normalization.
    map_rewards={}
    for map_id in ("grove","eclipse"):
        page,errors=new_page(browser,True)
        start_defense(page)
        page.evaluate(f'RizoRuntimeQA.defenseSetMapForQA("{map_id}");RizoRuntimeQA.defenseSetRunForQA({{wave:10}})')
        enemy=page.evaluate('RizoRuntimeQA.defenseSpawnForQA("puff",.2)')
        state=page.evaluate('(id)=>RizoRuntimeQA.defenseEnemyStateForQA(id)',enemy['id'])
        map_rewards[map_id]=state['reward']
        record(f'{map_id} canonical reward sample has no runtime errors',not errors,'; '.join(errors[:3]))
        page.close()
    record('canonical kill rewards stay positive and map-invariant',map_rewards['grove']>0 and map_rewards['grove']==map_rewards['eclipse'],str(map_rewards))

    page,errors=new_page(browser,True)
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defensePlaceNextForQA()')
    immediate=page.evaluate('RizoRuntimeQA.defenseEconomyForQA()')
    sold=page.evaluate('RizoRuntimeQA.defenseSellLastForQA()')
    after_undo=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('new placement receives a true five-second 100% planning undo',sold and immediate['tower']['cost']==190 and immediate['tower']['canUndo'] and immediate['tower']['sellRefund']==190 and after_undo['cash']==220,str({'before':immediate,'afterCash':after_undo['cash']}))
    page.close()

    page,errors=new_page(browser,True)
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defensePlaceNextForQA();for(let i=0;i<51;i++)RizoRuntimeQA.defenseTickForQA(.1)')
    expired=page.evaluate('RizoRuntimeQA.defenseEconomyForQA()')
    sold=page.evaluate('RizoRuntimeQA.defenseSellLastForQA()')
    after_sale=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('expired placement undo falls back to 70% planning refund',sold and not expired['tower']['canUndo'] and expired['tower']['sellRefund']==133 and after_sale['cash']==163,str({'before':expired,'afterCash':after_sale['cash']}))
    page.close()

    page,errors=new_page(browser,True)
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(2,"shell",1,1);RizoRuntimeQA.defenseSetCashForQA(400)')
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    placed=page.evaluate('RizoRuntimeQA.defensePlaceNextForQA()')
    sold=page.evaluate('RizoRuntimeQA.defenseSellLastForQA()')
    upgraded=page.evaluate('RizoRuntimeQA.defenseBuyUpgradeForQA()')
    after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('combat permits paid reinforcements and upgrades but locks selling',len(before['towers'])+1==len(after['towers'])==placed and sold is False and upgraded is True and after['cash']<before['cash'],str({'before':{'towers':len(before['towers']),'cash':before['cash']},'after':{'towers':len(after['towers']),'cash':after['cash']},'sell':sold,'upgrade':upgraded}))
    page.close()

    page,errors=new_page(browser,True)
    start_defense(page)
    packet_window=page.evaluate('''(()=>{RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(2,"shell",1,1);RizoRuntimeQA.defenseSetRunForQA({phase:"packet-break"});const before=RizoRuntimeQA.defenseEconomyForQA(),upgraded=RizoRuntimeQA.defenseBuyUpgradeForQA(),after=RizoRuntimeQA.defenseSnapshotForQA();return{before,upgraded,after}})()''')
    break_before=packet_window['before'];break_upgrade=packet_window['upgraded'];break_after=packet_window['after']
    record('packet breaks are defined safe upgrade windows',break_before['upgradeAllowed'] and break_upgrade and break_after['towers'][0]['upgrade']==1 and break_after['cash']==110,str({'before':break_before,'afterCash':break_after['cash'],'upgrade':break_after['towers'][0]['upgrade']}))
    page.close()

    page,errors=new_page(browser,True)
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defenseSetMapForQA("ember");RizoRuntimeQA.defenseSetPetVariantForQA("ember");RizoRuntimeQA.defensePlaceNextForQA()')
    perk_before=page.evaluate('RizoRuntimeQA.defenseEconomyForQA()')
    perk_panel=page.evaluate('RizoRuntimeQA.defenseShowTowerPanelForQA()')
    perk_upgrade=page.evaluate('RizoRuntimeQA.defenseBuyUpgradeForQA()')
    perk_after=page.evaluate('RizoRuntimeQA.defenseEconomyForQA()')
    legacy=page.evaluate('''(()=>{let c=RizoRuntimeQA.defenseBuildCheckpointForQA("legacy-v67");delete c.towers[0].openingPerkApplied;c=RizoRuntimeQA.defenseSignCheckpointForQA(c,4);return RizoRuntimeQA.defenseNormalizeCheckpointForQA(c)})()''')
    record('world identity changes the first strategic upgrade instead of starting cash',perk_before['baseStartingCash']==220 and perk_before['tower']['nextUpgradeCost']==90 and perk_upgrade and perk_after['worldPerkUsed'] and perk_after['tower']['spent']==90 and perk_after['tower']['nextUpgradeCost']==180,str({'before':perk_before,'after':perk_after}))
    record('tower panel communicates the active world opening discount',perk_panel['shown'] and 'OPENING DEAL' in perk_panel['text'],perk_panel['text'][-220:])
    record('v67 checkpoint migration conservatively reconstructs one opening discount',legacy['validationStatus'] in ('verified','migrated') and legacy['towers'][0]['openingPerkApplied'] and legacy['towers'][0]['spent']==90,str({'status':legacy['validationStatus'],'tower':legacy['towers'][0]}))
    record('phase 5 economy sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    # Pending income and density/target throttle
    page,errors=new_page(browser,True)
    start_defense(page); page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseSetRunForQA({phase:"paused"});RizoRuntimeQA.defensePendingIncomeForQA(37)')
    before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    cp=page.evaluate('RizoRuntimeQA.defenseBuildCheckpointForQA("income-test")')
    after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('pending income flushes before checkpoint',before['pendingIncome']==37 and after['pendingIncome']==0 and cp['cash']==before['cash']+37,str({'before':before['cash'],'pending':before['pendingIncome'],'checkpoint':cp['cash'],'after':after['cash']}))
    core=page.evaluate('RizoRuntimeQA.defenseCoreForQA()')
    record('2x speed preserves authored gameplay density',core['densityNormal2x']==core['densityNormal1x']==core['densityLow1x'],str(core))
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"});RizoRuntimeQA.defenseSpawnForQA("shell",.25,100000,100000)')
    page.evaluate('for(let i=0;i<100;i++)RizoRuntimeQA.defenseTickForQA(.01)')
    throttle=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('target retargeting is throttled',throttle['targetScans']<=15,f"targetScans={throttle['targetScans']}")
    page.close()

    # Phase 4 wall-clock scheduler regressions
    scan_samples = {}
    for speed in (1, 2):
        page,errors=new_page(browser,True)
        start_defense(page)
        page.evaluate(f'RizoRuntimeQA.defensePlaceNextForQA();const p=RizoRuntimeQA.defenseNearestProgressForQA();RizoRuntimeQA.defenseSetRunForQA({{wave:1,phase:"combat"}});RizoRuntimeQA.defenseSetSpeedForQA({speed});const e=RizoRuntimeQA.defenseSpawnForQA("shell",p.progress,100000000,100000000);RizoRuntimeQA.defenseSetEnemyStatusForQA(e.id,{{root:100}});for(let i=0;i<200;i++)RizoRuntimeQA.defenseTickForQA(.01)')
        scan_samples[speed]=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
        record(f'{speed}x scheduler sample has no runtime errors',not errors,'; '.join(errors[:3]))
        page.close()
    scans_1x=scan_samples[1]['targetScans'];scans_2x=scan_samples[2]['targetScans']
    record('2x keeps the same bounded targeting cadence per simulation second',abs(scans_2x-2*scans_1x)<=3 and scans_2x<=35,str({'1x':scans_1x,'2x':scans_2x}))
    record('2x advances simulation without accelerating control clocks',abs(scan_samples[1]['realClock']-scan_samples[2]['realClock'])<.12 and scan_samples[2]['simulationClock']-scan_samples[1]['simulationClock']>1.9,str({'1x':{'real':scan_samples[1]['realClock'],'sim':scan_samples[1]['simulationClock']},'2x':{'real':scan_samples[2]['realClock'],'sim':scan_samples[2]['simulationClock']}}))
    record('2x visual budget lowers projectiles and impacts',core['visualNormal2x']['maxVisibleProjectiles']<core['visualNormal1x']['maxVisibleProjectiles'] and core['visualNormal2x']['maxImpactEffects']<core['visualNormal1x']['maxImpactEffects'],str({'1x':core['visualNormal1x'],'2x':core['visualNormal2x']}))

    page,errors=new_page(browser,True)
    start_defense(page)
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"});RizoRuntimeQA.defenseSetSpeedForQA(2);RizoRuntimeQA.defenseClearQueueForQA();for(let i=0;i<8;i++)RizoRuntimeQA.defenseSpawnForQA("fleet",.1+i*.002,99999,99999);for(let i=0;i<6;i++)RizoRuntimeQA.defenseQueueChildForQA("fleet",.01)')
    # Deterministic form of "gradual, not bursting": the scheduler releases at most one
    # queued child per fixed simulation frame. The previous form ticked a fixed real
    # duration and asserted an absolute release count, but start_defense() runs the
    # real animation loop first and leaves a nondeterministic fixed-step accumulator,
    # so one .02s tick could advance anywhere from 1 to 5 frames (observed releases
    # 0-4 in the same build). Measure releases against the frames that actually ran.
    child_before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.02)')
    child_first=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    frames_run=round((child_first['simulationClock']-child_before['simulationClock'])*30)
    released_now=child_first['childSpawnsReleased']-child_before['childSpawnsReleased']
    page.evaluate('for(let i=0;i<100;i++)RizoRuntimeQA.defenseTickForQA(.01)')
    child_later=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('split children release gradually instead of bursting in one frame',
           frames_run>=1 and released_now<=frames_run and child_first['childSpawnQueue']>=6-frames_run,
           str({'framesRun':frames_run,'released':released_now,'queued':child_first['childSpawnQueue']}))
    record('split children cannot bypass the active density cap',len(child_later['enemies'])<=child_later['densityCap'] and child_later['maxActiveEnemiesObserved']<=child_later['densityCap'],str({'active':len(child_later['enemies']),'peak':child_later['maxActiveEnemiesObserved'],'cap':child_later['densityCap'],'queued':child_later['childSpawnQueue']}))
    record('child scheduler sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    income_rows={}
    for speed in (1,2):
        page,errors=new_page(browser,True)
        start_defense(page)
        income_rows[speed]=page.evaluate(f'''(()=>{{RizoRuntimeQA.defenseSetSpeedForQA({speed});const before=RizoRuntimeQA.defenseSnapshotForQA();RizoRuntimeQA.defensePendingIncomeForQA(25);for(let i=0;i<8;i++)RizoRuntimeQA.defenseTickForQA(.01);const mid=RizoRuntimeQA.defenseSnapshotForQA();for(let i=0;i<8;i++)RizoRuntimeQA.defenseTickForQA(.01);const after=RizoRuntimeQA.defenseSnapshotForQA();return{{before,mid,after}}}})()''')
        record(f'{speed}x income scheduler sample has no runtime errors',not errors,'; '.join(errors[:3]))
        page.close()
    record('income batching uses real time at both speeds',all(row['mid']['pendingIncome']==25 and row['after']['pendingIncome']==0 for row in income_rows.values()),str({speed:{'midPending':row['mid']['pendingIncome'],'afterPending':row['after']['pendingIncome'],'realDelta':row['after']['realClock']-row['before']['realClock'],'simDelta':row['after']['simulationClock']-row['before']['simulationClock']} for speed,row in income_rows.items()}))
    record('income batch flush preserves exact totals',all(row['after']['cash']-row['before']['cash']==25 and row['after']['lastIncomeBatch'] and row['after']['lastIncomeBatch']['amount']==25 for row in income_rows.values()),str({speed:{'cashBefore':row['before']['cash'],'cashAfter':row['after']['cash'],'batch':row['after']['lastIncomeBatch']} for speed,row in income_rows.items()}))

    # Overlay conflict and viewport geometry
    viewports=[(320,568),(360,640),(375,667),(390,844),(430,932),(844,390),(768,1024),(1024,768)]
    all_geom=True; tiny_all=[]; overflow_all=[]; field_ratios=[]
    for vp in viewports:
        page,errors=new_page(browser,True,vp)
        start_defense(page)
        page.evaluate('RizoRuntimeQA.defenseToggleFieldMenuForQA(true);RizoRuntimeQA.defenseOpenAbilitiesForQA(true)')
        conflict=page.evaluate('''()=>({menu:!document.querySelector("#defenseFieldMenu")?.hidden,abilities:!document.querySelector("#defenseAbilityTray")?.hidden,intel:!document.querySelector("#defenseIntelTray")?.hidden})''')
        record(f'overlay manager prevents conflict at {vp[0]}x{vp[1]}',sum(bool(v) for v in conflict.values())<=1,str(conflict))
        page.evaluate('RizoRuntimeQA.defenseOpenAbilitiesForQA(false)')
        geom=visible_geometry(page)
        shell=geom['shell']; field=geom['field']; w,h=vp
        ok=bool(shell and field and shell['left']>=-2 and shell['right']<=w+2 and shell['top']>=-2 and shell['bottom']<=h+2)
        all_geom &= ok
        ratio=(field['width']*field['height'])/(w*h) if field else 0; field_ratios.append((vp,ratio))
        bad=[c for c in geom['controls'] if c['left']<-3 or c['right']>w+3 or c['top']<-3 or c['bottom']>h+3]
        overflow_all.extend([(vp,c) for c in bad])
        tiny_all.extend([(vp,t) for t in geom['tiny']])
        page.close()
    record('defense shell remains inside all required viewports',all_geom,str(field_ratios))
    record('no visible recurring controls escape viewport',not overflow_all,str(overflow_all[:8]))
    record('battlefield remains visual priority',all(r>=.30 for _,r in field_ratios),str(field_ratios))
    record('no visible recurring defense text below 10.5px',not tiny_all,str(tiny_all[:15]))

    browser.close()

out=ROOT/'reports'/'browser-defense-integration.json'
out.write_text(json.dumps(results,indent=2))
failed=[row for row in results if not row['passed']]
print(f"\n{len(results)-len(failed)}/{len(results)} browser integration checks passed")
if failed:
    print('FAILED:',', '.join(row['name'] for row in failed))
    sys.exit(1)
