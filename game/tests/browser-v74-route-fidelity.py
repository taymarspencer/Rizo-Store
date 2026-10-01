from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
import json, sys, math

ROOT=Path(__file__).resolve().parents[1]
APP=build_inline_app(True,embed_assets=True)
checks=[]

def check(name,ok,detail=''):
    checks.append({'name':name,'passed':bool(ok),'detail':detail})
    print(('PASS' if ok else 'FAIL'),name,detail)

def boot(page,map_id='grove',viewport=(390,844)):
    page.goto('about:blank')
    page.set_viewport_size({'width':viewport[0],'height':viewport[1]})
    page.set_content(APP,wait_until='load',timeout=120000)
    page.evaluate('''()=>{document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked");}''')
    page.evaluate(SETUP_STATE)
    page.evaluate('''mapId=>{const s=RizoRuntimeQA.snapshot();s.scores.defense=250;s.scores.defenseMaps={grove:250,ember:250,moon:250,storm:250,blizzard:250,eclipse:250};RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.startMiniGame("defense",{mapId});document.querySelector('#defenseMapIntro')?.remove();}''',map_id)
    page.wait_for_timeout(100)

def alignment(page, map_id, progress, boss=False):
    if boss:
        page.evaluate("RizoRuntimeQA.defenseSpawnBossForQA('crown')")
        page.evaluate("p=>{RizoRuntimeQA.defenseSetEnemiesForQA(p);RizoRuntimeQA.defenseSetRunForQA({phase:'combat'});RizoRuntimeQA.defenseTickForQA(.02)}", progress)
    else:
        page.evaluate("p=>RizoRuntimeQA.defenseSpawnForQA('puff',p)", progress)
    return page.evaluate('''({mapId,progress})=>{
      const world=document.querySelector('#defenseWorld');
      const enemy=[...document.querySelectorAll('.defense-enemy')].at(-1);
      const body=enemy?.querySelector('.balloon-body');
      const wr=world.getBoundingClientRect(), br=body.getBoundingClientRect();
      const enemyState=RizoRuntimeQA.defenseSnapshotForQA().enemies.at(-1);
      const actualProgress=enemyState?.progress ?? progress;
      const point=RizoRuntimeQA.defenseMapPointForQA(mapId,actualProgress);
      const expected={
        x:wr.left+world.clientLeft+point.x*world.clientWidth,
        y:wr.top+world.clientTop+point.y*world.clientHeight
      };
      const actual={x:br.left+br.width/2,y:br.top+br.height/2};
      return {
        boss:enemy.classList.contains('balloon-boss'),
        point, progress:actualProgress, expected, actual,
        dx:actual.x-expected.x,dy:actual.y-expected.y,
        error:Math.hypot(actual.x-expected.x,actual.y-expected.y),
        roadD:document.querySelector('.defense-road-fill')?.getAttribute('d')||'',
        canonicalD:RizoRuntimeQA.defenseMapSvgPathForQA(mapId),
        enemyRect:{w:enemy.getBoundingClientRect().width,h:enemy.getBoundingClientRect().height}
      };
    }''', {'mapId':map_id,'progress':progress})

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    maps=['grove','ember','moon','storm','blizzard','eclipse']
    samples=[.08,.25,.5,.75,.92]
    max_error=0
    map_errors={}
    for map_id in maps:
        boot(page,map_id)
        route=page.evaluate("id=>({road:document.querySelector('.defense-road-fill')?.getAttribute('d')||'',canonical:RizoRuntimeQA.defenseMapSvgPathForQA(id)})",map_id)
        check(f'{map_id} road is generated from canonical gameplay route',route['road']==route['canonical'],{'road':route['road'][:80],'canonical':route['canonical'][:80]})
        errs=[]
        for progress in samples:
            result=alignment(page,map_id,progress,False)
            errs.append(result['error']); max_error=max(max_error,result['error'])
        map_errors[map_id]=max(errs)
        check(f'{map_id} balloon body stays centered on trail',max(errs)<=1.35,{'maxErrorPx':round(max(errs),3),'samples':[round(x,3) for x in errs]})
        # Fresh page for the oversized boss so its authored visual anchor is independently verified.
        boot(page,map_id)
        boss_result=alignment(page,map_id,.5,True)
        max_error=max(max_error,boss_result['error'])
        check(f'{map_id} boss body stays centered on trail',boss_result['error']<=1.35,{'errorPx':round(boss_result['error'],3),'rect':boss_result['enemyRect']})
    check('route fidelity suite has no runtime errors',not errors,errors)
    browser.close()

out=ROOT/'reports'/'browser-v74-route-fidelity.json';out.write_text(json.dumps(checks,indent=2))
failed=[r for r in checks if not r['passed']]
print(f"\n{len(checks)-len(failed)}/{len(checks)} v74 route fidelity checks passed; worst visible-body error {max_error:.3f}px")
sys.exit(1 if failed else 0)
