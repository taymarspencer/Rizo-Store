from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
import json, math, sys

ROOT=Path(__file__).resolve().parents[1]
APP=build_inline_app(True,embed_assets=False)
checks=[]

def record(name,ok,detail=''):
    checks.append({'name':name,'passed':bool(ok),'detail':detail})
    print(('PASS' if ok else 'FAIL'),name,detail)

def boot(browser,map_id='grove',viewport=(390,844),touch=False):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]},has_touch=touch,is_mobile=touch)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(APP,wait_until='domcontentloaded',timeout=30000)
    page.evaluate("()=>{document.querySelector('#rizoInstallGate')?.setAttribute('hidden','');document.documentElement.classList.remove('ui-locked');document.body.classList.remove('ui-locked');}")
    page.evaluate(SETUP_STATE)
    page.evaluate('''mapId=>{const s=RizoRuntimeQA.snapshot();s.scores.defense=250;s.scores.defenseMaps={grove:250,ember:250,moon:250,storm:250,blizzard:250,eclipse:250};RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.startMiniGame('defense',{mapId});document.querySelector('#defenseMapIntro')?.remove();}''',map_id)
    page.wait_for_timeout(30)
    return page,errors

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])

    # Every authored map uses an undistorted square field and the visible balloon
    # body (not its decorative knot) sits on the same canonical route as the road.
    map_errors={}
    for map_id in ['grove','ember','moon','storm','blizzard','eclipse']:
        page,errors=boot(browser,map_id)
        dims=page.evaluate("()=>{const r=document.querySelector('#defenseWorld').getBoundingClientRect();return [r.width,r.height]}")
        route=page.evaluate("id=>({road:document.querySelector('.defense-road-fill').getAttribute('d'),canonical:RizoRuntimeQA.defenseMapSvgPathForQA(id)})",map_id)
        errs=[]
        for progress in [.12,.32,.52,.72,.9]:
            page.evaluate("p=>RizoRuntimeQA.defenseSpawnForQA('puff',p)",progress)
            row=page.evaluate('''({id,p})=>{const world=document.querySelector('#defenseWorld'),enemy=[...document.querySelectorAll('.defense-enemy')].at(-1),body=enemy.querySelector('.balloon-body'),wr=world.getBoundingClientRect(),br=body.getBoundingClientRect(),state=RizoRuntimeQA.defenseSnapshotForQA().enemies.at(-1),pt=RizoRuntimeQA.defenseMapPointForQA(id,state.progress);const expected={x:wr.left+pt.x*wr.width,y:wr.top+pt.y*wr.height},actual={x:br.left+br.width/2,y:br.top+br.height/2};return Math.hypot(actual.x-expected.x,actual.y-expected.y)}''',{'id':map_id,'p':progress})
            errs.append(row)
        map_errors[map_id]=max(errs)
        record(f'{map_id} field stays square',abs(dims[0]-dims[1])<1.0,str(dims))
        record(f'{map_id} road and gameplay use one route',route['road']==route['canonical'])
        record(f'{map_id} visible balloon body follows trail',max(errs)<=1.35,{'maxErrorPx':round(max(errs),3)})
        record(f'{map_id} route sample has no runtime errors',not errors,errors[:2])
        page.close()

    # Boss visual anchor uses the same rule.
    page,errors=boot(browser,'grove')
    page.evaluate("RizoRuntimeQA.defenseSpawnBossForQA('crown')")
    page.evaluate("()=>{RizoRuntimeQA.defenseSetEnemiesForQA(.5);RizoRuntimeQA.defenseSetRunForQA({phase:'combat'});RizoRuntimeQA.defenseTickForQA(.02)}")
    BOSS_ERR='''()=>{const world=document.querySelector('#defenseWorld'),enemy=document.querySelector('.defense-enemy.balloon-boss'),body=enemy.querySelector('.balloon-body'),wr=world.getBoundingClientRect(),br=body.getBoundingClientRect(),state=RizoRuntimeQA.defenseSnapshotForQA().enemies.at(-1),pt=RizoRuntimeQA.defenseMapPointForQA('grove',state.progress);return {err:Math.hypot((br.left+br.width/2)-(wr.left+pt.x*wr.width),(br.top+br.height/2)-(wr.top+pt.y*wr.height)),entering:enemy.classList.contains('boss-entering')}}'''
    entering=page.evaluate(BOSS_ERR)
    # The boss entrance is authored transient motion (it drops in and settles), so the
    # anchor rule is verified once the entrance is over. Assert both halves: the
    # entrance visibly displaces the body, and it lands exactly back on the trail. A
    # future entrance that never settles would fail the second check.
    for _ in range(40):
        page.evaluate('RizoRuntimeQA.defenseTickForQA(1/30)')
    page.wait_for_timeout(1000)
    page.evaluate('RizoRuntimeQA.defenseTickForQA(1/30)')
    settled=page.evaluate(BOSS_ERR)
    record('boss entrance is a visible authored arrival',entering['entering'] and entering['err']>1.35,{'enteringErrorPx':round(entering['err'],3),'entering':entering['entering']})
    record('boss body follows the canonical trail',(not settled['entering']) and settled['err']<=1.35,{'errorPx':round(settled['err'],3),'entering':settled['entering']})
    page.close()

    # Touch drag: pointerdown is owned immediately and a field-directed move commits.
    page,errors=boot(browser,'grove',touch=True)
    coords=page.evaluate('''()=>{const card=document.querySelector('.defense-roster-pet'),cr=card.getBoundingClientRect(),w=document.querySelector('#defenseWorld'),wr=w.getBoundingClientRect();let pt=null;for(let y=.18;y<.82&&!pt;y+=.04)for(let x=.12;x<.88&&!pt;x+=.04)if(RizoRuntimeQA.defensePlacementEvaluationForQA(x,y).valid)pt={x,y};const lift=Math.max(42,Math.min(56,Math.min(wr.width,wr.height)*.135));return{card:{x:cr.left+cr.width/2,y:cr.top+cr.height/2},target:{x:wr.left+pt.x*wr.width,y:wr.top+pt.y*wr.height+lift},pt,touchAction:getComputedStyle(card).touchAction};}''')
    page.evaluate('''d=>{const card=document.querySelector('.defense-roster-pet');const fire=(target,type,x,y)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:9,pointerType:'touch',clientX:x,clientY:y,buttons:type==='pointerup'?0:1,isPrimary:true}));fire(card,'pointerdown',d.card.x,d.card.y);for(let i=1;i<=10;i++){const t=i/10;fire(document,'pointermove',d.card.x+(d.target.x-d.card.x)*t,d.card.y+(d.target.y-d.card.y)*t);}fire(document,'pointerup',d.target.x,d.target.y);}''',coords)
    drag=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()')
    record('roster card owns touch gestures',coords['touchAction']=='none',coords['touchAction'])
    record('touch drag commits a Rizo to valid grass',len(drag['towers'])==1,drag['towers'])
    record('touch drag sample has no runtime errors',not errors,errors[:2])
    page.close()

    # Game-native UI + effect layer contracts.
    page,errors=boot(browser,'grove')
    visuals=page.evaluate('''()=>{const root=getComputedStyle(document.documentElement),btn=getComputedStyle(document.querySelector('.defense-command-actions button')),impact=document.createElement('i');impact.className='defense-impact impact-frost';impact.style.setProperty('--impact-life','.2s');document.querySelector('#defenseEffects').appendChild(impact);const fx=getComputedStyle(impact),body=document.createElement('div');return{font:root.getPropertyValue('--def-font-display'),buttonRadius:btn.borderRadius,buttonShadow:btn.boxShadow,impactBorder:fx.borderTopWidth,impactFilter:fx.filter,impactDuration:fx.animationDuration};}''')
    record('Defense display typography no longer uses Impact/Arial Black','Impact' not in visuals['font'] and 'Arial Black' not in visuals['font'],visuals['font'])
    record('command controls have tactile shape and depth',float(visuals['buttonRadius'].replace('px',''))>=10 and visuals['buttonShadow']!='none',visuals)
    record('hit FX no longer expose a generic bordered ring',visuals['impactBorder']=='0px' and visuals['impactFilter']=='none',visuals)
    record('impact lifetime is controlled by runtime FX timing',visuals['impactDuration']=='0.2s',visuals['impactDuration'])
    record('UI/effect sample has no runtime errors',not errors,errors[:2])
    page.close()

    browser.close()

out=ROOT/'reports'/'browser-v77-feel-pass.json';out.write_text(json.dumps(checks,indent=2))
failed=[c for c in checks if not c['passed']]
print(f"\n{len(checks)-len(failed)}/{len(checks)} v77 feel-pass checks passed; worst map error {max(map_errors.values()):.3f}px")
sys.exit(1 if failed else 0)
