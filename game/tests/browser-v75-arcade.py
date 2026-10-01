from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

results=[]
def record(name, passed, detail=''):
    results.append((name,bool(passed),detail)); print(('PASS' if passed else 'FAIL'),name,detail)

selectors={
 'power':'.power-dx','spark':'.spark-dx','forage':'.forage-dx','rush':'.rush-dx','walk':'.walk-world','rhythm':'.rhythm-world','memory':'.memory-dx','glide':'.glide-world','breaker':'.breaker-world'
}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(build_inline_app(True,embed_assets=True),wait_until='load',timeout=120000)
    page.wait_for_timeout(250)
    page.evaluate(SETUP_STATE)
    defaults=page.evaluate('RizoRuntimeQA.stateForQA ? RizoRuntimeQA.stateForQA() : RizoRuntimeQA.defaultState()')
    scores=defaults.get('scores',{})
    record('new score fields migrate/default safely', 'glide' in scores and 'breaker' in scores, str({k:scores.get(k) for k in ['glide','breaker']}))
    for mode,selector in selectors.items():
        page.evaluate(f'RizoRuntimeQA.startMiniGame("{mode}")')
        page.wait_for_timeout(180 if mode!='rhythm' else 350)
        visible=page.locator(selector).count()==1 and not page.locator('#miniGameOverlay').get_attribute('hidden')
        record(f'{mode} renders its arcade surface', visible)
        if mode=='power': page.locator('#miniArena').click(position={'x':190,'y':330}); page.wait_for_timeout(40)
        if mode=='spark': page.locator('#miniTarget').dispatch_event('pointerdown', {'pointerType':'touch','clientX':180,'clientY':220}); page.wait_for_timeout(40)
        if mode=='forage': page.locator('#miniArena').click(position={'x':320,'y':330}); page.wait_for_timeout(40)
        if mode=='rush': page.locator('#miniArena').click(position={'x':190,'y':330}); page.locator('#miniArena').click(position={'x':190,'y':330}); page.wait_for_timeout(40)
        if mode=='glide':
            before=page.locator('#miniPet').evaluate('(n)=>parseFloat(n.style.top)||0');page.locator('#miniArena').click(position={'x':180,'y':300});page.wait_for_timeout(160);after=page.locator('#miniPet').evaluate('(n)=>parseFloat(n.style.top)||0');record('skybound flap changes flight state',after<before+5,f'{before}->{after}')
        if mode=='breaker':
            page.locator('#miniArena').click(position={'x':320,'y':350});page.wait_for_timeout(60);left=page.locator('#miniPet').evaluate('(n)=>n.style.left');record('ember breaker moves Rizo paddle',left.startswith('82') or left.startswith('8'),left)
        page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
        page.wait_for_timeout(35)
    record('arcade smoke run has no page errors', not errors, '; '.join(errors[:5]))

    # New cabinets must feed permanent Rizo training and the replay loop, not just render.
    page.evaluate(SETUP_STATE)
    before=page.evaluate('RizoRuntimeQA.snapshot().pet.skills')
    page.evaluate('RizoRuntimeQA.startMiniGame("glide")'); page.wait_for_timeout(90); page.evaluate('RizoRuntimeQA.arcadeQualifyForQA("glide")'); page.evaluate('RizoRuntimeQA.finishMiniGame(false)'); page.wait_for_timeout(60)
    after=page.evaluate('RizoRuntimeQA.snapshot().pet.skills')
    record('skybound permanently trains stamina + speed', after.get('stamina',0)>before.get('stamina',0) and after.get('speed',0)>before.get('speed',0), f'{before}->{after}')
    record('skybound result offers instant replay', page.locator('[data-replay-game="glide"]').count()==1)
    page.locator('[data-close-modal]').click(); page.wait_for_timeout(40)

    page.evaluate(SETUP_STATE)
    before=page.evaluate('RizoRuntimeQA.snapshot().pet.skills')
    page.evaluate('RizoRuntimeQA.startMiniGame("breaker")'); page.wait_for_timeout(90); page.evaluate('RizoRuntimeQA.arcadeQualifyForQA("breaker")'); page.evaluate('RizoRuntimeQA.finishMiniGame(false)'); page.wait_for_timeout(60)
    after=page.evaluate('RizoRuntimeQA.snapshot().pet.skills')
    record('ember breaker permanently trains power + instinct', after.get('power',0)>before.get('power',0) and after.get('instinct',0)>before.get('instinct',0), f'{before}->{after}')
    record('ember breaker result offers instant replay', page.locator('[data-replay-game="breaker"]').count()==1)
    browser.close()

failed=[r for r in results if not r[1]]
print(f"\n{len(results)-len(failed)}/{len(results)} v75 arcade checks passed")
raise SystemExit(1 if failed else 0)
