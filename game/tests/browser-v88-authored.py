"""Targeted regressions for the v88 individual Arcade authorship pass.

Covers only the three cabinets modified here and the shared freeze/restart
contracts they rely on. It intentionally reuses the existing browser harness.
"""
from playwright.sync_api import sync_playwright
from browser_harness import build_inline_app, SETUP_STATE

checks=[]
def check(name, ok, detail=''):
    ok=bool(ok); checks.append(ok); print(('PASS' if ok else 'FAIL'), name, detail)

def boot(browser, width=390, height=844):
    page=browser.new_page(viewport={'width':width,'height':height})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(build_inline_app(True, embed_assets=True), wait_until='load', timeout=120000)
    page.wait_for_timeout(200)
    page.evaluate(SETUP_STATE)
    return page, errors

def start(page, mode):
    page.evaluate(SETUP_STATE)
    page.evaluate(f'RizoRuntimeQA.startMiniGame("{mode}")')
    page.wait_for_timeout(120)
    page.locator('#miniArena').focus()

def discard(page):
    page.evaluate('RizoRuntimeQA.finishMiniGame(true,null,{discard:true})')
    page.wait_for_timeout(60)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page, errors=boot(browser)

    # Forest Lunch: one coordinated row tied to the live request.
    start(page,'forage')
    snap=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().forage')
    authored=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().forage')
    wanted=snap['order'][snap['orderIndex']]
    check('Forest Lunch opens with exactly one 3-choice row', authored['rows']==1 and len(authored['drops'])==3, str(authored))
    matching=[d for d in authored['drops'] if d['food']==wanted]
    check('Forest Lunch row contains exactly one requested food', len(matching)==1, f'wanted={wanted} drops={authored["drops"]}')
    lane=matching[0]['lane']
    box=page.locator('#miniArena').bounding_box()
    x=box['x']+box['width']*[.167,.5,.833][lane]
    y=box['y']+box['height']-35
    page.mouse.click(x,y)
    page.wait_for_timeout(4200)
    after=page.evaluate('RizoRuntimeQA.arcadeSnapshotForQA().forage')
    check('Forest Lunch touch catches the requested food', after['orderIndex']>=1, str(after))
    check('Forest Lunch never backlogs stale rows', len(page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().forage.drops'))<=3)
    # Shared pause must hold the new row motion/deadlines.
    page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
    frozen=page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()')
    page.wait_for_timeout(700)
    check('Forest Lunch freezes with shared pause', frozen==page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()'))
    page.evaluate('RizoRuntimeQA.arcadeResumeForQA()')
    discard(page)

    # Courier: route is authored pickup -> two clears -> a physical delivery door.
    start(page,'rush')
    route=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().rush')
    types=[o['type'] for o in route['objects']]
    check('Courier route guarantees a package pickup', types.count('prism')==1, str(types))
    check('Courier route has two obstacles and a delivery door', sum(t in ('stump','tall') for t in types)==2 and types.count('depot')==1, str(types))
    # Simple route-1 autoplayer: jump only for the two stump clears.
    page.evaluate('''window.__courierAuto=setInterval(()=>{const q=RizoRuntimeQA,a=q.arcadeAuthoredForQA().rush,s=q.arcadeSnapshotForQA().rush,w=document.querySelector('#miniArena').clientWidth,petX=w*.22;const ob=a.objects.filter(o=>!o.handled&&(o.type==='stump'||o.type==='tall')&&o.x>petX-35).sort((x,y)=>x.x-y.x)[0];if(ob&&ob.x-petX<96&&s.jumpY<=3){document.querySelector('#miniArena').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));}},30)''')
    page.wait_for_timeout(9500)
    page.evaluate('clearInterval(window.__courierAuto)')
    route_after=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().rush')
    check('Courier completes a real pickup-to-door delivery', route_after['deliveries']>=1, str(route_after))
    page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
    frozen=page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()')
    page.wait_for_timeout(700)
    check('Courier freezes with shared pause', frozen==page.evaluate('RizoRuntimeQA.arcadeFingerprintForQA()'))
    page.evaluate('RizoRuntimeQA.arcadeResumeForQA()')
    # Restart from a live run must reset authored route state instead of leaking it.
    page.evaluate('RizoRuntimeQA.arcadeSetScoreForQA(0)')
    page.evaluate('document.querySelector("#miniPause")?.click()')
    page.wait_for_timeout(80)
    # If the pause button click is unavailable in the inline shell, use public pause QA then the real restart button.
    if not page.locator('[data-arcade-restart]').count():
        page.evaluate('RizoRuntimeQA.arcadePauseForQA()')
        page.wait_for_timeout(80)
    page.locator('[data-arcade-restart]').first.click()
    page.wait_for_timeout(180)
    restarted=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().rush')
    state=page.evaluate('RizoRuntimeQA.arcadeStateForQA()')
    check('Courier restart resets the run', state['active'] and state['mode']=='rush' and state['score']==0 and restarted['route']==1 and restarted['deliveries']==0 and restarted['lives']==3, f'{state} {restarted}')
    discard(page)

    # Rain Walk: early discoveries matter to a route-specific final encounter.
    start(page,'walk')
    for expected in range(1,4):
        page.wait_for_timeout(80 if expected==1 else 1500)
        finds=page.locator('.walk-find:not(.collected)')
        check(f'Rain Walk discovery {expected} is reachable', finds.count()>0)
        page.evaluate("(n)=>n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,pointerType:'touch',buttons:1,clientX:n.getBoundingClientRect().x+10,clientY:n.getBoundingClientRect().y+10}))", finds.first.element_handle())
        page.wait_for_timeout(260)
        notes=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().walk.notes')
        check(f'Rain Walk remembers unique find {expected}', len(notes)==expected, str(notes))
    page.evaluate('RizoRuntimeQA.arcadeAdvanceClockForQA(12000)')
    page.wait_for_timeout(120)
    check('Rain Walk first fork pauses reading time', page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().walk.paused'))
    page.keyboard.press('2')  # deep
    page.wait_for_timeout(100)
    page.evaluate('RizoRuntimeQA.arcadeAdvanceClockForQA(15000)')
    page.wait_for_timeout(120)
    page.keyboard.press('2')  # ruins
    page.wait_for_timeout(100)
    page.evaluate('RizoRuntimeQA.arcadeAdvanceClockForQA(6500)')
    page.wait_for_timeout(120)
    walk=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().walk')
    check('Rain Walk route reaches its authored ruins encounter', walk['encounter']=='ruins' and walk['paused'], str(walk))
    page.evaluate('RizoRuntimeQA.arcadeFreezeForQA("background")')
    frozen=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().walk')
    page.wait_for_timeout(700)
    check('Rain Walk encounter survives background freeze', frozen==page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().walk'))
    page.evaluate('RizoRuntimeQA.arcadeThawForQA("background")')
    page.keyboard.press('2')
    page.wait_for_timeout(100)
    ending=page.evaluate('RizoRuntimeQA.arcadeAuthoredForQA().walk')
    check('Rain Walk 3-find bold ending pays off the route', ending['ending']=='YOUR SHADOW SAYS THANK YOU' and not ending['paused'], str(ending))
    discard(page)

    # Desktop-sized smoke: reuse the same loaded app and resize the viewport.
    page.set_viewport_size({'width':1100,'height':800})
    for mode in ('forage','rush','walk'):
        start(page,mode)
        check(f'{mode} boots at desktop viewport', page.evaluate('RizoRuntimeQA.arcadeStateForQA().active'))
        discard(page)
    check('No browser runtime errors in authored pass', not errors, '; '.join(errors))
    browser.close()

passed=sum(checks)
print(f'\n{passed}/{len(checks)} authored arcade browser checks passed')
if passed != len(checks):
    raise SystemExit(1)
