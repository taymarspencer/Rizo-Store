from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
import json, sys

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
    page.wait_for_timeout(120)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    expected={
      'grove':['root','root','vine'], 'ember':['vent','vent','crack'], 'moon':['orbit','crater','crater'],
      'storm':['puddle','puddle','wind'], 'blizzard':['bank','bank','crack'], 'eclipse':['lane','reveal','reveal']
    }
    art={}
    dims={}
    for map_id in expected:
        boot(page,map_id)
        art[map_id]=page.evaluate('RizoRuntimeQA.defenseArtCohesionForQA()')
        landmark=page.evaluate('''()=>{const n=document.querySelector('.defense-landmark');if(!n)return null;const s=getComputedStyle(n),r=n.getBoundingClientRect();return{className:n.className,w:r.width,h:r.height,bg:s.backgroundImage||s.backgroundColor,display:s.display};}''')
        dims[map_id]=landmark
    for map_id,data in art.items():
        check(f'{map_id} has structural terrain features',data['featureCount']==3,data)
        check(f'{map_id} terrain feature identity is canonical',data['featureKinds']==expected[map_id],data['featureKinds'])
        check(f'{map_id} hides development landmark labels',data['visibleLandmarkLabels']==0,data['visibleLandmarkLabels'])
        check(f'{map_id} keeps two environmental build pockets',data['buildPocketCount']==2,data['buildPocketCount'])
    # Authored landmark silhouettes should no longer collapse to the generic 26x26 fallback.
    unique_dims={(round(v['w'],1),round(v['h'],1)) for k,v in dims.items() if v}
    check('world landmarks preserve authored nonuniform silhouettes',len(unique_dims)>=5,dims)
    check('lava crater retains large authored silhouette',dims['ember'] and dims['ember']['w']>=60,dims['ember'])
    check('moon basin retains large authored silhouette',dims['moon'] and dims['moon']['w']>=60,dims['moon'])
    check('blizzard shelf is wider than tall',dims['blizzard'] and dims['blizzard']['w']>dims['blizzard']['h'],dims['blizzard'])
    # Adaptive contrast must differ between the brightest and darkest maps.
    check('Blizzard uses a dark gameplay outline',art['blizzard']['playOutline'] in ('#102a35','rgb(16, 42, 53)'),art['blizzard']['playOutline'])
    check('Eclipse uses a light gameplay outline',art['eclipse']['playOutline'] in ('#f7ddff','rgb(247, 221, 255)'),art['eclipse']['playOutline'])
    check('world road palettes are structurally distinct',len({v['roadFill'] for v in art.values()})>=5,{k:v['roadFill'] for k,v in art.items()})

    # Road, route tracing, placement and range are behaviorally readable.
    boot(page,'grove')
    road=page.evaluate('''()=>{const p=document.querySelector('.defense-road-fill');return p?{stroke:getComputedStyle(p).stroke,strokeWidth:parseFloat(getComputedStyle(p).strokeWidth)}:null}''')
    check('trail visual weight matches authored v81 road contract',road and 95<=road['strokeWidth']<=108,road)
    route_before=page.evaluate("parseFloat(getComputedStyle(document.querySelector('.defense-route-marker')).opacity)")
    page.evaluate('RizoRuntimeQA.defenseTraceRouteForQA()'); page.wait_for_timeout(320)
    route_after=page.evaluate("parseFloat(getComputedStyle(document.querySelector('.defense-route-marker')).opacity)")
    check('route markers stay quiet until trace is requested',route_before==0 and route_after>0,(route_before,route_after))

    page.evaluate('''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);RizoRuntimeQA.defensePlaceNextForQA();const t=document.querySelector('.defense-tower');t?.classList.add('selected');}''')
    page.wait_for_timeout(320)
    selected=page.evaluate('''()=>{const t=document.querySelector('.defense-tower'),r=t?.querySelector('.defense-range');if(!t||!r)return null;const ts=getComputedStyle(t),rs=getComputedStyle(r),box=t.getBoundingClientRect();return{rangeOpacity:parseFloat(rs.opacity),rangeBorder:rs.borderStyle,towerW:box.width,towerH:box.height,filter:ts.filter};}''')
    check('selected range uses dedicated soft ground ellipse',selected and selected['rangeOpacity']>=.99 and selected['rangeBorder']=='solid',selected)
    check('tower body stays within bounded world-space contract',selected and 52<=selected['towerW']<=72 and 64<=selected['towerH']<=90,selected)

    page.evaluate('''()=>{const w=document.querySelector('#defenseWorld'),p=document.querySelector('#defensePlacementPreview');w.classList.add('placement-valid');p.hidden=false;p.classList.add('valid');p.style.left='45%';p.style.top='55%';p.style.setProperty('--placement-range','150px');p.style.setProperty('--placement-footprint','50px');p.innerHTML='<span class="defense-placement-range"></span><span class="defense-placement-foot"></span><b class="defense-placement-label">READY TO PLACE</b>';}''')
    placement=page.evaluate('''()=>{const w=document.querySelector('#defenseWorld').getBoundingClientRect(),p=document.querySelector('#defensePlacementPreview').getBoundingClientRect(),label=getComputedStyle(document.querySelector('.defense-placement-label'));return{worldW:w.width,previewW:p.width,previewH:p.height,labelDisplay:label.display};}''')
    check('placement validity is local instead of tinting the whole battlefield',placement['previewW']<placement['worldW']*.35 and placement['previewH']<placement['worldW']*.2,placement)
    check('placement release state has a readable local label',placement['labelDisplay']!='none',placement['labelDisplay'])

    # Device scaling is bounded rather than exploding on tablets or shrinking into illegibility.
    boot(page,'grove',(320,568)); small=page.evaluate('RizoRuntimeQA.defenseArtCohesionForQA()')
    boot(page,'grove',(768,1024)); large=page.evaluate('RizoRuntimeQA.defenseArtCohesionForQA()')
    sv=float(small['unitScale'] or 1); lv=float(large['unitScale'] or 1)
    check('short-phone unit scale respects lower bound',.859<=sv<=1.161,sv)
    check('tablet unit scale respects upper bound',.859<=lv<=1.161,lv)
    check('unit scale grows gently across device classes',lv>=sv and lv-sv<=.31,(sv,lv))

    # Active units inherit world contrast variables rather than atmospheric opacity.
    boot(page,'blizzard'); page.evaluate("RizoRuntimeQA.defenseSpawnForQA('frost',.4)")
    blizzard_unit=page.evaluate('''()=>{const b=document.querySelector('.balloon-body'),h=document.querySelector('.balloon-health');return{border:getComputedStyle(b).borderColor,health:getComputedStyle(h).borderColor}}''')
    boot(page,'eclipse'); page.evaluate("RizoRuntimeQA.defenseSpawnForQA('shade',.4)")
    eclipse_unit=page.evaluate('''()=>{const b=document.querySelector('.balloon-body'),h=document.querySelector('.balloon-health');return{border:getComputedStyle(b).borderColor,health:getComputedStyle(h).borderColor}}''')
    check('enemy outline adapts between Blizzard and Eclipse',blizzard_unit['border']!=eclipse_unit['border'],(blizzard_unit,eclipse_unit))
    check('health-bar edge adapts with world contrast',blizzard_unit['health']!=eclipse_unit['health'],(blizzard_unit,eclipse_unit))
    check('phase 7 art browser sample has no runtime errors',not errors,errors)
    browser.close()

out=ROOT/'reports'/'browser-phase7-art.json';out.write_text(json.dumps(checks,indent=2))
failed=[r for r in checks if not r['passed']]
print(f"\n{len(checks)-len(failed)}/{len(checks)} phase 7 art checks passed")
sys.exit(1 if failed else 0)
