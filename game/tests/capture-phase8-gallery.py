from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE
import json
from PIL import Image, ImageOps, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports'/'screenshots'/'v71-phase8'
OUT.mkdir(parents=True,exist_ok=True)
APP=build_inline_app(True,embed_assets=True)
CASES=[]

def boot(page, viewport, map_id='grove'):
    page.set_viewport_size({'width':viewport[0],'height':viewport[1]})
    page.set_content(APP,wait_until='load',timeout=120000)
    page.evaluate('''()=>{document.querySelector("#rizoInstallGate")?.setAttribute("hidden","");document.documentElement.classList.remove("ui-locked");document.body.classList.remove("ui-locked");}''')
    page.evaluate(SETUP_STATE)
    page.evaluate('''mapId=>{const s=RizoRuntimeQA.snapshot();s.scores.defense=250;s.scores.defenseMaps={grove:250,ember:250,moon:250,storm:250,blizzard:250,eclipse:250};RizoRuntimeQA.loadForQA(s);RizoRuntimeQA.startMiniGame("defense",{mapId});}''',map_id)
    page.wait_for_timeout(120)
    page.evaluate('document.querySelector("#defenseMapIntro")?.remove()')
    page.wait_for_timeout(60)

def capture(browser,name,viewport,map_id='grove',setup=None,wait=180):
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

def make_contact_sheet():
    files=[OUT/f"{c['name']}.png" for c in CASES]
    thumbs=[]
    cell_w,cell_h=430,500
    for c,path in zip(CASES,files):
        im=Image.open(path).convert('RGB')
        im.thumbnail((cell_w-24,cell_h-58),Image.Resampling.LANCZOS)
        canvas=Image.new('RGB',(cell_w,cell_h),'#111111')
        x=(cell_w-im.width)//2; y=38+(cell_h-48-im.height)//2
        canvas.paste(im,(x,y))
        draw=ImageDraw.Draw(canvas)
        label=f"{c['name']}  ·  {c['viewport']}  ·  {c['map'].upper()}"
        draw.text((12,11),label,fill='white')
        thumbs.append(canvas)
    cols=2; rows=(len(thumbs)+cols-1)//cols
    sheet=Image.new('RGB',(cell_w*cols,cell_h*rows),'#070707')
    for i,im in enumerate(thumbs): sheet.paste(im,((i%cols)*cell_w,(i//cols)*cell_h))
    out=OUT/'Rizo-Defense-v71-phase8-contact-sheet.jpg'
    sheet.save(out,quality=90,optimize=True)
    return out

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    capture(browser,'01-wave-start',(320,568),'grove','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<3;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(11);RizoRuntimeQA.defenseForceWaveForQA(12);RizoRuntimeQA.defenseMomentForQA("wave-start",{title:"WAVE 12",copy:"3 CONTROLLED PACKETS",priority:99});}''')
    capture(browser,'02-boss-entrance',(390,844),'moon','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<5;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(19);RizoRuntimeQA.defenseForceWaveForQA(20);RizoRuntimeQA.defenseSetRunForQA({phase:"combat"});RizoRuntimeQA.defenseSpawnForQA({type:"boss",bossId:"crown",intensity:1},.28);RizoRuntimeQA.defenseMomentForQA("boss",{title:"CROWN BALLOON",copy:"SUMMONS IRON GUARDS",kicker:"WAVE 20 • BOSS ENTRANCE",priority:99});}''')
    capture(browser,'03-gate-danger',(390,844),'eclipse','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<4;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(17);RizoRuntimeQA.defenseForceWaveForQA(18);RizoRuntimeQA.defenseSetRunForQA({lives:5,phase:"combat"});RizoRuntimeQA.defenseMomentForQA("danger",{title:"GATE CRITICAL",copy:"5 HEARTS • REBUILD THE LINE",priority:99});}''')
    capture(browser,'04-perfect-wave',(430,932),'grove','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<5;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(16);RizoRuntimeQA.defenseMomentForQA("perfect",{title:"PERFECT WAVE 16",copy:"+98 PLANNING COINS • GATE UNTOUCHED",priority:99});}''')
    capture(browser,'05-packet-arrival',(390,844),'ember','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<5;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(11);RizoRuntimeQA.defenseForceWaveForQA(12);RizoRuntimeQA.defenseSetRunForQA({phase:"packet-break"});RizoRuntimeQA.defenseSpawnForQA("fire",.24);RizoRuntimeQA.defenseSpawnForQA("shell",.42);RizoRuntimeQA.defenseMomentForQA("packet",{title:"PACKET 2",copy:"IRON + FIRE FORMATION",priority:99});}''')
    capture(browser,'06-upgrade-unlock',(390,844),'storm','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<6;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(14);RizoRuntimeQA.defenseForceWaveForQA(15);RizoRuntimeQA.defenseSetRunForQA({phase:"packet-break"});RizoRuntimeQA.defenseMomentForQA("ability",{title:"POWER READY",copy:"STORM CONTROL UNLOCKED",priority:99});}''')
    capture(browser,'07-landscape-boss',(844,390),'storm','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<7;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(29);RizoRuntimeQA.defenseForceWaveForQA(30);RizoRuntimeQA.defenseSetRunForQA({phase:"combat"});RizoRuntimeQA.defenseSpawnForQA({type:"boss",bossId:"crown",intensity:2},.38);RizoRuntimeQA.defenseMomentForQA("boss",{title:"BOSS ROUTE",copy:"HOLD THE GATE",kicker:"WAVE 30 • BOSS ENTRANCE",priority:99});}''')
    capture(browser,'08-tablet-perfect',(768,1024),'blizzard','''()=>{RizoRuntimeQA.defenseSetCashForQA(9999);for(let i=0;i<8;i++)RizoRuntimeQA.defensePlaceNextForQA();RizoRuntimeQA.defenseCompleteWaveForQA(24);RizoRuntimeQA.defenseMomentForQA("perfect",{title:"PERFECT WAVE 24",copy:"FORMATION HELD • ZERO HEARTS LOST",priority:99});}''')
    capture(browser,'09-bank-success',(390,844),'moon','''()=>{RizoRuntimeQA.defenseCompleteWaveForQA(13);RizoRuntimeQA.defenseSetRunForQA({wave:14,phase:"planning"});RizoRuntimeQA.defenseMomentForQA("bank",{title:"RUN BANKED",copy:"13 WAVES CLEARED • PROGRESS SECURED",priority:99});}''')
    capture(browser,'10-final-defeat',(390,844),'eclipse','''()=>{RizoRuntimeQA.defenseCompleteWaveForQA(21);RizoRuntimeQA.defenseSetRunForQA({lives:0,wave:22,phase:"combat"});RizoRuntimeQA.defenseMomentForQA("defeat",{title:"GATE DOWN",copy:"CLEARED 21 • REACHED 22",priority:99});}''')
    browser.close()

contact=make_contact_sheet()
(ROOT/'reports'/'screenshots'/'v71-phase8-gallery.json').write_text(json.dumps(CASES,indent=2))
for case in CASES: print(f"{case['name']} {case['viewport']} errors={len(case['errors'])} {case['file']}")
print(f"CONTACT {contact.relative_to(ROOT)}")
