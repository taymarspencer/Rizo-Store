from pathlib import Path
import json
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, start_defense

ROOT=Path(__file__).resolve().parents[1]
results=[]
def record(name,passed,detail=''):
    results.append({'name':name,'passed':bool(passed),'detail':detail})
    print(('PASS' if passed else 'FAIL'),name,detail)

def page_for(browser, viewport=(390,844), reduced=False):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    page.set_content(build_inline_app(True),wait_until='load',timeout=120000)
    page.wait_for_timeout(120)
    if reduced:
        page.emulate_media(reduced_motion='reduce')
    start_defense(page)
    return page,errors

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    page,errors=page_for(browser)
    base=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    record('cinematic host is fixed and idle by default',base['hidden'] and base['count']==0,str(base))
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseStartWaveForQA()')
    wave=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    record('wave start uses the shared cinematic hierarchy',wave['kind']=='wave-start' and 'WAVE 1' in wave['text'] and wave['count']==1,str(wave))
    page.evaluate('RizoRuntimeQA.defenseMomentForQA("boss",{title:"CROWN BALLOON",copy:"BOSS ENTRANCE"})')
    boss=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    page.evaluate('RizoRuntimeQA.defenseMomentForQA("packet",{title:"PACKET 2 / 3"})')
    priority=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    record('high-priority boss moments are not replaced by packet noise',boss['kind']=='boss' and priority['kind']=='boss',str({'boss':boss,'afterPacket':priority}))
    record('cinematic sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    page,errors=page_for(browser)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseSetRunForQA({wave:10,phase:"combat"});RizoRuntimeQA.defenseBossTelegraphForQA("crown")')
    boss=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    record('actual boss spawn triggers entrance treatment',boss['kind']=='boss' and 'BOSS ENTRANCE' in boss['text'],str(boss))
    page.close()

    page,errors=page_for(browser)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseSetRunForQA({lives:7,wave:3,phase:"combat"});RizoRuntimeQA.defenseLeakForQA("puff",2)')
    danger=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    record('gate damage gets a readable danger moment',danger['kind']=='danger' and 'GATE' in danger['text'],str(danger))
    page.close()

    page,errors=page_for(browser)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(1)')
    perfect=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    record('perfect wave gets higher-order clear treatment',perfect['kind']=='money' and 'WAVE 1 CLEAR' in perfect['text'] and 'PERFECT' in perfect['text'],str(perfect))
    page.close()

    page,errors=page_for(browser)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(1);RizoRuntimeQA.defenseForceWaveForQA(2);RizoRuntimeQA.defenseEndRunForQA("banked")')
    bank_now=page.evaluate('({moment:RizoRuntimeQA.defenseCinematicForQA(),snap:RizoRuntimeQA.defenseSnapshotForQA()})')
    record('banking enters one terminal state before recap',bank_now['moment']['kind']=='bank' and bank_now['moment']['ending'] and bank_now['snap']['phase']=='run-complete',str(bank_now))
    page.wait_for_timeout(780)
    bank_done=page.evaluate('({recap:Boolean(document.querySelector(".defense-run-recap")),records:RizoRuntimeQA.defenseRecordsForQA()})')
    run=bank_done['records']['history'][0] if bank_done['records']['history'] else {}
    record('bank cinematic preserves cleared/reached exploit protection',bank_done['recap'] and run.get('clearedWave',run.get('wave'))==1 and run.get('reachedWave')==2 and run.get('ended')=='banked',str(run))
    record('banking cinematic has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    page,errors=page_for(browser)
    page.evaluate('RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(1);RizoRuntimeQA.defenseForceWaveForQA(2);RizoRuntimeQA.defenseSetRunForQA({lives:1,phase:"combat"});RizoRuntimeQA.defenseLeakForQA("puff",5)')
    defeat_now=page.evaluate('RizoRuntimeQA.defenseCinematicForQA()')
    record('final defeat is visible before teardown',defeat_now['kind']=='defeat' and defeat_now['ending'] and 'GATE DOWN' in defeat_now['text'],str(defeat_now))
    page.wait_for_timeout(1050)
    defeat_done=page.evaluate('({recap:Boolean(document.querySelector(".defense-run-recap")),records:RizoRuntimeQA.defenseRecordsForQA()})')
    run=defeat_done['records']['history'][0] if defeat_done['records']['history'] else {}
    record('defeat cinematic never credits the unfinished wave',defeat_done['recap'] and run.get('clearedWave',run.get('wave'))==1 and run.get('reachedWave')==2 and run.get('ended')=='gate',str(run))
    record('defeat cinematic has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    page,errors=page_for(browser,reduced=True)
    page.evaluate('RizoRuntimeQA.defenseMomentForQA("boss",{title:"REDUCED MOTION BOSS"})')
    reduced=page.evaluate('''(()=>{const c=RizoRuntimeQA.defenseCinematicForQA();const card=document.querySelector("#defenseMoment .defense-moment-card");return{...c,animation:card?getComputedStyle(card).animationName:"",duration:card?getComputedStyle(card).animationDuration:""}})()''')
    record('reduced-motion preserves information without camera animation',reduced['reducedMotion'] and 'reduced' in reduced['className'] and reduced['animation']=='none',str(reduced))
    page.close()

    page,errors=page_for(browser,viewport=(320,568))
    page.evaluate('RizoRuntimeQA.defenseMomentForQA("boss",{title:"THE LONGEST POSSIBLE CROWN BALLOON ENTRANCE",copy:"CONTROL THE FIELD BEFORE THE BOSS SIGNAL RESOLVES"})')
    geom=page.evaluate('''()=>{const h=document.querySelector("#defenseMoment"),r=h.getBoundingClientRect(),c=h.querySelector(".defense-moment-card")?.getBoundingClientRect();return{host:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},card:c?{left:c.left,right:c.right,top:c.top,bottom:c.bottom}:null,vw:innerWidth,vh:innerHeight,pointer:getComputedStyle(h).pointerEvents}}''')
    record('cinematic treatment stays inside 320x568 and never blocks input',geom['card'] is not None and geom['card']['left']>=0 and geom['card']['right']<=geom['vw'] and geom['card']['top']>=0 and geom['card']['bottom']<=geom['vh'] and geom['pointer']=='none',str(geom))
    page.close()

    page,errors=page_for(browser)
    before_nodes=page.evaluate('document.querySelectorAll("#defenseWorld *, .defense-stage-frame > *").length')
    page.evaluate('for(let i=0;i<100;i++)RizoRuntimeQA.defenseMomentForQA(i%2?"clear":"upgrade",{title:"STRESS "+i,priority:9})')
    after_nodes=page.evaluate('document.querySelectorAll("#defenseWorld *, .defense-stage-frame > *").length')
    fixed=page.evaluate('document.querySelectorAll("#defenseMoment").length')
    count=page.evaluate('RizoRuntimeQA.defenseCinematicForQA().count')
    record('cinematic stress reuses one DOM host without node leakage',fixed==1 and after_nodes==before_nodes and count==100,str({'before':before_nodes,'after':after_nodes,'hosts':fixed,'count':count}))
    record('cinematic stress has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    browser.close()

passed=sum(1 for r in results if r['passed'])
report={'passed':passed,'total':len(results),'results':results}
(ROOT/'reports'/'browser-phase8-final.json').write_text(json.dumps(report,indent=2))
print(f"\n{passed}/{len(results)} phase 8 final-polish checks passed")
if passed!=len(results):
    raise SystemExit(1)
