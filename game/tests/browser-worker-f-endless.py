"""Worker F opposition/endless smoke: authored chapter, support behaviors, remixes and density."""
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def check(name, ok, detail=''):
    checks.append(bool(ok)); print(('PASS' if ok else 'FAIL'), name, detail, flush=True)

def flat(plan):
    return [item for packet in plan['packets'] for item in packet['enemies']]

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(build_inline_app(True), wait_until='load', timeout=120000)
    page.evaluate(SETUP_STATE)
    page.evaluate('RizoRuntimeQA.startMiniGame("defense",{mapId:"grove"});document.querySelector("#defenseMapIntro")?.remove()')

    plans={wave:page.evaluate(f'RizoRuntimeQA.defensePlanForQA({wave})') for wave in (17,18,20,30,40,50,75,100,9999)}
    check('Wave 17 introduces Relay support', 'relay' in flat(plans[17]), str(plans[17]['announcement']))
    check('Wave 18 introduces Mender support', 'mender' in flat(plans[18]), str(plans[18]['announcement']))
    check('Waves 20 and 30 are authored Maw/Mirror set pieces',
          next(item for item in flat(plans[20]) if isinstance(item,dict) and item.get('type')=='boss')['bossId']=='vortex' and
          next(item for item in flat(plans[30]) if isinstance(item,dict) and item.get('type')=='boss')['bossId']=='mirror')
    boss40=next(item for item in flat(plans[40]) if isinstance(item,dict) and item.get('type')=='boss')
    boss50=next(item for item in flat(plans[50]) if isinstance(item,dict) and item.get('type')=='boss')
    boss100=next(item for item in flat(plans[100]) if isinstance(item,dict) and item.get('type')=='boss')
    check('Wave 40 introduces Redline as a bounded boss-remix formation', boss40['bossId']=='apex' and plans[40]['total']<=14 and 'BOSS REMIX 1' in plans[40]['announcement']['title'], str(plans[40]['announcement']))
    check('Returning bosses escalate their mechanic tier', boss50['bossId']=='crown' and boss50.get('intensity')==1 and boss100.get('intensity',0)>=2, str({'50':boss50,'100':boss100}))
    check('Endless gauntlets combine support and threat languages', plans[75]['modifier']=='gauntlet' and 'relay' in flat(plans[75]) and 'mender' in flat(plans[75]), str(plans[75]['announcement']))
    check('Four-digit Endless stays generated and density-bounded', plans[9999]['wave']==9999 and plans[9999]['total']<=34 and all(len(packet['enemies'])<=13 for packet in plans[9999]['packets']), str({'total':plans[9999]['total'],'packets':len(plans[9999]['packets'])}))

    page.evaluate('RizoRuntimeQA.defenseSetRunForQA({phase:"combat",clock:0});RizoRuntimeQA.defenseSpawnForQA("relay",.25,1e9,1e9);RizoRuntimeQA.defenseSpawnForQA("puff",.27,1e9,1e9);RizoRuntimeQA.defenseTickForQA(1/30)')
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()'); puff=next(enemy for enemy in snap['enemies'] if enemy['type']=='puff')
    check('Relay support is readable on the affected enemy immediately', 'relay-supported' in puff['className'], puff['className'])

    page.evaluate('''()=>{const q=RizoRuntimeQA;q.defenseSpawnForQA("mender",.42,1e9,1e9);q.defenseSpawnForQA("shell",.44,10,100);for(let i=0;i<150;i++)q.defenseTickForQA(1/30);}''')
    snap=page.evaluate('RizoRuntimeQA.defenseSnapshotForQA()'); shell=max((enemy for enemy in snap['enemies'] if enemy['type']=='shell'), key=lambda enemy:enemy['progress'])
    check('Mender repairs a wounded nearby ally', shell['hp']>10, str({'hp':shell['hp'],'progress':shell['progress']}))
    check('Worker F browser path has no runtime errors', not errors, str(errors[:5]))
    browser.close()

print(f"\n{sum(checks)}/{len(checks)} Worker F Endless checks passed")
raise SystemExit(0 if all(checks) else 1)
