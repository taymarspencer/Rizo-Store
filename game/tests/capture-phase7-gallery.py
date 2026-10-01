from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
import json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports'/'screenshots'/'v70-phase7'
OUT.mkdir(parents=True,exist_ok=True)
APP=build_inline_app(True,embed_assets=True)
CASES=[]

def boot(page, viewport, map_id='grove'):
    page.set_viewport_size({'width':viewport[0],'height':viewport[1]})
    page.set_content(APP,wait_until='load',timeout=120000)
    page.evaluate('''()=>{document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked");}''')
    page.evaluate(SETUP_STATE)
    page.evaluate('''mapId=>{const s=RizoRuntimeQA.snapshot();s.scores.defense=250;s.scores.defenseMaps={grove:250,ember:250,moon:250,storm:250,blizzard:250,eclipse:250};RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.startMiniGame("defense",{mapId});}''',map_id)
    page.wait_for_timeout(180)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    page.wait_for_timeout(80)

def capture(browser,name,viewport,map_id='grove',setup=None,wait=250):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    boot(page,viewport,map_id)
    if setup: page.evaluate(setup)
    page.wait_for_timeout(wait)
    path=OUT/f'{name}.png'
    page.screenshot(path=str(path),full_page=False)
    CASES.append({'name':name,'viewport':f'{viewport[0]}x{viewport[1]}','map':map_id,'errors':errors,'file':str(path.relative_to(ROOT))})
    page.close()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    capture(browser,'01-grove-placement',(390,844),'grove','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);document.querySelector('.defense-roster-pet')?.click();const w=document.querySelector('#defenseWorld'),p=document.querySelector('#defensePlacementPreview');if(w&&p){w.classList.add('placement-valid');p.hidden=false;p.classList.add('valid');p.style.left='41%';p.style.top='58%';p.style.setProperty('--placement-range','150px');p.style.setProperty('--placement-footprint','50px');p.innerHTML='<span class="defense-placement-range"></span><span class="defense-placement-foot"></span><b class="defense-placement-label">READY TO PLACE</b>';}}''')
    capture(browser,'02-ember-structure',(390,844),'ember','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<4;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(20,'fire',18,1);RizoRuntimeQA.defenseSpawnForQA('fire',.32);RizoRuntimeQA.defenseSpawnForQA('shell',.58);}''',700)
    capture(browser,'03-moon-structure',(390,844),'moon','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<4;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(20,'ghost',28,1);RizoRuntimeQA.defenseSpawnForQA('ghost',.38);RizoRuntimeQA.defenseSpawnForQA('shade',.64);}''',700)
    capture(browser,'04-storm-landscape',(844,390),'storm','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<6;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(24,'storm',35,1);RizoRuntimeQA.defenseSpawnForQA('storm',.44);RizoRuntimeQA.defenseForceWeatherForQA('storm');}''',700)
    capture(browser,'05-blizzard-contrast',(390,844),'blizzard','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<5;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(22,'frost',45,1);RizoRuntimeQA.defenseSpawnForQA('frost',.44);RizoRuntimeQA.defenseForceWeatherForQA('blizzard');}''',700)
    capture(browser,'06-eclipse-contrast',(390,844),'eclipse','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<5;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(22,'shade',55,1);RizoRuntimeQA.defenseSpawnForQA('shade',.44);RizoRuntimeQA.defenseForceWeatherForQA('eclipse');}''',700)
    capture(browser,'07-selected-range',(430,932),'moon','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<4;i++)RizoRuntimeQA.defensePlaceNextForQA();const t=document.querySelector('.defense-tower');t?.classList.add('selected');}''')
    capture(browser,'08-route-trace',(390,844),'storm','''()=>{RizoRuntimeQA.defenseTraceRouteForQA();}''',450)
    capture(browser,'09-tablet-world',(768,1024),'grove','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<7;i++)RizoRuntimeQA.defensePlaceNextForQA();}''')
    capture(browser,'10-phone-short',(320,568),'ember','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<3;i++)RizoRuntimeQA.defensePlaceNextForQA();}''')
    browser.close()

(ROOT/'reports'/'screenshots'/'v70-phase7-gallery.json').write_text(json.dumps(CASES,indent=2))
for case in CASES: print(f"{case['name']} {case['viewport']} errors={len(case['errors'])} {case['file']}")
