from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
import json, sys

ROOT=Path(__file__).resolve().parents[1]
APP=build_inline_app(True,embed_assets=True)
checks=[]

def record(name, ok, detail=''):
    checks.append({'name':name,'passed':bool(ok),'detail':detail})
    print(('PASS' if ok else 'FAIL'), name, detail)

def boot(browser):
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('about:blank')
    page.set_content(APP,wait_until='load',timeout=120000)
    page.evaluate('''()=>{document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked");}''')
    page.evaluate(SETUP_STATE)
    page.evaluate('''()=>{const s=RizoRuntimeQA.snapshot();s.scores.defense=250;s.scores.defenseMaps={grove:250,ember:250,moon:250,storm:250,blizzard:250,eclipse:250};RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"});document.querySelector('#defenseMapIntro')?.remove();RizoRuntimeQA.defensePlaceNextForQA();}''')
    return page,errors

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # Study-driven packet grammar and recovery valleys.
    page,errors=boot(browser)
    plans=page.evaluate('''()=>[1,8,20,31,41,51].map(w=>RizoRuntimeQA.defensePlanForQA(w))''')
    early=plans[0]; late=plans[-1]
    early_ok=[(round(pkt['spawnGap'],2),round(pkt['breakAfter'],2),len(pkt['enemies'])) for pkt in early['packets']]==[(.95,2.2,3),(.72,0,3)]
    late_ok=all(.20 <= pkt['spawnGap'] <= .38 and (i==len(late['packets'])-1 or 1.10 <= pkt['breakAfter'] <= 2.40) for i,pkt in enumerate(late['packets']))
    record('authored packets use breath-aware spawn grammar',early_ok and late_ok, str({'early':[(p['spawnGap'],p['breakAfter'],len(p['enemies'])) for p in early['packets']], 'late':[(p['spawnGap'],p['breakAfter'],len(p['enemies'])) for p in late['packets']]}))
    counts=[plan['total'] for plan in plans]
    record('late difficulty stays composition-led instead of count runaway',max(counts)<=34 and counts[-1]<=34,str(counts))
    record('packet grammar sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    # Fixed 30 Hz simulation under a 30 fps-like presentation cadence.
    samples={}
    for speed in (1,2):
        page,errors=boot(browser)
        # Drain the fixed-step accumulator before sampling. setup() runs the real
        # animation loop, which leaves a partial step banked; carrying one extra step
        # into a 30-tick sample made this assertion intermittently read 32 frames.
        # A tick taken while the run is not simulating zeroes the accumulator, so the
        # sample starts from a known step boundary.
        page.evaluate('''speed=>{RizoRuntimeQA.defenseClearQueueForQA();RizoRuntimeQA.defenseTickForQA(0);RizoRuntimeQA.defenseSetRunForQA({phase:"combat",clock:0});RizoRuntimeQA.defenseSetSpeedForQA(speed);RizoRuntimeQA.defenseSpawnForQA("shell",.15,1000000000,1000000000)}''',speed)
        before=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
        page.evaluate('''()=>{for(let i=0;i<30;i++)RizoRuntimeQA.defenseTickForQA(1/30)}''')
        after=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
        samples[speed]={'before':before,'after':after,'errors':errors}
        page.close()
    one=samples[1]['after']['simulationClock']-samples[1]['before']['simulationClock']
    two=samples[2]['after']['simulationClock']-samples[2]['before']['simulationClock']
    record('30 fps-like callbacks still drive deterministic 30 Hz simulation',.95<=one<=1.05,str({'simSeconds':one,'presentationFrames':samples[1]['after']['presentationFrames']-samples[1]['before']['presentationFrames']}))
    record('2x advances exact game time without changing the fixed step',1.9<=two<=2.11 and samples[2]['after']['maxCatchUpObserved']<=4,str({'simSeconds':two,'maxCatchUp':samples[2]['after']['maxCatchUpObserved']}))
    record('30 fps-like fixed-step samples have no runtime errors',not samples[1]['errors'] and not samples[2]['errors'],str(samples[1]['errors'][:2]+samples[2]['errors'][:2]))

    # Sustained bad frame times must lower presentation without silently changing gameplay density.
    page,errors=boot(browser)
    core=page.evaluate('RizoRuntimeQA.defenseCoreForQA()')
    stressed=page.evaluate('''()=>{let out=null;for(let i=0;i<100;i++)out=RizoRuntimeQA.defenseRecordFrameForQA(36);return out}''')
    record('measured frame pressure activates adaptive presentation tier',stressed['governorTier']>=1 and stressed['renderTier']>=1,str(stressed))
    record('adaptive quality never changes authored enemy density',stressed['densityCap']==core['densityNormal1x']==core['densityNormal2x']==core['densityLow1x'],str({'stressed':stressed['densityCap'],'core':[core['densityNormal1x'],core['densityNormal2x'],core['densityLow1x']]}))
    page.close()

    # Rapid logical fire uses representative visuals instead of one DOM projectile per hit.
    page,errors=boot(browser)
    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat"})')
    shot=page.evaluate('RizoRuntimeQA.defenseRapidFireForQA(48)')
    record('rapid logical fire is visually coalesced',shot['logical']==48 and shot['visible']<shot['logical'] and shot['coalescedVisual']>0,str(shot))
    record('visible projectile count stays inside the active visual budget',shot['visible']<=shot['budget']['maxVisibleProjectiles'],str(shot))
    record('projectile coalescing sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    # Wave completion is a player-owned boundary with a short punctuation lock; auto remains opt-in.
    page,errors=boot(browser)
    default_auto=page.evaluate('Boolean(RizoRuntimeQA.snapshot().settings.defenseAutoStart)')
    page.evaluate('RizoRuntimeQA.defenseCompleteWaveForQA(1)')
    immediate=page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    page.evaluate('RizoRuntimeQA.defenseTickForQA(.76)')
    delayed=page.evaluate('RizoRuntimeQA.defenseStartWaveForQA()')
    record('auto waves are off by default',default_auto is False,str(default_auto))
    record('wave clear gets a punctuation beat before manual next wave',immediate==1 and delayed==2,str({'immediate':immediate,'afterSettling':delayed}))
    record('wave-boundary sample has no runtime errors',not errors,'; '.join(errors[:3]))
    page.close()

    browser.close()

out=ROOT/'reports'/'browser-v76-rhythm-engine.json'
out.write_text(json.dumps(checks,indent=2))
failed=[x for x in checks if not x['passed']]
print(f"\n{len(checks)-len(failed)}/{len(checks)} v78 rhythm/flow checks passed")
sys.exit(1 if failed else 0)
