from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports'/'screenshots'/'v69-phase6'
OUT.mkdir(parents=True,exist_ok=True)
APP=build_inline_app(True,embed_assets=True)

CASES=[]

def boot(page, viewport, map_id='grove'):
    page.set_viewport_size({'width':viewport[0],'height':viewport[1]})
    page.set_content(APP,wait_until='load',timeout=120000)
    page.evaluate('''()=>{document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked");}''')
    page.evaluate(SETUP_STATE)
    page.evaluate('mapId=>{const s=RizoRuntimeQA.snapshot();s.scores.defense=250;s.scores.defenseMaps={grove:250,ember:250,moon:250,storm:250,blizzard:250,eclipse:250};RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.startMiniGame("defense",{mapId});}', map_id)
    page.wait_for_timeout(180)
    page.evaluate('document.querySelector("[data-defense-skip-map-intro]")?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))')
    page.wait_for_timeout(850)

def capture(browser,name,viewport,map_id='grove',setup=None,wait=250):
    page=browser.new_page(viewport={'width':viewport[0],'height':viewport[1]},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    boot(page,viewport,map_id)
    if setup:
        page.evaluate(setup)
    page.wait_for_timeout(wait)
    path=OUT/f'{name}.png'
    page.screenshot(path=str(path),full_page=False)
    CASES.append({'name':name,'viewport':f'{viewport[0]}x{viewport[1]}','map':map_id,'errors':errors,'file':str(path.relative_to(ROOT))})
    page.close()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    capture(browser,'07-tablet-landscape-boss',(1024,768),'eclipse', '''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<8;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(28,"shade",50,1);RizoRuntimeQA.defenseSpawnForQA("boss",.48);RizoRuntimeQA.defenseForceWeatherForQA("eclipse");}''',900)
    capture(browser,'08-blizzard-world',(390,844),'blizzard', '''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<5;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(30,"frost",44,1);RizoRuntimeQA.defenseForceWeatherForQA("blizzard");}''',650)
    capture(browser,'09-eclipse-world',(390,844),'eclipse', '''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<5;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseLoadQueueForQA(30,"shade",55,1);RizoRuntimeQA.defenseForceWeatherForQA("eclipse");}''',650)
    capture(browser,'10-world-lobby',(390,844),'grove', '''()=>{RizoRuntimeQA.defenseShowLobbyForQA("grove");}''')
    browser.close()

import json
(ROOT/'reports'/'screenshots'/'v69-phase6-gallery.json').write_text(json.dumps(CASES,indent=2))
for case in CASES:
    print(f"{case['name']} {case['viewport']} errors={len(case['errors'])} {case['file']}")
